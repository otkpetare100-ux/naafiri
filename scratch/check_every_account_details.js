const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

const REGION_ROUTING = {
  la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
};

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db('lan-tracker');
    
    const accounts = await db.collection('accounts').find({}).toArray();
    
    console.log('=== REPORT OF TRACKED PLAYERS & REGIONS ===\n');
    accounts.forEach((acc, i) => {
      const region = acc.region || 'la1';
      const routing = REGION_ROUTING[region] || 'americas';
      const specUrl = `https://${region}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${acc.puuid.trim()}`;
      const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acc.puuid.trim()}/ids`;
      
      console.log(`${i+1}. Player: ${acc.gameName}#${acc.tagLine}`);
      console.log(`   - Saved Region: "${region.toUpperCase()}" (Spectator Host: "${region}.api.riotgames.com")`);
      console.log(`   - Saved Routing: "${routing.toUpperCase()}" (Matches Host: "${routing}.api.riotgames.com")`);
      console.log(`   - PUUID: "${acc.puuid}"`);
      console.log(`   - Live Game Spec URL: ${specUrl}`);
      console.log(`   - Match History URL: ${matchUrl}`);
      console.log('   ----------------------------------------');
    });
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

run();
