const dns = require('dns');
dns.setServers(['8.8.8.8']);

async function testKey() {
  const RIOT_API_KEY = "RGAPI-754bf9fc-5ba9-40a9-8889-0f063d552bfd";
  const puuid = "H1275064tkvq5VhZQc86mtt2YyGkQtet_YMsGiWeoAKQkvaykOSKlo2Hb10-jfH21Bimn2PFOH3eOQ"; // ForjaEterna
  const region = "la1";

  const sUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  try {
    const sRes = await fetch(sUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
    const sData = await sRes.json();
    console.log("Status:", sRes.status);
    console.log("Summoner Data:", sData);
  } catch (e) {
    console.error("Fetch error:", e);
  }
}
testKey();
