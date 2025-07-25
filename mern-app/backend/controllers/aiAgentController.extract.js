// backend/controllers/aiAgentController.js (append to existing file)
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// Function to ensure the AI agent docs directory exists
function ensureAIAgentDocsDir() {
    const AI_AGENT_DOCS = path.join(__dirname, "../../../shared-evidence");
    console.log(`[AI EXTRACT] Using shared evidence path: ${AI_AGENT_DOCS}`);
    if (!fs.existsSync(AI_AGENT_DOCS)) {
        fs.mkdirSync(AI_AGENT_DOCS, { recursive: true });
        console.log(`[AI EXTRACT] Created shared evidence directory: ${AI_AGENT_DOCS}`);
    }
    return AI_AGENT_DOCS;
}

// Function to sync evidence files to AI agent docs directory
function syncEvidenceToAIAgent() {
    const AI_AGENT_DOCS = ensureAIAgentDocsDir();
    const EVIDENCE_UPLOADS = path.join(__dirname, "../uploads/evidence");

    if (!fs.existsSync(EVIDENCE_UPLOADS)) {
        fs.mkdirSync(EVIDENCE_UPLOADS, { recursive: true });
        console.log(`[AI EXTRACT] Created evidence uploads directory: ${EVIDENCE_UPLOADS}`);
        return;
    }

    const directories = fs.readdirSync(EVIDENCE_UPLOADS);
    console.log(`[AI EXTRACT] Found ${directories.length} upload directories to check`);

    let syncCount = 0;
    for (const dir of directories) {
        const dirPath = path.join(EVIDENCE_UPLOADS, dir);

        // Check if this is a directory
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
            // It's a directory, so process all files inside it
            const files = fs.readdirSync(dirPath);
            console.log(`[SYNC] Found ${files.length} files in directory ${dir}`);

            for (const file of files) {
                const src = path.join(dirPath, file);
                // Add the directory ID as a prefix to the filename in the shared volume
                const dest = path.join(AI_AGENT_DOCS, `${dir}_${file}`);

                if (fs.existsSync(src) && fs.statSync(src).isFile()) {
                    try {
                        fs.copyFileSync(src, dest);
                        console.log(`[SYNC] Copied evidence file ${src} to shared volume ${dest}`);
                        syncCount++;
                    } catch (err) {
                        console.error(`[SYNC ERROR] Failed to copy ${src} to ${dest}:`, err.message);
                    }
                }
            }
        } else if (fs.existsSync(dirPath) && fs.statSync(dirPath).isFile()) {
            // Handle direct files in the uploads/evidence directory
            const src = dirPath;
            const dest = path.join(AI_AGENT_DOCS, dir);

            try {
                fs.copyFileSync(src, dest);
                console.log(`[SYNC] Copied evidence file ${src} to shared volume ${dest}`);
                syncCount++;
            } catch (err) {
                console.error(`[SYNC ERROR] Failed to copy ${src} to ${dest}:`, err.message);
            }
        } else {
            console.warn(`[SYNC WARN] Source path ${dirPath} does not exist or is not accessible`);
        }
    }

    console.log(`[AI EXTRACT] Successfully synced ${syncCount} files to AI agent docs directory`);
    return syncCount;
}

// POST /api/ai-agent/extract
// Calls the AI agent to extract form data from evidence files
async function extractFormData(req, res) {
    try {
        // Sync evidence files to AI agent docs dir
        syncEvidenceToAIAgent();

        // Get list of evidence files, or use the specific fileId if provided
        const EVIDENCE_UPLOADS = path.join(__dirname, "../uploads/evidence");
        let files = [];

        // Check if a specific fileId was provided
        if (req.body && req.body.fileId) {
            console.log(`[AI EXTRACT] Specific fileId provided: ${req.body.fileId}`);

            // Now the fileId could be a direct filename reference (userId_filename) or just a userId
            const fileId = req.body.fileId;
            const AI_AGENT_DOCS = ensureAIAgentDocsDir();

            // If fileId contains an underscore, it's likely a full file reference
            if (fileId.includes('_')) {
                files = [fileId]; // Use the exact fileId as provided
                console.log(`[AI EXTRACT] Using specific file: ${fileId}`);
            } else {
                // Otherwise, treat it as a userId and find all files for this user
                const userId = fileId;

                // Get all files in shared directory that start with this userId
                const allSharedFiles = fs.existsSync(AI_AGENT_DOCS) ? fs.readdirSync(AI_AGENT_DOCS) : [];
                files = allSharedFiles.filter(filename => filename.startsWith(`${userId}_`));
            }

            console.log(`[AI EXTRACT] Found ${files.length} files to process: ${files.join(', ')}`);
        } else {
            // Get all files if no specific fileId was provided
            const AI_AGENT_DOCS = ensureAIAgentDocsDir();
            files = fs.existsSync(AI_AGENT_DOCS) ? fs.readdirSync(AI_AGENT_DOCS) : [];
            console.log(`[AI EXTRACT] No specific fileId provided, using all ${files.length} files from shared directory`);
        }

        if (files.length === 0) {
            console.log('[AI EXTRACT] No evidence files found to extract data from');
            return res.json({ extracted: {} });
        }

        console.log(`[AI EXTRACT] Found ${files.length} evidence files to process`);

        // Call AI agent extraction endpoint using environment variable
        const aiAgentUrl = process.env.AI_AGENT_URL || "http://localhost:5050";
        console.log(`[AI EXTRACT] AI_AGENT_URL from env: ${process.env.AI_AGENT_URL || 'not set'}`);
        console.log(`[AI EXTRACT] Using AI agent URL: ${aiAgentUrl}`);
        const endpoint = `${aiAgentUrl}/ai-agent/extract-form-data`;
        console.log(`[AI EXTRACT] Calling AI agent at ${endpoint}`);
        try {
            // Send the list of files to extract data from
            console.log(`[AI EXTRACT] Sending request with files:`, files);

            const aiRes = await axios.post(endpoint, {
                files: files
            }, {
                headers: {
                    "Content-Type": "application/json"
                },
                timeout: 120000, // 120 second timeout for extraction (increased from 90s)
                validateStatus: null // Don't throw errors for non-2xx status codes
            });

            console.log(`[AI EXTRACT] AI agent response status: ${aiRes.status}`);

            // Check for invalid response
            if (!aiRes || aiRes.status !== 200) {
                const errorMsg = aiRes ?
                    `AI agent returned status ${aiRes.status}: ${JSON.stringify(aiRes.data)}` :
                    'No response from AI agent';
                console.error(`[AI EXTRACT] ${errorMsg}`);
                return res.status(500).json({ error: errorMsg });
            }

            // Debug the response
            console.log('[AI EXTRACT] AI agent response received');
            console.log('[AI EXTRACT] Response type:', typeof aiRes.data);
            console.log('[AI EXTRACT] Response structure:', aiRes.data ? Object.keys(aiRes.data) : 'null or undefined');

            // Validate response data
            if (!aiRes.data) {
                console.error('[AI EXTRACT] AI agent returned empty response');
                return res.status(500).json({ error: 'AI agent returned empty response' });
            }

            // Convert any string data to object if needed
            let extractedData = aiRes.data;
            if (typeof extractedData === 'string') {
                try {
                    console.log('[AI EXTRACT] Parsing string response as JSON');
                    extractedData = JSON.parse(extractedData);
                } catch (parseErr) {
                    console.error('[AI EXTRACT] Failed to parse response as JSON:', parseErr.message);
                    console.error('[AI EXTRACT] Raw response:', aiRes.data);
                    return res.status(500).json({ error: 'Failed to parse AI agent response' });
                }
            }

            // Return the extracted data
            console.log('[AI EXTRACT] Successfully extracted data from files');
            res.json({ extracted: extractedData });
        } catch (err) {
            console.error("[AI EXTRACT] Extraction error:", err.message);
            console.error("[AI EXTRACT] Error details:", err.stack);
            console.error("[AI EXTRACT] Error response:", err.response?.data);
            res.status(500).json({ error: `AI extraction failed: ${err.message}` });
        }
    } catch (err) {
        console.error("AI extraction error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

module.exports.extractFormData = extractFormData;

// GET /api/ai-agent/test-evidence
// Tests the evidence extraction by checking files in the shared directory
async function testEvidence(req, res) {
    try {
        const AI_AGENT_DOCS = ensureAIAgentDocsDir();
        const files = fs.existsSync(AI_AGENT_DOCS) ? fs.readdirSync(AI_AGENT_DOCS) : [];

        console.log(`[AI EXTRACT TEST] Found ${files.length} files in shared directory`);

        // Get fileId from query params if provided
        const fileId = req.query.fileId;
        let matchingFiles = files;

        if (fileId) {
            // Find files that match this fileId
            matchingFiles = files.filter(f =>
                f === fileId ||
                f.startsWith(`${fileId}_`) ||
                (fileId.includes('_') && f.includes(fileId.split('_')[1]))
            );
            console.log(`[AI EXTRACT TEST] Found ${matchingFiles.length} files matching fileId ${fileId}`);
        }

        res.json({
            sharedDirectory: AI_AGENT_DOCS,
            totalFiles: files.length,
            allFiles: files,
            fileId: fileId || null,
            matchingFiles: fileId ? matchingFiles : null
        });
    } catch (err) {
        console.error("Test evidence error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

module.exports.testEvidence = testEvidence;
