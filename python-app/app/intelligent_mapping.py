"""
API endpoint for intelligent mapping from extracted data to form fields
"""
import logging
from flask import Blueprint, request, jsonify
from .ai_agent.intelligent_mapper import IntelligentMapper

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create blueprint
intelligent_mapping_bp = Blueprint('intelligent_mapping', __name__)

@intelligent_mapping_bp.route('/api/intelligent-map', methods=['POST'])
def intelligent_map():
    """
    Maps extracted fields to form fields using the intelligent mapper
    
    Expected request body:
    {
        "extractedData": {
            "field1": {"value": "value1", "reasoning": "reasoning1"},
            "field2": {"value": "value2", "reasoning": "reasoning2"},
            ...
        },
        "documentType": "document_type",  # optional
        "contextData": {  # optional
            "deceasedName": "John Doe",
            "applicantName": "Jane Smith",
            "relationshipToDeceased": "partner",
            ...
        }
    }
    
    Returns:
    {
        "mappedData": {
            "formField1": {"value": "value1", "reasoning": "reasoning1", "confidence": 0.95},
            "formField2": {"value": "value2", "reasoning": "reasoning2", "confidence": 0.87},
            ...
        },
        "unmappedFields": ["field3", "field4", ...] # fields that couldn't be mapped
    }
    """
    try:
        data = request.json
        if not data or 'extractedData' not in data:
            return jsonify({
                'error': 'Missing required data',
                'details': 'Request must include extractedData'
            }), 400
            
        extracted_data = data.get('extractedData', {})
        document_type = data.get('documentType')
        context_data = data.get('contextData', {})
        
        # Initialize the intelligent mapper
        mapper = IntelligentMapper()
        
        # Map the extracted fields to form fields
        mapped_data = mapper.map_extracted_data(
            extracted_data, 
            document_type,
            context_data
        )
        
        # Identify unmapped fields
        unmapped_fields = []
        for field in extracted_data:
            if field not in mapped_data and not field.startswith('_'):
                unmapped_fields.append(field)
                
        # Return the mapped data and unmapped fields
        return jsonify({
            'mappedData': mapped_data,
            'unmappedFields': unmapped_fields
        }), 200
        
    except Exception as e:
        logger.error(f"Error in intelligent mapping: {str(e)}")
        return jsonify({
            'error': 'Internal server error',
            'details': str(e)
        }), 500
