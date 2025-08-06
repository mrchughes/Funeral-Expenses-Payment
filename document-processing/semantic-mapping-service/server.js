const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { WebSocketServiceClient } = require('../shared/service-client');
const DatabaseClient = require('./database-client');
const FormSchemaLoader = require('./form-schema-loader');
const ContextManager = require('./context-manager');
const SemanticMapper = require('./semantic-mapper');
const LangGraphProcessor = require('./lang-graph-processor');
const FormSchemaConnector = require('./mern-connector/form-schema-connector');
require('dotenv').config();

// Environment variables with defaults
const PORT = process.env.PORT || 3004;
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://db-service:3000';
const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://websocket-service:3002';
const FORM_DB_URL = process.env.FORM_DB_URL || 'mongodb://mongo:27017/forms';
const MERN_DB_URI = process.env.MERN_DB_URI || 'mongodb://localhost:27017/funeral-expenses';

// Initialize clients and services
const dbClient = new DatabaseClient({
    dbServiceUrl: DB_SERVICE_URL,
    formDbUrl: FORM_DB_URL
});

// Initialize MERN app connector
const mernConnector = new FormSchemaConnector({
    mernDbUri: MERN_DB_URI
});

const wsClient = new WebSocketServiceClient(WS_SERVICE_URL);
const formSchemaLoader = new FormSchemaLoader(dbClient, mernConnector);
const contextManager = new ContextManager(dbClient);
const semanticMapper = new SemanticMapper(formSchemaLoader, contextManager);
const langGraphProcessor = new LangGraphProcessor(
    formSchemaLoader,
    contextManager,
    semanticMapper,
    dbClient
);

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'semantic-mapping-service' });
});

// Process a document endpoint
app.post('/process', async (req, res) => {
    const { documentId, formId, userId } = req.body;

    if (!documentId || !formId || !userId) {
        return res.status(400).json({
            error: 'Missing required fields: documentId, formId, and userId are required'
        });
    }

    try {
        console.log(`[Semantic Mapping Service] Received request to process document: ${documentId}`);

        // Start async processing
        processDocumentAsync(documentId, formId, userId)
            .catch(err => {
                console.error(`[Semantic Mapping Service] Async processing error for document ${documentId}:`, err);
            });

        // Return immediate response
        res.status(202).json({
            message: 'Semantic mapping started',
            documentId,
            formId
        });
    } catch (err) {
        console.error(`[Semantic Mapping Service] Error initiating processing for document ${documentId}:`, err);
        res.status(500).json({
            error: 'Error starting semantic mapping',
            details: err.message
        });
    }
});

// Map a specific document to form fields
app.post('/map-fields', async (req, res) => {
    const { documentId, formId, userId } = req.body;

    if (!documentId || !formId || !userId) {
        return res.status(400).json({
            error: 'Missing required fields: documentId, formId, and userId are required'
        });
    }

    try {
        // Get document from database
        const document = await dbClient.getDocument(documentId);
        if (!document) {
            return res.status(404).json({ error: `Document with ID ${documentId} not found` });
        }

        // Check if document has OCR text
        if (!document.ocrText) {
            return res.status(400).json({ error: 'Document has no OCR text. OCR must be completed first.' });
        }

        // Process the document using LangGraph
        const result = await langGraphProcessor.processDocument(
            documentId,
            formId,
            userId,
            document.ocrText
        );

        res.status(200).json({
            message: 'Field mapping completed successfully',
            documentId,
            formId,
            documentType: result.documentType,
            fieldCount: result.mappedFields.extractedFields.length
        });
    } catch (err) {
        console.error(`[Semantic Mapping Service] Error mapping fields for document ${documentId}:`, err);
        res.status(500).json({
            error: 'Error mapping fields',
            details: err.message
        });
    }
});

// Process document asynchronously
async function processDocumentAsync(documentId, formId, userId) {
    try {
        console.log(`[Semantic Mapping Service] Starting async processing for document: ${documentId}`);

        // Get document from database
        const document = await dbClient.getDocument(documentId);
        if (!document) {
            throw new Error(`Document with ID ${documentId} not found`);
        }

        // Check if document has OCR text
        if (!document.ocrText) {
            throw new Error('Document has no OCR text. OCR must be completed first.');
        }

        // Update document state
        await dbClient.updateDocumentState(
            documentId,
            'semantic_mapping_started',
            'Starting semantic field mapping',
            50
        );

        // Send WebSocket update
        await wsClient.sendStateUpdate(
            documentId,
            'semantic_mapping_started',
            'Starting semantic field mapping',
            50
        );

        // Process the document
        console.log(`[Semantic Mapping Service] Processing document with LangGraph: ${documentId}`);
        const result = await langGraphProcessor.processDocument(
            documentId,
            formId,
            userId,
            document.ocrText
        );

        console.log(`[Semantic Mapping Service] Processing completed for document: ${documentId}`);

        // Send WebSocket update
        await wsClient.sendStateUpdate(
            documentId,
            'fields_mapped',
            'Semantic field mapping completed',
            100
        );

        // Write extracted data to MERN app database if connector is available
        if (mernConnector && document.applicationId && document.evidenceId) {
            try {
                console.log(`[Semantic Mapping Service] Writing extracted fields to MERN app database for document: ${documentId}`);
                console.log(`[Semantic Mapping Service] Application ID: ${document.applicationId}, Evidence ID: ${document.evidenceId}`);

                const writeResult = await mernConnector.writeExtractedFields(
                    userId,
                    document.applicationId,
                    document.evidenceId,
                    result.mappedFields.extractedFields
                );

                console.log(`[Semantic Mapping Service] Successfully wrote ${writeResult.updatedFields} fields to MERN app database`);

                // Send WebSocket update about successful MERN app update
                await wsClient.sendStateUpdate(
                    documentId,
                    'mern_app_updated',
                    `Updated ${writeResult.updatedFields} fields in MERN app database`,
                    100
                );
            } catch (mernError) {
                console.error(`[Semantic Mapping Service] Error writing to MERN app database: ${mernError.message}`);
                // Don't throw error here, as we still want to proceed with the workflow
            }
        } else {
            console.log(`[Semantic Mapping Service] Not writing to MERN app database - connector not available or missing applicationId/evidenceId`);
        }

        // Notify next service in the pipeline
        try {
            // In a production system, you would send a message to a queue
            // or call the next service in the pipeline
            console.log(`[Semantic Mapping Service] Notifying next service for document: ${documentId}`);
        } catch (notifyErr) {
            console.error(`[Semantic Mapping Service] Error notifying next service: ${notifyErr}`);
        }

        return result;
    } catch (err) {
        console.error(`[Semantic Mapping Service] Error processing document ${documentId}:`, err);

        // Update document state
        await dbClient.updateDocumentState(
            documentId,
            'error',
            `Semantic mapping error: ${err.message}`,
            0
        );

        // Send WebSocket update
        await wsClient.sendError(documentId, {
            type: 'SEMANTIC_MAPPING_ERROR',
            message: err.message,
            details: err.stack
        });

        throw err;
    }
}

// Start the server
app.listen(PORT, () => {
    console.log(`Semantic Mapping Service running on port ${PORT}`);
    console.log(`DB Service URL: ${DB_SERVICE_URL}`);
    console.log(`WebSocket Service URL: ${WS_SERVICE_URL}`);
    console.log(`Form DB URL: ${FORM_DB_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
    console.log('Shutting down Semantic Mapping service...');
    await dbClient.close();
    process.exit(0);
}
