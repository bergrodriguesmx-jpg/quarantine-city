import * as THREE from 'three';
import * as CANNON from 'cannon-es';

let physicsWorld = null;
let sceneRef = null;

// Scratch objects (zero allocation per frame)
const _scratchQ = new THREE.Quaternion();
const _scratchV = new THREE.Vector3();

export function initPhysics(scene) {
  if (physicsWorld) return physicsWorld;
  sceneRef = scene;
  physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.allowSleep = true;
  physicsWorld.solver.iterations = 8;
  physicsWorld.solver.tolerance = 0.01;

  const groundMat = new CANNON.Material('ground');
  const limbMat = new CANNON.Material('limb');
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(groundMat, limbMat, {
    friction: 0.9,
    restitution: 0.02,
  }));
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(limbMat, limbMat, {
    friction: 0.7,
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
  physicsWorld.step(1 / 60, dt, 3);
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
// Definição de massa e bounds por osso
// Bounds são FIXOS (não precisam ser computados do mesh)
// ============================================================
const BONE_DEFS = {
  torso: { mass: 20, half: [0.17, 0.24, 0.11] },
  head:  { mass: 4.0, half: [0.11, 0.13, 0.11] },
  armL:  { mass: 2.5, half: [0.06, 0.20, 0.06] },
  armR:  { mass: 2.5, half: [0.06, 0.20, 0.06] },
  legL:  { mass: 5.0, half: [0.09, 0.24, 0.09] },
  legR:  { mass: 5.0, half: [0.09, 0.24, 0.09] },
};

const ORDER = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];

const JOINT_LOCAL = {
  neck:      { parent: new CANNON.Vec3(0,  0.22, 0), child: new CANNON.Vec3(0, -0.12, 0) },
  shoulderL: { parent: new CANNON.Vec3(-0.18, 0.12, 0), child: new CANNON.Vec3(0, 0.18, 0) },
  shoulderR: { parent: new CANNON.Vec3( 0.18, 0.12, 0), child: new CANNON.Vec3(0, 0.18, 0) },
  hipL:      { parent: new CANNON.Vec3(-0.09, -0.14, 0), child: new CANNON.Vec3(0, 0.22, 0) },
  hipR:      { parent: new CANNON.Vec3( 0.09, -0.14, 0), child: new CANNON.Vec3(0, 0.22, 0) },
};

const AXIS_UP = new CANNON.Vec3(0, 1, 0);

// Shapes cacheados por osso — reutilizados entre ragdolls (immutable)
const SHAPE_CACHE = {};
function getShape(key) {
  if (!SHAPE_CACHE[key]) {
    const d = BONE_DEFS[key].half;
    SHAPE_CACHE[key] = new CANNON.Box(new CANNON.Vec3(d[0], d[1], d[2]));
  }
  return SHAPE_CACHE[key];
}

// ConeTwist configs por junta (immutable)
const JOINT_CONFIGS = [
  { parent: 'torso', child: 'head',  joint: 'neck',      angle: 0.7, twist: 0.5 },
  { parent: 'torso', child: 'armL',  joint: 'shoulderL', angle: 1.3, twist: 0.8 },
  { parent: 'torso', child: 'armR',  joint: 'shoulderR', angle: 1.3, twist: 0.8 },
  { parent: 'torso', child: 'legL',  joint: 'hipL',      angle: 1.1, twist: 0.4 },
  { parent: 'torso', child: 'legR',  joint: 'hipR',      angle: 1.1, twist: 0.4 },
];

export class Ragdoll {
  constructor(zombieMesh, hitDir, hitStrength, missingParts) {
    if (!physicsWorld) { console.warn('[ragdoll] physics não inicializada'); return; }

    this.bodyMap     = {};
    this.wrapperMap  = {};
    this.wrappers    = [];
    this.bodies      = [];
    this.constraints = [];
    this.pieces      = [];
    this.state       = 'falling';
    this.settleStart = 0;
    this.fadeProgress = 0;
    this.lastHitTime = performance.now() / 1000;
    this.onFadeStart = null;
    this._fadeFired  = false;
    this._life       = 0;
    this._maxLife    = 45;

    this._build(zombieMesh, hitDir, hitStrength, missingParts);
  }

  _build(zombieMesh, hitDir, hitStrength, missingParts) {
    const ud = zombieMesh.userData;
    zombieMesh.updateMatrixWorld(true);

    // --- 1) Extrair meshes SEM bounding box traversal ---
    // O truque: usamos a posição do próprio grupo e um shape fixo.
    // Não precisamos do tamanho real do mesh — o shape é fixo por osso.
    const parts = {};
    for (const key of ORDER) {
      const obj = (key === 'torso') ? ud.torso : ud[key];
      if (!obj) continue;
      if (missingParts && missingParts[key]) {
        if (obj.parent) obj.parent.remove(obj);
        continue;
      }

      const worldPos = new THREE.Vector3();
      const worldQ = new THREE.Quaternion();
      obj.getWorldPosition(worldPos);
      obj.getWorldQuaternion(worldQ);

      if (obj.parent) obj.parent.remove(obj);
      obj.position.set(0, 0, 0);
      obj.quaternion.set(0, 0, 0, 1);

      const wrapper = new THREE.Group();
      wrapper.position.copy(worldPos);
      wrapper.quaternion.copy(worldQ);
      if (sceneRef) sceneRef.add(wrapper);
      wrapper.add(obj);

      parts[key] = { wrapper, pos: worldPos, quat: worldQ };
    }

    if (zombieMesh.parent) zombieMesh.parent.remove(zombieMesh);

    // --- 2) Criar bodies com shapes cacheados ---
    for (const key of ORDER) {
      const part = parts[key];
      if (!part) continue;
      const def = BONE_DEFS[key];

      const body = new CANNON.Body({
        mass: def.mass,
        shape: getShape(key),
        position: new CANNON.Vec3(part.pos.x, part.pos.y, part.pos.z),
        quaternion: new CANNON.Quaternion(part.quat.x, part.quat.y, part.quat.z, part.quat.w),
        linearDamping: 0.20,
        angularDamping: 0.60,
        sleepSpeedLimit: 0.3,
        sleepTimeLimit: 0.5,
        allowSleep: true,
      });
      body.userData = { key };

      this.bodyMap[key] = body;
      this.wrapperMap[key] = part.wrapper;
      this.wrappers.push(part.wrapper);
      this.bodies.push(body);

      this.pieces.push({
        key,
        mesh: part.wrapper,
        mass: def.mass,
        size: new THREE.Vector3(def.half[0]*2, def.half[1]*2, def.half[2]*2),
        settled: false,
        settleTimer: 0,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        lastHitZombie: new Map(),
        lastGlobalHit: 0,
      });
    }

    // --- 3) Criar constraints ---
    for (const cfg of JOINT_CONFIGS) {
      const parent = this.bodyMap[cfg.parent];
      const child = this.bodyMap[cfg.child];
      if (!parent || !child) continue;
      const jl = JOINT_LOCAL[cfg.joint];
      const c = new CANNON.ConeTwistConstraint(child, parent, {
        pivotA: jl.child,
        pivotB: jl.parent,
        axisA: AXIS_UP,
        axisB: AXIS_UP,
        angle: cfg.angle,
        twistAngle: cfg.twist,
        maxForce: 1e7,
      });
      this.constraints.push(c);
    }

    // --- 4) Impulso inicial direcional (SEGURO) ---
    const dir = hitDir.clone(); dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
    dir.normalize();
    const strength = Math.min(2.5, Math.max(0.6, hitStrength));
    const base = strength * 1.8;

    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const w = (key === 'torso' ? 0.7 : 0.35);
      const ix = dir.x * base * body.mass * w;
      const iy = (0.6 + Math.random() * 0.8) * body.mass * w;
      const iz = dir.z * base * body.mass * w;
      // setVelocity evita alocação de applyImpulse
      body.velocity.set(
        body.velocity.x + ix / body.mass,
        body.velocity.y + iy / body.mass,
        body.velocity.z + iz / body.mass
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      );
    }

    // --- 5) ADICIONAR ao mundo em lote (depois de tudo pronto) ---
    // Isso reduz o custo do addBody × addConstraint
    for (const b of this.bodies) physicsWorld.addBody(b);
    for (const c of this.constraints) physicsWorld.addConstraint(c);
  }

  sliceAt(cameraPos, forward3D, range) {
    if (this.state === 'fading') return null;

    let bestKey = null, bestWrapper = null, bestDist = range;
    for (const key in this.wrapperMap) {
      if (key === 'torso') continue;
      const wrapper = this.wrapperMap[key];
      const d = cameraPos.distanceTo(wrapper.position);
      if (d > bestDist) continue;
      _scratchV.subVectors(wrapper.position, cameraPos).normalize();
      const dot = forward3D.dot(_scratchV);
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
    // Impulso direto na velocity (sem alocar CANNON.Vec3)
    nearest.velocity.x += dir.x * f;
    nearest.velocity.y += dir.y * f;
    nearest.velocity.z += dir.z * f;
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

    // Sync visual SEM alocar quaternions
    let allAsleep = true;
    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const wrapper = this.wrapperMap[key];
      if (!body || !wrapper) continue;

      wrapper.position.x += (body.position.x - wrapper.position.x) * 0.75;
      wrapper.position.y += (body.position.y - wrapper.position.y) * 0.75;
      wrapper.position.z += (body.position.z - wrapper.position.z) * 0.75;

      _scratchQ.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      wrapper.quaternion.slerp(_scratchQ, 0.75);

      const piece = this.pieces.find(p => p.key === key);
      if (piece) {
        piece.velocity.set(body.velocity.x, body.velocity.y, body.velocity.z);
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
      if (elapsed > 15 && sinceHit > 15) {
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
