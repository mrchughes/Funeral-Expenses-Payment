// backend/routes/applicationRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const {
    createApplication,
    getApplicationById,
    getUserApplications,
    updateApplication,
    submitApplication
} = require("../controllers/applicationController");

// Routes for application management
router.post("/", protect, createApplication);
router.get("/:applicationId", protect, getApplicationById);
router.get("/", protect, getUserApplications);
router.put("/:applicationId", protect, updateApplication);
router.post("/:applicationId/submit", protect, submitApplication);

module.exports = router;
