#!/bin/bash
# Script to test WebSocket functionality in the MERN app

echo "=== Testing Document Processing WebSocket Integration ==="

# Base directory
BASE_DIR=$(dirname "$0")
SHARED_DIR="$BASE_DIR/../shared-evidence"
WS_DIR="$BASE_DIR/../document-processing/websocket-service"

# Check if WebSocket service is running
echo -n "WebSocket Service (port 4007): "
if nc -z localhost 4007 &>/dev/null; then
    echo "RUNNING"
else
    echo "NOT RUNNING - Starting WebSocket service..."
    cd "$WS_DIR" && PORT=4007 node index.js > websocket.log 2>&1 &
    WS_PID=$!
    sleep 2
    echo "WebSocket service started with PID $WS_PID"
fi

# Generate unique document ID and create test data
DOC_ID="test-doc-$(date +%s)"
echo "Using document ID: $DOC_ID"

# Simulate WebSocket messages using curl
echo "Sending test status updates via WebSocket service API endpoint..."

# Send processing started message
echo -n "Sending 'processing_started' status: "
curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"documentId\":\"$DOC_ID\",\"type\":\"processing_started\",\"data\":{\"state\":\"ocr_processing\",\"progress\":10,\"step\":\"Starting OCR\"}}" \
    http://localhost:4007/broadcast
echo "DONE"

sleep 2

# Send progress updated message
echo -n "Sending 'progress_updated' status: "
curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"documentId\":\"$DOC_ID\",\"type\":\"progress_updated\",\"data\":{\"state\":\"extracting\",\"progress\":50,\"step\":\"Analyzing Document\"}}" \
    http://localhost:4007/broadcast
echo "DONE"

sleep 2

# Send processing completed message
echo -n "Sending 'processing_completed' status: "
curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"documentId\":\"$DOC_ID\",\"type\":\"processing_completed\",\"data\":{\"state\":\"completed\",\"progress\":100,\"step\":\"Complete\"}}" \
    http://localhost:4007/broadcast
echo "DONE"

echo
echo "=== INSTRUCTIONS ==="
echo "1. Open the MERN app in your browser"
echo "2. Go to the evidence upload page"
echo "3. Use the WebSocket tester component with the following settings:"
echo "   - WebSocket URL: ws://localhost:4007"
echo "   - Document ID: $DOC_ID"
echo "4. Connect and watch for the status updates"
echo "5. Check browser console logs for WebSocket messages"
echo
echo "Test document ID: $DOC_ID"
echo "===================="
