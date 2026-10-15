// ============================================================
// zombie-dismember.js — v2.0 "Precise cut"
// ============================================================
// NOVO v2.0:
//   • Corte PRECISO no ponto de impacto (não mais por joint inteiro)
//   • Cada limb pode ser cortado em qualquer t (0..1)
//   • Stump spawna no ponto exato do corte
//   • Gib contém só a parte decepada (do corte até a ponta do membro)
//   • renderFigure respeita cortes parciais
//   • VerletRagdoll honra cortes (limb encurtado visualmente)
//   • raySegmentHitFull() exportado — retorna { s, tc }
// ============================================================

import * as THREE from 'three';

export const NJ = 18;

export const LIMBS = [
  ['Head',         0,  0, 0.15],
  ['Chest',        1,  2, 0.17],
  ['Stomach',      2,  3, 0.14],
  ['Hips',         3,  3, 0.15],
  ['LeftBiceps',  14,  4, 0.065],
  ['LeftForearm',  4,  5, 0.055],
  ['LeftHand',     5,  5, 0.06],
  ['RightBiceps', 15,  6, 0.065],
  ['RightForearm', 6,  7, 0.055],
  ['RightHand',    7,  7, 0.06],
  ['LeftThigh',   16,  8, 0.095],
  ['LeftShin',     8,  9, 0.07],
  ['LeftFoot',     9, 12, 0.06],
  ['RightThigh',  17, 10, 0.095],
  ['RightShin',   10, 11, 0.07],
  ['RightFoot',   11, 13, 0.06],
];

// Index no array LIMBS (pra acessar .mesh)
const LIMB_IDX = {};
for (let i = 0; i < LIMBS.length; i++) LIMB_IDX[LIMBS[i][0]] = i;

export const L2G = {
  Head: 'Head',
  LeftBiceps: 'BicepsL', LeftForearm: 'ForearmL', LeftHand: 'ForearmL',
  RightBiceps: 'BicepsR', RightForearm: 'ForearmR', RightHand: 'ForearmR',
  LeftThigh: 'LegL', LeftShin: 'LegL', LeftFoot: 'LegL',
  RightThigh: 'LegR', RightShin: 'LegR', RightFoot: 'LegR',
};

export const GONE = {
  Head:     ['Head'],
  BicepsL:  ['LeftBiceps', 'LeftForearm', 'LeftHand'],
  ForearmL: ['LeftForearm', 'LeftHand'],
  BicepsR:  ['RightBiceps', 'RightForearm', 'RightHand'],
  ForearmR: ['RightForearm', 'RightHand'],
  LegL:     ['LeftThigh', 'LeftShin', 'LeftFoot'],
  LegR:     ['RightThigh', 'RightShin', 'RightFoot'],
};

// Config de corte por grupo:
//   startLimb = primeiro limb do grupo (onde nasce o corte quando corta no lugar errado)
//   endJoint  = joint final (usado pra direção do gib)
//   limbOrder = ordem hierárquica top-down
export const GROUP_CFG = {
  Head:     { startLimb: 'Head',        endJoint: 0,  chain: ['Head'],                                    topJoint: 1 },
  BicepsL:  { startLimb: 'LeftBiceps',  endJoint: 5,  chain: ['LeftBiceps','LeftForearm','LeftHand'],    topJoint: 14 },
  ForearmL: { startLimb: 'LeftForearm', endJoint: 5,  chain: ['LeftForearm','LeftHand'],                 topJoint: 4 },
  BicepsR:  { startLimb: 'RightBiceps', endJoint: 7,  chain: ['RightBiceps','RightForearm','RightHand'], topJoint: 15 },
  ForearmR: { startLimb: 'RightForearm',endJoint: 7,  chain: ['RightForearm','RightHand'],               topJoint: 6 },
  LegL:     { startLimb: 'LeftThigh',   endJoint: 12, chain: ['LeftThigh','LeftShin','LeftFoot'],        topJoint: 16 },
  LegR:     { startLimb: 'RightThigh',  endJoint: 13, chain: ['RightThigh','RightShin','RightFoot'],     topJoint: 17 },
};

// Compatibilidade: STUMP/GIBEND apontam pro joint inicial/final de cada grupo
export const STUMP  = { Head: 1,  BicepsL: 14, BicepsR: 15, ForearmL: 4,  ForearmR: 6,  LegL: 16, LegR: 17 };
export const GIBEND = { Head: 0,  BicepsL: 5,  BicepsR: 7,  ForearmL: 5,  ForearmR: 7,  LegL: 12, LegR: 13 };

export const LINKS = [
  [0, 1], [1, 2], [2, 3],
  [1, 14], [1, 15], [14, 4], [4, 5], [15, 6], [6, 7],
  [3, 16], [3, 17], [16, 8], [8, 9], [9, 12], [17, 10], [10, 11], [11, 13],
  [0, 2], [1, 3],
  [14, 15], [16, 17], [14, 2], [15, 2], [16, 2], [17, 2],
];

// ════════════════════════════════════════════════════════════
// GEOMETRIA COMPARTILHADA
// ════════════════════════════════════════════════════════════
const UP = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();

function lathe(profile, seg = 8) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

export const CAPSULE_GEO = lathe([
  [0, -0.5], [0.30, -0.47], [0.46, -0.40], [0.5, -0.30],
  [0.5, 0.30], [0.46, 0.40], [0.30, 0.47], [0, 0.5],
]);
export const TAPER_GEO = lathe([
  [0, -0.5], [0.30, -0.47], [0.46, -0.40], [0.5, -0.30],
  [0.36, 0.30], [0.33, 0.40], [0.22, 0.47], [0, 0.5],
]);
export const SPHERE_GEO = new THREE.SphereGeometry(0.5, 10, 8);
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

export const SHARED_BOX = BOX_GEO;
export const SHARED_STUMP_GEO = new THREE.SphereGeometry(0.075, 8, 6);

const GEO_BY_LIMB = {
  Head: SPHERE_GEO, Hips: SPHERE_GEO,
  LeftHand: SPHERE_GEO, RightHand: SPHERE_GEO,
  Chest: CAPSULE_GEO, Stomach: CAPSULE_GEO,
  LeftFoot: CAPSULE_GEO, RightFoot: CAPSULE_GEO,
  LeftBiceps: TAPER_GEO, LeftForearm: TAPER_GEO,
  RightBiceps: TAPER_GEO, RightForearm: TAPER_GEO,
  LeftThigh: TAPER_GEO, LeftShin: TAPER_GEO,
  RightThigh: TAPER_GEO, RightShin: TAPER_GEO,
};

const SQUASH = { Chest: 0.70, Stomach: 0.75, Hips: 0.85 };
const LIMB_SQUASH = LIMBS.map(l => SQUASH[l[0]] || 1);

/**
 * placeLimb: posiciona mesh entre dois joints.
 */
export function placeLimb(mesh, a, b, radius, isSameJoint, squash = 1) {
  if (isSameJoint) {
    mesh.position.copy(a);
    mesh.scale.set(radius * 2, radius * 2, radius * 2 * squash);
    mesh.quaternion.identity();
  } else {
    _tmp.subVectors(b, a);
    const dist = _tmp.length();
    const len = dist + radius * 1.1;
    mesh.position.copy(a).addScaledVector(_tmp, 0.5);
    mesh.scale.set(radius * 2, len, radius * 2 * squash);
    mesh.quaternion.setFromUnitVectors(UP, _tmp.divideScalar(dist || 1));
  }
}

// ════════════════════════════════════════════════════════════
// CONSTRUÇÃO DO MODELO
// ════════════════════════════════════════════════════════════
const SHIRTS = [0x5b6b7a, 0x7a5b4a, 0x4d6b4a, 0x8a8a7a, 0x6b4a5b, 0x3f4f6b, 0x9a8f6a, 0x7a2f2f, 0x2f2f33];
const PANTS  = [0x2f3a4f, 0x3a3a32, 0x4a3f33, 0x2a2a2a, 0x40506a, 0x55503a];
const SHOES  = [0x2a2a2a, 0x3a2a1f, 0x555555];
const HAIRS  = [0x1a1410, 0x3a2a1a, 0x6a5a3a, 0x8a8a8a, 0x2a1a10];

const _matCache = new Map();
function lambert(hex) {
  let m = _matCache.get(hex);
  if (!m) { m = new THREE.MeshLambertMaterial({ color: hex }); _matCache.set(hex, m); }
  return m;
}
const EYE_MAT   = new THREE.MeshBasicMaterial({ color: 0xf8ea5a });
const MOUTH_MAT = new THREE.MeshBasicMaterial({ color: 0x1a0505 });

const _pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function buildZombieModel(skinColor = 0x8ec253, typeKey = 'pt') {
  const shade = (((Math.random() * 5) | 0) - 2) * 0.03;
  const skin  = lambert(new THREE.Color(skinColor).offsetHSL(0, 0.05, shade).getHex());
  const shirt = lambert(_pick(SHIRTS));
  const pants = lambert(_pick(PANTS));
  const shoe  = Math.random() < 0.25 ? skin : lambert(_pick(SHOES));
  const sleeveless = Math.random() < 0.35;
  const shorts     = Math.random() < 0.20;
  const hairMat    = Math.random() < 0.60 ? lambert(_pick(HAIRS)) : null;

  const g = new THREE.Group();
  const limbs = LIMBS.map(l => {
    const id = l[0];
    let mat;
    if (/Head|Hand|Forearm/.test(id))       mat = skin;
    else if (/Foot/.test(id))               mat = shoe;
    else if (/Biceps/.test(id))             mat = sleeveless ? skin : shirt;
    else if (/Shin/.test(id))               mat = shorts ? skin : pants;
    else if (/Thigh|Hips/.test(id))         mat = pants;
    else                                    mat = shirt;
    const m = new THREE.Mesh(GEO_BY_LIMB[id], mat);
    m.castShadow = true;
    g.add(m);
    return m;
  });

  // Rosto (filhos da cabeça, espaço unitário de raio 0.5)
  const head = limbs[0];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(SPHERE_GEO, EYE_MAT);
    eye.scale.setScalar(0.18);
    eye.position.set(sx * 0.18, 0.11, 0.44);
    head.add(eye);
  }
  const mouth = new THREE.Mesh(BOX_GEO, MOUTH_MAT);
  mouth.scale.set(0.36, 0.08, 0.12);
  mouth.position.set(0, -0.22, 0.44);
  head.add(mouth);
  if (hairMat) {
    const hair = new THREE.Mesh(SPHERE_GEO, hairMat);
    hair.scale.set(1.06, 0.44, 1.06);
    hair.position.set(0, 0.28, -0.04);
    head.add(hair);
  }

  const neck = new THREE.Mesh(CAPSULE_GEO, skin);
  neck.castShadow = true;
  g.add(neck);

  g.userData = { limbs, neck, gone: {}, gore: new Set(), skinColor, typeKey, cuts: {} };
  return g;
}

// ════════════════════════════════════════════════════════════
// RAY-SEGMENT (retorna t do raio E tc do segmento)
// ════════════════════════════════════════════════════════════
const _rsp = new THREE.Vector3(), _rsq = new THREE.Vector3();

/**
 * Retorna { s, tc } ou null.
 *   s  = distância do raio
 *   tc = posição 0..1 ao longo do segmento (a→b)
 */
export function raySegmentHitFull(ro, rd, a, b, radius, minT = 0.1, maxT = Infinity) {
  const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z;
  const wx = ro.x - a.x, wy = ro.y - a.y, wz = ro.z - a.z;
  const ux = rd.x, uy = rd.y, uz = rd.z;

  const d2 = ux * vx + uy * vy + uz * vz;
  const d3 = vx * vx + vy * vy + vz * vz;
  const d4 = ux * wx + uy * wy + uz * wz;
  const d5 = vx * wx + vy * wy + vz * wz;

  const denom = d3 - d2 * d2;
  let sc, tc;
  if (denom > 1e-6) {
    sc = (d2 * d5 - d3 * d4) / denom;
    tc = (d5 - d2 * d4) / denom;
  } else {
    sc = 0;
    tc = d5 / d3;
  }

  if (sc < 0) { sc = 0; tc = d5 / d3; }
  if (tc < 0) { tc = 0; sc = -d4; }
  else if (tc > 1) { tc = 1; sc = d2 - d4; }

  if (sc < minT || sc > maxT) return null;

  const px = ro.x + ux * sc, py = ro.y + uy * sc, pz = ro.z + uz * sc;
  const qx = a.x + vx * tc, qy = a.y + vy * tc, qz = a.z + vz * tc;
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  if (dx*dx + dy*dy + dz*dz > radius * radius) return null;
  return { s: sc, tc };
}

// ════════════════════════════════════════════════════════════
// POSE (IK 2 ossos) — LOCAL por padrão, WORLD se worldSpace=true
// ════════════════════════════════════════════════════════════
const _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _t = new THREE.Vector3(), _pole = new THREE.Vector3();

function ik2(root, target, l1, l2, pole, midOut, endOut) {
  _u.subVectors(target, root);
  const d = _u.length() || 1e-4;
  _u.multiplyScalar(1 / d);
  const dc = Math.min(l1 + l2 - 0.002, Math.max(Math.abs(l1 - l2) + 0.002, d));
  _w.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_w.lengthSq() < 1e-6) _w.set(0, 0, 1);
  _w.normalize();
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  midOut.copy(root).addScaledVector(_u, a).addScaledVector(_w, h);
  endOut.copy(root).addScaledVector(_u, dc);
}

function armIK(L, side, aware, atk, lean, swing, raise, dying) {
  const S = L[side < 0 ? 14 : 15];
  const elbow = L[side < 0 ? 4 : 6];
  const wrist = L[side < 0 ? 5 : 7];
  if (aware) {
    _t.set(side * 0.20,
           1.20 + raise + atk * 0.18 + (dying ? 0.32 : 0),
           0.52 + lean * 0.5 + atk * 0.24 + swing * 0.05);
    _pole.set(side * 0.6, -1, 0);
  } else {
    _t.set(side * 0.26, 0.90, 0.07 + swing * 0.15 + lean * 0.4);
    _pole.set(side * 0.4, -0.3, -1);
  }
  ik2(S, _t, 0.31, 0.29, _pole, elbow, wrist);
}

function legIK(L, hip, knee, ankle, toe, phase, amp, drag) {
  const H = L[hip];
  const stride = 0.28 * amp * (1 - 0.5 * drag);
  const lift   = Math.max(0, Math.cos(phase)) * 0.14 * amp * (1 - 0.7 * drag);
  _t.set(H.x, 0.08 + lift, Math.sin(phase) * stride + 0.02);
  _pole.set(0, 0, 1);
  ik2(H, _t, 0.46, 0.44, _pole, L[knee], L[ankle]);
  L[toe].set(L[ankle].x,
             Math.max(0.045, L[ankle].y - 0.025 + lift * 0.4),
             L[ankle].z + 0.19);
}

export function computePose(z, out, worldSpace = false) {
  const L = out || [];
  for (let i = 0; i < NJ; i++) if (!L[i]) L[i] = new THREE.Vector3();

  const dying  = z.state === 'Dying';
  const moving = Math.abs(z.v) > 0.3;
  const aware  = z.state !== 'Unaware';
  const amp    = dying ? 0.2 : (moving ? 1 : 0.1);
  const ws     = z.walkStyle ?? 0.5;
  const ph     = z.ph || 0;
  const atk    = z.state === 'Attack'
    ? Math.sin(Math.max(0, Math.min(1, z.tmr / 0.7)) * Math.PI) : 0;

  const lean  = dying ? -0.35 : (aware ? 0.20 : 0.11) + (z.state === 'Stagger' ? -0.20 : 0);
  const sn    = Math.sin(ph);
  const dip   = moving ? -Math.abs(sn) * 0.035 : 0;
  const sway  = sn * 0.03 * amp;
  const twist = sn * 0.05 * amp;
  const tilt  = (ws - 0.5) * 0.14;

  L[3].set(sway,        0.92 + dip, 0);
  L[2].set(sway * 0.5,  1.18 + dip, lean * 0.30);
  L[1].set(0,           1.42 + dip, lean * 0.62);
  L[0].set(tilt,        1.60 + dip, lean + 0.09 + atk * 0.14);
  L[14].set(-0.21,        1.40 + dip, lean * 0.55 + twist);
  L[15].set( 0.21,        1.40 + dip, lean * 0.55 - twist);
  L[16].set(-0.11 + sway, 0.90 + dip, 0);
  L[17].set( 0.11 + sway, 0.90 + dip, 0);

  const raise = (ws - 0.5) * 0.25;
  armIK(L, -1, aware, atk, lean,  sn * amp,  raise, dying);
  armIK(L,  1, aware, atk, lean, -sn * amp, -raise, dying);

  const dragL = ws > 0.7 ? (ws - 0.7) / 0.3 : 0;
  const dragR = ws < 0.3 ? (0.3 - ws) / 0.3 : 0;
  legIK(L, 16, 8,  9,  12, ph,           amp, dragL);
  legIK(L, 17, 10, 11, 13, ph + Math.PI, amp, dragR);

  if (worldSpace) {
    const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
    for (let i = 0; i < NJ; i++) {
      const x = L[i].x, zl = L[i].z;
      L[i].x = z.p.x + x * fz + zl * fx;
      L[i].z = z.p.z - x * fx + zl * fz;
    }
  }
  return L;
}

export function localToWorldPose(z, local, out) {
  const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
  for (let i = 0; i < NJ; i++) {
    if (!out[i]) out[i] = new THREE.Vector3();
    const l = local[i];
    out[i].set(z.p.x + l.x * fz + l.z * fx, l.y, z.p.z - l.x * fx + l.z * fz);
  }
  return out;
}

/**
 * renderFigure: respeita cortes parciais.
 * gone[limbId] pode ser:
 *   true                          → limb totalmente removido
 *   { cutT: number }              → limb encurtado: desenha de jointA até lerp(a,b,cutT)
 */
export function renderFigure(ps, limbs, neck, gone) {
  for (let i = 0; i < LIMBS.length; i++) {
    const l = LIMBS[i];
    const state = gone[l[0]];

    if (state === true) {
      if (limbs[i].visible) limbs[i].visible = false;
      continue;
    }

    if (state && typeof state === 'object' && state.cutT !== undefined) {
      // Limb parcialmente cortado — desenha só o pedaço antes do corte
      const a = ps[l[1]];
      const b = ps[l[2]];
      const cut = _tmp.copy(a).lerp(b, state.cutT).clone();
      if (!limbs[i].visible) limbs[i].visible = true;
      placeLimb(limbs[i], a, cut, l[3], l[1] === l[2], LIMB_SQUASH[i]);
      continue;
    }

    if (!limbs[i].visible) limbs[i].visible = true;
    placeLimb(limbs[i], ps[l[1]], ps[l[2]], l[3], l[1] === l[2], LIMB_SQUASH[i]);
  }

  if (neck) {
    const visible = !gone.Head || (typeof gone.Head === 'object' && gone.Head.cutT > 0.5);
    if (neck.visible !== visible) neck.visible = visible;
    if (visible) placeLimb(neck, ps[0], ps[1], 0.055, false);
  }
}

// ════════════════════════════════════════════════════════════
// VERLET RAGDOLL v2.0
// ════════════════════════════════════════════════════════════
export class VerletRagdoll {
  constructor(zombie, hitDir, scene, world) {
    this.scene = scene;
    this.world = world;
    this.life = 25;
    this.asleep = false;
    this._calm = 0;
    this._clonedMats = [];
    this._limbs = [];
    this._stumps = [];
    this._neckClone = null;

    // Pose em WORLD coords
    this.P = computePose(zombie, null, true).map(v => v.clone());

    const vel = hitDir.clone().setY(0);
    if (vel.lengthSq() < 0.001) vel.set(1, 0, 0);
    vel.normalize().multiplyScalar(4 + Math.random() * 4);
    vel.y = 2 + Math.random() * 3;

    this.O = this.P.map(p => p.clone().addScaledVector(vel, -1 / 60).add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        Math.random() * 0.03,
        (Math.random() - 0.5) * 0.02
      )
    ));

    this.K = LINKS.map(([i, j]) => [i, j, this.P[i].distanceTo(this.P[j])]);

    // Marca joints mortos (limbs totalmente removidos)
    this.dead = new Set();
    for (const l of LIMBS) {
      if (zombie.gone[l[0]] === true) this.dead.add(l[2]);
    }

    if (zombie.g && zombie.g.parent) zombie.g.parent.remove(zombie.g);

    // Clona limbs sobreviventes (respeitando cuts parciais)
    for (let i = 0; i < LIMBS.length; i++) {
      const l = LIMBS[i];
      const state = zombie.gone[l[0]];
      if (state === true) continue;

      const old = zombie.limbs[i];
      const matClone = old.material.clone();
      const clone = new THREE.Mesh(old.geometry, matClone);
      clone.castShadow = true;
      this._clonedMats.push(matClone);

      // Clona filhos (rosto)
      for (const c of old.children) {
        const cm = c.material.clone();
        this._clonedMats.push(cm);
        const cc = new THREE.Mesh(c.geometry, cm);
        cc.position.copy(c.position);
        cc.scale.copy(c.scale);
        clone.add(cc);
      }

      scene.add(clone);
      this._limbs.push({
        mesh: clone, idxA: l[1], idxB: l[2], radius: l[3],
        isSame: l[1] === l[2], squash: LIMB_SQUASH[i],
        cutT: (state && typeof state === 'object' && state.cutT !== undefined)
              ? state.cutT : 1,
      });
    }

    if (zombie.neck && zombie.gone.Head !== true) {
      const neckMat = zombie.neck.material.clone();
      this._neckClone = new THREE.Mesh(zombie.neck.geometry, neckMat);
      this._neckClone.castShadow = true;
      scene.add(this._neckClone);
      this._clonedMats.push(neckMat);
    }

    // Stumps — posicionados no ponto EXATO do corte (se houver cutT)
    const stumpMat = new THREE.MeshLambertMaterial({ color: 0x8b1a1a });
    this._clonedMats.push(stumpMat);
    for (const g of zombie.gore) {
      const cfg = GROUP_CFG[g];
      if (!cfg) continue;
      const startLimb = LIMBS[LIMB_IDX[cfg.startLimb]];
      if (!startLimb) continue;

      const cutInfo = zombie.gone[cfg.startLimb];
      const cutT = (cutInfo && typeof cutInfo === 'object' && cutInfo.cutT !== undefined)
                   ? cutInfo.cutT : 0;
      const cutPos = this.P[startLimb[1]].clone().lerp(this.P[startLimb[2]], cutT);

      const s = new THREE.Mesh(SHARED_STUMP_GEO, stumpMat);
      s.position.copy(cutPos);
      scene.add(s);
      this._stumps.push({ mesh: s, jointA: startLimb[1], jointB: startLimb[2], cutT });
    }

    this.fnt = [];
    for (const g of zombie.gore) this.fnt.push({ pt: STUMP[g], t: 1.6 });

    this._render();
  }

  _render() {
    for (const l of this._limbs) {
      const a = this.P[l.idxA];
      const b = this.P[l.idxB];
      if (l.cutT < 1) {
        const cut = _tmp.copy(a).lerp(b, l.cutT).clone();
        placeLimb(l.mesh, a, cut, l.radius, l.isSame, l.squash);
      } else {
        placeLimb(l.mesh, a, b, l.radius, l.isSame, l.squash);
      }
    }
    if (this._neckClone) placeLimb(this._neckClone, this.P[0], this.P[1], 0.055, false);
    for (const s of this._stumps) {
      const cut = _tmp.copy(this.P[s.jointA]).lerp(this.P[s.jointB], s.cutT).clone();
      s.mesh.position.copy(cut);
    }
  }

  update(dt, bloodEmitter) {
    if (this.life <= 0) return true;
    this.life -= dt;

    if (!this.asleep) {
      const sub = Math.min(3, Math.ceil(dt / 0.016));
      const step = dt / sub;
      for (let s = 0; s < sub; s++) this._substep(step);

      let m = 0;
      for (let i = 0; i < NJ; i++) {
        const p = this.P[i], o = this.O[i];
        const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
        m += dx * dx + dy * dy + dz * dz;
      }
      this._calm = m < 1e-6 ? this._calm + dt : 0;
      if (this._calm > 0.6) this.asleep = true;

      this._render();

      if (bloodEmitter) {
        for (const f of this.fnt) {
          if ((f.t -= dt) > 0 && Math.random() < 0.4) bloodEmitter(this.P[f.pt], true);
        }
      }
    }

    if (this.life < 2) {
      const op = Math.max(0, this.life / 2);
      for (const m of this._clonedMats) { m.transparent = true; m.opacity = op; }
    }
    return this.life <= 0;
  }

  _substep(dt) {
    const P = this.P, O = this.O;
    const walls = this.world && this.world.wallColliders;

    for (let i = 0; i < P.length; i++) {
      const p = P[i], o = O[i];
      const vx = (p.x - o.x) * 0.995;
      const vy = (p.y - o.y) * 0.995;
      const vz = (p.z - o.z) * 0.995;
      o.copy(p);
      p.x += vx;
      p.y += vy - 14 * dt * dt;
      p.z += vz;

      if (p.y < 0) { p.y = 0; o.y = 0; o.x = p.x - vx * 0.6; o.z = p.z - vz * 0.6; }

      if (walls) {
        for (let wi = 0; wi < walls.length; wi++) {
          const box = walls[wi];
          if (p.x > box.minX && p.x < box.maxX &&
              p.z > box.minZ && p.z < box.maxZ && p.y < 4) {
            const dL = p.x - box.minX, dR = box.maxX - p.x;
            const dU = p.z - box.minZ, dD = box.maxZ - p.z;
            const minD = Math.min(dL, dR, dU, dD);
            if (minD === dL)      { p.x = box.minX - 0.05; o.x = p.x; }
            else if (minD === dR) { p.x = box.maxX + 0.05; o.x = p.x; }
            else if (minD === dU) { p.z = box.minZ - 0.05; o.z = p.z; }
            else                  { p.z = box.maxZ + 0.05; o.z = p.z; }
          }
        }
      }
    }

    for (let it = 0; it < 5; it++) {
      for (let k = 0; k < this.K.length; k++) {
        const [i, j, len] = this.K[k];
        if (this.dead.has(i) || this.dead.has(j)) continue;
        const a = P[i], b = P[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const df = ((l - len) / l) * 0.5;
        a.x += dx * df; a.y += dy * df; a.z += dz * df;
        b.x -= dx * df; b.y -= dy * df; b.z -= dz * df;
      }
    }
  }

  dispose() {
    for (const l of this._limbs) this.scene.remove(l.mesh);
    if (this._neckClone) this.scene.remove(this._neckClone);
    for (const s of this._stumps) this.scene.remove(s.mesh);
    for (const m of this._clonedMats) m.dispose();
    this._clonedMats = [];
    this._limbs = [];
    this._stumps = [];
    this._neckClone = null;
  }
}

// ════════════════════════════════════════════════════════════
// LIMB GIB
// ════════════════════════════════════════════════════════════
export class LimbGib {
  constructor(mesh, initialPos, hitDir, length) {
    this.mesh = mesh;
    mesh.position.copy(initialPos);
    this.vel = new THREE.Vector3(
      hitDir.x * (1 + Math.random() * 4) + (Math.random() - 0.5) * 4,
      2 + Math.random() * 4,
      hitDir.z * (1 + Math.random() * 4) + (Math.random() - 0.5) * 4
    );
    this.angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 16
    );
    this.life = 12;
    this.groundY = 0.1;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return true;
    this.vel.y -= 14 * dt;
    this.mesh.position.addScaledVector(this.vel, dt);
    this.mesh.rotation.x += this.angVel.x * dt;
    this.mesh.rotation.y += this.angVel.y * dt;
    this.mesh.rotation.z += this.angVel.z * dt;
    if (this.mesh.position.y < this.groundY) {
      this.mesh.position.y = this.groundY;
      this.vel.set(this.vel.x * 0.6, 0, this.vel.z * 0.6);
      this.angVel.multiplyScalar(0.6);
    }
    return false;
  }
  dispose(scene) {
    scene.remove(this.mesh);
  }
}

// ════════════════════════════════════════════════════════════
// tryDismember — retorna boolean + escreve em out
// ════════════════════════════════════════════════════════════
/**
 * out = {
 *   group: 'BicepsL' | 'ForearmL' | 'Head' | 'LegL' | ...
 *   cutT:  number (0..1) — posição do corte ao longo do PRIMEIRO limb do grupo
 * }
 */
export function tryDismember(zombie, limbId, isExplosion, out, tAlongLimb) {
  if (zombie.state === 'Dying') return false;
  const ratio = zombie.top / zombie.max;
  let shouldCut = false;

  if (isExplosion) {
    shouldCut = Math.random() < 0.5;
  } else if (ratio >= 0.25) {
    const chance = Math.min(1, (ratio - 0.25) / 0.5) * 0.9;
    shouldCut = Math.random() < chance;
  }

  if (!shouldCut) return false;

  const group = L2G[limbId];
  if (!group) return false;

  const cfg = GROUP_CFG[group];
  if (!cfg) return false;

  // Se o limb ferido é o PRIMEIRO da cadeia (ex: LeftBiceps em BicepsL),
  // o corte é precisamente onde o impacto bateu.
  // Se for um limb mais abaixo (ex: LeftForearm em BicepsL), o corte
  // vai pra base do limb atingido (startLimb = LeftForearm).
  let cutT;
  if (limbId === cfg.startLimb) {
    cutT = (tAlongLimb !== undefined && tAlongLimb !== null)
           ? Math.max(0.05, Math.min(0.95, tAlongLimb))
           : 0.4 + Math.random() * 0.3;
  } else {
    cutT = 0.05;   // corte na base do limb atingido
  }

  if (out) {
    out.group = group;
    out.cutT = cutT;
    out.startLimb = cfg.startLimb;
  }
  return true;
}
