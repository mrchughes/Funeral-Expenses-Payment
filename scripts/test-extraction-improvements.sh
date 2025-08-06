#!/bin/bash

# Test script for data extraction improvements
# This script runs the test-data-extraction.js Node.js script

# Set up environment
export NODE_ENV=development
export API_URL=http://localhost:5100

# Install required dependencies if they don't exist
echo "Checking dependencies..."
if ! npm list axios 2>/dev/null | grep -q axios; then
  echo "Installing axios..."
  npm install --no-save axios
fi

if ! npm list form-data 2>/dev/null | grep -q form-data; then
  echo "Installing form-data..."
  npm install --no-save form-data
fi

# Check if containers are running
echo "Checking if Docker containers are running..."
if ! docker ps | grep -q "funeral-expenses"; then
  echo "Docker containers don't appear to be running."
  echo "Please start the application with ./scripts/startup.sh first."
  exit 1
fi

# Select test image
TEST_IMAGE="A_scanned_death_certificate_for_Brian_Hughes_is_pr.png"
if [ -n "$1" ]; then
  TEST_IMAGE="$1"
fi

echo "Using test image: $TEST_IMAGE"
echo "Running test script..."
node scripts/test-data-extraction.js "$TEST_IMAGE"

echo "Test completed!"
echo "Check extraction_with_context.json and extraction_without_context.json in the scripts directory for results."
