/**
 * Metrics middleware for microservices
 * 
 * This module provides Prometheus metrics collection for all microservices.
 */

const promClient = require('prom-client');
const { logger } = require('./structured-logger');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add a default label to all metrics
promClient.collectDefaultMetrics({
    register,
    prefix: 'fep_',
    labels: {
        service: process.env.SERVICE_NAME || 'unknown-service'
    }
});

// Create custom metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
    name: 'fep_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10]
});

const httpRequestCounter = new promClient.Counter({
    name: 'fep_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

const documentProcessingCounter = new promClient.Counter({
    name: 'fep_document_processing_total',
    help: 'Total number of documents processed',
    labelNames: ['status', 'document_type']
});

const documentProcessingDuration = new promClient.Histogram({
    name: 'fep_document_processing_duration_seconds',
    help: 'Duration of document processing in seconds',
    labelNames: ['document_type', 'processing_type'],
    buckets: [0.5, 1, 2.5, 5, 10, 30, 60, 120, 300]
});

// Register the custom metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestCounter);
register.registerMetric(documentProcessingCounter);
register.registerMetric(documentProcessingDuration);

// Middleware for Express to collect metrics
const metricsMiddleware = (req, res, next) => {
    const start = Date.now();

    // Record end time and calculate duration on response finish
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000; // Convert to seconds

        // Extract route pattern from route object if available, fallback to path
        const route = req.route?.path || req.path || 'unknown';

        // Increment request counter
        httpRequestCounter.inc({
            method: req.method,
            route,
            status_code: res.statusCode
        });

        // Record request duration
        httpRequestDurationMicroseconds.observe(
            { method: req.method, route, status_code: res.statusCode },
            duration
        );
    });

    next();
};

// Middleware to expose metrics endpoint
const metricsEndpoint = async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        logger.error('Error generating metrics', err);
        res.status(500).send('Error generating metrics');
    }
};

// Track document processing metrics
const trackDocumentProcessing = (documentType, status) => {
    documentProcessingCounter.inc({ document_type: documentType || 'unknown', status });
};

// Track document processing duration
const trackDocumentProcessingDuration = (documentType, processingType, durationSec) => {
    documentProcessingDuration.observe(
        { document_type: documentType || 'unknown', processing_type: processingType },
        durationSec
    );
};

// Export the metrics middleware and helpers
module.exports = {
    metricsMiddleware,
    metricsEndpoint,
    trackDocumentProcessing,
    trackDocumentProcessingDuration,
    register
};
