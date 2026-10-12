// ============================================================
// weapon-models.js — v9
// Mapeia GLBs do Zumbi Blocks 2 para as armas do jogo.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const gltfLoader = new GLTFLoader();
try {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  gltfLoader.setDRACOLoader(draco);
} catch (_) {}

export const GLB_CANDIDATES = {
  knife:        [],
  woodenClub:   [],
  pipe:         [],
  pipeWrench:   [],
  cleaver:      [],
  katana:       [],
  kukri:        [],
  shovel:       [],
  reaperScythe: [],

  pistol: [
    '1911_Gun.glb', '1911Body.glb', '1911_3D.glb',
    '1911LowPoly.glb', 'M1911.glb', 'Beretta38_Gun.glb',
  ],
  revolver: [
    'C96_Gun.glb', 'C96_3D.glb', 'C96.glb',
    'Beretta38_Gun.glb', 'Revolver.glb',
  ],
  smg: [
    'AkSu_Gun.glb', 'AkSuBody.glb', 'AkSu_3D.glb', 'AkSuLowPoly.glb',
    'Bizon_Gun.glb', 'Bizon.glb', 'Bizon_3D.glb',
  ],
  rifle: [
    'AmericanPredator_Gun.glb', 'AmericanPredator.glb', 'AmericanPredator_3D.glb',
    'Ar16_Gun.glb', 'Ar16Body.glb', 'Ar16LowPoly.glb',
    'AsVal_Gun.glb', 'AsVal.glb', 'AsVal_3D.glb',
  ],
  shotgun: [],
  launcher: [],
};

const MODELS_BASE = 'assets/models/';
const glbPromises = new Map();
const glbReady = new Map();
const glbSourceName = new Map();

function loadFirstAvailable(weaponId) {
  const candidates = GLB_CANDIDATES[weaponId];
  if (!candidates || candidates.length === 0) {
    return Promise.reject(new Error('Sem candidatos: ' + weaponId));
  }
  if (glbPromises.has(weaponId)) return glbPromises.get(weaponId);

  const promise = (async () => {
    for (const filename of candidates) {
      try {
        const gltf = await gltfLoader.loadAsync(MODELS_BASE + filename);
        glbSourceName.set(weaponId, filename);
        console.log(`[weapon-models] ✅ ${weaponId} ← ${filename}`);
        return gltf.scene;
      } catch (_) {}
    }
    console.warn(`[weapon-models] ⚠️ ${weaponId} — procedural`);
    throw new Error('Nenhum candidato: ' + weaponId);
  })();

  glbPromises.set(weaponId, promise);
  return promise;
}

function prepareModel(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(1 / maxDim);
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

export async function getWeaponGLB(weaponId) {
  const raw = await loadFirstAvailable(weaponId);
  const cloned = raw.clone(true);
  cloned.traverse(c => {
    if (c.isMesh && c.material) {
      if (Array.isArray(c.material)) c.material = c.material.map(m => m.clone());
      else c.material = c.material.clone();
    }
  });
  return prepareModel(cloned);
}

export async function precacheWeaponGLB(weaponId) {
  try {
    const model = await getWeaponGLB(weaponId);
    glbReady.set(weaponId, model);
    return true;
  } catch (_) { return false; }
}

export async function precacheAllWeaponGLBs(onProgress) {
  const ids = Object.keys(GLB_CANDIDATES);
  const results = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    results[id] = await precacheWeaponGLB(id);
    if (onProgress) onProgress(i + 1, ids.length, id, results[id]);
  }
  console.log('[weapon-models] 📦 Precache completo:');
  console.table(Object.keys(results).map(id => ({
    arma: id,
    carregado: results[id] ? '✅' : '❌',
    arquivo: glbSourceName.get(id) || '— (procedural)',
  })));
  return results;
}

export function hasGLB(weaponId) { return glbReady.has(weaponId); }
export function getSourceName(weaponId) { return glbSourceName.get(weaponId) || null; }
export function getStatus() {
  const out = {};
  for (const id of Object.keys(GLB_CANDIDATES)) {
    out[id] = { loaded: glbReady.has(id), file: glbSourceName.get(id) || null };
  }
  return out;
}

// ============================================================
// FALLBACK PROCEDURAL (idêntico ao anterior)
// ============================================================
const MAT = {
  gunMetal: new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.9, roughness: 0.38 }),
  gunMetalLight: new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.85, roughness: 0.42 }),
  gunMetalWorn: new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.75, roughness: 0.55 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1.0, roughness: 0.22 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 1.0, roughness: 0.45 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1.0, roughness: 0.08 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4423, metalness: 0.05, roughness: 0.72 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x4a2f18, metalness: 0.05, roughness: 0.82 }),
  woodVarnish: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, metalness: 0.1, roughness: 0.5 }),
  gripPoly: new THREE.MeshStandardMaterial({ color: 0x141618, metalness: 0.15, roughness: 0.92 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1.0, roughness: 0.3 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.3, roughness: 0.85 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xcc0000, metalness: 0.3, roughness: 0.55 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd4a574, metalness: 0.0, roughness: 0.78 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x6b3a1f, metalness: 0.4, roughness: 0.85 }),
};

function rb(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function screw(r, h, mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), mat));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(r*1.8, h*1.05, r*0.2), MAT.black));
  return g;
}
function frontSight(mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.03), mat));
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.006), mat);
  p.position.y = 0.015; g.add(p); return g;
}
function rearSight(mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), mat));
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  l.position.set(-0.014, 0.012, 0); g.add(l);
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  r.position.set(0.014, 0.012, 0); g.add(r); return g;
}
function trigger(mat) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.02, 3, 6), mat);
  t.rotation.x = 0.25; g.add(t); return g;
}
function triggerGuard(mat) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI * 1.2), mat);
  t.rotation.z = -Math.PI * 0.1; t.rotation.x = Math.PI / 2; g.add(t); return g;
}
function curvedMag(w, h, curve, mat) {
  const g = new THREE.Group(); const segs = 8, sh = h / segs;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const s = new THREE.Mesh(rb(w, sh * 1.05, w * 0.7), mat);
    s.position.y = -i * sh - sh * 0.5; s.position.z = -t * curve * h * 0.5; s.rotation.x = t * curve;
    g.add(s);
  } return g;
}
function handGrip(h, w, mat) {
  const g = new THREE.Group(); const s = 6;
  for (let i = 0; i < s; i++) {
    const t = i / (s - 1); const ww = w * (1 - t * 0.15); const sh = h / s;
    const seg = new THREE.Mesh(rb(ww, sh * 1.05, ww * 0.75), mat);
    seg.position.y = -i * sh - sh * 0.5; seg.rotation.x = 0.05; g.add(seg);
  } return g;
}

function buildKnife(g) {
  const h = new THREE.Group();
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(rb(0.032, 0.05, 0.028), MAT.gripPoly); s.position.y = 0.06 - i*0.05; s.rotation.x = 0.05; h.add(s); }
  h.add(mesh(rb(0.055, 0.014, 0.03), MAT.steelDark, 0, 0.14, 0));
  h.add(mesh(rb(0.024, 0.36, 0.006), MAT.steel, 0, 0.32, 0));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 4), MAT.steel);
  tip.rotation.y = Math.PI/4; tip.position.set(0, 0.54, 0); h.add(tip);
  g.add(h);
}
function buildClub(g) {
  const s = mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 10), MAT.woodDark, 0, 0, -0.15);
  s.rotation.x = Math.PI/2; g.add(s);
  g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.wood, 0, 0, -0.6));
}
function buildPipe(g) {
  const p = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 12), MAT.gunMetalWorn, 0, 0, -0.2);
  p.rotation.x = Math.PI/2; g.add(p);
  const j = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 12), MAT.steelDark, 0, 0, -0.35);
  j.rotation.x = Math.PI/2; g.add(j);
}
function buildPipeWrench(g) {
  const h = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 10), MAT.gunMetalWorn, 0, 0, -0.15);
  h.rotation.x = Math.PI/2; g.add(h);
  g.add(mesh(rb(0.025, 0.06, 0.08), MAT.steelDark, 0, 0.005, -0.62));
}
function buildCleaver(g) {
  const h = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.14, 10), MAT.woodDark, 0, 0, 0.08);
  h.rotation.x = Math.PI/2; g.add(h);
  g.add(mesh(rb(0.005, 0.16, 0.28), MAT.steel, 0, 0.02, -0.2));
}
function buildKatana(g) {
  const t = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 8), MAT.gripPoly, 0, 0, 0.12);
  t.rotation.x = Math.PI/2; g.add(t);
  const tb = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8), MAT.gunMetal, 0, 0, 0.005);
  tb.rotation.x = Math.PI/2; g.add(tb);
  g.add(mesh(rb(0.018, 0.014, 0.78), MAT.steel, 0, 0, -0.4));
}
function buildKukri(g) {
  const gr = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 10), MAT.gripPoly, 0, 0, 0.075);
  gr.rotation.x = Math.PI/2; g.add(gr);
  g.add(mesh(rb(0.055, 0.014, 0.22), MAT.steel, 0, 0, -0.15));
}
function buildShovel(g) {
  const h = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.85, 10), MAT.wood, 0, 0, -0.15);
  h.rotation.x = Math.PI/2; g.add(h);
  g.add(mesh(rb(0.11, 0.005, 0.18), MAT.steelDark, 0, 0, -0.72));
}
function buildScythe(g) {
  const s = mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.4, 10), MAT.black, 0, 0, -0.4);
  s.rotation.x = Math.PI/2; g.add(s);
  g.add(mesh(rb(0.06, 0.008, 0.4), MAT.steelDark, 0.15, 0, -1.05));
}
function buildPistol(g) {
  g.add(mesh(rb(0.032, 0.032, 0.18), MAT.gunMetal, 0, 0.02, -0.06));
  const gr = handGrip(0.1, 0.032, MAT.gripPoly); gr.position.set(0, -0.02, 0.02); gr.rotation.x = 0.28; g.add(gr);
}
function buildRevolver(g) {
  const b = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), MAT.steel, 0, 0.02, -0.12);
  b.rotation.x = Math.PI/2; g.add(b);
  const c = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0.015, -0.02);
  c.rotation.x = Math.PI/2; g.add(c);
  const gr = handGrip(0.1, 0.032, MAT.woodVarnish); gr.position.set(0, -0.02, 0.075); gr.rotation.x = 0.38; g.add(gr);
}
function buildSMG(g) {
  g.add(mesh(rb(0.036, 0.05, 0.22), MAT.gunMetal, 0, 0.02, -0.05));
  const b = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 10), MAT.gunMetal, 0, 0.03, -0.24);
  b.rotation.x = Math.PI/2; g.add(b);
  const mg = curvedMag(0.026, 0.14, 0.4, MAT.gunMetal); mg.position.set(0, -0.03, -0.02); g.add(mg);
  const gr = handGrip(0.075, 0.026, MAT.gripPoly); gr.position.set(0, -0.03, 0.08); gr.rotation.x = 0.22; g.add(gr);
}
function buildRifle(g) {
  g.add(mesh(rb(0.038, 0.055, 0.28), MAT.gunMetal, 0, 0.02, -0.08));
  const b = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 10), MAT.gunMetal, 0, 0.032, -0.34);
  b.rotation.x = Math.PI/2; g.add(b);
  const mg = curvedMag(0.028, 0.16, 0.5, MAT.gunMetal); mg.position.set(0, -0.035, -0.02); g.add(mg);
  const gr = handGrip(0.08, 0.028, MAT.gripPoly); gr.position.set(0, -0.03, 0.1); gr.rotation.x = 0.22; g.add(gr);
}
function buildShotgun(g) {
  const b1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, -0.014, 0.03, -0.28);
  b1.rotation.x = Math.PI/2; g.add(b1);
  const b2 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, 0.014, 0.03, -0.28);
  b2.rotation.x = Math.PI/2; g.add(b2);
}
function buildLauncher(g) {
  const t = mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.65, 16), MAT.gunMetalLight, 0, 0.02, -0.15);
  t.rotation.x = Math.PI/2; g.add(t);
}

const BUILDERS = {
  knife: buildKnife, woodenClub: buildClub, pipe: buildPipe,
  pipeWrench: buildPipeWrench, cleaver: buildCleaver, katana: buildKatana,
  kukri: buildKukri, shovel: buildShovel, reaperScythe: buildScythe,
  pistol: buildPistol, revolver: buildRevolver, smg: buildSMG,
  rifle: buildRifle, shotgun: buildShotgun, launcher: buildLauncher,
};

export function buildWeaponModel(weaponId) {
  const g = new THREE.Group();
  const b = BUILDERS[weaponId];
  if (b) b(g);
  g.userData.weaponId = weaponId;
  g.userData.source = 'procedural';
  return g;
}

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

export const WEAPON_WORLD_SIZE = {
  knife: 0.6, woodenClub: 0.95, pipe: 0.95, pipeWrench: 0.95,
  cleaver: 0.75, katana: 1.4, kukri: 0.75, shovel: 1.5, reaperScythe: 2.0,
  pistol: 0.6, revolver: 0.65, smg: 0.95, rifle: 1.3, shotgun: 1.2, launcher: 1.3,
};
export function getWeaponWorldSize(id) { return WEAPON_WORLD_SIZE[id] || 0.85; }
export function getWeaponPickupColor(weaponId, isDrop) { return isDrop ? 0xff00ff : 0xffdd00; }

const AMMO_COLORS = {
  pistol: { box: 0x4a4a2a, accent: 0xc9a227 }, revolver: { box: 0x5a3a2a, accent: 0xc9a227 },
  smg: { box: 0x3a4a2a, accent: 0x9acd32 }, rifle: { box: 0x2a3a4a, accent: 0xff8c00 },
  shotgun: { box: 0x4a2a2a, accent: 0xff4444 }, launcher: { box: 0x3a2a3a, accent: 0xff00ff },
};

export function buildAmmoBox(ammoType) {
  const g = new THREE.Group();
  const c = AMMO_COLORS[ammoType] || AMMO_COLORS.pistol;
  const boxMat = new THREE.MeshStandardMaterial({ color: c.box, metalness: 0.3, roughness: 0.75 });
  const accMat = new THREE.MeshStandardMaterial({ color: c.accent, metalness: 0.5, roughness: 0.4 });
  g.add(mesh(rb(0.5, 0.28, 0.35), boxMat));
  g.add(mesh(rb(0.52, 0.03, 0.37), boxMat, 0, 0.14, 0));
  g.add(mesh(rb(0.08, 0.30, 0.37), accMat));
  return g;
}
