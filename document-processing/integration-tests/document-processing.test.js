const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const waitForExpect = require('wait-for-expect');

// Test configuration
const config = {
    uploadServiceUrl: process.env.UPLOAD_SERVICE_URL || 'http://localhost:3005',
    dbServiceUrl: process.env.DB_SERVICE_URL || 'http://localhost:3000',
    workflowServiceUrl: process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3006',
    testTimeout: 60000, // 60 seconds
    pollInterval: 2000, // 2 seconds
    maxRetries: 30
};

// Sample test user
const testUser = {
    userId: 'test-user-001',
    formId: 'funeral-expenses-payment'
};

// Test files directory
const testFilesDir = path.join(__dirname, 'test-files');

// Ensure test files directory exists
beforeAll(async () => {
    await fs.ensureDir(testFilesDir);
});

describe('Document Processing Integration Tests', () => {
    jest.setTimeout(config.testTimeout);

    test('Upload and process a document through the entire pipeline', async () => {
        // 1. Upload a test document
        const testFilePath = path.join(testFilesDir, 'sample-invoice.pdf');

        // Check if test file exists
        const fileExists = await fs.pathExists(testFilePath);
        if (!fileExists) {
            console.log('Test file not found, creating a simple test PDF');
            // Create a simple test file if it doesn't exist
            // In a real test, you would use a prepared test file
            throw new Error('Test file not found: ' + testFilePath);
        }

        // Create form data for upload
        const formData = new FormData();
        formData.append('document', fs.createReadStream(testFilePath));
        formData.append('userId', testUser.userId);
        formData.append('formId', testUser.formId);

        // Upload the document
        const uploadResponse = await axios.post(
            `${config.uploadServiceUrl}/upload`,
            formData,
            {
                headers: {
                    ...formData.getHeaders()
                }
            }
        );

        // Verify upload response
        expect(uploadResponse.status).toBe(201);
        expect(uploadResponse.data).toHaveProperty('documentId');
        expect(uploadResponse.data).toHaveProperty('status', 'processing');

        const { documentId } = uploadResponse.data;

        // 2. Poll the document status until completion or failure
        let finalState = '';
        let retries = 0;

        await waitForExpect(async () => {
            const statusResponse = await axios.get(`${config.workflowServiceUrl}/workflow/${documentId}/status`);
            expect(statusResponse.status).toBe(200);

            const currentState = statusResponse.data.currentState;
            console.log(`Document ${documentId} state: ${currentState} (${statusResponse.data.progress}%)`);

            finalState = currentState;

            // Check if processing is complete or failed
            expect(['completed', 'failed']).toContain(currentState);
        }, config.testTimeout - 5000, config.pollInterval);

        // 3. Verify the final state
        expect(finalState).toBe('completed');

        // 4. Verify the document data in the database
        const documentResponse = await axios.get(`${config.dbServiceUrl}/documents/${documentId}`);
        expect(documentResponse.status).toBe(200);

        const document = documentResponse.data;
        expect(document).toHaveProperty('ocrText');
        expect(document).toHaveProperty('processingState.status', 'completed');
        expect(document).toHaveProperty('processingState.progress', 100);

        // Additional checks could verify that form fields were populated
        console.log(`Document processing completed for ${documentId}`);
    });

    test('Handle OCR failure gracefully', async () => {
        // Create form data for upload with a corrupted image
        const formData = new FormData();

        // Create an "empty" or corrupt file
        const corruptFilePath = path.join(testFilesDir, 'corrupt-file.pdf');
        await fs.writeFile(corruptFilePath, Buffer.from([0x25, 0x50, 0x44])); // Corrupt PDF header

        formData.append('document', fs.createReadStream(corruptFilePath));
        formData.append('userId', testUser.userId);
        formData.append('formId', testUser.formId);

        try {
            // Upload the document
            const uploadResponse = await axios.post(
                `${config.uploadServiceUrl}/upload`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    }
                }
            );

            // Verify upload response
            expect(uploadResponse.status).toBe(201);
            expect(uploadResponse.data).toHaveProperty('documentId');

            const { documentId } = uploadResponse.data;

            // Poll the document status until failure
            await waitForExpect(async () => {
                const statusResponse = await axios.get(`${config.workflowServiceUrl}/workflow/${documentId}/status`);
                expect(statusResponse.status).toBe(200);

                const currentState = statusResponse.data.currentState;
                console.log(`Document ${documentId} state: ${currentState}`);

                // Check if processing has failed as expected
                expect(currentState).toBe('failed');
                expect(statusResponse.data.error).toBeTruthy();
            }, config.testTimeout - 5000, config.pollInterval);

            // Verify the document data in the database has error information
            const documentResponse = await axios.get(`${config.dbServiceUrl}/documents/${documentId}`);
            expect(documentResponse.status).toBe(200);

            const document = documentResponse.data;
            expect(document).toHaveProperty('processingState.status', 'failed');
            expect(document).toHaveProperty('processingState.error');

        } finally {
            // Clean up the test file
            await fs.remove(corruptFilePath);
        }
    });

    test('Retry a failed document processing', async () => {
        // First, create a document that will fail
        const formData = new FormData();

        // Create an intentionally problematic file (not completely corrupt)
        const problemFilePath = path.join(testFilesDir, 'problem-file.pdf');
        await fs.writeFile(problemFilePath, Buffer.from([0x25, 0x50, 0x44, 0x46])); // Minimal valid PDF header

        formData.append('document', fs.createReadStream(problemFilePath));
        formData.append('userId', testUser.userId);
        formData.append('formId', testUser.formId);

        try {
            // Upload the document
            const uploadResponse = await axios.post(
                `${config.uploadServiceUrl}/upload`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    }
                }
            );

            const { documentId } = uploadResponse.data;

            // Wait for the document to fail processing
            await waitForExpect(async () => {
                const statusResponse = await axios.get(`${config.workflowServiceUrl}/workflow/${documentId}/status`);
                expect(statusResponse.status).toBe(200);

                const currentState = statusResponse.data.currentState;
                console.log(`Document ${documentId} state: ${currentState}`);
                expect(currentState).toBe('failed');
            }, config.testTimeout - 5000, config.pollInterval);

            // Now retry the failed document
            const retryResponse = await axios.post(`${config.workflowServiceUrl}/workflow/${documentId}/retry`);
            expect(retryResponse.status).toBe(200);
            expect(retryResponse.data).toHaveProperty('status', 'retrying');

            // Replace the document file with a proper one to make the retry succeed
            // In a real test, this could simulate fixing the underlying issue
            const fixResponse = await axios.put(
                `${config.dbServiceUrl}/documents/${documentId}/file`,
                { fileUrl: 'minio://documents/sample-invoice.pdf' }
            );
            expect(fixResponse.status).toBe(200);

            // Poll again to verify the retry succeeds
            await waitForExpect(async () => {
                const statusResponse = await axios.get(`${config.workflowServiceUrl}/workflow/${documentId}/status`);
                expect(statusResponse.status).toBe(200);

                const currentState = statusResponse.data.currentState;
                console.log(`Retried document ${documentId} state: ${currentState}`);

                // Check if processing has succeeded after the retry
                expect(currentState).toBe('completed');
            }, config.testTimeout - 5000, config.pollInterval);

            // Verify the document data in the database is updated after retry
            const documentResponse = await axios.get(`${config.dbServiceUrl}/documents/${documentId}`);
            expect(documentResponse.status).toBe(200);

            const document = documentResponse.data;
            expect(document).toHaveProperty('processingState.status', 'completed');
            expect(document).toHaveProperty('processingState.progress', 100);
            expect(document).toHaveProperty('processingState.retryCount').toBeGreaterThan(0);

        } finally {
            // Clean up the test file
            await fs.remove(problemFilePath);
        }
    });

    test('Process multiple documents in parallel', async () => {
        // Create 3 test documents
        const numDocuments = 3;
        const documentIds = [];

        // Upload test files in parallel
        const uploadPromises = [];

        for (let i = 0; i < numDocuments; i++) {
            const testFilePath = path.join(testFilesDir, `sample-${i}.pdf`);

            // Create a simple test PDF
            await fs.writeFile(testFilePath, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34])); // PDF-1.4 header

            const formData = new FormData();
            formData.append('document', fs.createReadStream(testFilePath));
            formData.append('userId', testUser.userId);
            formData.append('formId', testUser.formId);

            const uploadPromise = axios.post(
                `${config.uploadServiceUrl}/upload`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders()
                    }
                }
            ).then(response => {
                expect(response.status).toBe(201);
                documentIds.push(response.data.documentId);
                return fs.remove(testFilePath); // Clean up each file after upload
            });

            uploadPromises.push(uploadPromise);
        }

        // Wait for all uploads to complete
        await Promise.all(uploadPromises);
        expect(documentIds.length).toBe(numDocuments);

        // Poll all documents until they reach a terminal state
        const results = await Promise.all(
            documentIds.map(async (documentId) => {
                try {
                    await waitForExpect(async () => {
                        const statusResponse = await axios.get(`${config.workflowServiceUrl}/workflow/${documentId}/status`);
                        expect(statusResponse.status).toBe(200);

                        const currentState = statusResponse.data.currentState;
                        console.log(`Document ${documentId} state: ${currentState}`);

                        // Check if processing is complete or failed
                        expect(['completed', 'failed']).toContain(currentState);
                    }, config.testTimeout - 5000, config.pollInterval);

                    // Get the final document state
                    const finalResponse = await axios.get(`${config.dbServiceUrl}/documents/${documentId}`);
                    return finalResponse.data;

                } catch (error) {
                    console.error(`Error polling document ${documentId}:`, error);
                    return { documentId, error: error.message };
                }
            })
        );

        // Verify all documents were processed
        for (const result of results) {
            expect(result).toHaveProperty('documentId');
            expect(result).toHaveProperty('processingState');

            // Some might fail due to the simple test files, but they should have reached a terminal state
            expect(['completed', 'failed']).toContain(result.processingState.status);
        }
    });
});

// Helper function to poll until a condition is met
async function pollUntil(checkFn, maxRetries = 30, interval = 2000) {
    for (let i = 0; i < maxRetries; i++) {
        const result = await checkFn();
        if (result) {
            return result;
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Maximum polling retries exceeded');
}
