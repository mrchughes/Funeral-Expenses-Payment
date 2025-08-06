# Fix Real-Time Document Status Updates

This PR adds WebSocket functionality to the frontend to properly display real-time document processing status updates.

## Changes

1. Created `WebSocketFactory.js` utility to manage WebSocket connections and subscriptions
2. Added WebSocket subscription logic to `EvidenceUpload.js` component
3. Enhanced `FormPage.js` to handle various WebSocket message formats
4. Created a `WebSocketTester.js` component for debugging WebSocket connections
5. Added test script `test-ws-frontend.sh` to simulate document status updates
6. Added documentation in `docs/websocket-status-updates.md`

## Technical Details

### WebSocket Connection Flow

1. When a document is uploaded, we now store its document ID with the evidence data
2. The `WebSocketFactory` creates a WebSocket connection to the service on port 4007
3. We subscribe to updates for specific document IDs
4. Status updates from the WebSocket service are processed and displayed in the UI

### Message Format Handling

The code now handles multiple message formats:
- WebSocketEventType messages from the document processing service
- Legacy status update messages
- Direct state updates

### Testing

The WebSocketTester component and test script allow for easy verification of WebSocket functionality.

## How to Test

1. Run `./scripts/test-ws-frontend.sh` to generate test status updates
2. Open the application and navigate to the evidence upload page
3. Use the WebSocketTester component to connect to the WebSocket service
4. Observe real-time status updates in the UI

## Documentation

Added comprehensive documentation in `docs/websocket-status-updates.md` describing the WebSocket architecture, components, and testing procedures.
