# Document Processing System

A modular, microservices-based document processing system designed for extracting and processing form data from documents like PDFs and images. The system uses OCR and semantic understanding to interpret document contents and map them to structured form fields.

## System Architecture

The system is built on a microservices architecture with the following components:

### Core Services

- **Upload Service**: Handles document uploads and initiates processing workflows
- **OCR Service**: Processes documents using Tesseract.js with multi-threading support
- **Semantic Mapping Service**: Maps extracted text to form fields using AI
- **Workflow Service**: Coordinates the document processing pipeline
- **Database Service**: Manages document metadata and processing state
- **WebSocket Service**: Provides real-time updates on document processing status

### Infrastructure Services

- **MongoDB**: Document storage
- **MinIO**: S3-compatible object storage for document files
- **Redis**: Message queuing and pub/sub for service communication

### Frontend Components

- **Frontend Demo**: Simple UI for testing the document processing system

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 16+ (for local development)
- OpenAI API key (for the semantic mapping service)

### Installation

1. Clone the repository
2. Create a `.env` file with the required environment variables:

```
OPENAI_API_KEY=your_openai_api_key
```

3. Start the system with Docker Compose:

```bash
docker-compose up --build
```

### Using the System

1. Open the frontend demo at http://localhost:8080
2. Upload a document with the form
3. Monitor the processing status in real-time
4. View the extracted form data once processing is complete

## Development

### Service Structure

Each service follows a similar structure:

```
service-name/
  ├── src/
  │   ├── controllers/
  │   ├── routes/
  │   ├── models/
  │   ├── utils/
  │   └── server.js
  ├── Dockerfile
  ├── package.json
  └── README.md
```

### Running Individual Services

You can run individual services for development:

```bash
# Start OCR service
npm run start:ocr-service

# Start semantic mapping service
npm run start:semantic-mapping-service
```

### Integration Testing

Run the integration tests:

```bash
npm run test:integration
```

## Error Handling

The system includes comprehensive error handling mechanisms:

1. **Error Types**: Different error types for various scenarios
2. **Circuit Breaker**: Prevents cascading failures
3. **Retries**: Failed documents can be retried
4. **Health Checks**: Service health monitoring

## Technical Details

### OCR Processing

- Multi-threaded OCR processing using worker threads
- Supports PDF and image formats
- Page-by-page processing for PDFs

### Semantic Mapping

- Uses LangChain/OpenAI for semantic understanding
- Vector embeddings for form field mapping
- Context-aware field extraction

### Workflow Management

- State machine approach to document processing
- Event-driven communication between services
- Progress tracking and real-time updates

## License

This project is licensed under the ISC License.
