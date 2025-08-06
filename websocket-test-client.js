/**
 * WebSocket Integration Test Script
 * 
 * This script tests WebSocket connectivity for document processing status updates.
 * It can be used to validate WebSocket server functionality and client integration.
 */

const WebSocket = require('ws');
const readline = require('readline');

// Configuration
const config = {
    serverUrl: 'ws://localhost:4007',
    documentId: `doc-${Math.floor(Math.random() * 1000000)}`,
    verbose: true
};

// Create readline interface for interactive mode
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Logging function
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    let color;
    let prefix;

    switch (type) {
        case 'error':
            color = colors.red;
            prefix = 'ERROR';
            break;
        case 'send':
            color = colors.blue;
            prefix = 'SEND';
            break;
        case 'receive':
            color = colors.green;
            prefix = 'RECV';
            break;
        case 'success':
            color = colors.green;
            prefix = 'SUCCESS';
            break;
        case 'warning':
            color = colors.yellow;
            prefix = 'WARNING';
            break;
        default:
            color = colors.cyan;
            prefix = 'INFO';
    }

    console.log(`${color}[${timestamp}] [${prefix}] ${message}${colors.reset}`);
}

// WebSocket client class
class WebSocketClient {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.connected = false;
        this.subscribedDocuments = new Set();
    }

    connect() {
        return new Promise((resolve, reject) => {
            log(`Connecting to ${this.url}...`);

            try {
                this.socket = new WebSocket(this.url);

                const connectTimeout = setTimeout(() => {
                    if (!this.connected) {
                        reject(new Error('Connection timed out after 5000ms'));
                    }
                }, 5000);

                this.socket.on('open', () => {
                    clearTimeout(connectTimeout);
                    this.connected = true;
                    log('WebSocket connection established', 'success');
                    resolve();
                });

                this.socket.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        log(`Received message: ${JSON.stringify(message, null, 2)}`, 'receive');
                    } catch (err) {
                        log(`Received non-JSON message: ${data}`, 'receive');
                    }
                });

                this.socket.on('error', (error) => {
                    log(`WebSocket error: ${error.message}`, 'error');
                    if (!this.connected) {
                        clearTimeout(connectTimeout);
                        reject(error);
                    }
                });

                this.socket.on('close', (code, reason) => {
                    this.connected = false;
                    log(`WebSocket connection closed. Code: ${code}, Reason: ${reason || 'No reason provided'}`, 'warning');
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    disconnect() {
        if (this.socket) {
            log('Disconnecting WebSocket...');
            this.socket.close(1000, 'Client disconnected');
        }
    }

    subscribeToDocument(documentId) {
        if (!this.connected) {
            throw new Error('Cannot subscribe, WebSocket not connected');
        }

        log(`Subscribing to document: ${documentId}`, 'info');

        // Try both subscription formats for compatibility
        try {
            // Format 1: type:subscribe:document
            const subscribeMsg1 = {
                type: 'subscribe:document',
                documentId: documentId
            };
            this.socket.send(JSON.stringify(subscribeMsg1));
            log(`Sent subscription message (format 1): ${JSON.stringify(subscribeMsg1)}`, 'send');

            // Format 2: event:subscribe channel:document:id
            const subscribeMsg2 = {
                event: 'subscribe',
                channel: `document:${documentId}`
            };
            this.socket.send(JSON.stringify(subscribeMsg2));
            log(`Sent subscription message (format 2): ${JSON.stringify(subscribeMsg2)}`, 'send');

            this.subscribedDocuments.add(documentId);
        } catch (err) {
            log(`Error subscribing to document: ${err.message}`, 'error');
            throw err;
        }
    }

    unsubscribeFromDocument(documentId) {
        if (!this.connected) {
            throw new Error('Cannot unsubscribe, WebSocket not connected');
        }

        log(`Unsubscribing from document: ${documentId}`, 'info');

        try {
            const unsubscribeMsg = {
                type: 'unsubscribe:document',
                documentId: documentId
            };
            this.socket.send(JSON.stringify(unsubscribeMsg));
            log(`Sent unsubscription message: ${JSON.stringify(unsubscribeMsg)}`, 'send');

            this.subscribedDocuments.delete(documentId);
        } catch (err) {
            log(`Error unsubscribing from document: ${err.message}`, 'error');
            throw err;
        }
    }

    sendDocumentUpdate(documentId, type, data) {
        if (!this.connected) {
            throw new Error('Cannot send update, WebSocket not connected');
        }

        try {
            const message = {
                type: type,
                documentId: documentId,
                data: data
            };

            this.socket.send(JSON.stringify(message));
            log(`Sent document update: ${JSON.stringify(message)}`, 'send');
        } catch (err) {
            log(`Error sending document update: ${err.message}`, 'error');
            throw err;
        }
    }

    async runTestSequence(documentId) {
        if (!this.connected) {
            throw new Error('Cannot run test sequence, WebSocket not connected');
        }

        log(`Running test sequence for document: ${documentId}`, 'info');

        try {
            // Subscribe to document
            this.subscribeToDocument(documentId);
            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 1: Start processing
            this.sendDocumentUpdate(documentId, 'processing_started', {
                state: 'uploading',
                progress: 0,
                step: 'Starting document processing'
            });
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Step 2: OCR processing
            this.sendDocumentUpdate(documentId, 'progress_updated', {
                state: 'ocr_processing',
                progress: 25,
                step: 'Performing OCR text extraction'
            });
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 3: Data extraction
            this.sendDocumentUpdate(documentId, 'progress_updated', {
                state: 'extracting',
                progress: 60,
                step: 'Extracting document data fields'
            });
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 4: Processing completed
            this.sendDocumentUpdate(documentId, 'processing_completed', {
                state: 'completed',
                progress: 100,
                step: 'Document processing complete'
            });
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Step 5: Send extraction results
            this.sendDocumentUpdate(documentId, 'extraction_results', {
                extractedData: {
                    documentType: 'Invoice',
                    fields: {
                        invoiceNumber: 'INV-2023-0042',
                        date: '2023-07-15',
                        totalAmount: '£1,245.00',
                        supplier: 'ABC Funeral Services Ltd'
                    }
                }
            });

            log('Test sequence completed successfully', 'success');
        } catch (err) {
            log(`Error in test sequence: ${err.message}`, 'error');
            throw err;
        }
    }

    simulateError(documentId) {
        if (!this.connected) {
            throw new Error('Cannot simulate error, WebSocket not connected');
        }

        try {
            this.sendDocumentUpdate(documentId, 'error_occurred', {
                state: 'error',
                progress: 0,
                step: 'Processing error',
                error: {
                    code: 'EXTRACTION_FAILED',
                    message: 'Failed to extract data from document',
                    details: 'The document could not be processed due to low image quality or unsupported format'
                }
            });

            log('Error simulation sent', 'warning');
        } catch (err) {
            log(`Error in error simulation: ${err.message}`, 'error');
            throw err;
        }
    }
}

// Main function
async function main() {
    const client = new WebSocketClient(config.serverUrl);

    try {
        await client.connect();

        console.log('\n');
        console.log('==========================================');
        console.log('WebSocket Document Processing Test Client');
        console.log('==========================================');
        console.log('\nAvailable commands:');
        console.log('  subscribe <docId> - Subscribe to document updates');
        console.log('  unsubscribe <docId> - Unsubscribe from document updates');
        console.log('  test <docId> - Run a test processing sequence');
        console.log('  error <docId> - Simulate an error');
        console.log('  status - Show connection status');
        console.log('  exit - Exit the client');
        console.log('==========================================\n');

        rl.setPrompt('> ');
        rl.prompt();

        rl.on('line', async (line) => {
            const args = line.trim().split(' ');
            const command = args[0].toLowerCase();
            const docId = args[1] || config.documentId;

            try {
                switch (command) {
                    case 'subscribe':
                        await client.subscribeToDocument(docId);
                        break;
                    case 'unsubscribe':
                        await client.unsubscribeFromDocument(docId);
                        break;
                    case 'test':
                        await client.runTestSequence(docId);
                        break;
                    case 'error':
                        await client.simulateError(docId);
                        break;
                    case 'status':
                        log(`Connection status: ${client.connected ? 'Connected' : 'Disconnected'}`, 'info');
                        log(`Subscribed documents: ${Array.from(client.subscribedDocuments).join(', ') || 'None'}`, 'info');
                        break;
                    case 'exit':
                        client.disconnect();
                        rl.close();
                        break;
                    default:
                        log(`Unknown command: ${command}`, 'error');
                        break;
                }
            } catch (err) {
                log(`Command error: ${err.message}`, 'error');
            }

            rl.prompt();
        });

        rl.on('close', () => {
            client.disconnect();
            log('WebSocket test client terminated', 'info');
            process.exit(0);
        });

    } catch (err) {
        log(`Failed to connect: ${err.message}`, 'error');
        process.exit(1);
    }
}

// Run the client
main().catch(err => {
    log(`Unhandled error: ${err.message}`, 'error');
    process.exit(1);
});
