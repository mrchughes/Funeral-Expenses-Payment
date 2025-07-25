// Script to generate a valid test JWT token for API testing
const jwt = require('jsonwebtoken');

// Use the same default secret as in generateToken.js
const secret = 'secure_jwt_secret_for_authentication_token';

// Create a token for a test user
const token = jwt.sign({ email: "test@example.com" }, secret, {
    expiresIn: "30d",
});

console.log("Generated test token:");
console.log(token);
console.log("\nToken payload:");
console.log(jwt.decode(token));

// For testing API calls with curl:
console.log("\nFor curl testing:");
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:5200/api/ai-agent/extract`);
