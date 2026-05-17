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
    
    if (!acc) {
      console.log('Account ForjaEterna not found.');
      return;
    }
    
    const puuid = acc.puuid;
    const region = acc.region || 'la1';
    const RIOT_API_KEY = process.env.RIOT_API_KEY;
    
    console.log(`PUUID: ${puuid}`);
    console.log(`Region: ${region}`);
    
    const routingMap = {
      la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
      euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
      kr: 'asia', jp1: 'asia',
      oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
    };
    const routing = routingMap[region] || 'americas';
    
    // Query Riot for latest 10 matches (any queue)
    const matchIdsUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=10&api_key=${RIOT_API_KEY}`;
    const resp = await fetch(matchIdsUrl);
    
    if (!resp.ok) {
      console.log(`Error querying match IDs: ${resp.status} ${resp.statusText}`);
      return;
    }
    
    const matchIds = await resp.json();
    console.log(`Fetched Match IDs:`, matchIds);
    
    for (const matchId of matchIds) {
      const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${RIOT_API_KEY}`;
      const matchResp = await fetch(matchUrl);
      if (!matchResp.ok) continue;
      
      const matchData = await matchResp.json();
      const participant = matchData.info.participants.find(p => p.puuid === puuid);
      
      if (participant && participant.championName.toLowerCase() === 'ashe') {
        console.log(`\nFound Ashe Match: ${matchId}`);
        console.log(`- Queue: ${matchData.info.queueId}`);
        console.log(`- Win: ${participant.win}`);
        console.log(`- Level: ${participant.champLevel}`);
        console.log(`- Lane (teamPosition): ${participant.teamPosition}`);
        console.log(`- Items in Riot API:`);
        console.log(`  item0: ${participant.item0}`);
        console.log(`  item1: ${participant.item1}`);
        console.log(`  item2: ${participant.item2}`);
        console.log(`  item3: ${participant.item3}`);
        console.log(`  item4: ${participant.item4}`);
        console.log(`  item5: ${participant.item5}`);
        console.log(`  item6: ${participant.item6}`);
      }
    }
    
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
