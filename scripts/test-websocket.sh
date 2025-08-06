#!/usr/bin/env bash

# Test WebSocket functionality
echo "===== WebSocket Integration Test Script ====="
echo "This script will help test the WebSocket service and document upload functionality"

# Set base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS_DIR="$BASE_DIR/../document-processing/websocket-service"
CLIENT_HTML="$WS_DIR/test-client.html"

# Check if WebSocket service is running
echo "Checking if WebSocket service is running..."
WS_STATUS=$(curl -s http://localhost:4007/health || echo "failed")

if [[ $WS_STATUS == *"failed"* ]]; then
    echo "WebSocket service is NOT running. Starting it now..."
    
    # Navigate to WebSocket service directory
    cd "$WS_DIR" || { echo "Failed to navigate to WebSocket service directory"; exit 1; }
    
    # Start WebSocket service in the background
    echo "Starting WebSocket service..."
    node index.js > ws-service.log 2>&1 &
    WS_PID=$!
    
    # Wait for service to start
    echo "Waiting for WebSocket service to start..."
    sleep 3
    
    # Check if service started successfully
    WS_STATUS=$(curl -s http://localhost:4007/health || echo "failed")
    if [[ $WS_STATUS == *"failed"* ]]; then
        echo "Failed to start WebSocket service. Check ws-service.log for details."
        exit 1
    fi
    
    echo "WebSocket service started successfully with PID $WS_PID"
else
    echo "WebSocket service is already running:"
    echo "$WS_STATUS"
fi

# Open the test client
if [[ -f "$CLIENT_HTML" ]]; then
    echo "Opening WebSocket test client in your browser..."
    if [[ "$(uname)" == "Darwin" ]]; then
        open "$CLIENT_HTML"
    elif [[ "$(uname)" == "Linux" ]]; then
        xdg-open "$CLIENT_HTML" &> /dev/null
    else
        echo "Please open the test client manually at: $CLIENT_HTML"
    fi
else
    echo "WebSocket test client HTML file not found at $CLIENT_HTML"
    exit 1
fi

# Display instructions for testing
cat << EOF

===== WebSocket Testing Instructions =====

1. In the test client (browser):
   - Connect to "ws://localhost:4007"
   - Enter a document ID (e.g., "test-doc-123") and subscribe

2. Test sending messages to the WebSocket:
   curl -X POST http://localhost:4007/test/send \\
     -H "Content-Type: application/json" \\
     -d '{"documentId":"test-doc-123","status":"processing","message":"Processing started"}'

3. To test with a real document upload:
   - Run the upload service (if not already running)
   - Upload a document via the MERN app or the upload API
   - Use the document ID in the WebSocket test client

EOF

echo "Test setup complete!"
