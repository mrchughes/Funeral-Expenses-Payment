// Utility functions for evidence API

// Use backend API URL directly for production and dev
const API_URL = process.env.REACT_APP_API_URL || "/api";

export async function uploadEvidenceFile(file, token, onProgress, applicationId = null) {
  const formData = new FormData();
  formData.append("evidence", file);

  // If applicationId is provided, add it to the form data
  if (applicationId) {
    formData.append("applicationId", applicationId);
  }

  console.log(`[EVIDENCE API] Starting upload for file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);

  // Use XMLHttpRequest to track upload progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Set up progress tracking
    if (onProgress && typeof onProgress === 'function') {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          console.log(`[EVIDENCE API] Upload progress for ${file.name}: ${percentComplete}%`);
          onProgress(percentComplete, file.name);
        }
      });
    }

    xhr.open('POST', `${API_URL}/evidence/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          console.log(`[EVIDENCE API] Upload successful for ${file.name}:`, response);

          // Check if the response has an error message despite 200 status
          if (response.error) {
            console.error(`[EVIDENCE API] API returned error message for ${file.name}:`, response.error);
            resolve(response); // Return the response with error to be handled by caller
          } else {
            resolve(response);
          }
        } catch (e) {
          console.error(`[EVIDENCE API] Invalid JSON response for ${file.name}:`, e);
          reject(new Error('Invalid JSON response'));
        }
      } else {
        console.error(`[EVIDENCE API] Upload failed for ${file.name} with status: ${xhr.status}, response: ${xhr.responseText}`);
        try {
          // Try to parse error response as JSON
          const errorResponse = JSON.parse(xhr.responseText);
          if (errorResponse.error) {
            resolve({ error: errorResponse.error }); // Return structured error to caller
          } else {
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        } catch (e) {
          // If not JSON, return raw text
          reject(new Error(`Upload failed: ${xhr.responseText || 'Server error'}`));
        }
      }
    };

    xhr.onerror = function () {
      console.error(`[EVIDENCE API] Network error during upload for ${file.name}`);
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

export async function deleteEvidenceFile(evidenceId, token) {
  const res = await fetch(`${API_URL}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Delete failed");
  return await res.json();
}

export async function getEvidenceList(token, applicationId = null) {
  console.log(`[EVIDENCE API] Getting list of uploaded evidence files for application: ${applicationId || 'default'}`);

  try {
    const url = applicationId
      ? `${API_URL}/evidence/list/${encodeURIComponent(applicationId)}`
      : `${API_URL}/evidence/list`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EVIDENCE API] List error: ${response.status}, ${errorText}`);
      throw new Error(`Failed to list evidence: ${errorText || 'Server error'}`);
    }

    const data = await response.json();
    console.log(`[EVIDENCE API] Retrieved ${data.evidence?.length || 0} evidence files for application ${data.applicationId}`);
    return data; // Return the full data object with applicationId and evidence array
  } catch (error) {
    console.error(`[EVIDENCE API] List error:`, error);
    throw error;
  }
}

export async function getEvidenceDetails(evidenceId, token) {
  console.log(`[EVIDENCE API] Getting details for evidence: ${evidenceId}`);

  try {
    const response = await fetch(`${API_URL}/evidence/${encodeURIComponent(evidenceId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EVIDENCE API] Get details error: ${response.status}, ${errorText}`);
      throw new Error(`Failed to get evidence details: ${errorText || 'Server error'}`);
    }

    const data = await response.json();
    console.log(`[EVIDENCE API] Retrieved details for evidence: ${evidenceId}`);
    return data;
  } catch (error) {
    console.error(`[EVIDENCE API] Get details error:`, error);
    throw error;
  }
}

export async function updateEvidenceExtraction(evidenceId, extractionData, token) {
  console.log(`[EVIDENCE API] Updating extraction data for evidence: ${evidenceId}`);

  try {
    const response = await fetch(`${API_URL}/evidence/${encodeURIComponent(evidenceId)}/update-extraction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(extractionData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EVIDENCE API] Update extraction error: ${response.status}, ${errorText}`);
      throw new Error(`Failed to update extraction: ${errorText || 'Server error'}`);
    }

    const data = await response.json();
    console.log(`[EVIDENCE API] Updated extraction data for evidence: ${evidenceId}`);
    return data;
  } catch (error) {
    console.error(`[EVIDENCE API] Update extraction error:`, error);
    throw error;
  }
}
