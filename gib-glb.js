// ============================================================
// gib-glb.js
// Carrega:
//   1. Membros decepados (braços, pernas, cabeça) - usados
//      quando o zumbi é desmembrado
//   2. Corpos completos - usados como cadáveres decorativos
//
// Normaliza escala automaticamente (os GLBs do AssetRipper
// vêm com escalas completamente aleatórias).
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const MODELS_BASE = 'assets/models/';

// ════════ MEMBROS DECEPADOS ════════
// Escolhido o "Severed" (membro inteiro) quando existe,
// com fallback pra "Gib" (pedaço).

const LIMB_CANDIDATES = {
  head: ['BasicZombieBlownHead.glb', 'BasicZombieSplitHeadGib.glb'],
  armL: ['BasicZombieSeveredArmLeft.glb', 'WorkerZombieLeftArm.glb', 'BasicZombieArmGibLeft.glb'],
  armR: ['BasicZombieSeveredArmRight.glb', 'WorkerZombieRightArm.glb', 'BasicZombieArmGibRight.glb'],
  legL: ['BasicZombieSeveredLegLeft.glb', 'WorkerZombieLeftLeg.glb', 'BasicZombieLeftLegGib.glb'],
  legR: ['BasicZombieSeveredLegRight.glb', 'WorkerZombieRightLeg.glb', 'BasicZombieRightLegGib.glb'],
};

// Tamanho alvo em metros (proporcional ao zumbi de 1.8m)
const LIMB_TARGET_SIZE = {
  head: 0.28,
  armL: 0.70,
  armR: 0.70,
  legL: 0.85,
  legR: 0.85,
};

// ════════ CADÁVERES ════════
const CORPSE_CANDIDATES = {
  worker:    ['WorkerZombie.glb'],
  miner:     ['MinerZombie.glb'],
  combatant: ['CombatantZombieMesh1.glb'],
  zbguy:     ['ZbGuyMesh.glb'],
};

const CORPSE_TARGET_HEIGHT = 1.8; // altura de pé, a gente deita depois

// ════════ ESTADO ════════
const limbCache = new Map();
const limbSource = new Map();
const corpseCache = new Map();
const corpseSource = new Map();

// ════════ NORMALIZAÇÃO ════════
// Centraliza a geometria no pivô e escala pra tamanho alvo.
function normalize(model, targetSize) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  model.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  model.scale.multiplyScalar(scale);

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

  model.userData._size = new THREE.Vector3(
    size.x * scale,
    size.y * scale,
    size.z * scale
  );
  return model;
}

// ════════ LOAD DE MEMBRO ════════
async function tryLoadLimb(type) {
  if (limbCache.has(type)) return limbCache.get(type);
  const candidates = LIMB_CANDIDATES[type] || [];
  const targetSize = LIMB_TARGET_SIZE[type] || 0.5;

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
      normalize(cloned, targetSize);
      limbCache.set(type, cloned);
      limbSource.set(type, file);
      console.log(`[gib-glb] ✅ membro ${type} ← ${file} (escala ${targetSize}m)`);
      return cloned;
    } catch (_) {}
  }

  console.warn(`[gib-glb] ⚠️ membro ${type} — nenhum GLB, usando procedural`);
  limbCache.set(type, null);
  return null;
}

// ════════ LOAD DE CADÁVER ════════
async function tryLoadCorpse(id) {
  if (corpseCache.has(id)) return corpseCache.get(id);
  const candidates = CORPSE_CANDIDATES[id] || [];

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
      normalize(cloned, CORPSE_TARGET_HEIGHT);
      corpseCache.set(id, cloned);
      corpseSource.set(id, file);
      console.log(`[gib-glb] ✅ cadáver ${id} ← ${file}`);
      return cloned;
    } catch (_) {}
  }

  console.warn(`[gib-glb] ⚠️ cadáver ${id} — nenhum GLB`);
  corpseCache.set(id, null);
  return null;
}

// ════════ PRELOAD ════════
export async function preloadGibGLBs() {
  console.log('[gib-glb] 📦 Carregando membros decepados...');
  for (const type of Object.keys(LIMB_CANDIDATES)) {
    await tryLoadLimb(type);
  }
  console.log('[gib-glb] 📦 Carregando corpos pra cadáveres...');
  for (const id of Object.keys(CORPSE_CANDIDATES)) {
    await tryLoadCorpse(id);
  }
  console.table([
    ...Object.keys(LIMB_CANDIDATES).map(t => ({
      tipo: 'membro ' + t,
      carregado: hasLimb(t) ? '✅' : '❌',
      arquivo: limbSource.get(t) || '— (procedural)',
    })),
    ...Object.keys(CORPSE_CANDIDATES).map(t => ({
      tipo: 'cadáver ' + t,
      carregado: hasCorpse(t) ? '✅' : '❌',
      arquivo: corpseSource.get(t) || '—',
    })),
  ]);
}

// ════════ API PÚBLICA ════════
export function hasLimb(type) {
  return limbCache.has(type) && limbCache.get(type) !== null;
}

export function createLimb(type) {
  const base = limbCache.get(type);
  if (!base) return null;
  const clone = base.clone(true);
  clone.userData.size = base.userData._size.clone();
  clone.userData.gibType = type;
  clone.userData.source = 'glb';
  return clone;
}

export function hasCorpse(id) {
  return corpseCache.has(id) && corpseCache.get(id) !== null;
}

export function createCorpse(id) {
  const base = corpseCache.get(id);
  if (!base) return null;
  const clone = base.clone(true);
  clone.userData.corpseType = id;
  return clone;
}

export function listCorpseTypes() {
  return Object.keys(CORPSE_CANDIDATES).filter(id => hasCorpse(id));
}
