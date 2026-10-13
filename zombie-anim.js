// ============================================================
// zombie-anim.js — v8 (retargeting + nomes normalizados)
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'assets/zombie-anim/';
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();

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

// ── Mesma função usada em zombie-model.js ──
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

// Reescreve track "mixamorig:Hips.position" → "Hips.position"
function canonicalTrackName(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot < 0) return trackName;
  const bonePart = trackName.substring(0, dot);
  const propPart = trackName.substring(dot);
  return canonicalBoneName(bonePart) + propPart;
}

function retargetClip(clip) {
  let changed = 0;
  const newTracks = clip.tracks.map(track => {
    const newName = canonicalTrackName(track.name);
    if (newName === track.name) return track;
    changed++;
    const t = track.clone();
    t.name = newName;
    return t;
  });
  if (changed > 0) {
    // console.log(`[zombie-anim] 🔁 ${clip.name}: ${changed}/${clip.tracks.length} tracks renomeados`);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

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
      } catch (_) {}
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

  // Debug: comparar names de bones do skeleton vs tracks do primeiro clip
  const boneNames = [];
  z.instance.scene.traverse(o => { if (o.isBone) boneNames.push(o.name); });
  const firstClip = Object.values(loadedClips)[0];

  console.log(`[zombie-anim] 🦴 Skeleton tem ${boneNames.length} bones (ex: ${boneNames.slice(0,3).join(', ')})`);
  if (firstClip) {
    console.log(`[zombie-anim] 🎬 Track names do clip (ex: ${firstClip.tracks.slice(0,3).map(t => t.name).join(', ')})`);
    // Checa se o primeiro track encontra o bone
    const firstTrack = firstClip.tracks[0];
    if (firstTrack) {
      const dot = firstTrack.name.lastIndexOf('.');
      const bonePart = firstTrack.name.substring(0, dot);
      const found = boneNames.includes(bonePart);
      if (found) console.log(`[zombie-anim] ✅ Match OK: "${bonePart}" existe no skeleton`);
      else console.warn(`[zombie-anim] ⚠️ Match FALHOU: "${bonePart}" NÃO existe no skeleton`);
    }
  }

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

  // Toca walk como default (idle pode ter falhado)
  if (z.mixerActions.walk) {
    z.mixerActions.walk.play();
    z.currentAnim = z.mixerActions.walk;
    z.currentAnimName = 'walk';
  } else if (z.mixerActions.idle) {
    z.mixerActions.idle.play();
    z.currentAnim = z.mixerActions.idle;
    z.currentAnimName = 'idle';
  } else {
    const firstName = Object.keys(z.mixerActions)[0];
    if (firstName) {
      z.mixerActions[firstName].play();
      z.currentAnim = z.mixerActions[firstName];
      z.currentAnimName = firstName;
    }
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
  action.setEffectiveWeight(1);
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
