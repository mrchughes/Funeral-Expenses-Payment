import React, { useState, useEffect, useCallback } from 'react';
import DocumentProcessingClient from '../services/documentProcessingClient';

// WebSocket server URL - automatically determined based on current window location
const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/documents`;
};

/**
 * Component for displaying the progress of document processing
 */
const DocumentProcessingStatus = ({ documentId }) => {
    const [status, setStatus] = useState({
        state: 'waiting',
        progress: 0,
        step: 'Waiting to start processing',
        error: null,
    });
    const [isConnected, setIsConnected] = useState(false);

    // Reference to the WebSocket client
    const clientRef = React.useRef(null);

    // Handle document processing updates
    const handleDocumentUpdate = useCallback((message) => {
        const { type, data } = message;

        if (!data) return;

        switch (type) {
            case 'processing_started':
                setStatus({
                    state: data.state || 'processing',
                    progress: data.progress || 0,
                    step: data.step || 'Starting document processing',
                    error: null
                });
                break;

            case 'progress_updated':
                setStatus(prevStatus => ({
                    ...prevStatus,
                    state: data.state || prevStatus.state,
                    progress: data.progress || prevStatus.progress,
                    step: data.step || prevStatus.step
                }));
                break;

            case 'processing_completed':
                setStatus({
                    state: 'completed',
                    progress: 100,
                    step: data.step || 'Processing complete',
                    error: null
                });
                break;

            case 'error_occurred':
                setStatus({
                    state: 'error',
                    progress: data.progress || 0,
                    step: 'Error occurred',
                    error: data.error || { message: 'Unknown error' }
                });
                break;

            default:
                // Ignore other message types
                break;
        }
    }, []);

    // Setup WebSocket connection
    useEffect(() => {
        // Create WebSocket client
        const wsUrl = getWebSocketUrl();
        const client = new DocumentProcessingClient(wsUrl, {
            debug: process.env.NODE_ENV === 'development',
            autoReconnect: true
        });

        clientRef.current = client;

        // Connect handler
        const connectAndSubscribe = async () => {
            try {
                await client.connect();
                setIsConnected(true);

                if (documentId) {
                    await client.subscribeToDocument(documentId, handleDocumentUpdate);
                }
            } catch (error) {
                console.error('WebSocket connection error:', error);
                setIsConnected(false);
            }
        };

        // Add event listener for connection status changes
        const handleConnectionChange = (connected) => {
            setIsConnected(connected);
        };

        client.addEventListener('connection_status', handleConnectionChange);

        // Connect immediately
        connectAndSubscribe();

        // Cleanup on unmount
        return () => {
            if (clientRef.current) {
                if (documentId) {
                    clientRef.current.unsubscribeFromDocument(documentId);
                }
                clientRef.current.disconnect();
                clientRef.current = null;
            }
        };
    }, [documentId, handleDocumentUpdate]);

    // Subscribe to document updates when document ID changes
    useEffect(() => {
        if (!clientRef.current || !documentId || !isConnected) return;

        // Unsubscribe from previous document if any
        const previousDocuments = [...clientRef.current.subscribedDocuments];
        previousDocuments.forEach(docId => {
            if (docId !== documentId) {
                clientRef.current.unsubscribeFromDocument(docId);
            }
        });

        // Subscribe to new document
        clientRef.current.subscribeToDocument(documentId, handleDocumentUpdate)
            .catch(error => {
                console.error('Error subscribing to document:', error);
            });

    }, [documentId, isConnected, handleDocumentUpdate]);

    // Helper function to determine status color
    const getStatusColor = () => {
        switch (status.state) {
            case 'completed':
                return '#28a745'; // Green
            case 'error':
                return '#dc3545'; // Red
            case 'waiting':
                return '#6c757d'; // Gray
            default:
                return '#007bff'; // Blue (processing)
        }
    };

    return (
        <div className="document-processing-status">
            <h3>Document Processing Status</h3>

            {/* Connection Status */}
            <div className="connection-status">
                <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>

            {/* Document ID */}
            <div className="document-id">
                Document ID: <strong>{documentId || 'No document selected'}</strong>
            </div>

            {/* Progress Bar */}
            <div className="progress-container">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{
                            width: `${status.progress}%`,
                            backgroundColor: getStatusColor()
                        }}
                    ></div>
                </div>
                <div className="progress-label">{status.progress}%</div>
            </div>

            {/* Status Information */}
            <div className="status-info">
                <div className="status-state">{status.state}</div>
                <div className="status-step">{status.step}</div>
            </div>

            {/* Error Display */}
            {status.error && (
                <div className="status-error">
                    <h4>Error</h4>
                    <p>{status.error.message}</p>
                    {status.error.details && <p className="error-details">{status.error.details}</p>}
                </div>
            )}

            {/* CSS Styles */}
            <style jsx>{`
        .document-processing-status {
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 5px;
          margin: 15px 0;
        }
        
        .connection-status {
          margin-bottom: 10px;
        }
        
        .status-indicator {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-right: 8px;
        }
        
        .status-indicator.connected {
          background-color: #28a745;
        }
        
        .status-indicator.disconnected {
          background-color: #dc3545;
        }
        
        .document-id {
          margin-bottom: 15px;
          font-size: 14px;
        }
        
        .progress-container {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .progress-bar {
          flex: 1;
          height: 10px;
          background-color: #e9ecef;
          border-radius: 5px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          transition: width 0.3s ease;
        }
        
        .progress-label {
          margin-left: 10px;
          font-weight: bold;
        }
        
        .status-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        
        .status-state {
          font-weight: bold;
          text-transform: capitalize;
        }
        
        .status-error {
          margin-top: 15px;
          padding: 10px;
          background-color: #f8d7da;
          border-radius: 5px;
          color: #721c24;
        }
        
        .status-error h4 {
          margin-top: 0;
          margin-bottom: 5px;
        }
        
        .error-details {
          font-size: 14px;
          margin-top: 5px;
        }
      `}</style>
        </div>
    );
};

export default DocumentProcessingStatus;
