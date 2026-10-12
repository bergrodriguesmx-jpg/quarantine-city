// ============================================================
// zombie-anim.js — v5
// Reconstrói a pose de rest do rig procedural pra bater com
// as bind poses do Mixamo. Assim as animações encaixam direto.
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

// Mixamo bone → nosso joint
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

// Nosso joint → Mixamo bone (inverso, pro bind)
const JOINT_TO_MIXAMO = {
  pelvis:    'mixamorigHips',
  spineLower:'mixamorigSpine',
  spineUpper:'mixamorigSpine1',
  neck:      'mixamorigNeck',
  head:      'mixamorigHead',
  shoulderL: 'mixamorigLeftArm',
  elbowL:    'mixamorigLeftForeArm',
  handL:     'mixamorigLeftHand',
  shoulderR: 'mixamorigRightArm',
  elbowR:    'mixamorigRightForeArm',
  handR:     'mixamorigRightHand',
  thighL:    'mixamorigLeftUpLeg',
  kneeL:     'mixamorigLeftLeg',
  footL:     'mixamorigLeftFoot',
  thighR:    'mixamorigRightUpLeg',
  kneeR:     'mixamorigRightLeg',
  footR:     'mixamorigRightFoot',
};

// ════════════════════════════════════════════════════════════
// CONFIG — testável via console
// ════════════════════════════════════════════════════════════
export const config = {
  // Rotação extra (polish) em graus por joint
  extraRotations: {
    pelvis:    { x: 0, y: 0, z: 0 },
    spineLower:{ x: 0, y: 0, z: 0 },
    spineUpper:{ x: 0, y: 0, z: 0 },
    neck:      { x: 0, y: 0, z: 0 },
    head:      { x: 0, y: 0, z: 0 },
    shoulderL: { x: 0, y: 0, z: 0 },
    elbowL:    { x: 0, y: 0, z: 0 },
    handL:     { x: 0, y: 0, z: 0 },
    shoulderR: { x: 0, y: 0, z: 0 },
    elbowR:    { x: 0, y: 0, z: 0 },
    handR:     { x: 0, y: 0, z: 0 },
    thighL:    { x: 0, y: 0, z: 0 },
    kneeL:     { x: 0, y: 0, z: 0 },
    footL:     { x: 0, y: 0, z: 0 },
    thighR:    { x: 0, y: 0, z: 0 },
    kneeR:     { x: 0, y: 0, z: 0 },
    footR:     { x: 0, y: 0, z: 0 },
  },
};
if (typeof window !== 'undefined') window.__zombieAnimCfg = config;

const loader = new FBXLoader();
const originalClips = {};
const loadedClips = {};
const loadPromises = {};
const mixamoBind = {};
let preloaded = false;
let bindExtracted = false;

function normalizeMixamoName(name) {
  if (!name) return null;
  let n = name;
  const colon = n.indexOf(':');
  if (colon >= 0) n = 'mixamorig' + n.substring(colon + 1);
  const dot = n.indexOf('.');
  if (dot >= 0) n = n.substring(0, dot);
  return n;
}

// Extrai os bind quats de UM FBX (só na primeira vez)
function extractBindQuats(fbx) {
  if (bindExtracted) return;
  fbx.traverse(node => {
    if (!node.isBone) return;
    const norm = normalizeMixamoName(node.name);
    if (!norm || !norm.startsWith('mixamorig')) return;
    if (!mixamoBind[norm]) {
      mixamoBind[norm] = node.quaternion.clone();
    }
  });
  bindExtracted = true;
  console.log(`[zombie-anim] 🦴 ${Object.keys(mixamoBind).length} bind quats extraídos`);
}

// Retarget = passthrough direto (as bind poses já corrigem a orientação)
function retargetClip(clip) {
  const newTracks = [];
  for (const track of clip.tracks) {
    const parts = track.name.split('.');
    const prop = parts.pop();
    const nodeName = parts.join('.');
    if (prop !== 'quaternion') continue;
    const norm = normalizeMixamoName(nodeName);
    const ourJointName = BONE_MAP[norm];
    if (!ourJointName) continue;
    newTracks.push(new THREE.QuaternionKeyframeTrack(
      ourJointName + '.quaternion',
      Array.from(track.times),
      Array.from(track.values)
    ));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

// Aplica bind poses + extra rotations nos joints do zumbi
export function applyBindPosesToZombie(z) {
  const joints = z.mesh && z.mesh.userData && z.mesh.userData.joints;
  if (!joints) return false;

  let applied = 0;
  for (const [ourName, mixamoName] of Object.entries(JOINT_TO_MIXAMO)) {
    const joint = joints[ourName];
    const q = mixamoBind[mixamoName];
    if (joint && q) {
      joint.quaternion.copy(q);
      applied++;
    }
  }

  // Extra rotations
  for (const [jointName, rot] of Object.entries(config.extraRotations)) {
    const joint = joints[jointName];
    if (!joint) continue;
    if (rot.x) joint.rotateX(rot.x * Math.PI / 180);
    if (rot.y) joint.rotateY(rot.y * Math.PI / 180);
    if (rot.z) joint.rotateZ(rot.z * Math.PI / 180);
  }

  return applied > 0;
}

async function loadAnim(name, file) {
  if (loadPromises[name]) return loadPromises[name];
  loadPromises[name] = (async () => {
    try {
      const url = BASE + encodeURIComponent(file).replace(/%2F/g, '/');
      const fbx = await loader.loadAsync(url);
      extractBindQuats(fbx);
      const clip = fbx.animations && fbx.animations[0];
      if (!clip) {
        console.warn(`[zombie-anim] ⚠️ ${file} sem animação`);
        return null;
      }
      originalClips[name] = clip;
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
      anim: n, file: ANIM_FILES[n], tracks: loadedClips[n].tracks.length,
    })));
    console.log('[zombie-anim] 🦴 Bind quats:', Object.keys(mixamoBind).length);
    console.log('[zombie-anim] 🎛️ Pra tweakar no console:');
    console.log('     window.__zombieAnimCfg.extraRotations.shoulderL.z = 45;');
    console.log('     (depois Ctrl+Shift+R pra recarregar)');
  }
}

export function hasZombieAnims() {
  return preloaded && Object.keys(loadedClips).length > 0;
}

export function setupZombieAnimator(z) {
  if (!hasZombieAnims()) return false;
  if (z.mixer) return true;

  // ⚡ Aplica bind poses ANTES de criar o mixer
  applyBindPosesToZombie(z);

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

export function updateZombieAnim(z, dt) { if (z.mixer) z.mixer.update(dt); }

export function handleZombieAnimState(z, realSpeed) {
  if (!z.mixer) return;
  if (z.attackWindupActive) {
    if (z.currentAnimName !== 'attack')
      playZombieAnim(z, 'attack', { fade: 0.08, force: true, timeScale: 1.4 });
    return;
  }
  if (z.crawling) {
    playZombieAnim(z, realSpeed > 0.5 ? 'runcrawl' : 'crawl', { fade: 0.2 });
    return;
  }
  if (realSpeed > 1.5)      playZombieAnim(z, 'run',  { fade: 0.15 });
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
    bindQuats: Object.keys(mixamoBind).length,
    config: { ...config },
  };
}
