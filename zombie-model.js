// ============================================================
// zombie-model.js
// Carrega o personagem Mixamo (XBot.fbx) e cria clones rigados.
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const loader = new FBXLoader();
const BASE = 'assets/zombie-anim/';

let baseScene = null;
let loaded = false;

// Nomes dos bones do Mixamo (úteis pra outras partes do código)
export const BONE_NAMES = {
  head:      'mixamorigHead',
  neck:      'mixamorigNeck',
  spineUpper:'mixamorigSpine1',
  spineLower:'mixamorigSpine',
  pelvis:    'mixamorigHips',
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

function normalizeName(name) {
  if (!name) return null;
  let n = name;
  const colon = n.indexOf(':');
  if (colon >= 0) n = 'mixamorig' + n.substring(colon + 1);
  const dot = n.indexOf('.');
  if (dot >= 0) n = n.substring(0, dot);
  return n;
}

export async function preloadZombieModel() {
  if (loaded) return baseScene;
  try {
    const fbx = await loader.loadAsync(BASE + 'XBot.fbx');
    baseScene = fbx.scene;

    // Normaliza: bone names limpos
    baseScene.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      }
    });

    loaded = true;
    console.log('[zombie-model] ✅ XBot carregado');
    return baseScene;
  } catch (e) {
    console.error('[zombie-model] ❌ Falha ao carregar XBot:', e);
    return null;
  }
}

export function isModelReady() { return loaded; }

// Cria um clone rigado + retorna estrutura de bones e partes
export function createZombieInstance() {
  if (!baseScene) return null;

  const clone = skeletonClone(baseScene);

  // Mapa nome do bone → objeto Bone
  const bones = {};
  clone.traverse(o => {
    if (!o.isBone) return;
    const norm = normalizeName(o.name);
    if (norm) bones[norm] = o;
  });

  // Resolve cada bone que interessa
  const joints = {};
  for (const [ourName, mixName] of Object.entries(BONE_NAMES)) {
    joints[ourName] = bones[mixName] || null;
  }

  // Corrige escala — XBot fica ~1.9m; escala pra 1.8m
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const height = box.max.y - box.min.y;
  const targetHeight = 1.8;
  const scale = height > 0.1 ? targetHeight / height : 1;
  clone.scale.setScalar(scale);

  // Reajusta pra pés no chão
  clone.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(clone);
  clone.position.y = -box2.min.y;

  return {
    scene: clone,
    bones,
    joints,
    scale,
  };
}

// Aplica cor (tint) numa instância
export function tintZombie(instance, skinColor, shirtColor) {
  const scene = instance.scene;
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.color) {
        // XBot usa um único material — usa skin como base
        m.color.setHex(skinColor);
      }
    }
  });
}
