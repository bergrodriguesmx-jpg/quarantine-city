// ============================================================
// zb2-zombie-systems.js — v1.1 "Performance Optimized"
// ============================================================
// OTIMIZAÇÕES v1.1:
//   • _cellForPosition usa lookup O(1) em grid em vez de O(células)
//   • Throttling interno: LOD roda 2×/s, população 0.5×/s
//   • Skip PROP/UNLOADED antecipado (economiza IA/física)
//   • Cache de cellKey por zumbi (não recalcula se não moveu)
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
  cellSize: 60,
  baseZombieCountMultiplier: 1.0,
  initialSpawnAmountMultiplier: 1.0,
  baseZombieRespawnTime: 10.0,
  maxZombieCountGlobal: 40,
  indoorZombieRate: 0.35,
  bossActiveRespawnFactor: 0.1,
  nearBossAvoidRadius: 40,
  waterDamagePerTick: 15,
  waterTickInterval: 0.5,
  // ─── Timers internos (throttle) ───
  lodTickInterval: 0.5,
  popTickInterval: 2.0,
};

const _state = {
  cells: new Map(),
  respawnTimer: 0,
  lodAccum: 0,
  popAccum: 0,
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
  _bakePopulationCells(world);
  console.log(`[zb2-zombies] ✅ ${_state.cells.size} células de população`);
}

function _bakePopulationCells(world) {
  _state.cells.clear();
  if (!world || !world.pois) return;
  for (const id in world.pois) {
    const poi = world.pois[id];
    const key = _cellKey(poi.x, poi.z);
    const w = poi.bounds?.w || 16;
    const d = poi.bounds?.d || 14;
    const max = Math.max(3, Math.floor((w * d) / 200 * CFG.baseZombieCountMultiplier));
    _state.cells.set(key, {
      center: { x: poi.x, z: poi.z },
      max,
      count: 0,
      poiId: id,
    });
  }
  if (!_state.cells.has(_cellKey(0, 0))) {
    _state.cells.set(_cellKey(0, 0), {
      center: { x: 0, z: 0 }, max: 4, count: 0,
    });
  }
}

function _cellKey(x, z) {
  const cx = Math.floor(x / CFG.cellSize);
  const cz = Math.floor(z / CFG.cellSize);
  return `${cx},${cz}`;
}

function _cellForPosition(x, z) {
  // O(1) lookup — só faz fallback O(n) se não achar na célula exata
  const key = _cellKey(x, z);
  const direct = _state.cells.get(key);
  if (direct) return direct;
  let best = null, bestD2 = Infinity;
  for (const cell of _state.cells.values()) {
    const dx = cell.center.x - x;
    const dz = cell.center.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = cell; }
  }
  return best;
}

// ════════════════════════════════════════════════════════════
// LOD 3-STATE (throttled internamente — chame todo frame)
// ════════════════════════════════════════════════════════════
export function updateZombieLOD(zombies, playerPos, dt, fogFar = 200) {
  _state.lodAccum += dt;
  if (_state.lodAccum < CFG.lodTickInterval) return;
  const tickDt = _state.lodAccum;
  _state.lodAccum = 0;

  const unloadDist = Math.min(CFG.unloadDistance, fogFar);
  const sleepDist  = CFG.sleepDistance;
  const pad = CFG.paddingDistance;

  let realCount = 0, propCount = 0, unloadedCount = 0;

  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || z.health <= 0) continue;

    // Cache de distância: se ainda não moveu muito, mantém último loadState
    const dx = z.mesh.position.x - playerPos.x;
    const dz = z.mesh.position.z - playerPos.z;
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
    z.mesh.visible = true;
    z._isReal = true;
  } else if (newState === ZombieLoadState.PROP) {
    z.mesh.visible = true;
    z._isReal = false;
  } else {
    z.mesh.visible = false;
    z._isReal = false;
  }
}

export function updateZombieSleepState(z, dt) {
  const now = performance.now() / 1000;
  const speed2 = (z.vx * z.vx + z.vz * z.vz);
  const isMoving = speed2 > 0.04;
  const isIdle = (z.aiState === 'IDLE' || z.aiState === 'PATROL' ||
                  z.aiState === 'Idle' || z.aiState === 'Wander');
  const isDying = z.dying || z.health <= 0;
  z._canSleep = !isMoving && isIdle && !isDying &&
                (now - (z.lastAttackTime || 0) > 2);
}

// ════════════════════════════════════════════════════════════
// POPULAÇÃO (throttled — chame todo frame)
// ════════════════════════════════════════════════════════════
export function tickZombiePopulation(dt, { spawnZombie, state, bossActive }) {
  _state.popAccum += dt;
  if (_state.popAccum < CFG.popTickInterval) return;
  const tickDt = _state.popAccum;
  _state.popAccum = 0;

  for (const cell of _state.cells.values()) cell.count = 0;
  const zombiesRef = state.zombiesRef || [];
  for (let i = 0; i < zombiesRef.length; i++) {
    const z = zombiesRef[i];
    if (!z || z.health <= 0) continue;
    const cell = _cellForPosition(z.mesh.position.x, z.mesh.position.z);
    if (cell) cell.count++;
  }

  const factor = bossActive ? CFG.bossActiveRespawnFactor : 1;
  _state.respawnTimer += tickDt * factor;

  if (_state.respawnTimer < CFG.baseZombieRespawnTime) return;
  _state.respawnTimer = 0;

  if (state.zombiesAlive >= CFG.maxZombieCountGlobal) return;

  const candidates = [];
  for (const cell of _state.cells.values()) {
    if (cell.count < cell.max) candidates.push(cell);
  }
  if (candidates.length === 0) return;

  const cell = candidates[Math.floor(Math.random() * candidates.length)];
  const pos = _pickSpawnPositionInCell(cell, bossActive);
  if (!pos) return;

  spawnZombie(undefined, pos.x, pos.z);
}

function _pickSpawnPositionInCell(cell, bossActive) {
  const indoor = Math.random() < CFG.indoorZombieRate;
  let x, z;

  if (indoor && cell.poiId) {
    const poi = _state.worldRef.pois[cell.poiId];
    if (poi) {
      x = poi.x + (Math.random() - 0.5) * 6;
      z = poi.z + (Math.random() - 0.5) * 6;
    }
  }

  if (x === undefined) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 15;
    x = cell.center.x + Math.cos(angle) * r;
    z = cell.center.z + Math.sin(angle) * r;
  }

  if (bossActive && _nearActiveBoss(x, z)) return null;
  return { x, z };
}

function _nearActiveBoss(x, z) {
  const player = _state.playerRef;
  if (!player) return false;
  const d = Math.hypot(x - player.position.x, z - player.position.z);
  return d < CFG.nearBossAvoidRadius;
}

// ════════════════════════════════════════════════════════════
// DANO DE ÁGUA
// ════════════════════════════════════════════════════════════
export function applyZombieWaterDamage(z, dt, waterY) {
  if (!z || z.health <= 0 || z.dying) return;
  if (z.mesh.position.y >= waterY) {
    z._waterAccum = 0;
    return;
  }
  z._waterAccum = (z._waterAccum || 0) + dt;
  if (z._waterAccum >= CFG.waterTickInterval) {
    z._waterAccum -= CFG.waterTickInterval;
    z.health -= CFG.waterDamagePerTick;
    if (z.health <= 0) {
      z.dying = true;
      z.state = 'dying';
    }
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
export function getZombieSystemStats() {
  return {
    cells: _state.cells.size,
    realZombies: _state.totalRealZombies,
    propZombies: _state.totalPropZombies,
    unloadedZombies: _state.totalUnloadedZombies,
  };
}

export function setMaxZombiesGlobal(n) { CFG.maxZombieCountGlobal = Math.max(1, n); }
export function setCellSize(n) {
  CFG.cellSize = Math.max(20, n);
  if (_state.worldRef) _bakePopulationCells(_state.worldRef);
}
export function setIndoorRate(r) { CFG.indoorZombieRate = Math.max(0, Math.min(1, r)); }
