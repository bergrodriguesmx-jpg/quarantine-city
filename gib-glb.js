// ============================================================
// gib-glb.js — v3 "SELF-CONTAINED"
// Todos os exports que o game.js importa. Zero downloads.
// Membros e cadáveres são gerados proceduralmente.
// ============================================================

import * as THREE from 'three';

// ─── Materiais compartilhados ───
const MATS = {
  skin:   new THREE.MeshLambertMaterial({ color: 0x7fc24f, flatShading: true }),
  skinD:  new THREE.MeshLambertMaterial({ color: 0x5a8f3a, flatShading: true }),
  blood:  new THREE.MeshLambertMaterial({ color: 0x8b1a1a, flatShading: true }),
  shirt:  new THREE.MeshLambertMaterial({ color: 0x556b3d, flatShading: true }),
  pants:  new THREE.MeshLambertMaterial({ color: 0x3a3a3a, flatShading: true }),
  eyesW:  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  eyesB:  new THREE.MeshBasicMaterial({ color: 0x000000 }),
};

// ─── Cache de protótipos ───
const _protoCache = new Map();

// ─── Construtores procedurais ───
function _makeHead() {
  const g = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 8), MATS.skin);
  skull.castShadow = true;
  g.add(skull);

  const eyeGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const eL = new THREE.Mesh(eyeGeo, MATS.eyesW); eL.position.set(-0.07, 0.05, 0.16);
  const eR = new THREE.Mesh(eyeGeo, MATS.eyesW); eR.position.set( 0.07, 0.05, 0.16);
  const pL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), MATS.eyesB); pL.position.set(-0.07, 0.05, 0.19);
  const pR = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), MATS.eyesB); pR.position.set( 0.07, 0.05, 0.19);
  const m  = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.03), MATS.eyesB);
  m.position.set(0, -0.07, 0.18);
  g.add(eL, eR, pL, pR, m);

  // Coto sangrando embaixo
  const stump = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), MATS.blood);
  stump.position.y = -0.14;
  stump.scale.set(1, 0.5, 1);
  g.add(stump);

  g.userData._size = new THREE.Vector3(0.22, 0.26, 0.22);
  return g;
}

function _makeArm(sideDark) {
  const g = new THREE.Group();

  const bicep = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.09, 0.30, 8),
    sideDark ? MATS.skinD : MATS.skin
  );
  bicep.position.y = -0.15;
  bicep.castShadow = true;
  g.add(bicep);

  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.085, 0.30, 8),
    sideDark ? MATS.skin : MATS.skinD
  );
  forearm.position.y = -0.45;
  forearm.castShadow = true;
  g.add(forearm);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 4), MATS.skin);
  hand.position.y = -0.65;
  hand.scale.set(1, 0.8, 0.7);
  g.add(hand);

  const stump = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), MATS.blood);
  stump.scale.set(1, 0.5, 1);
  g.add(stump);

  g.userData._size = new THREE.Vector3(0.20, 0.70, 0.20);
  return g;
}

function _makeLeg() {
  const g = new THREE.Group();

  const thigh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.105, 0.38, 8),
    MATS.pants
  );
  thigh.position.y = -0.19;
  thigh.castShadow = true;
  g.add(thigh);

  const shin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.095, 0.38, 8),
    MATS.pants
  );
  shin.position.y = -0.57;
  shin.castShadow = true;
  g.add(shin);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.26), MATS.pants);
  foot.position.set(0, -0.78, 0.06);
  g.add(foot);

  const stump = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), MATS.blood);
  stump.scale.set(1, 0.5, 1);
  g.add(stump);

  g.userData._size = new THREE.Vector3(0.22, 0.85, 0.22);
  return g;
}

function _makeCorpse() {
  const g = new THREE.Group();

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 8), MATS.skin);
  head.position.y = 1.60;
  head.castShadow = true;
  g.add(head);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.60, 0.30), MATS.shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);

  const armGeo = new THREE.CylinderGeometry(0.10, 0.09, 0.65, 6);
  const armL = new THREE.Mesh(armGeo, MATS.skinD);
  armL.position.set(-0.36, 1.05, 0);
  armL.castShadow = true;
  g.add(armL);

  const armR = new THREE.Mesh(armGeo, MATS.skin);
  armR.position.set(0.36, 1.05, 0);
  armR.castShadow = true;
  g.add(armR);

  const legGeo = new THREE.CylinderGeometry(0.14, 0.13, 0.85, 6);
  const legL = new THREE.Mesh(legGeo, MATS.pants);
  legL.position.set(-0.15, 0.42, 0);
  legL.castShadow = true;
  g.add(legL);

  const legR = new THREE.Mesh(legGeo, MATS.pants);
  legR.position.set(0.15, 0.42, 0);
  legR.castShadow = true;
  g.add(legR);

  g.userData._size = new THREE.Vector3(0.7, 1.8, 0.5);
  return g;
}

// ─── API ───
export async function preloadGibGLBs() {
  console.log('[gib-glb] ✅ procedural (zero download)');
}

export function hasLimb(type) {
  return type === 'head' || type === 'armL' || type === 'armR'
      || type === 'legL' || type === 'legR';
}

export function createLimb(type) {
  if (!hasLimb(type)) return null;
  if (!_protoCache.has(type)) {
    let proto;
    if (type === 'head')      proto = _makeHead();
    else if (type === 'armL') proto = _makeArm(true);
    else if (type === 'armR') proto = _makeArm(false);
    else                      proto = _makeLeg();
    _protoCache.set(type, proto);
  }
  const clone = _protoCache.get(type).clone(true);
  clone.userData.size = _protoCache.get(type).userData._size.clone();
  clone.userData.gibType = type;
  return clone;
}

export function hasCorpse() { return true; }

export function createCorpse() {
  const clone = _makeCorpse();
  clone.userData.corpseType = 'procedural';
  return clone;
}

export function listCorpseTypes() { return ['procedural']; }
