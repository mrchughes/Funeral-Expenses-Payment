// Fully implemented real code for backend/server.js
require("dotenv").config();
const app = require("./app");
const fs = require("fs");
const path = require("path");
const http = require("http");
const connectDB = require("./config/db");
const documentController = require("./controllers/documentController");

// Connect to MongoDB
connectDB().then(() => {
  console.log('MongoDB connection established');
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Ensure the uploads/evidence directory exists
const evidenceUploadDir = path.join(__dirname, "uploads/evidence");
if (!fs.existsSync(evidenceUploadDir)) {
  console.log(`Creating evidence upload directory: ${evidenceUploadDir}`);
  fs.mkdirSync(evidenceUploadDir, { recursive: true });
}

// Also ensure the shared evidence directory exists
const sharedEvidenceDir = path.join(__dirname, "../shared-evidence");
if (!fs.existsSync(sharedEvidenceDir)) {
  console.log(`Creating shared evidence directory: ${sharedEvidenceDir}`);
  fs.mkdirSync(sharedEvidenceDir, { recursive: true });
}

// Define the port to run the server on
const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server for document processing updates
documentController.initialize(app, server);

// Start the server
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`WebSocket server for document processing updates is active`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    documentController.shutdown();
    process.exit(0);
  });
});
