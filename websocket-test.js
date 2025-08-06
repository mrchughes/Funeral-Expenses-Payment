
const WebSocket = require("ws");
const url = "ws://localhost:3000/ws/documents";
console.log(`Connecting to WebSocket at ${url}`);

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("Connection established");
  // Send a test message
  ws.send(JSON.stringify({ type: "ping" }));
});

ws.on("message", (data) => {
  console.log("Received message:", data.toString());
  ws.close();
});

ws.on("error", (error) => {
  console.error("WebSocket error:", error.message);
});

ws.on("close", (code, reason) => {
  console.log(`Connection closed: Code: ${code}, Reason: ${reason || "No reason provided"}`);
  process.exit(0);
});

// Close after 5 seconds if no response
setTimeout(() => {
  console.log("Timeout reached, closing connection");
  ws.close();
  process.exit(1);
}, 5000);

