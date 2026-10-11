// ============================================================
// glb-loader.js
// Carrega modelos GLB/GLTF pra armas. Cacheia, normaliza escala,
// centraliza no pivô. Fallback automático se modelo não existir.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const gltfLoader = new GLTFLoader();

// Suporte a DRACO (modelos comprimidos do Sketchfab)
try {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  gltfLoader.setDRACOLoader(draco);
} catch (_) {}

// Cache de promessas
const cache = new Map();
// Cache de cenas prontas (já clonadas e normalizadas)
const readyCache = new Map();

// ------------------------------------------------------------
// Paths esperados — edite se seus arquivos tiverem outros nomes
// ------------------------------------------------------------
export const GLB_PATHS = {
  knife:       'assets/models/knife.glb',
  woodenClub:  'assets/models/club.glb',
  pipe:        'assets/models/pipe.glb',
  pipeWrench:  'assets/models/pipe_wrench.glb',
  cleaver:     'assets/models/cleaver.glb',
  katana:      'assets/models/katana.glb',
  kukri:       'assets/models/kukri.glb',
  shovel:      'assets/models/shovel.glb',
  reaperScythe:'assets/models/scythe.glb',

  pistol:      'assets/models/pistol.glb',
  revolver:    'assets/models/revolver.glb',
  smg:         'assets/models/smg.glb',       // AKS-74U
  rifle:       'assets/models/rifle.glb',     // AKM
  shotgun:     'assets/models/shotgun.glb',
  launcher:    'assets/models/launcher.glb',
};

// ------------------------------------------------------------
// Normalização: centraliza, escala e gira
// ------------------------------------------------------------
function normalizeModel(model, opts = {}) {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Centraliza
  model.position.sub(center);

  // Rotação pra orientar corretamente (ZB2 normalmente vem apontando pro -Z)
  model.rotation.y = opts.rotationY ?? 0;
  model.rotation.x = opts.rotationX ?? 0;
  model.rotation.z = opts.rotationZ ?? 0;

  // Escala pra tamanho alvo
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = opts.targetSize ?? 1.0;
  const scale = targetSize / maxDim;
  model.scale.multiplyScalar(scale);

  // Sombras + material cleanup
  model.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;

      // Se não tem textura, adiciona uma corzinha
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

  return model;
}

// ------------------------------------------------------------
// Carrega um GLB (promessa)
// ------------------------------------------------------------
export function loadGLB(url) {
  if (cache.has(url)) return cache.get(url);

  const promise = gltfLoader.loadAsync(url).then(gltf => {
    return gltf.scene;
  }).catch(err => {
    console.warn('[glb-loader] falhou:', url);
    throw err;
  });

  cache.set(url, promise);
  return promise;
}

// ------------------------------------------------------------
// Cria uma cópia pronta pra usar (clone + normalizado)
// ------------------------------------------------------------
export async function getWeaponModel(weaponId, opts = {}) {
  const path = GLB_PATHS[weaponId];
  if (!path) throw new Error('Sem path pra ' + weaponId);

  const raw = await loadGLB(path);
  const cloned = raw.clone(true);

  // Clona materiais pra não compartilhar entre instâncias
  cloned.traverse(c => {
    if (c.isMesh && c.material) {
      if (Array.isArray(c.material)) {
        c.material = c.material.map(m => m.clone());
      } else {
        c.material = c.material.clone();
      }
    }
  });

  return normalizeModel(cloned, opts);
}

// ------------------------------------------------------------
// Preload em lote (retorna mapa id → true/false)
// ------------------------------------------------------------
export async function preloadAllGLBs(onProgress) {
  const ids = Object.keys(GLB_PATHS);
  const results = {};
  let loaded = 0;

  for (const id of ids) {
    try {
      await getWeaponModel(id);
      results[id] = true;
    } catch (_) {
      results[id] = false;
    }
    loaded++;
    if (onProgress) onProgress(loaded, ids.length, id, results[id]);
  }
  return results;
}

export function getLoadedCount() {
  let ok = 0;
  for (const url of cache.keys()) ok++;
  return { loaded: ok, total: Object.keys(GLB_PATHS).length };
}
