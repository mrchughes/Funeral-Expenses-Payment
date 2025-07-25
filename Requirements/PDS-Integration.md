# FEP Application & PDS Integration Specification

## Document Version
- **Version:** 1.0
- **Date:** July 19, 2025
- **Status:** Approved

## Introduction

This document provides comprehensive specifications for the Financial Entitlement Platform (FEP) application (implemented as MERN application) with particular focus on the integration with Personal Data Store (PDS) for verifiable credential management. The specification includes detailed requirements for application form handling, evidence uploads, and PDS integration.

## Table of Contents
1. [System Overview](#system-overview)
2. [Application Form Requirements](#application-form-requirements)
3. [Evidence Upload Requirements](#evidence-upload-requirements)
4. [Evidence Viewing Requirements](#evidence-viewing-requirements)
5. [PDS Integration](#pds-integration)
6. [Verifiable Credential Management](#verifiable-credential-management)
7. [API Specifications](#api-specifications)
8. [Security Requirements](#security-requirements)
9. [Data Models](#data-models)

## System Overview

The Financial Entitlement Platform (FEP) application is a MERN (MongoDB, Express, React, Node.js) stack application that allows users to apply for financial entitlements. The system enables users to:

- Create and manage application forms
- Upload evidence documents to support their application
- Access and utilize verifiable credentials stored in their Personal Data Store (PDS)
- Submit completed applications for processing

The integration with PDS allows for a more streamlined application process by leveraging pre-verified credentials, reducing the need for manual document verification.

## Application Form Requirements

1. **Data Persistence**
   - The application form must persist data to a MongoDB database
   - Each form should be stored as a document in an "applicationForms" collection

2. **Application Identification**
   - Each application form must have a unique identifier (`applicationId`)
   - The application ID must be a UUID v4 format
   - Example: `"applicationId": "550e8400-e29b-41d4-a716-446655440000"`

3. **User Association**
   - Each application form must be associated with a specific user via their `customerId`
   - The customerId must be stored with the application form document
   - Example: `"customerId": "user-123456"`

4. **Application Status Management**
   - Applications must have a status field with the following possible values:
     - "draft": Initial state, editable by the user
     - "submitted": Final state, no longer editable by the user
   - Status transitions must be logged with timestamps
   - Example: `"status": "draft", "statusHistory": [{"status": "draft", "timestamp": "2025-07-19T10:30:00Z"}]`

5. **Draft Management**
   - The system must allow users to save forms as drafts
   - Draft forms must be retrievable when users log back in
   - Each page of the form must be independently saveable
   - Draft data must be loaded automatically when a user returns to a previously saved page

6. **Form Submission**
   - Upon submission, the application status must be updated to "submitted"
   - A submission timestamp must be recorded
   - A confirmation receipt should be generated and provided to the user
   - Example: `"status": "submitted", "submissionTimestamp": "2025-07-19T14:45:00Z"`

## Evidence Upload Requirements

1. **Supported File Formats**
   - The system must support the following image formats:
     - JPEG (.jpg, .jpeg)
     - PNG (.png)
     - TIFF (.tiff, .tif)
     - PDF (.pdf)
   - Maximum file size: 10MB per file
   - Maximum total upload size: 50MB per application

2. **Multi-file Selection**
   - Users must be able to select multiple files for upload in a single operation
   - The UI must provide clear feedback on selected files
   - The UI must display progress during the upload process

3. **Upload Processing Workflow**
   - For each selected file, the system must seuentially:
     - **Duplicate Check**: Verify the filename doesn't already exist for this application
     - **Upload**: If not a duplicate, upload and associate with the application
     - **Record**: Add the filename to the evidence structure of the application model
     - **Text Extraction**: Extract text from the image using OCR
     - **Classification**: Identify document type (birth certificate, death certificate, etc.)
     - **Field Matching**: Match extracted data to application form fields
     - **Data Population**: Pre-fill matched data into the application form data model

4. **Evidence Data Model**
   - Each piece of evidence must be stored with the following example information:
   ```json
   {
     "evidenceId": "ev-550e8400-e29b-41d4-a716-446655440000",
     "filename": "birth_certificate.jpg",
     "uploadTimestamp": "2025-07-19T11:30:00Z",
     "documentType": "Birth Certificate",
     "extractedText": "...",
     "matchedFields": [
       {
         "formField": "dateOfBirth",
         "extractedValue": "1980-01-15",
         "confidenceScore": 0.95
       }
     ]
   }
   ```

## Evidence Viewing Requirements

1. **Evidence List View**
   - On entering the evidence upload page, the system must display all evidence bound to the current application
   - The list must include:
     - Filename
     - Upload date
     - Document type (if identified)
     - Status (processed, pending)

2. **Evidence Deletion**
   - Users must be able to delete previously uploaded evidence
   - Deletion process:
     - Remove the evidence file from storage
     - Remove the evidence entry from the application model
     - Maintain, do not delete, any form data that was populated from the evidence
   - Confirmation dialog must be displayed before deletion

3. **Evidence Detail View**
   - Users should be able to view details of uploaded evidence including:
     - Preview of the document (if image format)
     - Extracted data
     - Fields populated from this evidence

## PDS Integration

### 1. PDS Connection Flow

1. **User Opt-in**
   - On the evidence page, include a section: "Do you have a Personal Data Store with Verifiable Credentials?"
   - If user selects "Yes", prompt for their WebID
   - Example WebID format: `https://username.solidcommunity.net/profile/card#me`

2. **WebID Processing**
   - Extract the PDS URL from the WebID
   - Example: From `https://username.solidcommunity.net/profile/card#me`, extract `https://username.solidcommunity.net/`

3. **Service Registration**
   - Check if FEP service is already registered with this PDS provider
   - If not registered, initiate registration process

### 2. PDS Registration Process

1. **Registration API Endpoint**
   - Endpoint: `POST https://{pds-url}/pds/register`
   - Headers:
     ```
     Content-Type: application/json
     ```
   - Request Body:
     ```json
     {
       "serviceDid": "did:web:fep.example.org",
       "domain": "fep.example.org",
       "description": "Financial Entitlement Platform Application",
       "capabilities": [
         "read:credentials",
         "verify:credentials"
       ],
       "redirectUrl": "https://fep.example.org/pds/callback"
     }
     ```
   - Response:
     ```json
     {
       "registrationId": "reg-550e8400-e29b-41d4-a716-446655440000",
       "status": "pending",
       "verificationRequired": true
     }
     ```

2. **Service Key Generation**
   - Generate RSA key pair for PDS communication
   - Store private key securely in environment variables or secure key storage
   - Public key format for registration:
     ```json
     {
       "kid": "key-1",
       "kty": "RSA",
       "alg": "RS256",
       "use": "sig",
       "n": "...",
       "e": "AQAB"
     }
     ```

3. **Registration Storage**
   - Store registration details in a secure database collection
   - Data model:
     ```json
     {
       "pdsProvider": "solidcommunity.net",
       "registrationId": "reg-550e8400-e29b-41d4-a716-446655440000",
       "serviceDid": "did:web:fep.example.org",
       "registrationTimestamp": "2025-07-19T10:30:00Z",
       "status": "active",
       "accessToken": "...",
       "refreshToken": "...",
       "expiresAt": "2025-07-19T11:30:00Z"
     }
     ```

### 3. SOLID OIDC Authentication Flow

1. **Authentication Initialization**
   - Redirect the user to the PDS OIDC authentication endpoint
   - URL format: `https://{pds-url}/auth?client_id={serviceDid}&redirect_uri={redirectUrl}&response_type=code&scope=openid%20profile%20offline_access&state={state}`
   - The `state` parameter should be a secure random value stored in the session

2. **Authentication Callback**
   - Callback endpoint: `GET https://fep.example.org/pds/callback`
   - Extract authorization code from query parameters
   - Validate state parameter matches stored value

3. **Token Exchange**
   - Exchange authorization code for access token
   - Endpoint: `POST https://{pds-url}/token`
   - Headers:
     ```
     Content-Type: application/x-www-form-urlencoded
     ```
   - Request Body:
     ```
     grant_type=authorization_code&
     code={authorization_code}&
     redirect_uri={redirectUrl}&
     client_id={serviceDid}
     ```
   - Response:
     ```json
     {
       "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
       "refresh_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
       "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
       "token_type": "Bearer",
       "expires_in": 3600
     }
     ```

4. **User Redirection**
   - After successful authentication, redirect the user back to the evidence upload page
   - Include a query parameter to indicate successful PDS connection
   - Example: `https://fep.example.org/application/{applicationId}/evidence?pds_connected=true`

## Verifiable Credential Management

### 1. Retrieving Verifiable Credentials

1. **Credentials List API**
   - Endpoint: `GET https://{pds-url}/pds/credentials`
   - Headers:
     ```
     Authorization: Bearer {access_token}
     ```
   - Response:
     ```json
     {
       "credentials": [
         {
           "id": "credential-123",
           "type": "DeathCertificateCredential",
           "issuer": "did:web:dro.example.org",
           "subject": "did:web:username.solidcommunity.net",
           "storedAt": "2025-06-01T11:30:00Z"
         },
         {
           "id": "credential-456",
           "type": "ElectricityBillCredential",
           "issuer": "did:web:northern-electric.example",
           "subject": "did:web:username.solidcommunity.net",
           "storedAt": "2025-06-15T09:45:00Z"
         }
       ]
     }
     ```

2. **Credential Detail API**
   - Endpoint: `GET https://{pds-url}/pds/credentials/{credentialId}`
   - Headers:
     ```
     Authorization: Bearer {access_token}
     ```
   - Response:
     ```json
     {
       "id": "credential-123",
       "type": "DeathCertificateCredential",
       "issuer": "did:web:dro.example.org",
       "subject": "did:web:username.solidcommunity.net",
       "storedAt": "2025-06-01T11:30:00Z",
       "credential": {
         "@context": [
           "https://www.w3.org/2018/credentials/v1",
           "https://dro.example.org/schemas/v1"
         ],
         "id": "https://dro.example.org/credentials/credential-123",
         "type": ["VerifiableCredential", "DeathCertificateCredential"],
         "issuer": "did:web:dro.example.org",
         "issuanceDate": "2025-06-01T10:00:00Z",
         "expirationDate": "2026-06-01T10:00:00Z",
         "credentialSubject": {
           "id": "did:web:username.solidcommunity.net",
           "deceasedPerson": {
             "name": "John Smith",
             "dateOfBirth": "1945-03-15",
             "dateOfDeath": "2025-05-20",
             "placeOfDeath": "London, UK",
             "registrationNumber": "DRO123456789"
           }
         },
         "proof": {
           "type": "Ed25519Signature2020",
           "created": "2025-06-01T10:00:00Z",
           "verificationMethod": "did:web:dro.example.org#key-1",
           "proofPurpose": "assertionMethod",
           "proofValue": "mockSignatureValue"
         }
       }
     }
     ```

### 2. Verifiable Credential Processing

1. **VC Selection and Upload**
   - Display available VCs to the user with relevant details (type, issuer, date)
   - Allow selection of one or more VCs to import
   - For each selected VC:
     - Check if already associated with the application
     - If new, add to the application's VC structure

2. **VC Data Model**
   - Each verifiable credential must be stored with the following information:
   ```json
   {
     "vcId": "credential-123",
     "type": "DeathCertificateCredential",
     "issuer": "did:web:dro.example.org",
     "importTimestamp": "2025-07-19T13:30:00Z",
     "verified": true,
     "matchedFields": [
       {
         "formField": "deceasedName",
         "extractedValue": "John Smith",
         "source": "credential.credentialSubject.deceasedPerson.name"
       },
       {
         "formField": "dateOfDeath",
         "extractedValue": "2025-05-20",
         "source": "credential.credentialSubject.deceasedPerson.dateOfDeath"
       }
     ]
   }
   ```

3. **Field Mapping Logic**
   - For Death Certificate Credentials:
     - Map `credential.credentialSubject.deceasedPerson.name` to `application.deceasedName`
     - Map `credential.credentialSubject.deceasedPerson.dateOfBirth` to `application.deceasedDateOfBirth`
     - Map `credential.credentialSubject.deceasedPerson.dateOfDeath` to `application.dateOfDeath`
     - Map `credential.credentialSubject.deceasedPerson.registrationNumber` to `application.deathRegistrationNumber`

   - For Utility Bill Credentials:
     - Map `credential.credentialSubject.address` to `application.address`
     - Map `credential.credentialSubject.billDetails.amount` to `application.utilityAmount`
     - Map `credential.credentialSubject.billDetails.billingPeriod` to `application.utilityBillingPeriod`

## VC Viewing Requirements

1. **VC List View**
   - On entering the VC upload page, display all VCs bound to the current application
   - The list must include:
     - Credential type
     - Issuer
     - Issue date
     - Status (valid, expired)

2. **VC Deletion**
   - Users must be able to remove previously imported VCs from their application
   - Deletion process:
     - Remove the VC entry from the application model
     - Maintain any form data that was populated from the VC
   - Confirmation dialog must be displayed before removal

3. **VC Detail View**
   - Allow users to view details of imported VCs including:
     - Full credential details in a readable format
     - Fields populated from this credential
     - Verification status

## API Specifications

### 1. Application Form APIs

```
GET    /api/applications                  # List user's applications
POST   /api/applications                  # Create new application
GET    /api/applications/{applicationId}  # Get application details
PUT    /api/applications/{applicationId}  # Update application (draft)
POST   /api/applications/{applicationId}/submit  # Submit application
```

### 2. Evidence APIs

```
GET    /api/applications/{applicationId}/evidence           # List evidence
POST   /api/applications/{applicationId}/evidence           # Upload evidence
DELETE /api/applications/{applicationId}/evidence/{evidenceId}  # Delete evidence
GET    /api/applications/{applicationId}/evidence/{evidenceId}  # Get evidence details
```

### 3. PDS Integration APIs

```
GET    /api/pds/status                    # Check PDS connection status
POST   /api/pds/connect                   # Initialize PDS connection
GET    /pds/callback                      # OIDC callback handler
GET    /api/pds/credentials               # List available credentials
POST   /api/applications/{applicationId}/credentials        # Import credentials
DELETE /api/applications/{applicationId}/credentials/{vcId}  # Remove credential
```

## Security Requirements

1. **Authentication**
   - All API endpoints must require valid authentication
   - JWT-based authentication with short expiry (15 minutes)
   - Refresh token rotation for security
   - CSRF protection for all state-changing operations

2. **Authorization**
   - Users must only access their own applications and data
   - Role-based access control for administrative functions
   - Audit logging for all sensitive operations

3. **Data Protection**
   - All PDS access tokens must be encrypted at rest
   - PII must be encrypted in the database
   - TLS 1.3 required for all communications
   - Verifiable credential contents must be validated for integrity

4. **Key Management**
   - RSA keys for PDS authentication stored in secure key vault
   - Key rotation policy (90 days)
   - Different keys for different environments (dev, test, prod)

## Data Models

### Application Form Model

```json
{
  "_id": "ObjectId",
  "applicationId": "550e8400-e29b-41d4-a716-446655440000",
  "customerId": "user-123456",
  "status": "draft",
  "statusHistory": [
    {
      "status": "draft",
      "timestamp": "2025-07-19T10:30:00Z"
    }
  ],
  "createdAt": "2025-07-19T10:30:00Z",
  "updatedAt": "2025-07-19T10:45:00Z",
  "submittedAt": null,
  "formData": {
    "personalDetails": {
      "firstName": "Jane",
      "lastName": "Doe",
      "dateOfBirth": "1980-01-15",
      "email": "jane.doe@example.com",
      "phone": "+447123456789"
    },
    "deceasedDetails": {
      "deceasedName": "John Smith",
      "deceasedDateOfBirth": "1945-03-15",
      "dateOfDeath": "2025-05-20",
      "relationshipToDeceased": "Spouse",
      "deathRegistrationNumber": "DRO123456789"
    },
    "address": {
      "line1": "123 High Street",
      "line2": "Apartment 4B",
      "city": "London",
      "postcode": "SW1A 1AA",
      "country": "United Kingdom"
    }
  },
  "evidence": [
    {
      "evidenceId": "ev-550e8400-e29b-41d4-a716-446655440000",
      "filename": "birth_certificate.jpg",
      "uploadTimestamp": "2025-07-19T11:30:00Z",
      "documentType": "Birth Certificate",
      "extractedText": "...",
      "matchedFields": [
        {
          "formField": "personalDetails.dateOfBirth",
          "extractedValue": "1980-01-15",
          "confidenceScore": 0.95
        }
      ]
    }
  ],
  "verifiableCredentials": [
    {
      "vcId": "credential-123",
      "type": "DeathCertificateCredential",
      "issuer": "did:web:dro.example.org",
      "importTimestamp": "2025-07-19T13:30:00Z",
      "verified": true,
      "matchedFields": [
        {
          "formField": "deceasedDetails.deceasedName",
          "extractedValue": "John Smith",
          "source": "credential.credentialSubject.deceasedPerson.name"
        },
        {
          "formField": "deceasedDetails.dateOfDeath",
          "extractedValue": "2025-05-20",
          "source": "credential.credentialSubject.deceasedPerson.dateOfDeath"
        }
      ]
    }
  ]
}
```

### PDS Registration Model

```json
{
  "_id": "ObjectId",
  "pdsProvider": "solidcommunity.net",
  "registrationId": "reg-550e8400-e29b-41d4-a716-446655440000",
  "serviceDid": "did:web:fep.example.org",
  "registrationTimestamp": "2025-07-19T10:30:00Z",
  "status": "active",
  "publicKey": {
    "kid": "key-1",
    "kty": "RSA",
    "alg": "RS256",
    "use": "sig",
    "n": "...",
    "e": "AQAB"
  },
  "keyId": "vault:/keys/pds-integration-key"
}
```

### PDS User Session Model

```json
{
  "_id": "ObjectId",
  "customerId": "user-123456",
  "pdsProvider": "solidcommunity.net",
  "webId": "https://username.solidcommunity.net/profile/card#me",
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-07-19T11:30:00Z",
  "createdAt": "2025-07-19T10:30:00Z",
  "updatedAt": "2025-07-19T10:30:00Z"
}
```

---

## Implementation Guidance

1. **Error Handling**
   - Implement consistent error responses with appropriate HTTP status codes
   - Include error codes and descriptive messages
   - Log all errors with relevant context for troubleshooting

2. **Performance Considerations**
   - Implement caching for PDS registrations to reduce authentication overhead
   - Use background processing for document OCR and text extraction
   - Implement pagination for credential and evidence listings

3. **Testing Requirements**
   - Unit tests for all API endpoints and business logic
   - Integration tests for PDS connectivity
   - Mock PDS server for testing authentication flows
   - Load testing for concurrent uploads and processing

4. **Monitoring and Logging**
   - Track PDS connection success/failure rates
   - Monitor credential verification success rates
   - Log all user actions for audit purposes
   - Alert on repeated authentication failures
