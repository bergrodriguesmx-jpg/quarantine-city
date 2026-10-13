// ============================================================
// zombie-anim.js — v7 (suporta GLB + FBX)
// Tenta cada animação em .glb primeiro, cai pra .fbx se falhar.
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'assets/zombie-anim/';
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();

// nome → [arquivos candidatos, na ordem]
const ANIM_FILES = {
  idle:     ['zombie-idle.glb',     'zombie-idle.fbx'],
  walk:     ['zombie-walk.glb',     'zombie-walk.fbx'],
  run:      ['zombie-run.glb',      'zombie-run.fbx'],
  attack:   ['zombie-attack.glb',   'zombie-attack.fbx'],
  bite1:    ['zombie-biting.glb',   'zombie-biting.fbx'],
  bite2:    ['zombie-biting(2).glb','zombie-biting(2).fbx'],
  neckbite: ['zombie-neck-bite.glb','zombie-neck-bite.fbx'],
  dying:    ['zombie-dying.glb',    'zombie-dying.fbx'],
  death:    ['zombie-death.glb',    'zombie-death.fbx'],
  crawl:    ['zombie-crawl.glb',    'zombie-crawl.fbx'],
  runcrawl: ['running-crawl.glb',   'running-crawl.fbx'],
  scream:   ['zombie-scream.glb',   'zombie-scream.fbx'],
};

const loadedClips = {};
const loadPromises = {};
let preloaded = false;

async function loadAnyAnim(filename) {
  const url = BASE + encodeURIComponent(filename).replace(/%2F/g, '/');
  if (filename.toLowerCase().endsWith('.glb') || filename.toLowerCase().endsWith('.gltf')) {
    const gltf = await gltfLoader.loadAsync(url);
    return (gltf.animations && gltf.animations[0]) || null;
  } else {
    const fbx = await fbxLoader.loadAsync(url);
    return (fbx.animations && fbx.animations[0]) || null;
  }
}

async function loadAnim(name, candidates) {
  if (loadPromises[name]) return loadPromises[name];
  loadPromises[name] = (async () => {
    let lastErr = null;
    for (const file of candidates) {
      try {
        const clip = await loadAnyAnim(file);
        if (!clip) {
          console.warn(`[zombie-anim] ⚠️ ${file} sem animação`);
          continue;
        }
        loadedClips[name] = clip;
        console.log(`[zombie-anim] ✅ ${name} ← ${file} (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`);
        return clip;
      } catch (e) {
        lastErr = e;
      }
    }
    console.warn(`[zombie-anim] ❌ ${name}: nenhum candidato funcionou`);
    return null;
  })();
  return loadPromises[name];
}

export async function preloadZombieAnims() {
  if (preloaded) return;
  console.log('[zombie-anim] 📦 Carregando animações (GLB > FBX)...');
  const entries = Object.entries(ANIM_FILES);
  await Promise.all(entries.map(([name, files]) => loadAnim(name, files)));
  preloaded = true;
  const loaded = Object.keys(loadedClips).length;
  console.log(`[zombie-anim] 📦 ${loaded}/${entries.length} animações prontas`);
}

export function hasZombieAnims() {
  return preloaded && Object.keys(loadedClips).length > 0;
}

export function setupZombieAnimator(z) {
  if (!hasZombieAnims()) return false;
  if (!z.instance) return false;
  if (z.mixer) return true;

  const mixer = new THREE.AnimationMixer(z.instance.scene);
  z.mixer = mixer;
  z.mixerActions = {};
  z.currentAnim = null;
  z.currentAnimName = null;

  for (const [name, clip] of Object.entries(loadedClips)) {
    const action = mixer.clipAction(clip);
    if (name === 'dying' || name === 'death') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    z.mixerActions[name] = action;
  }

  if (z.mixerActions.idle) {
    z.mixerActions.idle.play();
    z.currentAnim = z.mixerActions.idle;
    z.currentAnimName = 'idle';
  } else if (z.mixerActions.walk) {
    z.mixerActions.walk.play();
    z.currentAnim = z.mixerActions.walk;
    z.currentAnimName = 'walk';
  }

  return true;
}

export function playZombieAnim(z, name, opts = {}) {
  if (!z.mixer || !z.mixerActions) return false;
  const action = z.mixerActions[name];
  if (!action) return false;
  if (z.currentAnim === action && !opts.force) return false;
  const prev = z.currentAnim;
  const fade = opts.fade ?? 0.2;
  action.reset();
  action.setEffectiveTimeScale(opts.timeScale || 1);
  action.fadeIn(fade).play();
  if (prev && prev !== action) prev.fadeOut(fade);
  z.currentAnim = action;
  z.currentAnimName = name;
  return true;
}

export function updateZombieAnim(z, dt) { if (z.mixer) z.mixer.update(dt); }

export function handleZombieAnimState(z, realSpeed) {
  if (!z.mixer) return;

  if (z.dying) {
    if (z.currentAnimName !== 'dying') {
      playZombieAnim(z, 'dying', { fade: 0.15, force: true });
    }
    return;
  }

  if (z.attackWindupActive) {
    if (z.currentAnimName !== 'attack') {
      playZombieAnim(z, 'attack', { fade: 0.08, force: true, timeScale: 1.4 });
    }
    return;
  }

  if (z.crawling) {
    playZombieAnim(z, realSpeed > 0.5 ? 'runcrawl' : 'crawl', { fade: 0.2 });
    return;
  }

  if (realSpeed > 1.5)       playZombieAnim(z, 'run',  { fade: 0.15 });
  else if (realSpeed > 0.15) playZombieAnim(z, 'walk', { fade: 0.15 });
  else                       playZombieAnim(z, 'idle', { fade: 0.25 });
}

export function forceZombieAnim(z, name, opts = {}) {
  playZombieAnim(z, name, { ...opts, force: true });
}

export function getZombieAnimStatus() {
  return {
    preloaded,
    loaded: Object.keys(loadedClips).length,
    total: Object.keys(ANIM_FILES).length,
    clips: Object.keys(loadedClips),
  };
}
