// frontend/src/api/aiAgent.extract.js
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "/api";

// Get AI extraction for a specific evidence file with polling and timeout
export const getAIExtraction = async (fileId, formData = null, statusCallback = null) => {
  try {
    const token = localStorage.getItem("token");
    const startTime = Date.now();

    console.log("Calling AI extraction for file:", fileId);
    console.log("Form data provided:", !!formData);

    const contextData = formData ? {
      deceasedName: formData.deceasedFirstName + " " + formData.deceasedLastName,
      applicantName: formData.firstName + " " + formData.lastName
    } : {};

    console.log("Context data:", contextData);
    console.log("Starting AI extraction at:", new Date().toISOString());

    // Call statusCallback with initial state if provided
    if (statusCallback) {
      statusCallback({
        status: 'started',
        step: 'Initiating OCR extraction',
        progress: 0,
        fileId
      });
    }

    const response = await axios.post(
      `${API_URL}/api/ai-agent/extract`,
      { fileId, contextData },
      {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        timeout: 180000, // 3 minute timeout, increased from 2 minutes
        onUploadProgress: (progressEvent) => {
          if (statusCallback) {
            statusCallback({
              status: 'sending',
              step: 'Sending request to AI service',
              progress: Math.round((progressEvent.loaded * 100) / progressEvent.total),
              fileId
            });
          }
        }
      }
    );

    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;

    console.log("AI extraction completed at:", new Date().toISOString());
    console.log("Processing time:", processingTime.toFixed(1), "seconds");
    console.log("API-reported processing time:", response.data?.performance?.processingTimeSeconds || "unknown", "seconds");

    // Call statusCallback with completion state if provided
    if (statusCallback) {
      statusCallback({
        status: 'completed',
        step: 'Document processing complete',
        progress: 100,
        fileId,
        processingTimeSeconds: processingTime
      });
    }

    return response.data;
  } catch (err) {
    console.error("AI extraction error:", err);
    if (err.response) {
      console.error("Error response data:", err.response.data);
      console.error("Error response status:", err.response.status);
    }

    // Call statusCallback with error state if provided
    if (statusCallback) {
      statusCallback({
        status: 'error',
        step: 'Error processing document',
        error: err.message || 'Unknown error',
        fileId
      });
    }

    throw err;
  }
};

// Extract form data from uploaded file with polling support
export async function extractFormData(token, fileId, contextData = {}, statusCallback = null) {
  console.log("[API] Calling extractFormData endpoint for fileId:", fileId);
  const startTime = Date.now();

  // Update status if callback provided
  if (statusCallback) {
    statusCallback({
      status: 'processing',
      step: 'Sending to extraction service',
      progress: 10,
      fileId
    });
  }

  try {
    const res = await fetch(`${API_URL}/ai-agent/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fileId, contextData }), // Pass both fileId and contextData
    });

    // Log the raw response status and headers
    console.log(`[API] extractFormData response status: ${res.status}`);
    console.log(`[API] extractFormData response headers:`, Object.fromEntries([...res.headers]));

    // Update status if callback provided
    if (statusCallback) {
      statusCallback({
        status: 'processing',
        step: 'Received response from server',
        progress: 50,
        fileId
      });
    }

    // Try to parse the response as JSON, but fallback gracefully
    let data;
    let errorText;

    try {
      const responseText = await res.text();
      console.log(`[API] extractFormData raw response text length:`, responseText.length);
      if (responseText.length < 1000) {
        console.log(`[API] extractFormData raw response text:`, responseText);
      } else {
        console.log(`[API] extractFormData raw response text (truncated):`, responseText.substring(0, 500) + '...');
      }

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[API] Failed to parse response as JSON:`, parseError);
        errorText = responseText;
      }
    } catch (textError) {
      console.error(`[API] Failed to get response text:`, textError);
    }

    if (!res.ok) {
      console.error("[API] extractFormData error response:", data || { error: errorText || "Unknown error" });

      // Update status if callback provided
      if (statusCallback) {
        statusCallback({
          status: 'error',
          step: 'Server returned an error',
          error: (data && data.error) || errorText || `Status ${res.status}`,
          fileId
        });
      }

      throw new Error(data && data.error || errorText || `AI extraction failed with status ${res.status}`);
    }

    if (!data) {
      console.error("[API] extractFormData returned no data");

      // Update status if callback provided
      if (statusCallback) {
        statusCallback({
          status: 'error',
          step: 'No data returned from server',
          error: 'Empty response',
          fileId
        });
      }

      throw new Error("AI extraction returned no data");
    }

    console.log("[API] extractFormData parsed response:", data);

    if (!data.extracted) {
      console.error("[API] extractFormData missing 'extracted' field in response:", data);

      // Update status if callback provided
      if (statusCallback) {
        statusCallback({
          status: 'error',
          step: 'Invalid response format',
          error: 'Missing extracted data',
          fileId
        });
      }

      throw new Error("AI extraction response format invalid");
    }

    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000;
    console.log(`[API] extractFormData total processing time: ${processingTime.toFixed(1)} seconds`);

    // Update status if callback provided
    if (statusCallback) {
      statusCallback({
        status: 'completed',
        step: 'Processing complete',
        progress: 100,
        fileId,
        processingTimeSeconds: processingTime
      });
    }

    return data;
  } catch (error) {
    console.error("[API] extractFormData error:", error);

    // Update status if callback provided
    if (statusCallback) {
      statusCallback({
        status: 'error',
        step: 'Error during extraction',
        error: error.message,
        fileId
      });
    }

    throw error;
  }
}

export async function getAISuggestions(formData, token) {
  const res = await fetch(`${API_URL}/ai-agent/suggest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ formData }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.error("AI suggestion error response:", errorData);
    throw new Error(errorData.error || "AI suggestion failed");
  }

  return await res.json();
}
