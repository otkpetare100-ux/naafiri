const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const doc = await db.collection('system_config').findOne({ key: 'riot_api_status' });
    console.log('--- Riot API Status in DB ---');
    console.log(JSON.stringify(doc, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
