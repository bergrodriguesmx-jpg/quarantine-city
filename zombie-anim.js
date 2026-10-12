// ============================================================
// zombie-anim.js — v4 (retarget configurável)
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

// ════════════════════════════════════════════════════════════
// 🎛️ CONFIG EXPORTADA — pode mexer no console do navegador!
// ════════════════════════════════════════════════════════════
export const config = {
  // Ordem da correção de bind:
  //   'mul_right'  → Q_ours = Q_mix * bindInv
  //   'mul_left'   → Q_ours = bindInv * Q_mix
  //   'none'       → Q_ours = Q_mix
  bindOrder: 'mul_right',

  // Offset adicional pra bones dos braços (corrige T-pose)
  useArmOffset: true,
  armOffsetAxis: 'z',        // 'x', 'y', 'z'
  armOffsetAngleDeg: 90,     // graus
  armOffsetLeftSign: 1,      // 1 ou -1 (pra mirrorar direita)
  armOffsetRightSign: -1,

  // Quais bones recebem o offset
  offsetShoulder: true,
  offsetElbow: true,
  offsetHand: true,

  // Aplica o offset nas pernas também?
  useLegOffset: false,
  legOffsetAxis: 'x',
  legOffsetAngleDeg: 0,
};
// Expõe no window pra fácil debug
if (typeof window !== 'undefined') window.__zombieAnimCfg = config;

const ARM_L_BONES = new Set(['shoulderL', 'elbowL', 'handL']);
const ARM_R_BONES = new Set(['shoulderR', 'elbowR', 'handR']);

function makeAxisQuat(axis, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  const v = axis === 'x' ? new THREE.Vector3(1,0,0)
          : axis === 'y' ? new THREE.Vector3(0,1,0)
          : new THREE.Vector3(0,0,1);
  return new THREE.Quaternion().setFromAxisAngle(v, a);
}

const loader = new FBXLoader();
const originalClips = {};   // clips como vieram do FBX
const loadedClips = {};     // clips após retarget
const loadPromises = {};
const bindQuats = {};
let preloaded = false;

function normalizeBoneName(name) {
  let n = name;
  const pipeIdx = n.indexOf('|');
  if (pipeIdx >= 0) n = n.substring(pipeIdx + 1);
  const dotIdx = n.lastIndexOf('.');
  if (dotIdx >= 0) n = n.substring(dotIdx + 1);
  return n;
}

function extractBindPoses(fbx) {
  fbx.traverse(node => {
    if (!node.name || !node.quaternion) return;
    const norm = normalizeBoneName(node.name);
    if (norm.startsWith('mixamorig') && !bindQuats[norm]) {
      bindQuats[norm] = node.quaternion.clone();
    }
  });
}

function retargetClip(clip) {
  const newTracks = [];

  // Pré-calcula os quaternions de offset de braço
  const qArmL = config.useArmOffset
    ? makeAxisQuat(config.armOffsetAxis, config.armOffsetAngleDeg * config.armOffsetLeftSign)
    : null;
  const qArmR = config.useArmOffset
    ? makeAxisQuat(config.armOffsetAxis, config.armOffsetAngleDeg * config.armOffsetRightSign)
    : null;
  const qLeg = config.useLegOffset
    ? makeAxisQuat(config.legOffsetAxis, config.legOffsetAngleDeg)
    : null;

  for (const track of clip.tracks) {
    const parts = track.name.split('.');
    const prop = parts.pop();
    const nodeName = parts.join('.');
    if (prop !== 'quaternion') continue;

    const norm = normalizeBoneName(nodeName);
    const ourJointName = BONE_MAP[norm];
    if (!ourJointName) continue;

    const bindQ = bindQuats[norm];
    const bindInv = bindQ ? bindQ.clone().invert() : null;

    const times = Array.from(track.times);
    const srcValues = track.values;
    const outValues = new Float32Array(srcValues.length);
    const q = new THREE.Quaternion();

    // Escolhe o offset pro bone atual
    let offsetQ = null;
    if (ARM_L_BONES.has(ourJointName)) {
      if (ourJointName === 'shoulderL' && !config.offsetShoulder) offsetQ = null;
      else if (ourJointName === 'elbowL' && !config.offsetElbow) offsetQ = null;
      else if (ourJointName === 'handL' && !config.offsetHand) offsetQ = null;
      else offsetQ = qArmL;
    } else if (ARM_R_BONES.has(ourJointName)) {
      if (ourJointName === 'shoulderR' && !config.offsetShoulder) offsetQ = null;
      else if (ourJointName === 'elbowR' && !config.offsetElbow) offsetQ = null;
      else if (ourJointName === 'handR' && !config.offsetHand) offsetQ = null;
      else offsetQ = qArmR;
    } else if (qLeg && (ourJointName === 'thighL' || ourJointName === 'thighR'
                     || ourJointName === 'kneeL' || ourJointName === 'kneeR'
                     || ourJointName === 'footL' || ourJointName === 'footR')) {
      offsetQ = qLeg;
    }

    for (let i = 0; i < srcValues.length; i += 4) {
      q.set(srcValues[i], srcValues[i+1], srcValues[i+2], srcValues[i+3]);

      // Aplica correção de bind na ordem configurada
      if (bindInv && config.bindOrder === 'mul_right') {
        q.multiply(bindInv);       // q = q * bindInv
      } else if (bindInv && config.bindOrder === 'mul_left') {
        q.premultiply(bindInv);    // q = bindInv * q
      }
      // config.bindOrder === 'none' → não faz nada

      // Aplica offset adicional (T-pose correction)
      if (offsetQ) q.premultiply(offsetQ);

      outValues[i]   = q.x;
      outValues[i+1] = q.y;
      outValues[i+2] = q.z;
      outValues[i+3] = q.w;
    }

    newTracks.push(new THREE.QuaternionKeyframeTrack(
      ourJointName + '.quaternion',
      times,
      outValues
    ));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}

function rebuildAllClips() {
  for (const name in originalClips) {
    loadedClips[name] = retargetClip(originalClips[name]);
  }
}

// Permite refazer o retarget sem recarregar os FBXs
export function refreshRetarget() {
  if (!preloaded) return false;
  rebuildAllClips();
  console.log('[zombie-anim] 🔄 Retarget refeito com config:', JSON.stringify(config, null, 2));
  return true;
}
if (typeof window !== 'undefined') window.__zombieAnimRefresh = refreshRetarget;

async function loadAnim(name, file) {
  if (loadPromises[name]) return loadPromises[name];
  loadPromises[name] = (async () => {
    try {
      const url = BASE + encodeURIComponent(file).replace(/%2F/g, '/');
      const fbx = await loader.loadAsync(url);
      extractBindPoses(fbx);

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
    console.log('[zombie-anim] 🎛️ Config atual:', config);
    console.log('[zombie-anim] 💡 Pra testar config diferente no console:');
    console.log('     window.__zombieAnimCfg.armOffsetAngleDeg = -90; window.__zombieAnimRefresh()');
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
    config: { ...config },
  };
}
