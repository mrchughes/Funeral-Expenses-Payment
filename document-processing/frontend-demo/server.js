const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;

// API Gateway URL
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:4000';

// Enable CORS
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Set up JSON middleware
app.use(express.json());

// Set up multer for file upload handling
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// API endpoints
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Create form data to send to the API Gateway
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData.append('file', blob, req.file.originalname);

        // Forward the request to the document upload service via API Gateway
        const response = await axios.post(`${API_GATEWAY_URL}/api/documents/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });

        // Return the response from the API Gateway
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'Error uploading document',
            details: error.response ? error.response.data : error.message
        });
    }
});

// Get document status
app.get('/api/documents/:id', async (req, res) => {
    try {
        const documentId = req.params.id;
        const response = await axios.get(`${API_GATEWAY_URL}/api/documents/${documentId}`);
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error fetching document status:', error);
        res.status(500).json({
            error: 'Error fetching document status',
            details: error.response ? error.response.data : error.message
        });
    }
});

// Get extracted form data
app.get('/api/documents/:id/form-data', async (req, res) => {
    try {
        const documentId = req.params.id;
        const response = await axios.get(`${API_GATEWAY_URL}/api/documents/${documentId}/form-data`);
        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error fetching form data:', error);
        res.status(500).json({
            error: 'Error fetching form data',
            details: error.response ? error.response.data : error.message
        });
    }
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Frontend demo running at http://localhost:${PORT}`);
});
