#!/bin/bash

echo "Rebuilding the RAG database..."
cd "$(dirname "$0")"

# Set environment variable to force rebuild
export FORCE_REBUILD=true

# Run the ingest_docs.py script with PYTHONPATH set correctly
export PYTHONPATH=/Users/chrishughes/Projects/FEP_Local/Funeral-Expenses-Payment-temp
python python-app/app/ai_agent/ingest_docs.py

echo "Database rebuild complete."
