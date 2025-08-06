/**
 * Document Processing WebSocket Server
 * 
 * This service manages WebSocket connections for real-time document processing updates.
 * It handles client connections, subscriptions to document updates, and broadcasting
 * processing status to interested clients.
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class DocumentProcessingServer {
    /**
     * Create a new document processing WebSocket server
     * @param {Object} options Configuration options
     * @param {Object} options.httpServer HTTP server to attach WebSocket server to
     * @param {boolean} options.debug Whether to log debug messages
     * @param {string} options.path WebSocket server path (default: '/ws/documents')
     */
    constructor(options = {}) {
        this.httpServer = options.httpServer;
        this.debug = options.debug || false;
        this.path = options.path || '/ws/documents';
        this.wss = null;
        this.clients = new Map(); // clientId -> client
        this.subscriptions = new Map(); // documentId -> Set of clientIds
        this.clientSubscriptions = new Map(); // clientId -> Set of documentIds

        this.log('Document Processing WebSocket Server created');
    }

    /**
     * Start the WebSocket server
     */
    start() {
        if (this.wss) {
            this.log('WebSocket server already running');
            return;
        }

        try {
            // Create WebSocket server attached to the HTTP server
            this.wss = new WebSocket.Server({
                server: this.httpServer,
                path: this.path
            });

            this.log(`WebSocket server starting on path: ${this.path}`);

            // Handle new connections
            this.wss.on('connection', (ws, req) => {
                const clientId = uuidv4();
                this.log(`New client connected: ${clientId}`);

                // Store client information
                this.clients.set(clientId, {
                    ws,
                    ip: req.socket.remoteAddress,
                    connectedAt: new Date(),
                    lastActivity: new Date()
                });

                // Initialize empty subscription set for this client
                this.clientSubscriptions.set(clientId, new Set());

                // Send welcome message with client ID
                this.sendToClient(clientId, {
                    type: 'connection',
                    clientId,
                    message: 'Connected to document processing server'
                });

                // Handle client messages
                ws.on('message', (message) => {
                    this.handleClientMessage(clientId, message);
                });

                // Handle client disconnect
                ws.on('close', () => {
                    this.handleClientDisconnect(clientId);
                });
            });

            this.log('WebSocket server started successfully');
        } catch (error) {
            console.error('Failed to start WebSocket server:', error);
            throw error;
        }
    }

    /**
     * Stop the WebSocket server and clean up resources
     */
    stop() {
        if (!this.wss) {
            this.log('WebSocket server not running');
            return;
        }

        try {
            // Close all connections
            this.wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.close(1000, 'Server shutting down');
                }
            });

            // Close the server
            this.wss.close();
            this.wss = null;

            // Clear internal state
            this.clients.clear();
            this.subscriptions.clear();
            this.clientSubscriptions.clear();

            this.log('WebSocket server stopped');
        } catch (error) {
            console.error('Error stopping WebSocket server:', error);
            throw error;
        }
    }

    /**
     * Handle incoming client messages
     * @param {string} clientId The client ID
     * @param {string} messageData Raw message data from client
     */
    handleClientMessage(clientId, messageData) {
        try {
            const client = this.clients.get(clientId);
            if (!client) {
                return;
            }

            // Update client activity timestamp
            client.lastActivity = new Date();

            // Parse message
            let message;
            try {
                message = JSON.parse(messageData);
            } catch (error) {
                this.log(`Invalid JSON from client ${clientId}: ${messageData}`);
                this.sendToClient(clientId, {
                    type: 'error',
                    error: 'INVALID_JSON',
                    message: 'Invalid JSON format'
                });
                return;
            }

            this.log(`Received message from client ${clientId}: ${JSON.stringify(message)}`);

            // Handle message based on type
            switch (message.type) {
                case 'ping':
                    this.sendToClient(clientId, {
                        type: 'pong',
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'subscribe':
                    this.handleSubscription(clientId, message);
                    break;

                case 'unsubscribe':
                    this.handleUnsubscription(clientId, message);
                    break;

                default:
                    this.sendToClient(clientId, {
                        type: 'error',
                        error: 'UNKNOWN_MESSAGE_TYPE',
                        message: `Unknown message type: ${message.type}`
                    });
            }
        } catch (error) {
            console.error(`Error handling client message from ${clientId}:`, error);
        }
    }

    /**
     * Handle subscription requests from clients
     * @param {string} clientId The client ID
     * @param {Object} message The subscription message
     */
    handleSubscription(clientId, message) {
        if (!message.documentId) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'INVALID_SUBSCRIPTION',
                message: 'Missing documentId in subscription request'
            });
            return;
        }

        const documentId = message.documentId;

        // Add this client to the document's subscription list
        if (!this.subscriptions.has(documentId)) {
            this.subscriptions.set(documentId, new Set());
        }
        this.subscriptions.get(documentId).add(clientId);

        // Add this document to the client's subscription list
        this.clientSubscriptions.get(clientId).add(documentId);

        this.log(`Client ${clientId} subscribed to document ${documentId}`);

        // Confirm subscription to client
        this.sendToClient(clientId, {
            type: 'subscribed',
            documentId,
            message: 'Successfully subscribed to document updates'
        });
    }

    /**
     * Handle unsubscription requests from clients
     * @param {string} clientId The client ID
     * @param {Object} message The unsubscription message
     */
    handleUnsubscription(clientId, message) {
        if (!message.documentId) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'INVALID_UNSUBSCRIPTION',
                message: 'Missing documentId in unsubscription request'
            });
            return;
        }

        const documentId = message.documentId;

        // Remove this client from the document's subscription list
        if (this.subscriptions.has(documentId)) {
            this.subscriptions.get(documentId).delete(clientId);
            // Clean up empty subscription sets
            if (this.subscriptions.get(documentId).size === 0) {
                this.subscriptions.delete(documentId);
            }
        }

        // Remove this document from the client's subscription list
        if (this.clientSubscriptions.has(clientId)) {
            this.clientSubscriptions.get(clientId).delete(documentId);
        }

        this.log(`Client ${clientId} unsubscribed from document ${documentId}`);

        // Confirm unsubscription to client
        this.sendToClient(clientId, {
            type: 'unsubscribed',
            documentId,
            message: 'Successfully unsubscribed from document updates'
        });
    }

    /**
     * Handle client disconnection
     * @param {string} clientId The client ID
     */
    handleClientDisconnect(clientId) {
        // Get the documents this client was subscribed to
        const documents = this.clientSubscriptions.get(clientId) || new Set();

        // Remove client from all document subscriptions
        for (const documentId of documents) {
            if (this.subscriptions.has(documentId)) {
                this.subscriptions.get(documentId).delete(clientId);
                // Clean up empty subscription sets
                if (this.subscriptions.get(documentId).size === 0) {
                    this.subscriptions.delete(documentId);
                }
            }
        }

        // Clean up client data
        this.clients.delete(clientId);
        this.clientSubscriptions.delete(clientId);

        this.log(`Client ${clientId} disconnected`);
    }

    /**
     * Send a message to a specific client
     * @param {string} clientId The client ID
     * @param {Object} message The message to send
     * @returns {boolean} Whether the message was sent successfully
     */
    sendToClient(clientId, message) {
        try {
            const client = this.clients.get(clientId);
            if (!client) {
                this.log(`Attempted to send message to non-existent client: ${clientId}`);
                return false;
            }

            const { ws } = client;
            if (ws.readyState !== WebSocket.OPEN) {
                this.log(`Client ${clientId} connection not open (state: ${ws.readyState})`);
                return false;
            }

            ws.send(JSON.stringify(message));
            client.lastActivity = new Date();
            return true;
        } catch (error) {
            console.error(`Error sending message to client ${clientId}:`, error);
            return false;
        }
    }

    /**
     * Broadcast a document update to all subscribed clients
     * @param {string} documentId The document ID
     * @param {string} eventType The event type
     * @param {Object} data The update data
     * @returns {number} The number of clients the message was sent to
     */
    broadcastDocumentUpdate(documentId, eventType, data) {
        if (!documentId) {
            this.log('Attempted to broadcast update without documentId');
            return 0;
        }

        const subscribers = this.subscriptions.get(documentId);
        if (!subscribers || subscribers.size === 0) {
            this.log(`No subscribers for document ${documentId}`);
            return 0;
        }

        const message = {
            type: 'document_update',
            eventType,
            documentId,
            timestamp: new Date().toISOString(),
            data
        };

        let sentCount = 0;
        for (const clientId of subscribers) {
            const success = this.sendToClient(clientId, message);
            if (success) sentCount++;
        }

        this.log(`Broadcast ${eventType} for document ${documentId} to ${sentCount} clients`);
        return sentCount;
    }

    /**
     * Update document processing progress
     * @param {string} documentId The document ID
     * @param {string} state Current processing state
     * @param {number} progress Progress percentage (0-100)
     * @param {string} message Status message
     * @returns {number} Number of clients notified
     */
    updateDocumentProgress(documentId, state, progress, message) {
        return this.broadcastDocumentUpdate(documentId, 'progress', {
            state,
            progress,
            message
        });
    }

    /**
     * Start document processing and notify clients
     * @param {string} documentId The document ID
     * @param {string} state Initial processing state
     * @param {string} message Status message
     * @returns {number} Number of clients notified
     */
    startDocumentProcessing(documentId, state, message) {
        return this.broadcastDocumentUpdate(documentId, 'started', {
            state,
            progress: 0,
            message,
            startedAt: new Date().toISOString()
        });
    }

    /**
     * Mark document processing as complete and notify clients
     * @param {string} documentId The document ID
     * @param {Object} results Processing results
     * @returns {number} Number of clients notified
     */
    completeDocumentProcessing(documentId, results) {
        return this.broadcastDocumentUpdate(documentId, 'completed', {
            state: 'completed',
            progress: 100,
            message: 'Processing completed',
            completedAt: new Date().toISOString(),
            results
        });
    }

    /**
     * Report document processing error and notify clients
     * @param {string} documentId The document ID
     * @param {string} errorCode Error code
     * @param {string} errorMessage Error message
     * @param {Object} details Additional error details
     * @returns {number} Number of clients notified
     */
    reportDocumentError(documentId, errorCode, errorMessage, details = {}) {
        return this.broadcastDocumentUpdate(documentId, 'error', {
            state: 'error',
            errorCode,
            message: errorMessage,
            details,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log a message if debug mode is enabled
     * @param {string} message The message to log
     */
    log(message) {
        if (this.debug) {
            console.log(`[DocumentProcessingServer] ${message}`);
        }
    }
}

module.exports = DocumentProcessingServer;
