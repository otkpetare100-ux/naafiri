const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const accounts = await db.collection('accounts').find({
      gameName: { $in: ['ForjaEterna', 'cezzy', 'Grey', 'Bodkin Arrow'] }
    }, { projection: { gameName: 1, tagLine: 1, region: 1, puuid: 1 } }).toArray();
    
    console.log('--- Account Regions ---');
    accounts.forEach(acc => {
      console.log(`${acc.gameName}#${acc.tagLine}: Region = "${acc.region}"`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
