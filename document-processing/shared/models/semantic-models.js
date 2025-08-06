const mongoose = require('mongoose');

// Define the form field schema with semantic information
const FormFieldSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'number', 'date', 'boolean', 'select', 'multiselect'],
        required: true
    },
    required: {
        type: Boolean,
        default: false
    },
    validation: {
        type: Object,
        default: {}
    },
    // Semantic information
    semantics: {
        // Array of terms that are semantically similar to this field
        synonyms: [String],
        // The semantic category this field belongs to (e.g., 'personal', 'financial', 'date', etc.)
        category: String,
        // A vector representation of this field for semantic matching (stored as binary)
        embedding: Buffer,
        // Information about related fields
        relations: [{
            fieldId: String,
            relationType: {
                type: String,
                enum: ['parent', 'child', 'sibling', 'dependent']
            }
        }]
    },
    // Examples of valid values for this field
    examples: [String],
    // Document sections where this field is typically found
    documentSections: [String],
    // Information about data extraction patterns
    extractionPatterns: {
        // Regex patterns that might match this field
        regexPatterns: [String],
        // Format specifications (e.g., 'DD/MM/YYYY' for dates)
        formatHints: [String],
        // Keywords that often appear near this field in documents
        contextualKeywords: [String]
    }
});

// Define the form schema
const FormSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    fields: [FormFieldSchema],
    // Form-level semantic information
    semantics: {
        // The domain/purpose of this form
        domain: String,
        // The general category of documents that relate to this form
        relatedDocumentTypes: [String]
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

// Document type schema with semantic information
const DocumentTypeSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    // Semantic information for document classification
    semantics: {
        // Keywords that often appear in this type of document
        keywords: [String],
        // Semantic embedding for this document type
        embedding: Buffer,
        // Visual features that help identify this document type
        visualFeatures: [String],
        // Related forms that this document type provides evidence for
        relatedForms: [String]
    }
});

// User context schema for semantic mapping
const UserContextSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    // Personal information that helps with semantic mapping
    personalContext: {
        userName: String,
        deceasedName: String,
        relationship: String,
        // Other personal details
        addresses: [{
            type: {
                type: String,
                enum: ['home', 'correspondence', 'deceased']
            },
            line1: String,
            line2: String,
            city: String,
            county: String,
            postcode: String
        }],
        contactDetails: {
            phone: String,
            email: String
        },
        // Known identifiers that might appear in documents
        identifiers: [{
            type: {
                type: String,
                enum: ['national_insurance', 'passport', 'driving_license', 'other']
            },
            value: String
        }]
    },
    // Application-specific context
    applicationContext: {
        applicationId: String,
        applicationType: String,
        applicationStatus: String,
        // Timeline information
        dateOfDeath: Date,
        dateOfFuneral: Date,
        dateOfApplication: Date
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

const FormField = mongoose.model('FormField', FormFieldSchema);
const Form = mongoose.model('Form', FormSchema);
const DocumentType = mongoose.model('DocumentType', DocumentTypeSchema);
const UserContext = mongoose.model('UserContext', UserContextSchema);

module.exports = {
    FormField,
    Form,
    DocumentType,
    UserContext
};
