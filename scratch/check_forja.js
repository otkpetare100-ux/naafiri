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
    
    console.log('--- Account Information (Filtered) ---');
    if (acc) {
      const filteredAcc = { ...acc };
      delete filteredAcc.history; // delete large arrays
      delete filteredAcc.lpHistory;
      delete filteredAcc.snapshots;
      console.log(JSON.stringify(filteredAcc, null, 2));
      
      // Find bets related to this player
      console.log('\n--- Bets Targeting this Player ---');
      const bets = await db.collection('bets').find({ 
        targetPuuid: acc.puuid
      }).sort({ _id: -1 }).limit(10).toArray();
      
      console.log(JSON.stringify(bets, null, 2));
    } else {
      console.log('Account NOT found for ForjaEterna#etrn');
    }
    
    // Check all open bets
    console.log('\n--- All Open Bets ---');
    const openBets = await db.collection('bets').find({ status: 'open' }).toArray();
    console.log(JSON.stringify(openBets, null, 2));
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
