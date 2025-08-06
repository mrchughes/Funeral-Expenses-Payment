const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { DatabaseServiceClient } = require('../shared/service-client');
const { WebSocketServiceClient } = require('../shared/service-client');
const StorageClient = require('./storage-client');
const { processDocument } = require('./ocr-processor');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { logger, requestLogger, errorLogger } = require('../shared/structured-logger');
const { metricsMiddleware, metricsEndpoint,
    trackDocumentProcessing, trackDocumentProcessingDuration } = require('../shared/metrics');

// Environment variables with defaults
const PORT = process.env.PORT || 3001;
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:5200';  // Point to MERN backend
const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:5200/ws';  // Point to MERN backend
const MINIO_HOST = process.env.MINIO_HOST || 'localhost';  // Use localhost for local testing
const MINIO_PORT = process.env.MINIO_PORT || 9000;
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';  // Default local MinIO credentials
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';  // Default local MinIO credentials
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'documents';
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';

// Initialize clients
const dbClient = new DatabaseServiceClient(DB_SERVICE_URL);
const wsClient = new WebSocketServiceClient(WS_SERVICE_URL);
const storageClient = new StorageClient({
    host: MINIO_HOST,
    port: MINIO_PORT,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
    bucket: MINIO_BUCKET,
    useSSL: MINIO_USE_SSL
});

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'ocr-service' });
});

// Process a document endpoint
app.post('/process', async (req, res) => {
    const { documentId } = req.body;

    if (!documentId) {
        return res.status(400).json({
            error: 'Missing required field: documentId'
        });
    }

    try {
        logger.info('Received OCR processing request', { documentId });

        // Get document info from DB
        const document = await dbClient.getDocument(documentId);
        if (!document) {
            logger.warn('Document not found', { documentId });
            return res.status(404).json({
                error: `Document with ID ${documentId} not found`
            });
        }

        // Track document received for processing
        trackDocumentProcessing(document.documentType || 'unknown', 'received');

        // Start async processing
        processDocumentAsync(documentId, document.filePath, document.mimeType)
            .catch(err => {
                logger.error('Async processing error', err, { documentId });
                trackDocumentProcessing(document.documentType || 'unknown', 'error');
            });

        // Return immediate response
        res.status(202).json({
            message: 'Document processing started',
            documentId
        });
    } catch (err) {
        logger.error('Error initiating processing', err);
        res.status(500).json({
            error: 'Failed to initiate document processing',
            details: err.message
        });
    }
});

// Process document asynchronously
async function processDocumentAsync(documentId, filePath, mimeType) {
    const startTime = Date.now();
    let docType = 'unknown';

    try {
        // Get the file from storage
        logger.info('Retrieving file from storage', { documentId, filePath });
        const fileBuffer = await storageClient.getFile(filePath);

        // Process the document with OCR
        logger.info('Starting OCR processing', { documentId, mimeType });
        const result = await processDocument(documentId, fileBuffer, mimeType, dbClient, wsClient);

        // Capture document type for metrics
        docType = result.documentType || 'unknown';

        // Track successful processing
        trackDocumentProcessing(docType, 'completed');

        // Record processing duration
        const processingTime = (Date.now() - startTime) / 1000;
        trackDocumentProcessingDuration(docType, 'ocr', processingTime);

        logger.info('Document processing completed', {
            documentId,
            processingTimeSeconds: processingTime,
            documentType: docType
        });

        // Notify next service in the pipeline
        try {
            // In a production system, you would send a message to a queue
            // or call the next service in the pipeline
            logger.info('Notifying next service in pipeline', {
                documentId,
                documentType: docType
            });
        } catch (notifyErr) {
            logger.error('Error notifying next service', notifyErr, {
                documentId,
                documentType: docType
            });
        }

        return result;
    } catch (err) {
        // Track failed processing
        trackDocumentProcessing(docType, 'error');

        // Record processing duration even for failures
        const processingTime = (Date.now() - startTime) / 1000;

        logger.error('Error processing document', err, {
            documentId,
            processingTimeSeconds: processingTime
        });
        throw err;
    }
}

// Configure Express
app.use(requestLogger);
app.use(metricsMiddleware);
app.get('/metrics', metricsEndpoint);
app.use(errorLogger);

// Start the server
app.listen(PORT, () => {
    logger.info('OCR Service started', {
        port: PORT,
        dbServiceUrl: DB_SERVICE_URL,
        wsServiceUrl: WS_SERVICE_URL,
        minioHost: MINIO_HOST,
        minioPort: MINIO_PORT,
        minioUseSsl: MINIO_USE_SSL,
        systemType: os.type(),
        systemRelease: os.release(),
        cpuCount: os.cpus().length
    });
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
    logger.info('Shutting down OCR service');
    // Close any open connections
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}
