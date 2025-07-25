// backend/controllers/aiAgentController.js
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// Path to AI agent docs dir (adjust if needed)
// Match the Python AI agent's configured path
const AI_AGENT_DOCS = path.join(__dirname, "../../../shared-evidence");
const EVIDENCE_UPLOADS = path.join(__dirname, "../uploads/evidence");

// Copy new evidence files to AI agent docs dir
function syncEvidenceToAIAgent() {
    if (!fs.existsSync(AI_AGENT_DOCS)) fs.mkdirSync(AI_AGENT_DOCS, { recursive: true });
    if (!fs.existsSync(EVIDENCE_UPLOADS)) {
        fs.mkdirSync(EVIDENCE_UPLOADS, { recursive: true });
        return;
    }

    // User-specific evidence is already being copied to shared directory during upload
    console.log(`[SYNC] Evidence sync not required. Files are copied to shared directory during upload.`);
}

// POST /api/ai-agent/suggest
// { formData: {...} }
async function getSuggestions(req, res) {
    try {
        syncEvidenceToAIAgent();
        // Call AI agent to get suggestions
        const aiAgentUrl = process.env.AI_AGENT_URL || "http://ai-agent:5050";
        console.log(`[AI SUGGEST] Calling AI agent at ${aiAgentUrl}/ai-agent/check-form`);
        try {
            const aiRes = await axios.post(`${aiAgentUrl}/ai-agent/check-form`, {
                content: JSON.stringify(req.body.formData)
            }, {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 30000 // 30 second timeout for suggestions
            });
            console.log('[AI SUGGEST] AI agent response:', aiRes.data);
            res.json({ suggestions: aiRes.data.response });
        } catch (err) {
            console.error("AI suggestion error:", err.message);
            console.error("AI suggestion error details:", err.stack);
            res.status(500).json({ error: `AI suggestion failed: ${err.message}` });
        }
    } catch (err) {
        console.error("AI suggestion general error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { getSuggestions, syncEvidenceToAIAgent };
