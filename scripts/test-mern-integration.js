#!/usr/bin/env node

/**
 * Test script for MERN app integration with the document processing system
 * 
 * This script will:
 * 1. Upload a test document through the MERN app API
 * 2. Monitor the processing status
 * 3. Retrieve the extracted fields
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const MERN_API_URL = process.env.MERN_API_URL || 'http://localhost:3000/api';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'replace-with-valid-token';
const TEST_FILE_PATH = path.join(__dirname, '../shared-evidence/A_scanned_death_certificate_for_Brian_Hughes_is_pr.png');
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Function to log with timestamp
function log(message) {
    const now = new Date();
    console.log(`[${now.toISOString()}] ${message}`);
}

// Function to upload a document
async function uploadDocument() {
    log('Starting document upload test');

    if (!fs.existsSync(TEST_FILE_PATH)) {
        log(`ERROR: Test file not found: ${TEST_FILE_PATH}`);
        process.exit(1);
    }

    const formData = new FormData();
    formData.append('evidence', fs.createReadStream(TEST_FILE_PATH));

    try {
        log(`Uploading test file: ${TEST_FILE_PATH}`);
        const response = await axios.post(
            `${MERN_API_URL}/evidence/upload`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${AUTH_TOKEN}`
                }
            }
        );

        log('Upload successful');
        console.log(response.data);

        return response.data;
    } catch (error) {
        log('Upload failed');
        console.error('Error response:', error.response?.data || error.message);
        process.exit(1);
    }
}

// Function to monitor document processing
async function monitorProcessing(evidenceId, maxWaitTime = TIMEOUT_MS) {
    log(`Monitoring processing of evidence: ${evidenceId}`);

    const startTime = Date.now();
    let completed = false;

    while (!completed && (Date.now() - startTime) < maxWaitTime) {
        try {
            const response = await axios.get(
                `${MERN_API_URL}/evidence/${evidenceId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${AUTH_TOKEN}`
                    }
                }
            );

            const status = response.data.processingStatus;
            const progress = response.data.processingProgress || 0;

            log(`Status: ${status}, Progress: ${progress}%`);

            if (status === 'completed' || status === 'fields_mapped') {
                log('Processing complete!');

                // Display extraction summary if available
                if (response.data.extractionSummary) {
                    log('Extraction Summary:');
                    console.log('-----------------------------------------------');
                    console.log(response.data.extractionSummary);
                    console.log('-----------------------------------------------');
                }

                // Display extracted fields
                log('Detailed Extracted Fields:');
                console.log(JSON.stringify(response.data.matchedFields, null, 2));

                completed = true;
                return response.data;
            } else if (status === 'error') {
                log('Processing failed with error');
                console.error(response.data.processingError || 'Unknown error');
                process.exit(1);
            }

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
        } catch (error) {
            log(`Error checking status: ${error.message}`);
            console.error('Error response:', error.response?.data || error.message);

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    if (!completed) {
        log(`Timeout after waiting ${maxWaitTime / 1000} seconds`);
        process.exit(1);
    }
}

// Main function
async function main() {
    try {
        log('Starting MERN app integration test');

        // Step 1: Upload document
        const uploadResult = await uploadDocument();
        const evidenceId = uploadResult.evidenceId;

        // Step 2: Monitor processing
        await monitorProcessing(evidenceId);

        log('Test completed successfully');
    } catch (error) {
        log(`Unhandled error: ${error.message}`);
        console.error(error);
        process.exit(1);
    }
}

// Run the script
main();
