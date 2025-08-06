// Simple WebSocket test script for the document processing server
const WebSocket = require('ws');

// Use the configured WebSocket URL from our runtime config
const url = 'ws://localhost:3000/ws/documents';
console.log(`Attempting to connect to: ${url}`);

const ws = new WebSocket(url);

ws.on('open', function open() {
    console.log('Connected to WebSocket server');

    // Send a subscribe message with the correct format
    const subscribeMsg = {
        type: 'subscribe',
        documentId: 'test-document-id'
    };

    console.log(`Sending subscription message:`, subscribeMsg);
    ws.send(JSON.stringify(subscribeMsg));

    // Send a ping message to test basic connectivity
    setTimeout(() => {
        console.log('Sending ping message');
        ws.send(JSON.stringify({ type: 'ping' }));
    }, 1000);
});

ws.on('message', function incoming(data) {
    console.log(`Received: ${data}`);
    const message = JSON.parse(data);

    // After receiving a pong, test unsubscribe
    if (message.type === 'pong') {
        setTimeout(() => {
            console.log('Sending unsubscribe message');
            ws.send(JSON.stringify({
                type: 'unsubscribe',
                documentId: 'test-document-id'
            }));

            // Close after another second
            setTimeout(() => {
                console.log('Closing connection...');
                ws.close();
            }, 1000);
        }, 1000);
    }
});

ws.on('error', function error(err) {
    console.error('WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('Connection closed');
});
