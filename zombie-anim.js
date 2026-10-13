// ============================================================
// zombie-anim.js — v9
// Carrega as animações Mixamo (GLB > FBX) e faz retarget in-place.
// NÃO usa track.clone() (KeyframeTrack não tem esse método).
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'assets/zombie-anim/';
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();

// nome → [candidatos na ordem: GLB primeiro, FBX depois]
const ANIM_FILES = {
  idle:     ['zombie-idle.glb',      'zombie-idle.fbx'],
  walk:     ['zombie-walk.glb',      'zombie-walk.fbx'],
  run:      ['zombie-run.glb',       'zombie-run.fbx'],
  attack:   ['zombie-attack.glb',    'zombie-attack.fbx'],
  bite1:    ['zombie-biting.glb',    'zombie-biting.fbx'],
  bite2:    ['zombie-biting(2).glb', 'zombie-biting(2).fbx'],
  neckbite: ['zombie-neck-bite.glb', 'zombie-neck-bite.fbx'],
  dying:    ['zombie-dying.glb',     'zombie-dying.fbx'],
  death:    ['zombie-death.glb',     'zombie-death.fbx'],
  crawl:    ['zombie-crawl.glb',     'zombie-crawl.fbx'],
  runcrawl: ['running-crawl.glb',    'running-crawl.fbx'],
  scream:   ['zombie-scream.glb',    'zombie-scream.fbx'],
};

const loadedClips = {};
const loadPromises = {};
let preloaded = false;

// ──────────────────────────────────────────────
// Mesma normalização usada em zombie-model.js
//   "mixamorig:Hips"  → "Hips"
//   "mixamorigHips"   → "Hips"
// ──────────────────────────────────────────────
function canonicalBoneName(name) {
  if (!name) return name;
  let n = String(name);
  const pipe = n.lastIndexOf('|');
  if (pipe >= 0) n = n.substring(pipe + 1);
  const colon = n.indexOf(':');
  if (colon >= 0) n = n.substring(colon + 1);
  n = n.replace(/^mixamorig[:_]?/i, '');
  const dot = n.indexOf('.');
  if (dot >= 0) n = n.substring(0, dot);
  return n;
}

// "mixamorig:Hips.position" → "Hips.position"
function canonicalTrackName(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot < 0) return trackName;
  const bonePart = trackName.substring(0, dot);
  const propPart = trackName.substring(dot);
  return canonicalBoneName(bonePart) + propPart;
}

// ──────────────────────────────────────────────
// Retarget in-place: renomeia as tracks pra forma canônica.
// Não clona — AnimationClip é exclusivo daquele arquivo.
// ──────────────────────────────────────────────
function retargetClip(clip) {
  if (!clip || !clip.tracks) return clip;
  let changed = 0;
  for (const track of clip.tracks) {
    const newName = canonicalTrackName(track.name);
    if (newName !== track.name) {
      track.name = newName;
      changed++;
    }
  }
  return clip;
}

// ──────────────────────────────────────────────
// Carrega um arquivo (GLB ou FBX) e retorna o primeiro clip
// ──────────────────────────────────────────────
async function loadAnyAnim(filename) {
  const url = BASE + encodeURIComponent(filename).replace(/%2F/g, '/');
  if (/\.(glb|gltf)$/i.test(filename)) {
    const gltf = await gltfLoader.loadAsync(url);
    return (gltf.animations && gltf.animations[0]) || null;
  }
  const fbx = await fbxLoader.loadAsync(url);
  return (fbx.animations && fbx.animations[0]) || null;
}

async function loadAnim(name, candidates) {
  if (loadPromises[name]) return loadPromises[name];

  loadPromises[name] = (async () => {
    for (const file of candidates) {
      try {
        const rawClip = await loadAnyAnim(file);
        if (!rawClip) continue;
        const clip = retargetClip(rawClip);
        loadedClips[name] = clip;
        console.log(`[zombie-anim] ✅ ${name} ← ${file} (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`);
        return clip;
      } catch (_) {
        // 404 ou erro — tenta o próximo candidato
      }
    }
    console.warn(`[zombie-anim] ❌ ${name}: nenhum candidato funcionou`);
    return null;
  })();

  return loadPromises[name];
}

// ══════════════════════════════════════════════
// PRELOAD
// ══════════════════════════════════════════════
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

// ══════════════════════════════════════════════
// SETUP ANIMATOR (por zumbi)
// ══════════════════════════════════════════════
export function setupZombieAnimator(z) {
  if (!hasZombieAnims()) return false;
  if (!z.instance || !z.instance.scene) return false;
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

  // Default: walk > idle > primeiro disponível
  const defaultName =
    (z.mixerActions.walk && 'walk') ||
    (z.mixerActions.idle && 'idle') ||
    Object.keys(z.mixerActions)[0];

  if (defaultName) {
    z.mixerActions[defaultName].play();
    z.currentAnim = z.mixerActions[defaultName];
    z.currentAnimName = defaultName;
  }

  return true;
}

// ══════════════════════════════════════════════
// PLAY / UPDATE / STATE
// ══════════════════════════════════════════════
export function playZombieAnim(z, name, opts = {}) {
  if (!z.mixer || !z.mixerActions) return false;
  const action = z.mixerActions[name];
  if (!action) return false;
  if (z.currentAnim === action && !opts.force) return false;
  const prev = z.currentAnim;
  const fade = opts.fade ?? 0.2;
  action.reset();
  action.setEffectiveTimeScale(opts.timeScale || 1);
  action.setEffectiveWeight(1);
  action.fadeIn(fade).play();
  if (prev && prev !== action) prev.fadeOut(fade);
  z.currentAnim = action;
  z.currentAnimName = name;
  return true;
}

export function updateZombieAnim(z, dt) {
  if (z.mixer) z.mixer.update(dt);
}

export function handleZombieAnimState(z, realSpeed) {
  if (!z.mixer) return;

  if (z.dying) {
    if (z.currentAnimName !== 'dying' && z.currentAnimName !== 'death') {
      if (!playZombieAnim(z, 'dying', { fade: 0.15, force: true })) {
        playZombieAnim(z, 'death', { fade: 0.15, force: true });
      }
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
    const target = realSpeed > 0.5 ? 'runcrawl' : 'crawl';
    if (z.mixerActions[target]) playZombieAnim(z, target, { fade: 0.2 });
    else if (z.mixerActions.walk) playZombieAnim(z, 'walk', { fade: 0.2 });
    return;
  }

  if (realSpeed > 1.5 && z.mixerActions.run)         playZombieAnim(z, 'run',  { fade: 0.15 });
  else if (realSpeed > 0.15 && z.mixerActions.walk)  playZombieAnim(z, 'walk', { fade: 0.15 });
  else if (z.mixerActions.idle)                      playZombieAnim(z, 'idle', { fade: 0.25 });
  else if (z.mixerActions.walk)                      playZombieAnim(z, 'walk', { fade: 0.25 });
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
