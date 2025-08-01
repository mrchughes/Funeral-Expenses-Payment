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
        if 'file' not in request.files:
            logging.error("[UPLOAD] No file part in the request")
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        file = request.files['file']
        
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
            return jsonify({
                'success': True,
                'message': 'Document uploaded and processed successfully',
                'filename': filename
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
        # Secure the filename to prevent directory traversal
        filename = secure_filename(filename)
        file_path = os.path.join(os.path.dirname(__file__), 'policy_docs', filename)
        
        logging.info(f"[REMOVE] Request to remove document: {filename}")
        
        # Check if the file exists
        if not os.path.isfile(file_path):
            logging.error(f"[REMOVE] File not found: {file_path}")
            return jsonify({
                "success": False,
                "error": f"Document '{filename}' not found"
            }), 404
        
        # Get request body if any
        data = request.get_json() if request.is_json else {}
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
                os.remove(file_path)
                logging.info(f"[REMOVE] Successfully deleted file: {file_path}")
            except Exception as e:
                file_error = f"Error deleting file: {str(e)}"
                logging.error(f"[REMOVE] {file_error}", exc_info=True)
            # Reload the RAG database after delete
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

# Determine if a query should be answered directly by LLM without RAG
def should_use_direct_response(query):
    """
    Analyze a query to determine if it should be answered directly.
    Returns True for general knowledge questions, math, etc.
    Returns False for policy or domain-specific questions.
    """
    # List of keywords that suggest policy-related questions - ALWAYS use RAG for these
    policy_keywords = [
        "dwp", "department", "pension", "benefit", "allowance", "payment", 
        "claim", "eligibility", "application", "policy", "funeral", "expense",
        "support", "government", "entitlement", "welfare", "requirements",
        "form", "application", "apply", "bereavement"
    ]
    
    # Normalize query
    query_lower = query.lower()
    
    # If query contains policy keywords, ALWAYS prefer RAG
    if any(keyword in query_lower for keyword in policy_keywords):
        logging.info("[CHAT] Detected policy-related question, will prioritize RAG")
        return False  # Don't use direct LLM, try RAG first
    
    # List of keywords that suggest news-related questions
    news_keywords = [
        "news", "headlines", "bbc", "cnn", "today", "latest", "breaking", 
        "update", "article", "report", "story", "broadcast"
    ]
    
    # Check for news-related questions
    if any(keyword in query_lower for keyword in news_keywords):
        logging.info("[CHAT] Detected news-related question, will use web search")
        return False  # Don't use direct LLM, let it fall through to web search
    
    # Check for math questions
    math_patterns = ["+", "-", "*", "/", "plus", "minus", "multiply", "divide", "=", "equals", "calculate"]
    is_math = any(pattern in query_lower for pattern in math_patterns)
    if is_math:
        logging.info("[CHAT] Detected math question, using direct LLM")
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
    return False

# Agent state and tools setup
class AgentState(TypedDict):
    input: str
    chat_history: list
    intermediate_steps: list

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
def create_rag_response(query, conversation_history=None):
    global rag_db
    if rag_db is None:
        load_rag_database()
    
    if rag_db is None:
        logging.error("[AGENT] RAG database not loaded, cannot create response")
        return None, []
    
    try:
        # Initialize LLM for response generation
        llm = ChatOpenAI(temperature=0, openai_api_key=openai_key)
        
        # Perform a similarity search to get relevant documents
        # If we have conversation history, include recent questions in the search query
        search_query = query
        if conversation_history:
            # Get up to 3 most recent user messages to enhance the context
            recent_queries = []
            for message in reversed(conversation_history):
                if message["role"] == "user" and len(recent_queries) < 3:
                    recent_queries.append(message["content"])
            
            if recent_queries:
                # Combine the current query with recent queries for better context
                search_query = f"{query} {' '.join(recent_queries)}"
                logging.info(f"[AGENT] Enhanced search query with conversation history: {search_query}")
        
        relevant_docs = rag_db.similarity_search_with_score(search_query, k=6)
        
        # Filter docs by relevance score (lower is better in OpenAI embeddings)
        # Only use docs with score below threshold (more relevant)
        threshold = 0.3  # Adjusted threshold to be more lenient for policy questions
        filtered_docs = [doc for doc, score in relevant_docs if score < threshold]
        
        if not filtered_docs:
            logging.info(f"[AGENT] No sufficiently relevant documents found in RAG database (threshold: {threshold})")
            return None, []
        
        # Format the context from the documents
        context = "\n\n".join([f"Document: {doc.metadata.get('source_doc', 'Unknown')}\n{doc.page_content}" for doc in filtered_docs])
        
        # Format messages for the chat model
        messages = []
        
        # Add system prompt with context
        messages.append({
            "role": "system", 
            "content": f"""You are a helpful assistant for DWP (Department for Work and Pensions) policy questions.
Use the following information from policy documents to answer the user's question:

{context}

Provide concise, accurate answers based only on the information provided above. If the information doesn't contain a clear answer, say so.
Maintain conversation context and handle follow-up questions appropriately.
"""
        })
        
        # Add conversation history if available
        if conversation_history:
            # Add only the most recent conversation turns (limit to 5 for context window)
            recent_history = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history
            messages.extend(recent_history)
        
        # Add current query if not already included
        if not messages or messages[-1]["role"] != "user":
            messages.append({"role": "user", "content": query})
        
        logging.info(f"[AGENT] Using RAG with {len(messages)} message history")
        
        response = llm.invoke(messages)
        
        logging.info(f"[AGENT] Successfully created RAG response with {len(relevant_docs)} documents")
        return response.content, relevant_docs
    except Exception as e:
        logging.error(f"[AGENT] Error creating RAG response: {e}", exc_info=True)
        return None, []

@app.route('/ai-agent/chat', methods=['POST'])
def chat():
    global rag_db
    try:
        # Get input from request
        data = request.get_json()
        if not data or 'input' not in data:
            return jsonify({
                'success': False,
                'error': 'Invalid request, missing input'
            }), 400
        
        user_input = data['input']
        logging.info(f"[CHAT] Received chat request: {user_input}")
        
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
        
        # Analyze the query to decide the best approach
        is_general_knowledge = should_use_direct_response(user_input)
        
        # For general knowledge questions, try direct LLM first
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
                
                logging.info(f"[CHAT] Using direct LLM with {len(messages)} message history")
                
                # Use chat messages format instead of single prompt
                direct_response = chat_model.invoke(messages)
                response = direct_response.content
                source = "direct_llm"
                logging.info("[CHAT] Generated direct LLM response for general knowledge question")
                
                # Return early - no need to try RAG or web search
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
        
        # If RAG approach didn't yield results, try web search if available
        if not response and web_search:
            try:
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

# Serve the main UI at the root URL
@app.route('/')
def index():
    return render_template('index.html')

def guess_document_type_from_filename(filename):
    """
    Guess the document type based on filename patterns
    """
    filename = filename.lower()
    
    # Check for common document type keywords
    if 'death' in filename or 'deceased' in filename:
        return "Death Certificate"
    elif 'funeral' in filename or 'burial' in filename:
        return "Funeral Bill"
    elif 'benefit' in filename or 'payment' in filename or 'allowance' in filename:
        return "Proof of Benefits"
    elif 'relation' in filename or 'family' in filename:
        return "Proof of Relationship"
    elif 'responsibility' in filename or 'respons' in filename:
        return "Proof of Responsibility"
    elif 'bill' in filename or 'invoice' in filename:
        return "Bill or Invoice"
    elif 'id' in filename or 'passport' in filename or 'license' in filename:
        return "Identification Document"
    else:
        return "Unknown Document"

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
                    },
                    "_fileType": {
                        "value": guess_document_type_from_filename(fname),
                        "reasoning": "Inferred from filename"
                    }
                }
                
                # Add some fields based on the filename to help with form matching
                filename_parts = fname.split('_')
                if len(filename_parts) > 1:
                    # Extract file type and description from the filename
                    if "death" in fname.lower() or "certificate" in fname.lower():
                        warning_result["_documentType"] = {
                            "value": "Death Certificate",
                            "reasoning": "Inferred from filename containing 'death' or 'certificate'"
                        }
                    elif "letter" in fname.lower() or "work" in fname.lower() or "pension" in fname.lower():
                        warning_result["_documentType"] = {
                            "value": "Benefit Letter",
                            "reasoning": "Inferred from filename containing 'letter', 'work', or 'pension'"
                        }
                    elif "invoice" in fname.lower() or "funeral" in fname.lower() or "bill" in fname.lower():
                        warning_result["_documentType"] = {
                            "value": "Funeral Invoice",
                            "reasoning": "Inferred from filename containing 'invoice', 'funeral', or 'bill'"
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
                extracted[fname] = json.dumps({
                    "_error": {
                        "value": "AI service unavailable - API key missing",
                        "reasoning": "The OpenAI API key is not configured. Please check server configuration."
                    },
                    "_fileType": {
                        "value": guess_document_type_from_filename(fname),
                        "reasoning": "Inferred from filename"
                    }
                })
                continue
                
            llm = ChatOpenAI(
                model_name="gpt-3.5-turbo",
                temperature=0.0,
                openai_api_key=openai_key
            )
            
            try:
                response = llm.invoke(prompt)
                extracted[fname] = str(response.content) if hasattr(response, 'content') else str(response)
                logging.info(f"[EXTRACT] Extraction result for {fname}: {extracted[fname]}")
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
