// backend/controllers/evidenceController.js
const asyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const ApplicationForm = require("../models/ApplicationForm");
const { v4: uuidv4 } = require('uuid');
const { uploadToDocProcessingService, docProcessingClient } = require('../services/docProcessingIntegration');

// Directory to store uploads (ensure this exists or create it)
const UPLOAD_DIR = path.join(__dirname, "../uploads/evidence");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Create a directory for user-specific evidence if it doesn't exist
const ensureUserDir = (userId) => {
    const userDir = path.join(UPLOAD_DIR, userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
};

// Helper to get active draft application for a user, create one if needed
const getOrCreateDraftApplication = async (userId) => {
    // Find draft application for this user
    let application = await ApplicationForm.findOne({
        customerId: userId,
        status: 'draft'
    });

    // If no draft exists, create one
    if (!application) {
        application = new ApplicationForm({
            applicationId: uuidv4(),
            customerId: userId,
            status: 'draft',
            formData: {}
        });
        await application.save();
    }

    return application;
};

// POST /api/evidence/upload
const uploadEvidence = asyncHandler(async (req, res) => {
    try {
        console.log("[EVIDENCE] Upload request received", req.files ? Object.keys(req.files) : "no files");

        if (!req.files || !req.files.evidence) {
            console.error("[EVIDENCE] No file in request");
            res.status(400);
            throw new Error("No file uploaded");
        }

        // Get user from auth middleware
        const userId = req.user._id;
        const userIdStr = userId.toString(); // Convert ObjectId to string
        console.log(`[EVIDENCE] Upload for user: ${userIdStr}`);

        // Get or create draft application for this user
        const application = await getOrCreateDraftApplication(userId);
        console.log(`[EVIDENCE] Using application: ${application.applicationId}`);

        // Check for application param (optional, to associate with specific application)
        const applicationIdParam = req.body.applicationId;
        let targetApplication = application;

        // If specific application ID provided, use that instead
        if (applicationIdParam) {
            const specificApp = await ApplicationForm.findOne({
                applicationId: applicationIdParam,
                customerId: userId
            });

            if (specificApp) {
                targetApplication = specificApp;
                console.log(`[EVIDENCE] Using specified application: ${specificApp.applicationId}`);
            } else {
                console.warn(`[EVIDENCE] Specified application ${applicationIdParam} not found, using default draft`);
            }
        }

        // Ensure user directory exists
        const userDir = ensureUserDir(userIdStr);

        const file = req.files.evidence;
        console.log(`[EVIDENCE] Processing file upload: ${file.name}, size: ${file.size} bytes, mimetype: ${file.mimetype}`);

        // Validate using both file extension and MIME type for better security
        const fileExtension = path.extname(file.name).toLowerCase();
        const allowedExtensions = ['.docx', '.pdf', '.jpg', '.jpeg', '.png'];
        const allowedMimeTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf', 'image/jpeg', 'image/png'];

        console.log(`[EVIDENCE] Validating file: extension=${fileExtension}, mimetype=${file.mimetype}`);

        // File size validation
        const maxSize = 25 * 1024 * 1024; // 25MB
        if (file.size > maxSize) {
            console.error(`[EVIDENCE] File too large: ${file.size} bytes`);
            res.status(400);
            throw new Error("File too large. Maximum file size is 25MB.");
        }

        // More robust file extension extraction for validation
        // This handles file names with multiple dots correctly
        const fileName = file.name;
        const fileNameParts = fileName.split('.');
        const extractedExtension = fileNameParts.length > 1
            ? `.${fileNameParts[fileNameParts.length - 1].toLowerCase()}`
            : '';

        console.log(`[EVIDENCE] Extracted extension: ${extractedExtension}`);

        // Check both the simple extension and more robust extracted extension
        const isValidExtension = allowedExtensions.includes(fileExtension) ||
            allowedExtensions.includes(extractedExtension);

        // Check MIME type
        const isValidMimeType = allowedMimeTypes.includes(file.mimetype);

        // Accept if either extension or MIME type is valid
        if (!isValidExtension && !isValidMimeType) {
            console.error(`[EVIDENCE] Invalid file: extension=${fileExtension}, mimetype=${file.mimetype}`);
            res.status(400);
            throw new Error("Invalid file type. Only DOCX, PDF, JPEG, and PNG files are allowed.");
        }

        console.log(`[EVIDENCE] File validation passed: ${fileName} (ext: ${isValidExtension}, mime: ${isValidMimeType})`);

        // Check for duplicate filename in this application
        const isDuplicate = targetApplication.evidence.some(item => item.filename === file.name);
        if (isDuplicate) {
            console.error(`[EVIDENCE] Duplicate file: ${file.name}`);
            res.status(400);
            throw new Error(`A file with name "${file.name}" has already been uploaded for this application.`);
        }

        // Save file to user-specific directory
        const savePath = path.join(userDir, file.name);

        // Check if file already exists and remove it
        if (fs.existsSync(savePath)) {
            console.log(`[EVIDENCE] File ${file.name} already exists, replacing it`);
            fs.unlinkSync(savePath);
        }

        await file.mv(savePath);
        console.log(`[EVIDENCE] File saved successfully: ${savePath}`);

        // Create evidence entry in application
        const evidenceEntry = {
            evidenceId: `ev-${uuidv4()}`,
            filename: file.name,
            uploadTimestamp: new Date(),
            documentType: null, // Will be updated by OCR process
            extractedText: null, // Will be updated by OCR process
            matchedFields: [] // Will be updated by OCR process
        };

        // Add evidence to application
        targetApplication.evidence.push(evidenceEntry);
        await targetApplication.save();

        console.log(`[EVIDENCE] Evidence entry added to application: ${evidenceEntry.evidenceId}`);

        // Send to document processing service
        try {
            console.log(`[EVIDENCE] Sending to document processing service: ${savePath}`);
            const processResult = await uploadToDocProcessingService(
                { path: savePath, originalname: file.name },
                userIdStr,
                targetApplication.applicationId,
                evidenceEntry.evidenceId
            );

            console.log(`[EVIDENCE] Document processing service result:`, processResult);

            // Add document processing ID to the evidence entry
            if (processResult && processResult.documentId) {
                const evidenceIdx = targetApplication.evidence.findIndex(e => e.evidenceId === evidenceEntry.evidenceId);
                if (evidenceIdx !== -1) {
                    targetApplication.evidence[evidenceIdx].documentProcessingId = processResult.documentId;
                    await targetApplication.save();
                    console.log(`[EVIDENCE] Added document processing ID ${processResult.documentId} to evidence ${evidenceEntry.evidenceId}`);
                }
            }
        } catch (processError) {
            // Log error but don't fail the upload - we'll just use the old processing flow as fallback
            console.error(`[EVIDENCE] Error sending to document processing service: ${processError.message}`);
        }

        res.json({
            evidenceId: evidenceEntry.evidenceId,
            name: file.name,
            url: `/uploads/evidence/${userIdStr}/${file.name}`,
            size: file.size,
            type: file.mimetype,
            userId: userIdStr,
            applicationId: targetApplication.applicationId,
            uploadTimestamp: evidenceEntry.uploadTimestamp
        });
    } catch (error) {
        console.error(`[EVIDENCE] Upload error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/evidence/:evidenceId
const deleteEvidence = asyncHandler(async (req, res) => {
    try {
        const evidenceIdOrFilename = req.params.evidenceId;
        const userId = req.user._id;
        const userIdStr = userId.toString(); // Convert ObjectId to string
        console.log(`[EVIDENCE] Processing evidence deletion: ${evidenceIdOrFilename} for user: ${userIdStr}`);

        // Find the application containing this evidence - check both evidenceId and filename
        const application = await ApplicationForm.findOne({
            customerId: userId,
            $or: [
                { "evidence.evidenceId": evidenceIdOrFilename },
                { "evidence.filename": evidenceIdOrFilename }
            ]
        });

        if (!application) {
            console.error(`[EVIDENCE] Evidence not found: ${evidenceIdOrFilename}`);
            res.status(404);
            throw new Error("Evidence not found");
        }

        // Find the evidence item - check both evidenceId and filename
        const evidenceItem = application.evidence.find(
            item => item.evidenceId === evidenceIdOrFilename || item.filename === evidenceIdOrFilename
        );
        if (!evidenceItem) {
            console.error(`[EVIDENCE] Evidence not found in application: ${evidenceIdOrFilename}`);
            res.status(404);
            throw new Error("Evidence not found in application");
        }

        const filename = evidenceItem.filename;
        const evidenceId = evidenceItem.evidenceId;

        // User-specific file path
        const userDir = ensureUserDir(userIdStr);
        const filePath = path.join(userDir, filename);

        // Delete physical file if it exists
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[EVIDENCE] File deleted successfully: ${filePath}`);
        }

        // Also delete from shared directory if exists
        const sharedDir = path.join(__dirname, "../../../shared-evidence");
        const sharedPath = path.join(sharedDir, `${userIdStr}_${filename}`);
        if (fs.existsSync(sharedPath)) {
            fs.unlinkSync(sharedPath);
            console.log(`[EVIDENCE] File deleted from shared directory: ${sharedPath}`);
        }

        // Remove evidence from application
        application.evidence = application.evidence.filter(item =>
            item.evidenceId !== evidenceId && item.filename !== filename
        );
        await application.save();
        console.log(`[EVIDENCE] Evidence removed from application: ${evidenceId}, filename: ${filename}`);

        res.json({
            message: "Evidence deleted successfully",
            evidenceId,
            filename,
            applicationId: application.applicationId
        });
    } catch (error) {
        console.error(`[EVIDENCE] Delete error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/evidence/list/:applicationId?
const listEvidence = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        const userIdStr = userId.toString(); // Convert ObjectId to string
        const applicationId = req.params.applicationId; // Optional

        console.log(`[EVIDENCE] Listing evidence for user: ${userIdStr}, applicationId: ${applicationId || 'any'}`);

        let application;

        if (applicationId) {
            // Get evidence for specific application
            application = await ApplicationForm.findOne({
                customerId: userId,
                applicationId
            });

            if (!application) {
                console.error(`[EVIDENCE] Application not found: ${applicationId}`);
                res.status(404);
                throw new Error("Application not found");
            }
        } else {
            // Get current draft application or create one
            application = await getOrCreateDraftApplication(userId);
        }

        const evidenceList = application.evidence.map(item => ({
            evidenceId: item.evidenceId,
            name: item.filename,
            url: `/uploads/evidence/${userIdStr}/${item.filename}`,
            uploadTimestamp: item.uploadTimestamp,
            documentType: item.documentType || 'Unknown',
            extractedFields: item.matchedFields || []
        }));

        console.log(`[EVIDENCE] Listed ${evidenceList.length} evidence items for application ${application.applicationId}`);
        res.json({
            applicationId: application.applicationId,
            evidence: evidenceList
        });
    } catch (error) {
        console.error(`[EVIDENCE] List error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/evidence/:evidenceId
const getEvidenceDetails = asyncHandler(async (req, res) => {
    try {
        const evidenceId = req.params.evidenceId;
        const userId = req.user._id;

        console.log(`[EVIDENCE] Getting details for evidence: ${evidenceId}`);

        // Find the application containing this evidence
        const application = await ApplicationForm.findOne({
            customerId: userId,
            "evidence.evidenceId": evidenceId
        });

        if (!application) {
            console.error(`[EVIDENCE] Evidence not found: ${evidenceId}`);
            res.status(404);
            throw new Error("Evidence not found");
        }

        // Find the evidence item
        const evidenceItem = application.evidence.find(item => item.evidenceId === evidenceId);
        if (!evidenceItem) {
            console.error(`[EVIDENCE] Evidence not found in application: ${evidenceId}`);
            res.status(404);
            throw new Error("Evidence not found in application");
        }

        // Convert to a more friendly format for the frontend
        const evidenceDetails = {
            evidenceId: evidenceItem.evidenceId,
            filename: evidenceItem.filename,
            url: `/uploads/evidence/${userId.toString()}/${evidenceItem.filename}`,
            uploadTimestamp: evidenceItem.uploadTimestamp,
            documentType: evidenceItem.documentType || 'Unknown',
            extractedText: evidenceItem.extractedText || '',
            matchedFields: evidenceItem.matchedFields || [],
            applicationId: application.applicationId,
            processingStatus: evidenceItem.processingStatus || 'unknown',
            processingProgress: evidenceItem.processingProgress || 0,
            extractionSummary: evidenceItem.extractionSummary || null
        };

        // Check if we have a document processing ID and get the latest status
        if (evidenceItem.documentProcessingId) {
            try {
                console.log(`[EVIDENCE] Fetching status from document processing service for ID: ${evidenceItem.documentProcessingId}`);
                const { getDocumentStatus } = require('../services/docProcessingIntegration');
                const processingStatus = await getDocumentStatus(evidenceItem.documentProcessingId);

                if (processingStatus) {
                    // Update the status in the response
                    evidenceDetails.processingStatus = processingStatus.status;
                    evidenceDetails.processingProgress = processingStatus.progress || 0;

                    // Also update the database if the status has changed
                    if (evidenceItem.processingStatus !== processingStatus.status) {
                        const evidenceIdx = application.evidence.findIndex(e => e.evidenceId === evidenceId);
                        if (evidenceIdx !== -1) {
                            application.evidence[evidenceIdx].processingStatus = processingStatus.status;
                            application.evidence[evidenceIdx].processingProgress = processingStatus.progress || 0;
                            await application.save();
                            console.log(`[EVIDENCE] Updated database with processing status: ${processingStatus.status}`);
                        }
                    }

                    // If the document processing has fields extracted, get them
                    if (processingStatus.status === 'completed' || processingStatus.status === 'fields_mapped') {
                        console.log(`[EVIDENCE] Fetching extracted fields for document: ${evidenceItem.documentProcessingId}`);
                        const { docProcessingClient } = require('../services/docProcessingIntegration');
                        const fieldsData = await docProcessingClient.getExtractedFields(evidenceItem.documentProcessingId);

                        if (fieldsData && fieldsData.fields) {
                            // Update our evidence details with the latest extracted data
                            evidenceDetails.matchedFields = fieldsData.fields;

                            // Only update the database if we have new fields or different fields
                            const currentFieldCount = evidenceItem.matchedFields?.length || 0;
                            if (currentFieldCount !== fieldsData.fields.length) {
                                const evidenceIdx = application.evidence.findIndex(e => e.evidenceId === evidenceId);
                                if (evidenceIdx !== -1) {
                                    application.evidence[evidenceIdx].matchedFields = fieldsData.fields;

                                    // If we got document type info, update that too
                                    if (fieldsData.documentType) {
                                        application.evidence[evidenceIdx].documentType = fieldsData.documentType;
                                        evidenceDetails.documentType = fieldsData.documentType;
                                    }

                                    await application.save();
                                    console.log(`[EVIDENCE] Updated database with ${fieldsData.fields.length} extracted fields`);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`[EVIDENCE] Error fetching from document processing service: ${err.message}`);
                // Don't fail the request, just continue with what we have
            }
        }

        res.json(evidenceDetails);
    } catch (error) {
        console.error(`[EVIDENCE] Get details error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/evidence/:evidenceId/update-extraction
const updateEvidenceExtraction = asyncHandler(async (req, res) => {
    try {
        const evidenceId = req.params.evidenceId;
        const userId = req.user._id;
        const { documentType, extractedText, matchedFields } = req.body;

        console.log(`[EVIDENCE] Updating extraction for evidence: ${evidenceId}`);

        // Find the application containing this evidence
        const application = await ApplicationForm.findOne({
            customerId: userId,
            "evidence.evidenceId": evidenceId
        });

        if (!application) {
            console.error(`[EVIDENCE] Evidence not found: ${evidenceId}`);
            res.status(404);
            throw new Error("Evidence not found");
        }

        // Find and update the evidence item
        const evidenceIndex = application.evidence.findIndex(item => item.evidenceId === evidenceId);
        if (evidenceIndex === -1) {
            console.error(`[EVIDENCE] Evidence not found in application: ${evidenceId}`);
            res.status(404);
            throw new Error("Evidence not found in application");
        }

        // Update only the provided fields
        if (documentType !== undefined) {
            application.evidence[evidenceIndex].documentType = documentType;
        }

        if (extractedText !== undefined) {
            application.evidence[evidenceIndex].extractedText = extractedText;
        }

        if (matchedFields !== undefined) {
            application.evidence[evidenceIndex].matchedFields = matchedFields;
        }

        await application.save();
        console.log(`[EVIDENCE] Updated extraction data for evidence: ${evidenceId}`);

        res.json({
            evidenceId,
            documentType: application.evidence[evidenceIndex].documentType,
            extractedText: application.evidence[evidenceIndex].extractedText,
            matchedFields: application.evidence[evidenceIndex].matchedFields,
            applicationId: application.applicationId
        });
    } catch (error) {
        console.error(`[EVIDENCE] Update extraction error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = {
    uploadEvidence,
    deleteEvidence,
    listEvidence,
    getEvidenceDetails,
    updateEvidenceExtraction
};
