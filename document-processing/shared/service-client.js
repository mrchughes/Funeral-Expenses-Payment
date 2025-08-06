/**
 * API Client for inter-service communication
 */
const axios = require('axios');

class ServiceClient {
    constructor(baseURL, timeout = 30000) {
        this.client = axios.create({
            baseURL,
            timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add request interceptor for logging
        this.client.interceptors.request.use((config) => {
            console.log(`[ServiceClient] ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
            return config;
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => {
                return response.data;
            },
            (error) => {
                const errorMessage = error.response?.data?.error?.message || error.message;
                console.error(`[ServiceClient] Error: ${errorMessage}`);
                return Promise.reject(error);
            }
        );
    }

    // Generic request method
    async request(method, url, data = null, config = {}) {
        try {
            return await this.client.request({
                method,
                url,
                data,
                ...config,
            });
        } catch (error) {
            console.error(`[ServiceClient] Request failed: ${error.message}`);
            throw error;
        }
    }

    // GET request
    async get(url, config = {}) {
        return this.request('get', url, null, config);
    }

    // POST request
    async post(url, data, config = {}) {
        return this.request('post', url, data, config);
    }

    // PUT request
    async put(url, data, config = {}) {
        return this.request('put', url, data, config);
    }

    // PATCH request
    async patch(url, data, config = {}) {
        return this.request('patch', url, data, config);
    }

    // DELETE request
    async delete(url, config = {}) {
        return this.request('delete', url, null, config);
    }
}

// Database Service Client
class DatabaseServiceClient extends ServiceClient {
    constructor(baseURL) {
        super(baseURL);
    }

    // Document-specific methods
    async createDocument(documentData) {
        return this.post('/documents', documentData);
    }

    async updateDocument(documentId, updateData) {
        return this.patch(`/documents/${documentId}`, updateData);
    }

    async getDocument(documentId) {
        return this.get(`/documents/${documentId}`);
    }

    async updateDocumentState(documentId, status, stage, progress = null, error = null) {
        const updateData = {
            processingState: {
                status,
                currentStage: stage,
                lastUpdated: new Date(),
            },
        };

        if (progress !== null) {
            updateData.processingState.progress = progress;
        }

        if (error) {
            updateData.processingState.error = error;
        }

        return this.patch(`/documents/${documentId}/state`, updateData);
    }

    async addProcessingHistoryEntry(documentId, entry) {
        return this.post(`/documents/${documentId}/history`, entry);
    }
}

// WebSocket Service Client
class WebSocketServiceClient extends ServiceClient {
    constructor(baseURL) {
        super(baseURL);
    }

    async sendStateUpdate(documentId, status, stage, progress = null) {
        return this.post('/broadcast', {
            type: 'STATE_CHANGED',
            documentId,
            data: {
                status,
                stage,
                progress,
                timestamp: new Date(),
            },
        });
    }

    async sendProgressUpdate(documentId, progress, message) {
        return this.post('/broadcast', {
            type: 'PROGRESS_UPDATED',
            documentId,
            data: {
                progress,
                message,
                timestamp: new Date(),
            },
        });
    }

    async sendError(documentId, error) {
        return this.post('/broadcast', {
            type: 'ERROR_OCCURRED',
            documentId,
            data: {
                error,
                timestamp: new Date(),
            },
        });
    }

    async sendCompletion(documentId, result) {
        return this.post('/broadcast', {
            type: 'PROCESSING_COMPLETED',
            documentId,
            data: {
                result,
                timestamp: new Date(),
            },
        });
    }
}

module.exports = {
    ServiceClient,
    DatabaseServiceClient,
    WebSocketServiceClient,
};
