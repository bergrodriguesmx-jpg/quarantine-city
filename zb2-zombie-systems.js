// ============================================================
// zb2-zombie-systems.js — v1.2 "hp fix + spawn robusto"
// ============================================================
// FIXES v1.2:
//   • z.health → z.hp (bug crítico: NaN)
//   • 'dying' → 'Dying' (case mismatch)
//   • Removido throttle interno (game.js já faz)
//   • Spawn: weighted POI + min dist do player + boss pos
//   • Removido _cellForPosition (não era O(1))
//   • _nearActiveBoss usa posição real do boss
// ============================================================

import * as THREE from 'three';

export const ZombieLoadState = Object.freeze({
  UNLOADED: 'Unloaded',
  PROP:     'Prop',
  REAL:     'Real',
});

const CFG = {
  unloadDistance: 200,
  sleepDistance: 65,
  paddingDistance: 5,
  baseZombieCountMultiplier: 1.0,
  baseZombieRespawnTime: 10.0,
  maxZombieCountGlobal: 20,
  indoorZombieRate: 0.35,
  bossActiveRespawnFactor: 0.1,
  nearBossAvoidRadius: 40,
  minSpawnDistanceFromPlayer: 30,
  waterDamagePerTick: 15,
  waterTickInterval: 0.5,
};

const _state = {
  pois: [],
  respawnTimer: 0,
  totalRealZombies: 0,
  totalPropZombies: 0,
  totalUnloadedZombies: 0,
  worldRef: null,
  sceneRef: null,
  configRef: null,
  cavesRef: null,
  playerRef: null,
};

export function initZombieSystems({ world, scene, config, caves, player }) {
  _state.worldRef  = world;
  _state.sceneRef  = scene;
  _state.configRef = config;
  _state.cavesRef  = caves;
  _state.playerRef = player;

  // Constrói lista de POIs com capacidade máxima
  _state.pois = [];
  if (world && world.pois) {
    for (const id in world.pois) {
      const poi = world.pois[id];
      const w = poi.bounds?.w || 16;
      const d = poi.bounds?.d || 14;
      const max = Math.max(2, Math.floor((w * d) / 400 * CFG.baseZombieCountMultiplier));
      _state.pois.push({ id, x: poi.x, z: poi.z, max });
    }
  }
  if (_state.pois.length === 0) {
    _state.pois.push({ id: 'center', x: 0, z: 0, max: 4 });
  }

  console.log(`[zb2-zombies] ✅ ${_state.pois.length} POIs registrados para spawn`);
}

// ════════════════════════════════════════════════════════════
// LOD 3-STATE (sem throttle interno)
// ════════════════════════════════════════════════════════════
export function updateZombieLOD(zombies, playerPos, dt, fogFar = 200) {
  const unloadDist = Math.min(CFG.unloadDistance, fogFar);
  const sleepDist  = CFG.sleepDistance;
  const pad = CFG.paddingDistance;

  let realCount = 0, propCount = 0, unloadedCount = 0;

  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || z.hp <= 0) continue;

    const dx = z.p.x - playerPos.x;
    const dz = z.p.z - playerPos.z;
    const d = Math.hypot(dx, dz);

    let target = z._loadState;
    if (!target) {
      target = ZombieLoadState.REAL;
      z._loadState = target;
    }

    let next = target;
    if (target === ZombieLoadState.REAL) {
      if (d > sleepDist + pad && z._canSleep) next = ZombieLoadState.PROP;
      if (d > unloadDist + pad) next = ZombieLoadState.UNLOADED;
    } else if (target === ZombieLoadState.PROP) {
      if (d < sleepDist - pad) next = ZombieLoadState.REAL;
      if (d > unloadDist + pad) next = ZombieLoadState.UNLOADED;
    } else {
      if (d < sleepDist - pad) next = ZombieLoadState.REAL;
      else if (d < unloadDist - pad) next = ZombieLoadState.PROP;
    }

    if (next !== target) {
      z._loadState = next;
      _applyLoadState(z, next);
    }

    if (next === ZombieLoadState.REAL) realCount++;
    else if (next === ZombieLoadState.PROP) propCount++;
    else unloadedCount++;
  }

  _state.totalRealZombies = realCount;
  _state.totalPropZombies = propCount;
  _state.totalUnloadedZombies = unloadedCount;
}

function _applyLoadState(z, newState) {
  if (newState === ZombieLoadState.REAL) {
    if (z.g) z.g.visible = true;
    z._isReal = true;
  } else if (newState === ZombieLoadState.PROP) {
    if (z.g) z.g.visible = true;
    z._isReal = false;
  } else {
    if (z.g) z.g.visible = false;
    z._isReal = false;
  }
}

export function updateZombieSleepState(z) {
  const now = performance.now() / 1000;
  const speed2 = (z.vx || 0) * (z.vx || 0) + (z.vz || 0) * (z.vz || 0);
  const isMoving = speed2 > 0.04;
  const isIdle = (z.aiState === 'IDLE' || z.aiState === 'PATROL' ||
                  z.aiState === 'Idle' || z.aiState === 'Wander');
  const isDying = z.state === 'Dying' || z.hp <= 0;
  z._canSleep = !isMoving && isIdle && !isDying &&
                (now - (z.lastAttackTime || 0) > 2);
}

// ════════════════════════════════════════════════════════════
// POPULAÇÃO / RESPAWN (spawn robusto)
// ════════════════════════════════════════════════════════════
export function tickZombiePopulation(dt, { spawnZombie, state, bossPos, bossActive }) {
  _state.respawnTimer += dt;
  if (_state.respawnTimer < CFG.baseZombieRespawnTime) return;
  _state.respawnTimer = 0;

  if (state.zombiesAlive >= CFG.maxZombieCountGlobal) return;

  const player = _state.playerRef;
  if (!player) return;

  const zombiesRef = state.zombiesRef || [];

  // Conta zumbis por POI
  const poiCounts = new Map();
  for (const poi of _state.pois) poiCounts.set(poi.id, 0);
  for (const z of zombiesRef) {
    if (!z || z.hp <= 0) continue;
    let nearestId = null, nearestD = Infinity;
    for (const poi of _state.pois) {
      const d = Math.hypot(z.p.x - poi.x, z.p.z - poi.z);
      if (d < nearestD) { nearestD = d; nearestId = poi.id; }
    }
    if (nearestId) poiCounts.set(nearestId, (poiCounts.get(nearestId) || 0) + 1);
  }

  // Candidatos com espaço
  const candidates = [];
  for (const poi of _state.pois) {
    const count = poiCounts.get(poi.id) || 0;
    if (count < poi.max) candidates.push(poi);
  }
  if (candidates.length === 0) return;

  const poi = candidates[Math.floor(Math.random() * candidates.length)];

  // Tenta até 5 posições
  for (let attempt = 0; attempt < 5; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 12;
    const x = poi.x + Math.cos(angle) * r;
    const z = poi.z + Math.sin(angle) * r;

    // Distância mínima do player
    const dP = Math.hypot(x - player.position.x, z - player.position.z);
    if (dP < CFG.minSpawnDistanceFromPlayer) continue;

    // Não spawna perto de boss ativo
    if (bossActive && bossPos) {
      const dB = Math.hypot(x - bossPos.x, z - bossPos.z);
      if (dB < CFG.nearBossAvoidRadius) continue;
    }

    // Não spawna na água
    if (_state.worldRef && _state.worldRef.island) {
      const waterLimit = _state.worldRef.island.innerRadius - 4;
      if (Math.hypot(x, z) > waterLimit) continue;
    }

    spawnZombie(undefined, x, z);
    return;
  }
}

// ════════════════════════════════════════════════════════════
// DANO DE ÁGUA (FIX: z.hp em vez de z.health)
// ════════════════════════════════════════════════════════════
export function applyZombieWaterDamage(z, dt, waterY) {
  if (!z || z.hp <= 0) return;
  if (z.state === 'Dying') return;

  const y = z.p ? z.p.y : (z.mesh ? z.mesh.position.y : 0);
  if (y >= waterY) {
    z._waterAccum = 0;
    return;
  }
  z._waterAccum = (z._waterAccum || 0) + dt;
  if (z._waterAccum >= CFG.waterTickInterval) {
    z._waterAccum -= CFG.waterTickInterval;
    z.hp -= CFG.waterDamagePerTick;
    if (z.hp <= 0) {
      z.state = 'Dying';
      z.tmr = 0;
    }
  }
}

// ════════════════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════════════════
export function getZombieSystemStats() {
  return {
    pois: _state.pois.length,
    realZombies: _state.totalRealZombies,
    propZombies: _state.totalPropZombies,
    unloadedZombies: _state.totalUnloadedZombies,
  };
}

export function setMaxZombiesGlobal(n) { CFG.maxZombieCountGlobal = Math.max(1, n); }
export function setIndoorRate(r) { CFG.indoorZombieRate = Math.max(0, Math.min(1, r)); }
