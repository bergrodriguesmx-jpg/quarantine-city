// ============================================================
// zombie-dismember.js — v1.2 "New zombie model"
// ============================================================
// NOVO v1.2:
//   • Esqueleto com 18 joints (ombros e quadris próprios, cotovelo e
//     pulso separados)
//   • Animação com IK de 2 ossos: braços e pernas NÃO esticam, joelhos
//     dobram para a frente, cotovelos para baixo/trás
//   • Corcunda, cabeça tombada, assimetria por z.walkStyle (perna
//     arrastando, um braço mais alto), balanço de quadril, passo
//   • Geometria arredondada/afunilada (lathe) com extremidades
//     sobrepostas, sem quinas nas dobras
//   • Roupa por região (camisa, calça, sapato, pele), variação por
//     zumbi (sem manga, bermuda, descalço, cabelo), rosto com olhos
//     brilhantes e boca
//   • Ragdoll clona a geometria de cada limb (inclusive rosto),
//     dorme quando para (economiza CPU)
//   • computePose/NJ/localToWorldPose exportados para raycast e gibs
//
// JOINTS (NJ = 18):
//   0 cabeça      1 base do pescoço   2 barriga     3 quadril
//   4 cotovelo E  5 pulso E           6 cotovelo D  7 pulso D
//   8 joelho E    9 tornozelo E      10 joelho D   11 tornozelo D
//  12 ponta pé E 13 ponta pé D       14 ombro E    15 ombro D
//  16 quadril E  17 quadril D
// ============================================================

import * as THREE from 'three';

export const NJ = 18;

// [LimbID, jointA, jointB, raio]
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

// Joint onde nasce o coto / joint onde termina o membro arrancado
export const STUMP  = { Head: 1, BicepsL: 14, BicepsR: 15, ForearmL: 4, ForearmR: 6, LegL: 16, LegR: 17 };
export const GIBEND = { Head: 0, BicepsL: 5,  ForearmL: 5,  BicepsR: 7, ForearmR: 7, LegL: 9,  LegR: 11 };

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

// Cápsula unitária (altura 1, raio 0.5), pontas arredondadas
export const CAPSULE_GEO = lathe([
  [0, -0.5], [0.30, -0.47], [0.46, -0.40], [0.5, -0.30],
  [0.5, 0.30], [0.46, 0.40], [0.30, 0.47], [0, 0.5],
]);
// Afunilada: larga no início (jointA), estreita no fim (jointB)
export const TAPER_GEO = lathe([
  [0, -0.5], [0.30, -0.47], [0.46, -0.40], [0.5, -0.30],
  [0.36, 0.30], [0.33, 0.40], [0.22, 0.47], [0, 0.5],
]);
export const SPHERE_GEO = new THREE.SphereGeometry(0.5, 10, 8);
const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);

// Mantidos por compatibilidade com o game.js
export const SHARED_BOX = BOX_GEO;
export const SHARED_STUMP_GEO = new THREE.SphereGeometry(0.07, 6, 4);

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

// Achatamento em profundidade (torso mais largo que fundo)
const SQUASH = { Chest: 0.70, Stomach: 0.75, Hips: 0.85 };
const LIMB_SQUASH = LIMBS.map(l => SQUASH[l[0]] || 1);

/**
 * placeLimb: coloca a mesh entre dois joints.
 * Extremidades se sobrepõem em radius*0.6 para esconder as juntas.
 */
export function placeLimb(mesh, a, b, radius, isSameJoint, squash = 1) {
  if (isSameJoint) {
    mesh.position.copy(a);
    mesh.scale.set(radius * 2, radius * 2, radius * 2 * squash);
    mesh.quaternion.identity();
  } else {
    _tmp.subVectors(b, a);
    const dist = _tmp.length();
    const len = dist + radius * 1.2;
    mesh.position.copy(a).addScaledVector(_tmp, 0.5);
    mesh.scale.set(radius * 2, len, radius * 2 * squash);
    mesh.quaternion.setFromUnitVectors(UP, _tmp.divideScalar(dist || 1));
  }
}

// ════════════════════════════════════════════════════════════
// CONSTRUÇÃO DO MODELO (substitui createZombieMesh do game.js)
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
const EYE_MAT   = new THREE.MeshBasicMaterial({ color: 0xf2e85a });
const MOUTH_MAT = new THREE.MeshBasicMaterial({ color: 0x1a0505 });

const _pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function buildZombieModel(skinColor = 0x86bd55, typeKey = 'pt') {
  const shade = (((Math.random() * 5) | 0) - 2) * 0.03;
  const skin  = lambert(new THREE.Color(skinColor).offsetHSL(0, 0, shade).getHex());
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
    else                                    mat = shirt; // Chest, Stomach
    const m = new THREE.Mesh(GEO_BY_LIMB[id], mat);
    m.castShadow = true;
    g.add(m);
    return m;
  });

  // ── Rosto (filhos da cabeça, em espaço unitário de raio 0.5) ──
  const head = limbs[0];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(SPHERE_GEO, EYE_MAT);
    eye.scale.setScalar(0.17);
    eye.position.set(sx * 0.17, 0.10, 0.43);
    head.add(eye);
  }
  const mouth = new THREE.Mesh(BOX_GEO, MOUTH_MAT);
  mouth.scale.set(0.34, 0.07, 0.10);
  mouth.position.set(0, -0.20, 0.44);
  head.add(mouth);
  if (hairMat) {
    const hair = new THREE.Mesh(SPHERE_GEO, hairMat);
    hair.scale.set(1.06, 0.42, 1.06);
    hair.position.set(0, 0.27, -0.04);
    head.add(hair);
  }

  const neck = new THREE.Mesh(CAPSULE_GEO, skin);
  neck.castShadow = true;
  g.add(neck);

  g.userData = { limbs, neck, gone: {}, gore: new Set(), skinColor, typeKey };
  return g;
}

// ════════════════════════════════════════════════════════════
// POSE (IK de 2 ossos)
// ════════════════════════════════════════════════════════════
const _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _t = new THREE.Vector3(), _pole = new THREE.Vector3();

/** Resolve root→mid→end com ossos l1, l2. end é limitado ao alcance. */
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
    _t.set(side * 0.19,
           1.16 + raise + atk * 0.16 + (dying ? 0.3 : 0),
           0.50 + lean * 0.5 + atk * 0.22 + swing * 0.04);
    _pole.set(side * 0.6, -1, 0);
  } else {
    _t.set(side * 0.25, 0.88, 0.06 + swing * 0.14 + lean * 0.4);
    _pole.set(side * 0.4, -0.3, -1);
  }
  ik2(S, _t, 0.30, 0.28, _pole, elbow, wrist);
}

function legIK(L, hip, knee, ankle, toe, phase, amp, drag) {
  const H = L[hip];
  const stride = 0.26 * amp * (1 - 0.5 * drag);
  const lift   = Math.max(0, Math.cos(phase)) * 0.13 * amp * (1 - 0.7 * drag);
  _t.set(H.x, 0.08 + lift, Math.sin(phase) * stride + 0.02);
  _pole.set(0, 0, 1); // joelho dobra para a frente
  ik2(H, _t, 0.45, 0.43, _pole, L[knee], L[ankle]);
  L[toe].set(L[ankle].x,
             Math.max(0.045, L[ankle].y - 0.025 + lift * 0.4),
             L[ankle].z + 0.17);
}

/**
 * computePose: retorna NJ joints.
 *   worldSpace=false → LOCAL (filhos de z.g)
 *   worldSpace=true  → MUNDO (ragdoll)
 * Passe `out` próprio por zumbi (não compartilhe o array entre zumbis!)
 */
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

  // Coluna (corcunda: cabeça bem à frente dos ombros)
  L[3].set(sway,        0.92 + dip, 0);
  L[2].set(sway * 0.5,  1.18 + dip, lean * 0.30);
  L[1].set(0,           1.42 + dip, lean * 0.62);
  L[0].set(tilt,        1.60 + dip, lean + 0.09 + atk * 0.14);
  // Ombros e quadris
  L[14].set(-0.21,        1.40 + dip, lean * 0.55 + twist);
  L[15].set( 0.21,        1.40 + dip, lean * 0.55 - twist);
  L[16].set(-0.11 + sway, 0.90 + dip, 0);
  L[17].set( 0.11 + sway, 0.90 + dip, 0);

  // Braços
  const raise = (ws - 0.5) * 0.25;
  armIK(L, -1, aware, atk, lean,  sn * amp,  raise, dying);
  armIK(L,  1, aware, atk, lean, -sn * amp, -raise, dying);

  // Pernas (uma pode arrastar, conforme walkStyle)
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

/** Converte uma pose local em mundo (para raycast e gibs). */
export function localToWorldPose(z, local, out) {
  const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
  for (let i = 0; i < NJ; i++) {
    if (!out[i]) out[i] = new THREE.Vector3();
    const l = local[i];
    out[i].set(z.p.x + l.x * fz + l.z * fx, l.y, z.p.z - l.x * fx + l.z * fz);
  }
  return out;
}

export function renderFigure(ps, limbs, neck, gone) {
  for (let i = 0; i < LIMBS.length; i++) {
    const l = LIMBS[i];
    if (gone[l[0]]) {
      if (limbs[i].visible) limbs[i].visible = false;
      continue;
    }
    if (!limbs[i].visible) limbs[i].visible = true;
    placeLimb(limbs[i], ps[l[1]], ps[l[2]], l[3], l[1] === l[2], LIMB_SQUASH[i]);
  }
  if (neck) {
    const visible = !gone.Head;
    if (neck.visible !== visible) neck.visible = visible;
    if (visible) placeLimb(neck, ps[0], ps[1], 0.055, false);
  }
}

// ════════════════════════════════════════════════════════════
// VERLET RAGDOLL v1.2
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

    this.dead = new Set();
    for (const l of LIMBS) if (zombie.gone[l[0]]) this.dead.add(l[2]);

    if (zombie.g && zombie.g.parent) zombie.g.parent.remove(zombie.g);

    // Clona cada limb (geometria compartilhada, material próprio) + filhos (rosto)
    for (let i = 0; i < LIMBS.length; i++) {
      const l = LIMBS[i];
      if (zombie.gone[l[0]]) continue;
      const old = zombie.limbs[i];
      const matClone = old.material.clone();
      const clone = new THREE.Mesh(old.geometry, matClone);
      clone.castShadow = true;
      this._clonedMats.push(matClone);
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
      });
    }

    if (!zombie.gone.Head && zombie.neck) {
      const neckMat = zombie.neck.material.clone();
      this._neckClone = new THREE.Mesh(zombie.neck.geometry, neckMat);
      this._neckClone.castShadow = true;
      scene.add(this._neckClone);
      this._clonedMats.push(neckMat);
    }

    const stumpMat = new THREE.MeshLambertMaterial({ color: 0x8b1a1a });
    this._clonedMats.push(stumpMat);
    for (const g of zombie.gore) {
      const s = new THREE.Mesh(SHARED_STUMP_GEO, stumpMat);
      s.position.copy(this.P[STUMP[g]]);
      scene.add(s);
      this._stumps.push({ mesh: s, jointIdx: STUMP[g] });
    }

    this.fnt = [];
    for (const g of zombie.gore) this.fnt.push({ pt: STUMP[g], t: 1.6 });

    this._render(); // evita 1 frame com escala unitária
  }

  _render() {
    for (const l of this._limbs) {
      placeLimb(l.mesh, this.P[l.idxA], this.P[l.idxB], l.radius, l.isSame, l.squash);
    }
    if (this._neckClone) placeLimb(this._neckClone, this.P[0], this.P[1], 0.055, false);
    for (const s of this._stumps) s.mesh.position.copy(this.P[s.jointIdx]);
  }

  update(dt, bloodEmitter) {
    if (this.life <= 0) return true;
    this.life -= dt;

    if (!this.asleep) {
      const sub = Math.min(3, Math.ceil(dt / 0.016));
      const step = dt / sub;
      for (let s = 0; s < sub; s++) this._substep(step);

      // Dorme quando para (economiza colisão com paredes)
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
// LIMB GIB (voador)
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
    // geometria e material são compartilhados: não dar dispose
  }
}

// ════════════════════════════════════════════════════════════
// tryDismember — retorna boolean, escreve o grupo em out.group
// ════════════════════════════════════════════════════════════
export function tryDismember(zombie, limbId, isExplosion, out) {
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
  if (out) out.group = group;
  return true;
}
