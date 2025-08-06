// Test script for frontend extraction API with status updates
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = 'http://localhost:3001'; // Backend API URL
const TEST_IMAGE = path.join(__dirname, '../shared-evidence/A_scanned_death_certificate_for_Brian_Hughes_is_pr.png');

// Function to register a test user
async function registerTestUser() {
    try {
        console.log('Registering test user...');
        const response = await axios.post(`${API_URL}/api/users/register`, {
            name: 'Test User',
            email: `testuser_${Date.now()}@example.com`,
            password: 'Password123!',
        });

        console.log('User registered successfully');
        return response.data;
    } catch (error) {
        console.error('Error registering user:', error.response?.data || error.message);
        throw error;
    }
}

// Function to login and get token
async function loginUser(email, password) {
    try {
        console.log('Logging in...');
        const response = await axios.post(`${API_URL}/api/users/login`, {
            email,
            password,
        });

        console.log('Login successful');
        return response.data.token;
    } catch (error) {
        console.error('Error logging in:', error.response?.data || error.message);
        throw error;
    }
}

// Function to upload a file
async function uploadFile(token, filePath) {
    try {
        console.log(`Uploading file ${path.basename(filePath)}...`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(`${API_URL}/api/evidence`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${token}`,
            },
        });

        console.log('File uploaded successfully');
        return response.data;
    } catch (error) {
        console.error('Error uploading file:', error.response?.data || error.message);
        throw error;
    }
}

// Function to extract data from a file with status updates
async function extractFormData(token, fileId) {
    try {
        console.log(`Extracting data from file ID: ${fileId}`);

        // Create context data for better extraction
        const contextData = {
            deceasedFirstName: 'Brian',
            deceasedLastName: 'Hughes',
            applicantName: 'Test User',
            relationshipToDeceased: 'Son'
        };

        // Status tracking
        let lastStatus = null;
        let statusHistory = [];

        // Define status callback
        const statusCallback = (status) => {
            console.log(`[STATUS UPDATE] ${status.step || status.status} - ${status.progress}%`);
            lastStatus = status;
            statusHistory.push({
                timestamp: new Date().toISOString(),
                ...status
            });
        };

        const startTime = Date.now();

        // Call extraction with status updates
        const response = await axios.post(`${API_URL}/api/ai-agent/extract`,
            { fileId, contextData },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                timeout: 180000, // 3 minute timeout
            }
        );

        const endTime = Date.now();
        const processingTime = (endTime - startTime) / 1000;

        console.log(`Extraction completed in ${processingTime.toFixed(1)} seconds`);

        // Return both the response and status history
        return {
            extractionResult: response.data,
            processingTime,
            statusHistory
        };
    } catch (error) {
        console.error('Error extracting data:', error.response?.data || error.message);
        throw error;
    }
}

// Main function to run the test
async function runTest() {
    try {
        // Register a test user
        const user = await registerTestUser();

        // Login and get token
        const token = await loginUser(user.email, 'Password123!');

        // Upload a test file
        const uploadResult = await uploadFile(token, TEST_IMAGE);
        const fileId = uploadResult.id || uploadResult.name;

        // Extract data from the file with status tracking
        const extractionResult = await extractFormData(token, fileId);

        // Save results to file
        fs.writeFileSync('frontend-extraction-test-result.json', JSON.stringify(extractionResult, null, 2));

        console.log('Test completed successfully. Results saved to frontend-extraction-test-result.json');
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run the test
runTest();
