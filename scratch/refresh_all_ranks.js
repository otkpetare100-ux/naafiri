const { MongoClient } = require('mongodb');
const dns = require('dns');
dns.setServers(['8.8.8.8']);
require('dotenv').config();

async function refreshAll() {
  const RIOT_API_KEY = process.env.RIOT_API_KEY;
  if (!RIOT_API_KEY) {
    console.error('No API Key');
    return;
  }

  // Cargar Champion Map
  console.log('Cargando mapa de campeones...');
  const champResp = await fetch('https://ddragon.leagueoflegends.com/cdn/16.9.1/data/en_US/champion.json');
  const champData = await champResp.json();
  const champMap = {};
  Object.values(champData.data).forEach(c => champMap[c.key] = c.id);

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('lan-tracker');
  const accounts = await db.collection('accounts').find({}).toArray();

  console.log(`Refrescando ${accounts.length} cuentas...`);

  for (const acc of accounts) {
    const region = acc.region || 'la1';
    console.log(`- Procesando ${acc.gameName}#${acc.tagLine} (${region})`);

    try {
      // 1. Obtener Rangos usando PUUID directamente
      const lUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${acc.puuid}?api_key=${RIOT_API_KEY}`;
      const lRes = await fetch(lUrl);
      if (lRes.ok) {
        const leagues = await lRes.json();
        const soloQEntry = leagues.find(l => l.queueType === 'RANKED_SOLO_5x5');
        const flexEntry = leagues.find(l => l.queueType === 'RANKED_FLEX_SR');

        const update = {
          soloQ: soloQEntry ? {
            tier: soloQEntry.tier,
            rank: soloQEntry.rank,
            leaguePoints: soloQEntry.leaguePoints,
            wins: soloQEntry.wins,
            losses: soloQEntry.losses
          } : { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 }
        };

        if (flexEntry) {
          update.flex = {
            tier: flexEntry.tier,
            rank: flexEntry.rank,
            leaguePoints: flexEntry.leaguePoints,
            wins: flexEntry.wins,
            losses: flexEntry.losses
          };
        }

        // 2. Top Campeones
        try {
          const mUrl = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${acc.puuid}/top?count=3&api_key=${RIOT_API_KEY}`;
          const mRes = await fetch(mUrl);
          if (mRes.ok) {
            const masteries = await mRes.json();
            update.topChampions = masteries.map(m => ({
              id: m.championId,
              name: champMap[m.championId.toString()] || 'Unknown',
              level: m.championLevel,
              points: m.championPoints
            }));
          }
        } catch (mErr) {
          console.error(`  ⚠️ Error mastery: ${mErr.message}`);
        }

        await db.collection('accounts').updateOne({ puuid: acc.puuid }, { $set: update });
        console.log(`  ✅ Actualizado: ${update.soloQ.tier} ${update.soloQ.rank}`);
      }
    } catch (e) {
      console.error(`  ❌ Error con ${acc.gameName}: ${e.message}`);
    }
    // Rate limit avoidance (subtle)
    await new Promise(r => setTimeout(r, 200));
  }

  await client.close();
  console.log('Finalizado.');
}

refreshAll();
