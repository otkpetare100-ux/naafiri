const API_BASE = '/api';

// Estado Global
let globalPlayers = [];
let currentSort = 'elo';
let currentModalPuuid = null;
let currentModalName = null;
let currentModalTag = null;

// ==========================================
// UTILIDADES UI
// ==========================================
function showToast(message, isError = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function startLoading() {
  document.getElementById('top-loading-bar').style.width = '100%';
  document.getElementById('top-loading-bar').style.opacity = '1';
}

function stopLoading() {
  setTimeout(() => {
    document.getElementById('top-loading-bar').style.opacity = '0';
    setTimeout(() => document.getElementById('top-loading-bar').style.width = '0', 300);
  }, 500);
}

// ==========================================
// RENDERIZADO DEL LEADERBOARD
// ==========================================
async function fetchValorantLeaderboard() {
  startLoading();
  const loadingEl = document.getElementById('val-loading');
  const ladderContainer = document.getElementById('ladder-container');
  
  loadingEl.style.display = 'block';
  ladderContainer.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/valorant/leaderboard`);
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Error al obtener datos');
    
    globalPlayers = data.leaderboard || [];
    renderLeaderboard();
    
    loadingEl.style.display = 'none';
    ladderContainer.style.display = 'grid'; // .ladder-list usa CSS grid
  } catch (err) {
    loadingEl.textContent = `Error: ${err.message}. Verifica la HENRIK_API_KEY.`;
    showToast('Error cargando Leaderboard', true);
  } finally {
    stopLoading();
  }
}

function getRankColor(rank) {
  if (!rank) return '#a8b0b8';
  const r = rank.toLowerCase();
  if (r.includes('radiant')) return '#ffcf70';
  if (r.includes('immortal')) return '#b32c4d';
  if (r.includes('ascendant')) return '#5bb482';
  if (r.includes('diamond')) return '#b489d4';
  if (r.includes('platinum')) return '#3e8f99';
  if (r.includes('gold')) return '#dbb94f';
  if (r.includes('silver')) return '#a8b0b8';
  return '#888';
}

function renderLeaderboard() {
  const container = document.getElementById('ladder-container');
  container.innerHTML = '';

  if (globalPlayers.length === 0) {
    container.innerHTML = '<div style="text-align: center; width: 100%; grid-column: 1/-1; padding: 2rem;">No hay jugadores de Valorant registrados.</div>';
    return;
  }

  // Ordenar
  let sorted = [...globalPlayers];
  if (currentSort === 'elo') sorted.sort((a, b) => b.elo - a.elo);
  // (Otras opciones de sort se pueden añadir después si traemos matches en el leaderboard)

  sorted.forEach((p, idx) => {
    const rankColor = getRankColor(p.rank);
    const card = document.createElement('div');
    card.className = 'player-card';
    card.onclick = () => openPlayerDetails(p);

    card.innerHTML = `
      <div class="card-rank-badge">#${idx + 1}</div>
      <div class="card-avatar-wrapper">
        <img src="${p.iconUrl || '/assets/placeholder_champ.png'}" class="card-avatar" alt="Avatar">
      </div>
      
      <div class="card-info">
        <div class="player-name">${p.name}</div>
        <div class="tier-label" style="color: ${rankColor}">${p.rank || 'Unranked'}</div>
      </div>
      
      <div class="card-stats">
        <div class="stat-block">
          <span class="stat-value" style="color: var(--gold-primary);">${p.rr !== null ? p.rr : '-'}</span>
          <span class="stat-label">RR</span>
        </div>
      </div>
      
      <div class="card-emblem-wrapper">
        <img src="${p.rankIconUrl || ''}" class="card-emblem" style="opacity: 0.6;" alt="">
      </div>
    `;
    container.appendChild(card);
  });
}

// ==========================================
// MODAL DE PERFIL Y PARTIDAS
// ==========================================
async function openPlayerDetails(player) {
  const modal = document.getElementById('player-details-modal');
  const loader = document.getElementById('details-modal-loader');
  
  // Guardar refs para refresco manual
  currentModalPuuid = player.puuid;
  const [gName, tLine] = player.name.split('#');
  currentModalName = gName;
  currentModalTag = tLine;
  
  // Set UI básica
  document.getElementById('detail-profile-icon').src = player.iconUrl;
  document.getElementById('detail-player-id').textContent = player.name;
  
  document.getElementById('detail-tier-rank').textContent = player.rank || 'Unranked';
  document.getElementById('detail-lp').textContent = `${player.rr !== null ? player.rr : 0} RR`;
  if(player.rankIconUrl) document.getElementById('detail-rank-emblem').src = player.rankIconUrl;
  
  const historyContainer = document.getElementById('detail-match-history');
  historyContainer.innerHTML = '';
  
  // Reset stats
  document.getElementById('stat-kda-avg').textContent = '--';
  document.getElementById('stat-hs').textContent = '--';
  document.getElementById('stat-acs').textContent = '--';
  document.getElementById('stat-adr').textContent = '--';
  document.getElementById('detail-wins').textContent = '0 V';
  document.getElementById('detail-losses').textContent = '0 D';
  document.getElementById('detail-win-bar').style.width = '0%';
  document.getElementById('detail-top-champs').innerHTML = '';
  
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('show'), 10);
  loader.classList.add('show');
  
  // Fetch Partidas
  try {
    const res = await fetch(`${API_BASE}/valorant/matches/${encodeURIComponent(gName)}/${encodeURIComponent(tLine)}`);
    const matches = await res.json();
    
    loader.classList.remove('show');
    
    if (!res.ok || !matches || matches.length === 0) {
      historyContainer.innerHTML = '<div style="padding: 15px; color: #888;">No hay historial de partidas disponible o la cuenta es privada.</div>';
      return;
    }
    
    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;
    let totalHeadshots = 0;
    let totalBody = 0;
    let totalLegs = 0;
    let totalScore = 0;
    let totalDamage = 0;
    let totalRounds = 0;
    
    let wins = 0;
    let losses = 0;
    
    const agentsCount = {};
    
    matches.forEach(m => {
      const isDeathmatch = m.meta.mode.toLowerCase() === 'deathmatch';
      // Encontrar al jugador en los equipos
      let myPlayer = null;
      if (m.players && m.players.all_players) {
        myPlayer = m.players.all_players.find(x => x.puuid === player.puuid || (x.name.toLowerCase() === gName.toLowerCase() && x.tag.toLowerCase() === tLine.toLowerCase()));
      }
      
      if (!myPlayer) return;
      
      // Contabilizar stats globales (solo modos normales)
      if (!isDeathmatch) {
         const stats = myPlayer.stats || {};
         totalKills += stats.kills || 0;
         totalDeaths += stats.deaths || 0;
         totalAssists += stats.assists || 0;
         totalScore += stats.score || 0;
         
         const hs = stats.headshots || 0;
         const bs = stats.bodyshots || 0;
         const ls = stats.legshots || 0;
         totalHeadshots += hs;
         totalBody += bs;
         totalLegs += ls;
         
         const dmgData = myPlayer.damage_made || 0;
         totalDamage += dmgData;
         totalRounds += m.meta.cluster ? m.meta.cluster.length || (m.teams.red.rounds_won + m.teams.red.rounds_lost) : 20; // Aproximación
         
         // Agentes
         const agentName = myPlayer.character;
         if (!agentsCount[agentName]) agentsCount[agentName] = { count: 0, wins: 0, icon: myPlayer.assets.agent.small };
         agentsCount[agentName].count++;
      }
      
      // Victoria o Derrota
      let result = 'Empate';
      let resultColor = '#888';
      let borderLeft = '4px solid #888';
      
      if (!isDeathmatch && m.teams) {
        const myTeam = m.teams[myPlayer.team.toLowerCase()];
        if (myTeam && myTeam.has_won) {
          result = 'Victoria';
          resultColor = '#5bb482';
          borderLeft = '4px solid #5bb482';
          wins++;
          if (agentsCount[myPlayer.character]) agentsCount[myPlayer.character].wins++;
        } else if (myTeam && !myTeam.has_won && myTeam.rounds_won < myTeam.rounds_lost) {
          result = 'Derrota';
          resultColor = '#ff4655';
          borderLeft = '4px solid #ff4655';
          losses++;
        }
      } else if (isDeathmatch) {
        result = 'Deathmatch';
      }
      
      // Elemento Historial
      const stats = myPlayer.stats || {};
      const kdaStr = `${stats.kills}/${stats.deaths}/${stats.assists}`;
      const score = stats.score || 0;
      
      const el = document.createElement('div');
      el.style.cssText = `background: rgba(20,20,20,0.8); margin-bottom: 8px; padding: 12px; border-radius: 6px; border-left: ${borderLeft}; display: flex; align-items: center; justify-content: space-between;`;
      
      el.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${myPlayer.assets.agent.small}" style="width: 48px; height: 48px; border-radius: 50%; background: #333; border: 1px solid rgba(255,255,255,0.1);" alt="Agent">
          <div>
            <div style="font-weight: bold; color: ${resultColor}; font-size: 1.1rem;">${result} <span style="font-size: 0.8rem; color: #888;">${m.meta.mode} - ${m.meta.map.name}</span></div>
            <div style="font-size: 0.85rem; color: #aaa;">KDA: <span style="color: white; font-weight: bold;">${kdaStr}</span></div>
          </div>
        </div>
        <div style="text-align: right; font-size: 0.85rem; color: #aaa;">
           <div>Combat Score: <span style="color: white; font-weight: bold;">${score}</span></div>
           <div>Agente: <span style="color: var(--gold-primary); font-weight: 600;">${myPlayer.character}</span></div>
        </div>
      `;
      historyContainer.appendChild(el);
    });
    
    // Rellenar Estadísticas Avanzadas
    const totalMatches = wins + losses;
    if (totalMatches > 0) {
      const winrate = Math.round((wins / totalMatches) * 100);
      document.getElementById('detail-wins').textContent = `${wins} V`;
      document.getElementById('detail-losses').textContent = `${losses} D`;
      document.getElementById('detail-win-bar').style.width = `${winrate}%`;
      
      const avgKills = (totalKills / totalMatches).toFixed(1);
      const avgDeaths = (totalDeaths / totalMatches).toFixed(1);
      const avgAssists = (totalAssists / totalMatches).toFixed(1);
      document.getElementById('stat-kda-avg').textContent = `${avgKills} / ${avgDeaths} / ${avgAssists}`;
      
      const totalShots = totalHeadshots + totalBody + totalLegs;
      const hsPercent = totalShots > 0 ? Math.round((totalHeadshots / totalShots) * 100) : 0;
      document.getElementById('stat-hs').textContent = `${hsPercent}%`;
      
      const avgScore = totalRounds > 0 ? Math.round(totalScore / totalRounds) : Math.round(totalScore / (totalMatches*20));
      document.getElementById('stat-acs').textContent = avgScore;
      
      const avgDmg = totalRounds > 0 ? Math.round(totalDamage / totalRounds) : 0;
      document.getElementById('stat-adr').textContent = avgDmg;
    }
    
    // Top Agentes
    const topAgents = Object.keys(agentsCount).map(k => ({
      name: k,
      ...agentsCount[k]
    })).sort((a, b) => b.count - a.count).slice(0, 3);
    
    const champsContainer = document.getElementById('detail-top-champs');
    topAgents.forEach(agent => {
       const wr = Math.round((agent.wins / agent.count) * 100);
       const el = document.createElement('div');
       el.className = 'top-champ-card';
       el.style.cssText = `background: rgba(255, 70, 85, 0.05); border: 1px solid rgba(255, 70, 85, 0.1); padding: 8px; border-radius: 8px; display: flex; align-items: center; gap: 10px; width: 100%;`;
       el.innerHTML = `
         <img src="${agent.icon}" style="width: 40px; height: 40px; border-radius: 50%;">
         <div>
           <div style="font-weight: bold; color: white;">${agent.name}</div>
           <div style="font-size: 0.8rem; color: #888;">${wr}% WR (${agent.count} partidas)</div>
         </div>
       `;
       champsContainer.appendChild(el);
    });
    
  } catch (err) {
    loader.classList.remove('show');
    historyContainer.innerHTML = `<div style="padding: 15px; color: #ff4655;">Error cargando historial: ${err.message}</div>`;
  }
}

// ==========================================
// AÑADIR JUGADOR
// ==========================================
const addPlayerForm = document.getElementById('add-player-form');
addPlayerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = addPlayerForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Añadiendo...';
  
  const gameName = document.getElementById('gameName').value.trim();
  const tagLine = document.getElementById('tagLine').value.trim();
  const region = document.getElementById('region').value; // A mapear en backend si es necesario
  
  try {
    const res = await fetch(`${API_BASE}/summoners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameName, tagLine, region, isNew: true })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error desconocido');
    
    showToast('Jugador añadido a la jauría', false);
    document.getElementById('add-player-modal').classList.remove('show');
    setTimeout(() => document.getElementById('add-player-modal').style.display = 'none', 300);
    addPlayerForm.reset();
    
    fetchValorantLeaderboard();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar';
  }
});

// ==========================================
// EVENT LISTENERS BÁSICOS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  fetchValorantLeaderboard();
  
  // Modal de Añadir Jugador
  const addModal = document.getElementById('add-player-modal');
  document.getElementById('add-player-btn').onclick = () => {
    addModal.style.display = 'flex';
    setTimeout(() => addModal.classList.add('show'), 10);
  };
  
  // Cerrar modales (General)
  document.querySelectorAll('.close-modal, .close-details').forEach(btn => {
    btn.onclick = function() {
      const m = this.closest('.modal');
      m.classList.remove('show');
      setTimeout(() => m.style.display = 'none', 300);
    };
  });
});

