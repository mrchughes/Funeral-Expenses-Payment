# Semantic Mapping Service

This service provides intelligent, context-aware document field extraction and mapping to form fields without hard-coded rules. It uses semantic understanding through LLMs and embeddings to map extracted document content to the appropriate form fields.

## Features

- **Semantic Understanding**: Uses embeddings and LLMs to understand the meaning of text, not just patterns
- **Context-Aware**: Leverages user context (names, relationships, etc.) to improve extraction accuracy
- **No Hard-Coded Rules**: Works with any document type without predefined patterns
- **LangChain Integration**: Uses LangChain for orchestrating the document understanding workflow
- **Real-time Updates**: Provides progress updates via WebSockets

## Architecture

The service is built around several key components:

1. **Semantic Mapper**: Core component that maps document text to form fields
2. **Form Schema Loader**: Loads and understands form field definitions
3. **Context Manager**: Handles user-specific context information
4. **Embedding Service**: Generates embeddings for semantic matching
5. **LangGraph Processor**: Orchestrates the document processing workflow with LangChain

## API Endpoints

### POST /process

Initiates asynchronous processing of a document.

**Request Body:**
```json
{
  "documentId": "document123",
  "formId": "funeral-expenses-payment",
  "userId": "user123"
}
```

**Response:**
```json
{
  "message": "Semantic mapping started",
  "documentId": "document123",
  "formId": "funeral-expenses-payment"
}
```

### POST /map-fields

Maps document fields synchronously (waits for completion).

**Request Body:**
```json
{
  "documentId": "document123",
  "formId": "funeral-expenses-payment",
  "userId": "user123"
}
```

**Response:**
```json
{
  "message": "Field mapping completed successfully",
  "documentId": "document123",
  "formId": "funeral-expenses-payment",
  "documentType": "Death Certificate",
  "fieldCount": 8
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "service": "semantic-mapping-service"
}
```

## MongoDB Schema

The service extends the MongoDB schema to include semantic information:

- **Form Fields**: Enhanced with semantic synonyms, categories, and embeddings
- **Document Types**: Include semantic keywords and visual features
- **User Context**: Structured personal and application context

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Service port | 3004 |
| DB_SERVICE_URL | URL for the database service | http://db-service:3000 |
| WS_SERVICE_URL | URL for the WebSocket service | http://websocket-service:3002 |
| FORM_DB_URL | MongoDB URL for the form database | mongodb://mongo:27017/forms |
| OPENAI_API_KEY | API key for OpenAI services | - |

## Setup and Usage

1. Set up environment variables (especially OPENAI_API_KEY)
2. Run `npm install` to install dependencies
3. Seed the database: `node seed-data.js`
4. Start the service: `npm start`

## Docker

Build and run with Docker:

```bash
docker build -t semantic-mapping-service .
docker run -p 3004:3004 -e OPENAI_API_KEY=your-api-key semantic-mapping-service
```

## Integration with Document Processing Pipeline

This service should be called after OCR processing is complete. Typical workflow:

1. Document uploaded → OCR Service → Semantic Mapping Service → Form Database
2. Each stage updates document state and sends WebSocket notifications

## Form Field Configuration

For best results, form fields should include:
- Clear descriptions
- Example values
- Semantic synonyms
- Field categories

## Development

Requirements:
- Node.js 18+
- MongoDB
- OpenAI API key
