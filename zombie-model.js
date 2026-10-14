// ============================================================
// zombie-model.js — v8
// ⚠️ CÓDIGO MORTO no estado atual: game.js v10 não importa este arquivo.
//    Ele usa zombie-procedural.js (100% procedural).
//    Mantido como referência caso volte a usar FBX/GLB riggado.
//
// CHANGELOG v8:
//   • tintZombie() agora clona materiais por instância
//     (antes mutava materiais compartilhados entre clones)
//   • Documentado que canonicalBoneName quebra encaixe de AnimationClips
//     do Mixamo (o retargeting renomeia bones mas não tracks)
// ============================================================

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const BASE = 'assets/zombie-anim/';

// 🎯 XBot.fbx é o modelo dedicado. Se não tiver mesh,
//    cai pros arquivos de animação (que contêm mesh + skeleton do Mixamo).
//    zombie-idle.fbx foi removido: está corrompido (Unknown property type).
const MODEL_CANDIDATES = [
  'XBot.fbx',
  'zombie-walk.fbx',
  'zombie-attack.fbx',
  'zombie-idle.glb',
];

let baseScene = null;
let loaded = false;
let sourceName = null;

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

// ⚠️ AVISO: canonicalBoneName renomeia os bones. Se você aplicar
// AnimationClips depois, os track.name ainda apontarão para os nomes
// Mixamo originais (ex: 'mixamorig:Hips.position') e as animações
// NÃO tocarão. Se for reativar animações, remova a renomeação abaixo
// ou aplique canonicalBoneName também em cada track.name das clipes.
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
  console.log(`[zombie-model] 🌐 Baixando ${url}`);

  if (/\.(glb|gltf)$/i.test(filename)) {
    const gltf = await gltfLoader.loadAsync(url);
    return { scene: gltf.scene, animations: gltf.animations || [] };
  }

  const fbx = await fbxLoader.loadAsync(url);
  // FBXLoader retorna o Group diretamente. Animations fica em fbx.animations.
  return { scene: fbx, animations: fbx.animations || [] };
}

function countSkeleton(root) {
  let boneCount = 0;
  let skinnedMeshCount = 0;
  root.traverse(o => {
    if (o.isBone) boneCount++;
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.bones) {
      skinnedMeshCount++;
      for (const b of o.skeleton.bones) {
        if (!b.isBone) boneCount++;
      }
    }
  });
  return { boneCount, skinnedMeshCount };
}

export async function preloadZombieModel() {
  if (loaded) return baseScene;

  let lastError = null;

  for (const filename of MODEL_CANDIDATES) {
    try {
      console.log(`[zombie-model] 🔄 Tentando ${filename}...`);
      const result = await loadAnyModel(filename);

      if (!result || !result.scene) {
        console.warn(`[zombie-model] ❌ ${filename}: loader retornou sem scene`);
        lastError = new Error(`${filename} sem scene`);
        continue;
      }

      const candidate = result.scene;
      const { boneCount, skinnedMeshCount } = countSkeleton(candidate);

      console.log(`[zombie-model] 🔍 ${filename}: ${boneCount} bones, ${skinnedMeshCount} skinned meshes`);

      if (boneCount === 0) {
        console.warn(`[zombie-model] ❌ ${filename}: 0 bones — pulando`);
        lastError = new Error(`${filename} sem skeleton`);
        continue;
      }

      baseScene = candidate;

      const renamed = [];
      baseScene.traverse(o => {
        if (!o.isBone) return;
        const canon = canonicalBoneName(o.name);
        if (canon && canon !== o.name) { o.name = canon; renamed.push(canon); }
      });

      if (renamed.length) {
        console.log(`[zombie-model] 🏷️ ${renamed.length} bones renomeados`);
      }

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

      const bonesMap = {};
      baseScene.traverse(o => { if (o.isBone) bonesMap[o.name] = o; });
      const missing = [];
      for (const [ourName, candidates] of Object.entries(BONE_CANDIDATES)) {
        if (!findBone(bonesMap, candidates)) missing.push(ourName);
      }
      if (missing.length) {
        console.warn(`[zombie-model] ⚠️ Bones não mapeados: ${missing.join(', ')}`);
      } else {
        console.log('[zombie-model] ✅ Todos os 17 bones mapeados');
      }

      sourceName = filename;
      loaded = true;
      console.log(`[zombie-model] ✅ Modelo carregado: ${filename}`);
      return baseScene;
    } catch (err) {
      lastError = err;
      console.warn(`[zombie-model] ❌ ${filename}: ${err.message || err}`);
    }
  }

  console.error('[zombie-model] ❌❌ NENHUM MODELO VÁLIDO. Último erro:', lastError);
  loaded = false;
  return null;
}

export function isModelReady() { return loaded; }

export function createZombieInstance() {
  if (!baseScene) return null;

  const clone = skeletonClone(baseScene);

  const bonesMap = {};
  clone.traverse(o => { if (o.isBone) bonesMap[o.name] = o; });

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

// 🎯 FIX: clona materiais por instância antes de tingir.
//    skeletonClone compartilha materiais entre clones por padrão,
//    então tingir um zumbi tingia todos.
export function tintZombie(instance, skinColor) {
  const scene = instance.scene;
  scene.traverse(o => {
    if (!o.isMesh || !o.material) return;

    const isArr = Array.isArray(o.material);
    const mats = isArr ? o.material : [o.material];
    const cloned = mats.map(m => m.clone());
    o.material = isArr ? cloned : cloned[0];

    const finalMats = isArr ? cloned : [cloned[0]];
    for (const m of finalMats) {
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

export function getZombieModelSource() { return sourceName; }
