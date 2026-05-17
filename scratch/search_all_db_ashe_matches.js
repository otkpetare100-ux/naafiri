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
    console.log('Searching all players for Ashe win match...');
    
    for (const acc of accounts) {
      if (acc.matchStatsHistory) {
        const matches = acc.matchStatsHistory.filter(m => 
          m.championName && 
          m.championName.toLowerCase() === 'ashe' && 
          m.win === true
        );
        
        if (matches.length > 0) {
          console.log(`\nPlayer: ${acc.gameName}#${acc.tagLine}`);
          matches.forEach(m => {
            console.log(`- MatchId: ${m.matchId}`);
            console.log(`- Items: item0=${m.item0}, item1=${m.item1}, item2=${m.item2}, item3=${m.item3}, item4=${m.item4}, item5=${m.item5}, item6=${m.item6}`);
          });
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
