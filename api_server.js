const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const dns = require('dns');

dns.setServers(['8.8.8.8']);

const app = express();
const PORT = process.env.API_PORT || 3010;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());

let db;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('lan-tracker');
    console.log('✅ API Server: MongoDB conectado');
  } catch (e) {
    console.error('❌ API Server: Error conectando a MongoDB:', e);
  }
}

connectDB();

// --- Middleware Logger para Diagnóstico ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- Endpoints ---

// Obtener Ladderboard
app.get('/api/ladder', async (req, res) => {
  try {
    const accounts = await db.collection('accounts').find({}).toArray();
    
    const getAbsoluteLP = (tier, rank, lp) => {
      if (!tier || !rank) return 0;
      const tiers = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
      const ranks = ['IV', 'III', 'II', 'I'];
      const tierIdx = tiers.indexOf(tier.toUpperCase());
      if (tierIdx === -1) return 0;
      if (tierIdx >= 7) return (7 * 400) + lp;
      const rankIdx = ranks.indexOf(rank.toUpperCase());
      return (tierIdx * 400) + (rankIdx * 100) + lp;
    };

    const ladder = accounts.map(acc => {
      const soloQ = acc.soloQ || { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 };
      const totalGames = soloQ.wins + soloQ.losses;
      const winRate = totalGames > 0 ? Math.round((soloQ.wins / totalGames) * 100) : 0;
      
      return {
        puuid: acc.puuid,
        gameName: acc.gameName,
        tagLine: acc.tagLine,
        profileIconId: acc.profileIconId,
        summonerLevel: acc.summonerLevel || 0,
        region: acc.region || 'la1', // Por defecto LAN si no tiene
        tier: soloQ.tier,
        rank: soloQ.rank,
        lp: soloQ.leaguePoints,
        winRate: `${winRate}%`,
        absLp: getAbsoluteLP(soloQ.tier, soloQ.rank, soloQ.leaguePoints),
        isLive: acc.liveGameStartedAt ? true : false
      };
    });

    ladder.sort((a, b) => b.absLp - a.absLp);
    res.json(ladder);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Añadir nuevo Invocador
app.post('/api/summoners', async (req, res) => {
  const { gameName, tagLine, region } = req.body;
  const RIOT_API_KEY = process.env.RIOT_API_KEY;

  if (!gameName || !tagLine || !region) {
    return res.status(400).json({ message: 'Faltan datos requeridos.' });
  }

  console.log(`[POST] Intentando añadir/actualizar: ${gameName}#${tagLine} en ${region}`);

  try {
    // 1. Mapear región
    const routingMap = {
      la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
      euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
      kr: 'asia', jp1: 'asia',
      oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
    };
    const routing = routingMap[region] || 'americas';
    console.log(`[DEBUG] Routing: ${routing}`);

    // 2. PUUID
    const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`;
    console.log(`[DEBUG] Llamando Account-V1: ${accountUrl.replace(RIOT_API_KEY, 'HIDDEN')}`);
    const accountResp = await fetch(accountUrl);
    console.log(`[DEBUG] Status Account-V1: ${accountResp.status}`);
    
    if (!accountResp.ok) {
      return res.status(accountResp.status).json({ message: 'No se encontró la cuenta en Riot Games.' });
    }
    const accountData = await accountResp.json();
    console.log(`[DEBUG] PUUID obtenido: ${accountData.puuid}`);

    // 3. Summoner-V4
    const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${accountData.puuid}?api_key=${RIOT_API_KEY}`;
    console.log(`[DEBUG] Llamando Summoner-V4: ${summonerUrl.replace(RIOT_API_KEY, 'HIDDEN')}`);
    const summonerResp = await fetch(summonerUrl);
    console.log(`[DEBUG] Status Summoner-V4: ${summonerResp.status}`);
    
    let summonerLevel = 0;
    let profileIconId = 29;
    let summonerId = '';

    if (summonerResp.ok) {
      const summonerData = await summonerResp.json();
      summonerLevel = summonerData.summonerLevel;
      profileIconId = summonerData.profileIconId;
      summonerId = summonerData.id;
      console.log(`[DEBUG] Datos Summoner: Nivel ${summonerLevel}, Icon ${profileIconId}`);
    }

    // 4. League-V4
    let soloQ = { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 };
    if (summonerId) {
      const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}?api_key=${RIOT_API_KEY}`;
      console.log(`[DEBUG] Llamando League-V4: ${leagueUrl.replace(RIOT_API_KEY, 'HIDDEN')}`);
      const leagueResp = await fetch(leagueUrl);
      console.log(`[DEBUG] Status League-V4: ${leagueResp.status}`);
      
      if (leagueResp.ok) {
        const leagues = await leagueResp.json();
        console.log(`[DEBUG] Ligas encontradas: ${leagues.length}`);
        const soloQEntry = leagues.find(e => e.queueType === 'RANKED_SOLO_5x5');
        if (soloQEntry) {
          soloQ = {
            tier: soloQEntry.tier,
            rank: soloQEntry.rank,
            leaguePoints: soloQEntry.leaguePoints,
            wins: soloQEntry.wins,
            losses: soloQEntry.losses
          };
          console.log(`[DEBUG] SoloQ detectado: ${soloQ.tier} ${soloQ.rank}`);
        }
      }
    }

    // 5. Verificar si ya existe en nuestra DB
    const existing = await db.collection('accounts').findOne({ puuid: accountData.puuid });
    
    if (existing) {
      // Si ya existe, actualizamos todo el kit
      await db.collection('accounts').updateOne(
        { puuid: accountData.puuid },
        { $set: { summonerLevel, profileIconId, soloQ, lastUpdated: new Date() } }
      );
      return res.json({ message: '✅ Datos del jugador actualizados.' });
    }

    // 6. Crear documento base con datos reales completos
    const newAccount = {
      puuid: accountData.puuid,
      gameName: accountData.gameName,
      tagLine: accountData.tagLine,
      region: region,
      profileIconId: profileIconId,
      summonerLevel: summonerLevel,
      soloQ: soloQ,
      lastUpdated: new Date()
    };

    await db.collection('accounts').insertOne(newAccount);
    res.json({ message: '✅ Jugador añadido correctamente.' });

  } catch (error) {
    console.error('Error in /api/summoners:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Obtener Invocador Individual
app.get('/api/summoners/:puuid', async (req, res) => {
  const { puuid } = req.params;
  try {
    const account = await db.collection('accounts').findOne({ puuid: puuid });
    if (!account) {
      return res.status(404).json({ message: 'Jugador no encontrado.' });
    }
    res.json(account);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Eliminar Invocador
app.delete('/api/summoners/:puuid', async (req, res) => {
  const { puuid } = req.params;

  try {
    const result = await db.collection('accounts').deleteOne({ puuid: puuid });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Jugador no encontrado.' });
    }

    res.json({ message: '✅ Jugador eliminado de la jauría.' });
  } catch (error) {
    console.error('Error in DELETE /api/summoners:', error);
    res.status(500).json({ message: 'Error al eliminar al jugador.' });
  }
});

// Servir activos del bot
app.use('/assets', express.static(path.join(__dirname, 'bot discord', 'assets')));

// --- Servir Frontend (Vite Build) ---
app.use(express.static(path.join(__dirname, 'web', 'dist')));

// Ruta catch-all para la SPA (debe ir al final de todos los endpoints)
app.get('*', (req, res, next) => {
  // Si la ruta empieza por /api o /assets, no la servimos como index.html
  if (req.url.startsWith('/api') || req.url.startsWith('/assets')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'web', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 API Server V2 (Regions) listo en http://localhost:${PORT}`);
});
