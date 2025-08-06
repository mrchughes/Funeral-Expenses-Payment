const { createWorker } = require('tesseract.js');
const { StaticPool } = require('node-worker-threads-pool');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { createHistoryEntry } = require('../shared/utils');
const pdfParse = require('pdf-parse');
const os = require('os');

// Determine optimal worker count based on CPU cores
const MAX_WORKERS = Math.max(1, os.cpus().length - 1);
console.log(`Initializing OCR with ${MAX_WORKERS} worker threads`);

// Create a worker pool for OCR processing
const workerPool = new StaticPool({
    size: MAX_WORKERS,
    task: path.join(__dirname, 'ocr-worker.js'),
});

// Process a document with OCR
async function processDocument(documentId, fileBuffer, mimeType, dbClient, wsClient) {
    try {
        console.log(`[OCR] Starting OCR processing for document ${documentId}`);

        // Update document state
        await dbClient.updateDocumentState(documentId, 'ocr_processing', 'Starting OCR extraction', 10);
        await wsClient.sendStateUpdate(documentId, 'ocr_processing', 'Starting OCR extraction', 10);

        // Add processing history entry
        await dbClient.addProcessingHistoryEntry(documentId, createHistoryEntry(
            'OCR', 'started', 'Starting OCR extraction'
        ));

        let textResult;
        if (mimeType === 'application/pdf') {
            textResult = await processPdf(documentId, fileBuffer, dbClient, wsClient);
        } else if (mimeType.startsWith('image/')) {
            textResult = await processImage(documentId, fileBuffer, dbClient, wsClient);
        } else {
            throw new Error(`Unsupported file type: ${mimeType}`);
        }

        // Update document with OCR results
        await dbClient.updateDocument(documentId, {
            ocrText: textResult.text,
            textChunks: textResult.chunks,
            'processingState.status': 'ocr_completed',
            'processingState.currentStage': 'OCR extraction completed',
            'processingState.progress': 100,
            'processingState.lastUpdated': new Date(),
        });

        // Add processing history entry
        await dbClient.addProcessingHistoryEntry(documentId, createHistoryEntry(
            'OCR', 'completed', 'OCR extraction completed successfully'
        ));

        // Send WebSocket update
        await wsClient.sendStateUpdate(documentId, 'ocr_completed', 'OCR extraction completed', 100);

        return textResult;
    } catch (err) {
        console.error(`[OCR] Error processing document ${documentId}:`, err);

        // Update document state
        await dbClient.updateDocumentState(
            documentId,
            'failed',
            'OCR processing failed',
            0,
            { type: 'OCR_ERROR', message: err.message, details: err.stack }
        );

        // Add processing history entry
        await dbClient.addProcessingHistoryEntry(documentId, createHistoryEntry(
            'OCR', 'failed', `OCR extraction failed: ${err.message}`
        ));

        // Send WebSocket update
        await wsClient.sendError(documentId, {
            type: 'OCR_ERROR',
            message: err.message,
            details: err.stack,
        });

        throw err;
    }
}

// Process a PDF file
async function processPdf(documentId, fileBuffer, dbClient, wsClient) {
    console.log(`[OCR] Processing PDF document ${documentId}`);
    await wsClient.sendProgressUpdate(documentId, 15, 'Parsing PDF document');

    try {
        // Parse the PDF
        const pdfData = await pdfParse(fileBuffer);
        const totalPages = pdfData.numpages;
        console.log(`[OCR] PDF has ${totalPages} pages`);

        await wsClient.sendProgressUpdate(documentId, 20, `PDF has ${totalPages} pages, starting OCR`);

        // Initialize result arrays
        let allText = '';
        const textChunks = [];

        // Process each page in parallel
        const pagePromises = [];
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            pagePromises.push(processPage(pageNum, totalPages, fileBuffer, documentId, wsClient));
        }

        // Wait for all pages to complete
        const pageResults = await Promise.all(pagePromises);

        // Combine results
        pageResults.forEach((result, index) => {
            const pageNum = index + 1;
            allText += `\n----- Page ${pageNum} -----\n${result.text}\n`;

            // Add page text chunks
            result.chunks.forEach(chunk => {
                textChunks.push({
                    ...chunk,
                    pageNumber: pageNum,
                });
            });

            console.log(`[OCR] Processed page ${pageNum}/${totalPages}`);
        });

        return {
            text: allText,
            chunks: textChunks,
        };
    } catch (err) {
        console.error(`[OCR] PDF processing error for document ${documentId}:`, err);
        throw err;
    }
}

// Process a single page of a PDF
async function processPage(pageNum, totalPages, pdfBuffer, documentId, wsClient) {
    try {
        // Calculate progress percentage
        const progressStart = 20 + Math.floor((pageNum - 1) / totalPages * 70);
        const progressEnd = 20 + Math.floor(pageNum / totalPages * 70);

        await wsClient.sendProgressUpdate(documentId, progressStart, `Processing page ${pageNum}/${totalPages}`);

        // Use the worker pool to process the page
        const result = await workerPool.exec({
            type: 'pdf_page',
            pdfBuffer: pdfBuffer,
            pageNum: pageNum,
        });

        await wsClient.sendProgressUpdate(documentId, progressEnd, `Completed page ${pageNum}/${totalPages}`);

        return result;
    } catch (err) {
        console.error(`[OCR] Error processing page ${pageNum}:`, err);
        throw err;
    }
}

// Process an image file
async function processImage(documentId, imageBuffer, dbClient, wsClient) {
    console.log(`[OCR] Processing image document ${documentId}`);
    await wsClient.sendProgressUpdate(documentId, 15, 'Analyzing image');

    try {
        // Get image metadata
        const metadata = await sharp(imageBuffer).metadata();
        console.log(`[OCR] Image dimensions: ${metadata.width}x${metadata.height}`);

        await wsClient.sendProgressUpdate(documentId, 20, 'Starting image OCR');

        let result;

        // For large images, split into segments
        if (metadata.width > 2000 || metadata.height > 2000) {
            result = await processLargeImage(documentId, imageBuffer, metadata, wsClient);
        } else {
            // Use the worker pool to process the entire image
            result = await workerPool.exec({
                type: 'image',
                imageBuffer: imageBuffer,
            });

            await wsClient.sendProgressUpdate(documentId, 90, 'Image OCR completed');
        }

        return {
            text: result.text,
            chunks: result.chunks,
        };
    } catch (err) {
        console.error(`[OCR] Image processing error for document ${documentId}:`, err);
        throw err;
    }
}

// Process a large image by splitting it into segments
async function processLargeImage(documentId, imageBuffer, metadata, wsClient) {
    console.log(`[OCR] Processing large image with dimensions ${metadata.width}x${metadata.height}`);
    await wsClient.sendProgressUpdate(documentId, 25, 'Splitting large image into segments');

    // Calculate optimal segment size (max 1500x1500)
    const SEGMENT_SIZE = 1500;
    const segmentsX = Math.ceil(metadata.width / SEGMENT_SIZE);
    const segmentsY = Math.ceil(metadata.height / SEGMENT_SIZE);
    const totalSegments = segmentsX * segmentsY;

    console.log(`[OCR] Splitting image into ${segmentsX}x${segmentsY} grid (${totalSegments} segments)`);

    // Create segments
    const segmentPromises = [];
    for (let y = 0; y < segmentsY; y++) {
        for (let x = 0; x < segmentsX; x++) {
            // Calculate segment coordinates
            const left = x * SEGMENT_SIZE;
            const top = y * SEGMENT_SIZE;
            const width = Math.min(SEGMENT_SIZE, metadata.width - left);
            const height = Math.min(SEGMENT_SIZE, metadata.height - top);

            // Extract segment
            const segmentBuffer = await sharp(imageBuffer)
                .extract({ left, top, width, height })
                .toBuffer();

            // Process segment
            const segmentIndex = y * segmentsX + x;
            const progressStart = 25 + Math.floor(segmentIndex / totalSegments * 65);
            const progressEnd = 25 + Math.floor((segmentIndex + 1) / totalSegments * 65);

            segmentPromises.push(processImageSegment(
                segmentBuffer,
                left,
                top,
                segmentIndex,
                totalSegments,
                documentId,
                wsClient,
                progressStart,
                progressEnd
            ));
        }
    }

    // Wait for all segments to complete
    const segmentResults = await Promise.all(segmentPromises);

    // Combine results
    let combinedText = '';
    const combinedChunks = [];

    segmentResults.forEach(result => {
        combinedText += result.text + ' ';

        // Adjust bounding box coordinates
        result.chunks.forEach(chunk => {
            combinedChunks.push(chunk);
        });
    });

    await wsClient.sendProgressUpdate(documentId, 90, 'All image segments processed');

    return {
        text: combinedText.trim(),
        chunks: combinedChunks,
    };
}

// Process an individual image segment
async function processImageSegment(
    segmentBuffer,
    offsetX,
    offsetY,
    segmentIndex,
    totalSegments,
    documentId,
    wsClient,
    progressStart,
    progressEnd
) {
    try {
        await wsClient.sendProgressUpdate(
            documentId,
            progressStart,
            `Processing image segment ${segmentIndex + 1}/${totalSegments}`
        );

        // Use the worker pool to process the segment
        const result = await workerPool.exec({
            type: 'image_segment',
            imageBuffer: segmentBuffer,
            offsetX: offsetX,
            offsetY: offsetY,
        });

        await wsClient.sendProgressUpdate(
            documentId,
            progressEnd,
            `Completed image segment ${segmentIndex + 1}/${totalSegments}`
        );

        return result;
    } catch (err) {
        console.error(`[OCR] Error processing image segment ${segmentIndex + 1}:`, err);
        throw err;
    }
}

module.exports = {
    processDocument,
};
