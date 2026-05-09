const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const dns = require('dns');

dns.setServers(['8.8.8.8']);

try { require('dotenv').config(); } catch(e) {}

let client = null;
let dbInstance = null;
let targetChannelId = process.env.DISCORD_CHANNEL_ID;
let DDRAGON_VERSION = '16.9.1';

// Función para actualizar la versión de Data Dragon desde el bot
async function updateBotDDragonVersion() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await res.json();
    if (versions && versions.length > 0) {
      DDRAGON_VERSION = versions[0];
    }
  } catch (e) {}
}
updateBotDDragonVersion();
setInterval(updateBotDDragonVersion, 1000 * 60 * 60 * 24);

const RANK_COLORS = {
  IRON: 0x51484a, BRONZE: 0x8c5230, SILVER: 0x80989d, GOLD: 0xcd8837,
  PLATINUM: 0x4e9996, EMERALD: 0x27a170, DIAMOND: 0x576bce, MASTER: 0x9d5ade,
  GRANDMASTER: 0xd93f3f, CHALLENGER: 0xf4c874
};

const TIER_SHORT = {
  IRON: 'Hierro', BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro',
  PLATINUM: 'Plat', EMERALD: 'Esme', DIAMOND: 'Diam', MASTER: 'Maestro',
  GRANDMASTER: 'GM', CHALLENGER: 'Chall'
};

const TIER_ORDER = {
  CHALLENGER: 9, GRANDMASTER: 8, MASTER: 7,
  DIAMOND: 6, EMERALD: 5, PLATINUM: 4,
  GOLD: 3, SILVER: 2, BRONZE: 1, IRON: 0, UNRANKED: -1,
};
const DIV_ORDER = { I: 4, II: 3, III: 2, IV: 1 };

const REGION_ROUTING = {
  la1: 'americas', la2: 'americas', na1: 'americas', br1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea'
};

const VALID_REGIONS = Object.keys(REGION_ROUTING);

// Helper para rotar mensajes globales (Borrar anterior y guardar nuevo)
async function rotateGlobalMessage(db, channel, key, newMessage) {
  try {
    const config = await db.collection('system_config').findOne({ key });
    if (config && config.messageId) {
      const oldMsg = await channel.messages.fetch(config.messageId).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
    }
    await db.collection('system_config').updateOne(
      { key },
      { $set: { messageId: newMessage.id, timestamp: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.error(`[Rotate Error: ${key}]`, e);
  }
}

function isAdmin(userId) {
  return userId === process.env.ADMIN_DISCORD_ID;
}

// Cooldowns
const helpCooldowns = new Map();
const gachaCooldowns = new Map();
const lastMiddayMotivation = new Map();

// --- SISTEMA DE GACHAPON ---
const GACHA_ITEMS = [
  // --- LEGENDARIOS (Peso 2) ---
  { id: 'Elemental_Lux', name: 'Lux Elementalista', rarity: 'Legendario', weight: 2, img: 'Lux_7' },
  { id: 'Golden_Naafiri', name: 'Naafiri Dorada', rarity: 'Legendario', weight: 2, img: 'Naafiri_0' },
  { id: 'Teemo_Satan', name: 'Teemo Pequeño Demonio', rarity: 'Legendario', weight: 2, img: 'Teemo_8' },
  { id: 'Ahri_Spirit', name: 'Ahri Flor Espiritual', rarity: 'Legendario', weight: 2, img: 'Ahri_27' },
  { id: 'Yasuo_Night', name: 'Yasuo Portador del Anochecer', rarity: 'Legendario', weight: 2, img: 'Yasuo_9' },
  { id: 'Riven_Dawn', name: 'Riven Portadora del Amanecer', rarity: 'Legendario', weight: 2, img: 'Riven_7' },
  { id: 'Lee_Storm', name: 'Lee Sin Dragón de la Tormenta', rarity: 'Legendario', weight: 2, img: 'LeeSin_31' },
  { id: 'COINS_1000', name: 'Tesoro de 1000 Coins', rarity: 'Legendario', weight: 2, type: 'coins', amount: 1000 },

  // --- ÉPICOS (Peso 8) ---
  { id: 'Jhin_Dark', name: 'Jhin Estrella Oscura', rarity: 'Épico', weight: 8, img: 'Jhin_5' },
  { id: 'Naafiri_Soul', name: 'Naafiri Soul Fighter', rarity: 'Épico', weight: 8, img: 'Naafiri_1' },
  { id: 'Vayne_Project', name: 'Vayne PROYECTO', rarity: 'Épico', weight: 8, img: 'Vayne_11' },
  { id: 'Kaisa_KDA', name: 'Kai\'Sa K/DA', rarity: 'Épico', weight: 8, img: 'KaiSa_1' },
  { id: 'Lucian_Project', name: 'Lucian PROYECTO', rarity: 'Épico', weight: 8, img: 'Lucian_1' },
  { id: 'Zed_Project', name: 'Zed PROYECTO', rarity: 'Épico', weight: 8, img: 'Zed_1' },
  { id: 'Lux_Star', name: 'Lux Guardiana Estelar', rarity: 'Épico', weight: 8, img: 'Lux_6' },
  { id: 'Akali_KDA', name: 'Akali K/DA', rarity: 'Épico', weight: 8, img: 'Akali_14' },
  { id: 'Ahri_KDA', name: 'Ahri K/DA', rarity: 'Épico', weight: 8, img: 'Ahri_14' },
  { id: 'Seraphine_KDA', name: 'Seraphine K/DA All Out', rarity: 'Épico', weight: 8, img: 'Seraphine_1' },

  // --- RAROS (Peso 20) ---
  { id: 'Lux_Cosmic', name: 'Lux Cósmica', rarity: 'Raro', weight: 20, img: 'Lux_15' },
  { id: 'Lee_God', name: 'Lee Sin Puño de Dios', rarity: 'Raro', weight: 20, img: 'LeeSin_11' },
  { id: 'Ezreal_Academia', name: 'Ezreal Academia de Combate', rarity: 'Raro', weight: 20, img: 'Ezreal_18' },
  { id: 'Lee_Muay', name: 'Muay Thai Lee Sin', rarity: 'Raro', weight: 20, img: 'LeeSin_4' },
  { id: 'Yasuo_High', name: 'Yasuo Solo ante el Peligro', rarity: 'Raro', weight: 20, img: 'Yasuo_1' },
  { id: 'Jayce_Academia', name: 'Jayce Academia de Combate', rarity: 'Raro', weight: 20, img: 'Jayce_4' },
  { id: 'Thresh_Blood', name: 'Thresh Luna de Sangre', rarity: 'Raro', weight: 20, img: 'Thresh_4' },
  { id: 'Graves_Pool', name: 'Pool Party Graves', rarity: 'Raro', weight: 20, img: 'Graves_6' },
  { id: 'Ezreal_Base_Skin', name: 'Ezreal de Notthingham', rarity: 'Raro', weight: 20, img: 'Ezreal_1' },
  { id: 'COINS_250', name: 'Cofre de 250 Coins', rarity: 'Raro', weight: 15, type: 'coins', amount: 250 },

  // --- COMUNES (Peso 70) ---
  { id: 'Naafiri', name: 'Naafiri', rarity: 'Común', weight: 70, img: 'Naafiri_0' },
  { id: 'Aatrox', name: 'Aatrox', rarity: 'Común', weight: 70, img: 'Aatrox_0' },
  { id: 'Yasuo', name: 'Yasuo', rarity: 'Común', weight: 70, img: 'Yasuo_0' },
  { id: 'Zed', name: 'Zed', rarity: 'Común', weight: 70, img: 'Zed_0' },
  { id: 'Garen', name: 'Garen', rarity: 'Común', weight: 70, img: 'Garen_0' },
  { id: 'Ashe', name: 'Ashe', rarity: 'Común', weight: 70, img: 'Ashe_0' },
  { id: 'Lux', name: 'Lux', rarity: 'Común', weight: 70, img: 'Lux_0' },
  { id: 'MasterYi', name: 'Master Yi', rarity: 'Común', weight: 70, img: 'MasterYi_0' },
  { id: 'Malphite', name: 'Malphite', rarity: 'Común', weight: 70, img: 'Malphite_0' },
  { id: 'Amumu', name: 'Amumu', rarity: 'Común', weight: 70, img: 'Amumu_0' },
  { id: 'Annie', name: 'Annie', rarity: 'Común', weight: 70, img: 'Annie_0' },
  { id: 'COINS_50', name: 'Bolsa de 50 Coins', rarity: 'Común', weight: 50, type: 'coins', amount: 50 },

  // --- PRO PLAYERS (Añadidos) ---
  { id: 'pro_faker', name: 'Faker', team: 'T1', rarity: 'Legendario', weight: 2, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/1/1b/T1_Faker_2024_Split_1.png' },
  { id: 'pro_uzi', name: 'Uzi', team: 'Leyenda', rarity: 'Legendario', weight: 2, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/2/2f/RNG_Uzi_2019_Split_2.png' },
  { id: 'pro_caps', name: 'Caps', team: 'G2 Esports', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/5/5e/G2_Caps_2024_Split_1.png' },
  { id: 'pro_chovy', name: 'Chovy', team: 'Gen.G', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/b/b3/GEN_Chovy_2024_Split_1.png' },
  { id: 'pro_showmaker', name: 'ShowMaker', team: 'Dplus KIA', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/3/30/DK_ShowMaker_2024_Split_1.png' },
  { id: 'pro_gumayusi', name: 'Gumayusi', team: 'T1', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/9/90/T1_Gumayusi_2024_Split_1.png' },
  { id: 'pro_keria', name: 'Keria', team: 'T1', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/1/16/T1_Keria_2024_Split_1.png' },
  { id: 'pro_zeus', name: 'Zeus', team: 'T1', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/a/a9/T1_Zeus_2024_Split_1.png' },
  { id: 'pro_knight', name: 'Knight', team: 'BLG', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/3/3b/BLG_knight_2024_Split_1.png' },
  { id: 'pro_bin', name: 'Bin', team: 'BLG', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/3/34/BLG_Bin_2024_Split_1.png' },
  { id: 'pro_ruler', name: 'Ruler', team: 'JDG', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/b/b1/JDG_Ruler_2024_Split_1.png' },
  { id: 'pro_xpeke', name: 'xPeke', team: 'Leyenda', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/e/e0/OG_xPeke_2016_Split_1.png' },
  { id: 'pro_madlife', name: 'MadLife', team: 'Leyenda', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/d/d4/CJ_MadLife_2016_Split_1.png' },
  { id: 'pro_jankos', name: 'Jankos', team: 'Team Heretics', rarity: 'Raro', weight: 20, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/4/4b/TH_Jankos_2024_Split_1.png' },
  { id: 'pro_rekkles', name: 'Rekkles', team: 'T1 Academy', rarity: 'Raro', weight: 20, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/6/69/T1A_Rekkles_2024_Split_1.png' },
  { id: 'pro_perkz', name: 'Perkz', team: 'Leyenda', rarity: 'Raro', weight: 20, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/a/a2/TH_Perkz_2024_Split_1.png' },
  { id: 'pro_doublelift', name: 'Doublelift', team: 'Leyenda', rarity: 'Raro', weight: 20, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/a/af/100_Doublelift_2023_Split_2.png' },
  { id: 'pro_corejj', name: 'CoreJJ', team: 'Team Liquid', rarity: 'Raro', weight: 20, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/f/f6/TL_CoreJJ_2024_Split_1.png' },
  { id: 'pro_impact', name: 'Impact', team: 'Team Liquid', rarity: 'Raro', weight: 20, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/9/91/TL_Impact_2024_Split_1.png' },
  { id: 'pro_elyoya', name: 'Elyoya', team: 'MAD Lions KOI', rarity: 'Épico', weight: 8, type: 'pro', img: 'https://static.wikia.nocookie.net/lolesports_gamepedia/images/7/77/MDK_Elyoya_2024_Split_1.png' }
];


const CHALLENGES_LIST = [
  { name: 'Naafiri God', description: 'Consigue una Pentakill en una partida de SoloQ.', reward: '1000 Coins', color: '#f1c40f', icon: 'item/3153.png', rarity: 'Legendario' },
  { name: 'Untouchable', description: 'Termina una partida con 0 muertes y victoria.', reward: '250 Coins', color: '#e74c3c', icon: 'item/3157.png', rarity: 'Épico' },
  { name: 'Hard Carry', description: 'Haz más del 35% del daño total de tu equipo.', reward: '150 Coins', color: '#9b59b6', icon: 'item/3031.png', rarity: 'Raro' },
  { name: 'Visionary', description: 'Consigue una puntuación de visión superior a 80.', reward: '100 Coins', color: '#3498db', icon: 'item/3363.png', rarity: 'Común' }
];

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRankScore(acc) {
  const soloQ = acc.soloQ;
  if (!soloQ) return -1;
  const tier = TIER_ORDER[soloQ.tier] ?? -1;
  const div  = DIV_ORDER[soloQ.rank]  ?? 0;
  const lp   = soloQ.leaguePoints     || 0;
  return tier * 10000 + div * 1000 + lp;
}

function initBot(db) {
  dbInstance = db;
  if (!process.env.DISCORD_TOKEN) {
    console.warn('⚠️ No se detectó DISCORD_TOKEN. El bot no iniciará.');
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds, 
      GatewayIntentBits.GuildMessages, 
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.on('ready', () => {
    console.log(`✅ Bot conectado como: ${client.user.tag}`);
  });

  // Comandos básicos por mensaje (Prefijo !)
  client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith('!')) return;

    // Eliminar el comando de forma instantánea
    msg.delete().catch(() => {});

    const args = msg.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();


    if (command === 'help' || command === 'ayuda') {
      const now = Date.now();
      const lastUsed = helpCooldowns.get(msg.author.id) || 0;
      const cooldownAmount = 5 * 60 * 1000;

      if (now - lastUsed < cooldownAmount) {
        const timeLeft = Math.ceil((cooldownAmount - (now - lastUsed)) / 60000);
        return msg.channel.send(`<@${msg.author.id}> ⌛ Por favor, espera **${timeLeft} minuto(s)** para volver a usar el comando de ayuda.`);
      }

      helpCooldowns.set(msg.author.id, now);
      setTimeout(() => helpCooldowns.delete(msg.author.id), cooldownAmount);

      const embed = new EmbedBuilder()
        .setTitle('🐾 Centro de Ayuda - LAN Tracker')
        .setDescription('Pulsa el botón de abajo para ver la guía de comandos de forma privada.')
        .setColor(0x576bce)
        .setFooter({ text: 'Naafiri Bot' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`help_main_${msg.author.id}`)
          .setLabel('Ver Guía de Comandos 📖')
          .setStyle(ButtonStyle.Primary)
      );

      const sentMsg = await msg.channel.send({ content: `<@${msg.author.id}>`, embeds: [embed], components: [row] });
      
      // Auto-borrado preventivo tras 1 minuto
      setTimeout(() => sentMsg.delete().catch(() => {}), 60000);
      return;
    }

    if (command === 'help_admin' || command === 'admin_help') {
      if (!isAdmin(msg.author.id)) return msg.channel.send(`<@${msg.author.id}> 🚫 No tienes permisos de administrador.`);

      const embed = new EmbedBuilder()
        .setTitle('🛠️ Panel de Administración - LAN Tracker')
        .setDescription('Pulsa el botón de abajo para ver los comandos de administrador de forma privada.')
        .setColor(0xd93f3f)
        .setFooter({ text: 'Naafiri Admin' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`help_admin_${msg.author.id}`)
          .setLabel('Abrir Consola Admin 🛠️')
          .setStyle(ButtonStyle.Danger)
      );

      const sentMsg = await msg.channel.send({ content: `<@${msg.author.id}>`, embeds: [embed], components: [row] });
      setTimeout(() => sentMsg.delete().catch(() => {}), 60000);
      return;
    }
    if (command === 'desencantar' || command === 'reciclar') {
      const userEco = await db.collection('economy').findOne({ discordId: msg.author.id });
      if (!userEco || !userEco.inventory || userEco.inventory.length === 0) {
        return msg.channel.send(`<@${msg.author.id}> 🎒 No tienes nada en tu mochila para desencantar.`);
      }

      const grouped = {};
      const toKeep = [];
      let totalGain = 0;
      let itemsRemoved = 0;

      const DUST_VALUES = { 'Común': 5, 'Raro': 15, 'Épico': 50, 'Legendario': 200 };

      for (const item of userEco.inventory) {
        if (!grouped[item.id]) {
          grouped[item.id] = true;
          toKeep.push(item);
        } else {
          totalGain += DUST_VALUES[item.rarity] || 5;
          itemsRemoved++;
        }
      }

      if (itemsRemoved === 0) {
        return msg.channel.send(`<@${msg.author.id}> ✨ No tienes objetos repetidos en tu mochila.`);
      }

      await db.collection('economy').updateOne(
        { discordId: msg.author.id },
        { 
          $set: { inventory: toKeep },
          $inc: { coins: totalGain }
        }
      );

      msg.channel.send(`<@${msg.author.id}> ♻️ ¡Has desencantado **${itemsRemoved} objetos** repetidos y has recibido **${totalGain} Naafiri Coins**! 💰`);
    }

    if (command === 'perfil') {
      let slug = args.join(' '); // Soporta nombres con espacios
      let acc = null;

      if (!slug) {
        // Intentar buscar vinculación automática
        acc = await db.collection('accounts').findOne({ discordId: msg.author.id });
        if (!acc) return msg.channel.send(`<@${msg.author.id}> ❌ No estás vinculado. Usa \`!perfil Nombre#TAG\` o vincúlate con \`!vincular\`.`);
      } else {
        acc = await findAccountBySlug(slug);
      }

      if (!acc) return msg.channel.send(`<@${msg.author.id}> Jugador no encontrado en el dashboard.`);

      const embed = new EmbedBuilder()
        .setTitle(`${acc.gameName}#${acc.tagLine}`)
        .setThumbnail(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${acc.profileIconId}.png`)
        .setColor(RANK_COLORS[acc.soloQ?.tier] || 0xffffff)
        .addFields(
          { name: 'Región', value: (acc.region || 'LA1').toUpperCase(), inline: true },
          { name: 'Rango SoloQ', value: acc.soloQ ? `${acc.soloQ.tier} ${acc.soloQ.rank} (${acc.soloQ.leaguePoints} LP)` : 'Unranked', inline: true },
          { name: 'Winrate', value: acc.soloQ ? `${Math.round((acc.soloQ.wins / (acc.soloQ.wins + acc.soloQ.losses)) * 100)}%` : 'N/A', inline: true },
          { name: 'Racha', value: acc.streak > 0 ? `🔥 ${acc.streak} Wins` : acc.streak < 0 ? `❄️ ${Math.abs(acc.streak)} Loss` : '—', inline: true }
        )
        .setFooter({ text: 'LAN Tracker Bot' });

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
    }

    if (command === 'retos' || command === 'challenges') {
      const now = Date.now();
      const lastUsed = helpCooldowns.get(`retos_${msg.author.id}`) || 0;
      const cooldownAmount = 30 * 1000;

      if (now - lastUsed < cooldownAmount) {
        return msg.channel.send(`<@${msg.author.id}> ⌛ No satures el tablero de caza. Espera un poco.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      }

      helpCooldowns.set(`retos_${msg.author.id}`, now);
      const statusMsg = await msg.channel.send('⏳ Generando el Tablón de Caza...');

      try {
        const buffer = await generateChallengeImage(db);
        const attachment = new AttachmentBuilder(buffer, { name: 'retos.png' });
        
        const sentMsg = await msg.channel.send({ 
          files: [attachment] 
        });

        await rotateGlobalMessage(db, msg.channel, 'last_challenge_msg', sentMsg);
        statusMsg.delete().catch(() => {});
      } catch (e) {
        console.error('[Retos Command Error]', e);
        msg.channel.send('Hubo un error al generar el Tablón de Caza.');
        statusMsg.delete().catch(() => {});
      }
      return;
    }

    if (command === 'build') {
      const champArgs = args.join('').toLowerCase();
      if (!champArgs) {
        return msg.channel.send(`<@${msg.author.id}> ❌ Debes especificar un campeón. Ejemplo: \`!build aatrox\``).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      }

      const sendBuildInThread = async (buffers) => {
        const bufferArray = Array.isArray(buffers) ? buffers : [buffers];
        const attachments = bufferArray.map((buf, i) => new AttachmentBuilder(buf, { name: `build_${i}.png` }));
        
        try {
          const thread = await msg.channel.threads.create({
            name: `Build de ${champArgs.toUpperCase()}`,
            autoArchiveDuration: 60,
            reason: 'Hilo temporal para mostrar la build'
          });
          await thread.send({ content: `<@${msg.author.id}>, aquí tienes los pergaminos antiguos (Runas y Objetos):`, files: attachments });
          
          // Programar autodestrucción en 20 minutos
          setTimeout(async () => {
            try {
              await thread.delete('Tiempo expirado para la build temporal');
            } catch (err) {
              console.error('[Thread Delete Error]', err);
            }
          }, 20 * 60 * 1000);
        } catch (threadErr) {
          console.error('[Thread Create Error]', threadErr);
          await msg.channel.send({ content: `<@${msg.author.id}>, aquí tienes los pergaminos antiguos:`, files: attachments }).then(m => setTimeout(() => m.delete().catch(() => {}), 20 * 60 * 1000));
        }
      };

      // Revisar la caché
      const cacheKey = `build_${champArgs}`;
      const cacheData = await dbInstance.collection('system_config').findOne({ key: cacheKey });
      
      // La caché dura 24 horas
      if (cacheData && (cacheData.buffers || cacheData.buffer) && (Date.now() - cacheData.timestamp < 24 * 60 * 60 * 1000)) {
        let buffers = [];
        if (cacheData.buffers) {
          buffers = cacheData.buffers.map(b => Buffer.from(b.buffer || b));
        } else {
          buffers = [Buffer.from(cacheData.buffer.buffer || cacheData.buffer)];
        }
        await sendBuildInThread(buffers);
        return;
      }

      const tempMsg = await msg.channel.send(`<@${msg.author.id}> ⏳ Consultando los pergaminos antiguos para la mejor build...`);
      
      try {
        const buffers = await generateBuildImage(champArgs);
        if (!buffers || buffers.length === 0) {
          return tempMsg.edit(`<@${msg.author.id}> ❌ No pude encontrar información de ese campeón en dpm.lol. Revisa el nombre e intenta de nuevo.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
        }

        await tempMsg.delete().catch(() => {});
        await sendBuildInThread(buffers);
        
        // Guardar en caché
        await dbInstance.collection('system_config').updateOne(
          { key: cacheKey },
          { $set: { buffers: buffers, timestamp: Date.now() } },
          { upsert: true }
        );
      } catch (e) {
        console.error('[Build Command Error]', e);
        tempMsg.edit(`<@${msg.author.id}> 🐾 Hubo un problema obteniendo la build, intenta de nuevo más tarde.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      }
      return;
    }

    if (command === 'ladder') {
      const accounts = await db.collection('accounts').find({}).toArray();
      const sorted = accounts.sort((a,b) => getRankScore(b) - getRankScore(a)).slice(0, 10);
      
      if (sorted.length === 0) return msg.channel.send('No hay jugadores registrados.');

      try {
        const buffer = await generateLadderImage(sorted);
        const attachment = new AttachmentBuilder(buffer, { name: 'ladder.png' });
        
        const sentMsg = await msg.channel.send({ 
          files: [attachment] 
        });

        await rotateGlobalMessage(db, msg.channel, 'last_ladder_msg', sentMsg);
      } catch (e) {
        console.error('[Ladder Image Error]', e);
        msg.channel.send('Hubo un error al generar el ranking visual.');
      }
      return;
    }

    // --- Fase 1: Vínculo y Economía ---
    
    // Función auxiliar para buscar cuenta por slug
    async function findAccountBySlug(slug) {
      if (!slug || !slug.includes('#')) return null;
      const [rawName, rawTag] = slug.split('#');
      const name = rawName.trim();
      const tag = rawTag.trim();
      
      return await db.collection('accounts').findOne({ 
        gameName: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
        tagLine: { $regex: new RegExp(`^${escapeRegex(tag)}$`, 'i') }
      });
    }

    if (command === 'test_notif') {
      if (!isAdmin(msg.author.id)) return;
      await sendDailySummary(dbInstance);
      await sendDailyMotivation(dbInstance);
      return;
    }

    if (command === 'vincular') {
        const RIOT_API_KEY = process.env.RIOT_API_KEY;
        if (!RIOT_API_KEY) return msg.channel.send('❌ El sistema no tiene configurada la Riot API Key.');

        let region = 'la1';
        let nameWithTag = args.join(' ');
        
        // Detectar región al final del comando (opcional)
        const possibleRegion = args[args.length - 1]?.toLowerCase();
        if (VALID_REGIONS.includes(possibleRegion)) {
          region = possibleRegion;
          const tempArgs = [...args];
          tempArgs.pop();
          nameWithTag = tempArgs.join(' ');
        }

        if (!nameWithTag.includes('#')) return msg.channel.send(`<@${msg.author.id}> ❌ Uso: \`!vincular Nombre#TAG [Region]\`. Ejemplo: \`!vincular Faker#KR1 kr\``);
        
        let acc = await findAccountBySlug(nameWithTag);
        let isNew = false;

        if (!acc) {
          const [name, tag] = nameWithTag.split('#').map(s => s.trim());
          const statusMsg = await msg.channel.send(`<@${msg.author.id}> 🔍 Buscando a **${name}#${tag}** en **${region.toUpperCase()}** vía Servidor Central...`);

          try {
            const apiRes = await fetch('https://lan-tracker-production.up.railway.app/api/summoners', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameName: name, tagLine: tag, region: region })
            });

            if (!apiRes.ok) {
              const errData = await apiRes.json();
              statusMsg.delete().catch(() => {});
              return msg.channel.send(`<@${msg.author.id}> ❌ **Error de Sincronización:** ${errData.message || 'La web no pudo procesar la solicitud'}.`);
            }

            const data = await apiRes.json();
            
            if (!data || !data.account) {
              statusMsg.delete().catch(() => {});
              return msg.channel.send(`<@${msg.author.id}> ❌ **Error de Formato:** El servidor central no devolvió los datos de la cuenta correctamente.`);
            }

            const puuid = data.account.puuid;

            // Vincular discordId en la misma DB que usa la web
            await db.collection('accounts').updateOne(
              { puuid: puuid },
              { $set: { discordId: msg.author.id } }
            );

            // Sincronizar economía (Solo establece el PUUID si es la primera vez)
            await db.collection('economy').updateOne(
              { discordId: msg.author.id },
              { 
                $setOnInsert: { 
                  puuid: puuid,
                  coins: 100, 
                  lastDaily: null, 
                  inventory: [] 
                }
              },
              { upsert: true }
            );

            statusMsg.delete().catch(() => {});
            return msg.channel.send(`<@${msg.author.id}> ✅ **¡Sincronizado!** Tu cuenta **${data.account.gameName}#${data.account.tagLine}** ya está conectada al ladder.`);
          } catch (err) {
            console.error('[Sync Error]', err);
            statusMsg.delete().catch(() => {});
            return msg.channel.send(`<@${msg.author.id}> ❌ **Error técnico de conexión:** \`${err.message}\`. Verifica que la web esté online.`);
          }
        }

      // VINCULAR
      await db.collection('accounts').updateOne(
        { puuid: acc.puuid },
        { $set: { discordId: msg.author.id } }
      );

      await db.collection('economy').updateOne(
        { discordId: msg.author.id },
        { $set: { linkedPuuid: acc.puuid, discordTag: msg.author.tag } },
        { upsert: true }
      );

      const welcomePrefix = isNew ? '✨ ¡Bienvenido a la perrera! Nueva cuenta registrada y vinculada:' : '✅ ¡Cuenta vinculada!';
      msg.channel.send(`<@${msg.author.id}> ${welcomePrefix} **${acc.gameName}#${acc.tagLine}**.`);
    }

    if (command === 'monedas' || command === 'bal') {
      const user = await db.collection('economy').findOne({ discordId: msg.author.id });
      const bal = user ? user.coins : 0;
      msg.channel.send(`<@${msg.author.id}> 💰 Tienes **${bal} Naafiri Coins**. Use \`!diario\` para reclamar más.`);
    }

    if (command === 'diario') {
      const now = new Date();
      const user = await db.collection('economy').findOne({ discordId: msg.author.id });
      
      if (user && user.lastDaily) {
        const diff = now - new Date(user.lastDaily);
        const waitTime = 24 * 60 * 60 * 1000;
        if (diff < waitTime) {
          const remaining = waitTime - diff;
          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          return msg.channel.send(`<@${msg.author.id}> ⌛ Ya reclamaste tus monedas hoy. Vuelve en **${hours}h ${minutes}m**.`);
        }
      }

      await db.collection('economy').updateOne({ discordId: msg.author.id }, { $set: { lastDaily: new Date() }, $inc: { coins: 100 } }, { upsert: true });
      msg.channel.send(`<@${msg.author.id}> 💰 ¡Recibiste **100 Naafiri Coins**! Úsalas sabiamente.`);
    }

    if (command === 'pagar' || command === 'enviar') {
      const target = msg.mentions.users.first();
      const amount = parseInt(args.find(a => !isNaN(a) && a !== ''));

      if (!target || isNaN(amount) || amount <= 0) {
        return msg.channel.send(`<@${msg.author.id}> ❌ Uso: \`!pagar @usuario [cantidad]\``);
      }

      if (target.id === msg.author.id) {
        return msg.channel.send(`<@${msg.author.id}> 🚫 No puedes pagarte a ti mismo.`);
      }

      const senderEco = await db.collection('economy').findOne({ discordId: msg.author.id });
      if (!senderEco || senderEco.coins < amount) {
        return msg.channel.send(`<@${msg.author.id}> ❌ No tienes suficientes Naafiri Coins (Saldo: ${senderEco?.coins || 0}).`);
      }

      // Transferencia atómica
      await db.collection('economy').updateOne({ discordId: msg.author.id }, { $inc: { coins: -amount } });
      await db.collection('economy').updateOne(
        { discordId: target.id }, 
        { $inc: { coins: amount }, $set: { discordTag: target.tag } }, 
        { upsert: true }
      );

      msg.channel.send(`<@${msg.author.id}> ✅ ¡Transferencia completada! Has enviado **${amount} coins** a **${target.username}**.`);
    }

    if (command === 'trade' || command === 'cambio') {
      const target = msg.mentions.users.first();
      if (!target || target.id === msg.author.id) return msg.channel.send(`<@${msg.author.id}> ❌ Uso: \`!trade @usuario MiCampeon, SuCampeon\``);

      const parts = args.slice(1).join(' ').split(',').map(p => p.trim());
      if (parts.length < 2) return msg.channel.send(`<@${msg.author.id}> ❌ Indica ambos campeones separados por una coma. Ej: \`!trade @user Lux, Teemo\``);

      const senderEco = await db.collection('economy').findOne({ discordId: msg.author.id });
      const targetEco = await db.collection('economy').findOne({ discordId: target.id });

      if (!senderEco || !senderEco.inventory) return msg.channel.send(`<@${msg.author.id}> ❌ No tienes items en tu mochila.`);
      if (!targetEco || !targetEco.inventory) return msg.channel.send(`<@${msg.author.id}> ❌ El usuario destino no tiene mochila.`);

      // Búsqueda robusta: exacto primero, luego parcial
      const findItem = (inv, name) => {
        const exact = GACHA_ITEMS.find(i => i.name.toLowerCase() === name.toLowerCase() && inv.some(item => item.id === i.id));
        if (exact) return exact;
        return GACHA_ITEMS.find(i => i.name.toLowerCase().includes(name.toLowerCase()) && inv.some(item => item.id === i.id));
      };

      const myItem = findItem(senderEco.inventory, parts[0]);
      const suItem = findItem(targetEco.inventory, parts[1]);

      if (!myItem) return msg.channel.send(`<@${msg.author.id}> ❌ No tienes a **${parts[0]}** en tu mochila.`);
      if (!suItem) return msg.channel.send(`<@${msg.author.id}> ❌ **${target.username}** no tiene a **${parts[1]}**.`);

      const embed = new EmbedBuilder()
        .setTitle('🤝 Propuesta de Intercambio')
        .setDescription(`**${msg.author.username}** quiere intercambiar:\n\n📤 Te da: **${myItem.name}** (${myItem.rarity})\n📥 Recibe: **${suItem.name}** (${suItem.rarity})\n\n¿Aceptas el trato, **${target.username}**?`)
        .setColor(0x3498db)
        .setFooter({ text: 'Esta oferta expira en 1 minuto.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tr_acc_${msg.author.id}_${target.id}_${myItem.id}_${suItem.id}`).setLabel('Aceptar ✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tr_rej_${msg.author.id}_${target.id}`).setLabel('Rechazar ❌').setStyle(ButtonStyle.Danger)
      );

      msg.channel.send({ content: `<@${target.id}>`, embeds: [embed], components: [row] });
    }

    if (command === 'web' || command === 'link') {
      const embed = new EmbedBuilder()
        .setTitle('🌐 Tu Perfil Web Premium')
        .setDescription('Pulsa el botón de abajo para generar tu enlace personal. El enlace será privado y este mensaje se eliminará automáticamente.')
        .setColor(0xc89b3c)
        .setFooter({ text: 'Naafiri Web Dashboard' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`web_link_${msg.author.id}`)
          .setLabel('Ver Mi Mochila 🎒')
          .setStyle(ButtonStyle.Primary)
      );

      const sentMsg = await msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed], components: [row] });
      
      // Auto-borrado preventivo tras 1 minuto si no interactúa
      setTimeout(() => sentMsg.delete().catch(() => {}), 60000);
      return;
    }

    if (command === 'shame' || command === 'muro') {
      const accounts = await db.collection('accounts').find({}).toArray();
      const losers = accounts.sort((a,b) => {
        const wrA = a.soloQ ? a.soloQ.wins / (a.soloQ.wins + a.soloQ.losses) : 0;
        const wrB = b.soloQ ? b.soloQ.wins / (b.soloQ.wins + b.soloQ.losses) : 0;
        return wrA - wrB;
      }).slice(0, 5);
      
      const list = losers.map((a, i) => `${i+1}. **${a.gameName}** - WR: ${Math.round((a.soloQ ? a.soloQ.wins / (a.soloQ.wins + a.soloQ.losses) : 0) * 100)}% 🤡`).join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle('🤡 El Muro de la Vergüenza')
        .setDescription(list || 'Todos son pro players por ahora.')
        .setColor(0xd93f3f);

      const sentMsg = await msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
      await rotateGlobalMessage(db, msg.channel, 'last_shame_msg', sentMsg);
      return;
    }

    if (command === 'top_ricos' || command === 'top_coins') {
      const top = await db.collection('economy').find({}).sort({ coins: -1 }).limit(10).toArray();
      const list = top.map((u, i) => `${i+1}. **${u.discordTag || 'Usuario'}** - ${u.coins} 💰`).join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle('💰 Los Más Ricos de la Perrera')
        .setDescription(list || 'Nadie tiene monedas aún.')
        .setColor(0xf1c40f);

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
    }

    if (command === 'ludopata' || command === 'bets') {
      const targetUser = msg.mentions.users.first() || msg.author;
      const bets = await db.collection('bets').find({ discordId: targetUser.id }).toArray();

      if (bets.length === 0) {
        return msg.channel.send(`<@${msg.author.id}> ${targetUser.id === msg.author.id ? 'No has' : 'Este usuario no ha'} realizado ninguna apuesta todavía. 🎰`);
      }

      const wins = bets.filter(b => b.status === 'won').length;
      const losses = bets.filter(b => b.status === 'lost').length;
      const total = wins + losses;
      const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
      
      // Calcular balance neto
      let netProfit = 0;
      bets.forEach(b => {
        if (b.status === 'won') netProfit += Math.floor(b.amount * (b.multiplier || 2)) - b.amount;
        if (b.status === 'lost') netProfit -= b.amount;
      });

      const embed = new EmbedBuilder()
        .setTitle(`🎰 Perfil de Ludópata: ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: '🏆 Ganadas', value: `${wins}`, inline: true },
          { name: '💀 Perdidas', value: `${losses}`, inline: true },
          { name: '📊 Win Rate', value: `${winRate}%`, inline: true },
          { name: '💰 Balance Neto', value: `${netProfit > 0 ? '+' : ''}${netProfit} 💰`, inline: false }
        )
        .setColor(netProfit >= 0 ? 0x2ecc71 : 0xe74c3c)
        .setFooter({ text: 'Naafiri Bot · LAN Tracker' });

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
    }



    if (command === 'gacha' || command === 'tiro') {
      const now = Date.now();
      const lastUsed = gachaCooldowns.get(msg.author.id) || 0;
      if (now - lastUsed < 2000) return; // Cooldown de 2 segundos silenciado o aviso corto
      gachaCooldowns.set(msg.author.id, now);

      const COST = 10;
      const userEco = await db.collection('economy').findOne({ discordId: msg.author.id });

      if (!userEco || userEco.coins < COST) {
        return msg.channel.send(`<@${msg.author.id}> ❌ No tienes suficientes coins. El tiro de Gachapon cuesta **${COST} 💰**.`);
      }

      const totalWeight = GACHA_ITEMS.reduce((sum, item) => sum + item.weight, 0);
      let random = Math.random() * totalWeight;
      let selected = GACHA_ITEMS[0];

      for (const item of GACHA_ITEMS) {
        if (random < item.weight) {
          selected = item;
          break;
        }
        random -= item.weight;
      }

      // Guardar Recompensa
      let finalBalance = userEco.coins - COST;
      if (selected.type === 'coins') {
        finalBalance += selected.amount;
        await db.collection('economy').updateOne(
          { discordId: msg.author.id },
          { $inc: { coins: -COST + selected.amount } }
        );
      } else {
        await db.collection('economy').updateOne(
          { discordId: msg.author.id },
          { 
            $inc: { coins: -COST },
            $addToSet: { inventory: { id: selected.id, name: selected.name, rarity: selected.rarity, date: new Date() } }
          }
        );
      }

      try {
        const buffer = await generateGachaCard(selected, finalBalance);
        const attachment = new AttachmentBuilder(buffer, { name: 'gacha.png' });
        
        let content = `<@${msg.author.id}> 🎰 **¡GACHAPON DE LA PERRERA!**\n💰 Saldo restante: **${finalBalance} Naafiri Coins**`;
        if (selected.rarity === 'Legendario') {
          content = `@everyone 🎊 ¡ATENCIÓN! **${msg.author.username}** consiguió un objeto **LEGENDARIO**! 🎊\n💰 Saldo: **${finalBalance}**`;
        }

        return msg.channel.send({ content, files: [attachment] });
      } catch (e) {
        console.error('[Gacha Image Error]', e);
        return msg.channel.send(`<@${msg.author.id}> 🎰 ¡Has obtenido **${selected.name}** (${selected.rarity})! 💰 Saldo: ${finalBalance}`);
      }
    }

    // --- COMANDOS DE ADMIN PARA PRUEBAS DE GACHAPON ---
    if (command === 'admin_testgacha') {
      if (!isAdmin(msg.author.id)) return;
      const rarity = args[0];
      const items = GACHA_ITEMS.filter(i => i.rarity.toLowerCase() === rarity?.toLowerCase());
      if (items.length === 0) return msg.reply('❌ Rareza no encontrada. Usa: Común, Raro, Épico, Legendario');
      
      const selected = items[Math.floor(Math.random() * items.length)];
      msg.channel.send('🧪 Generando carta de prueba...');
      const buffer = await generateGachaCard(selected, 0);
      const attachment = new AttachmentBuilder(buffer, { name: 'test.png' });
      return msg.channel.send({ content: `🧪 **TEST GACHA:** ${selected.name} (${selected.rarity})`, files: [attachment] });
    }

    if (command === 'admin_testpro') {
      if (!isAdmin(msg.author.id)) return;
      const pros = GACHA_ITEMS.filter(i => i.type === 'pro');
      const selected = pros[Math.floor(Math.random() * pros.length)];
      msg.channel.send('⏳ Generando pro player de prueba...');
      try {
        const buffer = await generateGachaCard(selected, 0);
        const attachment = new AttachmentBuilder(buffer, { name: 'test.png' });
        return msg.channel.send({ content: `🧪 **TEST PRO:** ${selected.name} (${selected.team})`, files: [attachment] });
      } catch (err) {
        return msg.reply(`❌ **ERROR DE GENERACIÓN:**\n\`\`\`${err.message}\`\`\``);
      }
    }

    if (command === 'admin_testitem') {
      if (!isAdmin(msg.author.id)) return;
      const query = args.join(' ').toLowerCase();
      if (!query) return msg.channel.send('❌ Debes escribir el nombre o ID del item.');

      // Buscar item
      const selected = GACHA_ITEMS.find(i => 
        i.id.toLowerCase() === query || 
        i.name.toLowerCase().includes(query)
      );
      
      if (!selected) return msg.channel.send(`❌ No encontré ningún item que coincida con "${query}".`);
      
      console.log(`[Admin Test] Item seleccionado: ${selected.name} (ID: ${selected.id})`);
      msg.channel.send(`✅ Item encontrado: **${selected.name}**. Generando carta...`);

      try {
        const buffer = await generateGachaCard(selected, 0);
        const attachment = new AttachmentBuilder(buffer, { name: 'test.png' });
        return msg.channel.send({ content: `🧪 **TEST ITEM:** ${selected.name} (${selected.rarity})`, files: [attachment] });
      } catch (err) {
        console.error(`[Admin Test Error] ${err.message}`);
        return msg.channel.send(`❌ **ERROR AL GENERAR:**\n\`\`\`${err.message}\`\`\``);
      }
    }

    if (command === 'mochila' || command === 'inv') {
      const userEco = await db.collection('economy').findOne({ discordId: msg.author.id });
      if (!userEco || !userEco.inventory || userEco.inventory.length === 0) {
        return msg.channel.send(`<@${msg.author.id}> 🎒 Tu mochila está vacía. ¡Usa \`!gacha\` para empezar tu colección!`);
      }

      // Agrupar items duplicados y contar cantidad
      const grouped = {};
      for (const item of userEco.inventory) {
        if (!grouped[item.id]) grouped[item.id] = { ...item, count: 0 };
        grouped[item.id].count++;
      }

      const items = Object.values(grouped).map(item => {
        const icon = item.rarity === 'Legendario' ? '⭐' : item.rarity === 'Épico' ? '💜' : item.rarity === 'Raro' ? '🔹' : '⚪';
        const qty = item.count > 1 ? ` **x${item.count}**` : '';
        return `${icon} **${item.name}**${qty} (${item.rarity})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`🎒 Mochila de ${msg.author.username}`)
        .setDescription(items)
        .setColor(0x2ecc71);

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
    }

    
    if (command === 'reroll' || command === 'fusionar') {
      const rarityArg = args[0] ? args[0].charAt(0).toUpperCase() + args[0].slice(1).toLowerCase() : 'Común';
      const userEco = await db.collection('economy').findOne({ discordId: msg.author.id });
      if (!userEco || !userEco.inventory) return msg.channel.send(`<@${msg.author.id}> 🎒 Tu mochila está vacía.`);

      const counts = {}; const duplicates = [];
      for (const item of userEco.inventory) {
        if (item.rarity === rarityArg) {
          if (counts[item.id]) duplicates.push(item);
          else counts[item.id] = true;
        }
      }

      if (duplicates.length < 3) return msg.channel.send(`<@${msg.author.id}> ❌ Necesitas al menos **3 copias repetidas** de rareza **${rarityArg}**.`);

      const toRemove = duplicates.slice(0, 3);
      const rarities = ['Común', 'Raro', 'Épico', 'Legendario'];
      let currentIdx = rarities.indexOf(rarityArg);
      let resultRarity = rarityArg;
      
      const upgradeChance = currentIdx === 0 ? 0.10 : currentIdx === 1 ? 0.15 : currentIdx === 2 ? 0.20 : 0;
      if (Math.random() < upgradeChance) resultRarity = rarities[currentIdx + 1];

      const possibleRewards = GACHA_ITEMS.filter(i => i.rarity === resultRarity && i.type !== 'coins');
      const selected = possibleRewards[Math.floor(Math.random() * possibleRewards.length)];

      let newInv = [...userEco.inventory];
      for (const itemToRemove of toRemove) {
        const idx = newInv.findIndex(i => i.id === itemToRemove.id);
        if (idx > -1) newInv.splice(idx, 1);
      }
      newInv.push({ id: selected.id, name: selected.name, rarity: selected.rarity, date: new Date() });

      await db.collection('economy').updateOne({ discordId: msg.author.id }, { $set: { inventory: newInv } });
      const upgradeMsg = resultRarity !== rarityArg ? ' ✨ **¡UPGRADE!** ✨' : '';
      msg.channel.send(`<@${msg.author.id}> ♻️ Has fusionado 3 repetidos **${rarityArg}** y obtuviste: **${selected.name}** (${selected.rarity})${upgradeMsg}`);
    }

    // =============================================
    // --- COMANDOS ADMIN (solo ADMIN_DISCORD_ID) ---
    // =============================================
    if (command.startsWith('admin_')) {
      if (!isAdmin(msg.author.id)) {
        return msg.channel.send(`<@${msg.author.id}> 🚫 No tienes permisos de administrador.`);
      }

      // !admin_dar @usuario cantidad
      if (command === 'admin_dar') {
        const target = msg.mentions.users.first();
        const amount = parseInt(args.find(a => !isNaN(a) && a !== ''));
        if (!target || isNaN(amount) || amount <= 0)
          return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_dar @usuario cantidad\``);
        await db.collection('economy').updateOne(
          { discordId: target.id },
          { $inc: { coins: amount }, $set: { discordTag: target.tag } },
          { upsert: true }
        );
        return msg.channel.send(`<@${msg.author.id}> ✅ **+${amount} coins** dados a ${target.username}.`);
      }

      // !admin_quitar @usuario cantidad
      if (command === 'admin_quitar') {
        const target = msg.mentions.users.first();
        const amount = parseInt(args.find(a => !isNaN(a) && a !== ''));
        if (!target || isNaN(amount) || amount <= 0)
          return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_quitar @usuario cantidad\``);
        
        const targetEco = await db.collection('economy').findOne({ discordId: target.id });
        const currentCoins = targetEco ? targetEco.coins : 0;
        const finalAmount = Math.min(amount, currentCoins);

        await db.collection('economy').updateOne(
          { discordId: target.id },
          { $inc: { coins: -finalAmount } }
        );
        return msg.channel.send(`<@${msg.author.id}> ✅ **-${finalAmount} coins** quitados a ${target.username}.`);
      }

      // !admin_setcoins @usuario cantidad
            if (command === 'admin_setcoins') {
        const role = msg.mentions.roles.first();
        const targetUser = msg.mentions.users.first();
        const amount = parseInt(args.find(a => !isNaN(a) && a !== ''));
        
        if (isNaN(amount)) return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_setcoins [@usuario o @rol] cantidad\``);

        if (role) {
          const members = await msg.guild.members.fetch();
          const roleMembers = members.filter(m => m.roles.cache.has(role.id));
          
          for (const [id, member] of roleMembers) {
            await db.collection('economy').updateOne(
              { discordId: id },
              { $set: { coins: amount, discordTag: member.user.tag } },
              { upsert: true }
            );
          }
          return msg.channel.send(`<@${msg.author.id}> ✅ **${amount} coins** asignadas a los **${roleMembers.size}** miembros del rol **${role.name}**.`);
        } else if (targetUser) {
          await db.collection('economy').updateOne(
            { discordId: targetUser.id },
            { $set: { coins: amount, discordTag: targetUser.tag } },
            { upsert: true }
          );
          return msg.channel.send(`<@${msg.author.id}> ✅ Saldo de **${targetUser.username}** establecido en **${amount} coins**.`);
        } else {
          return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_setcoins [@usuario o @rol] cantidad\``);
        }
      }

      // !admin_resetdiario @usuario
      if (command === 'admin_resetdiario') {
        const target = msg.mentions.users.first();
        if (!target) return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_resetdiario @usuario\``);
        await db.collection('economy').updateOne(
          { discordId: target.id },
          { $unset: { lastDaily: '' } }
        );
        return msg.channel.send(`<@${msg.author.id}> ✅ Cooldown de diario reseteado para **${target.username}**.`);
      }

      if (command === 'admin_daritem') {
        const target = msg.mentions.users.first();
        const itemId = args[1];
        const item = GACHA_ITEMS.find(i => i.id === itemId);
        if (!target || !item) return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_daritem @usuario <itemId>\``);
        await db.collection('economy').updateOne(
          { discordId: target.id },
          { $addToSet: { inventory: { id: item.id, name: item.name, rarity: item.rarity, date: new Date() } } },
          { upsert: true }
        );
        return msg.channel.send(`<@${msg.author.id}> ✅ Item **${item.name}** (${item.rarity}) dado a **${target.username}**.`);
      }

      if (command === 'admin_scan') {
        const accounts = await db.collection('accounts').find({}).toArray();
        const statusMsg = await msg.channel.send(`<@${msg.author.id}> 🔍 Escaneando partidas en vivo para **${accounts.length}** cuentas...`);
        
        let found = 0;
        let results = [];

        for (const acc of accounts) {
          try {
            const url = `https://la1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${acc.puuid.trim()}`;
            const res = await fetch(url, {
              headers: {
                "X-Riot-Token": process.env.RIOT_API_KEY.trim(),
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "Accept-Language": "es-ES,es;q=0.9"
              }
            });
            if (res.ok) {
              found++;
              results.push(`✅ **${acc.gameName}**: En partida`);
            } else {
              results.push(`💤 **${acc.gameName}**: No está en partida`);
            }
          } catch (e) {
            results.push(`❌ **${acc.gameName}**: Error de conexión`);
          }
        }

        await statusMsg.edit(`📊 **Resultado del Escaneo:**\n${results.join('\n')}\n\nTotal en vivo: **${found}**`);
        return;
      }

      if (command === 'admin_debug_key') {
        const key = process.env.RIOT_API_KEY || 'NO DEFINIDA';
        const masked = key.length > 10 ? `${key.substring(0, 7)}...${key.substring(key.length - 4)}` : 'Muy corta';
        return msg.channel.send(`<@${msg.author.id}> 🔑 **Debug Key:**\n- Máscara: \`${masked}\`\n- Longitud: \`${key.length}\`\n- Variable ENV: \`${process.env.RIOT_API_KEY ? 'Detectada ✅' : 'No detectada ❌'}\``);
      }

      if (command === 'admin_testlive') {
        const testAcc = { gameName: 'Jugador de Prueba', tagLine: 'LAN' };
        const testData = { championName: 'Naafiri', championId: 'Naafiri' };
        await notifyLiveGame(testAcc, testData);
        return msg.channel.send(`<@${msg.author.id}> ✅ Notificación de partida en vivo de prueba enviada.`);
      }

      if (command === 'admin_testsummary') {
        await sendDailySummary(db);
        return msg.channel.send(`<@${msg.author.id}> ✅ Scoreboard diario de prueba enviado.`);
      }

      if (command === 'admin_testdiario') {
        await sendDailyMotivation(db);
        return msg.channel.send(`<@${msg.author.id}> ✅ Recordatorio diario de prueba enviado.`);
      }

            if (command === 'admin_testbet') {
        const testWinners = [
          { discordId: msg.author.id, amount: 50, multiplier: 2.0, choice: 'gana', anonymous: false }
        ];
        const testLp = { tier: 'EMERALD', rank: 'II', lp: 74, diff: 38 };
        const testHighlights = {
          mvp: { name: 'BODKIN ARROW', champion: 'Vi' },
          topDamage: { name: 'KaisaPlayer', champion: 'Kaisa', value: 42500 },
          topVision: { name: 'SupportGod', champion: 'Thresh', value: 85 },
          topGold: { name: 'BODKIN ARROW', champion: 'Vi', value: 18200 }
        };
        await notifyBetResults('BODKIN ARROW#BHR', 'gana', testWinners, 0, 'Vi', testLp, '18/1/9', DDRAGON_VERSION, 1, 420, testHighlights);
        return msg.channel.send(`<@${msg.author.id}> ✅ Notificación de prueba con MVP y logros enviada.`);
      }

      if (command === 'admin_check') {
        const slug = args.join(' ');
        if (!slug) return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_check Nombre#TAG\``);
        
        const acc = await findAccountBySlug(slug);
        if (!acc) return msg.channel.send(`<@${msg.author.id}> ❌ Jugador no encontrado en el dashboard.`);

        const url = `https://la1.api.riotgames.com/lol/spectator/v5/active-games/by-puuid/${acc.puuid.trim()}`;
        const res = await fetch(url, {
          headers: { "X-Riot-Token": process.env.RIOT_API_KEY.trim() }
        });

        if (res.ok) {
          const game = await res.json();
          // Obtener nombre del campeón
          const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/es_MX/champion.json`);
          const champData = await champRes.json();
          const me = game.participants.find(p => p.puuid === acc.puuid.trim());
          if (!me) {
            return msg.channel.send(`<@${msg.author.id}> ❌ Error: El jugador está en partida pero su PUUID no coincide de forma estricta (posible error de formato).`);
          }
          const champName = Object.values(champData.data).find(c => c.key == me.championId)?.name || 'Desconocido';

          const champKey = Object.keys(champData.data).find(key => champData.data[key].key == me.championId); 
          const cName = champKey ? champData.data[champKey].name : 'Desconocido'; 
          
          // Guardar timestamp para que las apuestas funcionen (igual que el flujo automático)
          await db.collection('accounts').updateOne(
            { puuid: acc.puuid },
            { $set: { liveGameStartedAt: new Date(), lastLiveGameId: game.gameId } }
          );

          const sentMsg = await notifyLiveGame(acc, { championName: cName, championId: champKey });
          
          if (sentMsg) {
            setTimeout(() => {
              sentMsg.delete().catch(() => {});
            }, 5 * 60 * 1000);
          }

          return msg.channel.send(`<@${msg.author.id}> ✅ **${acc.gameName}** está en partida. Notificación enviada.`);
        } else {
          return msg.channel.send(`<@${msg.author.id}> 💤 **${acc.gameName}** no parece estar en partida ahora mismo.`);
        }
      }

      // !admin_clearinv @usuario
      if (command === 'admin_clearinv') {
        const target = msg.mentions.users.first();
        if (!target) return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_clearinv @usuario\``);
        await db.collection('economy').updateOne(
          { discordId: target.id },
          { $set: { inventory: [] } }
        );
        return msg.channel.send(`<@${msg.author.id}> ✅ Inventario de **${target.username}** vaciado.`);
      }

      // !admin_anuncio [mensaje]
      if (command === 'admin_anuncio') {
        const message = args.join(' ');
        if (!message) return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_anuncio [mensaje]\``);
        const embed = new EmbedBuilder()
          .setTitle('📢 ANUNCIO OFICIAL')
          .setDescription(message)
          .setColor(0xf4c874)
          .setTimestamp()
          .setFooter({ text: 'LAN Tracker Bot' });
        await msg.channel.send({ embeds: [embed] });
        return msg.delete().catch(() => {});
      }

      // !admin_stats
      if (command === 'admin_stats') {
        const totalUsers = await db.collection('economy').countDocuments();
        const richest = await db.collection('economy').find({}).sort({ coins: -1 }).limit(1).toArray();
        const allCoins = await db.collection('economy').aggregate([
          { $group: { _id: null, total: { $sum: '$coins' } } }
        ]).toArray();
        const totalItems = await db.collection('economy').aggregate([
          { $project: { count: { $size: { $ifNull: ['$inventory', []] } } } },
          { $group: { _id: null, total: { $sum: '$count' } } }
        ]).toArray();
        const embed = new EmbedBuilder()
          .setTitle('📊 Estadísticas Globales — Admin')
          .addFields(
            { name: '👥 Usuarios registrados', value: `${totalUsers}`, inline: true },
            { name: '💰 Coins en circulación', value: `${allCoins[0]?.total || 0}`, inline: true },
            { name: '🎰 Items en inventarios', value: `${totalItems[0]?.total || 0}`, inline: true },
            { name: '🏆 Usuario más rico', value: richest[0] ? `${richest[0].discordTag} — ${richest[0].coins} coins` : 'N/A', inline: false }
          )
          .setColor(0x576bce);
        return msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
      }

      // !admin_cancelarApuestas Nombre#TAG
      if (command === 'admin_cancelarapuestas') {
        const slug = args.join(' ');
        if (!slug) return msg.channel.send(`<@${msg.author.id}> Uso: \`!admin_cancelarApuestas Nombre#TAG\``);
        const [name, tag] = slug.split('#');
        const acc = await db.collection('accounts').findOne({
          gameName: { $regex: new RegExp(`^${name}$`, 'i') },
          tagLine:  { $regex: new RegExp(`^${tag}$`, 'i') }
        });
        if (!acc) return msg.channel.send(`<@${msg.author.id}> ❌ Jugador no encontrado en el dashboard.`);
        const openBets = await db.collection('bets').find({ targetPuuid: acc.puuid, status: 'open' }).toArray();
        if (!openBets.length) return msg.channel.send(`<@${msg.author.id}> No hay apuestas abiertas para ese jugador.`);
        for (const bet of openBets) {
          await db.collection('economy').updateOne(
            { discordId: bet.discordId },
            { $inc: { coins: bet.amount } }
          );
        }
        await db.collection('bets').updateMany(
          { targetPuuid: acc.puuid, status: 'open' },
          { $set: { status: 'cancelled' } }
        );
        return msg.channel.send(`<@${msg.author.id}> ✅ **${openBets.length}** apuesta(s) canceladas y reembolsadas para **${acc.gameName}#${acc.tagLine}**.`);
      }

      // !admin_resetAll CONFIRMAR
      if (command === 'admin_resetall') {
        if (args[0] !== 'CONFIRMAR') {
          return msg.channel.send(`<@${msg.author.id}> ⚠️ Esto pondrá a **0 coins** a TODOS los usuarios.\nPara confirmar escribe: \`!admin_resetAll CONFIRMAR\``);
        }
        const result = await db.collection('economy').updateMany({}, { $set: { coins: 0 } });
        return msg.channel.send(`<@${msg.author.id}> ✅ Reset global completado. **${result.modifiedCount}** usuario(s) puestos a 0 coins.`);
      }

      // !admin_vincular @usuario Nombre#TAG [Region]
      if (command === 'admin_vincular') {
        const targetUser = msg.mentions.users.first();
        if (!targetUser) return msg.channel.send(`<@${msg.author.id}> ❌ Debes mencionar a un usuario: \`!admin_vincular @usuario Nombre#TAG\``);

        const nameWithTag = args.slice(1).join(' ');
        if (!nameWithTag || !nameWithTag.includes('#')) {
          return msg.channel.send(`<@${msg.author.id}> ❌ Uso: \`!admin_vincular @usuario Nombre#TAG [Region]\``);
        }

        const RIOT_API_KEY = process.env.RIOT_API_KEY;
        if (!RIOT_API_KEY) return msg.channel.send('❌ No hay Riot API Key configurada.');

        let region = 'la1';
        let cleanNameWithTag = nameWithTag;
        
        // Detectar región opcional al final
        const lastArg = args[args.length - 1]?.toLowerCase();
        if (VALID_REGIONS.includes(lastArg)) {
          region = lastArg;
          const tempArgs = args.slice(1);
          tempArgs.pop();
          cleanNameWithTag = tempArgs.join(' ');
        }

        let acc = await findAccountBySlug(cleanNameWithTag);
        let isNew = false;

        const [name, tag] = cleanNameWithTag.split('#').map(s => s.trim());
        const statusMsg = await msg.channel.send(`🔍 Sincronizando **${name}#${tag}** con el servidor central...`);

        try {
          const apiRes = await fetch('https://lan-tracker-production.up.railway.app/api/summoners', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameName: name, tagLine: tag, region: region })
          });

          if (!apiRes.ok) {
            const errData = await apiRes.json();
            statusMsg.delete().catch(() => {});
            return msg.channel.send(`❌ **Error de Sincronización:** ${errData.message || 'La web no pudo procesar la solicitud'}.`);
          }

          const data = await apiRes.json();
          
          if (!data || !data.account) {
            statusMsg.delete().catch(() => {});
            return msg.channel.send(`❌ **Error de Formato:** La web respondió pero no envió los datos de la cuenta.`);
          }

          const puuid = data.account.puuid;

          // 1. Vincular discordId en la colección de cuentas
          await db.collection('accounts').updateOne(
            { puuid: puuid },
            { $set: { discordId: targetUser.id } }
          );

          // 2. Vincular en la colección de economía (Solo establece el PUUID si es la primera vez)
          await db.collection('economy').updateOne(
            { discordId: targetUser.id },
            { 
              $set: { discordTag: targetUser.tag },
              $setOnInsert: { 
                puuid: puuid,
                linkedPuuid: puuid, // Mantener compatibilidad
                coins: 100, 
                lastDaily: null, 
                inventory: [] 
              }
            },
            { upsert: true }
          );

          statusMsg.delete().catch(() => {});
          return msg.channel.send(`✅ **VÍNCULO MANUAL COMPLETADO**\nUsuario: <@${targetUser.id}>\nCuenta LoL: **${data.account.gameName}#${data.account.tagLine}**\n*Sincronizado con la web y economía actualizada.*`);
        } catch (err) {
          console.error('[Admin Sync Error]', err);
          statusMsg.delete().catch(() => {});
          return msg.channel.send(`❌ **Error técnico:** \`${err.message}\`.`);
        }
      }

      // !admin_purge [cantidad]
      if (command === 'admin_purge') {
        const amount = args[0] ? parseInt(args[0]) : 100;
        if (isNaN(amount) || amount <= 0 || amount > 100) {
          return msg.channel.send(`<@${msg.author.id}> ⚠️ Elija un número entre 1 y 100.`);
        }

        try {
          // Eliminar mensajes (filtrando los de más de 14 días automáticamente)
          const deleted = await msg.channel.bulkDelete(amount, true);
          const confirm = await msg.channel.send(`✅ Se han eliminado **${deleted.size}** mensajes.`);
          setTimeout(() => confirm.delete().catch(() => {}), 5000);
        } catch (e) {
          console.error('[Purge Error]', e);
          msg.channel.send(`<@${msg.author.id}> ❌ Error al intentar borrar mensajes. (Nota: Discord no permite borrar masivamente mensajes de más de 14 días).`);
        }
      }
      // !admin_syncroles
      if (command === 'admin_syncroles') {
        const accounts = await db.collection('accounts').find({ discordId: { $exists: true } }).toArray();
        msg.channel.send(`<@${msg.author.id}> 🔄 Sincronizando roles para **${accounts.length}** usuarios...`);
        
        let success = 0;
        for (const acc of accounts) {
          const tier = acc.soloQ?.tier;
          if (tier) {
            const ok = await updateUserRoles(acc.discordId, tier);
            if (ok) success++;
          }
        }
        return msg.channel.send(`✅ Sincronización completada: **${success}/${accounts.length}** actualizados.`);
      }

      // !admin_vinculos
      if (command === 'admin_vinculos') {
        const accounts = await db.collection('accounts').find({}).toArray();
        const members = await msg.guild.members.fetch();
        const linkedIds = accounts.filter(a => a.discordId).map(a => a.discordId);
        
        const linkedStr = accounts.filter(a => a.discordId).map(a => `✅ **${a.gameName}** -> <@${a.discordId}>`).join('\n') || 'Nadie vinculado.';
        const unlinkedAccStr = accounts.filter(a => !a.discordId).map(a => `❌ **${a.gameName}#${a.tagLine}** (Sin Discord)`).join('\n');
        
        const unlinkedMembers = members.filter(m => !m.user.bot && !linkedIds.includes(m.id));
        const mentionList = unlinkedMembers.map(m => `<@${m.id}>`).join(', ') || 'Todos vinculados.';

        const embed = new EmbedBuilder()
          .setTitle('🔗 Auditoría de Vinculación')
          .addFields(
            { name: 'Cuentas Vinculadas', value: linkedStr.length > 1024 ? linkedStr.substring(0, 1021) + '...' : linkedStr },
            { name: 'Cuentas LoL sin Discord', value: unlinkedAccStr.length > 1024 ? unlinkedAccStr.substring(0, 1021) + '...' : (unlinkedAccStr || 'Ninguna') },
            { name: 'Miembros Discord sin Vincular', value: mentionList.length > 1024 ? mentionList.substring(0, 1021) + '...' : mentionList }
          )
          .setColor(0x3498db);

        let content = `<@${msg.author.id}>`;
        if (unlinkedMembers.size > 0) {
          content += `\n⚠️ **Atención:** ${unlinkedMembers.map(m => `<@${m.id}>`).join(' ')} ¡Viculen sus cuentas con \`!vincular Nombre#TAG\`!`;
        }
        return msg.channel.send({ content, embeds: [embed] });
      }

      if (command === 'admin_testretos') {
        if (!isAdmin(msg.author.id)) return;
        await sendChallengeReminder(dbInstance);
        return;
      }

      if (command === 'admin_testhall') {
        if (!isAdmin(msg.author.id)) return;
        const sent = await sendMonthlyHallOfFame(dbInstance);
        if (!sent) {
          await msg.channel.send('⚠️ No hay datos reales del mes pasado. Generando un **Ejemplo Visual** con datos ficticios...');
          await sendMonthlyHallOfFame(dbInstance, true); // Pasar true para usar datos mock
        }
        return;
      }
    }

  });

  // --- MANEJO DE INTERACCIONES (BOTONES Y MODALS) ---
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        const action = parts[0];

        if (action === 'help') {
          const typeHelp = parts[1];
          const userId = parts[2];
          if (interaction.user.id !== userId) {
            return interaction.reply({ content: '❌ No tienes acceso a esta ayuda.', ephemeral: true });
          }

          if (typeHelp === 'main') {
            const helpEmbed = new EmbedBuilder()
              .setTitle('🐾 Guía de Comandos - LAN Tracker')
              .setDescription('¡Bienvenido a la perrera! Aquí tienes todo lo que puedes hacer:')
              .addFields(
                { name: '👤 Perfil y Rango', value: '`!vincular N#T [Reg]` - Conecta tu cuenta 🔗.\n`!perfil [N#T]` - Mira tu rango y racha.\n`!ladder` - Top 10 Jugadores del servidor.\n`!shame` - Muro de la vergüenza 🤡.\n`!web` - Enlace a tu perfil web privado.' },
                { name: '💰 Economía', value: '`!monedas` - Consulta tu saldo actual.\n`!diario` - Reclama tu bono diario (100 coins).\n`!pagar @usuario [cant]` - Envía coins a un amigo.\n`!top_ricos` - Ranking de millonarios.' },
                { name: '🎮 Colección y Gachapon', value: '`!gacha` - Tira el Gachapon (10 coins) 🎰.\n`!mochila` - Mira tu colección de cartas.\n`!trade @usuario MiItem, SuItem` - Intercambia cartas 🤝.\n`!reroll [Rareza]` - Fusiona 3 repetidos para mejorar.\n`!reciclar` - Convierte repetidos en coins instantáneamente.' },
                { name: '🎰 Apuestas y Retos', value: '`!ludopata` - Mira tu historial y winrate de apuestas.\n`!retos` - Consulta el Tablón de Caza activo 🐾.' }
              )
              .setColor(0x576bce)
              .setFooter({ text: 'Naafiri Bot · LAN Tracker' });

            await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
          } else if (typeHelp === 'admin') {
            const adminEmbed = new EmbedBuilder()
              .setTitle('🛠️ Panel de Administración - LAN Tracker')
              .addFields(
                { name: '🛠️ Gestión de Cuentas', value: '`!admin_vincular @u N#T` - Vincular manual (vía API).\n`!admin_dar @u [cant]` / `!admin_quitar @u [cant]`\n`!admin_setcoins @u [cant]` / `!admin_resetdiario @u`\n`!admin_resetall CONFIRMAR` - Reset total economía.' },
                { name: '🎒 Gestión de Inventario', value: '`!admin_daritem @u [id]` - Dar carta específica.\n`!admin_clearinv @u` - Vaciar mochila.' },
                { name: '📡 Monitoreo y Auditoría', value: '`!admin_scan` - Forzar escaneo en vivo.\n`!admin_vinculos` - Usuarios no vinculados.\n`!admin_stats` - Estadísticas del bot.\n`!admin_check @u` - Info técnica de un usuario.' },
                { name: '🎭 Sistema y Herramientas', value: '`!admin_anuncio [msg]` - Mensaje global.\n`!admin_syncroles` - Sincronizar roles Discord.\n`!admin_purge [n]` - Limpiar chat.\n`!admin_debug_key` - Estado Riot API.' },
                { name: '🧪 Pruebas Premium', value: '`!admin_testitem [Nombre]` / `!admin_testgacha [Rareza]`\n`!admin_testpro` - Test Pro Player.\n`!admin_testlive` - Test Notificación Live Game.' },
                { name: '📅 Pruebas de Notificaciones', value: '`!admin_testdiario` - Recordatorio 12pm.\n`!admin_testsummary` - Scoreboard diario.\n`!admin_testretos` - Imagen de Retos.\n`!admin_testhall` - Salón de la Fama.\n`!admin_cancelarapuestas N#T` - Abortar apuestas.' }
              )
              .setColor(0xd93f3f)
              .setFooter({ text: 'Naafiri Admin Console' });

            await interaction.reply({ embeds: [adminEmbed], ephemeral: true });
          }
          
          return interaction.message.delete().catch(() => {});
        }

        if (action === 'web') {
          const userId = parts[2];
          if (interaction.user.id !== userId) {
            return interaction.reply({ content: '❌ Solo el autor del comando puede generar su link.', ephemeral: true });
          }
          const url = `https://lan-tracker-production.up.railway.app/perfil/${userId}`;
          await interaction.reply({ 
            content: `🔗 Aquí tienes tu perfil privado:\n${url}`, 
            ephemeral: true 
          });
        // Eliminar el mensaje público original
          return interaction.message.delete().catch(() => {});
        }

        const parts_bet = interaction.customId.split('_');
        const act = parts_bet[0];

        if (act === 'daily') {
          const now = new Date();
          const user = await dbInstance.collection('economy').findOne({ discordId: interaction.user.id });
          
          if (user && user.lastDaily) {
            const diff = now - new Date(user.lastDaily);
            const waitTime = 24 * 60 * 60 * 1000;
            if (diff < waitTime) {
              const remaining = waitTime - diff;
              const hours = Math.floor(remaining / (1000 * 60 * 60));
              const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
              return interaction.reply({ content: `⌛ Ya reclamaste tus monedas hoy. Vuelve en **${hours}h ${minutes}m**.`, ephemeral: true });
            }
          }

          await dbInstance.collection('economy').updateOne(
            { discordId: interaction.user.id }, 
            { $set: { lastDaily: new Date(), discordTag: interaction.user.tag }, $inc: { coins: 100 } }, 
            { upsert: true }
          );
          return interaction.reply({ content: `💰 ¡Has cobrado tus **100 Naafiri Coins** diarias! Úsalas sabiamente.`, ephemeral: true });
        }

        const choice = parts_bet[1];
        const puuid = parts_bet.slice(2).join('_');

        if (act === 'bet') {
          // Obtener saldo del usuario para mostrarlo en el modal
          const userEco = await dbInstance.collection('economy').findOne({ discordId: interaction.user.id });
          const currentCoins = userEco ? userEco.coins : 0;

          const modal = new ModalBuilder()
            .setCustomId(`modal_bet_${choice}_${puuid}`)
            .setTitle(`Apuesta: ${choice.toUpperCase()} (Saldo: ${currentCoins})`);

          const amountInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel(`¿Cuánto apostar? (Saldo: ${currentCoins})`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Ej: 100 (Tienes ${currentCoins})`)
            .setRequired(true);

          const firstActionRow = new ActionRowBuilder().addComponents(amountInput);
          modal.addComponents(firstActionRow);

          await interaction.showModal(modal);
          return;
        }
      }

      if (interaction.isModalSubmit()) {
        const parts = interaction.customId.split('_');
        const [type, action, choice] = parts;
        const puuid = parts.slice(3).join('_');

        if (type !== 'modal' || action !== 'bet') return;

        const amount = parseInt(interaction.fields.getTextInputValue('bet_amount'));
        if (isNaN(amount) || amount <= 0) {
          return interaction.reply({ content: '❌ Cantidad inválida. Debe ser un número mayor a 0.', ephemeral: true });
        }

        const targetAcc = await dbInstance.collection('accounts').findOne({ puuid: puuid.trim() });
        if (!targetAcc) return interaction.reply({ content: `❌ El jugador con ID \`${puuid.substring(0,8)}...\` ya no está registrado o hubo un error de sesión.`, ephemeral: true });

        // Validar tiempo (5 min)
        if (targetAcc.liveGameStartedAt) {
          const now = new Date();
          const startedAt = new Date(targetAcc.liveGameStartedAt);
          if ((now - startedAt) / 60000 >= 5) {
            return interaction.reply({ content: `❌ **Demasiado tarde.** La partida empezó hace más de 5 minutos.`, ephemeral: true });
          }
        } else {
          return interaction.reply({ content: '❌ No detecto que el jugador esté en partida ahora mismo.', ephemeral: true });
        }

        // Validar saldo
        const user = await dbInstance.collection('economy').findOne({ discordId: interaction.user.id });
        if (!user || user.coins < amount) {
          return interaction.reply({ content: `❌ No tienes suficientes Naafiri Coins (Saldo: ${user?.coins || 0}).`, ephemeral: true });
        }

        // Validar si ya tiene apuesta
        const existing = await dbInstance.collection('bets').findOne({ discordId: interaction.user.id, targetPuuid: puuid.trim(), status: 'open' });
        if (existing) {
          return interaction.reply({ content: '⚠️ Ya tienes una apuesta activa por este jugador.', ephemeral: true });
        }

        // Calcular multiplicador
        let multiplier = 2.0;
        if (targetAcc.soloQ && (targetAcc.soloQ.wins + targetAcc.soloQ.losses) > 0) {
          const wr = (targetAcc.soloQ.wins / (targetAcc.soloQ.wins + targetAcc.soloQ.losses)) * 100;
          if (wr > 60) multiplier = 1.5;
          else if (wr < 45) multiplier = 3.0;
        }

        // Registrar apuesta
        await dbInstance.collection('bets').insertOne({
          discordId: interaction.user.id,
          amount,
          choice,
          targetPuuid: puuid,
          targetName: `${targetAcc.gameName}#${targetAcc.tagLine}`,
          status: 'open',
          anonymous: false,
          multiplier: multiplier,
          date: new Date()
        });

        await dbInstance.collection('economy').updateOne({ discordId: interaction.user.id }, { $inc: { coins: -amount } });

        await interaction.reply({ 
          content: `✅ **Apuesta registrada con éxito!**\n💰 **Cantidad:** ${amount} coins\n📈 **Multiplicador:** ${multiplier}x\n🎯 **Elección:** Que el jugador **${choice.toUpperCase()}**`, 
          ephemeral: true 
        });
      }

      // --- MANEJO DE TRADE ---
      if (interaction.isButton() && interaction.customId.startsWith('tr_')) {
        const parts = interaction.customId.split('_');
        const action = parts[1];
        const senderId = parts[2];
        const targetId = parts[3];
        const myItemId = parts[4];
        const suItemId = parts[5];

        if (interaction.user.id !== targetId) {
          return interaction.reply({ content: '❌ Solo la persona que recibe la oferta puede responder.', ephemeral: true });
        }

        if (action === 'rej') {
          await interaction.update({ content: '❌ Intercambio rechazado.', embeds: [], components: [] });
          return;
        }

        if (action === 'acc') {
          // Bloquear click doble
          await interaction.deferUpdate();

          const sEco = await dbInstance.collection('economy').findOne({ discordId: senderId });
          const tEco = await dbInstance.collection('economy').findOne({ discordId: targetId });

          if (!sEco.inventory.some(i => i.id === myItemId) || !tEco.inventory.some(i => i.id === suItemId)) {
            return interaction.editReply({ content: '❌ Uno de los items ya no está disponible.', embeds: [], components: [] });
          }

          // Realizar intercambio
          const myItemObj = sEco.inventory.find(i => i.id === myItemId);
          const suItemObj = tEco.inventory.find(i => i.id === suItemId);

          const newSInv = sEco.inventory.filter(i => i.id !== myItemId);
          newSInv.push({ ...suItemObj, date: new Date() });
          
          const newTInv = tEco.inventory.filter(i => i.id !== suItemId);
          newTInv.push({ ...myItemObj, date: new Date() });

          await dbInstance.collection('economy').updateOne({ discordId: senderId }, { $set: { inventory: newSInv, discordTag: interaction.user.tag } });
          await dbInstance.collection('economy').updateOne({ discordId: targetId }, { $set: { inventory: newTInv, discordTag: interaction.user.tag } });

          await interaction.editReply({ 
            content: `✅ **¡Intercambio realizado con éxito!**\n🤝 <@${senderId}> y <@${targetId}> han intercambiado sus campeones.`, 
            embeds: [], 
            components: [] 
          });
        }
      }
    } catch (e) {
      console.error('[Interaction Error]', e);
      if (interaction.isRepliable()) {
        interaction.reply({ content: '❌ Ocurrió un error al procesar tu apuesta.', ephemeral: true }).catch(() => {});
      }
    }
  });

  client.login(process.env.DISCORD_TOKEN);
}

// Función para enviar notificaciones de rango
async function notifyRankChange(data) {
  if (!client || !targetChannelId) return;
  const channel = client.channels.cache.get(targetChannelId);
  if (!channel) return;

  const { name, oldRank, newRank, promoted } = data;
  const color = promoted ? 0x00C65E : 0xd93f3f;
  const emoji = promoted ? '🎉' : '💀';
  const action = promoted ? '¡SUBIÓ DE RANGO!' : 'BAJÓ DE RANGO...';

  const queueName = promoted ? 'Rank Up' : 'Rank Down';
  const title = `${queueName} for ${name}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .addFields(
      { name: 'Rango Actual', value: newRank, inline: true },
      { name: 'Rango Anterior', value: oldRank, inline: true }
    )
    .setColor(color)
    .setTimestamp();

  channel.send({ embeds: [embed] });

  // Actualizar Rol si está vinculado
  if (dbInstance) {
    const acc = await dbInstance.collection('accounts').findOne({ gameName: name });
    if (acc && acc.discordId) {
      updateUserRoles(acc.discordId, newRank.split(' ')[0]);
    }
  }
}

async function updateUserRoles(discordId, tier) {
  if (!client) return false;
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return false;
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return false;

    const roleEnvMap = {
      IRON: 'ROLE_IRON', BRONZE: 'ROLE_BRONZE', SILVER: 'ROLE_SILVER', GOLD: 'ROLE_GOLD',
      PLATINUM: 'ROLE_PLATINUM', EMERALD: 'ROLE_EMERALD', DIAMOND: 'ROLE_DIAMOND',
      MASTER: 'ROLE_MASTER', GRANDMASTER: 'ROLE_GRANDMASTER', CHALLENGER: 'ROLE_CHALLENGER'
    };

    const targetRoleId = process.env[roleEnvMap[tier.toUpperCase()]];
    if (!targetRoleId) return false;

    const allRankRoleIds = Object.values(roleEnvMap).map(v => process.env[v]).filter(id => id);
    
    // Solo actuar si el usuario no tiene YA el rol correcto
    if (member.roles.cache.has(targetRoleId)) return true;

    // Quitar otros roles de rango
    const rolesToRemove = allRankRoleIds.filter(id => id !== targetRoleId && member.roles.cache.has(id));
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove);
    }
    
    // Añadir nuevo rol
    await member.roles.add(targetRoleId);
    return true;
  } catch (e) {
    console.error(`[Role Error] No se pudo actualizar rol para ${discordId}:`, e.message);
    return false;
  }
}

// Alerta de Partida en Vivo
async function notifyLiveGame(acc, gameData) {
  if (!client || !targetChannelId) return;
  const channel = client.channels.cache.get(targetChannelId);
  if (!channel) return;

  const version = gameData.version || '15.8.1';
  const iconId = gameData.profileIconId || acc.profileIconId || 0;
  const playerIcon = `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
  const champIcon = gameData.championId ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${gameData.championId}.png` : null;

  const tier = acc.soloQ?.tier || 'UNRANKED';
  const rank = acc.soloQ?.rank || '';
  const lp = acc.soloQ?.leaguePoints || 0;
  const rankDisplay = tier === 'UNRANKED' ? 'Unranked' : `${tier} ${rank} (${lp} LP)`;

  const title = `Live Game for ${acc.gameName}#${acc.tagLine}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .addFields(
      { name: 'Campeón', value: gameData.championName || 'Desconocido', inline: true },
      { name: 'Rango', value: rankDisplay, inline: true }
    )
    .setThumbnail(champIcon)
    .setColor(0x576bce)
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`bet_gana_${acc.puuid}`)
        .setLabel('Gana 💰')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`bet_pierde_${acc.puuid}`)
        .setLabel('Pierde 💀')
        .setStyle(ButtonStyle.Danger)
    );

  return await channel.send({ embeds: [embed], components: [row] });
}

const SKIN_THEMES = [
  {
    name: 'PROYECTO',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/MasterYi_5.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Vayne_11.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ashe_11.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Katarina_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lucian_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yasuo_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Zed_1.jpg'
    ]
  },
  {
    name: 'Flor Espiritual',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_27.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yasuo_35.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kindred_12.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Teemo_27.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yone_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Cassiopeia_18.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Riven_23.jpg'
    ]
  },
  {
    name: 'Guardianas de las Estrellas',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_7.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kaisa_29.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Akali_15.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Syndra_7.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Zoe_9.jpg'
    ]
  },
  {
    name: 'Luna de Sangre',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_7.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Akali_5.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Diana_12.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Pyke_16.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Thresh_4.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yasuo_3.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jhin_1.jpg'
    ]
  },
  {
    name: 'Solo ante el Peligro',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lucian_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Senna_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ashe_17.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yasuo_9.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Thresh_14.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Irelia_15.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Viktor_21.jpg'
    ]
  },
  {
    name: 'Fiesta en la Piscina',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/LeeSin_10.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Leona_4.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Renekton_2.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Graves_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ziggs_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Caitlyn_19.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Zoe_2.jpg'
    ]
  },
  {
    name: 'Arcadia',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_7.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Corki_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ezreal_9.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Hecarim_3.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/MissFortune_5.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Sona_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Veigar_8.jpg'
    ]
  },
  {
    name: 'Academia de Combate',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ezreal_18.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jayce_4.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Katarina_15.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_14.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yuumi_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Graves_15.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yone_19.jpg'
    ]
  },
  {
    name: 'K/DA',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_14.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Akali_14.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Evelynn_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kaisa_14.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Seraphine_1.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Akali_15.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_28.jpg'
    ]
  },
  {
    name: 'Cósmicos',
    images: [
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ashe_12.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Kassadin_6.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lux_15.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/MasterYi_11.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Nidalee_27.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/XinZhao_13.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Lulu_26.jpg'
    ]
  }
];

// Recordatorio Primera Victoria (Mediodía)
async function sendDailyMotivation(db) {
  if (!client || !targetChannelId) return;

  try {
    const channel = await client.channels.fetch(targetChannelId);
    if (!channel) return;

    // --- Borrar motivación anterior si existe ---
    try {
      const config = await db.collection('system_config').findOne({ key: 'last_motivation_msg' });
      if (config && config.messageId) {
        const oldMsg = await channel.messages.fetch(config.messageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
    } catch (e) { console.error('[Motivation Delete Error]', e); }

    // Ajuste de Zona Horaria (Caracas)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Caracas',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const now = new Date(
      parts.find(p => p.type === 'year').value,
      parts.find(p => p.type === 'month').value - 1,
      parts.find(p => p.type === 'day').value,
      parts.find(p => p.type === 'hour').value,
      parts.find(p => p.type === 'minute').value,
      parts.find(p => p.type === 'second').value
    );

    // Cálculo de semana del año para rotación
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now - startOfYear) / 86400000;
    const weekIndex = Math.floor((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    const themeIndex = weekIndex % SKIN_THEMES.length;
    const currentTheme = SKIN_THEMES[themeIndex];
    
    const day = now.getDay(); // 0: Domingo, 1: Lunes...
    const splash = currentTheme.images[day] || currentTheme.images[0];

    const dailyMessages = [
      '✨ **¡DOMINGO DE RELAX EN LA MANADA!** ✨\nNo olvides asegurar tus coins antes de que termine el día.',
      '⚔️ **¡LUNES DE CONQUISTA!** ⚔️\nEmpieza la semana con hambre de victoria. ¡Reclama tu botín!',
      '🔥 **¡MARTES DE CACERÍA!** 🔥\nLas presas no se atraparán solas. ¿Ya cobraste tu diario?',
      '🛡️ **¡MIÉRCOLES DE PODER!** 🛡️\nMitad de semana, no bajes el ritmo. Tus 100 coins te esperan.',
      '⚡ **¡JUEVES DE IMPACTO!** ⚡\nCasi es fin de semana. Asegura el oro para el Gachapon.',
      '🎉 **¡VIERNES DE PERREO Y RANKEDS!** 🎉\nCobra tus coins y demuestra quién manda en la grieta.',
      '🍗 **¡SÁBADO DE GLORIA!** 🍗\nDía de vicio intensivo. ¡No te quedes sin tus monedas!'
    ];

    const embed = new EmbedBuilder()
      .setTitle(`✨ LA PERRERA: MENÚ DEL DÍA ✨`)
      .setDescription(dailyMessages[day])
      .setImage(splash)
      .addFields(
        { name: '🌟 Tema de la Semana', value: `\`${currentTheme.name}\``, inline: true },
        { name: '💰 Botín Disponible', value: '`100 Naafiri Coins`', inline: true },
        { name: '⏱️ Disponibilidad', value: '`6 Horas`', inline: true }
      )
      .setColor(0xd4af37)
      .setTimestamp()
      .setFooter({ text: 'Naafiri Bot • Premium Collector Edition' });

    console.log(`[Motivation] Enviando notificación con splash: ${splash}`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('daily_claim')
        .setLabel('Cobrar Botín Diario 💰')
        .setStyle(ButtonStyle.Success)
    );

    const sentMsg = await channel.send({ embeds: [embed], components: [row] });

    // Guardar ID en DB para el siguiente borrado
    await db.collection('system_config').updateOne(
      { key: 'last_motivation_msg' },
      { $set: { messageId: sentMsg.id, sentAt: new Date() } },
      { upsert: true }
    );

    // Auto-borrado tras 6 horas
    setTimeout(() => {
      sentMsg.delete().catch(() => {});
    }, 6 * 60 * 60 * 1000);
  } catch (e) {
    console.error('[Motivation Error]', e);
  }
}

function getAbsoluteLP(tier, rank, lp) {
  if (!tier || !rank) return 0;
  const tiers = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
  const ranks = ['IV', 'III', 'II', 'I'];
  
  const tierIdx = tiers.indexOf(tier.toUpperCase());
  if (tierIdx === -1) return 0;
  
  if (tierIdx >= 7) {
    return (7 * 400) + lp;
  }
  
  const rankIdx = ranks.indexOf(rank.toUpperCase());
  return (tierIdx * 400) + (rankIdx * 100) + lp;
}

// Resumen Diario
async function sendDailySummary(db) {
  if (!client || !targetChannelId) return;

  try {
    const channel = await client.channels.fetch(targetChannelId);
    if (!channel) return;

    const statusMsg = await channel.send('⏳ Generando Scoreboard Diario...');

    const accounts = await db.collection('accounts').find({}).toArray();
    if (!accounts.length) return;

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  
  const getDateStr = (daysAgo) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };

  const todayStr = getDateStr(0);
  const yesterdayStr = getDateStr(1);
  const weekAgoStr = getDateStr(7);

  const stats = accounts.map(acc => {
    const current = acc.soloQ;
    if (!current) {
      return { 
        name: acc.gameName ? `${acc.gameName}#${acc.tagLine}` : 'Desconocido', 
        rank: 'Unranked', 
        lp24h: 0, lp7d: 0, games: 0, wr: '-', 
        absLp: -1 
      };
    }

    const absCurrent = getAbsoluteLP(current.tier, current.rank, current.leaguePoints);
    const snapshots = acc.snapshots || {};
    
    const snap24h = snapshots[yesterdayStr] || snapshots[todayStr] || current;
    const snap7d = snapshots[weekAgoStr] || snapshots[yesterdayStr] || snapshots[todayStr] || current;

    const abs24h = getAbsoluteLP(snap24h.tier, snap24h.rank, snap24h.leaguePoints);
    const abs7d = getAbsoluteLP(snap7d.tier, snap7d.rank, snap7d.leaguePoints);

    const lp24h = absCurrent - abs24h;
    const lp7d = absCurrent - abs7d;

    const gamesPlayed = (current.wins - snap24h.wins) + (current.losses - snap24h.losses);
    const winsToday = current.wins - snap24h.wins;
    const wr = gamesPlayed > 0 ? Math.round((winsToday / gamesPlayed) * 100) + '%' : '-';

    const shortTier = TIER_SHORT[current.tier.toUpperCase()] || current.tier;
    const rankLabel = `${shortTier} ${current.rank}`;

    return {
      name: acc.gameName,
      rank: `${rankLabel} - ${current.leaguePoints} LP`,
      lp24h,
      lp7d,
      games: gamesPlayed,
      wr,
      absLp: absCurrent
    };
  });

  stats.sort((a, b) => b.absLp - a.absLp);

  let bgBase64 = '';
  const possiblePaths = [
    path.join(__dirname, 'assets', 'pic', 'bg.jpg'),
    path.join(__dirname, 'assets', 'pic', 'bg.png'),
    path.join(__dirname, 'assets', 'bg.jpg'),
    path.join(__dirname, 'assets', 'bg.png'),
    path.join(process.cwd(), 'public', 'pic', 'bg.jpg'),
    path.join(process.cwd(), 'public', 'pic', 'bg.png'),
    path.join(process.cwd(), 'public', 'bg.jpg'),
    path.join(process.cwd(), 'public', 'bg.png')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const bitmap = fs.readFileSync(p);
        const ext = path.extname(p).toLowerCase();
        const mimeType = (ext === '.png') ? 'image/png' : 'image/jpeg';
        bgBase64 = `data:${mimeType};base64,${Buffer.from(bitmap).toString('base64')}`;
        break;
      } catch (e) { console.error(`Error leyendo ${p}:`, e); }
    }
  }

  let rowsHtml = '';
  stats.forEach((s, idx) => {
    let medalStyle = '';
    let posText = idx + 1;
    let isLeader = idx === 0;
    
    if (idx === 0) medalStyle = 'color: #FFD700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.6); font-weight: 800;';
    else if (idx === 1) medalStyle = 'color: #C0C0C0; text-shadow: 0 0 10px rgba(192, 192, 192, 0.4); font-weight: 800;';
    else if (idx === 2) medalStyle = 'color: #CD7F32; text-shadow: 0 0 10px rgba(205, 127, 50, 0.4); font-weight: 800;';
    else medalStyle = 'color: #ffffff; opacity: 0.8;';

    let streakTag = '';
    const wrVal = parseInt(s.wr) || 0;
    if (s.games >= 3) {
      if (wrVal >= 60) streakTag = '<span class="streak hot">🔥 HOT</span>';
      else if (wrVal <= 40) streakTag = '<span class="streak cold">❄️ COLD</span>';
    }

    const lp24Class = s.lp24h > 0 ? 'positive' : (s.lp24h < 0 ? 'negative' : 'neutral');
    const lp7dClass = s.lp7d > 0 ? 'positive' : (s.lp7d < 0 ? 'negative' : 'neutral');
    const lp24Str = s.lp24h > 0 ? `+${s.lp24h}` : `${s.lp24h}`;
    const lp7dStr = s.lp7d > 0 ? `+${s.lp7d}` : `${s.lp7d}`;

    rowsHtml += `
      <div class="row ${isLeader ? 'leader-row' : ''}">
        <div class="col-pos" style="${medalStyle}">${posText}</div>
        <div class="col-name">${s.name} ${streakTag}</div>
        <div class="col-rank">${s.rank}</div>
        <div class="col-lp ${lp24Class}">${lp24Str}</div>
        <div class="col-lp ${lp7dClass}">${lp7dStr}</div>
        <div class="col-games">${s.games}</div>
        <div class="col-wr">${s.wr}</div>
      </div>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body {
          margin: 0; padding: 0;
          background-color: #000;
          font-family: 'Inter', sans-serif;
          color: #ffffff;
          display: flex;
          justify-content: center;
          align-items: center;
          width: 950px;
          height: auto;
          overflow: hidden;
          ${bgBase64 ? `background-image: url('${bgBase64}'); background-size: cover; background-position: center;` : 'background: linear-gradient(135deg, #0f0f11 0%, #1a1a1e 100%);'}
        }
        #container {
          padding: 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
        }
        #scoreboard {
          width: 100%;
          background: rgba(15, 15, 17, 0.9);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          border: 1px solid rgba(212, 175, 55, 0.4);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
          box-sizing: border-box;
        }
        .header-title {
          text-align: center;
          font-size: 38px;
          font-weight: 800;
          color: #d4af37;
          text-transform: uppercase;
          letter-spacing: 6px;
          margin-bottom: 40px;
          text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
        }
        .table-header {
          display: flex;
          background: rgba(212, 175, 55, 0.25);
          padding: 18px 25px;
          border-radius: 14px;
          font-weight: 800;
          color: #d4af37;
          margin-bottom: 20px;
          text-transform: uppercase;
          font-size: 15px;
          letter-spacing: 2px;
        }
        .row {
          display: flex;
          padding: 20px 25px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          align-items: center;
        }
        .leader-row {
          background: rgba(212, 175, 55, 0.12);
          border-left: 6px solid #d4af37;
          border-radius: 8px;
        }
        .col-pos { width: 80px; text-align: center; font-size: 24px; }
        .col-name { width: 260px; font-weight: 700; display: flex; align-items: center; gap: 15px; font-size: 19px; }
        .col-rank { width: 200px; color: #e2e8f0; font-size: 16px; }
        .col-lp { width: 100px; text-align: right; font-weight: 800; font-family: monospace; font-size: 19px; }
        .col-games { width: 90px; text-align: center; color: #fbd38d; font-weight: 800; font-size: 19px; }
        .col-wr { width: 80px; text-align: right; color: #90cdf4; font-weight: 800; font-size: 19px; }
        
        .streak {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 900;
        }
        .hot { background: #f56565; color: #fff; box-shadow: 0 0 12px rgba(245, 101, 101, 0.6); }
        .cold { background: #4299e1; color: #fff; box-shadow: 0 0 12px rgba(49, 130, 206, 0.6); }
        
        .positive { color: #68d391; }
        .negative { color: #feb2b2; }
        .neutral { color: #a0aec0; }

        .watermark {
          margin-top: 30px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 5px;
          font-weight: 800;
        }
      </style>
    </head>
    <body>
      <div id="container">
        <div id="scoreboard">
          <div class="header-title">Scoreboard de las Perritas</div>
          <div class="table-header">
            <div class="col-pos"></div>
            <div class="col-name">Niggers</div>
            <div class="col-rank">Rank</div>
            <div class="col-lp">LP (24h)</div>
            <div class="col-lp">LP (7d)</div>
            <div class="col-games">G</div>
            <div class="col-wr">WR</div>
          </div>
          ${rowsHtml}
        </div>
        <div class="watermark">Generado por naafiri bot</div>
      </div>
    </body>
    </html>
  `;

  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 950, height: 100, deviceScaleFactor: 3 }); 
      await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
      
      const height = await page.evaluate(() => document.getElementById('container').offsetHeight);
      await page.setViewport({ width: 950, height: height, deviceScaleFactor: 3 });

      const element = await page.$('#container');
      const imageBuffer = await element.screenshot({ type: 'png' });

      const attachment = new AttachmentBuilder(imageBuffer, { name: 'scoreboard.png' });
      const sentMsg = await channel.send({ files: [attachment] });

      // Guardar ID en DB para el siguiente borrado
      await db.collection('system_config').updateOne(
        { key: 'last_summary_msg' },
        { $set: { messageId: sentMsg.id, sentAt: new Date() } },
        { upsert: true }
      );

      // Auto-borrado tras 6 horas (por si acaso)
      setTimeout(() => {
        sentMsg.delete().catch(() => {});
      }, 6 * 60 * 60 * 1000);
    } finally {
      await browser.close().catch(() => {});
    }

    } catch (e) {
      console.error('[Scoreboard Error]', e);
      channel.send('❌ Hubo un error generando la imagen del scoreboard.');
    }
  } catch (err) {
    console.error('[Daily Summary Global Error]', err);
  }
}

const QUEUE_NAMES = {
  420: 'SoloQ',
  440: 'Flex'
};


// Notificación de resultados de apuestas
async function notifyBetResults(targetName, result, winners, profileIconId, championId, lpData, kda, version, totalBets = 0, queueId = 420, highlights = null) {
  if (!client || !targetChannelId) return;
  const channel = client.channels.cache.get(targetChannelId);
  if (!channel) return;

  const v = version || '15.8.1';
  const playerIcon = `https://ddragon.leagueoflegends.com/cdn/${v}/img/profileicon/${profileIconId || 0}.png`;
  const champIcon = championId ? `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${championId}.png` : null;

  const queueName = QUEUE_NAMES[queueId] || 'Partida';
  const resultText = result === 'gana' ? 'Victory' : 'Defeat';
  const title = `${queueName} ${resultText} for ${targetName}`;

  let rankStr = 'N/A';
  let lpChangeStr = '+0 LP';

  if (lpData && typeof lpData === 'object') {
    const shortTier = TIER_SHORT[lpData.tier] || lpData.tier || '';
    const div = lpData.rank || '';
    rankStr = `${shortTier} ${div} - ${lpData.lp}LP`;
    const prefix = lpData.diff >= 0 ? '+' : '';
    lpChangeStr = `${prefix}${lpData.diff} LP`;
  } else if (typeof lpData === 'string') {
    rankStr = lpData;
  }

  const embedBet = new EmbedBuilder()
    .setTitle(title)
    .setThumbnail(champIcon)
    .addFields(
      { name: 'K/D/A', value: kda || '0/0/0', inline: true },
      { name: 'Rank', value: rankStr, inline: true },
      { name: 'LP Win', value: lpChangeStr, inline: true }
    )
    .setColor(result === 'gana' ? 0x576bce : 0xd93f3f)
    .setTimestamp();



  // Lógica de ganadores: solo si hubo apuestas
  if (totalBets > 0) {
    const description = winners.length > 0 
      ? `**Ganadores:**\n${winners.map(w => {
          const userStr = w.anonymous ? '👤 *Anónimo*' : `<@${w.discordId}>`;
          const prize = Math.floor(w.amount * (w.multiplier || 2));
          return `${userStr} (Elección: **${w.choice.toUpperCase()}**) - Ganó **${prize} 💰**`;
        }).join('\n')}`
      : 'No hubo ganadores esta vez.';
    embedBet.setDescription(description);
  }

  channel.send({ embeds: [embedBet] });
}

// Notificación de Remake
async function notifyRemake(targetName) {
  if (!client || !targetChannelId) return;
  const channel = client.channels.cache.get(targetChannelId);
  if (!channel) return;

  const title = `Remake for ${targetName}`;

  const embedRemake = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`La partida fue un remake (menos de 3:30 min).\nTodas las apuestas han sido **reembolsadas** automáticamente. 💰`)
    .setColor(0xf39c12)
    .setTimestamp();

  channel.send({ embeds: [embedRemake] });
}

// Notificación de Reto Completado
async function notifyChallengeComplete(targetName, challenges, coins) {
  if (!client || !targetChannelId) return;
  const channel = client.channels.cache.get(targetChannelId);
  if (!channel) return;

  const title = `Challenge Complete for ${targetName}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .addFields(
      { name: 'Retos Superados', value: challenges.map(c => `🔹 ${c}`).join('\n'), inline: false },
      { name: 'Recompensa', value: `${coins} Naafiri Coins 💰`, inline: true }
    )
    .setColor(0xf4c874)
    .setThumbnail('https://static.wikia.nocookie.net/leagueoflegends.com/images/1/1b/Season_2023_-_Master_1.png')
    .setTimestamp();

  channel.send({ embeds: [embed] });
}

// Función para notificar al admin vía DM
async function generateChallengeImage(db) {
  let cardsHtml = '';
  let topHuntersHtml = '';
  
  // 1. Obtener Top Cazadores (Horizontal Podium)
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const activities = await db.collection('activities').find({
      type: 'challenge_win',
      timestamp: { $gte: startOfMonth }
    }).toArray();

    const stats = {};
    activities.forEach(a => {
      let name = a.message ? a.message.split('¡')[1]?.split(' ha')[0] : 'Desconocido';
      if (!name) name = a.discordId || 'Desconocido';
      stats[name] = (stats[name] || 0) + 1;
    });

    const sortedHunters = Object.entries(stats).sort((a,b) => b[1] - a[1]).slice(0, 4);
    
    const iconTrophy = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#f1c40f" style="vertical-align: middle; margin-left: 6px;"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v3c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 10V7h2v3c0 1.21-.88 2.22-2 2.22c-.6 0-1-.4-1-1.22zm14 0c0 .82-.4 1.22-1 1.22c-1.12 0-2-1.01-2-2.22V7h2v3z"/></svg>`;

    if (sortedHunters.length > 0) {
      topHuntersHtml = sortedHunters.map((h, idx) => `
        <div class="hunter-podium-item">
          <span class="rank-badge">${idx + 1}</span>
          <span class="hunter-name-small">${h[0]}</span>
          <span class="hunter-score">${h[1]}${iconTrophy}</span>
        </div>
      `).join('');
    } else {
      topHuntersHtml = '<div class="no-hunters-msg" style="font-size: 28px; color: rgba(255,255,255,0.6);">Esperando a los primeros cazadores del mes...</div>';
    }
  } catch (e) { console.error('[Hunters Error]', e); }

  // 2. Generar Cards de Retos (Grid)
  CHALLENGES_LIST.forEach(c => {
    const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/${c.icon}`;
    cardsHtml += `
      <div class="challenge-tile" style="border-top: 3px solid ${c.color}">
        <div class="tile-content">
          <img src="${iconUrl}" class="tile-icon">
          <div class="tile-main">
            <div class="tile-name">${c.name}</div>
            <div class="tile-desc">${c.description}</div>
          </div>
        </div>
        <div class="tile-reward-bar">
          <span class="reward-tag">BOUNTY</span>
          <span class="reward-amount" style="color: ${c.color}">${c.reward}</span>
        </div>
      </div>
    `;
  });

  // 3. Cargar Assets
  let bgUrl = '', logoUrl = '', textoUrl = '';
  try {
    const fs = require('fs');
    const path = require('path');
    
    const loadAsBase64 = (relPath) => {
      const p = path.join(__dirname, 'assets', relPath);
      if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
      return '';
    };

    bgUrl = loadAsBase64('bg.jpg');
    logoUrl = loadAsBase64('estetica/logo.png');
    textoUrl = loadAsBase64('estetica/texto.png');
  } catch (e) { console.error('[Branding Load Error]', e); }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
        body { 
          margin: 0; padding: 60px; 
          background: ${bgUrl ? `url(${bgUrl})` : '#0a0a0c'} no-repeat center center; 
          background-size: cover;
          font-family: 'Outfit', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif; 
          color: #fff; 
          width: 1200px; height: auto; position: relative; overflow: hidden;
        }
        body::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(circle at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.98) 100%);
          z-index: 0;
        }
        .content { position: relative; z-index: 1; }
        
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 50px; }
        .branding-group { display: flex; align-items: center; gap: 20px; }
        .logo-img { height: 100px; width: auto; filter: drop-shadow(0 0 20px rgba(212,175,55,0.4)); }
        .texto-img { height: 60px; width: auto; }
        
        .hunters-bar { background: rgba(212, 175, 55, 0.08); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 50px; padding: 15px 35px; display: flex; align-items: center; gap: 30px; }
        .hunters-bar-label { font-weight: 900; color: #d4af37; font-size: 28px; letter-spacing: 2px; }
        .hunter-podium-item { display: flex; align-items: center; gap: 10px; }
        .rank-badge { background: #d4af37; color: #000; font-weight: 900; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; }
        .hunter-name-small { font-weight: 700; color: #fff; font-size: 28px; }
        .hunter-score { color: #f1c40f; font-weight: 900; font-size: 28px; display: flex; align-items: center; }

        .challenges-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .challenge-tile { background: rgba(15, 15, 20, 0.85); border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; overflow: hidden; box-shadow: 0 15px 50px rgba(0,0,0,0.5); }
        .tile-content { padding: 35px; display: flex; gap: 25px; align-items: center; }
        .tile-icon { width: 100px; height: 100px; border-radius: 18px; border: 3px solid rgba(255,255,255,0.1); background: #000; }
        .tile-main { flex: 1; }
        .tile-name { font-size: 32px; font-weight: 900; color: #fff; margin-bottom: 8px; text-transform: uppercase; }
        .tile-desc { font-size: 32px; color: rgba(255,255,255,0.6); line-height: 1.4; }
        
        .tile-reward-bar { background: rgba(255,255,255,0.03); padding: 22px 35px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); }
        .reward-tag { font-size: 28px; font-weight: 900; color: rgba(255,255,255,0.3); letter-spacing: 3px; }
        .reward-amount { font-size: 28px; font-weight: 900; text-shadow: 0 0 20px rgba(212,175,55,0.3); }

        .footer { text-align: center; margin-top: 60px; font-size: 28px; color: rgba(255,255,255,0.2); letter-spacing: 10px; text-transform: uppercase; font-weight: 900; }
      </style>
    </head>
    <body>
      <div class="content">
        <div class="header">
          <div class="branding-group">
            ${logoUrl ? `<img src="${logoUrl}" class="logo-img">` : ''}
            <div class="title-group">
              ${textoUrl ? `<img src="${textoUrl}" class="texto-img">` : '<h1>Tablón de Caza</h1>'}
              <p style="font-size: 28px; margin: 0; color: rgba(255,255,255,0.6);">Bounty Hunter System</p>
            </div>
          </div>
          <div class="hunters-bar">
            <span class="hunters-bar-label">HALL OF FAME</span>
            ${topHuntersHtml}
          </div>
        </div>
        
        <div class="challenges-grid">
          ${cardsHtml}
        </div>
        
        <div class="footer-tag">Naafiri Bounty System — Secure Connection Established</div>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 100, deviceScaleFactor: 3 }); 
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 1200, height: bodyHeight, deviceScaleFactor: 3 });
    return await page.screenshot({ type: 'png', fullPage: true });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function generateBuildImage(champion) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1800, deviceScaleFactor: 2 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    const url = `https://dpm.lol/champions/${champion}/build`;
    console.log(`[Build Gen] Navegando a ${url}`);
    const response = await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    if (response && response.status() === 404) return null;

    // Scroll para activar lazy loading
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let distance = 200;
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if(totalHeight >= scrollHeight || totalHeight > 3000){
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    await new Promise(r => setTimeout(r, 2000));

    // Limpiar la página
    await page.addStyleTag({
      content: `
        header, nav, footer, iframe, .advertisement, [class*="Ad"], [id*="ad"] { display: none !important; }
        body { background: #0a0a0c !important; }
        main { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; }
      `
    });

    // Identificar secciones por contenido
    const sectionsData = await page.evaluate(() => {
      const getBox = (el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { x, y, width, height };
      };

      // Buscar el contenedor de Runas
      const runeImgs = Array.from(document.querySelectorAll('img[src*="rune"]'));
      let runesContainer = null;
      if (runeImgs.length > 0) {
        runesContainer = runeImgs[0].closest('div');
        while (runesContainer && runesContainer.offsetWidth < 300 && runesContainer.parentElement) {
          runesContainer = runesContainer.parentElement;
        }
      }

      // Buscar el contenedor de Objetos/Build
      const itemImgs = Array.from(document.querySelectorAll('img[src*="item"]'));
      let itemsContainer = null;
      if (itemImgs.length > 0) {
        itemsContainer = itemImgs[0].closest('div');
        while (itemsContainer && itemsContainer.offsetWidth < 400 && itemsContainer.parentElement) {
          itemsContainer = itemsContainer.parentElement;
        }
      }

      return {
        runes: runesContainer && runesContainer.offsetWidth > 100 ? getBox(runesContainer) : null,
        items: itemsContainer && itemsContainer.offsetWidth > 100 ? getBox(itemsContainer) : null
      };
    });

    const buffers = [];

    if (sectionsData.runes && sectionsData.runes.height > 100) {
      buffers.push(await page.screenshot({ 
        clip: { ...sectionsData.runes, height: sectionsData.runes.height + 20 },
        type: 'png'
      }));
    }

    if (sectionsData.items && sectionsData.items.height > 100) {
      buffers.push(await page.screenshot({ 
        clip: { ...sectionsData.items, height: sectionsData.items.height + 20 },
        type: 'png'
      }));
    }

    // Si no encontramos secciones específicas o están vacías, fallback al main completo o página completa
    if (buffers.length === 0) {
      const mainEl = await page.$('main');
      if (mainEl) {
        const mainBox = await mainEl.boundingBox();
        if (mainBox && mainBox.height > 100) {
          buffers.push(await mainEl.screenshot({ type: 'png' }));
        }
      }
    }

    if (buffers.length === 0) {
      buffers.push(await page.screenshot({ type: 'png', fullPage: true }));
    }

    return buffers;
  } catch (e) {
    console.error('[Generate Build Image Error]', e);
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function sendChallengeReminder(db, targetChannel = null) {
  if (!client || (!targetChannelId && !targetChannel)) return;
  const channel = targetChannel || await client.channels.fetch(targetChannelId);
  if (!channel) return;

  try {
    const buffer = await generateChallengeImage(db);
    const attachment = new AttachmentBuilder(buffer, { name: 'retos.png' });

    const embed = new EmbedBuilder()
      .setTitle('📢 ¡ATENCIÓN MANADA! Botines disponibles 🐾')
      .setDescription('Si van a rankear hoy, recuerden que hay Naafiri Coins sobre la mesa. ¡A por ellos!')
      .setImage('attachment://retos.png')
      .setColor(0xd4af37);

    const sentMsg = await channel.send({ embeds: [embed], files: [attachment] });
    
    // Rotar mensaje si es un canal público
    if (db && !targetChannel) {
      await rotateGlobalMessage(db, channel, 'last_challenge_msg', sentMsg);
    }
    
    return sentMsg;
  } catch (e) { 
    console.error('[Challenge Reminder Error]', e); 
    return null;
  }
}

async function generateLadderImage(accounts) {
  let rowsHtml = '';
  
  const iconFire = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#e67e22" style="vertical-align: middle; margin-right: 5px;"><path d="M17.66 11.57c-.77-3.47-3.41-6.1-4.9-7.57-.3-.29-.77-.16-.9.23-.46 1.41-1.3 3.53-2.67 5.4-1.37 1.88-3.19 3.51-3.19 6.37 0 4.14 3.36 7.5 7.5 7.5s7.5-3.36 7.5-7.5c0-1.78-.62-3.41-1.64-4.7-.29-.38-.82-.36-1.1.27-.47.93-1.07 1.57-1.64 1.57-.4 0-.75-.24-.96-.57z"/></svg>`;
  const iconIce = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#3498db" style="vertical-align: middle; margin-right: 5px;"><path d="M22 11h-4.17l3.24-3.24-1.41-1.41L15.41 10H13V7.59l3.66-3.66-1.41-1.41L12 5.76V2h-2v3.76L6.76 2.51 5.34 3.93 9 7.59V10H6.59L2.93 6.34 1.51 7.76 4.76 11H1v2h3.76l-3.24 3.24 1.41 1.41L7 13.41V16.41l-3.66 3.66 1.41 1.41L9 17.83V22h2v-4.17l3.24 3.24 1.41-1.41L13.41 16.41V13.41h2.59l3.66 3.66 1.41-1.41L17.83 13H22v-2z"/></svg>`;

  accounts.forEach((acc, idx) => {
    const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${acc.profileIconId}.png`;
    const tier = acc.soloQ?.tier || 'UNRANKED';
    const rankColor = RANK_COLORS[tier] || '#ffffff';
    
    let wr = 0;
    if (acc.soloQ && (acc.soloQ.wins + acc.soloQ.losses) > 0) {
      wr = Math.round((acc.soloQ.wins / (acc.soloQ.wins + acc.soloQ.losses)) * 100);
    }
    
    const streakContent = (acc.streak >= 2) ? `${iconFire} ${acc.streak}` : (acc.streak <= -2) ? `${iconIce} ${Math.abs(acc.streak)}` : '';

    rowsHtml += `
      <div class="ladder-row" style="border-left: 4px solid ${rankColor}">
        <div class="rank-num">#${idx + 1}</div>
        <img src="${iconUrl}" class="p-icon">
        <div class="p-info">
          <div class="p-name">${acc.gameName}</div>
          <div class="p-tag">#${acc.tagLine}</div>
        </div>
        <div class="p-tier" style="color: ${rankColor}">${tier} ${acc.soloQ?.rank || ''}</div>
        <div class="p-lp">${acc.soloQ?.leaguePoints || 0} LP</div>
        <div class="p-wr">${wr}% WR</div>
        <div class="p-streak">${streakContent}</div>
      </div>
    `;
  });

  // Cargar Assets
  let bgUrl = '', logoUrl = '', textoUrl = '';
  try {
    const fs = require('fs');
    const path = require('path');
    
    const loadAsBase64 = (relPath) => {
      const p = path.join(__dirname, 'assets', relPath);
      if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
      return '';
    };

    bgUrl = loadAsBase64('bg.jpg');
    logoUrl = loadAsBase64('estetica/logo.png');
    textoUrl = loadAsBase64('estetica/texto.png');
  } catch (e) { console.error('[Branding Load Error]', e); }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
        body { 
          margin: 0; padding: 60px; 
          background: ${bgUrl ? `url(${bgUrl})` : '#0a0a0c'} no-repeat center center; 
          background-size: cover;
          font-family: 'Outfit', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', sans-serif; color: #fff; 
          width: 1200px; height: auto; position: relative; overflow: hidden;
        }
        body::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(circle at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%);
          z-index: 0;
        }
        .content { position: relative; z-index: 1; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid rgba(212,175,55,0.3); padding-bottom: 20px; }
        .branding-group { display: flex; align-items: center; gap: 20px; }
        .logo-img { height: 80px; width: auto; filter: drop-shadow(0 0 15px rgba(212,175,55,0.4)); }
        .texto-img { height: 50px; width: auto; }
        
        .ladder-grid { display: flex; flex-direction: column; gap: 12px; }
        .ladder-row { 
          background: rgba(255,255,255,0.03); 
          backdrop-filter: blur(10px);
          border-radius: 8px; padding: 15px 30px; 
          display: flex; align-items: center; gap: 20px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .rank-num { font-size: 24px; font-weight: 900; color: rgba(255,255,255,0.2); width: 60px; }
        .p-icon { width: 55px; height: 55px; border-radius: 50%; border: 2px solid rgba(212,175,55,0.3); }
        .p-info { flex: 1; }
        .p-name { font-size: 22px; font-weight: 900; color: #fff; }
        .p-tag { font-size: 14px; color: rgba(255,255,255,0.3); }
        .p-tier { font-size: 20px; font-weight: 900; width: 220px; text-transform: uppercase; }
        .p-lp { font-size: 20px; font-weight: 700; color: #f1c40f; width: 120px; text-align: right; }
        .p-wr { font-size: 18px; font-weight: 700; color: rgba(255,255,255,0.6); width: 100px; text-align: right; }
        .p-streak { font-size: 18px; width: 80px; text-align: right; }

        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: rgba(255,255,255,0.2); letter-spacing: 6px; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="content">
        <div class="header">
          <div class="branding-group">
            ${logoUrl ? `<img src="${logoUrl}" class="logo-img">` : ''}
            <div>
              ${textoUrl ? `<img src="${textoUrl}" class="texto-img">` : '<h1>LADDER TOP 10</h1>'}
              <p style="color: rgba(255,255,255,0.4); margin: 0; font-size: 18px; letter-spacing: 4px; text-transform: uppercase;">LOS MEJORES DE LA JAURÍA</p>
            </div>
          </div>
          <div style="text-align: right; color: #d4af37; font-weight: 900; letter-spacing: 2px;">
            SEASON 2026<br><span style="color: rgba(255,255,255,0.3); font-size: 12px;">UPDATED IN REAL-TIME</span>
          </div>
        </div>
        <div class="ladder-grid">
          ${rowsHtml}
        </div>
        <div class="footer">Naafiri Tracker — Global Ranking System</div>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 100, deviceScaleFactor: 2.5 }); 
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 1200, height: bodyHeight, deviceScaleFactor: 2.5 });
    return await page.screenshot({ type: 'png', fullPage: true });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function sendMonthlyHallOfFame(db, isMock = false, targetChannel = null) {
  if (!client || (!targetChannelId && !targetChannel)) return;
  const channel = targetChannel || await client.channels.fetch(targetChannelId);
  if (!channel) return;

  if (lastHallMessage) lastHallMessage.delete().catch(() => {});

  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const monthName = lastMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

    let sorted = [];

    if (isMock) {
      sorted = [['Jugador Legendario', 25], ['Cazador Pro', 18], ['Main Naafiri', 12], ['RitoGamer', 8], ['NoobMaster69', 5]];
    } else {
      const activities = await db.collection('activities').find({
        type: 'challenge_win',
        timestamp: { $gte: lastMonth, $lte: endOfLastMonth }
      }).toArray();

      if (activities.length === 0) return false;

      const stats = {};
      activities.forEach(a => {
        // Intentar extraer nombre del mensaje o usar discordId
        let name = a.message ? a.message.split('¡')[1]?.split(' ha')[0] : 'Desconocido';
        if (!name) name = a.discordId || 'Desconocido';
        stats[name] = (stats[name] || 0) + 1;
      });

      sorted = Object.entries(stats).sort((a,b) => b[1] - a[1]).slice(0, 5);
    }

    let podiumHtml = '';
    sorted.forEach((s, idx) => {
      const color = idx === 0 ? '#ffd700' : idx === 1 ? '#c0c0c0' : idx === 2 ? '#cd7f32' : '#ffffff';
      podiumHtml += `<div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between;">
        <span style="font-weight: 700; color: ${color}">${idx + 1}. ${s[0]}</span>
        <span style="color: #f1c40f">${s[1]} Retos</span>
      </div>`;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <body style="background: #0a0a0c; color: #fff; font-family: 'Inter', sans-serif; padding: 40px; width: 600px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #d4af37; margin: 0; letter-spacing: 5px;">HALL OF FAME</h1>
          <p style="opacity: 0.6; text-transform: uppercase;">Los mejores del mes: ${monthName}</p>
        </div>
        <div style="background: rgba(255,255,255,0.03); border: 1px solid #d4af37; border-radius: 20px; padding: 30px;">
          ${podiumHtml}
        </div>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 680, height: 400, deviceScaleFactor: 2 });
      await page.setContent(htmlContent, { timeout: 30000 });
      const buffer = await page.screenshot({ type: 'png' });
      
      const attachment = new AttachmentBuilder(buffer, { name: 'halloffame.png' });
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Salón de la Fama - ${monthName}`)
        .setDescription(`¡Felicidades a los mayores cazadores de retos del mes pasado! 🎉`)
        .setImage('attachment://halloffame.png')
        .setColor(0xd4af37);

      await channel.send({ embeds: [embed], files: [attachment] });
      return true;
    } finally {
      await browser.close().catch(() => {});
    }
  } catch (e) { 
    console.error('[Hall of Fame Error]', e); 
    return false;
  }
}

async function generateGachaCard(selected, balance) {
  const colorMap = {
    'Legendario': '#f1c40f',
    'Épico': '#9b59b6',
    'Raro': '#3498db',
    'Común': '#95a5a6'
  };
  const color = colorMap[selected.rarity] || '#ffffff';
  const isPro = selected.type === 'pro';
  const isCoins = selected.type === 'coins';
  
  let imgUrl = isPro 
    ? selected.img 
    : (isCoins 
        ? 'https://static.wikia.nocookie.net/leagueoflegends/images/1/1b/Gold_icon.png' 
        : `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${selected.img}.jpg`);

  // SISTEMA DE CACHÉ LOCAL EN public/pic/gacha
  const picDir = path.join(__dirname, 'assets', 'pic', 'gacha');
  try {
    if (!fs.existsSync(picDir)) {
      console.log(`[Gacha] Creando directorio de caché: ${picDir}`);
      fs.mkdirSync(picDir, { recursive: true });
    }
  } catch (err) {
    console.error(`[Gacha] Error creando directorio: ${err.message}`);
  }

  const localPath = path.join(picDir, `${selected.id}.png`);
  let base64Img = '';

  try {
    if (fs.existsSync(localPath)) {
      const buffer = fs.readFileSync(localPath);
      base64Img = `data:image/png;base64,${buffer.toString('base64')}`;
      console.log(`[Gacha] Usando caché local para: ${selected.id}`);
    } else {
      console.log(`[Gacha] Intentando descargar: ${selected.id} desde ${imgUrl}`);
      const response = await fetch(imgUrl, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://lol.fandom.com/'
        },
        timeout: 10000 // 10 segundos de límite
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(localPath, buffer);
        base64Img = `data:image/png;base64,${buffer.toString('base64')}`;
        console.log(`[Gacha] Descarga exitosa y guardada en: ${localPath}`);
      } else {
        throw new Error(`Wikia respondió con error ${response.status}: ${response.statusText}`);
      }
    }
  } catch (e) {
    console.error(`[Gacha] Error crítico: ${e.message}`);
    throw new Error(`Fallo al obtener imagen: ${e.message}`);
  }

  // Fallback si falla todo
  if (!base64Img) base64Img = imgUrl; 

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
        body { margin: 0; padding: 0; background: transparent; font-family: 'Outfit', sans-serif; width: 350px; height: 500px; display: flex; justify-content: center; align-items: center; }
        .card { 
          width: 320px; height: 460px; position: relative; 
          background: #000; border-radius: 28px; 
          overflow: hidden;
          box-shadow: 0 20px 50px rgba(0,0,0,0.9), 0 0 30px ${color}33;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .full-art {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: ${isPro || isCoins ? 'linear-gradient(45deg, #1a1a1a, #000)' : `url('${base64Img}') center center`}; 
          background-size: cover;
          z-index: 1;
        }
        .pro-photo {
          position: absolute; bottom: 0; right: -50px;
          height: 100%; z-index: 2;
          filter: drop-shadow(0 0 20px rgba(0,0,0,0.8));
          display: ${isPro ? 'block' : 'none'};
        }
        .coins-photo {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -60%);
          width: 150px; z-index: 2;
          filter: drop-shadow(0 0 30px rgba(241,196,15,0.5));
          display: ${isCoins ? 'block' : 'none'};
        }
        .holographic-sheen {
          position: absolute; top: 0; left: -100%; width: 200%; height: 100%;
          background: linear-gradient(105deg, 
            transparent 35%, 
            rgba(255,255,255,0.05) 40%, 
            rgba(255,255,255,0.4) 50%, 
            rgba(255,255,255,0.05) 60%, 
            transparent 65%
          );
          z-index: 5; transform: skewX(-25deg);
          animation: shine 5s infinite linear;
          mix-blend-mode: overlay;
        }
        .iridescence {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(45deg, ${color}11, transparent, ${color}11);
          z-index: 4; opacity: 0.5;
        }
        .texture-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          opacity: 0.08; z-index: 6; pointer-events: none; mix-blend-mode: overlay;
        }
        .inner-frame {
          position: absolute; top: 15px; left: 15px; right: 15px; bottom: 15px;
          border: 1.5px solid ${color}88; border-radius: 20px;
          z-index: 7; pointer-events: none;
          box-shadow: inset 0 0 15px rgba(0,0,0,0.5);
        }
        .corner {
          position: absolute; width: 10px; height: 10px;
          border: 2px solid ${color}; z-index: 8;
        }
        .top-left { top: 10px; left: 10px; border-right: 0; border-bottom: 0; }
        .top-right { top: 10px; right: 10px; border-left: 0; border-bottom: 0; }
        .bottom-left { bottom: 10px; left: 10px; border-right: 0; border-top: 0; }
        .bottom-right { bottom: 10px; right: 10px; border-left: 0; border-top: 0; }
        .bottom-gradient {
          position: absolute; bottom: 0; left: 0; width: 100%; height: 60%;
          background: linear-gradient(0deg, 
            rgba(0,0,0,0.95) 0%, 
            ${color}22 30%,
            rgba(0,0,0,0.5) 60%, 
            transparent 100%
          );
          z-index: 3;
        }
        .content-container {
          position: absolute; bottom: 30px; left: 20px; right: 20px;
          z-index: 10;
        }
        .rarity-tag {
          display: inline-block; padding: 4px 10px; border-radius: 6px;
          background: ${color}; color: #000; font-weight: 900;
          font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
          margin-bottom: 8px;
        }
        .name {
          font-size: 32px; font-weight: 900; color: #fff;
          margin: 0; line-height: 1; text-transform: uppercase;
          text-shadow: 0 4px 10px rgba(0,0,0,0.5), 0 0 10px ${color}aa;
        }
        .info-row {
          display: flex; justify-content: space-between; align-items: flex-end;
          margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);
          padding-top: 10px;
        }
        .sub-info { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; }
        .sub-info span { color: ${color}; }
        .brand { font-size: 8px; font-weight: 700; color: rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 2px; }

        ${selected.rarity === 'Legendario' ? `
        .card { border-color: ${color}; box-shadow: 0 0 50px ${color}55; animation: legendary-pulse 3s infinite alternate; }
        @keyframes legendary-pulse {
          from { transform: scale(1); box-shadow: 0 0 30px ${color}44; }
          to { transform: scale(1.02); box-shadow: 0 0 60px ${color}88; }
        }
        .holographic-sheen { 
          background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.2) 45%, #fff 50%, rgba(255,255,255,0.2) 55%, transparent 70%); 
          animation-duration: 2s;
        }
        ` : ''}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="full-art"></div>
        <div class="iridescence"></div>
        <div class="inner-frame"></div>
        <div class="corner top-left"></div>
        <div class="corner top-right"></div>
        <div class="corner bottom-left"></div>
        <div class="corner bottom-right"></div>
        <div class="texture-overlay"></div>
        ${isPro ? `<img src="${base64Img}" class="pro-photo">` : ''}
        ${isCoins ? `<img src="${base64Img}" class="coins-photo">` : ''}
        <div class="holographic-sheen"></div>
        <div class="bottom-gradient"></div>
        <div class="content-container">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div class="rarity-tag">${selected.rarity}</div>
            <div style="font-size: 8px; color: rgba(255,255,255,0.4); font-weight: 900; letter-spacing: 1px;">ID: #${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}</div>
          </div>
          <h1 class="name">${selected.name}</h1>
          <div class="info-row">
            <div class="sub-info">${isPro ? `TEAM: <span>${selected.team}</span>` : (isCoins ? `BONUS: <span>CURRENCY</span>` : `TYPE: <span>CHAMPION</span>`)}</div>
            <div class="brand">LIMITED EDITION</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({ 
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 350, height: 500, deviceScaleFactor: 2 });
    await page.setContent(htmlContent, { timeout: 30000 });
    
    // Esperar a que las imágenes carguen antes de capturar
    await page.evaluate(() => {
      return Promise.all(Array.from(document.images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => { img.onload = img.onerror = resolve; });
      }));
    });

    return await page.screenshot({ type: 'png', omitBackground: true });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function notifyAdmin(message) {
  if (!client || !process.env.ADMIN_DISCORD_ID) return;
  try {
    const admin = await client.users.fetch(process.env.ADMIN_DISCORD_ID);
    if (admin) {
      await admin.send(message);
    }
  } catch (e) {
    console.error('[Admin Notify Error]', e);
  }
}

module.exports = { 
  initBot, 
  notifyRankChange, 
  notifyLiveGame, 
  sendDailySummary, 
  sendDailyMotivation, 
  sendChallengeReminder,
  sendMonthlyHallOfFame,
  generateChallengeImage,
  notifyBetResults, 
  notifyRemake, 
  notifyChallengeComplete, 
  notifyAdmin,
  GACHA_ITEMS 
};

// --- Variables para el Monitor de Partidas ---
const liveCache = new Set();
const cooldown403 = new Map();

// --- Funciones de Utilidad del Backend ---
async function takeDailySnapshots(db) {
  const accounts = await db.collection('accounts').find({}).toArray();
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const todayStr = now.toISOString().split('T')[0];
  
  for (const acc of accounts) {
    if (acc.soloQ) {
      await db.collection('accounts').updateOne(
        { puuid: acc.puuid },
        { $set: { [`snapshots.${todayStr}`]: acc.soloQ } }
      );
    }
  }
  
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 8);
  oldDate.setMinutes(oldDate.getMinutes() - oldDate.getTimezoneOffset());
  const oldDateStr = oldDate.toISOString().split('T')[0];
  
  for (const acc of accounts) {
    if (acc.snapshots) {
      for (const date in acc.snapshots) {
        if (date < oldDateStr) {
          await db.collection('accounts').updateOne(
            { puuid: acc.puuid },
            { $unset: { [`snapshots.${date}`]: "" } }
          );
        }
      }
    }
  }
}

function calculateMatchHighlights(match) {
  const participants = match.info.participants;
  if (!participants || participants.length === 0) return null;

  let mvp = participants[0];
  let maxScore = -999;
  let topDamage = participants[0];
  let topVision = participants[0];
  let topGold = participants[0];

  participants.forEach(p => {
    const score = (p.kills * 4) + (p.assists * 2.5) - (p.deaths * 3) + (p.totalDamageDealtToChampions / 1500) + (p.visionScore / 1.5) + (p.goldEarned / 1000);
    if (score > maxScore) { maxScore = score; mvp = p; }
    if (p.totalDamageDealtToChampions > topDamage.totalDamageDealtToChampions) topDamage = p;
    if (p.visionScore > topVision.visionScore) topVision = p;
    if (p.goldEarned > topGold.goldEarned) topGold = p;
  });

  const getName = (p) => p.riotIdGameName || p.summonerName || 'Desconocido';
  return {
    mvp: { name: getName(mvp), champion: mvp.championName },
    topDamage: { name: getName(topDamage), champion: topDamage.championName, value: topDamage.totalDamageDealtToChampions },
    topVision: { name: getName(topVision), champion: topVision.championName, value: topVision.visionScore },
    topGold: { name: getName(topGold), champion: topGold.championName, value: topGold.goldEarned }
  };
}

async function settleBets(acc) {
  try {
    console.log(`[Bets] Processing results for ${acc.gameName}...`);
    await new Promise(r => setTimeout(r, 120000));
    const API_KEY = process.env.RIOT_API_KEY;
    const routing = REGION_ROUTING[acc.region] || 'americas';

    const matchUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acc.puuid.trim()}/ids?count=1`;
    const matchIdsRes = await fetch(matchUrl, { headers: { "X-Riot-Token": API_KEY.trim() } });
    const matchIds = await matchIdsRes.json();
    
    if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) return;

    const detailUrl = `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchIds[0]}`;
    const detailRes = await fetch(detailUrl, { headers: { "X-Riot-Token": API_KEY.trim() } });
    const match = await detailRes.json();
    
    if (!match || !match.info) return;

    const allowedQueues = [420, 440];
    if (!allowedQueues.includes(match.info.queueId)) return;
    
    const p = match.info.participants.find(x => x.puuid === acc.puuid.trim());
    if (!p) return;

    const isRemake = match.info.gameDuration < 210;
    if (isRemake) {
      const allBets = await dbInstance.collection('bets').find({ targetPuuid: acc.puuid, status: 'open' }).toArray();
      for (const bet of allBets) {
        await dbInstance.collection('economy').updateOne({ discordId: bet.discordId }, { $inc: { coins: bet.amount } });
        await dbInstance.collection('bets').updateOne({ _id: bet._id }, { $set: { status: 'refunded' } });
      }
      notifyRemake(acc.gameName);
      return;
    }

    const gameResult = p.win ? 'gana' : 'pierde';
    const openBets = await dbInstance.collection('bets').find({ targetPuuid: acc.puuid, status: 'open' }).toArray();
    const winners = [];
    for (const bet of openBets) {
      if (bet.choice === gameResult) {
        const prize = Math.floor(bet.amount * (bet.multiplier || 2.0));
        await dbInstance.collection('economy').updateOne({ discordId: bet.discordId }, { $inc: { coins: prize } });
        winners.push(bet);
        await dbInstance.collection('bets').updateOne({ _id: bet._id }, { $set: { status: 'won' } });
      } else {
        await dbInstance.collection('bets').updateOne({ _id: bet._id }, { $set: { status: 'lost' } });
      }
    }

    const kda = `${p.kills}/${p.deaths}/${p.assists}`;
    let lpDataObj = null;
    
    if (match.info.queueId === 420 || match.info.queueId === 440) {
      let attempts = 0;
      while (attempts < 3) {
        try {
          const leagueUrl = `https://la1.api.riotgames.com/lol/league/v4/entries/by-puuid/${acc.puuid}?api_key=${API_KEY}`;
          const leagues = await (await fetch(leagueUrl)).json();
          const targetQueueType = match.info.queueId === 420 ? 'RANKED_SOLO_5x5' : 'RANKED_FLEX_SR';
          const soloQ = leagues.find(l => l.queueType === targetQueueType);
          if (soloQ) {
            await dbInstance.collection('accounts').updateOne({ puuid: acc.puuid }, { $set: { soloQ: soloQ } });
            lpDataObj = { tier: soloQ.tier, rank: soloQ.rank, lp: soloQ.leaguePoints, diff: soloQ.leaguePoints - (acc.soloQ?.leaguePoints || 0) };
            break;
          }
        } catch (e) {}
        attempts++;
        if (attempts < 3) await new Promise(r => setTimeout(r, 45000));
      }
    }

    const highlights = calculateMatchHighlights(match);
    notifyBetResults(acc.gameName, gameResult, winners, p.profileIcon, p.championName, lpDataObj, kda, DDRAGON_VERSION, openBets.length, match.info.queueId, highlights);
    liveCache.delete(acc.puuid);
    await checkChallenges(acc, match);
  } catch (e) {
    console.error(`[Bets Error]`, e);
    liveCache.delete(acc.puuid);
  }
}

async function checkChallenges(acc, match) {
  try {
    const participant = match.info.participants.find(p => p.puuid === acc.puuid);
    if (!participant) return;
    const challengesFound = [];
    let totalCoins = 0;
    if (participant.pentakills > 0) { challengesFound.push('🏆 PENTAKILL (Legendario)'); totalCoins += 1000; }
    if (participant.kills >= 15) { challengesFound.push('🔪 El Carnicero (Épico)'); totalCoins += 200; }
    if (participant.deaths === 0 && participant.win) { challengesFound.push('😇 Inmortal (Raro)'); totalCoins += 150; }
    const csPerMin = (participant.totalMinionsKilled + participant.neutralMinionsKilled) / (match.info.gameDuration / 60);
    if (csPerMin >= 8.5 && match.info.gameDuration > 1200) { challengesFound.push('🚜 Farm Machine (Raro)'); totalCoins += 100; }
    if (challengesFound.length > 0) {
      await dbInstance.collection('economy').updateOne({ discordId: acc.discordId }, { $inc: { coins: totalCoins } }, { upsert: true });
      notifyChallengeComplete(acc.gameName, challengesFound, totalCoins);
    }
  } catch (e) { console.error('Error procesando retos:', e); }
}

// --- Conexión a MongoDB e Inicio ---
async function startBot() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { console.error('❌ Falta MONGO_URI'); process.exit(1); }

  try {
    const clientMongo = new MongoClient(MONGO_URI);
    await clientMongo.connect();
    const db = clientMongo.db('lan-tracker');
    console.log('✅ MongoDB conectado');
    
    // Inicializar lógica del bot
    initBot(db);

    // Temporizadores de Notificaciones
    setInterval(async () => {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Caracas', hour: 'numeric', minute: 'numeric', hour12: false });
      const parts = formatter.formatToParts(now);
      const hour = parseInt(parts.find(p => p.type === 'hour').value);
      const minute = parseInt(parts.find(p => p.type === 'minute').value);

      // Snapshots y Notificaciones
      if (minute === 0) {
        if (hour === 12) {
          await sendDailyMotivation(db);
          await sendChallengeReminder(db);
        }
        if ([18, 22].includes(hour)) sendDailySummary(db);
      }
    }, 60 * 1000);

    // Escaneo de Partidas en Vivo
    setInterval(async () => {
      try {
        const accounts = await db.collection('accounts').find({}).toArray();
        const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/es_MX/champion.json`);
        const champData = await champRes.json();
        const nowTime = Date.now();

        for (const acc of accounts) {
          if (cooldown403.has(acc.puuid) && nowTime < cooldown403.get(acc.puuid)) continue;
          
          const region = acc.region || 'la1';
          const res = await fetch(`https://${region}.api.riotgames.com/lol/spectator/v5/active-games/by-puuid/${acc.puuid.trim()}?api_key=${process.env.RIOT_API_KEY}`);
          if (res.ok) {
            const game = await res.json();
            if ([420, 440].includes(game.gameQueueConfigId) && !liveCache.has(acc.puuid)) {
              liveCache.add(acc.puuid);
              const me = game.participants.find(p => p.puuid === acc.puuid.trim());
              const champKey = Object.keys(champData.data).find(key => champData.data[key].key == me.championId);
              notifyLiveGame(acc, { championName: champKey, championId: champKey, profileIconId: me.profileIconId, version: DDRAGON_VERSION });
            }
          } else if (res.status === 404 && liveCache.has(acc.puuid)) {
            liveCache.delete(acc.puuid);
            settleBets(acc);
          } else if (res.status === 403) {
            cooldown403.set(acc.puuid, nowTime + 10 * 60 * 1000);
          }
        }
      } catch (e) {}
    }, 60 * 1000);

  } catch (e) {
    console.error('❌ Error:', e);
    setTimeout(startBot, 5000);
  }
}

startBot();

