// ============================================================
// perks.js — Sistema de perks por skin
// Cada skin concede uma habilidade passiva única.
// ============================================================

export const PERKS = {
  default: {
    id: 'default',
    name: 'SOBREVIVENTE',
    desc: 'Sem bônus. A experiência pura.',
    icon: '👤',
    apply: (_state, _player) => {},
  },
  angel: {
    id: 'angel',
    name: 'ANJO DA GUARDA',
    desc: 'Velocidade de revive +60% e cura 20% mais ao se levantar.',
    icon: '😇',
    apply: (state, _player) => {
      state.reviveSpeedMult = 1.6;
      state.reviveHealBonus = 0.2;
    },
  },
  businessMale: {
    id: 'businessMale',
    name: 'NEGOCIADOR',
    desc: 'Todos os preços -20%. Vender itens rende +50%.',
    icon: '💼',
    apply: (state, _player) => {
      state.shopDiscount = 0.8;
      state.sellBonus = 1.5;
    },
  },
  businessFemale: {
    id: 'businessFemale',
    name: 'ESTRATEGISTA',
    desc: 'Recarrega 25% mais rápido. Munição de reserva +30%.',
    icon: '🎯',
    apply: (state, _player) => {
      state.reloadSpeedMult = 1.25;
      state.reserveAmmoBonus = 0.3;
    },
  },
  // Skins extras (desbloqueáveis via progresso)
  medic: {
    id: 'medic',
    name: 'MÉDICO DE CAMPO',
    desc: 'Kit médico cura 50% a mais. Reduz sangramento automaticamente.',
    icon: '⚕️',
    apply: (state, _player) => {
      state.healMult = 1.5;
      state.autoBandage = true;
    },
  },
  soldier: {
    id: 'soldier',
    name: 'VETERANO',
    desc: '+15% dano com todas as armas. Recuo -30%.',
    icon: '🎖️',
    apply: (state, _player) => {
      state.damageMult += 0.15;
      state.recoilMult = 0.7;
    },
  },
  athlete: {
    id: 'athlete',
    name: 'ATLETA',
    desc: 'Stamina infinita por 3s ao matar. Corrida +15% mais rápida.',
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
    desc: 'Brazeiro dura +50% e combustível ganho em dobro.',
    icon: '🔧',
    apply: (state, _player) => {
      state.brazierDurationMult = 1.5;
      state.brazierFuelBonus = 2;
    },
  },
};

export function getPerk(skinId) {
  return PERKS[skinId] || PERKS.default;
}

export function applyPerk(skinId, state, player) {
  const perk = getPerk(skinId);
  // Reset dos campos modificáveis
  state.reviveSpeedMult = 1;
  state.reviveHealBonus = 0;
  state.shopDiscount = 1;
  state.sellBonus = 1;
  state.reloadSpeedMult = 1;
  state.reserveAmmoBonus = 0;
  state.healMult = 1;
  state.autoBandage = false;
  state.recoilMult = 1;
  state.sprintSpeedBonus = 1;
  state.killRefillsStamina = false;
  state.killStaminaDuration = 0;
  state.brazierDurationMult = 1;
  state.brazierFuelBonus = 1;
  // Aplica os do perk
  perk.apply(state, player);
  state.activePerk = perk;
  return perk;
}

export function listPerks() {
  return Object.values(PERKS);
}
