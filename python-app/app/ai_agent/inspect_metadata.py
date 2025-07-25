#!/usr/bin/env python
"""
Metadata Inspector for RAG Database
===================================
This script inspects the metadata of all chunks in the RAG database
and provides a detailed breakdown by source document.
"""

import os
import sys
import logging
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
persist_dir = os.path.join(script_dir, "chroma_db")

def inspect_metadata():
    """Inspect metadata of all chunks in the database"""
    if not os.path.exists(persist_dir):
        logging.error(f"Database directory not found: {persist_dir}")
        return False
        
    try:
        # Initialize embeddings
        embeddings = OpenAIEmbeddings(openai_api_key=openai_key)
        
        # Load the database
        db = Chroma(persist_directory=persist_dir, embedding_function=embeddings)
        logging.info(f"Loaded Chroma database from {persist_dir}")
        
        # Get all metadatas
        db_data = db.get(include=['metadatas'])
        
        if not db_data or 'metadatas' not in db_data or not db_data['metadatas']:
            logging.error(f"Database exists but contains no documents")
            return False
            
        # Count by source document
        source_counts = {}
        unknown_count = 0
        
        for meta in db_data['metadatas']:
            source = meta.get('source_doc', 'unknown')
            source_counts[source] = source_counts.get(source, 0) + 1
            if source == 'unknown':
                unknown_count += 1
        
        # Display results
        logging.info(f"Total chunks in database: {len(db_data['metadatas'])}")
        logging.info(f"Chunks by source document:")
        
        for source, count in sorted(source_counts.items()):
            percentage = (count / len(db_data['metadatas'])) * 100
            logging.info(f"  - {source}: {count} chunks ({percentage:.1f}%)")
            
        if unknown_count:
            unknown_percentage = (unknown_count / len(db_data['metadatas'])) * 100
            logging.warning(f"WARNING: {unknown_count} chunks ({unknown_percentage:.1f}%) have unknown source")
            
        # Display first few chunk metadatas for inspection
        logging.info("Sample chunk metadata for verification:")
        for i, meta in enumerate(db_data['metadatas'][:5]):
            logging.info(f"Chunk {i+1} metadata: {meta}")
            
        return True
    except Exception as e:
        logging.error(f"Error inspecting metadata: {e}")
        return False

if __name__ == "__main__":
    if inspect_metadata():
        logging.info("Metadata inspection completed successfully")
    else:
        logging.error("Failed to inspect metadata")
        sys.exit(1)
