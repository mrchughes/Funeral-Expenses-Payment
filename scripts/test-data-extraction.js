/**
 * Test script for data extraction with context
 * This script simulates the extraction process with and without context
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:5100';
const SHARED_EVIDENCE_DIR = path.join(__dirname, '..', 'shared-evidence');
const TEST_IMAGE = process.argv[2] || 'A_scanned_death_certificate_for_Brian_Hughes_is_pr.png';

// Test document extraction with and without context
async function testExtraction() {
    console.log('=== Testing Data Extraction With Context ===');

    // Ensure we have test files
    if (!fs.existsSync(path.join(SHARED_EVIDENCE_DIR, TEST_IMAGE))) {
        console.error(`Test image not found: ${TEST_IMAGE}`);
        console.log('Available images:');
        fs.readdirSync(SHARED_EVIDENCE_DIR).forEach(file => {
            console.log(' - ' + file);
        });
        process.exit(1);
    }

    // Generate a test user ID
    const testUserId = 'test_' + Math.floor(Math.random() * 10000);
    console.log(`Using test user ID: ${testUserId}`);

    // Copy test image to a new file with our test ID
    const testFileName = `${testUserId}_${TEST_IMAGE}`;
    const testFilePath = path.join(SHARED_EVIDENCE_DIR, testFileName);

    try {
        fs.copyFileSync(path.join(SHARED_EVIDENCE_DIR, TEST_IMAGE), testFilePath);
        console.log(`Created test file: ${testFilePath}`);
    } catch (err) {
        console.error(`Error copying test file: ${err.message}`);
        process.exit(1);
    }

    // Test 1: Extract without context
    console.log('\nTest 1: Extraction without context');
    try {
        const response1 = await axios.post(`${API_URL}/ai-agent/extract-form-data`, {
            fileId: testFileName
        });

        console.log('Extraction without context results:');
        console.log(JSON.stringify(response1.data, null, 2));

        // Save results to a file
        fs.writeFileSync(path.join(__dirname, 'extraction_without_context.json'),
            JSON.stringify(response1.data, null, 2));
    } catch (err) {
        console.error(`Error in extraction without context: ${err.message}`);
    }

    // Test 2: Extract with context
    console.log('\nTest 2: Extraction with context');
    try {
        const contextData = {
            deceasedName: 'Brian Hughes',
            applicantName: 'Sarah Hughes'
        };

        const response2 = await axios.post(`${API_URL}/ai-agent/extract-form-data`, {
            fileId: testFileName,
            contextData
        });

        console.log('Extraction with context results:');
        console.log(JSON.stringify(response2.data, null, 2));

        // Save results to a file
        fs.writeFileSync(path.join(__dirname, 'extraction_with_context.json'),
            JSON.stringify(response2.data, null, 2));
    } catch (err) {
        console.error(`Error in extraction with context: ${err.message}`);
    }

    // Clean up the test file
    try {
        fs.unlinkSync(testFilePath);
        console.log(`\nRemoved test file: ${testFilePath}`);
    } catch (err) {
        console.error(`Error removing test file: ${err.message}`);
    }

    console.log('\nTests completed!');
}

// Execute the tests
testExtraction().catch(err => {
    console.error('Unhandled error during tests:', err);
    process.exit(1);
});
