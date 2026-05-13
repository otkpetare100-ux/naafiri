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

    const getMasteryCrest = (level) => {
      const lv = Math.min(Math.max(parseInt(level) || 1, 1), 10);
      const idx = lv - 1; // nivel 1→0, nivel 2→1, ..., nivel 10→9
      return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-collections/global/default/images/item-element/crest-and-banner-mastery-${idx}.png`;
    };

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



// Lógica del Modal para Añadir Jugador
function initModal() {
  const modal = document.getElementById('add-player-modal');
  const btn = document.getElementById('add-player-btn');
  const span = document.querySelector('.close-modal');
  const form = document.getElementById('add-player-form');

  if (!modal || !btn || !span || !form) return;

  btn.onclick = () => modal.classList.add('active');
  span.onclick = () => modal.classList.remove('active');
  
  // Cerrar al hacer clic fuera del modal
  window.onclick = (event) => {
    if (event.target === modal) modal.classList.remove('active');
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

