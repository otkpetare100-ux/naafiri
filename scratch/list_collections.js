const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const collections = await db.listCollections().toArray();
    console.log('Collections in database:');
    collections.forEach(col => {
      console.log(`- ${col.name}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
