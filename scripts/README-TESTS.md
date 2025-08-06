# Data Extraction Improvement Tests

This folder contains tests for the improved data extraction functionality. The improvements focus on:

1. Adding context awareness to the AI extraction process using deceased and applicant names
2. Removing document type checkboxes from the UI 
3. Enhancing the field mapping and document classification

## Test Scripts

### 1. Data Extraction Test

Tests the backend data extraction with and without context data.

```bash
# Run with default test image
./scripts/test-extraction-improvements.sh

# Or specify a custom test image
./scripts/test-extraction-improvements.sh custom_image_name.png
```

This test:
- Creates a copy of a test document with a unique ID
- Sends extraction requests with and without context data
- Saves the results to JSON files for comparison
- Cleans up test files when done

### 2. UI Test

Tests the UI changes to the evidence upload section.

```bash
./scripts/test-evidence-ui.sh
```

This test:
- Uses Puppeteer to open a browser and navigate to the application
- Finds the evidence upload section
- Verifies that the deceased name field is present
- Verifies that the applicant name field is present
- Confirms that document type checkboxes are removed
- Takes a screenshot for visual verification

### 3. Document Classifier Test

Tests the backend document classifier directly.

```bash
python3 scripts/test-document-classifier.py
```

This test:
- Directly tests the DocumentClassifier class
- Verifies document type detection
- Tests field normalization
- Validates context enhancement
- Tests the API endpoint with and without context

## Test Results

After running the tests, you can find:
- `extraction_with_context.json` - Results of extraction with context
- `extraction_without_context.json` - Results of extraction without context
- `evidence-page-screenshot.png` - Screenshot of the updated UI

## Manual Testing Guide

1. Open the application in your browser
2. Navigate to the Evidence and Documentation section
3. Enter a deceased name (e.g., "Brian Hughes")
4. Enter an applicant name (e.g., "Sarah Hughes")
5. Upload a document (e.g., a death certificate)
6. Observe how the extracted fields are populated with accurate information
7. Try uploading another document without providing names
8. Compare the quality of extraction between the two approaches
