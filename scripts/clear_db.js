// Script to clear MongoDB collections
const { MongoClient } = require('mongodb');

async function clearDatabase() {
    const uri = process.env.MONGODB_URI || 'mongodb+srv://fepuser:FepTest123@devconnector.jmwb0ez.mongodb.net/FEP?retryWrites=true&w=majority&appName=DevConnector';

    console.log('Connecting to MongoDB...');
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db();

        // Get all collections
        const collections = await db.listCollections().toArray();

        console.log('Found the following collections:');
        collections.forEach(collection => {
            console.log(`- ${collection.name}`);
        });

        // Define expected collections based on the application structure
        const expectedCollections = [
            'users',          // User accounts
            'forms',          // Application forms
            'evidence',       // Evidence documents
            'applications',   // Completed applications
            'tasks',          // User tasks
            'notifications',  // User notifications
            'chats',          // AI chat history
            'uploads'         // Upload metadata
        ];

        // Create any missing collections to ensure they exist and can be cleared
        console.log('\nEnsuring all expected collections exist:');
        for (const collectionName of expectedCollections) {
            if (!collections.some(c => c.name === collectionName)) {
                console.log(`- Creating missing collection: ${collectionName}`);
                await db.createCollection(collectionName);
            } else {
                console.log(`- Collection exists: ${collectionName}`);
            }
        }

        // Get updated list of collections
        const updatedCollections = await db.listCollections().toArray();

        // Clear each collection
        console.log('\nClearing collections:');
        for (const collection of updatedCollections) {
            const collectionName = collection.name;
            console.log(`- Clearing ${collectionName}`);
            await db.collection(collectionName).deleteMany({});
        }

        console.log('All collections cleared successfully');
    } catch (err) {
        console.error('Error clearing database:', err);
    } finally {
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the function
clearDatabase().catch(console.error);
