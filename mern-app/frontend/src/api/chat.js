// src/api/chat.js
/**
 * Chat API utilities for communicating with the AI agent
 */

// Attempt various possible API endpoints to handle different deployment scenarios
const API_ENDPOINTS = [
  process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/ai-agent/chat` : null,
  "/api/ai-agent/chat",                // Standard local development endpoint
  "http://localhost:5000/api/ai-agent/chat", // Direct backend access
  "http://localhost:5050/ai-agent/chat"     // Direct AI agent access (fallback)
].filter(Boolean); // Remove null entries

/**
 * Send a chat message to the AI agent and get a response
 * @param {string} message - The user's message to send to the AI agent
 * @returns {Promise<string>} - The AI agent's response message
 */
export async function sendChatMessage(message, history = []) {
  console.log("[CHAT API] Sending message:", message);

  // Try each endpoint in sequence until one works
  let lastError = null;

  for (const endpoint of API_ENDPOINTS) {
    console.log(`[CHAT API] Trying endpoint: ${endpoint}`);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: message,
          history: history
        })
      });

      console.log(`[CHAT API] Response status from ${endpoint}:`, response.status);

      if (!response.ok) {
        console.warn(`[CHAT API] Endpoint ${endpoint} returned status ${response.status}`);
        lastError = new Error(`Server responded with ${response.status}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      console.log("[CHAT API] Received response data:", data);

      if (data && data.response) {
        console.log("[CHAT API] Successfully received response from:", endpoint);
        return data.response;
      } else {
        console.warn("[CHAT API] Invalid response format from endpoint:", endpoint, data);
        lastError = new Error("Invalid response format from server");
        continue;
      }
    } catch (error) {
      console.error(`[CHAT API] Error with endpoint ${endpoint}:`, error);
      lastError = error;
    }
  }

  // If we get here, all endpoints failed
  console.error("[CHAT API] All endpoints failed, last error:", lastError);
  throw lastError || new Error("Failed to connect to chat service");
}
