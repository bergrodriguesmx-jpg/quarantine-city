import * as THREE from 'three';
import * as CANNON from 'cannon-es';

let physicsWorld = null;
let sceneRef = null;

const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _scratchQ = new THREE.Quaternion();

// Scratch CANNON (zero alloc por frame)
const _cVec1 = new CANNON.Vec3();
const _cVec2 = new CANNON.Vec3();
const _cVec3 = new CANNON.Vec3();
const UP = new CANNON.Vec3(0, 1, 0);
const DOWN = new CANNON.Vec3(0, -1, 0);

export function initPhysics(scene) {
  if (physicsWorld) return physicsWorld;
  sceneRef = scene;
  physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.allowSleep = true;
  physicsWorld.solver.iterations = 8;
  physicsWorld.solver.tolerance = 0.01;

  const groundMat = new CANNON.Material('ground');
  const limbMat = new CANNON.Material('limb');
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(groundMat, limbMat, {
    friction: 0.95,
    restitution: 0.0,
  }));
  physicsWorld.addContactMaterial(new CANNON.ContactMaterial(limbMat, limbMat, {
    friction: 0.75,
    restitution: 0.02,
  }));
  physicsWorld.defaultContactMaterial.friction = 0.95;
  physicsWorld.defaultContactMaterial.restitution = 0.0;

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
// Definição de ossos — SHAPES FIXOS (nada de Box3 traversal)
// ============================================================
const BONE_DEFS = {
  torso: { mass: 22, half: [0.17, 0.24, 0.11], pivot: null },
  head:  { mass: 4.5, half: [0.11, 0.13, 0.11], pivot: 'neck' },
  armL:  { mass: 3.0, half: [0.06, 0.20, 0.06], pivot: 'shoulderL' },
  armR:  { mass: 3.0, half: [0.06, 0.20, 0.06], pivot: 'shoulderR' },
  legL:  { mass: 5.5, half: [0.09, 0.24, 0.09], pivot: 'hipL' },
  legR:  { mass: 5.5, half: [0.09, 0.24, 0.09], pivot: 'hipR' },
};

const ORDER = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];

// Shapes cacheados (immutable, compartilhados entre todos os ragdolls)
const SHAPE_CACHE = {};
function getShape(key) {
  if (!SHAPE_CACHE[key]) {
    const d = BONE_DEFS[key].half;
    SHAPE_CACHE[key] = new CANNON.Box(new CANNON.Vec3(d[0], d[1], d[2]));
  }
  return SHAPE_CACHE[key];
}

// ============================================================
// Muscle System — corpo tenta ficar em pé por X segundos
// Puro torque, sem constraints. Sem alocação por frame.
// ============================================================
class MuscleSystem {
  constructor(ragdoll) {
    this.ragdoll = ragdoll;
    this.timer = 0;
    // Força muscular por osso
    this.strength = {
      torso: 1.0,
      head:  0.9,
      armL:  0.35,
      armR:  0.35,
      legL:  0.85,
      legR:  0.85,
    };
    this.Kp = 55;
    this.Kd = 6;
  }

  update(dt) {
    this.timer += dt;

    // Fade: 0-0.7s força total, 0.7-1.5s decai, >1.5s desligado
    let fade = 1;
    if (this.timer > 0.7) {
      fade = Math.max(0, 1 - (this.timer - 0.7) / 0.8);
    }
    if (fade <= 0.01) return;

    const map = this.ragdoll.bodyMap;

    for (const key in map) {
      const body = map[key];
      const s = this.strength[key];
      if (!s) continue;

      // Eixo Y local do corpo, em coords de mundo
      const curUp = body.quaternion.vmult(UP, _cVec1);

      // cross(curUp, UP) — eixo pra girar curUp em direção a UP
      const cx = curUp.y * UP.z - curUp.z * UP.y;
      const cy = curUp.z * UP.x - curUp.x * UP.z;
      const cz = curUp.x * UP.y - curUp.y * UP.x;
      const sinA = Math.sqrt(cx*cx + cy*cy + cz*cz);

      if (sinA < 0.001) continue;

      const invLen = 1 / sinA;
      const nx = cx * invLen, ny = cy * invLen, nz = cz * invLen;

      // Aproximação do ângulo
      const angle = Math.asin(Math.min(1, sinA));

      // Damping angular (usa magnitude, sem normalizar)
      const w = body.angularVelocity;
      const angSpeed = Math.sqrt(w.x*w.x + w.y*w.y + w.z*w.z);

      const torqueMag = (this.Kp * angle - this.Kd * angSpeed) * s * fade;
      if (torqueMag <= 0) continue;

      body.torque.x += nx * torqueMag;
      body.torque.y += ny * torqueMag;
      body.torque.z += nz * torqueMag;

      if (body.sleepState === CANNON.Body.SLEEPING) body.wakeUp();
    }
  }

  forget(key) {
    delete this.strength[key];
  }
}

// ============================================================
// Ragdoll
// ============================================================
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
    this.muscles = new MuscleSystem(this);
  }

  _build(zombieMesh, hitDir, hitStrength, missingParts) {
    const ud = zombieMesh.userData;
    zombieMesh.updateMatrixWorld(true);

    // ---------- 1) Extrair meshes ----------
    const parts = {};
    for (const key of ORDER) {
      const obj = (key === 'torso') ? ud.torso : ud[key];
      if (!obj) continue;
      if (missingParts && missingParts[key]) {
        if (obj.parent) obj.parent.remove(obj);
        continue;
      }

      obj.getWorldPosition(_v1);
      obj.getWorldQuaternion(_q1);

      // Guarda pivô em local do pai (se houver)
      let pivotInParent = null;
      const parentObj = obj.parent;
      if (parentObj && key !== 'torso') {
        parentObj.updateMatrixWorld(true);
        const parentQ = new THREE.Quaternion();
        parentObj.getWorldQuaternion(parentQ);
        const parentP = new THREE.Vector3();
        parentObj.getWorldPosition(parentP);
        const invPQ = parentQ.clone().invert();
        const rel = new THREE.Vector3().subVectors(_v1, parentP).applyQuaternion(invPQ);
        pivotInParent = new CANNON.Vec3(rel.x, rel.y, rel.z);
      }

      if (obj.parent) obj.parent.remove(obj);
      obj.position.set(0, 0, 0);
      obj.quaternion.set(0, 0, 0, 1);

      const wrapper = new THREE.Group();
      wrapper.position.copy(_v1);
      wrapper.quaternion.copy(_q1);
      if (sceneRef) sceneRef.add(wrapper);
      wrapper.add(obj);

      parts[key] = {
        wrapper,
        pos: _v1.clone(),
        quat: _q1.clone(),
        pivotInParent,
      };
    }

    if (zombieMesh.parent) zombieMesh.parent.remove(zombieMesh);

    // ---------- 2) Criar bodies (SEM adicionar ao mundo ainda) ----------
    for (const key of ORDER) {
      const part = parts[key];
      if (!part) continue;
      const def = BONE_DEFS[key];

      const body = new CANNON.Body({
        mass: def.mass,
        shape: getShape(key),
        position: new CANNON.Vec3(part.pos.x, part.pos.y, part.pos.z),
        quaternion: new CANNON.Quaternion(part.quat.x, part.quat.y, part.quat.z, part.quat.w),
        linearDamping: 0.25,
        angularDamping: 0.55,
        sleepSpeedLimit: 0.3,
        sleepTimeLimit: 0.6,
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

    // ---------- 3) Constraints (PointToPoint com pivô correto) ----------
    for (const key of ORDER) {
      const part = parts[key];
      if (!part) continue;
      if (key === 'torso') continue;
      const parentKey = 'torso';
      const parentBody = this.bodyMap[parentKey];
      const childBody = this.bodyMap[key];
      if (!parentBody || !childBody) continue;

      const pivotB = part.pivotInParent || new CANNON.Vec3(0, 0, 0);
      const pivotA = new CANNON.Vec3(0, 0, 0); // origem do filho é a junta

      const c = new CANNON.PointToPointConstraint(
        childBody, pivotA,
        parentBody, pivotB,
        1e7
      );
      this.constraints.push(c);
    }

    // ---------- 4) Impulso inicial pequeno ----------
    const dir = hitDir.clone(); dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
    dir.normalize();

    const strength = Math.min(2.5, Math.max(0.6, hitStrength));
    const base = strength * 1.4;

    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const w = (key === 'torso' ? 0.6 : 0.35);
      body.velocity.set(
        dir.x * base * w,
        (0.5 + Math.random() * 0.7) * w,
        dir.z * base * w
      );
      body.angularVelocity.set(
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.2
      );
    }

    // ---------- 5) Adicionar ao mundo EM LOTE ----------
    // Uma única passada de broadphase/solver rebuild
    for (let i = 0; i < this.bodies.length; i++) physicsWorld.addBody(this.bodies[i]);
    for (let i = 0; i < this.constraints.length; i++) physicsWorld.addConstraint(this.constraints[i]);
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
    nearest.velocity.x += dir.x * f;
    nearest.velocity.y += dir.y * f;
    nearest.velocity.z += dir.z * f;
    this.lastHitTime = performance.now() / 1000;
    this.state = 'falling'; this.settleStart = 0;
    // Reativa músculos (reação ao impacto)
    if (this.muscles) { this.muscles.timer = 0; }
    for (let i = 0; i < this.bodies.length; i++) this.bodies[i].wakeUp();
  }

  update(dt) {
    this._life += dt;

    if (this.state === 'fading') {
      this.fadeProgress += dt / 1.2;
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

    if (this.muscles) this.muscles.update(dt);

    let allAsleep = true;
    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const wrapper = this.wrapperMap[key];
      if (!body || !wrapper) continue;

      // Interpolação visual (evita tremor)
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
