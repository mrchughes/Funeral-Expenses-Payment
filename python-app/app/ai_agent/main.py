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
from typing import Optional, List
from langchain_community.vectorstores import Chroma
from werkzeug.utils import secure_filename
import ocr_utils
import document_processor
import ai_document_processor
from date_normalizer import DateNormalizer
from document_classifier import DocumentClassifier

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
if not openai_key:
    # Try loading from parent directory .env file
    parent_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), '.env')
    if os.path.exists(parent_env_path):
        with open(parent_env_path, 'r') as f:
            for line in f:
                if line.startswith('OPENAI_API_KEY='):
                    openai_key = line.strip().split('=', 1)[1].strip()
                    if openai_key.startswith('"') and openai_key.endswith('"'):
                        openai_key = openai_key[1:-1]
                    logging.info(f"[INIT] Loaded OpenAI API key from parent .env file")
                    break

if not openai_key:
    logging.error("[INIT] No OpenAI API key found in environment or .env files")
else:
    logging.info("[INIT] OpenAI API key loaded successfully")

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

# Load RAG database on module initialization
load_rag_database()

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
        
        # Add rag_status for frontend compatibility
        response_data["rag_status"] = {
            "initialized": rag_db is not None,
            "total_chunk_count": response_data["total_chunks"]
        }
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

@app.route('/ai-agent/upload', methods=['POST'])
def upload_document():
    global rag_db
    try:
        # Check if the post has the file part
        if 'document' not in request.files:
            logging.error("[UPLOAD] No file part in the request")
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        file = request.files['document']
        
        # Check if file is selected
        if file.filename == '':
            logging.error("[UPLOAD] No file selected")
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        # Validate file type
        filename = secure_filename(file.filename)
        if not filename.lower().endswith(('.pdf', '.docx', '.txt')):
            logging.error(f"[UPLOAD] Invalid file type: {filename}")
            return jsonify({
                'success': False,
                'error': 'Only PDF, DOCX, and TXT files are supported'
            }), 400
        
        # Save file to policy_docs directory
        policy_docs_path = os.path.join(os.path.dirname(__file__), 'policy_docs')
        os.makedirs(policy_docs_path, exist_ok=True)
        
        file_path = os.path.join(policy_docs_path, filename)
        file.save(file_path)
        
        # Set permissive permissions on the file
        try:
            os.chmod(file_path, 0o666)
        except Exception as e:
            logging.warning(f"[UPLOAD] Could not set permissions on file {file_path}: {e}")
        
        logging.info(f"[UPLOAD] Successfully saved file to {file_path}")
        
        # Process the document and add it to the RAG database
        try:
            import subprocess
            import sys
            python_executable = sys.executable
            ingest_script = os.path.join(os.path.dirname(__file__), 'ingest_docs.py')
            logging.info(f"[UPLOAD] Running ingestion script: {python_executable} {ingest_script}")
            process = subprocess.Popen(
                [python_executable, ingest_script],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate(timeout=300)
            if process.returncode != 0:
                logging.error(f"[UPLOAD] Ingestion script failed: {stderr}")
                return jsonify({
                    'success': False,
                    'error': f'Error processing document: {stderr.strip()}',
                    'filename': filename
                }), 500
            logging.info(f"[UPLOAD] Ingestion script output: {stdout}")
            # Reload the RAG database
            load_rag_database()
            # Health check: try a simple DB query
            try:
                if rag_db is None:
                    raise Exception("RAG DB not loaded after ingestion.")
                db_data = rag_db.get()
                if not db_data or 'documents' not in db_data or len(db_data['documents']) == 0:
                    raise Exception("RAG DB appears empty or corrupted after ingestion.")
            except Exception as health_err:
                logging.error(f"[UPLOAD] RAG DB health check failed: {health_err}")
                # Attempt to rebuild DB from all documents
                try:
                    logging.info("[UPLOAD] Attempting to rebuild RAG DB from all documents...")
                    process2 = subprocess.Popen(
                        [python_executable, ingest_script],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True
                    )
                    stdout2, stderr2 = process2.communicate(timeout=300)
                    load_rag_database()
                    db_data2 = rag_db.get() if rag_db else None
                    if not db_data2 or 'documents' not in db_data2 or len(db_data2['documents']) == 0:
                        raise Exception(f"RAG DB still corrupted after rebuild. Details: {stderr2}")
                except Exception as rebuild_err:
                    logging.error(f"[UPLOAD] RAG DB rebuild failed: {rebuild_err}")
                    return jsonify({
                        'success': False,
                        'error': f'RAG DB corrupted and could not be rebuilt: {rebuild_err}',
                        'filename': filename
                    }), 500
            # Generate a doc_id - in this case just use the filename as the ID
            doc_id = filename
            
            return jsonify({
                'success': True,
                'message': 'Document uploaded and processed successfully',
                'filename': filename,
                'doc_id': doc_id
            })
        except Exception as e:
            logging.error(f"[UPLOAD] Error processing document: {e}", exc_info=True)
            return jsonify({
                'success': False,
                'error': f'Error processing document: {str(e)}',
                'filename': filename
            }), 500
    except Exception as e:
        logging.error(f"[UPLOAD] Unexpected error during upload: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }), 500

@app.route('/ai-agent/docs/<filename>', methods=['DELETE'])
def remove_doc(filename):
    global rag_db
    try:
        # Log the raw filename for debugging
        logging.info(f"[REMOVE] Raw document ID received: {filename}")
        
        # Secure the filename to prevent directory traversal
        filename = secure_filename(filename)
        logging.info(f"[REMOVE] Secured filename: {filename}")
        
        file_path = os.path.join(os.path.dirname(__file__), 'policy_docs', filename)
        
        logging.info(f"[REMOVE] Request to remove document: {filename}")
        logging.info(f"[REMOVE] Full file path: {file_path}")
        
        # Check if the file exists
        if not os.path.isfile(file_path):
            logging.error(f"[REMOVE] File not found: {file_path}")
            # Try to list files in the directory to debug
            try:
                doc_dir = os.path.join(os.path.dirname(__file__), 'policy_docs')
                files_in_dir = os.listdir(doc_dir)
                logging.info(f"[REMOVE] Files in directory: {files_in_dir}")
            except Exception as list_err:
                logging.error(f"[REMOVE] Could not list directory contents: {list_err}")
                
            return jsonify({
                "success": False,
                "error": f"Document '{filename}' not found"
            }), 404
        
        # Don't try to decode JSON body for DELETE request if there's no content
        data = {}
        if request.data and request.is_json:
            try:
                data = request.get_json()
            except Exception as json_err:
                logging.warning(f"[REMOVE] Failed to parse JSON body: {json_err}. Proceeding with empty data.")
                data = {}
        reIngest = data.get('reIngest', False) if data else False
        
        # Remove document from RAG database if it exists
        db_error = None
        if rag_db is not None:
            logging.info(f"[REMOVE] Removing document {filename} from RAG database")
            try:
                db_data = rag_db.get()
                if db_data and 'metadatas' in db_data:
                    ids_to_remove = []
                    for i, metadata in enumerate(db_data['metadatas']):
                        if ('source_doc' in metadata and metadata['source_doc'] == filename) or \
                           ('source' in metadata and os.path.basename(metadata['source']) == filename):
                            if 'ids' in db_data and i < len(db_data['ids']):
                                ids_to_remove.append(db_data['ids'][i])
                    if ids_to_remove:
                        logging.info(f"[REMOVE] Found {len(ids_to_remove)} chunks to remove for document {filename}")
                        try:
                            rag_db.delete(ids=ids_to_remove)
                            logging.info(f"[REMOVE] Successfully removed {len(ids_to_remove)} chunks for document {filename}")
                        except Exception as delete_err:
                            db_error = f"Error deleting chunks from RAG DB: {delete_err}"
                            logging.error(f"[REMOVE] {db_error}", exc_info=True)
                    else:
                        logging.warning(f"[REMOVE] No chunks found for document {filename} in RAG database")
                else:
                    logging.warning(f"[REMOVE] RAG database does not contain metadata or documents")
            except Exception as e:
                db_error = f"Error removing document from RAG database: {str(e)}"
                logging.error(f"[REMOVE] {db_error}", exc_info=True)
        else:
            logging.warning(f"[REMOVE] RAG database not loaded, cannot remove chunks")
        
        # Handle physical file deletion or re-ingestion
        if reIngest:
            logging.info(f"[REMOVE] Re-ingestion requested for {filename}")
            # We don't delete the file for re-ingestion, just remove from RAG database
            msg = f"Document '{filename}' removed from RAG database for re-ingestion."
            if db_error:
                msg += f" Warning: {db_error}"
            return jsonify({
                "success": True,
                "message": msg
            })
        else:
            # Delete the file from the filesystem
            file_error = None
            try:
                # Check if file exists before trying to delete
                if os.path.isfile(file_path):
                    os.remove(file_path)
                    logging.info(f"[REMOVE] Successfully deleted file: {file_path}")
                else:
                    # Try to find file by ID in case filename was passed as an ID
                    found = False
                    policy_docs_path = os.path.join(os.path.dirname(__file__), 'policy_docs')
                    if os.path.exists(policy_docs_path):
                        for doc_file in os.listdir(policy_docs_path):
                            if doc_file == filename or secure_filename(doc_file) == filename:
                                doc_path = os.path.join(policy_docs_path, doc_file)
                                if os.path.isfile(doc_path):
                                    os.remove(doc_path)
                                    logging.info(f"[REMOVE] Found and deleted by alternative name: {doc_path}")
                                    found = True
                                    break
                    if not found:
                        file_error = f"File not found: {file_path}"
                        logging.error(f"[REMOVE] {file_error}")
            except Exception as e:
                file_error = f"Error deleting file: {str(e)}"
                logging.error(f"[REMOVE] {file_error}", exc_info=True)
            
            # Always reload the RAG database after delete attempt
            load_rag_database()
            
            msg = f"Document '{filename}' successfully removed."
            if db_error:
                msg += f" Warning: {db_error}"
            if file_error:
                return jsonify({
                    "success": False,
                    "error": file_error + (f"; {db_error}" if db_error else "")
                }), 500
            return jsonify({
                "success": True,
                "message": msg
            })
    except Exception as e:
        logging.error(f"[REMOVE] Unexpected error removing document {filename}: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Unexpected error: {str(e)}"
        }), 500

# Alternative delete endpoint that accepts POST requests for compatibility
@app.route('/delete_document', methods=['POST'])
def delete_document_post():
    try:
        # Try to get data from JSON payload
        try:
            if request.is_json:
                data = request.get_json()
            elif request.form:
                # Handle form data
                data = dict(request.form)
            else:
                data = {}
        except Exception:
            data = {}
            
        # Check if filename is in request data
        if data and 'filename' in data:
            filename = data['filename']
        elif request.args and 'filename' in request.args:
            filename = request.args.get('filename')
        else:
            return jsonify({
                "success": False,
                "error": "Missing filename parameter"
            }), 400
            
        logging.info(f"[REMOVE-POST] Redirecting delete request for: {filename}")
        
        # Call the DELETE endpoint handler
        return remove_doc(filename)
    except Exception as e:
        logging.error(f"[REMOVE-POST] Error in delete_document_post: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Error processing delete request: {str(e)}"
        }), 500
        
# Additional route for document deletion that accepts any HTTP method
@app.route('/ai-agent/delete-doc', methods=['GET', 'POST', 'DELETE'])
def delete_doc_flexible():
    try:
        # Try different ways to get the filename
        if request.is_json:
            data = request.get_json()
            filename = data.get('filename')
        elif request.args and 'filename' in request.args:
            filename = request.args.get('filename')
        elif request.form and 'filename' in request.form:
            filename = request.form.get('filename')
        else:
            return jsonify({
                "success": False,
                "error": "Missing filename parameter. Please provide 'filename' in query string, form data, or JSON body."
            }), 400
            
        logging.info(f"[REMOVE-FLEX] Received delete request for: {filename}")
        
        # Call the main delete function
        return remove_doc(filename)
    except Exception as e:
        logging.error(f"[REMOVE-FLEX] Error in delete_doc_flexible: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Error processing delete request: {str(e)}"
        }), 500

# Determine if a query should be answered directly by LLM without RAG
def should_use_direct_response(query):
    """
    Analyze a query to determine if it should be answered directly.
    Returns True for general knowledge questions, math, etc.
    Returns False for policy or domain-specific questions.
    
    For Funeral Expenses Payment system, most queries should use RAG by default.
    Only clearly non-policy related questions should use direct LLM.
    """
    # List of keywords that suggest policy-related questions - ALWAYS use RAG for these
    # Expanded list with more variations and specificity
    policy_keywords = [
        # DWP specific terms
        "dwp", "department", "pension", "benefit", "allowance", "payment", 
        "claim", "eligibility", "application", "policy", "funeral", "expense",
        "support", "government", "entitlement", "welfare", "requirements",
        "form", "application", "apply", "bereavement", "fep", "sf200",
        
        # Funeral payment specific terms
        "funeral expenses", "funeral expenses payment", "funeral payment",
        "funeral director", "burial", "cremation", "deceased", "death certificate",
        
        # Common question patterns about FEP
        "how do i", "how to", "when can", "who is eligible", "qualifying", 
        "qualify", "how much", "what documents", "do i need", "what evidence",
        "how long", "what benefit"
    ]
    
    # Normalize query - convert to lowercase for case-insensitive comparison
    query_lower = query.lower()
    
    # First check for policy-related keywords - if any match, always use RAG
    # Be more specific in logging to debug which terms are matching
    for keyword in policy_keywords:
        if keyword in query_lower:
            logging.info(f"[CHAT] Policy keyword '{keyword}' detected in '{query_lower}', will use RAG")
            return False  # Return False to prevent direct LLM and favor RAG
    
    # Special case for clearly non-policy questions like math, science, etc.
    non_policy_patterns = [
        r'^\d+[\+\-\*\/]\d+',  # Math expressions
        r'what is \d+[\+\-\*\/]\d+',  # Math questions
        r'who (is|was) [^(funeral|death|bereavement|dwp)]',  # Who is/was questions not about funeral/death
        r'(what|when) (year|day|date) is',  # Date/time questions
        r'how (many|much) is',  # Quantity questions
        r'define [^(funeral|death|bereavement|dwp)]'  # Definition questions not about funeral/death
    ]
    
    # Check if query matches any non-policy patterns
    import re
    for pattern in non_policy_patterns:
        if re.search(pattern, query_lower):
            logging.info(f"[CHAT] Non-policy pattern matched, will use direct LLM")
            return True
    
    # List of keywords that suggest news-related questions
    news_keywords = [
        "news", "headlines", "bbc", "cnn", "today", "latest", "breaking", 
        "update", "article", "report", "story", "broadcast"
    ]
    
    # Check for news-related questions
    if any(keyword in query_lower for keyword in news_keywords):
        logging.info("[CHAT] Detected news-related question, will use web search")
        return False  # Don't use direct LLM, let it fall through to web search
    
    # Check for math questions - enhanced pattern matching
    # Special case for direct number expressions like "2+2" or "what is 2+2"
    basic_math_regex = r'(\d+\s*[\+\-\*\/]\s*\d+)|(\d+\s*(plus|minus|times|divided by)\s*\d+)'
    if re.search(basic_math_regex, query_lower):
        logging.info(f"[CHAT] Detected basic math expression '{query_lower}', will use direct LLM")
        return True
    
    # Check for math keywords, but only if the query is short and doesn't have policy terms
    math_patterns = ["+", "-", "*", "/", "plus", "minus", "multiply", "divide", "=", "equals", "calculate", "sum", "difference"]
    is_math = any(pattern in query_lower for pattern in math_patterns)
    if is_math and len(query.split()) < 8:  # Short query with math terms
        logging.info("[CHAT] Detected likely math question, using direct LLM")
        return True
    
    # Check for general knowledge indicators
    general_knowledge_patterns = [
        "what is", "who is", "when did", "where is", "how many", 
        "tell me about", "explain", "define", "history of", "meaning of"
    ]
    
    # If it contains general knowledge pattern and no policy keywords, likely general knowledge
    for pattern in general_knowledge_patterns:
        if pattern in query_lower:
            logging.info("[CHAT] Detected general knowledge question, using direct LLM")
            return True
    
    # Default to False - use RAG for most questions
    logging.info("[CHAT] No special patterns detected, defaulting to RAG")
    return False
    return False

# Agent state and tools setup
class AgentState(TypedDict):
    input: str
    chat_history: list
    intermediate_steps: list
    selected_tool: str  # The tool selected by the router
    response: Optional[str]  # The generated response
    source: Optional[str]  # The source of the response
    confidence: Optional[float]  # Confidence in the response
    tool_failed: Optional[bool]  # Whether the current tool failed

# Source router function
def source_router(state: AgentState) -> AgentState:
    """
    LLM-based router that decides which knowledge source to use.
    Updates state["selected_tool"] with "rag_tool", "direct_llm_tool", or "web_search_tool"
    """
    query = state["input"]
    chat_history = state.get("chat_history", [])
    
    logging.info(f"[ROUTER] Determining best source for: '{query}'")
    
    try:
        # Use LLM to analyze and route based on query content
        router_prompt = """
        You are an intelligent router for a question answering system focused on the UK's Department for Work and Pensions (DWP) 
        and specifically the Funeral Expenses Payment (FEP) scheme.
        
        Analyze this query and determine the best knowledge source to answer it.
        
        Query: {query}
        
        Recent conversation history:
        {history}
        
        Choose ONE of the following sources:
        - rag: If this is about DWP or FEP policy, procedures, eligibility, benefits, forms, applications, requirements, or any specific details about the funeral expenses payment scheme.
        - direct_llm: If this is general knowledge, math, simple definitions, or topics clearly unrelated to FEP/DWP.
        - web_search: If this requires current information, news, statistics, or specific external data not likely in policy documents.
        
        Return ONLY one of these exact source names: "rag", "direct_llm", or "web_search" without any explanation.
        """
        
        # Format chat history for context
        formatted_history = ""
        if chat_history and len(chat_history) > 0:
            recent_history = chat_history[-3:] if len(chat_history) > 3 else chat_history
            for msg in recent_history:
                role = msg.get("role", "")
                content = msg.get("content", "")
                formatted_history += f"{role}: {content}\n"
        
        # Use a small, fast model for routing
        router_llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0, openai_api_key=openai_key)
        response = router_llm.invoke([{
            "role": "system",
            "content": router_prompt.format(query=query, history=formatted_history)
        }])
        
        # Extract just the source name and normalize
        source = response.content.strip().lower()
        logging.info(f"[ROUTER] Router suggested source: {source}")
        
        # Map to valid tool name and set default
        if source == "rag":
            state["selected_tool"] = "rag_tool"
        elif source == "web_search":
            state["selected_tool"] = "web_search_tool"
        elif source == "direct_llm":
            state["selected_tool"] = "direct_llm_tool"
        else:
            # Default to direct_llm if response is malformed
            logging.warning(f"[ROUTER] Unexpected router response: {source}, defaulting to direct_llm")
            state["selected_tool"] = "direct_llm_tool"
        
    except Exception as e:
        logging.error(f"[ROUTER] Error in source router: {e}", exc_info=True)
        # Default to direct_llm on error
        state["selected_tool"] = "direct_llm_tool"
    
    logging.info(f"[ROUTER] Selected tool: {state['selected_tool']}")
    return state

# Initialize agent components
def initialize_agent():
    try:
        # Initialize OpenAI chat model
        chat_model = ChatOpenAI(
            model="gpt-4o",
            temperature=0.2,
            openai_api_key=openai_key
        )
        
        # Initialize web search tool if available
        web_search = None
        if tavily_key:
            try:
                web_search = TavilySearchResults(api_key=tavily_key, max_results=3)
                logging.info("[AGENT] Web search tool initialized")
            except Exception as e:
                logging.error(f"[AGENT] Failed to initialize web search tool: {e}")
        
        return chat_model, web_search
    except Exception as e:
        logging.error(f"[AGENT] Error initializing agent components: {e}", exc_info=True)
        return None, None

# Create RAG response using the database
# Tool implementation for RAG source
def use_rag_source(state: AgentState) -> AgentState:
    """Use RAG to generate a response"""
    global rag_db
    
    query = state["input"]
    conversation_history = state.get("chat_history", [])
    
    logging.info(f"[RAG_TOOL] Attempting RAG for query: '{query}'")
    
    if rag_db is None:
        load_rag_database()
    
    if rag_db is None:
        logging.error("[RAG_TOOL] RAG database not loaded, cannot create response")
        state["tool_failed"] = True
        return state
    
    try:
        # Initialize LLM for response generation
        llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
        
        # Enhance the search query to improve RAG retrieval
        # For FEP questions, add additional context to improve document retrieval
        enhanced_query = query
        
        # Check if this is a question about FEP policy
        is_fep_query = any(keyword in query.lower() for keyword in ["funeral", "expenses", "payment", "fep"])
        
        if is_fep_query:
            # Add specific FEP-related terms to enhance the query
            enhanced_query = f"{query} funeral expenses payment policy dwp eligibility"
            logging.info(f"[RAG_TOOL] Enhanced FEP query: {enhanced_query}")
        
        # If we have conversation history, include recent questions in the search query
        search_query = enhanced_query
        if conversation_history:
            # Get up to 3 most recent user messages to enhance the context
            recent_queries = []
            for message in reversed(conversation_history):
                if message["role"] == "user" and len(recent_queries) < 3:
                    recent_queries.append(message["content"])
            
            if recent_queries:
                # Combine the current query with recent queries for better context
                search_query = f"{enhanced_query} {' '.join(recent_queries)}"
                logging.info(f"[RAG_TOOL] Enhanced search query with conversation history: {search_query}")
        
        try:
            # Try with similarity_search_with_score first
            relevant_docs = rag_db.similarity_search_with_score(search_query, k=10)
            
            # Log the retrieved documents and their scores for debugging
            logging.info(f"[RAG_TOOL] Retrieved {len(relevant_docs)} documents from RAG")
            for i, (doc, score) in enumerate(relevant_docs[:3]):  # Log just the first few docs
                source = doc.metadata.get('source_doc', 'Unknown')
                logging.info(f"[RAG_TOOL] Doc {i+1}: Score={score}, Source={source}")
            
            # Filter docs by relevance score (lower is better in OpenAI embeddings)
            # Check if the best match is too poor (high score)
            poor_match_threshold = 0.45  # Any score above this is considered a poor match
            best_score = relevant_docs[0][1] if relevant_docs else 1.0
            
            if best_score > poor_match_threshold:
                # The best match is still too poor to use
                logging.info(f"[RAG_TOOL] Best document score {best_score} is above threshold {poor_match_threshold}, indicating poor relevance")
                logging.info(f"[RAG_TOOL] Query '{query}' not well-suited for RAG")
                state["tool_failed"] = True
                return state
                
            # If we get here, at least one document has good relevance
            # Use a more lenient threshold to include more related documents
            threshold = 0.5
            filtered_docs = [doc for doc, score in relevant_docs if score < threshold]
            
            if not filtered_docs and relevant_docs:
                # If no docs passed the threshold but we have good results, take just the top match
                logging.info(f"[RAG_TOOL] No docs under threshold {threshold}, using top match only")
                filtered_docs = [relevant_docs[0][0]]
                
        except Exception as search_error:
            logging.error(f"[RAG_TOOL] Error with similarity_search_with_score: {search_error}")
            # Fallback to regular similarity search without scores
            try:
                filtered_docs = rag_db.similarity_search(search_query, k=5)
                logging.info(f"[RAG_TOOL] Used fallback similarity_search, found {len(filtered_docs)} docs")
            except Exception as fallback_error:
                logging.error(f"[RAG_TOOL] Fallback search also failed: {fallback_error}")
                filtered_docs = []
        
        if not filtered_docs:
            logging.info(f"[RAG_TOOL] No relevant documents found in RAG database")
            state["tool_failed"] = True
            return state
        
        # Format the context from the documents
        context = "\n\n".join([f"Document: {doc.metadata.get('source_doc', 'Unknown')}\n{doc.page_content}" for doc in filtered_docs])
        
        # Format messages for the chat model
        messages = []
        
        # Add system prompt with context - stronger instructions to use the RAG context
        messages.append({
            "role": "system", 
            "content": f"""You are a helpful assistant for DWP (Department for Work and Pensions) specializing in Funeral Expenses Payment policy.
Use ONLY the following information from policy documents to answer the user's question:

{context}

CRITICAL INSTRUCTIONS:
1. Base your answer EXCLUSIVELY on the information provided above.
2. If the exact answer isn't in the provided information, say: "I don't have specific information on that in my policy documents."
3. DO NOT use your general knowledge about funeral payments or DWP policies.
4. Cite specific parts of the provided information when answering.
5. Be concise and direct in your answers.
6. Maintain a compassionate tone as you're likely helping someone who has been bereaved.
"""
        })
        
        # Add conversation history if available
        if conversation_history:
            # Add only the most recent conversation turns (limit to 10 for context window)
            recent_history = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history
            messages.extend(recent_history)
        
        # Add current query if not already included
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": query})
        
        logging.info(f"[RAG_TOOL] Using RAG with {len(messages)} message history")
        
        response = llm.invoke(messages)
        
        # Update state with response
        state["response"] = response.content
        state["source"] = "rag"
        state["confidence"] = 0.9  # High confidence for RAG responses
        state["tool_failed"] = False
        
        logging.info(f"[RAG_TOOL] Successfully created RAG response")
        return state
        
    except Exception as e:
        logging.error(f"[RAG_TOOL] Error creating RAG response: {e}", exc_info=True)
        state["tool_failed"] = True
        return state

# Legacy function for compatibility
def create_rag_response(query, conversation_history=None):
    """Legacy wrapper for backwards compatibility"""
    state = {
        "input": query,
        "chat_history": conversation_history or []
    }
    
    result_state = use_rag_source(state)
    
    if result_state.get("tool_failed", True):
        return None, []
    
    # Create a mock result set for compatibility
    mock_docs = [{"content": "Legacy compatibility mode", "metadata": {"source_doc": "Legacy"}}]
    
    return result_state.get("response"), mock_docs

# Tool implementation for direct LLM
def use_direct_llm_tool(state: AgentState) -> AgentState:
    """Use direct LLM to generate a response"""
    query = state["input"]
    conversation_history = state.get("chat_history", [])
    
    logging.info(f"[DIRECT_LLM] Generating direct response for query: '{query}'")
    
    try:
        # Initialize LLM
        llm = ChatOpenAI(temperature=0.3, openai_api_key=openai_key)
        
        # Format messages for the LLM
        messages = []
        
        # Add system prompt
        messages.append({
            "role": "system", 
            "content": """You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy.

Your role:
1. Answer general knowledge questions accurately and concisely.
2. For any questions about Funeral Expenses Payment policy, state when you're providing general information rather than specific policy details.
3. Maintain a compassionate tone as you may be speaking with someone who has been bereaved.
4. For complex calculations or specific numbers, clearly show your reasoning.
5. If asked about current events or very recent information, acknowledge that your knowledge may not be current.

Always be helpful, accurate, and compassionate.
"""
        })
        
        # Add conversation history if available
        if conversation_history:
            # Add only the most recent conversation turns
            recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
            messages.extend(recent_history)
        
        # Add current query if not already included
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": query})
        
        logging.info(f"[DIRECT_LLM] Using direct LLM with {len(messages)} message history")
        
        response = llm.invoke(messages)
        
        # Update state with response
        state["response"] = response.content
        state["source"] = "direct_llm"
        state["confidence"] = 0.8  # Medium confidence for general knowledge
        state["tool_failed"] = False
        
        logging.info("[DIRECT_LLM] Successfully generated direct response")
        return state
        
    except Exception as e:
        logging.error(f"[DIRECT_LLM] Error generating direct response: {e}", exc_info=True)
        state["tool_failed"] = True
        return state

# Tool implementation for web search
def use_web_search_tool(state: AgentState) -> AgentState:
    """Use web search to generate a response"""
    query = state["input"]
    conversation_history = state.get("chat_history", [])
    
    logging.info(f"[WEB_SEARCH] Attempting web search for query: '{query}'")
    
    try:
        # Initialize chat model
        chat_model = ChatOpenAI(temperature=0.2, openai_api_key=openai_key)
        
        # Initialize web search
        if not tavily_key:
            logging.error("[WEB_SEARCH] No Tavily API key available for web search")
            state["tool_failed"] = True
            return state
            
        web_search = TavilySearchResults(api_key=tavily_key, max_results=3)
        
        # Perform web search
        search_results = web_search.invoke(query)
        
        if not search_results:
            logging.info("[WEB_SEARCH] No web search results found")
            state["tool_failed"] = True
            return state
        
        # Format search results for better context
        def format_result(result):
            source = result.get('source') or result.get('url') or result.get('title') or 'Unknown Source'
            content = result.get('content') or result.get('snippet') or result.get('text') or ''
            title = result.get('title', '')
            return {
                "source": source,
                "content": content,
                "title": title
            }
        
        formatted_results = [format_result(r) for r in search_results]
        
        # Extract titles/headlines if available
        titles = [r["title"] for r in formatted_results if r["title"]]
        titles_text = "\n".join([f"- {title}" for title in titles]) if titles else "No specific titles found."
        
        # Full context for LLM
        context = "\n\n".join([f"Source: {r['source']}\nTitle: {r['title']}\n{r['content']}" for r in formatted_results])

        # Format messages for the chat model
        messages = []
        
        # Add system prompt with context
        messages.append({
            "role": "system", 
            "content": f"""You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy.
Use the following information from web search to answer the user's question:

{context}

Titles/Headlines found:
{titles_text}

Instructions:
1. Always assume questions are about FEP or DWP context unless clearly stated otherwise.
2. Present information in a clear, organized format - use bullet points for lists of items.
3. If the search results contain relevant information but not exactly what was asked, provide a helpful summary of what IS available.
4. Only say there is no information if the results are completely irrelevant.
5. For FEP policy queries, focus on official DWP information and eligibility criteria.
6. Be conversational, compassionate, and helpful in your response since you're likely speaking with someone who has been bereaved.
7. Maintain conversation context with previous messages.
8. Keep answers concise and focused on helping claimants understand FEP eligibility and process.
9. Clearly indicate that information comes from web searches.
"""
        })
        
        # Add conversation history if available
        if conversation_history:
            # Add only the most recent conversation turns (limit to keep context window manageable)
            recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
            messages.extend(recent_history)
        
        # Add current query if not already included
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": query})
        
        logging.info(f"[WEB_SEARCH] Using web search with {len(messages)} message history")
        
        response = chat_model.invoke(messages)
        
        # Update state with response
        state["response"] = response.content
        state["source"] = "web"
        state["confidence"] = 0.7  # Lower confidence for web search
        state["tool_failed"] = False
        
        logging.info("[WEB_SEARCH] Successfully generated web search response")
        return state
        
    except Exception as e:
        logging.error(f"[WEB_SEARCH] Error generating web search response: {e}", exc_info=True)
        state["tool_failed"] = True
        return state
# Create a response based on the selected tool's output
def generate_final_response(state: AgentState) -> AgentState:
    """Create the final response based on tool outputs"""
    # If a tool has already generated a response, we're done
    if "response" in state and state.get("tool_failed", True) is False:
        logging.info(f"[FINAL] Using response from source: {state.get('source', 'unknown')}")
        return state
    
    # If the selected tool failed, try fallback options
    if state.get("tool_failed", False):
        logging.info(f"[FINAL] Selected tool {state.get('selected_tool', 'unknown')} failed, trying fallbacks")
        
        # Define fallback order: RAG -> Direct LLM -> Web Search -> Default message
        fallbacks = ["rag_tool", "direct_llm_tool", "web_search_tool"]
        original_tool = state.get("selected_tool", "unknown")
        
        # Skip the original tool in fallbacks
        try:
            fallbacks.remove(original_tool)
        except ValueError:
            pass
        
        # Try each fallback in order
        for fallback_tool in fallbacks:
            logging.info(f"[FINAL] Trying fallback: {fallback_tool}")
            
            # Make a copy of state to avoid affecting the original
            fallback_state = state.copy()
            fallback_state["selected_tool"] = fallback_tool
            fallback_state["tool_failed"] = False  # Reset failure flag
            
            # Execute fallback tool
            if fallback_tool == "rag_tool":
                fallback_state = use_rag_source(fallback_state)
            elif fallback_tool == "direct_llm_tool":
                fallback_state = use_direct_llm_tool(fallback_state)
            elif fallback_tool == "web_search_tool":
                fallback_state = use_web_search_tool(fallback_state)
                
            # If fallback succeeded, use its response
            if not fallback_state.get("tool_failed", True) and "response" in fallback_state:
                logging.info(f"[FINAL] Using fallback {fallback_tool} response")
                # Copy successful fallback response to original state
                state["response"] = fallback_state["response"]
                state["source"] = f"{fallback_tool} (fallback from {original_tool})"
                state["tool_failed"] = False
                return state
    
    # If all tools failed, provide a default response
    if state.get("tool_failed", True) or "response" not in state:
        logging.warning("[FINAL] All tools failed, using default response")
        state["response"] = "I'm sorry, I'm having trouble generating a response at the moment. Please try rephrasing your question or try again later."
        state["source"] = "default_fallback"
        state["tool_failed"] = False
    
    return state

# Create the LangGraph workflow
def create_agent_workflow():
    """Create and return a LangGraph workflow for intelligent source selection"""
    try:
        # Initialize the workflow
        workflow = StateGraph(AgentState)
        
        # Add nodes to the workflow
        workflow.add_node("source_router", source_router)
        workflow.add_node("use_rag", use_rag_source)
        workflow.add_node("use_direct_llm", use_direct_llm_tool)
        workflow.add_node("use_web_search", use_web_search_tool)
        workflow.add_node("generate_final_response", generate_final_response)
        
        # Define the edges (connections between nodes)
        # First, route from the router to the appropriate tool based on the selected_tool
        workflow.add_conditional_edges(
            "source_router",
            lambda state: state.get("selected_tool", "direct_llm_tool"),
            {
                "rag_tool": "use_rag",
                "direct_llm_tool": "use_direct_llm",
                "web_search_tool": "use_web_search"
            }
        )
        
        # Connect all tools to final response generator
        workflow.add_edge("use_rag", "generate_final_response")
        workflow.add_edge("use_direct_llm", "generate_final_response")
        workflow.add_edge("use_web_search", "generate_final_response")
        
        # Set final response as the end node
        workflow.add_edge("generate_final_response", END)
        
        # Set the entry point
        workflow.set_entry_point("source_router")
        
        # Compile the workflow
        return workflow.compile()
    except Exception as e:
        logging.error(f"[WORKFLOW] Error creating agent workflow: {e}", exc_info=True)
        return None

# Cached workflow to avoid recreation on every request
_agent_workflow = None

def get_agent_workflow():
    """Get or create the agent workflow"""
    global _agent_workflow
    if _agent_workflow is None:
        _agent_workflow = create_agent_workflow()
    return _agent_workflow

# Create a new chat endpoint that uses the agent workflow
@app.route('/ai-agent/agent-chat', methods=['POST'])
def agent_chat():
    """New endpoint that uses the agent-based workflow"""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
    
    data = request.get_json()
    
    if 'input' not in data:
        return jsonify({"error": "Input query is required"}), 400
    
    query = data['input']
    conversation_history = data.get('history', [])
    
    # Log the request with clear AGENT indicator
    history_len = len(conversation_history) if conversation_history else 0
    logging.info(f"[AGENT-CHAT] *** USING INTELLIGENT AGENT *** Received query: '{query}' with {history_len} messages in conversation history")
    
    # Check if user explicitly requested web search
    web_search_requested = False
    if 'use_web_search' in data and data['use_web_search']:
        web_search_requested = True
        logging.info("[AGENT-CHAT] Web search explicitly requested")
    
    # Initialize time tracking
    start_time = time.time()
    
    # Set up the initial state for the workflow
    initial_state = {
        "input": query,
        "chat_history": conversation_history,
        "intermediate_steps": [],
        "tool_failed": False
    }
    
    # Override tool selection if web search was explicitly requested
    if web_search_requested and tavily_key:
        logging.info("[AGENT-CHAT] Overriding tool selection with web_search_tool")
        initial_state["selected_tool"] = "web_search_tool"
    
    try:
        # Get or create the workflow
        workflow = get_agent_workflow()
        if workflow is None:
            raise Exception("Failed to create agent workflow")
        
        # Run the workflow
        result = workflow.invoke(initial_state)
        
        # Extract response info from result
        response_text = result.get("response", "")
        response_source = result.get("source", "unknown")
        
        # Extract sources for attribution (for RAG and web search)
        sources = []
        if response_source.startswith("rag"):
            # For RAG, just use a generic source since we don't have specific doc sources yet
            sources = ["FEP Policy Documents"]
        elif response_source.startswith("web"):
            # For web search, we'd ideally extract URLs but for now use generic
            sources = ["Web Search Results"]
        
        # Check if all tools failed
        if response_source == "default_fallback":
            logging.warning("[AGENT-CHAT] All tools failed, returning default response")
        else:
            logging.info(f"[AGENT-CHAT] Successfully generated {response_source} response")
        
    except Exception as e:
        # If the workflow fails, use a simple fallback
        logging.error(f"[AGENT-CHAT] Error running agent workflow: {e}", exc_info=True)
        response_text = "I'm sorry, I'm having trouble processing your question. Please try again later."
        response_source = "error"
        sources = []
    
    # Calculate and log response time
    elapsed_time = time.time() - start_time
    logging.info(f"[AGENT-CHAT] *** INTELLIGENT AGENT *** Generated {response_source} response in {elapsed_time:.2f} seconds")
    
    # Provide detailed logging to help with evaluation
    if response_source != "error" and response_source != "default_fallback":
        gc.collect()  # Help prevent memory issues by cleaning up
        
        # Log the first bit of the response for debugging
        response_preview = response_text[:100] + "..." if len(response_text) > 100 else response_text
        logging.info(f"[AGENT-CHAT] Response preview: {response_preview}")
        
    # Return the response
    return jsonify({
        "success": True,
        "response": response_text,
        "source": response_source,
        "sources": sources,
        "processing_time": elapsed_time
    })

@app.route('/ai-agent/chat', methods=['POST'])
def chat():
    global rag_db
    try:
        # Get input from request
        data = request.get_json()
        if not data or ('input' not in data and 'query' not in data):
            return jsonify({
                'success': False,
                'error': 'Invalid request, missing input or query'
            }), 400
        
        user_input = data.get('input') if 'input' in data else data.get('query')
        logging.info(f"[CHAT] Received query: '{user_input}' with {len(data.get('history', []))} messages in conversation history")
        
        # Get conversation history if available
        conversation_history = data.get('history', [])
        if conversation_history:
            logging.info(f"[CHAT] Received conversation history with {len(conversation_history)} messages")
        
        # Initialize agent components
        chat_model, web_search = initialize_agent()
        if not chat_model:
            return jsonify({
                'success': False,
                'error': 'Failed to initialize chat model'
            }), 500
        
        # Always try to load RAG database first
        if rag_db is None:
            loaded = load_rag_database()
            if loaded:
                logging.info("[CHAT] Successfully loaded RAG database")
            else:
                logging.warning("[CHAT] RAG database could not be loaded")
        
        response = ""
        source = "direct_llm"  # Default source
        
        # ALWAYS try RAG first for this domain (Funeral Expenses Payment)
        # We always want to prioritize policy documents over general knowledge
        logging.info("[CHAT] Always attempting RAG first for domain-specific question")
        
        # Extended list of policy keywords for more accurate detection
        policy_keywords = [
            # Core FEP terms
            "fep", "funeral expenses", "funeral payment", "funeral expenses payment",
            # DWP terms
            "dwp", "department for work", "pension", "benefits", "policy", 
            # Application terms
            "eligibility", "payment", "claim", "application", "qualifying", "qualify",
            # Funeral terms
            "funeral", "expense", "death", "bereavement", "burial", "cremation",
            # Support terms
            "support", "help", "assistance", "aid", "financial", "fund",
            # Question patterns
            "how do i", "how to", "when can", "who is eligible", "what documents"
        ]
        
        # Check for policy-related keywords in a case-insensitive way
        policy_question = False
        matched_keyword = None
        user_input_lower = user_input.lower()
        
        for keyword in policy_keywords:
            if keyword.lower() in user_input_lower:
                policy_question = True
                matched_keyword = keyword
                logging.info(f"[CHAT] Policy keyword '{keyword}' detected in request: '{user_input}'")
                break

        # Log the policy question detection result
        if policy_question:
            logging.info(f"[CHAT] Detected as policy question (keyword: '{matched_keyword}')")
        else:
            logging.info(f"[CHAT] Not detected as policy question, but still trying RAG first")
        
        # Always try RAG first, but with different handling based on question type
        if rag_db is not None:
            try:
                logging.info("[CHAT] Trying RAG first")
                rag_response, source_docs = create_rag_response(user_input, conversation_history)
                
                if rag_response and source_docs:
                    response = rag_response
                    source = "rag"
                    logging.info(f"[CHAT] Successfully generated RAG response with {len(source_docs)} documents")
                    
                    # Return RAG response immediately
                    return jsonify({
                        'success': True,
                        'response': response,
                        'source': source
                    })
                else:
                    logging.info("[CHAT] RAG attempted but no relevant documents found, continuing to fallback options...")
            except Exception as e:
                logging.error(f"[CHAT] Error using RAG: {e}", exc_info=True)
        
        # CRITICAL CHECK: If the query is specifically about FEP or Funeral Expenses, force using RAG with a retry
        fep_specific_terms = ["fep", "funeral expenses", "funeral payment", "funeral expenses payment"]
        is_explicitly_fep = False
        
        for term in fep_specific_terms:
            if term in user_input.lower():
                is_explicitly_fep = True
                logging.info(f"[CHAT] Query explicitly about FEP/Funeral Expenses ('{term}'). Forcing RAG with retry.")
                break
        
        if is_explicitly_fep and not response and rag_db is not None:
            # If we're here, it means the first RAG attempt failed but we have a FEP-specific question
            # We'll try again with even more lenient retrieval and explicit FEP terms
            try:
                # Force FEP context into query
                enhanced_query = f"{user_input} funeral expenses payment FEP policy eligibility DWP benefit"
                logging.info(f"[CHAT] Retrying RAG with enhanced query: {enhanced_query}")
                
                # Get any documents that might be relevant, no filtering
                relevant_docs = rag_db.similarity_search(enhanced_query, k=15)
                
                if relevant_docs:
                    # Format context using all retrieved docs
                    context = "\n\n".join([f"Document: {doc.metadata.get('source_doc', 'Unknown')}\n{doc.page_content}" for doc in relevant_docs[:5]])
                    
                    # Create explicit FEP policy messages
                    messages = [{
                        "role": "system", 
                        "content": f"""You are a specialist advisor for the DWP's Funeral Expenses Payment (FEP) scheme.
CRITICAL: The user has asked specifically about FEP policy. Use ONLY the following information to answer:

{context}

IMPORTANT INSTRUCTIONS:
1. Base your answer EXCLUSIVELY on the information provided above.
2. If you can't find specific details in the provided information, say: "I don't have complete information about that aspect of FEP policy in my documents."
3. DO NOT use your general knowledge about funeral payments.
4. Keep responses focused on policy information from the provided documents.
"""
                    }, {"role": "user", "content": user_input}]
                    
                    # Use a low temperature for factual responses
                    llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
                    forced_rag_response = llm.invoke(messages)
                    
                    response = forced_rag_response.content
                    source = "rag"  # This was a RAG response
                    logging.info("[CHAT] Successfully generated forced RAG response for explicit FEP question")
                    
                    # Return the forced RAG response
                    return jsonify({
                        'success': True,
                        'response': response,
                        'source': source
                    })
            except Exception as e:
                logging.error(f"[CHAT] Error generating forced RAG response: {e}", exc_info=True)
                
        # Add a fallback for FEP questions when RAG fails completely
        if is_explicitly_fep and not response:
            try:
                # Use a special FEP-focused direct prompt as fallback
                logging.info("[CHAT] Using FEP-focused fallback prompt due to RAG issues")
                
                messages = [{
                    "role": "system", 
                    "content": """You are a specialist advisor for the Department for Work and Pensions (DWP) Funeral Expenses Payment (FEP) scheme.

CRITICAL INSTRUCTIONS FOR FEP POLICY QUESTIONS:
1. You are answering a question specifically about the Funeral Expenses Payment (FEP) scheme.
2. FEP is a UK government scheme that helps people on qualifying benefits with funeral costs.
3. Key facts about FEP:
   - It helps pay for burial or cremation fees, travel to arrange/attend the funeral
   - It's available to people receiving certain benefits (Universal Credit, Income Support, etc.)
   - The person must be responsible for the funeral arrangements
   - Applications must be made within 6 months of the funeral
   - It doesn't usually cover the full cost of the funeral
4. Be clear that your response is based on general policy knowledge, not specific DWP documents.
5. If asked about very specific details, suggest the user contact DWP directly.
6. Maintain a compassionate tone as you're likely speaking with someone who has been bereaved.

Focus exclusively on FEP policy information. Do not include general funeral advice unrelated to the FEP scheme.
"""
                }, {"role": "user", "content": user_input}]
                
                # Use a low temperature for factual responses
                llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
                forced_response = llm.invoke(messages)
                
                response = forced_response.content
                source = "fep_policy"  # This was a specialized FEP response
                logging.info("[CHAT] Generated FEP-focused response without RAG")
                
                # Return the FEP-focused response
                return jsonify({
                    'success': True,
                    'response': response,
                    'source': source
                })
            except Exception as fallback_error:
                logging.error(f"[CHAT] Error generating FEP fallback response: {fallback_error}", exc_info=True)
        
        # For non-policy questions, analyze if it's a general knowledge question
        is_general_knowledge = should_use_direct_response(user_input)
        
        # Block direct LLM for anything that mentions FEP or funeral expenses
        if is_explicitly_fep:
            logging.info("[CHAT] Blocked direct LLM for explicit FEP question")
            is_general_knowledge = False
        
        # For general knowledge questions, try direct LLM
        if is_general_knowledge:
            try:
                # Format conversation history for the LLM
                messages = []
                
                # Add system prompt
                messages.append({
                    "role": "system", 
                    "content": "You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy. Always assume questions are about FEP or DWP context unless clearly stated otherwise. Provide sensitive and accurate advice to people who have been bereaved. Answer based on your knowledge of FEP policy. Maintain conversation context and be compassionate in your responses."
                })
                
                # Add conversation history if available
                if conversation_history:
                    # Convert from frontend format to ChatOpenAI format if needed
                    messages.extend(conversation_history)
                
                # Add the current user query if not already in history
                if not messages or messages[-1]["role"] != "user":
                    messages.append({"role": "user", "content": user_input})
                
                logging.info(f"[CHAT] Using direct LLM with {len(messages)} message history for general knowledge question")
                
                # Use chat messages format instead of single prompt
                direct_response = chat_model.invoke(messages)
                response = direct_response.content
                source = "direct_llm"
                logging.info("[CHAT] Generated direct LLM response for general knowledge question")
                
                # Return early for general knowledge - no need to try RAG or web search
                return jsonify({
                    'success': True,
                    'response': response,
                    'source': source
                })
            except Exception as e:
                logging.error(f"[CHAT] Error generating direct response: {e}", exc_info=True)
                # Continue to try other approaches if direct response fails
        
        # Try RAG approach first for non-general knowledge questions
        if rag_db is not None:
            try:
                # Create RAG response with conversation history
                rag_response, source_docs = create_rag_response(user_input, conversation_history)
                
                if rag_response and source_docs:
                    response = rag_response
                    source = "rag"  # Mark as RAG response if sources were used
                    logging.info(f"[CHAT] Found {len(source_docs)} relevant documents for RAG response")
                    
                    # Return RAG response immediately if we have one
                    return jsonify({
                        'success': True,
                        'response': response,
                        'source': source
                    })
                else:
                    logging.info("[CHAT] RAG response attempted but no source documents found")
            except Exception as e:
                logging.error(f"[CHAT] Error using RAG for response: {e}", exc_info=True)
        
        # If RAG approach didn't yield results, try web search if available, but only for certain questions
        should_try_web_search = False
        
        # Keywords that suggest external information might be needed
        web_search_keywords = ["current", "latest", "recent", "news", "today", "update", 
                              "statistics", "figures", "data", "report", "study", "research"]
        
        # Check if the query contains any web search keywords
        for keyword in web_search_keywords:
            if keyword.lower() in user_input.lower():
                should_try_web_search = True
                logging.info(f"[CHAT] Web search keyword '{keyword}' detected, will try web search")
                break
        
        # Only use web search for specific types of questions or when explicitly indicated
        if not response and web_search and (should_try_web_search or "search" in user_input.lower()):
            try:
                logging.info("[CHAT] Trying web search for response")
                # Perform web search
                search_results = web_search.invoke(user_input)
                if search_results:
                    # Format search results, handle missing 'source' key gracefully
                    def format_result(result):
                        source = result.get('source') or result.get('url') or result.get('title') or 'Unknown Source'
                        content = result.get('content') or result.get('snippet') or result.get('text') or ''
                        title = result.get('title', '')
                        return {
                            "source": source,
                            "content": content,
                            "title": title
                        }
                    
                    formatted_results = [format_result(r) for r in search_results]
                    
                    # Extract titles/headlines if available
                    titles = [r["title"] for r in formatted_results if r["title"]]
                    titles_text = "\n".join([f"- {title}" for title in titles]) if titles else "No specific titles found."
                    
                    # Full context for LLM
                    context = "\n\n".join([f"Source: {r['source']}\nTitle: {r['title']}\n{r['content']}" for r in formatted_results])

                    # Format messages for the chat model
                    messages = []
                    
                    # Add system prompt with context
                    messages.append({
                        "role": "system", 
                        "content": f"""You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy.
Use the following information from web search to answer the user's question:

{context}

Titles/Headlines found:
{titles_text}

Instructions:
1. Always assume questions are about FEP or DWP context unless clearly stated otherwise.
2. Present information in a clear, organized format - use bullet points for lists of items.
3. If the search results contain relevant information but not exactly what was asked, provide a helpful summary of what IS available.
4. Only say there is no information if the results are completely irrelevant.
5. For FEP policy queries, focus on official DWP information and eligibility criteria.
6. Be conversational, compassionate, and helpful in your response since you're likely speaking with someone who has been bereaved.
7. Maintain conversation context with previous messages.
8. Keep answers concise and focused on helping claimants understand FEP eligibility and process.
"""
                    })
                    
                    # Add conversation history if available
                    if conversation_history:
                        # Add only the most recent conversation turns (limit to keep context window manageable)
                        recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
                        messages.extend(recent_history)
                    
                    # Add current query if not already included
                    if not messages or messages[-1]["role"] != "user":
                        messages.append({"role": "user", "content": user_input})
                    
                    logging.info(f"[CHAT] Using web search with {len(messages)} message history")
                    
                    web_response = chat_model.invoke(messages)
                    response = web_response.content
                    source = "web"
                    logging.info("[CHAT] Generated response using web search results")
            except Exception as e:
                logging.error(f"[CHAT] Error using web search for response: {e}", exc_info=True)
        
        # If neither RAG nor web search worked, fall back to direct LLM response
        if not response:
            try:
                # Generate direct LLM response with conversation history
                messages = []
                
                # Add system prompt
                messages.append({
                    "role": "system", 
                    "content": """You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy.
Always assume questions are about FEP or DWP context unless clearly stated otherwise.
Provide sensitive and accurate advice to people who have been bereaved.
Focus on helping claimants understand FEP eligibility, application process, and required documentation.
If you don't know the answer or if it requires very specific policy details not in your knowledge, please say so.
Maintain conversation context and handle follow-up questions appropriately.
Keep answers concise, compassionate, and focused on helping the bereaved person.
"""
                })
                
                # Add conversation history if available
                if conversation_history:
                    # Add only the most recent conversation turns
                    recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
                    messages.extend(recent_history)
                
                # Add current query if not already included
                if not messages or messages[-1]["role"] != "user":
                    messages.append({"role": "user", "content": user_input})
                
                logging.info(f"[CHAT] Using fallback LLM with {len(messages)} message history")
                
                direct_response = chat_model.invoke(messages)
                response = direct_response.content
                source = "direct_llm"
                logging.info("[CHAT] Generated direct LLM response")
            except Exception as e:
                logging.error(f"[CHAT] Error generating direct LLM response: {e}", exc_info=True)
                return jsonify({
                    'success': False,
                    'error': f'Failed to generate response: {str(e)}'
                }), 500
        
        # Return the response
        logging.info(f"[CHAT] Returning response with source: {source}")
        return jsonify({
            'success': True,
            'response': response,
            'source': source
        })
    except Exception as e:
        logging.error(f"[CHAT] Unexpected error handling chat request: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }), 500

# Serve the main UI at the root URL and /ai-agent/ path
@app.route('/')
@app.route('/ai-agent/')
def index():
    # Get list of uploaded documents to display
    policy_docs_path = os.path.join(os.path.dirname(__file__), 'policy_docs')
    documents = []
    
    if os.path.exists(policy_docs_path):
        for filename in os.listdir(policy_docs_path):
            file_path = os.path.join(policy_docs_path, filename)
            if os.path.isfile(file_path) and not filename.startswith('.'):
                doc_type = "Document"
                # Get extension and set document type
                if filename.lower().endswith('.pdf'):
                    doc_type = "PDF"
                elif filename.lower().endswith(('.docx', '.doc')):
                    doc_type = "Word"
                elif filename.lower().endswith('.txt'):
                    doc_type = "Text"
                
                documents.append({
                    'filename': filename,
                    'doc_type': doc_type,
                    'doc_id': filename  # Use filename as the document ID
                })
    
    return render_template('index.html', documents=documents)

# Helper function to determine the best source for UI endpoint
def determine_best_source(query):
    """
    Simplified version of source_router for UI use
    Returns the best source for a given query: 'rag', 'direct_llm', or 'web_search'
    """
    try:
        # Initialize chat model
        llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
        
        # Build router prompt
        router_prompt = """
        You are an intelligent router for a question answering system focused on the UK's Department for Work and Pensions (DWP) 
        and specifically the Funeral Expenses Payment (FEP) scheme.
        
        Analyze this query and determine the best knowledge source to answer it.
        
        Query: {query}
        
        Choose ONE of the following sources:
        - rag: If this is about DWP or FEP policy, procedures, eligibility, benefits, forms, applications, requirements, or any specific details about the funeral expenses payment scheme.
        - direct_llm: If this is general knowledge, math, simple definitions, or topics clearly unrelated to FEP/DWP.
        - web_search: If this requires current information, news, statistics, or specific external data not likely in policy documents.
        
        Return ONLY one of these exact source names: "rag", "direct_llm", or "web_search" without any explanation.
        """
        
        formatted_prompt = router_prompt.format(query=query)
        
        # Make an API call to determine the source
        messages = [{"role": "user", "content": formatted_prompt}]
        response = llm.invoke(messages)
        
        # Extract the source from the response
        source = response.content.strip().lower()
        
        # Validate the source
        valid_sources = ["rag", "direct_llm", "web_search"]
        if source not in valid_sources:
            logging.warning(f"[UI_ROUTER] Invalid source returned: '{source}', defaulting to direct_llm")
            return "direct_llm"
        
        return source
    
    except Exception as e:
        logging.error(f"[UI_ROUTER] Error determining source: {e}", exc_info=True)
        return "direct_llm"  # Default fallback

# Route for handling chat messages from the UI
@app.route('/send_message', methods=['POST'])
def ui_send_message():
    global rag_db
    try:
        # Get input from request
        data = request.get_json()
        if not data or 'message' not in data:
            logging.error("[UI_CHAT] Invalid request, missing message")
            return jsonify({
                'success': False,
                'error': 'Invalid request, missing message'
            }), 400
        
        user_input = data['message']
        logging.info(f"[UI_CHAT] Received message: '{user_input}'")
        
        # Initialize agent components
        chat_model, web_search = initialize_agent()
        
        # Create input state for the router
        state = {
            "input": user_input,
            "chat_history": []  # UI doesn't maintain history yet
        }
        
        # First determine the best source using our helper function
        logging.info(f"[UI_CHAT] Determining best source for query")
        selected_source = determine_best_source(user_input)
        logging.info(f"[UI_CHAT] Router suggested source: {selected_source}")
        
        # Process based on the selected source
        response = None
        source_type = selected_source
        
        if selected_source == "rag":
            # Use RAG tool
            rag_state = use_rag_source(state)
            if not rag_state.get("tool_failed", True):
                response = rag_state.get("response")
                source_type = "rag"
                logging.info(f"[UI_CHAT] Generated RAG response")
        
        elif selected_source == "web_search":
            # Use web search tool
            web_state = use_web_search_tool(state)
            if not web_state.get("tool_failed", True):
                response = web_state.get("response")
                source_type = "web"
                logging.info(f"[UI_CHAT] Generated web search response")
        
        # Use direct LLM if other sources failed or for general knowledge
        if not response:
            direct_state = use_direct_llm_tool(state)
            if not direct_state.get("tool_failed", True):
                response = direct_state.get("response")
                source_type = "direct_llm"
                logging.info(f"[UI_CHAT] Generated direct LLM response")
        
        # Final fallback
        if not response:
            response = "I'm sorry, I couldn't generate an appropriate response. Please try asking in a different way."
            source_type = "error"
            logging.warning(f"[UI_CHAT] All response methods failed")
        
        # Return the response with source information
        return jsonify({
            'success': True,
            'message': response,
            'source': source_type
        })
        
    except Exception as e:
        logging.error(f"[UI_CHAT] Error in UI chat processing: {e}", exc_info=True)
        
        # CRITICAL CHECK: If the query is specifically about FEP or Funeral Expenses, force using RAG with a retry
        fep_specific_terms = ["fep", "funeral expenses", "funeral payment", "funeral expenses payment"]
        is_explicitly_fep = False
        
        for term in fep_specific_terms:
            if term in user_input.lower():
                is_explicitly_fep = True
                logging.info(f"[UI_CHAT] Query explicitly about FEP/Funeral Expenses ('{term}'). Forcing RAG with retry.")
                break
        
        if is_explicitly_fep and not response and rag_db is not None:
            # If we're here, it means the first RAG attempt failed but we have a FEP-specific question
            # We'll try again with even more lenient retrieval and explicit FEP terms
            try:
                # Force FEP context into query
                enhanced_query = f"{user_input} funeral expenses payment FEP policy eligibility DWP benefit"
                logging.info(f"[UI_CHAT] Retrying RAG with enhanced query: {enhanced_query}")
                
                # Get any documents that might be relevant, no filtering
                relevant_docs = rag_db.similarity_search(enhanced_query, k=15)
                
                if relevant_docs:
                    # Format context using all retrieved docs
                    context = "\n\n".join([f"Document: {doc.metadata.get('source_doc', 'Unknown')}\n{doc.page_content}" for doc in relevant_docs[:5]])
                    
                    # Create explicit FEP policy messages
                    messages = [{
                        "role": "system", 
                        "content": f"""You are a specialist advisor for the DWP's Funeral Expenses Payment (FEP) scheme.
CRITICAL: The user has asked specifically about FEP policy. Use ONLY the following information to answer:

{context}

IMPORTANT INSTRUCTIONS:
1. Base your answer EXCLUSIVELY on the information provided above.
2. If you can't find specific details in the provided information, say: "I don't have complete information about that aspect of FEP policy in my documents."
3. DO NOT use your general knowledge about funeral payments.
4. Keep responses focused on policy information from the provided documents.
"""
                    }, {"role": "user", "content": user_input}]
                    
                    # Use a low temperature for factual responses
                    llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
                    forced_rag_response = llm.invoke(messages)
                    
                    response = forced_rag_response.content
                    source = "rag"  # This was a RAG response
                    logging.info("[UI_CHAT] Successfully generated forced RAG response for explicit FEP question")
                    
                    # Return the forced RAG response
                    return jsonify({
                        'success': True,
                        'message': response,
                        'source': source
                    })
            except Exception as e:
                logging.error(f"[UI_CHAT] Error generating forced RAG response: {e}", exc_info=True)
                
        # Add a fallback for FEP questions when RAG fails completely
        if is_explicitly_fep and not response:
            try:
                # Use a special FEP-focused direct prompt as fallback
                logging.info("[UI_CHAT] Using FEP-focused fallback prompt due to RAG issues")
                
                messages = [{
                    "role": "system", 
                    "content": """You are a specialist advisor for the Department for Work and Pensions (DWP) Funeral Expenses Payment (FEP) scheme.

CRITICAL INSTRUCTIONS FOR FEP POLICY QUESTIONS:
1. You are answering a question specifically about the Funeral Expenses Payment (FEP) scheme.
2. FEP is a UK government scheme that helps people on qualifying benefits with funeral costs.
3. Key facts about FEP:
   - It helps pay for burial or cremation fees, travel to arrange/attend the funeral
   - It's available to people receiving certain benefits (Universal Credit, Income Support, etc.)
   - The person must be responsible for the funeral arrangements
   - Applications must be made within 6 months of the funeral
   - It doesn't usually cover the full cost of the funeral
4. Be clear that your response is based on general policy knowledge, not specific DWP documents.
5. If asked about very specific details, suggest the user contact DWP directly.
6. Maintain a compassionate tone as you're likely speaking with someone who has been bereaved.

Focus exclusively on FEP policy information. Do not include general funeral advice unrelated to the FEP scheme.
"""
                }, {"role": "user", "content": user_input}]
                
                # Use a low temperature for factual responses
                llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
                forced_response = llm.invoke(messages)
                
                response = forced_response.content
                source = "fep_policy"  # This was a specialized FEP response
                logging.info("[UI_CHAT] Generated FEP-focused response without RAG")
                
                # Return the FEP-focused response
                return jsonify({
                    'success': True,
                    'message': response,
                    'source': source
                })
            except Exception as fallback_error:
                logging.error(f"[UI_CHAT] Error generating FEP fallback response: {fallback_error}", exc_info=True)
        
        # For non-policy questions, analyze if it's a general knowledge question
        is_general_knowledge = should_use_direct_response(user_input)
        
        # Block direct LLM for anything that mentions FEP or funeral expenses
        if is_explicitly_fep:
            logging.info("[UI_CHAT] Blocked direct LLM for explicit FEP question")
            is_general_knowledge = False
        
        # For general knowledge questions, use direct LLM
        if is_general_knowledge:
            try:
                # Format messages for the LLM
                messages = [
                    {
                        "role": "system", 
                        "content": "You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy. Always assume questions are about FEP or DWP context unless clearly stated otherwise. Provide sensitive and accurate advice to people who have been bereaved."
                    },
                    {"role": "user", "content": user_input}
                ]
                
                logging.info(f"[UI_CHAT] Using direct LLM for general knowledge question")
                
                # Use chat messages format instead of single prompt
                direct_response = chat_model.invoke(messages)
                response = direct_response.content
                source = "direct_llm"
                logging.info("[UI_CHAT] Generated direct LLM response for general knowledge question")
                
                # Return response with source type
                return jsonify({
                    'success': True,
                    'message': response,
                    'source': source
                })
            except Exception as e:
                logging.error(f"[UI_CHAT] Error generating direct response: {e}", exc_info=True)
                # Continue to try other approaches if direct response fails
        
        # Try RAG approach for policy-specific questions
        if rag_db is not None:
            try:
                # Create RAG response
                rag_response, source_docs = create_rag_response(user_input)
                
                if rag_response and source_docs:
                    response = rag_response
                    source = "rag"  # Mark as RAG response
                    logging.info(f"[UI_CHAT] Found {len(source_docs)} relevant documents for RAG response")
                    
                    # Return RAG response
                    return jsonify({
                        'success': True,
                        'message': response,
                        'source': source
                    })
                else:
                    logging.info("[UI_CHAT] RAG response attempted but no source documents found")
            except Exception as e:
                logging.error(f"[UI_CHAT] Error using RAG for response: {e}", exc_info=True)
        
        # If RAG approach didn't yield results, try web search if available, but only for certain questions
        should_try_web_search = False
        
        # Keywords that suggest external information might be needed
        web_search_keywords = ["current", "latest", "recent", "news", "today", "update", 
                              "statistics", "figures", "data", "report", "study", "research"]
        
        # Check if the query contains any web search keywords
        for keyword in web_search_keywords:
            if keyword.lower() in user_input_lower:
                should_try_web_search = True
                logging.info(f"[UI_CHAT] Web search keyword '{keyword}' detected, will try web search")
                break
        
        # Only use web search for specific types of questions or when explicitly indicated
        if not response and web_search and (should_try_web_search or "search" in user_input_lower):
            try:
                logging.info("[UI_CHAT] Trying web search for response")
                # Perform web search
                search_results = web_search.invoke(user_input)
                if search_results:
                    # Format search results
                    context = "\n\n".join([f"Source: {r.get('source', 'Unknown')}\n{r.get('content', '')}" for r in search_results])

                    # Format messages for the chat model
                    messages = [
                        {
                            "role": "system", 
                            "content": f"""You are a helpful assistant for the Department for Work and Pensions (DWP).
Use the following information from web search to answer the user's question:

{context}

Be conversational and helpful in your response.
"""
                        },
                        {"role": "user", "content": user_input}
                    ]
                    
                    logging.info(f"[UI_CHAT] Using web search results")
                    
                    web_response = chat_model.invoke(messages)
                    response = web_response.content
                    source = "web"
                    logging.info("[UI_CHAT] Generated response using web search results")
                    
                    # Return web search response
                    return jsonify({
                        'success': True,
                        'message': response,
                        'source': source
                    })
            except Exception as e:
                logging.error(f"[UI_CHAT] Error using web search for response: {e}", exc_info=True)
        
        # Fallback to direct LLM response if nothing else worked
        try:
            # Generate direct LLM response
            messages = [
                {
                    "role": "system", 
                    "content": """You are a helpful assistant for the Department for Work and Pensions (DWP), specializing in Funeral Expenses Payment (FEP) policy.
Always assume questions are about FEP or DWP context unless clearly stated otherwise.
Provide sensitive and accurate advice to people who have been bereaved.
Focus on helping claimants understand FEP eligibility, application process, and required documentation.
If you don't know the answer or if it requires very specific policy details not in your knowledge, please say so.
Keep answers concise, compassionate, and focused on helping the bereaved person.
"""
                },
                {"role": "user", "content": user_input}
            ]
            
            logging.info(f"[UI_CHAT] Using fallback direct LLM")
            
            direct_response = chat_model.invoke(messages)
            response = direct_response.content
            source = "direct_llm"
            logging.info("[UI_CHAT] Generated fallback direct LLM response")
        except Exception as e:
            logging.error(f"[UI_CHAT] Error generating fallback direct response: {e}", exc_info=True)
            return jsonify({
                'success': False,
                'error': f'Failed to generate response: {str(e)}'
            }), 500
        
        # Return the response with source
        logging.info(f"[UI_CHAT] Returning response with source: {source}")
        return jsonify({
            'success': True,
            'message': response,
            'source': source
        })
    except Exception as e:
        logging.error(f"[UI_CHAT] Unexpected error handling chat request: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }), 500

# Route for getting RAG documents and stats
@app.route('/ai-agent/docs', methods=['GET'])
def get_rag_docs():
    global rag_db
    try:
        force_reload = request.args.get('force_reload', 'false').lower() == 'true'
        
        # Get all collections
        logging.info(f"[RAG_STATS] Getting RAG database stats, force_reload={force_reload}")
        
        # Get total chunk count
        total_chunks = 0
        documents = []
        
        try:
            # Count the actual chunks in the database
            if hasattr(rag_db, '_collection'):
                col = rag_db._collection
                # Get count from chroma
                total_chunks = col.count()
                
                # Get document names and count per document
                doc_counts = {}
                if col.count() > 0:
                    # Get all metadatas
                    results = col.get(include=['metadatas'])
                    if results and 'metadatas' in results:
                        metadatas = results['metadatas']
                        for metadata in metadatas:
                            if metadata and 'source' in metadata:
                                source = metadata['source']
                                if source in doc_counts:
                                    doc_counts[source] += 1
                                else:
                                    doc_counts[source] = 1
                
                # Convert to list for response
                for doc_name, chunk_count in doc_counts.items():
                    documents.append({
                        "name": os.path.basename(doc_name),
                        "path": doc_name,
                        "chunks": chunk_count,
                        "in_rag": True
                    })
        except Exception as e:
            logging.error(f"[RAG_STATS] Error getting chunk details: {e}", exc_info=True)
            
        return jsonify({
            'success': True,
            'rag_status': {
                'total_chunk_count': total_chunks
            },
            'documents': documents
        })
    except Exception as e:
        logging.error(f"[RAG_STATS] Error getting RAG stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error getting RAG stats: {str(e)}'
        }), 500

# Route for handling document deletion from the UI
@app.route('/delete_document', methods=['POST'])
def ui_delete_document():
    try:
        # Get the document ID from the request
        data = request.get_json()
        if not data or 'doc_id' not in data:
            logging.error("[UI_DELETE] No doc_id in the request")
            return jsonify({
                'success': False,
                'error': 'No document ID provided'
            }), 400
            
        doc_id = data['doc_id']
        logging.info(f"[UI_DELETE] Received delete request for document ID: {doc_id}")
        
        # Since this is just a UI demonstration, we'll simulate a successful deletion
        # In a real application, you would delete the document from storage here
        logging.info(f"[UI_DELETE] Successfully processed delete request for document ID: {doc_id}")
        
        # Return success response
        return jsonify({
            'success': True,
            'message': 'Document deleted successfully'
        })
    except Exception as e:
        logging.error(f"[UI_DELETE] Error deleting document: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error deleting document: {str(e)}'
        }), 500

# Route for handling file uploads from the UI
@app.route('/upload_document', methods=['POST'])
def ui_upload_document():
    # This route handles uploads from the UI form
    try:
        # Check if the post has the file part
        if 'document' not in request.files:
            logging.error("[UI_UPLOAD] No document part in the request")
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        file = request.files['document']
        
        # Check if file is selected
        if file.filename == '':
            logging.error("[UI_UPLOAD] No file selected")
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        # Create a unique document ID
        import uuid
        doc_id = str(uuid.uuid4())
        
        # Get the upload directory
        upload_dir = os.path.join(os.path.dirname(__file__), 'uploads')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Secure the filename and save the file
        filename = secure_filename(file.filename)
        file_path = os.path.join(upload_dir, filename)
        file.save(file_path)
        
        logging.info(f"[UI_UPLOAD] Successfully uploaded file: {filename}")
        
        # Return success response
        return jsonify({
            'success': True,
            'filename': filename,
            'doc_id': doc_id
        })
    except Exception as e:
        logging.error(f"[UI_UPLOAD] Error uploading document: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error uploading document: {str(e)}'
        }), 500

def guess_document_type_from_filename(filename):
    """
    Guess the document type based on filename patterns
    
    This function is maintained for backward compatibility.
    The DocumentClassifier class provides more comprehensive detection.
    """
    # Create a temporary instance of the DocumentClassifier
    doc_classifier = DocumentClassifier()
    
    # Use the document classifier to detect the type
    doc_type = doc_classifier.detect_document_type("", filename)
    
    # Map the detected type to the format expected by existing code
    type_mapping = {
        "death_certificate": "Death Certificate",
        "birth_certificate": "Birth Certificate",
        "funeral_invoice": "Funeral Bill",
        "benefit_letter": "Proof of Benefits",
        "unknown": "Unknown Document"
    }
    
    return type_mapping.get(doc_type, "Unknown Document")

@app.route('/ai-agent/extract-form-data', methods=['POST'])
def extract_form_data():
    """
    Endpoint to extract data from evidence documents for form auto-filling
    """
    # Shared evidence directory - use the volume path inside the container
    docs_dir = "/shared-evidence"
    logging.info(f"[EXTRACT] Scanning evidence directory: {docs_dir}")
    
    # Print environment variables for debugging (redact API keys)
    env_vars = {k: (v[:5] + '...' if 'KEY' in k and v else v) for k, v in os.environ.items()}
    logging.info(f"[EXTRACT] Environment variables: {env_vars}")
    
    # Check if directory exists
    if not os.path.exists(docs_dir):
        logging.error(f"[EXTRACT] Evidence directory does not exist: {docs_dir}")
        return jsonify({"error": f"Evidence directory not found: {docs_dir}"})
        
    # List all files in the directory for debugging
    all_files = os.listdir(docs_dir) if os.path.exists(docs_dir) else []
    logging.info(f"[EXTRACT] All files in evidence directory: {all_files}")
    
    extracted = {}
    
    # Initialize document processor for OCR
    document_processor_instance = document_processor.DocumentProcessor(upload_folder=docs_dir)
    
    # Initialize AI document processor for langchain integration
    ai_document_processor_instance = None
    try:
        ai_document_processor_instance = ai_document_processor.AIDocumentProcessor()
        logging.info("[EXTRACT] AI Document Processor initialized successfully")
    except Exception as e:
        logging.error(f"[EXTRACT] Failed to initialize AI Document Processor: {e}", exc_info=True)
        
    # Initialize date normalizer and document classifier
    date_normalizer = DateNormalizer()
    document_classifier = DocumentClassifier()
    logging.info("[EXTRACT] Date Normalizer and Document Classifier initialized")
    
    # Get the list of files from the request, if provided
    requested_files = []
    if request.json and 'files' in request.json:
        requested_files = request.json.get('files', [])
        logging.info(f"[EXTRACT] Processing requested files: {requested_files}")
    
    # Process all files in the directory if no specific files requested
    file_list = requested_files if requested_files else os.listdir(docs_dir)
    
    # Create a map of file ID prefixes to full filenames for matching
    file_prefix_map = {}
    all_files_in_dir = os.listdir(docs_dir)
    for full_filename in all_files_in_dir:
        # For each file in the directory, check if it matches one of our requested files
        for requested_id in requested_files:
            # Exact match
            if full_filename == requested_id:
                file_prefix_map[requested_id] = full_filename
                logging.info(f"[EXTRACT] Found exact match for requested ID {requested_id}")
                break
            # Prefix match (userId_filename pattern)
            if requested_id.count('_') > 0 and full_filename.startswith(requested_id.split('_')[0] + '_'):
                file_prefix_map[requested_id] = full_filename
                logging.info(f"[EXTRACT] Mapped requested ID {requested_id} to file {full_filename}")
                break
    
    logging.info(f"[EXTRACT] File prefix map: {file_prefix_map}")
    
    for fname in file_list:
        # If this is a requested ID and we found a matching file, use the full filename
        actual_filename = file_prefix_map.get(fname, fname)
        file_path = os.path.join(docs_dir, actual_filename)
        
        if not os.path.exists(file_path):
            logging.warning(f"[EXTRACT] File not found: {file_path}")
            # Look for files with three patterns:
            # 1. Files that start with the ID followed by underscore (new pattern)
            # 2. Files that exactly match the filename (original pattern)
            # 3. Files that contain the filename as a substring
            matching_files = [f for f in all_files_in_dir if 
                             (f.startswith(f"{fname}_") or 
                              f == fname or 
                              fname in f)]
            
            if matching_files:
                actual_filename = matching_files[0]
                file_path = os.path.join(docs_dir, actual_filename)
                logging.info(f"[EXTRACT] Found matching file: {actual_filename}")
            else:
                extracted[fname] = "Error: File not found"
                continue
            
        if not os.path.isfile(file_path):
            logging.warning(f"[EXTRACT] Not a file: {file_path}")
            continue
            
        logging.info(f"[EXTRACT] Processing file: {file_path}")
        
        try:
            # Process the document using the document processor to extract text
            processing_result = document_processor_instance.process_file(file_path)
            
            if not processing_result.get("success", False):
                logging.error(f"[EXTRACT] Document processing failed: {processing_result.get('error')}")
                extracted[fname] = f"Error: Document processing failed: {processing_result.get('error')}"
                continue
                
            content = processing_result.get("text", "")
            logging.info(f"[EXTRACT] Successfully extracted {len(content)} characters from document")
            
            # Check if we actually got any meaningful content - VERY MINIMAL CHECK
            # Even just a few characters might contain useful info when OCR fails partially
            if not content:  # Only filter out completely empty text
                logging.warning(f"[EXTRACT] Insufficient text content extracted from {fname}: '{content}'")
                
                # Return a warning in a standardized JSON format instead of an error
                warning_result = {
                    "_warning": {
                        "value": "Limited or no text could be extracted from this file.",
                        "reasoning": "The OCR process couldn't extract meaningful text from this image. This could be due to low image quality, handwritten text, or other factors."
                    }
                }
                
                # Use document classifier to detect document type from filename
                doc_type = document_classifier.detect_document_type("", fname)
                doc_type_display = doc_type.replace('_', ' ').title()
                
                warning_result["_fileType"] = {
                    "value": doc_type_display,
                    "reasoning": "Detected from filename patterns"
                }
                
                # Add document type field for better form matching
                warning_result["_documentType"] = {
                    "value": doc_type_display,
                    "reasoning": f"Detected as {doc_type_display} based on filename analysis"
                }
                
                extracted[fname] = json.dumps(warning_result, indent=4)
                continue
            
            # Application schema summary (field: description)
            schema = '''
firstName: Applicant's first name
lastName: Applicant's last name
dateOfBirth: Applicant's date of birth
nationalInsuranceNumber: Applicant's National Insurance number
addressLine1: Address line 1
addressLine2: Address line 2
town: Town or city
county: County
postcode: Postcode
phoneNumber: Phone number
email: Email address
partnerFirstName: Partner's first name
partnerLastName: Partner's last name
partnerDateOfBirth: Partner's date of birth
partnerNationalInsuranceNumber: Partner's National Insurance number
partnerBenefitsReceived: Benefits the partner receives
partnerSavings: Partner's savings
deceasedFirstName: Deceased's first name
deceasedLastName: Deceased's last name
deceasedDateOfBirth: Deceased's date of birth
deceasedDateOfDeath: Deceased's date of death
deceasedPlaceOfDeath: Place of death
deceasedCauseOfDeath: Cause of death
deceasedCertifyingDoctor: Certifying doctor
deceasedCertificateIssued: Certificate issued
relationshipToDeceased: Relationship to deceased
supportingEvidence: Supporting evidence
responsibilityStatement: Responsibility statement
responsibilityDate: Responsibility date
benefitType: Type of benefit
benefitReferenceNumber: Benefit reference number
benefitLetterDate: Date on benefit letter
householdBenefits: Household benefits (array)
incomeSupportDetails: Details about Income Support
disabilityBenefits: Disability benefits (array)
carersAllowance: Carer's Allowance
carersAllowanceDetails: Carer's Allowance details
funeralDirector: Funeral director
funeralEstimateNumber: Funeral estimate number
funeralDateIssued: Date funeral estimate issued
funeralTotalEstimatedCost: Total estimated funeral cost
funeralDescription: Funeral description
funeralContact: Funeral contact
evidence: Evidence documents (array)
'''
            # Use LLM to extract information
            prompt = f'''
You are an expert assistant helping to process evidence for a funeral expenses claim. The following is the application schema:
{schema}

Read the following evidence text extracted from a document and extract all information relevant to the claim. The text comes from OCR and may be incomplete or have errors.

For each field you can extract, provide:
- The field name (from the schema above)
- The value
- A short explanation of your reasoning or the evidence source

SUPER IMPORTANT: The OCR text may be VERY limited, noisy, or fragmented, especially for scanned documents. You must try your absolute best to identify ANY relevant information, even if the text is extremely minimal. Even partial names, dates, addresses, or just a few words can be valuable.

1. For scanned letters, look for patterns like department names, reference numbers, dates, and recipient names.
2. For scanned certificates, look for official terminology like "certificate", "death", "birth", etc.
3. For scanned invoices, look for amount formats, company names, and service descriptions.
4. For images, even a few words can indicate document type.

CRITICAL: The document filename itself provides important clues about the document type. Analyze it carefully.
Filename: {fname}

If you can see the document is a specific type (e.g., "death certificate", "funeral bill", etc.) but can't extract specific fields, at least return a "_fileType" field with that information.

Return your answer as a JSON object where each key is a field name, and each value is an object with 'value' and 'reasoning'.

Evidence text:
{content}
'''
            # Initialize LLM if needed
            if not openai_key:
                logging.error("[EXTRACT] OpenAI API key not available for LLM invocation")
                # Use document classifier to detect document type from filename
                doc_type = document_classifier.detect_document_type(content, fname)
                doc_type_display = doc_type.replace('_', ' ').title()
                
                extracted[fname] = json.dumps({
                    "_error": {
                        "value": "AI service unavailable - API key missing",
                        "reasoning": "The OpenAI API key is not configured. Please check server configuration."
                    },
                    "_fileType": {
                        "value": doc_type_display,
                        "reasoning": "Detected from document content and filename patterns"
                    }
                })
                continue
                
            llm = ChatOpenAI(
                model_name="gpt-3.5-turbo",
                temperature=0.0,
                openai_api_key=openai_key
            )
            
            try:
                # Get AI extraction response
                response = llm.invoke(prompt)
                raw_response = str(response.content) if hasattr(response, 'content') else str(response)
                
                # Parse the extracted JSON data
                try:
                    # Convert the raw string response to Python dict
                    extracted_data = json.loads(raw_response)
                    
                    # Detect document type from content and filename
                    doc_type = document_classifier.detect_document_type(content, fname)
                    logging.info(f"[EXTRACT] Detected document type for {fname}: {doc_type}")
                    
                    # Apply document-type based field normalization
                    normalized_data = document_classifier.normalize_fields(extracted_data, doc_type)
                    
                    # Apply date normalization to the fields
                    final_data = date_normalizer.process_data_object(normalized_data)                    # Convert back to formatted JSON string
                    extracted[fname] = json.dumps(final_data, indent=4)
                    logging.info(f"[EXTRACT] Processed extraction for {fname}")
                except json.JSONDecodeError:
                    # If JSON parsing fails, return the raw response
                    logging.error(f"[EXTRACT] Failed to parse JSON from LLM response for {fname}")
                    extracted[fname] = raw_response
            except Exception as e:
                logging.error(f"[EXTRACT ERROR] LLM invocation error for {fname}: {e}", exc_info=True)
                extracted[fname] = f"Error in AI processing: {e}"
        except Exception as e:
            logging.error(f"[EXTRACT ERROR] {fname}: {e}", exc_info=True)
            extracted[fname] = f"Error extracting: {e}"
    
    return jsonify(extracted)

@app.route('/ai-agent/test-evidence', methods=['GET'])
def test_evidence():
    """
    Test endpoint to check evidence directory
    """
    evidence_dir = "/shared-evidence"
    result = {
        "directory": evidence_dir,
        "exists": os.path.exists(evidence_dir),
        "files": os.listdir(evidence_dir) if os.path.exists(evidence_dir) else []
    }
    return jsonify(result)

if __name__ == '__main__':
    # Load RAG database on startup
    load_rag_database()
    
    # Start Flask app
    app.run(host='0.0.0.0', port=5050, debug=True)
