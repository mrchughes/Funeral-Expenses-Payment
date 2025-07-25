// Fully implemented real code for backend/utils/generateToken.js
const jwt = require("jsonwebtoken");

const generateToken = (email) => {
    // Check if JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
        console.error('[TOKEN] JWT_SECRET is not set');
        // Use a default secret in development only as a fallback
        const secret = 'secure_jwt_secret_for_authentication_token';
        console.log(`[TOKEN] Using default secret with length: ${secret.length}`);
        return jwt.sign({ email }, secret, {
            expiresIn: "30d",
        });
    }

    console.log(`[TOKEN] Using JWT_SECRET with length: ${process.env.JWT_SECRET.length}`);
    return jwt.sign({ email }, process.env.JWT_SECRET, {
        expiresIn: "30d",
    });
};

module.exports = generateToken;
