/**
 * Document Processing Controller
 * 
 * This controller handles document uploads and processing, sending real-time
 * status updates via WebSocket.
 */

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// DocumentProcessingServer will be required from services directory
let DocumentProcessingServer;
try {
    // First try src/services path
    DocumentProcessingServer = require('../src/services/documentProcessingServer');
} catch (error) {
    try {
        // Then try direct services path
        DocumentProcessingServer = require('../services/documentProcessingServer');
    } catch (secondError) {
        console.error('Could not load DocumentProcessingServer:', secondError);
        // Fallback to a mock implementation if the module is not found
        DocumentProcessingServer = class MockDocumentProcessingServer {
            constructor() {
                console.warn('Using mock WebSocket server implementation');
            }
            start() { console.log('Mock WebSocket server started'); }
            stop() { console.log('Mock WebSocket server stopped'); }
            broadcastDocumentUpdate() { return 0; }
            updateDocumentProgress() { return 0; }
            startDocumentProcessing() { return 0; }
            completeDocumentProcessing() { return 0; }
            reportDocumentError() { return 0; }
        };
    }
}

// Initialize WebSocket server
let wsServer = null;

/**
 * Initialize the document processing controller
 * @param {Object} app - Express app instance
 * @param {Object} server - HTTP server instance
 */
const initialize = (app, server) => {
    try {
        // Create WebSocket server instance
        wsServer = new DocumentProcessingServer({
            httpServer: server,
            debug: process.env.NODE_ENV !== 'production',
            path: '/ws/documents'
        });

        // Start the WebSocket server
        wsServer.start();

        console.log('Document Processing Controller initialized with WebSocket support');

        // Register document processing routes
        if (app) {
            app.post('/api/documents/upload', uploadDocument);
            app.get('/api/documents/:documentId/status', getDocumentStatus);
            console.log('Document processing routes registered');
        }
    } catch (error) {
        console.error('Error initializing document processing controller:', error);
    }
};

/**
 * Handle document upload and start processing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const uploadDocument = async (req, res) => {
    try {
        // Check if files were uploaded
        if (!req.files || !req.files.document) {
            return res.status(400).json({
                success: false,
                message: 'No document uploaded'
            });
        }

        const documentFile = req.files.document;
        const documentId = uuidv4();

        // Generate a safe filename
        const fileExt = path.extname(documentFile.name);
        const safeName = `${documentId}${fileExt}`;
        const uploadPath = path.join(__dirname, '../uploads', safeName);

        // Create upload directory if it doesn't exist
        const uploadDir = path.dirname(uploadPath);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Move the file to the uploads directory
        await documentFile.mv(uploadPath);

        // Start document processing
        if (wsServer) {
            wsServer.startDocumentProcessing(documentId, 'uploading', 'Document received');
        }

        // Start asynchronous document processing
        processDocumentAsync(documentId, uploadPath);

        // Return the document ID to the client
        return res.status(200).json({
            success: true,
            documentId,
            message: 'Document uploaded successfully and processing started'
        });

    } catch (error) {
        console.error('Error uploading document:', error);

        return res.status(500).json({
            success: false,
            message: 'Error uploading document',
            error: error.message
        });
    }
};

/**
 * Process a document asynchronously and send status updates via WebSocket
 * @param {string} documentId - The document ID
 * @param {string} filePath - Path to the uploaded file
 */
const processDocumentAsync = async (documentId, filePath) => {
    try {
        // Simulate processing steps
        await simulateProcessingStep(documentId, 'ocr_processing', 'Extracting text from document', 0, 30);
        await simulateProcessingStep(documentId, 'analysis', 'Analyzing document content', 30, 60);
        await simulateProcessingStep(documentId, 'extraction', 'Extracting document fields', 60, 90);
        await simulateProcessingStep(documentId, 'validation', 'Validating extracted data', 90, 100);

        // Generate some fake extracted data
        const extractedData = {
            documentType: detectDocumentType(filePath),
            fields: generateExtractedFields(filePath),
            metadata: {
                processedAt: new Date().toISOString(),
                fileSize: fs.statSync(filePath).size,
                filename: path.basename(filePath)
            }
        };

        // Signal processing completion
        if (wsServer) {
            wsServer.completeDocumentProcessing(documentId, { extractedData });
        }

        // Save results to database (not implemented in this example)
        saveResultsToDatabase(documentId, extractedData);

    } catch (error) {
        console.error(`Error processing document ${documentId}:`, error);

        // Send error via WebSocket
        if (wsServer) {
            wsServer.reportDocumentError(
                documentId,
                'PROCESSING_ERROR',
                'An error occurred while processing the document',
                { details: error.message }
            );
        }
    }
};

/**
 * Simulate a processing step with progress updates
 * @param {string} documentId - The document ID
 * @param {string} state - The current processing state
 * @param {string} step - The current processing step description
 * @param {number} startProgress - Starting progress percentage
 * @param {number} endProgress - Ending progress percentage
 */
const simulateProcessingStep = async (documentId, state, step, startProgress, endProgress) => {
    if (!wsServer) return;

    // Send initial step notification
    wsServer.updateDocumentProgress(documentId, state, startProgress, step);

    // Simulate processing time
    const processingTime = Math.floor(Math.random() * 2000) + 1000;
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Send middle progress update
    const midProgress = Math.floor((startProgress + endProgress) / 2);
    wsServer.updateDocumentProgress(documentId, state, midProgress, `${step} - 50% complete`);

    // More processing time
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Send completion of this step
    wsServer.updateDocumentProgress(documentId, state, endProgress, `${step} - complete`);
};

/**
 * Detect the type of document based on the file
 * @param {string} filePath - Path to the document
 * @returns {string} The detected document type
 */
const detectDocumentType = (filePath) => {
    // This is a placeholder - in a real implementation, this would use
    // OCR and ML to detect the document type
    const documentTypes = [
        'Invoice',
        'Death Certificate',
        'Bank Statement',
        'Funeral Home Bill',
        'Insurance Policy',
        'Birth Certificate'
    ];

    return documentTypes[Math.floor(Math.random() * documentTypes.length)];
};

/**
 * Generate fake extracted fields based on document type
 * @param {string} filePath - Path to the document
 * @returns {Object} The extracted fields
 */
const generateExtractedFields = (filePath) => {
    // This is a placeholder - in a real implementation, this would
    // extract actual data from the document
    return {
        date: new Date().toISOString().split('T')[0],
        reference: `REF-${Math.floor(Math.random() * 10000)}`,
        amount: `£${(Math.random() * 1000).toFixed(2)}`,
        name: 'John Smith',
        address: '123 Main Street, London, UK',
        // Additional fields would be added based on document type
    };
};

/**
 * Save processing results to the database
 * @param {string} documentId - The document ID
 * @param {Object} extractedData - The extracted data
 */
const saveResultsToDatabase = (documentId, extractedData) => {
    // This is a placeholder - in a real implementation, this would
    // save the results to a database
    console.log(`Saving results for document ${documentId} to database`);
    // db.documentResults.insertOne({ documentId, extractedData });
};

/**
 * Get the processing status of a document
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDocumentStatus = async (req, res) => {
    const { documentId } = req.params;

    try {
        // In a real implementation, this would fetch status from the database
        // For now, we'll just return a generic response

        return res.status(200).json({
            success: true,
            documentId,
            status: {
                state: 'processing',
                progress: 50,
                step: 'Extracting document data'
            },
            message: 'For real-time updates, connect to the WebSocket server'
        });
    } catch (error) {
        console.error(`Error getting document status for ${documentId}:`, error);

        return res.status(500).json({
            success: false,
            message: 'Error getting document status',
            error: error.message
        });
    }
};

/**
 * Clean up resources when the server is shutting down
 */
const shutdown = () => {
    if (wsServer) {
        try {
            wsServer.stop();
            console.log('Document WebSocket server stopped');
        } catch (error) {
            console.error('Error stopping document WebSocket server:', error);
        }
    }
};

module.exports = {
    initialize,
    uploadDocument,
    getDocumentStatus,
    shutdown
};
