const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Minio = require('minio');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const mernIntegration = require('./mern-integration');
const { logger, requestLogger, errorLogger } = require('../shared/structured-logger');
const { metricsMiddleware, metricsEndpoint,
    trackDocumentProcessing, trackDocumentProcessingDuration } = require('../shared/metrics');

// Environment variables with defaults
const PORT = process.env.PORT || 3005;
const DB_SERVICE_URL = process.env.DB_SERVICE_URL || 'http://localhost:5200';  // Point to MERN backend
const WS_SERVICE_URL = process.env.WS_SERVICE_URL || 'http://localhost:5200/ws';  // Point to MERN backend
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:3001';  // Point to OCR service
const MINIO_HOST = process.env.MINIO_HOST || 'localhost';  // Use localhost for local testing
const MINIO_PORT = process.env.MINIO_PORT || 9000;
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';  // Default local MinIO credentials
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';  // Default local MinIO credentials
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'documents';
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'document-uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure storage for multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const id = uuidv4();
        cb(null, `${id}${ext}`);
    }
});

// Configure upload middleware
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images and PDFs
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type. Only images and PDFs are allowed.'), false);
        }
    }
});

// Initialize MinIO client
const minioClient = new Minio.Client({
    endPoint: MINIO_HOST,
    port: parseInt(MINIO_PORT),
    useSSL: MINIO_USE_SSL,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY
});

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(metricsMiddleware);

// Ensure MinIO bucket exists
async function ensureBucketExists() {
    try {
        const exists = await minioClient.bucketExists(MINIO_BUCKET);
        if (!exists) {
            await minioClient.makeBucket(MINIO_BUCKET);
            logger.info('Created MinIO bucket', { bucket: MINIO_BUCKET });
        }
    } catch (err) {
        logger.error('Error checking/creating MinIO bucket', err, { bucket: MINIO_BUCKET });
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'upload-service' });
});

// Upload endpoint
app.post('/upload', upload.single('document'), async (req, res) => {
    const startTime = Date.now();
    let documentType = 'unknown';

    try {
        if (!req.file) {
            logger.warn('Upload attempt without file');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { userId, formId } = req.body;

        if (!userId) {
            logger.warn('Upload attempt without userId', {
                fileName: req.file.originalname,
                mimeType: req.file.mimetype
            });
            return res.status(400).json({ error: 'userId is required' });
        }

        const documentId = path.parse(req.file.filename).name; // Extract UUID from filename
        const filePath = req.file.path;
        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype;
        const size = req.file.size;

        // Determine document type from mime type
        documentType = mimeType.startsWith('image/') ? 'image' : 'pdf';

        logger.info('Document received for upload', {
            documentId,
            userId,
            formId: formId || 'none',
            originalName,
            mimeType,
            size,
            documentType
        });

        // Track document received
        trackDocumentProcessing(documentType, 'received');

        // Upload to MinIO
        const objectName = `${userId}/${documentId}${path.extname(originalName)}`;
        await minioClient.fPutObject(MINIO_BUCKET, objectName, filePath);

        logger.info('Document uploaded to storage', {
            documentId,
            objectName,
            bucket: MINIO_BUCKET
        });

        // Register document in database
        const documentData = {
            documentId,
            userId,
            formId: formId || null,
            originalName,
            filePath: objectName,
            mimeType,
            size,
            uploadTimestamp: new Date(),
            processingState: {
                status: 'uploaded',
                message: 'Document uploaded successfully',
                progress: 0,
                lastUpdated: new Date()
            }
        };

        const dbResponse = await axios.post(`${DB_SERVICE_URL}/documents`, documentData);
        logger.info('Document registered in database', { documentId });

        // Clean up local file
        fs.unlinkSync(filePath);
        logger.debug('Temporary file cleaned up', { filePath, documentId });

        // Record upload duration
        const uploadDuration = (Date.now() - startTime) / 1000;
        trackDocumentProcessingDuration(documentType, 'upload', uploadDuration);

        // Start processing pipeline
        axios.post(`${OCR_SERVICE_URL}/process`, {
            documentId
        }).catch(err => {
            logger.error('Error starting OCR processing', err, { documentId });
            trackDocumentProcessing(documentType, 'ocr_start_failed');
        });

        logger.info('Document processing initiated', {
            documentId,
            uploadTimeSeconds: uploadDuration,
            documentType
        });

        // Track successful upload
        trackDocumentProcessing(documentType, 'uploaded');

        res.status(201).json({
            message: 'Document uploaded successfully',
            documentId,
            status: 'processing',
            originalName
        });
    } catch (error) {
        logger.error('Error uploading document', error);

        // Track failed upload
        trackDocumentProcessing(documentType, 'upload_failed');

        res.status(500).json({
            error: 'Error uploading document',
            details: error.message
        });
    }
});

// Get upload status
app.get('/status/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;

        logger.info('Document status request', { documentId });

        const response = await axios.get(`${DB_SERVICE_URL}/documents/${documentId}`);

        res.status(200).json(response.data);
    } catch (error) {
        logger.error('Error getting document status', error, { documentId: req.params.documentId });

        res.status(error.response?.status || 500).json({
            error: 'Error retrieving document status',
            details: error.message
        });
    }
});

// Add MERN app integration routes
app.use('/mern', mernIntegration({
    UPLOAD_DIR,
    minioClient,
    MINIO_BUCKET,
    DB_SERVICE_URL,
    WS_SERVICE_URL,
    OCR_SERVICE_URL
}));

// Add metrics endpoint
app.get('/metrics', metricsEndpoint);

// Add error logger middleware
app.use(errorLogger);

// Start the server
app.listen(PORT, async () => {
    logger.info('Upload Service started', {
        port: PORT,
        dbServiceUrl: DB_SERVICE_URL,
        ocrServiceUrl: OCR_SERVICE_URL,
        wsServiceUrl: WS_SERVICE_URL,
        minioHost: MINIO_HOST,
        minioPort: MINIO_PORT,
        minioUseSsl: MINIO_USE_SSL,
        uploadDir: UPLOAD_DIR,
        systemType: os.type(),
        systemRelease: os.release(),
        cpuCount: os.cpus().length
    });

    // Ensure MinIO bucket exists on startup
    await ensureBucketExists();
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
    logger.info('Shutting down Upload service');
    // Close any open connections
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}
