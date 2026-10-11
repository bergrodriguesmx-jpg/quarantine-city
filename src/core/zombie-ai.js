// ============================================================
// zombie-ai.js — v2.1
// Estado, percepção e give-up baseados no ZB2.
// COM GUARDS: nunca crasha se world não for passado.
// ============================================================

import * as THREE from 'three';

// ============================================================
// PARÂMETROS (extraídos do ZombieAISettings.cs)
// ============================================================
const MAX_SIGHT_DIST = 35;           // ZB2: maxSightDistance = 35
const COMBAT_DIST = 10;              // ZB2: zombieCombatDistance = 10
const FOV_DOT_MIN = -0.5;            // ~120° cone à frente
const COMBAT_DOT_MIN = 0.3;          // ~72° cone pra entrar em combate
const ALERT_DURATION = 3;
const FIND_TARGET_FREQ = 3;          // ZB2: zombieFindTargetFreq = 3

// Give-up (extraído de ZombieGiveupSettings.cs)
const GIVEUP = {
  tier1: { maxTime: 8,  neverDist: 5,  uncondMin: 15, uncondMax: 25, transition: 4 },
  tier2: { maxTime: 10, neverDist: 6,  uncondMin: 18, uncondMax: 30, transition: 5 },
  tier3: { maxTime: 12, neverDist: 8,  uncondMin: 22, uncondMax: 35, transition: 6 },
};

// ============================================================
// INIT
// ============================================================
export function initZombieAIState(z) {
  z.aiState = 'unaware';
  z.aiAlertUntil = 0;
  z.aiStaggerUntil = 0;
  z.aiAttackCd = Math.random() * 1.2;

  // Percepção
  z.aiTargetTime = 0;          // Tempo perseguindo o alvo atual
  z.aiGiveUpTimer = 0;         // Tempo sem ver o alvo
  z.aiReachTimer = Math.random();
  z.aiVisible = false;
  z.aiReachable = false;
  z.aiDistance = 999;
  z.aiDot = 1;

  // Layer tier — define qual give-up usar
  const tier = zombieTier(z.typeKey);
  z.aiGiveUp = GIVEUP[tier] || GIVEUP.tier1;
}

function zombieTier(typeKey) {
  if (typeKey === 'pt' || typeKey === 'pt_donkey' || typeKey === 'judge' || typeKey === 'runner') return 'tier1';
  if (typeKey === 'worker' || typeKey === 'miner') return 'tier2';
  return 'tier3';
}

// ============================================================
// ALERTA EM GRUPO
// ============================================================
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
  z.aiStaggerUntil = performance.now() / 1000 + duration;
}

// ============================================================
// LINE OF SIGHT (contra paredes) — com guarda defensiva
// ============================================================
function losBlocked(fromX, fromZ, toX, toZ, world) {
  // ✅ GUARD: sem world ou sem colliders → não bloqueia
  if (!world || !Array.isArray(world.wallColliders)) return false;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.5) return false;

  const steps = Math.ceil(dist / 0.4);
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let x = fromX, z = fromZ;

  for (let i = 0; i < steps; i++) {
    x += stepX;
    z += stepZ;

    for (let w = 0; w < world.wallColliders.length; w++) {
      const b = world.wallColliders[w];
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
  }
  return false;
}

// ============================================================
// PERCEPÇÃO — com guarda defensiva
// ============================================================
function updatePerception(z, player, world) {
  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  z.aiDistance = dist;

  // Longe demais nem testa
  if (dist > MAX_SIGHT_DIST) {
    z.aiVisible = false;
    z.aiReachable = false;
    return;
  }

  // ✅ GUARD: sem world → fallback simples (só distância)
  if (!world || !Array.isArray(world.wallColliders)) {
    z.aiVisible = true;
    z.aiReachable = true;
    return;
  }

  // Direção que o zumbi está olhando
  const fx = -Math.sin(z.mesh.rotation.y);
  const fz = -Math.cos(z.mesh.rotation.y);
  const nx = dx / Math.max(dist, 0.001);
  const nz = dz / Math.max(dist, 0.001);
  const dot = fx * nx + fz * nz;
  z.aiDot = dot;

  // Boss vê em 360°
  const isBoss = !!z.isBoss;
  const dotOK = isBoss || dot > FOV_DOT_MIN;

  // Linha de visão
  const los = !losBlocked(z.mesh.position.x, z.mesh.position.z, player.position.x, player.position.z, world);

  z.aiVisible = dotOK && los;
  z.aiReachable = los && dist < MAX_SIGHT_DIST;
}

// ============================================================
// UPDATE PRINCIPAL — aceita world opcional
// ============================================================
export function updateZombieAIState(z, player, dt, world) {
  if (z.health <= 0) return;
  const now = performance.now() / 1000;

  // Stagger trava tudo
  if (z.aiStaggerUntil > now) {
    z.aiState = 'stagger';
    return;
  }

  // ─── Atualiza percepção (a cada ~0.33s) ───
  z.aiReachTimer = (z.aiReachTimer || 0) + dt * FIND_TARGET_FREQ;
  if (z.aiReachTimer >= 1) {
    updatePerception(z, player, world);
    z.aiReachTimer = Math.random() * -0.2;
  }

  const dist = z.aiDistance;
  const visible = z.aiVisible;
  const dot = z.aiDot;

  // ─── Máquina de estados ───
  if (z.aiState === 'unaware') {
    if (visible && dist < MAX_SIGHT_DIST) {
      z.aiState = 'aware';
      z.aiAlertUntil = now + ALERT_DURATION;
      z.aiTargetTime = 0;
      z.aiGiveUpTimer = 0;
    }
  } else if (z.aiState === 'aware') {
    z.aiTargetTime += dt;
    if (visible && dist < COMBAT_DIST && dot > COMBAT_DOT_MIN) {
      z.aiState = 'combat';
    } else if (!visible && now > z.aiAlertUntil) {
      z.aiState = 'unaware';
      z.aiTargetTime = 0;
      z.aiGiveUpTimer = 0;
    }
  } else if (z.aiState === 'combat') {
    z.aiTargetTime += dt;
    if (dist > COMBAT_DIST + 1.5 || !visible) {
      z.aiState = 'aware';
    }
  }

  // ─── Give-up (só em aware/combat) ───
  if (z.aiState === 'aware' || z.aiState === 'combat') {
    const g = z.aiGiveUp || GIVEUP.tier1;

    // Nunca desiste se muito perto
    if (dist > g.neverDist) {
      // Fora do alcance incondicional?
      const t = Math.min(1, z.aiTargetTime / g.transition);
      const uncondDist = g.uncondMax + (g.uncondMin - g.uncondMax) * t;
      if (dist > uncondDist) {
        giveUp(z);
        return;
      }

      // Sem visão nem alcançabilidade acumula timer
      if (!visible && !z.aiReachable) {
        z.aiGiveUpTimer += dt;
        if (z.aiGiveUpTimer > g.maxTime) {
          giveUp(z);
          return;
        }
      } else {
        z.aiGiveUpTimer = Math.max(0, z.aiGiveUpTimer - dt * 2);
      }
    } else {
      z.aiGiveUpTimer = 0;
    }
  }
}

function giveUp(z) {
  z.aiState = 'unaware';
  z.aiAlertUntil = 0;
  z.aiTargetTime = 0;
  z.aiGiveUpTimer = 0;
  z.aiGiveUpCooldown = performance.now() / 1000 + 3;
}

// ============================================================
// MULTIPLICADOR DE VELOCIDADE
// ============================================================
export function getAIMultiplier(z) {
  if (z.aiState === 'stagger') return 0;
  if (z.aiState === 'aware')   return 1.15;
  if (z.aiState === 'combat')  return 1.0;
  return 0.7;
}
