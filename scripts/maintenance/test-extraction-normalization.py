#!/usr/bin/env python3

"""
Test script for the date normalization and document classification modules.
"""

import sys
import os
import json
import logging

# Add the python-app/app/ai_agent directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'python-app', 'app', 'ai_agent')))

from date_normalizer import DateNormalizer
from document_classifier import DocumentClassifier

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def test_date_normalizer():
    normalizer = DateNormalizer()
    
    test_dates = [
        "17th June 2023",
        "Seventeenth June 2025",
        "June 17, 2023",
        "2023-06-17",
        "17/06/2023",
        "06/17/2023",
        "17.06.2023",
        "17-06-2023",
        "17 June 23"
    ]
    
    logging.info("Testing Date Normalizer...")
    for date_string in test_dates:
        normalized = normalizer.normalize_date(date_string)
        logging.info(f"Original: '{date_string}' -> Normalized: '{normalized}'")
    
    # Test with data structure
    test_data = {
        "dateOfDeath": {
            "value": "Seventeenth June 2025",
            "reasoning": "Found in death certificate"
        },
        "dateOfBirth": {
            "value": "22nd April 1945",
            "reasoning": "Listed on document"
        }
    }
    
    normalized_data = normalizer.process_data_object(test_data)
    logging.info(f"Normalized data structure: {json.dumps(normalized_data, indent=2)}")

def test_document_classifier():
    classifier = DocumentClassifier()
    
    test_documents = [
        {
            "text": "CERTIFICATE OF DEATH\nName: John Smith\nDate of Birth: 15/05/1945\nDate of Death: 10/01/2023\nCause: Natural causes",
            "filename": "death_certificate.pdf"
        },
        {
            "text": "FUNERAL INVOICE\nFor the funeral of: John Smith\nServices: Cremation, Casket, Transport\nTotal: £4,500",
            "filename": "invoice_funeral_smith.pdf"
        },
        {
            "text": "DEPARTMENT FOR WORK AND PENSIONS\nBenefit: Universal Credit\nRecipient: Jane Smith\nAmount: £350 per week",
            "filename": "dwp_benefit_letter.pdf"
        },
        {
            "text": "This document has no clear indicators",
            "filename": "unknown_document.pdf"
        }
    ]
    
    logging.info("Testing Document Classifier...")
    for doc in test_documents:
        doc_type = classifier.detect_document_type(doc["text"], doc["filename"])
        logging.info(f"Document: '{doc['filename']}' -> Type: '{doc_type}'")
    
    # Test with data structure
    test_data = {
        "name": {
            "value": "John Smith",
            "reasoning": "Found in death certificate"
        },
        "dateOfDeath": {
            "value": "10/01/2023",
            "reasoning": "Listed on document"
        }
    }
    
    normalized_data = classifier.normalize_fields(test_data, "death_certificate")
    logging.info(f"Normalized fields: {json.dumps(normalized_data, indent=2)}")

if __name__ == "__main__":
    logging.info("Starting test script...")
    test_date_normalizer()
    test_document_classifier()
    logging.info("Tests completed.")
