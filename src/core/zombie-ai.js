// ============================================================
// zombie-ai.js — v6.0 "FOV perception + spotting"
// ============================================================
// NOVO v6.0:
//   • Percepção por campo de visão (FOV cone) com dot product
//   • Spotting delay: zumbi leva N segundos pra "ver" o player
//     (não detecta instantâneo ao entrar no cone)
//   • `z.spotProgress` 0..1 — buildup quando player está no cone
//   • FOV visualizado por tipo (visionRange, fovDot, spottingTime)
//   • Ataque dispara quando `spotProgress` atinge 1
//   • Cansaço visual: se player sai do cone, perde detecção aos poucos
//   • Audição (hearNoise) mantida como atalho pra detecção rápida
//   • Memória de último ponto conhecido (lastKnownPos)
//   • Estado "SUSPICIOUS" antes de CHASE (opcional via flag)
// ============================================================

import * as THREE from 'three';

export const ZombieState = Object.freeze({
  IDLE:          'IDLE',
  PATROL:        'PATROL',
  SUSPICIOUS:    'SUSPICIOUS',
  ALERT:         'ALERT',
  CHASE:         'CHASE',
  ATTACK:        'ATTACK',
  ATTACK_RANGED: 'ATTACK_RANGED',
  SUICIDE_RUN:   'SUICIDE_RUN',
  SPRINT:        'SPRINT',
  RECOIL:        'RECOIL',
  STAGGER:       'STAGGER',
  DEAD:          'DEAD',
});

// ─── Defaults (sobrescritos por zombie-types.js) ───
const DEFAULT_PERCEPTION = {
  visionRange:   42,      // distância máxima de visão
  fovDot:        -0.15,   // cosseno do ângulo do cone (menor = mais largo)
  spottingTime:  0.55,    // segundos pra ver 100%
  memoryTime:    4.0,     // segundos que lembra do player sem ver
  hearingRange:  18,      // raio de audição
  closeSmellRadius: 6,    // "cheiro" a curta distância (detecção instantânea)
};

const CFG = {
  giveUp: {
    tier1: { maxTime: 12, neverDist: 5,  uncondMin: 15, uncondMax: 25, transition: 4 },
    tier2: { maxTime: 15, neverDist: 6,  uncondMin: 18, uncondMax: 30, transition: 5 },
    tier3: { maxTime: 18, neverDist: 8,  uncondMin: 22, uncondMax: 35, transition: 6 },
  },
  patrol: {
    patrolDurationMin: 4,
    patrolDurationMax: 9,
    patrolRadius: 12,
  },
  combat: {
    strafe: true,
    strafeChangeMin: 1.5,
    strafeChangeMax: 3.0,
    backOffHpFrac: 0.25,
    backOffDist: 4.5,
  },
};

function zombieTier(typeKey) {
  if (typeKey === 'pt' || typeKey === 'pt_donkey' || typeKey === 'judge' ||
      typeKey === 'runner' || typeKey === 'crawler') return 'tier1';
  if (typeKey === 'worker' || typeKey === 'miner' || typeKey === 'spitter' ||
      typeKey === 'boomer') return 'tier2';
  return 'tier3';
}

// ════════════════════════════════════════════════════════════
// CALLBACKS EXTERNOS
// ════════════════════════════════════════════════════════════
let _spawnToxProjectile = null;
let _onBoomerExplode = null;

export function registerAICallbacks({ spawnToxProjectile, onBoomerExplode }) {
  if (spawnToxProjectile) _spawnToxProjectile = spawnToxProjectile;
  if (onBoomerExplode) _onBoomerExplode = onBoomerExplode;
}

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
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
  z.aiIdleTimer = Math.random() * 1.5;

  z.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
  z.aiStrafeTimer = 1 + Math.random() * 2;
  z.aiBackedOff = false;

  z.aiGiveUp = CFG.giveUp[zombieTier(z.typeKey)] || CFG.giveUp.tier1;

  // 🎯 Comportamento especialista
  z.aiBehavior = (z.type && z.type.behavior) || 'default';
  z.aiSpecialTimer = 0;
  z.aiHasFiredThisAttack = false;
  z.aiBoomerArmed = false;
  z.aiSprintActive = false;

  // 🎯 FOV / spotting (NOVO v6)
  z.spotProgress = 0;          // 0..1
  z.lastSeenAt = 0;            // timestamp
  z.visionSeen = false;        // está vendo agora?
  z.smellSeen = false;         // está sentindo cheiro?

  // Percepção por tipo (merge com defaults)
  z.perception = { ...DEFAULT_PERCEPTION, ...(z.type && z.type.perception || {}) };
}

// ════════════════════════════════════════════════════════════
// PERCEPÇÃO — FOV cone + spotting buildup
// ════════════════════════════════════════════════════════════

/**
 * Teste de FOV: retorna true se player está no cone de visão.
 * Usa dot product entre forward do zumbi e vetor zumbi→player.
 */
function isPlayerInFOV(z, player) {
  const dx = player.position.x - z.p.x;
  const dz = player.position.z - z.p.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return true;
  if (dist > z.perception.visionRange) return false;

  // Forward do zumbi (assumindo que yaw gira em torno do eixo Y)
  const fx = Math.sin(z.yaw);
  const fz = Math.cos(z.yaw);

  // Direção normalizada zumbi→player
  const nx = dx / dist;
  const nz = dz / dist;

  // Dot product
  const dot = fx * nx + fz * nz;
  return dot >= z.perception.fovDot;
}

function hasLineOfSight(z, player, world) {
  if (!world || !Array.isArray(world.wallColliders)) return true;

  const fx = z.p.x;
  const fz = z.p.z;
  const tx = player.position.x;
  const tz = player.position.z;

  const dx = tx - fx;
  const dz = tz - fz;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.5) return true;

  const steps = Math.ceil(dist / 0.5);
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let x = fx, zz = fz;

  for (let i = 0; i < steps; i++) {
    x += stepX; zz += stepZ;
    for (let w = 0; w < world.wallColliders.length; w++) {
      const b = world.wallColliders[w];
      if (x > b.minX && x < b.maxX && zz > b.minZ && zz < b.maxZ) return false;
    }
  }
  return true;
}

/**
 * updateFOVPerception — chamado a cada frame.
 * Atualiza z.spotProgress de 0..1 conforme o player está no cone.
 */
function updateFOVPerception(z, player, dt, world) {
  const dx = player.position.x - z.p.x;
  const dz = player.position.z - z.p.z;
  const dist = Math.hypot(dx, dz);
  z.aiDistance = dist;

  // ── Detecção instantânea por "cheiro" a curta distância ──
  if (dist < z.perception.closeSmellRadius) {
    z.spotProgress = 1;
    z.visionSeen = true;
    z.smellSeen = true;
    z.lastSeenAt = performance.now() / 1000;
    z.aiLastKnownPos = player.position.clone();
    return;
  }

  // ── Detecção por FOV ──
  const inFOV = isPlayerInFOV(z, player);
  const inLOS = inFOV && hasLineOfSight(z, player, world);

  z.visionSeen = inLOS;

  if (inLOS) {
    // Buildup linear: completa em `spottingTime` segundos
    const rate = dt / Math.max(0.1, z.perception.spottingTime);
    z.spotProgress = Math.min(1, z.spotProgress + rate);
    z.lastSeenAt = performance.now() / 1000;
    z.aiLastKnownPos = player.position.clone();
  } else {
    // Decai lentamente se não está vendo
    const now = performance.now() / 1000;
    const timeSinceSeen = now - z.lastSeenAt;
    if (timeSinceSeen > 1.0) {
      // Após 1s sem ver, começa a decair
      const decayRate = dt / Math.max(1.5, z.perception.memoryTime);
      z.spotProgress = Math.max(0, z.spotProgress - decayRate * 2);
    }
  }

  // Se perdeu totalmente a visão, limpa memória
  if (z.spotProgress <= 0) {
    z.aiLastKnownPos = null;
  }
}

// ════════════════════════════════════════════════════════════
// ALERTAS / STAGGER / NOISE
// ════════════════════════════════════════════════════════════
export function alertNearbyZombies(zombies, hitPos, radius = 8) {
  const now = performance.now() / 1000;
  const r2 = radius * radius;
  for (const z of zombies) {
    if (z.hp <= 0 || z.aiState === ZombieState.DEAD) continue;
    const dx = z.p.x - hitPos.x;
    const dz = z.p.z - hitPos.z;
    if (dx * dx + dz * dz < r2) {
      if (z.aiState === ZombieState.IDLE ||
          z.aiState === ZombieState.PATROL ||
          z.aiState === ZombieState.SUSPICIOUS) {
        z.aiState = ZombieState.ALERT;
        z.aiAlertUntil = now + 3;
        z.aiLastKnownPos = hitPos.clone();
        // Detecção completa quando é alertado por dano
        z.spotProgress = 1;
      }
    }
  }
}

export function staggerZombie(z, duration = 0.35) {
  if (z.type && z.type.knockbackResist) {
    duration *= (1 - z.type.knockbackResist);
  }
  z.aiState = ZombieState.STAGGER;
  z.aiStaggerUntil = performance.now() / 1000 + duration;
}

export function hearNoise(z, noisePos, radius) {
  if (z.hp <= 0 || z.aiState === ZombieState.DEAD) return;
  const dx = z.p.x - noisePos.x;
  const dz = z.p.z - noisePos.z;
  const d2 = dx * dx + dz * dz;
  const hearR = radius || z.perception.hearingRange;
  if (d2 > hearR * hearR) return;

  const now = performance.now() / 1000;
  // Ruído dá metade da detecção instantaneamente
  z.spotProgress = Math.max(z.spotProgress, 0.5);

  if (z.aiState === ZombieState.IDLE ||
      z.aiState === ZombieState.PATROL) {
    z.aiState = ZombieState.SUSPICIOUS;
    z.aiAlertUntil = now + 4;
    z.aiLastKnownPos = noisePos.clone();
  } else if (z.aiState === ZombieState.SUSPICIOUS ||
             z.aiState === ZombieState.ALERT) {
    z.aiAlertUntil = now + 4;
    z.aiLastKnownPos = noisePos.clone();
  }
}

// ════════════════════════════════════════════════════════════
// COMPORTAMENTOS ESPECIALISTAS
// ════════════════════════════════════════════════════════════
function updateSpitter(z, player, dt, now) {
  const cfg = z.type.projectile;
  const dist = z.aiDistance;

  if (z.aiState === ZombieState.STAGGER) return;

  if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
    if (z.spotProgress >= 0.6) {
      z.aiState = ZombieState.CHASE;
      z.aiAlertUntil = now + 5;
    }
    return;
  }

  if (z.aiState === ZombieState.SUSPICIOUS || z.aiState === ZombieState.ALERT) {
    if (z.spotProgress >= 1) { z.aiState = ZombieState.CHASE; z.aiAlertUntil = now + 5; }
    else if (now > z.aiAlertUntil && z.spotProgress < 0.3) {
      z.aiState = ZombieState.IDLE;
      z.aiIdleTimer = 1;
    }
    return;
  }

  if (z.aiState === ZombieState.ATTACK_RANGED) {
    z.aiSpecialTimer -= dt;
    if (!z.aiHasFiredThisAttack && z.aiSpecialTimer <= 0) {
      z.aiHasFiredThisAttack = true;
      fireSpitProjectile(z, player);
      z.aiSpecialTimer = 0.35;
    }
    if (z.aiHasFiredThisAttack && z.aiSpecialTimer <= 0) {
      z.aiState = ZombieState.RECOIL;
      z.aiSpecialTimer = 0.5 + Math.random() * 0.3;
      z.aiAttackCd = z.attackCooldown * 0.8;
    }
    return;
  }

  if (z.aiState === ZombieState.RECOIL) {
    z.aiSpecialTimer -= dt;
    if (z.aiSpecialTimer <= 0) z.aiState = ZombieState.CHASE;
    return;
  }

  if (z.aiState === ZombieState.CHASE) {
    z.aiTargetTime += dt;

    if (dist < cfg.minRange) {
      if (z.aiAttackCd <= 0 && z.aiVisible) { startSpitAttack(z); return; }
    } else if (dist <= cfg.maxRange && z.aiAttackCd <= 0 && z.aiVisible) {
      startSpitAttack(z);
      return;
    }

    const g = z.aiGiveUp;
    if (dist > g.neverDist) {
      const t = Math.min(1, z.aiTargetTime / g.transition);
      const uncondDist = g.uncondMax + (g.uncondMin - g.uncondMax) * t;
      if (dist > uncondDist) { giveUp(z); return; }
      if (!z.aiVisible && !z.aiReachable) {
        z.aiGiveUpTimer += dt;
        if (z.aiGiveUpTimer > g.maxTime) { giveUp(z); return; }
      } else {
        z.aiGiveUpTimer = Math.max(0, z.aiGiveUpTimer - dt * 2);
      }
    }
  }
}

function startSpitAttack(z) {
  z.aiState = ZombieState.ATTACK_RANGED;
  z.aiSpecialTimer = z.type.projectile.windupTime;
  z.aiHasFiredThisAttack = false;
  z.attackWindupActive = true;
  z.attackWindupEnd = performance.now() / 1000 + z.type.projectile.windupTime;
}

function fireSpitProjectile(z, player) {
  if (typeof _spawnToxProjectile !== 'function') return;
  const origin = z.p.clone();
  origin.y += 1.4;
  const target = player.position.clone();
  target.y += 1.0;
  const dir = target.clone().sub(origin).normalize();
  const arc = z.type.projectile.arc || 0;
  if (arc > 0) dir.y += arc;
  dir.normalize();
  _spawnToxProjectile({
    origin, dir,
    speed: z.type.projectile.speed,
    damage: z.type.projectile.damage * (1 + (z.wave || 1) * 0.05),
    radius: z.type.projectile.radius,
    ownerId: z.id,
  });
}

function updateBoomer(z, player, dt, now) {
  if (z.aiState === ZombieState.STAGGER) return;

  if (z.aiState !== ZombieState.SUICIDE_RUN && z.aiState !== ZombieState.DEAD) {
    if (z.spotProgress >= 0.5 || z.aiVisible || z.aiDistance < 15) {
      z.aiState = ZombieState.SUICIDE_RUN;
      z.aiBoomerArmed = true;
    } else if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
      if (z.spotProgress >= 0.5) {
        z.aiState = ZombieState.SUICIDE_RUN;
        z.aiBoomerArmed = true;
      } else if (z.aiState === ZombieState.IDLE) {
        z.aiIdleTimer -= dt;
        if (z.aiIdleTimer <= 0) {
          z.aiState = ZombieState.PATROL;
          z.aiPatrolUntil = now + 6 + Math.random() * 3;
          pickPatrolTarget(z);
        }
      } else if (z.aiState === ZombieState.PATROL) {
        if (z.aiPatrolTarget) {
          const pdx = z.aiPatrolTarget.x - z.p.x;
          const pdz = z.aiPatrolTarget.z - z.p.z;
          if (pdx * pdx + pdz * pdz < 2.25) {
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
      }
    }
    return;
  }
}

function updateRunner(z, player, dt, now) {
  if (z.aiState === ZombieState.STAGGER) return;

  if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
    if (z.spotProgress >= 0.4) {
      z.aiState = ZombieState.CHASE;
      z.aiAlertUntil = now + 5;
      z.aiTargetTime = 0;
      z.aiGiveUpTimer = 0;
    } else if (z.aiState === ZombieState.IDLE) {
      z.aiIdleTimer -= dt;
      if (z.aiIdleTimer <= 0) {
        z.aiState = ZombieState.PATROL;
        z.aiPatrolUntil = now + 4 + Math.random() * 5;
        pickPatrolTarget(z);
      }
    } else if (z.aiState === ZombieState.PATROL) {
      if (z.aiPatrolTarget) {
        const pdx = z.aiPatrolTarget.x - z.p.x;
        const pdz = z.aiPatrolTarget.z - z.p.z;
        if (pdx * pdx + pdz * pdz < 2.25) {
          z.aiState = ZombieState.IDLE;
          z.aiIdleTimer = 1 + Math.random() * 2;
        }
      }
      if (now > z.aiPatrolUntil) {
        z.aiState = ZombieState.IDLE;
        z.aiIdleTimer = 1 + Math.random() * 2;
      }
    }
    return;
  }

  if (z.aiState === ZombieState.SUSPICIOUS || z.aiState === ZombieState.ALERT) {
    if (z.spotProgress >= 1 || z.aiVisible) {
      z.aiState = ZombieState.CHASE;
      z.aiAlertUntil = now + 5;
    } else if (now > z.aiAlertUntil && z.spotProgress < 0.3) {
      z.aiState = ZombieState.IDLE;
      z.aiIdleTimer = 1;
    }
    return;
  }

  const sprintRange = z.type.sprintRange || 12;
  const dist = z.aiDistance;
  z.aiSprintActive = (dist > 2.5 && dist < sprintRange && z.aiVisible);

  if (dist < (z.attackRange || 1.3) + 0.4 && z.aiVisible) {
    z.aiState = ZombieState.ATTACK;
  }
}

function updateBrute(z, player, dt, now) {
  defaultUpdate(z, player, dt, now);
}

// ── COMPORTAMENTO PADRÃO (com FOV) ──
function defaultUpdate(z, player, dt, now) {
  if (z.hp <= 0) return;

  if (z.aiState === ZombieState.STAGGER) {
    if (now >= z.aiStaggerUntil) {
      z.aiState = z.spotProgress > 0.3 ? ZombieState.CHASE : ZombieState.IDLE;
      z.aiAlertUntil = now + 3;
    }
    return;
  }

  const dist = z.aiDistance;
  const visible = z.aiVisible;
  const dot = z.aiDot;

  switch (z.aiState) {
    case ZombieState.IDLE: {
      z.aiIdleTimer -= dt;

      // FOV progressivo: zumbi fica SUSPICIOUS quando começa a ver
      if (z.spotProgress >= 0.3) {
        z.aiState = ZombieState.SUSPICIOUS;
        z.aiAlertUntil = now + 4;
      } else if (z.aiIdleTimer <= 0) {
        z.aiState = ZombieState.PATROL;
        z.aiPatrolUntil = now + CFG.patrol.patrolDurationMin +
          Math.random() * (CFG.patrol.patrolDurationMax - CFG.patrol.patrolDurationMin);
        pickPatrolTarget(z);
      }
      break;
    }

    case ZombieState.PATROL: {
      if (z.spotProgress >= 0.3) {
        z.aiState = ZombieState.SUSPICIOUS;
        z.aiAlertUntil = now + 4;
        break;
      }
      if (z.aiPatrolTarget) {
        const pdx = z.aiPatrolTarget.x - z.p.x;
        const pdz = z.aiPatrolTarget.z - z.p.z;
        if (pdx * pdx + pdz * pdz < 2.25) {
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

    case ZombieState.SUSPICIOUS: {
      // Está acumulando detecção — olha pro player
      if (z.spotProgress >= 1 || z.aiVisible) {
        z.aiState = ZombieState.CHASE;
        z.aiAlertUntil = now + 5;
        z.aiTargetTime = 0;
        z.aiGiveUpTimer = 0;
        break;
      }
      // Se perdeu o rastro, volta ao idle
      if (z.spotProgress < 0.15 && now > z.aiAlertUntil) {
        z.aiState = ZombieState.IDLE;
        z.aiIdleTimer = 1 + Math.random() * 2;
        z.aiPatrolTarget = null;
      }
      break;
    }

    case ZombieState.ALERT: {
      if (z.spotProgress >= 1 || z.aiVisible) {
        z.aiState = ZombieState.CHASE;
        z.aiAlertUntil = now + 5;
        z.aiTargetTime = 0;
        z.aiGiveUpTimer = 0;
        break;
      }
      if (now > z.aiAlertUntil && z.spotProgress < 0.3) {
        z.aiState = ZombieState.IDLE;
        z.aiIdleTimer = 1 + Math.random() * 2;
      }
      break;
    }

    case ZombieState.CHASE: {
      z.aiTargetTime += dt;

      if (visible && dist < 10 && dot > 0.3) {
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
        if (!visible && !z.aiReachable && z.spotProgress < 0.2) {
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
    const hpFrac = z.hp / z.max;
    if (hpFrac < CFG.combat.backOffHpFrac && dist < CFG.combat.backOffDist) {
      z.aiBackedOff = true;
    } else if (dist > CFG.combat.backOffDist + 2) {
      z.aiBackedOff = false;
    }
  }
}

// ════════════════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════════════════
export function updateZombieAIState(z, player, dt, world) {
  if (z.hp <= 0) return;
  const now = performance.now() / 1000;

  if (z.aiAttackCd > 0) z.aiAttackCd -= dt;

  // ─── FOV perception (a cada frame) ───
  updateFOVPerception(z, player, dt, world);

  // ─── FOV visual (debug opcional) ───
  if (z.aiReachTimer === undefined) z.aiReachTimer = Math.random();
  z.aiReachTimer += dt;
  if (z.aiReachTimer >= 0.2) {
    z.aiReachTimer = 0;
    // Atualiza aiVisible baseado no spot progress (compat com sistema legado)
    z.aiVisible = z.visionSeen || z.spotProgress >= 0.9;
    z.aiReachable = z.aiVisible;
  }

  // ─── Dispatch por comportamento ───
  const behavior = z.aiBehavior || 'default';
  switch (behavior) {
    case 'spitter': updateSpitter(z, player, dt, now); break;
    case 'boomer':  updateBoomer(z, player, dt, now);  break;
    case 'runner':  updateRunner(z, player, dt, now);  break;
    case 'brute':   updateBrute(z, player, dt, now);   break;
    default:        defaultUpdate(z, player, dt, now);
  }
}

function pickPatrolTarget(z) {
  const angle = Math.random() * Math.PI * 2;
  const r = 4 + Math.random() * CFG.patrol.patrolRadius;
  z.aiPatrolTarget = new THREE.Vector3(
    z.p.x + Math.cos(angle) * r,
    0,
    z.p.z + Math.sin(angle) * r,
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

// ════════════════════════════════════════════════════════════
// VELOCIDADE / DIREÇÃO
// ════════════════════════════════════════════════════════════
export function getAIMultiplier(z) {
  if (z.aiState === ZombieState.STAGGER)      return 0;
  if (z.aiState === ZombieState.SUICIDE_RUN)  return 1.35;
  if (z.aiState === ZombieState.SPRINT)       return 1.6;
  if (z.aiState === ZombieState.CHASE)        return 1.25;
  if (z.aiState === ZombieState.ATTACK)       return 1.0;
  if (z.aiState === ZombieState.SUSPICIOUS)   return 0.7;
  if (z.aiState === ZombieState.ALERT)        return 1.10;
  if (z.aiState === ZombieState.PATROL)       return 0.55;
  if (z.aiState === ZombieState.RECOIL)       return 0.4;
  if (z.aiState === ZombieState.ATTACK_RANGED)return 0;
  return 0.4;
}

export function getDesiredDirection(z, player) {
  const dx = player.position.x - z.p.x;
  const dz = player.position.z - z.p.z;
  const dist = Math.hypot(dx, dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;

  if (z.aiBehavior === 'spitter' && z.type.projectile) {
    const cfg = z.type.projectile;
    if (dist < cfg.minRange) return { x: -nx, z: -nz };
    else if (dist > cfg.preferredRange + 1.5) return { x: nx, z: nz };
    const perp = { x: -nz * z.aiStrafeDir, z: nx * z.aiStrafeDir };
    return { x: perp.x * 0.6, z: perp.z * 0.6 };
  }

  if (z.aiBehavior === 'boomer' && z.aiState === ZombieState.SUICIDE_RUN) {
    return { x: nx, z: nz };
  }

  if (z.aiBehavior === 'runner' && z.aiSprintActive) {
    return { x: nx, z: nz };
  }

  if (z.aiState === ZombieState.CHASE ||
      z.aiState === ZombieState.ATTACK ||
      z.aiState === ZombieState.SUICIDE_RUN) {
    let dirX = nx, dirZ = nz;
    if (z.aiBackedOff) { dirX = -nx; dirZ = -nz; }
    if (CFG.combat.strafe && dist < 6 && dist > 1.8 && !z.aiBackedOff) {
      const px = -nz * z.aiStrafeDir * 0.4;
      const pz = nx * z.aiStrafeDir * 0.4;
      dirX += px; dirZ += pz;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len; dirZ /= len;
    }
    return { x: dirX, z: dirZ };
  }

  if (z.aiState === ZombieState.ATTACK_RANGED) {
    return { x: 0, z: 0 };
  }

  if (z.aiState === ZombieState.SUSPICIOUS && z.aiLastKnownPos) {
    const dx2 = z.aiLastKnownPos.x - z.p.x;
    const dz2 = z.aiLastKnownPos.z - z.p.z;
    const d2 = Math.hypot(dx2, dz2) || 1;
    return { x: dx2 / d2, z: dz2 / d2 };
  }

  if (z.aiState === ZombieState.PATROL && z.aiPatrolTarget) {
    const dx2 = z.aiPatrolTarget.x - z.p.x;
    const dz2 = z.aiPatrolTarget.z - z.p.z;
    const d2 = Math.hypot(dx2, dz2) || 1;
    return { x: dx2 / d2, z: dz2 / d2 };
  }

  return { x: 0, z: 0 };
}

export function checkBoomerExplosion(z, player) {
  if (!z.type || z.type.behavior !== 'boomer') return false;
  if (z.aiState !== ZombieState.SUICIDE_RUN) return false;
  if (z.hp <= 0) return false;
  const dx = player.position.x - z.p.x;
  const dz = player.position.z - z.p.z;
  const d2 = dx * dx + dz * dz;
  const triggerRange = z.type.suicideRange || 1.8;
  return d2 < triggerRange * triggerRange;
}

export function isBoomerArmed(z) {
  return z.type && z.type.behavior === 'boomer' && z.aiBoomerArmed;
}

export function shouldDealContactDamage(z) {
  if (z.aiBehavior === 'spitter') return false;
  if (z.aiBehavior === 'boomer') return false;
  return true;
}
