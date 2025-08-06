// Document Processing Integration Module for the MERN app

// Import from the local services directory instead
const DocumentProcessingClient = require('./documentProcessingServer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const ApplicationForm = require('../models/ApplicationForm');

// Initialize the document processing client
const docProcessingClient = new DocumentProcessingClient({
    uploadServiceUrl: process.env.DOC_PROCESSING_UPLOAD_URL || 'http://localhost:3025',
    websocketUrl: process.env.DOC_PROCESSING_WS_URL || 'ws://localhost:4007'
});

console.log(`[Doc Processing Integration] Initialized client with:
- Upload Service URL: ${process.env.DOC_PROCESSING_UPLOAD_URL || 'http://localhost:3025'}
- WebSocket URL: ${process.env.DOC_PROCESSING_WS_URL || 'ws://localhost:4007'}`);

// Cache of active document subscriptions
const activeSubscriptions = new Map();

/**
 * Upload a document to the document processing service
 * @param {Object} file - The uploaded file object
 * @param {string} userId - User ID
 * @param {string} applicationId - Application ID
 * @param {string} evidenceId - Evidence ID
 * @returns {Promise<Object>} - Upload result
 */
async function uploadToDocProcessingService(file, userId, applicationId, evidenceId) {
    try {
        console.log(`[Doc Processing] Uploading file ${file.path} for user ${userId}, application ${applicationId}`);

        const result = await docProcessingClient.uploadDocument({
            filePath: file.path,
            userId,
            applicationId,
            evidenceId
        });

        console.log(`[Doc Processing] Upload successful, document ID: ${result.documentId}`);

        // Setup websocket subscription to receive updates
        setupDocumentSubscription(result.documentId, userId, applicationId, evidenceId);

        return result;
    } catch (error) {
        console.error('[Doc Processing] Upload error:', error);
        throw error;
    }
}

/**
 * Setup WebSocket subscription for document updates
 * @param {string} documentId - Document ID
 * @param {string} userId - User ID
 * @param {string} applicationId - Application ID
 * @param {string} evidenceId - Evidence ID
 */
function setupDocumentSubscription(documentId, userId, applicationId, evidenceId) {
    if (activeSubscriptions.has(documentId)) {
        console.log(`[Doc Processing] Already subscribed to document ${documentId}, skipping`);
        return; // Already subscribed
    }

    console.log(`[Doc Processing] Setting up subscription for document ${documentId}`);
    console.log(`[Doc Processing] WebSocket URL: ${docProcessingClient.websocketUrl}`);

    try {
        docProcessingClient.subscribeToUpdates(documentId, async (update) => {
            console.log(`[Doc Processing] Received update for document ${documentId}:`, JSON.stringify(update));

            try {
                // For debug - log the exact format of the update
                console.log(`[Doc Processing] Update type: ${update.type}, keys:`, Object.keys(update));

                // Handle both message formats - the one from our WebSocket service and standard Socket.IO
                if (update.type === 'document:status' || update.type === 'state_update') {
                    console.log(`[Doc Processing] Processing state update for document ${documentId}`);
                    await handleStateUpdate(documentId, update, userId, applicationId, evidenceId);
                } else if (update.type === 'extraction_complete' || update.type === 'document:extraction_complete') {
                    console.log(`[Doc Processing] Processing extraction complete for document ${documentId}`);
                    await handleExtractionComplete(documentId, update, userId, applicationId, evidenceId);
                } else if (update.type === 'error' || update.type === 'document:error') {
                    console.log(`[Doc Processing] Processing error for document ${documentId}`);
                    await handleError(documentId, update, userId, applicationId, evidenceId);
                } else {
                    console.log(`[Doc Processing] Unknown update type "${update.type}" for document ${documentId}`);
                }
            } catch (err) {
                console.error(`[Doc Processing] Error handling update for document ${documentId}:`, err);
            }
        }).then(subscription => {
            console.log(`[Doc Processing] Successfully subscribed to document ${documentId}:`, subscription);
        }).catch(err => {
            console.error(`[Doc Processing] Failed to subscribe to document ${documentId}:`, err);
        });
    } catch (err) {
        console.error(`[Doc Processing] Exception during subscription setup for document ${documentId}:`, err);
    }

    // Register handlers for specific event types
    docProcessingClient.on('extraction_complete', async (update) => {
        if (update.documentId === documentId) {
            await handleExtractionComplete(documentId, update, userId, applicationId, evidenceId);
        }
    });

    // Store subscription info
    activeSubscriptions.set(documentId, {
        userId,
        applicationId,
        evidenceId,
        timestamp: new Date()
    });

    // Auto cleanup old subscriptions after 1 hour
    setTimeout(() => {
        if (activeSubscriptions.has(documentId)) {
            console.log(`[Doc Processing] Cleaning up subscription for document ${documentId}`);
            docProcessingClient.unsubscribeFromUpdates(documentId);
            activeSubscriptions.delete(documentId);
        }
    }, 60 * 60 * 1000); // 1 hour
}

/**
 * Handle state update from document processing service
 */
async function handleStateUpdate(documentId, update, userId, applicationId, evidenceId) {
    // Extract status from the update message, handling different formats
    const status = update.status || (update.data && update.data.status) || 'processing';
    const progress = update.progress || (update.data && update.data.progress) || 0;
    const step = update.step || (update.data && update.data.step) || status;
    const message = update.message || (update.data && update.data.message) || '';

    console.log(`[Doc Processing] State update for document ${documentId}: ${status} (${progress}%) - ${step}`);
    console.log(`[Doc Processing] Update message: ${message}`);

    try {
        // Update the evidence status in the application
        const application = await ApplicationForm.findOne({
            applicationId,
            "evidence.evidenceId": evidenceId
        });

        if (application) {
            const evidenceIndex = application.evidence.findIndex(e => e.evidenceId === evidenceId);
            if (evidenceIndex !== -1) {
                // Add processing status to evidence item
                application.evidence[evidenceIndex].processingStatus = status;
                application.evidence[evidenceIndex].processingStep = step;
                application.evidence[evidenceIndex].processingMessage = message;
                application.evidence[evidenceIndex].processingProgress = progress;
                application.evidence[evidenceIndex].lastUpdate = new Date();

                await application.save();
                console.log(`[Doc Processing] Updated evidence ${evidenceId} status to ${status} (${step})`);
            } else {
                console.log(`[Doc Processing] Evidence ${evidenceId} not found in application ${applicationId}`);
            }
        } else {
            console.log(`[Doc Processing] Application ${applicationId} not found`);
        }

        // If processing is complete, fetch the extracted fields
        if (status === 'completed' || status === 'fields_mapped' ||
            step === 'completed' || step === 'fields_mapped') {
            console.log(`[Doc Processing] Document ${documentId} processing complete, fetching extracted fields`);
            await handleExtractionComplete(documentId, update, userId, applicationId, evidenceId);
        }
    } catch (err) {
        console.error(`[Doc Processing] Error updating evidence status: ${err.message}`);
    }
}

/**
 * Handle extraction complete event
 */
async function handleExtractionComplete(documentId, update, userId, applicationId, evidenceId) {
    try {
        console.log(`[Doc Processing] Extraction complete for document ${documentId}, fetching fields`);

        // Fetch the extracted fields
        const fieldsData = await docProcessingClient.getExtractedFields(documentId);

        console.log(`[Doc Processing] Received ${fieldsData.fields?.length || 0} extracted fields for document ${documentId}`);

        // Update the application with the extracted fields
        const application = await ApplicationForm.findOne({
            applicationId,
            "evidence.evidenceId": evidenceId
        });

        if (application) {
            const evidenceIndex = application.evidence.findIndex(e => e.evidenceId === evidenceId);
            if (evidenceIndex !== -1) {
                // Update extracted fields
                application.evidence[evidenceIndex].matchedFields = fieldsData.fields || [];
                application.evidence[evidenceIndex].documentType = fieldsData.documentType || 'Unknown';

                // If OCR text is available
                if (fieldsData.extractedText) {
                    application.evidence[evidenceIndex].extractedText = fieldsData.extractedText;
                }

                // Generate extraction summary dialogue
                const extractionSummary = generateExtractionSummary(fieldsData, application);
                application.evidence[evidenceIndex].extractionSummary = extractionSummary;

                await application.save();
                console.log(`[Doc Processing] Updated evidence ${evidenceId} with ${fieldsData.fields?.length || 0} fields`);
                console.log(`[Doc Processing] Extraction summary: ${extractionSummary}`);

                // Optionally, you could also update form data directly here based on the extracted fields
                // This depends on your application's form structure

                // Example of updating form data based on extracted fields:
                if (fieldsData.fields && fieldsData.fields.length > 0) {
                    let formDataUpdated = false;

                    fieldsData.fields.forEach(field => {
                        if (field.formField && field.extractedValue && field.confidenceScore > 0.7) {
                            // Only update form data for high-confidence extractions
                            // This is a simplistic approach - you would typically have more sophisticated logic

                            // Check if the field path exists in formData
                            const fieldPath = field.formField.split('.');

                            if (fieldPath.length > 0) {
                                // For simplicity, we'll only handle top-level fields here
                                // A more sophisticated implementation would handle nested fields
                                const topLevelField = fieldPath[0];

                                if (!application.formData[topLevelField] && field.extractedValue) {
                                    application.formData[topLevelField] = field.extractedValue;
                                    formDataUpdated = true;
                                }
                            }
                        }
                    });

                    if (formDataUpdated) {
                        await application.save();
                        console.log(`[Doc Processing] Updated form data for application ${applicationId} based on extracted fields`);
                    }
                }
            }
        }
    } catch (err) {
        console.error(`[Doc Processing] Error fetching extracted fields for document ${documentId}: ${err.message}`);
    }
}

/**
 * Handle error event
 */
async function handleError(documentId, update, userId, applicationId, evidenceId) {
    console.error(`[Doc Processing] Error for document ${documentId}:`, update.error || 'Unknown error');

    try {
        // Update the evidence status in the application
        const application = await ApplicationForm.findOne({
            applicationId,
            "evidence.evidenceId": evidenceId
        });

        if (application) {
            const evidenceIndex = application.evidence.findIndex(e => e.evidenceId === evidenceId);
            if (evidenceIndex !== -1) {
                // Add error status to evidence item
                application.evidence[evidenceIndex].processingStatus = 'error';
                application.evidence[evidenceIndex].processingError = update.error || 'Unknown error';
                await application.save();
                console.log(`[Doc Processing] Updated evidence ${evidenceId} with error status`);
            }
        }
    } catch (err) {
        console.error(`[Doc Processing] Error updating evidence error status: ${err.message}`);
    }
}

/**
 * Get document status from the document processing service
 */
async function getDocumentStatus(documentId) {
    try {
        const status = await docProcessingClient.getStatus(documentId);
        return status;
    } catch (error) {
        console.error(`[Doc Processing] Error getting status for document ${documentId}:`, error);
        throw error;
    }
}

/**
 * Generate a human-readable summary of the extraction results
 * @param {Object} fieldsData - Extracted fields data
 * @param {Object} application - Application form object
 * @returns {string} - Human-readable summary
 */
function generateExtractionSummary(fieldsData, application) {
    // Start with document type
    let summary = `I've identified this document as: ${fieldsData.documentType || 'Unknown document type'}.\n\n`;

    // No fields extracted
    if (!fieldsData.fields || fieldsData.fields.length === 0) {
        summary += 'I was not able to extract any specific information from this document.';
        return summary;
    }

    // Count high and low confidence fields
    const highConfidenceFields = fieldsData.fields.filter(f => f.confidenceScore >= 0.7);
    const lowConfidenceFields = fieldsData.fields.filter(f => f.confidenceScore < 0.7);

    // Add summary of extracted fields
    summary += `I was able to extract ${fieldsData.fields.length} pieces of information:\n\n`;

    // List high confidence fields first
    if (highConfidenceFields.length > 0) {
        highConfidenceFields.forEach(field => {
            const fieldName = getHumanReadableFieldName(field.formField);
            summary += `✓ ${fieldName}: ${formatFieldValue(field.extractedValue)}\n`;
        });
    }

    // List low confidence fields with warning
    if (lowConfidenceFields.length > 0) {
        summary += '\nThe following information was extracted with lower confidence and may need verification:\n\n';
        lowConfidenceFields.forEach(field => {
            const fieldName = getHumanReadableFieldName(field.formField);
            summary += `? ${fieldName}: ${formatFieldValue(field.extractedValue)}\n`;
        });
    }

    // Add a note about form mapping
    summary += '\nThis information has been mapped to your application form.';

    return summary;
}

/**
 * Format field values for display in summary
 * @param {*} value - The field value
 * @returns {string} - Formatted value
 */
function formatFieldValue(value) {
    if (value === null || value === undefined) return 'Not found';

    // Format date values
    if (value instanceof Date) {
        return value.toLocaleDateString('en-GB');
    }

    // Format boolean values
    if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
    }

    // Format arrays
    if (Array.isArray(value)) {
        return value.join(', ');
    }

    // Format objects
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}

/**
 * Convert form field IDs to human-readable names
 * @param {string} fieldId - The field ID from the form
 * @returns {string} - Human-readable field name
 */
function getHumanReadableFieldName(fieldId) {
    // Map of field IDs to human-readable names
    const fieldNameMap = {
        'fullName': 'Full Name',
        'firstName': 'First Name',
        'lastName': 'Last Name',
        'dob': 'Date of Birth',
        'dateOfBirth': 'Date of Birth',
        'address': 'Address',
        'postcode': 'Postcode',
        'phoneNumber': 'Phone Number',
        'email': 'Email Address',
        'nationalInsuranceNumber': 'National Insurance Number',
        'niNumber': 'National Insurance Number',
        'dateOfDeath': 'Date of Death',
        'deceasedName': 'Name of Deceased',
        'relationship': 'Relationship to Deceased',
        'funeralDate': 'Funeral Date',
        'funeralCost': 'Funeral Cost',
        'funeralDirector': 'Funeral Director',
        'benefitType': 'Benefit Type'
    };

    // Try to get a human-readable name, or format the field ID as a fallback
    if (fieldNameMap[fieldId]) {
        return fieldNameMap[fieldId];
    }

    // Handle nested fields
    if (fieldId && fieldId.includes('.')) {
        const parts = fieldId.split('.');
        const lastPart = parts[parts.length - 1];
        if (fieldNameMap[lastPart]) {
            return fieldNameMap[lastPart];
        }

        // Format the last part
        return lastPart
            .replace(/([A-Z])/g, ' $1') // Add space before capital letters
            .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
            .trim();
    }

    // Format camelCase to Title Case
    return fieldId
        ? fieldId
            .replace(/([A-Z])/g, ' $1') // Add space before capital letters
            .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
            .trim()
        : 'Unknown Field';
}

module.exports = {
    uploadToDocProcessingService,
    getDocumentStatus,
    docProcessingClient,
    setupDocumentSubscription,
    generateExtractionSummary
};