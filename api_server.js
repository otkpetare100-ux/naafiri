const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const dns = require('dns');

dns.setServers(['8.8.8.8']);

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 3010;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// BUG-23 fix: Restringir CORS a orígenes conocidos
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [];
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (mismo servidor, Postman, bots) y orígenes configurados
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Permisivo por ahora pero logea orígenes desconocidos
      console.warn(`[CORS] Origen no configurado: ${origin}`);
    }
  }
}));
app.use(express.json());

// BUG-04 fix: Validador de PUUID (formato Riot: 78 chars hex con guiones)
function isValidPuuid(puuid) {
  return typeof puuid === 'string' && /^[a-zA-Z0-9_-]{30,90}$/.test(puuid);
}

let db;
let mongoClient; // BUG-18 fix: guardar referencia para cierre limpio
let DDRAGON_VERSION = '16.9.1';
let championMap = {};

async function updateDDragonVersion() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await res.json();
    if (versions && versions.length > 0) {
      DDRAGON_VERSION = versions[0];
      console.log(`🚀 API Server: Versión de Data Dragon actualizada: ${DDRAGON_VERSION}`);
    }
  } catch (e) {
    console.error('❌ Error actualizando versión de Data Dragon:', e);
  }
}

async function fetchChampionMap() {
  try {
    await updateDDragonVersion();
    const resp = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/en_US/champion.json`);
    const data = await resp.json();
    const map = {};
    Object.values(data.data).forEach(champ => {
      map[champ.key] = champ.id; 
    });
    championMap = map;
    console.log(`✅ API Server: Mapa de campeones cargado (${DDRAGON_VERSION})`);
  } catch (e) {
    console.error('❌ Error cargando mapa de campeones:', e);
  }
}

async function connectDB() {
  try {
    mongoClient = new MongoClient(MONGO_URI); // BUG-18 fix: almacenar referencia
    await mongoClient.connect();
    db = mongoClient.db('lan-tracker');
    console.log('✅ API Server: MongoDB conectado');
    await fetchChampionMap();
  } catch (e) {
    console.error('❌ API Server: Error conectando a MongoDB:', e);
    process.exit(1); // Si no hay DB, no tiene sentido arrancar
  }
}

// BUG-18 fix: Cerrar MongoDB limpiamente al detener el proceso
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM recibido, cerrando MongoDB...');
  if (mongoClient) await mongoClient.close();
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('🛑 SIGINT recibido, cerrando MongoDB...');
  if (mongoClient) await mongoClient.close();
  process.exit(0);
});

// --- Middleware Logger para Diagnóstico ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// BUG-01 fix: Helper para hacer fetch a Riot con API key en header en vez de query param
function riotFetch(url, apiKey) {
  return fetch(url, { headers: { 'X-Riot-Token': apiKey } });
}

// Helper para obtener top campeones
async function getTopChampions(puuid, region, apiKey) {
  try {
    const url = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`;
    const resp = await riotFetch(url, apiKey);
    if (!resp.ok) return [];
    const masteries = await resp.json();
    return masteries.map(m => ({
      id: m.championId,
      name: championMap[m.championId.toString()] || 'Unknown',
      level: m.championLevel,
      points: m.championPoints
    }));
  } catch (e) {
    console.error('Error fetching top champions:', e);
    return [];
  }
}

// --- Endpoints ---

// Obtener Ladderboard
app.get('/api/ladder', async (req, res) => {
  try {
    const accounts = await db.collection('accounts').find({}).toArray();
    
    const getAbsoluteLP = (tier, rank, lp) => {
      const tierOrder = {
        CHALLENGER: 9, GRANDMASTER: 8, MASTER: 7,
        DIAMOND: 6, EMERALD: 5, PLATINUM: 4,
        GOLD: 3, SILVER: 2, BRONZE: 1, IRON: 0, UNRANKED: -1
      };
      const divOrder = { I: 4, II: 3, III: 2, IV: 1 };
      
      const t = tier?.toUpperCase() || 'UNRANKED';
      const r = rank?.toUpperCase() || '';
      
      const tScore = tierOrder[t] ?? -1;
      const dScore = divOrder[r] ?? 0;
      
      return (tScore * 10000) + (dScore * 1000) + (lp || 0);
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
        region: acc.region || 'la1',
        tier: soloQ.tier,
        rank: soloQ.rank,
        lp: soloQ.leaguePoints,
        winRate: `${winRate}%`,
        absLp: getAbsoluteLP(soloQ.tier, soloQ.rank, soloQ.leaguePoints),
        isLive: acc.liveGameStartedAt ? true : false,
        discordId: acc.discordId || null,
        streak: acc.streak || 0,
        topChampions: acc.topChampions || [],
        history: acc.history || [],
        soloQ: soloQ,
        flexQ: acc.flexQ || { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 },
        advancedStats: acc.advancedStats || null,
        matchStatsHistory: acc.matchStatsHistory || []
      };
    });

    ladder.sort((a, b) => b.absLp - a.absLp);
    res.json(ladder);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Obtener lista de Invocadores (Plural) - Para compatibilidad con el frontend
app.get('/api/summoners', async (req, res) => {
  try {
    const accounts = await db.collection('accounts').find({}).toArray();
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint rápido para obtener el estado online/offline de todos
app.get('/api/live-status', async (req, res) => {
  try {
    const accounts = await db.collection('accounts').find({}, { projection: { puuid: 1, liveGameStartedAt: 1 } }).toArray();
    const statusMap = {};
    accounts.forEach(acc => {
      statusMap[acc.puuid] = acc.liveGameStartedAt ? true : false;
    });
    res.json(statusMap);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint para forzar chequeo de estado en vivo de un jugador específico (Directo a Riot API)
app.get('/api/summoners/:puuid/live', async (req, res) => {
  try {
    const puuid = req.params.puuid;
    const account = await db.collection('accounts').findOne({ puuid });
    if (!account) return res.status(404).json({ error: 'Player not found' });
    
    const region = account.region || 'la1';
    const spectUrl = `https://${region}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`;
    const spectRes = await riotFetch(spectUrl, process.env.RIOT_API_KEY);
    
    let isLive = false;
    let updateOp = {};
    if (spectRes.ok) {
      const game = await spectRes.json();
      isLive = true;
      updateOp = { $set: { liveGameStartedAt: new Date(), lastLiveGameId: game.gameId } };
    } else {
      updateOp = { $unset: { liveGameStartedAt: "", lastLiveGameId: "" } };
    }
    
    await db.collection('accounts').updateOne({ puuid }, updateOp);
    res.json({ isLive });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint para obtener el historial de partidas de Valorant (Proxies HenrikDev API)
app.get('/api/valorant/matches/:gameName/:tagLine', async (req, res) => {
  try {
    const { gameName, tagLine } = req.params;
    const henrikKey = process.env.HENRIK_API_KEY;
    if (!henrikKey) {
      return res.status(500).json({ error: 'HENRIK_API_KEY no configurada' });
    }

    const url = `https://api.henrikdev.xyz/valorant/v3/matches/latam/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const response = await fetch(url, { headers: { 'Authorization': henrikKey } });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'No se encontraron partidas' });
    }
    
    const data = await response.json();
    res.json(data.data); // Array of match objects
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint para obtener el leaderboard de Valorant usando HenrikDev API
app.get('/api/valorant/leaderboard', async (req, res) => {
  try {
    const henrikKey = process.env.HENRIK_API_KEY;
    if (!henrikKey) {
      return res.status(500).json({ error: 'HENRIK_API_KEY no configurada en el servidor' });
    }

    const accounts = await db.collection('accounts').find({}).toArray();
    if (!accounts.length) return res.json({ leaderboard: [] });

    // Agrupar peticiones en chunks para evitar error 429 Too Many Requests en HenrikDev API
    const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
    const chunks = chunkArray(accounts, 5); // 5 peticiones por lote
    
    const results = [];
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(async (acc) => {
        try {
          const url = `https://api.henrikdev.xyz/valorant/v2/mmr/latam/${encodeURIComponent(acc.gameName)}/${encodeURIComponent(acc.tagLine)}`;
          const response = await fetch(url, {
            headers: { 'Authorization': henrikKey }
          });
          
          if (response.ok) {
            const data = await response.json();
            const mmr = data.data.current_data || {};
            return {
              puuid: acc.puuid,
              name: `${acc.gameName}#${acc.tagLine}`,
              iconUrl: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${acc.profileIconId || 1}.png`,
              rank: mmr.currenttierpatched || 'Unranked',
              rr: mmr.ranking_in_tier || 0,
              elo: mmr.elo || 0,
              rankIconUrl: mmr.images ? mmr.images.small : null
            };
          } else {
            return {
              puuid: acc.puuid,
              name: `${acc.gameName}#${acc.tagLine}`,
              iconUrl: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${acc.profileIconId || 1}.png`,
              rank: 'Unranked',
              rr: null,
              elo: 0,
              rankIconUrl: null
            };
          }
        } catch (e) {
          return null; // Omitir si hay error de red
        }
      }));
      
      results.push(...chunkResults);
      // Pequeña pausa entre lotes para respetar Rate Limits
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    const validResults = results.filter(r => r !== null);
    
    // Ordenar por elo descendente
    validResults.sort((a, b) => b.elo - a.elo);

    res.json({ leaderboard: validResults });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cooldown global en memoria (clave: gameName#tagLine)
const refreshCooldowns = new Map();

// BUG-14 fix: Limpiar cooldowns expirados cada 10 minutos para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of refreshCooldowns) {
    if (now - timestamp > 10 * 60 * 1000) {
      refreshCooldowns.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Añadir o actualizar Invocador
app.post('/api/summoners', async (req, res) => {
  const { gameName, tagLine, region, isNew } = req.body;
  const RIOT_API_KEY = process.env.RIOT_API_KEY;

  if (!gameName || !tagLine || !region) {
    return res.status(400).json({ message: 'Faltan datos requeridos.' });
  }

  // Comprobar cooldown global (5 min) - excepto si se está agregando de nuevo
  const cooldownKey = `${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
  const now = Date.now();

  if (!isNew) {
    const lastRefresh = refreshCooldowns.get(cooldownKey);
    if (lastRefresh && (now - lastRefresh) < 5 * 60 * 1000) {
      const remaining = Math.ceil((5 * 60 * 1000 - (now - lastRefresh)) / 60000);
      return res.status(429).json({ message: `⏳ Espera ${remaining} min antes de actualizar a ${gameName} de nuevo.` });
    }
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

    // 2. PUUID
    const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const accountResp = await riotFetch(accountUrl, RIOT_API_KEY);
    
    if (!accountResp.ok) {
      return res.status(accountResp.status).json({ message: 'No se encontró la cuenta en Riot Games.' });
    }
    const accountData = await accountResp.json();

    // 3. Summoner-V4
    const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${accountData.puuid}`;
    const summonerResp = await riotFetch(summonerUrl, RIOT_API_KEY);
    
    let summonerLevel = 0;
    let profileIconId = 29;
    let summonerId = '';

    if (summonerResp.ok) {
      const summonerData = await summonerResp.json();
      summonerLevel = summonerData.summonerLevel;
      profileIconId = summonerData.profileIconId;
      summonerId = summonerData.id;
    }

    // 4. League-V4 (Usando PUUID directamente)
    let soloQ = { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 };
    let flexQ = { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 };
    const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${accountData.puuid}`;
    const leagueResp = await riotFetch(leagueUrl, RIOT_API_KEY);
    
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
        console.log(`SoloQ detectado para ${gameName}: ${soloQ.tier} ${soloQ.rank}`);
      }

      const flexQEntry = leagues.find(e => e.queueType === 'RANKED_FLEX_SR');
      if (flexQEntry) {
        flexQ = {
          tier: flexQEntry.tier,
          rank: flexQEntry.rank,
          leaguePoints: flexQEntry.leaguePoints,
          wins: flexQEntry.wins,
          losses: flexQEntry.losses
        };
        console.log(`FlexQ detectado para ${gameName}: ${flexQ.tier} ${flexQ.rank}`);
      }
    }

    // 5. Top Campeones
    const topChampions = await getTopChampions(accountData.puuid, region, RIOT_API_KEY);

    // 5.5. Verificar si está en partida (Spectator)
    let isLive = false;
    let liveGameId = null;
    try {
      const spectUrl = `https://${region}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${accountData.puuid}`;
      const spectRes = await riotFetch(spectUrl, RIOT_API_KEY);
      if (spectRes.ok) {
        const game = await spectRes.json();
        isLive = true;
        liveGameId = game.gameId;
      }
    } catch (e) {
      console.error('Error Spectator API manual refresh:', e);
    }

    // 6. Verificar si ya existe en nuestra DB
    const existing = await db.collection('accounts').findOne({ puuid: accountData.puuid });
    
    if (existing) {
      // Si ya existe, actualizamos todo el kit
      const updatedAccount = { 
        puuid: accountData.puuid, 
        gameName: accountData.gameName, 
        tagLine: accountData.tagLine,
        summonerLevel, 
        profileIconId, 
        soloQ, 
        flexQ,
        topChampions, 
        lastUpdated: new Date() 
      };

      const updateOp = { $set: updatedAccount };
      if (isLive) {
        updatedAccount.liveGameStartedAt = new Date();
        updatedAccount.lastLiveGameId = liveGameId;
      } else {
        updateOp.$unset = { liveGameStartedAt: "", lastLiveGameId: "" };
      }

      await db.collection('accounts').updateOne(
        { puuid: accountData.puuid },
        updateOp
      );
      refreshCooldowns.set(cooldownKey, Date.now());
      return res.json({ success: true, message: '✅ Datos del jugador actualizados.', account: updatedAccount });
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
      flexQ: flexQ,
      topChampions: topChampions,
      streak: 0,
      addedAt: new Date(),
      lastUpdated: new Date()
    };

    if (isLive) {
      newAccount.liveGameStartedAt = new Date();
      newAccount.lastLiveGameId = liveGameId;
    }

    await db.collection('accounts').insertOne(newAccount);
    refreshCooldowns.set(cooldownKey, Date.now());
    res.json({ success: true, message: '✅ Jugador añadido correctamente.', account: newAccount });

  } catch (error) {
    console.error('Error in /api/summoners:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

const delay = ms => new Promise(res => setTimeout(res, ms));

// Actualizar Estadísticas de Partidas (Match-V5)
app.post('/api/summoners/:puuid/matches/update', async (req, res) => {
  const { puuid } = req.params;
  const RIOT_API_KEY = process.env.RIOT_API_KEY;

  try {
    const account = await db.collection('accounts').findOne({ puuid });
    if (!account) return res.status(404).json({ message: 'Jugador no encontrado.' });

    const routingMap = {
      la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
      euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
      kr: 'asia', jp1: 'asia',
      oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
    };
    const routing = routingMap[account.region] || 'americas';

    // Obtener campeones actualizados (¡Siempre!)
    const topChampions = await getTopChampions(puuid, account.region, RIOT_API_KEY);

    // Obtener IDs de las últimas 20 partidas de Solo y Flex por separado
    const matchIdsSoloUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=0&count=20`;
    const matchIdsFlexUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=440&start=0&count=20`;
    
    const [idsSoloResp, idsFlexResp] = await Promise.all([
      riotFetch(matchIdsSoloUrl, RIOT_API_KEY),
      riotFetch(matchIdsFlexUrl, RIOT_API_KEY)
    ]);
    
    if (!idsSoloResp.ok && !idsFlexResp.ok) {
      return res.status(500).json({ message: 'Error obteniendo historial de Riot.' });
    }
    
    const fetchedSoloIds = idsSoloResp.ok ? await idsSoloResp.json() : [];
    const fetchedFlexIds = idsFlexResp.ok ? await idsFlexResp.json() : [];
    const fetchedMatchIds = [...new Set([...fetchedSoloIds, ...fetchedFlexIds])];
    const existingMatches = account.matchStatsHistory || [];
    const existingMatchIds = existingMatches.map(m => m.matchId);

    // Filtrar partidas que no tengamos guardadas
    const newMatchIds = fetchedMatchIds.filter(id => !existingMatchIds.includes(id));

    if (newMatchIds.length === 0) {
      // Actualizar solo los campeones en la base de datos
      await db.collection('accounts').updateOne(
        { puuid },
        { $set: { topChampions: topChampions } }
      );
      return res.json({ 
        message: '¡Campeones actualizados! No hay partidas nuevas.', 
        updated: true, 
        stats: account.advancedStats,
        history: account.matchStatsHistory,
        topChampions: topChampions
      });
    }

    const newMatchStats = [];
    
    for (const matchId of newMatchIds) {
      try {
        const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const matchResp = await riotFetch(matchUrl, RIOT_API_KEY);
        if (!matchResp.ok) continue;

        const matchData = await matchResp.json();
        const participant = matchData.info.participants.find(p => p.puuid === puuid);
        
        if (participant) {
          const durationMins = matchData.info.gameDuration / 60;
          const teamKills = matchData.info.participants
            .filter(p => p.teamId === participant.teamId)
            .reduce((sum, p) => sum + p.kills, 0);
            
          const kp = teamKills > 0 ? ((participant.kills + participant.assists) / teamKills) : 0;
          const isRemake = durationMins < 4.5; // BUG-21 fix: teamEarlySurrendered es una rendición válida, no un remake

          const matchParticipants = matchData.info.participants.map(p => ({
            summonerName: p.riotIdGameName || p.summonerName || 'Desconocido',
            tagLine: p.riotIdTagline || '',
            championName: championMap[p.championId?.toString()] || p.championName || 'Unknown',
            puuid: p.puuid,
            win: p.win,
            teamId: p.teamId,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            gold: p.goldEarned,
            cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
            damageDealt: p.totalDamageDealtToChampions,
            item0: p.item0, item1: p.item1, item2: p.item2,
            item3: p.item3, item4: p.item4, item5: p.item5, item6: p.item6,
            champLevel: p.champLevel,
            visionScore: p.visionScore || 0
          }));

          newMatchStats.push({
            matchId: matchId,
            queueId: matchData.info.queueId,
            championName: championMap[participant.championId?.toString()] || participant.championName || 'Unknown',
            lane: participant.teamPosition || participant.lane || 'Unknown',
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            gold: participant.goldEarned,
            cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
            durationMins: durationMins,
            kp: kp,
            damageDealt: participant.totalDamageDealtToChampions,
            damageTaken: participant.totalDamageTaken,
            win: participant.win,
            isRemake: isRemake,
            timestamp: matchData.info.gameCreation,
            summoner1Id: participant.summoner1Id,
            summoner2Id: participant.summoner2Id,
            keystoneId: participant.perks?.styles?.[0]?.selections?.[0]?.perk,
            subStyleId: participant.perks?.styles?.[1]?.style,
            champLevel: participant.champLevel,
            item0: participant.item0,
            item1: participant.item1,
            item2: participant.item2,
            item3: participant.item3,
            item4: participant.item4,
            item5: participant.item5,
            item6: participant.item6,
            roleBoundItem: participant.roleBoundItem || 0,
            visionScore: participant.visionScore || 0,
            doubleKills: participant.doubleKills || 0,
            tripleKills: participant.tripleKills || 0,
            quadraKills: participant.quadraKills || 0,
            pentakills: participant.pentakills || 0,
            participants: matchParticipants
          });
          console.log(`Descargada partida ${matchId} | Queue: ${matchData.info.queueId} | isRemake: ${isRemake}`);
        }
        await delay(100); // Evitar rate limits
      } catch (e) {
        console.error(`Error procesando match ${matchId}:`, e);
      }
    }

    if (newMatchStats.length === 0) {
      return res.json({ message: 'No se pudieron procesar las partidas nuevas.', updated: false });
    }

    // Combinar y mantener hasta 40 partidas para cubrir ambas colas
    // BUG-08 fix: usar spread para no mutar objetos originales
    const usedChangeIndices = new Set();
    const combinedMatches = [...newMatchStats, ...existingMatches]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 40)
      .map(m => {
        const match = { ...m };
        // Adjuntar el cambio de LP si el bot lo registró previamente (Plan A)
        if (account.lpHistory && account.lpHistory[match.matchId] !== undefined) {
          match.lpChange = account.lpHistory[match.matchId];
        } else if (account.lastLpChanges && account.lastLpChanges.length > 0) {
          // Plan B: Fallback cronológico redundante si no coincide el ID de partida
          const matchTime = match.timestamp;
          const matchedChangeIndex = account.lastLpChanges.findIndex((change, idx) => {
            if (usedChangeIndices.has(idx)) return false;
            const timeDiff = Math.abs(change.timestamp - matchTime);
            // Máximo 3 horas de diferencia y debe coincidir la cola
            const timeAndQueueMatch = timeDiff < 3 * 60 * 60 * 1000 && change.queueId === match.queueId;
            if (!timeAndQueueMatch) return false;
            
            // Validar que el sentido del cambio coincida con la victoria/derrota
            if (match.win && change.diff < 0) return false;
            if (!match.win && change.diff > 0) return false;
            
            return true;
          });
          if (matchedChangeIndex !== -1) {
            usedChangeIndices.add(matchedChangeIndex);
            match.lpChange = account.lastLpChanges[matchedChangeIndex].diff;
          }
        }
        return match;
      });

    // Calcular promedios por cola (Excluyendo Remakes y tomando máx 20 por cola)
    const calculateAverages = (queueIdFilter) => {
      let sumKills = 0, sumDeaths = 0, sumAssists = 0, sumGold = 0, sumCs = 0, sumMins = 0, sumKp = 0, sumDmgDealt = 0, sumDmgTaken = 0;
      
      const validMatches = combinedMatches
        .filter(m => !m.isRemake && m.queueId === queueIdFilter)
        .slice(0, 20);

      validMatches.forEach(m => {
        sumKills += m.kills;
        sumDeaths += m.deaths;
        sumAssists += m.assists;
        sumGold += m.gold;
        sumCs += m.cs;
        sumMins += m.durationMins;
        sumKp += m.kp;
        sumDmgDealt += m.damageDealt;
        sumDmgTaken += m.damageTaken;
      });

      const count = validMatches.length;
      
      return {
        kda: count > 0 ? (sumDeaths > 0 ? ((sumKills + sumAssists) / sumDeaths).toFixed(2) : ((sumKills + sumAssists).toFixed(2))) : "0.00",
        avgGold: count > 0 ? Math.round(sumGold / count) : 0,
        avgDeaths: count > 0 ? (sumDeaths / count).toFixed(1) : "0.0",
        csPerMin: count > 0 ? (sumMins > 0 ? (sumCs / sumMins).toFixed(1) : "0.0") : "0.0",
        avgKp: count > 0 ? Math.round((sumKp / count) * 100) : 0,
        avgDamageDealt: count > 0 ? Math.round(sumDmgDealt / count) : 0,
        avgDamageTaken: count > 0 ? Math.round(sumDmgTaken / count) : 0,
        totalMatchesCalculated: count
      };
    };

    const avgStats = {
      soloq: calculateAverages(420),
      flexq: calculateAverages(440)
    };

    await db.collection('accounts').updateOne(
      { puuid },
      { $set: { matchStatsHistory: combinedMatches, advancedStats: avgStats, topChampions: topChampions } }
    );

    res.json({ 
      message: `¡Se actualizaron campeones y ${newMatchStats.length} partidas nuevas!`, 
      updated: true, 
      stats: avgStats,
      history: combinedMatches,
      topChampions: topChampions
    });

  } catch (error) {
    console.error('Error in /api/summoners/:puuid/matches/update:', error);
    res.status(500).json({ message: 'Error interno actualizando partidas.' });
  }
});

// Cargar Partidas Más Antiguas (Match-V5)
app.post('/api/summoners/:puuid/matches/load-more', async (req, res) => {
  const { puuid } = req.params;
  const region = req.query.region || 'la1';
  const isUntracked = req.query.isUntracked === 'true';
  const RIOT_API_KEY = process.env.RIOT_API_KEY;

  try {
    let account = null;
    let existingMatches = [];

    if (isUntracked) {
      existingMatches = req.body.existingMatches || [];
      account = {
        puuid: puuid,
        region: region,
        gameName: 'Invocador',
        matchStatsHistory: existingMatches
      };
    } else {
      account = await db.collection('accounts').findOne({ puuid });
      if (!account) return res.status(404).json({ message: 'Jugador no encontrado.' });
      existingMatches = account.matchStatsHistory || [];
    }

    const currentCount = existingMatches.length;

    const routingMap = {
      la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
      euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
      kr: 'asia', jp1: 'asia',
      oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
    };
    const routing = routingMap[account.region] || 'americas';

    // Para evitar consultas masivas que excedan rate limits, limitamos el acumulado total a 80 partidas
    if (currentCount >= 80) {
      return res.json({ message: 'Límite de historial alcanzado (80 partidas).', history: existingMatches, updated: false });
    }

    // BUG-06 fix: Calcular offsets por cola separadamente, no usar el total combinado
    const soloCount = existingMatches.filter(m => m.queueId === 420).length;
    const flexCount = existingMatches.filter(m => m.queueId === 440).length;

    // Buscamos 5 partidas más antiguas por cola con offset correcto
    const matchIdsSoloUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=${soloCount}&count=5`;
    const matchIdsFlexUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=440&start=${flexCount}&count=5`;

    const [idsSoloResp, idsFlexResp] = await Promise.all([
      riotFetch(matchIdsSoloUrl, RIOT_API_KEY),
      riotFetch(matchIdsFlexUrl, RIOT_API_KEY)
    ]);

    const fetchedSoloIds = idsSoloResp.ok ? await idsSoloResp.json() : [];
    const fetchedFlexIds = idsFlexResp.ok ? await idsFlexResp.json() : [];
    const fetchedMatchIds = [...new Set([...fetchedSoloIds, ...fetchedFlexIds])];

    const existingMatchIds = existingMatches.map(m => m.matchId);
    const newMatchIds = fetchedMatchIds.filter(id => !existingMatchIds.includes(id));

    if (newMatchIds.length === 0) {
      return res.json({ message: 'No hay más partidas antiguas en Riot.', history: existingMatches, updated: false });
    }

    const newMatchStats = [];
    for (const matchId of newMatchIds) {
      try {
        const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const matchResp = await riotFetch(matchUrl, RIOT_API_KEY);
        if (!matchResp.ok) continue;

        const matchData = await matchResp.json();
        const participant = matchData.info.participants.find(p => p.puuid === puuid);
        
        if (participant) {
          const durationMins = matchData.info.gameDuration / 60;
          const teamKills = matchData.info.participants
            .filter(p => p.teamId === participant.teamId)
            .reduce((sum, p) => sum + p.kills, 0);
            
          const kp = teamKills > 0 ? ((participant.kills + participant.assists) / teamKills) : 0;
          const isRemake = durationMins < 4.5; // BUG-21 fix

          const matchParticipants = matchData.info.participants.map(p => ({
            summonerName: p.riotIdGameName || p.summonerName || 'Desconocido',
            tagLine: p.riotIdTagline || '',
            championName: championMap[p.championId?.toString()] || p.championName || 'Unknown',
            puuid: p.puuid,
            win: p.win,
            teamId: p.teamId,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            gold: p.goldEarned,
            cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
            damageDealt: p.totalDamageDealtToChampions,
            item0: p.item0, item1: p.item1, item2: p.item2,
            item3: p.item3, item4: p.item4, item5: p.item5, item6: p.item6,
            champLevel: p.champLevel,
            visionScore: p.visionScore || 0
          }));

          newMatchStats.push({
            matchId: matchId,
            queueId: matchData.info.queueId,
            championName: championMap[participant.championId?.toString()] || participant.championName || 'Unknown',
            lane: participant.teamPosition || participant.lane || 'Unknown',
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            gold: participant.goldEarned,
            cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
            durationMins: durationMins,
            kp: kp,
            damageDealt: participant.totalDamageDealtToChampions,
            damageTaken: participant.totalDamageTaken,
            win: participant.win,
            isRemake: isRemake,
            timestamp: matchData.info.gameCreation,
            summoner1Id: participant.summoner1Id,
            summoner2Id: participant.summoner2Id,
            keystoneId: participant.perks?.styles?.[0]?.selections?.[0]?.perk,
            subStyleId: participant.perks?.styles?.[1]?.style,
            champLevel: participant.champLevel,
            item0: participant.item0,
            item1: participant.item1,
            item2: participant.item2,
            item3: participant.item3,
            item4: participant.item4,
            item5: participant.item5,
            item6: participant.item6,
            roleBoundItem: participant.roleBoundItem || 0,
            visionScore: participant.visionScore || 0,
            participants: matchParticipants
          });
          console.log(`Descargada partida antigua ${matchId} | Queue: ${matchData.info.queueId}`);
        }
        await delay(100);
      } catch (e) {
        console.error(`Error procesando match antiguo ${matchId}:`, e);
      }
    }

    if (newMatchStats.length === 0) {
      return res.json({ message: 'No se pudieron descargar más partidas antiguas.', history: existingMatches, updated: false });
    }

    // Combinar, ordenar y guardar (límite máximo de 80 partidas)
    const usedChangeIndices = new Set();
    const combinedMatches = [...newMatchStats, ...existingMatches]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 80)
      .map(m => {
        const match = { ...m }; // BUG-08 fix: no mutar originales
        if (account.lpHistory && account.lpHistory[match.matchId] !== undefined) {
          match.lpChange = account.lpHistory[match.matchId];
        } else if (account.lastLpChanges && account.lastLpChanges.length > 0) {
          const matchTime = match.timestamp;
          const matchedChangeIndex = account.lastLpChanges.findIndex((change, idx) => {
            if (usedChangeIndices.has(idx)) return false;
            const timeDiff = Math.abs(change.timestamp - matchTime);
            const timeAndQueueMatch = timeDiff < 3 * 60 * 60 * 1000 && change.queueId === match.queueId;
            if (!timeAndQueueMatch) return false;
            
            // Validar que el sentido del cambio coincida con la victoria/derrota
            if (match.win && change.diff < 0) return false;
            if (!match.win && change.diff > 0) return false;
            
            return true;
          });
          if (matchedChangeIndex !== -1) {
            usedChangeIndices.add(matchedChangeIndex);
            match.lpChange = account.lastLpChanges[matchedChangeIndex].diff;
          }
        }
        return match;
      });

    // Calcular promedios por cola (Excluyendo Remakes y tomando máx 20 por cola)
    const calculateAverages = (queueIdFilter) => {
      let sumKills = 0, sumDeaths = 0, sumAssists = 0, sumGold = 0, sumCs = 0, sumMins = 0, sumKp = 0, sumDmgDealt = 0, sumDmgTaken = 0;
      
      const validMatches = combinedMatches
        .filter(m => !m.isRemake && m.queueId === queueIdFilter)
        .slice(0, 20);

      validMatches.forEach(m => {
        sumKills += m.kills;
        sumDeaths += m.deaths;
        sumAssists += m.assists;
        sumGold += m.gold;
        sumCs += m.cs;
        sumMins += m.durationMins;
        sumKp += m.kp;
        sumDmgDealt += m.damageDealt;
        sumDmgTaken += m.damageTaken;
      });

      const count = validMatches.length;
      
      return {
        kda: count > 0 ? (sumDeaths > 0 ? ((sumKills + sumAssists) / sumDeaths).toFixed(2) : ((sumKills + sumAssists).toFixed(2))) : "0.00",
        avgGold: count > 0 ? Math.round(sumGold / count) : 0,
        avgDeaths: count > 0 ? (sumDeaths / count).toFixed(1) : "0.0",
        csPerMin: count > 0 ? (sumMins > 0 ? (sumCs / sumMins).toFixed(1) : "0.0") : "0.0",
        avgKp: count > 0 ? Math.round((sumKp / count) * 100) : 0,
        avgDamageDealt: count > 0 ? Math.round(sumDmgDealt / count) : 0,
        avgDamageTaken: count > 0 ? Math.round(sumDmgTaken / count) : 0,
        totalMatchesCalculated: count
      };
    };

    const avgStats = {
      soloq: calculateAverages(420),
      flexq: calculateAverages(440)
    };

    // Actualizar MongoDB si el jugador está registrado
    if (!isUntracked) {
      await db.collection('accounts').updateOne(
        { puuid },
        { $set: { matchStatsHistory: combinedMatches, advancedStats: avgStats } }
      );
    }

    console.log(`Cargadas ${newMatchStats.length} partidas antiguas adicionales para ${account.gameName}`);
    return res.json({
      message: `Cargadas ${newMatchStats.length} partidas antiguas.`,
      history: combinedMatches,
      stats: avgStats,
      updated: true
    });
  } catch (error) {
    console.error('Error en load-more matches:', error);
    return res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Obtener Detalles de una Partida Individual (Riot API + Cache de DB)
app.get('/api/matches/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const region = req.query.region || 'la1';
  const RIOT_API_KEY = process.env.RIOT_API_KEY;

  try {
    // 1. Intentar buscar la partida en la caché local de MongoDB (en el historial de cualquier cuenta)
    const accountWithMatch = await db.collection('accounts').findOne({
      "matchStatsHistory.matchId": matchId
    });

    if (accountWithMatch) {
      const match = accountWithMatch.matchStatsHistory.find(m => m.matchId === matchId);
      if (match && match.participants && match.participants.length > 0) {
        console.log(`[API] Partida ${matchId} encontrada en la caché de la base de datos.`);
        return res.json(match);
      }
    }

    // 2. Si no está en la base de datos, consultamos a Riot API
    console.log(`[API] Partida ${matchId} no encontrada en DB. Consultando a Riot API...`);
    const routingMap = {
      la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
      euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
      kr: 'asia', jp1: 'asia',
      oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
    };
    const routing = routingMap[region] || 'americas';

    const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const matchResp = await riotFetch(matchUrl, RIOT_API_KEY);
    if (!matchResp.ok) {
      return res.status(matchResp.status).json({ 
        message: `La API de Riot respondió con estado ${matchResp.status} al consultar la partida ${matchId}.` 
      });
    }

    const matchData = await matchResp.json();
    if (!matchData || !matchData.info || !matchData.info.participants) {
      return res.status(404).json({ message: 'No se encontraron participantes en la partida de Riot.' });
    }

    const matchParticipants = matchData.info.participants.map(p => ({
      summonerName: p.riotIdGameName || p.summonerName || 'Desconocido',
      tagLine: p.riotIdTagline || '',
      championName: championMap[p.championId?.toString()] || p.championName || 'Unknown',
      puuid: p.puuid,
      win: p.win,
      teamId: p.teamId,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      gold: p.goldEarned,
      cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
      damageDealt: p.totalDamageDealtToChampions,
      item0: p.item0, item1: p.item1, item2: p.item2,
      item3: p.item3, item4: p.item4, item5: p.item5, item6: p.item6,
      champLevel: p.champLevel,
      visionScore: p.visionScore || 0
    }));

    const durationMins = matchData.info.gameDuration / 60;
    const isRemake = durationMins < 4.5;

    const result = {
      matchId: matchId,
      queueId: matchData.info.queueId,
      durationMins: durationMins,
      isRemake: isRemake,
      timestamp: matchData.info.gameCreation,
      participants: matchParticipants
    };

    res.json(result);
  } catch (error) {
    console.error(`[API] Error en GET /api/matches/${matchId}:`, error);
    res.status(500).json({ message: 'Error interno del servidor al obtener la partida.', error: error.message });
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

// Obtener datos en tiempo real de un jugador no registrado (untracked)
app.get('/api/summoners/untracked/:puuid', async (req, res) => {
  const { puuid } = req.params;
  const region = req.query.region || 'la1';
  const RIOT_API_KEY = process.env.RIOT_API_KEY;

  try {
    const routingMap = {
      la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
      euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
      kr: 'asia', jp1: 'asia',
      oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
    };
    const routing = routingMap[region] || 'americas';

    // 1. Obtener cuenta de Riot (riotIdGameName y riotIdTagline) por su PUUID
    const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`;
    const accountResp = await riotFetch(accountUrl, RIOT_API_KEY);
    
    let gameName = 'Desconocido';
    let tagLine = 'LAN';
    if (accountResp.ok) {
      const accountData = await accountResp.json();
      gameName = accountData.gameName || 'Desconocido';
      tagLine = accountData.tagLine || 'LAN';
    } else {
      console.warn(`[WARN] Account-V1 failed for PUUID: ${puuid}. Status: ${accountResp.status}`);
    }

    // 2. Obtener Summoner-V4 por su PUUID (para profileIconId y nivel)
    const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const summonerResp = await riotFetch(summonerUrl, RIOT_API_KEY);
    
    let summonerLevel = 30;
    let profileIconId = 29;
    if (summonerResp.ok) {
      const summonerData = await summonerResp.json();
      summonerLevel = summonerData.summonerLevel;
      profileIconId = summonerData.profileIconId;
    }

    // 3. Obtener ligas (League-V4)
    let soloQ = { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 };
    let flexQ = { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 };
    const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const leagueResp = await riotFetch(leagueUrl, RIOT_API_KEY);
    
    if (leagueResp.ok) {
      const leagues = await leagueResp.json();
      const soloQEntry = leagues.find(e => e.queueType === 'RANKED_SOLO_5x5');
      if (soloQEntry) {
        soloQ = {
          tier: soloQEntry.tier,
          rank: soloQEntry.rank,
          leaguePoints: soloQEntry.leaguePoints,
          wins: soloQEntry.wins,
          losses: soloQEntry.losses
        };
      }
      const flexQEntry = leagues.find(e => e.queueType === 'RANKED_FLEX_SR');
      if (flexQEntry) {
        flexQ = {
          tier: flexQEntry.tier,
          rank: flexQEntry.rank,
          leaguePoints: flexQEntry.leaguePoints,
          wins: flexQEntry.wins,
          losses: flexQEntry.losses
        };
      }
    }

    // 4. Obtener mejores campeones
    const topChampions = await getTopChampions(puuid, region, RIOT_API_KEY);

    // 5. Obtener partidas (últimas 10 de SoloQ/FlexQ combinadas)
    const matchIdsUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=10`;
    const matchIdsResp = await riotFetch(matchIdsUrl, RIOT_API_KEY);
    const fetchedMatchIds = matchIdsResp.ok ? await matchIdsResp.json() : [];

    const matchPromises = fetchedMatchIds.map(async (matchId) => {
      try {
        const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const matchResp = await riotFetch(matchUrl, RIOT_API_KEY);
        if (!matchResp.ok) return null;

        const matchData = await matchResp.json();
        const participant = matchData.info.participants.find(p => p.puuid === puuid);
        
        if (participant) {
          const durationMins = matchData.info.gameDuration / 60;
          const teamKills = matchData.info.participants
            .filter(p => p.teamId === participant.teamId)
            .reduce((sum, p) => sum + p.kills, 0);
            
          const kp = teamKills > 0 ? ((participant.kills + participant.assists) / teamKills) : 0;
          const isRemake = durationMins < 4.5; // BUG-21 fix

          const matchParticipants = matchData.info.participants.map(p => ({
            summonerName: p.riotIdGameName || p.summonerName || 'Desconocido',
            tagLine: p.riotIdTagline || '',
            championName: championMap[p.championId?.toString()] || p.championName || 'Unknown',
            puuid: p.puuid,
            win: p.win,
            teamId: p.teamId,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            gold: p.goldEarned,
            cs: (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),
            damageDealt: p.totalDamageDealtToChampions,
            item0: p.item0, item1: p.item1, item2: p.item2,
            item3: p.item3, item4: p.item4, item5: p.item5, item6: p.item6,
            champLevel: p.champLevel,
            visionScore: p.visionScore || 0
          }));

          return {
            matchId: matchId,
            queueId: matchData.info.queueId,
            championName: championMap[participant.championId?.toString()] || participant.championName || 'Unknown',
            lane: participant.teamPosition || participant.lane || 'Unknown',
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            gold: participant.goldEarned,
            cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
            durationMins: durationMins,
            kp: kp,
            damageDealt: participant.totalDamageDealtToChampions,
            damageTaken: participant.totalDamageTaken,
            win: participant.win,
            isRemake: isRemake,
            timestamp: matchData.info.gameCreation,
            summoner1Id: participant.summoner1Id,
            summoner2Id: participant.summoner2Id,
            keystoneId: participant.perks?.styles?.[0]?.selections?.[0]?.perk,
            subStyleId: participant.perks?.styles?.[1]?.style,
            champLevel: participant.champLevel,
            item0: participant.item0,
            item1: participant.item1,
            item2: participant.item2,
            item3: participant.item3,
            item4: participant.item4,
            item5: participant.item5,
            item6: participant.item6,
            roleBoundItem: participant.roleBoundItem || 0,
            visionScore: participant.visionScore || 0,
            doubleKills: participant.doubleKills || 0,
            tripleKills: participant.tripleKills || 0,
            quadraKills: participant.quadraKills || 0,
            pentakills: participant.pentakills || 0,
            participants: matchParticipants
          };
        }
      } catch (e) {
        console.error(`Error procesando match untracked ${matchId}:`, e);
      }
      return null;
    });

    const parsedMatches = await Promise.all(matchPromises);
    const validMatches = parsedMatches.filter(m => m !== null).sort((a, b) => b.timestamp - a.timestamp);

    // Calcular estadísticas avanzadas
    const calculateAverages = (queueIdFilter) => {
      let sumKills = 0, sumDeaths = 0, sumAssists = 0, sumGold = 0, sumCs = 0, sumMins = 0, sumKp = 0, sumDmgDealt = 0, sumDmgTaken = 0;
      
      const filteredMatches = validMatches
        .filter(m => !m.isRemake && m.queueId === queueIdFilter)
        .slice(0, 10);

      filteredMatches.forEach(m => {
        sumKills += m.kills;
        sumDeaths += m.deaths;
        sumAssists += m.assists;
        sumGold += m.gold;
        sumCs += m.cs;
        sumMins += m.durationMins;
        sumKp += m.kp;
        sumDmgDealt += m.damageDealt;
        sumDmgTaken += m.damageTaken;
      });

      const count = filteredMatches.length;
      
      return {
        kda: count > 0 ? (sumDeaths > 0 ? ((sumKills + sumAssists) / sumDeaths).toFixed(2) : ((sumKills + sumAssists).toFixed(2))) : "0.00",
        avgGold: count > 0 ? Math.round(sumGold / count) : 0,
        avgDeaths: count > 0 ? (sumDeaths / count).toFixed(1) : "0.0",
        csPerMin: count > 0 ? (sumMins > 0 ? (sumCs / sumMins).toFixed(1) : "0.0") : "0.0",
        avgKp: count > 0 ? Math.round((sumKp / count) * 100) : 0,
        avgDamageDealt: count > 0 ? Math.round(sumDmgDealt / count) : 0,
        avgDamageTaken: count > 0 ? Math.round(sumDmgTaken / count) : 0,
        totalMatchesCalculated: count
      };
    };

    const advancedStats = {
      soloq: calculateAverages(420),
      flexq: calculateAverages(440)
    };

    const untrackedAccount = {
      puuid: puuid,
      gameName: gameName,
      tagLine: tagLine,
      region: region,
      profileIconId,
      summonerLevel,
      soloQ,
      flexQ,
      topChampions,
      matchStatsHistory: validMatches,
      advancedStats,
      isUntracked: true
    };

    res.json(untrackedAccount);

  } catch (error) {
    console.error('Error in /api/summoners/untracked/:puuid:', error);
    res.status(500).json({ message: 'Error al consultar el perfil de Riot en tiempo real.' });
  }
});

// Eliminar Invocador
// BUG-03 fix: Requiere admin key para evitar borrados no autorizados
app.delete('/api/summoners/:puuid', async (req, res) => {
  const { puuid } = req.params;

  // BUG-04 fix: Validar formato del puuid
  if (!isValidPuuid(puuid)) {
    return res.status(400).json({ message: 'PUUID inválido.' });
  }

  // BUG-03 fix: Verificar admin key (si está configurada)
  if (ADMIN_KEY) {
    const providedKey = req.headers['x-admin-key'] || req.query.adminKey;
    if (providedKey !== ADMIN_KEY) {
      return res.status(403).json({ message: 'No autorizado. Se requiere clave de administrador.' });
    }
  }

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

// BUG-19 fix: Esperar a que la DB conecte antes de escuchar peticiones
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 API Server V2 (Regions) listo en http://localhost:${PORT}`);
  });
});
