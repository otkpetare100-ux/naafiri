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
      gameName: { $regex: /^ForjaEterna$/i }
    });
    
    if (acc && acc.matchStatsHistory) {
      console.log('Searching matches for Ashe...');
      const asheMatches = acc.matchStatsHistory.filter(m => m.championName && m.championName.toLowerCase() === 'ashe');
      
      if (asheMatches.length > 0) {
        asheMatches.forEach((m, idx) => {
          console.log(`\nMatch ${idx + 1}:`);
          console.log(`- MatchId: ${m.matchId}`);
          console.log(`- Win: ${m.win}`);
          console.log(`- Lane: ${m.lane}`);
          console.log(`- Level: ${m.champLevel}`);
          console.log(`- Items: item0=${m.item0}, item1=${m.item1}, item2=${m.item2}, item3=${m.item3}, item4=${m.item4}, item5=${m.item5}, item6=${m.item6}`);
          console.log(`- Raw Match Object:`, JSON.stringify(m, null, 2));
        });
      } else {
        console.log('No Ashe matches found in matchStatsHistory.');
      }
    } else {
      console.log('Account not found.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
