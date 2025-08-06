const { parentPort, workerData } = require('worker_threads');
const { createWorker } = require('tesseract.js');
const pdfParse = require('pdf-parse');
const sharp = require('sharp');

// Initialize Tesseract worker
let tesseractWorker = null;

// Initialize the Tesseract worker
async function initializeTesseract() {
    if (!tesseractWorker) {
        tesseractWorker = await createWorker('eng');
        console.log('[OCR Worker] Tesseract worker initialized');
    }
    return tesseractWorker;
}

// Process a PDF page
async function processPdfPage(pdfBuffer, pageNum) {
    try {
        // Parse the PDF to get the specific page
        const data = await pdfParse(pdfBuffer, {
            pagerender: async (pageData) => {
                if (pageData.pageIndex === pageNum - 1) {
                    return pageData.render();
                }
                return null;
            },
            max: pageNum // Only process up to the requested page
        });

        // Convert PDF page to image
        const pageImage = await pageToImage(data);

        // Process the image with OCR
        return await processImageBuffer(pageImage);
    } catch (err) {
        console.error(`[OCR Worker] Error processing PDF page ${pageNum}:`, err);
        throw err;
    }
}

// Convert PDF page to image
async function pageToImage(pdfData) {
    // For now, we'll assume pdfParse provides the data we need
    // In a production system, you would use a library like pdf.js or pdf-poppler
    // to convert the PDF page to an image

    // This is a placeholder - in a real implementation you would convert PDF to image here
    throw new Error('PDF to image conversion not implemented');
}

// Process an image buffer with OCR
async function processImageBuffer(imageBuffer, offsetX = 0, offsetY = 0) {
    try {
        // Initialize Tesseract
        const worker = await initializeTesseract();

        // Process the image
        const { data } = await worker.recognize(imageBuffer);

        // Extract text and confidence
        const text = data.text || '';

        // Extract word-level bounding boxes
        const chunks = data.words.map(word => {
            // Adjust coordinates if this is a segment of a larger image
            const bbox = {
                x: word.bbox.x0 + offsetX,
                y: word.bbox.y0 + offsetY,
                width: word.bbox.x1 - word.bbox.x0,
                height: word.bbox.y1 - word.bbox.y0
            };

            return {
                text: word.text,
                confidence: word.confidence,
                bbox: bbox
            };
        });

        return {
            text,
            chunks
        };
    } catch (err) {
        console.error('[OCR Worker] Error in OCR processing:', err);
        throw err;
    }
}

// Process an image segment
async function processImageSegment(imageBuffer, offsetX, offsetY) {
    return processImageBuffer(imageBuffer, offsetX, offsetY);
}

// Handle messages from the main thread
parentPort.on('message', async (task) => {
    try {
        let result;

        if (task.type === 'pdf_page') {
            result = await processPdfPage(task.pdfBuffer, task.pageNum);
        } else if (task.type === 'image') {
            result = await processImageBuffer(task.imageBuffer);
        } else if (task.type === 'image_segment') {
            result = await processImageSegment(task.imageBuffer, task.offsetX, task.offsetY);
        } else {
            throw new Error(`Unknown task type: ${task.type}`);
        }

        // Send result back to the main thread
        parentPort.postMessage(result);
    } catch (err) {
        // Send error back to the main thread
        parentPort.postMessage({
            error: {
                message: err.message,
                stack: err.stack
            }
        });
    }
});

// Clean up when the worker is terminated
process.on('exit', async () => {
    if (tesseractWorker) {
        await tesseractWorker.terminate();
        console.log('[OCR Worker] Tesseract worker terminated');
    }
});
