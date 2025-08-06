#!/bin/bash

# Script to start the ELK monitoring stack for the Funeral Expenses Payment system
echo "Starting ELK monitoring stack for Funeral Expenses Payment..."

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not installed or not in PATH"
    exit 1
fi

# Set environment variables for Grafana admin (can be overridden)
export ADMIN_USER=${ADMIN_USER:-admin}
export ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}

# Set file permissions for mounted volumes
echo "Setting file permissions for mounted volumes..."
mkdir -p monitoring/filebeat monitoring/prometheus monitoring/grafana/provisioning
chmod -R 755 monitoring

# Start the monitoring stack
echo "Starting monitoring stack with docker-compose..."
docker-compose -f docker-compose.monitoring.yml up -d

# Check if services started correctly
if [ $? -ne 0 ]; then
    echo "Error: Failed to start monitoring stack"
    exit 1
fi

echo "Waiting for services to initialize..."
sleep 10

# Check if Elasticsearch is running
echo "Checking Elasticsearch status..."
if ! curl -s http://localhost:9200 > /dev/null; then
    echo "Warning: Elasticsearch may not be running properly"
else
    echo "Elasticsearch is running"
fi

# Check if Kibana is available
echo "Checking Kibana status..."
if ! curl -s http://localhost:5601/api/status > /dev/null; then
    echo "Warning: Kibana may not be running properly. It may take a minute to initialize."
else
    echo "Kibana is running"
fi

echo ""
echo "======================================================================="
echo "Monitoring stack started successfully!"
echo ""
echo "Access the services at:"
echo "  - Kibana:     http://localhost:5601"
echo "  - Grafana:    http://localhost:3030 (admin:${ADMIN_PASSWORD})"
echo "  - Prometheus: http://localhost:9090"
echo ""
echo "To view logs in Kibana:"
echo "  1. Go to http://localhost:5601"
echo "  2. Go to Management > Stack Management > Index Patterns"
echo "  3. Create index pattern 'funeral-expenses-payment-*'"
echo "  4. Go to Discover to view logs"
echo ""
echo "To stop the monitoring stack:"
echo "  docker-compose -f docker-compose.monitoring.yml down"
echo "======================================================================="
