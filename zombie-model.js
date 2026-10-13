// ============================================================
// zombie-model.js — v3 (nomes de bones normalizados)
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const BASE = 'assets/zombie-anim/';

const MODEL_CANDIDATES = ['XBot.glb', 'XBot.fbx'];

let baseScene = null;
let loaded = false;

// Mapa canônico → usado pra achar bone
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

// Normaliza nome de bone: "mixamorig:Hips" / "mixamorigHips" → "Hips"
export function canonicalBoneName(name) {
  if (!name) return name;
  let n = String(name);
  const pipe = n.lastIndexOf('|');
  if (pipe >= 0) n = n.substring(pipe + 1);
  const colon = n.indexOf(':');
  if (colon >= 0) n = n.substring(colon + 1);
  n = n.replace(/^mixamorig[:_]?/i, '');
  const dot = n.indexOf('.');
  if (dot >= 0) n = n.substring(0, dot);
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

async function loadAnyModel(filename) {
  const url = BASE + encodeURIComponent(filename).replace(/%2F/g, '/');
  if (/\.(glb|gltf)$/i.test(filename)) {
    const gltf = await gltfLoader.loadAsync(url);
    return { scene: gltf.scene, animations: gltf.animations || [] };
  }
  const fbx = await fbxLoader.loadAsync(url);
  return { scene: fbx.scene, animations: fbx.animations || [] };
}

export async function preloadZombieModel() {
  if (loaded) return baseScene;

  let lastError = null;
  for (const filename of MODEL_CANDIDATES) {
    try {
      console.log(`[zombie-model] 🔄 Tentando ${filename}...`);
      const result = await loadAnyModel(filename);
      baseScene = result.scene;

      // ── Renomeia TODOS os bones para a forma canônica ──
      const renamed = [];
      baseScene.traverse(o => {
        if (!o.isBone) return;
        const canon = canonicalBoneName(o.name);
        if (canon && canon !== o.name) {
          renamed.push(`${o.name} → ${canon}`);
          o.name = canon;
        }
      });
      if (renamed.length) {
        console.log(`[zombie-model] 🏷️ ${renamed.length} bones renomeados (ex: ${renamed.slice(0,3).join(', ')})`);
      }

      // Sombras + materiais
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
      const bonesMap = {};
      let totalBones = 0;
      baseScene.traverse(o => {
        if (!o.isBone) return;
        totalBones++;
        bonesMap[o.name] = o;
      });
      console.log(`[zombie-model] ✅ ${filename} carregado (${totalBones} bones)`);

      const missing = [];
      for (const [ourName, candidates] of Object.entries(BONE_CANDIDATES)) {
        if (!findBone(bonesMap, candidates)) missing.push(ourName);
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
  loaded = false;
  return null;
}

export function isModelReady() { return loaded; }

export function createZombieInstance() {
  if (!baseScene) return null;

  const clone = skeletonClone(baseScene);

  const bonesMap = {};
  clone.traverse(o => {
    if (o.isBone) bonesMap[o.name] = o;
  });

  const joints = {};
  for (const [ourName, candidates] of Object.entries(BONE_CANDIDATES)) {
    joints[ourName] = findBone(bonesMap, candidates) || null;
  }

  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const height = box.max.y - box.min.y;
  const scale = height > 0.1 ? 1.8 / height : 1;
  clone.scale.setScalar(scale);

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
