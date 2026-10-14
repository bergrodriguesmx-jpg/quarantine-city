// ============================================================
// zb2-zombie-systems.js — v1.0
// Porte fiel dos 3 sistemas ZB2 que rodam no ZombieController:
//   1. ZombieLoader (LOD 3-state: Unloaded / Prop / Real)
//   2. População por célula (HashCell) + respawn por célula
//   3. Dano de água (15/tick abaixo do nível da água)
//
// Compatível com zombie-ai.js v5 (não altera o módulo de IA).
// ============================================================

import * as THREE from 'three';

// ─── ENUM de LOD (igual ZB2) ───
export const ZombieLoadState = Object.freeze({
  UNLOADED: 'Unloaded',  // só dados
  PROP:     'Prop',      // modelo visual leve
  REAL:     'Real',      // IA + física completos
});

const CFG = {
  // Distâncias (extraídas do doc ZB2)
  unloadDistance: 250,   // min(250, fogEnd)
  sleepDistance: 75,     // Prop
  paddingDistance: 5,    // histerese

  // População
  cellSize: 60,          // tamanho da célula para contagem
  baseZombieCountMultiplier: 1.0,
  initialSpawnAmountMultiplier: 1.0,
  baseZombieRespawnTime: 8.0,
  maxZombieCountGlobal: 80,
  indoorZombieRate: 0.35,
  bossActiveRespawnFactor: 0.1,   // 0.1× quando chefe ativo
  nearBossAvoidRadius: 40,

  // Água
  waterDamagePerTick: 15,
  waterTickInterval: 0.5,
};

// ════════════════════════════════════════════════════════════
// STATE GLOBAL
// ════════════════════════════════════════════════════════════
const _state = {
  cells: new Map(),              // key = "x,z" → { max, count, center }
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

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
export function initZombieSystems({ world, scene, config, caves, player }) {
  _state.worldRef  = world;
  _state.sceneRef  = scene;
  _state.configRef = config;
  _state.cavesRef  = caves;
  _state.playerRef = player;

  // Constrói as células de população baseadas nos POIs + nas ruas
  _bakePopulationCells(world);

  console.log(`[zb2-zombies] ✅ ${_state.cells.size} células de população`);
}

function _bakePopulationCells(world) {
  _state.cells.clear();
  if (!world || !world.pois) return;

  // Célula por POI: o próprio POI vira centro
  for (const id in world.pois) {
    const poi = world.pois[id];
    const key = _cellKey(poi.x, poi.z);
    const w = poi.bounds?.w || 16;
    const d = poi.bounds?.d || 14;
    // Fórmula ZB2 simplificada: (nodes + 1) + (edges * 3) + (polyNodes * 0.5)
    // Aqui aproximamos: 1 + (área / 100) * 0.5
    const max = Math.max(3, Math.floor((w * d) / 200 * CFG.baseZombieCountMultiplier));
    _state.cells.set(key, {
      center: { x: poi.x, z: poi.z },
      max,
      count: 0,
      poiId: id,
    });
  }

  // Célula extra: centro do mapa (Zona Zero)
  if (!_state.cells.has(_cellKey(0, 0))) {
    _state.cells.set(_cellKey(0, 0), {
      center: { x: 0, z: 0 },
      max: 6,
      count: 0,
    });
  }
}

function _cellKey(x, z) {
  const cx = Math.floor(x / CFG.cellSize);
  const cz = Math.floor(z / CFG.cellSize);
  return `${cx},${cz}`;
}

function _cellForPosition(x, z) {
  // Acha a célula mais próxima
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
// LOD 3-STATE (ZombieLoader)
// ════════════════════════════════════════════════════════════
export function updateZombieLOD(zombies, playerPos, dt, fogFar = 250) {
  const unloadDist = Math.min(CFG.unloadDistance, fogFar);
  const sleepDist  = CFG.sleepDistance;
  const pad = CFG.paddingDistance;

  let realCount = 0, propCount = 0, unloadedCount = 0;

  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || z.health <= 0) continue;

    const dx = z.mesh.position.x - playerPos.x;
    const dz = z.mesh.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);

    // Estado atual (default REAL na primeira vez)
    let target = z._loadState;
    if (!target) {
      target = ZombieLoadState.REAL;
      z._loadState = target;
    }

    // Histerese + transição de estado
    let next = target;
    if (target === ZombieLoadState.REAL) {
      // Só rebaixa se estiver dormindo OU muito longe
      if (d > sleepDist + pad && z._canSleep) next = ZombieLoadState.PROP;
      if (d > unloadDist + pad) next = ZombieLoadState.UNLOADED;
    } else if (target === ZombieLoadState.PROP) {
      if (d < sleepDist - pad) next = ZombieLoadState.REAL;
      if (d > unloadDist + pad) next = ZombieLoadState.UNLOADED;
    } else {
      // UNLOADED
      if (d < sleepDist - pad) next = ZombieLoadState.REAL;
      else if (d < unloadDist - pad) next = ZombieLoadState.PROP;
    }

    if (next !== target) {
      z._loadState = next;
      _applyLoadState(z, next);
    }

    // Conta
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
    z._isReal = false;   // pula IA/física
  } else {
    z.mesh.visible = false;
    z._isReal = false;
  }
}

// Marca se o zumbi está parado o suficiente para dormir
export function updateZombieSleepState(z, dt) {
  const now = performance.now() / 1000;
  const speed2 = (z.vx * z.vx + z.vz * z.vz);
  const isMoving = speed2 > 0.04;
  const isIdle = (z.aiState === 'IDLE' || z.aiState === 'PATROL');
  const isDying = z.dying || z.health <= 0;

  z._canSleep = !isMoving && isIdle && !isDying &&
                (now - (z.lastAttackTime || 0) > 2);
}

// ════════════════════════════════════════════════════════════
// POPULAÇÃO / RESPAWN POR CÉLULA
// ════════════════════════════════════════════════════════════
export function tickZombiePopulation(dt, { spawnZombie, state, bossActive }) {
  // Atualiza contagem por célula
  for (const cell of _state.cells.values()) cell.count = 0;

  const zombiesRef = state.zombiesRef || [];
  for (let i = 0; i < zombiesRef.length; i++) {
    const z = zombiesRef[i];
    if (!z || z.health <= 0) continue;
    const cell = _cellForPosition(z.mesh.position.x, z.mesh.position.z);
    if (cell) cell.count++;
  }

  // Tick do timer (0.1× se boss ativo)
  const factor = bossActive ? CFG.bossActiveRespawnFactor : 1;
  _state.respawnTimer += dt * factor;

  if (_state.respawnTimer < CFG.baseZombieRespawnTime) return;
  _state.respawnTimer = 0;

  // Cap global
  if (state.zombiesAlive >= CFG.maxZombieCountGlobal) return;

  // Acha uma célula com espaço
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
  // 35% chance de spawnar dentro de POI (indoorZombieRate)
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

  // Não spawna perto de chefe ativo
  if (bossActive && _nearActiveBoss(x, z)) return null;

  return { x, z };
}

function _nearActiveBoss(x, z) {
  const player = _state.playerRef;
  if (!player) return false;
  // ZB2: evita spawnar perto de um chefe ativo
  // Como não temos bosses vivos referenciados aqui, usamos a posição do player
  // como proxy (chefe normalmente fica perto do player)
  const d = Math.hypot(x - player.position.x, z - player.position.z);
  return d < CFG.nearBossAvoidRadius;
}

// ════════════════════════════════════════════════════════════
// DANO DE ÁGUA (ZB2: 15/tick abaixo do nível da água)
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
// HELPERS EXPORTADOS
// ════════════════════════════════════════════════════════════
export function getZombieSystemStats() {
  return {
    cells: _state.cells.size,
    realZombies: _state.totalRealZombies,
    propZombies: _state.totalPropZombies,
    unloadedZombies: _state.totalUnloadedZombies,
  };
}

export function setMaxZombiesGlobal(n) {
  CFG.maxZombieCountGlobal = Math.max(1, n);
}

export function setCellSize(n) {
  CFG.cellSize = Math.max(20, n);
  if (_state.worldRef) _bakePopulationCells(_state.worldRef);
}

export function setIndoorRate(r) {
  CFG.indoorZombieRate = Math.max(0, Math.min(1, r));
}
