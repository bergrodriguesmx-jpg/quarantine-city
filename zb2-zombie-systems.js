// ============================================================
// zb2-zombie-systems.js — v3 "STABLE"
// LOD 3-state + sleep + população por POI + dano de água.
// ============================================================

import * as THREE from 'three';

export const ZombieLoadState = Object.freeze({
  REAL:     'REAL',
  PROP:     'PROP',
  UNLOADED: 'UNLOADED',
});

// Distâncias de LOD (em metros)
const LOD = {
  REAL_MAX:     60,
  PROP_MAX:     140,
  SLEEP_AFTER:  3.0,
  WAKE_DIST:    45,
};

let _scene = null;
let _world = null;
let _config = null;
let _caves = null;
let _player = null;

export function initZombieSystems({ world, scene, config, caves, player }) {
  _scene = scene;
  _world = world;
  _config = config;
  _caves = caves;
  _player = player;
}

// ============================================================
// LOD — escolhe REAL / PROP / UNLOADED por distância
// ============================================================
export function updateZombieLOD(zombies, playerPos, dt, maxDistance = 140) {
  if (!playerPos) return;
  for (const z of zombies) {
    if (z.hp <= 0) continue;
    const dx = z.p.x - playerPos.x;
    const dz = z.p.z - playerPos.z;
    const d = Math.hypot(dx, dz);

    let newState;
    if (d < LOD.REAL_MAX) newState = ZombieLoadState.REAL;
    else if (d < Math.min(LOD.PROP_MAX, maxDistance)) newState = ZombieLoadState.PROP;
    else newState = ZombieLoadState.UNLOADED;

    if (z._loadState !== newState) {
      z._loadState = newState;
      // Esconde a mesh se está UNLOADED
      if (z.g) z.g.visible = (newState !== ZombieLoadState.UNLOADED);
    }
  }
}

// ============================================================
// SLEEP — desativa IA quando longe/parado há muito tempo
// ============================================================
export function updateZombieSleepState(z) {
  if (!_player) return;
  if (z.hp <= 0) return;

  const dx = z.p.x - _player.position.x;
  const dz = z.p.z - _player.position.z;
  const d = Math.hypot(dx, dz);

  // Sempre acorda se está perto do player
  if (d < LOD.WAKE_DIST) {
    z.sleep = false;
    z._sleepTimer = 0;
    return;
  }

  // Adormece se ficou parado por SLEEP_AFTER segundos
  if (Math.abs(z.v || 0) < 0.3 && !z.sleep) {
    z._sleepTimer = (z._sleepTimer || 0) + 0.016;
    if (z._sleepTimer > LOD.SLEEP_AFTER) {
      z.sleep = true;
    }
  } else if (!z.sleep) {
    z._sleepTimer = 0;
  }

  // Acorda se tomou dano recente
  if (z.hitReactEndTime && performance.now() / 1000 < z.hitReactEndTime) {
    z.sleep = false;
    z._sleepTimer = 0;
  }
}

// ============================================================
// POPULAÇÃO — spawna extras baseado no que está vivo perto do player
// ============================================================
let _spawnAccum = 0;

export function tickZombiePopulation(dt, ctx) {
  if (!_player || !ctx || !ctx.spawnZombie) return;
  if (!ctx.state || !ctx.state.running) return;

  _spawnAccum += dt;

  const MAX_ZOMBIES = 40;
  const spawnZ = ctx.zombiesRef || [];

  // Conta quantos zumbis REAL estão vivos
  let alive = 0;
  for (const z of spawnZ) {
    if (z.hp > 0 && z._loadState === ZombieLoadState.REAL) alive++;
  }

  // Se tem poucos zumbis REAL e o player está longe da horda, não força spawn
  // O spawn principal já vem do `startWave`, este tick só completa se
  // a população ficar abaixo de 60% do esperado.
  if (alive >= MAX_ZOMBIES * 0.6) return;
  if (alive === 0) return; // deixa a wave cuidar

  // Spawna 1 zumbi a cada 3s se estiver abaixo do mínimo
  if (_spawnAccum > 3.0) {
    _spawnAccum = 0;
    try {
      ctx.spawnZombie(null);
    } catch (e) { /* silencioso */ }
  }
}

// ============================================================
// ÁGUA — zumbi toma dano contínuo se ficar na água
// ============================================================
export function applyZombieWaterDamage(z, dt, waterY) {
  if (z.hp <= 0) return;
  if (z.p.y > waterY + 0.3) return;
  z._waterAccum = (z._waterAccum || 0) + dt;
  if (z._waterAccum > 0.5) {
    z._waterAccum = 0;
    z.hp -= 5;
    if (z.hp <= 0) {
      z.state = 'Dying';
      z.tmr = 0;
    }
  }
}
