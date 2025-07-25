// backend/controllers/evidenceController.js
const asyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");

// Directory to store uploads (ensure this exists or create it)
const UPLOAD_DIR = path.join(__dirname, "../uploads/evidence");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// POST /api/evidence/upload
const uploadEvidence = asyncHandler(async (req, res) => {
    try {
        if (!req.files || !req.files.evidence) {
            res.status(400);
            throw new Error("No file uploaded");
        }
        
        const file = req.files.evidence;
        console.log(`[EVIDENCE] Processing file upload: ${file.name}, size: ${file.size} bytes, mimetype: ${file.mimetype}`);
        
        // Validate file type and size
        const allowedTypes = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf', 'image/jpeg', 'image/png'];
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (!allowedTypes.includes(file.mimetype)) {
            console.error(`[EVIDENCE] Invalid file type: ${file.mimetype}`);
            res.status(400);
            throw new Error("Invalid file type. Only DOCX, PDF, JPEG, and PNG files are allowed.");
        }
        
        if (file.size > maxSize) {
            console.error(`[EVIDENCE] File too large: ${file.size} bytes`);
            res.status(400);
            throw new Error("File too large. Maximum file size is 10MB.");
        }
        
        const savePath = path.join(UPLOAD_DIR, file.name);
        
        // Check if file already exists and remove it
        if (fs.existsSync(savePath)) {
            console.log(`[EVIDENCE] File ${file.name} already exists, replacing it`);
            fs.unlinkSync(savePath);
        }
        
        await file.mv(savePath);
        console.log(`[EVIDENCE] File saved successfully: ${savePath}`);
        
        res.json({ 
            name: file.name, 
            url: `/uploads/evidence/${file.name}`,
            size: file.size,
            type: file.mimetype
        });
    } catch (error) {
        console.error(`[EVIDENCE] Upload error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/evidence/:filename
const deleteEvidence = asyncHandler(async (req, res) => {
    try {
        const filename = req.params.filename;
        console.log(`[EVIDENCE] Processing file deletion: ${filename}`);
        
        const filePath = path.join(UPLOAD_DIR, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[EVIDENCE] File deleted successfully: ${filePath}`);
            res.json({ message: "File deleted" });
        } else {
            console.error(`[EVIDENCE] File not found: ${filePath}`);
            res.status(404);
            throw new Error("File not found");
        }
    } catch (error) {
        console.error(`[EVIDENCE] Delete error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/evidence/list
const listEvidence = asyncHandler(async (req, res) => {
    try {
        if (!fs.existsSync(UPLOAD_DIR)) {
            return res.json({ files: [] });
        }
        
        const files = fs.readdirSync(UPLOAD_DIR)
            .filter(file => fs.statSync(path.join(UPLOAD_DIR, file)).isFile())
            .map(file => ({
                name: file,
                url: `/uploads/evidence/${file}`,
                size: fs.statSync(path.join(UPLOAD_DIR, file)).size,
                uploaded: fs.statSync(path.join(UPLOAD_DIR, file)).mtime
            }));
            
        console.log(`[EVIDENCE] Listed ${files.length} evidence files`);
        res.json({ files });
    } catch (error) {
        console.error(`[EVIDENCE] List error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

module.exports = { uploadEvidence, deleteEvidence, listEvidence };
