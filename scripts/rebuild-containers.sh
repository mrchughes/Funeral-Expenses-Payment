#!/bin/bash
# rebuild-containers.sh - Script to rebuild and restart all Docker containers

# Set script to exit on error
set -e

echo "================================"
echo "Rebuilding Docker Containers"
echo "================================"
echo

# Change to the project root directory
cd "$(dirname "$0")"

echo "Stopping all containers..."
docker-compose down

echo "Removing old Docker images..."
# Remove the images to ensure we get a fresh build
docker rmi fep_local_backend fep_local_frontend fep_local_ai-agent 2>/dev/null || true

echo "Building containers with no cache..."
# Build with no-cache option to ensure all changes are picked up
docker-compose build --no-cache

echo "Starting containers..."
docker-compose up -d

echo "Containers are starting in the background."
echo "Use 'docker-compose logs -f' to follow the logs."

# Print container status
echo "Container status:"
docker-compose ps

echo "================================"
echo "Rebuild completed successfully!"
echo "================================"
