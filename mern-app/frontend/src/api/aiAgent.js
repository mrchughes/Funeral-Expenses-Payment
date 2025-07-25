// src/api/aiAgent.js
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
  if (!res.ok) throw new Error("AI suggestion failed");
  return await res.json();
}
