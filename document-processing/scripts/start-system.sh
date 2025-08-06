#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print with timestamp
print_message() {
  local color=$1
  local message=$2
  local timestamp=$(date +"%H:%M:%S")
  echo -e "${color}[${timestamp}] ${message}${NC}"
}

# Ensure we're in the correct directory
cd "$(dirname "$0")/.."

print_message "$BLUE" "Document Processing System Startup"
print_message "$BLUE" "==============================="

# Check for .env file
if [ ! -f .env ]; then
  print_message "$YELLOW" "No .env file found. Creating one with default values..."
  echo "# Document Processing Environment Variables" > .env
  echo "OPENAI_API_KEY=" >> .env
  print_message "$YELLOW" "⚠️  Please add your OpenAI API key to the .env file"
fi

# Check for Docker and Docker Compose
if ! command -v docker &> /dev/null; then
  print_message "$RED" "❌ Docker is not installed. Please install Docker first."
  exit 1
fi

if ! docker compose version &> /dev/null; then
  print_message "$RED" "❌ Docker Compose is not installed. Please install Docker Compose first."
  exit 1
fi

# Start the services
print_message "$GREEN" "Starting document processing services..."

# Check if containers are already running
if docker compose ps | grep -q "document-processing"; then
  print_message "$YELLOW" "Some services appear to be running already."
  read -p "Do you want to restart all services? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_message "$YELLOW" "Stopping existing services..."
    docker compose down
  else
    print_message "$GREEN" "Using existing services."
  fi
fi

# Start docker-compose
print_message "$GREEN" "Starting services with Docker Compose..."
docker compose up -d

# Wait for services to be healthy
print_message "$GREEN" "Waiting for services to be healthy..."
sleep 10

# Check if frontend is running
if curl -s http://localhost:8080 > /dev/null; then
  print_message "$GREEN" "✅ Frontend is running: http://localhost:8080"
else
  print_message "$RED" "❌ Frontend does not appear to be running"
fi

# Print service URLs
print_message "$CYAN" "Service Endpoints:"
print_message "$CYAN" "- Frontend Demo: http://localhost:8080"
print_message "$CYAN" "- Upload Service: http://localhost:4001"
print_message "$CYAN" "- OCR Service: http://localhost:4003"
print_message "$CYAN" "- Semantic Mapping Service: http://localhost:4006"
print_message "$CYAN" "- Workflow Service: http://localhost:4009"
print_message "$CYAN" "- MinIO Console: http://localhost:9001 (login: minio / minio123)"
print_message "$CYAN" "- MongoDB: mongodb://localhost:27017"

print_message "$GREEN" "✅ Document Processing System is now running"
print_message "$YELLOW" "Use 'docker compose logs -f' to view logs"
