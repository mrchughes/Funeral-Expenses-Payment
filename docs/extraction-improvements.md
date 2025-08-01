# Data Extraction Improvements

## Overview
This update introduces two new modules to improve data extraction for the Funeral Expenses Payment system:

1. **Date Normalizer**: Converts various date formats into the standard DD/MM/YYYY format
2. **Document Classifier**: Enhances document type detection and field mapping

## Modules Added

### `date_normalizer.py`
- Handles a wide range of date format conversion (written dates, numeric dates, partial dates)
- Provides both single-date normalization and full document data processing
- Preserves original date values in reasoning for traceability

### `document_classifier.py`
- Detects document types using content patterns and filename analysis
- Maps extracted fields to correct form fields based on document type
- Includes support for:
  - Death certificates
  - Birth certificates
  - Funeral invoices
  - Benefit letters

## Integration
These modules have been integrated into the main extraction pipeline in `main.py`:

1. Documents are processed through OCR
2. LLM extracts structured data from text
3. Document type is detected with the document classifier
4. Field names are normalized based on document type
5. Date fields are converted to standard DD/MM/YYYY format
6. Results are returned to the frontend

## Testing
A test script is available at `scripts/test-extraction-normalization.py` to verify the functionality of both modules.

## Future Improvements
- Add support for more document types
- Enhance pattern recognition for better document classification
- Implement confidence scores for document type detection
