const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const fs = require('fs');
const path = require('path');

let client = null;
let dbInstance = null;
let targetChannelId = process.env.DISCORD_CHANNEL_ID;
let DDRAGON_VERSION = '15.8.1';

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

function isAdmin(userId) {
  return userId === process.env.ADMIN_DISCORD_ID;
}

// Cooldown para !help (5 minutos)
const helpCooldowns = new Map();

// --- SISTEMA DE GACHAPON ---
const GACHA_ITEMS = [
  { id: 'Naafiri', name: 'Naafiri (Base)', rarity: 'Común', weight: 70, img: 'Naafiri_0' },
  { id: 'Aatrox', name: 'Aatrox', rarity: 'Común', weight: 70, img: 'Aatrox_0' },
  { id: 'Yasuo', name: 'Yasuo', rarity: 'Común', weight: 70, img: 'Yasuo_0' },
  { id: 'Zed', name: 'Zed', rarity: 'Común', weight: 70, img: 'Zed_0' },
  { id: 'COINS_50', name: 'Bolsa de 50 Coins', rarity: 'Común', weight: 50, type: 'coins', amount: 50 },
  { id: 'Lux', name: 'Lux Cosmic', rarity: 'Raro', weight: 20, img: 'Lux_15' },
  { id: 'LeeSin', name: 'Lee Sin God Fist', rarity: 'Raro', weight: 20, img: 'LeeSin_11' },
  { id: 'COINS_250', name: 'Cofre de 250 Coins', rarity: 'Raro', weight: 15, type: 'coins', amount: 250 },
  { id: 'Jhin', name: 'Jhin Dark Star', rarity: 'Épico', weight: 8, img: 'Jhin_5' },
  { id: 'Naafiri_Soul', name: 'Naafiri Soul Fighter', rarity: 'Épico', weight: 8, img: 'Naafiri_1' },
  { id: 'COINS_1000', name: 'Tesoro de 1000 Coins', rarity: 'Legendario', weight: 2, type: 'coins', amount: 1000 },
  { id: 'Elemental_Lux', name: 'Lux Elementalista', rarity: 'Legendario', weight: 2, img: 'Lux_7' },
  { id: 'Golden_Naafiri', name: 'Naafiri Dorada (Exclusiva)', rarity: 'Legendario', weight: 2, img: 'Naafiri_0' },
  // Agregados del perfil web para compatibilidad
  { id: 'Garen', name: 'Garen', rarity: 'Común', weight: 0 },
  { id: 'Ashe', name: 'Ashe', rarity: 'Común', weight: 0 },
  { id: 'Lux_Base', name: 'Lux', rarity: 'Común', weight: 0 },
  { id: 'MasterYi', name: 'Master Yi', rarity: 'Común', weight: 0 },
  { id: 'Ezreal', name: 'Ezreal', rarity: 'Raro', weight: 0 },
  { id: 'Vayne', name: 'Vayne', rarity: 'Épico', weight: 0 },
  { id: 'Kaisa', name: 'Kai\'Sa', rarity: 'Épico', weight: 0 },
  { id: 'Teemo', name: 'Teemo Satán', rarity: 'Legendario', weight: 0 }
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
          { name: 'Rango SoloQ', value: acc.soloQ ? `${acc.soloQ.tier} ${acc.soloQ.rank} (${acc.soloQ.leaguePoints} LP)` : 'Unranked', inline: true },
          { name: 'Winrate', value: acc.soloQ ? `${Math.round((acc.soloQ.wins / (acc.soloQ.wins + acc.soloQ.losses)) * 100)}%` : 'N/A', inline: true },
          { name: 'Racha', value: acc.streak > 0 ? `🔥 ${acc.streak} Wins` : acc.streak < 0 ? `❄️ ${Math.abs(acc.streak)} Loss` : '—', inline: true }
        )
        .setFooter({ text: 'LAN Tracker Bot' });

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
    }

    if (command === 'ladder') {
      const accounts = await db.collection('accounts').find({}).toArray();
      const sorted = accounts.sort((a,b) => getRankScore(b) - getRankScore(a)).slice(0, 10);
      
      const list = sorted.map((a, i) => `${i+1}. **${a.gameName}** - ${a.soloQ?.tier || 'Unranked'} ${a.soloQ?.rank || ''}`).join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 Top 10 de La Perrera')
        .setDescription(list || 'No hay jugadores registrados.')
        .setColor(0xf4c874);

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
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
      const slug = args.join(' '); // Soporta nombres con espacios
      if (!slug) return msg.channel.send(`<@${msg.author.id}> Uso: \`!vincular Nombre#TAG\``);
      const acc = await findAccountBySlug(slug);
      if (!acc) return msg.channel.send(`<@${msg.author.id}> ❌ No encontré esa cuenta en el dashboard.`);

      const res = await db.collection('accounts').updateOne(
        { puuid: acc.puuid },
        { $set: { discordId: msg.author.id } }
      );

      await db.collection('economy').updateOne(
        { discordId: msg.author.id },
        { $set: { linkedPuuid: acc.puuid, discordTag: msg.author.tag } },
        { upsert: true }
      );

      if (res.modifiedCount > 0 || res.upsertedCount > 0) {
        msg.channel.send(`<@${msg.author.id}> ✅ ¡Cuenta vinculada! Ahora eres oficialmente **${acc.gameName}#${acc.tagLine}**.`);
      } else {
        msg.channel.send(`<@${msg.author.id}> ❌ No encontré esa cuenta en el dashboard.`);
      }
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

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embed] });
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
      const COST = 10;
      const userEco = await db.collection('economy').findOne({ discordId: msg.author.id });

      if (!userEco || userEco.coins < COST) {
        return msg.channel.send(`<@${msg.author.id}> ❌ No tienes suficientes coins. El tiro de Gachapon cuesta **${COST} 💰**.`);
      }

      // Sistema de Pesos para Probabilidades
      const totalWeight = GACHA_ITEMS.reduce((sum, item) => sum + item.weight, 0);
      
      // Calcular porcentajes por rareza
      const rarityWeights = {};
      GACHA_ITEMS.forEach(item => {
        rarityWeights[item.rarity] = (rarityWeights[item.rarity] || 0) + item.weight;
      });
      const probabilitiesStr = Object.entries(rarityWeights)
        .map(([rarity, weight]) => `**${rarity}:** ${((weight / totalWeight) * 100).toFixed(1)}%`)
        .join('  ·  ');

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
      if (selected.type === 'coins') {
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

      const color = selected.rarity === 'Legendario' ? 0xf1c40f : selected.rarity === 'Épico' ? 0x9b59b6 : selected.rarity === 'Raro' ? 0x3498db : 0x95a5a6;

      // Probabilidades de monedas por separado
      const coinItems = GACHA_ITEMS.filter(i => i.type === 'coins');
      const coinsStr = coinItems.map(i => `**${i.name}:** ${((i.weight / totalWeight) * 100).toFixed(1)}%`).join('  ·  ');

      const embedGacha = new EmbedBuilder()
        .setTitle(`🎰 ¡GACHAPON DE LA PERRERA!`)
        .setDescription(`¡Has obtenido **${selected.name}**!\n\n✨ Rareza: **${selected.rarity}**${selected.type === 'coins' ? `\n💰 ¡Has ganado **${selected.amount} coins**!` : ''}`)
        .addFields(
          { name: '📈 Probabilidades por Rareza', value: probabilitiesStr },
          { name: '💰 Probabilidades de Monedas', value: coinsStr }
        )
        .setImage(selected.type === 'coins' ? 'https://static.wikia.nocookie.net/leagueoflegends/images/1/1b/Gold_icon.png' : `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${selected.img}.jpg`)
        .setColor(color)
        .setFooter({ text: `Gastaste ${COST} coins · Saldo restante: ${userEco.coins - COST + (selected.type === 'coins' ? selected.amount : 0)} 💰 · Naafiri Bot` });

      msg.channel.send({ content: `<@${msg.author.id}>`,  embeds: [embedGacha] });

      if (selected.rarity === 'Legendario') {
        msg.channel.send(`🎊 ¡ATENCIÓN! **${msg.author.username}** acaba de conseguir un objeto **LEGENDARIO**: **${selected.name}**! 🎊`);
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
        await sendMonthlyHallOfFame(dbInstance);
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
                { name: '👤 Perfil y Rango', value: '`!perfil [N#T]` - Mira tu rango.\n`!stats [N#T]` - Estadísticas.\n`!ladder` - Top 10 Jugadores.\n`!shame` - Muro de la vergüenza.\n`!web` - Tu perfil privado.' },
                { name: '💰 Economía', value: '`!monedas` - Tu saldo.\n`!diario` - 100 coins gratis.\n`!pagar @u cant` - Enviar coins.\n`!top_ricos` - Top 10 Ricos.' },
                { name: '🎮 Diversión y Colección', value: '`!ludopata` - Mira tus apuestas.\n`!gacha` - Nuevo campeón.\n`!mochila` - Tu colección.\n`!reroll` - Fusiona 3 repetidos.\n`!reciclar` - Desencanta repetidos.' }
              )
              .setColor(0x576bce)
              .setFooter({ text: 'Naafiri Bot' });

            await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
          } else if (typeHelp === 'admin') {
            const adminEmbed = new EmbedBuilder()
              .setTitle('🛠️ Panel de Administración')
              .addFields(
                { name: '💰 Economía', value: '`!admin_dar @u cant`\n`!admin_quitar @u cant`\n`!admin_setcoins @u cant`\n`!admin_resetdiario @u`\n`!admin_resetall CONFIRMAR`' },
                { name: '🎒 Items e Inventario', value: '`!admin_daritem @u id`\n`!admin_clearinv @u`' },
                { name: '📡 Monitoreo y Dashboard', value: '`!admin_scan` - Scan en vivo.\n`!admin_check N#T` - Forzar notif.\n`!admin_vinculos` - Auditoría y Pings.\n`!admin_cancelarapuestas N#T`' },
                { name: '🎭 Sistema y Diagnóstico', value: '`!admin_syncroles` - Sincronizar roles.\n`!admin_stats` - Estadísticas.\n`!admin_debug_key` - Riot API.\n`!admin_purge [n]` - Borrar mensajes.' },
                { name: '🧪 Comandos de Prueba (Manuales)', value: '`!admin_testdiario` - Recordatorio 12pm\n`!admin_testsummary` - Scoreboard 6/10pm\n`!admin_testretos` - Imagen de Retos\n`!admin_testhall` - Salón de la Fama Mensual' }
              )
              .setColor(0xd93f3f)
              .setFooter({ text: 'Naafiri Admin' });

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
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Yi_5.jpg',
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
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/KaiSa_29.jpg',
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Akali_61.jpg',
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
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/KaiSa_1.jpg',
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
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/MasterYi_24.jpg',
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

    const now = new Date();
    // Cálculo de semana del año para rotación
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const pastDaysOfYear = (now - startOfYear) / 86400000;
    const weekIndex = Math.floor((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    const themeIndex = weekIndex % SKIN_THEMES.length;
    const currentTheme = SKIN_THEMES[themeIndex];
    
    const day = now.getDay(); // 0: Domingo, 1: Lunes...
    const splash = currentTheme.images[day] || currentTheme.images[0];

    const dailyMessages = [
      '☀️ ¡Domingo de descanso en la perrera! No olvides tus coins.',
      '🦴 ¡Lunes con hambre de victoria! Reclama tu diario.',
      '🍖 ¡Martes de cacería! ¿Ya tienes tus monedas?',
      '⚔️ ¡Miércoles mitad de semana! Hora de cobrar.',
      '🔥 ¡Jueves casi fin de semana! No te quedes sin tus 100 coins.',
      '🎉 ¡Viernes de perreo! Cobren y a rankear.',
      '🍗 ¡Sábado de vicio! Asegura tus monedas diarias.'
    ];

    const embed = new EmbedBuilder()
      .setTitle(`🍽️ ¡Hora de almorzar! (Tema: ${currentTheme.name})`)
      .setDescription(dailyMessages[day])
      .setImage(splash)
      .setColor(0xf4c874)
      .setTimestamp()
      .setFooter({ text: 'Naafiri Bot · Recordatorio de Mediodía' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('daily_claim')
        .setLabel('Cobrar 100 Coins 💰')
        .setStyle(ButtonStyle.Success)
    );

    const sentMsg = await channel.send({ embeds: [embed], components: [row] });

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

    // --- Borrar resumen anterior si existe en DB ---
    try {
      const config = await db.collection('system_config').findOne({ key: 'last_summary_msg' });
      if (config && config.messageId) {
        const oldMsg = await channel.messages.fetch(config.messageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
    } catch (e) { console.error('[Summary Delete Error]', e); }

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
    path.join(__dirname, 'public', 'pic', 'bg.jpg'),
    path.join(__dirname, 'public', 'pic', 'bg.png'),
    path.join(__dirname, 'public', 'bg.jpg'),
    path.join(__dirname, 'public', 'bg.png'),
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
    const page = await browser.newPage();
    await page.setViewport({ width: 950, height: 100, deviceScaleFactor: 3 }); 
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const height = await page.evaluate(() => document.getElementById('container').offsetHeight);
    await page.setViewport({ width: 950, height: height, deviceScaleFactor: 3 });

    const element = await page.$('#container');
    const imageBuffer = await element.screenshot({ type: 'png' });
    await browser.close();

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
const CHALLENGES_LIST = [
  { id: 'penta', name: '🏆 PENTAKILL', description: 'Realiza una Pentakill en una partida de SoloQ o Flex.', rarity: 'Legendario', reward: '1000 Coins', color: '#f1c40f', icon: 'https://ddragon.leagueoflegends.com/cdn/15.8.1/img/item/3031.png' },
  { id: 'butcher', name: '🔪 El Carnicero', description: 'Logra 15 o más asesinatos en una sola partida.', rarity: 'Épico', reward: '200 Coins', color: '#9b59b6', icon: 'https://ddragon.leagueoflegends.com/cdn/15.8.1/img/item/6676.png' },
  { id: 'immortal', name: '😇 Inmortal', description: 'Gana la partida sin morir ni una sola vez.', rarity: 'Raro', reward: '150 Coins', color: '#3498db', icon: 'https://ddragon.leagueoflegends.com/cdn/15.8.1/img/item/3026.png' },
  { id: 'farmer', name: '🚜 Farm Machine', description: 'Consigue más de 8.5 CS por minuto (min. 20 min).', rarity: 'Común', reward: '100 Coins', color: '#95a5a6', icon: 'https://ddragon.leagueoflegends.com/cdn/15.8.1/img/item/1083.png' }
];

async function generateChallengeImage() {
  let cardsHtml = '';
  
  // Cargar imagen de fondo local
  let bgUrl = '';
  try {
    const fs = require('fs');
    const path = require('path');
    const bgPath = path.join(process.cwd(), 'public', 'pic', 'bg.jpg');
    if (fs.existsSync(bgPath)) {
      const bgBase64 = fs.readFileSync(bgPath).toString('base64');
      bgUrl = `data:image/jpeg;base64,${bgBase64}`;
    }
  } catch (e) { console.error('[BG Load Error]', e); }

  CHALLENGES_LIST.forEach(c => {
    cardsHtml += `
      <div class="card" style="border-left: 5px solid ${c.color}">
        <img src="${c.icon}" class="icon">
        <div class="details">
          <div class="name">${c.name} <span class="rarity" style="color: ${c.color}">[${c.rarity}]</span></div>
          <div class="desc">${c.description}</div>
        </div>
        <div class="reward">${c.reward}</div>
      </div>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { 
          margin: 0; 
          padding: 60px 40px; 
          background: ${bgUrl ? `url(${bgUrl})` : '#0a0a0c'}; 
          background-size: cover;
          background-position: center;
          font-family: 'Inter', sans-serif; 
          color: #fff; 
          width: 800px; 
          height: auto; 
          position: relative;
        }
        body::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          z-index: 0;
        }
        .content { position: relative; z-index: 1; }
        .header { text-align: center; margin-bottom: 40px; }
        .header h1 { font-size: 38px; color: #d4af37; text-transform: uppercase; letter-spacing: 8px; margin: 0; font-weight: 900; text-shadow: 0 0 20px rgba(212,175,55,0.4); }
        .header p { color: rgba(255,255,255,0.6); margin-top: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }
        .card { 
          background: rgba(255,255,255,0.03); 
          backdrop-filter: blur(10px);
          border: 1px solid rgba(212,175,55,0.15); 
          border-radius: 12px; 
          padding: 20px; 
          display: flex; 
          align-items: center; 
          margin-bottom: 15px; 
          transition: all 0.3s ease;
        }
        .icon { width: 65px; height: 65px; border-radius: 8px; margin-right: 20px; border: 2px solid rgba(212,175,55,0.3); }
        .details { flex: 1; }
        .name { font-size: 20px; font-weight: 900; margin-bottom: 5px; color: #fff; }
        .rarity { font-size: 12px; margin-left: 10px; font-weight: 700; text-transform: uppercase; }
        .desc { font-size: 14px; color: rgba(255,255,255,0.7); line-height: 1.4; }
        .reward { font-size: 22px; font-weight: 900; color: #f1c40f; text-shadow: 0 0 15px rgba(241,196,15,0.4); min-width: 140px; text-align: right; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 4px; font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="content">
        <div class="header">
          <h1>TABLÓN DE CAZA</h1>
          <p>Retos activos de la Perrera - Gana Naafiri Coins</p>
        </div>
        ${cardsHtml}
        <div class="footer">Generado por Naafiri Bot</div>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 880, height: 100, deviceScaleFactor: 3 }); // Escala 3 para máxima nitidez
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewport({ width: 880, height: bodyHeight, deviceScaleFactor: 3 });
  const buffer = await page.screenshot({ type: 'png' });
  await browser.close();
  return buffer;
}

async function sendChallengeReminder(db) {
  if (!client || !targetChannelId) return;
  const channel = await client.channels.fetch(targetChannelId);
  if (!channel) return;

  try {
    const buffer = await generateChallengeImage();
    const attachment = new AttachmentBuilder(buffer, { name: 'retos.png' });
    const embed = new EmbedBuilder()
      .setTitle('📢 ¡ATENCIÓN MANADA! Botines disponibles 🐾')
      .setDescription('Si van a rankear hoy, recuerden que hay Naafiri Coins sobre la mesa. ¡A por ellos!')
      .setImage('attachment://retos.png')
      .setColor(0xd4af37);

    await channel.send({ embeds: [embed], files: [attachment] });
  } catch (e) { console.error('[Challenge Reminder Error]', e); }
}

async function sendMonthlyHallOfFame(db) {
  if (!client || !targetChannelId) return;
  const channel = await client.channels.fetch(targetChannelId);
  if (!channel) return;

  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const activities = await db.collection('activities').find({
      type: 'challenge_win',
      timestamp: { $gte: lastMonth, $lte: endOfLastMonth }
    }).toArray();

    if (activities.length === 0) return;

    const stats = {};
    activities.forEach(a => {
      const name = a.message.split('¡')[1].split(' ha')[0]; // Extraer nombre del mensaje
      stats[name] = (stats[name] || 0) + 1;
    });

    const sorted = Object.entries(stats).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const monthName = lastMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

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
    const page = await browser.newPage();
    await page.setViewport({ width: 680, height: 400, deviceScaleFactor: 2 });
    await page.setContent(htmlContent);
    const buffer = await page.screenshot({ type: 'png' });
    await browser.close();

    const attachment = new AttachmentBuilder(buffer, { name: 'halloffame.png' });
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Salón de la Fama - ${monthName}`)
      .setDescription(`¡Felicidades a los mayores cazadores de retos del mes pasado! 🎉`)
      .setImage('attachment://halloffame.png')
      .setColor(0xd4af37);

    await channel.send({ embeds: [embed], files: [attachment] });
  } catch (e) { console.error('[Hall of Fame Error]', e); }
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
