"""
Document extraction with intelligent field mapping API endpoints
"""
import logging
import os
import json
from flask import Blueprint, request, jsonify
from .ai_agent.document_classifier import DocumentClassifier
from .ai_agent.intelligent_mapper import IntelligentMapper
from .ai_agent.openai_extraction import OpenAIExtractor

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create blueprint
document_extraction_bp = Blueprint('document_extraction', __name__)

# Initialize components
document_classifier = DocumentClassifier()
intelligent_mapper = IntelligentMapper()
openai_extractor = OpenAIExtractor()

@document_extraction_bp.route('/api/extract-document', methods=['POST'])
def extract_document():
    """
    Extract information from a document with intelligent field mapping
    
    Expected request body (multipart/form-data):
    - file: The document file to extract from
    - context: (optional) JSON string with context data
    
    Returns:
    {
        "extractedData": {
            "formField1": {"value": "value1", "reasoning": "reasoning1", "confidence": 0.95},
            "formField2": {"value": "value2", "reasoning": "reasoning2", "confidence": 0.87},
            ...
        },
        "documentType": "detected_document_type",
        "confidenceScores": {
            "formField1": 0.95,
            "formField2": 0.87,
            ...
        }
    }
    """
    try:
        # Ensure file was uploaded
        if 'file' not in request.files:
            return jsonify({
                'error': 'No file provided',
                'details': 'Request must include a file'
            }), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'error': 'No file selected',
                'details': 'A file must be selected'
            }), 400
            
        # Get context data if provided
        context_data = {}
        if 'context' in request.form:
            try:
                context_data = json.loads(request.form['context'])
            except json.JSONDecodeError:
                logger.warning("Invalid context JSON provided, ignoring context")
        
        # Save file temporarily
        temp_path = f"/tmp/{file.filename}"
        file.save(temp_path)
        
        try:
            # Extract text from document using OCR or appropriate method
            # For PDF, images, etc. - would need additional libraries
            extracted_text = openai_extractor.extract_text_from_document(temp_path)
            
            # Detect document type
            document_type = document_classifier.detect_document_type(
                extracted_text, 
                file.filename
            )
            
            # Extract fields using OpenAI
            extracted_fields = openai_extractor.extract_fields_from_text(
                extracted_text,
                document_type,
                context_data
            )
            
            # Apply intelligent mapping with context
            mapped_fields = intelligent_mapper.map_extracted_data(
                extracted_fields,
                document_type,
                context_data
            )
            
            # Add document type to result
            mapped_fields['_documentType'] = {
                'value': document_type.replace('_', ' ').title(),
                'reasoning': f"Detected based on document content and patterns"
            }
            
            return jsonify({
                'extractedData': mapped_fields,
                'documentType': document_type,
                'rawText': extracted_text[:1000] + ('...' if len(extracted_text) > 1000 else '')
            }), 200
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    except Exception as e:
        logger.error(f"Error in document extraction: {str(e)}")
        return jsonify({
            'error': 'Document extraction failed',
            'details': str(e)
        }), 500

class OpenAIExtractor:
    """
    Placeholder class for OpenAI extraction functionality
    Replace with your actual implementation or import the real class
    """
    
    def extract_text_from_document(self, document_path):
        """Placeholder for text extraction from document"""
        # In a real implementation, this would use OCR or PDF text extraction
        with open(document_path, 'rb') as f:
            # Just return first few bytes as text for demo purposes
            return f"Sample text extracted from {document_path}"
            
    def extract_fields_from_text(self, text, document_type, context_data=None):
        """Placeholder for field extraction using OpenAI"""
        # In a real implementation, this would call OpenAI API
        return {
            "sample_field": {
                "value": "Sample value",
                "reasoning": "This is a placeholder"
            }
        }
