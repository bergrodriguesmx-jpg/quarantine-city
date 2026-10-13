// ============================================================
// zombie-model.js — v2 (suporta GLB + FBX)
// Tenta XBot.glb primeiro, cai pra XBot.fbx se não existir.
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const BASE = 'assets/zombie-anim/';

// Ordem de tentativa — GLB primeiro
const MODEL_CANDIDATES = ['XBot.glb', 'XBot.fbx'];

let baseScene = null;
let loaded = false;

const BONE_CANDIDATES = {
  head:       ['Head'],
  neck:       ['Neck'],
  spineUpper: ['Spine1', 'Spine2'],
  spineLower: ['Spine'],
  pelvis:     ['Hips'],
  shoulderL:  ['LeftArm'],
  elbowL:     ['LeftForeArm'],
  handL:      ['LeftHand'],
  shoulderR:  ['RightArm'],
  elbowR:     ['RightForeArm'],
  handR:      ['RightHand'],
  thighL:     ['LeftUpLeg'],
  kneeL:      ['LeftLeg'],
  footL:      ['LeftFoot'],
  thighR:     ['RightUpLeg'],
  kneeR:      ['RightLeg'],
  footR:      ['RightFoot'],
};

function normalizeName(name) {
  if (!name) return null;
  let n = String(name).trim();
  const pipe = n.lastIndexOf('|');
  if (pipe >= 0) n = n.substring(pipe + 1);
  const colon = n.indexOf(':');
  if (colon >= 0) n = n.substring(colon + 1);
  const dot = n.indexOf('.');
  if (dot >= 0) n = n.substring(0, dot);
  if (n.startsWith('mixamorig')) n = n.substring('mixamorig'.length);
  if (n.startsWith('_')) n = n.substring(1);
  return n;
}

function findBone(bonesMap, candidates) {
  for (const c of candidates) if (bonesMap[c]) return bonesMap[c];
  const lower = {};
  for (const k in bonesMap) lower[k.toLowerCase()] = bonesMap[k];
  for (const c of candidates) {
    const hit = lower[c.toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

// ── Carrega um arquivo individual (GLB ou FBX) ────────────────
async function loadAnyModel(filename) {
  const url = BASE + encodeURIComponent(filename).replace(/%2F/g, '/');
  if (filename.toLowerCase().endsWith('.glb') || filename.toLowerCase().endsWith('.gltf')) {
    const gltf = await gltfLoader.loadAsync(url);
    return { scene: gltf.scene, animations: gltf.animations || [] };
  } else if (filename.toLowerCase().endsWith('.fbx')) {
    const fbx = await fbxLoader.loadAsync(url);
    return { scene: fbx.scene, animations: fbx.animations || [] };
  }
  throw new Error('Formato desconhecido: ' + filename);
}

// ══════════════════════════════════════════════
// PRELOAD
// ══════════════════════════════════════════════
export async function preloadZombieModel() {
  if (loaded) return baseScene;

  let lastError = null;
  for (const filename of MODEL_CANDIDATES) {
    try {
      console.log(`[zombie-model] 🔄 Tentando ${filename}...`);
      const result = await loadAnyModel(filename);
      baseScene = result.scene;

      baseScene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
              m.needsUpdate = true;
            }
          }
        }
      });

      // Diagnóstico
      const rawNames = [];
      const bonesMap = {};
      baseScene.traverse(o => {
        if (!o.isBone) return;
        rawNames.push(o.name);
        const n = normalizeName(o.name);
        if (n) bonesMap[n] = o;
      });

      console.log(`[zombie-model] ✅ ${filename} carregado (${rawNames.length} bones)`);

      const missing = [];
      for (const [ourName, candidates] of Object.entries(BONE_CANDIDATES)) {
        const found = findBone(bonesMap, candidates);
        if (!found) missing.push(ourName);
      }
      if (missing.length) {
        console.warn(`[zombie-model] ⚠️ Bones não mapeados: ${missing.join(', ')}`);
        console.warn('[zombie-model] Nomes disponíveis:', Object.keys(bonesMap).slice(0, 40).join(', '));
      } else {
        console.log('[zombie-model] ✅ Todos os 17 bones mapeados');
      }

      loaded = true;
      return baseScene;
    } catch (err) {
      lastError = err;
      console.warn(`[zombie-model] ❌ ${filename}: ${err.message || err}`);
    }
  }

  console.error('[zombie-model] ❌❌ NENHUM MODELO CARREGOU. Último erro:', lastError);
  console.error('[zombie-model] Certifique-se de que XBot.glb (ou XBot.fbx) está em assets/zombie-anim/');
  loaded = false;
  return null;
}

export function isModelReady() { return loaded; }

// ══════════════════════════════════════════════
// INSTÂNCIA
// ══════════════════════════════════════════════
export function createZombieInstance() {
  if (!baseScene) return null;

  const clone = skeletonClone(baseScene);

  const bonesMap = {};
  clone.traverse(o => {
    if (!o.isBone) return;
    const norm = normalizeName(o.name);
    if (norm) bonesMap[norm] = o;
  });

  const joints = {};
  for (const [ourName, candidates] of Object.entries(BONE_CANDIDATES)) {
    joints[ourName] = findBone(bonesMap, candidates) || null;
  }

  // Escala pra 1.8m
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const height = box.max.y - box.min.y;
  const scale = height > 0.1 ? 1.8 / height : 1;
  clone.scale.setScalar(scale);

  // Pés no chão
  clone.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(clone);
  clone.position.y = -box2.min.y;

  return { scene: clone, bones: bonesMap, joints, scale };
}

export function tintZombie(instance, skinColor) {
  const scene = instance.scene;
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.color) {
        m.color.setHex(skinColor);
        const c = m.color;
        const gray = (c.r + c.g + c.b) / 3;
        c.r = c.r * 0.75 + gray * 0.25;
        c.g = c.g * 0.75 + gray * 0.25;
        c.b = c.b * 0.75 + gray * 0.25;
      }
    }
  });
}
