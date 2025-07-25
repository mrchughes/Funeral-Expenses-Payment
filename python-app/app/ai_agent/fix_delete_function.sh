#!/bin/bash
# Fix the function definition issue in main.py

cat > /app/ai_agent/patches/fix_delete_function.py << 'EOF'
#!/usr/bin/env python
"""
Fix delete_document_chunks function in main.py
"""

import os
import sys
import re

def fix_main_py():
    main_py_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "main.py")
    
    with open(main_py_path, 'r') as f:
        content = f.read()
    
    # Find where the delete_document_chunks function is called
    call_pattern = r'success, message, deleted_count = delete_document_chunks\(filename\)'
    call_match = re.search(call_pattern, content)
    
    if not call_match:
        print("ERROR: Could not find delete_document_chunks function call")
        return False
    
    # Function definition to insert before the call
    function_def = """
# Function to selectively delete chunks from a specific document
def delete_document_chunks(document_name):
    \"\"\"
    Selectively delete chunks from a specific document without rebuilding the entire database.
    
    Args:
        document_name (str): The filename of the document whose chunks should be deleted
    
    Returns:
        tuple: (success, message, deleted_count)
    \"\"\"
    try:
        global rag_db
        if rag_db is None:
            logging.warning(f"[DELETE-CHUNKS] No RAG database loaded, nothing to delete for {document_name}")
            return False, "No RAG database loaded", 0
            
        # Get all document IDs and metadatas
        logging.info(f"[DELETE-CHUNKS] Preparing to delete chunks for document: {document_name}")
        db_data = rag_db.get(include=['metadatas', 'ids'])
        
        if not db_data or 'ids' not in db_data or not db_data['ids']:
            logging.warning(f"[DELETE-CHUNKS] RAG database is empty, nothing to delete")
            return True, "Database is empty, nothing to delete", 0
            
        # Find IDs of chunks that belong to the document being deleted
        chunk_ids_to_delete = []
        for i, meta in enumerate(db_data.get('metadatas', [])):
            source_doc = meta.get('source_doc', 'unknown')
            
            # If this chunk belongs to the document we're deleting
            if source_doc == document_name:
                if i < len(db_data.get('ids', [])):
                    chunk_ids_to_delete.append(db_data['ids'][i])
                    
        # If no chunks found for this document
        if not chunk_ids_to_delete:
            logging.warning(f"[DELETE-CHUNKS] No chunks found for document: {document_name}")
            return True, f"No chunks found for document {document_name}", 0
            
        # Delete the chunks from the vector database
        logging.info(f"[DELETE-CHUNKS] Deleting {len(chunk_ids_to_delete)} chunks for document: {document_name}")
        rag_db.delete(ids=chunk_ids_to_delete)
        
        # Persist changes to disk
        try:
            rag_db.persist()
        except Exception as persist_err:
            logging.warning(f"[DELETE-CHUNKS] Persist warning (can be ignored for newer Chroma versions): {persist_err}")
            
        logging.info(f"[DELETE-CHUNKS] Successfully deleted {len(chunk_ids_to_delete)} chunks for document: {document_name}")
        
        return True, f"Successfully deleted {len(chunk_ids_to_delete)} chunks", len(chunk_ids_to_delete)
    except Exception as e:
        logging.error(f"[DELETE-CHUNKS] Error deleting chunks for {document_name}: {e}", exc_info=True)
        return False, f"Error deleting chunks: {str(e)}", 0
"""
    
    # Find the delete_doc function where the call is made
    route_pattern = r'@ai_agent_bp\.route\(\'\/docs\/<filename>\', methods=\[\'DELETE\'\]\)[\s\S]*?def delete_doc\(filename\):[\s\S]*?# Check if this is a re-ingestion request'
    route_match = re.search(route_pattern, content)
    
    if not route_match:
        print("ERROR: Could not find delete_doc function")
        return False
    
    # Insert the function definition before the delete_doc function
    function_pos = route_match.start()
    new_content = content[:function_pos] + function_def + content[function_pos:]
    
    # Remove any duplicate function definitions
    duplicate_pattern = r'# Function to selectively delete chunks from a specific document[\s\S]*?def delete_document_chunks\(document_name\):[\s\S]*?return False, f"Error deleting chunks: {str\(e\)}", 0\s*\n'
    all_matches = list(re.finditer(duplicate_pattern, new_content))
    
    if len(all_matches) > 1:
        # Keep only the first occurrence
        first_match = all_matches[0]
        for match in all_matches[1:]:
            new_content = new_content[:match.start()] + new_content[match.end():]
    
    # Write the modified content back to the file
    with open(main_py_path, 'w') as f:
        f.write(new_content)
    
    print(f"Successfully updated {main_py_path}")
    return True

if __name__ == "__main__":
    # Create directory if it doesn't exist
    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "patches"), exist_ok=True)
    
    if fix_main_py():
        print("Successfully fixed delete_document_chunks function in main.py")
    else:
        print("Failed to fix delete_document_chunks function in main.py")
        sys.exit(1)
EOF

# Create the patches directory
mkdir -p /app/ai_agent/patches

# Run the fix script
cd /app/ai_agent && python patches/fix_delete_function.py
