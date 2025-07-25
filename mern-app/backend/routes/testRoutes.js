// backend/routes/testRoutes.js
const express = require("express");
const router = express.Router();
const { testUploadEvidence } = require("../controllers/testController");

// Test routes - no authentication required
router.post("/upload-evidence", testUploadEvidence);

module.exports = router;
