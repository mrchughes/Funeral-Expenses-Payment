/**
 * Document Processing WebSocket Client Integration
 * 
 * This module handles WebSocket connections for real-time document processing updates.
 */

class DocumentProcessingClient {
    /**
     * Create a new DocumentProcessingClient
     * @param {string} wsUrl - The WebSocket server URL
     * @param {Object} options - Configuration options
     */
    constructor(wsUrl, options = {}) {
        this.wsUrl = wsUrl;
        this.options = {
            autoReconnect: true,
            reconnectDelay: 2000,
            maxReconnectAttempts: 5,
            debug: false,
            ...options
        };

        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.subscribedDocuments = new Set();
        this.listeners = new Map();
        this.documentStatusCallbacks = new Map();
    }

    /**
     * Debug log helper
     * @private
     */
    _log(...args) {
        if (this.options.debug) {
            console.log('[WebSocket]', ...args);
        }
    }

    /**
     * Connect to the WebSocket server
     * @returns {Promise} Resolves when connected, rejects on failure
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
                this._log('Already connected or connecting');
                if (this.connected) resolve();
                return;
            }

            this._log(`Connecting to ${this.wsUrl}...`);

            try {
                this.socket = new WebSocket(this.wsUrl);

                // Set a connection timeout
                const connectTimeout = setTimeout(() => {
                    if (!this.connected) {
                        const error = new Error('Connection timed out');
                        this._handleConnectionError(error);
                        reject(error);
                    }
                }, 5000);

                this.socket.addEventListener('open', () => {
                    clearTimeout(connectTimeout);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this._log('Connected successfully');

                    // Resubscribe to documents
                    if (this.subscribedDocuments.size > 0) {
                        this._log('Resubscribing to documents...');
                        this.subscribedDocuments.forEach(docId => {
                            this._sendSubscription(docId);
                        });
                    }

                    resolve();
                });

                this.socket.addEventListener('message', (event) => {
                    this._handleMessage(event);
                });

                this.socket.addEventListener('error', (error) => {
                    this._log('WebSocket error:', error);
                    if (!this.connected) {
                        clearTimeout(connectTimeout);
                        this._handleConnectionError(error);
                        reject(error);
                    }
                });

                this.socket.addEventListener('close', (event) => {
                    this._log(`WebSocket closed: Code ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
                    this.connected = false;

                    // Attempt reconnection if enabled
                    if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
                        this._attemptReconnect();
                    } else {
                        this._log('WebSocket disconnected');
                    }
                });

            } catch (error) {
                this._log('Failed to create WebSocket:', error);
                this._handleConnectionError(error);
                reject(error);
            }
        });
    }

    /**
     * Handle connection errors
     * @private
     */
    _handleConnectionError(error) {
        if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this._attemptReconnect();
        } else {
            this._log('Connection failed, not retrying');
        }
    }

    /**
     * Attempt to reconnect to the server
     * @private
     */
    _attemptReconnect() {
        this.reconnectAttempts++;
        const delay = this.options.reconnectDelay * this.reconnectAttempts;

        this._log(`Reconnecting (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${delay}ms...`);

        setTimeout(() => {
            this.connect().catch(() => {
                // Error is already handled in connect()
            });
        }, delay);
    }

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.socket) {
            this._log('Disconnecting...');

            // Disable auto-reconnect before closing
            this.options.autoReconnect = false;

            this.socket.close(1000, 'Client disconnected');
            this.socket = null;
            this.connected = false;
        }
    }

    /**
     * Send subscription message to the server
     * @private
     */
    _sendSubscription(documentId) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this._log('Cannot subscribe, socket not open');
            return;
        }

        try {
            const subscribeMsg = {
                type: 'subscribe:document',
                documentId
            };
            this.socket.send(JSON.stringify(subscribeMsg));
            this._log(`Subscribed to document: ${documentId}`);
        } catch (error) {
            this._log(`Error subscribing to document ${documentId}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to document processing updates
     * @param {string} documentId - The ID of the document to subscribe to
     * @param {Function} callback - The callback function that will be called when updates are received
     * @returns {Promise} Resolves when subscription is successful
     */
    subscribeToDocument(documentId, callback) {
        if (!documentId) {
            throw new Error('Document ID is required');
        }

        if (callback && typeof callback === 'function') {
            this.documentStatusCallbacks.set(documentId, callback);
        }

        this.subscribedDocuments.add(documentId);

        // If connected, send subscription immediately
        if (this.connected) {
            this._sendSubscription(documentId);
        } else {
            // Connect and then subscribe
            return this.connect().then(() => {
                this._sendSubscription(documentId);
            });
        }

        return Promise.resolve();
    }

    /**
     * Unsubscribe from document updates
     * @param {string} documentId - The ID of the document to unsubscribe from
     */
    unsubscribeFromDocument(documentId) {
        if (!this.connected || !this.socket) {
            this._log(`Not connected, removing ${documentId} from subscription list`);
            this.subscribedDocuments.delete(documentId);
            this.documentStatusCallbacks.delete(documentId);
            return;
        }

        try {
            const unsubscribeMsg = {
                type: 'unsubscribe:document',
                documentId
            };
            this.socket.send(JSON.stringify(unsubscribeMsg));

            this._log(`Unsubscribed from document: ${documentId}`);
            this.subscribedDocuments.delete(documentId);
            this.documentStatusCallbacks.delete(documentId);
        } catch (error) {
            this._log(`Error unsubscribing from document ${documentId}:`, error);
            throw error;
        }
    }

    /**
     * Handle incoming WebSocket messages
     * @private
     */
    _handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this._log('Received message:', message);

            // Handle document-specific messages
            if (message.documentId && this.documentStatusCallbacks.has(message.documentId)) {
                const callback = this.documentStatusCallbacks.get(message.documentId);
                callback(message);
            }

            // Fire general event listeners
            if (message.type && this.listeners.has(message.type)) {
                const listeners = this.listeners.get(message.type);
                listeners.forEach(listener => {
                    try {
                        listener(message);
                    } catch (error) {
                        this._log(`Error in listener for ${message.type}:`, error);
                    }
                });
            }
        } catch (error) {
            this._log('Error parsing message:', error, event.data);
        }
    }

    /**
     * Add an event listener for specific message types
     * @param {string} eventType - The message type to listen for
     * @param {Function} listener - The callback function
     */
    addEventListener(eventType, listener) {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }

        this.listeners.get(eventType).add(listener);
    }

    /**
     * Remove an event listener
     * @param {string} eventType - The message type
     * @param {Function} listener - The callback function to remove
     */
    removeEventListener(eventType, listener) {
        if (this.listeners.has(eventType)) {
            this.listeners.get(eventType).delete(listener);
        }
    }
}

// Example usage:
function exampleUsage() {
    // Create client instance
    const client = new DocumentProcessingClient('ws://localhost:4007', {
        debug: true,
        autoReconnect: true
    });

    // Example document status callback
    const handleDocumentUpdates = (message) => {
        console.log(`Document update for ${message.documentId}:`, message);

        const { type, data } = message;

        switch (type) {
            case 'processing_started':
                console.log('Document processing started');
                // Update UI to show processing has started
                break;

            case 'progress_updated':
                console.log(`Progress: ${data.progress}%, Step: ${data.step}`);
                // Update progress bar
                break;

            case 'processing_completed':
                console.log('Document processing completed');
                // Show completion notification
                break;

            case 'error_occurred':
                console.error('Document processing error:', data.error);
                // Show error notification
                break;
        }
    };

    // Subscribe to document updates
    const documentId = 'example-doc-123';
    client.subscribeToDocument(documentId, handleDocumentUpdates)
        .then(() => {
            console.log(`Subscribed to document ${documentId}`);
        })
        .catch(error => {
            console.error('Subscription error:', error);
        });

    // Clean up when done
    function cleanup() {
        client.unsubscribeFromDocument(documentId);
        client.disconnect();
    }

    // Call cleanup when component unmounts or when no longer needed
}

// Export the client class
module.exports = DocumentProcessingClient;
