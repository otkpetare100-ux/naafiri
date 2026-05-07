const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const dns = require('dns');

dns.setServers(['8.8.8.8']);

const app = express();
const PORT = process.env.API_PORT || 3001;
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

// Servir activos del bot
app.use('/assets', express.static(path.join(__dirname, 'bot discord', 'assets')));

app.listen(PORT, () => {
  console.log(`🚀 API Server listo en http://localhost:${PORT}`);
});
