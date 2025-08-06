const axios = require('axios');
const { MongoClient } = require('mongodb');
const { Form, FormField, DocumentType, UserContext } = require('../../shared/models/semantic-models');

class DatabaseClient {
    constructor(config) {
        this.dbServiceUrl = config.dbServiceUrl || process.env.DB_SERVICE_URL || 'http://db-service:3000';
        this.formDbUrl = config.formDbUrl || process.env.FORM_DB_URL || 'mongodb://mongo:27017/forms';
        this.dbName = config.dbName || 'forms';
        this.mongoClient = null;
    }

    /**
     * Initialize the database connection
     */
    async initialize() {
        if (!this.mongoClient) {
            try {
                this.mongoClient = new MongoClient(this.formDbUrl);
                await this.mongoClient.connect();
                console.log('Connected to form database');
            } catch (error) {
                console.error('Failed to connect to form database:', error);
                throw error;
            }
        }
        return this.mongoClient;
    }

    /**
     * Get a document by ID from the document database
     * @param {string} documentId - The document ID
     * @returns {Promise<Object>} - The document
     */
    async getDocument(documentId) {
        try {
            const response = await axios.get(`${this.dbServiceUrl}/documents/${documentId}`);
            return response.data;
        } catch (error) {
            console.error(`Error getting document ${documentId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get a form by ID
     * @param {string} formId - The form ID
     * @returns {Promise<Object>} - The form
     */
    async getForm(formId) {
        await this.initialize();

        try {
            const form = await Form.findOne({ id: formId });
            return form;
        } catch (error) {
            console.error(`Error getting form ${formId}:`, error);
            throw error;
        }
    }

    /**
     * Get user context by user ID
     * @param {string} userId - The user ID
     * @returns {Promise<Object>} - The user context
     */
    async getUserContext(userId) {
        await this.initialize();

        try {
            const userContext = await UserContext.findOne({ userId });
            return userContext;
        } catch (error) {
            console.error(`Error getting user context for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Update user context
     * @param {string} userId - The user ID
     * @param {Object} updatedContext - The updated context data
     * @returns {Promise<Object>} - The updated user context
     */
    async updateUserContext(userId, updatedContext) {
        await this.initialize();

        try {
            const result = await UserContext.findOneAndUpdate(
                { userId },
                { $set: { ...updatedContext, updatedAt: new Date() } },
                { new: true, upsert: true }
            );
            return result;
        } catch (error) {
            console.error(`Error updating user context for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Update field embedding
     * @param {string} fieldId - The field ID
     * @param {Array} embedding - The field embedding
     * @returns {Promise<Object>} - The update result
     */
    async updateFieldEmbedding(fieldId, embedding) {
        await this.initialize();

        try {
            const result = await FormField.updateOne(
                { id: fieldId },
                { $set: { 'semantics.embedding': Buffer.from(new Float32Array(embedding).buffer) } }
            );
            return result;
        } catch (error) {
            console.error(`Error updating field embedding for ${fieldId}:`, error);
            throw error;
        }
    }

    /**
     * Save mapped form fields to the database
     * @param {string} documentId - The document ID
     * @param {string} formId - The form ID
     * @param {Object} mappedFields - The mapped fields
     * @returns {Promise<Object>} - The update result
     */
    async saveMappedFields(documentId, formId, mappedFields) {
        try {
            // Prepare the data to save
            const fieldData = mappedFields.extractedFields.reduce((acc, field) => {
                acc[field.fieldId] = {
                    value: field.value,
                    confidence: field.confidence,
                    sourceText: field.sourceText,
                    notes: field.notes
                };
                return acc;
            }, {});

            // Update the form data
            const response = await axios.post(`${this.dbServiceUrl}/forms/${formId}/documents/${documentId}`, {
                fields: fieldData,
                processingState: {
                    status: 'fields_mapped',
                    message: 'Fields have been semantically mapped',
                    timestamp: new Date()
                }
            });

            return response.data;
        } catch (error) {
            console.error(`Error saving mapped fields for document ${documentId}, form ${formId}:`, error.message);
            throw error;
        }
    }

    /**
     * Update document processing state
     * @param {string} documentId - The document ID
     * @param {string} status - The new status
     * @param {string} message - Status message
     * @param {number} progress - Progress percentage
     * @returns {Promise<Object>} - The update result
     */
    async updateDocumentState(documentId, status, message, progress) {
        try {
            const response = await axios.patch(`${this.dbServiceUrl}/documents/${documentId}/state`, {
                status,
                message,
                progress
            });
            return response.data;
        } catch (error) {
            console.error(`Error updating document state for ${documentId}:`, error.message);
            throw error;
        }
    }

    /**
     * Close the database connection
     */
    async close() {
        if (this.mongoClient) {
            await this.mongoClient.close();
            console.log('Closed database connection');
        }
    }
}

module.exports = DatabaseClient;
