#!/bin/bash

# Script to add monitoring dependencies to all services

SERVICES=(
  "document-processing/ocr-service"
  "document-processing/upload-service"
  "document-processing/semantic-mapping-service"
  "document-processing/workflow-service"
  "document-processing/websocket-service"
  "document-processing/db-service"
  "document-processing/frontend-demo"
  "mern-app/backend"
)

for SERVICE in "${SERVICES[@]}"; do
  if [ -f "$SERVICE/package.json" ]; then
    echo "Adding monitoring dependencies to $SERVICE..."
    cd "$SERVICE"
    npm install --save winston prom-client express-winston
    cd - > /dev/null
  else
    echo "Warning: package.json not found in $SERVICE"
  fi
done

echo "Dependencies added to all services"
