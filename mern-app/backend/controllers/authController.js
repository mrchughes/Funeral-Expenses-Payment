// Fully implemented real code for backend/controllers/authController.js
const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const generateToken = require("../utils/generateToken");
const { createUser, findUserByEmail } = require("../services/dynamodbService");

const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    // Input validation
    if (!name || !email || !password) {
        res.status(400);
        throw new Error("Please provide name, email, and password");
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        res.status(400);
        throw new Error("Please provide a valid email address");
    }

    // Password validation
    if (password.length < 8) {
        res.status(400);
        throw new Error("Password must be at least 8 characters long");
    }

    const userExists = await findUserByEmail(email.toLowerCase());
    if (userExists) {
        res.status(400);
        throw new Error("User already exists");
    }

    const salt = await bcrypt.genSalt(12); // Increased salt rounds for better security
    const hashedPassword = await bcrypt.hash(password, salt);

    await createUser({ name: name.trim(), email: email.toLowerCase(), password: hashedPassword });

    res.status(201).json({
        name: name.trim(),
        email: email.toLowerCase(),
        token: generateToken(email.toLowerCase()),
    });
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Add debug logging
    console.log(`[AUTH] Login attempt for email: ${email}`);

    // Input validation
    if (!email || !password) {
        console.log(`[AUTH] Missing email or password`);
        res.status(400);
        throw new Error("Please provide email and password");
    }

    const user = await findUserByEmail(email.toLowerCase());
    if (!user) {
        console.log(`[AUTH] User not found: ${email.toLowerCase()}`);
        res.status(401);
        throw new Error("Invalid email or password");
    }

    console.log(`[AUTH] User found: ${user.email}`);
    console.log(`[AUTH] Stored password hash length: ${user.password.length}`);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log(`[AUTH] Password match result: ${isMatch}`);

    if (!isMatch) {
        console.log(`[AUTH] Password mismatch for user: ${user.email}`);
        res.status(401);
        throw new Error("Invalid email or password");
    }

    // Generate token
    const token = generateToken(user.email);
    console.log(`[AUTH] Generated token length: ${token.length}`);

    res.json({
        name: user.name,
        email: user.email,
        token: generateToken(user.email),
    });
});

// Simple password reset: user provides email and new password
const resetPassword = asyncHandler(async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
        res.status(400);
        throw new Error("Please provide email and new password");
    }
    if (newPassword.length < 8) {
        res.status(400);
        throw new Error("Password must be at least 8 characters long");
    }
    const user = await findUserByEmail(email.toLowerCase());
    if (!user) {
        res.status(404);
        throw new Error("No user found with that email");
    }
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();
    res.json({ message: "Password reset successful" });
});

module.exports = { registerUser, loginUser, resetPassword };
