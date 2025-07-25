import os
from langchain_community.document_loaders import DirectoryLoader, PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from dotenv import load_dotenv
import logging
import shutil
import time
import sys

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
# Get directory path relative to the script location
script_dir = os.path.dirname(os.path.abspath(__file__))
policy_docs_path = os.path.join(script_dir, "policy_docs")
persist_dir = os.path.join(script_dir, "chroma_db")

logging.info(f"Ingesting documents from: {policy_docs_path}")
logging.info(f"Persisting to: {persist_dir}")

# Ensure the docs directory exists
os.makedirs(policy_docs_path, exist_ok=True)

# Check if there are any documents to process
doc_files = []
for root, _, files in os.walk(policy_docs_path):
    for file in files:
        if file.endswith(('.pdf', '.docx', '.txt')):
            doc_files.append(os.path.join(root, file))
            logging.info(f"FOUND DOCUMENT TO PROCESS: {os.path.join(root, file)}")

logging.info(f"TOTAL DOCUMENTS TO PROCESS: {len(doc_files)}")

if not doc_files:
    logging.warning(f"No documents found in {policy_docs_path}. Ingestion aborted.")
    
    # If there are no documents but the vector DB exists, we should clear it
    if os.path.exists(persist_dir):
        try:
            # Create a backup just in case
            backup_dir = persist_dir + "_backup_empty"
            if os.path.exists(backup_dir):
                shutil.rmtree(backup_dir)
            shutil.copytree(persist_dir, backup_dir)
            
            # Remove the database
            shutil.rmtree(persist_dir)
            logging.info(f"No documents found, cleared existing vector database at {persist_dir}")
        except Exception as e:
            logging.error(f"Error clearing vector database: {e}")
    
    exit(0)

# Load all docs
def get_loader(p):
    logging.info(f"Loading file: {p}")
    try:
        if p.endswith(".pdf"):
            return PyPDFLoader(p)
        elif p.endswith(".docx"):
            return Docx2txtLoader(p)
        else:
            return TextLoader(p)
    except Exception as e:
        logging.error(f"Error creating loader for {p}: {e}")
    return None

# Only rebuild the DB if an environment variable FORCE_REBUILD is set
force_rebuild = os.getenv("FORCE_REBUILD", "false").lower() == "true"
if force_rebuild and os.path.exists(persist_dir):
    try:
        backup_dir = persist_dir + "_backup_" + str(int(time.time()))
        if os.path.exists(backup_dir):
            shutil.rmtree(backup_dir)
        shutil.copytree(persist_dir, backup_dir)
        logging.info(f"[REBUILD] Created backup of existing vector database at {backup_dir}")
        shutil.rmtree(persist_dir)
        logging.info(f"[REBUILD] Removed existing database for clean rebuild")
        os.makedirs(persist_dir, mode=0o777, exist_ok=True)
        os.chmod(persist_dir, 0o777)
        logging.info(f"[REBUILD] Created database directory with permissive permissions")
    except Exception as e:
        logging.error(f"[REBUILD] Error managing vector database: {e}", exc_info=True)

# Process documents
try:
    logging.info(f"Found {len(doc_files)} document(s) to process")
    
    # Set permissive permissions on all document files to ensure they can be read
    for file_path in doc_files:
        try:
            os.chmod(file_path, 0o666)
        except Exception as perm_err:
            logging.warning(f"Could not set permissions on file {file_path}: {perm_err}")
    
    # Process files individually to handle errors better
    all_docs = []
    for file_path in doc_files:
        try:
            file_name = os.path.basename(file_path)
            logging.info(f"Processing file: {file_name}")
            
            if file_path.endswith(".pdf"):
                loader = PyPDFLoader(file_path)
            elif file_path.endswith(".docx"):
                loader = Docx2txtLoader(file_path)
            elif file_path.endswith(".txt"):
                loader = TextLoader(file_path)
            else:
                logging.warning(f"Unsupported file type: {file_path}, skipping")
                continue
                
            file_docs = loader.load()
            
            # Add explicit document source to each page
            for doc in file_docs:
                if 'metadata' not in doc:
                    doc.metadata = {}
                doc.metadata['source_doc'] = file_name
                doc.metadata['source_path'] = file_path
            
            logging.info(f"Successfully loaded {len(file_docs)} page(s) from {file_name}")
            all_docs.extend(file_docs)
        except Exception as file_error:
            logging.error(f"Error loading {file_path}: {file_error}", exc_info=True)
            # Continue with other files

    if len(all_docs) == 0:
        logging.warning("No documents were successfully loaded. Check file formats and permissions.")
        print("ERROR: No documents were successfully loaded. Check file formats and permissions.")
        exit(1)
    
    logging.info(f"Successfully loaded {len(all_docs)} total document page(s)")
        
except Exception as e:
    logging.error(f"Error loading documents: {e}", exc_info=True)
    print(f"ERROR: Failed to load documents: {e}")
    exit(1)

# Split
try:
    logging.info("Starting document splitting...")
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    splits = splitter.split_documents(all_docs)
    
    # Add enhanced metadata to each chunk
    logging.info(f"Adding enhanced metadata to {len(splits)} chunks")
    for chunk in splits:
        # Ensure metadata is present
        if not hasattr(chunk, 'metadata') or chunk.metadata is None:
            chunk.metadata = {}
            
        # IMPORTANT: Explicitly set source_doc from the original document's metadata
        # This is the critical fix to ensure proper attribution
        source_path = chunk.metadata.get('source', '')
        source_doc = chunk.metadata.get('source_doc', '')
        
        # If source_doc is already set from the document loader, keep it
        if source_doc and source_doc != 'unknown':
            # Make sure we have the source_path as well
            if not chunk.metadata.get('source_path'):
                chunk.metadata['source_path'] = source_path
        # Otherwise try to extract it from the source path
        elif source_path:
            chunk.metadata['source_doc'] = os.path.basename(source_path)
            chunk.metadata['source_path'] = source_path
        else:
            # As a last resort, keep it as unknown
            chunk.metadata['source_doc'] = 'unknown'
            
        # Extract document type
        if source_path:
            if source_path.endswith('.pdf'):
                chunk.metadata['doc_type'] = 'pdf'
            elif source_path.endswith('.docx'):
                chunk.metadata['doc_type'] = 'docx'
            elif source_path.endswith('.txt'):
                chunk.metadata['doc_type'] = 'txt'
            else:
                chunk.metadata['doc_type'] = 'unknown'
        else:
            chunk.metadata['doc_type'] = 'unknown'
            
        # Add chunk size metadata
        chunk.metadata['chunk_size'] = len(chunk.page_content)
        
        # Check for potentially empty chunks
        if len(chunk.page_content.strip()) < 10:
            logging.warning(f"Found potentially empty chunk from {chunk.metadata.get('source_doc', 'unknown')}")
            
    logging.info(f"Successfully split into {len(splits)} chunks with enhanced metadata")
except Exception as e:
    logging.error(f"Error splitting documents: {e}", exc_info=True)
    exit(1)    # Embed and store
openai_key = os.getenv("OPENAI_API_KEY")
if not openai_key:
    logging.error("OPENAI_API_KEY is not set in the environment.")
    raise ValueError("OPENAI_API_KEY is not set in the environment.")

try:
    # Create a new vector database or load existing
    embeddings = OpenAIEmbeddings(openai_api_key=openai_key)
    
    # Ensure database directory exists with proper permissions
    if not os.path.exists(persist_dir):
        os.makedirs(persist_dir, mode=0o777, exist_ok=True)
    
    # Always set permissive permissions on the database directory
    try:
        os.chmod(persist_dir, 0o777)
        # Fix permissions on all files and directories
        for root, dirs, files in os.walk(persist_dir):
            for d in dirs:
                try:
                    os.chmod(os.path.join(root, d), 0o777)
                except Exception as e:
                    logging.warning(f"Could not set permissions on directory {d}: {e}")
            for f in files:
                try:
                    os.chmod(os.path.join(root, f), 0o666)
                except Exception as e:
                    logging.warning(f"Could not set permissions on file {f}: {e}")
        logging.info(f"Applied permissive permissions to database directory {persist_dir}")
    except Exception as perm_err:
        logging.warning(f"Could not fix permissions on database directory: {perm_err}")
    
    # Check if we have an existing database
    if os.path.exists(persist_dir) and os.path.isdir(persist_dir) and any(os.scandir(persist_dir)):
        logging.info(f"Loading existing vector database from {persist_dir}")
        
        # Fix permissions on existing database directory
        try:
            os.chmod(persist_dir, 0o777)
            # Fix permissions on all files and directories
            for root, dirs, files in os.walk(persist_dir):
                for d in dirs:
                    try:
                        os.chmod(os.path.join(root, d), 0o777)
                    except Exception as e:
                        logging.warning(f"Could not set permissions on directory {d}: {e}")
                for f in files:
                    try:
                        os.chmod(os.path.join(root, f), 0o666)
                    except Exception as e:
                        logging.warning(f"Could not set permissions on file {f}: {e}")
            logging.info(f"Fixed permissions on existing database directory {persist_dir}")
        except Exception as perm_err:
            logging.warning(f"Could not fix permissions on database directory: {perm_err}")
            
        try:
            # Load the existing database
            db = Chroma(persist_directory=persist_dir, embedding_function=embeddings)
            
            # Get existing documents to check what's already ingested
            existing_db_data = db.get()
            existing_sources = set()
            if existing_db_data and 'metadatas' in existing_db_data:
                for meta in existing_db_data.get('metadatas', []):
                    if meta and 'source_doc' in meta:
                        existing_sources.add(meta.get('source_doc'))
            
            logging.info(f"Found {len(existing_sources)} document sources in existing database")
            
            # Filter out chunks from documents that are already in the database
            # to avoid duplicate ingestion
            new_splits = []
            for chunk in splits:
                source_doc = chunk.metadata.get('source_doc', 'unknown')
                if source_doc not in existing_sources:
                    new_splits.append(chunk)
            
            logging.info(f"Adding {len(new_splits)} new chunks to existing database")
            
            if new_splits:
                # Add new documents to existing database
                db.add_documents(new_splits)
                logging.info(f"Successfully added {len(new_splits)} new chunks to existing database")
            else:
                logging.info("No new documents to add to the database")
                
            # Persist changes
            # db.persist() removed for Chroma 0.4.x+
        except Exception as load_err:
            logging.error(f"Error loading existing database: {load_err}. Creating new one.", exc_info=True)
            
            # If loading fails, create a new database
            os.makedirs(persist_dir, exist_ok=True)
            db = Chroma.from_documents(splits, embeddings, persist_directory=persist_dir)
            # db.persist() removed for Chroma 0.4.x+
            logging.info(f"Created new Chroma database with {len(splits)} chunks after failed load")
    else:
        # Create directory if it doesn't exist
        os.makedirs(persist_dir, mode=0o777, exist_ok=True)
        # Make the directory writable by everyone to avoid permission issues
        os.chmod(persist_dir, 0o777)
        logging.info(f"Creating new vector database directory at {persist_dir} with permissive permissions")

        # Log per-document breakdown before creating DB
        doc_breakdown = {}
        for chunk in splits:
            source = chunk.metadata.get('source_doc', 'unknown')
            doc_breakdown[source] = doc_breakdown.get(source, 0) + 1
        logging.info(f"DOCUMENT CHUNK BREAKDOWN: {doc_breakdown}")
        logging.info(f"TOTAL CHUNKS TO ADD: {len(splits)}")
        
        # Create new database from documents
        logging.info("Creating new Chroma database from documents...")
        db = Chroma.from_documents(splits, embeddings, persist_directory=persist_dir)
        # db.persist() removed for Chroma 0.4.x+
        
        # Set permissive permissions on all created files
        for root, dirs, files in os.walk(persist_dir):
            for d in dirs:
                try:
                    os.chmod(os.path.join(root, d), 0o777)
                except Exception as e:
                    logging.warning(f"Could not set permissions on directory {d}: {e}")
            for f in files:
                try:
                    os.chmod(os.path.join(root, f), 0o666)
                except Exception as e:
                    logging.warning(f"Could not set permissions on file {f}: {e}")
                    
        logging.info(f"Successfully created and persisted new Chroma database with {len(splits)} chunks")
    
    # Verify the database was created successfully
    try:
        # Check that we can read from the database
        db_data = db.get()
        if db_data and 'documents' in db_data:
            doc_count = len(db_data['documents'])
            logging.info(f"VERIFICATION: Database contains {doc_count} chunks")
            
            # Verify chunk count matches what we expected
            if doc_count == len(splits):
                logging.info(f"VERIFICATION PASSED: All {len(splits)} chunks were stored correctly")
            else:
                logging.error(f"VERIFICATION FAILED: Expected {len(splits)} chunks but found {doc_count}")
                
            # Check for empty or problematic chunks
            empty_chunks = sum(1 for doc in db_data['documents'] if not doc or len(doc) < 10)
            if empty_chunks > 0:
                logging.warning(f"FOUND {empty_chunks} potentially problematic chunks with minimal content")
        else:
            logging.error("CRITICAL ERROR: Database created but is empty or invalid")
    except Exception as verify_err:
        logging.error(f"Error verifying database content: {verify_err}", exc_info=True)
    
    # Print message to standard output for subprocess capture
    print(f"SUCCESS: Ingestion complete. Indexed {len(splits)} chunks into vector database.")
except Exception as e:
    logging.error(f"Error during embedding or storage: {e}", exc_info=True)
    # Restore from backup if available
    most_recent_backup = None
    max_time = 0
    
    # Find the most recent backup
    for dir_name in os.listdir(script_dir):
        if dir_name.startswith("chroma_db_backup_"):
            try:
                timestamp = int(dir_name.split("_")[-1])
                if timestamp > max_time:
                    max_time = timestamp
                    most_recent_backup = os.path.join(script_dir, dir_name)
            except (ValueError, IndexError):
                continue
    
    if most_recent_backup:
        try:
            logging.info(f"Attempting to restore from most recent backup: {most_recent_backup}")
            if os.path.exists(persist_dir):
                shutil.rmtree(persist_dir)
            shutil.copytree(most_recent_backup, persist_dir)
            logging.info(f"Restored vector database from backup")
        except Exception as restore_err:
            logging.error(f"Error restoring from backup: {restore_err}")
    exit(1)
