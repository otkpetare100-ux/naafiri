import './style.css'

const API_BASE = `${window.location.origin}/api`;
const ASSETS_BASE = '/assets';
let DDRAGON_VERSION = '14.9.1';

// Controladores de la barra de carga minimalista dorado premium
let loadingBarTimer = null;

function startLoadingBar() {
  const bar = document.getElementById('top-loading-bar');
  if (!bar) return;
  
  if (loadingBarTimer) clearInterval(loadingBarTimer);
  bar.style.transition = 'width 0.4s cubic-bezier(0.08, 0.8, 0.1, 1), opacity 0.3s ease';
  bar.style.opacity = '1';
  bar.style.width = '0%';
  
  // Force reflow
  bar.offsetWidth;
  
  bar.style.width = '25%';
  
  let currentWidth = 25;
  loadingBarTimer = setInterval(() => {
    if (currentWidth < 85) {
      currentWidth += Math.random() * 5;
      bar.style.width = `${currentWidth}%`;
    }
  }, 400);
}

function finishLoadingBar() {
  const bar = document.getElementById('top-loading-bar');
  if (!bar) return;
  
  if (loadingBarTimer) clearInterval(loadingBarTimer);
  
  bar.style.transition = 'width 0.3s ease, opacity 0.3s ease';
  bar.style.width = '100%';
  
  setTimeout(() => {
    bar.style.opacity = '0';
    setTimeout(() => {
      bar.style.width = '0%';
    }, 300);
  }, 300);
}

// Snapshot de datos anteriores por puuid — usado para detectar cambios en el auto-refresh
const playerSnapshot = new Map();

async function updateVersion() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await res.json();
    if (versions && versions.length > 0) {
      DDRAGON_VERSION = versions[0];
      console.log('DDragon Version updated:', DDRAGON_VERSION);
    }
  } catch (e) {
    console.error('Error updating version:', e);
  }
}

async function fetchLadder() {
  const container = document.getElementById('ladder-container');
  
  try {
    startLoadingBar();
    const response = await fetch(`${API_BASE}/ladder`);
    if (!response.ok) throw new Error('Error al obtener datos');
    
    const players = await response.json();
    renderLadder(players);
  } catch (error) {
    console.error('API Error:', error);
    showToast('⚠️ Error al conectar con la API de Naafiri.', 'error');
    container.innerHTML = `<div class="error">⚠️ Jauría desconectada. Reintenta en unos momentos.</div>`;
  } finally {
    finishLoadingBar();
  }
}

// Auto-refresh inteligente: compara datos por jugador y solo re-renderiza si algo cambió
async function smartRefresh() {
  try {
    const response = await fetch(`${API_BASE}/ladder`);
    if (!response.ok) return;
    const players = await response.json();

    let anyChanged = false;

    for (const player of players) {
      const prev = playerSnapshot.get(player.puuid);
      const prevHistory = prev ? prev.history : null;
      const currHistory = player.history || [];

      // Comparar historial de partidas y LP
      const historyChanged = !prevHistory || JSON.stringify(prevHistory) !== JSON.stringify(currHistory);
      const lpChanged = !prev || prev.lp !== player.lp || prev.tier !== player.tier || prev.rank !== player.rank;

      if (historyChanged || lpChanged) {
        console.log(`[AutoRefresh] Cambio detectado en ${player.gameName} — actualizando...`);
        anyChanged = true;
      } else {
        console.log(`[AutoRefresh] ${player.gameName}: sin cambios, omitiendo.`);
      }
    }

    if (anyChanged) {
      renderLadder(players);
    }
  } catch (e) {
    console.error('[AutoRefresh] Error:', e);
  }
}

function getRegionName(region) {
  const mapping = {
    'la1': 'LAN', 'la2': 'LAS', 'na1': 'NA', 'br1': 'BR',
    'euw1': 'EUW', 'eun1': 'EUNE', 'jp1': 'JP', 'kr': 'KR',
    'tr1': 'TR', 'oc1': 'OCE', 'ru': 'RU', 'ph2': 'PH',
    'sg2': 'SG', 'th2': 'TH', 'tw2': 'TW', 'vn2': 'VN'
  };
  return mapping[region.toLowerCase()] || region.toUpperCase();
}

const getMasteryCrest = (level) => {
  const lv = Math.min(Math.max(parseInt(level) || 1, 1), 10);
  const idx = lv - 1; // nivel 1→0, nivel 2→1, ..., nivel 10→9
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-collections/global/default/images/item-element/crest-and-banner-mastery-${idx}.png`;
};

function renderLadder(players) {
  const container = document.getElementById('ladder-container');
  container.innerHTML = '';

  if (players.length === 0) {
    container.innerHTML = `<div class="empty">No hay perros en la jauría aún.</div>`;
    return;
  }

  // Guardar snapshot para el próximo auto-refresh
  players.forEach(p => {
    playerSnapshot.set(p.puuid, {
      history: p.history || [],
      lp: p.lp,
      tier: p.tier,
      rank: p.rank
    });
  });

  players.forEach((player, index) => {
    const rankNum = index + 1;
    const card = document.createElement('div');
    card.className = `player-card rank-${rankNum}`;
    card.style.cursor = 'pointer';

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions')) return;
      openPlayerDetails(player);
    });
    
    // Ruta del emblema
    const tier = player.tier.toLowerCase();
    const emblemUrl = `${ASSETS_BASE}/ranks/${tier}.png`;
    
    // Icono de invocador
    const avatarUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${player.profileIconId}.png`;

    // Historial Sincronizado (Solo Q 420 + Sin Remakes)
    const soloQMatches = (player.matchStatsHistory || [])
      .filter(m => (m.queueId === 420 || m.queueType === 'RANKED_SOLO_5x5') && !m.isRemake)
      .slice(0, 5);

    const historyHtml = soloQMatches.map(m => `<span class="history-dot dot-${m.win ? 'w' : 'l'}"></span>`).join('');

    // Cálculo de Racha Sincronizada
    let cardStreakHtml = '';
    if (soloQMatches.length >= 2) {
      let streakCount = 0;
      const firstWin = soloQMatches[0].win;
      for (const m of soloQMatches) {
        if (m.win === firstWin) streakCount++;
        else break;
      }
      if (streakCount >= 2) {
        const emoji = firstWin ? '🔥' : '❄️';
        const color = firstWin ? '#ff9f43' : '#00d2ff';
        cardStreakHtml = `<span style="color: ${color}; font-weight: 900; margin-left: 8px; font-size: 0.85rem; text-shadow: 0 0 8px ${color}66; display: inline-flex; align-items: center; gap: 4px;"><span class="streak-emoji">${emoji}</span> x${streakCount}</span>`;
      }
    }

    // Clase para el Winrate (Restaurado)
    const wrValue = parseInt(player.winRate) || 0;
    const wrClass = wrValue >= 50 ? 'wr-positive' : 'wr-negative';

    // Si es top 1 o 2, mostramos la tarjeta abajo para que no se salga de la pantalla
    const cardPositionClass = rankNum <= 2 ? 'm-card-bottom' : '';


    // Top Campeones HTML
    const topChampsHtml = (player.topChampions || []).map(champ => `
      <div class="champ-item">
        <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champ.name}.png"
             class="champ-icon" alt="${champ.name}"
             onerror="this.src='/assets/placeholder_champ.png'" />


        <div class="mastery-card ${cardPositionClass}">
          <div class="m-card-header">
            <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champ.name}.png" class="m-avatar" />
            <img src="${getMasteryCrest(champ.level)}" class="m-crest-official" />
          </div>
          <div class="m-card-body">
            <div class="m-champ-name">${champ.name}</div>
            <div class="m-stats">
              <span class="m-label">Maestría</span>
              <span class="m-value">${champ.level}</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="rank-text">#${rankNum}</div>
      
      <div class="avatar-wrapper">
        ${rankNum === 1 ? `<img src="${ASSETS_BASE}/estetica/corona.png?t=${Date.now()}" class="rank-crown" alt="Crown" />` : ''}
        <img src="${avatarUrl}" class="player-avatar" alt="${player.gameName}" onerror="this.src='https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png'" />
        <div class="level-tag">${player.summonerLevel}</div>
      </div>

      <div class="player-main-info">
        <div class="player-name-row">
          <span class="name">${player.gameName}</span>
          ${player.discordId ? '<span class="discord-badge">Linked</span>' : ''}
          <span class="status-dot ${player.isLive ? 'online' : ''}" id="live-dot-${player.puuid}"></span>
        </div>
        <div class="player-meta">
          <span class="tag">#${player.tagLine}</span>
          <span class="region-badge reg-${(player.region || 'la1').toLowerCase()}">${getRegionName(player.region || 'la1')}</span>
          ${(() => {
            const soloQ20 = (player.matchStatsHistory || [])
              .filter(m => (m.queueId === 420 || m.queueType === 'RANKED_SOLO_5x5') && !m.isRemake)
              .slice(0, 20);

            if (soloQ20.length >= 5) {
              const counts = {};
              soloQ20.forEach(m => {
                const name = m.championName;
                if (name && name !== 'Unknown') counts[name] = (counts[name] || 0) + 1;
              });
              let topChamp = null;
              let maxCount = 0;
              for (const champ in counts) {
                if (counts[champ] > maxCount) {
                  maxCount = counts[champ];
                  topChamp = champ;
                }
              }
              if ((maxCount / soloQ20.length) >= 0.8) {
                return `<span class="badge-otp-mini">OTP ${topChamp}</span>`;
              }
            }
            return '';
          })()}
        </div>
      </div>

      <div class="rank-data">
        <div class="player-champions">
          ${topChampsHtml || '<span class="no-champs">No data</span>'}
        </div>
        <div class="player-performance">
          <div class="history-dots">${cardStreakHtml} ${historyHtml}</div>
        </div>
        <div class="rank-emblem-container">
          <img src="${emblemUrl}" class="rank-emblem" alt="${player.tier}" onerror="this.style.opacity='0'" />
        </div>
        <div class="rank-info-text">
          <div class="tier-text">${['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes((player.tier || '').toUpperCase()) ? player.tier : `${player.tier} ${player.rank}`}</div>
          <div class="rank-stats">
            <span class="lp">${player.lp} LP</span>
            <span class="separator">·</span>
            <span class="wr ${wrClass}">${player.winRate} WR</span>
          </div>
        </div>
      </div>

      <!-- Botones de Acción -->
      <div class="card-actions">
        <button class="btn-delete-card" onclick="openDeleteModal('${player.puuid}', '${player.gameName.replace(/'/g, "\\'")}')" title="Eliminar de la jauría">
          ✕
        </button>
        <button class="btn-refresh-card" onclick="refreshPlayer('${player.gameName}', '${player.tagLine}', '${player.region}')" title="Actualizar datos">
          <span class="refresh-icon">↻</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// Cooldown de 5 min por jugador para el botón de refresh
const refreshCooldowns = new Map(); // clave: gameName → timestamp del último refresh
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

// Lógica de Actualización Manual
async function refreshPlayer(gameName, tagLine, region) {
  const now = Date.now();
  const lastRefresh = refreshCooldowns.get(gameName);
  if (lastRefresh && (now - lastRefresh) < REFRESH_COOLDOWN_MS) {
    const remaining = Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 60000);
    showToast(`⏳ Espera ${remaining} min antes de actualizar a ${gameName} de nuevo.`, 'error');
    return;
  }

  try {
    startLoadingBar();
    refreshCooldowns.set(gameName, now);
    showToast(`Actualizando a ${gameName}...`);
    
    const response = await fetch(`${API_BASE}/summoners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameName, tagLine, region })
    });

    const result = await response.json();

    if (response.ok) {
      showToast(result.message || '¡Datos actualizados!');
      fetchLadder();
    } else {
      // Si falló, liberar el cooldown para que pueda reintentar
      refreshCooldowns.delete(gameName);
      showToast(result.message || 'Error al actualizar', 'error');
    }
  } catch (error) {
    refreshCooldowns.delete(gameName);
    console.error('Refresh error:', error);
    showToast('Error de conexión.', 'error');
  } finally {
    finishLoadingBar();
  }
}

window.refreshPlayer = refreshPlayer;

// Variables globales para el borrado
let playerToDelete = null;

function openDeleteModal(puuid, name) {
  playerToDelete = puuid;
  document.getElementById('delete-player-name').innerText = name;
  document.getElementById('confirm-delete-modal').classList.add('active');
}

function initDeleteLogic() {
  const modal = document.getElementById('confirm-delete-modal');
  const cancelBtn = document.getElementById('cancel-delete');
  const confirmBtn = document.getElementById('confirm-delete-btn');
  const closeBtn = document.querySelector('.close-confirm');

  const closeModal = () => {
    modal.classList.remove('active');
    playerToDelete = null;
  };

  cancelBtn.onclick = closeModal;
  closeBtn.onclick = closeModal;
  
  confirmBtn.onclick = async () => {
    if (!playerToDelete) return;

    try {
      startLoadingBar();
      confirmBtn.innerText = 'Eliminando...';
      confirmBtn.disabled = true;

      const response = await fetch(`${API_BASE}/summoners/${playerToDelete}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('✅ Jugador expulsado de la jauría.');
        closeModal();
        fetchLadder(); // Recargar la lista
      } else {
        showToast('❌ No se pudo eliminar al jugador.', 'error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showToast('❌ Error de conexión.', 'error');
    } finally {
      confirmBtn.innerText = 'Quitar';
      confirmBtn.disabled = false;
      finishLoadingBar();
    }
  };
}

// Hacer funciones disponibles globalmente para los onclick de los strings HTML
window.openDeleteModal = openDeleteModal;

// Variable global para rastrear modal
let currentModalPuuid = null;

// Modal de Detalles del Jugador
// Memoria global de campeones y skins para búsqueda instantánea
let CHAMPION_SKINS_DATA = null;

// Función para inicializar la base de datos de skins (Se llama al cargar la web)
async function initSkinsDatabase() {
  try {
    const resp = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/en_US/champion.json`);
    const data = await resp.json();
    CHAMPION_SKINS_DATA = data.data;
    console.log("Base de datos de campeones lista.");
  } catch (e) {
    console.error("Error cargando base de datos de campeones:", e);
  }
}

// Función para limpiar nombres de campeones (Ej: "Lee Sin" -> "LeeSin")
function cleanChampId(name) {
  if (!name) return null;
  // Normalizar: quitar espacios, puntos y poner en formato Riot (Lee Sin -> LeeSin)
  const normalized = name.replace(/[^a-zA-Z]/g, '').toLowerCase();
  
  // Buscar en nuestra base de datos ignorando mayúsculas
  if (CHAMPION_SKINS_DATA) {
    const found = Object.keys(CHAMPION_SKINS_DATA).find(id => id.toLowerCase() === normalized);
    if (found) return found;
  }

  // Excepciones manuales si falla lo anterior
  const exceptions = {
    "wukong": "MonkeyKing", "leblanc": "Leblanc", "khazix": "Khazix",
    "chogath": "Chogath", "velkoz": "Velkoz", "kaisa": "Kaisa",
    "belveth": "Belveth", "renata": "Renata", "nunu": "Nunu"
  };
  return exceptions[normalized] || name.replace(/[^a-zA-Z]/g, '');
}

// Función para obtener el campeón más jugado del historial reciente
function getMostPlayedFromHistory(history) {
  if (!history || history.length === 0) return null;
  const counts = {};
  history.forEach(m => {
    const name = m.championName;
    if (name && name !== 'Unknown') counts[name] = (counts[name] || 0) + 1;
  });
  const entries = Object.entries(counts);
  return entries.length > 0 ? entries.sort((a, b) => b[1] - a[1])[0][0] : null;
}

// MAPEO DE REGIONES: ATMÓSFERA REGIONAL (Data Dragon - 100% Estable)
const REGION_WALLPAPERS = {
  'demacia': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Garen_0.jpg',
  'noxus': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Darius_0.jpg',
  'ionia': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Irelia_0.jpg',
  'freljord': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ashe_0.jpg',
  'shurima': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Azir_0.jpg',
  'void': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Chogath_0.jpg',
  'shadow-isles': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Thresh_0.jpg',
  'targon': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Leona_0.jpg',
  'piltover': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Caitlyn_0.jpg',
  'zaun': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_0.jpg',
  'bilgewater': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Gangplank_0.jpg',
  'ixtal': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Qiyana_0.jpg',
  'bandle-city': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Teemo_0.jpg',
  'runeterra': 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ryze_0.jpg'
};

const CHAMP_REGIONS = {
  'Aatrox': 'shurima', 'Ahri': 'ionia', 'Akali': 'ionia', 'Akshan': 'shurima', 'Alistar': 'targon', 'Amumu': 'shurima', 'Anivia': 'freljord', 'Annie': 'noxus', 'Aphelios': 'targon', 'Ashe': 'freljord', 'AurelionSol': 'targon', 'Azir': 'shurima', 'Bard': 'runeterra', 'Belveth': 'void', 'Blitzcrank': 'zaun', 'Brand': 'freljord', 'Braum': 'freljord', 'Briar': 'noxus', 'Caitlyn': 'piltover', 'Camille': 'piltover', 'Cassiopeia': 'noxus', 'Chogath': 'void', 'Corki': 'bandle-city', 'Darius': 'noxus', 'Diana': 'targon', 'DrMundo': 'zaun', 'Draven': 'noxus', 'Ekko': 'zaun', 'Elise': 'shadow-isles', 'Evelynn': 'runeterra', 'Ezreal': 'piltover', 'Fiddlesticks': 'runeterra', 'Fiora': 'demacia', 'Fizz': 'bilgewater', 'Galio': 'demacia', 'Gangplank': 'bilgewater', 'Garen': 'demacia', 'Gnar': 'freljord', 'Gragas': 'freljord', 'Graves': 'bilgewater', 'Gwen': 'shadow-isles', 'Hecarim': 'shadow-isles', 'Heimerdinger': 'piltover', 'Hwei': 'ionia', 'Illaoi': 'bilgewater', 'Irelia': 'ionia', 'Ivern': 'ionia', 'Janna': 'zaun', 'JarvanIV': 'demacia', 'Jax': 'runeterra', 'Jayce': 'piltover', 'Jhin': 'ionia', 'Jinx': 'zaun', 'Kaisa': 'void', 'Kalista': 'shadow-isles', 'Karma': 'ionia', 'Karthus': 'shadow-isles', 'Kassadin': 'void', 'Katarina': 'noxus', 'Kayle': 'demacia', 'Kayn': 'ionia', 'Kennen': 'ionia', 'Khazix': 'void', 'Kindred': 'runeterra', 'Kled': 'noxus', 'KogMaw': 'void', 'Ksante': 'shurima', 'Leblanc': 'noxus', 'LeeSin': 'ionia', 'Leona': 'targon', 'Lillia': 'ionia', 'Lissandra': 'freljord', 'Lucian': 'demacia', 'Lulu': 'bandle-city', 'Lux': 'demacia', 'Malphite': 'ixtal', 'Malzahar': 'shurima', 'Maokai': 'shadow-isles', 'MasterYi': 'ionia', 'Milio': 'ixtal', 'MissFortune': 'bilgewater', 'MonkeyKing': 'ionia', 'Mordekaiser': 'noxus', 'Morgana': 'demacia', 'Naafiri': 'shurima', 'Nami': 'runeterra', 'Nasus': 'shurima', 'Nautilus': 'bilgewater', 'Neeko': 'ixtal', 'Nidalee': 'ixtal', 'Nilah': 'bilgewater', 'Nocturne': 'runeterra', 'Nunu': 'freljord', 'Olaf': 'freljord', 'Orianna': 'piltover', 'Ornn': 'freljord', 'Pantheon': 'targon', 'Poppy': 'demacia', 'Pyke': 'bilgewater', 'Qiyana': 'ixtal', 'Quinn': 'demacia', 'Rakan': 'ionia', 'Rammus': 'shurima', 'RekSai': 'void', 'Rell': 'noxus', 'Renata': 'zaun', 'Renekton': 'shurima', 'Rengar': 'ixtal', 'Riven': 'noxus', 'Rumble': 'bandle-city', 'Ryze': 'runeterra', 'Samira': 'noxus', 'Sejuani': 'freljord', 'Senna': 'shadow-isles', 'Seraphine': 'piltover', 'Sett': 'ionia', 'Shaco': 'runeterra', 'Shen': 'ionia', 'Shyvana': 'demacia', 'Singed': 'zaun', 'Sion': 'noxus', 'Sivir': 'shurima', 'Skarner': 'ixtal', 'Smolder': 'runeterra', 'Sona': 'demacia', 'Soraka': 'targon', 'Swain': 'noxus', 'Sylas': 'demacia', 'Syndra': 'ionia', 'TahmKench': 'bilgewater', 'Taliyah': 'shurima', 'Talon': 'noxus', 'Taric': 'targon', 'Teemo': 'bandle-city', 'Thresh': 'shadow-isles', 'Tristana': 'bandle-city', 'Trundle': 'freljord', 'Tryndamere': 'freljord', 'TwistedFate': 'bilgewater', 'Twitch': 'zaun', 'Udyr': 'freljord', 'Urgot': 'zaun', 'Varus': 'ionia', 'Vayne': 'demacia', 'Veigar': 'bandle-city', 'Velkoz': 'void', 'Vex': 'shadow-isles', 'Vi': 'piltover', 'Viego': 'shadow-isles', 'Viktor': 'zaun', 'Vladimir': 'noxus', 'Volibear': 'freljord', 'Warwick': 'zaun', 'Xayah': 'ionia', 'Xerath': 'shurima', 'XinZhao': 'demacia', 'Yasuo': 'ionia', 'Yone': 'ionia', 'Yorick': 'shadow-isles', 'Yuumi': 'bandle-city', 'Zac': 'zaun', 'Zed': 'ionia', 'Zeri': 'zaun', 'Ziggs': 'zaun', 'Zilean': 'runeterra', 'Zoe': 'targon', 'Zyra': 'ixtal'
};

const CHAMP_REGIONS_LOWER = {};
Object.keys(CHAMP_REGIONS).forEach(k => CHAMP_REGIONS_LOWER[k.toLowerCase()] = CHAMP_REGIONS[k]);

function updateRegionBackground(champName) {
  const modal = document.getElementById('player-details-modal');
  if (!modal) return;
  const champId = cleanChampId(champName);
  if (!champId) return;
  const region = CHAMP_REGIONS_LOWER[champId.toLowerCase()] || 'runeterra';
  const wallpaperUrl = REGION_WALLPAPERS[region];
  
  if (wallpaperUrl) {
    // Aplicamos el fondo al modal entero (backdrop) con un oscurecimiento para elegancia
    modal.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), url('${wallpaperUrl}')`;
    modal.style.backgroundSize = 'cover';
    modal.style.backgroundPosition = 'center';
    modal.style.transition = 'background-image 1s ease-in-out';
  }
}

// Función para cargar un Splash Art vertical aleatorio (TOTALMENTE ASEGURADA)
async function setRandomSplash(rawChampName) {
  const bgEl = document.getElementById('dash-left-bg');
  if (!bgEl) return;
  
  bgEl.style.backgroundImage = 'none';
  const champId = cleanChampId(rawChampName);
  if (!champId) return;

  // Actualizar fondo de región del modal completo
  updateRegionBackground(champId);

  try {
    const resp = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/en_US/champion/${champId}.json`);
    if (!resp.ok) return;
    const data = await resp.json();
    
    if (data.data[champId]) {
      const skins = data.data[champId].skins;
      const specials = skins.filter(s => s.num !== 0 && !s.name.includes('(') && !s.name.toLowerCase().includes('chroma'));
      
      let selectedSkin;
      if (specials.length > 0 && Math.random() > 0.01) {
        selectedSkin = specials[Math.floor(Math.random() * specials.length)];
      } else {
        selectedSkin = skins[0];
      }

      const bust = Math.random().toString(36).substring(7);
      const url = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champId}_${selectedSkin.num}.jpg?v=${bust}`;
      
      const img = new Image();
      img.onload = () => {
        bgEl.style.backgroundImage = `url('${url}')`;
        console.log(`✅ Splash cargado con éxito: ${champId}`);
      };
      img.onerror = () => {
        const remainingSpecials = specials.filter(s => s.num !== selectedSkin.num);
        if (remainingSpecials.length > 0) {
          const nextSkin = remainingSpecials[Math.floor(Math.random() * remainingSpecials.length)];
          const nextUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champId}_${nextSkin.num}.jpg?v=${bust}`;
          const nextImg = new Image();
          nextImg.onload = () => { bgEl.style.backgroundImage = `url('${nextUrl}')`; };
          nextImg.onerror = () => { bgEl.style.backgroundImage = `url('https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champId}_0.jpg')`; };
          nextImg.src = nextUrl;
        } else {
          bgEl.style.backgroundImage = `url('https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champId}_0.jpg')`;
        }
      };
      img.src = url;
    }
  } catch (error) {
    console.error("Error en Splash:", error);
  }
}


function openPlayerDetails(player) {
  currentModalPuuid = player.puuid;
  const modal = document.getElementById('player-details-modal');

  // Determinar campeón objetivo
  let target = getMostPlayedFromHistory(player.matchStatsHistory);
  if (!target && player.topChampions && player.topChampions.length > 0) {
    target = player.topChampions[0].name;
  }
  
  setRandomSplash(target);
  
  // Header Info
  document.getElementById('detail-profile-icon').src = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${player.profileIconId || 1}.png`;
  document.getElementById('detail-level').textContent = player.summonerLevel || 0;
  document.getElementById('detail-name').textContent = player.gameName;
  document.getElementById('detail-region').textContent = getRegionName(player.region);
  
  const statusEl = document.getElementById('detail-status');
  if (player.isLive) {
    statusEl.textContent = 'EN PARTIDA';
    statusEl.className = 'status-badge';
  } else {
    statusEl.textContent = 'DESCONECTADO';
    statusEl.className = 'status-badge offline';
  }

      // LÓGICA DE TAG OTP PREMIUM (Sincronizada a 20 SoloQ)
      const otpContainer = document.getElementById('otp-badge-container');
      otpContainer.innerHTML = '';
      
      const soloQ20 = (player.matchStatsHistory || [])
        .filter(m => (m.queueId === 420 || m.queueType === 'RANKED_SOLO_5x5') && !m.isRemake)
        .slice(0, 20);

      if (soloQ20.length >= 5) {
        const counts = {};
        soloQ20.forEach(m => {
          const name = m.championName;
          if (name && name !== 'Unknown') counts[name] = (counts[name] || 0) + 1;
        });

        let topChamp = null;
        let maxCount = 0;
        for (const champ in counts) {
          if (counts[champ] > maxCount) {
            maxCount = counts[champ];
            topChamp = champ;
          }
        }

        if ((maxCount / soloQ20.length) >= 0.8) {
          otpContainer.innerHTML = `
            <div class="badge-otp" title="¡Este jugador es un especialista con ${topChamp}!">
              <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${topChamp}.png" class="otp-mini-icon" alt="${topChamp}" />
              <span>OTP ${topChamp}</span>
            </div>`;
        }
      }


  // W/L Calculation
  const historyArr = player.history || [];
  const wins = historyArr.filter(r => r === 'W').length;
  const losses = historyArr.filter(r => r === 'L').length;
  const total = wins + losses;
  
  const totalWins = player.wins !== undefined ? player.wins : wins;
  const totalLosses = player.losses !== undefined ? player.losses : losses;
  const totalGames = totalWins + totalLosses;
  const wr = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  // Big Winrate Top Right
  const wrEl = document.getElementById('detail-wr-big');

  // Helper function to render a specific queue
  const renderQueueStats = (queueData) => {
    if (!queueData) queueData = { tier: 'UNRANKED', rank: '', leaguePoints: 0, wins: 0, losses: 0 };
    
    const tier = (queueData.tier || 'UNRANKED').toLowerCase();
    
    // Mapeo oficial de colores por Rango para tintado dinámico y armonía cromática total
    const TIER_RGB = {
      challenger: { r: 210, g: 140, b: 25 },     // Cobre/Oro envejecido sofisticado
      grandmaster: { r: 165, g: 45, b: 45 },     // Carmesí oscuro profundo
      master: { r: 125, g: 60, b: 180 },          // Amatista imperial profunda
      diamond: { r: 50, g: 135, b: 175 },         // Azul acero glaciar apagado
      emerald: { r: 20, g: 115, b: 75 },          // Verde jade imperial sobrio
      platinum: { r: 25, g: 125, b: 115 },        // Turquesa oscuro mate
      gold: { r: 165, g: 130, b: 70 },            // Oro viejo / Latón pulido satinado
      silver: { r: 85, g: 95, b: 110 },           // Plata pizarra mate
      bronze: { r: 115, g: 70, b: 50 },           // Bronce terracota apagado
      iron: { r: 75, g: 70, b: 65 },              // Acero de forja oscuro
      unranked: { r: 85, g: 80, b: 75 },          // Gris carbón neutro
      provisional: { r: 85, g: 80, b: 75 }
    };
    
    const color = TIER_RGB[tier] || TIER_RGB.unranked;
    const modal = document.getElementById('player-details-modal');
    if (modal) {
      // Inyección ultra-sutil y opaca para integrarse con el Shadow Rose & Gold oscuro
      modal.style.setProperty('--champ-accent', `rgb(${color.r}, ${color.g}, ${color.b})`);
      modal.style.setProperty('--champ-accent-alpha', `rgba(${color.r}, ${color.g}, ${color.b}, 0.06)`); // Solo 6% para un brillo ambiental susurrado
      modal.style.setProperty('--champ-accent-glow', `rgba(${color.r}, ${color.g}, ${color.b}, 0.35)`); // 35% para el Outer Glow del rango
      modal.style.setProperty('--champ-accent-deep', `rgba(${Math.max(0, color.r - 35)}, ${Math.max(0, color.g - 35)}, ${Math.max(0, color.b - 35)}, 0.45)`);
    }
    
    // 1. Emblema clásico en el cuadro de rango
    document.getElementById('detail-rank-emblem').src = `${ASSETS_BASE}/ranks/${tier}.png`;
    
    // 2. Alas y Marco Oficiales en el Avatar
    const wingsEl = document.getElementById('detail-rank-wings');
    const frameEl = document.getElementById('detail-rank-frame');
    
    if (tier === 'unranked' || tier === 'provisional') {
      wingsEl.style.display = 'none';
      frameEl.style.display = 'none';
    } else {
      wingsEl.style.display = 'block';
      frameEl.style.display = 'block';
      // Marco y Alas Oficiales (Regalia)
      wingsEl.src = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/wings/wings_${tier}.png`;
      frameEl.src = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/regalia/borders/ranked_${tier}_level_3.png`;
    }
    
    // 3. Marco de pantalla de carga (Loading Card Frame)
    const cardFrameEl = document.getElementById('dash-loading-frame');
    if (cardFrameEl) {
      cardFrameEl.className = 'dash-loading-frame';
      cardFrameEl.classList.add(`frame-${tier}`);
    }

    const isApexTier = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes((queueData.tier || '').toUpperCase());
    document.getElementById('detail-tier-rank').textContent = 
      queueData.tier === 'UNRANKED' 
        ? 'UNRANKED' 
        : isApexTier 
          ? queueData.tier 
          : `${queueData.tier} ${queueData.rank}`;
    document.getElementById('detail-lp').textContent = `${queueData.leaguePoints || 0} LP`;
    
    const w = queueData.wins || 0;
    const l = queueData.losses || 0;
    const t = w + l;
    const qWr = t > 0 ? Math.round((w / t) * 100) : 0;
    
    document.getElementById('detail-wins').textContent = `${w} W`;
    document.getElementById('detail-losses').textContent = `${l} L`;
    
    // Winrate dinámico con color y medalla de calificación
    let wrColor = '#ef4444'; // Red
    let wrRating = 'Deficiente';
    if (qWr >= 60) {
      wrColor = '#ff9f43'; // Fuego/Oro
      wrRating = '¡SMURF!';
    } else if (qWr >= 50) {
      wrColor = '#22c55e'; // Green
      wrRating = 'Positivo';
    } else if (qWr > 0) {
      wrColor = '#ef4444'; // Red
      wrRating = 'Mejorable';
    } else {
      wrColor = '#94a3b8'; // Grey (no games)
      wrRating = 'Sin datos';
    }
    
    if (t > 0) {
      wrEl.innerHTML = `<span class="wr-num" style="color: ${wrColor}; font-size: 2.0rem; font-weight: 900; text-shadow: 0 0 15px ${wrColor}33; font-family: 'Outfit', sans-serif;">${qWr}%</span> <span class="wr-label" style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px;">WR</span> <span class="wr-badge" style="background: ${wrColor}15; border: 1px solid ${wrColor}33; color: ${wrColor}; font-size: 0.65rem; font-weight: 900; padding: 2px 8px; border-radius: 6px; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">${wrRating}</span>`;
    } else {
      wrEl.innerHTML = `<span class="wr-num" style="color: #94a3b8; font-size: 2.0rem; font-weight: 900; font-family: 'Outfit', sans-serif;">--%</span> <span class="wr-label" style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px;">WR</span>`;
    }
    
    const winBar = document.getElementById('detail-win-bar');
    winBar.style.width = t > 0 ? `${qWr}%` : '0%';
  };

  // Función para actualizar los puntos de forma según la cola
  const updateFormDots = (queueType) => {
    const formContainer = document.getElementById('player-form');
    const streakBadge = document.getElementById('streak-badge');
    if (!formContainer) return;
    
    formContainer.innerHTML = '';
    if (streakBadge) {
      streakBadge.style.visibility = 'hidden';
      streakBadge.innerHTML = ''; // Vaciar para mantener el ancho mínimo del CSS
      streakBadge.className = 'streak-badge';
    }
    
    // Mapeo de IDs de cola de Riot (420: Solo, 440: Flex)
    const queueIds = queueType === 'flex' ? [440, 'RANKED_FLEX_SR'] : [420, 'RANKED_SOLO_5x5'];

    const filteredMatches = (player.matchStatsHistory || [])
      .filter(m => (queueIds.includes(m.queueId) || queueIds.includes(m.queueType)) && !m.isRemake)
      .slice(0, 5);

    // Renderizar los puntos
    filteredMatches.forEach(match => {
      const dot = document.createElement('div');
      dot.className = `form-dot ${match.win ? 'win' : 'loss'}`;
      dot.title = `${queueType === 'flex' ? 'Flex' : 'Solo Q'} - ${match.win ? 'Victoria' : 'Derrota'}`;
      formContainer.appendChild(dot);
    });

    // Lógica de Racha (🔥 / ❄️)
    if (filteredMatches.length >= 2 && streakBadge) {
      let streakCount = 0;
      const firstResult = filteredMatches[0].win;
      
      for (const match of filteredMatches) {
        if (match.win === firstResult) {
          streakCount++;
        } else {
          break;
        }
      }

      if (streakCount >= 2) {
        streakBadge.style.visibility = 'visible';
        if (firstResult) {
          streakBadge.innerHTML = `<span class="streak-emoji">🔥</span> x${streakCount}`;
          streakBadge.classList.add('streak-fire');
        } else {
          streakBadge.innerHTML = `<span class="streak-emoji">❄️</span> x${streakCount}`;
          streakBadge.classList.add('streak-cold');
        }
      }
    }
  };

  // Setup toggle buttons
  const btnSolo = document.getElementById('btn-soloq');
  const btnFlex = document.getElementById('btn-flexq');

  let currentQueue = 'soloq'; // Definición necesaria para el renderizado inicial

  btnSolo.onclick = () => {
    btnSolo.classList.add('active');
    btnFlex.classList.remove('active');
    currentQueue = 'soloq';
    renderQueueStats(player.soloQ);
    updateFormDots('solo'); 
    if (typeof loadStats === 'function') loadStats(player.advancedStats ? player.advancedStats.soloq || player.advancedStats : null);
    if (typeof renderHistory === 'function') renderHistory(player.matchStatsHistory, currentQueue);
    if (typeof renderLanesDistribution === 'function') renderLanesDistribution(player.matchStatsHistory, currentQueue);
  };

  btnFlex.onclick = () => {
    btnFlex.classList.add('active');
    btnSolo.classList.remove('active');
    currentQueue = 'flexq';
    renderQueueStats(player.flexQ);
    updateFormDots('flex'); 
    if (typeof loadStats === 'function') loadStats(player.advancedStats ? player.advancedStats.flexq || player.advancedStats : null);
    if (typeof renderHistory === 'function') renderHistory(player.matchStatsHistory, currentQueue);
    if (typeof renderLanesDistribution === 'function') renderLanesDistribution(player.matchStatsHistory, currentQueue);
  };

  // Render default (SoloQ)
  btnSolo.onclick();

  // Lógica de "Mejores Campeones" Inteligente (Prioriza Historial Solo Q + Winrate)
  const soloQMatchesDetailed = (player.matchStatsHistory || [])
    .filter(m => (m.queueId === 420 || m.queueType === 'RANKED_SOLO_5x5') && !m.isRemake);
  
  let champsToDisplay = [];
  
  if (soloQMatchesDetailed.length > 0) {
    const stats = {};
    soloQMatchesDetailed.forEach(m => {
      const name = m.championName;
      if (name && name !== 'Unknown') {
        if (!stats[name]) stats[name] = { count: 0, wins: 0 };
        stats[name].count++;
        if (m.win) stats[name].wins++;
      }
    });
    
    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
      
    champsToDisplay = sorted.map(([name, data]) => {
      const mastery = (player.topChampions || []).find(c => c.name === name);
      const wr = Math.round((data.wins / data.count) * 100);
      return {
        name: name,
        level: mastery ? mastery.level : 1,
        points: mastery ? mastery.points : 0,
        recentCount: data.count,
        wins: data.wins,
        losses: data.count - data.wins,
        winRate: wr
      };
    });
  }
  
  if (champsToDisplay.length === 0) {
    champsToDisplay = (player.topChampions || []).slice(0, 3);
  }

  const champsContainer = document.getElementById('detail-top-champs');
  champsContainer.innerHTML = '';
  
  if (champsToDisplay.length > 0) {
    champsToDisplay.forEach(champ => {
      let subText = "";
      if (champ.recentCount !== undefined) {
        const wrClass = champ.winRate >= 50 ? 'wr-positive' : 'wr-negative';
        const wColor = '#22c55e'; // Verde intenso
        const lColor = '#ef4444'; // Rojo intenso
        const gColor = '#f0b90b'; // Oro más intenso y vibrante
        
        subText = `
          <span style="color:${wColor}; font-weight:800;">${champ.wins}W</span> 
          <span style="color:${gColor}; margin: 0 2px; font-weight:800;">/</span> 
          <span style="color:${lColor}; font-weight:800;">${champ.losses}L</span>
          <span style="color:${gColor}; margin: 0 6px; font-weight:800;">-</span> 
          <span class="${wrClass}" style="font-weight:800;">${champ.winRate}% WR</span>
        `;
      } else {
        subText = `${champ.points.toLocaleString('es-ES')} Pts`;
      }
      
      const crestUrl = getMasteryCrest(champ.level);
      
      champsContainer.innerHTML += `
        <div class="champ-detail-item m-lvl-${champ.level}">
          <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champ.name}.png" class="champ-detail-icon" onerror="this.src='/assets/placeholder_champ.png'" />
          ${champ.level >= 4 
            ? `<img src="${crestUrl}" class="champ-detail-crest" onerror="this.style.display='none'" />` 
            : '<div class="champ-detail-crest-spacer"></div>'}
          <div class="champ-detail-info">
            <div class="champ-detail-name">${champ.name}</div>
            <div class="champ-detail-pts">${subText}</div>
          </div>
        </div>
      `;
    });
  } else {
    champsContainer.innerHTML = '<span class="history-empty">Sin datos de campeones</span>';
  }

  // Cargar Estadísticas si existen con colores dinámicos y medallas de calificación
  function loadStats(stats) {
    const kdaTitle = document.getElementById('detail-kda-title');
    if (stats && stats.avgGold !== undefined) {
      const kdaVal = parseFloat(stats.kda) || 0.0;
      let kdaColor = '#94a3b8'; // Slate Silver
      let kdaRating = 'Normal';
      if (kdaVal >= 4.0) {
        kdaColor = '#ff9f43'; // Fuego/Oro Legendario
        kdaRating = '¡LEYENDA!';
      } else if (kdaVal >= 3.0) {
        kdaColor = '#a855f7'; // Amatista Excelente
        kdaRating = 'Excelente';
      } else if (kdaVal >= 2.0) {
        kdaColor = '#38bdf8'; // Sky Blue Sólido
        kdaRating = 'Sólido';
      } else if (kdaVal > 0) {
        kdaColor = '#ef4444'; // Soft Red Mejorable
        kdaRating = 'Mejorable';
      }
      
      kdaTitle.innerHTML = `<span class="kda-num" style="color: ${kdaColor}; font-size: 2.0rem; font-weight: 900; text-shadow: 0 0 15px ${kdaColor}33; font-family: 'Outfit', sans-serif;">${stats.kda}</span> <span class="kda-label" style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px;">KDA</span> <span class="kda-badge" style="background: ${kdaColor}15; border: 1px solid ${kdaColor}33; color: ${kdaColor}; font-size: 0.65rem; font-weight: 900; padding: 2px 8px; border-radius: 6px; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">${kdaRating}</span>`;
      
      document.getElementById('stat-gold').textContent = stats.avgGold.toLocaleString('es-ES');
      document.getElementById('stat-deaths').textContent = stats.avgDeaths;
      document.getElementById('stat-cs').textContent = stats.csPerMin;
      document.getElementById('stat-kp').textContent = `${stats.avgKp}%`;
      document.getElementById('stat-dmg').textContent = stats.avgDamageDealt.toLocaleString('es-ES');
      document.getElementById('stat-dmg-taken').textContent = stats.avgDamageTaken.toLocaleString('es-ES');
    } else {
      kdaTitle.innerHTML = `<span class="kda-num" style="color: #94a3b8; font-size: 2.0rem; font-weight: 900; font-family: 'Outfit', sans-serif;">0.00</span> <span class="kda-label" style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px;">KDA</span>`;
      document.getElementById('stat-gold').textContent = 'N/A';
      document.getElementById('stat-deaths').textContent = 'N/A';
      document.getElementById('stat-cs').textContent = 'N/A';
      document.getElementById('stat-kp').textContent = 'N/A';
      document.getElementById('stat-dmg').textContent = 'N/A';
      document.getElementById('stat-dmg-taken').textContent = 'N/A';
    }
  }

  // Mapeador de Campeones a Posición/Línea
  function getChampionLane(champName) {
    const name = (champName || '').toLowerCase().trim();
    
    // TOP
    if ([
      'aatrox', 'akali', 'camille', 'chogath', 'darius', 'drmundo', 'fiora', 'gangplank', 'garen', 'gnar', 'gragas', 'gwen', 'illaoi', 'irelia', 'jax', 'jayce', 'ksante', 'kayle', 'kennen', 'kled', 'malphite', 'mordekaiser', 'nasus', 'olaf', 'ornn', 'pantheon', 'poppy', 'quinn', 'renekton', 'riven', 'rumble', 'shen', 'singed', 'sion', 'teemo', 'tryndamere', 'urgot', 'volibear', 'yorick'
    ].includes(name)) return 'TOP';
    
    // JUNGLE
    if ([
      'amumu', 'belveth', 'briar', 'elise', 'evelynn', 'fiddlesticks', 'graves', 'hecarim', 'ivern', 'jarvaniv', 'karthus', 'kayn', 'khazix', 'kindred', 'leesin', 'lillia', 'masteryi', 'nidalee', 'nocturne', 'nunu', 'rammus', 'reksai', 'rengar', 'sejuani', 'shaco', 'shyvana', 'skarner', 'trundle', 'udyr', 'vi', 'viego', 'warwick', 'xinzhao', 'xin zhao', 'zac'
    ].includes(name)) return 'JUNGLE';
    
    // ADC / BOTTOM
    if ([
      'aphelios', 'ashe', 'caitlyn', 'draven', 'ezreal', 'jhin', 'jinx', 'kaisa', 'kalista', 'kogmaw', 'lucian', 'missfortune', 'nilah', 'samira', 'sivir', 'smolder', 'tristana', 'twitch', 'varus', 'vayne', 'xayah', 'zeri'
    ].includes(name)) return 'BOTTOM';
    
    // SUPPORT / UTILITY
    if ([
      'alistar', 'bard', 'blitzcrank', 'braum', 'janna', 'karma', 'leona', 'lulu', 'milio', 'morgana', 'nami', 'nautilus', 'pyke', 'rakan', 'rell', 'renata', 'senna', 'seraphine', 'sona', 'soraka', 'taric', 'thresh', 'yuumi', 'zyra'
    ].includes(name)) return 'UTILITY';
    
    // MID (default standard mages / assassins)
    if ([
      'ahri', 'akshan', 'anivia', 'annie', 'aurelionsol', 'azir', 'cassiopeia', 'corki', 'diana', 'ekko', 'fizz', 'galio', 'heimerdinger', 'hwei', 'kassadin', 'katarina', 'leblanc', 'lissandra', 'lux', 'malzahar', 'naafiri', 'neeko', 'orianna', 'ryze', 'swain', 'syndra', 'taliyah', 'talon', 'twistedfate', 'veigar', 'velkoz', 'viktor', 'vladimir', 'xerath', 'yasuo', 'yone', 'zoe'
    ].includes(name)) return 'MID';
    
    // Fallbacks
    return 'MID';
  }

  // Render Mapa de Calor de Líneas
  function renderLanesDistribution(history, queueType) {
    const container = document.getElementById('detail-lanes-distribution');
    if (!container) return;
    container.innerHTML = '';

    const laneCounts = { TOP: 0, JUNGLE: 0, MID: 0, BOTTOM: 0, UTILITY: 0 };
    let activeMatches = 0;

    if (history && history.length > 0) {
      const filteredHistory = history.filter(match => {
        if (queueType === 'soloq') {
          return !match.queueId || match.queueId == 420;
        } else if (queueType === 'flexq') {
          return match.queueId == 440;
        }
        return true;
      });

      filteredHistory.forEach(match => {
        let rawLane = match.lane;
        
        // Si no tiene la línea (partida antigua en DB), usamos el adivinador de respaldo
        if (!rawLane || rawLane === 'Unknown') {
          rawLane = getChampionLane(match.championName);
        }
        
        // Normalizar a nuestras claves internas estándar
        let finalLane = 'MID';
        const l = rawLane.toUpperCase().trim();
        if (l === 'TOP') {
          finalLane = 'TOP';
        } else if (l === 'JUNGLE') {
          finalLane = 'JUNGLE';
        } else if (l === 'MIDDLE' || l === 'MID') {
          finalLane = 'MID';
        } else if (l === 'BOTTOM' || l === 'BOTTOM_CARRY' || l === 'ADC') {
          finalLane = 'BOTTOM';
        } else if (l === 'UTILITY' || l === 'BOTTOM_SUPPORT' || l === 'SUPPORT') {
          finalLane = 'UTILITY';
        }

        if (laneCounts[finalLane] !== undefined) {
          laneCounts[finalLane]++;
          activeMatches++;
        }
      });
    }

    const LANE_METADATA = {
      TOP: { name: 'TOP', icon: 'icon-position-top.png', color: 'rgb(240, 110, 110)', rgb: '240, 110, 110' },
      JUNGLE: { name: 'JUNGLA', icon: 'icon-position-jungle.png', color: 'rgb(74, 222, 128)', rgb: '74, 222, 128' },
      MID: { name: 'MID', icon: 'icon-position-middle.png', color: 'rgb(192, 132, 252)', rgb: '192, 132, 252' },
      BOTTOM: { name: 'ADC', icon: 'icon-position-bottom.png', color: 'rgb(56, 189, 248)', rgb: '56, 189, 248' },
      UTILITY: { name: 'SOPORTE', icon: 'icon-position-utility.png', color: 'rgb(251, 191, 36)', rgb: '251, 191, 36' }
    };

    const orderedLanes = ['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'UTILITY'];

    // Encontrar el porcentaje máximo para el rol principal
    let maxPct = 0;
    orderedLanes.forEach(laneKey => {
      const count = laneCounts[laneKey];
      const pct = activeMatches > 0 ? Math.round((count / activeMatches) * 100) : 0;
      if (pct > maxPct) maxPct = pct;
    });

    orderedLanes.forEach(laneKey => {
      const count = laneCounts[laneKey];
      const pct = activeMatches > 0 ? Math.round((count / activeMatches) * 100) : 0;
      const meta = LANE_METADATA[laneKey];
      const isActive = pct > 0;
      const isMostPlayed = isActive && pct === maxPct && maxPct > 0;

      container.innerHTML += `
        <div class="lane-vertical-card ${isActive ? 'active' : 'inactive'} ${isMostPlayed ? 'most-played' : ''}" style="--lane-color: ${meta.color}; --lane-color-rgb: ${meta.rgb};">
          <div class="lane-vertical-bar-container">
            <div class="lane-vertical-bar-fill" style="height: ${pct}%" title="${meta.name}: ${pct}%"></div>
          </div>
          <img src="https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/${meta.icon}" class="lane-vertical-icon" alt="${meta.name}" title="${meta.name}: ${pct}%" />
        </div>
      `;
    });
  }

  // Render Historial de Partidas
  function renderHistory(history, queueType) {
    const historyContainer = document.getElementById('detail-match-history');
    historyContainer.innerHTML = '';
    
    if (history && history.length > 0) {
      const filteredHistory = history.filter(match => {
        if (queueType === 'soloq') {
          return !match.queueId || match.queueId == 420; // old matches default to soloq
        } else if (queueType === 'flexq') {
          return match.queueId == 440;
        }
        return true;
      });

      if (filteredHistory.length === 0) {
        historyContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 0.9rem;">No hay partidas recientes guardadas para esta cola.</div>';
        return;
      }

      // Agrupar partidas por día
      const grouped = [];
      let lastDateStr = "";

      filteredHistory.forEach(match => {
        const dateObj = new Date(match.timestamp || Date.now());
        const dateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
        
        if (dateStr !== lastDateStr) {
          grouped.push({ date: dateStr, matches: [], wins: 0, losses: 0 });
          lastDateStr = dateStr;
        }
        
        const currentGroup = grouped[grouped.length - 1];
        currentGroup.matches.push(match);
        if (!match.isRemake) {
          if (match.win) currentGroup.wins++;
          else currentGroup.losses++;
        }
      });

      grouped.forEach(group => {
        historyContainer.innerHTML += `
          <div class="date-separator">
            <span class="ds-date">${group.date}</span>
            <div class="ds-badges">
              <span class="ds-badge win">${group.wins} win</span>
              <span class="ds-badge loss">${group.losses} loss</span>
            </div>
          </div>
        `;

        group.matches.forEach(match => {
          const isRemake = match.isRemake;
          const isWin = match.win;
          const winClass = isRemake ? 'match-remake' : (isWin ? 'match-win' : 'match-loss');
          const resultText = isRemake ? 'REMAKE' : (isWin ? 'VICTORIA' : 'DERROTA');
          
          let lpHtml = '';
          if (match.lpChange !== undefined && match.lpChange !== null && !isRemake) {
            const sign = match.lpChange > 0 ? '+' : '';
            const colorClass = match.lpChange > 0 ? 'lp-gain' : 'lp-loss';
            lpHtml = `<div class="match-lp ${colorClass}">${sign}${match.lpChange} LP</div>`;
          }
          
          const kdaStr = `${match.kills} / ${match.deaths} / ${match.assists}`;
          const kdaRatio = match.deaths > 0 ? ((match.kills + match.assists) / match.deaths).toFixed(2) : 'Perfect';
          const goldStr = match.gold.toLocaleString('es-ES');
          const dmgStr = match.damageDealt.toLocaleString('es-ES');
          const kpStr = Math.round(match.kp * 100);

          const champName = match.championName || 'Unknown';
          const champIconUrl = champName !== 'Unknown' 
            ? `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champName}.png`
            : `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png`;
          
          historyContainer.innerHTML += `
            <div class="match-item ${winClass}">
              <div class="match-champ">
                <img src="${champIconUrl}" class="match-champ-icon" alt="${champName}" onerror="this.onerror=null; this.src='https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png';" title="${champName}" />
              </div>
              <div class="match-result-box">
                <div class="match-result">${resultText}</div>
                ${lpHtml}
              </div>
              <div class="match-stat"><strong>KDA:</strong> ${kdaStr} <span style="opacity:0.6;font-size:0.7rem;">(${kdaRatio})</span></div>
              <div class="match-stat"><strong>CS:</strong> ${match.cs}</div>
              <div class="match-stat"><strong>Oro:</strong> ${goldStr}</div>
              <div class="match-stat"><strong>Daño:</strong> ${dmgStr}</div>
              <div class="match-stat"><strong>KP:</strong> ${kpStr}%</div>
            </div>
          `;
        });
      });
    } else {
      historyContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 0.9rem;">No hay historial guardado. Haz clic en "Actualizar Datos" para cargar tus últimas partidas.</div>';
    }
  }

  // El primer renderQueueStats invoca btnSolo.onclick() en la línea 392 aprox,
  // pero lo llamaremos explícitamente abajo para evitar condiciones de carrera
  if (typeof loadStats === 'function') loadStats(player.advancedStats ? player.advancedStats[currentQueue] || player.advancedStats : null);
  if (typeof renderHistory === 'function') renderHistory(player.matchStatsHistory, currentQueue);
  if (typeof renderLanesDistribution === 'function') renderLanesDistribution(player.matchStatsHistory, currentQueue);

  // Botón para actualizar partidas recientes
  const btnUpdateMatches = document.getElementById('btn-update-matches');
  btnUpdateMatches.onclick = async () => {
    try {
      startLoadingBar();
      btnUpdateMatches.classList.add('loading');
      btnUpdateMatches.disabled = true;
      
      const response = await fetch(`${API_BASE}/summoners/${player.puuid}/matches/update`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok) {
        showToast(data.message, data.updated ? 'success' : 'info');
        if (data.updated && data.stats) {
          player.advancedStats = data.stats; 
          player.matchStatsHistory = data.history; // Guardar historial nuevo
          loadStats(player.advancedStats[currentQueue]);
          renderHistory(data.history, currentQueue); // Refrescar lista de historial filtrado
          if (typeof renderLanesDistribution === 'function') renderLanesDistribution(data.history, currentQueue);
        }
      } else {
        showToast(`❌ ${data.message}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('❌ Error al actualizar partidas.', 'error');
    } finally {
      btnUpdateMatches.classList.remove('loading');
      btnUpdateMatches.disabled = false;
      finishLoadingBar();
    }
  };

  // Bind close button
  modal.querySelector('.close-details').onclick = () => {
    modal.classList.remove('active');
    document.body.style.overflow = ''; // Restaurar scroll del body
    currentModalPuuid = null;
  };
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

// Lógica del Modal para Añadir Jugador
function initModal() {
  const modal = document.getElementById('add-player-modal');
  const btn = document.getElementById('add-player-btn');
  const span = document.querySelector('.close-modal');
  const form = document.getElementById('add-player-form');

  if (!modal || !btn || !span || !form) return;

  btn.onclick = () => modal.classList.add('active');
  span.onclick = () => modal.classList.remove('active');
  
  // Cerrar al hacer clic fuera del modal (Aplica para todos los modales)
  window.onclick = (event) => {
    const confirmDeleteModal = document.getElementById('confirm-delete-modal');
    const detailsModal = document.getElementById('player-details-modal');
    
    if (event.target === modal) modal.classList.remove('active');
    if (event.target === confirmDeleteModal) confirmDeleteModal.classList.remove('active');
    if (event.target === detailsModal) {
      detailsModal.classList.remove('active');
      document.body.style.overflow = '';
      currentModalPuuid = null;
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('.submit-btn-gold');
    const originalText = submitBtn.innerText;
    
    const data = {
      region: document.getElementById('region').value,
      gameName: document.getElementById('gameName').value,
      tagLine: document.getElementById('tagLine').value,
      isNew: true
    };

    try {
      startLoadingBar();
      submitBtn.innerText = 'Registrando...';
      submitBtn.disabled = true;

      const response = await fetch(`${API_BASE}/summoners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        showToast(result.message || '¡Operación exitosa!');
        modal.classList.remove('active');
        form.reset();
        fetchLadder(); // Recargar la lista
      } else {
        showToast(result.message || 'No se pudo añadir al jugador', 'error');
      }
    } catch (error) {
      console.error('Error adding player:', error);
      showToast('Error de conexión con el servidor.', 'error');
    } finally {
      submitBtn.innerText = originalText;
      submitBtn.disabled = false;
      finishLoadingBar();
    }
  };
}

// Sistema de Notificaciones Premium (Toast)
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✅' : '❌';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  
  container.appendChild(toast);
  
  // Eliminar automáticamente después de 4 segundos
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
    }, 500);
  }, 4000);
}

// Carga inicial
document.addEventListener('DOMContentLoaded', async () => {
  await updateVersion();
  initSkinsDatabase(); // Cargar base de datos de skins
  fetchLadder();
  initModal();
  initDeleteLogic();

  // Auto-refresh cada 5 minutos: solo re-renderiza si hay cambios en historial o LP
  setInterval(smartRefresh, 5 * 60 * 1000);
});

// Actualización silenciosa del estado en vivo cada 30 segundos
async function pollLiveStatus() {
  try {
    const res = await fetch(`${API_BASE}/live-status`);
    if (!res.ok) return;
    const statusMap = await res.json();
    
    for (const [puuid, isLive] of Object.entries(statusMap)) {
      // Actualizar dot en la tarjeta
      const dot = document.getElementById(`live-dot-${puuid}`);
      if (dot) {
        if (isLive) dot.classList.add('online');
        else dot.classList.remove('online');
      }
      
      // Actualizar el estado en el modal si está abierto y es de este jugador
      if (currentModalPuuid === puuid) {
        const statusEl = document.getElementById('detail-status');
        if (statusEl) {
          statusEl.className = isLive ? 'status-badge' : 'status-badge offline';
          statusEl.textContent = isLive ? 'EN PARTIDA' : 'DESCONECTADO';
        }
      }
    }
  } catch (e) {
    console.error('Error polling live status:', e);
  }
}

// Iniciar polling
setInterval(pollLiveStatus, 30000);

