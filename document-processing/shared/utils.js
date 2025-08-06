/**
 * Shared Utilities for Document Processing Services
 */
const crypto = require('crypto');

// Generate a unique document ID
function generateDocumentId() {
    return crypto.randomUUID();
}

// Format error response
function formatErrorResponse(errorType, message, details = {}) {
    return {
        error: {
            type: errorType,
            message: message,
            details: details,
            timestamp: new Date().toISOString(),
        },
    };
}

// Create processing history entry
function createHistoryEntry(stage, status, message) {
    return {
        timestamp: new Date(),
        stage,
        status,
        message,
    };
}

// Format processing state update
function formatStateUpdate(documentId, status, stage, progress = null, error = null) {
    const update = {
        documentId,
        processingState: {
            status,
            currentStage: stage,
            lastUpdated: new Date(),
        },
    };

    if (progress !== null) {
        update.processingState.progress = progress;
    }

    if (error) {
        update.processingState.error = error;
    }

    return update;
}

// Extract file extension from filename
function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

// Determine MIME type from file extension
function getMimeType(filename) {
    const extension = getFileExtension(filename);
    const mimeTypes = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        tiff: 'image/tiff',
        tif: 'image/tiff',
        bmp: 'image/bmp',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
    };

    return mimeTypes[extension] || 'application/octet-stream';
}

// Validate document type
function isValidDocumentType(type) {
    const { DocumentType } = require('./models');
    return Object.values(DocumentType).includes(type);
}

// Validate processing state
function isValidProcessingState(state) {
    const { ProcessingState } = require('./models');
    return Object.values(ProcessingState).includes(state);
}

// Parse date in various formats
function parseDate(dateString) {
    if (!dateString) return null;

    // Try standard date parsing first
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // Try DD/MM/YYYY format
    const ukFormatRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const ukMatch = dateString.match(ukFormatRegex);
    if (ukMatch) {
        return new Date(`${ukMatch[3]}-${ukMatch[2].padStart(2, '0')}-${ukMatch[1].padStart(2, '0')}`);
    }

    // Try text date formats like "12 April 2024"
    const textDateRegex = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/;
    const textMatch = dateString.match(textDateRegex);
    if (textMatch) {
        const months = {
            january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
            july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        };
        const month = months[textMatch[2].toLowerCase()];
        if (month !== undefined) {
            return new Date(textMatch[3], month, textMatch[1]);
        }
    }

    return null;
}

module.exports = {
    generateDocumentId,
    formatErrorResponse,
    createHistoryEntry,
    formatStateUpdate,
    getFileExtension,
    getMimeType,
    isValidDocumentType,
    isValidProcessingState,
    parseDate,
};
