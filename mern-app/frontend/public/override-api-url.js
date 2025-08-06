// Override the API URL for local development
if (!window.RUNTIME_CONFIG) {
  window.RUNTIME_CONFIG = {
    REACT_APP_API_URL: 'http://localhost:5200/api',
    REACT_APP_WEBSOCKET_URL: 'ws://localhost:3000/ws/documents'
  };
}
console.log('API URL set to:', window.RUNTIME_CONFIG.REACT_APP_API_URL);
