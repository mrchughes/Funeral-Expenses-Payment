# WebSocket Testing Tools

This package contains tools for testing WebSocket connections for document processing status updates.

## Overview

These tools help diagnose and troubleshoot WebSocket connectivity issues between clients and servers in the document processing system. They provide:

1. A standalone WebSocket test server that can:
   - Accept connections
   - Handle document subscriptions
   - Broadcast document status updates

2. An interactive command-line client that can:
   - Connect to WebSocket servers
   - Subscribe to document updates
   - Simulate document processing sequences

3. A browser-based debugging interface that:
   - Provides real-time connection monitoring
   - Shows message logs
   - Allows sending custom messages

## Getting Started

### Prerequisites

- Node.js v14 or later
- npm 
- Web browser (for the browser debugging interface)

### Installation

1. No installation needed - the tools are ready to use.
2. The script will automatically install the required `ws` package if needed.

### Running the Tools

Use the included shell script to easily start the tools:

```bash
# Make the script executable
chmod +x websocket-test.sh

# Run in interactive mode
./websocket-test.sh

# Start only the server
./websocket-test.sh --mode server

# Start only the client
./websocket-test.sh --mode client

# Open the browser interface
./websocket-test.sh --mode browser

# Use a custom port
./websocket-test.sh --port 4008
```

## Tool Details

### WebSocket Test Server

The test server (`websocket-test-server.js`) implements a simple WebSocket server that:

- Listens for connections on the specified port (default: 4007)
- Handles document subscriptions and broadcasts
- Provides a simple HTTP server to serve the browser debugging interface
- Logs all activity to the console

### Command-Line Client

The interactive client (`websocket-test-client.js`) provides:

- A command-line interface for WebSocket testing
- Commands for subscribing to documents
- Test sequences to simulate the complete document processing flow
- Error simulation

Available commands:
- `subscribe <docId>` - Subscribe to document updates
- `unsubscribe <docId>` - Unsubscribe from document updates
- `test <docId>` - Run a test processing sequence
- `error <docId>` - Simulate an error
- `status` - Show connection status
- `exit` - Exit the client

### Browser Interface

The browser interface (`websocket-debug.html`) offers:

- A user-friendly UI for testing WebSocket connections
- Real-time message logs
- Document subscription management
- Custom message construction and sending
- Automated test sequences

Access it by:
- Starting the server and navigating to http://localhost:4007
- Or using `./websocket-test.sh --mode browser`

## Troubleshooting WebSocket Issues

Common issues and solutions:

1. **Connection Refused**
   - Ensure the server is running on the expected host and port
   - Check for firewall or network restrictions

2. **Subscription Failures**
   - Verify the subscription message format matches what the server expects
   - Check if document IDs are valid and properly formatted

3. **Message Format Issues**
   - Ensure messages are valid JSON
   - Check that required fields (type, documentId, data) are included
   - Verify message structure against API documentation

4. **Missing Updates**
   - Confirm subscriptions are properly established
   - Check if messages are being sent to the correct subscribers
   - Verify the server is correctly broadcasting updates

## Integration with Application Code

To integrate WebSocket status updates in your application:

1. **Client-side connection:**
   ```javascript
   const socket = new WebSocket('ws://your-server:port');
   
   socket.onopen = () => {
     console.log('Connected to WebSocket server');
     // Subscribe to document updates
     socket.send(JSON.stringify({
       type: 'subscribe:document',
       documentId: 'your-document-id'
     }));
   };
   
   socket.onmessage = (event) => {
     const message = JSON.parse(event.data);
     // Handle document status updates
     console.log('Received update:', message);
   };
   ```

2. **Server-side broadcasting:**
   ```javascript
   // Example of sending a status update
   function broadcastDocumentUpdate(documentId, status) {
     // Find all clients subscribed to this document
     const subscribers = getSubscribers(documentId);
     
     const update = {
       type: 'progress_updated',
       documentId: documentId,
       data: status
     };
     
     // Send to all subscribers
     subscribers.forEach(client => {
       if (client.readyState === WebSocket.OPEN) {
         client.send(JSON.stringify(update));
       }
     });
   }
   ```

## Contributing

Feel free to enhance these tools as needed for your specific requirements.

## License

This project is licensed under the MIT License.
