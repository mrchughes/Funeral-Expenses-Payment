# PDS Integration Strategy

## Introduction

This document outlines the strategy for integrating Personal Data Store (PDS) capabilities into the Financial Entitlement Platform (FEP) application, based on the requirements specified in `Requirements/PDS-Integration.md`. The integration will allow users to connect to their PDS, retrieve verifiable credentials, and use them alongside traditional evidence uploads in their applications.

## Current State Analysis

The current implementation uses a file upload approach where:
1. Users upload evidence files to the backend
2. Files are stored in the server's filesystem
3. OCR is performed on the files to extract text
4. Extracted data is used to pre-fill form fields

The system needs to be extended to support PDS integration while maintaining existing functionality.

## Requirements Overview

Based on the PDS integration requirements (`Requirements/PDS-Integration.md`), we need to:

1. Allow users to connect to their Personal Data Store (PDS) via WebID
2. Support SOLID OIDC authentication flow
3. Retrieve and use verifiable credentials from users' PDS
4. Integrate both traditional file uploads and PDS credentials
5. Support credential verification
6. Work with any WebID/PDS provider (not bound to a specific one)

## Refactoring Strategy

### 1. Backend Models

We need to create new models and update existing ones:

1. **PDS Registration Model**
   - Store information about registered PDS providers
   - Include registration ID, service DID, and public key information
   - Track registration status and timestamps

2. **PDS User Session Model**
   - Store user's PDS connection information
   - Include WebID, access tokens, and refresh tokens
   - Track token expiration and session status

3. **Update Application Model**
   - Add verifiable credentials array
   - Update evidence structure to match requirements
   - Support both traditional evidence and verifiable credentials

### 2. Backend Services

Create new services for PDS integration:

1. **PDS Connection Service**
   - Extract PDS URL from WebID
   - Handle PDS provider registration
   - Generate authentication URLs

2. **PDS Authentication Service**
   - Implement SOLID OIDC authentication flow
   - Handle token exchange and refresh
   - Secure token storage

3. **Credential Service**
   - Fetch credentials from PDS
   - Process and validate credentials
   - Map credential fields to application fields

4. **Update Evidence Service**
   - Support both file uploads and credentials
   - Unify evidence extraction approach
   - Maintain backward compatibility

### 3. Backend Controllers

Implement new controllers and update existing ones:

1. **PDS Controller**
   - `POST /api/pds/connect` - Initialize PDS connection
   - `GET /api/pds/status` - Check PDS connection status
   - `GET /pds/callback` - Handle OIDC callback

2. **Credentials Controller**
   - `GET /api/pds/credentials` - List available credentials
   - `POST /api/applications/{applicationId}/credentials` - Import credentials
   - `DELETE /api/applications/{applicationId}/credentials/{vcId}` - Remove credential

3. **Update Evidence Controller**
   - Support both file uploads and credentials
   - Unify evidence extraction approach
   - Maintain backward compatibility

### 4. Frontend Components

Create new components and update existing ones:

1. **PDS Connection Component**
   - WebID input form
   - Connection status display
   - Error handling

2. **Evidence Tabs Component**
   - Toggle between file uploads and credentials
   - Unified evidence management interface
   - Support both evidence types

3. **Credential List Component**
   - Display available credentials
   - Credential selection and import
   - Credential detail view

4. **Update Evidence Upload Component**
   - Support both file uploads and credentials
   - Unified status tracking
   - Improved error handling

## Implementation Phases

### Phase 1: Infrastructure Setup

1. Create new models:
   - `models/pdsRegistration.js`
   - `models/pdsUserSession.js`
   - Update `models/application.js`

2. Implement PDS connection services:
   - `services/pdsService.js`
   - `services/pdsAuthService.js`

3. Create basic controllers:
   - `controllers/pdsController.js`
   - Initial routes in `routes/pdsRoutes.js`

### Phase 2: Credential Management

1. Implement credential services:
   - `services/credentialService.js`
   - `services/credentialMappingService.js`

2. Create credential controllers:
   - `controllers/credentialsController.js`
   - Routes in `routes/credentialsRoutes.js`

3. Update application model for credentials:
   - Add verifiable credentials array
   - Update field mapping logic

### Phase 3: Frontend Integration

1. Create PDS connection components:
   - `components/PDSConnectionForm.js`
   - `components/PDSConnectionStatus.js`

2. Implement credential components:
   - `components/CredentialList.js`
   - `components/CredentialDetail.js`
   - `components/CredentialImport.js`

3. Update evidence components:
   - Modify `components/EvidenceUpload.js`
   - Create `components/EvidenceTabs.js`

### Phase 4: Testing & Refinement

1. Create test utilities:
   - Mock PDS provider for testing
   - Sample verifiable credentials

2. Test with different PDS providers:
   - Test with at least 2-3 different PDS implementations
   - Ensure compatibility

3. Enhance error handling and user experience:
   - Improve error messages
   - Add loading states
   - Optimize user flows

## Detailed Implementation Plan

### 1. Backend Models

```javascript
// models/pdsRegistration.js
const PDSRegistrationSchema = new mongoose.Schema({
  pdsProvider: String,
  registrationId: String,
  serviceDid: String,
  registrationTimestamp: Date,
  status: { 
    type: String, 
    enum: ['pending', 'active', 'revoked'],
    default: 'pending'
  },
  publicKey: {
    kid: String,
    kty: String,
    alg: String,
    use: String,
    n: String,
    e: String
  },
  keyId: String
});

// models/pdsUserSession.js
const PDSUserSessionSchema = new mongoose.Schema({
  customerId: String,
  pdsProvider: String,
  webId: String,
  accessToken: String, // Should be encrypted
  refreshToken: String, // Should be encrypted
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update to models/application.js
const VerifiableCredentialSchema = new mongoose.Schema({
  vcId: String,
  type: String,
  issuer: String,
  importTimestamp: Date,
  verified: Boolean,
  matchedFields: [{
    formField: String,
    extractedValue: String,
    source: String
  }]
});

// Add this to the ApplicationSchema
verifiableCredentials: [VerifiableCredentialSchema]
```

### 2. Backend Services

```javascript
// services/pdsService.js
const extractPdsUrl = (webId) => {
  // Extract PDS URL from WebID
  try {
    const url = new URL(webId);
    return `${url.protocol}//${url.hostname}`;
  } catch (err) {
    throw new Error('Invalid WebID format');
  }
};

const registerWithProvider = async (pdsUrl) => {
  // Register service with PDS provider
  const registrationEndpoint = `${pdsUrl}/pds/register`;
  
  // Generate RSA key pair
  const keyPair = await generateRsaKeyPair();
  
  // Create registration request
  const registrationData = {
    serviceDid: process.env.SERVICE_DID || 'did:web:fep.example.org',
    domain: process.env.SERVICE_DOMAIN || 'fep.example.org',
    description: 'Financial Entitlement Platform Application',
    capabilities: ['read:credentials', 'verify:credentials'],
    redirectUrl: `${process.env.SERVICE_URL}/pds/callback`
  };
  
  // Send registration request
  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registrationData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`PDS registration failed: ${error.message}`);
  }
  
  const result = await response.json();
  
  // Store registration in database
  const registration = new PDSRegistration({
    pdsProvider: new URL(pdsUrl).hostname,
    registrationId: result.registrationId,
    serviceDid: registrationData.serviceDid,
    registrationTimestamp: new Date(),
    status: result.status,
    publicKey: keyPair.publicKeyJwk,
    keyId: `vault:/keys/pds-${new URL(pdsUrl).hostname}`
  });
  
  await registration.save();
  return registration;
};

// services/pdsAuthService.js
const generateAuthUrl = (registration, webId) => {
  const pdsUrl = extractPdsUrl(webId);
  const state = generateRandomState(); // Generate secure random state
  
  // Store state in session
  // ...
  
  return `${pdsUrl}/auth?client_id=${registration.serviceDid}&redirect_uri=${process.env.SERVICE_URL}/pds/callback&response_type=code&scope=openid%20profile%20offline_access&state=${state}`;
};

const handleCallback = async (code, state) => {
  // Validate state
  // ...
  
  // Get registration by state
  // ...
  
  // Exchange code for tokens
  const tokenEndpoint = `${pdsUrl}/token`;
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.SERVICE_URL}/pds/callback`,
      client_id: registration.serviceDid
    })
  });
  
  if (!response.ok) {
    throw new Error('Token exchange failed');
  }
  
  const tokens = await response.json();
  
  // Store tokens securely
  const session = new PDSUserSession({
    customerId,
    pdsProvider: registration.pdsProvider,
    webId,
    accessToken: encrypt(tokens.access_token),
    refreshToken: encrypt(tokens.refresh_token),
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
  });
  
  await session.save();
  return session;
};

// services/credentialService.js
const getCredentials = async (session) => {
  const pdsUrl = extractPdsUrl(session.webId);
  const credentialsEndpoint = `${pdsUrl}/pds/credentials`;
  
  // Get access token
  const accessToken = decrypt(session.accessToken);
  
  // Check if token is expired
  if (new Date() > session.expiresAt) {
    // Refresh token
    // ...
  }
  
  // Fetch credentials
  const response = await fetch(credentialsEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch credentials');
  }
  
  return await response.json();
};

const getCredentialDetails = async (session, credentialId) => {
  const pdsUrl = extractPdsUrl(session.webId);
  const credentialEndpoint = `${pdsUrl}/pds/credentials/${credentialId}`;
  
  // Get access token
  const accessToken = decrypt(session.accessToken);
  
  // Fetch credential details
  const response = await fetch(credentialEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch credential details');
  }
  
  return await response.json();
};

// services/credentialMappingService.js
const mapCredentialToFormFields = (credential) => {
  const mappedFields = [];
  
  // Death Certificate Credential mapping
  if (credential.type.includes('DeathCertificateCredential')) {
    const subject = credential.credential.credentialSubject;
    
    if (subject.deceasedPerson) {
      if (subject.deceasedPerson.name) {
        mappedFields.push({
          formField: 'deceasedDetails.deceasedName',
          extractedValue: subject.deceasedPerson.name,
          source: 'credential.credentialSubject.deceasedPerson.name'
        });
      }
      
      if (subject.deceasedPerson.dateOfBirth) {
        mappedFields.push({
          formField: 'deceasedDetails.deceasedDateOfBirth',
          extractedValue: subject.deceasedPerson.dateOfBirth,
          source: 'credential.credentialSubject.deceasedPerson.dateOfBirth'
        });
      }
      
      if (subject.deceasedPerson.dateOfDeath) {
        mappedFields.push({
          formField: 'deceasedDetails.dateOfDeath',
          extractedValue: subject.deceasedPerson.dateOfDeath,
          source: 'credential.credentialSubject.deceasedPerson.dateOfDeath'
        });
      }
      
      if (subject.deceasedPerson.registrationNumber) {
        mappedFields.push({
          formField: 'deceasedDetails.deathRegistrationNumber',
          extractedValue: subject.deceasedPerson.registrationNumber,
          source: 'credential.credentialSubject.deceasedPerson.registrationNumber'
        });
      }
    }
  }
  
  // Utility Bill Credential mapping
  if (credential.type.includes('UtilityBillCredential')) {
    const subject = credential.credential.credentialSubject;
    
    if (subject.address) {
      mappedFields.push({
        formField: 'address',
        extractedValue: subject.address,
        source: 'credential.credentialSubject.address'
      });
    }
    
    if (subject.billDetails) {
      if (subject.billDetails.amount) {
        mappedFields.push({
          formField: 'utilityAmount',
          extractedValue: subject.billDetails.amount,
          source: 'credential.credentialSubject.billDetails.amount'
        });
      }
      
      if (subject.billDetails.billingPeriod) {
        mappedFields.push({
          formField: 'utilityBillingPeriod',
          extractedValue: subject.billDetails.billingPeriod,
          source: 'credential.credentialSubject.billDetails.billingPeriod'
        });
      }
    }
  }
  
  return mappedFields;
};
```

### 3. Backend Controllers

```javascript
// controllers/pdsController.js
const connectPDS = async (req, res) => {
  try {
    const { webId } = req.body;
    const customerId = req.user.id;
    
    // Validate WebID
    if (!webId || !webId.includes('://')) {
      return res.status(400).json({ error: 'Invalid WebID format' });
    }
    
    // Extract PDS URL from WebID
    const pdsUrl = extractPdsUrl(webId);
    
    // Check if PDS provider is registered
    let registration = await PDSRegistration.findOne({ pdsProvider: getDomain(pdsUrl) });
    
    if (!registration) {
      // Register with PDS provider
      registration = await pdsService.registerWithProvider(pdsUrl);
    }
    
    // Generate auth URL for redirect
    const authUrl = pdsAuthService.generateAuthUrl(registration, webId);
    
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    // Process callback
    await pdsAuthService.handleCallback(code, state);
    
    // Redirect to evidence page
    res.redirect(`/application/${applicationId}/evidence?pds_connected=true`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getPDSStatus = async (req, res) => {
  try {
    const customerId = req.user.id;
    
    // Check if user has active PDS session
    const session = await PDSUserSession.findOne({ customerId });
    
    if (!session) {
      return res.json({ connected: false });
    }
    
    // Check if session is still valid
    const isValid = new Date() < session.expiresAt;
    
    res.json({
      connected: isValid,
      webId: session.webId,
      pdsProvider: session.pdsProvider
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// controllers/credentialsController.js
const listCredentials = async (req, res) => {
  try {
    const customerId = req.user.id;
    
    // Get user's PDS session
    const session = await PDSUserSession.findOne({ customerId });
    
    if (!session) {
      return res.status(400).json({ error: 'No active PDS session' });
    }
    
    // Get credentials from PDS
    const credentials = await credentialService.getCredentials(session);
    
    res.json({ credentials });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const importCredential = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { credentialId } = req.body;
    const customerId = req.user.id;
    
    // Validate parameters
    if (!applicationId || !credentialId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Get application
    const application = await Application.findOne({ 
      applicationId, 
      customerId 
    });
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    // Get user's PDS session
    const session = await PDSUserSession.findOne({ customerId });
    
    if (!session) {
      return res.status(400).json({ error: 'No active PDS session' });
    }
    
    // Get credential details
    const credential = await credentialService.getCredentialDetails(session, credentialId);
    
    // Map credential fields to application fields
    const matchedFields = mapCredentialToFormFields(credential);
    
    // Create verifiable credential record
    const vcRecord = {
      vcId: credential.id,
      type: credential.type,
      issuer: credential.issuer,
      importTimestamp: new Date(),
      verified: true,
      matchedFields
    };
    
    // Add to application
    application.verifiableCredentials.push(vcRecord);
    
    // Update form data with matched fields
    matchedFields.forEach(field => {
      // Use lodash or similar to set nested fields
      _.set(application.formData, field.formField, field.extractedValue);
    });
    
    await application.save();
    
    res.json({ 
      success: true, 
      credential: vcRecord,
      updatedFields: matchedFields.map(f => f.formField)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const removeCredential = async (req, res) => {
  try {
    const { applicationId, vcId } = req.params;
    const customerId = req.user.id;
    
    // Get application
    const application = await Application.findOne({ 
      applicationId, 
      customerId 
    });
    
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    
    // Remove credential
    application.verifiableCredentials = application.verifiableCredentials.filter(
      vc => vc.vcId !== vcId
    );
    
    await application.save();
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
```

### 4. Frontend Components

```jsx
// components/PDSConnectionForm.js
import React, { useState } from 'react';
import { connectToPDS } from '../api/pdsApi';

const PDSConnectionForm = () => {
  const [webId, setWebId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const result = await connectToPDS(webId);
      
      if (result.authUrl) {
        // Redirect to PDS provider for authentication
        window.location.href = result.authUrl;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="pds-connection-form">
      <h3>Connect to Personal Data Store</h3>
      <form onSubmit={handleConnect}>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="webId">Your WebID</label>
          <input
            type="text"
            id="webId"
            className="govuk-input"
            value={webId}
            onChange={(e) => setWebId(e.target.value)}
            placeholder="https://username.solidcommunity.net/profile/card#me"
          />
        </div>
        {error && <div className="govuk-error-message">{error}</div>}
        <button 
          type="submit" 
          className="govuk-button" 
          disabled={loading}
        >
          {loading ? 'Connecting...' : 'Connect to PDS'}
        </button>
      </form>
    </div>
  );
};

// components/PDSConnectionStatus.js
import React, { useState, useEffect } from 'react';
import { getPDSStatus } from '../api/pdsApi';

const PDSConnectionStatus = () => {
  const [status, setStatus] = useState({
    connected: false,
    webId: '',
    pdsProvider: ''
  });
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await getPDSStatus();
        setStatus(result);
      } catch (err) {
        console.error('Failed to get PDS status:', err);
      } finally {
        setLoading(false);
      }
    };
    
    checkStatus();
  }, []);
  
  if (loading) return <div>Checking PDS connection...</div>;
  
  if (!status.connected) {
    return null; // Don't show status if not connected
  }
  
  return (
    <div className="pds-connection-status govuk-inset-text">
      <h4>Connected to Personal Data Store</h4>
      <p>WebID: {status.webId}</p>
      <p>Provider: {status.pdsProvider}</p>
    </div>
  );
};

// components/EvidenceTabs.js
import React, { useState } from 'react';
import EvidenceUpload from './EvidenceUpload';
import CredentialList from './CredentialList';
import PDSConnectionForm from './PDSConnectionForm';
import PDSConnectionStatus from './PDSConnectionStatus';

const EvidenceTabs = ({ applicationId }) => {
  const [activeTab, setActiveTab] = useState('upload');
  const [pdsStatus, setPdsStatus] = useState({ connected: false });
  
  useEffect(() => {
    const checkPDSStatus = async () => {
      try {
        const status = await getPDSStatus();
        setPdsStatus(status);
      } catch (err) {
        console.error('Failed to get PDS status:', err);
      }
    };
    
    checkPDSStatus();
  }, []);
  
  return (
    <div className="evidence-tabs">
      <div className="govuk-tabs" data-module="govuk-tabs">
        <ul className="govuk-tabs__list">
          <li className="govuk-tabs__list-item">
            <button 
              className={`govuk-tabs__tab ${activeTab === 'upload' ? 'govuk-tabs__tab--selected' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              Upload Evidence
            </button>
          </li>
          <li className="govuk-tabs__list-item">
            <button 
              className={`govuk-tabs__tab ${activeTab === 'credentials' ? 'govuk-tabs__tab--selected' : ''}`}
              onClick={() => setActiveTab('credentials')}
            >
              Verifiable Credentials
            </button>
          </li>
        </ul>
        
        <div className={`govuk-tabs__panel ${activeTab !== 'upload' ? 'govuk-tabs__panel--hidden' : ''}`}>
          <EvidenceUpload applicationId={applicationId} />
        </div>
        
        <div className={`govuk-tabs__panel ${activeTab !== 'credentials' ? 'govuk-tabs__panel--hidden' : ''}`}>
          <PDSConnectionStatus />
          
          {!pdsStatus.connected ? (
            <PDSConnectionForm />
          ) : (
            <CredentialList applicationId={applicationId} />
          )}
        </div>
      </div>
    </div>
  );
};

// components/CredentialList.js
import React, { useState, useEffect } from 'react';
import { getCredentials, importCredential } from '../api/credentialsApi';

const CredentialList = ({ applicationId }) => {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState({});
  
  useEffect(() => {
    const fetchCredentials = async () => {
      try {
        const result = await getCredentials();
        setCredentials(result.credentials || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCredentials();
  }, []);
  
  const handleImport = async (credentialId) => {
    setImporting(prev => ({ ...prev, [credentialId]: true }));
    
    try {
      const result = await importCredential(applicationId, credentialId);
      
      // Show success message or update UI
      if (result.success) {
        // Filter out the imported credential to avoid duplicates
        setCredentials(prev => prev.filter(c => c.id !== credentialId));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(prev => ({ ...prev, [credentialId]: false }));
    }
  };
  
  if (loading) return <div>Loading credentials...</div>;
  if (error) return <div className="govuk-error-message">{error}</div>;
  
  return (
    <div className="credential-list">
      <h3>Available Credentials</h3>
      {credentials.length === 0 ? (
        <p>No credentials found in your PDS.</p>
      ) : (
        <ul className="govuk-list">
          {credentials.map(cred => (
            <li key={cred.id} className="credential-item">
              <div className="credential-info">
                <h4>{cred.type}</h4>
                <p>Issuer: {cred.issuer}</p>
                <p>Stored: {new Date(cred.storedAt).toLocaleDateString()}</p>
              </div>
              <button
                className="govuk-button"
                disabled={importing[cred.id]}
                onClick={() => handleImport(cred.id)}
              >
                {importing[cred.id] ? 'Importing...' : 'Import'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

## Security Considerations

1. **Token Security**
   - Encrypt all PDS tokens before storing in database
   - Use environment variables for storing sensitive keys
   - Implement token refresh mechanism
   - Handle token revocation properly

2. **Request Validation**
   - Validate all user input, especially WebIDs
   - Verify state parameter in OIDC callback
   - Validate credential signatures

3. **Access Control**
   - Ensure users can only access their own applications and credentials
   - Implement proper authorization checks
   - Log all sensitive operations

## Testing Approach

1. **Unit Testing**
   - Test individual components and services
   - Mock PDS responses
   - Validate error handling

2. **Integration Testing**
   - Test PDS connection flow
   - Test credential import process
   - Verify form field mapping

3. **End-to-End Testing**
   - Test complete user journey
   - Verify authentication flow
   - Test with actual PDS providers

## Conclusion

This strategy provides a comprehensive approach to integrating PDS capabilities into the FEP application. The implementation is designed to be modular, secure, and work with any WebID/PDS provider, not bound to a specific one.

The strategy maintains the existing evidence upload functionality while adding the ability to use verifiable credentials from a Personal Data Store, creating a more streamlined application process for users who have pre-verified credentials.

By following this strategy, the FEP application will fulfill all the requirements specified in the PDS integration specification document.
