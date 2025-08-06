const express = require('express');
const router = express.Router();
const Document = require('../models/document');
const { formatErrorResponse } = require('../../shared/utils');

// Create a new document
router.post('/', async (req, res) => {
    try {
        const document = new Document(req.body);
        await document.save();
        res.status(201).json(document);
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(400).json(formatErrorResponse('DB_ERROR', 'Failed to create document', err));
    }
});

// Get a document by ID
router.get('/:documentId', async (req, res) => {
    try {
        const document = await Document.findOne({ documentId: req.params.documentId });

        if (!document) {
            return res.status(404).json(formatErrorResponse('NOT_FOUND', 'Document not found'));
        }

        res.json(document);
    } catch (err) {
        console.error('Error retrieving document:', err);
        res.status(500).json(formatErrorResponse('DB_ERROR', 'Failed to retrieve document', err));
    }
});

// Update a document
router.patch('/:documentId', async (req, res) => {
    try {
        const document = await Document.findOne({ documentId: req.params.documentId });

        if (!document) {
            return res.status(404).json(formatErrorResponse('NOT_FOUND', 'Document not found'));
        }

        // Update document fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'documentId' && key !== '_id') {
                document[key] = req.body[key];
            }
        });

        await document.save();
        res.json(document);
    } catch (err) {
        console.error('Error updating document:', err);
        res.status(500).json(formatErrorResponse('DB_ERROR', 'Failed to update document', err));
    }
});

// Update document state
router.patch('/:documentId/state', async (req, res) => {
    try {
        const document = await Document.findOne({ documentId: req.params.documentId });

        if (!document) {
            return res.status(404).json(formatErrorResponse('NOT_FOUND', 'Document not found'));
        }

        // Update state
        const { status, currentStage, progress, error } = req.body.processingState;
        document.updateState(status, currentStage, progress, error);

        await document.save();
        res.json(document);
    } catch (err) {
        console.error('Error updating document state:', err);
        res.status(500).json(formatErrorResponse('DB_ERROR', 'Failed to update document state', err));
    }
});

// Add processing history entry
router.post('/:documentId/history', async (req, res) => {
    try {
        const document = await Document.findOne({ documentId: req.params.documentId });

        if (!document) {
            return res.status(404).json(formatErrorResponse('NOT_FOUND', 'Document not found'));
        }

        // Add history entry
        const { stage, status, message } = req.body;
        document.addHistoryEntry(stage, status, message);

        await document.save();
        res.json(document);
    } catch (err) {
        console.error('Error adding history entry:', err);
        res.status(500).json(formatErrorResponse('DB_ERROR', 'Failed to add history entry', err));
    }
});

// Delete a document
router.delete('/:documentId', async (req, res) => {
    try {
        const document = await Document.findOneAndDelete({ documentId: req.params.documentId });

        if (!document) {
            return res.status(404).json(formatErrorResponse('NOT_FOUND', 'Document not found'));
        }

        res.json({ message: 'Document deleted successfully' });
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json(formatErrorResponse('DB_ERROR', 'Failed to delete document', err));
    }
});

// Get documents by status
router.get('/status/:status', async (req, res) => {
    try {
        const documents = await Document.find({ 'processingState.status': req.params.status });
        res.json(documents);
    } catch (err) {
        console.error('Error retrieving documents by status:', err);
        res.status(500).json(formatErrorResponse('DB_ERROR', 'Failed to retrieve documents', err));
    }
});

// Get documents by user
router.get('/user/:userId', async (req, res) => {
    try {
        const documents = await Document.find({ uploadedBy: req.params.userId });
        res.json(documents);
    } catch (err) {
        console.error('Error retrieving documents by user:', err);
        res.status(500).json(formatErrorResponse('DB_ERROR', 'Failed to retrieve documents', err));
    }
});

module.exports = router;
