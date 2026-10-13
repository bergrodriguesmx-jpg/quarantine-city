// ============================================================
// zombie-anim.js — v10
// Filtra Hips.position/scale (anti-flutuante) e prioriza FBX.
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'assets/zombie-anim/';
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();

// 🎯 FBX PRIMEIRO — combina com o modelo base (também FBX)
//    Assim o esqueleto do modelo e das animações usa a mesma bind pose.
const ANIM_FILES = {
  idle:     ['zombie-idle.fbx'],
  walk:     ['zombie-walk.fbx'],
  run:      ['zombie-run.fbx'],
  attack:   ['zombie-attack.fbx'],
  bite1:    ['zombie-biting.fbx'],
  bite2:    ['zombie-biting(2).fbx'],
  neckbite: ['zombie-neck-bite.fbx'],
  dying:    ['zombie-dying.fbx'],
  death:    ['zombie-death.fbx'],
  crawl:    ['zombie-crawl.fbx'],
  runcrawl: ['running-crawl.fbx'],
  scream:   ['zombie-scream.fbx'],
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

function canonicalTrackName(trackName) {
  const dot = trackName.lastIndexOf('.');
  if (dot < 0) return trackName;
  const bonePart = trackName.substring(0, dot);
  const propPart = trackName.substring(dot);
  return canonicalBoneName(bonePart) + propPart;
}

// ══════════════════════════════════════════════
// 🎯 SANITIZAÇÃO: remove root motion do Hips
// Isso é o que corrige "flutua + inclina + pernas pra cima".
//
// Animação Mixamo escreve em "Hips.position" a posição ABSOLUTA
// do quadril na cena, na escala em que o FBX foi exportado.
// Como o nosso esqueleto foi re-escalado (1.8m) e/ou convertido
// por outros programas, essa posição fica errada → boneco voa.
//
// Solução: removemos track de position/scale do Hips. Rotação
// continua animando normalmente, então o personagem balança
// tronco/pernas/braços corretamente, mas fica ancorado no chão.
// ══════════════════════════════════════════════
function sanitizeClip(clip) {
  if (!clip || !clip.tracks) return clip;
  const before = clip.tracks.length;

  clip.tracks = clip.tracks.filter(t => {
    const name = canonicalTrackName(t.name);
    // Remove SÓ position/scale do Hips (raiz). Rotation fica.
    if (/^Hips\.position$/i.test(name)) return false;
    if (/^Hips\.scale$/i.test(name))    return false;
    // Remove também se algum FBX tiver "Root" como raiz
    if (/^Root\.position$/i.test(name)) return false;
    if (/^Root\.scale$/i.test(name))    return false;
    return true;
  });

  const removed = before - clip.tracks.length;
  if (removed > 0) {
    // console.log(`[zombie-anim] 🧹 ${clip.name}: removidas ${removed} tracks de root motion`);
  }
  return clip;
}

// Retarget in-place (renomeia "mixamorig:Hips" → "Hips")
function retargetClip(clip) {
  if (!clip || !clip.tracks) return clip;
  for (const track of clip.tracks) {
    const newName = canonicalTrackName(track.name);
    if (newName !== track.name) track.name = newName;
  }
  return clip;
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

        // Pipeline: retarget → sanitize
        const retargeted = retargetClip(rawClip);
        const clip = sanitizeClip(retargeted);

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
  console.log('[zombie-anim] 📦 Carregando animações (FBX)...');
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
