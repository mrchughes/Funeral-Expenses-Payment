import re
import logging

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
        
    def normalize_fields(self, data, document_type):
        """
        Normalize field names based on document type
        
        Args:
            data (dict): Extracted data
            document_type (str): Document type identifier
            
        Returns:
            dict: Normalized data with proper field mappings
        """
        if document_type not in self.document_signatures:
            return data
            
        field_mappings = self.document_signatures[document_type]['fields_mapping']
        result = {}
        
        # Add document type field
        result['_fileType'] = {
            'value': document_type.replace('_', ' '),
            'reasoning': f"Detected document type based on content and patterns"
        }
        
        # Process existing fields with mappings
        for field, field_data in data.items():
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
