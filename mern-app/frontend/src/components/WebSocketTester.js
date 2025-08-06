import React, { useState, useEffect, useRef } from 'react';

/**
 * WebSocketTester - A component to test WebSocket connections directly from the browser
 * This will help us debug the issue with document status updates
 * 
 * Usage:
 * 1. Set the WebSocket URL (default: ws://localhost:4007)
 * 2. Set the Document ID you want to subscribe to
 * 3. Click "Connect" to establish a WebSocket connection
 * 4. Messages will appear in the log below
 * 
 * You can test this component by running:
 * ./scripts/test-ws-frontend.sh
 */
const WebSocketTester = () => {
    const [wsUrl, setWsUrl] = useState('ws://localhost:4007');
    const [documentId, setDocumentId] = useState('test-doc-123');
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const wsRef = useRef(null);

    // Connect to WebSocket server
    const connect = () => {
        try {
            console.log(`[WebSocketTester] Connecting to ${wsUrl}...`);
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('[WebSocketTester] Connected to WebSocket server');
                setConnected(true);

                // Subscribe to document updates
                if (documentId) {
                    const subscribeMsg = JSON.stringify({
                        type: 'subscribe:document',
                        documentId: documentId
                    });
                    socket.send(subscribeMsg);
                    console.log(`[WebSocketTester] Sent subscription for document ${documentId}`);
                    addMessage('out', `Subscribed to document ${documentId}`);

                    // Also try sending the raw message
                    try {
                        // Send a test subscription to see if the raw format works better
                        setTimeout(() => {
                            const altSubscribeMsg = JSON.stringify({
                                event: 'subscribe',
                                channel: `document:${documentId}`
                            });
                            console.log(`[WebSocketTester] Trying alternative subscription format:`, altSubscribeMsg);
                            socket.send(altSubscribeMsg);
                            addMessage('out', `Sent alternative subscription format: ${altSubscribeMsg}`);
                        }, 500);
                    } catch (err) {
                        console.error('[WebSocketTester] Error sending alternative subscription:', err);
                    }
                }
            };

            socket.onmessage = (event) => {
                console.log('[WebSocketTester] Received message:', event.data);
                try {
                    const data = JSON.parse(event.data);
                    addMessage('in', data);
                } catch (err) {
                    addMessage('in', event.data);
                }
            };

            socket.onerror = (error) => {
                console.error('[WebSocketTester] WebSocket error:', error);
                addMessage('error', `WebSocket error: ${error}`);
            };

            socket.onclose = (event) => {
                console.log('[WebSocketTester] WebSocket closed:', event.code, event.reason);
                setConnected(false);
                addMessage('system', `Connection closed: ${event.code} ${event.reason}`);
                wsRef.current = null;
            };

            wsRef.current = socket;
            return true;
        } catch (err) {
            console.error('[WebSocketTester] Failed to connect:', err);
            addMessage('error', `Connection failed: ${err.message}`);
            return false;
        }
    };

    // Disconnect from WebSocket server
    const disconnect = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
            setConnected(false);
            addMessage('system', 'Manually disconnected');
        }
    };

    // Add a message to the log
    const addMessage = (type, content) => {
        const timestamp = new Date().toISOString();
        setMessages(prev => [...prev, { type, content, timestamp }]);
    };

    // Send a test message
    const sendMessage = () => {
        if (wsRef.current && connected) {
            const testMessage = JSON.stringify({
                type: 'ping',
                timestamp: new Date().toISOString()
            });
            wsRef.current.send(testMessage);
            addMessage('out', JSON.parse(testMessage));
        }
    };

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    return (
        <div className="websocket-tester" style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '5px', margin: '20px 0' }}>
            <h2>WebSocket Connection Tester</h2>

            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>WebSocket URL:</label>
                <input
                    type="text"
                    value={wsUrl}
                    onChange={e => setWsUrl(e.target.value)}
                    disabled={connected}
                    style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
                />

                <label style={{ display: 'block', marginBottom: '5px' }}>Document ID:</label>
                <input
                    type="text"
                    value={documentId}
                    onChange={e => setDocumentId(e.target.value)}
                    disabled={connected}
                    style={{ width: '100%', padding: '8px' }}
                />
            </div>

            <div style={{ marginBottom: '15px' }}>
                {!connected ? (
                    <button
                        onClick={connect}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Connect
                    </button>
                ) : (
                    <>
                        <button
                            onClick={disconnect}
                            style={{
                                padding: '10px 15px',
                                backgroundColor: '#f44336',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                marginRight: '10px',
                                cursor: 'pointer'
                            }}
                        >
                            Disconnect
                        </button>

                        <button
                            onClick={sendMessage}
                            style={{
                                padding: '10px 15px',
                                backgroundColor: '#2196F3',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Send Test Message
                        </button>
                    </>
                )}

                <span style={{
                    marginLeft: '15px',
                    color: connected ? 'green' : 'red',
                    fontWeight: 'bold'
                }}>
                    Status: {connected ? 'Connected' : 'Disconnected'}
                </span>
            </div>

            <div>
                <h3>Message Log</h3>
                <div style={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    padding: '10px',
                    backgroundColor: '#f9f9f9'
                }}>
                    {messages.length === 0 ? (
                        <p>No messages yet</p>
                    ) : (
                        messages.map((msg, index) => (
                            <div key={index} style={{
                                padding: '5px 0',
                                borderBottom: '1px solid #eee',
                                color: msg.type === 'error' ? 'red' :
                                    msg.type === 'in' ? 'blue' :
                                        msg.type === 'out' ? 'green' : 'gray'
                            }}>
                                <div style={{ fontSize: '0.8em', color: '#777' }}>
                                    {new Date(msg.timestamp).toLocaleTimeString()} - {msg.type.toUpperCase()}
                                </div>
                                <pre style={{ margin: '2px 0' }}>
                                    {typeof msg.content === 'object'
                                        ? JSON.stringify(msg.content, null, 2)
                                        : String(msg.content)
                                    }
                                </pre>
                            </div>
                        ))
                    )}
                </div>
                <button
                    onClick={() => setMessages([])}
                    style={{
                        padding: '5px 10px',
                        margin: '10px 0',
                        backgroundColor: '#757575',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Clear Log
                </button>
            </div>
        </div>
    );
};

export default WebSocketTester;
