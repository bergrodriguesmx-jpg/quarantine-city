// ============================================================
// weapon-models.js — v5
// GLB com pivotOffset pra alinhar grip ao viewmodel
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
} catch (_) {}

// ============================================================
// PATHS
// ============================================================
export const GLB_PATHS = {
  knife:        'assets/models/knife.glb',
  pistol:       'assets/models/pistol.glb',
  revolver:     'assets/models/revolver.glb',
  smg:          'assets/models/smg.glb',
  rifle:        'assets/models/rifle.glb',
  shotgun:      'assets/models/shotgun.glb',
  woodenClub:   'assets/models/club.glb',
  pipe:         'assets/models/pipe.glb',
  pipeWrench:   'assets/models/pipe_wrench.glb',
  cleaver:      'assets/models/cleaver.glb',
  katana:       'assets/models/katana.glb',
  kukri:        'assets/models/kukri.glb',
  shovel:       'assets/models/shovel.glb',
  reaperScythe: 'assets/models/scythe.glb',
  launcher:     'assets/models/launcher.glb',
};

// ============================================================
// OVERRIDES POR ARMA
// ============================================================
// targetSize = tamanho máximo em unidades-mundo
// rotX/Y/Z   = rotação em radianos
// pivotX/Y/Z = offset do grip (ajusta o ponto de ancoragem)
//
// ⚠️  Se a arma ficar em posições estranhas quando você
//    anda / mira / atira, o problema é o PIVOT. Use o
//    tuner (tools/glb-tuner.html) pra calibrar.
// ============================================================
export const GLB_OVERRIDES = {
  // ====== GLBs baixados ======
  knife:    { targetSize: 0.35, rotY: -Math.PI/2, rotX: 0, rotZ: 0, pivotX: 0, pivotY: -0.02, pivotZ: 0.10 },
  pistol:   { targetSize: 0.32, rotY: -Math.PI/2, rotX: 0, rotZ: 0, pivotX: 0, pivotY: -0.02, pivotZ: 0.08 },
  revolver: { targetSize: 0.36, rotY: -Math.PI/2, rotX: 0, rotZ: 0, pivotX: 0, pivotY: -0.02, pivotZ: 0.10 },
  smg:      { targetSize: 0.55, rotY: -Math.PI/2, rotX: 0, rotZ: 0, pivotX: 0, pivotY: -0.02, pivotZ: 0.15 },
  rifle:    { targetSize: 0.75, rotY: -Math.PI/2, rotX: 0, rotZ: 0, pivotX: 0, pivotY: -0.02, pivotZ: 0.25 },
  shotgun:  { targetSize: 0.65, rotY: -Math.PI/2, rotX: 0, rotZ: 0, pivotX: 0, pivotY: -0.02, pivotZ: 0.20 },

  // ====== Procedurais (valores ignorados) ======
  woodenClub:   { targetSize: 0.95 },
  pipe:         { targetSize: 0.95 },
  pipeWrench:   { targetSize: 0.95 },
  cleaver:      { targetSize: 0.75 },
  katana:       { targetSize: 1.4 },
  kukri:        { targetSize: 0.75 },
  shovel:       { targetSize: 1.5 },
  reaperScythe: { targetSize: 2.0 },
  launcher:     { targetSize: 1.3 },
};

// ============================================================
// CACHE
// ============================================================
const glbPromises = new Map();
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

// ============================================================
// NORMALIZE — alinha o grip do modelo ao (0,0,0)
// ============================================================
function normalizeModel(model, opts = {}) {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // 1) Centraliza no centro do bbox
  model.position.sub(center);

  // 2) Aplica rotação
  model.rotation.set(
    opts.rotX ?? 0,
    opts.rotY ?? 0,
    opts.rotZ ?? 0,
  );

  // 3) Escala
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = opts.targetSize ?? 1.2;
  const scale = targetSize / maxDim;
  model.scale.multiplyScalar(scale);

  // 4) Aplica pivotOffset (em unidades locais, ANTES do scale multiplicar)
  //    O usuário ajusta no tuner.
  model.position.x += (opts.pivotX ?? 0) * scale;
  model.position.y += (opts.pivotY ?? 0) * scale;
  model.position.z += (opts.pivotZ ?? 0) * scale;

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

// ============================================================
// API GLB
// ============================================================
export async function getWeaponGLB(weaponId, opts = {}) {
  const path = GLB_PATHS[weaponId];
  if (!path) throw new Error('Sem GLB path pra ' + weaponId);

  const overrides = GLB_OVERRIDES[weaponId] || {};
  const mergedOpts = { ...overrides, ...opts };

  const raw = await loadGLBRaw(path);
  const cloned = raw.clone(true);

  cloned.traverse(c => {
    if (c.isMesh && c.material) {
      if (Array.isArray(c.material)) c.material = c.material.map(m => m.clone());
      else c.material = c.material.clone();
    }
  });

  return normalizeModel(cloned, mergedOpts);
}

export async function precacheWeaponGLB(weaponId, opts = {}) {
  try {
    const model = await getWeaponGLB(weaponId, opts);
    glbReady.set(weaponId, model);
    return true;
  } catch (_) {
    return false;
  }
}

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
// MATERIAIS PROCEDURAIS
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

function rb(w, h, d, r = 0.02) { return new THREE.BoxGeometry(w, h, d); }

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function screw(radius, height, mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), mat));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(radius*1.8, height*1.05, radius*0.2), MAT.black));
  return g;
}

function frontSight(mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.03), mat));
  const p = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.006), mat);
  p.position.y = 0.015; g.add(p);
  return g;
}

function rearSight(mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), mat));
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  l.position.set(-0.014, 0.012, 0); g.add(l);
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  r.position.set(0.014, 0.012, 0); g.add(r);
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
  t.rotation.z = -Math.PI * 0.1; t.rotation.x = Math.PI / 2;
  g.add(t);
  return g;
}

function curvedMag(width, height, curve, mat) {
  const g = new THREE.Group();
  const segs = 8, segH = height / segs;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const s = new THREE.Mesh(rb(width, segH * 1.05, width * 0.7, 0.008), mat);
    s.position.y = -i * segH - segH * 0.5;
    s.position.z = -t * curve * height * 0.5;
    s.rotation.x = t * curve;
    g.add(s);
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
    const s = new THREE.Mesh(rb(0.032, 0.05, 0.028, 0.008), MAT.gripPoly);
    s.position.y = 0.06 - i * 0.05; s.rotation.x = 0.05; handle.add(s);
  }
  handle.add(mesh(rb(0.055, 0.014, 0.03, 0.004), MAT.steelDark, 0, 0.14, 0));
  handle.add(mesh(rb(0.024, 0.36, 0.006, 0.001), MAT.steel, 0, 0.32, 0));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 4), MAT.steel);
  tip.rotation.y = Math.PI/4; tip.position.set(0, 0.54, 0); handle.add(tip);
  handle.add(mesh(rb(0.006, 0.22, 0.004, 0.001), MAT.steelDark, 0, 0.28, 0.003));
  g.add(handle);
  const h = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  h.position.set(0, -0.01, 0.02); g.add(h);
}
function buildClub(g) {
  const s = mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 10), MAT.woodDark, 0, 0, -0.15);
  s.rotation.x = Math.PI / 2; g.add(s);
  const headGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.05, 0.02),
    new THREE.Vector2(0.06, 0.08), new THREE.Vector2(0.055, 0.13),
    new THREE.Vector2(0.04, 0.15), new THREE.Vector2(0, 0.16),
  ], 12);
  const head = new THREE.Mesh(headGeo, MAT.wood);
  head.rotation.x = -Math.PI / 2; head.position.set(0, 0, -0.62); g.add(head);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), MAT.steelDark, Math.cos(a)*0.04, Math.sin(a)*0.04, -0.55));
  }
  const h = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  h.position.set(0, -0.02, 0.08); g.add(h);
}
function buildPipe(g) {
  const p = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 12), MAT.gunMetalWorn, 0, 0, -0.2);
  p.rotation.x = Math.PI / 2; g.add(p);
  for (let i = 0; i < 6; i++) {
    const t = mesh(new THREE.TorusGeometry(0.019, 0.002, 4, 12), MAT.steelDark, 0, 0, -0.4 - i*0.015);
    t.rotation.y = Math.PI / 2; g.add(t);
  }
  const j = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 12), MAT.steelDark, 0, 0, -0.35);
  j.rotation.x = Math.PI / 2; g.add(j);
  const rt = mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.06, 12), MAT.rust, 0, 0, -0.56);
  rt.rotation.x = Math.PI / 2; g.add(rt);
  const h = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  h.position.set(0, -0.02, 0.06); g.add(h);
}
function buildPipeWrench(g) {
  const h = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 10), MAT.gunMetalWorn, 0, 0, -0.15);
  h.rotation.x = Math.PI / 2; g.add(h);
  const a = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0, -0.35);
  a.rotation.x = Math.PI / 2; g.add(a);
  g.add(mesh(rb(0.025, 0.06, 0.08, 0.006), MAT.steelDark, 0, 0.005, -0.62));
  g.add(mesh(rb(0.025, 0.045, 0.06, 0.006), MAT.steelDark, 0, -0.04, -0.6));
  const sc = screw(0.008, 0.006, MAT.brass);
  sc.rotation.z = Math.PI / 2; sc.position.set(0.016, 0, -0.48); g.add(sc);
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.08); g.add(hand);
}
function buildCleaver(g) {
  const h = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.14, 10), MAT.woodDark, 0, 0, 0.08);
  h.rotation.x = Math.PI / 2; g.add(h);
  for (let i = 0; i < 2; i++) {
    const r = mesh(new THREE.SphereGeometry(0.005, 6, 4), MAT.brass, 0, 0, 0.04 + i*0.06);
    r.scale.set(2, 0.5, 1); g.add(r);
  }
  g.add(mesh(rb(0.005, 0.16, 0.28, 0.002), MAT.steel, 0, 0.02, -0.2));
  g.add(mesh(rb(0.002, 0.16, 0.28, 0.001), MAT.chrome, 0.0025, 0.02, -0.2));
  g.add(mesh(rb(0.006, 0.014, 0.15, 0.002), MAT.steelDark, 0, 0.055, -0.16));
  const hole = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 10), MAT.black, 0, 0.02, -0.32);
  hole.rotation.z = Math.PI / 2; g.add(hole);
  const hd = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hd.position.set(0, -0.02, 0.08); g.add(hd);
}
function buildKatana(g) {
  const t = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 8), MAT.gripPoly, 0, 0, 0.12);
  t.rotation.x = Math.PI / 2; g.add(t);
  for (let i = 0; i < 6; i++) {
    const w = mesh(rb(0.032, 0.018, 0.018, 0.003), MAT.accent, 0, 0, 0.03 + i*0.035);
    w.rotation.z = Math.PI / 4; g.add(w);
  }
  const k = mesh(new THREE.CylinderGeometry(0.017, 0.014, 0.02, 8), MAT.steelDark, 0, 0, 0.24);
  k.rotation.x = Math.PI / 2; g.add(k);
  const tb = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8), MAT.gunMetal, 0, 0, 0.005);
  tb.rotation.x = Math.PI / 2; g.add(tb);
  g.add(mesh(rb(0.018, 0.014, 0.025, 0.003), MAT.brass, 0, 0, -0.015));
  const shape = new THREE.Shape();
  shape.moveTo(-0.009, 0);
  shape.lineTo(-0.009, 0.7);
  shape.quadraticCurveTo(-0.008, 0.75, 0.002, 0.78);
  shape.quadraticCurveTo(0.008, 0.76, 0.009, 0.7);
  shape.lineTo(0.009, 0);
  shape.lineTo(-0.009, 0);
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2 });
  const blade = new THREE.Mesh(bg, MAT.steel);
  blade.rotation.x = -Math.PI / 2; blade.position.set(0, 0, -0.03); g.add(blade);
  const h = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  h.position.set(0, -0.02, 0.12); g.add(h);
}
function buildKukri(g) {
  const gr = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 10), MAT.gripPoly, 0, 0, 0.075);
  gr.rotation.x = Math.PI / 2; g.add(gr);
  const p = mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.015, 10), MAT.steelDark, 0, 0, 0.145);
  p.rotation.x = Math.PI / 2; g.add(p);
  g.add(mesh(rb(0.055, 0.014, 0.018, 0.003), MAT.brass, 0, 0, 0.005));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.05, 0.02, 0.14, 0.03, 0.22, 0.07);
  shape.lineTo(0.23, 0.04);
  shape.bezierCurveTo(0.16, -0.02, 0.08, -0.05, 0, -0.02);
  shape.lineTo(0, 0);
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2 });
  const b = new THREE.Mesh(bg, MAT.steel);
  b.rotation.x = -Math.PI / 2; b.position.set(0, 0, -0.01); g.add(b);
  const h = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  h.position.set(0, -0.02, 0.075); g.add(h);
}
function buildShovel(g) {
  const h = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.85, 10), MAT.wood, 0, 0, -0.15);
  h.rotation.x = Math.PI / 2; g.add(h);
  const gr = mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 12, Math.PI), MAT.woodDark, 0, 0.015, 0.28);
  gr.rotation.x = Math.PI / 2; gr.rotation.z = Math.PI / 2; g.add(gr);
  const f = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0, -0.58);
  f.rotation.x = Math.PI / 2; g.add(f);
  const shape = new THREE.Shape();
  shape.moveTo(-0.055, 0);
  shape.lineTo(-0.065, 0.12);
  shape.lineTo(-0.045, 0.18);
  shape.lineTo(0.045, 0.18);
  shape.lineTo(0.065, 0.12);
  shape.lineTo(0.055, 0);
  shape.lineTo(-0.055, 0);
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.005, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2 });
  const b = new THREE.Mesh(bg, MAT.steelDark);
  b.rotation.x = -Math.PI / 2; b.position.set(0, 0, -0.76); g.add(b);
  const hd = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hd.position.set(0, -0.02, 0.2); g.add(hd);
}
function buildScythe(g) {
  const s = mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.4, 10), MAT.black, 0, 0, -0.4);
  s.rotation.x = Math.PI / 2; g.add(s);
  for (let i = 0; i < 8; i++) {
    const w = mesh(new THREE.TorusGeometry(0.021, 0.004, 4, 10), MAT.accent, 0, 0, 0.05 - i*0.035);
    w.rotation.y = Math.PI / 2; g.add(w);
  }
  g.add(mesh(rb(0.03, 0.028, 0.06, 0.005), MAT.gunMetal, 0, 0, -1.05));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.15, 0.02, 0.32, 0.1, 0.4, 0.3);
  shape.bezierCurveTo(0.42, 0.35, 0.38, 0.38, 0.34, 0.36);
  shape.bezierCurveTo(0.28, 0.2, 0.14, 0.06, 0, 0.04);
  shape.lineTo(0, 0);
  const bg = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2 });
  const b = new THREE.Mesh(bg, MAT.steelDark);
  b.rotation.set(-Math.PI / 2, 0, Math.PI / 2); b.position.set(0.02, 0.02, -1.06); g.add(b);
  const orb = mesh(new THREE.SphereGeometry(0.02, 10, 8), MAT.accent, 0.3, 0.18, -1.06); g.add(orb);
  const h = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.black);
  h.position.set(0, -0.02, 0.2); g.add(h);
}
function buildPistol(g) {
  g.add(mesh(rb(0.032, 0.032, 0.18, 0.006), MAT.gunMetal, 0, 0.02, -0.06));
  for (let i = 0; i < 6; i++) g.add(mesh(rb(0.033, 0.026, 0.003, 0.001), MAT.gunMetalWorn, 0, 0.02, 0.015 + i*0.008));
  g.add(mesh(rb(0.02, 0.02, 0.05, 0.003), MAT.black, 0.014, 0.025, -0.07));
  g.add(mesh(rb(0.03, 0.025, 0.14, 0.005), MAT.gunMetalLight, 0, -0.01, -0.05));
  const b = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 10), MAT.black, 0, 0.02, -0.16);
  b.rotation.x = Math.PI / 2; g.add(b);
  const m = mesh(new THREE.TorusGeometry(0.009, 0.002, 4, 10), MAT.black, 0, 0.02, -0.18); g.add(m);
  const gr = handGrip(0.1, 0.032, MAT.gripPoly);
  gr.position.set(0, -0.02, 0.02); gr.rotation.x = 0.28; g.add(gr);
  const tg = triggerGuard(MAT.gunMetalLight); tg.position.set(0, -0.03, -0.015); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.022, -0.015); g.add(tr);
  const fs = frontSight(MAT.gunMetal); fs.position.set(0, 0.038, -0.14); g.add(fs);
  const rs = rearSight(MAT.gunMetal); rs.position.set(0, 0.038, 0.02); g.add(rs);
  const h = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  h.position.set(0, -0.07, 0.06); h.rotation.x = 0.2; g.add(h);
}
function buildRevolver(g) {
  const b = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), MAT.steel, 0, 0.02, -0.12);
  b.rotation.x = Math.PI / 2; g.add(b);
  g.add(mesh(rb(0.014, 0.014, 0.13, 0.003), MAT.steel, 0, 0.005, -0.11));
  g.add(mesh(rb(0.02, 0.006, 0.05, 0.002), MAT.steel, 0, 0.03, -0.02));
  const c = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0.015, -0.02);
  c.rotation.x = Math.PI / 2; g.add(c);
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    const ch = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.052, 8), MAT.black, Math.cos(a)*0.012, 0.015 + Math.sin(a)*0.012, -0.02);
    ch.rotation.x = Math.PI / 2; g.add(ch);
  }
  g.add(mesh(rb(0.022, 0.04, 0.06, 0.005), MAT.steel, 0, 0.005, 0.04));
  const hm = mesh(rb(0.01, 0.02, 0.014, 0.003), MAT.steel, 0, 0.035, 0.06);
  hm.rotation.x = -0.2; g.add(hm);
  const gr = handGrip(0.1, 0.032, MAT.woodVarnish);
  gr.position.set(0, -0.02, 0.075); gr.rotation.x = 0.38; g.add(gr);
  const tg = triggerGuard(MAT.steel); tg.position.set(0, -0.03, 0.045); g.add(tg);
  const tr = trigger(MAT.steelDark); tr.position.set(0, -0.022, 0.04); g.add(tr);
  const h = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  h.position.set(0, -0.07, 0.1); h.rotation.x = 0.3; g.add(h);
}
function buildSMG(g) {
  g.add(mesh(rb(0.036, 0.05, 0.22, 0.008), MAT.gunMetal, 0, 0.02, -0.05));
  for (let i = 0; i < 8; i++) g.add(mesh(rb(0.034, 0.003, 0.005, 0.001), MAT.gunMetalWorn, 0, 0.046, -0.14 + i*0.022));
  const b = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 10), MAT.gunMetal, 0, 0.03, -0.24);
  b.rotation.x = Math.PI / 2; g.add(b);
  g.add(mesh(rb(0.02, 0.018, 0.04, 0.004), MAT.gunMetalWorn, 0, 0.045, -0.22));
  const m = mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.025, 10), MAT.steelDark, 0, 0.03, -0.33);
  m.rotation.x = Math.PI / 2; g.add(m);
  g.add(mesh(rb(0.028, 0.018, 0.12, 0.005), MAT.woodVarnish, 0, 0.055, -0.18));
  g.add(mesh(rb(0.028, 0.022, 0.12, 0.005), MAT.woodVarnish, 0, 0.01, -0.18));
  const mg = curvedMag(0.026, 0.14, 0.4, MAT.gunMetal);
  mg.position.set(0, -0.03, -0.02); g.add(mg);
  const gr = handGrip(0.075, 0.026, MAT.gripPoly);
  gr.position.set(0, -0.03, 0.08); gr.rotation.x = 0.22; g.add(gr);
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.04, 0.04); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.032, 0.04); g.add(tr);
  g.add(mesh(rb(0.008, 0.05, 0.1, 0.003), MAT.gunMetal, 0.03, 0.02, 0.1));
  const fs = frontSight(MAT.gunMetal); fs.position.set(0, 0.058, -0.28); g.add(fs);
  const rs = rearSight(MAT.gunMetal); rs.position.set(0, 0.058, -0.02); g.add(rs);
  const h = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  h.position.set(0, -0.08, 0.1); h.rotation.x = 0.2; g.add(h);
}
function buildRifle(g) {
  g.add(mesh(rb(0.038, 0.055, 0.28, 0.008), MAT.gunMetal, 0, 0.02, -0.08));
  for (let i = 0; i < 10; i++) g.add(mesh(rb(0.036, 0.003, 0.005, 0.001), MAT.gunMetalWorn, 0, 0.05, -0.2 + i*0.024));
  const b = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 10), MAT.gunMetal, 0, 0.032, -0.34);
  b.rotation.x = Math.PI / 2; g.add(b);
  const gt = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 10), MAT.gunMetalWorn, 0, 0.055, -0.28);
  gt.rotation.x = Math.PI / 2; g.add(gt);
  g.add(mesh(rb(0.024, 0.022, 0.04, 0.004), MAT.gunMetal, 0, 0.042, -0.32));
  g.add(mesh(rb(0.02, 0.03, 0.028, 0.004), MAT.gunMetal, 0, 0.055, -0.46));
  const m = mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.03, 10), MAT.steelDark, 0, 0.032, -0.5);
  m.rotation.x = Math.PI / 2; g.add(m);
  g.add(mesh(rb(0.03, 0.024, 0.14, 0.005), MAT.woodVarnish, 0, 0.01, -0.26));
  g.add(mesh(rb(0.028, 0.016, 0.14, 0.005), MAT.woodVarnish, 0, 0.058, -0.26));
  const mg = curvedMag(0.028, 0.16, 0.5, MAT.gunMetal);
  mg.position.set(0, -0.035, -0.02); g.add(mg);
  const gr = handGrip(0.08, 0.028, MAT.gripPoly);
  gr.position.set(0, -0.03, 0.1); gr.rotation.x = 0.22; g.add(gr);
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.04, 0.055); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.032, 0.055); g.add(tr);
  const st = mesh(rb(0.034, 0.05, 0.2, 0.008), MAT.woodVarnish, 0, 0.005, 0.26);
  st.rotation.x = -0.12; g.add(st);
  g.add(mesh(rb(0.036, 0.052, 0.01, 0.003), MAT.steelDark, 0, 0, 0.36));
  const rs = rearSight(MAT.gunMetal); rs.position.set(0, 0.06, -0.14); g.add(rs);
  g.add(mesh(rb(0.006, 0.03, 0.06, 0.002), MAT.gunMetalWorn, 0.022, 0.02, -0.05));
  const h = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  h.position.set(0, -0.085, 0.12); h.rotation.x = 0.2; g.add(h);
}
function buildShotgun(g) {
  g.add(mesh(rb(0.04, 0.05, 0.16, 0.008), MAT.gunMetal, 0, 0.02, -0.06));
  const b1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, -0.014, 0.03, -0.28);
  b1.rotation.x = Math.PI / 2; g.add(b1);
  const b2 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, 0.014, 0.03, -0.28);
  b2.rotation.x = Math.PI / 2; g.add(b2);
  g.add(mesh(rb(0.045, 0.032, 0.014, 0.003), MAT.gunMetalWorn, 0, 0.03, -0.44));
  const m1 = mesh(new THREE.TorusGeometry(0.011, 0.002, 4, 10), MAT.black, -0.014, 0.03, -0.48); g.add(m1);
  const m2 = mesh(new THREE.TorusGeometry(0.011, 0.002, 4, 10), MAT.black, 0.014, 0.03, -0.48); g.add(m2);
  g.add(mesh(rb(0.05, 0.03, 0.14, 0.008), MAT.woodVarnish, 0, 0.005, -0.24));
  const st = mesh(rb(0.038, 0.055, 0.2, 0.008), MAT.woodVarnish, 0, 0, 0.24);
  st.rotation.x = -0.08; g.add(st);
  g.add(mesh(rb(0.04, 0.058, 0.012, 0.004), MAT.gunMetalWorn, 0, 0, 0.34));
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.04, 0.03); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.032, 0.03); g.add(tr);
  const fs = frontSight(MAT.gunMetal); fs.position.set(0, 0.058, -0.44); g.add(fs);
  const h = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  h.position.set(0, -0.085, 0.08); h.rotation.x = 0.2; g.add(h);
}
function buildLauncher(g) {
  const t = mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.65, 16), MAT.gunMetalLight, 0, 0.02, -0.15);
  t.rotation.x = Math.PI / 2; g.add(t);
  const r = mesh(new THREE.TorusGeometry(0.056, 0.006, 6, 16), MAT.steelDark, 0, 0.02, -0.47); g.add(r);
  const m = mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.02, 16), MAT.black, 0, 0.02, -0.48);
  m.rotation.x = Math.PI / 2; g.add(m);
  const rr = mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.06, 16), MAT.steelDark, 0, 0.02, 0.19);
  rr.rotation.x = Math.PI / 2; g.add(rr);
  const v = mesh(new THREE.ConeGeometry(0.05, 0.06, 16, 1, true), MAT.black, 0, 0.02, 0.24);
  v.rotation.x = -Math.PI / 2; g.add(v);
  g.add(mesh(rb(0.02, 0.02, 0.1, 0.003), MAT.gunMetal, 0, 0.08, -0.05));
  const sc = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 12), MAT.gunMetal, 0, 0.12, -0.05);
  sc.rotation.x = Math.PI / 2; g.add(sc);
  const lf = mesh(new THREE.CircleGeometry(0.022, 12), MAT.black, 0, 0.12, -0.12);
  lf.rotation.y = Math.PI; g.add(lf);
  g.add(mesh(new THREE.CircleGeometry(0.022, 12), MAT.chrome, 0, 0.12, 0.02));
  const fg = handGrip(0.07, 0.03, MAT.gripPoly);
  fg.position.set(0, -0.06, -0.25); fg.rotation.x = 0.15; g.add(fg);
  const pg = handGrip(0.08, 0.03, MAT.gripPoly);
  pg.position.set(0, -0.06, 0.04); pg.rotation.x = 0.25; g.add(pg);
  const tg = triggerGuard(MAT.gunMetal); tg.position.set(0, -0.07, 0.01); g.add(tg);
  const tr = trigger(MAT.steel); tr.position.set(0, -0.062, 0.01); g.add(tr);
  g.add(mesh(new THREE.TorusGeometry(0.057, 0.004, 4, 16), MAT.accent, 0, 0.02, 0.05));
  const h = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  h.position.set(0, -0.11, 0.06); h.rotation.x = 0.2; g.add(h);
}

const BUILDERS = {
  knife: buildKnife, woodenClub: buildClub, pipe: buildPipe,
  pipeWrench: buildPipeWrench, cleaver: buildCleaver, katana: buildKatana,
  kukri: buildKukri, shovel: buildShovel, reaperScythe: buildScythe,
  pistol: buildPistol, revolver: buildRevolver, smg: buildSMG,
  rifle: buildRifle, shotgun: buildShotgun, launcher: buildLauncher,
};

// ============================================================
// API PÚBLICA
// ============================================================
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
  g.add(mesh(rb(0.5, 0.28, 0.35, 0.03), boxMat));
  g.add(mesh(rb(0.52, 0.03, 0.37, 0.008), boxMat, 0, 0.14, 0));
  g.add(mesh(rb(0.5, 0.005, 0.02, 0.001), accMat, 0, 0.158, 0));
  g.add(mesh(rb(0.08, 0.30, 0.37, 0.005), accMat));
  for (const [x, y] of [[-0.23, -0.1], [0.23, -0.1], [-0.23, 0.1], [0.23, 0.1]]) {
    const sc = screw(0.012, 0.006, MAT.gunMetal);
    sc.rotation.z = Math.PI / 2; sc.position.set(x, y, 0.18); g.add(sc);
  }
  for (let i = 0; i < 3; i++) {
    const bl = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), MAT.brass, -0.14 + i*0.14, 0.22, 0);
    bl.rotation.z = Math.PI / 2; g.add(bl);
    const tp = mesh(new THREE.ConeGeometry(0.03, 0.06, 8), MAT.brass, -0.14 + i*0.14 + 0.09, 0.22, 0);
    tp.rotation.z = -Math.PI / 2; g.add(tp);
    const rm = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 8), MAT.steelDark, -0.14 + i*0.14 - 0.063, 0.22, 0);
    rm.rotation.z = Math.PI / 2; g.add(rm);
  }
  return g;
}
