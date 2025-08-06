const { Form } = require('../../shared/models/semantic-models');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { getEmbeddings } = require('./embedding-service');

class FormSchemaLoader {
    constructor(dbClient, mernConnector = null) {
        this.dbClient = dbClient;
        this.mernConnector = mernConnector;
        this.embeddings = new OpenAIEmbeddings({
            modelName: "text-embedding-3-small"
        });
        this.formCache = new Map();
    }

    /**
     * Load form fields with their semantic information
     * @param {string} formId - The ID of the form to load
     * @returns {Promise<Array>} - The form fields with semantic information
     */
    async loadFormFields(formId) {
        try {
            // Check cache first
            if (this.formCache.has(formId)) {
                return this.formCache.get(formId);
            }

            // Try to load the form from MERN app database first if connector exists
            let form = null;
            if (this.mernConnector) {
                try {
                    console.log(`Trying to load form schema from MERN app database for ${formId}`);
                    form = await this.mernConnector.getFormSchema(formId);
                    console.log(`Successfully loaded form schema from MERN app database for ${formId}`);
                } catch (mernError) {
                    console.warn(`Could not load form from MERN app database: ${mernError.message}. Falling back to local database.`);
                }
            }

            // If not found in MERN app or no connector, use local database
            if (!form) {
                form = await this.dbClient.getForm(formId);
            }

            if (!form) {
                throw new Error(`Form not found: ${formId}`);
            }

            // Check if fields have embeddings, if not generate them
            const fieldsWithEmbeddings = await this.ensureFieldEmbeddings(form.fields);

            // Cache the form fields
            this.formCache.set(formId, fieldsWithEmbeddings);

            return fieldsWithEmbeddings;
        } catch (error) {
            console.error(`Error loading form schema for ${formId}:`, error);
            throw error;
        }
    }

    /**
     * Ensure all fields have semantic embeddings
     * @param {Array} fields - The form fields
     * @returns {Promise<Array>} - Fields with embeddings
     */
    async ensureFieldEmbeddings(fields) {
        const updatedFields = [];

        for (const field of fields) {
            if (!field.semantics || !field.semantics.embedding) {
                // Generate embedding from field description
                const textToEmbed = `${field.name}: ${field.description}. Type: ${field.type}. ${field.semantics?.synonyms?.length > 0
                    ? `Similar terms: ${field.semantics.synonyms.join(', ')}`
                    : ''
                    }`;

                const embedding = await getEmbeddings(textToEmbed);

                if (!field.semantics) {
                    field.semantics = {};
                }
                field.semantics.embedding = Buffer.from(
                    new Float32Array(embedding).buffer
                );

                // Save the updated field with embedding to database
                await this.dbClient.updateFieldEmbedding(field.id, embedding);
            }

            updatedFields.push(field);
        }

        return updatedFields;
    }

    /**
     * Find the most semantically similar fields to a given text
     * @param {string} formId - The ID of the form
     * @param {string} text - The text to find similar fields for
     * @param {number} topN - The number of top matches to return
     * @returns {Promise<Array>} - The most similar fields
     */
    async findSimilarFields(formId, text, topN = 5) {
        const fields = await this.loadFormFields(formId);

        // Generate embedding for the input text
        const textEmbedding = await getEmbeddings(text);

        // Calculate similarity scores
        const scoredFields = fields.map(field => {
            // Convert Buffer back to Float32Array
            const fieldEmbedding = new Float32Array(
                field.semantics.embedding.buffer
            );

            // Calculate cosine similarity
            const similarity = this.cosineSimilarity(textEmbedding, fieldEmbedding);

            return {
                field,
                similarity
            };
        });

        // Sort by similarity score (descending)
        scoredFields.sort((a, b) => b.similarity - a.similarity);

        // Return top N matches
        return scoredFields.slice(0, topN).map(scored => ({
            ...scored.field.toObject(),
            similarityScore: scored.similarity
        }));
    }

    /**
     * Calculate cosine similarity between two embeddings
     * @param {Array} embA - First embedding
     * @param {Array} embB - Second embedding
     * @returns {number} - Cosine similarity score
     */
    cosineSimilarity(embA, embB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < embA.length; i++) {
            dotProduct += embA[i] * embB[i];
            normA += embA[i] * embA[i];
            normB += embB[i] * embB[i];
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (normA * normB);
    }
}

module.exports = FormSchemaLoader;
