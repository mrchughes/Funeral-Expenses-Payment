import re
import logging
from intelligent_mapper import IntelligentMapper

class DocumentClassifier:
    def __init__(self):
        # Define document types and their signature patterns
        self.document_signatures = {
            'death_certificate': {
                'patterns': [
                    r'death\s+certificate',
                    r'certificate\s+of\s+death',
                    r'cause\s+of\s+death',
                    r'date\s+of\s+death',
                    r'registration\s+of\s+death'
                ],
                'fields_mapping': {
                    'dateOfDeath': 'deceasedDateOfDeath',
                    'dateOfBirth': 'deceasedDateOfBirth',
                    'firstName': 'deceasedFirstName',
                    'lastName': 'deceasedLastName',
                    'name': 'deceasedFirstName',
                    'surname': 'deceasedLastName',
                    'placeOfDeath': 'deceasedPlaceOfDeath'
                }
            },
            'birth_certificate': {
                'patterns': [
                    r'birth\s+certificate',
                    r'certificate\s+of\s+birth',
                    r'date\s+of\s+birth',
                    r'registration\s+of\s+birth'
                ],
                'fields_mapping': {
                    'dateOfBirth': 'dateOfBirth',
                    'firstName': 'firstName',
                    'lastName': 'lastName',
                    'name': 'firstName',
                    'surname': 'lastName',
                    'placeOfBirth': 'placeOfBirth'
                }
            },
            'funeral_invoice': {
                'patterns': [
                    r'funeral\s+invoice',
                    r'funeral\s+director',
                    r'funeral\s+bill',
                    r'funeral\s+service',
                    r'cremation',
                    r'burial'
                ],
                'fields_mapping': {
                    'invoiceNumber': 'funeralEstimateNumber',
                    'date': 'funeralDateIssued',
                    'dateIssued': 'funeralDateIssued',
                    'total': 'funeralTotalEstimatedCost',
                    'amount': 'funeralTotalEstimatedCost',
                    'cost': 'funeralTotalEstimatedCost',
                    'description': 'funeralDescription',
                    'services': 'funeralDescription'
                }
            },
            'benefit_letter': {
                'patterns': [
                    r'benefit\s+letter',
                    r'department\s+for\s+work\s+and\s+pensions',
                    r'dwp',
                    r'universal\s+credit',
                    r'pension\s+credit',
                    r'income\s+support'
                ],
                'fields_mapping': {
                    'benefitType': 'benefitType',
                    'startDate': 'benefitStartDate',
                    'endDate': 'benefitEndDate',
                    'amount': 'benefitAmount',
                    'reference': 'benefitReference'
                }
            }
        }

    def detect_document_type(self, text, filename=""):
        """
        Detect document type from text and/or filename
        
        Args:
            text (str): Extracted text content from the document
            filename (str): Original filename
            
        Returns:
            str: Document type identifier
        """
        if not text and not filename:
            return "unknown"
            
        text_lower = text.lower() if text else ""
        filename_lower = filename.lower() if filename else ""
        combined = f"{text_lower} {filename_lower}"
        
        best_match = None
        highest_score = 0
        
        for doc_type, signature in self.document_signatures.items():
            score = 0
            for pattern in signature['patterns']:
                matches = re.findall(pattern, combined, re.IGNORECASE)
                score += len(matches) * 2
                
            if score > highest_score:
                highest_score = score
                best_match = doc_type
                
        if not best_match or highest_score < 2:
            # Fallback detection from filename
            if "death" in filename_lower:
                return "death_certificate"
            elif "birth" in filename_lower:
                return "birth_certificate"
            elif any(term in filename_lower for term in ["invoice", "bill", "funeral", "director"]):
                return "funeral_invoice"
            elif any(term in filename_lower for term in ["benefit", "letter", "dwp", "pension"]):
                return "benefit_letter"
            return "unknown"
            
        return best_match
        
    def normalize_fields(self, data, document_type, context_data=None):
        """
        Normalize field names based on document type using intelligent mapping
        
        Args:
            data (dict): Extracted data
            document_type (str): Document type identifier
            context_data (dict, optional): Context information for improved mapping
            
        Returns:
            dict: Normalized data with proper field mappings
        """
        result = {}
        
        # Add document type field
        result['_fileType'] = {
            'value': document_type.replace('_', ' '),
            'reasoning': f"Detected document type based on content and patterns"
        }
        
        # Add document type field for better form matching
        result['_documentType'] = {
            'value': document_type.replace('_', ' ').title(),
            'reasoning': f"Classified as {document_type.replace('_', ' ').title()} based on content analysis"
        }
        
        # Use intelligent mapper for field normalization
        intelligent_mapper = IntelligentMapper()
        mapped_data = intelligent_mapper.map_extracted_data(data, document_type, context_data)
        
        # Merge mapped data with result
        result.update(mapped_data)
        
        # Fallback to traditional mapping for any unmapped fields
        if document_type in self.document_signatures:
            field_mappings = self.document_signatures[document_type]['fields_mapping']
            
            # Process any fields that weren't handled by the intelligent mapper
            for field, field_data in data.items():
                if field not in result and field not in mapped_data:
                    if not isinstance(field_data, dict) or field.startswith('_'):  # Skip metadata fields
                        result[field] = field_data
                        continue
                        
                    field_lower = field.lower()
                    mapped_field = None
                    
                    # Try to find a direct mapping
                    for src, dest in field_mappings.items():
                        if src.lower() == field_lower:
                            mapped_field = dest
                            break
                    
                    # If no direct mapping found, use the original field name
                    if not mapped_field:
                        mapped_field = field
                        
                    # Add to result with proper mapping
                    result[mapped_field] = field_data
            
        return result
        
    def enhance_extraction_with_context(self, data, context_data):
        """
        Use context data to enhance the extraction
        
        Args:
            data (dict): Extracted data
            context_data (dict): Context information like deceased name, applicant name, and relationship
            
        Returns:
            dict: Enhanced data with better field matching
        """
        if not context_data:
            return data
        
        result = data.copy()
        
        # Determine document type for better context application
        document_type = data.get('_fileType', {}).get('value', '').replace(' ', '_').lower()
        if not document_type:
            document_type = data.get('_documentType', {}).get('value', '').replace(' ', '_').lower()
            
        # Get document type from context data if available
        if not document_type and '_documentType' in context_data:
            document_type = context_data.get('_documentType').replace(' ', '_').lower()
        
        # Use intelligent mapper for context-aware field mapping
        intelligent_mapper = IntelligentMapper()
        result = intelligent_mapper.map_extracted_data(result, document_type, context_data)
        
        # Additional context-specific enhancements
        
        # If we have deceased name context, use it to improve extraction
        if 'deceasedName' in context_data and context_data['deceasedName']:
            deceased_name = context_data['deceasedName']
            
            # Add deceased name directly if not already present
            if 'deceasedName' not in result:
                result['deceasedName'] = {
                    'value': deceased_name,
                    'reasoning': f"Added from context data"
                }
            
            # Split deceased name into first/last if needed and those fields don't exist
            if ('deceasedFirstName' not in result or 'deceasedLastName' not in result) and ' ' in deceased_name:
                name_parts = deceased_name.split()
                
                # First name is everything except the last part
                if 'deceasedFirstName' not in result:
                    result['deceasedFirstName'] = {
                        'value': ' '.join(name_parts[:-1]),
                        'reasoning': "Split from deceased name in context"
                    }
                    
                # Last name is the last part
                if 'deceasedLastName' not in result:
                    result['deceasedLastName'] = {
                        'value': name_parts[-1],
                        'reasoning': "Split from deceased name in context"
                    }
                    
        # Use relationship context to improve relationship identification
        if 'relationshipToDeceased' in context_data and context_data['relationshipToDeceased']:
            relationship = context_data['relationshipToDeceased']
            
            # Set the relationship field directly from context if not already determined
            if 'relationshipToDeceased' not in result:
                result['relationshipToDeceased'] = {
                    'value': relationship,
                    'reasoning': "Using the relationship provided in context"
                }
                
        return result
