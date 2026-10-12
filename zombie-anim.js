// ============================================================
// zombie-anim.js — v2 (com correção de rest pose)
// Extrai a bind rotation dos bones Mixamo e retargeta corretamente.
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const BASE = 'assets/zombie-anim/';

const ANIM_FILES = {
  idle:     'zombie-idle.fbx',
  walk:     'zombie-walk.fbx',
  run:      'zombie-run.fbx',
  attack:   'zombie-attack.fbx',
  bite1:    'zombie-biting.fbx',
  bite2:    'zombie-biting(2).fbx',
  neckbite: 'zombie-neck-bite.fbx',
  dying:    'zombie-dying.fbx',
  death:    'zombie-death.fbx',
  crawl:    'zombie-crawl.fbx',
  runcrawl: 'running-crawl.fbx',
  scream:   'zombie-scream.fbx',
};

const BONE_MAP = {
  'mixamorigHips':          'pelvis',
  'mixamorigSpine':         'spineLower',
  'mixamorigSpine1':        'spineUpper',
  'mixamorigSpine2':        null,
  'mixamorigNeck':          'neck',
  'mixamorigHead':          'head',
  'mixamorigLeftShoulder':  null,
  'mixamorigLeftArm':       'shoulderL',
  'mixamorigLeftForeArm':   'elbowL',
  'mixamorigLeftHand':      'handL',
  'mixamorigRightShoulder': null,
  'mixamorigRightArm':      'shoulderR',
  'mixamorigRightForeArm':  'elbowR',
  'mixamorigRightHand':     'handR',
  'mixamorigLeftUpLeg':     'thighL',
  'mixamorigLeftLeg':       'kneeL',
  'mixamorigLeftFoot':      'footL',
  'mixamorigLeftToeBase':   null,
  'mixamorigRightUpLeg':    'thighR',
  'mixamorigRightLeg':      'kneeR',
  'mixamorigRightFoot':     'footR',
  'mixamorigRightToeBase':  null,
};

// Cache de bind quaternions por bone (extraído do FBX scene)
const bindQuats = {};

const loader = new FBXLoader();
const loadedClips = {};
const loadPromises = {};
let preloaded = false;

// Tira prefixos tipo "Armature|" ou "Armature." do nome do bone
function normalizeBoneName(name) {
  let n = name;
  const pipeIdx = n.indexOf('|');
  if (pipeIdx >= 0) n = n.substring(pipeIdx + 1);
  const dotIdx = n.lastIndexOf('.');
  if (dotIdx >= 0) n = n.substring(dotIdx + 1);
  return n;
}

// Extrai os bind quaternions de cada bone do FBX scene
function extractBindPoses(fbx) {
  fbx.traverse(node => {
    if (!node.name || !node.quaternion) return;
    const norm = normalizeBoneName(node.name);
    // Só interessa bones mixamorig
    if (norm.startsWith('mixamorig') && !bindQuats[norm]) {
      bindQuats[norm] = node.quaternion.clone();
    }
  });
}

// Retargeta o clip aplicando a correção de bind pose
function retargetClip(clip) {
  const newTracks = [];
  for (const track of clip.tracks) {
    const parts = track.name.split('.');
    const prop = parts.pop();
    const nodeName = parts.join('.');
    if (prop !== 'quaternion') continue;

    const norm = normalizeBoneName(nodeName);
    const ourJointName = BONE_MAP[norm];
    if (!ourJointName) continue;

    const bindQ = bindQuats[norm];
    if (!bindQ) continue;

    // bindQ^-1 (inverte)
    const bindInv = bindQ.clone().invert();

    // Aplica bindQ^-1 * animQ em cada keyframe
    const times = Array.from(track.times);
    const srcValues = track.values;
    const correctedValues = new Float32Array(srcValues.length);
    const tmpQ = new THREE.Quaternion();
    for (let i = 0; i < srcValues.length; i += 4) {
      tmpQ.set(srcValues[i], srcValues[i+1], srcValues[i+2], srcValues[i+3]);
      const result = bindInv.clone().multiply(tmpQ);
      correctedValues[i]   = result.x;
      correctedValues[i+1] = result.y;
      correctedValues[i+2] = result.z;
      correctedValues[i+3] = result.w;
    }

    newTracks.push(new THREE.QuaternionKeyframeTrack(
      ourJointName + '.quaternion',
      times,
      correctedValues
    ));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

async function loadAnim(name, file) {
  if (loadPromises[name]) return loadPromises[name];
  loadPromises[name] = (async () => {
    try {
      const url = BASE + encodeURIComponent(file).replace(/%2F/g, '/');
      const fbx = await loader.loadAsync(url);

      // Primeira vez: extrai bind poses (só precisa uma vez, mas chamar sempre é idempotente)
      extractBindPoses(fbx);

      const clip = fbx.animations && fbx.animations[0];
      if (!clip) {
        console.warn(`[zombie-anim] ⚠️ ${file} sem animação`);
        return null;
      }
      const retargeted = retargetClip(clip);
      loadedClips[name] = retargeted;
      console.log(`[zombie-anim] ✅ ${name} ← ${file} (${retargeted.tracks.length} tracks)`);
      return retargeted;
    } catch (e) {
      console.warn(`[zombie-anim] ❌ ${file}: ${e.message}`);
      return null;
    }
  })();
  return loadPromises[name];
}

export async function preloadZombieAnims() {
  if (preloaded) return;
  console.log('[zombie-anim] 📦 Carregando animações Mixamo...');
  const entries = Object.entries(ANIM_FILES);
  await Promise.all(entries.map(([name, file]) => loadAnim(name, file)));
  preloaded = true;
  const loaded = Object.keys(loadedClips).length;
  console.log(`[zombie-anim] 📦 ${loaded}/${entries.length} animações prontas`);
  if (loaded > 0) {
    console.table(Object.keys(loadedClips).map(n => ({
      anim: n,
      file: ANIM_FILES[n],
      tracks: loadedClips[n].tracks.length,
    })));
    console.log('[zombie-anim] 📋 Bind quats extraídos:', Object.keys(bindQuats).length, 'bones');
  }
}

export function hasZombieAnims() {
  return preloaded && Object.keys(loadedClips).length > 0;
}

export function setupZombieAnimator(z) {
  if (!hasZombieAnims()) return false;
  if (z.mixer) return true;

  const mixer = new THREE.AnimationMixer(z.mesh);
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

export function updateZombieAnim(z, dt) {
  if (z.mixer) z.mixer.update(dt);
}

export function handleZombieAnimState(z, realSpeed) {
  if (!z.mixer) return;

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

  if (realSpeed > 1.5) {
    playZombieAnim(z, 'run', { fade: 0.15 });
  } else if (realSpeed > 0.15) {
    playZombieAnim(z, 'walk', { fade: 0.15 });
  } else {
    playZombieAnim(z, 'idle', { fade: 0.25 });
  }
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
    bindQuats: Object.keys(bindQuats),
  };
}
