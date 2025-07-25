// backend/routes/aiAgentRoutes.js
const express = require("express");
const { getSuggestions } = require("../controllers/aiAgentController");
const { extractFormData, testEvidence } = require("../controllers/aiAgentController.extract");
const { chatWithAIAgent } = require("../controllers/aiAgentController.chat");
const { protect } = require("../middlewares/authMiddleware");
const router = express.Router();

// POST /api/ai-agent/suggest - Get AI suggestions based on form data
router.post("/suggest", protect, getSuggestions);

// POST /api/ai-agent/extract - Extract data from uploaded evidence
router.post("/extract", protect, extractFormData);

// GET /api/ai-agent/test-evidence - Test evidence extraction
router.get("/test-evidence", testEvidence);

// POST /api/ai-agent/chat - Chat with the AI agent
router.post("/chat", chatWithAIAgent); // No auth required for the chatbot

module.exports = router;
