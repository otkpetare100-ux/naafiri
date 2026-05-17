const dns = require('dns');
dns.setServers(['8.8.8.8']);
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const account = await db.collection('accounts').findOne({ matchStatsHistory: { $exists: true, $not: { $size: 0 } } });
    if (account) {
      console.log('--- Account found:', account.gameName);
      console.log('--- Number of matches:', account.matchStatsHistory.length);
      console.log('--- First match details:');
      console.log(JSON.stringify(account.matchStatsHistory[0], null, 2));
    } else {
      console.log('No accounts with matches found.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
