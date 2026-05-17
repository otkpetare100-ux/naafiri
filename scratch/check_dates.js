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
    
    if (acc && acc.matchStatsHistory) {
      console.log('--- Matches for ForjaEterna ---');
      acc.matchStatsHistory.slice(0, 5).forEach((m, i) => {
        const date = new Date(m.timestamp);
        console.log(`${i+1}. MatchId: ${m.matchId}, Champ: ${m.championName}, Queue: ${m.queueId === 420 ? 'SoloQ' : 'FlexQ'}, Win: ${m.win}, Date: ${date.toLocaleString('es-ES')}, Timestamp: ${m.timestamp}`);
      });
    } else {
      console.log('No matches found.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
