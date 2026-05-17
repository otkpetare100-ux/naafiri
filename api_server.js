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

app.use(cors());
app.use(express.json());

let db;
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
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('lan-tracker');
    console.log('✅ API Server: MongoDB conectado');
    await fetchChampionMap();
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

// Helper para obtener top campeones
async function getTopChampions(puuid, region, apiKey) {
  try {
    const url = `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=3&api_key=${apiKey}`;
    const resp = await fetch(url);
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

// Cooldown global en memoria (clave: gameName#tagLine)
const refreshCooldowns = new Map();

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
    const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`;
    const accountResp = await fetch(accountUrl);
    
    if (!accountResp.ok) {
      return res.status(accountResp.status).json({ message: 'No se encontró la cuenta en Riot Games.' });
    }
    const accountData = await accountResp.json();

    // 3. Summoner-V4
    const summonerUrl = `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${accountData.puuid}?api_key=${RIOT_API_KEY}`;
    const summonerResp = await fetch(summonerUrl);
    
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
    const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${accountData.puuid}?api_key=${RIOT_API_KEY}`;
    const leagueResp = await fetch(leagueUrl);
    
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
      await db.collection('accounts').updateOne(
        { puuid: accountData.puuid },
        { $set: updatedAccount }
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

    // Obtener IDs de las últimas 20 partidas de Solo y Flex por separado
    const matchIdsSoloUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=0&count=20&api_key=${RIOT_API_KEY}`;
    const matchIdsFlexUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=440&start=0&count=20&api_key=${RIOT_API_KEY}`;
    
    const [idsSoloResp, idsFlexResp] = await Promise.all([
      fetch(matchIdsSoloUrl),
      fetch(matchIdsFlexUrl)
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
      return res.json({ message: 'No hay partidas nuevas.', updated: false });
    }

    const newMatchStats = [];
    
    for (const matchId of newMatchIds) {
      try {
        const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}?api_key=${RIOT_API_KEY}`;
        const matchResp = await fetch(matchUrl);
        if (!matchResp.ok) continue;

        const matchData = await matchResp.json();
        const participant = matchData.info.participants.find(p => p.puuid === puuid);
        
        if (participant) {
          const durationMins = matchData.info.gameDuration / 60;
          const teamKills = matchData.info.participants
            .filter(p => p.teamId === participant.teamId)
            .reduce((sum, p) => sum + p.kills, 0);
            
          const kp = teamKills > 0 ? ((participant.kills + participant.assists) / teamKills) : 0;
          const isRemake = durationMins < 4.5 || participant.teamEarlySurrendered;

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
            roleBoundItem: participant.roleBoundItem || 0
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
    const combinedMatches = [...newMatchStats, ...existingMatches]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 40)
      .map(m => {
        // Adjuntar el cambio de LP si el bot lo registró previamente (Plan A)
        if (account.lpHistory && account.lpHistory[m.matchId] !== undefined) {
          m.lpChange = account.lpHistory[m.matchId];
        } else if (account.lastLpChanges && account.lastLpChanges.length > 0) {
          // Plan B: Fallback cronológico redundante si no coincide el ID de partida
          const matchTime = m.timestamp;
          const matchedChange = account.lastLpChanges.find(change => {
            const timeDiff = Math.abs(change.timestamp - matchTime);
            // Máximo 3 horas de diferencia y debe coincidir la cola
            return timeDiff < 3 * 60 * 60 * 1000 && change.queueId === m.queueId;
          });
          if (matchedChange) {
            m.lpChange = matchedChange.diff;
          }
        }
        return m;
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
        csPerMin: count > 0 ? (sumMins > 0 ? (sumCs / sumMins).toFixed(1) : 0) : "0.0",
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
      { $set: { matchStatsHistory: combinedMatches, advancedStats: avgStats } }
    );

    res.json({ 
      message: `¡Se actualizaron ${newMatchStats.length} partidas nuevas!`, 
      updated: true, 
      stats: avgStats,
      history: combinedMatches
    });

  } catch (error) {
    console.error('Error in /api/summoners/:puuid/matches/update:', error);
    res.status(500).json({ message: 'Error interno actualizando partidas.' });
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
