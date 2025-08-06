"""
Intelligent Form Mapper - Maps extracted data to form fields based on semantic understanding
"""
import logging
import re
from typing import Dict, Any, List, Tuple
import json
import os
from pathlib import Path

class IntelligentMapper:
    """
    An intelligent mapper that understands form structure and semantics 
    to map extracted data to appropriate form fields.
    """
    
    def __init__(self):
        """Initialize the intelligent mapper with form schema knowledge."""
        self.logger = logging.getLogger(__name__)
        # Load form sections and fields from a schema file
        self.form_schema = self._load_form_schema()
        # Define semantic categories for field types
        self.semantic_categories = self._define_semantic_categories()
        
    def _load_form_schema(self) -> Dict:
        """
        Load the form schema from a JSON file or define it programmatically.
        Returns a dictionary with form structure information.
        """
        # Try to load from a file first
        schema_path = Path(__file__).parent / "form_schema.json"
        
        if os.path.exists(schema_path):
            try:
                with open(schema_path, 'r') as f:
                    self.logger.info(f"Loading form schema from {schema_path}")
                    return json.load(f)
            except Exception as e:
                self.logger.error(f"Error loading form schema: {e}")
        
        # Define a default schema programmatically if file not found
        self.logger.info("Using default programmatic form schema")
        return {
            "sections": [
                {
                    "id": "evidence-documentation",
                    "title": "Evidence and documentation",
                    "semantic_context": ["evidence", "documentation", "upload", "documents"],
                    "fields": [
                        {
                            "name": "evidence",
                            "label": "Documents you can provide",
                            "type": "checkbox",
                            "semantic_context": ["document types", "evidence types"]
                        },
                        {
                            "name": "relationshipToDeceased",
                            "label": "What is your relationship to the deceased?",
                            "type": "radio",
                            "semantic_context": ["relationship", "relation", "connection", "family"]
                        }
                    ]
                },
                {
                    "id": "about-deceased",
                    "title": "About the person who died",
                    "semantic_context": ["deceased", "dead person", "death", "person who died"],
                    "fields": [
                        {
                            "name": "deceasedFirstName",
                            "label": "First name",
                            "type": "text",
                            "semantic_context": ["deceased first name", "dead person's first name", "given name"]
                        },
                        {
                            "name": "deceasedLastName",
                            "label": "Last name",
                            "type": "text",
                            "semantic_context": ["deceased last name", "dead person's surname", "family name"]
                        },
                        {
                            "name": "deceasedDateOfBirth",
                            "label": "Date of birth",
                            "type": "date",
                            "semantic_context": ["deceased birth date", "dead person's birthday", "dob", "born on"]
                        },
                        {
                            "name": "deceasedDateOfDeath",
                            "label": "Date of death",
                            "type": "date",
                            "semantic_context": ["deceased death date", "date of passing", "died on", "dod"]
                        },
                        {
                            "name": "relationshipToDeceased",
                            "label": "Relationship to deceased",
                            "type": "radio",
                            "semantic_context": ["relationship", "relation", "connection", "family"]
                        }
                    ]
                },
                {
                    "id": "funeral-details",
                    "title": "Funeral details",
                    "semantic_context": ["funeral", "service", "ceremony", "burial", "cremation"],
                    "fields": [
                        {
                            "name": "funeralDirector",
                            "label": "Funeral director",
                            "type": "text",
                            "semantic_context": ["funeral company", "funeral home", "undertaker"]
                        },
                        {
                            "name": "funeralCost",
                            "label": "Funeral cost",
                            "type": "number",
                            "semantic_context": ["cost", "price", "expense", "bill", "invoice amount", "total cost"]
                        },
                        {
                            "name": "funeralDate",
                            "label": "Funeral date",
                            "type": "date",
                            "semantic_context": ["service date", "ceremony date", "when funeral occurred"]
                        }
                    ]
                }
            ]
        }
        
    def _define_semantic_categories(self) -> Dict[str, List[str]]:
        """
        Define semantic categories for different types of fields.
        Returns a dictionary mapping categories to keywords.
        """
        return {
            "person_name": ["name", "full name", "given name", "surname", "first name", "last name"],
            "date": ["date", "dob", "birth", "death", "issued", "when", "day", "month", "year"],
            "address": ["address", "location", "residence", "street", "city", "postcode", "zip code"],
            "relationship": ["relationship", "relation", "connection", "family", "daughter", "son", "spouse", "partner"],
            "monetary": ["cost", "price", "amount", "fee", "payment", "expense", "bill", "invoice"],
            "document_type": ["certificate", "invoice", "document", "statement", "bill", "receipt"]
        }
        
    def get_field_mapping(self, extracted_key: str, extracted_value: Any, document_type: str = None, context_data: Dict = None) -> List[Tuple[str, float]]:
        """
        Find the best matching form fields for an extracted key-value pair.
        
        Args:
            extracted_key: The key from the extracted data
            extracted_value: The value from the extracted data
            document_type: Type of document being processed (optional)
            context_data: Additional context information (optional)
            
        Returns:
            List of tuples (field_name, confidence_score) sorted by confidence
        """
        matches = []
        
        # Normalize the key for better matching
        normalized_key = self._normalize_text(extracted_key)
        
        # Step 1: Direct matches based on field names and semantic context
        for section in self.form_schema["sections"]:
            # Filter sections by document type if provided
            if document_type and not self._section_matches_document_type(section, document_type):
                continue
                
            for field in section["fields"]:
                confidence = self._calculate_field_match_confidence(
                    normalized_key, 
                    extracted_value,
                    field,
                    section,
                    document_type,
                    context_data
                )
                
                if confidence > 0:
                    matches.append((field["name"], confidence))
        
        # Sort by confidence score in descending order
        return sorted(matches, key=lambda x: x[1], reverse=True)
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text for better matching."""
        if not isinstance(text, str):
            return str(text)
            
        # Convert to lowercase, remove extra spaces
        normalized = text.lower().strip()
        # Remove special characters
        normalized = re.sub(r'[^\w\s]', ' ', normalized)
        # Replace multiple spaces with single space
        normalized = re.sub(r'\s+', ' ', normalized)
        return normalized
    
    def _section_matches_document_type(self, section: Dict, document_type: str) -> bool:
        """Check if a section is relevant for a document type."""
        # Default to True if document_type is None
        if not document_type:
            return True
            
        document_type_lower = document_type.lower()
        
        # Check if any of the section's semantic contexts match the document type
        for context in section.get("semantic_context", []):
            if context.lower() in document_type_lower or document_type_lower in context.lower():
                return True
                
        # Special document type mappings
        document_type_section_mappings = {
            "death_certificate": ["about-deceased"],
            "funeral_invoice": ["funeral-details"],
            "benefit_letter": ["benefits-information"],
            "relationship_proof": ["about-deceased"]
        }
        
        # Check if section id is in the list for this document type
        for doc_type, section_ids in document_type_section_mappings.items():
            if doc_type in document_type_lower and section["id"] in section_ids:
                return True
                
        return False
    
    def _calculate_field_match_confidence(
        self, 
        normalized_key: str, 
        value: Any, 
        field: Dict, 
        section: Dict,
        document_type: str = None,
        context_data: Dict = None
    ) -> float:
        """
        Calculate the confidence that an extracted key-value matches a form field.
        Returns a score between 0 (no match) and 1 (perfect match).
        """
        base_confidence = 0.0
        field_name = field["name"]
        
        # Direct name match is strongest
        if normalized_key == self._normalize_text(field_name):
            return 1.0
            
        # Check for field label match
        if "label" in field and self._normalize_text(field["label"]) in normalized_key:
            base_confidence = max(base_confidence, 0.8)
            
        # Check semantic context match
        if "semantic_context" in field:
            for context in field["semantic_context"]:
                norm_context = self._normalize_text(context)
                if norm_context in normalized_key or normalized_key in norm_context:
                    base_confidence = max(base_confidence, 0.7)
        
        # Check field type semantic match
        value_type = self._infer_value_type(value)
        if self._field_type_matches_value_type(field, value_type):
            base_confidence += 0.1
            
        # Context data boosts
        if context_data:
            base_confidence = self._apply_context_boosts(
                base_confidence, 
                normalized_key, 
                value, 
                field_name, 
                context_data
            )
            
        # Document type relevance
        if document_type:
            base_confidence = self._apply_document_type_boosts(
                base_confidence, 
                field_name, 
                document_type
            )
            
        # Section relevance
        section_relevance = self._calculate_section_relevance(normalized_key, section)
        base_confidence = base_confidence * (0.7 + 0.3 * section_relevance)
            
        return min(1.0, base_confidence)
    
    def _infer_value_type(self, value: Any) -> str:
        """Infer the type of a value (date, name, address, etc.)."""
        if isinstance(value, dict) and 'value' in value:
            value = value['value']
            
        if not isinstance(value, str):
            value = str(value)
            
        value = value.lower()
        
        # Check for dates (basic pattern matching)
        date_patterns = [
            r'\d{1,2}/\d{1,2}/\d{2,4}',  # 01/01/2020
            r'\d{1,2}-\d{1,2}-\d{2,4}',  # 01-01-2020
            r'\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}',  # 01 January 2020
        ]
        
        for pattern in date_patterns:
            if re.search(pattern, value):
                return "date"
        
        # Check for monetary values
        money_patterns = [
            r'£\s*\d+(?:\.\d{2})?',  # £100.00
            r'\$\s*\d+(?:\.\d{2})?',  # $100.00
            r'€\s*\d+(?:\.\d{2})?',  # €100.00
            r'\d+(?:\.\d{2})?\s*(?:pounds|gbp|usd|eur)',  # 100.00 pounds
        ]
        
        for pattern in money_patterns:
            if re.search(pattern, value):
                return "monetary"
                
        # Check for address patterns
        if any(term in value for term in ["street", "road", "avenue", "lane", "drive", "way", "boulevard", "court"]):
            return "address"
            
        # Check for relationship terms
        relationship_terms = ["husband", "wife", "spouse", "partner", "child", "son", "daughter", "parent", "father", "mother", "brother", "sister", "sibling"]
        if any(term in value for term in relationship_terms):
            return "relationship"
            
        # Default to "text"
        return "text"
    
    def _field_type_matches_value_type(self, field: Dict, value_type: str) -> bool:
        """Check if a field type is compatible with an inferred value type."""
        field_type = field.get("type", "text")
        
        type_compatibility = {
            "date": ["date"],
            "monetary": ["number", "text"],
            "address": ["text", "textarea"],
            "relationship": ["text", "radio", "select"],
            "text": ["text", "textarea", "radio", "select", "checkbox"]
        }
        
        return field_type in type_compatibility.get(value_type, [])
    
    def _apply_context_boosts(self, base_confidence: float, normalized_key: str, value: Any, field_name: str, context_data: Dict) -> float:
        """Apply confidence boosts based on context data."""
        # If the field name contains 'deceased' and we have deceased name context
        if 'deceased' in field_name and 'deceasedName' in context_data:
            deceased_name = self._normalize_text(context_data['deceasedName'])
            # If the extracted value contains the deceased name
            if isinstance(value, dict) and 'value' in value:
                normalized_value = self._normalize_text(value['value'])
                if deceased_name in normalized_value:
                    return min(1.0, base_confidence + 0.2)
                    
        # If the field is about relationship and we have relationship context
        if 'relationship' in field_name and 'relationshipToDeceased' in context_data:
            relationship = self._normalize_text(context_data['relationshipToDeceased'])
            # If the key or value contains relationship terms
            if 'relationship' in normalized_key or relationship in normalized_key:
                return min(1.0, base_confidence + 0.3)
                
        return base_confidence
    
    def _apply_document_type_boosts(self, base_confidence: float, field_name: str, document_type: str) -> float:
        """Apply confidence boosts based on document type."""
        document_type_lower = document_type.lower()
        
        # Field-document type associations
        associations = {
            "death_certificate": ["deceased", "death", "birth"],
            "funeral_invoice": ["funeral", "cost", "director", "service"],
            "benefit_letter": ["benefit", "payment", "eligibility"],
            "relationship_proof": ["relationship", "connection", "family"]
        }
        
        # Check for associations
        for doc_type, keywords in associations.items():
            if doc_type in document_type_lower:
                # If the field name contains any of the associated keywords
                if any(keyword in field_name.lower() for keyword in keywords):
                    return min(1.0, base_confidence + 0.15)
                    
        return base_confidence
    
    def _calculate_section_relevance(self, normalized_key: str, section: Dict) -> float:
        """Calculate how relevant a section is for a given key."""
        if "semantic_context" not in section:
            return 0.5  # Default middle relevance
            
        max_relevance = 0.0
        for context in section["semantic_context"]:
            norm_context = self._normalize_text(context)
            # Check if the context term appears in the key
            if norm_context in normalized_key:
                max_relevance = max(max_relevance, 0.8)
            # Check if the key appears in the context term
            elif normalized_key in norm_context:
                max_relevance = max(max_relevance, 0.6)
                
        # If we found no specific relevance but the section has a title
        if max_relevance == 0.0 and "title" in section:
            norm_title = self._normalize_text(section["title"])
            # Check for any overlap of words
            key_words = set(normalized_key.split())
            title_words = set(norm_title.split())
            common_words = key_words.intersection(title_words)
            
            if common_words:
                max_relevance = 0.3 * len(common_words) / min(len(key_words), len(title_words))
                
        return max(0.1, max_relevance)  # Always return at least a small relevance
        
    def map_extracted_data(self, extracted_data: Dict, document_type: str = None, context_data: Dict = None) -> Dict:
        """
        Map extracted data fields to form fields intelligently.
        
        Args:
            extracted_data: Dictionary of extracted data
            document_type: Type of document being processed (optional)
            context_data: Additional context information (optional)
            
        Returns:
            Dictionary with form field names as keys and extracted values as values
        """
        result = {}
        
        for key, value in extracted_data.items():
            # Skip metadata fields (those starting with underscore)
            if key.startswith('_'):
                result[key] = value
                continue
                
            # Get potential field mappings with confidence scores
            field_matches = self.get_field_mapping(key, value, document_type, context_data)
            
            # Use the best match if confidence is high enough
            if field_matches and field_matches[0][1] >= 0.5:
                best_match = field_matches[0][0]
                self.logger.info(f"Mapped '{key}' to '{best_match}' with confidence {field_matches[0][1]}")
                
                # Handle special case for names (split into first/last)
                if best_match.endswith('FirstName') and isinstance(value, dict) and 'value' in value:
                    full_name = value['value'].split()
                    if len(full_name) > 1:
                        # First name is everything except the last word
                        first_name = ' '.join(full_name[:-1])
                        last_name = full_name[-1]
                        
                        # Determine field name base (e.g., "deceased" from "deceasedFirstName")
                        field_base = best_match[:-9]  # Remove "FirstName"
                        
                        # Create first name entry
                        result[f"{field_base}FirstName"] = {
                            'value': first_name,
                            'reasoning': value.get('reasoning', 'Split from full name') + " (first name)"
                        }
                        
                        # Create last name entry
                        result[f"{field_base}LastName"] = {
                            'value': last_name,
                            'reasoning': value.get('reasoning', 'Split from full name') + " (last name)"
                        }
                    else:
                        # Just a single name, treat as first name
                        result[best_match] = value
                else:
                    result[best_match] = value
            else:
                # Keep original field if no good match found
                self.logger.info(f"No good mapping found for '{key}', keeping original")
                result[key] = value
                
        return result
