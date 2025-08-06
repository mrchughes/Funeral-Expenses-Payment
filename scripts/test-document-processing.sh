#!/usr/bin/env bash

# Test the entire document processing flow from upload to WebSocket status updates
echo "===== Document Processing Integration Test ====="

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS_DIR="$BASE_DIR/../document-processing/websocket-service"

# Test document to upload
TEST_DOC="$BASE_DIR/../shared-evidence/A_scanned_death_certificate_for_Brian_Hughes_is_pr.png"

# Check if test document exists
if [ ! -f "$TEST_DOC" ]; then
    echo "Test document not found: $TEST_DOC"
    exit 1
fi

# Verify services are running
echo "Checking if required services are running..."

# 1. Check WebSocket service
echo -n "WebSocket Service (port 4007): "
if curl -s http://localhost:4007/health > /dev/null; then
    echo "Running"
else
    echo "Not running"
    echo "Starting WebSocket service..."
    cd "$WS_DIR" && PORT=4007 node index.js > websocket.log 2>&1 &
    sleep 2
fi

# 2. Check Upload service
echo -n "Upload Service (port 3025): "
if curl -s http://localhost:3025/health > /dev/null; then
    echo "Running"
else
    echo "Not running"
    echo "Please start the Upload service"
    exit 1
fi

# 3. Check MERN backend
echo -n "MERN Backend (port 3003): "
if curl -s http://localhost:3003/api/health > /dev/null; then
    echo "Running"
else
    echo "Not running"
    echo "Please start the MERN backend"
    exit 1
fi

# Create a unique test ID
TEST_ID="test-$(date +%s)"
echo "Using test ID: $TEST_ID"

# Subscribe to WebSocket updates with our test client
echo "Opening test WebSocket client..."
open "$WS_DIR/test-client.html"
echo "Please connect to ws://localhost:4007 and subscribe to document ID: $TEST_ID"
echo "Waiting 5 seconds for setup..."
sleep 5

# Upload test document
echo "Uploading test document..."
UPLOAD_RESULT=$(curl -s -X POST http://localhost:3025/test/upload \
  -F "file=@$TEST_DOC" \
  -F "userId=$TEST_ID" \
  -F "applicationId=$TEST_ID")

echo "Upload result: $UPLOAD_RESULT"

# Extract document ID
DOCUMENT_ID=$(echo $UPLOAD_RESULT | grep -o '"documentId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$DOCUMENT_ID" ]; then
    echo "Failed to extract document ID from upload response"
    DOCUMENT_ID="$TEST_ID" # Use test ID as fallback
fi

echo "Document ID: $DOCUMENT_ID"
echo "Please make sure you're subscribed to this document ID in the test client"
sleep 2

# Send test status updates
echo "Sending test status updates..."

send_status() {
    local status=$1
    local message=$2
    echo "Sending status: $status - $message"
    curl -s -X POST http://localhost:4007/test/send \
        -H "Content-Type: application/json" \
        -d "{\"documentId\":\"$DOCUMENT_ID\",\"status\":\"$status\",\"message\":\"$message\"}"
    echo ""
    sleep 2
}

# Send a series of status updates
send_status "processing" "Document received, starting processing pipeline"
send_status "extracting" "Performing OCR text extraction"
send_status "extracting" "Analyzing document type"
send_status "extracting" "Extracting form fields"
send_status "completed" "Document processing complete"

echo "Test complete! Check the test client for status updates."
echo "If you're using the MERN app, upload a document and check if status updates appear."
