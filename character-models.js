// ============================================================
// character-models.js — v2 "SINGLE-CANDIDATE"
// Um nome por personagem. Sem tentativas múltiplas.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

const CHARACTER_FILES = {
  angel:          'Angel.glb',
  businessMale:   'BusinessMale.glb',
  businessFemale: 'BusinessFemale.glb',
};

const MODELS_BASE = 'assets/models/';
const readyCache = new Map();
const animCache = new Map();
const failedSet = new Set();

function prepare(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const scale = 1.8 / (size.y || 1);
  model.scale.setScalar(scale);
  model.position.multiplyScalar(scale);

  model.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          m.needsUpdate = true;
        }
      }
    }
  });
  return model;
}

async function tryLoad(id) {
  if (readyCache.has(id)) return readyCache.get(id);
  if (failedSet.has(id)) return null;

  const file = CHARACTER_FILES[id];
  if (!file) { failedSet.add(id); return null; }

  try {
    const gltf = await loader.loadAsync(MODELS_BASE + file);
    const scene = gltf.scene.clone(true);
    scene.traverse(c => {
      if (c.isMesh && c.material) {
        if (Array.isArray(c.material)) c.material = c.material.map(m => m.clone());
        else c.material = c.material.clone();
      }
    });
    prepare(scene);
    readyCache.set(id, scene);
    animCache.set(id, gltf.animations || []);
    console.log(`[character-models] ✅ ${id} ← ${file}`);
    return scene;
  } catch (_) {
    failedSet.add(id);
    return null;
  }
}

export async function preloadCharacters() {
  for (const id of Object.keys(CHARACTER_FILES)) await tryLoad(id);
  const ok = [...readyCache.values()].filter(Boolean).length;
  console.log(`[character-models] 📦 ${ok}/${Object.keys(CHARACTER_FILES).length} NPCs carregados`);
}

export function createCharacter(id) {
  const base = readyCache.get(id);
  if (!base) return null;
  const clone = base.clone(true);
  clone.userData.characterId = id;
  return clone;
}

export function getCharacterAnimations(id) { return animCache.get(id) || []; }
export function hasCharacter(id) { return readyCache.has(id) && readyCache.get(id) !== null; }

export function getCharacterStatus() {
  const out = {};
  for (const id of Object.keys(CHARACTER_FILES)) {
    out[id] = { loaded: hasCharacter(id), file: hasCharacter(id) ? CHARACTER_FILES[id] : null };
  }
  return out;
}
