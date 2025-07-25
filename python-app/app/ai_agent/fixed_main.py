#!/usr/bin/env python3

"""
This is a minimal version of the AI agent application with global variable declarations fixed.
"""

from datetime import datetime
from dotenv import load_dotenv
import os
import logging
import sys
import json
import time
import gc
from flask import Flask, request, jsonify, render_template, redirect, url_for
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langgraph.graph import StateGraph, END
from langchain_community.tools.tavily_search import TavilySearchResults
from typing_extensions import TypedDict
from langchain_community.vectorstores import Chroma
from werkzeug.utils import secure_filename
import ocr_utils
import document_processor
import ai_document_processor

# Configure logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.log"))
    ]
)

load_dotenv()
openai_key = os.getenv("OPENAI_API_KEY")
tavily_key = os.getenv("TAVILY_API_KEY")

# Flask app setup
from flask_cors import CORS
TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), 'templates')
app = Flask(__name__, template_folder=TEMPLATE_DIR)
CORS(app, 
     origins=["*"],
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"])

# Global variables
persist_dir = os.path.join(os.path.dirname(__file__), 'chroma_db')
rag_db = None  # Global RAG database variable

def load_rag_database():
    global rag_db
    try:
        if os.path.exists(persist_dir):
            logging.info(f"[INIT] Loading RAG database from {persist_dir}")
            
            # Re-initialize embeddings to ensure they match what was used during ingestion
            local_embeddings = OpenAIEmbeddings(openai_api_key=openai_key)
            rag_db = Chroma(persist_directory=persist_dir, embedding_function=local_embeddings)
            
            # Verify DB has documents
            db_data = rag_db.get()
            if db_data and 'documents' in db_data:
                doc_count = len(db_data['documents'])
                logging.info(f"[INIT] Successfully loaded RAG database with {doc_count} chunks")
            else:
                logging.warning("[INIT] RAG database exists but contains no documents")
            
            return True
        else:
            logging.warning(f"[INIT] No RAG database found at {persist_dir}")
            return False
    except Exception as e:
        logging.error(f"[INIT] Error loading RAG database: {e}", exc_info=True)
        return False

# API routes
@app.route('/ai-agent/docs', methods=['GET'])
def list_docs():
    global rag_db
    try:
        # Get query parameter for force reload
        force_reload = request.args.get('force_reload', 'false').lower() == 'true'
        
        # Directory where policy documents are stored
        docs_dir = os.path.join(os.path.dirname(__file__), 'policy_docs')
        logging.info(f"[DOCS] Listing documents from {docs_dir}")
        
        # Force reload the RAG database if requested
        if force_reload:
            logging.info("[DOCS] Force reloading RAG database")
            load_rag_database()
            logging.info("[DOCS] Successfully reloaded RAG database")
        
        # Initialize response data
        response_data = {
            "status": "success",
            "documents": [],
            "total_chunks": 0,
            "document_chunks": {}
        }
        
        # Get list of all document files
        document_files = []
        if os.path.exists(docs_dir):
            document_files = [f for f in os.listdir(docs_dir) if os.path.isfile(os.path.join(docs_dir, f)) and not f.startswith('.')]
        
        # Get metadata from the database if it exists
        if rag_db is not None:
            db_data = rag_db.get()
            if db_data and 'metadatas' in db_data:
                # Count chunks per document
                doc_chunks = {}
                for metadata in db_data['metadatas']:
                    # Check for both 'source' and 'source_doc' to handle different metadata formats
                    source_file = None
                    if 'source_doc' in metadata:
                        source_file = metadata['source_doc']
                    elif 'source' in metadata:
                        source_file = os.path.basename(metadata['source'])
                    
                    if source_file:
                        if source_file in doc_chunks:
                            doc_chunks[source_file] += 1
                        else:
                            doc_chunks[source_file] = 1
                
                # Add documents to response
                for doc_file in document_files:
                    doc_data = {
                        "name": doc_file,
                        "in_rag": doc_file in doc_chunks,
                        "chunks": doc_chunks.get(doc_file, 0)  # Don't multiply by 2 - it was creating incorrect counts
                    }
                    response_data["documents"].append(doc_data)
                    if doc_file in doc_chunks:
                        response_data["document_chunks"][doc_file] = doc_chunks.get(doc_file, 0)  # Don't multiply by 2
                
                # Set total chunks
                response_data["total_chunks"] = len(db_data['documents'])
                logging.info(f"[DOCS] Found {len(document_files)} documents with {response_data['total_chunks']} total chunks")
                logging.info(f"[DOCS] Per-document breakdown: {response_data['document_chunks']}")
            else:
                # No documents in RAG database
                for doc_file in document_files:
                    doc_data = {
                        "name": doc_file,
                        "in_rag": False,
                        "chunks": 0
                    }
                    response_data["documents"].append(doc_data)
                logging.info(f"[DOCS] Found {len(document_files)} documents but RAG database is empty")
        else:
            # RAG database not loaded
            for doc_file in document_files:
                doc_data = {
                    "name": doc_file,
                    "in_rag": False,
                    "chunks": 0
                }
                response_data["documents"].append(doc_data)
            logging.info(f"[DOCS] Found {len(document_files)} documents but RAG database is not loaded")
        
        return jsonify(response_data)
    except Exception as e:
        logging.error(f"[DOCS] Error listing documents: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/ai-agent/verify-file/<filename>', methods=['GET'])
def verify_file(filename):
    global rag_db
    try:
        # Secure the filename to prevent directory traversal
        filename = secure_filename(filename)
        file_path = os.path.join(os.path.dirname(__file__), 'policy_docs', filename)
        
        logging.info(f"[VERIFY] Checking if file exists: {file_path}")
        
        # Check if file exists
        file_exists = os.path.isfile(file_path)
        file_size = os.path.getsize(file_path) if file_exists else 0
        
        # Check if file is in RAG database
        in_rag = False
        chunk_count = 0
        
        if rag_db is not None and file_exists:
            db_data = rag_db.get()
            if db_data and 'metadatas' in db_data:
                for metadata in db_data['metadatas']:
                    # Check for both 'source' and 'source_doc' to handle different metadata formats
                    if ('source_doc' in metadata and metadata['source_doc'] == filename) or \
                       ('source' in metadata and os.path.basename(metadata['source']) == filename):
                        in_rag = True
                        chunk_count += 1
            
            logging.info(f"[VERIFY] Found {chunk_count} chunks for document {filename} in RAG database")
        
        response_data = {
            "status": "success",
            "filename": filename,
            "exists": file_exists,
            "size": file_size,
            "in_rag": in_rag,
            "chunks": chunk_count
        }
        
        logging.info(f"[VERIFY] File exists: {file_path}, size: {file_size} bytes, in RAG: {in_rag} with {chunk_count} chunks")
        
        return jsonify(response_data)
    except Exception as e:
        logging.error(f"[VERIFY] Error verifying file {filename}: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/')
def index():
    return "AI Agent API is running!"

if __name__ == '__main__':
    # Load RAG database on startup
    load_rag_database()
    
    # Start Flask app
    app.run(host='0.0.0.0', port=5050, debug=True)
