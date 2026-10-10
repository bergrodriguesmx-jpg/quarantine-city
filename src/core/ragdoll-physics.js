import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ============================================================
// FÍSICA GLOBAL (Cannon) — compartilhada entre todos os ragdolls
// ============================================================
let physicsWorld = null;
let sceneRef = null;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

export function initPhysics(scene) {
  if (physicsWorld) return physicsWorld;
  sceneRef = scene;
  physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
  physicsWorld.allowSleep = true;
  physicsWorld.defaultContactMaterial.friction = 0.55;
  physicsWorld.defaultContactMaterial.restitution = 0.12;

  // Chão
  const ground = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: new CANNON.Material({ friction: 0.7, restitution: 0.08 }),
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
  while (physicsWorld.bodies.length > 1) {
    const b = physicsWorld.bodies[physicsWorld.bodies.length - 1];
    physicsWorld.removeBody(b);
  }
}

// ============================================================
// RAGDOLL FÍSICO — cabeça + torso + 2 braços + 2 pernas
// Ligados por PointToPointConstraints (juntas esféricas)
// ============================================================
export class Ragdoll {
  constructor(zombieMesh, hitDir, hitStrength, missingParts) {
    if (!physicsWorld) {
      console.warn('[ragdoll] physics não inicializada');
      return;
    }

    this.bodies      = [];
    this.bodyMap     = {};   // key -> CANNON.Body
    this.wrappers    = [];   // key -> THREE.Group (wrapper na cena)
    this.wrapperMap  = {};
    this.constraints = [];
    this.pieces      = [];   // compat com game.js (checkDebrisZombieCollision)
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

    const defs = [
      { key:'head',  obj:ud.head,  mass:2.5, parentKey:'torso' },
      { key:'armL',  obj:ud.armL,  mass:0.9, parentKey:'torso' },
      { key:'armR',  obj:ud.armR,  mass:0.9, parentKey:'torso' },
      { key:'legL',  obj:ud.legL,  mass:1.3, parentKey:'torso' },
      { key:'legR',  obj:ud.legR,  mass:1.3, parentKey:'torso' },
      { key:'torso', obj:ud.torso, mass:8.0, parentKey:null    },
    ];
    const order = ['head', 'armL', 'armR', 'legL', 'legR', 'torso'];
    const defMap = Object.fromEntries(defs.map(d => [d.key, d]));

    // Extrair
    for (const key of order) {
      const def = defMap[key];
      if (!def || !def.obj) continue;

      const obj = def.obj;
      if (missingParts && missingParts[key]) {
        if (obj.parent) obj.parent.remove(obj);
        continue;
      }

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

      // Wrapper no centro do box
      const wrapper = new THREE.Group();
      wrapper.position.copy(center);
      wrapper.quaternion.copy(_q1);
      if (sceneRef) sceneRef.add(wrapper);

      // Offset visual pra wrapper ser o "pivô"
      obj.position.sub(center);
      wrapper.add(obj);

      // Corpo físico
      const hx = Math.max(0.05, size.x * 0.5);
      const hy = Math.max(0.05, size.y * 0.5);
      const hz = Math.max(0.05, size.z * 0.5);
      const body = new CANNON.Body({
        mass: def.mass,
        shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
        position: new CANNON.Vec3(center.x, center.y, center.z),
        quaternion: new CANNON.Quaternion(_q1.x, _q1.y, _q1.z, _q1.w),
        linearDamping: 0.2,
        angularDamping: 0.3,
        sleepSpeedLimit: 0.18,
        sleepTimeLimit: 0.6,
        allowSleep: true,
      });
      body.userData = { key };
      physicsWorld.addBody(body);

      this.bodies.push(body);
      this.bodyMap[key] = body;
      this.wrappers.push(wrapper);
      this.wrapperMap[key] = wrapper;

      // "pieces" — compatibilidade com checkDebrisZombieCollision
      this.pieces.push({
        key,
        mesh: wrapper,
        mass: def.mass,
        size,
        settled: false,
        settleTimer: 0,
        velocity: new THREE.Vector3(),
        angularVelocity: new THREE.Vector3(),
        lastHitZombie: new Map(),
        lastGlobalHit: 0,
      });
    }

    // Remove mesh original
    if (zombieMesh.parent) zombieMesh.parent.remove(zombieMesh);

    // Criar constraints (juntas esféricas)
    for (const key in this.bodyMap) {
      const def = defMap[key];
      if (!def || !def.parentKey) continue;
      const child  = this.bodyMap[key];
      const parent = this.bodyMap[def.parentKey];
      if (!child || !parent) continue;

      // Ponto da junta: média dos centros ponderada pelas massas
      const c = child.position, p = parent.position;
      const totalMass = child.mass + parent.mass;
      const wC = parent.mass / totalMass;
      const wP = child.mass / totalMass;
      const jointX = c.x * wC + p.x * wP;
      const jointY = c.y * wC + p.y * wP;
      const jointZ = c.z * wC + p.z * wP;

      // Pivots no frame LOCAL de cada body
      const pivotA = new CANNON.Vec3(0, 0, 0);
      const pivotB = new CANNON.Vec3(0, 0, 0);
      child.pointToLocalFrame(new CANNON.Vec3(jointX, jointY, jointZ), pivotA);
      parent.pointToLocalFrame(new CANNON.Vec3(jointX, jointY, jointZ), pivotB);

      const constraint = new CANNON.PointToPointConstraint(
        child,  pivotA,
        parent, pivotB,
        1e6 // maxForce — rígido
      );
      physicsWorld.addConstraint(constraint);
      this.constraints.push(constraint);
    }

    // Impulso inicial
    const dir = hitDir.clone(); dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
    dir.normalize();

    const strength = Math.min(2.5, Math.max(0.6, hitStrength));
    const baseImpulse = strength * 3.2;

    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      // Braços/pernas levam mais impulso (leves), torso menos
      const w = (key === 'torso' ? 0.55 : 1.0);
      const imp = new CANNON.Vec3(
        dir.x * baseImpulse * body.mass * w,
        (1.2 + Math.random() * 1.6) * body.mass * w,
        dir.z * baseImpulse * body.mass * w
      );
      body.applyImpulse(imp, new CANNON.Vec3(0, 0, 0));
      body.angularVelocity.set(
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 7
      );
    }
  }

  // ------------------------------------------------------------
  // Fatiar (melee) — remove um membro e devolve info pro game.js
  // ------------------------------------------------------------
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
      if (dot < 0.25) continue;
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

    // Velocidade de saída pro Debris
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      6 + Math.random() * 4,
      (Math.random() - 0.5) * 8
    );
    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 25
    );

    return {
      mesh: bestWrapper,
      size: new THREE.Vector3(0.2, 0.2, 0.2),
      key: bestKey,
      velocity: vel,
      angularVelocity: angVel,
    };
  }

  // ------------------------------------------------------------
  // Impulso externo (debris bateu no corpo)
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // Update por frame — sync visual + detecção de settle + fade
  // ------------------------------------------------------------
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

    // Sync
    let allAsleep = true;
    for (const key in this.bodyMap) {
      const body = this.bodyMap[key];
      const wrapper = this.wrapperMap[key];
      if (!body || !wrapper) continue;

      wrapper.position.set(body.position.x, body.position.y, body.position.z);
      wrapper.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);

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
