#!/bin/bash

# Test script for UI changes to the evidence upload section
# This script runs the test-evidence-ui.js Puppeteer script

# Set up environment
export NODE_ENV=development
export APP_URL=http://localhost:3000 # This port is correct based on the docker ps output

# Install required dependencies if they don't exist
echo "Checking dependencies..."
if ! npm list puppeteer 2>/dev/null | grep -q puppeteer; then
  echo "Installing puppeteer..."
  npm install --no-save puppeteer
fi

# Check if the frontend is running
echo "Checking if the frontend application is running..."
if ! curl -s http://localhost:3000 > /dev/null; then
  echo "Frontend doesn't appear to be running at http://localhost:3000."
  echo "Please start the application with ./scripts/startup.sh first."
  exit 1
fi

echo "Running UI test script..."
node scripts/test-evidence-ui.js

echo "Test completed!"
echo "Check the console output for test results and evidence-page-screenshot.png for a visual snapshot."
