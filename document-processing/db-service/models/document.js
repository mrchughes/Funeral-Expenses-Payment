const mongoose = require('mongoose');
const { Schema } = mongoose;

// Processing history schema
const processingHistorySchema = new Schema({
    timestamp: { type: Date, default: Date.now },
    stage: { type: String, required: true },
    status: { type: String, required: true },
    message: { type: String },
});

// Text chunk schema for OCR results
const textChunkSchema = new Schema({
    text: { type: String, required: true },
    pageNumber: { type: Number },
    boundingBox: {
        x: Number,
        y: Number,
        width: Number,
        height: Number,
    },
});

// Error schema
const errorSchema = new Schema({
    type: { type: String },
    message: { type: String },
    details: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
});

// Processing state schema
const processingStateSchema = new Schema({
    status: {
        type: String,
        required: true,
        enum: [
            'queued', 'uploading', 'uploaded',
            'ocr_processing', 'ocr_completed',
            'classifying', 'classified',
            'extracting', 'extracted',
            'mapping', 'completed', 'failed'
        ],
        default: 'queued'
    },
    currentStage: { type: String },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    lastUpdated: { type: Date, default: Date.now },
    error: { type: errorSchema },
});

// Main document schema
const documentSchema = new Schema({
    documentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    originalFilename: {
        type: String,
        required: true
    },
    storagePath: {
        type: String,
        required: true
    },
    mimeType: {
        type: String
    },
    uploadedBy: {
        type: String,
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    size: {
        type: Number
    },
    // MERN app integration fields
    applicationId: {
        type: String,
        index: true
    },
    evidenceId: {
        type: String,
        index: true
    },
    formId: {
        type: String,
        index: true
    },
    documentType: {
        type: String,
        enum: [
            'death_certificate', 'funeral_invoice',
            'benefit_letter', 'proof_of_relationship',
            'proof_of_responsibility', 'other'
        ]
    },
    processingState: {
        type: processingStateSchema,
        default: () => ({})
    },
    ocrText: {
        type: String
    },
    textChunks: [textChunkSchema],
    extractedData: {
        type: Schema.Types.Mixed,
        default: {}
    },
    formFieldMappings: {
        type: Schema.Types.Mixed,
        default: {}
    },
    // Mapped fields array for semantic mapping results
    mappedFields: [{
        fieldId: String,
        value: Schema.Types.Mixed,
        confidence: Number,
        sourceText: String,
        metadata: Schema.Types.Mixed
    }],
    processingHistory: [processingHistorySchema]
}, {
    timestamps: true
});

// Create indexes
documentSchema.index({ 'uploadedBy': 1 });
documentSchema.index({ 'processingState.status': 1 });
documentSchema.index({ 'documentType': 1 });

// Instance methods
documentSchema.methods.addHistoryEntry = function (stage, status, message) {
    this.processingHistory.push({
        timestamp: new Date(),
        stage,
        status,
        message
    });
};

documentSchema.methods.updateState = function (status, stage, progress = null, error = null) {
    this.processingState.status = status;
    this.processingState.currentStage = stage;
    this.processingState.lastUpdated = new Date();

    if (progress !== null) {
        this.processingState.progress = progress;
    }

    if (error) {
        this.processingState.error = error;
    }

    // Add history entry
    this.addHistoryEntry(stage, status, error ? error.message : `Updated to ${status}`);
};

// Create the model
const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
