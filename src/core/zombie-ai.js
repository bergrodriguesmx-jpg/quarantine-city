import * as THREE from 'three';

// ============================================================
// ZOMBIE AI STATE MACHINE (ZB2-inspired)
// Estados: unaware | aware | combat | stagger | vaulting
// Adiciona percepção de ruído, alerta em grupo, e stagger.
// ============================================================

const AGGRO_RADIUS = 8;
const ALERT_DURATION = 3;
const ATTACK_COOLDOWN = 1.2;

export function initZombieAIState(z) {
  z.aiState = 'unaware';
  z.aiAlertUntil = 0;
  z.aiLastSeen = 0;
  z.aiStaggerUntil = 0;
  z.aiAttackCd = Math.random() * ATTACK_COOLDOWN;
}

// Propaga alerta para zumbis próximos quando um é atingido
export function alertNearbyZombies(zombies, hitPos, radius = 8) {
  const now = performance.now() / 1000;
  const r2 = radius * radius;
  for (const z of zombies) {
    if (z.health <= 0) continue;
    const dx = z.mesh.position.x - hitPos.x;
    const dz = z.mesh.position.z - hitPos.z;
    if (dx*dx + dz*dz < r2) {
      z.aiState = 'aware';
      z.aiAlertUntil = now + ALERT_DURATION;
    }
  }
}

export function staggerZombie(z, duration = 0.35) {
  const now = performance.now() / 1000;
  z.aiStaggerUntil = now + duration;
}

export function updateZombieAIState(z, player, dt) {
  if (z.health <= 0) return;
  const now = performance.now() / 1000;

  // Stagger trava tudo
  if (z.aiStaggerUntil > now) {
    z.aiState = 'stagger';
    return;
  }

  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  const dist = Math.sqrt(dx*dx + dz*dz);

  if (z.aiState === 'unaware') {
    if (dist < AGGRO_RADIUS) {
      z.aiState = 'aware';
      z.aiAlertUntil = now + ALERT_DURATION;
    }
  } else if (z.aiState === 'aware') {
    if (dist < z.attackRange + 0.5) z.aiState = 'combat';
    else if (dist > AGGRO_RADIUS * 2 && now > z.aiAlertUntil) z.aiState = 'unaware';
  } else if (z.aiState === 'combat') {
    if (dist > z.attackRange + 1.5) z.aiState = 'aware';
  }
}

// Retorna multiplicador de velocidade por estado
export function getAIMultiplier(z) {
  if (z.aiState === 'stagger') return 0;
  if (z.aiState === 'aware')   return 1.15;
  if (z.aiState === 'combat')  return 1.0;
  return 0.7; // unaware
}

// Cor tint para debug visual (opcional)
export function getAITint(z) {
  if (z.aiState === 'aware')   return 0xffff00;
  if (z.aiState === 'combat')  return 0xff0000;
  if (z.aiState === 'stagger') return 0x0000ff;
  return null;
}
