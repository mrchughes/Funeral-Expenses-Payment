#!/bin/bash

# Script to start the AI agent with proper environment
cd "$(dirname "$0")"
cd ..

# Extract the OpenAI API key from .env file if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Loaded environment from .env file"
  echo "OPENAI_API_KEY present: $(if [ -n "$OPENAI_API_KEY" ]; then echo "Yes"; else echo "No"; fi)"
fi

# Create virtual environment if it doesn't exist
if [ ! -d "python-app/app/venv" ]; then
  echo "Creating virtual environment..."
  cd python-app/app
  python3 -m venv venv
  source venv/bin/activate
  pip install python-dotenv flask langchain_openai langchain_community langgraph flask_cors werkzeug pytesseract pdf2image pypdf docx2txt typing_extensions
  cd ../..
else
  echo "Virtual environment exists"
fi

# Start the AI agent
echo "Starting AI agent..."
cd python-app/app
source venv/bin/activate
PYTHONPATH=.. python3 ai_agent/main.py
