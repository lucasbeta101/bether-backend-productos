require('dotenv').config();
const { MongoClient } = require('mongodb');

// Constructing direct URI based on nslookup results
// This bypasses the SRV lookup which was failing
const directUri = "mongodb://lucasbeta101:dZNdruoEEJFq1kv9@ac-v7bahdb-shard-00-00.qxglnnl.mongodb.net:27017,ac-v7bahdb-shard-00-01.qxglnnl.mongodb.net:27017,ac-v7bahdb-shard-00-02.qxglnnl.mongodb.net:27017/?ssl=true&authSource=admin&retryWrites=true&w=majority";

console.log('--- MONGODB DIRECT CONNECTION TEST ---');
console.log('URI starts with:', directUri.substring(0, 30) + '...');

const client = new MongoClient(directUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
});

async function run() {
    try {
        console.log('Attempting to connect directly...');
        await client.connect();
        console.log('✅ Connected successfully to server (DIRECT)');

        const dbName = process.env.DB_NAME || "autopartes";
        const db = client.db(dbName);
        console.log(`Using database: ${dbName}`);

        console.log('Pinging database...');
        await db.command({ ping: 1 });
        console.log('✅ Ping successful');

        const collectionName = process.env.COLLECTION_NAME || "productos";
        const count = await db.collection(collectionName).countDocuments();
        console.log(`✅ Collection '${collectionName}' has ${count} documents`);

    } catch (err) {
        console.error('❌ Direct connection failed:', err);
        console.error('Error name:', err.name);
        if (err.cause) console.error('Cause:', err.cause);
    } finally {
        await client.close();
        console.log('--- TEST FINISHED ---');
    }
}

run();
