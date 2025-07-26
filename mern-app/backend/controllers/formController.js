// Fully implemented real code for backend/controllers/formController.js
const asyncHandler = require("express-async-handler");
// S3 functionality removed
const { saveFormData, getFormData, clearFormData } = require("../services/dynamodbService");

const submitForm = asyncHandler(async (req, res) => {
    const userEmail = req.user.email;
    const { isAutoSave = false, ...formData } = req.body;

    // Validate form data exists
    if (!formData || Object.keys(formData).length === 0) {
        res.status(400);
        throw new Error("Form data is required");
    }


    // Sanitize form data to prevent injection attacks
    const sanitizedFormData = JSON.parse(JSON.stringify(formData));

    // Ensure checkbox array fields are always arrays, not null/undefined
    const arrayFields = [
        'evidence',
        'benefitsReceived',
        'partnerBenefitsReceived',
        'householdBenefits',
        'disabilityBenefits'
    ];
    arrayFields.forEach(field => {
        if (!Array.isArray(sanitizedFormData[field])) {
            sanitizedFormData[field] = [];
        }
    });

    console.log(`[FORM CONTROLLER] Saving form data for ${userEmail}, isAutoSave: ${isAutoSave}, fields: ${Object.keys(sanitizedFormData).join(', ')}`);

    // Always save to database
    await saveFormData(userEmail, sanitizedFormData);
    console.log(`[FORM CONTROLLER] Successfully saved form data for ${userEmail}`);

    if (isAutoSave) {
        // For auto-save, just return success
        res.json({
            message: "Form auto-saved successfully",
            savedAt: new Date().toISOString()
        });
    } else {
        // For final submission, just clear the saved form data and return success
        await clearFormData(userEmail);
        res.json({
            message: "Form submitted successfully",
            submittedAt: new Date().toISOString()
        });
    }
});

const getResumeData = asyncHandler(async (req, res) => {
    const userEmail = req.user.email;
    console.log(`[FORM CONTROLLER] Getting form data for ${userEmail}`);

    const data = await getFormData(userEmail);

    if (!data) {
        console.log(`[FORM CONTROLLER] No form data found for ${userEmail}`);
        return res.status(404).json({ error: "No saved form data found" });
    }

    console.log(`[FORM CONTROLLER] Retrieved form data for ${userEmail}, fields: ${Object.keys(data).join(', ')}`);
    // Wrap in { formData: ... } for frontend compatibility
    res.json({ formData: data });
});

module.exports = { submitForm, getResumeData };
