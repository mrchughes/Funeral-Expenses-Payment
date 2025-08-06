# WebSocket Connection Debugging Tools

This package provides comprehensive tools for diagnosing and fixing WebSocket connectivity issues in the document processing system.

## Quick Start

1. Run the WebSocket test script:
   ```bash
   ./websocket-test.sh
   ```

2. Choose an option from the menu to start testing.

## Components Created

### 1. WebSocket Test Server (`websocket-test-server.js`)
A standalone WebSocket server that:
- Accepts connections on port 4007 (configurable)
- Handles document subscriptions
- Processes and broadcasts document status updates
- Provides detailed logging of all events

### 2. Command-Line Test Client (`websocket-test-client.js`)
An interactive CLI tool that:
- Connects to WebSocket servers
- Subscribes to document updates
- Simulates document processing sequences
- Provides colored console output for easy debugging

### 3. Browser Debug Interface (`websocket-debug.html`)
A comprehensive web interface that:
- Provides real-time connection monitoring
- Shows detailed message logs
- Allows sending custom messages
- Simulates document processing workflows

### 4. Backend Integration (`documentProcessingServer.js`)
A reusable WebSocket server class for the backend that:
- Integrates with existing Express/HTTP servers
- Manages document subscriptions
- Broadcasts processing updates to clients
- Handles reconnection and error scenarios

### 5. Frontend Integration (`DocumentProcessingStatus.jsx` and `documentProcessingClient.js`)
React components and services that:
- Connect to the WebSocket server
- Display real-time processing status
- Handle connection issues gracefully
- Provide a clean UI for status updates

## Usage Instructions

### Testing WebSocket Connectivity

1. Start the test server:
   ```bash
   node websocket-test-server.js
   ```

2. In a separate terminal, run the test client:
   ```bash
   node websocket-test-client.js
   ```

3. Or open the browser debug interface:
   ```
   http://localhost:4007
   ```

### Integrating with Backend

```javascript
const DocumentProcessingServer = require('./services/documentProcessingServer');
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wsServer = new DocumentProcessingServer({
  httpServer: server,
  debug: true
});

// Start the server
wsServer.start();

// Send updates from your processing logic
function processDocument(documentId) {
  // Start processing
  wsServer.startDocumentProcessing(documentId);
  
  // Update progress
  wsServer.updateDocumentProgress(documentId, 'extracting', 50, 'Extracting data fields');
  
  // Complete processing
  wsServer.completeDocumentProcessing(documentId, { results: 'Processing complete' });
}

// Start HTTP server
server.listen(3000, () => {
  console.log('Server started on port 3000');
});
```

### Integrating with Frontend

```jsx
import React from 'react';
import DocumentProcessingStatus from './components/DocumentProcessingStatus';

function App() {
  const documentId = 'your-document-id';
  
  return (
    <div className="app">
      <h1>Document Processing</h1>
      <DocumentProcessingStatus documentId={documentId} />
    </div>
  );
}

export default App;
```

## Troubleshooting Guide

### Common Issues

1. **Connection Refused**
   - Ensure the server is running on the expected port
   - Check for firewall restrictions
   - Verify the correct WebSocket URL (ws:// or wss://)

2. **Messages Not Being Received**
   - Verify subscription has been correctly established
   - Check message format and structure
   - Ensure WebSocket connection is in the OPEN state

3. **Connection Dropping**
   - Implement reconnection logic (included in our client)
   - Check for network stability issues
   - Verify server is handling connections properly

4. **Security Issues**
   - When using HTTPS, ensure WebSocket uses WSS (secure WebSocket)
   - Check CORS configuration on the server

### Testing Checklist

- [ ] Connection establishes successfully
- [ ] Subscription to document updates works
- [ ] Real-time updates are received
- [ ] Client handles disconnection gracefully
- [ ] Server correctly broadcasts to all subscribers
- [ ] Error states are properly communicated

## Next Steps

1. Integrate the WebSocket server with your main application
2. Add authentication to the WebSocket connections
3. Implement reconnection and retry logic in production clients
4. Add monitoring and logging for WebSocket connections
