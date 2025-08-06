/**
 * Document Processing Shared Models
 */

// Processing States
const ProcessingState = {
    QUEUED: 'queued',
    UPLOADING: 'uploading',
    UPLOADED: 'uploaded',
    OCR_PROCESSING: 'ocr_processing',
    OCR_COMPLETED: 'ocr_completed',
    CLASSIFYING: 'classifying',
    CLASSIFIED: 'classified',
    EXTRACTING: 'extracting',
    EXTRACTED: 'extracted',
    MAPPING: 'mapping',
    COMPLETED: 'completed',
    FAILED: 'failed',
};

// Document Types
const DocumentType = {
    DEATH_CERTIFICATE: 'death_certificate',
    FUNERAL_INVOICE: 'funeral_invoice',
    BENEFIT_LETTER: 'benefit_letter',
    PROOF_OF_RELATIONSHIP: 'proof_of_relationship',
    PROOF_OF_RESPONSIBILITY: 'proof_of_responsibility',
    OTHER: 'other',
};

// Error Types
const ErrorType = {
    UPLOAD_ERROR: 'upload_error',
    OCR_ERROR: 'ocr_error',
    CLASSIFICATION_ERROR: 'classification_error',
    EXTRACTION_ERROR: 'extraction_error',
    MAPPING_ERROR: 'mapping_error',
    SYSTEM_ERROR: 'system_error',
};

// WebSocket Event Types
const WebSocketEventType = {
    PROCESSING_STARTED: 'processing_started',
    STATE_CHANGED: 'state_changed',
    PROGRESS_UPDATED: 'progress_updated',
    ERROR_OCCURRED: 'error_occurred',
    PROCESSING_COMPLETED: 'processing_completed',
};

// Base Document Schema
const DocumentSchema = {
    documentId: String,
    originalFilename: String,
    storagePath: String,
    mimeType: String,
    uploadedBy: String, // UserID
    uploadedAt: Date,
    size: Number,
    documentType: String, // From DocumentType enum
    processingState: {
        status: String, // From ProcessingState enum
        currentStage: String,
        progress: Number, // 0-100
        lastUpdated: Date,
        error: {
            type: String, // From ErrorType enum
            message: String,
            details: Object,
        },
    },
    ocrText: String,
    textChunks: [
        {
            text: String,
            pageNumber: Number,
            boundingBox: {
                x: Number,
                y: Number,
                width: Number,
                height: Number,
            },
        },
    ],
    extractedData: {}, // Semantic field names with values and confidence scores
    formFieldMappings: {}, // Mapped to application form fields
    processingHistory: [
        {
            timestamp: Date,
            stage: String,
            status: String,
            message: String,
        },
    ],
};

// Form Field Schemas
const FormFieldSchemas = {
    FUNERAL_EXPENSES_CLAIM: {
        // Deceased details
        deceasedFirstName: { type: String, label: "Deceased's First Name" },
        deceasedLastName: { type: String, label: "Deceased's Last Name" },
        deceasedDateOfBirth: { type: Date, label: "Deceased's Date of Birth" },
        deceasedDateOfDeath: { type: Date, label: "Date of Death" },

        // Funeral details
        funeralDirector: { type: String, label: "Funeral Director" },
        funeralEstimateNumber: { type: String, label: "Funeral Estimate/Invoice Number" },
        funeralDateIssued: { type: Date, label: "Funeral Estimate/Invoice Date" },
        funeralCost: { type: String, label: "Funeral Cost" },
        funeralDescription: { type: String, label: "Funeral Services Description" },
        funeralTotalEstimatedCost: { type: String, label: "Total Estimated Funeral Cost" },

        // Benefit details
        benefitType: { type: String, label: "Benefit Type" },
        benefitReference: { type: String, label: "Benefit Reference Number" },

        // Applicant details
        applicantName: { type: String, label: "Applicant's Name" },
        applicantRelationship: { type: String, label: "Relationship to Deceased" },
    },
};

module.exports = {
    ProcessingState,
    DocumentType,
    ErrorType,
    WebSocketEventType,
    DocumentSchema,
    FormFieldSchemas,
};
