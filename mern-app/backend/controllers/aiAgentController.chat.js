// backend/controllers/aiAgentController.chat.js
const axios = require("axios");

/**
 * Chat with the AI agent
 * @route POST /api/ai-agent/chat
 * @access Public
 */
async function chatWithAIAgent(req, res) {
    try {
        const { input } = req.body;

        if (!input || typeof input !== 'string') {
            console.error('[AI CHAT] Invalid input:', input);
            return res.status(400).json({ error: 'Chat input is required' });
        }

        console.log(`[AI CHAT] Received chat request: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}"`);

        // Call AI agent chat endpoint
        const aiAgentUrl = process.env.AI_AGENT_URL || "http://ai-agent:5050";
        const endpoint = `${aiAgentUrl}/ai-agent/chat`;
        console.log(`[AI CHAT] Calling AI agent at ${endpoint}`);

        try {
            const aiRes = await axios.post(endpoint, {
                input
            }, {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 30000 // 30 second timeout for chat
            });

            console.log('[AI CHAT] Received response from AI agent');
            res.json({ response: aiRes.data.response });
        } catch (err) {
            console.error("[AI CHAT] AI agent error:", err.message);
            console.error("[AI CHAT] Error details:", err.response?.data || err.stack);
            res.status(500).json({
                error: `Chat failed: ${err.message}`,
                response: "I'm sorry, I couldn't process your request at this time. Please try again later."
            });
        }
    } catch (err) {
        console.error("[AI CHAT] General error:", err.message);
        res.status(500).json({
            error: err.message,
            response: "I'm sorry, an error occurred. Please try again later."
        });
    }
}

module.exports = { chatWithAIAgent };
