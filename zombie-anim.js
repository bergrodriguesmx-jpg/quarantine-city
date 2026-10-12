// ============================================================
// zombie-anim.js
// Carrega as animações do Mixamo e aplica no zumbi procedural.
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

const loader = new FBXLoader();
const loadedClips = {};
const loadPromises = {};
let preloaded = false;

function retargetClip(clip) {
  const newTracks = [];
  for (const track of clip.tracks) {
    const parts = track.name.split('.');
    const prop = parts.pop();
    const nodeName = parts.join('.');
    if (prop !== 'quaternion') continue;

    let normalized = nodeName;
    const pipeIdx = normalized.indexOf('|');
    if (pipeIdx >= 0) normalized = normalized.substring(pipeIdx + 1);
    const dotIdx = normalized.lastIndexOf('.');
    if (dotIdx >= 0) normalized = normalized.substring(dotIdx + 1);

    const ourJointName = BONE_MAP[normalized];
    if (!ourJointName) continue;

    const newTrack = new THREE.QuaternionKeyframeTrack(
      ourJointName + '.quaternion',
      Array.from(track.times),
      Array.from(track.values)
    );
    newTracks.push(newTrack);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

async function loadAnim(name, file) {
  if (loadPromises[name]) return loadPromises[name];
  loadPromises[name] = (async () => {
    try {
      // encodeURIComponent cuida dos parênteses em "zombie-biting(2).fbx"
      const url = BASE + encodeURIComponent(file).replace(/%2F/g, '/');
      const fbx = await loader.loadAsync(url);
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
  };
}
