#!/usr/bin/env python
"""
RAG Database Verification Script
================================
This script directly inspects the Chroma database to verify its contents
and check for any potential issues.

Usage:
    python verify_rag_db.py [--rebuild]

Options:
    --rebuild    Delete and rebuild the database using ingest_docs.py
"""

import os
import sys
import logging
import json
import shutil
import subprocess
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

# Load environment variables
load_dotenv()
openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    logging.error("OPENAI_API_KEY is not set in the environment.")
    sys.exit(1)

# Get directory paths
script_dir = os.path.dirname(os.path.abspath(__file__))
policy_docs_path = os.path.join(script_dir, "policy_docs")
persist_dir = os.path.join(script_dir, "chroma_db")

def count_document_files():
    """Count the number of document files in the policy_docs folder"""
    doc_count = 0
    file_list = []
    
    if not os.path.exists(policy_docs_path):
        logging.warning(f"Policy documents directory not found: {policy_docs_path}")
        return 0, []
        
    for root, _, files in os.walk(policy_docs_path):
        for file in files:
            if file.endswith(('.pdf', '.docx', '.txt')):
                doc_count += 1
                file_list.append(os.path.join(root, file))
                
    return doc_count, file_list

def verify_database():
    """Verify the Chroma database contents"""
    if not os.path.exists(persist_dir):
        logging.error(f"Database directory not found: {persist_dir}")
        return False
        
    try:
        # Initialize embeddings
        embeddings = OpenAIEmbeddings(openai_api_key=openai_key)
        logging.info(f"Initialized embeddings successfully")
        
        # Load the database
        db = Chroma(persist_directory=persist_dir, embedding_function=embeddings)
        logging.info(f"Loaded Chroma database from {persist_dir}")
        
        # Get all documents
        db_data = db.get(include=['metadatas', 'documents'])
        
        if not db_data or 'documents' not in db_data or not db_data['documents']:
            logging.error(f"Database exists but contains no documents")
            return False
            
        # Count documents and analyze metadata
        doc_count = len(db_data['documents'])
        
        # Analyze document sources
        source_counts = {}
        document_sizes = []
        short_chunks = 0
        empty_chunks = 0
        
        for i, meta in enumerate(db_data.get('metadatas', [])):
            # Count by source document
            source = meta.get('source_doc', 'unknown')
            source_counts[source] = source_counts.get(source, 0) + 1
            
            # Get document content length
            if i < len(db_data.get('documents', [])):
                doc_len = len(db_data['documents'][i])
                document_sizes.append(doc_len)
                
                # Check for short/empty chunks
                if doc_len < 50:
                    short_chunks += 1
                if doc_len == 0:
                    empty_chunks += 1
        
        # Calculate document size statistics
        avg_size = sum(document_sizes) / len(document_sizes) if document_sizes else 0
        min_size = min(document_sizes) if document_sizes else 0
        max_size = max(document_sizes) if document_sizes else 0
        
        # Print database statistics
        logging.info(f"Database Statistics:")
        logging.info(f"- Total chunks: {doc_count}")
        logging.info(f"- Chunks per source: {json.dumps(source_counts, indent=2)}")
        logging.info(f"- Average chunk size: {avg_size:.2f} characters")
        logging.info(f"- Min chunk size: {min_size} characters")
        logging.info(f"- Max chunk size: {max_size} characters")
        logging.info(f"- Short chunks (<50 chars): {short_chunks}")
        logging.info(f"- Empty chunks: {empty_chunks}")
        
        # Check for issues
        issues = []
        
        # Issue 1: Empty chunks
        if empty_chunks > 0:
            issues.append(f"Found {empty_chunks} empty chunks")
            
        # Issue 2: Short chunks
        if short_chunks > 0:
            issues.append(f"Found {short_chunks} very short chunks (<50 chars)")
            
        # Issue 3: Source documents without chunks
        doc_count, file_list = count_document_files()
        file_basenames = [os.path.basename(f) for f in file_list]
        
        missing_sources = []
        for filename in file_basenames:
            if filename not in source_counts:
                missing_sources.append(filename)
                
        if missing_sources:
            issues.append(f"Found {len(missing_sources)} source documents with no chunks: {missing_sources}")
            
        # Issue 4: No chunks at all
        if doc_count == 0:
            issues.append("Database contains no chunks")
            
        # Print issues
        if issues:
            logging.warning("Issues found:")
            for issue in issues:
                logging.warning(f"- {issue}")
            return False
        else:
            logging.info("No issues found in the database")
            return True
            
    except Exception as e:
        logging.error(f"Error verifying database: {e}", exc_info=True)
        return False

def rebuild_database():
    """Delete and rebuild the Chroma database"""
    try:
        # Check if the database exists first
        if os.path.exists(persist_dir):
            logging.info(f"Deleting existing database at {persist_dir}")
            
            # Create a backup
            backup_dir = persist_dir + "_backup_" + str(int(time.time()))
            shutil.copytree(persist_dir, backup_dir)
            logging.info(f"Created backup at {backup_dir}")
            
            # Remove the database directory
            shutil.rmtree(persist_dir)
            logging.info(f"Deleted existing database")
            
        # Run the ingestion script
        logging.info(f"Running ingestion script...")
        result = subprocess.run(
            ['python', os.path.join(script_dir, 'ingest_docs.py')],
            check=True, capture_output=True, text=True
        )
        
        logging.info(f"Ingestion output: {result.stdout}")
        if result.stderr:
            logging.warning(f"Ingestion warnings: {result.stderr}")
            
        # Verify the new database
        logging.info(f"Verifying new database...")
        if verify_database():
            logging.info(f"Database rebuild successful")
            return True
        else:
            logging.error(f"Database rebuild completed but verification failed")
            return False
            
    except subprocess.CalledProcessError as e:
        logging.error(f"Error running ingestion script: {e.stderr}")
        return False
    except Exception as e:
        logging.error(f"Error rebuilding database: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    import time
    
    # Check for command line arguments
    if len(sys.argv) > 1 and sys.argv[1] == "--rebuild":
        logging.info("Rebuilding database...")
        rebuild_database()
    else:
        # Just verify the database
        logging.info("Verifying database...")
        verify_database()
