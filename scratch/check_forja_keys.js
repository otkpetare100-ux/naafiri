const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    // Find the player account
    const acc = await db.collection('accounts').findOne({ 
      gameName: { $regex: /^ForjaEterna$/i },
      tagLine: { $regex: /^etrn$/i }
    });
    
    console.log('--- Account Information (Keys & Simple Fields) ---');
    if (acc) {
      console.log('Top level keys:', Object.keys(acc));
      const simpleFields = {};
      for (const [k, v] of Object.entries(acc)) {
        if (typeof v !== 'object' || v === null) {
          simpleFields[k] = v;
        } else {
          simpleFields[k] = `[${v.constructor.name || typeof v}] (size/keys: ${Object.keys(v).length || v.length})`;
        }
      }
      console.log(JSON.stringify(simpleFields, null, 2));

      // Check specific fields that are objects
      if (acc.soloQ) console.log('soloQ:', JSON.stringify(acc.soloQ, null, 2));
      if (acc.flexQ) console.log('flexQ:', JSON.stringify(acc.flexQ, null, 2));
      
      // Let's also check active bets on this player
      const bets = await db.collection('bets').find({ targetPuuid: acc.puuid }).toArray();
      console.log(`\n--- Bets related to ForjaEterna (Total: ${bets.length}) ---`);
      bets.forEach(b => {
        console.log(`Bet ID: ${b._id}, User: ${b.discordId}, Amount: ${b.amount}, Choice: ${b.choice}, Status: ${b.status}`);
      });
    } else {
      console.log('Account NOT found for ForjaEterna#etrn');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
