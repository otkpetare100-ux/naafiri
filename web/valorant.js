const API_BASE = '/api';

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
    setTimeout(() => {
      document.getElementById('top-loading-bar').style.width = '0';
    }, 300);
  }, 500);
}

async function fetchValorantLeaderboard() {
  startLoading();
  const loadingEl = document.getElementById('val-loading');
  const tableWrapper = document.getElementById('val-table-wrapper');
  
  loadingEl.style.display = 'block';
  tableWrapper.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/valorant/leaderboard`);
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Error al obtener datos');
    
    renderLeaderboard(data.leaderboard);
    
    loadingEl.style.display = 'none';
    tableWrapper.style.display = 'block';
  } catch (err) {
    loadingEl.textContent = `Error: ${err.message}. Asegúrate de tener configurada la API Key de HenrikDev.`;
    showToast('Error cargando Leaderboard', true);
  } finally {
    stopLoading();
  }
}

function renderLeaderboard(players) {
  const wrapper = document.getElementById('val-table-wrapper');
  
  if (!players || players.length === 0) {
    wrapper.innerHTML = '<div style="text-align: center; padding: 2rem;">No hay jugadores de Valorant registrados.</div>';
    return;
  }

  let html = `
    <table style="width: 100%; border-collapse: collapse; text-align: left; background: rgba(18, 18, 20, 0.85); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255, 70, 85, 0.2);">
      <thead>
        <tr style="background: rgba(255, 70, 85, 0.1); color: #ff4655; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;">
          <th style="padding: 16px;">#</th>
          <th style="padding: 16px;">Jugador</th>
          <th style="padding: 16px;">Rango</th>
          <th style="padding: 16px;">RR</th>
        </tr>
      </thead>
      <tbody>
  `;

  players.forEach((p, index) => {
    // Determine rank styling
    let rankColor = '#fff';
    if (p.rank && p.rank.toLowerCase().includes('radiant')) rankColor = '#ffcf70';
    else if (p.rank && p.rank.toLowerCase().includes('immortal')) rankColor = '#b32c4d';
    else if (p.rank && p.rank.toLowerCase().includes('ascendant')) rankColor = '#5bb482';
    else if (p.rank && p.rank.toLowerCase().includes('diamond')) rankColor = '#b489d4';
    else if (p.rank && p.rank.toLowerCase().includes('platinum')) rankColor = '#3e8f99';
    else if (p.rank && p.rank.toLowerCase().includes('gold')) rankColor = '#dbb94f';
    else if (p.rank && p.rank.toLowerCase().includes('silver')) rankColor = '#a8b0b8';
    
    html += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s ease;">
        <td style="padding: 16px; font-weight: 800; color: #666;">${index + 1}</td>
        <td style="padding: 16px; font-weight: 700;">
          <div style="display: flex; align-items: center; gap: 12px;">
             ${p.iconUrl ? `<img src="${p.iconUrl}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">` : ''}
             <span>${p.name}</span>
          </div>
        </td>
        <td style="padding: 16px; font-weight: 800; color: ${rankColor}; text-shadow: 0 0 10px ${rankColor}40;">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${p.rankIconUrl ? `<img src="${p.rankIconUrl}" style="width: 24px; height: 24px;">` : ''}
            ${p.rank || 'Unranked'}
          </div>
        </td>
        <td style="padding: 16px; font-weight: 600; color: var(--text-muted);">${p.rr !== null ? p.rr : '-'}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  wrapper.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  fetchValorantLeaderboard();
  
  const refreshBtn = document.getElementById('refresh-val-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('rotating');
      fetchValorantLeaderboard().finally(() => {
        refreshBtn.classList.remove('rotating');
      });
    });
  }
});
