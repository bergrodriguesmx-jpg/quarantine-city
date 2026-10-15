// ============================================================
// gib-models.js — v2 "SINGLE-CANDIDATE"
// Um nome por gib. Sem tentativas múltiplas.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

const GIB_FILES = {
  head:  'BasicZombieBlownHead.glb',
  torso: 'ZombieDoll.glb',
  armL:  'BasicZombieSeveredArmLeft.glb',
  armR:  'BasicZombieSeveredArmRight.glb',
  legL:  'BasicZombieSeveredLegLeft.glb',
  legR:  'BasicZombieSeveredLegRight.glb',
};

const MODELS_BASE = 'assets/models/';
const readyCache = new Map();
const failedSet = new Set();

function prepare(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);

  model.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          m.needsUpdate = true;
        }
      }
    }
  });

  model.userData._size = size;
  return model;
}

async function tryLoad(type) {
  if (readyCache.has(type)) return readyCache.get(type);
  if (failedSet.has(type)) return null;
  const file = GIB_FILES[type];
  if (!file) { failedSet.add(type); return null; }

  try {
    const gltf = await loader.loadAsync(MODELS_BASE + file);
    const cloned = gltf.scene.clone(true);
    cloned.traverse(c => {
      if (c.isMesh && c.material) {
        if (Array.isArray(c.material)) c.material = c.material.map(m => m.clone());
        else c.material = c.material.clone();
      }
    });
    prepare(cloned);
    readyCache.set(type, cloned);
    console.log(`[gib-models] ✅ ${type} ← ${file}`);
    return cloned;
  } catch (_) {
    failedSet.add(type);
    return null;
  }
}

export async function preloadGibs() {
  for (const t of Object.keys(GIB_FILES)) await tryLoad(t);
  const ok = [...readyCache.values()].filter(Boolean).length;
  console.log(`[gib-models] 📦 ${ok}/${Object.keys(GIB_FILES).length} gibs GLB (resto procedural)`);
}

export function createGib(type) {
  const base = readyCache.get(type);
  if (!base) return null;
  const clone = base.clone(true);
  clone.userData.size = base.userData._size.clone();
  clone.userData.gibType = type;
  return clone;
}

export function hasGib(type) {
  return readyCache.has(type) && readyCache.get(type) !== null;
}

export function getGibStatus() {
  const out = {};
  for (const t of Object.keys(GIB_FILES)) {
    out[t] = { loaded: hasGib(t), file: hasGib(t) ? GIB_FILES[t] : null };
  }
  return out;
}
