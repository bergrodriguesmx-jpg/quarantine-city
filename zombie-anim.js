// ============================================================
// zombie-anim.js — v11 (retarget agressivo + logs detalhados)
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

function stripPrefix(name) {
  return String(name).replace(/^mixamorig[:_]?/i, '').replace(/^Armature\|/, '');
}
function stripSuffix(name) {
  const dot = name.indexOf('.');
  return dot >= 0 ? name.substring(0, dot) : name;
}
function normalize(name) {
  return stripSuffix(stripPrefix(name)).toLowerCase().replace(/[\s_\-:]/g, '');
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
        const clip = await loadAnyAnim(file);
        if (!clip || clip.tracks.length === 0) continue;
        loadedClips[name] = clip;
        console.log(`[zombie-anim] ✅ ${name} ← ${file} (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`);
        return clip;
      } catch (_) { /* ignora 404 */ }
    }
    return null;
  })();
  return loadPromises[name];
}

export async function preloadZombieAnims() {
  if (preloaded) return;
  console.log('[zombie-anim] 📦 Carregando animações...');
  const entries = Object.entries(ANIM_FILES);
  await Promise.all(entries.map(([name, files]) => loadAnim(name, files)));
  preloaded = true;
  const loaded = Object.keys(loadedClips).length;
  console.log(`[zombie-anim] 📦 ${loaded}/${entries.length} animações prontas`);
}

export function hasZombieAnims() {
  return preloaded && Object.keys(loadedClips).length > 0;
}

// ════════════════════════════════════════════════════════════
// RETARGET AGRESSIVO
// Monta um mapa com TODAS as variações possíveis de cada bone.
// Pra cada track, testa 5 padrões diferentes.
// ════════════════════════════════════════════════════════════
function buildBoneLookup(root) {
  const lookup = new Map();
  const boneNames = [];

  root.traverse(o => {
    if (!o.isBone) return;
    const real = o.name;
    boneNames.push(real);

    // Registra todas as variações que apontam pro mesmo bone real
    const variants = new Set([
      real,                              // "mixamorigHips"
      real.toLowerCase(),                // "mixamorighips"
      stripPrefix(real),                 // "Hips"
      stripPrefix(real).toLowerCase(),   // "hips"
      normalize(real),                   // "hips"
    ]);

    for (const v of variants) {
      if (!lookup.has(v)) lookup.set(v, real);
    }
  });

  return { lookup, boneNames };
}

function findRealBone(trackBoneName, lookup) {
  const variants = [
    trackBoneName,                              // "mixamorig:Hips"
    trackBoneName.toLowerCase(),                // "mixamorig:hips"
    stripPrefix(trackBoneName),                 // "Hips"
    stripPrefix(trackBoneName).toLowerCase(),   // "hips"
    normalize(trackBoneName),                   // "hips"
  ];

  for (const v of variants) {
    const hit = lookup.get(v);
    if (hit) return hit;
  }
  return null;
}

function buildRetargetedClip(clip, root) {
  const { lookup } = buildBoneLookup(root);
  const newTracks = [];
  let matched = 0;
  let unmatched = 0;

  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    if (dot < 0) continue;
    const bonePart = track.name.substring(0, dot);
    const propPart = track.name.substring(dot);

    const realName = findRealBone(bonePart, lookup);
    if (realName) {
      track.name = realName + propPart;
      newTracks.push(track);
      matched++;
    } else {
      unmatched++;
    }
  }

  return {
    clip: new THREE.AnimationClip(clip.name, clip.duration, newTracks),
    matched, unmatched, total: clip.tracks.length,
  };
}

export function setupZombieAnimator(z) {
  if (!hasZombieAnims()) return false;
  if (!z.instance || !z.instance.scene) return false;
  if (z.mixer) return true;

  const root = z.instance.scene;

  // Diagnóstico: mostra os bones do skeleton
  const boneNames = [];
  root.traverse(o => { if (o.isBone) boneNames.push(o.name); });
  console.log(`[zombie-anim] 🦴 Skeleton tem ${boneNames.length} bones`);
  console.log(`[zombie-anim] 📋 Primeiros 10:`, boneNames.slice(0, 10));

  // Diagnóstico: mostra as primeiras tracks de cada clip
  const firstName = Object.keys(loadedClips)[0];
  if (firstName) {
    const firstClip = loadedClips[firstName];
    console.log(`[zombie-anim] 🎬 Tracks de "${firstName}" (primeiras 5):`, firstClip.tracks.slice(0, 5).map(t => t.name));
  }

  const mixer = new THREE.AnimationMixer(root);
  z.mixer = mixer;
  z.mixerActions = {};

  let totalMatched = 0;
  let totalTracks = 0;

  for (const [name, rawClip] of Object.entries(loadedClips)) {
    const { clip, matched, unmatched, total } = buildRetargetedClip(rawClip, root);
    totalMatched += matched;
    totalTracks += total;

    console.log(`[zombie-anim] 🔁 ${name}: ${matched}/${total} tracks casaram${unmatched > 0 ? ` (${unmatched} órfãs)` : ''}`);

    if (matched === 0) {
      console.warn(`[zombie-anim] ❌ "${name}" não tem NENHUMA track válida`);
      continue;
    }

    const action = mixer.clipAction(clip);
    if (name === 'dying' || name === 'death') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    z.mixerActions[name] = action;
  }

  const actionNames = Object.keys(z.mixerActions);
  console.log(`[zombie-anim] 🎬 ${actionNames.length} ações criadas: ${actionNames.join(', ')}`);
  console.log(`[zombie-anim] 📊 Taxa de retarget global: ${totalMatched}/${totalTracks} (${Math.round(totalMatched/totalTracks*100)}%)`);

  if (actionNames.length === 0) {
    console.error('[zombie-anim] ❌❌ NENHUMA AÇÃO — zumbi vai ficar em T-pose!');
    console.error('[zombie-anim] 👉 O skeleton do XBot e as tracks das animações têm nomes incompatíveis');
    return false;
  }

  const defaultName = (z.mixerActions.walk && 'walk') || (z.mixerActions.idle && 'idle') || actionNames[0];
  z.mixerActions[defaultName].play();
  z.currentAnim = z.mixerActions[defaultName];
  z.currentAnimName = defaultName;

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
  return { preloaded, loaded: Object.keys(loadedClips).length, total: Object.keys(ANIM_FILES).length, clips: Object.keys(loadedClips) };
}
