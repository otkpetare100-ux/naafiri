import './style.css'

const API_BASE = `${window.location.origin}/api`;
const ASSETS_BASE = '/assets';
let DDRAGON_VERSION = '16.9.1'; // BUG-17 fix: mantener actualizado con el servidor

// Mapeos estáticos globales de Hechizos e Iconos de Runas para el Historial
const SUMMONER_SPELL_MAP = {
  1: "SummonerBoost",      // Purificar
  3: "SummonerExhaust",    // Extenuación
  4: "SummonerFlash",      // Destello
  6: "SummonerHaste",      // Fantasma
  7: "SummonerHeal",       // Curar
  11: "SummonerSmite",     // Aplastar
  12: "SummonerTeleport",  // Teleportar
  14: "SummonerDot",       // Ignición
  21: "SummonerBarrier",   // Barrera
  32: "SummonerSnowball",  // Bola de nieve (Mark ARAM)
};

const KEYSTONE_RUNE_MAP = {
  8005: "perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png",
  8008: "perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png",
  8010: "perk-images/Styles/Precision/Conqueror/Conqueror.png",
  8021: "perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png",
  8112: "perk-images/Styles/Domination/Electrocute/Electrocute.png",
  8124: "perk-images/Styles/Domination/Predator/Predator.png",
  8128: "perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png",
  9923: "perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png",
  8214: "perk-images/Styles/Sorcery/SummonAery/SummonAery.png",
  8229: "perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png",
  8230: "perk-images/Styles/Sorcery/PhaseRush/PhaseRush.png",
  8437: "perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png",
  8439: "perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png",
  8465: "perk-images/Styles/Resolve/Guardian/Guardian.png",
  8351: "perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png",
  8360: "perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png",
  8369: "perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png"
};

const RUNE_STYLE_MAP = {
  8000: "perk-images/Styles/7201_Precision.png",
  8100: "perk-images/Styles/7200_Domination.png",
  8200: "perk-images/Styles/7202_Sorcery.png",
  8300: "perk-images/Styles/7203_Whimsy.png",
  8400: "perk-images/Styles/7204_Resolve.png"
};

// Mapas y funciones de ayuda para la Misión de Carril de la Temporada 2026
const QUEST_TOOLTIPS = {
  'TOP': 'Misión de Top Completada: +Límite Nivel 20 & Teleport con Escudo de Vida Máxima',
  'JUNGLE': 'Misión de Jungla Completada: Castigo Divino Mejorado & Velocidad en Río/Jungla',
  'MID': 'Misión de Mid Completada: Botas de Nivel 3 Exclusivas & Retorno (Recall) Acelerado',
  'BOTTOM': 'Misión de Bot (ADC) Completada: 7.º Espacio de Objeto para Botas & Escalado de Oro',
  'UTILITY': 'Misión de Soporte Completada: Ranura Especial para Centinela de Control & Descuentos'
};

const BOOTS_ITEM_IDS = new Set([
  1001, 2422, 3006, 3009, 3047, 3111, 3158, 3020, 3117, 3184, 3181, 3285
]);

const PRELOADED_SPLASHES = new Map();


// BUG-02 fix: Sanitizar datos externos antes de inyectar en innerHTML
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let visibleMatchesCount = 10;
let currentHistory = [];
let currentQueueType = 'soloq';
let activePlayerDetails = null;
let hasReachedHistoryEnd = false;

function isLaneQuestCompleted(match) {
  const lane = (match.lane || 'Unknown').toUpperCase();
  const level = match.champLevel;
  const cs = match.cs || 0;
  const gold = match.gold || 0;
  
  if (match.isRemake || (match.durationMins && match.durationMins < 15)) return false;
  
  if (level !== undefined) {
    if (lane === 'TOP') return level >= 16;
    if (lane === 'JUNGLE') return level >= 13 || cs >= 80;
    if (lane === 'MIDDLE' || lane === 'MID') return level >= 15 || gold >= 8500;
    if (lane === 'BOTTOM' || lane === 'BOTTOM_CARRY' || lane === 'ADC') return cs >= 140 || gold >= 9500;
    if (lane === 'UTILITY' || lane === 'BOTTOM_SUPPORT' || lane === 'SUPPORT') return gold >= 6000 || level >= 12;
  } else {
    // Fallback inteligente para partidas viejas en la base de datos sin nivel guardado
    if (lane === 'TOP') return gold >= 9000;
    if (lane === 'JUNGLE') return cs >= 80 || gold >= 7500;
    if (lane === 'MIDDLE' || lane === 'MID') return gold >= 8500;
    if (lane === 'BOTTOM' || lane === 'BOTTOM_CARRY' || lane === 'ADC') return cs >= 140 || gold >= 9500;
    if (lane === 'UTILITY' || lane === 'BOTTOM_SUPPORT' || lane === 'SUPPORT') return gold >= 5500;
  }
  return gold >= 8000;
}

function renderItemSlot(itemId, isTrinket = false) {
  if (itemId === undefined || itemId === null || itemId === 0) {
    return `<div class="match-item-slot empty ${isTrinket ? 'trinket' : ''}"></div>`;
  }
  const itemUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${itemId}.png`;
  return `
    <div class="match-item-slot ${isTrinket ? 'trinket' : ''}" data-item-id="${itemId}">
      <img src="${itemUrl}" class="match-item-img" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23555\' stroke-width=\'2\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\'/><path d=\'M9 17L15 7\'/></svg>';" />
    </div>
  `;
}

let ITEMS_DB = null;

async function initItemsDatabase() {
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/es_MX/item.json`);
    const data = await res.json();
    ITEMS_DB = data.data;
    console.log('Items database initialized.');
  } catch (e) {
    console.error('Error loading items database:', e);
  }
}

function showItemTooltip(e, item, slot) {
  let tooltip = document.getElementById('item-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'item-tooltip';
    tooltip.className = 'item-custom-tooltip';
    document.body.appendChild(tooltip);
  }
  
  const descriptionHtml = item.description || '';
  const goldHtml = item.gold && item.gold.total > 0 
    ? `<span class="tooltip-gold"><svg class="gold-coin-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#fbbf24" stroke="#d97706" stroke-width="1.8"/><circle cx="12" cy="12" r="5" stroke="#d97706" stroke-width="1.5" stroke-dasharray="2 1"/></svg> ${item.gold.total} oro</span>` 
    : '';

  tooltip.innerHTML = `
    <div class="tooltip-header">
      <span class="tooltip-name">${item.name}</span>
      ${goldHtml}
    </div>
    ${item.plaintext ? `<div class="tooltip-plaintext">${item.plaintext}</div>` : ''}
    <div class="tooltip-divider"></div>
    <div class="tooltip-description">${descriptionHtml}</div>
  `;
  
  tooltip.style.display = 'block';
  positionTooltip(e, tooltip);
}

function positionTooltip(e, tooltip) {
  const offsetX = 15;
  const offsetY = 15;
  
  let x = e.pageX + offsetX;
  let y = e.pageY + offsetY;
  
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (x + tooltipWidth > window.scrollX + viewportWidth - 20) {
    x = e.pageX - tooltipWidth - offsetX;
  }
  if (y + tooltipHeight > window.scrollY + viewportHeight - 20) {
    y = e.pageY - tooltipHeight - offsetY;
  }
  
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideItemTooltip() {
  const tooltip = document.getElementById('item-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Global mouse event listeners for items tooltips
document.addEventListener('mouseover', (e) => {
  const slot = e.target.closest('.match-item-slot');
  if (!slot || slot.classList.contains('empty')) return;
  
  const itemId = slot.getAttribute('data-item-id');
  if (!itemId || !ITEMS_DB) return;
  
  const item = ITEMS_DB[itemId];
  if (!item) return;
  
  showItemTooltip(e, item, slot);
});

document.addEventListener('mousemove', (e) => {
  const tooltip = document.getElementById('item-tooltip');
  if (tooltip && tooltip.style.display !== 'none') {
    positionTooltip(e, tooltip);
  }
});

document.addEventListener('mouseout', (e) => {
  const slot = e.target.closest('.match-item-slot');
  if (!slot) return;
  
  hideItemTooltip();
});

function showQuestTooltip(e, titleText, isCompleted, lane) {
  let tooltip = document.getElementById('quest-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'quest-tooltip';
    tooltip.className = 'quest-custom-tooltip';
    document.body.appendChild(tooltip);
  }
  
  const iconSvg = isCompleted
    ? `<svg class="quest-status-svg completed" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3C12 7.97 16.03 12 21 12C16.03 12 12 16.03 12 21C12 16.03 7.97 12 3 12C7.97 12 12 7.97 12 3Z" fill="#ff9f0a"/>
       </svg>`
    : `<svg class="quest-status-svg incomplete" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/>
        <line x1="8" y1="12" x2="16" y2="12" stroke="#ef4444" stroke-width="2"/>
       </svg>`;

  const statusText = isCompleted 
    ? `<span class="quest-status-badge completed">COMPLETADA</span>`
    : `<span class="quest-status-badge incomplete">NO COMPLETADA</span>`;

  tooltip.innerHTML = `
    <div class="tooltip-header">
      <span class="tooltip-name">${iconSvg} Misión de ${lane}</span>
      ${statusText}
    </div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-description">${titleText}</div>
  `;
  
  tooltip.style.display = 'block';
  positionTooltip(e, tooltip);
}

function hideQuestTooltip() {
  const tooltip = document.getElementById('quest-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Global mouse event listeners for quest tooltips
document.addEventListener('mouseover', (e) => {
  const slot = e.target.closest('.quest-slot');
  if (!slot || slot.getAttribute('data-item-id')) return;
  
  const questTitle = slot.getAttribute('data-quest-title');
  if (!questTitle) return;
  
  const isCompleted = slot.getAttribute('data-quest-completed') === 'true';
  const lane = slot.getAttribute('data-quest-lane') || 'Carril';
  
  showQuestTooltip(e, questTitle, isCompleted, lane);
});

document.addEventListener('mousemove', (e) => {
  const tooltip = document.getElementById('quest-tooltip');
  if (tooltip && tooltip.style.display !== 'none') {
    positionTooltip(e, tooltip);
  }
});

document.addEventListener('mouseout', (e) => {
  const slot = e.target.closest('.quest-slot');
  if (!slot) return;
  
  hideQuestTooltip();
});

const SUMMONER_SPELLS_ES = {
  'SummonerFlash': { name: 'Destello', desc: 'Te desplaza una corta distancia hacia la posición del cursor.' },
  'SummonerDot': { name: 'Ignición', desc: 'Quema a un campeón enemigo, infligiéndole daño verdadero en el tiempo y reduciendo las curaciones.' },
  'SummonerSmite': { name: 'Castigo', desc: 'Inflige daño verdadero elevado a monstruos de la jungla o súbditos.' },
  'SummonerTeleport': { name: 'Teleportación', desc: 'Tras canalizar por unos segundos, te teletransporta a una estructura, súbdito o centinela aliado.' },
  'SummonerHeal': { name: 'Curación', desc: 'Restaura vida y otorga un breve aumento de velocidad de movimiento a ti y a un aliado cercano.' },
  'SummonerHaste': { name: 'Fantasma', desc: 'Otorga velocidad de movimiento e inmunidad a colisiones con unidades por un tiempo.' },
  'SummonerBarrier': { name: 'Barrera', desc: 'Otorga un escudo temporal de absorción de daño a tu campeón.' },
  'SummonerExhaust': { name: 'Extenuación', desc: 'Ralentiza a un campeón enemigo y reduce su daño infligido temporalmente.' },
  'SummonerBoost': { name: 'Purificación', desc: 'Elimina todas las debilitaciones de control de masas y reduce la duración de las siguientes.' },
  'SummonerMana': { name: 'Claridad', desc: 'Restaura una parte de tu maná máximo y el de los aliados cercanos.' },
  'SummonerSnowball': { name: 'Marca (Bola de Nieve)', desc: 'Lanza una bola de nieve en línea recta; si impacta a un enemigo, puedes reactivarla para desplazarte hacia él.' }
};

const KEYSTONE_RUNES_ES = {
  8005: { name: 'Estrategia Ofensiva', desc: 'Tres ataques básicos consecutivos infligen daño adaptable adicional y exponen al objetivo.' },
  8008: { name: 'Compás Letal', desc: 'Atacar a un campeón otorga velocidad de ataque acumulable, aumentando el rango al máximo nivel.' },
  8010: { name: 'Conquistador', desc: 'Acumula fuerza adaptable al atacar; al máximo de acumulaciones, cura una parte del daño infligido.' },
  8021: { name: 'Sobre la marcha', desc: 'Moverse y atacar genera energía; al máximo de acumulaciones, cura y otorga velocidad de movimiento.' },
  8112: { name: 'Electrocutar', desc: 'Impactar con 3 habilidades o ataques únicos en 3 segundos inflige daño adaptable adicional.' },
  8124: { name: 'Depredador', desc: 'Añade una activa a tus botas que otorga un gran aumento de velocidad de movimiento y daño adicional.' },
  8128: { name: 'Cosecha Oscura', desc: 'Dañar a un enemigo con menos del 50% de vida inflige daño adaptable adicional y cosecha su alma.' },
  9923: { name: 'Lluvia de Cuchillas', desc: 'Otorga un gran aumento de velocidad de ataque para los primeros 3 ataques básicos.' },
  8214: { name: 'Invocar a Aery', desc: 'Tus ataques y habilidades envían a Aery hacia un objetivo para dañar enemigos o dar escudo a aliados.' },
  8229: { name: 'Cometa Arcano', desc: 'Dañar a un campeón con una habilidad lanza un cometa que inflige daño adaptable en su zona de impacto.' },
  8230: { name: 'Fase Veloz', desc: 'Impactar con 3 ataques o habilidades únicos otorga un gran aumento de velocidad de movimiento y resistencia a la ralentización.' },
  8437: { name: 'Garras del Inmortal', desc: 'Cada 4 segundos en combate, tu próximo ataque básico inflige daño mágico adicional, cura y otorga vida máxima permanente.' },
  8439: { name: 'Repercusión', desc: 'Inmovilizar a un campeón enemigo aumenta tus defensas y luego provoca una explosión que inflige daño mágico.' },
  8465: { name: 'Protector', desc: 'Protege a los aliados cercanos; si alguno recibe daño, ambos obtienen un escudo y velocidad de movimiento.' },
  8351: { name: 'Aumento Glacial', desc: 'Inmovilizar a un campeón enemigo lanza rayos de hielo que ralentizan y reducen el daño de los enemigos afectados.' },
  8360: { name: 'Libro de Hechizos Abierto', desc: 'Te permite cambiar uno de tus hechizos de invocador activos por otro diferente durante la partida.' },
  8369: { name: 'Primer Golpe', desc: 'Atacar primero a un campeón otorga oro adicional y aumenta el daño infligido temporalmente.' }
};

const RUNE_STYLES_ES = {
  8000: { name: 'Precisión', desc: 'Ataques mejorados y daño sostenido.' },
  8100: { name: 'Dominación', desc: 'Daño explosivo y acceso a objetivos.' },
  8200: { name: 'Brujería', desc: 'Habilidades potenciadas y caos de recursos.' },
  8300: { name: 'Inspiración', desc: 'Herramientas creativas y reglas modificadas.' },
  8400: { name: 'Valor', desc: 'Durabilidad y control de masas.' }
};

function showSpellRuneTooltip(e, titleText, descText, typeLabel) {
  let tooltip = document.getElementById('spell-rune-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'spell-rune-tooltip';
    tooltip.className = 'spell-rune-custom-tooltip';
    document.body.appendChild(tooltip);
  }

  tooltip.innerHTML = `
    <div class="tooltip-header">
      <span class="tooltip-name">${titleText}</span>
      <span class="spell-rune-type-badge">${typeLabel}</span>
    </div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-description">${descText}</div>
  `;
  
  tooltip.style.display = 'block';
  positionTooltip(e, tooltip);
}

function hideSpellRuneTooltip() {
  const tooltip = document.getElementById('spell-rune-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Global mouse event listeners for spells and runes tooltips
document.addEventListener('mouseover', (e) => {
  const spellImg = e.target.closest('.match-spell-icon');
  if (spellImg) {
    const rawName = spellImg.getAttribute('data-spell-name');
    if (!rawName) return;
    const spellMeta = SUMMONER_SPELLS_ES[rawName] || { name: rawName, desc: 'Hechizo de invocador.' };
    showSpellRuneTooltip(e, spellMeta.name, spellMeta.desc, 'HECHIZO');
    return;
  }

  const runeImg = e.target.closest('.match-rune-icon');
  if (runeImg) {
    const runeId = parseInt(runeImg.getAttribute('data-rune-id'));
    const runeType = runeImg.getAttribute('data-rune-type');
    if (!runeId) return;

    if (runeType === 'keystone') {
      const runeMeta = KEYSTONE_RUNES_ES[runeId] || { name: 'Runa Clave', desc: 'Runa keystone principal.' };
      showSpellRuneTooltip(e, runeMeta.name, runeMeta.desc, 'RUNA CLAVE');
    } else if (runeType === 'style') {
      const styleMeta = RUNE_STYLES_ES[runeId] || { name: 'Árbol de Runas', desc: 'Estilo secundario.' };
      showSpellRuneTooltip(e, styleMeta.name, styleMeta.desc, 'ÁRBOL SECUNDARIO');
    }
    return;
  }
});

document.addEventListener('mousemove', (e) => {
  const tooltip = document.getElementById('spell-rune-tooltip');
  if (tooltip && tooltip.style.display !== 'none') {
    positionTooltip(e, tooltip);
  }
});

document.addEventListener('mouseout', (e) => {
  if (e.target.closest('.match-spell-icon') || e.target.closest('.match-rune-icon')) {
    hideSpellRuneTooltip();
  }
});

// Global mouse event listeners for LP unknown tooltips
document.addEventListener('mouseover', (e) => {
  const container = e.target.closest('[data-lp-tooltip]');
  if (!container) return;
  
  const text = container.getAttribute('data-lp-tooltip');
  if (!text) return;
  
  let tooltip = document.getElementById('lp-custom-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'lp-custom-tooltip';
    tooltip.className = 'lp-custom-tooltip-style';
    document.body.appendChild(tooltip);
  }
  
  tooltip.innerHTML = `<div class="tooltip-description">${text}</div>`;
  tooltip.style.display = 'block';
  positionTooltip(e, tooltip);
});

document.addEventListener('mousemove', (e) => {
  const tooltip = document.getElementById('lp-custom-tooltip');
  if (tooltip && tooltip.style.display !== 'none') {
    positionTooltip(e, tooltip);
  }
});

document.addEventListener('mouseout', (e) => {
  if (e.target.closest('[data-lp-tooltip]')) {
    const tooltip = document.getElementById('lp-custom-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }
});

function showParticipantTooltip(e, summonerName, tagLine, championName) {
  let tooltip = document.getElementById('participant-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'participant-tooltip';
    tooltip.className = 'participant-custom-tooltip';
    document.body.appendChild(tooltip);
  }

  const fullSummonerName = tagLine ? `${summonerName}<span class="p-tooltip-tag">#${tagLine}</span>` : summonerName;

  tooltip.innerHTML = `
    <div class="p-tooltip-summoner">${fullSummonerName}</div>
    <div class="p-tooltip-champ-name">${formatChampionName(championName)}</div>
  `;

  tooltip.style.display = 'block';
  positionTooltip(e, tooltip);
}

function hideParticipantTooltip() {
  const tooltip = document.getElementById('participant-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Global mouse event listeners for participant tooltips
document.addEventListener('mouseover', (e) => {
  const playerDiv = e.target.closest('.team-player');
  if (!playerDiv) return;

  const summonerName = playerDiv.getAttribute('data-summoner-name');
  const tagLine = playerDiv.getAttribute('data-tag-line') || '';
  const championName = playerDiv.getAttribute('data-champion-name');

  showParticipantTooltip(e, summonerName, tagLine, championName);
});

document.addEventListener('mousemove', (e) => {
  const tooltip = document.getElementById('participant-tooltip');
  if (tooltip && tooltip.style.display !== 'none') {
    positionTooltip(e, tooltip);
  }
});

document.addEventListener('mouseout', (e) => {
  if (e.target.closest('.team-player')) {
    hideParticipantTooltip();
  }
});

function renderQuestSlot(isCompleted, laneKey, match) {
  const questTooltip = QUEST_TOOLTIPS[laneKey] || 'Misión de Carril';
  
  let laneFile = 'jungle';
  if (laneKey === 'TOP') laneFile = 'top';
  else if (laneKey === 'JUNGLE') laneFile = 'jungle';
  else if (laneKey === 'MID' || laneKey === 'MIDDLE') laneFile = 'mid';
  else if (laneKey === 'BOTTOM' || laneKey === 'BOTTOM_CARRY' || laneKey === 'ADC') laneFile = 'bottom';
  else if (laneKey === 'UTILITY' || laneKey === 'BOTTOM_SUPPORT' || laneKey === 'SUPPORT') laneFile = 'utility';
  
  // Lógica reactiva especial para Soporte (UTILITY)
  if (laneFile === 'utility' && isCompleted && match) {
    const itemsList = [
      match.item0, match.item1, match.item2,
      match.item3, match.item4, match.item5,
      match.item6
    ];
    const boundItem = match.roleBoundItem || 0;
    const hasPinkWard = boundItem === 2055 || itemsList.includes(2055); // 2055 es la Control Ward
    
    if (hasPinkWard) {
      const itemUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/2055.png`;
      return `
        <div class="match-item-slot quest-slot completed support-pink-slot filled" data-item-id="2055" data-quest-title="Misión de Soporte Completada: Ranura Especial para Centinela de Control (Activa)" data-quest-completed="true" data-quest-lane="Soporte">
          <img src="${itemUrl}" class="match-quest-img-file completed" alt="Control Ward" />
        </div>
      `;
    } else {
      const imgUrl = '/assets/quests/quest-utility-empty.png';
      return `
        <div class="match-item-slot quest-slot completed support-pink-slot empty-pink" data-quest-title="Misión de Soporte Completada: Ranura Especial para Centinela de Control (Vacía)" data-quest-completed="true" data-quest-lane="Soporte">
          <img src="${imgUrl}" class="match-quest-img-file completed" alt="Ranura Vacía" />
        </div>
      `;
    }
  }

  // Lógica reactiva especial para ADC (BOTTOM)
  if (laneFile === 'bottom' && isCompleted && match) {
    const itemsList = [
      match.item0, match.item1, match.item2,
      match.item3, match.item4, match.item5,
      match.item6
    ];
    const boundItem = match.roleBoundItem || 0;
    const equippedBootId = BOOTS_ITEM_IDS.has(boundItem) ? boundItem : itemsList.find(id => BOOTS_ITEM_IDS.has(id));
    
    if (equippedBootId) {
      const itemUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${equippedBootId}.png`;
      return `
        <div class="match-item-slot quest-slot completed adc-boots-slot filled" data-item-id="${equippedBootId}" data-quest-title="Misión de Bot (ADC) Completada: 7.º Espacio de Objeto para Botas (Activa)" data-quest-completed="true" data-quest-lane="ADC">
          <img src="${itemUrl}" class="match-quest-img-file completed" alt="Boots" />
        </div>
      `;
    } else {
      const imgUrl = '/assets/quests/quest-bottom-empty.png';
      return `
        <div class="match-item-slot quest-slot completed adc-boots-slot empty-boots" data-quest-title="Misión de Bot (ADC) Completada: 7.º Espacio de Objeto para Botas (Vacía)" data-quest-completed="true" data-quest-lane="ADC">
          <img src="${imgUrl}" class="match-quest-img-file completed" alt="Ranura Vacía" />
        </div>
      `;
    }
  }
  
  const imgUrl = `/assets/quests/quest-${laneFile}.png`;
  
  const laneDisplayNames = {
    'TOP': 'Top',
    'JUNGLE': 'Jungla',
    'MID': 'Mid',
    'BOTTOM': 'ADC',
    'UTILITY': 'Soporte'
  };
  const laneName = laneDisplayNames[laneKey] || 'Carril';

  if (!isCompleted) {
    return `
      <div class="match-item-slot quest-slot incomplete" data-quest-title="${questTooltip}: Incompleta (No se cumplieron los requisitos en partida)" data-quest-completed="false" data-quest-lane="${laneName}">
        <img src="${imgUrl}" class="match-quest-img-file grayscale" alt="Incompleta" />
      </div>
    `;
  }
  
  return `
    <div class="match-item-slot quest-slot completed" data-quest-title="${questTooltip}" data-quest-completed="true" data-quest-lane="${laneName}">
      <img src="${imgUrl}" class="match-quest-img-file completed" alt="Completada" />
    </div>
  `;
}

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
let GLOBAL_PLAYERS_LIST = [];
let currentSortMode = 'lp';
let isComparisonMode = false;
let selectedPuuidsForCompare = [];

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
    GLOBAL_PLAYERS_LIST = players;
    renderLadder(players);
    preloadAllLadderSplashes(players);
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
    GLOBAL_PLAYERS_LIST = players;

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
      preloadAllLadderSplashes(players);
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

  // Precalcular el campeón objetivo para el splash en todos los jugadores del ladder
  players.forEach(p => {
    if (!p.splashTargetChamp) {
      let target = getMostPlayedFromHistory(p.matchStatsHistory);
      if (!target && p.topChampions && p.topChampions.length > 0) {
        target = p.topChampions[0].name;
      }
      p.splashTargetChamp = target;
    }
  });

  // Guardar snapshot para el próximo auto-refresh
  players.forEach(p => {
    playerSnapshot.set(p.puuid, {
      history: p.history || [],
      lp: p.lp,
      tier: p.tier,
      rank: p.rank
    });
  });

  // Cálculo de MVPs Globales
  let mvpKdaId = null, mvpFarmId = null, mvpDmgId = null, mvpWrId = null;
  let maxKda = 0, maxFarm = 0, maxDmg = 0, maxWr = 0;
  
  players.forEach(p => {
    const s = p.advancedStats?.soloq;
    if (s && s.totalMatchesCalculated >= 5) {
      const kda = parseFloat(s.kda) || 0;
      const farm = parseFloat(s.csPerMin) || 0;
      const dmg = parseInt(s.avgDamageDealt) || 0;
      
      if (kda > maxKda) { maxKda = kda; mvpKdaId = p.puuid; }
      if (farm > maxFarm) { maxFarm = farm; mvpFarmId = p.puuid; }
      if (dmg > maxDmg) { maxDmg = dmg; mvpDmgId = p.puuid; }
    }
    const wr = parseInt(p.winRate) || 0;
    const totalGames = (parseInt(p.soloQ?.wins) || 0) + (parseInt(p.soloQ?.losses) || 0);
    if (totalGames >= 20 && wr > maxWr) { maxWr = wr; mvpWrId = p.puuid; }
  });

  // Ordenamiento
  let sortedPlayers = [...players];
  if (currentSortMode !== 'lp') {
    sortedPlayers.sort((a, b) => {
      const sa = a.advancedStats?.soloq || {};
      const sb = b.advancedStats?.soloq || {};
      if (currentSortMode === 'wr') return (parseInt(b.winRate)||0) - (parseInt(a.winRate)||0);
      if (currentSortMode === 'kda') return (parseFloat(sb.kda)||0) - (parseFloat(sa.kda)||0);
      if (currentSortMode === 'cs') return (parseFloat(sb.csPerMin)||0) - (parseFloat(sa.csPerMin)||0);
      if (currentSortMode === 'dmg') return (parseInt(sb.avgDamageDealt)||0) - (parseInt(sa.avgDamageDealt)||0);
      return 0;
    });
  }

  sortedPlayers.forEach((player, index) => {
    const rankNum = index + 1;
    const card = document.createElement('div');
    card.className = `player-card rank-${rankNum}`;
    card.dataset.puuid = player.puuid;
    card.style.cursor = 'pointer';

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions')) return;
      if (isComparisonMode) {
        handleComparisonCardSelection(player.puuid, card);
      } else {
        openPlayerDetails(player);
      }
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


    // Top Campeones HTML (Sincronizado con Detalle del Jugador: Prioriza más jugados en Solo Q + Winrate)
    const champsToDisplay = getTopChampsToDisplay(player);


    const topChampsHtml = champsToDisplay.map(champ => {
      const champKey = cleanChampId(champ.name);
      let champTitle = '';
      if (CHAMPION_SKINS_DATA) {
        const foundKey = Object.keys(CHAMPION_SKINS_DATA).find(
          k => k.toLowerCase() === (champKey ? champKey.toLowerCase() : '')
        );
        if (foundKey && CHAMPION_SKINS_DATA[foundKey]) {
          champTitle = CHAMPION_SKINS_DATA[foundKey].title || '';
        }
      }
      const displayTitle = champTitle ? champTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';
      const formattedPoints = champ.points ? Number(champ.points).toLocaleString() + ' PTS' : '';

      return `
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
              ${displayTitle ? `<div class="m-champ-title">${displayTitle}</div>` : ''}
              <div class="m-stats">
                <div class="m-stat-row">
                  <span class="m-label">Nivel</span>
                  <span class="m-value">${champ.level}</span>
                </div>
                ${formattedPoints ? `
                <div class="m-stat-row">
                  <span class="m-label">Puntos</span>
                  <span class="m-value-sub">${formattedPoints}</span>
                </div>` : ''}
                ${champ.recentCount !== undefined ? `
                <div class="m-stat-row" style="margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 4px;">
                  <span class="m-label">Partidas Recientes</span>
                  <span class="m-value" style="color: #fff;">${champ.recentCount}</span>
                </div>
                <div class="m-stat-row">
                  <span class="m-label">Winrate Reciente</span>
                  <span class="m-value" style="color: ${champ.winRate >= 50 ? '#22c55e' : '#ef4444'}; font-weight: 800;">${champ.winRate}%</span>
                </div>
                <div class="m-stat-row">
                  <span class="m-label">KDA Promedio</span>
                  <span class="m-value" style="color: ${champ.kdaColor}; font-weight: 800;">${champ.kdaRatio}</span>
                </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    let mvpBadges = '';
    if (player.puuid === mvpKdaId && maxKda > 0) mvpBadges += `<div class="mvp-badge kda" data-mvp-tooltip="Mejor KDA de La Jauría (${maxKda.toFixed(2)})"><img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/3031.png" class="mvp-item-icon" onerror="this.src='/assets/placeholder_champ.png'"> El Verdugo</div>`;
    else if (player.puuid === mvpFarmId && maxFarm > 0) mvpBadges += `<div class="mvp-badge farm" data-mvp-tooltip="Mejor Farmeador (${maxFarm.toFixed(1)} CS/min)"><img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/1083.png" class="mvp-item-icon" onerror="this.src='/assets/placeholder_champ.png'"> Señor del Farmeo</div>`;
    else if (player.puuid === mvpDmgId && maxDmg > 0) mvpBadges += `<div class="mvp-badge dmg" data-mvp-tooltip="Mayor Daño Infligido Promedio (${maxDmg.toLocaleString()})"><img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/3089.png" class="mvp-item-icon" onerror="this.src='/assets/placeholder_champ.png'"> Arma de Destrucción</div>`;
    else if (player.puuid === mvpWrId && maxWr > 0) mvpBadges += `<div class="mvp-badge wr" data-mvp-tooltip="Mejor Win Rate sostenido (${maxWr}%)"><img src="/assets/estetica/corona.png" class="mvp-item-icon"> El Invicto</div>`;

    card.innerHTML = `
      ${mvpBadges}
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
        <button class="btn-refresh-card" onclick="refreshPlayer('${player.gameName}', '${player.tagLine}', '${player.region}', '${player.puuid}')" title="Actualizar datos">
          <span class="refresh-icon">↻</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

// Cooldown de 5 min por jugador para el botón de refresh
const refreshCooldowns = new Map(); // clave: puuid o gameName → timestamp del último refresh
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

// Lógica de Actualización Manual
async function refreshPlayer(gameName, tagLine, region, puuid) {
  const now = Date.now();
  const cooldownKey = puuid || gameName;
  const lastRefresh = refreshCooldowns.get(cooldownKey);
  if (lastRefresh && (now - lastRefresh) < REFRESH_COOLDOWN_MS) {
    const remaining = Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefresh)) / 60000);
    showToast(`⏳ Espera ${remaining} min antes de actualizar a ${gameName} de nuevo.`, 'error');
    return;
  }

  try {
    startLoadingBar();
    refreshCooldowns.set(cooldownKey, now);
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
      refreshCooldowns.delete(cooldownKey);
      showToast(result.message || 'Error al actualizar', 'error');
    }
  } catch (error) {
    refreshCooldowns.delete(cooldownKey);
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

function openUntrackedPlayerLoader() {
  const modal = document.getElementById('player-details-modal');
  const loader = document.getElementById('details-modal-loader');
  if (modal && loader) {
    loader.classList.add('active');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

async function handleParticipantClick(puuid, summonerName, element) {
  // 1. Si está en nuestra jauría, cargarlo de forma instantánea
  const trackedPlayer = GLOBAL_PLAYERS_LIST.find(p => p.puuid === puuid);
  if (trackedPlayer) {
    if (element) element.classList.add('loading-click');
    const modal = document.getElementById('player-details-modal');
    
    // Guardar en el historial de navegación si el modal ya estaba abierto y es otro jugador
    if (modal && modal.classList.contains('active') && activePlayerDetails && activePlayerDetails.puuid !== trackedPlayer.puuid) {
      profileNavigationStack.push(activePlayerDetails);
    }
    
    setTimeout(() => {
      if (element) element.classList.remove('loading-click');
      openPlayerDetails(trackedPlayer);
    }, 100);
    return;
  }

  // Verificar si hay enfriamiento activo antes de consultar a Riot
  if (riotRequestCooldownActive) {
    showToast('⏳ Por favor, espera a que termine el enfriamiento de Riot.', 'info');
    return;
  }

  // 2. Si es externo, abrir el modal en estado de carga
  if (element) element.classList.add('loading-click');
  if (typeof startLoadingBar === 'function') startLoadingBar();
  
  // Guardar en el historial de navegación si el modal ya estaba abierto y es otro jugador
  const modal = document.getElementById('player-details-modal');
  if (modal && modal.classList.contains('active') && activePlayerDetails && activePlayerDetails.puuid !== puuid) {
    profileNavigationStack.push(activePlayerDetails);
  }
  
  openUntrackedPlayerLoader();

  try {
    const response = await fetch(`${API_BASE}/summoners/untracked/${puuid}?region=la1`);
    if (!response.ok) throw new Error('Error al obtener perfil en tiempo real');
    
    const untrackedPlayer = await response.json();
    openPlayerDetails(untrackedPlayer);
  } catch (error) {
    console.error(error);
    if (typeof activateRiotCooldown === 'function') activateRiotCooldown();
    const modalEl = document.getElementById('player-details-modal');
    const loader = document.getElementById('details-modal-loader');
    if (loader) loader.classList.remove('active');
    if (modalEl) {
      modalEl.classList.remove('active');
      document.body.style.overflow = '';
    }
  } finally {
    if (element) element.classList.remove('loading-click');
    if (typeof finishLoadingBar === 'function') finishLoadingBar();
  }
}

// Hacer funciones disponibles globalmente para los onclick de los strings HTML
window.openDeleteModal = openDeleteModal;
window.handleParticipantClick = handleParticipantClick;

// Variable global para rastrear modal e historial de navegación
let currentModalPuuid = null;
let profileNavigationStack = [];
let riotRequestCooldownActive = false;

function activateRiotCooldown() {
  if (riotRequestCooldownActive) return;
  riotRequestCooldownActive = true;
  showToast('⏳ Enfriamiento de 1 min activo por error de comunicación con Riot.', 'error');
  setTimeout(() => {
    riotRequestCooldownActive = false;
    showToast('✅ El enfriamiento de Riot ha finalizado. Puedes consultar de nuevo.', 'success');
  }, 60000);
}

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

// Formateo estético de nombres de campeones (100% Estable)
function formatChampionName(name) {
  if (!name) return '';
  const specialMap = {
    'TwistedFate': 'Twisted Fate',
    'KogMaw': "Kog'Maw",
    'MissFortune': 'Miss Fortune',
    'DrMundo': 'Dr. Mundo',
    'TahmKench': 'Tahm Kench',
    'AurelionSol': 'Aurelion Sol',
    'XinZhao': 'Xin Zhao',
    'LeeSin': 'Lee Sin',
    'MasterYi': 'Master Yi',
    'Nunu': 'Nunu & Willump',
    'RekSai': "Rek'Sai",
    'VelKoz': "Vel'Koz",
    'BelVeth': "Bel'Veth",
    'JarvanIV': 'Jarvan IV',
    'Renata': 'Renata Glasc',
    'MonkeyKing': 'Wukong',
    'Kaisa': "Kai'Sa",
    'ChoGath': "Cho'Gath",
    'FiddleSticks': 'Fiddlesticks',
    'Heimerdinger': 'Heimerdinger'
  };
  if (specialMap[name]) return specialMap[name];
  return name.replace(/([A-Z])/g, ' $1').trim();
}

window.formatChampionName = formatChampionName;

// Función para obtener los campeones para mostrar (Sincronizado)
function getTopChampsToDisplay(player) {
  const soloQMatchesDetailed = (player.matchStatsHistory || [])
    .filter(m => (m.queueId === 420 || m.queueType === 'RANKED_SOLO_5x5') && !m.isRemake);
  
  let champsToDisplay = [];
  
  if (soloQMatchesDetailed.length > 0) {
    const stats = {};
    soloQMatchesDetailed.forEach(m => {
      const name = m.championName;
      if (name && name !== 'Unknown') {
        if (!stats[name]) stats[name] = { count: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
        stats[name].count++;
        if (m.win) stats[name].wins++;
        stats[name].kills += m.kills || 0;
        stats[name].deaths += m.deaths || 0;
        stats[name].assists += m.assists || 0;
      }
    });
    
    const sorted = Object.entries(stats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
      
    champsToDisplay = sorted.map(([name, data]) => {
      const mastery = (player.topChampions || []).find(c => c.name === name);
      const wr = Math.round((data.wins / data.count) * 100);
      
      const avgKills = (data.kills / data.count).toFixed(1);
      const avgDeaths = (data.deaths / data.count).toFixed(1);
      const avgAssists = (data.assists / data.count).toFixed(1);
      
      const kdaRatioVal = data.deaths > 0 
        ? ((data.kills + data.assists) / data.deaths)
        : (data.kills + data.assists);
      const kdaRatio = kdaRatioVal.toFixed(2);
      
      let kdaColor = '#94a3b8';
      if (kdaRatioVal >= 4.0) kdaColor = '#ff9f43';
      else if (kdaRatioVal >= 3.0) kdaColor = '#a855f7';
      else if (kdaRatioVal >= 2.0) kdaColor = '#38bdf8';
      else if (kdaRatioVal > 0) kdaColor = '#ef4444';
      
      return {
        name: name,
        level: mastery ? mastery.level : 0,
        points: mastery ? mastery.points : 0,
        recentCount: data.count,
        wins: data.wins,
        losses: data.count - data.wins,
        winRate: wr,
        avgKills,
        avgDeaths,
        avgAssists,
        kdaRatio,
        kdaColor
      };
    });
  }
  
  if (champsToDisplay.length === 0) {
    champsToDisplay = (player.topChampions || []).slice(0, 3);
  }
  return champsToDisplay;
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



// Opciones de carga del splash art (CDN oficial y DDragon)
const CDN_LOADING = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading`;

// Helper para obtener URL de skin aleatoria
async function getChampionSkinUrl(champName, lastSkinNum = null) {
  const champId = cleanChampId(champName);
  const defaultUrl = `${CDN_LOADING}/${champId}_0.jpg`;

  try {
    const resp = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/en_US/champion/${champId}.json`);
    if (!resp.ok) return { url: defaultUrl, num: 0 };
    
    const data = await resp.json();
    const championData = data.data[champId];
    if (!championData) return { url: defaultUrl, num: 0 };

    const skins = championData.skins;
    const validSkins = skins.filter(s => !s.name.includes('(') && !s.name.toLowerCase().includes('chroma'));
    
    if (validSkins.length === 0) return { url: defaultUrl, num: 0 };

    // Intentar elegir una skin distinta a la anterior
    const otherSkins = validSkins.filter(s => s.num !== lastSkinNum);
    const pool = otherSkins.length > 0 ? otherSkins : validSkins;
    const selected = pool[Math.floor(Math.random() * pool.length)];

    return {
      url: `${CDN_LOADING}/${champId}_${selected.num}.jpg`,
      num: selected.num
    };
  } catch (err) {
    return { url: defaultUrl, num: 0 };
  }
}

// Precargar splash art de un jugador específico en memoria
async function preloadSplashForPlayer(player, forceNew = false) {
  let target = player.splashTargetChamp;
  if (!target) {
    target = getMostPlayedFromHistory(player.matchStatsHistory);
    if (!target && player.topChampions && player.topChampions.length > 0) {
      target = player.topChampions[0].name;
    }
    player.splashTargetChamp = target;
  }
  if (!target) return;

  const current = PRELOADED_SPLASHES.get(player.puuid);
  const lastNum = forceNew && current ? current.num : null;

  const skinInfo = await getChampionSkinUrl(target, lastNum);

  // Precargar en caché del navegador
  const img = new Image();
  img.onload = () => {
    PRELOADED_SPLASHES.set(player.puuid, skinInfo);
  };
  img.src = skinInfo.url;
}

// Precarga progresiva de todos los splash arts de los jugadores del ladder
function preloadAllLadderSplashes(players) {
  if (!players || players.length === 0) return;
  
  players.forEach((player, index) => {
    setTimeout(() => {
      preloadSplashForPlayer(player, false);
    }, 50 * index);
  });
}

// Aplicar el splash art al contenedor cuando se abre el modal de detalles
async function applyPlayerSplash(player) {
  const bgEl = document.getElementById('dash-left-bg');
  if (!bgEl) return;

  let target = player.splashTargetChamp;
  if (!target) {
    target = getMostPlayedFromHistory(player.matchStatsHistory);
    if (!target && player.topChampions && player.topChampions.length > 0) {
      target = player.topChampions[0].name;
    }
    player.splashTargetChamp = target;
  }
  if (!target) return;

  const champId = cleanChampId(target);
  if (!champId) return;

  // Si ya está precargado en memoria, usarlo directamente
  const preloaded = PRELOADED_SPLASHES.get(player.puuid);
  if (preloaded) {
    bgEl.style.backgroundImage = `url('${preloaded.url}')`;
    bgEl.classList.remove('loading');
    updateRegionBackground(champId);
    return;
  }

  // Carga al vuelo (si el usuario hizo clic muy rápido)
  bgEl.classList.add('loading');
  const skinInfo = await getChampionSkinUrl(target);
  
  bgEl.style.backgroundImage = `url('${skinInfo.url}')`;
  bgEl.classList.remove('loading');
  updateRegionBackground(champId);

  // Guardar en la caché global en memoria
  PRELOADED_SPLASHES.set(player.puuid, skinInfo);
}

// Limpiar splash art del DOM al cerrar y precargar uno nuevo en memoria
function closePlayerDetailsSplash(player) {
  const bgEl = document.getElementById('dash-left-bg');
  if (bgEl) {
    bgEl.style.backgroundImage = 'none';
    bgEl.classList.add('loading');
  }
  if (player) {
    preloadSplashForPlayer(player, true);
  }
}

function openPlayerDetails(player) {
  // Ocultar loader de carga en tiempo real si está activo
  const loader = document.getElementById('details-modal-loader');
  if (loader) loader.classList.remove('active');

  const modal = document.getElementById('player-details-modal');

  // Si el modal NO estaba abierto, vaciamos el historial de navegación
  if (modal && !modal.classList.contains('active')) {
    profileNavigationStack = [];
  }

  // Resetear el scroll al inicio (arriba del todo)
  const historyContainer = document.getElementById('detail-match-history');
  if (historyContainer) historyContainer.scrollTop = 0;
  if (modal) modal.scrollTop = 0;

  visibleMatchesCount = 10; // Resetear la paginación a 10 partidas al abrir cualquier perfil
  hasReachedHistoryEnd = false; // Resetear bandera de fin de historial
  activePlayerDetails = player; // Guardar referencia al jugador activo
  currentModalPuuid = player.puuid;

  // Ocultar el logo de la jauría si es un jugador externo (untracked)
  const logo = modal.querySelector('.detail-modal-logo');
  if (logo) {
    logo.style.display = player.isUntracked ? 'none' : 'block';
  }

  // Determinar campeón objetivo (Usa el precalculado o lo calcula en caliente como fallback)
  let target = player.splashTargetChamp;
  if (!target) {
    target = getMostPlayedFromHistory(player.matchStatsHistory);
    if (!target && player.topChampions && player.topChampions.length > 0) {
      target = player.topChampions[0].name;
    }
    player.splashTargetChamp = target;
  }
  applyPlayerSplash(player);

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
          const safeTopChamp = escapeHtml(topChamp);
          otpContainer.innerHTML = `
            <div class="badge-otp" title="¡Este jugador es un especialista con ${safeTopChamp}!">
              <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${encodeURIComponent(topChamp)}.png" class="otp-mini-icon" alt="${safeTopChamp}" />
              <span>OTP ${safeTopChamp}</span>
            </div>`;
        }
      }


  // BUG-11 fix: Removed dead code — W/L is calculated per queue inside renderQueueStats

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
  const champsToDisplay = getTopChampsToDisplay(player);
  let isRecent = (player.matchStatsHistory || []).filter(m => (m.queueId === 420 || m.queueType === 'RANKED_SOLO_5x5') && !m.isRemake).length > 0;


  const champsTitleElement = document.getElementById('detail-champs-title');
  if (champsTitleElement) {
    if (isRecent) {
      champsTitleElement.textContent = 'Campeones más jugados';
    } else {
      champsTitleElement.textContent = 'Campeones con más maestrías';
    }
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
        <div class="champ-detail-item m-lvl-${champ.level} ${champ.level >= 8 ? 'm-lvl-high' : ''}">
          <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champ.name}.png" class="champ-detail-icon" onerror="this.src='/assets/placeholder_champ.png'" />
          ${champ.level >= 1 
            ? `<img src="${crestUrl}" class="champ-detail-crest" onerror="this.style.display='none'" />` 
            : `<div class="champ-detail-crest-locked" title="Sin maestría">
                <svg viewBox="0 0 64 64" class="crest-locked-svg">
                  <polygon points="32,8 52,18 52,46 32,56 12,46 12,18" class="crest-locked-shield" />
                  <path d="M26,30 V24 A6,6 0 0,1 38,24 V30 M24,30 H40 V42 H24 Z" class="crest-locked-padlock" />
                  <circle cx="32" cy="36" r="1.5" class="crest-locked-keyhole" />
                </svg>
               </div>`}
          <div class="champ-detail-info">
            <div class="champ-detail-name">${formatChampionName(champ.name)}</div>
            <div class="champ-detail-pts">${subText}</div>
            ${champ.kdaRatio !== undefined ? `
              <div class="champ-detail-kda" style="font-size: 0.72rem; color: rgba(255,255,255,0.85); font-weight: 700; margin-top: 5px; font-family: 'Outfit', sans-serif; letter-spacing: 0.3px;">
                <span style="color: ${champ.kdaColor}; font-weight: 900;">${champ.kdaRatio}</span> KDA
                <span style="font-size: 0.62rem; color: rgba(255,255,255,0.45); font-weight: 500; margin-left: 2px;">(${champ.avgKills}/${champ.avgDeaths}/${champ.avgAssists})</span>
              </div>
            ` : ''}
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
    const filteredMatches = (player.matchStatsHistory || []).filter(match => {
      if (currentQueue === 'soloq') {
        return match.queueId == 420; // BUG-07 fix: solo incluir si explícitamente es SoloQ
      } else if (currentQueue === 'flexq') {
        return match.queueId == 440;
      }
      return true;
    });

    const activeMatches = filteredMatches.filter(m => !m.isRemake);
    const totalGames = activeMatches.length;

    if (totalGames > 0) {
      let sumKills = 0, sumDeaths = 0, sumAssists = 0;
      let sumGold = 0, sumDuration = 0, sumDamageDealt = 0, sumDamageTaken = 0;
      let sumKp = 0, carryGames = 0;

      let maxDamageDealt = 0, maxDamageDealtChamp = 'N/A';
      let maxKills = 0, maxKillsChamp = 'N/A';
      let maxCs = 0, maxCsChamp = 'N/A';
      let bestSingleKdaVal = -1, bestSingleKdaStr = '0/0/0', bestSingleKdaChamp = 'N/A';

      activeMatches.forEach(m => {
        sumKills += m.kills || 0;
        sumDeaths += m.deaths || 0;
        sumAssists += m.assists || 0;
        sumGold += m.gold || 0;
        sumDuration += m.durationMins || 0;
        sumDamageDealt += m.damageDealt || 0;
        sumDamageTaken += m.damageTaken || 0;
        sumKp += m.kp || 0;

        const kda = m.deaths > 0 ? (m.kills + m.assists) / m.deaths : (m.kills + m.assists);
        if (m.win && (kda >= 3.0 || m.kp >= 0.55)) {
          carryGames++;
        }

        // Calcular récords individuales de esta partida
        const mDamage = m.damageDealt || 0;
        if (mDamage > maxDamageDealt) {
          maxDamageDealt = mDamage;
          maxDamageDealtChamp = m.championName || 'N/A';
        }

        const mKills = m.kills || 0;
        if (mKills > maxKills) {
          maxKills = mKills;
          maxKillsChamp = m.championName || 'N/A';
        }

        const mCs = m.cs || 0;
        if (mCs > maxCs) {
          maxCs = mCs;
          maxCsChamp = m.championName || 'N/A';
        }

        if (kda > bestSingleKdaVal) {
          bestSingleKdaVal = kda;
          bestSingleKdaStr = `${m.kills || 0}/${m.deaths || 0}/${m.assists || 0}`;
          bestSingleKdaChamp = m.championName || 'N/A';
        }
      });

      const avgKills = (sumKills / totalGames).toFixed(1);
      const avgDeaths = (sumDeaths / totalGames).toFixed(1);
      const avgAssists = (sumAssists / totalGames).toFixed(1);
      const avgDuration = (sumDuration / totalGames).toFixed(1);
      const gpm = sumDuration > 0 ? Math.round(sumGold / sumDuration) : 0;
      const dpm = sumDuration > 0 ? Math.round(sumDamageDealt / sumDuration) : 0;
      // Si kp ya viene como ratio (0-1) lo multiplicamos, si viene como % (>1) lo dejamos
      const rawAvgKp = sumKp / totalGames;
      const avgKp = rawAvgKp > 1 ? Math.round(rawAvgKp) : Math.round(rawAvgKp * 100);
      const carryRate = Math.round((carryGames / totalGames) * 100);

      // Calcular CS/Min
      let totalCs = 0;
      activeMatches.forEach(m => { totalCs += m.cs || 0; });
      const csPerMin = sumDuration > 0 ? (totalCs / sumDuration).toFixed(1) : '0.0';

      // Calcular KDA Ratio general del historial
      const kdaVal = sumDeaths > 0 ? ((sumKills + sumAssists) / sumDeaths) : (sumKills + sumAssists);
      const kdaStr = kdaVal.toFixed(2);

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

      kdaTitle.innerHTML = `<span class="kda-num" style="color: ${kdaColor}; font-size: 2.0rem; font-weight: 900; text-shadow: 0 0 15px ${kdaColor}33; font-family: 'Outfit', sans-serif;">${kdaStr}</span> <span class="kda-label" style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px;">KDA</span> <span class="kda-badge" style="background: ${kdaColor}15; border: 1px solid ${kdaColor}33; color: ${kdaColor}; font-size: 0.65rem; font-weight: 900; padding: 2px 8px; border-radius: 6px; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">${kdaRating}</span>`;

      // Inyectar en elementos HTML de las 6 tarjetas avanzadas
      document.getElementById('stat-kda-avg').innerHTML = `<span style="color: #22c55e;">${avgKills}</span> <span style="color: rgba(255,255,255,0.2);">/</span> <span style="color: #ef4444;">${avgDeaths}</span> <span style="color: rgba(255,255,255,0.2);">/</span> <span style="color: #38bdf8;">${avgAssists}</span>`;
      document.getElementById('stat-cs').textContent = csPerMin;
      document.getElementById('stat-kp').textContent = `${avgKp}%`;
      document.getElementById('stat-gpm').textContent = gpm;
      document.getElementById('stat-dpm').textContent = dpm;
      document.getElementById('stat-carry').textContent = `${carryRate}%`;

      // Inyectar en elementos HTML de Récords Recientes
      document.getElementById('record-dmg').textContent = maxDamageDealt > 0 ? maxDamageDealt.toLocaleString('es-ES') : '--';
      document.getElementById('record-dmg-champ').textContent = maxDamageDealtChamp !== 'N/A' ? formatChampionName(maxDamageDealtChamp) : '--';

      document.getElementById('record-kills').textContent = maxKills > 0 ? `${maxKills} Kills` : '--';
      document.getElementById('record-kills-champ').textContent = maxKillsChamp !== 'N/A' ? formatChampionName(maxKillsChamp) : '--';

      document.getElementById('record-cs').textContent = maxCs > 0 ? `${maxCs} CS` : '--';
      document.getElementById('record-cs-champ').textContent = maxCsChamp !== 'N/A' ? formatChampionName(maxCsChamp) : '--';

      document.getElementById('record-kda').textContent = bestSingleKdaVal >= 0 ? bestSingleKdaStr : '--';
      document.getElementById('record-kda-champ').textContent = bestSingleKdaChamp !== 'N/A' ? formatChampionName(bestSingleKdaChamp) : '--';

    } else if (stats && stats.avgGold !== undefined) {
      // Fallback si no hay partidas detalladas en historial
      const kdaVal = parseFloat(stats.kda) || 0.0;
      let kdaColor = '#94a3b8';
      let kdaRating = 'Normal';
      if (kdaVal >= 4.0) {
        kdaColor = '#ff9f43';
        kdaRating = '¡LEYENDA!';
      } else if (kdaVal >= 3.0) {
        kdaColor = '#a855f7';
        kdaRating = 'Excelente';
      } else if (kdaVal >= 2.0) {
        kdaColor = '#38bdf8';
        kdaRating = 'Sólido';
      } else if (kdaVal > 0) {
        kdaColor = '#ef4444';
        kdaRating = 'Mejorable';
      }

      kdaTitle.innerHTML = `<span class="kda-num" style="color: ${kdaColor}; font-size: 2.0rem; font-weight: 900; text-shadow: 0 0 15px ${kdaColor}33; font-family: 'Outfit', sans-serif;">${stats.kda}</span> <span class="kda-label" style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px;">KDA</span> <span class="kda-badge" style="background: ${kdaColor}15; border: 1px solid ${kdaColor}33; color: ${kdaColor}; font-size: 0.65rem; font-weight: 900; padding: 2px 8px; border-radius: 6px; margin-left: 8px; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">${kdaRating}</span>`;

      const fKills = stats.avgKills || '0';
      const fDeaths = stats.avgDeaths || '0';
      const fAssists = stats.avgAssists || '0';
      document.getElementById('stat-kda-avg').innerHTML = `<span style="color: #22c55e;">${fKills}</span> <span style="color: rgba(255,255,255,0.2);">/</span> <span style="color: #ef4444;">${fDeaths}</span> <span style="color: rgba(255,255,255,0.2);">/</span> <span style="color: #38bdf8;">${fAssists}</span>`;
      document.getElementById('stat-cs').textContent = stats.csPerMin || '--';
      document.getElementById('stat-kp').textContent = `${stats.avgKp || '--'}%`;
      document.getElementById('stat-gpm').textContent = '--';
      document.getElementById('stat-dpm').textContent = '--';
      document.getElementById('stat-carry').textContent = '--';

      document.getElementById('record-dmg').textContent = '--';
      document.getElementById('record-dmg-champ').textContent = '--';
      document.getElementById('record-kills').textContent = '--';
      document.getElementById('record-kills-champ').textContent = '--';
      document.getElementById('record-cs').textContent = '--';
      document.getElementById('record-cs-champ').textContent = '--';
      document.getElementById('record-kda').textContent = '--';
      document.getElementById('record-kda-champ').textContent = '--';
    } else {
      kdaTitle.innerHTML = `<span class="kda-num" style="color: #94a3b8; font-size: 2.0rem; font-weight: 900; font-family: 'Outfit', sans-serif;">0.00</span> <span class="kda-label" style="font-size: 0.8rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px;">KDA</span>`;
      document.getElementById('stat-kda-avg').textContent = 'N/A';
      document.getElementById('stat-cs').textContent = 'N/A';
      document.getElementById('stat-kp').textContent = 'N/A';
      document.getElementById('stat-gpm').textContent = 'N/A';
      document.getElementById('stat-dpm').textContent = 'N/A';
      document.getElementById('stat-carry').textContent = 'N/A';

      document.getElementById('record-dmg').textContent = 'N/A';
      document.getElementById('record-dmg-champ').textContent = 'N/A';
      document.getElementById('record-kills').textContent = 'N/A';
      document.getElementById('record-kills-champ').textContent = 'N/A';
      document.getElementById('record-cs').textContent = 'N/A';
      document.getElementById('record-cs-champ').textContent = 'N/A';
      document.getElementById('record-kda').textContent = 'N/A';
      document.getElementById('record-kda-champ').textContent = 'N/A';
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
          return match.queueId == 420;
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

  // =============================================
  // DETALLES EXPANDIDOS DE PARTIDA (10 JUGADORES)
  // =============================================
  function renderExpandedMatch(matchEl, match) {
    try {
      console.log('[EXP] renderExpandedMatch called', { matchId: match.matchId, participants: match.participants?.length });
    // Toggle: si ya está expandido, colapsar
    const existing = matchEl.nextElementSibling;
    if (existing && existing.classList.contains('match-expanded')) {
      existing.classList.remove('open');
      matchEl.classList.remove('expanded');
      setTimeout(() => existing.remove(), 300);
      return;
    }

    // Cerrar cualquier otra expansión abierta
    document.querySelectorAll('.match-expanded.open').forEach(el => {
      el.previousElementSibling?.classList.remove('expanded');
      el.classList.remove('open');
      setTimeout(() => el.remove(), 300);
    });

    const participants = match.participants || [];
    if (participants.length === 0) {
      return; // Sin datos de participantes
    }

    // Separar equipos
    const team1 = participants.filter(p => p.teamId === 100);
    const team2 = participants.filter(p => p.teamId === 200);
    const allTeam1 = team1.length > 0 ? team1 : participants.slice(0, 5);
    const allTeam2 = team2.length > 0 ? team2 : participants.slice(5, 10);

    // Calcular MVP: mejor score ponderado entre los 10 jugadores
    const hasDetailedData = participants.some(p => p.kills !== undefined);
    let mvpPuuid = null;
    if (hasDetailedData) {
      let bestScore = -1;
      participants.forEach(p => {
        const k = p.kills || 0;
        const d = p.deaths || 0;
        const a = p.assists || 0;
        const dmg = p.damageDealt || 0;
        const score = ((k * 3) + (a * 1.5)) / Math.max(d, 1) + (dmg / 5000);
        if (score > bestScore) {
          bestScore = score;
          mvpPuuid = p.puuid;
        }
      });
    }

    // Máximo daño para la barra de proporción
    const maxDmg = hasDetailedData ? Math.max(...participants.map(p => p.damageDealt || 0), 1) : 1;

    const renderExpandedRow = (p) => {
      const isMe = p.puuid === currentModalPuuid;
      const isMvp = p.puuid === mvpPuuid;
      const champIcon = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${p.championName}.png`;
      const k = p.kills ?? '—';
      const d = p.deaths ?? '—';
      const a = p.assists ?? '—';
      const dmg = p.damageDealt;
      const dmgStr = dmg !== undefined ? (dmg).toLocaleString('es-ES') : '—';
      const dmgPct = dmg !== undefined ? Math.round((dmg / maxDmg) * 100) : 0;
      const goldStr = p.gold !== undefined ? (p.gold).toLocaleString('es-ES') : '—';
      const csStr = p.cs !== undefined ? p.cs : '—';
      const vsStr = p.visionScore !== undefined ? p.visionScore : '—';
      const lvl = p.champLevel ?? '';
      const name = p.summonerName || 'Desconocido';

      // Items mini
      const items = [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6];
      const itemsHtml = items.map(id => {
        if (!id || id === 0) return `<div class="exp-item-slot empty"></div>`;
        return `<img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/item/${id}.png" class="exp-item-img" onerror="this.style.opacity='0'" />`;
      }).join('');

      return `
        <tr class="exp-row ${isMe ? 'exp-row-me' : ''} ${isMvp ? 'exp-row-mvp' : ''}">
          <td class="exp-champ-cell">
            <div class="exp-champ-wrapper">
              <img src="${champIcon}" class="exp-champ-icon" onerror="this.onerror=null; this.src='https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png';" />
              <span class="exp-champ-level">${lvl}</span>
            </div>
          </td>
          <td class="exp-name-cell">
            <span class="exp-name ${isMe ? 'exp-name-me' : ''}">${escapeHtml(name)}</span>
            ${isMvp ? '<span class="exp-mvp-badge">★ MVP</span>' : ''}
          </td>
          <td class="exp-kda-cell"><span class="exp-k">${k}</span> / <span class="exp-d">${d}</span> / <span class="exp-a">${a}</span></td>
          <td class="exp-dmg-cell">
            <div class="exp-dmg-bar-container">
              <div class="exp-dmg-bar" style="width: ${dmgPct}%"></div>
              <span class="exp-dmg-text">${dmgStr}</span>
            </div>
          </td>
          <td class="exp-gold-cell">${goldStr}</td>
          <td class="exp-cs-cell">${csStr}</td>
          <td class="exp-items-cell"><div class="exp-items-row">${itemsHtml}</div></td>
          <td class="exp-vision-cell">${vsStr}</td>
        </tr>
      `;
    };

    const team1Won = allTeam1.length > 0 && allTeam1[0].win;
    const team2Won = allTeam2.length > 0 && allTeam2[0].win;

    const expandedHtml = `
      <div class="match-expanded">
        <table class="exp-table">
          <thead>
            <tr class="exp-header">
              <th></th><th>Jugador</th><th>KDA</th><th>Daño</th><th>Oro</th><th>CS</th><th>Ítems</th><th>Visión</th>
            </tr>
          </thead>
          <tbody>
            <tr class="exp-team-divider">
              <td colspan="8">
                <span class="exp-team-label ${team1Won ? 'team-win' : 'team-loss'}">${team1Won ? 'VICTORIA' : 'DERROTA'} — Equipo Azul</span>
              </td>
            </tr>
            ${allTeam1.map(renderExpandedRow).join('')}
            <tr class="exp-team-divider">
              <td colspan="8">
                <span class="exp-team-label ${team2Won ? 'team-win' : 'team-loss'}">${team2Won ? 'VICTORIA' : 'DERROTA'} — Equipo Rojo</span>
              </td>
            </tr>
            ${allTeam2.map(renderExpandedRow).join('')}
          </tbody>
        </table>
      </div>
    `;

    matchEl.insertAdjacentHTML('afterend', expandedHtml);
    matchEl.classList.add('expanded');

    // Trigger animation
    requestAnimationFrame(() => {
      const panel = matchEl.nextElementSibling;
      if (panel) panel.classList.add('open');
    });
    } catch (err) {
      console.error('[EXP] Error in renderExpandedMatch:', err);
      if (typeof showToast === 'function') {
        showToast('Error al expandir detalles de la partida. Revisa la consola.', 'error');
      }
    }
  }

  // Render Historial de Partidas
  function renderHistory(history, queueType, isAppend = false) {
    const historyContainer = document.getElementById('detail-match-history');
    
    // Guardar el historial completo en variables globales para scroll infinito
    currentHistory = history || [];
    currentQueueType = queueType;
    
    if (!isAppend) {
      historyContainer.innerHTML = '';
    }
    
    if (history && history.length > 0) {
      const filteredHistory = history.filter(match => {
        if (queueType === 'soloq') {
          return match.queueId == 420;
        } else if (queueType === 'flexq') {
          return match.queueId == 440;
        }
        return true;
      });

      if (filteredHistory.length === 0) {
        if (!isAppend) {
          historyContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 0.9rem;">No hay partidas recientes guardadas para esta cola.</div>';
        }
        return;
      }

      // Rebanar el historial según la paginación activa
      const startIdx = isAppend ? Math.max(0, visibleMatchesCount - 5) : 0;
      const slicedHistory = filteredHistory.slice(startIdx, visibleMatchesCount);

      // Agrupar partidas por día
      const grouped = [];
      let lastDateStr = "";

      slicedHistory.forEach(match => {
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
        // Buscar si ya existe el separador de fecha para esta fecha
        let separatorEl = historyContainer.querySelector(`.date-separator[data-date="${group.date}"]`);
        
        if (!separatorEl) {
          const separatorHtml = `
            <div class="date-separator" data-date="${group.date}" data-wins="${group.wins}" data-losses="${group.losses}">
              <span class="ds-date">${group.date}</span>
              <span class="ds-date-total">(${group.wins + group.losses} partidas)</span>
              <div class="ds-line"></div>
              <div class="ds-badges">
                <span class="ds-text win">${group.wins} win</span>
                <span class="ds-text-bullet">•</span>
                <span class="ds-text loss">${group.losses} loss</span>
              </div>
            </div>
          `;
          historyContainer.insertAdjacentHTML('beforeend', separatorHtml);
        } else {
          // Si ya existe, actualizamos los wins y losses acumulados
          const currentWins = parseInt(separatorEl.getAttribute('data-wins') || 0) + group.wins;
          const currentLosses = parseInt(separatorEl.getAttribute('data-losses') || 0) + group.losses;
          separatorEl.setAttribute('data-wins', currentWins);
          separatorEl.setAttribute('data-losses', currentLosses);
          
          const totalEl = separatorEl.querySelector('.ds-date-total');
          const winEl = separatorEl.querySelector('.ds-text.win');
          const lossEl = separatorEl.querySelector('.ds-text.loss');
          
          if (totalEl) totalEl.textContent = `(${currentWins + currentLosses} partidas)`;
          if (winEl) winEl.textContent = `${currentWins} win`;
          if (lossEl) lossEl.textContent = `${currentLosses} loss`;
        }

        group.matches.forEach(match => {
          const isRemake = match.isRemake;
          const isWin = match.win;
          const winClass = isRemake ? 'match-remake' : (isWin ? 'match-win' : 'match-loss');
          const resultText = isRemake ? 'REMAKE' : (isWin ? 'VICTORIA' : 'DERROTA');

          // 1. Calcular tiempo transcurrido (Time Ago)
          const getTimeAgo = (ts) => {
            const diffMs = Date.now() - ts;
            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffSecs / 60);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffSecs < 60) return 'hace unos instantes';
            if (diffMins < 60) return `hace ${diffMins} min`;
            if (diffHours < 24) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
            return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
          };
          const timeAgoStr = getTimeAgo(match.timestamp);

          // 2. Obtener nombres de cola
          let queueName = 'Clasificatoria';
          let queueSub = 'solo/dúo';
          if (match.queueId === 420) {
            queueName = 'Clasificatoria';
            queueSub = 'solo/dúo';
          } else if (match.queueId === 440) {
            queueName = 'Clasificatoria';
            queueSub = 'Flex';
          } else {
            queueName = 'Partida';
            queueSub = 'Personalizada';
          }

          // 3. Duración formateada (m y s)
          const totalSeconds = Math.round(match.durationMins * 60);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          const durationStr = `${minutes}m ${seconds}s`;
          
          let lpHtml = '';
          if (match.lpChange !== undefined && match.lpChange !== null && !isRemake) {
            const sign = match.lpChange > 0 ? '+' : '';
            const colorClass = match.lpChange > 0 ? 'lp-gain' : 'lp-loss';
            lpHtml = `<div class="match-lp-badge ${colorClass}">${sign}${match.lpChange} LP</div>`;
          } else if (!isRemake) {
            lpHtml = `
              <div class="match-lp-badge lp-unknown" data-lp-tooltip="Cambio de LP no registrado (partida previa al rastreo o datos no sincronizados)">
                ? LP <span class="lp-question-mark">?</span>
              </div>
            `;
          }
          
          const kdaStr = `${match.kills || 0} / ${match.deaths || 0} / ${match.assists || 0}`;
          const kdaRatio = (match.deaths || 0) > 0 ? (((match.kills || 0) + (match.assists || 0)) / match.deaths).toFixed(2) : 'Perfect';
          const goldStr = (match.gold || 0).toLocaleString('es-ES');
          const dmgStr = (match.damageDealt || 0).toLocaleString('es-ES');
          const rawKp = match.kp || 0;
          const kpStr = rawKp > 1 ? Math.round(rawKp) : Math.round(rawKp * 100);

          // 4. Calcular si merece insignia de honor (MVP o ACE) e insignias de multikills
          let badgeHtml = '';
          let multikillHtml = '';
          if (!isRemake) {
            // Multikill (Penta, Cuádruple, Triple, Doble)
            if (match.pentakills > 0) {
              multikillHtml = `<div class="match-badge multikill penta">Pentakill</div>`;
            } else if (match.quadraKills > 0) {
              multikillHtml = `<div class="match-badge multikill">Cuádruple asesinato</div>`;
            } else if (match.tripleKills > 0) {
              multikillHtml = `<div class="match-badge multikill">Triple asesinato</div>`;
            } else if (match.doubleKills > 0) {
              multikillHtml = `<div class="match-badge multikill">Doble asesinato</div>`;
            }

            // MVP / ACE
            const kdaNum = kdaRatio === 'Perfect' ? 10.0 : parseFloat(kdaRatio);
            if (isWin) {
              if (kdaNum >= 4.0 || match.kills >= 10 || kpStr >= 60) {
                badgeHtml = `<div class="match-badge mvp">MVP</div>`;
              }
            } else {
              if (kdaNum >= 3.0 || match.kills >= 8 || kpStr >= 50) {
                badgeHtml = `<div class="match-badge ace">ACE</div>`;
              }
            }
          }

          const champName = match.championName || 'Unknown';
          const champIconUrl = champName !== 'Unknown' 
            ? `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champName}.png`
            : `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png`;

          // Resolver el Carril / Rol con predicción de respaldo
          let rawLane = match.lane;
          if (!rawLane || rawLane === 'Unknown') {
            rawLane = getChampionLane(match.championName);
          }
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

          const laneMeta = {
            TOP: { name: 'TOP', icon: 'icon-position-top.png' },
            JUNGLE: { name: 'JUNGLA', icon: 'icon-position-jungle.png' },
            MID: { name: 'MID', icon: 'icon-position-middle.png' },
            BOTTOM: { name: 'ADC', icon: 'icon-position-bottom.png' },
            UTILITY: { name: 'SOPORTE', icon: 'icon-position-utility.png' }
          }[finalLane];

          const laneIconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/${laneMeta.icon}`;
          
          // Renderizado de hechizos y runas de invocador
          let spellsRunesHtml = '';
          if (match.summoner1Id !== undefined && match.summoner2Id !== undefined) {
            const s1Name = SUMMONER_SPELL_MAP[match.summoner1Id] || 'SummonerFlash';
            const s2Name = SUMMONER_SPELL_MAP[match.summoner2Id] || 'SummonerDot';
            const s1Url = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/spell/${s1Name}.png`;
            const s2Url = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/spell/${s2Name}.png`;

            const keystonePath = KEYSTONE_RUNE_MAP[match.keystoneId];
            const subStylePath = RUNE_STYLE_MAP[match.subStyleId];
            const keystoneUrl = keystonePath ? `https://ddragon.leagueoflegends.com/cdn/img/${keystonePath}` : '';
            const subStyleUrl = subStylePath ? `https://ddragon.leagueoflegends.com/cdn/img/${subStylePath}` : '';

            spellsRunesHtml = `
              <div class="match-spells-runes">
                <div class="match-spells">
                  <img src="${s1Url}" class="match-spell-icon" data-spell-name="${s1Name}" onerror="this.style.opacity='0'" />
                  <img src="${s2Url}" class="match-spell-icon" data-spell-name="${s2Name}" onerror="this.style.opacity='0'" />
                </div>
                <div class="match-runes">
                  ${keystoneUrl ? `<img src="${keystoneUrl}" class="match-rune-icon primary" data-rune-id="${match.keystoneId}" data-rune-type="keystone" onerror="this.style.opacity='0'" />` : '<div class="match-rune-placeholder"></div>'}
                  ${subStyleUrl ? `<img src="${subStyleUrl}" class="match-rune-icon secondary" data-rune-id="${match.subStyleId}" data-rune-type="style" onerror="this.style.opacity='0'" />` : '<div class="match-rune-placeholder"></div>'}
                </div>
              </div>
            `;
          }

          const isQuestCompleted = isLaneQuestCompleted(match);

          // Generación de rosters de equipos (Team 1 vs Team 2) a la derecha del inventario
          let teamsHtml = '';
          if (match.participants && match.participants.length > 0) {
            const team1Players = match.participants.filter(p => p.teamId === 100);
            const team2Players = match.participants.filter(p => p.teamId === 200);
            
            let team1 = team1Players;
            let team2 = team2Players;
            if (team1.length === 0 || team2.length === 0) {
              team1 = match.participants.slice(0, 5);
              team2 = match.participants.slice(5, 10);
            }
            
            const renderTeamPlayer = (p) => {
              const isMe = (p.puuid && p.puuid === currentModalPuuid);
              const isMeClass = isMe ? 'active-summoner' : '';
              const iconUrl = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${p.championName}.png`;
              const champDisplayName = p.championName ? formatChampionName(p.championName) : 'Unknown';
              
              const safeSummonerName = escapeHtml((p.summonerName || 'Desconocido')).replace(/'/g, '&#39;');
              const safePuuid = (p.puuid || '').replace(/[^a-zA-Z0-9_-]/g, '');

              // Buscar si es un miembro de la jauría para usar su tagLine real
              let tagLine = p.tagLine || '';
              if (!tagLine && GLOBAL_PLAYERS_LIST) {
                const tracked = GLOBAL_PLAYERS_LIST.find(gp => gp.puuid === p.puuid);
                if (tracked) {
                  tagLine = tracked.tagLine || '';
                }
              }
              // Si es un jugador externo en una partida guardada previamente, usar 'LAN' como fallback
              if (!tagLine) {
                tagLine = 'LAN';
              }
              const safeTagLine = tagLine.replace(/'/g, "\\'");

              const clickHandler = isMe ? '' : `onclick="handleParticipantClick('${safePuuid}', '${safeSummonerName}', this)"`;

              return `
                <div class="team-player ${isMeClass}" 
                     data-summoner-name="${safeSummonerName}" 
                     data-tag-line="${safeTagLine}"
                     data-champion-name="${champDisplayName}" 
                     data-puuid="${safePuuid}" 
                     data-team-id="${p.teamId || 100}" 
                     data-win="${p.win || false}"
                     ${clickHandler}>
                  <img src="${iconUrl}" class="team-player-champ-icon" alt="${champDisplayName}" onerror="this.onerror=null; this.src='https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png';" />
                </div>
              `;
            };
            
            teamsHtml = `
              <div class="match-teams-container">
                <div class="match-team team-ally">
                  ${team1.map(renderTeamPlayer).join('')}
                </div>
                <div class="match-team team-enemy">
                  ${team2.map(renderTeamPlayer).join('')}
                </div>
              </div>
            `;
          }

          const csPerMin = (match.durationMins > 0) ? (match.cs / match.durationMins).toFixed(1) : '0.0';
          const visionScore = (match.visionScore !== undefined && match.visionScore !== null) ? match.visionScore : '--';

          let kdaColorClass = '';
          if (kdaRatio === 'Perfect') {
            kdaColorClass = 'kda-perfect';
          } else {
            const num = parseFloat(kdaRatio);
            if (!isNaN(num)) {
              if (num >= 5.0) {
                kdaColorClass = 'kda-high';
              } else if (num >= 4.0) {
                kdaColorClass = 'kda-good';
              } else if (num >= 3.0) {
                kdaColorClass = 'kda-above-avg';
              }
            }
          }

          const statsBlockHtml = `
            <div class="match-stats-block">
               <div class="stats-kda-raw">
                 <span>${match.kills}</span> / 
                 <span class="d-raw">${match.deaths}</span> / 
                 <span>${match.assists}</span>
               </div>
               <div class="stats-kda-ratio"><strong class="${kdaColorClass}">${kdaRatio}</strong> KDA</div>
               
               <div class="stats-cs"><strong>${match.cs} CS</strong> <span class="cs-min">(${csPerMin})</span></div>
               <div class="stats-vision"><strong>${visionScore}</strong> vision</div>
            </div>
          `;

          const matchHtml = `
            <div class="match-item ${winClass}">
              <!-- 1. BLOQUE DE METADATOS DEL JUEGO (AHORA A LA IZQUIERDA DEL TODO) -->
              <div class="match-meta-info">
                <div class="meta-queue">${queueName} • <span class="meta-queue-sub">${queueSub}</span></div>
                <div class="meta-time">${timeAgoStr}</div>
                <div class="meta-divider"></div>
                <div class="meta-result">${resultText}</div>
                <span class="meta-duration">${durationStr}</span>
              </div>

              <!-- CONTENEDOR DE LP A LA IZQUIERDA DEL ICONO DE CAMPEÓN -->
              <div class="match-lp-container">
                ${lpHtml}
              </div>

              <!-- 2. CAMPEÓN, HECHIZOS Y RUNAS CON INSIGNIAS ABAJO -->
              <div class="match-champ-container">
                <div class="match-champ">
                  <div class="match-champ-avatar-container">
                    <img src="${champIconUrl}" class="match-champ-icon" alt="${champName}" onerror="this.onerror=null; this.src='https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/29.png';" title="${champName}" />
                    <img src="${laneIconUrl}" class="match-lane-icon" title="${laneMeta.name}" alt="${laneMeta.name}" />
                  </div>
                  ${spellsRunesHtml}
                </div>
                ${(multikillHtml || badgeHtml) ? `
                  <div class="stats-badges-row">
                    ${multikillHtml}
                    ${badgeHtml}
                  </div>
                ` : ''}
              </div>
              
              <!-- BLOQUE DE ESTADÍSTICAS VERTICALES -->
              ${statsBlockHtml}
              
              <!-- GRID DE OBJETOS Y MISIÓN DE CARRIL -->
              <div class="match-items-grid">
                ${renderItemSlot(match.item0)}
                ${renderItemSlot(match.item1)}
                ${renderItemSlot(match.item2)}
                ${renderItemSlot(match.item6, true)}
                
                ${renderItemSlot(match.item3)}
                ${renderItemSlot(match.item4)}
                ${renderItemSlot(match.item5)}
                ${renderQuestSlot(isQuestCompleted, finalLane, match)}
              </div>
              
              <!-- ROSTER DE EQUIPOS PARTICIPANTES -->
              ${teamsHtml}
              
              <!-- BOTÓN DE EXPANDIR PREMIUM -->
              ${(match.participants && match.participants.length > 0) ? `
              <div class="match-expand-action">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              ` : `
              <div class="match-expand-action" style="opacity: 0.3;" title="Detalles no disponibles para partidas antiguas">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                </svg>
              </div>
              `}
            </div>
          `;
          historyContainer.insertAdjacentHTML('beforeend', matchHtml);

          // Attach click handler for expanded details
          const insertedMatch = historyContainer.lastElementChild;
          console.log('[EXP] Attaching click handler', { insertedMatch: insertedMatch?.className, hasParticipants: !!match.participants, participantsLen: match.participants?.length });
          if (insertedMatch) {
            insertedMatch.style.cursor = 'pointer';
            insertedMatch.addEventListener('click', (e) => {
              console.log('[EXP] Click detected on match card', { target: e.target.className, closestTeamPlayer: !!e.target.closest('.team-player'), closestA: !!e.target.closest('a') });
              // No expandir si se hizo clic en un jugador del roster o en un enlace
              if (e.target.closest('.team-player') || e.target.closest('a')) return;
              
              if (!match.participants || match.participants.length === 0) {
                if (typeof showToast === 'function') {
                  showToast('Los detalles expandidos no están disponibles para partidas antiguas guardadas antes de la actualización.', 'info');
                }
                return;
              }
              
              console.log('[EXP] Calling renderExpandedMatch...');
              renderExpandedMatch(insertedMatch, match);
            });
          }
        });
      });
    } else {
      if (!isAppend) {
        historyContainer.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 0.9rem;">No hay historial guardado. Haz clic en "Actualizar Datos" para cargar tus últimas partidas.</div>';
      }
    }
  }

  // El renderizado inicial queda completamente gestionado de forma limpia por la invocación de btnSolo.onclick() arriba.


  // Botón para actualizar partidas recientes
  const btnUpdateMatches = document.getElementById('btn-update-matches');
  if (player.isUntracked) {
    btnUpdateMatches.innerHTML = '<span class="refresh-icon-spin">●</span> HISTORIAL EN TIEMPO REAL';
    btnUpdateMatches.style.background = 'rgba(255, 255, 255, 0.05)';
    btnUpdateMatches.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    btnUpdateMatches.style.color = 'rgba(255, 255, 255, 0.4)';
    btnUpdateMatches.style.cursor = 'default';
    btnUpdateMatches.onclick = null;
  } else {
    btnUpdateMatches.innerHTML = '<span class="refresh-icon-spin">↻</span> ACTUALIZAR DATOS';
    btnUpdateMatches.style.background = '';
    btnUpdateMatches.style.borderColor = '';
    btnUpdateMatches.style.color = '';
    btnUpdateMatches.style.cursor = '';
    
    btnUpdateMatches.onclick = async () => {
      if (riotRequestCooldownActive) {
        showToast('⏳ Por favor, espera a que termine el enfriamiento de Riot.', 'info');
        return;
      }
      try {
        hasReachedHistoryEnd = false; // Resetear bandera de fin de historial al actualizar manualmente
        startLoadingBar();
        btnUpdateMatches.classList.add('loading');
        btnUpdateMatches.disabled = true;
        
        const response = await fetch(`${API_BASE}/summoners/${player.puuid}/matches/update`, {
          method: 'POST'
        });
        const data = await response.json();
        
        if (response.ok) {
          showToast(data.message, 'success');
          if (data.updated) {
            if (data.stats) player.advancedStats = data.stats; 
            if (data.history) player.matchStatsHistory = data.history; 
            if (data.topChampions) player.topChampions = data.topChampions;
            openPlayerDetails(player);
          }
        } else {
          showToast(`❌ ${data.message}`, 'error');
        }
      } catch (e) {
        console.error(e);
        if (typeof activateRiotCooldown === 'function') activateRiotCooldown();
      } finally {
        btnUpdateMatches.classList.remove('loading');
        btnUpdateMatches.disabled = false;
        finishLoadingBar();
      }
    };
  }

  // Bind close button
  modal.querySelector('.close-details').onclick = () => {
    if (profileNavigationStack.length > 0) {
      const prevPlayer = profileNavigationStack.pop();
      openPlayerDetails(prevPlayer);
    } else {
      closePlayerDetailsSplash(activePlayerDetails);
      modal.classList.remove('active');
      document.body.style.overflow = '';
      currentModalPuuid = null;
    }
  };
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Lógica de Scroll Infinito Premium (Conexión Directa con Servidor y Riot API)
  let isFetchingMore = false;

  if (historyContainer) {
    // Limpiar handler anterior para evitar memory leaks al navegar entre perfiles
    historyContainer.onscroll = null;
    historyContainer.onscroll = async () => {
      if (isFetchingMore) return;

      // Detección matemática del final del scroll con tolerancia de 20px
      if (historyContainer.scrollTop + historyContainer.clientHeight >= historyContainer.scrollHeight - 20) {
        // Filtrar historial según la cola activa
        const filtered = currentHistory.filter(match => {
          if (currentQueueType === 'soloq') {
            return match.queueId == 420;
          } else if (currentQueueType === 'flexq') {
            return match.queueId == 440;
          }
          return true;
        });

        // Caso A: Aún nos quedan partidas locales en memoria sin mostrar
        if (visibleMatchesCount < filtered.length) {
          visibleMatchesCount += 5; // Aumentar en 5 partidas
          
          // Guardamos la posición actual del scroll para evitar saltos bruscos
          const prevScrollTop = historyContainer.scrollTop;
          renderHistory(currentHistory, currentQueueType, true);
          
          // Restauramos la posición
          historyContainer.scrollTop = prevScrollTop;
        }
        // Caso B: Ya mostramos todas las guardadas, ¡consultemos a Riot API para buscar más antiguas!
        else if (filtered.length >= 5 && !hasReachedHistoryEnd) {
          if (riotRequestCooldownActive) {
            showToast('⏳ Por favor, espera a que termine el enfriamiento de Riot.', 'info');
            return;
          }
          isFetchingMore = true;
          
          // Crear un spinner de carga Hextech dorado en el DOM
          const spinner = document.createElement('div');
          spinner.className = 'history-lazy-loader';
          spinner.innerHTML = `<span class="lazy-loader-spin">↻</span> Buscando partidas antiguas en Riot Games...`;
          historyContainer.appendChild(spinner);

          try {
            const isUntracked = player.isUntracked || false;
            const region = player.region || 'la1';
            
            const response = await fetch(`${API_BASE}/summoners/${currentModalPuuid}/matches/load-more?region=${region}&isUntracked=${isUntracked}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ existingMatches: currentHistory })
            });
            const data = await response.json();

            if (response.ok && data.updated) {
              // Guardar la posición del scroll EXACTA antes de cualquier modificación del DOM
              const prevScrollTop = historyContainer.scrollTop;

              // Actualizar datos del jugador localmente
              currentHistory = data.history;
              if (activePlayerDetails) {
                activePlayerDetails.matchStatsHistory = data.history;
                activePlayerDetails.advancedStats = data.stats;
              }
              
              // Recargar las estadísticas avanzadas en la UI de forma reactiva
              const activeQueueKey = currentQueueType === 'soloq' ? 'soloq' : 'flexq';
              if (typeof loadStats === 'function' && data.stats) {
                loadStats(data.stats[activeQueueKey]);
              }
              
              // Quitar spinner antes de añadir los nuevos elementos
              const sp = historyContainer.querySelector('.history-lazy-loader');
              if (sp) sp.remove();

              visibleMatchesCount += 5; // Mostrar 5 más
              renderHistory(currentHistory, currentQueueType, true);
              
              // Restaurar la posición exacta original
              historyContainer.scrollTop = prevScrollTop;
              showToast('¡Cargadas partidas antiguas adicionales!', 'success');
            } else {
              // Guardar posición exacta
              const prevScrollTop = historyContainer.scrollTop;
              
              // Quitar spinner si no hay partidas nuevas
              const sp = historyContainer.querySelector('.history-lazy-loader');
              if (sp) sp.remove();
              
              // Restaurar posición exacta
              historyContainer.scrollTop = prevScrollTop;
              
              showToast(data.message || 'No hay más partidas antiguas.', 'info');
              hasReachedHistoryEnd = true; // Detener futuras búsquedas en esta sesión
            }
          } catch (err) {
            console.error(err);
            if (typeof activateRiotCooldown === 'function') activateRiotCooldown();
            const prevScrollTop = historyContainer.scrollTop;
            const sp = historyContainer.querySelector('.history-lazy-loader');
            if (sp) sp.remove();
            historyContainer.scrollTop = prevScrollTop;
          } finally {
            isFetchingMore = false;
          }
        }
      }
    };
  }
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
  
  // BUG-16 fix: Usar addEventListener en vez de window.onclick para no sobreescribir otros handlers
  window.addEventListener('click', (event) => {
    const confirmDeleteModal = document.getElementById('confirm-delete-modal');
    const detailsModal = document.getElementById('player-details-modal');
    const compareModal = document.getElementById('compare-players-modal');
    
    if (event.target === modal) modal.classList.remove('active');
    if (event.target === confirmDeleteModal) confirmDeleteModal.classList.remove('active');
    if (event.target === compareModal) {
      compareModal.classList.remove('active');
      document.body.style.overflow = '';
      const select1 = document.getElementById('compare-player-1-select');
      const select2 = document.getElementById('compare-player-2-select');
      const resultsContainer = document.getElementById('compare-results-container');
      if (select1) select1.value = '';
      if (select2) select2.value = '';
      if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
      }
    }
    if (event.target === detailsModal) {
      closePlayerDetailsSplash(activePlayerDetails);
      detailsModal.classList.remove('active');
      document.body.style.overflow = '';
      currentModalPuuid = null;
    }
  });

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
let lastToastMessage = '';
let lastToastTime = 0;

function showToast(message, type = 'success') {
  const now = Date.now();
  if (message === lastToastMessage && now - lastToastTime < 2500) {
    return; // Evitar spam de la misma notificación en 2.5 segundos
  }
  lastToastMessage = message;
  lastToastTime = now;

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
      if (toast.parentNode) toast.remove();
    }, 500);
  }, 4000);
}

// Carga inicial
document.addEventListener('DOMContentLoaded', async () => {
  await updateVersion();
  initItemsDatabase(); // Cargar base de datos de items en segundo plano
  initSkinsDatabase(); // Cargar base de datos de skins
  fetchLadder();
  initModal();
  initDeleteLogic();
  initCompareLogic();

  // Lógica del custom dropdown de ordenamiento
  const sortContainer = document.querySelector('.custom-dropdown-container');
  const sortTrigger = document.getElementById('sort-trigger');
  const sortTriggerText = document.getElementById('sort-trigger-text');
  const sortOptions = document.querySelectorAll('.custom-option');

  if (sortContainer && sortTrigger && sortOptions.length > 0) {
    sortContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      sortContainer.classList.toggle('open');
    });

    sortOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        sortOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        sortContainer.classList.remove('open');
        currentSortMode = option.dataset.value;
        renderLadder(GLOBAL_PLAYERS_LIST);
      });
    });

    document.addEventListener('click', (e) => {
      if (!sortContainer.contains(e.target)) {
        sortContainer.classList.remove('open');
      }
    });
  }

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

// BUG-13 fix: Pausar polling cuando la pestaña no es visible
let pollIntervalId = setInterval(pollLiveStatus, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  } else {
    if (!pollIntervalId) {
      pollLiveStatus();
      pollIntervalId = setInterval(pollLiveStatus, 30000);
    }
  }
});

// Lógica para Comparar Cuentas de Invocador (Cara a Cara)
function initCompareLogic() {
  const modal = document.getElementById('compare-players-modal');
  const btn = document.getElementById('compare-players-btn');
  const span = document.querySelector('.close-compare');
  const select1 = document.getElementById('compare-player-1-select');
  const select2 = document.getElementById('compare-player-2-select');
  const resultsContainer = document.getElementById('compare-results-container');
  const cancelBtn = document.getElementById('compare-cancel-btn');

  if (!modal || !btn || !span || !select1 || !select2 || !resultsContainer) return;

  // Alternar modo de comparación
  btn.onclick = () => {
    toggleComparisonMode();
  };

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      toggleComparisonMode(false);
    };
  }

  span.onclick = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    resetCompare();
  };

  // Poblar dropdowns al abrir modal para evitar selects vacíos
  const origModalOpen = () => { populateCompareDropdowns(); };
  select1.onfocus = origModalOpen;
  select2.onfocus = origModalOpen;
  select1.onchange = updateComparison;
  select2.onchange = updateComparison;

  // Exponer a nivel global para interceptar clics en tarjetas
  window.handleComparisonCardSelection = handleComparisonCardSelection;
  window.toggleComparisonMode = toggleComparisonMode;

  function toggleComparisonMode(forceState) {
    const newState = (forceState !== undefined) ? forceState : !isComparisonMode;
    
    if (newState === isComparisonMode) return;
    
    isComparisonMode = newState;
    const ladderContainer = document.getElementById('ladder-container');
    const helperBar = document.getElementById('compare-helper-bar');
    
    if (isComparisonMode) {
      selectedPuuidsForCompare = [];
      if (ladderContainer) ladderContainer.classList.add('comparison-mode-active');
      if (helperBar) helperBar.classList.add('active');
      updateHelperBarText();
      
      btn.innerHTML = '<span class="icon">❌</span> Cancelar';
      btn.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(220, 38, 38, 0.35))';
      btn.style.borderColor = '#ef4444';
      
      showToast('⚔️ Modo Comparar activo. Elige 2 tarjetas.');
    } else {
      selectedPuuidsForCompare = [];
      if (ladderContainer) ladderContainer.classList.remove('comparison-mode-active');
      if (helperBar) helperBar.classList.remove('active');
      
      // Limpiar clases de selección de todas las tarjetas
      document.querySelectorAll('.player-card.compare-selected').forEach(c => {
        c.classList.remove('compare-selected');
      });
      
      btn.innerHTML = '<span class="icon">⚔️</span> Comparar';
      btn.style.background = '';
      btn.style.borderColor = '';
    }
  }

  function handleComparisonCardSelection(puuid, card) {
    const idx = selectedPuuidsForCompare.indexOf(puuid);
    if (idx !== -1) {
      selectedPuuidsForCompare.splice(idx, 1);
      if (card) card.classList.remove('compare-selected');
      showToast('Deseleccionado');
    } else {
      if (selectedPuuidsForCompare.length >= 2) {
        showToast('⚠️ Solo puedes comparar 2 jugadores.', 'error');
        return;
      }
      
      selectedPuuidsForCompare.push(puuid);
      if (card) card.classList.add('compare-selected');
      
      if (selectedPuuidsForCompare.length === 2) {
        const player1 = GLOBAL_PLAYERS_LIST.find(p => p.puuid === selectedPuuidsForCompare[0]);
        const player2 = GLOBAL_PLAYERS_LIST.find(p => p.puuid === selectedPuuidsForCompare[1]);
        
        if (player1 && player2) {
          // Llenar dropdowns para mantener compatibilidad e interactividad secundaria
          populateCompareDropdowns();
          select1.value = player1.puuid;
          select2.value = player2.puuid;
          
          renderComparisonGrid(player1, player2);
          modal.classList.add('active');
          document.body.style.overflow = 'hidden';
        }
        
        setTimeout(() => {
          toggleComparisonMode(false);
        }, 300);
      }
    }
    updateHelperBarText();
  }

  function updateHelperBarText() {
    const helperText = document.getElementById('compare-helper-text');
    if (!helperText) return;
    
    const count = selectedPuuidsForCompare.length;
    if (count === 0) {
      helperText.textContent = 'Modo Comparación: Selecciona 2 invocadores en la tabla para comparar';
    } else if (count === 1) {
      const p1 = GLOBAL_PLAYERS_LIST.find(p => p.puuid === selectedPuuidsForCompare[0]);
      const name = p1 ? p1.gameName : 'Invocador';
      helperText.textContent = `Seleccionado: ${name} (1/2). Elige al segundo invocador...`;
    }
  }

  function populateCompareDropdowns() {
    const val1 = select1.value;
    const val2 = select2.value;

    select1.innerHTML = '<option value="">Seleccionar Invocador A...</option>';
    select2.innerHTML = '<option value="">Seleccionar Invocador B...</option>';

    if (GLOBAL_PLAYERS_LIST && GLOBAL_PLAYERS_LIST.length > 0) {
      GLOBAL_PLAYERS_LIST.forEach(player => {
        const optionText = `${player.gameName}#${player.tagLine} (${player.soloQ?.tier || 'UNRANKED'} ${player.soloQ?.rank || ''})`;
        
        const opt1 = document.createElement('option');
        opt1.value = player.puuid;
        opt1.textContent = optionText;
        select1.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = player.puuid;
        opt2.textContent = optionText;
        select2.appendChild(opt2);
      });
    }

    select1.value = val1;
    select2.value = val2;
  }

  function resetCompare() {
    select1.value = '';
    select2.value = '';
    resultsContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
  }

  function updateComparison() {
    const puuid1 = select1.value;
    const puuid2 = select2.value;

    if (!puuid1 || !puuid2) {
      resultsContainer.style.display = 'none';
      resultsContainer.innerHTML = '';
      return;
    }

    if (puuid1 === puuid2) {
      showToast('⚠️ Selecciona dos invocadores distintos.', 'error');
      select2.value = '';
      resultsContainer.style.display = 'none';
      resultsContainer.innerHTML = '';
      return;
    }

    const player1 = GLOBAL_PLAYERS_LIST.find(p => p.puuid === puuid1);
    const player2 = GLOBAL_PLAYERS_LIST.find(p => p.puuid === puuid2);

    if (!player1 || !player2) return;

    renderComparisonGrid(player1, player2);
  }

  // BUG-09/22 fix: Usar matchStatsHistory en vez de player.history (que contiene strings 'W'/'L')
  function getPlayerStreak(matchHistory) {
    if (!matchHistory || matchHistory.length === 0) return { type: 'W', count: 0 };
    const nonRemake = matchHistory.filter(m => !m.isRemake);
    if (nonRemake.length === 0) return { type: 'W', count: 0 };
    const firstResult = nonRemake[0].win;
    let count = 0;
    for (const match of nonRemake) {
      if (match.win === firstResult) {
        count++;
      } else {
        break;
      }
    }
    return { type: firstResult ? 'W' : 'L', count };
  }

  // BUG-22 fix: Usar matchStatsHistory para campeones recientes en vez de player.history
  function getPlayerRecentChamps(player) {
    const matches = player.matchStatsHistory || [];
    if (matches.length > 0) {
      const counts = {};
      matches.forEach(m => {
        if (m.isRemake) return;
        const name = m.championName;
        if (!name) return;
        if (!counts[name]) counts[name] = { count: 0, wins: 0 };
        counts[name].count++;
        if (m.win) counts[name].wins++;
      });
      const sorted = Object.entries(counts).sort((a, b) => b[1].count - a[1].count).slice(0, 3);
      if (sorted.length > 0) {
        return sorted.map(([name, data]) => {
          const wr = Math.round((data.wins / data.count) * 100);
          return { name, count: data.count, winRate: wr };
        });
      }
    }
    return (player.topChampions || []).slice(0, 3).map(c => ({
      name: c.name,
      count: 0,
      winRate: 0
    }));
  }

  // Playstyle Badges basados en estadísticas
  function getPlaystyleBadges(stats, matches) {
    const badges = [];
    const cs = parseFloat(stats.csPerMin) || 0;
    const kda = parseFloat(stats.kda) || 0;
    const deaths = parseFloat(stats.avgDeaths) || 10;
    const kp = stats.avgKp || 0;
    const dmgDealt = stats.avgDamageDealt || 0;
    const dmgTaken = stats.avgDamageTaken || 0;
    if (cs >= 8.0) badges.push({ icon: '🌾', label: 'Farm God', color: '#4ade80' });
    if (deaths <= 3.0 && kda >= 3.0) badges.push({ icon: '🛡️', label: 'KDA Guardian', color: '#38bdf8' });
    if (kp >= 65) badges.push({ icon: '🎯', label: 'Team Fighter', color: '#c084fc' });
    if (dmgDealt > 20000) badges.push({ icon: '💥', label: 'Carry', color: '#ff9f43' });
    if (dmgTaken > 25000 && dmgDealt > 15000) badges.push({ icon: '⚔️', label: 'Gladiator', color: '#ef4444' });
    if (kda >= 5.0) badges.push({ icon: '👑', label: 'Perfect', color: '#d4af37' });
    if (badges.length === 0) badges.push({ icon: '🎮', label: 'Casual', color: '#94a3b8' });
    return badges.slice(0, 3);
  }

  // Historial Frente a Frente (partidas en común)
  function getHeadToHead(p1, p2) {
    const m1 = p1.matchStatsHistory || [];
    const m2 = p2.matchStatsHistory || [];
    const m2Ids = new Set(m2.map(m => m.matchId));
    let together = 0, allies = 0, enemies = 0, p1WinsVs = 0, p2WinsVs = 0;
    m1.forEach(match => {
      if (!m2Ids.has(match.matchId)) return;
      const m2Match = m2.find(m => m.matchId === match.matchId);
      if (!m2Match || match.isRemake) return;
      together++;
      // Null-safe: verificar que ambos participantes existen antes de comparar teamId
      let sameTeam;
      if (match.participants && m2Match.participants) {
        const p1Part = match.participants.find(p => p.puuid === p1.puuid);
        const p2Part = match.participants.find(p => p.puuid === p2.puuid);
        sameTeam = (p1Part && p2Part) ? p1Part.teamId === p2Part.teamId : match.win === m2Match.win;
      } else {
        sameTeam = match.win === m2Match.win;
      }
      if (sameTeam) { allies++; }
      else { enemies++; if (match.win) p1WinsVs++; else p2WinsVs++; }
    });
    return { together, allies, enemies, p1WinsVs, p2WinsVs };
  }

  // Render barra comparativa central
  function renderVersusBar(val1, val2, color1 = '#38bdf8', color2 = '#c084fc') {
    const total = Math.abs(val1) + Math.abs(val2); // Protección contra valores negativos
    if (total === 0) return '<div class="versus-bar"><div class="vb-fill vb-left" style="width:50%;background:rgba(148,163,184,0.2)"></div><div class="vb-fill vb-right" style="width:50%;background:rgba(148,163,184,0.2)"></div></div>';
    const pct1 = Math.max(0, Math.min(100, Math.round((Math.abs(val1) / total) * 100)));
    const pct2 = 100 - pct1;
    return `<div class="versus-bar"><div class="vb-fill vb-left" style="width:${pct1}%;background:linear-gradient(90deg,${color1}33,${color1}66)"></div><div class="vb-fill vb-right" style="width:${pct2}%;background:linear-gradient(90deg,${color2}66,${color2}33)"></div><span class="vb-pct vb-pct-l">${pct1}%</span><span class="vb-pct vb-pct-r">${pct2}%</span></div>`;
  }

  function renderComparisonGrid(p1, p2) {
    const getWinnerClasses = (val1, val2, highIsBetter = true) => {
      if (val1 === val2) return ['', ''];
      const firstWins = highIsBetter ? (val1 > val2) : (val1 < val2);
      return firstWins ? ['metric-winner', ''] : ['', 'metric-winner'];
    };

    // Rank score comparison
    const getRankScore = (tier, rank, lp) => {
      const tierOrder = {
        CHALLENGER: 9, GRANDMASTER: 8, MASTER: 7,
        DIAMOND: 6, EMERALD: 5, PLATINUM: 4,
        GOLD: 3, SILVER: 2, BRONZE: 1, IRON: 0, UNRANKED: -1
      };
      const divOrder = { I: 4, II: 3, III: 2, IV: 1 };
      const t = tier?.toUpperCase() || 'UNRANKED';
      const r = rank?.toUpperCase() || '';
      return ((tierOrder[t] ?? -1) * 10000) + ((divOrder[r] ?? 0) * 1000) + (lp || 0);
    };

    const rankScore1 = getRankScore(p1.soloQ?.tier, p1.soloQ?.rank, p1.soloQ?.leaguePoints);
    const rankScore2 = getRankScore(p2.soloQ?.tier, p2.soloQ?.rank, p2.soloQ?.leaguePoints);
    const rankClasses = getWinnerClasses(rankScore1, rankScore2);

    // SoloQ Win Rate
    const wins1 = p1.soloQ?.wins || 0;
    const losses1 = p1.soloQ?.losses || 0;
    const totalGames1 = wins1 + losses1;
    const wr1 = totalGames1 > 0 ? Math.round((wins1 / totalGames1) * 100) : 0;

    const wins2 = p2.soloQ?.wins || 0;
    const losses2 = p2.soloQ?.losses || 0;
    const totalGames2 = wins2 + losses2;
    const wr2 = totalGames2 > 0 ? Math.round((wins2 / totalGames2) * 100) : 0;
    const wrClasses = getWinnerClasses(wr1, wr2);

    // KDA Promedio (SoloQ)
    const stats1 = p1.advancedStats?.soloq || {};
    const stats2 = p2.advancedStats?.soloq || {};

    const kda1 = parseFloat(stats1.kda) || 0;
    const kda2 = parseFloat(stats2.kda) || 0;
    const kdaClasses = getWinnerClasses(kda1, kda2);

    const deaths1 = parseFloat(stats1.avgDeaths) || 0;
    const deaths2 = parseFloat(stats2.avgDeaths) || 0;
    const deathsClasses = getWinnerClasses(deaths1, deaths2, false);

    // Farm (CS/min)
    const cs1 = parseFloat(stats1.csPerMin) || 0;
    const cs2 = parseFloat(stats2.csPerMin) || 0;
    const csClasses = getWinnerClasses(cs1, cs2);

    // Oro Promedio
    const gold1 = stats1.avgGold || 0;
    const gold2 = stats2.avgGold || 0;
    const goldClasses = getWinnerClasses(gold1, gold2);

    // KP% Promedio
    const kp1 = stats1.avgKp || 0;
    const kp2 = stats2.avgKp || 0;
    const kpClasses = getWinnerClasses(kp1, kp2);

    // Daño Realizado
    const dmg1 = stats1.avgDamageDealt || 0;
    const dmg2 = stats2.avgDamageDealt || 0;
    const dmgClasses = getWinnerClasses(dmg1, dmg2);

    // Daño Recibido
    const taken1 = stats1.avgDamageTaken || 0;
    const taken2 = stats2.avgDamageTaken || 0;
    const takenClasses = getWinnerClasses(taken1, taken2, false); // BUG-20 fix: menos daño recibido es mejor

    // Active Streaks — BUG-09 fix: usar matchStatsHistory filtrado
    const soloMatches1 = (p1.matchStatsHistory || []).filter(m => m.queueId == 420);
    const soloMatches2 = (p2.matchStatsHistory || []).filter(m => m.queueId == 420);
    const streakData1 = getPlayerStreak(soloMatches1);
    const streakData2 = getPlayerStreak(soloMatches2);
    const streakScore1 = streakData1.type === 'W' ? streakData1.count : -streakData1.count;
    const streakScore2 = streakData2.type === 'W' ? streakData2.count : -streakData2.count;
    const streakClasses = getWinnerClasses(streakScore1, streakScore2);

    // Recent Champs HTML
    const renderChampsCompare = (champs) => {
      if (!champs || champs.length === 0) return '<div class="compare-champs-empty">Sin partidas</div>';
      return `<div class="compare-champs-list">
        ${champs.map(c => `
          <div class="compare-champ-mini">
            <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${c.name}.png" class="compare-champ-mini-icon" onerror="this.src='/assets/placeholder_champ.png'" />
            <div class="compare-champ-mini-info">
              <span class="champ-mini-name">${formatChampionName(c.name)}</span>
              <span class="champ-mini-stats">${c.count > 0 ? `${c.count} Partidas | ` : ''}<strong style="color: ${c.winRate >= 50 ? '#4ade80' : '#f87171'}">${c.winRate}% WR</strong></span>
            </div>
          </div>
        `).join('')}
      </div>`;
    };

    const champs1 = getPlayerRecentChamps(p1);
    const champs2 = getPlayerRecentChamps(p2);
    const badges1 = getPlaystyleBadges(stats1, soloMatches1);
    const badges2 = getPlaystyleBadges(stats2, soloMatches2);
    const h2h = getHeadToHead(p1, p2);

    // Count metric wins for global winner glow
    const metrics = [[rankScore1,rankScore2,true],[wr1,wr2,true],[kda1,kda2,true],[deaths1,deaths2,false],[cs1,cs2,true],[gold1,gold2,true],[kp1,kp2,true],[dmg1,dmg2,true],[taken1,taken2,false]];
    let p1Wins = 0, p2Wins = 0;
    metrics.forEach(([v1,v2,hib]) => { const w = hib ? v1>v2 : v1<v2; const l = hib ? v1<v2 : v1>v2; if(w) p1Wins++; if(l) p2Wins++; });
    const p1IsWinner = p1Wins > p2Wins;
    const p2IsWinner = p2Wins > p1Wins;

    const renderBadges = (badges) => badges.map(b => `<span class="ps-badge" style="border-color:${b.color}44;color:${b.color};background:${b.color}11">${b.icon} ${b.label}</span>`).join('');

    const renderH2H = () => {
      if (h2h.together === 0) return '';
      let detail = '';
      if (h2h.allies > 0) detail += `<span class="h2h-tag ally">🤝 ${h2h.allies} como aliados</span>`;
      if (h2h.enemies > 0) detail += `<span class="h2h-tag enemy">⚔️ ${h2h.enemies} como rivales</span>`;
      if (h2h.enemies > 0) detail += `<span class="h2h-score">${escapeHtml(p1.gameName)} ${h2h.p1WinsVs}W - ${h2h.p2WinsVs}W ${escapeHtml(p2.gameName)}</span>`;
      return `<div class="h2h-section"><div class="h2h-title">📜 Historial en Común — ${h2h.together} partidas</div><div class="h2h-details">${detail}</div></div>`;
    };

    const mkRow = (label, v1Html, v2Html, cls1, cls2, bar = '') => `
      <div class="compare-row">
        <div class="compare-val-col col-1 ${cls1}">${v1Html}${cls1 ? '<span class="compare-crown-icon">🏆</span>' : ''}</div>
        <div class="compare-label-col"><span>${label}</span>${bar}</div>
        <div class="compare-val-col col-2 ${cls2}">${v2Html}${cls2 ? '<span class="compare-crown-icon">🏆</span>' : ''}</div>
      </div>`;

    const tierGlow1 = (p1.soloQ?.tier||'unranked').toLowerCase();
    const tierGlow2 = (p2.soloQ?.tier||'unranked').toLowerCase();

    resultsContainer.innerHTML = `
      <div class="compare-vs-header">
        <div class="compare-player-card ${p1IsWinner ? 'global-winner' : ''}">
          <div class="compare-profile-icon-container">
            <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${p1.profileIconId}.png" class="compare-profile-icon tier-glow-${tierGlow1}" onerror="this.src='/assets/placeholder_icon.png'" />
            <span class="compare-level-badge">${p1.summonerLevel}</span>
          </div>
          <span class="compare-player-name">${escapeHtml(p1.gameName)}</span>
          <span class="compare-player-tag">#${escapeHtml(p1.tagLine)}</span>
          <div class="ps-badges-row">${renderBadges(badges1)}</div>
          ${p1IsWinner ? '<div class="global-winner-label">⭐ GANADOR ⭐</div>' : ''}
        </div>
        <div class="compare-vs-divider">
          <div class="vs-shield">VS</div>
          <div class="compare-score-pill">${p1Wins} — ${p2Wins}</div>
        </div>
        <div class="compare-player-card ${p2IsWinner ? 'global-winner' : ''}">
          <div class="compare-profile-icon-container">
            <img src="https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/profileicon/${p2.profileIconId}.png" class="compare-profile-icon tier-glow-${tierGlow2}" onerror="this.src='/assets/placeholder_icon.png'" />
            <span class="compare-level-badge">${p2.summonerLevel}</span>
          </div>
          <span class="compare-player-name">${escapeHtml(p2.gameName)}</span>
          <span class="compare-player-tag">#${escapeHtml(p2.tagLine)}</span>
          <div class="ps-badges-row">${renderBadges(badges2)}</div>
          ${p2IsWinner ? '<div class="global-winner-label">⭐ GANADOR ⭐</div>' : ''}
        </div>
      </div>

      ${renderH2H()}

      <div class="compare-stats-table">
        ${mkRow('Rango SoloQ',
          `<img src="/assets/ranks/${(p1.soloQ?.tier||'unranked').toLowerCase()}.png" class="compare-rank-emblem" onerror="this.src='/assets/ranks/unranked.png'"/><div class="compare-rank-info"><span class="rank-name">${p1.soloQ?.tier||'UNRANKED'} ${p1.soloQ?.rank||''}</span><span class="rank-lp">${p1.soloQ?.leaguePoints||0} LP</span></div>`,
          `<div class="compare-rank-info"><span class="rank-name">${p2.soloQ?.tier||'UNRANKED'} ${p2.soloQ?.rank||''}</span><span class="rank-lp">${p2.soloQ?.leaguePoints||0} LP</span></div><img src="/assets/ranks/${(p2.soloQ?.tier||'unranked').toLowerCase()}.png" class="compare-rank-emblem" onerror="this.src='/assets/ranks/unranked.png'"/>`,
          rankClasses[0], rankClasses[1])}

        ${mkRow('Win Rate SoloQ',
          `<span class="compare-stat-val">${wr1}%</span><span class="compare-stat-sub">${wins1}W / ${losses1}L</span>`,
          `<span class="compare-stat-sub">${wins2}W / ${losses2}L</span><span class="compare-stat-val">${wr2}%</span>`,
          wrClasses[0], wrClasses[1], renderVersusBar(wr1, wr2, '#4ade80', '#f87171'))}

        ${mkRow('KDA Promedio',
          `<span class="compare-stat-val" style="color:${kda1>=3?'#ff9f43':kda1>=2?'#38bdf8':'#ef4444'}">${kda1.toFixed(2)}:1</span>`,
          `<span class="compare-stat-val" style="color:${kda2>=3?'#ff9f43':kda2>=2?'#38bdf8':'#ef4444'}">${kda2.toFixed(2)}:1</span>`,
          kdaClasses[0], kdaClasses[1], renderVersusBar(kda1, kda2))}

        ${mkRow('Menos Muertes',
          `<span class="compare-stat-val">${deaths1.toFixed(1)}</span><span class="compare-stat-sub">muertes/partida</span>`,
          `<span class="compare-stat-sub">muertes/partida</span><span class="compare-stat-val">${deaths2.toFixed(1)}</span>`,
          deathsClasses[0], deathsClasses[1])}

        ${mkRow('Farm por Minuto',
          `<span class="compare-stat-val">${cs1.toFixed(1)} CS/min</span>`,
          `<span class="compare-stat-val">${cs2.toFixed(1)} CS/min</span>`,
          csClasses[0], csClasses[1], renderVersusBar(cs1, cs2, '#4ade80', '#c084fc'))}

        ${mkRow('Oro Promedio',
          `<span class="compare-stat-val">${gold1.toLocaleString('es-ES')}</span><span class="compare-stat-sub">oro/partida</span>`,
          `<span class="compare-stat-sub">oro/partida</span><span class="compare-stat-val">${gold2.toLocaleString('es-ES')}</span>`,
          goldClasses[0], goldClasses[1], renderVersusBar(gold1, gold2, '#d4af37', '#d4af37'))}

        ${mkRow('Participación Kills',
          `<span class="compare-stat-val">${kp1}%</span>`,
          `<span class="compare-stat-val">${kp2}%</span>`,
          kpClasses[0], kpClasses[1], renderVersusBar(kp1, kp2))}

        ${mkRow('Daño Infligido',
          `<span class="compare-stat-val" style="color:#ff9f43">${dmg1.toLocaleString('es-ES')}</span>`,
          `<span class="compare-stat-val" style="color:#ff9f43">${dmg2.toLocaleString('es-ES')}</span>`,
          dmgClasses[0], dmgClasses[1], renderVersusBar(dmg1, dmg2, '#ff9f43', '#ff9f43'))}

        ${mkRow('Daño Recibido',
          `<span class="compare-stat-val" style="color:#ef4444">${taken1.toLocaleString('es-ES')}</span>`,
          `<span class="compare-stat-val" style="color:#ef4444">${taken2.toLocaleString('es-ES')}</span>`,
          takenClasses[0], takenClasses[1])}

        ${mkRow('Racha Actual',
          `<span class="compare-stat-val" style="color:${streakData1.type==='W'?'#4ade80':'#f87171'}">${streakData1.count}${streakData1.type}</span><span class="compare-stat-sub">${streakData1.type==='W'?'Victorias':'Derrotas'} seguidas</span>`,
          `<span class="compare-stat-sub">${streakData2.type==='W'?'Victorias':'Derrotas'} seguidas</span><span class="compare-stat-val" style="color:${streakData2.type==='W'?'#4ade80':'#f87171'}">${streakData2.count}${streakData2.type}</span>`,
          streakClasses[0], streakClasses[1])}

        <div class="compare-row champs-compare-row" style="height:auto;align-items:flex-start;padding:20px 0;">
          <div class="compare-val-col col-1" style="flex-direction:column;align-items:flex-start;justify-content:flex-start;height:auto;">${renderChampsCompare(champs1)}</div>
          <div class="compare-label-col" style="align-self:center;">Top Campeones</div>
          <div class="compare-val-col col-2" style="flex-direction:column;align-items:flex-start;justify-content:flex-start;height:auto;">${renderChampsCompare(champs2)}</div>
        </div>
      </div>
    `;

    resultsContainer.style.display = 'block';
    // Scroll to top del modal al abrir comparación
    const modalBody = resultsContainer.closest('.compare-modal-body');
    if (modalBody) modalBody.scrollTop = 0;
  }
}
