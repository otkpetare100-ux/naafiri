const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    const RIOT_API_KEY = process.env.RIOT_API_KEY;
    
    const accounts = await db.collection('accounts').find({}).toArray();
    console.log('Starting migration for all accounts...');
    
    for (const acc of accounts) {
      if (!acc.matchStatsHistory || acc.matchStatsHistory.length === 0) continue;
      
      const routingMap = {
        la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
        euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
        kr: 'asia', jp1: 'asia',
        oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
      };
      const routing = routingMap[acc.region] || 'americas';
      let updatedCount = 0;
      
      const updatedHistory = [];
      for (const m of acc.matchStatsHistory) {
        try {
          if (m.roleBoundItem !== undefined && m.roleBoundItem > 0) {
            updatedHistory.push(m);
            continue;
          }
          
          const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${m.matchId}?api_key=${RIOT_API_KEY}`;
          const resp = await fetch(matchUrl);
          if (!resp.ok) {
            m.roleBoundItem = m.roleBoundItem || 0;
            updatedHistory.push(m);
            continue;
          }
          
          const matchData = await resp.json();
          const p = matchData.info.participants.find(p => p.puuid === acc.puuid);
          
          m.roleBoundItem = p ? (p.roleBoundItem || 0) : 0;
          updatedHistory.push(m);
          updatedCount++;
          console.log(`Updated Match ${m.matchId} for ${acc.gameName} | roleBoundItem: ${m.roleBoundItem}`);
          
          await new Promise(r => setTimeout(r, 80)); // Rate limit safety
        } catch (err) {
          console.error(`Error migrating match ${m.matchId}:`, err);
          m.roleBoundItem = m.roleBoundItem || 0;
          updatedHistory.push(m);
        }
      }
      
      if (updatedCount > 0) {
        await db.collection('accounts').updateOne(
          { puuid: acc.puuid },
          { $set: { matchStatsHistory: updatedHistory } }
        );
        console.log(`Successfully migrated ${updatedCount} matches for ${acc.gameName}`);
      }
    }
    
    console.log('Migration completed successfully!');
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
