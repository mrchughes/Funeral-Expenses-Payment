#!/bin/bash

# Test script for the AI agent with our improved OCR

# Use an existing token if available
echo "Checking for existing token..."
if [ -f "login.json" ]; then
  TOKEN=$(cat login.json | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
  echo "No token found. Please log in through the UI and run this command:"
  echo "curl -X POST http://localhost:5200/api/users/login -H \"Content-Type: application/json\" -d '{\"email\": \"your-email\", \"password\": \"your-password\"}' > login.json"
  exit 1
fi

echo "Test token: ${TOKEN:0:20}..."

# Test the API endpoint with a specific file
echo "Testing AI extraction API with specific file..."
curl -X POST http://localhost:5200/api/ai-agent/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"fileId":"688bada7d840401f920152e8_A_scanned_death_certificate_for_Brian_Hughes_is_pr.png"}' \
  -o ocr_test_result.json

echo "Extraction test complete. Result saved to ocr_test_result.json"

# Print out first part of the result
echo "Extraction result sample:"
cat ocr_test_result.json | head -30
