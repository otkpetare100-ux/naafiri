const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config({ path: '.env' });

async function listDBs() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const admin = client.db().admin();
  const dbs = await admin.listDatabases();
  console.log("Databases:", dbs.databases.map(d => d.name));
  
  for (const dbInfo of dbs.databases) {
    const db = client.db(dbInfo.name);
    const collections = await db.listCollections().toArray();
    console.log(`DB ${dbInfo.name} has collections:`, collections.map(c => c.name));
  }
  
  await client.close();
}
listDBs();
