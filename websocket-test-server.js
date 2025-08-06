const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Create HTTP server to serve the debug client
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'websocket-debug.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading debug client');
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Connection tracking
const connections = new Map();
const documentSubscriptions = new Map();

// WebSocket server events
wss.on('connection', (ws, req) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 15);
    connections.set(ws, { id, subscriptions: new Set() });

    console.log(`[${new Date().toISOString()}] New connection established (${id})`);

    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connection_established',
        data: { id, message: 'Connected to WebSocket test server' }
    }));

    ws.on('message', (message) => {
        try {
            console.log(`[${new Date().toISOString()}] Received message: ${message}`);
            const data = JSON.parse(message);

            // Handle subscription
            if ((data.type === 'subscribe:document') ||
                (data.event === 'subscribe' && data.channel && data.channel.startsWith('document:'))) {

                let documentId = data.documentId;

                // Handle Socket.IO style subscriptions
                if (data.event === 'subscribe' && data.channel) {
                    const channelParts = data.channel.split(':');
                    if (channelParts.length >= 2) {
                        documentId = channelParts[1];
                    }
                }

                if (documentId) {
                    // Add to document subscriptions
                    if (!documentSubscriptions.has(documentId)) {
                        documentSubscriptions.set(documentId, new Set());
                    }
                    documentSubscriptions.get(documentId).add(ws);

                    // Add to connection's subscriptions
                    connections.get(ws).subscriptions.add(documentId);

                    console.log(`[${new Date().toISOString()}] Client ${connections.get(ws).id} subscribed to document: ${documentId}`);

                    // Send acknowledgment
                    ws.send(JSON.stringify({
                        type: 'subscription_success',
                        documentId,
                        data: { message: `Subscribed to document ${documentId}` }
                    }));
                }
            }
            // Handle unsubscription
            else if (data.type === 'unsubscribe:document') {
                const documentId = data.documentId;

                if (documentId && documentSubscriptions.has(documentId)) {
                    documentSubscriptions.get(documentId).delete(ws);
                    connections.get(ws).subscriptions.delete(documentId);

                    console.log(`[${new Date().toISOString()}] Client ${connections.get(ws).id} unsubscribed from document: ${documentId}`);

                    ws.send(JSON.stringify({
                        type: 'unsubscription_success',
                        documentId,
                        data: { message: `Unsubscribed from document ${documentId}` }
                    }));
                }
            }
            // Handle document updates (like processing status changes)
            else if (data.type && data.documentId && documentSubscriptions.has(data.documentId)) {
                // Broadcast to all subscribers of this document except the sender
                const documentId = data.documentId;
                const subscribers = documentSubscriptions.get(documentId);

                console.log(`[${new Date().toISOString()}] Broadcasting ${data.type} for document ${documentId} to ${subscribers.size} subscribers`);

                subscribers.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });

                // Also echo back to sender for confirmation
                ws.send(JSON.stringify({
                    type: 'message_received',
                    documentId,
                    original: data,
                    data: { message: `Message broadcast to ${subscribers.size - 1} other subscribers` }
                }));
            }
            // Echo any other messages back for testing
            else {
                ws.send(JSON.stringify({
                    type: 'echo',
                    original: data,
                    data: { message: 'Message received but not processed as a known command' }
                }));
            }

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing message:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                data: { message: `Error processing message: ${error.message}` }
            }));
        }
    });

    ws.on('close', () => {
        const connectionInfo = connections.get(ws);

        if (connectionInfo) {
            console.log(`[${new Date().toISOString()}] Connection closed: ${connectionInfo.id}`);

            // Remove from document subscriptions
            connectionInfo.subscriptions.forEach(docId => {
                if (documentSubscriptions.has(docId)) {
                    documentSubscriptions.get(docId).delete(ws);
                }
            });

            // Remove from connections
            connections.delete(ws);
        }
    });
});

// Start server
const PORT = process.env.PORT || 4007;
server.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] WebSocket Test Server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Debug client available at http://localhost:${PORT}`);
});

// Log connection counts every 30 seconds
setInterval(() => {
    console.log(`[${new Date().toISOString()}] Status: ${connections.size} active connections, ${documentSubscriptions.size} documents with subscriptions`);
}, 30000);

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log(`[${new Date().toISOString()}] Shutting down WebSocket Test Server...`);
    server.close(() => {
        console.log(`[${new Date().toISOString()}] HTTP server closed.`);

        // Close all WebSocket connections
        wss.clients.forEach(client => {
            client.terminate();
        });

        console.log(`[${new Date().toISOString()}] All WebSocket connections terminated.`);
        process.exit(0);
    });
});
