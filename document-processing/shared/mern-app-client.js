// Document Processing Integration Client
// This client allows the MERN app to easily integrate with the document processing system

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const WebSocket = require('ws');

class DocumentProcessingClient {
    constructor(config) {
        this.uploadServiceUrl = config.uploadServiceUrl || process.env.UPLOAD_SERVICE_URL || 'http://localhost:3025';
        this.websocketUrl = config.websocketUrl || process.env.WS_SERVICE_URL || 'ws://localhost:4007';
        this.socketConnections = {};
        this.eventHandlers = {};

        console.log(`[DocumentProcessingClient] Initialized with uploadServiceUrl: ${this.uploadServiceUrl}, websocketUrl: ${this.websocketUrl}`);
    }

    /**
     * Upload a document to the processing system
     * @param {Object} options - Upload options
     * @param {string} options.filePath - Path to the file to upload
     * @param {string} options.userId - User ID in the MERN app
     * @param {string} options.applicationId - Application ID in the MERN app
     * @param {string} options.evidenceId - Evidence ID in the MERN app (optional)
     * @returns {Promise<Object>} - Upload result with document ID
     */
    async uploadDocument({ filePath, userId, applicationId, evidenceId = null }) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const formData = new FormData();
            formData.append('file', fs.createReadStream(filePath));
            formData.append('userId', userId);
            formData.append('applicationId', applicationId);

            if (evidenceId) {
                formData.append('evidenceId', evidenceId);
            }

            const response = await axios.post(
                `${this.uploadServiceUrl}/mern/upload`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    },
                    maxBodyLength: 25 * 1024 * 1024 // 25MB
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error uploading document:', error.message);
            throw new Error(`Document upload failed: ${error.message}`);
        }
    }

    /**
     * Check the processing status of a document
     * @param {string} documentId - ID of the document to check
     * @returns {Promise<Object>} - Current processing status
     */
    async getStatus(documentId) {
        try {
            const response = await axios.get(`${this.uploadServiceUrl}/mern/status/${documentId}`);
            return response.data;
        } catch (error) {
            console.error(`Error getting status for document ${documentId}:`, error.message);
            throw new Error(`Failed to get document status: ${error.message}`);
        }
    }

    /**
     * Get the extracted fields for a document
     * @param {string} documentId - ID of the document
     * @returns {Promise<Object>} - Extracted fields
     */
    async getExtractedFields(documentId) {
        try {
            const response = await axios.get(`${this.uploadServiceUrl}/mern/fields/${documentId}`);
            return response.data;
        } catch (error) {
            console.error(`Error getting fields for document ${documentId}:`, error.message);
            throw new Error(`Failed to get extracted fields: ${error.message}`);
        }
    }

    /**
     * Subscribe to real-time updates for a document via WebSockets
     * @param {string} documentId - ID of the document to monitor
     * @param {Function} callback - Function to call when updates are received
     * @returns {Promise<Object>} - Subscription info
     */
    async subscribeToUpdates(documentId, callback) {
        console.log(`[MERN-APP-CLIENT] Subscribing to updates for document ${documentId} via WebSocket at ${this.websocketUrl}`);
        try {
            if (!this.socketConnections[documentId]) {
                // Don't use /ws path - Socket.IO usually doesn't need it
                const wsUrl = this.websocketUrl.replace(/\/$/, ''); // Remove trailing slash if present
                console.log(`[MERN-APP-CLIENT] Creating new WebSocket connection to ${wsUrl}`);
                const socket = new WebSocket(wsUrl);

                socket.onopen = () => {
                    console.log(`[MERN-APP-CLIENT] WebSocket connected for document ${documentId}`);

                    // Update to match server-side subscription format
                    // The server expects 'subscribe:document' event
                    const subscribeMsg = JSON.stringify({
                        type: 'subscribe',
                        documentId: documentId
                    });
                    console.log(`[MERN-APP-CLIENT] Sending subscription message: ${subscribeMsg}`);
                    socket.send(subscribeMsg);
                };

                socket.onmessage = (event) => {
                    try {
                        console.log(`[MERN-APP-CLIENT] Received WebSocket message for document ${documentId}:`, event.data);
                        const message = JSON.parse(event.data);

                        // Log all incoming messages for debugging
                        console.log(`[MERN-APP-CLIENT] Parsed message:`, JSON.stringify(message, null, 2));

                        if (message.documentId === documentId ||
                            (message.data && message.data.documentId === documentId)) {
                            console.log(`[MERN-APP-CLIENT] Processing WebSocket message for document ${documentId}:`, message);

                            if (typeof callback === 'function') {
                                console.log(`[MERN-APP-CLIENT] Invoking callback for document ${documentId}`);
                                callback(message);
                            } else {
                                console.error(`[MERN-APP-CLIENT] Callback for document ${documentId} is not a function:`, typeof callback);
                            }

                            // Also trigger any registered event handlers
                            if (message.type && this.eventHandlers[message.type]) {
                                console.log(`[MERN-APP-CLIENT] Invoking ${this.eventHandlers[message.type].length} handlers for message type ${message.type}`);
                                this.eventHandlers[message.type].forEach(handler => handler(message));
                            }
                        } else {
                            console.log(`[MERN-APP-CLIENT] Ignoring message - not matching document ID ${documentId}`);
                        }
                    } catch (err) {
                        console.error(`[MERN-APP-CLIENT] Error parsing WebSocket message for ${documentId}:`, err, event.data);
                    }
                };

                socket.onerror = (error) => {
                    console.error(`[MERN-APP-CLIENT] WebSocket error for document ${documentId}:`, error);
                };

                socket.onclose = (event) => {
                    console.log(`[MERN-APP-CLIENT] WebSocket closed for document ${documentId}. Code: ${event.code}, Reason: ${event.reason}`);
                    delete this.socketConnections[documentId];

                    // Attempt to reconnect after a delay if not closed cleanly
                    if (event.code !== 1000) {
                        console.log(`[MERN-APP-CLIENT] Attempting to reconnect WebSocket for document ${documentId} in 3 seconds...`);
                        setTimeout(() => {
                            console.log(`[MERN-APP-CLIENT] Reconnecting WebSocket for document ${documentId}...`);
                            this.subscribeToUpdates(documentId, callback);
                        }, 3000);
                    }
                };

                this.socketConnections[documentId] = socket;
            }

            return {
                documentId,
                status: 'subscribed',
                unsubscribe: () => this.unsubscribeFromUpdates(documentId)
            };
        } catch (error) {
            console.error(`Error subscribing to updates for document ${documentId}:`, error.message);
            throw new Error(`Failed to subscribe to updates: ${error.message}`);
        }
    }

    /**
     * Unsubscribe from updates for a document
     * @param {string} documentId - ID of the document
     * @returns {boolean} - Whether the unsubscription was successful
     */
    unsubscribeFromUpdates(documentId) {
        if (this.socketConnections[documentId]) {
            this.socketConnections[documentId].close();
            delete this.socketConnections[documentId];
            return true;
        }
        return false;
    }

    /**
     * Register an event handler for specific message types
     * @param {string} eventType - Type of event to handle
     * @param {Function} handler - Handler function
     */
    on(eventType, handler) {
        if (!this.eventHandlers[eventType]) {
            this.eventHandlers[eventType] = [];
        }
        this.eventHandlers[eventType].push(handler);
    }

    /**
     * Close all WebSocket connections
     */
    close() {
        Object.keys(this.socketConnections).forEach(documentId => {
            try {
                this.socketConnections[documentId].close();
            } catch (err) {
                console.error(`Error closing WebSocket for ${documentId}:`, err);
            }
        });

        this.socketConnections = {};
    }
}

module.exports = DocumentProcessingClient;
