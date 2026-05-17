const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const accounts = await db.collection('accounts').find({}).toArray();
    console.log('--- List of All Registered Players ---');
    accounts.forEach(a => {
      console.log(`- GameName: ${a.gameName}, TagLine: ${a.tagLine}, Region: ${a.region}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
