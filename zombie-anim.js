// ============================================================
// zombie-anim.js — v10 (retarget dinâmico + logs detalhados)
// Em vez de renomear as tracks para uma forma fixa, procuramos
// o bone REAL no skeleton e reescrevemos a track pra ele.
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
        if (!clip) continue;
        loadedClips[name] = clip;
        console.log(`[zombie-anim] ✅ ${name} ← ${file} (${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`);
        return clip;
      } catch (err) {
        console.warn(`[zombie-anim] ⚠️ ${name} ← ${file}: ${err.message}`);
      }
    }
    console.warn(`[zombie-anim] ❌ ${name}: nenhum candidato funcionou`);
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
  if (loaded > 0) {
    const first = Object.values(loadedClips)[0];
    console.log(`[zombie-anim] 📋 Amostra de tracks originais do 1º clip:`, first.tracks.slice(0, 5).map(t => t.name));
  }
}

export function hasZombieAnims() {
  return preloaded && Object.keys(loadedClips).length > 0;
}

// ════════════════════════════════════════════════════════════
// RETARGET DINÂMICO
// Pra cada track, achamos o bone correspondente no skeleton
// e reescrevemos a track com o nome EXATO do bone do skeleton.
// ════════════════════════════════════════════════════════════
function buildRetargetedClip(clip, root) {
  // Mapa lowercase → nome real do bone
  const boneMap = new Map();
  root.traverse(o => {
    if (o.isBone) {
      boneMap.set(o.name.toLowerCase(), o.name);
      const canon = canonicalBoneName(o.name).toLowerCase();
      if (canon && !boneMap.has(canon)) boneMap.set(canon, o.name);
    }
  });

  const newTracks = [];
  let matched = 0;
  let unmatched = 0;

  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    if (dot < 0) continue;
    const bonePart = track.name.substring(0, dot);
    const propPart = track.name.substring(dot);

    // Tenta: exato, lowercase, canônico, sem prefixo mixamorig
    const candidates = [
      bonePart,
      bonePart.toLowerCase(),
      canonicalBoneName(bonePart).toLowerCase(),
    ];

    let realName = null;
    for (const c of candidates) {
      realName = boneMap.get(c);
      if (realName) break;
    }

    if (realName) {
      track.name = realName + propPart;
      newTracks.push(track);
      matched++;
    } else {
      unmatched++;
    }
  }

  return { clip: new THREE.AnimationClip(clip.name, clip.duration, newTracks), matched, unmatched, total: clip.tracks.length };
}

export function setupZombieAnimator(z) {
  if (!hasZombieAnims()) {
    console.warn('[zombie-anim] ⚠️ setupZombieAnimator: sem animações carregadas');
    return false;
  }
  if (!z.instance || !z.instance.scene) {
    console.warn('[zombie-anim] ⚠️ setupZombieAnimator: z.instance inválido');
    return false;
  }
  if (z.mixer) return true;

  const root = z.instance.scene;

  // Conta bones
  let boneCount = 0;
  root.traverse(o => { if (o.isBone) boneCount++; });
  console.log(`[zombie-anim] 🦴 Skeleton do zumbi: ${boneCount} bones`);

  // Cria mixer e retargeta cada clip
  const mixer = new THREE.AnimationMixer(root);
  z.mixer = mixer;
  z.mixerActions = {};

  const firstName = Object.keys(loadedClips)[0];
  for (const [name, rawClip] of Object.entries(loadedClips)) {
    const { clip, matched, unmatched, total } = buildRetargetedClip(rawClip, root);

    if (name === firstName) {
      console.log(`[zombie-anim] 🔁 Retarget de "${name}": ${matched}/${total} tracks casaram (${unmatched} sem bone)`);
      if (unmatched > 0) {
        console.log(`[zombie-anim] 📋 Tracks sem match (amostra):`, rawClip.tracks.slice(0, 3).map(t => t.name));
      }
    }

    if (matched === 0) {
      console.warn(`[zombie-anim] ❌ "${name}": NENHUMA track encontrou bone!`);
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

  if (actionNames.length === 0) {
    console.error('[zombie-anim] ❌❌ NENHUMA ação criada — zumbi vai ficar em T-pose!');
    return false;
  }

  // Default: walk > idle > primeiro
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
