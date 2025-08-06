/**
 * Error handling utilities for document processing services
 */

/**
 * Custom error class for document processing errors
 */
class DocumentProcessingError extends Error {
    constructor(message, status = 500, details = {}) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Validation error for invalid request data
 */
class ValidationError extends DocumentProcessingError {
    constructor(message, details = {}) {
        super(message, 400, details);
        this.name = this.constructor.name;
    }
}

/**
 * Error for document not found
 */
class DocumentNotFoundError extends DocumentProcessingError {
    constructor(documentId, details = {}) {
        super(`Document not found: ${documentId}`, 404, details);
        this.name = this.constructor.name;
        this.documentId = documentId;
    }
}

/**
 * Error for processing timeouts
 */
class ProcessingTimeoutError extends DocumentProcessingError {
    constructor(message, details = {}) {
        super(message, 504, details);
        this.name = this.constructor.name;
    }
}

/**
 * Error for storage issues
 */
class StorageError extends DocumentProcessingError {
    constructor(message, details = {}) {
        super(message, 500, details);
        this.name = this.constructor.name;
    }
}

/**
 * Error middleware for Express
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
    console.error('Error occurred:', err);

    // Log error details for debugging
    console.error(err.stack);

    // Handle DocumentProcessingError instances
    if (err instanceof DocumentProcessingError) {
        return res.status(err.status).json({
            error: err.message,
            type: err.name,
            details: err.details,
            documentId: err.documentId
        });
    }

    // Handle Multer errors
    if (err.name === 'MulterError') {
        return res.status(400).json({
            error: `File upload error: ${err.message}`,
            type: err.name,
            field: err.field
        });
    }

    // Handle other errors
    return res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
}

/**
 * Async route handler wrapper
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Rate limit middleware for specified route
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Express middleware
 */
function rateLimit(maxRequests, windowMs) {
    const requests = {};

    return (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();

        // Initialize or clean up old requests
        requests[ip] = requests[ip] ? requests[ip].filter(time => now - time < windowMs) : [];

        // Check if too many requests
        if (requests[ip].length >= maxRequests) {
            return res.status(429).json({
                error: 'Too many requests',
                retryAfter: Math.ceil((windowMs - (now - requests[ip][0])) / 1000)
            });
        }

        // Add current request time
        requests[ip].push(now);
        next();
    };
}

/**
 * Monitor service health and return health status
 * @param {Object} services - Object containing health check functions
 * @returns {Function} Express route handler
 */
function healthCheck(services = {}) {
    return async (req, res) => {
        const status = { status: 'ok', services: {} };
        let isHealthy = true;

        try {
            // Check each service
            for (const [name, checkFn] of Object.entries(services)) {
                try {
                    const serviceStatus = await checkFn();
                    status.services[name] = serviceStatus;

                    if (serviceStatus.status !== 'ok') {
                        isHealthy = false;
                    }
                } catch (error) {
                    status.services[name] = { status: 'error', error: error.message };
                    isHealthy = false;
                }
            }

            // Add system info
            status.timestamp = new Date().toISOString();
            status.uptime = process.uptime();
            status.memoryUsage = process.memoryUsage();

            res.status(isHealthy ? 200 : 503).json(status);
        } catch (error) {
            res.status(500).json({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    };
}

/**
 * Circuit breaker for external service calls
 */
class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000;
        this.halfOpenTimeout = options.halfOpenTimeout || 10000;

        this.state = 'CLOSED';
        this.failures = 0;
        this.lastFailureTime = null;
        this.halfOpenTimer = null;
    }

    async execute(fn, fallback = null) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
                this._setHalfOpen();
            } else if (fallback) {
                return fallback();
            } else {
                throw new Error(`Circuit for ${this.name} is OPEN`);
            }
        }

        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure();
            if (fallback) {
                return fallback();
            }
            throw error;
        }
    }

    _onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';

        if (this.halfOpenTimer) {
            clearTimeout(this.halfOpenTimer);
            this.halfOpenTimer = null;
        }
    }

    _onFailure() {
        this.failures += 1;
        this.lastFailureTime = Date.now();

        if (this.state !== 'OPEN' && this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            console.warn(`Circuit for ${this.name} is now OPEN`);
        }
    }

    _setHalfOpen() {
        this.state = 'HALF_OPEN';
        this.failures = 0;
        console.info(`Circuit for ${this.name} is now HALF_OPEN`);

        this.halfOpenTimer = setTimeout(() => {
            if (this.state === 'HALF_OPEN') {
                this.state = 'OPEN';
                console.warn(`Circuit for ${this.name} is OPEN again after half-open timeout`);
            }
        }, this.halfOpenTimeout);
    }
}

// Export all error handling utilities
module.exports = {
    DocumentProcessingError,
    ValidationError,
    DocumentNotFoundError,
    ProcessingTimeoutError,
    StorageError,
    errorHandler,
    asyncHandler,
    rateLimit,
    healthCheck,
    CircuitBreaker
};
