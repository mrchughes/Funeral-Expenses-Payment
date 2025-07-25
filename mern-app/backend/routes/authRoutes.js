// Fully implemented real code for backend/routes/authRoutes.js
const express = require("express");
const { registerUser, loginUser, resetPassword } = require("../controllers/authController");
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

// Simple password reset (email + new password)
router.post("/reset-password", resetPassword);

module.exports = router;
