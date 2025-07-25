// backend/controllers/testController.js
const asyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");

// Directory to store uploads (ensure this exists or create it)
const UPLOAD_DIR = path.join(__dirname, "../uploads/evidence");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// POST /api/test/upload-evidence
// This is a test endpoint that bypasses authentication for testing purposes
const testUploadEvidence = asyncHandler(async (req, res) => {
    try {
        console.log("[TEST] Upload request received", req.files ? Object.keys(req.files) : "no files");

        if (!req.files || !req.files.evidence) {
            console.error("[TEST] No file in request");
            res.status(400);
            throw new Error("No file uploaded");
        }

        const file = req.files.evidence;
        console.log(`[TEST] Processing file upload: ${file.name}, size: ${file.size} bytes, mimetype: ${file.mimetype}`);

        // Validate file size first
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            console.error(`[TEST] File too large: ${file.size} bytes`);
            res.status(400);
            throw new Error("File too large. Maximum file size is 10MB.");
        }

        // Get file extension and always allow certain extensions regardless of mimetype
        const fileExtension = path.extname(file.name).toLowerCase();
        const allowedExtensions = ['.docx', '.pdf', '.jpg', '.jpeg', '.png'];

        if (allowedExtensions.includes(fileExtension)) {
            console.log(`[TEST] File accepted based on extension: ${fileExtension}`);

            const savePath = path.join(UPLOAD_DIR, file.name);

            // Check if file already exists and remove it
            if (fs.existsSync(savePath)) {
                console.log(`[TEST] File ${file.name} already exists, replacing it`);
                fs.unlinkSync(savePath);
            }

            await file.mv(savePath);
            console.log(`[TEST] File saved successfully: ${savePath}`);

            res.json({
                name: file.name,
                url: `/uploads/evidence/${file.name}`,
                size: file.size,
                type: file.mimetype
            });
        } else {
            console.error(`[TEST] Invalid file extension: ${fileExtension}`);
            res.status(400);
            throw new Error("Invalid file type. Only DOCX, PDF, JPEG, and PNG files are allowed.");
        }
    } catch (error) {
        console.error(`[TEST] Upload error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = { testUploadEvidence };
