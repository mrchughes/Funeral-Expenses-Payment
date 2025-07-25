// Fully implemented real code for backend/middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const { findUserByEmail } = require("../services/dynamodbService");

const protect = asyncHandler(async (req, res, next) => {
    let token;

    console.log('[AUTH-MIDDLEWARE] Headers:', req.headers.authorization ? 'Authorization header exists' : 'No authorization header');

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        try {
            token = req.headers.authorization.split(" ")[1];

            if (!token) {
                console.log('[AUTH-MIDDLEWARE] No token found in header');
                res.status(401);
                throw new Error("Not authorized, no token");
            }

            console.log(`[AUTH-MIDDLEWARE] Token found, length: ${token.length}`);
            console.log(`[AUTH-MIDDLEWARE] JWT_SECRET exists: ${Boolean(process.env.JWT_SECRET)}`);
            console.log(`[AUTH-MIDDLEWARE] JWT_SECRET length: ${process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0}`);

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log(`[AUTH-MIDDLEWARE] Token decoded successfully:`, decoded);

            const user = await findUserByEmail(decoded.email);
            if (!user) {
                console.log(`[AUTH-MIDDLEWARE] User not found for email: ${decoded.email}`);
                res.status(401);
                throw new Error("User not found");
            }

            console.log(`[AUTH-MIDDLEWARE] User found: ${user.email}`);
            req.user = user;
            next();
        } catch (error) {
            console.error("JWT verification error:", error.message);
            res.status(401);
            throw new Error("Not authorized, token failed");
        }
    } else {
        res.status(401);
        throw new Error("Not authorized, no token");
    }
});

module.exports = { protect };
