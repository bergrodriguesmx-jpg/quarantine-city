// ============================================================
// gib-models.js
// Pedaços de zumbi (cabeça, torso, braços, pernas) extraídos.
// Usado quando um zumbi é desmembrado no jogo.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Tenta na ordem. O primeiro que existir é usado.
export const GIB_CANDIDATES = {
  head:  ['BasicZombieHead.glb', 'ZombieHead.glb', 'Head.glb', 'BasicZombieHead_3D.glb'],
  torso: ['BasicZombieTorso.glb', 'ZombieTorso.glb', 'Torso.glb', 'BasicZombieBody.glb'],
  armL:  ['BasicZombieArmL.glb', 'BasicZombieArm.glb', 'BasicZombieArms.glb', 'ZombieArm.glb'],
  armR:  ['BasicZombieArmR.glb', 'BasicZombieArm.glb', 'BasicZombieArms.glb', 'ZombieArm.glb'],
  legL:  ['BasicZombieLegL.glb', 'BasicZombieLeg.glb', 'BasicZombieLegs.glb', 'ZombieLeg.glb'],
  legR:  ['BasicZombieLegR.glb', 'BasicZombieLeg.glb', 'BasicZombieLegs.glb', 'ZombieLeg.glb'],
};

const MODELS_BASE = 'assets/models/';
const readyCache = new Map();
const sourceCache = new Map();

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
  const candidates = GIB_CANDIDATES[type] || [];

  for (const file of candidates) {
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
      sourceCache.set(type, file);
      console.log(`[gib-models] ✅ ${type} ← ${file}`);
      return cloned;
    } catch (_) {}
  }

  console.warn(`[gib-models] ⚠️ ${type} — nenhum GLB`);
  readyCache.set(type, null);
  return null;
}

export async function preloadGibs() {
  const types = Object.keys(GIB_CANDIDATES);
  for (const t of types) await tryLoad(t);
  console.log('[gib-models] 📦 Preload completo:');
  console.table(Object.keys(GIB_CANDIDATES).map(t => ({
    tipo: t, carregado: hasGib(t) ? '✅' : '❌',
    arquivo: sourceCache.get(t) || '—',
  })));
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
  for (const t of Object.keys(GIB_CANDIDATES)) {
    out[t] = { loaded: hasGib(t), file: sourceCache.get(t) || null };
  }
  return out;
}
