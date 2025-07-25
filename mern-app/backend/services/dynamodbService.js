// MongoDB/Mongoose implementation for user and form data
const mongoose = require("mongoose");
const User = require("../models/User");

// Connect to MongoDB if not already connected
if (!mongoose.connection.readyState) {
  console.log('[DB] Connecting to MongoDB...');
  console.log(`[DB] MONGODB_URI exists: ${Boolean(process.env.MONGODB_URI)}`);
  console.log(`[DB] MONGODB_URI length: ${process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0}`);

  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('[DB] MongoDB connected successfully');
  }).catch(err => {
    console.error('[DB] MongoDB connection error:', err);
  });
}

const createUser = async (user) => {
  try {
    console.log(`[DB] Creating user with email: ${user.email}`);
    const newUser = new User({
      email: user.email,
      name: user.name,
      password: user.password,
    });
    await newUser.save();
    console.log(`[DB] User created successfully: ${user.email}`);
  } catch (error) {
    console.error("[DB] Error creating user:", error);
    throw new Error("Failed to create user");
  }
};

const findUserByEmail = async (email) => {
  try {
    console.log(`[DB] Finding user by email: ${email}`);
    const user = await User.findOne({ email });
    console.log(`[DB] User found: ${user ? 'Yes' : 'No'}`);
    return user;
  } catch (error) {
    console.error("[DB] Error finding user:", error);
    throw new Error("Failed to find user");
  }
};

const saveFormData = async (email, formData) => {
  try {
    console.log(`[DB SERVICE] Saving form data for ${email}, fields: ${Object.keys(formData).join(', ')}`);

    const result = await User.updateOne(
      { email },
      { $set: { formData, updatedAt: new Date() } }
    );

    console.log(`[DB SERVICE] Update result:`,
      result.acknowledged ? 'Acknowledged' : 'Not acknowledged',
      `Matched: ${result.matchedCount}`,
      `Modified: ${result.modifiedCount}`
    );

    if (result.matchedCount === 0) {
      console.warn(`[DB SERVICE] Warning: No user found with email ${email}`);
    }
  } catch (error) {
    console.error("Error saving form data:", error);
    throw new Error("Failed to save form data");
  }
};

const getFormData = async (email) => {
  try {
    console.log(`[DB SERVICE] Getting form data for ${email}`);
    const user = await User.findOne({ email });

    if (!user) {
      console.warn(`[DB SERVICE] Warning: No user found with email ${email}`);
      return null;
    }

    console.log(`[DB SERVICE] Found user ${email}, has formData: ${!!user.formData}`);
    if (user.formData) {
      console.log(`[DB SERVICE] Form data fields: ${Object.keys(user.formData).join(', ')}`);
    }

    return user?.formData || null;
  } catch (error) {
    console.error("Error getting form data:", error);
    throw new Error("Failed to get form data");
  }
};

const clearFormData = async (email) => {
  try {
    await User.updateOne(
      { email },
      { $set: { formData: null, updatedAt: new Date() } }
    );
  } catch (error) {
    console.error("Error clearing form data:", error);
    throw new Error("Failed to clear form data");
  }
};

module.exports = { createUser, findUserByEmail, saveFormData, getFormData, clearFormData };
