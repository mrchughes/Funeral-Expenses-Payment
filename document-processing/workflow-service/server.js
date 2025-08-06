const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createClient } = require('redis');

// Environment variables with defaults
const PORT = process.env.PORT || 3006;
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://db-service:3000';
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://ocr-service:3001';
const SEMANTIC_MAPPING_SERVICE_URL = process.env.SEMANTIC_MAPPING_SERVICE_URL || 'http://semantic-mapping-service:3004';
const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://websocket-service:3002';
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Redis client
const redisClient = createClient({
    url: `redis://${REDIS_HOST}:${REDIS_PORT}`
});

// Connect to Redis
async function connectRedis() {
    try {
        await redisClient.connect();
        console.log('Connected to Redis');

        // Subscribe to document state updates
        const subscriber = redisClient.duplicate();
        await subscriber.connect();
        await subscriber.subscribe('document-state-updates', handleDocumentStateUpdate);
        console.log('Subscribed to document state updates');
    } catch (err) {
        console.error('Redis connection error:', err);
        // Retry connection after delay
        setTimeout(connectRedis, 5000);
    }
}

// Handle document state updates
async function handleDocumentStateUpdate(message) {
    try {
        const update = JSON.parse(message);
        const { documentId, status } = update;

        console.log(`[Workflow] Received state update for document ${documentId}: ${status}`);

        // Get the complete document information
        const document = await getDocument(documentId);

        if (!document) {
            console.error(`[Workflow] Document ${documentId} not found`);
            return;
        }

        // Process based on the current state
        switch (status) {
            case 'ocr_completed':
                await handleOcrCompleted(document);
                break;

            case 'fields_mapped':
                await handleFieldsMapped(document);
                break;

            case 'failed':
                await handleFailedDocument(document);
                break;

            default:
                // No action needed for other states
                break;
        }
    } catch (err) {
        console.error('Error handling document state update:', err);
    }
}

// Get document from database
async function getDocument(documentId) {
    try {
        const response = await axios.get(`${DB_SERVICE_URL}/documents/${documentId}`);
        return response.data;
    } catch (err) {
        console.error(`Error getting document ${documentId}:`, err.message);
        return null;
    }
}

// Handle OCR completed state
async function handleOcrCompleted(document) {
    const { documentId, userId, formId } = document;

    try {
        console.log(`[Workflow] Starting semantic mapping for document ${documentId}`);

        // Start semantic mapping
        await axios.post(`${SEMANTIC_MAPPING_SERVICE_URL}/process`, {
            documentId,
            userId,
            formId: formId || 'funeral-expenses-payment' // Default form ID if not specified
        });

        console.log(`[Workflow] Semantic mapping initiated for document ${documentId}`);
    } catch (err) {
        console.error(`[Workflow] Error starting semantic mapping for document ${documentId}:`, err.message);

        // Update document state to failed
        await updateDocumentState(documentId, 'failed', `Failed to start semantic mapping: ${err.message}`, 0);
    }
}

// Handle fields mapped state
async function handleFieldsMapped(document) {
    const { documentId } = document;

    try {
        console.log(`[Workflow] Document processing completed for ${documentId}`);

        // Update final state
        await updateDocumentState(
            documentId,
            'completed',
            'Document processing workflow completed successfully',
            100
        );

        // Could trigger additional processes here, like:
        // - Notification to user
        // - Form auto-population
        // - Review request
    } catch (err) {
        console.error(`[Workflow] Error finalizing document ${documentId}:`, err.message);
    }
}

// Handle failed document state
async function handleFailedDocument(document) {
    const { documentId, processingState } = document;

    console.log(`[Workflow] Document ${documentId} failed processing: ${processingState.message}`);

    // Could implement recovery strategies here:
    // - Retry logic for transient failures
    // - Notification to support
    // - Logging for analysis
}

// Update document state
async function updateDocumentState(documentId, status, message, progress) {
    try {
        await axios.patch(`${DB_SERVICE_URL}/documents/${documentId}/state`, {
            status,
            message,
            progress
        });

        console.log(`[Workflow] Updated document ${documentId} state: ${status}`);
    } catch (err) {
        console.error(`[Workflow] Error updating document ${documentId} state:`, err.message);
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'workflow-service' });
});

// Manual workflow trigger endpoint
app.post('/workflow/start', async (req, res) => {
    const { documentId } = req.body;

    if (!documentId) {
        return res.status(400).json({ error: 'documentId is required' });
    }

    try {
        // Get the document
        const document = await getDocument(documentId);

        if (!document) {
            return res.status(404).json({ error: `Document ${documentId} not found` });
        }

        // Start OCR processing
        await axios.post(`${OCR_SERVICE_URL}/process`, { documentId });

        res.status(202).json({
            message: 'Workflow started successfully',
            documentId,
            currentState: 'ocr_processing'
        });
    } catch (err) {
        console.error(`[Workflow] Error starting workflow for document ${documentId}:`, err.message);
        res.status(500).json({
            error: 'Error starting workflow',
            details: err.message
        });
    }
});

// Get workflow status endpoint
app.get('/workflow/:documentId/status', async (req, res) => {
    const { documentId } = req.params;

    try {
        // Get the document
        const document = await getDocument(documentId);

        if (!document) {
            return res.status(404).json({ error: `Document ${documentId} not found` });
        }

        // Return the workflow status
        res.status(200).json({
            documentId,
            currentState: document.processingState.status,
            progress: document.processingState.progress,
            message: document.processingState.message,
            lastUpdated: document.processingState.lastUpdated
        });
    } catch (err) {
        console.error(`[Workflow] Error getting status for document ${documentId}:`, err.message);
        res.status(500).json({
            error: 'Error getting workflow status',
            details: err.message
        });
    }
});

// Retry failed workflow
app.post('/workflow/:documentId/retry', async (req, res) => {
    const { documentId } = req.params;

    try {
        // Get the document
        const document = await getDocument(documentId);

        if (!document) {
            return res.status(404).json({ error: `Document ${documentId} not found` });
        }

        if (document.processingState.status !== 'failed') {
            return res.status(400).json({
                error: 'Can only retry failed documents',
                currentState: document.processingState.status
            });
        }

        // Determine which stage to retry
        let targetService = OCR_SERVICE_URL;
        let message = 'Retrying OCR processing';

        if (document.ocrText) {
            // If OCR was completed, retry semantic mapping
            targetService = SEMANTIC_MAPPING_SERVICE_URL;
            message = 'Retrying semantic mapping';
        }

        // Reset document state
        await updateDocumentState(documentId, 'retry', message, 0);

        // Start processing at the appropriate service
        await axios.post(`${targetService}/process`, {
            documentId,
            userId: document.userId,
            formId: document.formId
        });

        res.status(202).json({
            message: 'Workflow retry initiated',
            documentId,
            retryStage: targetService.includes('ocr') ? 'ocr' : 'semantic-mapping'
        });
    } catch (err) {
        console.error(`[Workflow] Error retrying workflow for document ${documentId}:`, err.message);
        res.status(500).json({
            error: 'Error retrying workflow',
            details: err.message
        });
    }
});

// Start the server
app.listen(PORT, async () => {
    console.log(`Workflow Service running on port ${PORT}`);
    console.log(`DB Service URL: ${DB_SERVICE_URL}`);
    console.log(`OCR Service URL: ${OCR_SERVICE_URL}`);
    console.log(`Semantic Mapping Service URL: ${SEMANTIC_MAPPING_SERVICE_URL}`);
    console.log(`WebSocket Service URL: ${WS_SERVICE_URL}`);

    // Connect to Redis
    await connectRedis();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down workflow service...');
    await redisClient.quit();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Shutting down workflow service...');
    await redisClient.quit();
    process.exit(0);
});
