#!/bin/bash

# Login to get token
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5200/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com", "password":"password123"}')

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token. Login response: $LOGIN_RESPONSE"
  exit 1
fi

echo "Successfully logged in, got token"

# Create a test directory
TEST_DIR="/Users/chrishughes/Projects/FEP_Local/cloud-apps-monorepo/test_evidence"
mkdir -p $TEST_DIR

# Upload test file
echo "Uploading test file..."
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:5200/api/evidence/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "evidence=@/Users/chrishughes/Projects/FEP_Local/cloud-apps-monorepo/shared-evidence/A_scanned_invoice_for_Hughes_&_Sons_Funeral_Direct.png")

echo "Upload response: $UPLOAD_RESPONSE"

# Extract data
echo "Extracting data..."
EXTRACT_RESPONSE=$(curl -s -X POST http://localhost:5200/api/ai-agent/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}')

echo "Extraction response: $EXTRACT_RESPONSE"
