#!/bin/bash

# Script to redeploy the AI agent container with the updated code
echo "Rebuilding and redeploying AI agent container..."

# Make sure we're in the right directory
cd "$(dirname "$0")/.."

# Rebuild the container
echo "Rebuilding the container..."
docker-compose build ai-agent

# Restart the container
echo "Restarting the container..."
docker-compose up -d ai-agent

# Follow the logs to see any errors during startup
echo "Following container logs for 5 seconds..."
docker-compose logs -f ai-agent --tail=50 &
LOG_PID=$!
sleep 5
kill $LOG_PID

echo "Container has been redeployed."
echo "To test, use: curl http://localhost:5100/ai-agent/test-evidence"
