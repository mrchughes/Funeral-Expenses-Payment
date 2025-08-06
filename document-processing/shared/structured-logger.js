/**
 * Structured logger for microservices
 * 
 * This module provides a consistent logging interface for all microservices
 * that outputs logs in a structured JSON format that can be easily parsed by ELK.
 */

const winston = require('winston');
const { format } = winston;

// Get service name from environment or use a default
const serviceName = process.env.SERVICE_NAME || 'unknown-service';

// Create the logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
    ),
    defaultMeta: {
        service: serviceName,
        version: process.env.SERVICE_VERSION || '1.0.0'
    },
    transports: [
        new winston.transports.Console()
    ]
});

// Add request context to logs
const addRequestContext = (req) => {
    return {
        requestId: req.headers['x-request-id'] || 'unknown',
        userId: req.user?.id || 'anonymous',
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection.remoteAddress
    };
};

// Middleware for Express to log requests
const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Add response hook to log once the response is sent
    res.on('finish', () => {
        const duration = Date.now() - start;
        const context = addRequestContext(req);

        logger.info('HTTP Request', {
            ...context,
            statusCode: res.statusCode,
            duration,
            contentLength: res.getHeader('content-length')
        });
    });

    next();
};

// Log errors with additional context
const errorLogger = (err, req, res, next) => {
    const context = addRequestContext(req);

    logger.error('Request Error', {
        ...context,
        error: {
            message: err.message,
            stack: err.stack,
            code: err.code || 'UNKNOWN_ERROR'
        }
    });

    next(err);
};

// Export the logger and middleware
module.exports = {
    logger,
    requestLogger,
    errorLogger,
    // Convenience methods that include location info
    info: (message, meta = {}) => {
        const caller = new Error().stack.split('\n')[2].trim();
        logger.info(message, { ...meta, caller });
    },
    warn: (message, meta = {}) => {
        const caller = new Error().stack.split('\n')[2].trim();
        logger.warn(message, { ...meta, caller });
    },
    error: (message, err, meta = {}) => {
        const caller = new Error().stack.split('\n')[2].trim();
        logger.error(message, {
            ...meta,
            caller,
            error: err instanceof Error ? { message: err.message, stack: err.stack } : err
        });
    },
    debug: (message, meta = {}) => {
        const caller = new Error().stack.split('\n')[2].trim();
        logger.debug(message, { ...meta, caller });
    }
};
