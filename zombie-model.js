// ============================================================
// zombie-model.js — v5
// Tenta XBot.fbx primeiro (o GLB do Aspose/online perdeu os bones).
// Rejeita modelos com 0 bones. Diagnóstico completo no console.
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const BASE = 'assets/zombie-anim/';

// 🎯 Ordem invertida: FBX primeiro (mais confiável para skeletons)
const MODEL_CANDIDATES = ['XBot.fbx', 'XBot.glb'];

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

// ──────────────────────────────────────────────
// Normaliza nome de bone: aceita todas as variações do Mixamo
//   "mixamorig:Hips"        → "Hips"
//   "mixamorigHips"         → "Hips"
//   "Armature|mixamorigHips"→ "Hips"
//   "mixamorigHips.001"     → "Hips"
// ──────────────────────────────────────────────
export function canonicalBoneName(name) {
  if (!name) return name;
  let n = String(name);

  // Remove tudo antes do último "|"
  const pipe = n.lastIndexOf('|');
  if (pipe >= 0) n = n.substring(pipe + 1);

  // Remove tudo antes do ":"
  const colon = n.indexOf(':');
  if (colon >= 0) n = n.substring(colon + 1);

  // Remove prefixo "mixamorig" ou "mixamorig:"
  n = n.replace(/^mixamorig[:_]?/i, '');

  // Remove sufixo ".001", ".002", etc.
  const dot = n.indexOf('.');
  if (dot >= 0) n = n.substring(0, dot);

  return n;
}

function findBone(bonesMap, candidates) {
  for (const c of candidates) if (bonesMap[c]) return bonesMap[c];
  // Segunda tentativa: case-insensitive
  const lower = {};
  for (const k in bonesMap) lower[k.toLowerCase()] = bonesMap[k];
  for (const c of candidates) {
    const hit = lower[c.toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

// ──────────────────────────────────────────────
// Carrega um arquivo individual (FBX ou GLB)
// ──────────────────────────────────────────────
async function loadAnyModel(filename) {
  const url = BASE + encodeURIComponent(filename).replace(/%2F/g, '/');
  console.log(`[zombie-model] 🌐 Baixando ${url}`);
  if (/\.(glb|gltf)$/i.test(filename)) {
    const gltf = await gltfLoader.loadAsync(url);
    return { scene: gltf.scene, animations: gltf.animations || [] };
  }
  const fbx = await fbxLoader.loadAsync(url);
  return { scene: fbx.scene, animations: fbx.animations || [] };
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
      const candidate = result.scene;

      // 🔍 Conta bones ANTES de aceitar o modelo
      let boneCount = 0;
      candidate.traverse(o => { if (o.isBone) boneCount++; });

      if (boneCount === 0) {
        console.warn(`[zombie-model] ❌ ${filename} carregou mas tem 0 bones (skeleton perdido na conversão) — pulando`);
        lastError = new Error(`${filename} sem skeleton`);
        continue;
      }

      baseScene = candidate;

      // Renomeia bones para forma canônica
      const renamed = [];
      const allBoneNames = [];
      baseScene.traverse(o => {
        if (!o.isBone) return;
        allBoneNames.push(o.name);
        const canon = canonicalBoneName(o.name);
        if (canon && canon !== o.name) {
          o.name = canon;
          renamed.push(canon);
        }
      });

      console.log(`[zombie-model] 🦴 ${boneCount} bones encontrados`);
      if (renamed.length) {
        console.log(`[zombie-model] 🏷️ ${renamed.length} bones renomeados`);
        console.log(`[zombie-model] 📋 Amostra de nomes canônicos:`, renamed.slice(0, 8));
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

      // Verifica quais bones essenciais foram mapeados
      const bonesMap = {};
      baseScene.traverse(o => { if (o.isBone) bonesMap[o.name] = o; });

      const missing = [];
      const found = [];
      for (const [ourName, candidates] of Object.entries(BONE_CANDIDATES)) {
        const hit = findBone(bonesMap, candidates);
        if (hit) found.push(`${ourName}→${hit.name}`);
        else missing.push(ourName);
      }

      console.log(`[zombie-model] ✅ Bones essenciais: ${found.length}/${Object.keys(BONE_CANDIDATES).length}`);
      if (missing.length) {
        console.warn(`[zombie-model] ⚠️ FALTANDO: ${missing.join(', ')}`);
        console.warn(`[zombie-model] 📋 Todos os bones disponíveis:`, Object.keys(bonesMap));
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

  console.error('[zombie-model] ❌❌ NENHUM MODELO VÁLIDO. Último erro:', lastError);
  console.error('[zombie-model] 👉 Certifique-se de que XBot.fbx está em assets/zombie-anim/ e tem skeleton.');
  loaded = false;
  return null;
}

export function isModelReady() { return loaded; }

// ══════════════════════════════════════════════
// INSTÂNCIA (clone rigado)
// ══════════════════════════════════════════════
export function createZombieInstance() {
  if (!baseScene) return null;

  const clone = skeletonClone(baseScene);

  const bonesMap = {};
  clone.traverse(o => { if (o.isBone) bonesMap[o.name] = o; });

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

// ══════════════════════════════════════════════
// TINT (aplica cor zumbi na pele)
// ══════════════════════════════════════════════
export function tintZombie(instance, skinColor) {
  const scene = instance.scene;
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.color) {
        m.color.setHex(skinColor);
        // Dessatura levemente pra parecer cadavérico
        const c = m.color;
        const gray = (c.r + c.g + c.b) / 3;
        c.r = c.r * 0.75 + gray * 0.25;
        c.g = c.g * 0.75 + gray * 0.25;
        c.b = c.b * 0.75 + gray * 0.25;
      }
    }
  });
}
