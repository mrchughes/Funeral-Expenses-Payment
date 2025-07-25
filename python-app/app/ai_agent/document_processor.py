import os
import json
import tempfile
from werkzeug.utils import secure_filename
import ocr_utils
import logging

class DocumentProcessor:
    def __init__(self, upload_folder=None):
        self.upload_folder = upload_folder or os.path.join(tempfile.gettempdir(), 'uploads')
        os.makedirs(self.upload_folder, exist_ok=True)
        logging.info(f"[OCR] Document processor initialized with upload folder: {self.upload_folder}")
        
    def save_uploaded_file(self, file):
        """
        Save an uploaded file to disk and return the file path
        """
        if not file:
            return None
        filename = secure_filename(file.filename)
        file_path = os.path.join(self.upload_folder, filename)
        file.save(file_path)
        logging.info(f"[OCR] Saved uploaded file: {file_path}")
        return file_path
        
    def process_file(self, file_path):
        """
        Process a document file and extract its content
        """
        if not os.path.exists(file_path):
            logging.error(f"[OCR] File not found: {file_path}")
            return {"success": False, "error": "File not found"}
        try:
            logging.info(f"[OCR] Processing file: {file_path}")
            # Extract text from document
            raw_text = ocr_utils.process_document(file_path)
            
            # Check if the result is an error message string
            if isinstance(raw_text, str) and raw_text.startswith("Error"):
                logging.error(f"[OCR] Processing error: {raw_text}")
                return {"success": False, "error": raw_text}
                
            # Clean and normalize text
            cleaned_text = ocr_utils.clean_extracted_text(raw_text)
            # Extract metadata
            metadata = ocr_utils.extract_document_metadata(file_path)
            
            # Log the results for debugging
            logging.info(f"[OCR] Raw text length: {len(raw_text)}, Cleaned text length: {len(cleaned_text)}")
            if len(cleaned_text) > 0:
                logging.info(f"[OCR] Sample of cleaned text: {cleaned_text[:100]}...")
                
            result = {
                "success": True,
                "metadata": metadata,
                "text": cleaned_text,
                "text_length": len(cleaned_text)
            }
            
            logging.info(f"[OCR] Successfully processed file: {file_path}, text length: {len(cleaned_text)}")
            return result
        except Exception as e:
            logging.error(f"[OCR] Error processing file {file_path}: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
        except Exception as e:
            logging.error(f"[OCR] Error processing file {file_path}: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
            
    def batch_process_files(self, file_paths):
        """
        Process multiple document files
        """
        results = {}
        for file_path in file_paths:
            if os.path.exists(file_path):
                results[os.path.basename(file_path)] = self.process_file(file_path)
            else:
                results[os.path.basename(file_path)] = {"error": "File not found"}
        return results
