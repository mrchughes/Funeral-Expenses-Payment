const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import models
const { WebSocketEventType } = require('../shared/models');

// Load environment variables
require('dotenv').config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
    },
    allowEIO3: true, // Allow Socket.IO v3 clients
    transports: ['websocket', 'polling'], // Enable both transport methods
});

// Add support for raw WebSocket connections (without Socket.IO)
// This will handle connections from clients not using Socket.IO library
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });

// Handle raw WebSocket connections
wss.on('connection', (ws, request) => {
    const clientId = Math.random().toString(36).substring(2, 10);
    console.log(`Raw WebSocket client connected: ${clientId}`);

    // Track which documents this client is subscribed to
    const subscriptions = new Set();

    ws.on('message', (message) => {
        try {
            console.log(`Raw WS message from ${clientId}:`, message.toString());
            const data = JSON.parse(message.toString());

            // Handle subscription
            if (data.type === 'subscribe:document' && data.documentId) {
                const documentId = data.documentId;
                subscriptions.add(documentId);
                console.log(`Raw WebSocket client ${clientId} subscribed to document ${documentId}`);

                // Send confirmation
                ws.send(JSON.stringify({
                    type: 'subscribed',
                    documentId: documentId,
                    status: 'subscribed'
                }));
            }
        } catch (error) {
            console.error(`Error processing raw WebSocket message from ${clientId}:`, error);
        }
    });

    ws.on('close', () => {
        console.log(`Raw WebSocket client disconnected: ${clientId}`);
    });

    // Store client reference for broadcasting
    if (!global.rawWebSocketClients) {
        global.rawWebSocketClients = new Map();
    }
    global.rawWebSocketClients.set(clientId, { ws, subscriptions });
});

// Configure middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Redis client for pub/sub
let redisClient;
let redisSubscriber;

// Connect to Redis
const connectRedis = async () => {
    try {
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        });

        redisSubscriber = redisClient.duplicate();

        try {
            await redisClient.connect();
            await redisSubscriber.connect();

            console.log('Connected to Redis');

            // Subscribe to document processing channel
            await redisSubscriber.subscribe('document-processing', (message) => {
                try {
                    const event = JSON.parse(message);
                    broadcastEvent(event);
                } catch (err) {
                    console.error('Failed to parse Redis message:', err);
                }
            });

            console.log('Subscribed to document-processing channel');
        } catch (err) {
            console.error('Failed to connect to Redis:', err);
            console.log('Starting WebSocket service without Redis...');
            // Continue without Redis
        }
    } catch (err) {
        console.error('Failed to create Redis client:', err);
        console.log('Starting WebSocket service without Redis...');
        // Continue without Redis
    }
};

// Broadcast event to connected clients
const broadcastEvent = (event) => {
    console.log(`Broadcasting event: type=${event.type}, documentId=${event.documentId}, data:`, event.data);

    // Get number of clients in the document room
    const room = io.sockets.adapter.rooms.get(`document:${event.documentId}`);
    const numClients = room ? room.size : 0;
    console.log(`Room document:${event.documentId} has ${numClients} client(s) subscribed`);

    // Broadcast to all clients subscribed to this document
    io.to(`document:${event.documentId}`).emit(event.type, event.data);

    // For compatibility with raw WebSocket clients, also broadcast with documentId in payload
    io.to(`document:${event.documentId}`).emit('message', {
        type: event.type,
        documentId: event.documentId,
        data: event.data
    });

    // Also broadcast to all clients subscribed to this user
    if (event.userId) {
        console.log(`Broadcasting to user:${event.userId} room`);
        io.to(`user:${event.userId}`).emit(event.type, {
            ...event.data,
            documentId: event.documentId,
        });
    }

    console.log(`Broadcasted ${event.type} event for document ${event.documentId}`);
};

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle document subscription through Socket.IO event
    socket.on('subscribe:document', (documentId) => {
        socket.join(`document:${documentId}`);
        console.log(`Client ${socket.id} subscribed to document ${documentId} via event`);
    });

    // Handle raw WebSocket messages for subscription
    socket.on('message', (data) => {
        try {
            console.log(`Raw message from client ${socket.id}:`, typeof data === 'string' ? data : 'Binary data');

            // Try to parse as JSON if it's a string
            if (typeof data === 'string') {
                const message = JSON.parse(data);

                // Handle subscription message from raw WebSocket client
                if (message.type === 'subscribe:document' && message.documentId) {
                    socket.join(`document:${message.documentId}`);
                    console.log(`Client ${socket.id} subscribed to document ${message.documentId} via raw message`);

                    // Send confirmation back to client
                    socket.emit('subscribed', {
                        documentId: message.documentId,
                        status: 'subscribed'
                    });
                }
            }
        } catch (err) {
            console.error(`Error handling raw message from client ${socket.id}:`, err);
        }
    });

    // Handle user subscription
    socket.on('subscribe:user', (userId) => {
        socket.join(`user:${userId}`);
        console.log(`Client ${socket.id} subscribed to user ${userId}`);
    });

    // Handle unsubscribe
    socket.on('unsubscribe:document', (documentId) => {
        socket.leave(`document:${documentId}`);
        console.log(`Client ${socket.id} unsubscribed from document ${documentId}`);
    });

    socket.on('unsubscribe:user', (userId) => {
        socket.leave(`user:${userId}`);
        console.log(`Client ${socket.id} unsubscribed from user ${userId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// API route to broadcast events
app.post('/broadcast', async (req, res) => {
    try {
        const { type, documentId, data, userId } = req.body;

        if (!type || !documentId || !data) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Missing required fields: type, documentId, data',
                },
            });
        }

        // Validate event type
        if (!Object.values(WebSocketEventType).includes(type)) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: `Invalid event type: ${type}`,
                },
            });
        }

        // Create event object
        const event = {
            type,
            documentId,
            userId,
            data,
        };

        // Try to publish to Redis if available
        if (redisClient && redisClient.isReady) {
            try {
                await redisClient.publish('document-processing', JSON.stringify(event));
                console.log('Published event to Redis:', event);
            } catch (redisErr) {
                console.error('Failed to publish to Redis, using direct broadcast:', redisErr);
                // Fall back to direct broadcast if Redis fails
                // Use the original broadcastEvent since we're still in initialization
                broadcastEvent(event);
            }
        } else {
            // No Redis, broadcast directly
            console.log('Redis not available, broadcasting event directly:', event);
            // Use the original broadcastEvent since we're still in initialization
            broadcastEvent(event);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Failed to broadcast event:', err);
        res.status(500).json({
            error: {
                type: 'SYSTEM_ERROR',
                message: 'Failed to broadcast event',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined,
            },
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const redisConnected = redisClient && redisClient.isReady;
    const socketIOClients = io.engine.clientsCount;
    const rawWSClients = global.rawWebSocketClients ? global.rawWebSocketClients.size : 0;

    res.json({
        status: 'healthy', // Consider service healthy even without Redis
        redis: redisConnected ? 'connected' : 'disconnected',
        service: 'websocket-service',
        connections: {
            socketIO: socketIOClients,
            rawWebSocket: rawWSClients,
            total: socketIOClients + rawWSClients
        }
    });
});

// Test endpoint to send a message to a specific document
app.post('/test/send', (req, res) => {
    try {
        const { documentId, message, status } = req.body;

        if (!documentId) {
            return res.status(400).json({
                error: {
                    type: 'VALIDATION_ERROR',
                    message: 'Missing required field: documentId',
                }
            });
        }

        // Create a test event
        const event = {
            type: 'document:status',
            documentId: documentId,
            data: {
                documentId: documentId,
                status: status || 'processing',
                message: message || 'Test message',
                timestamp: new Date().toISOString()
            }
        };

        // Broadcast directly using original function
        originalBroadcastEvent(event);

        res.json({
            success: true,
            message: `Test message sent to document ${documentId}`,
            event: event
        });
    } catch (err) {
        console.error('Failed to send test message:', err);
        res.status(500).json({
            error: {
                type: 'SYSTEM_ERROR',
                message: 'Failed to send test message',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined,
            }
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: {
            type: 'SYSTEM_ERROR',
            message: 'An unexpected error occurred',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        },
    });
});

// Extend the broadcast function to also send to raw WebSocket clients
const originalBroadcastEvent = broadcastEvent;

// Create a new function that calls the original and adds raw WebSocket support
function enhancedBroadcastEvent(event) {
    // Call the original broadcast function for Socket.IO clients
    originalBroadcastEvent(event);

    // Also broadcast to raw WebSocket clients
    if (global.rawWebSocketClients) {
        console.log(`Broadcasting to ${global.rawWebSocketClients.size} raw WebSocket clients`);

        global.rawWebSocketClients.forEach((client, clientId) => {
            if (client.subscriptions.has(event.documentId)) {
                try {
                    const messageJson = JSON.stringify({
                        type: event.type,
                        documentId: event.documentId,
                        data: event.data
                    });
                    console.log(`Sending to raw client ${clientId}:`, messageJson);
                    client.ws.send(messageJson);
                } catch (error) {
                    console.error(`Error sending to raw WebSocket client ${clientId}:`, error);
                }
            }
        });
    }
}

// Replace the original broadcast function with our enhanced version
// Using module.exports to avoid reassigning the constant
module.exports.broadcastEvent = enhancedBroadcastEvent;

// Use the enhanced broadcast function for raw WebSocket connections
// This will be assigned after module initialization
let enhancedBroadcastFn = null;

// Handle HTTP upgrade for both Socket.IO and raw WebSocket connections
server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;

    // Handle raw WebSocket connections
    if (pathname === '/ws' || pathname === '/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        // Let Socket.IO handle its connections
        socket.destroy();
    }
});

// Start server
const PORT = process.env.PORT || 4007;
const startServer = async () => {
    await connectRedis();

    server.listen(PORT, () => {
        console.log(`WebSocket Service running on port ${PORT}`);
        console.log(`Accepting connections at:`);
        console.log(`  - Socket.IO: ws://localhost:${PORT}`);
        console.log(`  - Raw WebSocket: ws://localhost:${PORT}/ws`);
    });
};

// Start server
startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Export the app, server, io, and our enhanced broadcast function
module.exports = { app, server, io, broadcastEvent: originalBroadcastEvent };
