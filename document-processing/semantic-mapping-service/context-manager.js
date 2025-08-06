const { UserContext } = require('../../shared/models/semantic-models');

class ContextManager {
    constructor(dbClient) {
        this.dbClient = dbClient;
        this.contextCache = new Map();
    }

    /**
     * Get user context by user ID
     * @param {string} userId - The ID of the user
     * @returns {Promise<Object>} - The user context
     */
    async getUserContext(userId) {
        try {
            // Check cache first
            if (this.contextCache.has(userId)) {
                return this.contextCache.get(userId);
            }

            // Load from database
            const userContext = await this.dbClient.getUserContext(userId);

            if (!userContext) {
                console.warn(`User context not found for user: ${userId}`);
                return null;
            }

            // Cache the context
            this.contextCache.set(userId, userContext);

            return userContext;
        } catch (error) {
            console.error(`Error loading user context for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Format user context for LLM prompt
     * @param {Object} context - The user context object
     * @returns {string} - Formatted context string
     */
    formatContextForPrompt(context) {
        if (!context) return "No user context available.";

        const personal = context.personalContext || {};
        const application = context.applicationContext || {};

        // Build a formatted context string
        let contextStr = "User Context:\n";

        // Add personal context
        if (personal.userName) contextStr += `- User Name: ${personal.userName}\n`;
        if (personal.deceasedName) contextStr += `- Deceased Name: ${personal.deceasedName}\n`;
        if (personal.relationship) contextStr += `- Relationship to Deceased: ${personal.relationship}\n`;

        // Add addresses if available
        if (personal.addresses && personal.addresses.length > 0) {
            contextStr += "- Addresses:\n";

            personal.addresses.forEach(addr => {
                contextStr += `  * ${addr.type}: ${addr.line1}, ${addr.city}, ${addr.postcode}\n`;
            });
        }

        // Add identifiers if available
        if (personal.identifiers && personal.identifiers.length > 0) {
            contextStr += "- Identifiers:\n";

            personal.identifiers.forEach(id => {
                contextStr += `  * ${id.type}: ${id.value}\n`;
            });
        }

        // Add application context
        contextStr += "\nApplication Context:\n";
        if (application.applicationId) contextStr += `- Application ID: ${application.applicationId}\n`;
        if (application.applicationType) contextStr += `- Application Type: ${application.applicationType}\n`;
        if (application.dateOfDeath) contextStr += `- Date of Death: ${application.dateOfDeath.toISOString().split('T')[0]}\n`;
        if (application.dateOfFuneral) contextStr += `- Date of Funeral: ${application.dateOfFuneral.toISOString().split('T')[0]}\n`;

        return contextStr;
    }

    /**
     * Extract names and key personal details for document processing
     * @param {Object} context - User context object
     * @returns {Object} - Key personal details
     */
    extractPersonalDetails(context) {
        if (!context) return {};

        const personal = context.personalContext || {};
        const application = context.applicationContext || {};

        return {
            userName: personal.userName,
            deceasedName: personal.deceasedName,
            relationship: personal.relationship,
            addresses: personal.addresses || [],
            dateOfDeath: application.dateOfDeath,
            dateOfFuneral: application.dateOfFuneral
        };
    }

    /**
     * Update user context with new information
     * @param {string} userId - The user ID
     * @param {Object} updatedContext - The updated context information
     * @returns {Promise<Object>} - The updated user context
     */
    async updateUserContext(userId, updatedContext) {
        try {
            const result = await this.dbClient.updateUserContext(userId, updatedContext);

            // Update the cache
            if (this.contextCache.has(userId)) {
                const existingContext = this.contextCache.get(userId);
                this.contextCache.set(userId, {
                    ...existingContext,
                    ...updatedContext,
                    updatedAt: new Date()
                });
            }

            return result;
        } catch (error) {
            console.error(`Error updating user context for ${userId}:`, error);
            throw error;
        }
    }
}

module.exports = ContextManager;
