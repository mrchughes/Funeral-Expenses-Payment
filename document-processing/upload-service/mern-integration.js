/**
 * MERN App Integration Routes
 * Handles integration between the MERN app and document processing services
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Minio = require('minio');
const axios = require('axios');

// Environment variables are loaded from the main server.js

// Export a function that creates the router with the necessary dependencies
module.exports = function (config) {
    const {
        UPLOAD_DIR,
        minioClient,
        MINIO_BUCKET,
        DB_SERVICE_URL,
        WS_SERVICE_URL,
        OCR_SERVICE_URL
    } = config;

    // Configure storage for multer
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, UPLOAD_DIR);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const id = uuidv4();
            cb(null, `${id}${ext}`);
        }
    });

    // Configure upload middleware
    const upload = multer({
        storage,
        limits: {
            fileSize: 25 * 1024 * 1024, // 25MB limit for MERN app
        },
        fileFilter: (req, file, cb) => {
            // Accept images and PDFs
            if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
                cb(null, true);
            } else {
                cb(new Error('Unsupported file type. Only images and PDFs are allowed.'), false);
            }
        }
    });

    // Upload endpoint for MERN app integration
    router.post('/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const { userId, applicationId, evidenceId } = req.body;

            if (!userId || !applicationId) {
                return res.status(400).json({ error: 'userId and applicationId are required' });
            }

            const documentId = path.parse(req.file.filename).name; // Extract UUID from filename
            const filePath = req.file.path;
            const originalName = req.file.originalname;
            const mimeType = req.file.mimetype;
            const size = req.file.size;

            console.log(`[MERN Integration] Processing upload for user ${userId}, application ${applicationId}`);

            // Upload to MinIO
            const objectName = `mern/${userId}/${documentId}${path.extname(originalName)}`;
            await minioClient.fPutObject(MINIO_BUCKET, objectName, filePath);
            console.log(`[MERN Integration] File uploaded to MinIO: ${objectName}`);

            // Register document in database with MERN app specific fields
            const documentData = {
                documentId,
                userId,
                formId: 'funeral-expenses-payment', // Using the default form ID for now
                originalName,
                filePath: objectName,
                mimeType,
                size,
                uploadTimestamp: new Date(),
                // Store MERN app specific data
                applicationId,
                evidenceId,
                processingState: {
                    status: 'uploaded',
                    message: 'Document uploaded from MERN app',
                    progress: 0,
                    lastUpdated: new Date()
                }
            };

            console.log(`[MERN Integration] Registering document in database: ${documentId}`);
            const dbResponse = await axios.post(`${DB_SERVICE_URL}/documents`, documentData);

            // Clean up local file
            fs.unlinkSync(filePath);

            // Start processing pipeline
            console.log(`[MERN Integration] Starting OCR processing for document: ${documentId}`);
            axios.post(`${OCR_SERVICE_URL}/process`, {
                documentId
            }).catch(err => {
                console.error(`[MERN Integration] Error starting OCR processing for document ${documentId}:`, err.message);
            });

            res.status(201).json({
                message: 'Document uploaded successfully',
                documentId,
                status: 'processing',
                originalName,
                applicationId,
                evidenceId: evidenceId || null
            });
        } catch (error) {
            console.error('[MERN Integration] Error uploading document:', error);
            res.status(500).json({
                error: 'Error uploading document',
                details: error.message
            });
        }
    });

    // Status endpoint for MERN app integration
    router.get('/status/:documentId', async (req, res) => {
        try {
            const { documentId } = req.params;

            console.log(`[MERN Integration] Checking status for document: ${documentId}`);
            const response = await axios.get(`${DB_SERVICE_URL}/documents/${documentId}`);

            // Transform response to MERN app format
            const document = response.data;
            const status = {
                documentId: document.documentId,
                status: document.processingState.status,
                progress: document.processingState.progress,
                message: document.processingState.message,
                applicationId: document.applicationId,
                evidenceId: document.evidenceId,
                lastUpdated: document.processingState.lastUpdated,
                mappedFields: document.mappedFields || []
            };

            res.status(200).json(status);
        } catch (error) {
            console.error(`[MERN Integration] Error getting status for document ${req.params.documentId}:`, error.message);
            res.status(error.response?.status || 500).json({
                error: 'Error retrieving document status',
                details: error.message
            });
        }
    });

    // Endpoint to get extracted fields
    router.get('/fields/:documentId', async (req, res) => {
        try {
            const { documentId } = req.params;

            console.log(`[MERN Integration] Getting mapped fields for document: ${documentId}`);
            const response = await axios.get(`${DB_SERVICE_URL}/documents/${documentId}`);

            const document = response.data;
            if (!document.mappedFields) {
                return res.status(404).json({
                    error: 'No mapped fields found for this document',
                    status: document.processingState.status
                });
            }

            res.status(200).json({
                documentId,
                applicationId: document.applicationId,
                evidenceId: document.evidenceId,
                fields: document.mappedFields
            });
        } catch (error) {
            console.error(`[MERN Integration] Error getting fields for document ${req.params.documentId}:`, error.message);
            res.status(error.response?.status || 500).json({
                error: 'Error retrieving mapped fields',
                details: error.message
            });
        }
    });

    return router;
};
