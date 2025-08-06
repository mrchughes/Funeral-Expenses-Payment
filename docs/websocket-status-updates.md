# Real-Time Document Status Updates

This document describes how real-time document status updates work in the FEP application.

## Architecture Overview

The application uses WebSocket connections to provide real-time status updates for document processing:

1. **WebSocket Service**: Running on port 4007, provides real-time updates for document processing status
2. **MERN App Backend**: Subscribes to document updates via the WebSocketClient
3. **MERN App Frontend**: Connects directly to the WebSocket service to display real-time status

## Components

### WebSocket Service

- Located in `document-processing/websocket-service/`
- Handles both Socket.IO and raw WebSocket connections
- Broadcasts document status updates to subscribed clients
- Supports the following event types:
  - `processing_started`: Document processing has started
  - `state_changed`: Document processing state has changed
  - `progress_updated`: Document processing progress has been updated
  - `error_occurred`: An error occurred during document processing
  - `processing_completed`: Document processing has completed

### Frontend WebSocket Connection

The frontend uses a WebSocket factory to manage connections and subscriptions:

- Located in `mern-app/frontend/src/utils/WebSocketFactory.js`
- Provides methods for subscribing to document updates
- Handles reconnections and error recovery
- Used by the EvidenceUpload component to display real-time status

### Backend WebSocket Integration

The backend also subscribes to document updates:

- Located in `mern-app/backend/services/docProcessingIntegration.js`
- Updates the database with document processing status
- Manages document subscriptions

## Testing WebSocket Functionality

To test WebSocket functionality, use the included test script:

```bash
./scripts/test-ws-frontend.sh
```

This script:
1. Checks if the WebSocket service is running
2. Generates a test document ID
3. Sends test status updates via the WebSocket service API
4. Provides instructions for testing in the browser

Additionally, you can use the WebSocketTester component included in the frontend:

1. Navigate to the evidence upload page in the MERN app
2. Use the WebSocket Connection Tester panel
3. Enter the WebSocket URL (`ws://localhost:4007`)
4. Enter a document ID (you can use the one from the test script)
5. Click "Connect" to establish a WebSocket connection
6. Watch the message log for real-time updates

## Troubleshooting

If status updates aren't appearing:

1. Check that the WebSocket service is running (`netstat -an | grep 4007`)
2. Look for WebSocket connection errors in the browser console
3. Verify that the document ID matches between the frontend subscription and backend broadcasts
4. Check the Redis connection status (WebSocket service will fall back to direct broadcasting if Redis is unavailable)
5. Use the WebSocketTester component to debug connection and subscription issues
