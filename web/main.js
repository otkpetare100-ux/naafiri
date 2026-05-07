import './style.css'

const API_BASE = 'http://localhost:3001/api';
const ASSETS_BASE = 'http://localhost:3001/assets';
const DDRAGON_VERSION = '15.8.1';

async function fetchLadder() {
  const container = document.getElementById('ladder-container');
  
  try {
    const response = await fetch(`${API_BASE}/ladder`);
    if (!response.ok) throw new Error('Error al obtener datos');
    
    const players = await response.json();
    renderLadder(players);
  } catch (error) {
    console.error('API Error:', error);
    container.innerHTML = `<div class="error">⚠️ Error al conectar con la API de Naafiri.</div>`;
  }
}

function renderLadder(players) {
  const container = document.getElementById('ladder-container');
  container.innerHTML = '';

  if (players.length === 0) {
    container.innerHTML = `<div class="empty">No hay perros en la jauría aún.</div>`;
    return;
  }

  players.forEach((player, index) => {
    const rankNum = index + 1;
    const card = document.createElement('div');
    card.className = `player-card rank-${rankNum}`;
    
    // Ruta del emblema
    const tier = player.tier.toLowerCase();
    const emblemUrl = `${ASSETS_BASE}/ranks/${tier}.png`;
    
    // Icono de invocador
    const avatarUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${player.profileIconId}.png`;

    card.innerHTML = `
      <div class="rank-text">#${rankNum}</div>
      
      <div class="avatar-wrapper">
        <img src="${avatarUrl}" class="player-avatar" alt="${player.gameName}" />
        <div class="level-tag">${player.summonerLevel}</div>
      </div>

      <div class="player-main-info">
        <div class="player-name-row">
          <span class="name">${player.gameName}</span>
          <span class="status-dot ${player.isLive ? 'online' : ''}"></span>
        </div>
        <div class="tag">#${player.tagLine}</div>
      </div>

      <div class="rank-data">
        <img src="${emblemUrl}" class="rank-emblem" alt="${player.tier}" onerror="this.style.opacity='0'" />
        <div class="rank-info-text">
          <div class="tier-text">${player.tier} ${player.rank}</div>
          <div class="rank-stats">
            <span class="lp">${player.lp} LP</span>
            <span class="separator">·</span>
            <span class="wr">${player.winRate} WR</span>
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Búsqueda (Filtro local por ahora)
const searchInput = document.getElementById('search-input');
searchInput.addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const cards = document.querySelectorAll('.player-card');
  
  cards.forEach(card => {
    const name = card.querySelector('.name').textContent.toLowerCase();
    const tag = card.querySelector('.tag').textContent.toLowerCase();
    if (name.includes(term) || tag.includes(term)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
});

// Carga inicial
document.addEventListener('DOMContentLoaded', fetchLadder);
