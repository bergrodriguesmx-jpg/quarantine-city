// ============================================================
// zombie-ai.js — v4.0
// Adiciona "smell" (detecção sem LOS) + velocidade de perseguição
// ============================================================

import * as THREE from 'three';

export const ZombieState = Object.freeze({
  IDLE:    'IDLE',
  PATROL:  'PATROL',
  ALERT:   'ALERT',
  CHASE:   'CHASE',
  ATTACK:  'ATTACK',
  STAGGER: 'STAGGER',
  DEAD:    'DEAD',
});

const CFG = {
  sight: {
    maxDistance: 55,
    fovDot: -0.5,
    combatDot: 0.3,
    checkFreq: 4,           // checa 4x/s (era 3x)
  },
  // 🎯 NOVO: smell — detecta o player sem precisar de linha de visão
  smell: {
    radius: 22,             // cheira sangue até 22m
  },
  hearing: {
    defaultRadius: 18,
    silencedRadius: 6,
    alertMemorySec: 8,
  },
  giveUp: {
    tier1: { maxTime: 12, neverDist: 5,  uncondMin: 15, uncondMax: 25, transition: 4 },
    tier2: { maxTime: 15, neverDist: 6,  uncondMin: 18, uncondMax: 30, transition: 5 },
    tier3: { maxTime: 18, neverDist: 8,  uncondMin: 22, uncondMax: 35, transition: 6 },
  },
  patrol: {
    idleToPatrolChance: 0.008,
    patrolDurationMin: 4,
    patrolDurationMax: 9,
    patrolRadius: 12,
  },
  attack: {
    windupTime: 0.30,
    cooldownBase: 1.2,
    lungeRange: 2.2,
    lungeSpeed: 8,
  },
  combat: {
    strafe: true,
    strafeSpeed: 2.5,
    strafeChangeMin: 1.5,
    strafeChangeMax: 3.0,
    backOffHpFrac: 0.25,
    backOffDist: 4.5,
  },
};

function zombieTier(typeKey) {
  if (typeKey === 'pt' || typeKey === 'pt_donkey' || typeKey === 'judge' ||
      typeKey === 'runner' || typeKey === 'crawler') return 'tier1';
  if (typeKey === 'worker' || typeKey === 'miner' || typeKey === 'spitter') return 'tier2';
  return 'tier3';
}

export function initZombieAIState(z) {
  z.aiState = ZombieState.IDLE;
  z.aiAlertUntil = 0;
  z.aiStaggerUntil = 0;
  z.aiAttackCd = Math.random() * 1.5;

  z.aiTargetTime = 0;
  z.aiGiveUpTimer = 0;
  z.aiReachTimer = Math.random();
  z.aiVisible = false;
  z.aiReachable = false;
  z.aiDistance = 999;
  z.aiDot = 1;
  z.aiLastKnownPos = null;

  z.aiPatrolTarget = null;
  z.aiPatrolUntil = 0;
  z.aiIdleTimer = Math.random() * 1.5;  // era *3, agora mais curto

  z.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
  z.aiStrafeTimer = 1 + Math.random() * 2;
  z.aiBackedOff = false;

  z.aiGiveUp = CFG.giveUp[zombieTier(z.typeKey)] || CFG.giveUp.tier1;
}

export function alertNearbyZombies(zombies, hitPos, radius = 8) {
  const now = performance.now() / 1000;
  const r2 = radius * radius;
  for (const z of zombies) {
    if (z.health <= 0 || z.aiState === ZombieState.DEAD) continue;
    const dx = z.mesh.position.x - hitPos.x;
    const dz = z.mesh.position.z - hitPos.z;
    if (dx * dx + dz * dz < r2) {
      if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
        z.aiState = ZombieState.ALERT;
        z.aiAlertUntil = now + 3;
        z.aiLastKnownPos = hitPos.clone();
      }
    }
  }
}

export function staggerZombie(z, duration = 0.35) {
  z.aiState = ZombieState.STAGGER;
  z.aiStaggerUntil = performance.now() / 1000 + duration;
}

export function hearNoise(z, noisePos, radius) {
  if (z.health <= 0 || z.aiState === ZombieState.DEAD) return;
  const dx = z.mesh.position.x - noisePos.x;
  const dz = z.mesh.position.z - noisePos.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return;

  const now = performance.now() / 1000;
  if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
    z.aiState = ZombieState.ALERT;
    z.aiAlertUntil = now + 5;
    z.aiLastKnownPos = noisePos.clone();
  }
}

function losBlocked(fromX, fromZ, toX, toZ, world) {
  if (!world || !Array.isArray(world.wallColliders)) return false;

  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.5) return false;

  const steps = Math.ceil(dist / 0.5);
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let x = fromX, z = fromZ;

  for (let i = 0; i < steps; i++) {
    x += stepX; z += stepZ;
    for (let w = 0; w < world.wallColliders.length; w++) {
      const b = world.wallColliders[w];
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
  }
  return false;
}

function updatePerception(z, player, world) {
  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  z.aiDistance = dist;

  // 🎯 CHEIRO: sempre detecta o player a curta distância,
  // mesmo através de paredes. Impede o zumbi de ficar burro
  // quando o player está logo atrás de uma parede.
  if (dist < CFG.smell.radius) {
    z.aiVisible = true;
    z.aiReachable = true;
    z.aiDot = 1;
    return;
  }

  if (dist > CFG.sight.maxDistance) {
    z.aiVisible = false;
    z.aiReachable = false;
    return;
  }

  if (!world || !Array.isArray(world.wallColliders)) {
    z.aiVisible = true;
    z.aiReachable = true;
    return;
  }

  const fx = -Math.sin(z.mesh.rotation.y);
  const fz = -Math.cos(z.mesh.rotation.y);
  const nx = dx / Math.max(dist, 0.001);
  const nz = dz / Math.max(dist, 0.001);
  const dot = fx * nx + fz * nz;
  z.aiDot = dot;

  const isBoss = !!z.isBoss;
  const dotOK = isBoss || dot > CFG.sight.fovDot;

  const los = !losBlocked(z.mesh.position.x, z.mesh.position.z, player.position.x, player.position.z, world);

  z.aiVisible = dotOK && los;
  z.aiReachable = los && dist < CFG.sight.maxDistance;
}

export function updateZombieAIState(z, player, dt, world) {
  if (z.health <= 0) return;
  const now = performance.now() / 1000;

  if (z.aiState === ZombieState.STAGGER) {
    if (now >= z.aiStaggerUntil) {
      z.aiState = ZombieState.CHASE;
      z.aiAlertUntil = now + 3;
    }
    return;
  }

  z.aiReachTimer = (z.aiReachTimer || 0) + dt * CFG.sight.checkFreq;
  if (z.aiReachTimer >= 1) {
    updatePerception(z, player, world);
    z.aiReachTimer = Math.random() * -0.2;
  }

  const dist = z.aiDistance;
  const visible = z.aiVisible;
  const dot = z.aiDot;

  switch (z.aiState) {
    case ZombieState.IDLE: {
      z.aiIdleTimer -= dt;
      // 🎯 Detecta o player se a distância < maxDistance (visão OU cheiro)
      if (dist < CFG.sight.maxDistance) {
        z.aiState = ZombieState.CHASE;
        z.aiAlertUntil = now + 5;
        z.aiTargetTime = 0;
        z.aiGiveUpTimer = 0;
      } else if (z.aiIdleTimer <= 0) {
        z.aiState = ZombieState.PATROL;
        z.aiPatrolUntil = now + CFG.patrol.patrolDurationMin +
          Math.random() * (CFG.patrol.patrolDurationMax - CFG.patrol.patrolDurationMin);
        pickPatrolTarget(z);
      }
      break;
    }

    case ZombieState.PATROL: {
      if (dist < CFG.sight.maxDistance) {
        z.aiState = ZombieState.CHASE;
        z.aiAlertUntil = now + 5;
        z.aiTargetTime = 0;
        z.aiGiveUpTimer = 0;
        break;
      }
      if (z.aiPatrolTarget) {
        const pdx = z.aiPatrolTarget.x - z.mesh.position.x;
        const pdz = z.aiPatrolTarget.z - z.mesh.position.z;
        if (pdx * pdx + pdz * pdz < 1.5 * 1.5) {
          z.aiState = ZombieState.IDLE;
          z.aiIdleTimer = 1 + Math.random() * 2;
          z.aiPatrolTarget = null;
        }
      }
      if (now > z.aiPatrolUntil) {
        z.aiState = ZombieState.IDLE;
        z.aiIdleTimer = 1 + Math.random() * 2;
        z.aiPatrolTarget = null;
      }
      break;
    }

    case ZombieState.ALERT: {
      if (visible) {
        z.aiState = ZombieState.CHASE;
        z.aiAlertUntil = now + 5;
        z.aiTargetTime = 0;
        z.aiGiveUpTimer = 0;
        break;
      }
      if (now > z.aiAlertUntil) {
        z.aiState = ZombieState.IDLE;
        z.aiIdleTimer = 1 + Math.random() * 2;
      }
      break;
    }

    case ZombieState.CHASE: {
      z.aiTargetTime += dt;

      if (visible && dist < 10 && dot > CFG.sight.combatDot) {
        z.aiAlertUntil = now + 3;
        z.aiGiveUpTimer = 0;
        if (dist < (z.attackRange || 1.6) + 0.4) {
          z.aiState = ZombieState.ATTACK;
        }
      }

      const g = z.aiGiveUp;
      if (dist > g.neverDist) {
        const t = Math.min(1, z.aiTargetTime / g.transition);
        const uncondDist = g.uncondMax + (g.uncondMin - g.uncondMax) * t;
        if (dist > uncondDist) { giveUp(z); break; }

        if (!visible && !z.aiReachable) {
          z.aiGiveUpTimer += dt;
          if (z.aiGiveUpTimer > g.maxTime) { giveUp(z); break; }
        } else {
          z.aiGiveUpTimer = Math.max(0, z.aiGiveUpTimer - dt * 2);
        }
      } else {
        z.aiGiveUpTimer = 0;
      }
      break;
    }

    case ZombieState.ATTACK: {
      if (dist > (z.attackRange || 1.6) + 1.5) {
        z.aiState = ZombieState.CHASE;
      }
      break;
    }
  }

  if (z.aiState === ZombieState.CHASE || z.aiState === ZombieState.ATTACK) {
    z.aiStrafeTimer -= dt;
    if (z.aiStrafeTimer <= 0) {
      z.aiStrafeDir *= -1;
      z.aiStrafeTimer = CFG.combat.strafeChangeMin +
        Math.random() * (CFG.combat.strafeChangeMax - CFG.combat.strafeChangeMin);
    }

    const hpFrac = z.health / z.maxHealth;
    if (hpFrac < CFG.combat.backOffHpFrac && dist < CFG.combat.backOffDist) {
      z.aiBackedOff = true;
    } else if (dist > CFG.combat.backOffDist + 2) {
      z.aiBackedOff = false;
    }
  }
}

function pickPatrolTarget(z) {
  const angle = Math.random() * Math.PI * 2;
  const r = 4 + Math.random() * CFG.patrol.patrolRadius;
  z.aiPatrolTarget = new THREE.Vector3(
    z.mesh.position.x + Math.cos(angle) * r,
    0,
    z.mesh.position.z + Math.sin(angle) * r,
  );
}

function giveUp(z) {
  z.aiState = ZombieState.IDLE;
  z.aiIdleTimer = 1 + Math.random() * 2;
  z.aiAlertUntil = 0;
  z.aiTargetTime = 0;
  z.aiGiveUpTimer = 0;
  z.aiLastKnownPos = null;
  z.aiPatrolTarget = null;
}

// 🎯 Multiplicadores atualizados (perseguição mais agressiva)
export function getAIMultiplier(z) {
  if (z.aiState === ZombieState.STAGGER) return 0;
  if (z.aiState === ZombieState.CHASE)   return 1.25;   // era 1.15
  if (z.aiState === ZombieState.ATTACK)  return 1.0;    // era 0.9
  if (z.aiState === ZombieState.ALERT)   return 1.10;   // era 1.05
  if (z.aiState === ZombieState.PATROL)  return 0.55;
  return 0.4;
}

export function getDesiredDirection(z, player) {
  if (z.aiState === ZombieState.CHASE || z.aiState === ZombieState.ATTACK) {
    const dx = player.position.x - z.mesh.position.x;
    const dz = player.position.z - z.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    let nx = dx / dist;
    let nz = dz / dist;

    if (z.aiBackedOff) { nx = -nx; nz = -nz; }

    if (CFG.combat.strafe && dist < 6 && dist > 1.8) {
      const px = -nz * z.aiStrafeDir * 0.4;
      const pz = nx * z.aiStrafeDir * 0.4;
      nx += px; nz += pz;
      const len = Math.hypot(nx, nz) || 1;
      nx /= len; nz /= len;
    }
    return { x: nx, z: nz };
  }

  if (z.aiState === ZombieState.ALERT && z.aiLastKnownPos) {
    const dx = z.aiLastKnownPos.x - z.mesh.position.x;
    const dz = z.aiLastKnownPos.z - z.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    return { x: dx / dist, z: dz / dist };
  }

  if (z.aiState === ZombieState.PATROL && z.aiPatrolTarget) {
    const dx = z.aiPatrolTarget.x - z.mesh.position.x;
    const dz = z.aiPatrolTarget.z - z.mesh.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    return { x: dx / dist, z: dz / dist };
  }

  return { x: 0, z: 0 };
}
