// ============================================================
// zombie-dismember.js — v4 "STABLE"
// Esqueleto, pose, raycast, desmembramento e gibs.
// Autocontido. Não depende de nada além de three.
// ============================================================

import * as THREE from 'three';

// ── Juntas (índices no array de pose, 16 no total) ─────────
export const J = {
  HEAD_TOP: 0, NECK: 1, TORSO_TOP: 2, HIPS: 3,
  SHOULDER_L: 4, ELBOW_L: 5, HAND_L: 6,
  SHOULDER_R: 7, ELBOW_R: 8, HAND_R: 9,
  HIP_L: 10, KNEE_L: 11, FOOT_L: 12,
  HIP_R: 13, KNEE_R: 14, FOOT_R: 15,
};

// ── Membros: [nome, juntaA, juntaB, raio] ──────────────────
// Ordem DEVE casar com defs em createZombieMesh (game.js)
export const LIMBS = [
  ['Head',     J.HEAD_TOP,   J.NECK,      0.22],
  ['Torso',    J.TORSO_TOP,  J.HIPS,      0.26],
  ['BicepL',   J.SHOULDER_L, J.ELBOW_L,   0.10],
  ['ForearmL', J.ELBOW_L,    J.HAND_L,    0.08],
  ['BicepR',   J.SHOULDER_R, J.ELBOW_R,   0.10],
  ['ForearmR', J.ELBOW_R,    J.HAND_R,    0.08],
  ['ThighL',   J.HIP_L,      J.KNEE_L,    0.12],
  ['ShinL',    J.KNEE_L,     J.FOOT_L,    0.10],
  ['ThighR',   J.HIP_R,      J.KNEE_R,    0.12],
  ['ShinR',    J.KNEE_R,     J.FOOT_R,    0.10],
];

export const LIMB_IDX = {};
LIMBS.forEach((l, i) => { LIMB_IDX[l[0]] = i; });

// ── Membro → grupo de desmembramento ──────────────────────
export const L2G = {
  Head: 'head',
  BicepL: 'armL', ForearmL: 'armL',
  BicepR: 'armR', ForearmR: 'armR',
  ThighL: 'legL', ShinL: 'legL',
  ThighR: 'legR', ShinR: 'legR',
};

// ── O que desaparece quando o grupo é arrancado ───────────
export const GONE = {
  head: ['Head'],
  armL: ['BicepL', 'ForearmL'],
  armR: ['BicepR', 'ForearmR'],
  legL: ['ThighL', 'ShinL'],
  legR: ['ThighR', 'ShinR'],
};

// ── Índices das juntas para stump e ponta do gib ──────────
export const STUMP = {
  head: J.NECK,
  armL: J.SHOULDER_L,
  armR: J.SHOULDER_R,
  legL: J.HIP_L,
  legR: J.HIP_R,
};

export const GIBEND = {
  head: J.HEAD_TOP,
  armL: J.HAND_L,
  armR: J.HAND_R,
  legL: J.FOOT_L,
  legR: J.FOOT_R,
};

export const GROUP_CFG = {};

// ── Geometrias compartilhadas ─────────────────────────────
export const SHARED_BOX = new THREE.BoxGeometry(1, 1, 1);
export const SHARED_STUMP_GEO = new THREE.SphereGeometry(0.11, 8, 6);

// ============================================================
// POSE — calcula as 16 juntas em espaço-mundo
// ============================================================
const _scratchPts = [];

export function computePose(z, scratch, isAttack) {
  const cos = Math.cos(z.yaw), sin = Math.sin(z.yaw);
  const px = z.p.x, pz = z.p.z;
  const ph = z.ph || 0;
  const sw  = Math.sin(ph) * 0.30;
  const sw2 = Math.cos(ph) * 0.30;
  const bob = Math.abs(Math.sin(ph)) * 0.03;

  // Direções (zumbi é curvado pra frente, braços esticados)
  const fwdZ  = 0.15 + (isAttack ? 0.25 : 0);
  const armFwd = 0.35 + (isAttack ? 0.4 : 0);

  // Posições locais: [x, y, zLocal]
  const L = [
    [ 0.00, 1.80,  0.05],                 // 0 HEAD_TOP
    [ 0.00, 1.55,  0.04],                 // 1 NECK
    [ 0.00, 1.50,  0.03],                 // 2 TORSO_TOP
    [ 0.00, 1.00,  0.00],                 // 3 HIPS
    [-0.28, 1.45,  0.00],                 // 4 SHOULDER_L
    [-0.30, 1.20,  armFwd + sw * 0.15],   // 5 ELBOW_L
    [-0.30, 0.98,  armFwd * 2 + sw * 0.25], // 6 HAND_L
    [ 0.28, 1.45,  0.00],                 // 7 SHOULDER_R
    [ 0.30, 1.20,  armFwd + sw2 * 0.15],  // 8 ELBOW_R
    [ 0.30, 0.98,  armFwd * 2 + sw2 * 0.25], // 9 HAND_R
    [-0.13, 1.00,  0.00],                 // 10 HIP_L
    [-0.13, 0.55,  sw * 0.30],            // 11 KNEE_L
    [-0.13, 0.08,  sw * 0.55],            // 12 FOOT_L
    [ 0.13, 1.00,  0.00],                 // 13 HIP_R
    [ 0.13, 0.55, -sw * 0.30],            // 14 KNEE_R
    [ 0.13, 0.08, -sw * 0.55],            // 15 FOOT_R
  ];

  const pts = scratch || _scratchPts;
  pts.length = 0;
  for (let i = 0; i < 16; i++) {
    const [lx, ly, lz] = L[i];
    const wx = px + cos * lx + sin * lz;
    const wz = pz - sin * lx + cos * lz;
    pts.push(new THREE.Vector3(wx, ly + bob, wz));
  }
  return pts;
}

// ============================================================
// RENDER — posiciona cada malha entre suas 2 juntas
// ============================================================
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _q = new THREE.Quaternion();

export function renderFigure(pts, limbs, neck, gone) {
  if (!pts || pts.length < 16) return;
  for (let i = 0; i < LIMBS.length; i++) {
    const mesh = limbs[i];
    if (!mesh) continue;
    const name = LIMBS[i][0];
    if (gone && gone[name]) { mesh.visible = false; continue; }
    mesh.visible = true;

    const a = pts[LIMBS[i][1]];
    const b = pts[LIMBS[i][2]];
    if (!a || !b) continue;

    _mid.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
    mesh.position.copy(_mid);

    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len > 0.0001) _dir.normalize(); else _dir.set(0, 1, 0);
    _q.setFromUnitVectors(_up, _dir);
    mesh.quaternion.copy(_q);

    if (mesh.userData.kind === 'cyl') {
      mesh.scale.set(1, len, 1);
    } else {
      mesh.scale.set(1, 1, 1);
    }
  }
}

// ============================================================
// RAYCAST contra cápsula (segmento + raio)
// ============================================================
export function raySegmentHitFull(ro, rd, a, b, radius, minT, maxT) {
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
    tc = d3 > 1e-6 ? d5 / d3 : 0;
  }
  if (sc < 0) { sc = 0; tc = d3 > 1e-6 ? d5 / d3 : 0; }
  if (tc < 0) { tc = 0; sc = -d4; }
  else if (tc > 1) { tc = 1; sc = d2 - d4; }
  if (sc < minT || sc > maxT) return null;
  const px = ro.x + ux * sc, py = ro.y + uy * sc, pz = ro.z + uz * sc;
  const qx = a.x + vx * tc, qy = a.y + vy * tc, qz = a.z + vz * tc;
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  if (dx*dx + dy*dy + dz*dz > radius * radius) return null;
  return { s: sc, tc };
}

// ============================================================
// DESMEMBRAMENTO
// ============================================================
export function tryDismember(z, limbName, force, out, tAlong) {
  if (!limbName) return false;
  const group = L2G[limbName];
  if (!group) return false;
  if (z.gore && z.gore.has(group)) return false;
  // 45% de chance em hit normal, 100% se force
  if (!force && Math.random() > 0.45) return false;
  out.group = group;
  out.cutT = (typeof tAlong === 'number') ? tAlong : 0.5;
  return true;
}

// ============================================================
// GIB — membro voando
// ============================================================
export class LimbGib {
  constructor(mesh, position, dir, length) {
    this.mesh = mesh;
    this.mesh.position.copy(position);
    this.vel = new THREE.Vector3(
      dir.x * 3 + (Math.random() - 0.5) * 3,
      3 + Math.random() * 2,
      dir.z * 3 + (Math.random() - 0.5) * 3
    );
    this.ang = new THREE.Vector3(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12
    );
    this.life = 5.0;
    this.grounded = false;
    this._baseScale = mesh.scale.clone();
  }
  update(dt) {
    this.life -= dt;
    if (!this.grounded) {
      this.vel.y -= 22 * dt;
      this.mesh.position.addScaledVector(this.vel, dt);
      if (this.mesh.position.y <= 0.12) {
        this.mesh.position.y = 0.12;
        this.grounded = true;
        this.vel.set(0, 0, 0);
      }
      this.mesh.rotation.x += this.ang.x * dt;
      this.mesh.rotation.y += this.ang.y * dt;
      this.mesh.rotation.z += this.ang.z * dt;
    }
    if (this.life < 1) {
      const k = Math.max(0, this.life);
      this.mesh.scale.copy(this._baseScale).multiplyScalar(k);
    }
    return this.life <= 0;
  }
  dispose(scene) {
    if (scene) scene.remove(this.mesh);
    if (this.mesh.geometry && this.mesh.geometry !== SHARED_BOX) {
      this.mesh.geometry.dispose();
    }
  }
}

// ============================================================
// RAGDOLL — tomba no chão e some
// ============================================================
export class VerletRagdoll {
  constructor(zombie, hitDir, scene, world) {
    this.scene = scene;
    this.g = zombie.g;
    this.yaw = zombie.yaw;
    this.life = 4.0;
    const dirSign = (hitDir && (hitDir.x + hitDir.z)) > 0 ? 1 : -1;
    this.tiltDir = dirSign * (Math.random() > 0.5 ? 1 : -1);
    this.tilt = 0;
    this.targetTilt = Math.PI / 2 * this.tiltDir;
    // Guarda posição original
    this._origY = this.g.position.y;
  }
  update(dt) {
    this.life -= dt;
    if (Math.abs(this.tilt) < Math.abs(this.targetTilt) - 0.03) {
      this.tilt += this.tiltDir * dt * 5;
      if (Math.abs(this.tilt) > Math.abs(this.targetTilt)) this.tilt = this.targetTilt;
      this.g.rotation.x = this.tilt;
    }
    return this.life <= 0;
  }
  dispose() {
    if (this.scene) this.scene.remove(this.g);
  }
}
