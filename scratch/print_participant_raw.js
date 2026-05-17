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
    const p = matchData.info.participants.find(p => 
      p.summonerName && p.summonerName.toLowerCase().includes('azzz') || 
      p.riotIdGameName && p.riotIdGameName.toLowerCase().includes('azzz')
    );
    
    if (p) {
      console.log('--- RAW PARTICIPANT OBJECT ---');
      // Print all keys of the participant object
      Object.keys(p).sort().forEach(key => {
        if (key.toLowerCase().includes('item') || key.toLowerCase().includes('boot') || typeof p[key] === 'number' && p[key] === 3006) {
          console.log(`${key}: ${p[key]}`);
        }
      });
      
      console.log('\nLet\'s print all keys that contain a value of 3006 (Berserker\'s Greaves):');
      for (const [key, val] of Object.entries(p)) {
        if (val === 3006) {
          console.log(`${key}: ${val}`);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
}

run();
