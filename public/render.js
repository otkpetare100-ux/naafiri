let DDRAGON_VERSION = '15.8.1';
const FALLBACK_ICON_URL = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png`;

// Actualizar versión automáticamente al cargar
fetch('https://ddragon.leagueoflegends.com/api/versions.json')
  .then(res => res.json())
  .then(versions => { 
    if (versions && versions.length > 0) DDRAGON_VERSION = versions[0]; 
  });

function getProfileIconUrl(id) {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${id}.png`;
}

const RANK_COLORS = {
  IRON: '#6B5A4E', BRONZE: '#CD7F32', SILVER: '#A8A9AD', GOLD: '#C89B3C',
  PLATINUM: '#00B4B0', EMERALD: '#00C65E', DIAMOND: '#578ACA',
  MASTER: '#9D4DC7', GRANDMASTER: '#CF4FC9', CHALLENGER: '#F4C874', UNRANKED: '#3D5068',
};

const RANK_ICONS = {
  IRON:        '/pic/ranks/iron.png',
  BRONZE:      '/pic/ranks/bronze.png',
  SILVER:      '/pic/ranks/silver.png',
  GOLD:        '/pic/ranks/gold.png',
  PLATINUM:    '/pic/ranks/platinum.png',
  EMERALD:     '/pic/ranks/emerald.png',
  DIAMOND:     '/pic/ranks/diamond.png',
  MASTER:      '/pic/ranks/master.png',
  GRANDMASTER: '/pic/ranks/grandmaster.png',
  CHALLENGER:  '/pic/ranks/challenger.png',
  UNRANKED:    '/pic/ranks/unranked.png',
};

const CHAMP_NAME_FIX = {
  // Entradas unificadas de ambas listas
  'AurelionSol': 'AurelionSol', 'Belveth': 'Belveth', 'BelVeth': 'Belveth',
  'Chogath': 'Chogath', 'ChoGath': 'Chogath',
  'DrMundo': 'DrMundo', 'JarvanIV': 'JarvanIV',
  'Kaisa': 'Kaisa', 'KaiSa': 'Kaisa',
  'Khazix': 'Khazix', 'KhaZix': 'Khazix',
  'KogMaw': 'KogMaw', 'KSante': 'KSante',
  'Leblanc': 'Leblanc', 'LeBlanc': 'Leblanc',
  'LeeSin': 'LeeSin', 'MasterYi': 'MasterYi',
  'MissFortune': 'MissFortune',
  'MonkeyKing': 'MonkeyKing', 'Wukong': 'MonkeyKing',
  'Nunu': 'Nunu', 'NunuWillump': 'Nunu', 'NunuyWillump': 'Nunu',
  'RekSai': 'RekSai', 'TahmKench': 'TahmKench', 'TwistedFate': 'TwistedFate',
  'Velkoz': 'Velkoz', 'VelKoz': 'Velkoz',
  'XinZhao': 'XinZhao',
  'Fiddlesticks': 'Fiddlesticks', 'FiddleSticks': 'Fiddlesticks', 'fiddlesticks': 'Fiddlesticks',
  'Renata': 'Renata', 'RenataGlasc': 'Renata',
  'Mel': 'Mel',
};

function getRankInfo(acc) {
  const soloQ = acc.soloQ;
  if (!soloQ) return { tier: 'UNRANKED', division: '', lp: 0, wins: 0, losses: 0 };
  return { tier: soloQ.tier, division: soloQ.rank, lp: soloQ.leaguePoints, wins: soloQ.wins, losses: soloQ.losses };
}

function computeWinrate(wins, losses) {
  const total = wins + losses;
  return total === 0 ? null : Math.round((wins / total) * 100);
}

function winrateClass(wr) {
  if (wr === null) return 'empty';
  if (wr >= 55) return 'good';
  if (wr > 50)  return 'good';
  if (wr === 50) return 'neutral';
  if (wr >= 48) return 'ok';
  return 'bad';
}

function wrColor(wr) {
  if (wr === null) return '#888';
  // Normalizar: 40% → 0 (rojo pleno), 60% → 1 (verde pleno)
  // Fuera de ese rango se clampea al extremo
  const t = Math.max(0, Math.min(1, (wr - 40) / 20));
  // Hue: 0=rojo, 120=verde
  const hue = Math.round(t * 120);
  // Saturación: máxima en extremos (t=0 ó t=1), cero en el centro (t=0.5 → blanco)
  const distFromMid = Math.abs(t - 0.5) * 2; // 0 en centro, 1 en extremos
  const sat = Math.round(distFromMid * 90);
  // Luminosidad: más clara en el centro para que el blanco se vea bien
  const lit = sat < 5 ? 92 : 52;
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

function getStreakInfo(streak) {
  if (streak >= 3) return { class: 'card-streak-win', glow: 'avatar-glow-fire' };
  if (streak <= -3) return { class: 'card-streak-loss', glow: 'avatar-glow-ice' };
  return { class: '', glow: '' };
}

function titleCase(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
}

function escapeHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// (mapeo unificado arriba — se eliminó la redeclaración)

function getChampImageName(name) {
  if (!name) return 'Unknown.png';
  var base = name.replace(/\.png$/i, '');
  var clean = base.replace(/[^a-zA-Z0-9]/g, '');
  return (CHAMP_NAME_FIX[clean] || CHAMP_NAME_FIX[base] || clean) + '.png';
}

// timeAgo unificada: acepta tanto un timestamp numérico como un objeto Date/string

function buildStreakHTML(streak) {
  if (!streak || streak === 0) return '';
  const isWin = streak > 0;
  const cls   = isWin ? 'streak-win' : 'streak-loss';
  const label = Math.abs(streak) + (isWin ? 'V seguidas' : 'D seguidas');
  return '<span class="streak-badge ' + cls + '">' + label + '</span>';
}

const QUEUE_TYPES = {
  420: 'Clasificatoria Solo',
  440: 'Clasificatoria Flexible',
  400: 'Normal (Recluta)',
  430: 'Normal (Oculta)',
  450: 'ARAM',
  1700: 'Arena',
  1900: 'U.R.F.',
  700: 'Clash'
};

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `Hace ${days} d${days > 1 ? 'ías' : 'ía'}`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) return `Hace ${hours} h`;
  const mins = Math.floor(diff / (1000 * 60));
  return `Hace ${mins} m`;
}

function buildTopChampsHTML(topChampions, puuid) {
  if (!topChampions || topChampions.length === 0) return '';
  return topChampions.map(function(c) {
    if (!c.name) return '';
    var img = 'https://ddragon.leagueoflegends.com/cdn/' + DDRAGON_VERSION + '/img/champion/' + getChampImageName(c.name);
    return '<div class="top-champ" title="Ver estadísticas de ' + escapeHTML(c.name) + '" onclick="openChampModal(\'' + puuid + '\', \'' + escapeHTML(c.name) + '\')">' +
      '<img src="' + img + '" alt="' + escapeHTML(c.name) + '" onerror="this.style.display=\'none\'" />' +
    '</div>';
  }).join('');
}

/* ---- Funcionalidad: Reacciones Visuales ---- */
function buildReactionsHTML(reactions, puuid) {
  const emojis = ['🔥', '💀', '👑', '🤡'];
  const userId = 'local-user'; // Simplificado
  if (!reactions) reactions = {};
  
  return '<div class="card-reactions">' +
    emojis.map(function(e) {
      const users = reactions[e] || [];
      const active = users.includes(userId);
      return '<button class="reaction-btn ' + (active ? 'reaction-btn--active' : '') + '" onclick="toggleReaction(\'' + puuid + '\', \'' + e + '\')">' +
        e + ' <span>' + users.length + '</span>' +
      '</button>';
    }).join('') +
  '</div>';
}

async function toggleReaction(puuid, emoji) {
  const globalAccs = window._accounts_ref || [];
  const acc = globalAccs.find(function(a) { return a.puuid === puuid; });
  if (!acc) return;

  // --- Lógica Optimista: Actualizar UI antes de que responda el servidor ---
  if (!acc.reactions) acc.reactions = {};
  if (!acc.reactions[emoji]) acc.reactions[emoji] = [];
  
  const idx = acc.reactions[emoji].indexOf('local-user');
  const wasReacted = idx > -1;
  
  // Guardamos estado previo por si falla el servidor (Rollback)
  if (wasReacted) acc.reactions[emoji].splice(idx, 1);
  else acc.reactions[emoji].push('local-user');

  // Actualizar DOM inmediatamente
  const updateUI = () => {
    const card = document.getElementById('card-' + puuid);
    if (card) {
      const container = card.querySelector('.card-reactions');
      if (container) container.outerHTML = buildReactionsHTML(acc.reactions, puuid);
    }
  };
  updateUI();

  try {
    const res = await fetch('/accounts/' + puuid + '/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: emoji, userId: 'local-user' })
    });
    
    if (!res.ok) throw new Error('Servidor no respondió');
  } catch(e) {
    // --- Rollback: Si falla la red, volvemos atrás ---
    const currentIdx = acc.reactions[emoji].indexOf('local-user');
    if (currentIdx > -1) acc.reactions[emoji].splice(currentIdx, 1);
    else acc.reactions[emoji].push('local-user');
    updateUI();
    
    if (typeof showError === 'function') showError('Error de conexión al reaccionar');
    console.error('Error in optimistic reaction:', e);
  }
}

function buildCardHTML(acc, position) {
  const r = getRankInfo(acc);
  const wr = computeWinrate(r.wins, r.losses);
  
  const streakClass = acc.streak >= 3 ? 'streak-win' : acc.streak <= -3 ? 'streak-loss' : '';
  const streakText = acc.streak >= 2 ? `🔥 ${acc.streak}` : acc.streak <= -2 ? `❄️ ${Math.abs(acc.streak)}` : '';
  
  const rankIcon = RANK_ICONS[r.tier] || RANK_ICONS.UNRANKED;
  const noDivisionTiers = ['MASTER', 'GRANDMASTER', 'CHALLENGER', 'UNRANKED'];
  const rankName = noDivisionTiers.includes(r.tier) 
    ? titleCase(r.tier) 
    : titleCase(r.tier) + ' ' + (r.division || '');

  const profileUrl = acc.discordId ? `/perfil/${acc.discordId}` : '#';
  
  const rankNum = position + 1;
  const rankClass = rankNum <= 3 ? `rank-${rankNum}` : '';



  return `
    <div class="scoreboard-row" id="card-${acc.puuid}" data-url="${profileUrl}">
      
      <div class="score-rank ${rankClass}">#${rankNum}</div>
      
      <div class="score-player">
        <div class="score-avatar-wrap">
          <img class="score-avatar" src="${getProfileIconUrl(acc.profileIconId)}" onerror="this.src='${FALLBACK_ICON_URL}'" />
          <div class="score-level">${acc.summonerLevel || '?'}</div>
        </div>
        <div class="score-names">
          <div class="score-name-row">
            <span class="score-name">${escapeHTML(acc.gameName)}</span>
            <div class="status-dot ${acc.liveGameStartedAt ? 'ingame' : 'offline'}" title="${acc.liveGameStartedAt ? 'En partida' : 'Offline'}"></div>
          </div>
          <span class="score-tag">#${escapeHTML(acc.tagLine)}</span>
        </div>
      </div>
      
      <div class="score-stats">
        <img class="score-tier-icon" src="${rankIcon}" alt="${r.tier}" />
        <div class="score-tier-text">
          <span class="score-tier-name">${rankName}</span>
          <span class="score-lp-text">${r.lp} LP · <span style="color:${wrColor(wr)};font-weight:700;">${wr !== null ? wr + '%' : '--'}</span> WR</span>
        </div>
      </div>
      
      <div class="score-actions">
        ${streakText ? `<span class="streak-badge ${acc.streak > 0 ? 'win' : 'loss'}">${streakText}</span>` : ''}
        <div class="score-btn-group" style="margin-left: 10px;">
          <button class="history-btn" data-puuid="${acc.puuid}">
            <span style="font-size:0.9rem;">📈</span> Historial
          </button>
          <button class="refresh-btn" data-puuid="${acc.puuid}" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:var(--gold-primary); cursor:pointer; padding:5px 8px; border-radius:6px; transition:var(--transition);" title="Actualizar">↻</button>
          <button class="remove-btn" data-puuid="${acc.puuid}" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:#d93f3f; cursor:pointer; padding:5px 8px; border-radius:6px; transition:var(--transition);" title="Eliminar">✕</button>
        </div>
      </div>
      
    </div>
  `;
}

function renderAccounts(accounts) {
  window._accounts_ref = accounts;
  const grid = document.getElementById('accounts-grid');
  if (!grid) return;
  
  if (accounts.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>Sin cuentas aún</p></div>';
    return;
  }
  
  grid.innerHTML = accounts.map((acc, idx) => buildCardHTML(acc, idx)).join('');

  // --- Animación Staggered ---
  const rows = grid.querySelectorAll('.scoreboard-row');
  rows.forEach((row, index) => {
    setTimeout(() => {
      row.classList.add('show');
    }, index * 50);
  });
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  clearTimeout(window._errorTimeout);
  if (msg) {
    window._errorTimeout = setTimeout(function() {
      el.style.display = 'none';
      el.textContent = '';
    }, 5000);
  }
}

function getApiErrorMessage(status) {
  switch (status) {
    case 400: return 'Solicitud inválida. Revisa el formato Nombre#TAG.';
    case 403: return 'API key inválida o expirada. Renuévala en developer.riotgames.com';
    case 404: return 'Cuenta no encontrada en LAN. Verifica el nombre y tag.';
    case 429: return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
    case 503: return 'El servidor de Riot está caído. Intenta más tarde.';
    default:  return 'Error inesperado (HTTP ' + status + '). Intenta de nuevo.';
  }
}

function showDeleteConfirm(accountName, onConfirm) {
  var overlay = document.createElement('div');
  overlay.id = 'delete-confirm-overlay';
  overlay.innerHTML =
    '<div class="delete-confirm-box">' +
      '<div class="delete-confirm-icon">✕</div>' +
      '<div class="delete-confirm-title">¿Eliminar cuenta?</div>' +
      '<div class="delete-confirm-msg">Vas a quitar a <strong>' + escapeHTML(accountName) + '</strong> de la lista.</div>' +
      '<div class="delete-confirm-actions">' +
        '<button class="delete-confirm-btn delete-confirm-btn--cancel" id="delete-cancel-btn">Mantener</button>' +
        '<button class="delete-confirm-btn delete-confirm-btn--remove" id="delete-ok-btn">Sí, quitar</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  requestAnimationFrame(function() { overlay.classList.add('delete-confirm-overlay--open'); });

  function close() {
    overlay.classList.remove('delete-confirm-overlay--open');
    setTimeout(function() { overlay.remove(); }, 220);
  }

  document.getElementById('delete-ok-btn').addEventListener('click', function() {
    close();
    onConfirm();
  });

  document.getElementById('delete-cancel-btn').addEventListener('click', close);

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
  });

  var escHandler = function(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}

// --- Lógica del Modal de Campeones ---
// --- Lógica del Modal de Jugador (Perfil Detallado) ---
window.openPlayerModal = function(puuid, event) {
  // Si el clic fue en un botón o en un icono de campeón, no abrimos este modal
  // Permitir que otros botones abran el modal si se desea (aunque ahora no hay botones que lo llamen directamente en la fila)
  if (event && (event.target.closest('.refresh-btn') || event.target.closest('.note-btn') || event.target.closest('.remove-btn') || event.target.closest('.top-champ') || event.target.closest('.top-champ-icon'))) {
    return;
  }

  const acc = window._accounts_ref?.find(a => a.puuid === puuid);
  if (!acc) return;

  // Evitar duplicados
  if (document.getElementById('player-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'player-modal';
  modal.className = 'player-modal';
  modal.innerHTML = buildPlayerModalHTML(acc);
  
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => modal.classList.add('player-modal--open'));

  // Cargar historial de rangos asincrónicamente
  loadRankHistoryUI(puuid);

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closePlayerModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
};

window.closePlayerModal = function() {
  const modal = document.getElementById('player-modal');
  if (modal) {
    modal.classList.remove('player-modal--open');
    document.body.classList.remove('modal-open');
    setTimeout(() => modal.remove(), 300);
  }
};

function buildPlayerModalHTML(acc) {
  const r = getRankInfo(acc);
  const noDivisionTiers = ['MASTER', 'GRANDMASTER', 'CHALLENGER', 'UNRANKED'];
  const rankStr = noDivisionTiers.includes(r.tier) 
    ? r.tier 
    : `${r.tier} ${r.division || ''}`;
  const color = RANK_COLORS[r.tier] || '#fff';
  
  return `
    <div class="modal-content">
      <div class="modal-header">
        <img src="${getProfileIconUrl(acc.profileIconId)}" onerror="this.src='${FALLBACK_ICON_URL}'" />
        <div class="names-wrap" style="flex: 1;">
          <h2>${escapeHTML(acc.gameName)} <span style="font-size:1rem; opacity:0.7;">#${escapeHTML(acc.tagLine)}</span></h2>
          <p style="color:${color}; margin:0; font-weight:700;">${rankStr} - ${r.lp} LP</p>
        </div>
        <button class="modal-close" onclick="closePlayerModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="rank-history-section">
          <div style="color:var(--gold-primary); margin-bottom:10px; text-transform:uppercase; font-size:0.8rem; letter-spacing:1px; font-weight:800;">Progresión de LP</div>
          <div class="lp-chart-wrapper" style="height: 180px; background: rgba(0,0,0,0.3); border-radius:12px; padding:10px;">
            <canvas id="lpChart-${acc.puuid}" class="lp-chart-canvas"></canvas>
          </div>
        </div>
        
        <div class="rank-history-section" style="width: 100%; margin-top: 20px;">
          <div style="color:var(--gold-primary); margin-bottom:10px; text-transform:uppercase; font-size:0.8rem; letter-spacing:1px; font-weight:800;">Historial de Divisiones</div>
          <div id="rank-history-${acc.puuid}" class="rank-history-container" style="background: rgba(0,0,0,0.3); border-radius:12px; padding:15px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 30px;">
            <div class="empty-stats">Cargando historial...</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadRankHistoryUI(puuid) {
  const container = document.getElementById(`rank-history-${puuid}`);
  if (!container) return;

  if (typeof getRankHistory !== 'function') {
    container.innerHTML = '<div class="empty-stats">Historial no disponible</div>';
    return;
  }

  const history = await getRankHistory(puuid);
  
  if (!history || history.length === 0) {
    container.innerHTML = '<div class="empty-stats">No hay cambios de rango registrados</div>';
    return;
  }

  container.innerHTML = '<div class="rank-timeline">' + history.map(h => {
    const date = new Date(h.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
    const noDivTiers = ['MASTER','GRANDMASTER','CHALLENGER', 'UNRANKED'];
    const rankStr = noDivTiers.includes(h.rank.tier) ? h.rank.tier : `${h.rank.tier} ${h.rank.division}`;
    return `
      <div class="rank-timeline-item">
        <div class="rank-timeline-dot"></div>
        <div class="rank-timeline-content">
          <span class="rank-timeline-date">${date}</span>
          <span class="rank-timeline-rank">${rankStr} <span class="rank-timeline-lp">${h.rank.lp} LP</span></span>
        </div>
      </div>
    `;
  }).join('') + '</div>';

  // --- Funcionalidad 3: Gráfica de LP ---
  const canvas = document.getElementById(`lpChart-${puuid}`);
  if (canvas && history.length > 1 && window.Chart) {
    // No necesitamos style.display = 'block' porque el wrapper tiene altura fija
    const chartData = [...history].reverse(); // De más antiguo a más nuevo
    
    // Calcular LP continuos (sumando 100 por cada tier/división para ver subidas reales)
    // Para simplificar, solo mostramos los LP como valor, o un puntaje. Mostrar LP es más limpio.
    const labels = chartData.map(h => {
      const d = new Date(h.date);
      return d.getDate() + '/' + (d.getMonth()+1);
    });
    
    const lpData = chartData.map(h => h.rank.lp);
    
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'League Points',
          data: lpData,
          borderColor: '#d77aa8',
          backgroundColor: 'rgba(215, 122, 168, 0.15)',
          borderWidth: 2,
          pointBackgroundColor: '#9d6cff',
          pointBorderColor: '#070810',
          pointRadius: 4,
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(23, 28, 48, 0.95)',
            titleColor: '#f2f4ff',
            bodyColor: '#d9b85f',
            borderColor: 'rgba(214, 125, 170, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                const h = chartData[context.dataIndex];
                const noDivTiers = ['MASTER','GRANDMASTER','CHALLENGER', 'UNRANKED'];
                const rankStr = noDivTiers.includes(h.rank.tier) ? h.rank.tier : `${h.rank.tier} ${h.rank.division}`;
                return `${rankStr} - ${h.rank.lp} LP`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#657099', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#657099', font: { size: 10 } } }
        }
      }
    });
  } else if (canvas && history.length <= 1) {
    canvas.insertAdjacentHTML('afterend', '<div class="empty-stats" style="color:#aaa; margin-top:5px;">Datos insuficientes para la gráfica</div>');
  }
}


window.openTournamentModal = async function() {
  const modal = document.createElement('div');
  modal.id = 'tournament-modal';
  modal.className = 'tournament-modal';
  const tournaments = await fetch('/tournaments').then(r => r.json());
  
  modal.innerHTML = `
    <div class="tournament-box">
      <div class="tournament-header">
        <div class="tournament-title-group">
          <span class="t-emoji">🏆</span>
          <h2>Gestión de Torneos</h2>
        </div>
        <button class="modal-close" onclick="closeTournamentModal()">✕</button>
      </div>
      <div class="tournament-body">
        <div class="t-actions">
           <button class="btn-primary" onclick="showCreateTournament()">Crear Nuevo Torneo</button>
        </div>
        <div class="tournament-list">
          ${tournaments.length === 0 ? '<div class="empty-stats">No hay torneos creados aún</div>' : tournaments.map(t => `
            <div class="tournament-item" onclick="viewTournament('${t._id}')">
              <span class="t-name">${escapeHTML(t.name)}</span>
              <span class="t-status status-${t.status}">${t.status.toUpperCase()}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
};

window.closeTournamentModal = () => {
  const m = document.getElementById('tournament-modal');
  if (m) m.remove();
  document.body.classList.remove('modal-open');
};

window.showCreateTournament = function() {
  const body = document.querySelector('.tournament-body');
  const accounts = window._accounts_ref || [];
  body.innerHTML = `
    <div class="create-tournament">
      <div class="t-input-group">
        <label>Nombre del Torneo</label>
        <input type="text" id="t-name" placeholder="Ej: Torneo de Verano" />
      </div>
      <div class="participant-selector">
        <p>Seleccionar participantes (mínimo 2):</p>
        <div class="p-list">
          ${accounts.map(a => `
            <label class="p-item"><input type="checkbox" value="${a.puuid}" class="t-participant"> ${a.gameName}</label>
          `).join('')}
        </div>
      </div>
      <div class="t-actions">
        <button class="btn-cancel" onclick="openTournamentModal()">Cancelar</button>
        <button class="btn-save" onclick="saveTournament()">Generar Bracket</button>
      </div>
    </div>
  `;
};

window.showCustomAlert = function(title, message) {
  return new Promise(resolve => {
    const dialog = document.getElementById('customDialog');
    document.getElementById('cd-title').textContent = title;
    document.getElementById('cd-message').textContent = message;
    document.getElementById('cd-input').style.display = 'none';
    
    const cancelBtn = document.getElementById('cd-cancel');
    const confirmBtn = document.getElementById('cd-confirm');
    
    cancelBtn.style.display = 'none'; // Alert solo tiene Aceptar
    
    const cleanup = () => {
      dialog.style.display = 'none';
      confirmBtn.onclick = null;
    };
    
    confirmBtn.onclick = () => { cleanup(); resolve(true); };
    dialog.style.display = 'flex';
  });
};

window.saveTournament = async function() {
  const name = document.getElementById('t-name').value;
  const selected = Array.from(document.querySelectorAll('.t-participant:checked')).map(i => i.value);
  if (!name || selected.length < 2) return showCustomAlert('Datos insuficientes', 'Debes ingresar un nombre y seleccionar al menos 2 participantes.');
  
  await fetch('/tournaments', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ name, participants: selected, status: 'pendiente', date: new Date().toISOString() })
  });
  openTournamentModal();
};

window.viewTournament = async function(id) {
  showCustomAlert('Torneo', 'Visualización de bracket para el ID: ' + id + ' (En desarrollo)');
};

/* ---- Funcionalidad: Feed de Actividad ---- */
async function renderActivityFeed() {
  const container = document.getElementById('activity-feed');
  if (!container) return;
  
  try {
    const res = await fetch('/activities');
    const logs = await res.json();
    
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div class="empty-state-mini">Sin actividad reciente.</div>';
      return;
    }

    // --- Apertura automática si hay nuevas actividades ---
    const lastCount = parseInt(sessionStorage.getItem('last_activity_count') || '0');
    if (logs.length > lastCount && lastCount > 0) {
      openActivitySidebar(true); // Abrir con timer
    }
    sessionStorage.setItem('last_activity_count', logs.length);

    const TYPE_ICON = {
      level_up:      '📈',
      lose_streak:   '📉',
      live:          '🔴',
      goal:          '🎯',
      challenge_win: '🏆',
      bet_win:       '💰',
      bet_loss:      '💸',
    };

    container.innerHTML = logs.map(function(log) {
      const icon = TYPE_ICON[log.type] || '📋';
      return '<div class="activity-item activity-item--' + log.type + '">' +
        '<div class="activity-msg"><span style="margin-right:6px;">' + icon + '</span>' + log.message + '</div>' +
        '<div class="activity-time">' + formatRelativeTime(log.timestamp) + '</div>' +
      '</div>';
    }).join('');
  } catch(e) {}
}

let activityCloseTimer = null;
let isActivityPinned = false;

function openActivitySidebar(withTimer = false) {
  const sidebar = document.getElementById('activity-sidebar');
  const toggle = document.getElementById('activity-toggle');
  if (!sidebar) return;

  sidebar.classList.remove('collapsed');
  if (toggle) toggle.textContent = '»'; // » = cerrar (empujar hacia la derecha)

  if (withTimer && !isActivityPinned) {
    if (activityCloseTimer) clearTimeout(activityCloseTimer);
    activityCloseTimer = setTimeout(() => {
      if (!isActivityPinned) closeActivitySidebar();
    }, 5000);
  }
}

function closeActivitySidebar() {
  const sidebar = document.getElementById('activity-sidebar');
  const toggle = document.getElementById('activity-toggle');
  if (!sidebar) return;

  sidebar.classList.add('collapsed');
  if (toggle) toggle.textContent = '«'; // « = abrir (jalar hacia la izquierda)
}

function toggleActivityPin(e) {
  if (e) e.stopPropagation();
  const btn = document.getElementById('activity-pin');
  isActivityPinned = !isActivityPinned;
  
  if (btn) {
    btn.classList.toggle('activity-pin--active', isActivityPinned);
    btn.style.opacity = isActivityPinned ? '1' : '0.5';
    btn.style.color   = isActivityPinned ? 'var(--gold-primary)' : '';
    btn.title = isActivityPinned ? 'Panel fijado (clic para desfijar)' : 'Fijar panel';
  }
  
  if (isActivityPinned) {
    if (activityCloseTimer) clearTimeout(activityCloseTimer);
  } else {
    // Si deseleccionamos el pin y está abierto, programar cierre en 5s
    const sidebar = document.getElementById('activity-sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      if (activityCloseTimer) clearTimeout(activityCloseTimer);
      activityCloseTimer = setTimeout(() => {
        if (!isActivityPinned) closeActivitySidebar();
      }, 5000);
    }
  }
}

function formatRelativeTime(timestamp) {
  const diff = new Date() - new Date(timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return 'Hace ' + mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return 'Hace ' + hrs + 'h';
  return new Date(timestamp).toLocaleDateString();
}

// Inicializar al cargar (IIFE — scripts están al final del body, DOM ya existe)
(function initActivitySidebar() {
  renderActivityFeed();
  setInterval(renderActivityFeed, 30000);
  
  const sidebar   = document.getElementById('activity-sidebar');
  const toggleBtn = document.getElementById('activity-toggle');
  const pinBtn    = document.getElementById('activity-pin');

  if (sidebar && toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('collapsed')) {
        openActivitySidebar(true);
      } else {
        closeActivitySidebar();
      }
    });
  }

  if (pinBtn) {
    pinBtn.addEventListener('click', toggleActivityPin);
  }
})();

/* --- Hall of Fame Rendering --- */
window.openHof = async function() {
  const modal = document.getElementById('hof-modal');
  const body  = document.getElementById('hof-body');
  if (!modal || !body) return;

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
  body.innerHTML = '<div class="empty-state-mini">Invocando historia...</div>';

  try {
    const res = await fetch('/splits');
    const splits = await res.json();
    renderHallOfFame(splits);
  } catch(e) {
    body.innerHTML = '<div class="error-msg">Error al cargar la historia</div>';
  }
};

window.closeHof = function() {
  const modal = document.getElementById('hof-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
};

function renderHallOfFame(splits) {
  const body = document.getElementById('hof-body');
  if (!body) return;

  if (!splits || splits.length === 0) {
    body.innerHTML = '<div class="empty-state-mini">Aún no hay splits archivados. ¡Haz historia hoy!</div>';
    return;
  }

  body.innerHTML = splits.map(split => {
    // Tomar top 3 para el podio, resto para la tabla
    const top3 = split.rankings.slice(0, 3);
    const others = split.rankings.slice(3);

    const podiumHTML = top3.map((player, idx) => {
      const place = idx + 1;
      const rankIcon = RANK_ICONS[player.tier] || RANK_ICONS.UNRANKED;
      return `
        <div class="podium-place place-${place}">
          <img class="podium-rank-img" src="${rankIcon}" alt="${player.tier}" />
          <div class="podium-name">${escapeHTML(player.gameName)}</div>
          <div class="podium-tier">${player.tier} ${player.rank}</div>
        </div>
      `;
    }).join('');

    const tableHTML = others.length > 0 ? `
      <table class="hof-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Jugador</th>
            <th>Rango Final</th>
            <th>LP</th>
          </tr>
        </thead>
        <tbody>
          ${others.map((p, i) => `
            <tr>
              <td>${i + 4}</td>
              <td>
                <img class="hof-mini-icon" src="${getProfileIconUrl(p.profileIconId)}" />
                ${escapeHTML(p.gameName)}#${escapeHTML(p.tagLine)}
              </td>
              <td>${p.tier} ${p.rank}</td>
              <td>${p.lp} LP</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    return `
      <div class="split-record">
        <div class="split-header">
          <h3>${escapeHTML(split.name)}</h3>
          <small>${new Date(split.date).toLocaleDateString()}</small>
        </div>
        <div class="podium-container">
          ${podiumHTML}
        </div>
        ${tableHTML}
      </div>
    `;
  }).join('');
}

/* --- Lógica del Modal de Detalles de Partida --- */
window.openMatchModal = async function(matchId) {
  const modal = document.getElementById('matchModal');
  const body = document.getElementById('modalBody');
  if (!modal || !body) return;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<div class="loading-modal"><div class="spinner"></div><p>Obteniendo scoreboard desde Riot Games...</p></div>';

  try {
    const res = await fetch('/api/match/' + matchId);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderScoreboard(data);
  } catch(e) {
    body.innerHTML = '<div style="text-align:center; padding:40px; color:#ff4b4b;"><h3>Error al cargar partida</h3><p>' + e.message + '</p></div>';
  }
};

window.closeMatchModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('matchModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    const body = document.getElementById('modalBody');
    if (body) body.innerHTML = ''; 
  }
};

function renderScoreboard(data) {
  const body = document.getElementById('modalBody');
  const duration = Math.floor(data.gameDuration / 60) + 'm ' + (data.gameDuration % 60) + 's';
  
  let html = '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px;">';
  html += '<div><h2 style="margin:0;">Detalles de la Partida</h2><div style="color:#657099; font-size:0.8rem;">' + (data.gameMode || 'Normal') + ' • ' + duration + '</div></div>';
  html += '</div>';

  html += '<div class="modal-tabs">';
  html += '<div class="modal-tab active" onclick="switchTab(event, \'tab-scoreboard\')">SCOREBOARD</div>';
  html += '<div class="modal-tab" onclick="switchTab(event, \'tab-stats\')">DAÑO Y ORO</div>';
  html += '</div>';

  html += renderScoreboardContent(data);
  body.innerHTML = html;
}

window.switchTab = function(e, tabId) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  e.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');
};

function renderScoreboardContent(data) {
  const blueTeam = data.participants.filter(p => p.teamId === 100);
  const redTeam = data.participants.filter(p => p.teamId === 200);
  const maxDmg = Math.max(...data.participants.map(p => p.totalDamageDealtToChampions));
  
  let html = '<div id="tab-scoreboard" class="tab-content active">';
  html += renderTeamTable('Equipo Azul', blueTeam, 'blue-team', data.teams[100], maxDmg, data.gameDuration);
  html += '<div style="height:15px;"></div>';
  html += renderTeamTable('Equipo Rojo', redTeam, 'red-team', data.teams[200], maxDmg, data.gameDuration);
  html += '</div>';
  html += '<div id="tab-stats" class="tab-content">' + renderStatsContent(data) + '</div>';

  return html;
}

/* --- Diálogos Personalizados Premium --- */
window.showCustomConfirm = function(title, message) {
  return new Promise(resolve => {
    const dialog = document.getElementById('customDialog');
    document.getElementById('cd-title').textContent = title;
    document.getElementById('cd-message').textContent = message;
    
    const input = document.getElementById('cd-input');
    input.style.display = 'none';
    input.value = '';
    
    const cancelBtn = document.getElementById('cd-cancel');
    const confirmBtn = document.getElementById('cd-confirm');
    
    cancelBtn.style.display = 'block';
    
    const cleanup = () => {
      dialog.style.display = 'none';
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
    };
    
    cancelBtn.onclick = () => { cleanup(); resolve(false); };
    confirmBtn.onclick = () => { cleanup(); resolve(true); };
    
    dialog.style.display = 'flex';
  });
};

window.showCustomPrompt = function(title, message, defaultValue = '') {
  return new Promise(resolve => {
    const dialog = document.getElementById('customDialog');
    document.getElementById('cd-title').textContent = title;
    document.getElementById('cd-message').textContent = message;
    
    const input = document.getElementById('cd-input');
    input.style.display = 'block';
    input.value = defaultValue;
    
    const cancelBtn = document.getElementById('cd-cancel');
    const confirmBtn = document.getElementById('cd-confirm');
    
    cancelBtn.style.display = 'block';
    
    const cleanup = () => {
      dialog.style.display = 'none';
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      input.onkeydown = null;
    };
    
    cancelBtn.onclick = () => { cleanup(); resolve(null); };
    confirmBtn.onclick = () => { cleanup(); resolve(input.value); };
    input.onkeydown = (e) => { if(e.key === 'Enter') confirmBtn.click(); };
    
    dialog.style.display = 'flex';
    setTimeout(() => input.focus(), 100);
  });
};

function renderStatsContent(data) {
  let html = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:20px;">';
  if (data.timeline) {
    html += '<div><h3 style="font-size:0.9rem; margin-bottom:10px; color:#f2f4ff; text-align:center;">Ventaja de Oro</h3><div style="height:280px; background:rgba(0,0,0,0.2); border-radius:12px; padding:10px;"><canvas id="goldChart"></canvas></div></div>';
  }
  html += '<div><h3 style="font-size:0.9rem; margin-bottom:10px; color:#f2f4ff; text-align:center;">Daño Infligido</h3><div style="height:280px; background:rgba(0,0,0,0.2); border-radius:12px; padding:10px 15px; position:relative; overflow:hidden;"><canvas id="dmgChart"></canvas></div></div>';
  html += '</div>';
  setTimeout(() => initCharts(data), 100);
  return html;
}

function initCharts(data) {
  if (data.timeline && document.getElementById('goldChart')) {
    const ctx = document.getElementById('goldChart').getContext('2d');
    const labels = data.timeline.map((_, i) => i + 'm');
    const goldData = data.timeline.map(f => f.goldDiff);

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Ventaja (Azul vs Rojo)',
          data: goldData,
          borderColor: (context) => {
            const chart = context.chart;
            const {ctx, chartArea, scales} = chart;
            if (!chartArea || !scales.y) return '#00b4ff';
            const zeroY = scales.y.getPixelForValue(0);
            const diff = chartArea.bottom - chartArea.top;
            let zeroPos = diff > 0 ? (zeroY - chartArea.top) / diff : 0.5;
            if (!isFinite(zeroPos)) zeroPos = 0.5;
            zeroPos = Math.min(Math.max(zeroPos, 0), 1);

            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, '#00b4ff');
            gradient.addColorStop(zeroPos, '#00b4ff');
            gradient.addColorStop(zeroPos, '#ff4b4b');
            gradient.addColorStop(1, '#ff4b4b');
            return gradient;
          },
          backgroundColor: (context) => {
            const chart = context.chart;
            const {ctx, chartArea, scales} = chart;
            if (!chartArea || !scales.y) return 'transparent';
            const zeroY = scales.y.getPixelForValue(0);
            const diff = chartArea.bottom - chartArea.top;
            let zeroPos = diff > 0 ? (zeroY - chartArea.top) / diff : 0.5;
            if (!isFinite(zeroPos)) zeroPos = 0.5;
            zeroPos = Math.min(Math.max(zeroPos, 0), 1);

            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(0, 180, 255, 0.4)');
            gradient.addColorStop(zeroPos, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(zeroPos, 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, 'rgba(255, 75, 75, 0.4)');
            return gradient;
          },
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#657099' } },
          x: { grid: { display: false }, ticks: { color: '#657099', font: { size: 9 } } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  if (document.getElementById('dmgChart')) {
    const ctx = document.getElementById('dmgChart').getContext('2d');
    const sorted = [...data.participants].sort((a,b) => a.teamId - b.teamId);
    const labels = sorted.map(p => p.championName);
    const dmgData = sorted.map(p => p.totalDamageDealtToChampions);
    const colors = sorted.map(p => p.teamId === 100 ? 'rgba(0, 180, 255, 0.7)' : 'rgba(255, 75, 75, 0.7)');
    const borders = sorted.map(p => p.teamId === 100 ? '#00b4ff' : '#ff4b4b');

    const images = sorted.map(p => {
      const img = new Image();
      img.src = 'https://ddragon.leagueoflegends.com/cdn/' + DDRAGON_VERSION + '/img/champion/' + getChampImageName(p.championName);
      return img;
    });

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: dmgData,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 2,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { bottom: 25 } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#657099', font: { size: 9 } } },
          x: { display: false }
        },
        plugins: { legend: { display: false } }
      },
      plugins: [{
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          const xAxis = chart.scales.x;
          if (!xAxis || !meta.data.length) return;
          const bottom = xAxis.bottom;
          
          images.forEach((img, i) => {
            if (img.complete && img.naturalWidth > 0 && meta.data[i]) {
              const x = meta.data[i].x;
              const size = 18;
              ctx.drawImage(img, x - size/2, bottom + 5, size, size);
              ctx.strokeStyle = 'rgba(255,255,255,0.15)';
              ctx.lineWidth = 1;
              ctx.strokeRect(x - size/2, bottom + 5, size, size);
            } else {
              img.onload = () => chart.draw();
            }
          });
        }
      }]
    });
  }
}

const SPELL_MAP = {
  1: 'SummonerBoost', 3: 'SummonerExhaust', 4: 'SummonerFlash', 6: 'SummonerHaste',
  7: 'SummonerHeal', 11: 'SummonerSmite', 12: 'SummonerTeleport', 13: 'SummonerMana',
  14: 'SummonerDot', 21: 'SummonerBarrier', 32: 'SummonerSnowball'
};

function renderTeamTable(title, players, teamClass, teamData, maxDmg, gameDuration) {
  const result = players[0].win ? 'VICTORIA' : 'DERROTA';
  const kills = players.reduce((sum, p) => sum + p.kills, 0);
  const deaths = players.reduce((sum, p) => sum + p.deaths, 0);
  const assists = players.reduce((sum, p) => sum + p.assists, 0);
  const gold = (players.reduce((sum, p) => sum + p.goldEarned, 0) / 1000).toFixed(1);

  let html = '<div class="team-header ' + teamClass + '">';
  html += '<span class="team-title">' + title + ' (' + result + ')</span>';
  html += '<div class="team-summary-stats">';
  html += '<span>' + kills + ' / ' + deaths + ' / ' + assists + '</span>';
  html += '<span class="team-summary-gold">💰 ' + gold + 'k</span>';
  if (teamData && teamData.objectives) {
    html += '<span>🗼 ' + (teamData.objectives.tower?.kills || 0) + '</span>';
    html += '<span>🐉 ' + (teamData.objectives.dragon?.kills || 0) + '</span>';
  }
  html += '</div></div>';

  html += '<div class="table-container"><table class="scoreboard-table">';
  html += '<thead><tr><th>Jugador</th><th>KDA</th><th>Daño</th><th>Visión</th><th>CS</th><th>Oro</th><th>Objetos</th></tr></thead>';
  html += '<tbody>';

  players.forEach(p => {
    const kdaRatio = p.deaths === 0 ? (p.kills + p.assists) : ((p.kills + p.assists) / p.deaths).toFixed(2);
    const dmgPct = (p.totalDamageDealtToChampions / maxDmg) * 100;
    const durationMin = gameDuration / 60 || 1;
    const csPerMin = (p.totalMinionsKilled / durationMin).toFixed(1);
    
    html += '<tr>';
    html += '<td><div class="player-cell">';
    html += '<div class="champ-icon-wrapper">';
    html += '<img src="https://ddragon.leagueoflegends.com/cdn/' + DDRAGON_VERSION + '/img/champion/' + getChampImageName(p.championName) + '" class="player-champ-icon">';
    html += '</div>';
    
    html += '<div class="spells-runes">';
    html += '<img src="https://ddragon.leagueoflegends.com/cdn/' + DDRAGON_VERSION + '/img/spell/' + (SPELL_MAP[p.summoner1Id] || 'SummonerFlash') + '.png" class="spell-icon">';
    html += '<img src="https://ddragon.leagueoflegends.com/cdn/' + DDRAGON_VERSION + '/img/spell/' + (SPELL_MAP[p.summoner2Id] || 'SummonerDot') + '.png" class="spell-icon">';
    html += '</div>';

    html += '<div class="player-info-meta"><span class="player-name-link">' + p.gameName + '</span><span class="player-level-text">Nivel ' + p.champLevel + '</span></div>';
    html += '</div></td>';
    
    html += '<td><div class="kda-block"><span class="score-kda">' + p.kills + ' / ' + p.deaths + ' / ' + p.assists + '</span><span class="score-sub">' + kdaRatio + ' KDA</span></div></td>';
    
    html += '<td>';
    html += '<div class="dmg-bar-container"><div class="dmg-bar-fill" style="width:' + dmgPct + '%"></div><div class="dmg-bar-text">' + p.totalDamageDealtToChampions.toLocaleString() + '</div></div>';
    html += '</td>';

    html += '<td><span class="score-kda">' + p.visionScore + '</span></td>';
    html += '<td><div class="cs-block"><span class="score-kda">' + p.totalMinionsKilled + '</span><span class="score-sub">' + csPerMin + '/m</span></div></td>';
    html += '<td><span class="score-kda">' + (p.goldEarned/1000).toFixed(1) + 'k</span></td>';
    
    html += '<td><div class="item-list">';

    const itm = p.items || [0,0,0,0,0,0,0,0];
    const reordered = [
      itm[0], itm[1], itm[2], itm[6],
      itm[3], itm[4], itm[5], 0
    ];

    reordered.forEach(id => {
      if (id > 0) {
        html += '<img src="https://ddragon.leagueoflegends.com/cdn/' + DDRAGON_VERSION + '/img/item/' + id + '.png" class="item-icon">';
      } else {
        html += '<div class="empty-item"></div>';
      }
    });
    html += '</div></td>';
    
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

// --- Lógica del Modal de Historial (Solo Partidas) ---
window.openHistoryModal = function(puuid) {
  const acc = window._accounts_ref?.find(a => a.puuid === puuid);
  if (!acc) return;

  // Evitar duplicados
  if (document.getElementById('history-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'history-modal';
  modal.className = 'player-modal'; // Reutilizamos clase para consistencia
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 900px;">
      <div class="modal-header">
        <img src="${getProfileIconUrl(acc.profileIconId)}" onerror="this.src='${FALLBACK_ICON_URL}'" style="width: 50px; height: 50px;" />
        <div class="names-wrap" style="flex: 1;">
          <h2 style="font-size: 1.2rem;">Historial de ${escapeHTML(acc.gameName)}</h2>
          <p style="margin:0; font-size:0.8rem; opacity:0.7;">Últimas partidas registradas</p>
        </div>
        <button class="modal-close" onclick="closeHistoryModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="history-section-modal">
          ${buildMatchHistoryHTML(acc.matches, acc.puuid)}
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => modal.classList.add('player-modal--open'));

  // Cerrar con Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeHistoryModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
};

window.closeHistoryModal = function() {
  const modal = document.getElementById('history-modal');
  if (modal) {
    modal.classList.remove('player-modal--open');
    document.body.classList.remove('modal-open');
    setTimeout(() => modal.remove(), 300);
  }
};