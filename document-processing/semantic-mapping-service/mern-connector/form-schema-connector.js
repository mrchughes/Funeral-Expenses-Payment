/**
 * Form Schema Connector
 * Connects to the MERN app's MongoDB to retrieve form schemas for semantic mapping
 */

const mongoose = require('mongoose');
const { FormField } = require('../../shared/models/semantic-models');
const { DatabaseError } = require('../../shared/error-handling');

class FormSchemaConnector {
    constructor(config) {
        this.mernDbUri = config.mernDbUri || process.env.MERN_DB_URI || 'mongodb://localhost:27017/funeral-expenses';
        this.connection = null;
        this.ApplicationFormModel = null;
        this.schemaCache = new Map();
    }

    /**
     * Initialize the connection to the MERN app database
     */
    async initialize() {
        if (!this.connection) {
            try {
                // Create a separate connection to the MERN app database
                this.connection = await mongoose.createConnection(this.mernDbUri, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true
                });

                console.log('Connected to MERN app database for schema retrieval');

                // Define the ApplicationForm model based on the MERN app schema
                const StatusHistorySchema = new mongoose.Schema({
                    status: String,
                    timestamp: Date
                });

                const EvidenceSchema = new mongoose.Schema({
                    evidenceId: String,
                    filename: String,
                    uploadTimestamp: Date,
                    documentType: String,
                    extractedText: String,
                    matchedFields: [
                        {
                            formField: String,
                            extractedValue: mongoose.Schema.Types.Mixed,
                            confidenceScore: Number
                        }
                    ]
                });

                const ApplicationFormSchema = new mongoose.Schema({
                    applicationId: String,
                    customerId: mongoose.Schema.Types.ObjectId,
                    status: String,
                    statusHistory: [StatusHistorySchema],
                    formData: mongoose.Schema.Types.Mixed,
                    evidence: [EvidenceSchema],
                    submissionTimestamp: Date,
                    createdAt: Date,
                    updatedAt: Date
                });

                this.ApplicationFormModel = this.connection.model('ApplicationForm', ApplicationFormSchema);
            } catch (error) {
                console.error('Failed to connect to MERN app database:', error);
                throw new DatabaseError('Failed to connect to MERN app database', {
                    originalError: error.message
                });
            }
        }
        return this.connection;
    }

    /**
     * Get form schema for a specific form ID
     * @param {string} formId - The form identifier
     * @returns {Promise<Object>} - The form schema with semantic information
     */
    async getFormSchema(formId) {
        try {
            // Check cache first
            if (this.schemaCache.has(formId)) {
                return this.schemaCache.get(formId);
            }

            await this.initialize();

            // For now, we'll use a hardcoded mapping of form IDs to form definitions
            // Later, this can be expanded to dynamically load from the MERN app's database structure

            // Get a blank application form to analyze its structure
            const formSchema = {
                id: formId,
                name: 'Funeral Expenses Payment',
                description: 'Application for help with funeral costs',
                fields: [
                    // We'll add a method to extract field information from the MERN app's form structure
                    ...await this._extractFieldsFromMernApp(formId)
                ]
            };

            // Cache the schema
            this.schemaCache.set(formId, formSchema);

            return formSchema;
        } catch (error) {
            console.error(`Error retrieving form schema for ${formId}:`, error);
            throw new DatabaseError(`Failed to retrieve form schema for ${formId}`, {
                originalError: error.message
            });
        }
    }

    /**
     * Extract field definitions from the MERN app's form structure
     * @param {string} formId - The form identifier
     * @returns {Promise<Array>} - Array of form field definitions
     */
    async _extractFieldsFromMernApp(formId) {
        try {
            // For now, we'll use a hardcoded set of fields based on the Funeral Expenses Payment form
            // In a production environment, this would analyze the MERN app's form structure

            const fields = [
                {
                    id: 'applicant_full_name',
                    name: 'Full name',
                    description: 'Your full name, including first name and surname',
                    type: 'text',
                    required: true,
                    semantics: {
                        synonyms: ['name', 'given name', 'forename', 'surname', 'family name'],
                        category: 'personal',
                    },
                    examples: ['John Smith', 'Jane Doe'],
                    documentSections: ['personal details', 'applicant details'],
                    extractionPatterns: {
                        regexPatterns: ['[A-Z][a-z]+ [A-Z][a-z]+'],
                        formatHints: ['First Last', 'Title First Last'],
                        contextualKeywords: ['name', 'your name', 'claimant']
                    }
                },
                {
                    id: 'applicant_dob',
                    name: 'Date of birth',
                    description: 'Your date of birth',
                    type: 'date',
                    required: true,
                    semantics: {
                        synonyms: ['birth date', 'born on', 'DOB', 'birthday'],
                        category: 'personal',
                    },
                    examples: ['01/01/1980', '15 January 1975'],
                    documentSections: ['personal details'],
                    extractionPatterns: {
                        regexPatterns: ['\\d{1,2}/\\d{1,2}/\\d{4}', '\\d{1,2}-\\d{1,2}-\\d{4}'],
                        formatHints: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
                        contextualKeywords: ['born', 'birth', 'DOB']
                    }
                },
                {
                    id: 'deceased_full_name',
                    name: 'Deceased full name',
                    description: 'Full name of the deceased person',
                    type: 'text',
                    required: true,
                    semantics: {
                        synonyms: ['name of deceased', 'dead person name', 'name of the departed'],
                        category: 'deceased',
                    },
                    examples: ['John Smith', 'Jane Doe'],
                    documentSections: ['death certificate', 'funeral invoice'],
                    extractionPatterns: {
                        regexPatterns: ['[A-Z][a-z]+ [A-Z][a-z]+'],
                        formatHints: ['First Last', 'Title First Last'],
                        contextualKeywords: ['deceased', 'departed', 'late', 'death']
                    }
                },
                {
                    id: 'deceased_dob',
                    name: 'Deceased date of birth',
                    description: 'Date of birth of the deceased person',
                    type: 'date',
                    required: true,
                    semantics: {
                        synonyms: ['deceased birth date', 'dead person DOB'],
                        category: 'deceased',
                    },
                    examples: ['01/01/1940', '15 January 1935'],
                    documentSections: ['death certificate'],
                    extractionPatterns: {
                        regexPatterns: ['\\d{1,2}/\\d{1,2}/\\d{4}', '\\d{1,2}-\\d{1,2}-\\d{4}'],
                        formatHints: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
                        contextualKeywords: ['born', 'birth', 'DOB', 'deceased']
                    }
                },
                {
                    id: 'deceased_dod',
                    name: 'Date of death',
                    description: 'Date when the person died',
                    type: 'date',
                    required: true,
                    semantics: {
                        synonyms: ['death date', 'died on', 'date of passing', 'DOD'],
                        category: 'deceased',
                    },
                    examples: ['01/01/2023', '15 January 2023'],
                    documentSections: ['death certificate'],
                    extractionPatterns: {
                        regexPatterns: ['\\d{1,2}/\\d{1,2}/\\d{4}', '\\d{1,2}-\\d{1,2}-\\d{4}'],
                        formatHints: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
                        contextualKeywords: ['died', 'death', 'deceased', 'passing']
                    }
                },
                {
                    id: 'funeral_director_name',
                    name: 'Funeral director name',
                    description: 'Name of the funeral director or company',
                    type: 'text',
                    required: true,
                    semantics: {
                        synonyms: ['funeral parlor', 'funeral home', 'undertaker'],
                        category: 'funeral',
                    },
                    examples: ['Smith & Sons Funeral Directors', 'City Funeral Services'],
                    documentSections: ['funeral invoice'],
                    extractionPatterns: {
                        regexPatterns: ['[A-Z][a-z]+(\\s+[&A-Za-z]+)*\\s+Funeral\\s+Directors?'],
                        formatHints: ['Company Name Funeral Directors'],
                        contextualKeywords: ['funeral', 'director', 'service']
                    }
                },
                {
                    id: 'funeral_cost_total',
                    name: 'Total funeral cost',
                    description: 'Total amount charged for the funeral',
                    type: 'number',
                    required: true,
                    semantics: {
                        synonyms: ['total cost', 'amount due', 'funeral price', 'invoice total'],
                        category: 'financial',
                    },
                    examples: ['£3,500', '£2,750.00'],
                    documentSections: ['funeral invoice'],
                    extractionPatterns: {
                        regexPatterns: ['£\\d{1,3}(,\\d{3})*(\\.\\d{2})?', '\\$\\d{1,3}(,\\d{3})*(\\.\\d{2})?'],
                        formatHints: ['£1,234.56', '£1,234'],
                        contextualKeywords: ['total', 'sum', 'amount', 'due', 'payable', 'cost']
                    }
                },
                {
                    id: 'funeral_date',
                    name: 'Funeral date',
                    description: 'Date when the funeral took place',
                    type: 'date',
                    required: true,
                    semantics: {
                        synonyms: ['service date', 'ceremony date', 'memorial date'],
                        category: 'funeral',
                    },
                    examples: ['01/01/2023', '15 January 2023'],
                    documentSections: ['funeral invoice'],
                    extractionPatterns: {
                        regexPatterns: ['\\d{1,2}/\\d{1,2}/\\d{4}', '\\d{1,2}-\\d{1,2}-\\d{4}'],
                        formatHints: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
                        contextualKeywords: ['service', 'funeral', 'ceremony', 'memorial']
                    }
                }
            ];

            return fields;
        } catch (error) {
            console.error('Error extracting fields from MERN app:', error);
            throw new DatabaseError('Failed to extract fields from MERN app', {
                originalError: error.message
            });
        }
    }

    /**
     * Write extracted field values back to the MERN app database
     * @param {string} userId - The user ID
     * @param {string} evidenceId - The evidence ID
     * @param {Array} extractedFields - The extracted field values
     * @returns {Promise<Object>} - The updated document
     */
    async writeExtractedFields(userId, applicationId, evidenceId, extractedFields) {
        try {
            await this.initialize();

            // Find the application form containing this evidence
            const application = await this.ApplicationFormModel.findOne({
                applicationId: applicationId,
                'evidence.evidenceId': evidenceId
            });

            if (!application) {
                throw new Error(`Application not found with ID ${applicationId} and evidence ID ${evidenceId}`);
            }

            // Find the evidence item in the application
            const evidenceIndex = application.evidence.findIndex(item => item.evidenceId === evidenceId);
            if (evidenceIndex === -1) {
                throw new Error(`Evidence not found with ID ${evidenceId} in application ${applicationId}`);
            }

            // Update the matched fields in the evidence item
            application.evidence[evidenceIndex].matchedFields = extractedFields.map(field => ({
                formField: field.fieldId,
                extractedValue: field.value,
                confidenceScore: field.confidence
            }));

            // Update the form data with the extracted values
            extractedFields.forEach(field => {
                // Only update if confidence is high enough
                if (field.confidence >= 70) {
                    // Create nested path if needed (e.g., 'personal.firstName')
                    const pathParts = field.fieldId.split('.');

                    if (pathParts.length === 1) {
                        // Direct field
                        application.formData[field.fieldId] = field.value;
                    } else {
                        // Nested field
                        let currentObj = application.formData;
                        for (let i = 0; i < pathParts.length - 1; i++) {
                            if (!currentObj[pathParts[i]]) {
                                currentObj[pathParts[i]] = {};
                            }
                            currentObj = currentObj[pathParts[i]];
                        }
                        currentObj[pathParts[pathParts.length - 1]] = field.value;
                    }
                }
            });

            // Save the updated application
            await application.save();

            return {
                applicationId: application.applicationId,
                evidenceId: evidenceId,
                updatedFields: extractedFields.length
            };
        } catch (error) {
            console.error(`Error writing extracted fields to MERN app database:`, error);
            throw new DatabaseError('Failed to write extracted fields to MERN app', {
                originalError: error.message
            });
        }
    }
}

module.exports = FormSchemaConnector;
