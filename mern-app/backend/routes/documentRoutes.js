/**
 * Document processing routes
 */
const express = require('express');
const documentController = require('../controllers/documentController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// POST /api/documents/upload - Upload a document and start processing
router.post('/upload', protect, documentController.uploadDocument);

// GET /api/documents/:documentId/status - Get the current status of document processing
router.get('/:documentId/status', protect, documentController.getDocumentStatus);

module.exports = router;
