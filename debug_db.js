require('dotenv').config();
const { MongoClient } = require('mongodb');

// URI de conexión desde .env o hardcoded como fallback visual para debug
const uri = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";

console.log('--- MONGODB CONNECTION TEST ---');
console.log('URI length:', uri.length);
console.log('URI starts with:', uri.substring(0, 15) + '...');

const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
});

async function run() {
    try {
        console.log('Attempting to connect...');
        await client.connect();
        console.log('✅ Connected successfully to server');

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
        console.error('❌ Connection failed:', err);
    } finally {
        await client.close();
        console.log('--- TEST FINISHED ---');
    }
}

run();
