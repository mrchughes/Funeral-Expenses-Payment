#!/bin/bash

# Test script for AI agent extraction API

# First, register a test user
echo "Registering test user..."
curl -X POST http://localhost:5200/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }' \
  -o credentials.json

echo "Registration successful. Credentials saved to credentials.json"

# Extract token from response
TOKEN=$(cat credentials.json | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  # Use login if registration didn't return a token
  echo "Logging in with test user..."
  curl -X POST http://localhost:5200/api/users/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "password123"
    }' \
    -o login.json
  
  TOKEN=$(cat login.json | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi

echo "Test token: ${TOKEN:0:20}..."

# Test the API endpoint
echo "Testing AI extraction API..."
curl -X POST http://localhost:5200/api/ai-agent/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' \
  -o frontend_api_test.json

echo "Frontend API test complete. Result saved to frontend_api_test.json"

# Test with file upload
echo "Testing file upload..."
curl -X POST http://localhost:5200/api/evidence/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@shared-evidence/A_scanned_death_certificate_for_Brian_Hughes_is_pr.png" \
  -o upload_result.json

echo "File uploaded successfully"

# Test extraction again with file in system
echo "Testing extraction with uploaded file..."
curl -X POST http://localhost:5200/api/ai-agent/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' \
  -o frontend_api_test_with_file.json

echo "Frontend API test with file complete. Result saved to frontend_api_test_with_file.json"

# Direct test of the AI agent API
echo "Testing AI agent directly..."
curl -X POST http://localhost:5100/ai-agent/extract-form-data \
  -H "Content-Type: application/json" \
  -d '{"files": ["A_scanned_death_certificate_for_Brian_Hughes_is_pr.png"]}' \
  > direct_extract_test.json

echo "Direct extraction test with specific filename complete. Result saved to direct_extract_test.json"
