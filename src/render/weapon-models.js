// ============================================================
// weapon-models.js — v3
// Modelos 3D de armas com fallback duplo:
//   1. Tenta carregar GLB (assets/models/*.glb)
//   2. Se não existir, usa procedural (PBR melhorado)
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ============================================================
// GLB LOADER
// ============================================================
const gltfLoader = new GLTFLoader();
try {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  gltfLoader.setDRACOLoader(draco);
} catch (_) { /* DRACO opcional */ }

export const GLB_PATHS = {
  knife:        'assets/models/knife.glb',
  woodenClub:   'assets/models/club.glb',
  pipe:         'assets/models/pipe.glb',
  pipeWrench:   'assets/models/pipe_wrench.glb',
  cleaver:      'assets/models/cleaver.glb',
  katana:       'assets/models/katana.glb',
  kukri:        'assets/models/kukri.glb',
  shovel:       'assets/models/shovel.glb',
  reaperScythe: 'assets/models/scythe.glb',
  pistol:       'assets/models/pistol.glb',
  revolver:     'assets/models/revolver.glb',
  smg:          'assets/models/smg.glb',
  rifle:        'assets/models/rifle.glb',
  shotgun:      'assets/models/shotgun.glb',
  launcher:     'assets/models/launcher.glb',
};

// Cache de promises de carregamento
const glbPromises = new Map();
// Cache de modelos já normalizados (prontos pra clonar)
const glbReady = new Map();

function loadGLBRaw(url) {
  if (glbPromises.has(url)) return glbPromises.get(url);
  const p = gltfLoader.loadAsync(url)
    .then(gltf => gltf.scene)
    .catch(err => {
      console.warn('[glb-loader] falhou:', url, err.message || err);
      throw err;
    });
  glbPromises.set(url, p);
  return p;
}

function normalizeModel(model, opts = {}) {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Centraliza o modelo no pivô
  model.position.sub(center);

  // Orientação (ZB2 typically aponta pra -Z)
  model.rotation.y = opts.rotationY ?? 0;
  model.rotation.x = opts.rotationX ?? 0;
  model.rotation.z = opts.rotationZ ?? 0;

  // Escala pro tamanho alvo
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = opts.targetSize ?? 1.6;
  const scale = targetSize / maxDim;
  model.scale.multiplyScalar(scale);

  // Sombras + color space
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

  return model;
}

/**
 * Carrega e normaliza um GLB (com clonagem segura).
 */
export async function getWeaponGLB(weaponId, opts = {}) {
  const path = GLB_PATHS[weaponId];
  if (!path) throw new Error('Sem GLB path pra ' + weaponId);
  const raw = await loadGLBRaw(path);
  const cloned = raw.clone(true);
  // Clona materiais pra cada instância
  cloned.traverse(c => {
    if (c.isMesh && c.material) {
      if (Array.isArray(c.material)) c.material = c.material.map(m => m.clone());
      else c.material = c.material.clone();
    }
  });
  return normalizeModel(cloned, opts);
}

/**
 * Precarga um GLB. Depois disso, buildWeaponModelSmart usa ele automaticamente.
 */
export async function precacheWeaponGLB(weaponId, opts = {}) {
  try {
    const model = await getWeaponGLB(weaponId, { targetSize: 1.6, ...opts });
    glbReady.set(weaponId, model);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Precarga todos. onProgress(cur, total, id, ok).
 */
export async function precacheAllWeaponGLBs(onProgress) {
  const ids = Object.keys(GLB_PATHS);
  const results = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    results[id] = await precacheWeaponGLB(id);
    if (onProgress) onProgress(i + 1, ids.length, id, results[id]);
  }
  return results;
}

export function hasGLB(weaponId) {
  return glbReady.has(weaponId);
}

// ============================================================
// MATERIAIS PROCEDURAIS (fallback)
// ============================================================
const MAT = {
  gunMetal:      new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.9,  roughness: 0.38 }),
  gunMetalLight: new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.85, roughness: 0.42 }),
  gunMetalWorn:  new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.75, roughness: 0.55 }),
  steel:         new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1.0,  roughness: 0.22 }),
  steelDark:     new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 1.0,  roughness: 0.45 }),
  chrome:        new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1.0,  roughness: 0.08 }),
  wood:          new THREE.MeshStandardMaterial({ color: 0x6b4423, metalness: 0.05, roughness: 0.72 }),
  woodDark:      new THREE.MeshStandardMaterial({ color: 0x4a2f18, metalness: 0.05, roughness: 0.82 }),
  woodVarnish:   new THREE.MeshStandardMaterial({ color: 0x8b5a2b, metalness: 0.1,  roughness: 0.5 }),
  gripPoly:      new THREE.MeshStandardMaterial({ color: 0x141618, metalness: 0.15, roughness: 0.92 }),
  brass:         new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1.0,  roughness: 0.3 }),
  black:         new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.3,  roughness: 0.85 }),
  accent:        new THREE.MeshStandardMaterial({ color: 0xcc0000, metalness: 0.3,  roughness: 0.55 }),
  skin:          new THREE.MeshStandardMaterial({ color: 0xd4a574, metalness: 0.0,  roughness: 0.78 }),
  rust:          new THREE.MeshStandardMaterial({ color: 0x6b3a1f, metalness: 0.4,  roughness: 0.85 }),
  blood:         new THREE.MeshStandardMaterial({ color: 0x6b0000, metalness: 0.0,  roughness: 0.55 }),
  fabric:        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.0,  roughness: 0.95 }),
};

function rb(w, h, d, r = 0.02) {
  return new THREE.BoxGeometry(w, h, d);
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function screw(radius, height, mat) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), mat);
  head.castShadow = true;
  g.add(head);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(radius*1.8, height*1.05, radius*0.2), MAT.black);
  g.add(slot);
  return g;
}

function frontSight(mat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.03), mat);
  g.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.006), mat);
  post.position.y = 0.015; g.add(post);
  return g;
}

function rearSight(mat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), mat);
  g.add(base);
  const nl = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  nl.position.set(-0.014, 0.012, 0); g.add(nl);
  const nr = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  nr.position.set(0.014, 0.012, 0); g.add(nr);
  return g;
}

function trigger(mat) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.02, 3, 6), mat);
  t.rotation.x = 0.25; g.add(t);
  return g;
}

function triggerGuard(mat) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI * 1.2), mat);
  t.rotation.z = -Math.PI * 0.1;
  t.rotation.x = Math.PI / 2;
  g.add(t);
  return g;
}

function curvedMag(width, height, curve, mat) {
  const g = new THREE.Group();
  const segments = 8;
  const segH = height / segments;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const seg = new THREE.Mesh(rb(width, segH * 1.05, width * 0.7, 0.008), mat);
    seg.position.y = -i * segH - segH * 0.5;
    seg.position.z = -t * curve * height * 0.5;
    seg.rotation.x = t * curve;
    g.add(seg);
  }
  return g;
}

function handGrip(height, width, mat) {
  const g = new THREE.Group();
  const s = 6;
  for (let i = 0; i < s; i++) {
    const t = i / (s - 1);
    const w = width * (1 - t * 0.15);
    const segH = height / s;
    const seg = new THREE.Mesh(rb(w, segH * 1.05, w * 0.75, 0.01), mat);
    seg.position.y = -i * segH - segH * 0.5;
    seg.rotation.x = 0.05;
    g.add(seg);
  }
  return g;
}

// ============================================================
// BUILDERS PROCEDURAIS
// ============================================================

function buildKnife(g) {
  const handle = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(rb(0.032, 0.05, 0.028, 0.008), MAT.gripPoly);
    seg.position.y = 0.06 - i * 0.05; seg.rotation.x = 0.05;
    handle.add(seg);
  }
  const guard = mesh(rb(0.055, 0.014, 0.03, 0.004), MAT.steelDark, 0, 0.14, 0);
  handle.add(guard);
  const blade = mesh(rb(0.024, 0.36, 0.006, 0.001), MAT.steel, 0, 0.32, 0);
  handle.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 4), MAT.steel);
  tip.rotation.y = Math.PI/4;
  tip.position.set(0, 0.54, 0);
  handle.add(tip);
  const fuller = mesh(rb(0.006, 0.22, 0.004, 0.001), MAT.steelDark, 0, 0.28, 0.003);
  handle.add(fuller);
  g.add(handle);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.01, 0.02); g.add(hand);
}

function buildClub(g) {
  const shaft = mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 10), MAT.woodDark, 0, 0, -0.15);
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const headGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.05, 0.02),
    new THREE.Vector2(0.06, 0.08), new THREE.Vector2(0.055, 0.13),
    new THREE.Vector2(0.04, 0.15), new THREE.Vector2(0, 0.16),
  ], 12);
  const head = new THREE.Mesh(headGeo, MAT.wood);
  head.rotation.x = -Math.PI / 2; head.position.set(0, 0, -0.62);
  g.add(head);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const nail = mesh(new THREE.SphereGeometry(0.008, 6, 4), MAT.steelDark,
      Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.55);
    g.add(nail);
  }
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.08); g.add(hand);
}

function buildPipe(g) {
  const pipe = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 12), MAT.gunMetalWorn, 0, 0, -0.2);
  pipe.rotation.x = Math.PI / 2; g.add(pipe);
  for (let i = 0; i < 6; i++) {
    const thread = mesh(new THREE.TorusGeometry(0.019, 0.002, 4, 12), MAT.steelDark, 0, 0, -0.4 - i * 0.015);
    thread.rotation.y = Math.PI / 2; g.add(thread);
  }
  const joint = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 12), MAT.steelDark, 0, 0, -0.35);
  joint.rotation.x = Math.PI / 2; g.add(joint);
  const rustTip = mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.06, 12), MAT.rust, 0, 0, -0.56);
  rustTip.rotation.x = Math.PI / 2; g.add(rustTip);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.06); g.add(hand);
}

function buildPipeWrench(g) {
  const handle = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 10), MAT.gunMetalWorn, 0, 0, -0.15);
  handle.rotation.x = Math.PI / 2; g.add(handle);
  const adj = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0, -0.35);
  adj.rotation.x = Math.PI / 2; g.add(adj);
  const jf = mesh(rb(0.025, 0.06, 0.08, 0.006), MAT.steelDark, 0, 0.005, -0.62); g.add(jf);
  const jm = mesh(rb(0.025, 0.045, 0.06, 0.006), MAT.steelDark, 0, -0.04, -0.6); g.add(jm);
  const sc = screw(0.008, 0.006, MAT.brass);
  sc.rotation.z = Math.PI / 2; sc.position.set(0.016, 0, -0.48); g.add(sc);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.08); g.add(hand);
}

function buildCleaver(g) {
  const grip = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.14, 10), MAT.woodDark, 0, 0, 0.08);
  grip.rotation.x = Math.PI / 2; g.add(grip);
  for (let i = 0; i < 2; i++) {
    const rivet = mesh(new THREE.SphereGeometry(0.005, 6, 4), MAT.brass, 0, 0, 0.04 + i * 0.06);
    rivet.scale.set(2, 0.5, 1); g.add(rivet);
  }
  const blade = mesh(rb(0.005, 0.16, 0.28, 0.002), MAT.steel, 0, 0.02, -0.2); g.add(blade);
  const edge = mesh(rb(0.002, 0.16, 0.28, 0.001), MAT.chrome, 0.0025, 0.02, -0.2); g.add(edge);
  const blood = mesh(rb(0.006, 0.014, 0.15, 0.002), MAT.steelDark, 0, 0.055, -0.16); g.add(blood);
  const hole = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 10), MAT.black, 0, 0.02, -0.32);
  hole.rotation.z = Math.PI / 2; g.add(hole);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.08); g.add(hand);
}

function buildKatana(g) {
  const tsuka = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 8), MAT.gripPoly, 0, 0, 0.12);
  tsuka.rotation.x = Math.PI / 2; g.add(tsuka);
  for (let i = 0; i < 6; i++) {
    const wrap = mesh(rb(0.032, 0.018, 0.018, 0.003), MAT.accent, 0, 0, 0.03 + i * 0.035);
    wrap.rotation.z = Math.PI / 4; g.add(wrap);
  }
  const kashira = mesh(new THREE.CylinderGeometry(0.017, 0.014, 0.02, 8), MAT.steelDark, 0, 0, 0.24);
  kashira.rotation.x = Math.PI / 2; g.add(kashira);
  const tsuba = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8), MAT.gunMetal, 0, 0, 0.005);
  tsuba.rotation.x = Math.PI / 2; g.add(tsuba);
  const habaki = mesh(rb(0.018, 0.014, 0.025, 0.003), MAT.brass, 0, 0, -0.015); g.add(habaki);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.009, 0);
  bladeShape.lineTo(-0.009, 0.7);
  bladeShape.quadraticCurveTo(-0.008, 0.75, 0.002, 0.78);
  bladeShape.quadraticCurveTo(0.008, 0.76, 0.009, 0.7);
  bladeShape.lineTo(0.009, 0);
  bladeShape.lineTo(-0.009, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.005, bevelEnabled: true,
    bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2,
  });
  const blade = new THREE.Mesh(bladeGeo, MAT.steel);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0, 0, -0.03);
  g.add(blade);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.12); g.add(hand);
}

function buildKukri(g) {
  const grip = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 10), MAT.gripPoly, 0, 0, 0.075);
  grip.rotation.x = Math.PI / 2; g.add(grip);
  const pommel = mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.015, 10), MAT.steelDark, 0, 0, 0.145);
  pommel.rotation.x = Math.PI / 2; g.add(pommel);
  const guard = mesh(rb(0.055, 0.014, 0.018, 0.003), MAT.brass, 0, 0, 0.005); g.add(guard);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.bezierCurveTo(0.05, 0.02, 0.14, 0.03, 0.22, 0.07);
  bladeShape.lineTo(0.23, 0.04);
  bladeShape.bezierCurveTo(0.16, -0.02, 0.08, -0.05, 0, -0.02);
  bladeShape.lineTo(0, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.006, bevelEnabled: true,
    bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2,
  });
  const blade = new THREE.Mesh(bladeGeo, MAT.steel);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0, 0, -0.01);
  g.add(blade);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.075); g.add(hand);
}

function buildShovel(g) {
  const handle = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.85, 10), MAT.wood, 0, 0, -0.15);
  handle.rotation.x = Math.PI / 2; g.add(handle);
  const grip = mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 12, Math.PI), MAT.woodDark, 0, 0.015, 0.28);
  grip.rotation.x = Math.PI / 2; grip.rotation.z = Math.PI / 2; g.add(grip);
  const ferrule = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0, -0.58);
  ferrule.rotation.x = Math.PI / 2; g.add(ferrule);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.055, 0);
  bladeShape.lineTo(-0.065, 0.12);
  bladeShape.lineTo(-0.045, 0.18);
  bladeShape.lineTo(0.045, 0.18);
  bladeShape.lineTo(0.065, 0.12);
  bladeShape.lineTo(0.055, 0);
  bladeShape.lineTo(-0.055, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.005, bevelEnabled: true,
    bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2,
  });
  const blade = new THREE.Mesh(bladeGeo, MAT.steelDark);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0, 0, -0.76);
  g.add(blade);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.2); g.add(hand);
}

function buildScythe(g) {
  const staff = mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.4, 10), MAT.black, 0, 0, -0.4);
  staff.rotation.x = Math.PI / 2; g.add(staff);
  for (let i = 0; i < 8; i++) {
    const wrap = mesh(new THREE.TorusGeometry(0.021, 0.004, 4, 10), MAT.accent, 0, 0, 0.05 - i * 0.035);
    wrap.rotation.y = Math.PI / 2; g.add(wrap);
  }
  const joint = mesh(rb(0.03, 0.028, 0.06, 0.005), MAT.gunMetal, 0, 0, -1.05); g.add(joint);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.bezierCurveTo(0.15, 0.02, 0.32, 0.1, 0.4, 0.3);
  bladeShape.bezierCurveTo(0.42, 0.35, 0.38, 0.38, 0.34, 0.36);
  bladeShape.bezierCurveTo(0.28, 0.2, 0.14, 0.06, 0, 0.04);
  bladeShape.lineTo(0, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.008, bevelEnabled: true,
    bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2,
  });
  const blade = new THREE.Mesh(bladeGeo, MAT.steelDark);
  blade.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  blade.position.set(0.02, 0.02, -1.06);
  g.add(blade);
  const orb = mesh(new THREE.SphereGeometry(0.02, 10, 8), MAT.accent, 0.3, 0.18, -1.06); g.add(orb);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.black);
  hand.position.set(0, -0.02, 0.2); g.add(hand);
}

function buildPistol(g) {
  const slide = mesh(rb(0.032, 0.032, 0.18, 0.006), MAT.gunMetal, 0, 0.02, -0.06); g.add(slide);
  for (let i = 0; i < 6; i++) {
    const serr = mesh(rb(0.033, 0.026, 0.003, 0.001), MAT.gunMetalWorn, 0, 0.02, 0.015 + i * 0.008);
    g.add(serr);
  }
  const ejp = mesh(rb(0.02, 0.02, 0.05, 0.003), MAT.black, 0.014, 0.025, -0.07); g.add(ejp);
  const frame = mesh(rb(0.03, 0.025, 0.14, 0.005), MAT.gunMetalLight, 0, -0.01, -0.05); g.add(frame);
  const barrel = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 10), MAT.black, 0, 0.02, -0.16);
  barrel.rotation.x = Math.PI / 2; g.add(barrel);
  const muzzle = mesh(new THREE.TorusGeometry(0.009, 0.002, 4, 10), MAT.black, 0, 0.02, -0.18); g.add(muzzle);
  const grip = handGrip(0.1, 0.032, MAT.gripPoly);
  grip.position.set(0, -0.02, 0.02); grip.rotation.x = 0.28; g.add(grip);
  const tg = triggerGuard(MAT.gunMetalLight); tg.position.set(0, -0.03, -0.015); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.022, -0.015); g.add(tr);
  const fs = frontSight(MAT.gunMetal); fs.position.set(0, 0.038, -0.14); g.add(fs);
  const rs = rearSight(MAT.gunMetal); rs.position.set(0, 0.038, 0.02); g.add(rs);
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.07, 0.06); hand.rotation.x = 0.2; g.add(hand);
}

function buildRevolver(g) {
  const barrel = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), MAT.steel, 0, 0.02, -0.12);
  barrel.rotation.x = Math.PI / 2; g.add(barrel);
  const under = mesh(rb(0.014, 0.014, 0.13, 0.003), MAT.steel, 0, 0.005, -0.11); g.add(under);
  const top = mesh(rb(0.02, 0.006, 0.05, 0.002), MAT.steel, 0, 0.03, -0.02); g.add(top);
  const cyl = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0.015, -0.02);
  cyl.rotation.x = Math.PI / 2; g.add(cyl);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ch = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.052, 8), MAT.black,
      Math.cos(a) * 0.012, 0.015 + Math.sin(a) * 0.012, -0.02);
    ch.rotation.x = Math.PI / 2; g.add(ch);
  }
  const frame = mesh(rb(0.022, 0.04, 0.06, 0.005), MAT.steel, 0, 0.005, 0.04); g.add(frame);
  const hammer = mesh(rb(0.01, 0.02, 0.014, 0.003), MAT.steel, 0, 0.035, 0.06);
  hammer.rotation.x = -0.2; g.add(hammer);
  const grip = handGrip(0.1, 0.032, MAT.woodVarnish);
  grip.position.set(0, -0.02, 0.075); grip.rotation.x = 0.38; g.add(grip);
  const tg = triggerGuard(MAT.steel); tg.position.set(0, -0.03, 0.045); g.add(tg);
  const tr = trigger(MAT.steelDark); tr.position.set(0, -0.022, 0.04); g.add(tr);
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.07, 0.1); hand.rotation.x = 0.3; g.add(hand);
}

function buildSMG(g) {
  const receiver = mesh(rb(0.036, 0.05, 0.22, 0.008), MAT.gunMetal, 0, 0.02, -0.05); g.add(receiver);
  for (let i = 0; i < 8; i++) {
    const rib = mesh(rb(0.034, 0.003, 0.005, 0.001), MAT.gunMetalWorn, 0, 0.046, -0.14 + i * 0.022);
    g.add(rib);
  }
  const barrel = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 10), MAT.gunMetal, 0, 0.03, -0.24);
  barrel.rotation.x = Math.PI / 2; g.add(barrel);
  const gasBlock = mesh(rb(0.02, 0.018, 0.04, 0.004), MAT.gunMetalWorn, 0, 0.045, -0.22); g.add(gasBlock);
  const muzzle = mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.025, 10), MAT.steelDark, 0, 0.03, -0.33);
  muzzle.rotation.x = Math.PI / 2; g.add(muzzle);
  const hgTop = mesh(rb(0.028, 0.018, 0.12, 0.005), MAT.woodVarnish, 0, 0.055, -0.18); g.add(hgTop);
  const hgBot = mesh(rb(0.028, 0.022, 0.12, 0.005), MAT.woodVarnish, 0, 0.01, -0.18); g.add(hgBot);
  const mag = curvedMag(0.026, 0.14, 0.4, MAT.gunMetal);
  mag.position.set(0, -0.03, -0.02); g.add(mag);
  const grip = handGrip(0.075, 0.026, MAT.gripPoly);
  grip.position.set(0, -0.03, 0.08); grip.rotation.x = 0.22; g.add(grip);
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.04, 0.04); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.032, 0.04); g.add(tr);
  const stock = mesh(rb(0.008, 0.05, 0.1, 0.003), MAT.gunMetal, 0.03, 0.02, 0.1); g.add(stock);
  const fs = frontSight(MAT.gunMetal); fs.position.set(0, 0.058, -0.28); g.add(fs);
  const rs = rearSight(MAT.gunMetal); rs.position.set(0, 0.058, -0.02); g.add(rs);
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.08, 0.1); hand.rotation.x = 0.2; g.add(hand);
}

function buildRifle(g) {
  const receiver = mesh(rb(0.038, 0.055, 0.28, 0.008), MAT.gunMetal, 0, 0.02, -0.08); g.add(receiver);
  for (let i = 0; i < 10; i++) {
    const rib = mesh(rb(0.036, 0.003, 0.005, 0.001), MAT.gunMetalWorn, 0, 0.05, -0.2 + i * 0.024);
    g.add(rib);
  }
  const barrel = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 10), MAT.gunMetal, 0, 0.032, -0.34);
  barrel.rotation.x = Math.PI / 2; g.add(barrel);
  const gasTube = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 10), MAT.gunMetalWorn, 0, 0.055, -0.28);
  gasTube.rotation.x = Math.PI / 2; g.add(gasTube);
  const gasBlock = mesh(rb(0.024, 0.022, 0.04, 0.004), MAT.gunMetal, 0, 0.042, -0.32); g.add(gasBlock);
  const fsb = mesh(rb(0.02, 0.03, 0.028, 0.004), MAT.gunMetal, 0, 0.055, -0.46); g.add(fsb);
  const muzzle = mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.03, 10), MAT.steelDark, 0, 0.032, -0.5);
  muzzle.rotation.x = Math.PI / 2; g.add(muzzle);
  const hgBot = mesh(rb(0.03, 0.024, 0.14, 0.005), MAT.woodVarnish, 0, 0.01, -0.26); g.add(hgBot);
  const hgTop = mesh(rb(0.028, 0.016, 0.14, 0.005), MAT.woodVarnish, 0, 0.058, -0.26); g.add(hgTop);
  const mag = curvedMag(0.028, 0.16, 0.5, MAT.gunMetal);
  mag.position.set(0, -0.035, -0.02); g.add(mag);
  const grip = handGrip(0.08, 0.028, MAT.gripPoly);
  grip.position.set(0, -0.03, 0.1); grip.rotation.x = 0.22; g.add(grip);
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.04, 0.055); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.032, 0.055); g.add(tr);
  const stock = mesh(rb(0.034, 0.05, 0.2, 0.008), MAT.woodVarnish, 0, 0.005, 0.26);
  stock.rotation.x = -0.12; g.add(stock);
  const butt = mesh(rb(0.036, 0.052, 0.01, 0.003), MAT.steelDark, 0, 0, 0.36); g.add(butt);
  const rs = rearSight(MAT.gunMetal); rs.position.set(0, 0.06, -0.14); g.add(rs);
  const safety = mesh(rb(0.006, 0.03, 0.06, 0.002), MAT.gunMetalWorn, 0.022, 0.02, -0.05); g.add(safety);
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.085, 0.12); hand.rotation.x = 0.2; g.add(hand);
}

function buildShotgun(g) {
  const receiver = mesh(rb(0.04, 0.05, 0.16, 0.008), MAT.gunMetal, 0, 0.02, -0.06); g.add(receiver);
  const b1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, -0.014, 0.03, -0.28);
  b1.rotation.x = Math.PI / 2; g.add(b1);
  const b2 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, 0.014, 0.03, -0.28);
  b2.rotation.x = Math.PI / 2; g.add(b2);
  const band = mesh(rb(0.045, 0.032, 0.014, 0.003), MAT.gunMetalWorn, 0, 0.03, -0.44); g.add(band);
  const m1 = mesh(new THREE.TorusGeometry(0.011, 0.002, 4, 10), MAT.black, -0.014, 0.03, -0.48); g.add(m1);
  const m2 = mesh(new THREE.TorusGeometry(0.011, 0.002, 4, 10), MAT.black, 0.014, 0.03, -0.48); g.add(m2);
  const forend = mesh(rb(0.05, 0.03, 0.14, 0.008), MAT.woodVarnish, 0, 0.005, -0.24); g.add(forend);
  const stock = mesh(rb(0.038, 0.055, 0.2, 0.008), MAT.woodVarnish, 0, 0, 0.24);
  stock.rotation.x = -0.08; g.add(stock);
  const butt = mesh(rb(0.04, 0.058, 0.012, 0.004), MAT.gunMetalWorn, 0, 0, 0.34); g.add(butt);
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.04, 0.03); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.032, 0.03); g.add(tr);
  const fs = frontSight(MAT.gunMetal); fs.position.set(0, 0.058, -0.44); g.add(fs);
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.085, 0.08); hand.rotation.x = 0.2; g.add(hand);
}

function buildLauncher(g) {
  const tube = mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.65, 16), MAT.gunMetalLight, 0, 0.02, -0.15);
  tube.rotation.x = Math.PI / 2; g.add(tube);
  const rim = mesh(new THREE.TorusGeometry(0.056, 0.006, 6, 16), MAT.steelDark, 0, 0.02, -0.47); g.add(rim);
  const muzzle = mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.02, 16), MAT.black, 0, 0.02, -0.48);
  muzzle.rotation.x = Math.PI / 2; g.add(muzzle);
  const rear = mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.06, 16), MAT.steelDark, 0, 0.02, 0.19);
  rear.rotation.x = Math.PI / 2; g.add(rear);
  const vent = mesh(new THREE.ConeGeometry(0.05, 0.06, 16, 1, true), MAT.black, 0, 0.02, 0.24);
  vent.rotation.x = -Math.PI / 2; g.add(vent);
  const scopeMount = mesh(rb(0.02, 0.02, 0.1, 0.003), MAT.gunMetal, 0, 0.08, -0.05); g.add(scopeMount);
  const scope = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 12), MAT.gunMetal, 0, 0.12, -0.05);
  scope.rotation.x = Math.PI / 2; g.add(scope);
  const lensF = mesh(new THREE.CircleGeometry(0.022, 12), MAT.black, 0, 0.12, -0.12);
  lensF.rotation.y = Math.PI; g.add(lensF);
  const lensB = mesh(new THREE.CircleGeometry(0.022, 12), MAT.chrome, 0, 0.12, 0.02); g.add(lensB);
  const fg = handGrip(0.07, 0.03, MAT.gripPoly);
  fg.position.set(0, -0.06, -0.25); fg.rotation.x = 0.15; g.add(fg);
  const pg = handGrip(0.08, 0.03, MAT.gripPoly);
  pg.position.set(0, -0.06, 0.04); pg.rotation.x = 0.25; g.add(pg);
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.07, 0.01); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.062, 0.01); g.add(tr);
  const stripe = mesh(new THREE.TorusGeometry(0.057, 0.004, 4, 16), MAT.accent, 0, 0.02, 0.05); g.add(stripe);
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.11, 0.06); hand.rotation.x = 0.2; g.add(hand);
}

const BUILDERS = {
  knife: buildKnife,
  woodenClub: buildClub,
  pipe: buildPipe,
  pipeWrench: buildPipeWrench,
  cleaver: buildCleaver,
  katana: buildKatana,
  kukri: buildKukri,
  shovel: buildShovel,
  reaperScythe: buildScythe,
  pistol: buildPistol,
  revolver: buildRevolver,
  smg: buildSMG,
  rifle: buildRifle,
  shotgun: buildShotgun,
  launcher: buildLauncher,
};

// ============================================================
// API PÚBLICA
// ============================================================

/**
 * Procedural puro (sempre retorna algo).
 */
export function buildWeaponModel(weaponId) {
  const g = new THREE.Group();
  const b = BUILDERS[weaponId];
  if (b) b(g);
  g.userData.weaponId = weaponId;
  g.userData.source = 'procedural';
  return g;
}

/**
 * Smart — prefere GLB se estiver no cache, senão procedural.
 * Síncrono (não pode await). Chame precacheWeaponGLB antes.
 */
export function buildWeaponModelSmart(weaponId) {
  if (glbReady.has(weaponId)) {
    const model = glbReady.get(weaponId).clone(true);
    model.traverse(c => {
      if (c.isMesh && c.material) {
        if (Array.isArray(c.material)) c.material = c.material.map(m => m.clone());
        else c.material = c.material.clone();
      }
    });
    model.userData.weaponId = weaponId;
    model.userData.source = 'glb';
    return model;
  }
  return buildWeaponModel(weaponId);
}

// Metadata
export const WEAPON_WORLD_SIZE = {
  knife: 0.6, woodenClub: 0.95, pipe: 0.95, pipeWrench: 0.95,
  cleaver: 0.75, katana: 1.4, kukri: 0.75, shovel: 1.5,
  reaperScythe: 2.0,
  pistol: 0.6, revolver: 0.65, smg: 0.95, rifle: 1.3,
  shotgun: 1.2, launcher: 1.3,
};
export function getWeaponWorldSize(id) {
  return WEAPON_WORLD_SIZE[id] || 0.85;
}

export function getWeaponPickupColor(weaponId, isDrop) {
  if (isDrop) return 0xff00ff;
  return 0xffdd00;
}

// Ammo box
const AMMO_COLORS = {
  pistol:   { box: 0x4a4a2a, accent: 0xc9a227 },
  revolver: { box: 0x5a3a2a, accent: 0xc9a227 },
  smg:      { box: 0x3a4a2a, accent: 0x9acd32 },
  rifle:    { box: 0x2a3a4a, accent: 0xff8c00 },
  shotgun:  { box: 0x4a2a2a, accent: 0xff4444 },
  launcher: { box: 0x3a2a3a, accent: 0xff00ff },
};

export function buildAmmoBox(ammoType) {
  const g = new THREE.Group();
  const c = AMMO_COLORS[ammoType] || AMMO_COLORS.pistol;
  const boxMat = new THREE.MeshStandardMaterial({ color: c.box, metalness: 0.3, roughness: 0.75 });
  const accMat = new THREE.MeshStandardMaterial({ color: c.accent, metalness: 0.5, roughness: 0.4 });

  const box = mesh(rb(0.5, 0.28, 0.35, 0.03), boxMat);
  g.add(box);
  const lid = mesh(rb(0.52, 0.03, 0.37, 0.008), boxMat, 0, 0.14, 0);
  g.add(lid);
  const lidRib = mesh(rb(0.5, 0.005, 0.02, 0.001), accMat, 0, 0.158, 0);
  g.add(lidRib);
  const strap = mesh(rb(0.08, 0.30, 0.37, 0.005), accMat);
  g.add(strap);

  for (const [x, y] of [[-0.23, -0.1], [0.23, -0.1], [-0.23, 0.1], [0.23, 0.1]]) {
    const sc = screw(0.012, 0.006, MAT.gunMetal);
    sc.rotation.z = Math.PI / 2;
    sc.position.set(x, y, 0.18);
    g.add(sc);
  }

  for (let i = 0; i < 3; i++) {
    const bullet = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), MAT.brass, -0.14 + i * 0.14, 0.22, 0);
    bullet.rotation.z = Math.PI / 2;
    g.add(bullet);
    const tip = mesh(new THREE.ConeGeometry(0.03, 0.06, 8), MAT.brass, -0.14 + i * 0.14 + 0.09, 0.22, 0);
    tip.rotation.z = -Math.PI / 2;
    g.add(tip);
    const rim = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 8), MAT.steelDark, -0.14 + i * 0.14 - 0.063, 0.22, 0);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
  }

  return g;
}
