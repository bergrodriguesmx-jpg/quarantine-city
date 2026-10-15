// ============================================================
// gib-glb.js — v3 "SELF-CONTAINED"
// ============================================================
// Exports obrigatórios (importados por game.js):
//   preloadGibGLBs, hasLimb, createLimb, hasCorpse, createCorpse,
//   listCorpseTypes
//
// Estratégia: NÃO tenta baixar GLB nenhum.
// Membros decepados e cadáveres são gerados com geometria
// procedural (Three.js puro). Zero dependência de rede.
// ============================================================

import * as THREE from 'three';

// ════════════════════════════════════════════════════════════
// TAMANHOS-ALVO (metros) — coerentes com zumbi de ~1.8m
// ════════════════════════════════════════════════════════════
const LIMB_SIZES = {
  head: { w: 0.22, h: 0.26, d: 0.22 },
  armL: { w: 0.10, h: 0.60, d: 0.10 },
  armR: { w: 0.10, h: 0.60, d: 0.10 },
  legL: { w: 0.14, h: 0.75, d: 0.14 },
  legR: { w: 0.14, h: 0.75, d: 0.14 },
};

const CORPSE_HEIGHT = 1.8;

// ════════════════════════════════════════════════════════════
// CACHE (evita recriar geometrias)
// ════════════════════════════════════════════════════════════
const _limbGeos = new Map();
const _corpseCache = new Map();

// ════════════════════════════════════════════════════════════
// MATERIAIS COMPARTILHADOS (economia de memória)
// ════════════════════════════════════════════════════════════
const MATS = {
  skin:   new THREE.MeshLambertMaterial({ color: 0x7fc24f, flatShading: true }),
  skinD:  new THREE.MeshLambertMaterial({ color: 0x5a8f3a, flatShading: true }),
  blood:  new THREE.MeshLambertMaterial({ color: 0x8b1a1a, flatShading: true }),
  shirt:  new THREE.MeshLambertMaterial({ color: 0x556b3d, flatShading: true }),
  pants:  new THREE.MeshLambertMaterial({ color: 0x3a3a3a, flatShading: true }),
  eyesW:  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  eyesB:  new THREE.MeshBasicMaterial({ color: 0x000000 }),
};

// ════════════════════════════════════════════════════════════
// CRIAÇÃO PROCEDURAL DE MEMBROS
// ════════════════════════════════════════════════════════════

function _makeHead() {
  const g = new THREE.Group();
  const s = LIMB_SIZES.head;
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(s.w * 0.5, 10, 8),
    MATS.skin
  );
  skull.castShadow = true;
  skull.receiveShadow = true;
  g.add(skull);

  // Olhos
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 6);
  const eL = new THREE.Mesh(eyeGeo, MATS.eyesW); eL.position.set(-0.06, 0.02, 0.10);
  const eR = new THREE.Mesh(eyeGeo, MATS.eyesW); eR.position.set( 0.06, 0.02, 0.10);
  const pL = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), MATS.eyesB); pL.position.set(-0.06, 0.02, 0.12);
  const pR = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), MATS.eyesB); pR.position.set( 0.06, 0.02, 0.12);
  g.add(eL, eR, pL, pR);

  // Boca
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.025, 0.02), MATS.eyesB);
  m.position.set(0, -0.06, 0.11);
  g.add(m);

  // Ferida no topo (cabeça decepada)
  const w = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), MATS.blood);
  w.position.set(0, -0.10, 0);
  w.scale.set(1, 0.5, 1);
  g.add(w);

  g.userData._size = new THREE.Vector3(s.w, s.h, s.d);
  return g;
}

function _makeArm(side) {
  const g = new THREE.Group();
  const s = LIMB_SIZES[side === 'L' ? 'armL' : 'armR'];

  // Bíceps (superior) — cor mais escura
  const bicep = new THREE.Mesh(
    new THREE.CylinderGeometry(s.w * 0.5, s.w * 0.45, s.h * 0.5, 8),
    MATS.skinD
  );
  bicep.position.y = -s.h * 0.25;
  bicep.castShadow = true;
  g.add(bicep);

  // Antebraço — cor mais clara
  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(s.w * 0.45, s.w * 0.40, s.h * 0.5, 8),
    MATS.skin
  );
  forearm.position.y = -s.h * 0.75;
  forearm.castShadow = true;
  g.add(forearm);

  // Mão (esfera achatada)
  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(s.w * 0.55, 6, 4),
    MATS.skin
  );
  hand.position.y = -s.h;
  hand.scale.set(1, 0.7, 0.6);
  hand.castShadow = true;
  g.add(hand);

  // Coto sangrando no topo
  const stump = new THREE.Mesh(
    new THREE.SphereGeometry(s.w * 0.55, 6, 4),
    MATS.blood
  );
  stump.position.y = 0;
  stump.scale.set(1, 0.4, 1);
  g.add(stump);

  g.userData._size = new THREE.Vector3(s.w, s.h, s.d);
  return g;
}

function _makeLeg(side) {
  const g = new THREE.Group();
  const s = LIMB_SIZES[side === 'L' ? 'legL' : 'legR'];

  // Coxa
  const thigh = new THREE.Mesh(
    new THREE.CylinderGeometry(s.w * 0.5, s.w * 0.45, s.h * 0.5, 8),
    MATS.pants
  );
  thigh.position.y = -s.h * 0.25;
  thigh.castShadow = true;
  g.add(thigh);

  // Canela
  const shin = new THREE.Mesh(
    new THREE.CylinderGeometry(s.w * 0.45, s.w * 0.40, s.h * 0.5, 8),
    MATS.pants
  );
  shin.position.y = -s.h * 0.75;
  shin.castShadow = true;
  g.add(shin);

  // Pé
  const foot = new THREE.Mesh(
    new THREE.BoxGeometry(s.w * 0.9, s.w * 0.5, s.w * 1.4),
    MATS.pants
  );
  foot.position.set(0, -s.h, s.w * 0.3);
  foot.castShadow = true;
  g.add(foot);

  // Coto sangrando
  const stump = new THREE.Mesh(
    new THREE.SphereGeometry(s.w * 0.55, 6, 4),
    MATS.blood
  );
  stump.scale.set(1, 0.4, 1);
  g.add(stump);

  g.userData._size = new THREE.Vector3(s.w, s.h, s.d);
  return g;
}

// ════════════════════════════════════════════════════════════
// CRIAÇÃO PROCEDURAL DE CADÁVER
// ════════════════════════════════════════════════════════════
function _makeCorpse(variant) {
  const g = new THREE.Group();

  // Cabeça
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    MATS.skin
  );
  head.position.y = 1.55;
  head.castShadow = true;
  g.add(head);

  // Olhos
  const eyeGeo = new THREE.SphereGeometry(0.03, 6, 4);
  const eL = new THREE.Mesh(eyeGeo, MATS.eyesW); eL.position.set(-0.07, 1.58, 0.16);
  const eR = new THREE.Mesh(eyeGeo, MATS.eyesW); eR.position.set( 0.07, 1.58, 0.16);
  g.add(eL, eR);

  // Torso
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 0.60, 0.30),
    MATS.shirt
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);

  // Braços
  const armGeo = new THREE.CylinderGeometry(0.10, 0.09, 0.65, 6);
  const armL = new THREE.Mesh(armGeo, MATS.skinD);
  armL.position.set(-0.36, 1.10, 0);
  armL.castShadow = true;
  g.add(armL);

  const armR = new THREE.Mesh(armGeo, MATS.skin);
  armR.position.set(0.36, 1.10, 0);
  armR.castShadow = true;
  g.add(armR);

  // Pernas
  const legGeo = new THREE.CylinderGeometry(0.14, 0.13, 0.80, 6);
  const legL = new THREE.Mesh(legGeo, MATS.pants);
  legL.position.set(-0.15, 0.40, 0);
  legL.castShadow = true;
  g.add(legL);

  const legR = new THREE.Mesh(legGeo, MATS.pants);
  legR.position.set(0.15, 0.40, 0);
  legR.castShadow = true;
  g.add(legR);

  g.userData.corpseType = variant || 'worker';
  return g;
}

// ════════════════════════════════════════════════════════════
// API PÚBLICA — LIMB
// ════════════════════════════════════════════════════════════

export function hasLimb(type) {
  return type === 'head' || type === 'armL' || type === 'armR'
      || type === 'legL' || type === 'legR';
}

export function createLimb(type) {
  if (!hasLimb(type)) return null;

  if (!_limbGeos.has(type)) {
    let proto;
    if (type === 'head')      proto = _makeHead();
    else if (type === 'armL') proto = _makeArm('L');
    else if (type === 'armR') proto = _makeArm('R');
    else if (type === 'legL') proto = _makeLeg('L');
    else if (type === 'legR') proto = _makeLeg('R');
    _limbGeos.set(type, proto);
  }

  const clone = _limbGeos.get(type).clone(true);
  clone.userData.size = _limbGeos.get(type).userData._size.clone();
  clone.userData.gibType = type;
  clone.userData.source = 'procedural';
  return clone;
}

// ════════════════════════════════════════════════════════════
// API PÚBLICA — CORPSE
// ════════════════════════════════════════════════════════════

export function hasCorpse(id) {
  return id === 'worker' || id === 'zbguy' || id === 'default';
}

export function createCorpse(id) {
  const variant = hasCorpse(id) ? id : 'default';
  if (!_corpseCache.has(variant)) {
    _corpseCache.set(variant, _makeCorpse(variant));
  }
  const clone = _corpseCache.get(variant).clone(true);
  clone.userData.corpseType = variant;
  return clone;
}

export function listCorpseTypes() {
  return ['worker', 'zbguy', 'default'];
}

// ════════════════════════════════════════════════════════════
// PRELOAD — no-op (tudo é procedural, nada pra carregar)
// ════════════════════════════════════════════════════════════
export async function preloadGibGLBs() {
  console.log('[gib-glb] ✅ modo procedural (zero download, zero 404)');
}
