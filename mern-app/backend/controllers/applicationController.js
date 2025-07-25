// backend/controllers/applicationController.js
const asyncHandler = require("express-async-handler");
const ApplicationForm = require("../models/ApplicationForm");
const { v4: uuidv4 } = require('uuid');

// Create a new application
const createApplication = asyncHandler(async (req, res) => {
    try {
        const customerId = req.user._id;

        // Check if user already has a draft application
        const existingDraft = await ApplicationForm.findOne({
            customerId,
            status: 'draft'
        });

        if (existingDraft) {
            return res.status(200).json(existingDraft);
        }

        // Create a new application with default values
        const newApplication = new ApplicationForm({
            applicationId: uuidv4(),
            customerId,
            status: 'draft',
            formData: req.body.formData || {}
        });

        await newApplication.save();

        res.status(201).json(newApplication);
    } catch (error) {
        console.error(`[APPLICATION] Create error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Get application by ID
const getApplicationById = asyncHandler(async (req, res) => {
    try {
        const applicationId = req.params.applicationId;
        const customerId = req.user._id;

        const application = await ApplicationForm.findOne({
            applicationId,
            customerId
        });

        if (!application) {
            res.status(404);
            throw new Error("Application not found");
        }

        res.status(200).json(application);
    } catch (error) {
        console.error(`[APPLICATION] Get error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Get all applications for the current user
const getUserApplications = asyncHandler(async (req, res) => {
    try {
        const customerId = req.user._id;

        const applications = await ApplicationForm.find({ customerId });

        res.status(200).json(applications);
    } catch (error) {
        console.error(`[APPLICATION] List error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Update application form data
const updateApplication = asyncHandler(async (req, res) => {
    try {
        const applicationId = req.params.applicationId;
        const customerId = req.user._id;

        const application = await ApplicationForm.findOne({
            applicationId,
            customerId
        });

        if (!application) {
            res.status(404);
            throw new Error("Application not found");
        }

        // Don't allow updates to submitted applications
        if (application.status === 'submitted') {
            res.status(400);
            throw new Error("Cannot update a submitted application");
        }

        // Update form data
        application.formData = req.body.formData || application.formData;

        // Allow status update if provided and valid
        if (req.body.status && req.body.status === 'submitted') {
            application.status = 'submitted';
            application.submissionTimestamp = new Date();
        }

        await application.save();

        res.status(200).json(application);
    } catch (error) {
        console.error(`[APPLICATION] Update error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Submit application (change status to submitted)
const submitApplication = asyncHandler(async (req, res) => {
    try {
        const applicationId = req.params.applicationId;
        const customerId = req.user._id;

        const application = await ApplicationForm.findOne({
            applicationId,
            customerId
        });

        if (!application) {
            res.status(404);
            throw new Error("Application not found");
        }

        // Don't allow re-submission
        if (application.status === 'submitted') {
            res.status(400);
            throw new Error("Application has already been submitted");
        }

        application.status = 'submitted';
        application.submissionTimestamp = new Date();

        await application.save();

        res.status(200).json({
            applicationId: application.applicationId,
            status: application.status,
            submissionTimestamp: application.submissionTimestamp
        });
    } catch (error) {
        console.error(`[APPLICATION] Submit error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = {
    createApplication,
    getApplicationById,
    getUserApplications,
    updateApplication,
    submitApplication
};
