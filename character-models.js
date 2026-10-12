// ============================================================
// character-models.js
// Carrega Angel, BusinessMale e BusinessFemale.
// Usados como NPCs decorativos no mapa (sem animação).
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export const CHARACTER_CANDIDATES = {
  angel:          ['Angel_Gun.glb', 'Angel.glb', 'Angel_3D.glb', 'AngelLowPoly.glb'],
  businessMale:   ['BusinessMale_Gun.glb', 'BusinessMale.glb', 'BusinessMale_3D.glb', 'Businessman.glb'],
  businessFemale: ['BusinessFemale_Gun.glb', 'BusinessFemale.glb', 'BusinessFemale_3D.glb', 'Businesswoman.glb'],
};

const MODELS_BASE = 'assets/models/';
const readyCache = new Map();
const sourceCache = new Map();
const animCache = new Map();

function prepare(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Centraliza X/Z, pés no chão
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  // Escala pra 1.8m
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
  const candidates = CHARACTER_CANDIDATES[id] || [];

  for (const file of candidates) {
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
      sourceCache.set(id, file);
      animCache.set(id, gltf.animations || []);
      console.log(`[character-models] ✅ ${id} ← ${file} (${(gltf.animations||[]).length} anims)`);
      return scene;
    } catch (_) {}
  }

  console.warn(`[character-models] ⚠️ ${id} — nenhum GLB`);
  readyCache.set(id, null);
  return null;
}

export async function preloadCharacters() {
  for (const id of Object.keys(CHARACTER_CANDIDATES)) await tryLoad(id);
  console.log('[character-models] 📦 Preload completo');
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
  for (const id of Object.keys(CHARACTER_CANDIDATES)) {
    out[id] = {
      loaded: hasCharacter(id),
      file: sourceCache.get(id) || null,
      animations: (animCache.get(id) || []).length,
    };
  }
  return out;
}
