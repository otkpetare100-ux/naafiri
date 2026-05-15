import './style.css'

const API_BASE = `${window.location.origin}/api`;
const ASSETS_BASE = '/assets';
let DDRAGON_VERSION = '16.9.1';

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
    const response = await fetch(`${API_BASE}/ladder`);
    if (!response.ok) throw new Error('Error al obtener datos');
    
    const players = await response.json();
    renderLadder(players);
  } catch (error) {
    console.error('API Error:', error);
    showToast('⚠️ Error al conectar con la API de Naafiri.', 'error');
    container.innerHTML = `<div class="error">⚠️ Jauría desconectada. Reintenta en unos momentos.</div>`;
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

    // Historial (W/L) - Viene de la API
    const history = player.history || []; 
    const historyHtml = history.map(res => `<span class="history-dot dot-${res.toLowerCase()}"></span>`).join('');

    // Clase para el Winrate
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
          <span class="status-dot ${player.isLive ? 'online' : ''}"></span>
        </div>
        <div class="player-meta">
          <span class="tag">#${player.tagLine}</span>
          <span class="region-badge reg-${(player.region || 'la1').toLowerCase()}">${getRegionName(player.region || 'la1')}</span>
        </div>
      </div>

      <div class="rank-data">
        <div class="player-champions">
          ${topChampsHtml || '<span class="no-champs">No data</span>'}
        </div>
        <div class="player-performance">
          <div class="streak-container">
            <span class="streak-tag ${Math.abs(player.streak) >= 2 ? (player.streak > 0 ? 'streak-win' : 'streak-loss') : 'streak-hidden'}">
              <span class="streak-emoji">${player.streak >= 2 ? '🔥' : player.streak <= -2 ? '❄️' : '🔥'}</span> 
              ${Math.abs(player.streak) >= 2 ? `${Math.abs(player.streak)} ${player.streak > 0 ? 'Wins' : 'Loss'}` : '0 Wins'}
            </span>
          </div>
          <div class="history-dots">${historyHtml}</div>
        </div>
        <div class="rank-emblem-container">
          <img src="${emblemUrl}" class="rank-emblem" alt="${player.tier}" onerror="this.style.opacity='0'" />
        </div>
        <div class="rank-info-text">
          <div class="tier-text">${player.tier} ${player.rank}</div>
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
    }
  };
}

// Hacer funciones disponibles globalmente para los onclick de los strings HTML
window.openDeleteModal = openDeleteModal;

// Modal de Detalles del Jugador
function openPlayerDetails(player) {
  const modal = document.getElementById('player-details-modal');
  
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
    document.getElementById('detail-rank-emblem').src = `${ASSETS_BASE}/ranks/${tier}.png`;
    document.getElementById('detail-tier-rank').textContent = queueData.tier === 'UNRANKED' ? 'UNRANKED' : `${queueData.tier} ${queueData.rank}`;
    document.getElementById('detail-lp').textContent = `${queueData.leaguePoints || 0} LP`;
    
    const w = queueData.wins || 0;
    const l = queueData.losses || 0;
    const t = w + l;
    const qWr = t > 0 ? Math.round((w / t) * 100) : 0;
    
    document.getElementById('detail-wins').textContent = `${w} W`;
    document.getElementById('detail-losses').textContent = `${l} L`;
    wrEl.textContent = `${qWr}% Winrate`;
    
    const winBar = document.getElementById('detail-win-bar');
    winBar.style.width = t > 0 ? `${qWr}%` : '0%';
  };

  // Setup toggle buttons
  const btnSolo = document.getElementById('btn-soloq');
  const btnFlex = document.getElementById('btn-flexq');

  btnSolo.onclick = () => {
    btnSolo.classList.add('active');
    btnFlex.classList.remove('active');
    renderQueueStats(player.soloQ);
  };

  btnFlex.onclick = () => {
    btnFlex.classList.add('active');
    btnSolo.classList.remove('active');
    renderQueueStats(player.flexQ);
  };

  // Render default (SoloQ)
  btnSolo.onclick();

  // Top Champs (Horizontal Row)
  const champsContainer = document.getElementById('detail-top-champs');
  champsContainer.innerHTML = '';
  if (player.topChampions && player.topChampions.length > 0) {
    player.topChampions.slice(0, 3).forEach(champ => {
      const champId = champ.name;
      const ptsStr = champ.points.toLocaleString('es-ES');
      const crestUrl = getMasteryCrest(champ.level);
      
      champsContainer.innerHTML += `
        <div class="champ-detail-item">
          <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champId}.png" class="champ-detail-icon" onerror="this.src='/assets/placeholder_champ.png'" />
          <div class="champ-detail-info">
            <div class="champ-detail-name">${champId}</div>
            <div class="champ-detail-pts">${ptsStr} Pts</div>
          </div>
          <img src="${crestUrl}" class="champ-detail-crest" onerror="this.style.display='none'" />
        </div>
      `;
    });
  } else {
    champsContainer.innerHTML = '<span class="history-empty">Sin datos de campeones</span>';
  }

  // Cargar Estadísticas si existen
  const loadStats = (stats) => {
    if (stats) {
      document.getElementById('detail-kda-title').textContent = `${stats.kda} KDA`;
      document.getElementById('stat-gold').textContent = stats.avgGold.toLocaleString('es-ES');
      document.getElementById('stat-deaths').textContent = stats.avgDeaths;
      document.getElementById('stat-cs').textContent = stats.csPerMin;
      document.getElementById('stat-kp').textContent = `${stats.avgKp}%`;
      document.getElementById('stat-dmg').textContent = stats.avgDamageDealt.toLocaleString('es-ES');
      document.getElementById('stat-dmg-taken').textContent = stats.avgDamageTaken.toLocaleString('es-ES');
    } else {
      document.getElementById('detail-kda-title').textContent = '0.00 KDA';
      document.getElementById('stat-gold').textContent = 'N/A';
      document.getElementById('stat-deaths').textContent = 'N/A';
      document.getElementById('stat-cs').textContent = 'N/A';
      document.getElementById('stat-kp').textContent = 'N/A';
      document.getElementById('stat-dmg').textContent = 'N/A';
      document.getElementById('stat-dmg-taken').textContent = 'N/A';
    }
  };

  loadStats(player.advancedStats);

  // Botón para actualizar partidas recientes
  const btnUpdateMatches = document.getElementById('btn-update-matches');
  btnUpdateMatches.onclick = async () => {
    try {
      btnUpdateMatches.innerText = 'BUSCANDO PARTIDAS...';
      btnUpdateMatches.disabled = true;
      
      const response = await fetch(`${API_BASE}/summoners/${player.puuid}/matches/update`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok) {
        showToast(data.message, data.updated ? 'success' : 'info');
        if (data.updated && data.stats) {
          loadStats(data.stats); // Actualizar interfaz sin cerrar modal
          // Opcional: Actualizar el jugador local en la tabla si quisiéramos, 
          // pero el modal ya se actualizó.
        }
      } else {
        showToast(`❌ ${data.message}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('❌ Error al actualizar partidas.', 'error');
    } finally {
      btnUpdateMatches.innerText = 'ACTUALIZAR PARTIDAS RECIENTES';
      btnUpdateMatches.disabled = false;
    }
  };

  // Bind close button
  modal.querySelector('.close-details').onclick = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
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
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('.submit-btn-gold');
    const originalText = submitBtn.innerText;
    
    const data = {
      region: document.getElementById('region').value,
      gameName: document.getElementById('gameName').value,
      tagLine: document.getElementById('tagLine').value
    };

    try {
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
  fetchLadder();
  initModal();
  initDeleteLogic();

  // Auto-refresh cada 5 minutos: solo re-renderiza si hay cambios en historial o LP
  setInterval(smartRefresh, 5 * 60 * 1000);
});

