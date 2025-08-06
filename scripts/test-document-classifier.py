#!/usr/bin/env python3

"""
Test script for the AI extraction backend
This script directly tests the document_classifier.py changes
"""

import os
import sys
import json
from datetime import datetime

# Check for required modules
try:
    import requests
except ImportError:
    print("The 'requests' module is not installed. Install it using:")
    print("pip install requests")
    sys.exit(1)

# Ensure we can import modules from the python-app directory
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'python-app', 'app'))
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'python-app', 'app', 'ai_agent'))

try:
    from ai_agent.document_classifier import DocumentClassifier
except ImportError:
    print("Could not import DocumentClassifier. Make sure you're running this script from the project root.")
    sys.exit(1)

def test_document_classifier():
    """Test the DocumentClassifier class directly"""
    print("\n=== Testing DocumentClassifier ===")
    
    # Create an instance
    dc = DocumentClassifier()
    print("DocumentClassifier instance created")
    
    # Test document type detection
    print("\n-- Testing document type detection --")
    test_texts = {
        "death_certificate": "DEATH CERTIFICATE\nName: Brian Hughes\nDate of Death: 12/05/2023",
        "funeral_invoice": "FUNERAL INVOICE\nHughes & Sons Funeral Directors\nTotal: £3,500",
        "benefit_letter": "Department for Work and Pensions\nUniversal Credit Award\nRef: UC123456"
    }
    
    for expected_type, text in test_texts.items():
        detected = dc.detect_document_type(text)
        print(f"Text type: {expected_type}")
        print(f"Detected as: {detected}")
        print(f"Correct: {detected == expected_type}\n")
    
    # Test field normalization
    print("\n-- Testing field normalization --")
    test_data = {
        "name": {"value": "Brian Hughes", "reasoning": "From the document header"},
        "dateOfDeath": {"value": "12/05/2023", "reasoning": "From the document body"},
        "cause": {"value": "Natural causes", "reasoning": "From the document body"}
    }
    
    normalized = dc.normalize_fields(test_data, "death_certificate")
    print("Original fields:", list(test_data.keys()))
    print("Normalized fields:", [k for k in normalized.keys() if not k.startswith('_')])
    print("Added metadata fields:", [k for k in normalized.keys() if k.startswith('_')])
    
    # Test context enhancement
    print("\n-- Testing context enhancement --")
    test_context = {
        "deceasedName": "Brian Hughes",
        "applicantName": "Sarah Hughes"
    }
    
    test_data = {
        "name": {"value": "Hughes", "reasoning": "From the document"},
        "address": {"value": "123 Main St", "reasoning": "From the document"},
        "reference": {"value": "DWP123456", "reasoning": "From the document"}
    }
    
    enhanced = dc.enhance_extraction_with_context(test_data, test_context)
    print("Original data:", list(test_data.keys()))
    print("Enhanced data:", list(enhanced.keys()))
    print("New fields:", [k for k in enhanced.keys() if k not in test_data])

def test_api_endpoint():
    """Test the API endpoint with and without context"""
    print("\n=== Testing API Endpoint ===")
    
    API_URL = os.environ.get('API_URL', 'http://localhost:5100')
    EXTRACT_ENDPOINT = f"{API_URL}/ai-agent/extract-form-data"
    
    # Check if API is accessible
    try:
        response = requests.get(f"{API_URL}/health")
        if response.status_code != 200:
            print(f"API doesn't seem to be accessible at {API_URL}")
            print("Skipping API tests")
            return
    except requests.RequestException:
        print(f"API doesn't seem to be accessible at {API_URL}")
        print("Skipping API tests")
        return
    
    print(f"API is accessible at {API_URL}")
    
    # Test without context
    print("\n-- Testing API without context --")
    try:
        test_file_id = "test_" + datetime.now().strftime("%Y%m%d%H%M%S") + "_death_certificate.png"
        
        payload = {
            "fileId": test_file_id
        }
        
        response = requests.post(EXTRACT_ENDPOINT, json=payload)
        print(f"Status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Extracted fields without context: {list(result.keys())}")
        else:
            print(f"Error: {response.text}")
    
    except Exception as e:
        print(f"Error testing API without context: {e}")
    
    # Test with context
    print("\n-- Testing API with context --")
    try:
        test_file_id = "test_" + datetime.now().strftime("%Y%m%d%H%M%S") + "_death_certificate.png"
        
        payload = {
            "fileId": test_file_id,
            "contextData": {
                "deceasedName": "Brian Hughes",
                "applicantName": "Sarah Hughes"
            }
        }
        
        response = requests.post(EXTRACT_ENDPOINT, json=payload)
        print(f"Status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Extracted fields with context: {list(result.keys())}")
        else:
            print(f"Error: {response.text}")
    
    except Exception as e:
        print(f"Error testing API with context: {e}")

if __name__ == "__main__":
    print("=== Document Classifier and API Tests ===")
    print(f"Running tests at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    test_document_classifier()
    test_api_endpoint()
    
    print("\nTests completed!")
