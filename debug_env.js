require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

console.log('--- MONGODB ENV CONNECTION TEST ---');
// Mask password in log
const maskedUri = uri.replace(/:([^:@]+)@/, ':****@');
console.log('URI:', maskedUri);

const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
});

async function run() {
    try {
        console.log('Attempting to connect using .env URI...');
        await client.connect();
        console.log('✅ Connected successfully to server (SRV)');

        const dbName = process.env.DB_NAME || "autopartes";
        const db = client.db(dbName);
        console.log(`Using database: ${dbName}`);

        console.log('Pinging database...');
        await db.command({ ping: 1 });
        console.log('✅ Ping successful');

    } catch (err) {
        console.error('❌ Connection failed:', err);
    } finally {
        await client.close();
        console.log('--- TEST FINISHED ---');
    }
}

run();
