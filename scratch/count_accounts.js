const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const count = await db.collection('accounts').countDocuments();
    const accounts = await db.collection('accounts').find({}, { projection: { gameName: 1, tagLine: 1 } }).toArray();
    
    console.log(`Total tracked accounts: ${count}`);
    console.log('List of tracked accounts:');
    accounts.forEach((acc, i) => {
      console.log(`${i+1}. ${acc.gameName}#${acc.tagLine}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
