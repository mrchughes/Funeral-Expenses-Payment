# Document Processing Integration Guide

This documentation outlines how the MERN app integrates with the document processing system to provide OCR and semantic extraction for evidence documents.

## Architecture Overview

The integration follows these principles:

1. **MERN App as the Source of Truth**: The MERN app owns the form database and all form schemas.
2. **Document Processing as a Service**: The document processing system provides OCR and extraction services.
3. **Bidirectional Communication**: The systems communicate through REST APIs and WebSockets.

```
┌─────────────────┐                  ┌───────────────────────┐
│                 │                  │                       │
│    MERN App     │◄─────REST API────►  Document Processing  │
│    Database     │                  │       System          │
│                 │◄───WebSockets────►                       │
└─────────────────┘                  └───────────────────────┘
```

## Integration Components

### 1. Document Processing Client Library

The `mern-app-client.js` library provides an easy-to-use client for the MERN app to interact with the document processing system. Key features:

- Document upload
- Status checking
- WebSocket subscriptions for real-time updates
- Extraction results retrieval
- Human-readable extraction summary dialogue

### 2. MERN App Integration Service

The `docProcessingIntegration.js` service in the MERN app handles:

- Uploading documents to the processing service
- Subscribing to WebSocket updates
- Updating the MERN app database with extracted fields
- Error handling and status tracking

### 3. Evidence Controller

The Evidence Controller has been updated to:

- Send uploaded documents to the processing service
- Check processing status
- Retrieve and display extracted fields

## Data Flow

1. User uploads a document through the MERN app
2. Document is saved locally and sent to the document processing service
3. Document processing service extracts text and identifies fields
4. MERN app receives updates via WebSocket
5. Extracted fields are saved to the MERN app database
6. User sees the extracted information in the application

## Schema Changes

The Evidence schema has been extended to include:

- `documentProcessingId`: Links to the document in the processing system
- `processingStatus`: Current status of the document processing
- `processingProgress`: Progress percentage (0-100)
- `processingError`: Error message if processing failed
- `extractionSummary`: Human-readable summary of the extracted information

## Extraction Summary Dialogue

The system generates a human-readable summary of the extracted information that:

1. Identifies the document type
2. Lists the extracted fields with high confidence
3. Highlights fields extracted with lower confidence that may need verification
4. Explains how this information relates to the application form

This summary provides a user-friendly explanation of the extraction results and builds trust in the automated process.

## Testing

A test script is provided at `scripts/test-mern-integration.js` to validate the integration. It:

1. Uploads a test document
2. Monitors the processing status
3. Retrieves and displays the extracted fields

To run the test:

```bash
# Set environment variables for testing
export AUTH_TOKEN="your-valid-auth-token"
export MERN_API_URL="http://localhost:3000/api"

# Run the test script
node scripts/test-mern-integration.js
```

## Error Handling

The integration includes error handling at multiple levels:

- Connection errors between systems
- Processing errors within the document processing service
- Timeout handling for long-running processes
- Fallback to manual data entry if processing fails

## Considerations for Production

When deploying to production, consider:

1. Secure communication between services
2. Scaling the document processing system independently
3. Monitoring and alerting for processing failures
4. Data retention policies for processed documents
5. Backup strategies for extracted data

## Future Enhancements

Potential improvements include:

- Batch processing for multiple documents
- Advanced form field mapping based on document context
- Machine learning for improved extraction accuracy
- User feedback loop to improve extraction quality
