import './style.css'

const API_BASE = 'http://localhost:3001/api';
const ASSETS_BASE = 'http://localhost:3001/assets';

// Datos de la versión de DDragon (podría venir de la API)
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
    container.innerHTML = `<div class="error">⚠️ No se pudo conectar con el servidor de la Grieta.</div>`;
  }
}

function renderLadder(players) {
  const container = document.getElementById('ladder-container');
  container.innerHTML = '';

  if (players.length === 0) {
    container.innerHTML = `<div class="empty">No hay invocadores registrados todavía.</div>`;
    return;
  }

  players.forEach((player, index) => {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.style.animationDelay = `${index * 0.1}s`;

    // Ruta del emblema de rango
    const tier = player.tier.toLowerCase();
    const emblemUrl = `${ASSETS_BASE}/ranks/${tier}.png`;
    
    // Icono del invocador de DDragon
    const avatarUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${player.profileIconId}.png`;

    card.innerHTML = `
      <div class="rank-number">${index + 1}</div>
      <img src="${avatarUrl}" class="player-avatar" alt="${player.gameName}" />
      <div class="player-info">
        <div class="player-name">
          ${player.gameName} <span class="tag">#${player.tagLine}</span>
          ${player.isLive ? '<span class="status-dot"></span>' : ''}
        </div>
      </div>
      <img src="${emblemUrl}" class="rank-emblem" alt="${player.tier}" onerror="this.style.opacity='0'" />
      <div class="stats-container">
        <div class="lp-text">${player.lp} LP</div>
        <div class="wr-text">${player.tier} ${player.rank} • ${player.winRate} WR</div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Manejo de búsqueda / agregar
const addBtn = document.getElementById('add-player-btn');
const searchInput = document.getElementById('search-input');

addBtn.addEventListener('click', () => {
  const query = searchInput.value.trim();
  if (!query) return;
  
  alert(`Buscando a ${query}... (Función en desarrollo)`);
  // Aquí se llamaría a la API para agregar el jugador
});

// Carga inicial
document.addEventListener('DOMContentLoaded', fetchLadder);
