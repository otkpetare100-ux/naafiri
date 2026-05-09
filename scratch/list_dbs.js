const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function listDbs() {
  const uri = process.env.MONGO_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const admin = client.db().admin();
    const dbs = await admin.listDatabases();
    console.log('Databases:', dbs.databases.map(d => d.name));
    
    // Check 'test' db
    const testDb = client.db('test');
    const cols = await testDb.listCollections().toArray();
    console.log('Collections in test:', cols.map(c => c.name));

  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

listDbs();
