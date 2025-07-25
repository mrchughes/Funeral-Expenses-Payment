// Fully implemented real code for backend/routes/formRoutes.js
const express = require("express");
const { submitForm, getResumeData } = require("../controllers/formController");
const { protect } = require("../middlewares/authMiddleware");
const router = express.Router();

router.post("/submit", protect, submitForm);
router.get("/resume", protect, getResumeData);

module.exports = router;
