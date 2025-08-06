/**
 * Document Processing WebSocket Server
 * 
 * This module provides WebSocket functionality for sending real-time document processing updates.
 */

const WebSocket = require('ws');
const http = require('http');
const { nanoid } = require('nanoid');

class DocumentProcessingServer {
    /**
     * Creates a WebSocket server for document processing status updates
     * 
     * @param {Object} options - Server options
     * @param {http.Server} options.httpServer - Existing HTTP server to attach to
     * @param {number} options.port - Port to use if creating a new server
     * @param {boolean} options.debug - Enable debug logging
     */
    constructor(options = {}) {
        this.options = {
            debug: false,
            port: 4007,
            path: '/ws',
            ...options
        };

        this.wss = null;
        this.httpServer = null;
        this.connections = new Map();
        this.documentSubscriptions = new Map();
        this.isRunning = false;
    }

    /**
     * Debug logging helper
     * @private
     */
    _log(...args) {
        if (this.options.debug) {
            console.log('[WebSocketServer]', ...args);
        }
    }

    /**
     * Initialize and start the WebSocket server
     */
    start() {
        if (this.isRunning) {
            this._log('Server is already running');
            return;
        }

        try {
            // Use provided HTTP server or create a new one
            if (this.options.httpServer) {
                this.httpServer = this.options.httpServer;
                this._log('Using existing HTTP server');
            } else {
                this.httpServer = http.createServer();
                this.httpServer.listen(this.options.port, () => {
                    this._log(`HTTP server listening on port ${this.options.port}`);
                });
            }

            // Create WebSocket server
            this.wss = new WebSocket.Server({
                server: this.httpServer,
                path: this.options.path
            });

            this._log('WebSocket server initialized');
            this._setupEventHandlers();
            this.isRunning = true;

            // Start periodic monitoring
            this._startMonitoring();

        } catch (error) {
            this._log('Error starting server:', error);
            throw error;
        }
    }

    /**
     * Set up WebSocket server event handlers
     * @private
     */
    _setupEventHandlers() {
        this.wss.on('connection', (ws, req) => {
            const connectionId = nanoid();
            const clientIp = req.socket.remoteAddress;

            this._log(`New connection established: ${connectionId} (${clientIp})`);

            // Store connection info
            this.connections.set(ws, {
                id: connectionId,
                ip: clientIp,
                connectedAt: new Date(),
                subscriptions: new Set()
            });

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'connection_established',
                data: {
                    id: connectionId,
                    message: 'Connected to Document Processing WebSocket Server'
                }
            }));

            // Handle incoming messages
            ws.on('message', (message) => {
                try {
                    this._handleClientMessage(ws, message);
                } catch (error) {
                    this._log(`Error handling message from ${connectionId}:`, error);
                }
            });

            // Handle connection close
            ws.on('close', (code, reason) => {
                const connectionInfo = this.connections.get(ws);
                if (connectionInfo) {
                    this._log(`Connection closed: ${connectionInfo.id}, Code: ${code}, Reason: ${reason || 'No reason'}`);

                    // Remove from document subscriptions
                    connectionInfo.subscriptions.forEach(docId => {
                        if (this.documentSubscriptions.has(docId)) {
                            this.documentSubscriptions.get(docId).delete(ws);

                            // Clean up empty document subscriptions
                            if (this.documentSubscriptions.get(docId).size === 0) {
                                this.documentSubscriptions.delete(docId);
                            }
                        }
                    });

                    // Remove from connections
                    this.connections.delete(ws);
                }
            });

            // Handle errors
            ws.on('error', (error) => {
                const connectionInfo = this.connections.get(ws);
                this._log(`WebSocket error for connection ${connectionInfo?.id || 'unknown'}:`, error);
            });
        });
    }

    /**
     * Handle messages from clients
     * @private
     */
    _handleClientMessage(ws, message) {
        let data;
        try {
            data = JSON.parse(message);

            // Get connection info
            const connectionInfo = this.connections.get(ws);
            if (!connectionInfo) {
                this._log('Message received from unknown connection');
                return;
            }

            this._log(`Received message from ${connectionInfo.id}:`, data);

            // Handle subscription requests
            if ((data.type === 'subscribe:document') ||
                (data.event === 'subscribe' && data.channel && data.channel.startsWith('document:'))) {

                let documentId = data.documentId;

                // Handle Socket.IO style channel format
                if (data.event === 'subscribe' && data.channel) {
                    const channelParts = data.channel.split(':');
                    if (channelParts.length >= 2) {
                        documentId = channelParts[1];
                    }
                }

                if (documentId) {
                    this._subscribeToDocument(ws, documentId);
                }
            }
            // Handle unsubscription requests
            else if (data.type === 'unsubscribe:document' && data.documentId) {
                this._unsubscribeFromDocument(ws, data.documentId);
            }
            // Handle other message types (echo back for testing/debugging)
            else {
                ws.send(JSON.stringify({
                    type: 'echo',
                    original: data,
                    data: { message: 'Message received' }
                }));
            }
        } catch (error) {
            this._log('Error processing message:', error, message);

            try {
                ws.send(JSON.stringify({
                    type: 'error',
                    data: {
                        message: `Error processing message: ${error.message}`,
                        originalMessage: typeof message === 'string' ? message : 'Invalid message format'
                    }
                }));
            } catch (sendError) {
                this._log('Error sending error response:', sendError);
            }
        }
    }

    /**
     * Subscribe a client to document updates
     * @private
     */
    _subscribeToDocument(ws, documentId) {
        const connectionInfo = this.connections.get(ws);
        if (!connectionInfo) return;

        // Add to document subscriptions
        if (!this.documentSubscriptions.has(documentId)) {
            this.documentSubscriptions.set(documentId, new Set());
        }
        this.documentSubscriptions.get(documentId).add(ws);

        // Add to connection's subscriptions
        connectionInfo.subscriptions.add(documentId);

        this._log(`Client ${connectionInfo.id} subscribed to document: ${documentId}`);

        // Send confirmation to client
        try {
            ws.send(JSON.stringify({
                type: 'subscription_success',
                documentId,
                data: { message: `Subscribed to document ${documentId}` }
            }));
        } catch (error) {
            this._log(`Error sending subscription confirmation to ${connectionInfo.id}:`, error);
        }
    }

    /**
     * Unsubscribe a client from document updates
     * @private
     */
    _unsubscribeFromDocument(ws, documentId) {
        const connectionInfo = this.connections.get(ws);
        if (!connectionInfo) return;

        // Remove from document subscriptions
        if (this.documentSubscriptions.has(documentId)) {
            this.documentSubscriptions.get(documentId).delete(ws);

            // Clean up empty document subscriptions
            if (this.documentSubscriptions.get(documentId).size === 0) {
                this.documentSubscriptions.delete(documentId);
            }
        }

        // Remove from connection's subscriptions
        connectionInfo.subscriptions.delete(documentId);

        this._log(`Client ${connectionInfo.id} unsubscribed from document: ${documentId}`);

        // Send confirmation to client
        try {
            ws.send(JSON.stringify({
                type: 'unsubscription_success',
                documentId,
                data: { message: `Unsubscribed from document ${documentId}` }
            }));
        } catch (error) {
            this._log(`Error sending unsubscription confirmation to ${connectionInfo.id}:`, error);
        }
    }

    /**
     * Broadcast a message to all subscribers of a document
     * 
     * @param {string} documentId - The document ID
     * @param {string} type - The message type
     * @param {Object} data - The message payload
     * @returns {number} The number of clients the message was sent to
     */
    broadcastDocumentUpdate(documentId, type, data) {
        if (!this.isRunning) {
            this._log('Cannot broadcast, server is not running');
            return 0;
        }

        if (!this.documentSubscriptions.has(documentId)) {
            this._log(`No subscribers for document ${documentId}`);
            return 0;
        }

        const subscribers = this.documentSubscriptions.get(documentId);
        let sentCount = 0;

        this._log(`Broadcasting ${type} for document ${documentId} to ${subscribers.size} subscribers`);

        const message = JSON.stringify({
            type,
            documentId,
            data
        });

        subscribers.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message);
                    sentCount++;
                } catch (error) {
                    this._log(`Error sending to client:`, error);
                }
            }
        });

        return sentCount;
    }

    /**
     * Update document processing status
     * 
     * @param {string} documentId - The document ID
     * @param {string} state - The current processing state
     * @param {number} progress - The progress percentage (0-100)
     * @param {string} step - The current processing step description
     * @param {Object} additionalData - Any additional data to include
     * @returns {number} The number of clients the message was sent to
     */
    updateDocumentProgress(documentId, state, progress, step, additionalData = {}) {
        return this.broadcastDocumentUpdate(documentId, 'progress_updated', {
            state,
            progress,
            step,
            ...additionalData,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Signal that document processing has started
     * 
     * @param {string} documentId - The document ID
     * @param {string} initialState - The initial processing state
     * @param {string} step - The initial processing step description
     * @returns {number} The number of clients the message was sent to
     */
    startDocumentProcessing(documentId, initialState = 'uploading', step = 'Starting document processing') {
        return this.broadcastDocumentUpdate(documentId, 'processing_started', {
            state: initialState,
            progress: 0,
            step,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Signal that document processing has completed
     * 
     * @param {string} documentId - The document ID
     * @param {Object} results - The processing results
     * @returns {number} The number of clients the message was sent to
     */
    completeDocumentProcessing(documentId, results = {}) {
        return this.broadcastDocumentUpdate(documentId, 'processing_completed', {
            state: 'completed',
            progress: 100,
            step: 'Processing complete',
            results,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Report an error in document processing
     * 
     * @param {string} documentId - The document ID
     * @param {string} errorCode - The error code
     * @param {string} errorMessage - The error message
     * @param {Object} details - Additional error details
     * @returns {number} The number of clients the message was sent to
     */
    reportDocumentError(documentId, errorCode, errorMessage, details = {}) {
        return this.broadcastDocumentUpdate(documentId, 'error_occurred', {
            state: 'error',
            progress: 0,
            step: 'Error occurred',
            error: {
                code: errorCode,
                message: errorMessage,
                details,
                timestamp: new Date().toISOString()
            }
        });
    }

    /**
     * Start monitoring server statistics
     * @private
     */
    _startMonitoring() {
        const interval = setInterval(() => {
            if (!this.isRunning) {
                clearInterval(interval);
                return;
            }

            this._log(`Server stats: ${this.connections.size} connections, ${this.documentSubscriptions.size} active documents`);
        }, 60000); // Log every minute
    }

    /**
     * Stop the WebSocket server
     */
    stop() {
        if (!this.isRunning) {
            this._log('Server is not running');
            return;
        }

        this._log('Stopping WebSocket server...');

        // Close all connections
        this.wss.clients.forEach(client => {
            try {
                client.close(1000, 'Server shutting down');
            } catch (error) {
                this._log('Error closing client connection:', error);
            }
        });

        // Close the WebSocket server
        this.wss.close(() => {
            this._log('WebSocket server closed');
        });

        // If we created the HTTP server, close it
        if (this.httpServer && !this.options.httpServer) {
            this.httpServer.close(() => {
                this._log('HTTP server closed');
            });
        }

        // Clear state
        this.connections.clear();
        this.documentSubscriptions.clear();
        this.isRunning = false;
    }
}

module.exports = DocumentProcessingServer;
