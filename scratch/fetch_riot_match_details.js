const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function run() {
  const matchId = 'LA1_1709334058';
  const RIOT_API_KEY = process.env.RIOT_API_KEY;
  const routing = 'americas';
  
  try {
    const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${RIOT_API_KEY}`;
    const resp = await fetch(matchUrl);
    
    if (!resp.ok) {
      console.log(`Error: ${resp.status} ${resp.statusText}`);
      return;
    }
    
    const matchData = await resp.json();
    
    // Find Azzz#Bou in the participants
    // Let's print all participants so we can find Azzz#Bou
    matchData.info.participants.forEach(p => {
      if (p.summonerName && p.summonerName.toLowerCase().includes('azzz') || 
          p.riotIdGameName && p.riotIdGameName.toLowerCase().includes('azzz')) {
        console.log(`Found Participant: ${p.riotIdGameName || p.summonerName}#${p.riotIdTagline || ''}`);
        console.log(`- Champion: ${p.championName}`);
        console.log(`- Items in Riot API:`);
        console.log(`  item0: ${p.item0}`);
        console.log(`  item1: ${p.item1}`);
        console.log(`  item2: ${p.item2}`);
        console.log(`  item3: ${p.item3}`);
        console.log(`  item4: ${p.item4}`);
        console.log(`  item5: ${p.item5}`);
        console.log(`  item6: ${p.item6}`);
      }
    });
    
  } catch (e) {
    console.error(e);
  }
}

run();
