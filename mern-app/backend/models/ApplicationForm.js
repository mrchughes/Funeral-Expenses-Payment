const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Define a schema for status history tracking
const StatusHistorySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['draft', 'submitted'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        required: true
    }
});

// Define a schema for evidence items
const EvidenceSchema = new mongoose.Schema({
    evidenceId: {
        type: String,
        default: () => `ev-${uuidv4()}`,
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    uploadTimestamp: {
        type: Date,
        default: Date.now,
        required: true
    },
    documentType: {
        type: String,
        default: null
    },
    extractedText: {
        type: String,
        default: null
    },
    documentProcessingId: {
        type: String,
        default: null
    },
    processingStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'error', 'fields_mapped', 'ocr_complete', null],
        default: null
    },
    processingProgress: {
        type: Number,
        default: 0
    },
    processingError: {
        type: String,
        default: null
    },
    extractionSummary: {
        type: String,
        default: null
    },
    matchedFields: [
        {
            formField: String,
            extractedValue: mongoose.Schema.Types.Mixed,
            confidenceScore: Number
        }
    ]
});

// Main ApplicationForm schema
const ApplicationFormSchema = new mongoose.Schema({
    applicationId: {
        type: String,
        default: uuidv4,
        required: true,
        unique: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'submitted'],
        default: 'draft',
        required: true
    },
    statusHistory: {
        type: [StatusHistorySchema],
        default: function () {
            return [{ status: this.status, timestamp: new Date() }];
        }
    },
    formData: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    evidence: {
        type: [EvidenceSchema],
        default: []
    },
    submissionTimestamp: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save hook to update timestamps and handle status changes
ApplicationFormSchema.pre('save', function (next) {
    // Update the updatedAt timestamp
    this.updatedAt = Date.now();

    // If status changed, add to statusHistory
    if (this.isModified('status')) {
        this.statusHistory.push({
            status: this.status,
            timestamp: new Date()
        });

        // If status changed to submitted, set submissionTimestamp
        if (this.status === 'submitted' && !this.submissionTimestamp) {
            this.submissionTimestamp = new Date();
        }
    }

    next();
});

// Instance method to add evidence to application
ApplicationFormSchema.methods.addEvidence = function (evidenceData) {
    // Check for duplicates
    const isDuplicate = this.evidence.some(item => item.filename === evidenceData.filename);
    if (isDuplicate) {
        throw new Error(`Evidence file '${evidenceData.filename}' already exists for this application`);
    }

    // Add the evidence
    this.evidence.push(evidenceData);
    return this;
};

// Instance method to remove evidence from application
ApplicationFormSchema.methods.removeEvidence = function (evidenceId) {
    const evidenceIndex = this.evidence.findIndex(item =>
        item.evidenceId === evidenceId || item.filename === evidenceId
    );

    if (evidenceIndex === -1) {
        throw new Error(`Evidence '${evidenceId}' not found in this application`);
    }

    this.evidence.splice(evidenceIndex, 1);
    return this;
};

const ApplicationForm = mongoose.model('ApplicationForm', ApplicationFormSchema);

module.exports = ApplicationForm;
