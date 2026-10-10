import * as THREE from 'three';
import * as CANNON from 'cannon-es';

let physicsWorld = null;
let sceneRef = null;

export function initPhysics(scene) {
  if (physicsWorld) return physicsWorld;
  sceneRef = scene;
  physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.allowSleep = true;
  physicsWorld.solver.iterations = 12;
  physicsWorld.solver.tolerance = 0.001;

  // Contato duro com o chão (menos deslizamento)
  const groundMat = new CANNON.Material('ground');
  const limbMat = new CANNON.Material('limb');
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(groundMat, limbMat, {
    friction: 0.85,
    restitution: 0.04,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
  }));
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(limbMat, limbMat, {
    friction: 0.6,
    restitution: 0.05,
  }));
  physicsWorld.defaultContactMaterial.friction = 0.85;
  physicsWorld.defaultContactMaterial.restitution = 0.04;

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
// RAGDOLL ESTILO ZUMBI BLOCKS 2
// - Massas realistas em escala de zumbi
// - HingeConstraints para cotovelos e joelhos (dobram 1 sentido)
// - PointToPoint para pescoço (rotação livre)
// - Damping angular alto (membros param de girar)
// - Sleep rápido quando estável
// - Atrito alto com o chão
// ============================================================

const BONE_DEFS = {
  torso: { mass: 22, halfExtents: [0.18, 0.22, 0.12] },
  head:  { mass: 4.5, halfExtents: [0.11, 0.12, 0.11] },
  armL:  { mass: 3.0, halfExtents: [0.06, 0.18, 0.06] },
  armR:  { mass: 3.0, halfExtents: [0.06, 0.18, 0.06] },
  legL:  { mass: 5.5, halfExtents: [0.08, 0.22, 0.08] },
  legR:  { mass: 5.5, halfExtents: [0.08, 0.22, 0.08] },
};

const ORDER = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

// Ponto de junção em coordenadas locais (aproximado)
const JOINT_LOCAL = {
  neck:      { torso: new CANNON.Vec3(0,  0.22, 0), head:  new CANNON.Vec3(0, -0.12, 0) },
  shoulderL: { torso: new CANNON.Vec3(-0.18, 0.12, 0), armL: new CANNON.Vec3(0, 0.18, 0) },
  shoulderR: { torso: new CANNON.Vec3( 0.18, 0.12, 0), armR: new CANNON.Vec3(0, 0.18, 0) },
  hipL:      { torso: new CANNON.Vec3(-0.09, -0.14, 0), legL: new CANNON.Vec3(0, 0.22, 0) },
  hipR:      { torso: new CANNON.Vec3( 0.09, -0.14, 0), legR: new CANNON.Vec3(0, 0.22, 0) },
};

const HINGE_AXIS = new CANNON.Vec3(1, 0, 0);

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
  }

  _build(zombieMesh, hitDir, hitStrength, missingParts) {
    const ud = zombieMesh.userData;
    zombieMesh.updateMatrixWorld(true);

    // --- 1) Extrair meshes e criar wrappers ---
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

    // --- 2) Criar bodies com massa realista ---
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
        linearDamping: 0.35,
        angularDamping: 0.55,
        sleepSpeedLimit: 0.25,
        sleepTimeLimit: 0.5,
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

    // --- 3) Criar constraints ---
    const makeP2P = (parentKey, childKey, jointName) => {
      const parent = this.bodyMap[parentKey];
      const child  = this.bodyMap[childKey];
      if (!parent || !child) return null;
      const jl = JOINT_LOCAL[jointName];
      if (!jl) return null;
      const c = new CANNON.PointToPointConstraint(
        child,  jl[childKey],
        parent, jl[parentKey],
        1e7
      );
      physicsWorld.addConstraint(c);
      this.constraints.push(c);
      return c;
    };

    const makeHinge = (parentKey, childKey, jointName, axisLocal) => {
      const parent = this.bodyMap[parentKey];
      const child  = this.bodyMap[childKey];
      if (!parent || !child) return null;
      const jl = JOINT_LOCAL[jointName];
      if (!jl) return null;
      const axis = axisLocal || HINGE_AXIS;
      const c = new CANNON.HingeConstraint(child, parent, {
        pivotA: jl[childKey],
        pivotB: jl[parentKey],
        axisA: axis,
        axisB: axis,
        maxForce: 1e7,
      });
      physicsWorld.addConstraint(c);
      this.constraints.push(c);
      return c;
    };

    makeP2P('torso', 'head', 'neck');
    makeHinge('torso', 'armL', 'shoulderL', new CANNON.Vec3(1, 0, 0));
    makeHinge('torso', 'armR', 'shoulderR', new CANNON.Vec3(1, 0, 0));
    makeHinge('torso', 'legL', 'hipL', new CANNON.Vec3(1, 0, 0));
    makeHinge('torso', 'legR', 'hipR', new CANNON.Vec3(1, 0, 0));

    // --- 4) Impulso inicial realista ---
    const dir = hitDir.clone(); dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
    dir.normalize();

    const strength = Math.min(2.5, Math.max(0.6, hitStrength));
    const baseImpulse = strength * 5.5;

    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const w = (key === 'torso' ? 0.35 : 1.0);
      const imp = new CANNON.Vec3(
        dir.x * baseImpulse * body.mass * w,
        (2.0 + Math.random() * 2.5) * body.mass * w,
        dir.z * baseImpulse * body.mass * w
      );
      body.applyImpulse(imp, new CANNON.Vec3(0, 0, 0));
      body.angularVelocity.set(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5
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
