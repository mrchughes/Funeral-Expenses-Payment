// src/api/aiAgent.extract.js
const API_URL = process.env.REACT_APP_API_URL || "/api";

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

export async function extractFormData(token, fileId) {
  console.log("[API] Calling extractFormData endpoint for fileId:", fileId);

  try {
    const res = await fetch(`${API_URL}/ai-agent/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fileId }), // Pass the specific fileId to extract
    });

    // Log the raw response status and headers
    console.log(`[API] extractFormData response status: ${res.status}`);
    console.log(`[API] extractFormData response headers:`, Object.fromEntries([...res.headers]));

    // Try to parse the response as JSON, but fallback gracefully
    let data;
    let errorText;

    try {
      const responseText = await res.text();
      console.log(`[API] extractFormData raw response text:`, responseText);

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
      throw new Error((data && data.error) || errorText || `AI extraction failed with status ${res.status}`);
    }

    if (!data) {
      console.error("[API] extractFormData returned no data");
      throw new Error("AI extraction returned no data");
    }

    console.log("[API] extractFormData parsed response:", data);

    // Validate that we have the expected 'extracted' field
    if (!data.extracted) {
      console.error("[API] extractFormData missing 'extracted' field in response:", data);
      throw new Error("AI extraction response format invalid");
    }

    return data;
  } catch (error) {
    console.error("[API] extractFormData error:", error);
    throw error;
  }
}
