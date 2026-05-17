const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    console.log('--- Recent Bets (All Players) ---');
    const bets = await db.collection('bets').find({}).sort({ _id: -1 }).limit(10).toArray();
    if (bets.length > 0) {
      bets.forEach(b => {
        console.log(`Bet ID: ${b._id}, User: ${b.discordId}, Player PUUID: ${b.targetPuuid}, Amount: ${b.amount}, Choice: ${b.choice}, Status: ${b.status}, Date: ${b._id.getTimestamp().toLocaleString('es-ES')}`);
      });
    } else {
      console.log('No bets found at all in the database.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
