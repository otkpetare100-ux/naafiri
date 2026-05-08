const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config({ path: '.env' });

async function debugOne() {
  const RIOT_API_KEY = process.env.RIOT_API_KEY;
  const puuid = "H1275064tkvq5VhZQc86mtt2YyGkQtet_YMsGiWeoAKQkvaykOSKlo2Hb10-jfH21Bimn2PFOH3eOQ"; // ForjaEterna
  const region = "la1";

  const sUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const sRes = await fetch(sUrl, { headers: { "X-Riot-Token": RIOT_API_KEY.trim() } });
  const sData = await sRes.json();
  console.log("Summoner Data:", sData);

  const lUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  const lRes = await fetch(lUrl, { headers: { "X-Riot-Token": RIOT_API_KEY.trim() } });
  const leagues = await lRes.json();
  console.log("Leagues Data (by-puuid):", JSON.stringify(leagues, null, 2));
}
debugOne();
