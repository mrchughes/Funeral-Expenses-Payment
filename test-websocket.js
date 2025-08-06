// Simple WebSocket test script
const WebSocket = require('ws');

// Use the configured WebSocket URL from our runtime config
const url = 'ws://localhost:3000/ws/documents';
console.log(`Attempting to connect to: ${url}`);

const ws = new WebSocket(url);

ws.on('open', function open() {
    console.log('Connected to WebSocket server');
    ws.send(JSON.stringify({ type: 'ping', message: 'Hello Server' }));
});

ws.on('message', function incoming(data) {
    console.log(`Received: ${data}`);
    // Close the connection after receiving a message
    setTimeout(() => {
        console.log('Closing connection...');
        ws.close();
    }, 1000);
});

ws.on('error', function error(err) {
    console.error('WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('Connection closed');
});
