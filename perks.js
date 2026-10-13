// ============================================================
// perks.js — Sistema de perks por skin
// Cada skin concede uma habilidade passiva única.
// Aplicado ao iniciar o jogo em startGame().
// ============================================================

export const PERKS = {
  // ════════ PERK PADRÃO ════════
  default: {
    id: 'default',
    name: 'SOBREVIVENTE',
    desc: 'Sem bônus. A experiência pura, do jeito que veio ao mundo.',
    icon: '👤',
    apply: (_state, _player) => {},
  },

  // ════════ SKIN 1: ANGEL ════════
  angel: {
    id: 'angel',
    name: 'ANJO DA GUARDA',
    desc: 'Velocidade de revive +60%. Ao se levantar, cura +20% do HP máximo.',
    icon: '😇',
    apply: (state, _player) => {
      state.reviveSpeedMult = 1.6;
      state.reviveHealBonus = 0.20;
    },
  },

  // ════════ SKIN 2: BUSINESS MALE ════════
  businessMale: {
    id: 'businessMale',
    name: 'NEGOCIADOR',
    desc: 'Todos os preços na loja -20%. Compra de armas também fica mais barata.',
    icon: '💼',
    apply: (state, _player) => {
      state.shopDiscount = 0.80;
      state.sellBonus = 1.5;
    },
  },

  // ════════ SKIN 3: BUSINESS FEMALE ════════
  businessFemale: {
    id: 'businessFemale',
    name: 'ESTRATEGISTA',
    desc: 'Recarrega 25% mais rápido. Munição de reserva inicial +30%.',
    icon: '🎯',
    apply: (state, _player) => {
      state.reloadSpeedMult = 1.25;
      state.reserveAmmoBonus = 0.30;
    },
  },

  // ════════ SKINS EXTRAS (desbloqueáveis no futuro) ════════
  medic: {
    id: 'medic',
    name: 'MÉDICO DE CAMPO',
    desc: 'Cura de onda +50%. Sangramento é curado automaticamente.',
    icon: '⚕️',
    apply: (state, _player) => {
      state.healMult = 1.5;
      state.autoBandage = true;
    },
  },
  soldier: {
    id: 'soldier',
    name: 'VETERANO',
    desc: '+15% dano com todas as armas. Recuo das armas -30%.',
    icon: '🎖️',
    apply: (state, _player) => {
      state.damageMult += 0.15;
      state.recoilMult = 0.70;
    },
  },
  athlete: {
    id: 'athlete',
    name: 'ATLETA',
    desc: 'Ao matar, stamina enche por 3s. Corrida +15% mais rápida.',
    icon: '🏃',
    apply: (state, _player) => {
      state.sprintSpeedBonus = 1.15;
      state.killRefillsStamina = true;
      state.killStaminaDuration = 3.0;
    },
  },
  engineer: {
    id: 'engineer',
    name: 'ENGENHEIRO',
    desc: 'Brazeiro dura +50%. Combustível ganho nas ondas em dobro.',
    icon: '🔧',
    apply: (state, _player) => {
      state.brazierDurationMult = 1.5;
      state.brazierFuelBonus = 2;
    },
  },
};

// ============================================================
// RESETA TODOS OS CAMPOS MODIFICÁVEIS PELAS PERKS
// ============================================================
const MODIFIABLE_FIELDS = {
  reviveSpeedMult: 1,
  reviveHealBonus: 0,
  shopDiscount: 1,
  sellBonus: 1,
  reloadSpeedMult: 1,
  reserveAmmoBonus: 0,
  healMult: 1,
  autoBandage: false,
  recoilMult: 1,
  sprintSpeedBonus: 1,
  killRefillsStamina: false,
  killStaminaDuration: 0,
  brazierDurationMult: 1,
  brazierFuelBonus: 1,
};

// ============================================================
// API PÚBLICA
// ============================================================

/**
 * Retorna a definição da perk (nunca null).
 */
export function getPerk(skinId) {
  return PERKS[skinId] || PERKS.default;
}

/**
 * Reseta todos os campos modificáveis e aplica a perk da skin.
 * Retorna o objeto da perk aplicada.
 */
export function applyPerk(skinId, state, player) {
  // 1. Reset de todos os campos modificáveis
  for (const key in MODIFIABLE_FIELDS) {
    state[key] = MODIFIABLE_FIELDS[key];
  }

  // 2. Aplica a perk
  const perk = getPerk(skinId);
  perk.apply(state, player);
  state.activePerk = perk;

  return perk;
}

/**
 * Lista todas as perks disponíveis.
 */
export function listPerks() {
  return Object.values(PERKS);
}

/**
 * Lista apenas as perks disponíveis para skins jogáveis.
 */
export function listPlayablePerks() {
  const PLAYABLE_SKINS = ['default', 'angel', 'businessMale', 'businessFemale'];
  return PLAYABLE_SKINS.map(id => PERKS[id]).filter(Boolean);
}

/**
 * Aplica os efeitos de "reset" sem mudar de perk — útil para restart.
 */
export function resetPerkState(state) {
  for (const key in MODIFIABLE_FIELDS) {
    state[key] = MODIFIABLE_FIELDS[key];
  }
  state.activePerk = null;
}
