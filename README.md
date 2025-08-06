# Financial Entitlement Platform (FEP)

This repository contains the Financial Entitlement Platform application, which helps users apply for financial entitlements.

## Project Structure

- **mern-app/**: Main application
  - **backend/**: Node.js/Express backend
  - **frontend/**: React frontend
- **python-app/**: Python services including AI agent for document processing
  - **app/ai_agent/**: AI processing agent for document extraction
    - **date_normalizer.py**: Normalizes dates to standard format (DD/MM/YYYY)
    - **document_classifier.py**: Classifies document types and maps fields
    - **main.py**: Main API service for document processing
- **docs/**: Documentation files
  - **defect_log.md**: Log of defects and their fixes
  - **test-results.md**: Results from testing sessions
  - **PDS-Integration-Strategy.md**: Strategy for Personal Data Store integration
  - **extraction-improvements.md**: Documentation of evidence extraction improvements
  - **websocket-status-updates.md**: Documentation of real-time document status updates
- **scripts/**: Utility scripts
  - **startup.sh**: Project startup script
  - **test-upload.sh**: Script for testing file uploads
  - **test-upload-2.sh**: Alternative file upload test script
  - Other utility scripts
- **Requirements/**: Project requirements and specifications
- **shared-evidence/**: Test evidence files for development
- **dev/**: Development and testing files

## Setup and Running

See `docker-compose.yml` for the container setup and dependencies.
