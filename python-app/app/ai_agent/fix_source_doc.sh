#!/bin/bash
# Script to fix the document source attribution and rebuild the RAG database

# First, make sure source document is properly set in the source code
cat > /app/ai_agent/fix_source_doc.py << 'EOF'
import os
import sys
import logging
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

# Load environment variables
load_dotenv()
openai_key = os.environ.get("OPENAI_API_KEY")

if not openai_key:
    logging.error("OPENAI_API_KEY is not set in the environment.")
    sys.exit(1)

script_dir = os.path.dirname(os.path.abspath(__file__))
policy_docs_path = os.path.join(script_dir, "policy_docs")
persist_dir = os.path.join(script_dir, "chroma_db")

def fix_source_doc():
    """Force direct update of metadata to assign source document correctly"""
    try:
        # Get list of actual documents
        actual_docs = []
        for filename in os.listdir(policy_docs_path):
            if filename.lower().endswith(('.pdf', '.docx', '.txt')):
                file_path = os.path.join(policy_docs_path, filename)
                if os.path.isfile(file_path):
                    actual_docs.append(filename)
        
        if not actual_docs:
            logging.error("No documents found in policy_docs directory")
            return False
            
        logging.info(f"Found documents: {actual_docs}")
        
        # Since there's only one document, assign all chunks to it
        if len(actual_docs) == 1:
            target_doc = actual_docs[0]
            logging.info(f"Will assign all chunks to document: {target_doc}")
            
            # Load the database
            embeddings = OpenAIEmbeddings(openai_api_key=openai_key)
            db = Chroma(persist_directory=persist_dir, embedding_function=embeddings)
            
            # Get all document IDs and current metadata
            db_data = db.get(include=['metadatas', 'documents', 'embeddings', 'ids'])
            
            if not db_data or 'ids' not in db_data or not db_data['ids']:
                logging.error("No documents found in the database")
                return False
                
            # Create new collection with corrected metadata
            logging.info(f"Found {len(db_data['ids'])} chunks in database")
            
            # Make a backup of the current database
            import shutil
            import time
            backup_dir = persist_dir + "_backup_" + str(int(time.time()))
            shutil.copytree(persist_dir, backup_dir)
            logging.info(f"Created backup at {backup_dir}")
            
            # Remove existing database
            shutil.rmtree(persist_dir)
            logging.info("Removed existing database")
            
            # Create new database with correct metadata
            os.makedirs(persist_dir, exist_ok=True)
            
            # Create new documents with correct metadata
            from langchain_core.documents import Document
            
            corrected_docs = []
            for i, doc_content in enumerate(db_data['documents']):
                # Get original metadata and modify it
                metadata = db_data['metadatas'][i].copy() if i < len(db_data['metadatas']) else {}
                metadata['source_doc'] = target_doc
                metadata['source_path'] = os.path.join(policy_docs_path, target_doc)
                
                if target_doc.endswith('.pdf'):
                    metadata['doc_type'] = 'pdf'
                elif target_doc.endswith('.docx'):
                    metadata['doc_type'] = 'docx'
                elif target_doc.endswith('.txt'):
                    metadata['doc_type'] = 'txt'
                
                # Create Document object
                doc = Document(page_content=doc_content, metadata=metadata)
                corrected_docs.append(doc)
            
            logging.info(f"Created {len(corrected_docs)} corrected documents")
            
            # Create new database
            new_db = Chroma.from_documents(
                corrected_docs,
                embeddings,
                persist_directory=persist_dir
            )
            new_db.persist()
            
            # Verify the fix
            db_data = new_db.get(include=['metadatas'])
            source_counts = {}
            for meta in db_data['metadatas']:
                source = meta.get('source_doc', 'unknown')
                source_counts[source] = source_counts.get(source, 0) + 1
                
            logging.info(f"Source distribution after fix: {source_counts}")
            
            return True
    except Exception as e:
        logging.error(f"Error fixing source documents: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    if fix_source_doc():
        logging.info("Successfully fixed source document attribution")
    else:
        logging.error("Failed to fix source document attribution")
        sys.exit(1)
EOF

# Run the fix script
python /app/ai_agent/fix_source_doc.py

# Check if the fix was successful
echo "Verifying database with fix applied..."
python /app/ai_agent/verify_rag_db.py
