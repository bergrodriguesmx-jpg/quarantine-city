// ============================================================
// zombie-dismember.js — v1.0 "ZB3 Verlet dismemberment"
// ============================================================
// Porte fiel do demo "Zumbi Blocks 3D":
//   • Limb-based anatomy (cada membro = caixa entre 2 joints)
//   • Verlet ragdoll com distance constraints iterativos
//   • Desmembramento por limiar de HP (ratio no top)
//   • Stumps + gibs físicos + fountains de sangue
// ============================================================

import * as THREE from 'three';

// Anatomia: [LimbID, jointA, jointB, raio]
// Os índices correspondem aos points do `pose()` do demo.
export const LIMBS = [
  ['Head',         0,  0, 0.13],
  ['Chest',        1,  2, 0.14],
  ['Stomach',      2,  3, 0.12],
  ['Hips',         3,  3, 0.13],
  ['LeftBiceps',   1,  4, 0.06],
  ['LeftForearm',  4,  5, 0.05],
  ['LeftHand',     5,  5, 0.05],
  ['RightBiceps',  1,  6, 0.06],
  ['RightForearm', 6,  7, 0.05],
  ['RightHand',    7,  7, 0.05],
  ['LeftThigh',    3,  8, 0.08],
  ['LeftShin',     8,  9, 0.06],
  ['LeftFoot',     9, 12, 0.05],
  ['RightThigh',   3, 10, 0.08],
  ['RightShin',   10, 11, 0.06],
  ['RightFoot',   11, 13, 0.05],
];

// Limb → grupo funcional (para gore flag)
export const L2G = {
  Head: 'Head',
  LeftBiceps: 'BicepsL', LeftForearm: 'ForearmL', LeftHand: 'ForearmL',
  RightBiceps: 'BicepsR', RightForearm: 'ForearmR', RightHand: 'ForearmR',
  LeftThigh: 'LegL', LeftShin: 'LegL', LeftFoot: 'LegL',
  RightThigh: 'LegR', RightShin: 'LegR', RightFoot: 'LegR',
};

// O que desaparece quando um grupo é cortado
export const GONE = {
  Head:     ['Head'],
  BicepsL:  ['LeftBiceps', 'LeftForearm', 'LeftHand'],
  ForearmL: ['LeftForearm', 'LeftHand'],
  BicepsR:  ['RightBiceps', 'RightForearm', 'RightHand'],
  ForearmR: ['RightForearm', 'RightHand'],
  LegL:     ['LeftThigh', 'LeftShin', 'LeftFoot'],
  LegR:     ['RightThigh', 'RightShin', 'RightFoot'],
};

// Joint que mostra o coto + joint onde o gib vai nascer
export const STUMP  = { Head: 1, BicepsL: 1, BicepsR: 1, ForearmL: 4, ForearmR: 6, LegL: 3, LegR: 3 };
export const GIBEND = { Head: 0, BicepsL: 5, ForearmL: 5, BicepsR: 7, ForearmR: 7, LegL: 9, LegR: 11 };

// Distance constraints do ragdoll
export const LINKS = [
  [0, 1], [1, 2], [2, 3],
  [1, 4], [4, 5],
  [1, 6], [6, 7],
  [3, 8], [8, 9], [9, 12],
  [3, 10], [10, 11], [11, 13],
  [0, 2], [1, 3],
];

const UP = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

/**
 * Place: coloca uma mesh entre dois pontos (limb) — auto-escala e auto-orienta
 */
export function placeLimb(mesh, a, b, radius, isSameJoint) {
  if (isSameJoint) {
    mesh.position.copy(a);
    mesh.scale.setScalar(radius * 2);
    mesh.quaternion.identity();
  } else {
    _tmp.subVectors(b, a);
    const len = _tmp.length() + 0.001;
    mesh.position.copy(a).addScaledVector(_tmp, 0.5);
    mesh.scale.set(radius * 2, len, radius * 2);
    mesh.quaternion.setFromUnitVectors(UP, _tmp.divideScalar(len));
  }
}

/**
 * Pose: computa os 14 joints no espaço mundo, baseado em walk phase, attack, etc.
 * Retorna array de 14 Vector3.
 */
export function computePose(z, out) {
  const L = out || [];
  for (let i = 0; i < 14; i++) {
    if (!L[i]) L[i] = new THREE.Vector3();
    else L[i].set(0, 0, 0);
  }

  const w = Math.abs(z.v) > 0.3;
  const aw = z.state !== 'Unaware';
  const attackPhase = z.state === 'Attack'
    ? Math.sin(Math.max(0, Math.min(1, z.tmr / 0.7)) * Math.PI)
    : 0;

  // Lean / bob
  const lean = z.state === 'Dying' ? -0.4
             : (aw ? 0.12 : 0.03) + (z.state === 'Stagger' ? -0.14 : 0);
  const bob = z.state === 'Dying' ? 0.2
            : Math.sin(z.ph) * (w ? 1 : 0.12);
  const bodyBounce = w ? Math.abs(bob) * 0.04 : 0;
  const armReach = aw ? 0.35 + attackPhase * 0.4 : 0.05;
  const armY = aw ? 1.32 : 1.05;

  const fx = Math.sin(z.yaw);
  const fz = Math.cos(z.yaw);

  // Helper local→world
  const push = (xLocal, y, zLocal) => {
    _tmp.set(
      z.p.x + xLocal * fz + zLocal * fx,
      y - bodyBounce,
      z.p.z - xLocal * fx + zLocal * fz
    );
    const idx = L.findIndex(v => v.lengthSq() === 0 && v.y === 0 && v.x === 0 && v.z === 0);
    // Simplesmente escrevemos direto no slot correspondente
  };

  const sp = Math.sin(z.ph);
  const s = z.state === 'Dying' ? 0.2 : sp * (w ? 1 : 0.12);
  const b = w ? Math.abs(s) * 0.04 : 0;
  const f = aw ? 0.35 + attackPhase * 0.4 : 0.05;
  const hy = aw ? 1.32 : 1.05;

  // 14 pontos
  const set = (i, xL, y, zL) => {
    L[i].set(
      z.p.x + xL * fz + zL * fx,
      y - b,
      z.p.z - xL * fx + zL * fz
    );
  };

  set(0,  0,     1.72,        lean + 0.05);   // Head
  set(1,  0,     1.50,        lean * 0.7);    // Chest
  set(2,  0,     1.20,        lean * 0.35);   // Stomach
  set(3,  0,     0.92,        0);             // Hips
  set(4,  -0.28, hy - 0.03,   lean * 0.7 + f * 1.2 + s * 0.15);  // LeftForearm (biceps→forearm)
  set(5,  -0.28, hy - 0.03,   lean * 0.7 + f * 1.2 + s * 0.15);  // LeftHand
  set(6,   0.28, hy - 0.03,   lean * 0.7 + f * 1.1 - s * 0.15);  // RightForearm
  set(7,   0.28, hy - 0.03,   lean * 0.7 + f * 1.1 - s * 0.15);  // RightHand
  set(8,  -0.10, 0.5,         s * 0.25);      // LeftShin
  set(9,  -0.10, Math.max(0, -s) * 0.12, s * 0.45);  // LeftFoot
  set(10,  0.10, 0.5,        -s * 0.25);      // RightShin
  set(11,  0.10, Math.max(0, s) * 0.12, -s * 0.45);  // RightFoot
  set(12, -0.10, Math.max(0, -s) * 0.12,  s * 0.45 + 0.18); // LeftToe
  set(13,  0.10, Math.max(0, s) * 0.12,  -s * 0.45 + 0.18); // RightToe

  return L;
}

/**
 * Aplica pose nos meshes (limbs + neck).
 */
export function renderFigure(ps, limbs, neck, gone) {
  for (let i = 0; i < LIMBS.length; i++) {
    const l = LIMBS[i];
    if (gone[l[0]]) continue;
    placeLimb(limbs[i], ps[l[1]], ps[l[2]], l[3], l[1] === l[2]);
  }
  neck.visible = !gone.Head;
  if (!gone.Head) placeLimb(neck, ps[0], ps[1], 0.04, false);
}

// ════════════════════════════════════════════════════════════
// VERLET RAGDOLL
// ════════════════════════════════════════════════════════════
export class VerletRagdoll {
  constructor(zombie, hitDir) {
    this.life = 25;
    this.settled = false;
    this.fadeProgress = 0;

    // Pose inicial (congela)
    this.P = computePose(zombie).map(v => v.clone());
    const vel = hitDir.clone().setY(0).normalize().multiplyScalar(4 + Math.random() * 4);
    vel.y = 2 + Math.random() * 3;

    // Pose anterior = atual - velocity * dt
    this.O = this.P.map(p => p.clone().addScaledVector(vel, -1/60).add(
      new THREE.Vector3(
        (Math.random()-0.5)*0.02,
        Math.random()*0.03,
        (Math.random()-0.5)*0.02
      )
    ));

    // Lengths originais
    this.K = LINKS.map(([i, j]) => [i, j, this.P[i].distanceTo(this.P[j])]);

    // Dead joints (removidos)
    this.dead = new Set();
    for (const l of LIMBS) {
      if (zombie.gone[l[0]]) this.dead.add(l[2]);
    }

    // Blood fountains (dos stumps)
    this.fnt = [];
    for (const g of zombie.gore) {
      this.fnt.push({ pt: STUMP[g], t: 1.6 });
    }

    // Mesh visual (copia a hierarquia do zombie procedural)
    this.wrapper = zombie.g;              // Reutiliza o Group do próprio zombie
    this.limbs   = zombie.limbs;
    this.neck    = zombie.neck;
    this.gone    = zombie.gone;

    // Stumps
    this.stumps = [];
    for (const g of zombie.gore) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), RED_MAT);
      this.wrapper.add(s);
      this.stumps.push([s, STUMP[g]]);
    }

    // Esconder prop/dot
    if (zombie.prop) zombie.prop.visible = false;
    if (zombie.dot)  zombie.dot.visible  = false;
    for (let i = 0; i < LIMBS.length; i++) {
      if (zombie.gone[LIMBS[i][0]]) this.limbs[i].visible = false;
    }
  }

  update(dt, bloodEmitter, gibEmitter) {
    if (this.life <= 0) return true;
    this.life -= dt;

    const sub = Math.min(3, Math.ceil(dt / 0.016));
    const step = dt / sub;
    for (let s = 0; s < sub; s++) this._substep(step);

    // Stumps seguem os joints
    for (const [m, i] of this.stumps) m.position.copy(this.P[i]);

    // Render
    renderFigure(this.P, this.limbs, this.neck, this.gone);

    // Blood fountains
    for (const f of this.fnt) {
      if ((f.t -= dt) > 0 && bloodEmitter && Math.random() < 0.4) {
        bloodEmitter(this.P[f.pt], true);
      }
    }

    // Fade no fim da vida
    if (this.life < 2) {
      const op = Math.max(0, this.life / 2);
      for (const l of this.limbs) {
        if (l.material) {
          l.material.transparent = true;
          l.material.opacity = op;
        }
      }
    }

    return this.life <= 0;
  }

  _substep(dt) {
    const P = this.P, O = this.O;

    // Integração Verlet
    for (let i = 0; i < P.length; i++) {
      const p = P[i], o = O[i];
      const vx = (p.x - o.x) * 0.995;
      const vy = (p.y - o.y) * 0.995;
      const vz = (p.z - o.z) * 0.995;
      o.copy(p);
      p.x += vx;
      p.y += vy - 14 * dt * dt;
      p.z += vz;
      // Colisão com chão
      if (p.y < 0) { p.y = 0; o.y = 0; o.x = p.x - vx * 0.6; o.z = p.z - vz * 0.6; }
    }

    // Distance constraints (5 iterações)
    for (let it = 0; it < 5; it++) {
      for (let k = 0; k < this.K.length; k++) {
        const [i, j, len] = this.K[k];
        if (this.dead.has(i) || this.dead.has(j)) continue;
        const a = P[i], b = P[j];
        _tmp.subVectors(b, a);
        const l = _tmp.length() || 1;
        const df = ((l - len) / l) * 0.5;
        a.addScaledVector(_tmp, df);
        b.addScaledVector(_tmp, -df);
      }
    }
  }

  dispose() {
    // Nada a fazer — o wrapper é o Group do próprio zombie, o game.js cuida
  }
}

const RED_MAT = new THREE.MeshLambertMaterial({ color: 0x8b1a1a });

// ════════════════════════════════════════════════════════════
// GIB em física (para membros arrancados)
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
    if (this.mesh.geometry) this.mesh.geometry.dispose();
  }
}

// ════════════════════════════════════════════════════════════
// Helper: tenta desmembrar baseado em ratio de HP
// ════════════════════════════════════════════════════════════
export function tryDismember(zombie, limbId, isExplosion) {
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
  return group;
}
