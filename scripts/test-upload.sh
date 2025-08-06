#!/bin/bash

# Generate a test token
echo "Generating test token..."
TOKEN_OUTPUT=$(node $(dirname "$0")/generate-test-token.js)

# Extract just the token from the output
TOKEN=$(echo "$TOKEN_OUTPUT" | awk 'NR==2 {print $1}')

if [ -z "$TOKEN" ]; then
    echo "Failed to generate token."
    exit 1
fi

echo "Successfully generated test token."

# Now upload a test file
echo "Uploading test file..."
if [ -z "$1" ]; then
    FILE_TO_UPLOAD="/Users/chrishughes/Projects/FEP_Local/Funeral-Expenses-Payment-temp/shared-evidence/A_scanned_death_certificate_for_Brian_Hughes_is_pr.png"
else
    FILE_TO_UPLOAD="$1"
fi

UPLOAD_RESPONSE=$(curl -s -X POST "http://localhost:5200/api/evidence/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -F "evidence=@$FILE_TO_UPLOAD")

echo "Upload response: $UPLOAD_RESPONSE"

# Now upload another test file if provided
if [ ! -z "$2" ]; then
    echo "Uploading second test file..."
    UPLOAD_RESPONSE2=$(curl -s -X POST "http://localhost:5200/api/evidence/upload" \
        -H "Authorization: Bearer $TOKEN" \
        -F "evidence=@$2")

    echo "Second upload response: $UPLOAD_RESPONSE2"
fi

# Now try to extract form data
echo "Extracting form data..."
EXTRACT_RESPONSE=$(curl -s -X POST "http://localhost:5200/api/ai-agent/extract" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{}")

echo "Extract response: $EXTRACT_RESPONSE"
