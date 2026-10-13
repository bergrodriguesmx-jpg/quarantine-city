// ============================================================
// zombie-ai.js — v5.0
// IA especialista por tipo: spitter, boomer, runner, brute.
// Cada arquétipo tem comportamento único e memorável.
// ============================================================

import * as THREE from 'three';

export const ZombieState = Object.freeze({
  IDLE:          'IDLE',
  PATROL:        'PATROL',
  ALERT:         'ALERT',
  CHASE:         'CHASE',
  ATTACK:        'ATTACK',
  ATTACK_RANGED: 'ATTACK_RANGED',   // spitter
  SUICIDE_RUN:   'SUICIDE_RUN',     // boomer
  SPRINT:        'SPRINT',          // runner
  RECOIL:        'RECOIL',          // recuo após ataque ranged
  STAGGER:       'STAGGER',
  DEAD:          'DEAD',
});

const CFG = {
  sight: {
    maxDistance: 55,
    fovDot: -0.5,
    combatDot: 0.3,
    checkFreq: 4,
  },
  smell: {
    radius: 22,
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
  if (typeKey === 'worker' || typeKey === 'miner' || typeKey === 'spitter' ||
      typeKey === 'boomer') return 'tier2';
  return 'tier3';
}

// ════════════════════════════════════════════════════════════
// CALLBACKS EXTERNOS (registrados pelo game.js)
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

  // 🎯 Estado especialista
  z.aiBehavior = (z.type && z.type.behavior) || 'default';
  z.aiSpecialTimer = 0;         // timer genérico pra windup/recoil
  z.aiHasFiredThisAttack = false;
  z.aiBoomerArmed = false;      // boomer só arma depois de ver o player
  z.aiSprintActive = false;
}

// ════════════════════════════════════════════════════════════
// ALERTAS / STAGGER / NOISE
// ════════════════════════════════════════════════════════════
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
  // Brutes têm resistência a stagger
  if (z.type && z.type.knockbackResist) {
    duration *= (1 - z.type.knockbackResist);
  }
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

// ════════════════════════════════════════════════════════════
// COMPORTAMENTOS ESPECIALISTAS
// ════════════════════════════════════════════════════════════

// ── SPITTER: mantém distância, atira projétil tóxico
function updateSpitter(z, player, dt, now) {
  const cfg = z.type.projectile;
  const dist = z.aiDistance;

  // Stagger ainda pode cancelar
  if (z.aiState === ZombieState.STAGGER) return;

  // Sempre entra em CHASE primeiro
  if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
    if (dist < CFG.sight.maxDistance) {
      z.aiState = ZombieState.CHASE;
      z.aiAlertUntil = now + 5;
    }
    return;
  }

  if (z.aiState === ZombieState.ALERT) {
    if (z.aiVisible) { z.aiState = ZombieState.CHASE; z.aiAlertUntil = now + 5; }
    else if (now > z.aiAlertUntil) { z.aiState = ZombieState.IDLE; z.aiIdleTimer = 1; }
    return;
  }

  // Windup em andamento?
  if (z.aiState === ZombieState.ATTACK_RANGED) {
    z.aiSpecialTimer -= dt;
    // Já atirou?
    if (!z.aiHasFiredThisAttack && z.aiSpecialTimer <= 0) {
      z.aiHasFiredThisAttack = true;
      fireSpitProjectile(z, player);
      z.aiSpecialTimer = 0.35; // pós-disparo
    }
    // Termina o ataque
    if (z.aiHasFiredThisAttack && z.aiSpecialTimer <= 0) {
      z.aiState = ZombieState.RECOIL;
      z.aiSpecialTimer = 0.5 + Math.random() * 0.3;
      z.aiAttackCd = z.attackCooldown * 0.8;
    }
    return;
  }

  // Recoil pós-tiro
  if (z.aiState === ZombieState.RECOIL) {
    z.aiSpecialTimer -= dt;
    if (z.aiSpecialTimer <= 0) {
      z.aiState = ZombieState.CHASE;
    }
    return;
  }

  // CHASE: se está longe, aproxima; se está perto demais, recua
  if (z.aiState === ZombieState.CHASE) {
    z.aiTargetTime += dt;

    // Alvo ideal: preferredRange
    if (dist < cfg.minRange) {
      // Muito perto — recua e atira rápido
      if (z.aiAttackCd <= 0 && z.aiVisible) {
        startSpitAttack(z);
        return;
      }
    } else if (dist <= cfg.maxRange && z.aiAttackCd <= 0 && z.aiVisible) {
      // Dentro do alcance — atira
      startSpitAttack(z);
      return;
    }

    // Lógica de give up
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
  const origin = z.mesh.position.clone();
  origin.y += 1.4;

  const target = player.position.clone();
  target.y += 1.0;

  const dir = target.clone().sub(origin).normalize();
  const arc = z.type.projectile.arc || 0;
  if (arc > 0) dir.y += arc;
  dir.normalize();

  _spawnToxProjectile({
    origin,
    dir,
    speed: z.type.projectile.speed,
    damage: z.type.projectile.damage * (1 + (z.wave || 1) * 0.05),
    radius: z.type.projectile.radius,
    ownerId: z.id,
  });
}

// ── BOOMER: corre reto em direção ao player, explode ao chegar
function updateBoomer(z, player, dt, now) {
  if (z.aiState === ZombieState.STAGGER) return;

  // Ignora tudo, só quer chegar perto
  if (z.aiState !== ZombieState.SUICIDE_RUN && z.aiState !== ZombieState.DEAD) {
    // Já detectou player? (usa smell/visão)
    if (z.aiVisible || z.aiDistance < 15) {
      z.aiState = ZombieState.SUICIDE_RUN;
      z.aiBoomerArmed = true;
    } else if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
      // Patrulha normal até detectar
      if (z.aiDistance < CFG.sight.maxDistance) {
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
      }
    }
    return;
  }

  // SUICIDE_RUN: corre direto, explosão é disparada pelo game.js via checkProximity
  // Aqui só fazemos o comportamento visual + lógica de movimento
  // O game.js chama checkBoomerExplosion(z) no loop
}

// ── RUNNER: sprints rápidos em linha reta
function updateRunner(z, player, dt, now) {
  if (z.aiState === ZombieState.STAGGER) return;

  // Mesma máquina de estados do CHASE mas com sprint
  if (z.aiState === ZombieState.IDLE || z.aiState === ZombieState.PATROL) {
    if (z.aiDistance < CFG.sight.maxDistance) {
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
        const pdx = z.aiPatrolTarget.x - z.mesh.position.x;
        const pdz = z.aiPatrolTarget.z - z.mesh.position.z;
        if (pdx * pdx + pdz * pdz < 1.5 * 1.5) {
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

  if (z.aiState === ZombieState.ALERT) {
    if (z.aiVisible) { z.aiState = ZombieState.CHASE; z.aiAlertUntil = now + 5; }
    else if (now > z.aiAlertUntil) { z.aiState = ZombieState.IDLE; z.aiIdleTimer = 1; }
    return;
  }

  // Runner sprint: se está entre sprintRange e melee, ativa sprint
  const sprintRange = z.type.sprintRange || 12;
  const dist = z.aiDistance;
  z.aiSprintActive = (dist > 2.5 && dist < sprintRange && z.aiVisible);

  // Wants to attack? usa a lógica normal
  if (dist < (z.attackRange || 1.3) + 0.4 && z.aiVisible) {
    z.aiState = ZombieState.ATTACK;
  }
}

// ── BRUTE: slam em área quando chega perto
function updateBrute(z, player, dt, now) {
  // Usa a máquina padrão + verifica se deve usar slam
  defaultUpdate(z, player, dt, now);
}

// ── COMPORTAMENTO PADRÃO (usado pelos tipos sem especialidade)
function defaultUpdate(z, player, dt, now) {
  if (z.health <= 0) return;

  if (z.aiState === ZombieState.STAGGER) {
    if (now >= z.aiStaggerUntil) {
      z.aiState = ZombieState.CHASE;
      z.aiAlertUntil = now + 3;
    }
    return;
  }

  z.aiReachTimer = (z.aiReachTimer || 0) + dt * CFG.sight.checkFreq;
  if (z.aiReachTimer >= 1) {
    updatePerception(z, player, null); // world passado pelo caller
    z.aiReachTimer = Math.random() * -0.2;
  }

  const dist = z.aiDistance;
  const visible = z.aiVisible;
  const dot = z.aiDot;

  switch (z.aiState) {
    case ZombieState.IDLE: {
      z.aiIdleTimer -= dt;
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

// ════════════════════════════════════════════════════════════
// ENTRY POINT
// ════════════════════════════════════════════════════════════
export function updateZombieAIState(z, player, dt, world) {
  if (z.health <= 0) return;
  const now = performance.now() / 1000;

  // Atualiza cooldowns
  if (z.aiAttackCd > 0) z.aiAttackCd -= dt;

  // Perception sempre roda (com world)
  z.aiReachTimer = (z.aiReachTimer || 0) + dt * CFG.sight.checkFreq;
  if (z.aiReachTimer >= 1) {
    updatePerception(z, player, world);
    z.aiReachTimer = Math.random() * -0.2;
  }

  // Dispatch por comportamento
  const behavior = z.aiBehavior || 'default';
  switch (behavior) {
    case 'spitter':
      updateSpitter(z, player, dt, now);
      break;
    case 'boomer':
      updateBoomer(z, player, dt, now);
      break;
    case 'runner':
      updateRunner(z, player, dt, now);
      break;
    case 'brute':
      updateBrute(z, player, dt, now);
      break;
    default:
      defaultUpdate(z, player, dt, now);
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

// ════════════════════════════════════════════════════════════
// VELOCIDADE / DIREÇÃO
// ════════════════════════════════════════════════════════════
export function getAIMultiplier(z) {
  if (z.aiState === ZombieState.STAGGER)      return 0;
  if (z.aiState === ZombieState.SUICIDE_RUN)  return 1.35;
  if (z.aiState === ZombieState.SPRINT)       return 1.6;
  if (z.aiState === ZombieState.CHASE)        return 1.25;
  if (z.aiState === ZombieState.ATTACK)       return 1.0;
  if (z.aiState === ZombieState.ALERT)        return 1.10;
  if (z.aiState === ZombieState.PATROL)       return 0.55;
  if (z.aiState === ZombieState.RECOIL)       return 0.4;
  if (z.aiState === ZombieState.ATTACK_RANGED)return 0;
  return 0.4;
}

export function getDesiredDirection(z, player) {
  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  const dist = Math.hypot(dx, dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;

  // Spitter: mantém distância preferida
  if (z.aiBehavior === 'spitter' && z.type.projectile) {
    const cfg = z.type.projectile;
    if (dist < cfg.minRange) {
      // Recua
      return { x: -nx, z: -nz };
    } else if (dist > cfg.preferredRange + 1.5) {
      // Avança
      return { x: nx, z: nz };
    }
    // Está na faixa ideal: strafe lateral
    const perp = { x: -nz * z.aiStrafeDir, z: nx * z.aiStrafeDir };
    return { x: perp.x * 0.6, z: perp.z * 0.6 };
  }

  // Boomer: sempre corre reto
  if (z.aiBehavior === 'boomer' && z.aiState === ZombieState.SUICIDE_RUN) {
    return { x: nx, z: nz };
  }

  // Runner: sprint em linha reta quando ativo
  if (z.aiBehavior === 'runner' && z.aiSprintActive) {
    return { x: nx, z: nz };
  }

  // CHASE / ATTACK padrão
  if (z.aiState === ZombieState.CHASE || z.aiState === ZombieState.ATTACK ||
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
    // Fica parado enquanto mira
    return { x: 0, z: 0 };
  }

  if (z.aiState === ZombieState.ALERT && z.aiLastKnownPos) {
    const dx2 = z.aiLastKnownPos.x - z.mesh.position.x;
    const dz2 = z.aiLastKnownPos.z - z.mesh.position.z;
    const d2 = Math.hypot(dx2, dz2) || 1;
    return { x: dx2 / d2, z: dz2 / d2 };
  }

  if (z.aiState === ZombieState.PATROL && z.aiPatrolTarget) {
    const dx2 = z.aiPatrolTarget.x - z.mesh.position.x;
    const dz2 = z.aiPatrolTarget.z - z.mesh.position.z;
    const d2 = Math.hypot(dx2, dz2) || 1;
    return { x: dx2 / d2, z: dz2 / d2 };
  }

  return { x: 0, z: 0 };
}

// ════════════════════════════════════════════════════════════
// HELPERS EXPORTADOS P/ O GAME.JS
// ════════════════════════════════════════════════════════════

// Verifica se boomer deve explodir
export function checkBoomerExplosion(z, player) {
  if (!z.type || z.type.behavior !== 'boomer') return false;
  if (z.aiState !== ZombieState.SUICIDE_RUN) return false;
  if (z.health <= 0) return false;

  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  const d2 = dx * dx + dz * dz;
  const triggerRange = z.type.suicideRange || 1.8;
  return d2 < triggerRange * triggerRange;
}

export function isBoomerArmed(z) {
  return z.type && z.type.behavior === 'boomer' && z.aiBoomerArmed;
}

export function shouldDealContactDamage(z) {
  // Spitter e ranged NÃO causam dano por contato
  if (z.aiBehavior === 'spitter') return false;
  if (z.aiBehavior === 'boomer') return false;
  return true;
}
