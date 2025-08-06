const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Import routes
const documentsRoutes = require('./routes/documents');

// Load environment variables
require('dotenv').config();

// Initialize Express app
const app = express();

// Configure middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Configure MongoDB connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/document_processing?authSource=admin');
        console.log('MongoDB connected successfully');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
};

// Setup routes
app.use('/documents', documentsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'db-service' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: {
            type: 'SYSTEM_ERROR',
            message: 'An unexpected error occurred',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        },
    });
});

// Start server
const PORT = process.env.PORT || 4008;
const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`DB Service running on port ${PORT}`);
    });
};

// Ensure shared directory structure exists
const sharedDir = path.join(__dirname, '..', 'shared');
if (!fs.existsSync(sharedDir)) {
    console.warn('Shared directory not found at expected location. Using local files.');
}

// Start server
startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

module.exports = app;
