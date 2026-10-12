// ============================================================
// zombie-types.js
// Definição completa dos tipos de zumbi do Zumbi Blocks 2.
// ============================================================

export const ZOMBIE_TYPES = {
  // ════════ TIER 1 ════════
  pt: {
    tier: 1, weight: 42, variant: 'normal',
    hpMul: 1.00, dmgMul: 1.00, speedMul: 1.00, xpMul: 1.00, coinMul: 1.00,
    scale: 1.00, attackRange: 1.6, cooldown: 1.20,
    tint: 0xffffff,
  },
  pt_donkey: {
    tier: 1, weight: 28, variant: 'donkey',
    hpMul: 0.75, dmgMul: 0.85, speedMul: 1.35, xpMul: 1.30, coinMul: 1.30,
    scale: 0.95, attackRange: 1.4, cooldown: 0.95,
    tint: 0xffeebb,
  },
  judge: {
    tier: 1, weight: 22, variant: 'judge',
    hpMul: 1.80, dmgMul: 1.60, speedMul: 0.72, xpMul: 2.00, coinMul: 2.20,
    scale: 1.12, attackRange: 1.9, cooldown: 1.40,
    tint: 0xffd0d0,
  },
  runner: {
    tier: 1, weight: 6, variant: 'normal',
    hpMul: 0.55, dmgMul: 0.75, speedMul: 2.20, xpMul: 1.50, coinMul: 1.70,
    scale: 0.85, attackRange: 1.3, cooldown: 0.85,
    tint: 0xd0ffd0,
  },
  crawler: {
    tier: 1, weight: 4, variant: 'normal',
    hpMul: 0.60, dmgMul: 0.55, speedMul: 0.70, xpMul: 1.40, coinMul: 1.60,
    scale: 0.85, attackRange: 1.1, cooldown: 1.10,
    tint: 0xcccccc,
    startsCrawling: true,
  },

  // ════════ TIER 2 ════════
  worker: {
    tier: 2, weight: 16, variant: 'worker', headgear: 'cap_brown',
    hpMul: 1.80, dmgMul: 1.30, speedMul: 0.85, xpMul: 2.20, coinMul: 2.20,
    scale: 1.02, attackRange: 1.6, cooldown: 1.30,
    tint: 0xd0a070,
  },
  miner: {
    tier: 2, weight: 12, variant: 'miner', headgear: 'helmet_yellow',
    hpMul: 2.40, dmgMul: 1.65, speedMul: 0.70, xpMul: 2.80, coinMul: 2.60,
    scale: 1.05, attackRange: 1.7, cooldown: 1.50,
    tint: 0xc0c0c0,
  },
  spitter: {
    tier: 2, weight: 8, variant: 'normal',
    hpMul: 1.50, dmgMul: 0.90, speedMul: 0.80, xpMul: 3.00, coinMul: 3.00,
    scale: 1.00, attackRange: 8.0, cooldown: 2.00,
    tint: 0xaaffaa,
    ranged: true,
    projectileType: 'tox',
  },
  boomer: {
    tier: 2, weight: 6, variant: 'normal',
    hpMul: 2.20, dmgMul: 0.60, speedMul: 1.15, xpMul: 3.20, coinMul: 3.20,
    scale: 1.10, attackRange: 1.5, cooldown: 1.20,
    tint: 0x66ff44,
    explodesOnDeath: true,
    explosionRadius: 4.0,
    explosionDamage: 60,
  },

  // ════════ TIER 3 ════════
  security: {
    tier: 3, weight: 8, variant: 'security', headgear: 'cap_black',
    hpMul: 3.00, dmgMul: 2.10, speedMul: 1.10, xpMul: 4.20, coinMul: 4.00,
    scale: 1.06, attackRange: 1.7, cooldown: 1.10,
    tint: 0xa0a8c0,
  },
  combat: {
    tier: 3, weight: 6, variant: 'combat', headgear: 'balaclava',
    hpMul: 3.60, dmgMul: 2.50, speedMul: 1.22, xpMul: 5.20, coinMul: 5.00,
    scale: 1.00, attackRange: 1.6, cooldown: 0.95,
    tint: 0xb0b0a0,
  },
  brute: {
    tier: 3, weight: 4, variant: 'combat', headgear: 'balaclava',
    hpMul: 6.00, dmgMul: 3.20, speedMul: 0.65, xpMul: 6.00, coinMul: 6.00,
    scale: 1.30, attackRange: 1.9, cooldown: 1.60,
    tint: 0x808080,
    knockbackResist: 0.7,
    heavySlam: true,
  },

  // ════════ BOSSES ════════
  riot: {
    tier: 4, weight: 0, variant: 'riot', boss: true,
    hpMul: 14, dmgMul: 3.0, speedMul: 0.70, xpMul: 25, coinMul: 25,
    scale: 1.45, attackRange: 2.0, cooldown: 1.30,
    tint: 0xa0a0ff,
  },
  queen: {
    tier: 4, weight: 0, variant: 'queen', boss: true,
    hpMul: 10, dmgMul: 2.6, speedMul: 1.05, xpMul: 30, coinMul: 30,
    scale: 1.30, attackRange: 1.9, cooldown: 1.10,
    tint: 0xffaaff,
    summon: true,
    flight: true,
  },
  reaper: {
    tier: 4, weight: 0, variant: 'reaper', boss: true,
    hpMul: 12, dmgMul: 4.0, speedMul: 1.40, xpMul: 40, coinMul: 40,
    scale: 1.25, attackRange: 2.1, cooldown: 0.90,
    tint: 0x6060ff,
    teleport: true,
  },
};

export const BOSS_ROTATION = ['riot', 'queen', 'reaper'];

// ════════ SELEÇÃO POR ONDA ════════
export function pickZombieType(wave) {
  const maxTier = wave >= 7 ? 3 : (wave >= 3 ? 2 : 1);
  const entries = Object.entries(ZOMBIE_TYPES)
    .filter(([, v]) => !v.boss && v.weight > 0 && v.tier <= maxTier);

  const total = entries.reduce((s, [, v]) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) {
    r -= v.weight;
    if (r <= 0) return k;
  }
  return 'pt';
}
