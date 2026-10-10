import * as THREE from 'three';
import * as CANNON from 'cannon-es';

let physicsWorld = null;
let sceneRef = null;

export function initPhysics(scene) {
  if (physicsWorld) return physicsWorld;
  sceneRef = scene;
  physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.allowSleep = true;
  physicsWorld.solver.iterations = 14;
  physicsWorld.solver.tolerance = 0.001;

  const groundMat = new CANNON.Material('ground');
  const limbMat = new CANNON.Material('limb');
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(groundMat, limbMat, {
    friction: 0.9,
    restitution: 0.02,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
  }));
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(limbMat, limbMat, {
    friction: 0.65,
    restitution: 0.03,
  }));
  physicsWorld.defaultContactMaterial.friction = 0.9;
  physicsWorld.defaultContactMaterial.restitution = 0.02;

  const ground = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: groundMat,
  });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physicsWorld.addBody(ground);

  return physicsWorld;
}

export function getPhysicsWorld() { return physicsWorld; }

export function addStaticBox(minX, maxX, minZ, maxZ, height = 4) {
  if (!physicsWorld) return null;
  const hx = Math.max(0.05, (maxX - minX) / 2);
  const hz = Math.max(0.05, (maxZ - minZ) / 2);
  const hy = height / 2;
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
    position: new CANNON.Vec3((minX + maxX) / 2, hy, (minZ + maxZ) / 2),
  });
  physicsWorld.addBody(body);
  return body;
}

export function stepPhysics(dt) {
  if (!physicsWorld) return;
  physicsWorld.step(1 / 60, dt, 4);
}

export function clearPhysics() {
  if (!physicsWorld) return;
  while (physicsWorld.constraints.length > 0) {
    physicsWorld.removeConstraint(physicsWorld.constraints[0]);
  }
  while (physicsWorld.bodies.length > 1) {
    const b = physicsWorld.bodies[physicsWorld.bodies.length - 1];
    physicsWorld.removeBody(b);
  }
}

// ============================================================
// RAGDOLL ESTILO GTA IV (EUPHORIA SIMPLIFICADO)
//
// Sistema de músculos ativos em 3 fases:
//  1. BALANCE  (0.0s - 0.6s): corpo resiste, tenta ficar em pé
//  2. COLLAPSE (0.6s - 1.2s): músculos enfraquecem progressivamente
//  3. LIMP     (1.2s+):       ragdoll puro, sem resistência
//
// Cada junta tem:
//  - ConeTwistConstraint (limite de ângulo realista)
//  - "Rest angle" (pose de equilíbrio)
//  - Torque corretivo proporcional a muscleStrength
// ============================================================

const BONE_DEFS = {
  torso: { mass: 20, halfExtents: [0.18, 0.22, 0.12] },
  head:  { mass: 4.0, halfExtents: [0.11, 0.12, 0.11] },
  armL:  { mass: 2.5, halfExtents: [0.06, 0.18, 0.06] },
  armR:  { mass: 2.5, halfExtents: [0.06, 0.18, 0.06] },
  legL:  { mass: 5.0, halfExtents: [0.08, 0.22, 0.08] },
  legR:  { mass: 5.0, halfExtents: [0.08, 0.22, 0.08] },
};

const ORDER = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v3 = new THREE.Vector3();

const JOINT_LOCAL = {
  neck:      { torso: new CANNON.Vec3(0,  0.22, 0), head:  new CANNON.Vec3(0, -0.12, 0) },
  shoulderL: { torso: new CANNON.Vec3(-0.18, 0.12, 0), armL: new CANNON.Vec3(0, 0.18, 0) },
  shoulderR: { torso: new CANNON.Vec3( 0.18, 0.12, 0), armR: new CANNON.Vec3(0, 0.18, 0) },
  hipL:      { torso: new CANNON.Vec3(-0.09, -0.14, 0), legL: new CANNON.Vec3(0, 0.22, 0) },
  hipR:      { torso: new CANNON.Vec3( 0.09, -0.14, 0), legR: new CANNON.Vec3(0, 0.22, 0) },
};

const AXIS_UP = new CANNON.Vec3(0, 1, 0);

// Pose de equilíbrio (em euler local, XYZ)
// Quando músculos estão fortes, corpo vai para essa pose.
const BALANCE_POSE = {
  armL: new CANNON.Quaternion().setFromEuler(0, 0, -0.15),
  armR: new CANNON.Quaternion().setFromEuler(0, 0, 0.15),
  legL: new CANNON.Quaternion().setFromEuler(0, 0, 0),
  legR: new CANNON.Quaternion().setFromEuler(0, 0, 0),
};

// ============================================================
// SISTEMA DE MÚSCULOS — aplica torque corretivo nas juntas
// ============================================================
class MuscleSystem {
  constructor(ragdoll) {
    this.ragdoll = ragdoll;
    this.timer = 0;
    this.phase = 'balance';
    this.strength = 1.0;

    // Config por junta: quanto de força muscular tentar
    this.muscleStrength = {
      neck: 0.9,      // cabeça tenta ficar erguida
      shoulderL: 0.5,
      shoulderR: 0.5,
      hipL: 0.8,      // pernas tentam manter em pé
      hipR: 0.8,
    };

    // Pose alvo (quaternion local) para cada junta
    this.targets = {
      neck: new CANNON.Quaternion().setFromEuler(-0.15, 0, 0),
      armL: BALANCE_POSE.armL.clone(),
      armR: BALANCE_POSE.armR.clone(),
      legL: BALANCE_POSE.legL.clone(),
      legR: BALANCE_POSE.legR.clone(),
    };

    // Guarda rotação inicial de cada body para calcular torque relativo
    this.initialLocalRot = {};
    const map = ragdoll.bodyMap;
    for (const childKey in map) {
      const child = map[childKey];
      let parentKey = null;
      if (childKey === 'head')  parentKey = 'torso';
      if (childKey === 'armL' || childKey === 'armR' || childKey === 'legL' || childKey === 'legR') parentKey = 'torso';
      if (!parentKey) continue;
      const parent = map[parentKey];
      if (!parent) continue;
      const invP = parent.quaternion.clone().inverse();
      const local = invP.mult(child.quaternion);
      this.initialLocalRot[childKey] = local;
    }
  }

  update(dt) {
    this.timer += dt;

    // Fase 1: BALANCE (0 → 0.5s)
    if (this.timer < 0.5) {
      this.phase = 'balance';
      this.strength = 1.0;
    }
    // Fase 2: COLLAPSE (0.5 → 1.2s) — interpola linear
    else if (this.timer < 1.2) {
      this.phase = 'collapse';
      const t = (this.timer - 0.5) / 0.7;
      this.strength = 1.0 - t;
    }
    // Fase 3: LIMP (1.2s+)
    else {
      this.phase = 'limp';
      this.strength = 0;
      return;
    }

    if (this.strength <= 0.01) return;

    const map = this.ragdoll.bodyMap;
    for (const childKey in this.targets) {
      const targetLocal = this.targets[childKey];
      const child = map[childKey];
      let parentKey = null;
      if (childKey === 'head')  parentKey = 'torso';
      if (childKey === 'armL' || childKey === 'armR' || childKey === 'legL' || childKey === 'legR') parentKey = 'torso';
      if (!parentKey) continue;
      const parent = map[parentKey];
      if (!parent) continue;

      // Rotação local atual
      const invP = parent.quaternion.clone().inverse();
      const currentLocal = invP.mult(child.quaternion);

      // Diferença entre atual e alvo (quaternion delta)
      const delta = targetLocal.mult(currentLocal.inverse());
      if (delta.w < 0) { delta.x = -delta.x; delta.y = -delta.y; delta.z = -delta.z; delta.w = -delta.w; }

      // Converte para eixo-ângulo
      const angle = 2 * Math.acos(Math.min(1, Math.max(-1, delta.w)));
      const sinHalf = Math.sqrt(1 - delta.w * delta.w);
      if (sinHalf < 0.0001 || angle < 0.001) continue;

      const axis = new CANNON.Vec3(delta.x / sinHalf, delta.y / sinHalf, delta.z / sinHalf);

      // Torque proporcional ao ângulo, força muscular e inércia do filho
      const muscle = this.muscleStrength[childKey] || 0.5;
      const stiffness = 12.0;   // força-base do "músculo"
      const torqueMag = angle * stiffness * muscle * this.strength;
      const maxTorque = 30;     // clamp
      const t = Math.min(maxTorque, torqueMag);

      // Aplica torque em torno do eixo local do pai
      // Converte eixo local para world
      const worldAxis = parent.quaternion.vmult(axis);
      const torque = new CANNON.Vec3(worldAxis.x * t, worldAxis.y * t, worldAxis.z * t);

      child.torque.x += torque.x;
      child.torque.y += torque.y;
      child.torque.z += torque.z;

      // Damping angular extra durante balance (evita oscilação)
      child.angularVelocity.scale(1 - 0.15 * this.strength, child.angularVelocity);

      // Avisa o body pra acordar
      if (child.sleepState === CANNON.Body.SLEEPING) child.wakeUp();
    }

    // Reforço específico: manter torso vertical durante BALANCE
    if (this.phase === 'balance') {
      const torso = map['torso'];
      if (torso) {
        // Eixo "up" local do torso (Y)
        const upLocal = new CANNON.Vec3(0, 1, 0);
        const upWorld = torso.quaternion.vmult(upLocal);
        // Quanto mais "deitado" o torso, mais torque pra levantar
        const tilt = 1 - Math.max(0, upWorld.y); // 0 = em pé, 1 = deitado
        if (tilt > 0.01) {
          // Torque em torno do eixo perpendicular à inclinação
          const side = new CANNON.Vec3(upWorld.z, 0, -upWorld.x);
          const sideLen = Math.sqrt(side.x*side.x + side.z*side.z);
          if (sideLen > 0.001) {
            side.x /= sideLen; side.z /= sideLen;
            const liftTorque = tilt * 18 * this.strength;
            torso.torque.x += side.x * liftTorque;
            torso.torque.z += side.z * liftTorque;
          }
        }
      }
    }
  }

  // Quando um membro é removido, não tenta mais controlá-lo
  forget(key) {
    delete this.targets[key];
    delete this.muscleStrength[key];
  }
}

export class Ragdoll {
  constructor(zombieMesh, hitDir, hitStrength, missingParts) {
    if (!physicsWorld) { console.warn('[ragdoll] physics não inicializada'); return; }

    this.bodies      = [];
    this.bodyMap     = {};
    this.wrappers    = [];
    this.wrapperMap  = {};
    this.constraints = [];
    this.pieces      = [];
    this.state       = 'falling';
    this.settleStart = 0;
    this.fadeProgress = 0;
    this.lastHitTime = performance.now() / 1000;
    this.onFadeStart = null;
    this._fadeFired  = false;
    this._life       = 0;
    this._maxLife    = 60;
    this._uid        = Math.random().toString(36).slice(2, 8);

    this._build(zombieMesh, hitDir, hitStrength, missingParts);
    this.muscles = new MuscleSystem(this);
  }

  _build(zombieMesh, hitDir, hitStrength, missingParts) {
    const ud = zombieMesh.userData;
    zombieMesh.updateMatrixWorld(true);

    const rawParts = {};
    for (const key of ORDER) {
      const obj = (key === 'torso') ? ud.torso : ud[key];
      if (!obj) continue;
      if (missingParts && missingParts[key]) { if (obj.parent) obj.parent.remove(obj); continue; }

      obj.getWorldPosition(_v1);
      obj.getWorldQuaternion(_q1);
      if (obj.parent) obj.parent.remove(obj);
      obj.position.copy(_v1);
      obj.quaternion.copy(_q1);
      obj.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) continue;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const wrapper = new THREE.Group();
      wrapper.position.copy(center);
      wrapper.quaternion.copy(_q1);
      if (sceneRef) sceneRef.add(wrapper);
      obj.position.sub(center);
      wrapper.add(obj);

      rawParts[key] = { wrapper, size, center, quat: _q1.clone() };
    }

    if (zombieMesh.parent) zombieMesh.parent.remove(zombieMesh);

    for (const key of ORDER) {
      const part = rawParts[key];
      if (!part) continue;
      const def = BONE_DEFS[key];

      const hx = Math.max(def.halfExtents[0], part.size.x * 0.5);
      const hy = Math.max(def.halfExtents[1], part.size.y * 0.5);
      const hz = Math.max(def.halfExtents[2], part.size.z * 0.5);

      const body = new CANNON.Body({
        mass: def.mass,
        shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
        position: new CANNON.Vec3(part.center.x, part.center.y, part.center.z),
        quaternion: new CANNON.Quaternion(part.quat.x, part.quat.y, part.quat.z, part.quat.w),
        linearDamping: 0.20,
        angularDamping: 0.55,
        sleepSpeedLimit: 0.3,
        sleepTimeLimit: 0.4,
        allowSleep: true,
      });
      body.userData = { key, ragdollId: this._uid };
      physicsWorld.addBody(body);

      this.bodies.push(body);
      this.bodyMap[key] = body;
      this.wrappers.push(part.wrapper);
      this.wrapperMap[key] = part.wrapper;

      this.pieces.push({
        key,
        mesh: part.wrapper,
        mass: def.mass,
        size: part.size,
        settled: false,
        settleTimer: 0,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        lastHitZombie: new Map(),
        lastGlobalHit: 0,
      });
    }

    const makeConeTwist = (parentKey, childKey, jointName, angleLimit, twistLimit) => {
      const parent = this.bodyMap[parentKey];
      const child  = this.bodyMap[childKey];
      if (!parent || !child) return null;
      const jl = JOINT_LOCAL[jointName];
      if (!jl) return null;
      const c = new CANNON.ConeTwistConstraint(child, parent, {
        pivotA: jl[childKey],
        pivotB: jl[parentKey],
        axisA: AXIS_UP,
        axisB: AXIS_UP,
        angle: angleLimit,
        twistAngle: twistLimit,
        maxForce: 1e7,
      });
      physicsWorld.addConstraint(c);
      this.constraints.push(c);
      return c;
    };

    makeConeTwist('torso', 'head', 'neck', 0.7, 0.5);
    makeConeTwist('torso', 'armL', 'shoulderL', 1.4, 0.9);
    makeConeTwist('torso', 'armR', 'shoulderR', 1.4, 0.9);
    makeConeTwist('torso', 'legL', 'hipL', 1.1, 0.4);
    makeConeTwist('torso', 'legR', 'hipR', 1.1, 0.4);

    // Pose inicial curvada
    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      if (key === 'armL') body.quaternion.setFromEuler(0, 0, -0.3);
      else if (key === 'armR') body.quaternion.setFromEuler(0, 0, 0.3);
      else if (key === 'legL') body.quaternion.setFromEuler(0.2, 0, 0);
      else if (key === 'legR') body.quaternion.setFromEuler(-0.2, 0, 0);
    }

    // Impulso inicial direcional suave
    const dir = hitDir.clone(); dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
    dir.normalize();

    const strength = Math.min(2.5, Math.max(0.6, hitStrength));
    const baseImpulse = strength * 1.6;

    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const w = (key === 'torso' ? 0.8 : 0.4);
      const imp = new CANNON.Vec3(
        dir.x * baseImpulse * body.mass * w,
        (0.6 + Math.random() * 0.8) * body.mass * w,
        dir.z * baseImpulse * body.mass * w
      );
      body.applyImpulse(imp, new CANNON.Vec3(0, 0, 0));
      body.angularVelocity.set(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      );
    }
  }

  sliceAt(cameraPos, forward3D, range) {
    if (this.state === 'fading') return null;

    let bestKey = null, bestWrapper = null, bestDist = range;
    for (const key in this.wrapperMap) {
      if (key === 'torso') continue;
      const wrapper = this.wrapperMap[key];
      const d = cameraPos.distanceTo(wrapper.position);
      if (d > bestDist) continue;
      _v1.subVectors(wrapper.position, cameraPos).normalize();
      const dot = forward3D.dot(_v1);
      if (dot < 0.3) continue;
      bestKey = key; bestWrapper = wrapper; bestDist = d;
    }
    if (!bestWrapper) return null;

    const body = this.bodyMap[bestKey];
    if (body) physicsWorld.removeBody(body);
    for (let i = this.constraints.length - 1; i >= 0; i--) {
      const c = this.constraints[i];
      if (c.bodyA === body || c.bodyB === body) {
        physicsWorld.removeConstraint(c);
        this.constraints.splice(i, 1);
      }
    }
    delete this.bodyMap[bestKey];
    delete this.wrapperMap[bestKey];
    const wi = this.wrappers.indexOf(bestWrapper);
    if (wi >= 0) this.wrappers.splice(wi, 1);
    const pi = this.pieces.findIndex(p => p.key === bestKey);
    if (pi >= 0) this.pieces.splice(pi, 1);

    // Músculos "esquecem" o membro
    if (this.muscles) this.muscles.forget(bestKey);

    return {
      mesh: bestWrapper,
      size: new THREE.Vector3(0.2, 0.2, 0.2),
      key: bestKey,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        6 + Math.random() * 4,
        (Math.random() - 0.5) * 8
      ),
      angularVelocity: new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      ),
    };
  }

  applyImpulse(worldPos, dir, force) {
    let nearest = null, nearestDist = Infinity;
    for (const key in this.bodyMap) {
      const b = this.bodyMap[key];
      const dx = b.position.x - worldPos.x;
      const dy = b.position.y - worldPos.y;
      const dz = b.position.z - worldPos.z;
      const d = dx*dx + dy*dy + dz*dz;
      if (d < nearestDist) { nearestDist = d; nearest = b; }
    }
    if (!nearest) return;
    const f = Math.min(6, force);
    const imp = new CANNON.Vec3(
      dir.x * f * nearest.mass,
      dir.y * f * nearest.mass,
      dir.z * f * nearest.mass
    );
    nearest.applyImpulse(imp, new CANNON.Vec3(0, 0, 0));
    this.lastHitTime = performance.now() / 1000;
    this.state = 'falling'; this.settleStart = 0;

    // Reforça músculos por 0.4s (reação de "levar um soco")
    if (this.muscles) {
      this.muscles.timer = 0;      // reset fase → volta pra BALANCE
      this.muscles.phase = 'balance';
      this.muscles.strength = 0.7; // reação de meio-termo
    }

    for (const b of this.bodies) b.wakeUp();
  }

  update(dt) {
    this._life += dt;

    if (this.state === 'fading') {
      this.fadeProgress += dt / 1.5;
      const op = Math.max(0, 1 - this.fadeProgress);
      for (const w of this.wrappers) {
        w.traverse(c => {
          if (!c.material) return;
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) { m.transparent = true; m.opacity = op; }
        });
      }
      return this.fadeProgress >= 1;
    }

    // Aplica músculos antes do próximo step
    if (this.muscles) this.muscles.update(dt);

    let allAsleep = true;
    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const wrapper = this.wrapperMap[key];
      if (!body || !wrapper) continue;

      wrapper.position.x += (body.position.x - wrapper.position.x) * 0.7;
      wrapper.position.y += (body.position.y - wrapper.position.y) * 0.7;
      wrapper.position.z += (body.position.z - wrapper.position.z) * 0.7;
      wrapper.quaternion.slerp(
        new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w),
        0.7
      );

      const piece = this.pieces.find(p => p.key === key);
      if (piece) {
        piece.velocity.set(body.velocity.x, body.velocity.y, body.velocity.z);
        piece.angularVelocity.set(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z);
        piece.settled = (body.sleepState === CANNON.Body.SLEEPING);
      }
      if (body.sleepState !== CANNON.Body.SLEEPING) allAsleep = false;
    }

    if (this.state === 'falling' && allAsleep) {
      this.state = 'settled';
      this.settleStart = performance.now() / 1000;
    }

    if (this.state === 'settled') {
      const elapsed = performance.now() / 1000 - this.settleStart;
      const sinceHit = performance.now() / 1000 - this.lastHitTime;
      if (elapsed > 18 && sinceHit > 18) {
        if (!this._fadeFired && this.onFadeStart) {
          const torso = this.wrapperMap['torso'];
          if (torso) this.onFadeStart(torso.position.clone());
          this._fadeFired = true;
        }
        this.state = 'fading';
        this.fadeProgress = 0;
      }
    }

    if (this._life > this._maxLife) {
      this.state = 'fading';
      this.fadeProgress = 1;
    }

    return false;
  }

  dispose() {
    for (const key in this.bodyMap) {
      const b = this.bodyMap[key];
      if (b) physicsWorld.removeBody(b);
    }
    for (const c of this.constraints) {
      physicsWorld.removeConstraint(c);
    }
    for (const w of this.wrappers) {
      if (w.parent) w.parent.remove(w);
    }
    this.bodyMap = {};
    this.wrapperMap = {};
    this.bodies = [];
    this.wrappers = [];
    this.constraints = [];
    this.pieces = [];
  }
}
