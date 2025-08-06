// WebSocket Connection Factory for Document Status Updates
// This is a reusable utility for maintaining WebSocket connections 
// to the document processing services

class WebSocketFactory {
    constructor() {
        this.connections = new Map();
        this.connectionAttempts = new Map();
        this.MAX_RECONNECT_ATTEMPTS = 5;
        this.RECONNECT_DELAY_MS = 2000; // 2 seconds
        this.DEFAULT_WS_URL = process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:4007';

        // Keep track of subscriptions: Map<documentId, Set<callbackFn>>
        this.subscriptions = new Map();

        // Debug info
        console.log(`[WebSocketFactory] Initialized with default URL: ${this.DEFAULT_WS_URL}`);
    }

    /**
     * Get a WebSocket connection, creating one if it doesn't exist
     * @param {string} url - The WebSocket URL to connect to 
     * @returns {WebSocket} The WebSocket connection
     */
    getConnection(url = this.DEFAULT_WS_URL) {
        console.log(`[WebSocketFactory] Getting connection for URL: ${url}`);
        if (this.connections.has(url)) {
            const conn = this.connections.get(url);
            if (conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING) {
                console.log(`[WebSocketFactory] Returning existing connection (state: ${conn.readyState === 1 ? 'OPEN' : 'CONNECTING'})`);
                return conn;
            }
            console.log(`[WebSocketFactory] Existing connection is closed (state: ${conn.readyState}), creating new one`);
        }

        try {
            console.log(`[WebSocketFactory] Creating new WebSocket connection to ${url}`);
            const ws = new WebSocket(url);

            ws.onopen = () => {
                console.log(`[WebSocketFactory] WebSocket connected to ${url}`);
                this.connectionAttempts.set(url, 0); // Reset connection attempts on successful connection

                // Send pending subscriptions
                this.subscriptions.forEach((callbacks, documentId) => {
                    this.sendSubscription(ws, documentId);
                });
            };

            ws.onclose = (event) => {
                console.log(`[WebSocketFactory] WebSocket connection to ${url} closed: ${event.code} ${event.reason}`);
                this.connections.delete(url); // Remove the closed connection

                // Try to reconnect with exponential backoff
                const attempts = this.connectionAttempts.get(url) || 0;
                if (attempts < this.MAX_RECONNECT_ATTEMPTS) {
                    const delay = this.RECONNECT_DELAY_MS * Math.pow(1.5, attempts);
                    console.log(`[WebSocketFactory] Attempting to reconnect to ${url} in ${delay}ms (attempt ${attempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})`);

                    this.connectionAttempts.set(url, attempts + 1);
                    setTimeout(() => {
                        console.log(`[WebSocketFactory] Reconnecting to ${url}...`);
                        this.getConnection(url); // This will create a new connection
                    }, delay);
                } else {
                    console.log(`[WebSocketFactory] Maximum reconnection attempts reached for ${url}`);
                }
            };

            ws.onerror = (error) => {
                console.error(`[WebSocketFactory] WebSocket error with ${url}:`, error);
            };

            ws.onmessage = (event) => {
                console.log(`[WebSocketFactory] Received message from ${url}:`, event.data);

                try {
                    const message = JSON.parse(event.data);
                    const documentId = message.documentId || (message.data && message.data.documentId);

                    if (documentId && this.subscriptions.has(documentId)) {
                        console.log(`[WebSocketFactory] Processing message for document ${documentId}`);
                        const callbacks = this.subscriptions.get(documentId);
                        callbacks.forEach(callback => {
                            try {
                                callback(message);
                            } catch (err) {
                                console.error(`[WebSocketFactory] Error in callback for document ${documentId}:`, err);
                            }
                        });
                    } else {
                        console.log(`[WebSocketFactory] Received message with no matching subscription: ${JSON.stringify(message)}`);
                    }
                } catch (err) {
                    console.error(`[WebSocketFactory] Error parsing WebSocket message:`, err, event.data);
                }
            };

            this.connections.set(url, ws);
            return ws;
        } catch (err) {
            console.error(`[WebSocketFactory] Error creating WebSocket connection to ${url}:`, err);
            throw err;
        }
    }

    /**
     * Subscribe to updates for a specific document
     * @param {string} documentId - The document ID to subscribe to
     * @param {function} callback - The callback function to invoke when an update is received
     * @param {string} url - Optional WebSocket URL (defaults to factory default)
     * @returns {function} - Unsubscribe function
     */
    subscribeToDocument(documentId, callback, url = this.DEFAULT_WS_URL) {
        console.log(`[WebSocketFactory] Subscribing to document ${documentId} at ${url}`);

        // Create a set of callbacks for this document if it doesn't exist
        if (!this.subscriptions.has(documentId)) {
            this.subscriptions.set(documentId, new Set());
        }

        // Add this callback to the document's subscription set
        this.subscriptions.get(documentId).add(callback);

        // Get or create a connection to the WebSocket server
        const ws = this.getConnection(url);

        // If the connection is open, send the subscription message
        if (ws.readyState === WebSocket.OPEN) {
            this.sendSubscription(ws, documentId);
        }
        // If not open yet, the onopen handler will send pending subscriptions

        // Return an unsubscribe function
        return () => {
            console.log(`[WebSocketFactory] Unsubscribing from document ${documentId}`);

            const callbacks = this.subscriptions.get(documentId);
            if (callbacks) {
                callbacks.delete(callback);

                // If no more callbacks for this document, remove the subscription
                if (callbacks.size === 0) {
                    this.subscriptions.delete(documentId);

                    // Send unsubscribe message if connection is open
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'unsubscribe',
                            documentId: documentId
                        }));
                    }
                }
            }
        };
    }

    /**
     * Send a subscription message to the WebSocket
     * @param {WebSocket} ws - The WebSocket connection
     * @param {string} documentId - The document ID to subscribe to
     */
    sendSubscription(ws, documentId) {
        if (ws.readyState === WebSocket.OPEN) {
            const subscribeMsg = JSON.stringify({
                type: 'subscribe',
                documentId: documentId
            });
            console.log(`[WebSocketFactory] Sending subscription for document ${documentId}:`, subscribeMsg);
            ws.send(subscribeMsg);
        } else {
            console.log(`[WebSocketFactory] Cannot send subscription for ${documentId}, WebSocket not open (state: ${ws.readyState})`);
        }
    }

    /**
     * Close all WebSocket connections
     */
    closeAll() {
        console.log(`[WebSocketFactory] Closing all connections`);
        this.connections.forEach((ws, url) => {
            console.log(`[WebSocketFactory] Closing connection to ${url}`);
            ws.close(1000, "Closing connection");
        });
        this.connections.clear();
        this.subscriptions.clear();
    }
}

// Create a singleton instance
const wsFactory = new WebSocketFactory();

export default wsFactory;
