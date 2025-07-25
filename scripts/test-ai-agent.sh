#!/bin/bash

# Test script for AI agent extraction API (direct test without authentication)

# Test file paths
TEST_FILE="A_scanned_death_certificate_for_Brian_Hughes_is_pr.png"

# Direct test of the AI agent API
echo "Testing AI agent directly with original file..."
curl -X POST http://localhost:5100/ai-agent/extract-form-data \
  -H "Content-Type: application/json" \
  -d "{\"files\": [\"$TEST_FILE\"]}" \
  > original_extract_test.json

echo "Direct extraction test with original file complete. Result saved to original_extract_test.json"

# Copy a test file to a new name
echo "Copying test death certificate to test_death_cert.png..."
cp "shared-evidence/$TEST_FILE" "shared-evidence/test_death_cert.png"

# Test the AI agent with the renamed file
echo "Testing AI agent with renamed file..."
curl -X POST http://localhost:5100/ai-agent/extract-form-data \
  -H "Content-Type: application/json" \
  -d '{"files": ["test_death_cert.png"]}' \
  > renamed_extract_test.json

echo "Direct extraction test with renamed file complete. Result saved to renamed_extract_test.json"

# Compare the results
echo "Comparing extraction results..."
echo "Original file extraction contains: $(cat original_extract_test.json | wc -c) bytes"
echo "Renamed file extraction contains: $(cat renamed_extract_test.json | wc -c) bytes"

# Check if both extractions have data
if [ $(cat original_extract_test.json | grep -c "deceasedFirstName") -gt 0 ] && [ $(cat renamed_extract_test.json | grep -c "deceasedFirstName") -gt 0 ]; then
  echo "SUCCESS: Both extractions contain valid data!"
else
  echo "WARNING: One or both extractions might be missing expected data."
fi
