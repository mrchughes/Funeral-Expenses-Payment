const { OpenAIEmbeddings } = require('@langchain/openai');
require('dotenv').config();

// Initialize the embeddings model
const embeddings = new OpenAIEmbeddings({
    modelName: "text-embedding-3-small",
    openAIApiKey: process.env.OPENAI_API_KEY,
    dimensions: 1536 // Specify the desired embedding dimensions
});

/**
 * Get embeddings for text using OpenAI
 * @param {string} text - The text to embed
 * @returns {Promise<Array>} - The embedding vector
 */
async function getEmbeddings(text) {
    try {
        const embedding = await embeddings.embedQuery(text);
        return embedding;
    } catch (error) {
        console.error(`Error generating embeddings:`, error);
        throw error;
    }
}

/**
 * Get embeddings for multiple texts
 * @param {Array<string>} texts - Array of texts to embed
 * @returns {Promise<Array<Array<number>>>} - Array of embedding vectors
 */
async function getBatchEmbeddings(texts) {
    try {
        const embeddings = await embeddings.embedDocuments(texts);
        return embeddings;
    } catch (error) {
        console.error(`Error generating batch embeddings:`, error);
        throw error;
    }
}

/**
 * Calculate semantic similarity between two texts
 * @param {string} textA - First text
 * @param {string} textB - Second text
 * @returns {Promise<number>} - Similarity score (0-1)
 */
async function getTextSimilarity(textA, textB) {
    try {
        const [embeddingA, embeddingB] = await getBatchEmbeddings([textA, textB]);

        return calculateCosineSimilarity(embeddingA, embeddingB);
    } catch (error) {
        console.error(`Error calculating text similarity:`, error);
        throw error;
    }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Array<number>} a - First vector
 * @param {Array<number>} b - Second vector
 * @returns {number} - Cosine similarity score
 */
function calculateCosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error('Vectors must be of same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}

module.exports = {
    getEmbeddings,
    getBatchEmbeddings,
    getTextSimilarity,
    calculateCosineSimilarity
};
