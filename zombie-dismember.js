// ============================================================
// zombie-dismember.js — v1.1 "coordinate fix + resource cleanup"
// ============================================================
// FIXES v1.1:
//   • computePose retorna coords LOCAIS (sem z.p, sem yaw)
//   • computePose tem flag worldSpace para ragdoll
//   • VerletRagdoll: cria wrapper próprio + clona materiais
//   • VerletRagdoll.dispose() libera tudo
//   • VerletRagdoll colide com world.wallColliders
//   • tryDismember retorna boolean + out param
//   • Removido código morto (push/findIndex, vars duplicadas)
//   • Header corrigido (gore na morte, não por threshold)
// ============================================================

import * as THREE from 'three';

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

export const STUMP  = { Head: 1, BicepsL: 1, BicepsR: 1, ForearmL: 4, ForearmR: 6, LegL: 3, LegR: 3 };
export const GIBEND = { Head: 0, BicepsL: 5, ForearmL: 5, BicepsR: 7, ForearmR: 7, LegL: 9, LegR: 11 };

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

// Geometria de box compartilhada por TODOS os limbs de TODOS os zumbis
const SHARED_BOX = new THREE.BoxGeometry(1, 1, 1);
const SHARED_STUMP_GEO = new THREE.SphereGeometry(0.07, 6, 4);
export { SHARED_BOX, SHARED_STUMP_GEO };

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
 * computePose: retorna 14 joints.
 *   - Modo padrão: coordenadas LOCAIS (para filhos de z.g)
 *   - Modo worldSpace: coordenadas de mundo (para VerletRagdoll)
 */
export function computePose(z, out, worldSpace = false) {
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

  const lean = z.state === 'Dying' ? -0.4
             : (aw ? 0.12 : 0.03) + (z.state === 'Stagger' ? -0.14 : 0);
  const bob = z.state === 'Dying' ? 0.2
            : Math.sin(z.ph) * (w ? 1 : 0.12);
  const bodyBounce = w ? Math.abs(bob) * 0.04 : 0;

  const sp = Math.sin(z.ph);
  const s = z.state === 'Dying' ? 0.2 : sp * (w ? 1 : 0.12);
  const f = aw ? 0.35 + attackPhase * 0.4 : 0.05;
  const hy = aw ? 1.32 : 1.05;

  const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);

  const set = (i, xL, y, zL) => {
    const yFinal = y - bodyBounce;
    if (worldSpace) {
      L[i].set(
        z.p.x + xL * fz + zL * fx,
        yFinal,
        z.p.z - xL * fx + zL * fz
      );
    } else {
      L[i].set(xL, yFinal, zL);
    }
  };

  set(0,  0,     1.72,        lean + 0.05);
  set(1,  0,     1.50,        lean * 0.7);
  set(2,  0,     1.20,        lean * 0.35);
  set(3,  0,     0.92,        0);
  set(4,  -0.28, hy - 0.03,   lean * 0.7 + f * 1.2 + s * 0.15);
  set(5,  -0.28, hy - 0.03,   lean * 0.7 + f * 1.2 + s * 0.15);
  set(6,   0.28, hy - 0.03,   lean * 0.7 + f * 1.1 - s * 0.15);
  set(7,   0.28, hy - 0.03,   lean * 0.7 + f * 1.1 - s * 0.15);
  set(8,  -0.10, 0.5,         s * 0.25);
  set(9,  -0.10, Math.max(0, -s) * 0.12, s * 0.45);
  set(10,  0.10, 0.5,        -s * 0.25);
  set(11,  0.10, Math.max(0, s) * 0.12, -s * 0.45);
  set(12, -0.10, Math.max(0, -s) * 0.12,  s * 0.45 + 0.18);
  set(13,  0.10, Math.max(0, s) * 0.12,  -s * 0.45 + 0.18);

  return L;
}

export function renderFigure(ps, limbs, neck, gone) {
  for (let i = 0; i < LIMBS.length; i++) {
    const l = LIMBS[i];
    if (gone[l[0]]) {
      if (limbs[i].visible) limbs[i].visible = false;
      continue;
    }
    if (!limbs[i].visible) limbs[i].visible = true;
    placeLimb(limbs[i], ps[l[1]], ps[l[2]], l[3], l[1] === l[2]);
  }
  if (neck) {
    const visible = !gone.Head;
    if (neck.visible !== visible) neck.visible = visible;
    if (visible) placeLimb(neck, ps[0], ps[1], 0.04, false);
  }
}

// ════════════════════════════════════════════════════════════
// VERLET RAGDOLL v1.1
// ════════════════════════════════════════════════════════════
export class VerletRagdoll {
  constructor(zombie, hitDir, scene, world) {
    this.scene = scene;
    this.world = world;
    this.life = 25;
    this._clonedMats = [];
    this._limbs = [];
    this._stumps = [];
    this._neckClone = null;

    // Pose em WORLD coords (ragdoll não usa wrapper rotacionado)
    this.P = computePose(zombie, null, true).map(v => v.clone());

    // Velocidade inicial
    const vel = hitDir.clone().setY(0);
    if (vel.lengthSq() < 0.001) vel.set(1, 0, 0);
    vel.normalize().multiplyScalar(4 + Math.random() * 4);
    vel.y = 2 + Math.random() * 3;

    // Pose anterior = atual - v * dt
    this.O = this.P.map(p => p.clone().addScaledVector(vel, -1 / 60).add(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        Math.random() * 0.03,
        (Math.random() - 0.5) * 0.02
      )
    ));

    this.K = LINKS.map(([i, j]) => [i, j, this.P[i].distanceTo(this.P[j])]);

    this.dead = new Set();
    for (const l of LIMBS) {
      if (zombie.gone[l[0]]) this.dead.add(l[2]);
    }

    // ── Remove zombie.g da cena (ele continua na memória até ser GC) ──
    if (zombie.g && zombie.g.parent) zombie.g.parent.remove(zombie.g);

    // ── Clona limbs como filhos diretos da cena ──
    for (let i = 0; i < LIMBS.length; i++) {
      const l = LIMBS[i];
      if (zombie.gone[l[0]]) continue;
      const oldLimb = zombie.limbs[i];
      const matClone = oldLimb.material.clone();
      const clone = new THREE.Mesh(SHARED_BOX, matClone);
      clone.castShadow = true;
      clone.position.copy(this.P[l[1]]);
      scene.add(clone);
      this._limbs.push({ mesh: clone, idxA: l[1], idxB: l[2], radius: l[3], isSame: l[1] === l[2] });
      this._clonedMats.push(matClone);
    }

    // ── Clona pescoço ──
    if (!zombie.gone.Head && zombie.neck) {
      const neckMat = zombie.neck.material.clone();
      this._neckClone = new THREE.Mesh(SHARED_BOX, neckMat);
      this._neckClone.castShadow = true;
      this._neckClone.position.copy(this.P[0]);
      scene.add(this._neckClone);
      this._clonedMats.push(neckMat);
    }

    // ── Stumps (usa geometria compartilhada) ──
    const stumpMat = new THREE.MeshLambertMaterial({ color: 0x8b1a1a });
    this._clonedMats.push(stumpMat);
    for (const g of zombie.gore) {
      const s = new THREE.Mesh(SHARED_STUMP_GEO, stumpMat);
      s.position.copy(this.P[STUMP[g]]);
      scene.add(s);
      this._stumps.push({ mesh: s, jointIdx: STUMP[g] });
    }

    // ── Blood fountains ──
    this.fnt = [];
    for (const g of zombie.gore) {
      this.fnt.push({ pt: STUMP[g], t: 1.6 });
    }
  }

  update(dt, bloodEmitter) {
    if (this.life <= 0) return true;
    this.life -= dt;

    const sub = Math.min(3, Math.ceil(dt / 0.016));
    const step = dt / sub;
    for (let s = 0; s < sub; s++) this._substep(step);

    // Render
    for (const l of this._limbs) {
      placeLimb(l.mesh, this.P[l.idxA], this.P[l.idxB], l.radius, l.isSame);
    }
    if (this._neckClone) placeLimb(this._neckClone, this.P[0], this.P[1], 0.04, false);

    // Stumps seguem
    for (const s of this._stumps) s.mesh.position.copy(this.P[s.jointIdx]);

    // Blood fountains
    if (bloodEmitter) {
      for (const f of this.fnt) {
        if ((f.t -= dt) > 0 && Math.random() < 0.4) {
          bloodEmitter(this.P[f.pt], true);
        }
      }
    }

    // Fade no fim da vida
    if (this.life < 2) {
      const op = Math.max(0, this.life / 2);
      for (const m of this._clonedMats) {
        m.transparent = true;
        m.opacity = op;
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

      // Colisão com paredes (AABB)
      if (this.world && this.world.wallColliders) {
        for (let wi = 0; wi < this.world.wallColliders.length; wi++) {
          const box = this.world.wallColliders[wi];
          if (p.x > box.minX && p.x < box.maxX &&
              p.z > box.minZ && p.z < box.maxZ &&
              p.y < 4) {
            const dL = p.x - box.minX;
            const dR = box.maxX - p.x;
            const dU = p.z - box.minZ;
            const dD = box.maxZ - p.z;
            const minD = Math.min(dL, dR, dU, dD);
            if (minD === dL) p.x = box.minX - 0.05;
            else if (minD === dR) p.x = box.maxX + 0.05;
            else if (minD === dU) p.z = box.minZ - 0.05;
            else p.z = box.maxZ + 0.05;
          }
        }
      }
    }

    // Constraints iterativas
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
    // NÃO dispose geometria (compartilhada com o zombie) nem material (cacheado)
  }
}

// ════════════════════════════════════════════════════════════
// tryDismember — retorna boolean, escreve o grupo em out
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
