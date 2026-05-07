/**
 * app.js — Main controller for LAN Tracker
 */

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

let accounts = [];
const refreshCooldowns = {};
const REFRESH_COOLDOWN = 60 * 1000;

const searchInput  = document.getElementById('search-input');
const searchBtn    = document.getElementById('search-btn');
const accountsGrid = document.getElementById('accounts-grid');
const filterInput  = document.getElementById('filter-input');


const TIER_ORDER = {
  CHALLENGER: 9, GRANDMASTER: 8, MASTER: 7,
  DIAMOND: 6, EMERALD: 5, PLATINUM: 4,
  GOLD: 3, SILVER: 2, BRONZE: 1, IRON: 0, UNRANKED: -1,
};
const DIV_ORDER = { I: 4, II: 3, III: 2, IV: 1 };

function getRankScore(acc) {
  const soloQ = acc.soloQ;
  if (!soloQ) return -1;
  const tier = TIER_ORDER[soloQ.tier] ?? -1;
  const div  = DIV_ORDER[soloQ.rank]  ?? 0;
  const lp   = soloQ.leaguePoints     || 0;
  return tier * 10000 + div * 1000 + lp;
}

function sortByRank(list) {
  return [...list].sort((a, b) => getRankScore(b) - getRankScore(a));
}

function updateGlobalRef() {
  window._accounts_ref = accounts;
}

async function init() {
  accounts = await loadAccounts();
  updateGlobalRef();
  applyFilters();
  // checkAllLiveStatus(); // Deshabilitado temporalmente (403 dev key)
}
init();

async function checkAllLiveStatus() {
  if (!accounts || accounts.length === 0) return;
  for (const acc of accounts) {
    try {
      const game = await getActiveGame(acc.puuid);
      acc.isLive = !!game;
    } catch(e) { acc.isLive = false; }
  }
  applyFilters();
}

// setInterval(checkAllLiveStatus, 180000); // 3 minutos (Deshabilitado temporalmente)

// Auto-refresh activado
setInterval(async () => {
  if (accounts.length === 0) return;
  for (const acc of accounts) {
    await handleRefresh(acc.puuid, true);
  }
}, AUTO_REFRESH_INTERVAL);

/* ---- Search ---- */
async function handleSearch() {
  if (!searchInput) return;
  const raw = searchInput.value.trim();
  if (typeof showError === 'function') showError('');
  if (!raw) return;

  const parts = raw.split('#');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    showError('Formato inválido. Usa Nombre#TAG (ej: Pepitoflow#LAN1)');
    return;
  }

  const gameName = parts[0].trim();
  const tagLine = parts[1].trim();
  
  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.textContent = '...';
  }

  try {
    const entry  = await fetchAccountSnapshot(gameName, tagLine);
    const result = await saveAccount(entry);
    if (!result.added) {
      showError('Esta cuenta ya está en la lista.');
    } else {
      accounts.push(entry);
      updateGlobalRef();
      applyFilters();
      searchInput.value = '';
    }
  } catch (err) {
    showError(err.status ? getApiErrorMessage(err.status) : 'Error de red: ' + err.message);
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Buscar';
    }
  }
}

/* ---- Refresh ---- */
async function handleRefresh(puuid, silent = false, bypassCooldown = false) {
  const acc = accounts.find(a => a.puuid === puuid);
  if (!acc) return;

  if (!silent && !bypassCooldown) {
    const lastRefresh = refreshCooldowns[puuid] || 0;
    const elapsed = Date.now() - lastRefresh;
    if (elapsed < REFRESH_COOLDOWN) {
      const seconds = Math.ceil((REFRESH_COOLDOWN - elapsed) / 1000);
      showError('Espera ' + seconds + ' segundos para actualizar esta cuenta.');
      clearTimeout(window._errorTimeout);
      window._errorTimeout = setTimeout(() => showError(''), 5000);
      return;
    }
    refreshCooldowns[puuid] = Date.now();
  }

  const card = document.getElementById('card-' + puuid);
  const btn = card ? card.querySelector('.refresh-btn') : null;
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }

  try {
    const updated = await fetchAccountSnapshot(acc.gameName, acc.tagLine);
    
    if (btn) btn.classList.remove('spinning');
    
    updated.streak       = acc.streak  || 0;
    updated.mainPosition = acc.mainPosition || '—';
    updated.recentChampions = acc.recentChampions || [];

    await updateAccount(updated);
    
    // Toast y guardado de historial de cambio de rango
    const prevSoloQ = acc.soloQ;
    const newSoloQ  = updated.soloQ;
    showRankChangeToast(updated.gameName, prevSoloQ, newSoloQ);
    saveRankHistoryIfNeeded(acc, newSoloQ, prevSoloQ);

    // --- Funcionalidad 3: Rachas Históricas ---
    if (!updated.records) updated.records = acc.records || { maxWinStreak: 0, maxLossStreak: 0 };
    const currentStreak = updated.streak || 0;
    
    if (currentStreak > 0 && currentStreak > (updated.records.maxWinStreak || 0)) {
      updated.records.maxWinStreak = currentStreak;
      showToast(`🔥 ¡NUEVO RÉCORD! ${updated.gameName} racha de ${currentStreak} victorias`, 'toast-up');
      triggerRankUpCelebration(); // Reutilizar celebración
    } else if (currentStreak < 0 && Math.abs(currentStreak) > (updated.records.maxLossStreak || 0)) {
      updated.records.maxLossStreak = Math.abs(currentStreak);
    }


    accounts = accounts.map(a => a.puuid === puuid ? updated : a);
    updateGlobalRef();
    
    // Si el modal de historial está abierto para esta cuenta, lo actualizamos
    if (document.getElementById('history-modal')) {
      // Re-abrimos para refrescar contenido (el modal detectará si es el mismo puuid si quisiéramos ser finos, 
      // pero por ahora simplemente lo llamamos de nuevo)
      openHistoryModal(puuid);
    }

  } catch (err) {
    if (!silent) {
      showError(err.status ? getApiErrorMessage(err.status) : 'Error de red: ' + err.message);
    }
    const c = document.getElementById('card-' + puuid);
    if (c) {
      const btn = c.querySelector('.refresh-btn');
      if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
    }
  }
}


async function handleRemoveAccount(puuid) {
  const ok = await showCustomConfirm('Eliminar Cuenta', '¿Estás seguro de que deseas dejar de rastrear a este jugador?');
  if (ok) {
    await deleteAccount(puuid);
    accounts = accounts.filter(a => a.puuid !== puuid);
    updateGlobalRef();
    if (window.selectedToCompare) {
      window.selectedToCompare = window.selectedToCompare.filter(p => p !== puuid);
    }
    applyFilters();
    showToast('Cuenta eliminada', 'toast-neutral');
  }
}

/* ---- Event delegation ---- */
if (accountsGrid) {
  accountsGrid.addEventListener('click', async (e) => {
    const refreshBtn = e.target.closest('.refresh-btn');
    const removeBtn  = e.target.closest('.remove-btn');
    const historyBtn = e.target.closest('.history-btn');
    const row        = e.target.closest('.scoreboard-row');

    if (refreshBtn) {
      e.preventDefault(); e.stopPropagation();
      handleRefresh(refreshBtn.dataset.puuid);
      return;
    }
    if (historyBtn) {
      e.preventDefault(); e.stopPropagation();
      if (typeof openPlayerModal === 'function') openPlayerModal(historyBtn.dataset.puuid, e);
      return;
    }
    if (removeBtn) {
      e.preventDefault(); e.stopPropagation();
      handleRemoveAccount(removeBtn.dataset.puuid);
      return;
    }

    // Abrir modal de detalles al hacer click en la fila
    if (row && !e.target.closest('button')) {
      const puuid = row.id.replace('card-', '');
      if (typeof openPlayerModal === 'function') openPlayerModal(puuid, e);
    }
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', handleSearch);
}
if (searchInput) {
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });
}

// Forzar actualización desde link público
window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const forcePuuid = params.get('force_update');
  if (forcePuuid) {
    setTimeout(() => {
      showToast('⚙️ Forzando actualización...', 'toast-neutral');
      handleRefresh(forcePuuid, false, true);
    }, 2500);
  }
});

/* ---- Búsqueda y Filtro en Cliente ---- */
function applyFilters() {
  const query = (filterInput ? filterInput.value : '').toLowerCase().trim();
  
  let filtered = accounts;
  
  // Filtro por nombre
  if (query) {
    filtered = filtered.filter(a => a.gameName.toLowerCase().includes(query));
  }
  
  renderAccounts(sortByRank(filtered));
}

if (filterInput) {
  filterInput.addEventListener('input', applyFilters);
}


/* ---- Toasts de Rango ---- */
function showRankChangeToast(name, prev, next) {
  if (!prev || !next || prev.tier === 'UNRANKED' || next.tier === 'UNRANKED') return;
  const prevScore = (TIER_ORDER[prev.tier] ?? -1) * 10000 + (DIV_ORDER[prev.rank] ?? 0) * 1000 + (prev.leaguePoints || 0);
  const nextScore = (TIER_ORDER[next.tier] ?? -1) * 10000 + (DIV_ORDER[next.rank] ?? 0) * 1000 + (next.leaguePoints || 0);
  if (prevScore === nextScore) return;
  
  const noDivTiers = ['MASTER','GRANDMASTER','CHALLENGER'];
  const fmt = r => noDivTiers.includes(r.tier) ? r.tier : `${r.tier} ${r.rank}`;
  
  const promoted  = nextScore > prevScore;
  const sameDiv   = prev.tier === next.tier && prev.rank === next.rank;
  
  const emoji     = promoted ? '🎉' : '💀';
  const color     = promoted ? 'toast-up' : 'toast-down';
  const msg       = sameDiv
    ? `${name}: ${prev.leaguePoints} → ${next.leaguePoints} LP`
    : promoted
      ? `¡${name} subió a ${fmt(next)}!`
      : `${name} bajó a ${fmt(next)}`;
      
  showToast(emoji + ' ' + msg, color);
  
  if (promoted && !sameDiv) {
    triggerRankUpCelebration();
  }
}

function triggerRankUpCelebration() {
  const container = document.createElement('div');
  container.className = 'rank-celebration-container';
  document.body.appendChild(container);

  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle-gold';
    particle.style.left = Math.random() * 100 + 'vw';
    particle.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
    particle.style.animationDelay = (Math.random() * 0.5) + 's';
    container.appendChild(particle);
  }

  setTimeout(() => {
    container.remove();
  }, 3500);
}

function showToast(message, cls = '') {
  const t = document.createElement('div');
  t.className = 'rank-toast ' + cls;
  t.textContent = message;
  document.body.appendChild(t);
  
  requestAnimationFrame(() => t.classList.add('rank-toast--show'));
  
  setTimeout(() => {
    t.classList.remove('rank-toast--show');
    setTimeout(() => t.remove(), 400);
  }, 5000);
}

/* ---- Historial de Rangos ---- */
async function saveRankHistoryIfNeeded(acc, newSoloQ, prevSoloQ) {
  if (!newSoloQ || newSoloQ.tier === 'UNRANKED') return;
  
  // Guardamos solo si cambió el tier, división o lp
  const changed = !prevSoloQ || 
                  prevSoloQ.tier !== newSoloQ.tier || 
                  prevSoloQ.rank !== newSoloQ.rank || 
                  prevSoloQ.leaguePoints !== newSoloQ.leaguePoints;
                  
  if (changed) {
    const noDivTiers = ['MASTER','GRANDMASTER','CHALLENGER'];
    const fmt = r => !r || r.tier === 'UNRANKED' ? 'Unranked' : (noDivTiers.includes(r.tier) ? r.tier : `${r.tier} ${r.rank}`);
    
    const prevScore = prevSoloQ ? ((TIER_ORDER[prevSoloQ.tier] ?? -1) * 10000 + (DIV_ORDER[prevSoloQ.rank] ?? 0) * 1000 + (prevSoloQ.leaguePoints || 0)) : -1;
    const nextScore = (TIER_ORDER[newSoloQ.tier] ?? -1) * 10000 + (DIV_ORDER[newSoloQ.rank] ?? 0) * 1000 + (newSoloQ.leaguePoints || 0);
    
    // Solo notificar a Discord si cambió de división/liga (no solo LP)
    const tierOrDivChanged = !prevSoloQ || prevSoloQ.tier !== newSoloQ.tier || prevSoloQ.rank !== newSoloQ.rank;

    const entry = {
      puuid: acc.puuid,
      gameName: acc.gameName,
      tagLine: acc.tagLine,
      rank: {
        tier: newSoloQ.tier,
        division: newSoloQ.rank,
        lp: newSoloQ.leaguePoints
      },
      discordNotify: tierOrDivChanged,
      oldRank: fmt(prevSoloQ),
      promoted: nextScore > prevScore,
      streak: acc.streak || 0
    };
    await postRankHistory(entry);
  }
}
