#!/bin/bash

# Test credentials
EMAIL="testfep@example.com"
PASSWORD="testpass123"

# First, login to get the token
echo "Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:5200/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\", \"password\":\"$PASSWORD\"}")

# Extract token from the response
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "Failed to get token. Login response: $LOGIN_RESPONSE"
    exit 1
fi

echo "Successfully logged in. Token obtained."

# Now upload a test file
echo "Uploading test file..."
UPLOAD_RESPONSE=$(curl -s -X POST "http://localhost:5200/api/evidence/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -F "evidence=@/Users/chrishughes/Projects/FEP_Local/cloud-apps-monorepo/shared-evidence/Death_Certificate.docx")

echo "Upload response: $UPLOAD_RESPONSE"

# Now upload another test file
echo "Uploading second test file..."
UPLOAD_RESPONSE2=$(curl -s -X POST "http://localhost:5200/api/evidence/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -F "evidence=@/Users/chrishughes/Projects/FEP_Local/cloud-apps-monorepo/shared-evidence/Funeral_Bill.docx")

echo "Second upload response: $UPLOAD_RESPONSE2"

# Now try to extract form data
echo "Extracting form data..."
EXTRACT_RESPONSE=$(curl -s -X POST "http://localhost:5200/api/ai-agent/extract" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{}")

echo "Extract response: $EXTRACT_RESPONSE"
