import * as THREE from 'three';

// ============================================================
// CONSTRAINED RAGDOLL — inspirado no comportamento do Zumbi Blocks 2
// Peças ficam presas ao torso por restrições de distância.
// O corpo colapsa junto, não explode.
// ============================================================

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

const GROUND_Y = 0;
const GRAVITY = 22;

const CONSTRAINT_ITERATIONS = 4;
const CONSTRAINT_STIFFNESS  = 0.65;  // quão duro o "elástico" entre ossos é
const CONSTRAINT_DAMPING    = 0.30;  // amortecimento da velocidade relativa
const ANGULAR_DAMP_GROUND   = 0.86;
const ANGULAR_DAMP_AIR      = 0.985;
const LINEAR_DAMP_GROUND    = 0.82;
const LINEAR_DAMP_AIR       = 0.995;

// ------------------------------------------------------------
// BONE — um pedaço físico. Compatível com a interface de Debris.
// ------------------------------------------------------------
export class RagdollBone {
  constructor(key, mesh, mass, radius, parentKey) {
    this.key = key;
    this.mesh = mesh;
    this.mass = mass;
    this.radius = radius;
    this.parentKey = parentKey;
    this.parentBone = null;

    this.velocity        = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.restOffset      = new THREE.Vector3();
    this.restOffsetLen   = 0;

    this.settled     = false;
    this.settleTimer = 0;

    // Compatibilidade com o sistema de debris (colisão zumbi-debris)
    this.size           = new THREE.Vector3(radius * 2, radius * 2, radius * 2);
    this.lastHitZombie  = new Map();
    this.lastGlobalHit  = 0;
  }
  // No-op: física é centralizada no ConstrainedRagdoll
  update(_dt) { return false; }
  dispose() {}
  get position() { return this.mesh.position; }
}

// ------------------------------------------------------------
// CONSTRINED RAGDOLL — gerencia todas as bones + constraints
// ------------------------------------------------------------
export class Ragdoll {
  constructor(zombieMesh, hitDir, hitStrength, missingParts, world) {
    this.world  = world || { wallColliders: [], furnitureColliders: [] };
    this.bones  = [];
    this.boneMap = {};
    this.pieces = this.bones; // compat com o resto do game.js

    this.state        = 'falling';
    this.settleStart  = 0;
    this.fadeProgress = 0;
    this.lastHitTime  = performance.now() / 1000;

    this.onFadeStart   = null;   // callback(pos) → game.js spawna blood pool
    this._fadeFired    = false;
    this._life         = 0;
    this._maxLife      = 60;

    this._buildBones(zombieMesh, missingParts);
    this._linkParents();
    this._applyInitialImpulse(hitDir, hitStrength);
  }

  // ============================================================
  // EXTRAÇÃO — tira os pedaços do zumbi e os coloca na cena
  // ============================================================
  _buildBones(zombieMesh, missingParts) {
    const ud = zombieMesh.userData;
    const defs = [
      { key:'head',  obj:ud.head,  mass:2.5, radius:0.11, parentKey:'torso' },
      { key:'armL',  obj:ud.armL,  mass:0.9, radius:0.06, parentKey:'torso' },
      { key:'armR',  obj:ud.armR,  mass:0.9, radius:0.06, parentKey:'torso' },
      { key:'legL',  obj:ud.legL,  mass:1.3, radius:0.09, parentKey:'torso' },
      { key:'legR',  obj:ud.legR,  mass:1.3, radius:0.09, parentKey:'torso' },
      { key:'torso', obj:ud.torso, mass:8.0, radius:0.13, parentKey:null    },
    ];
    // Extrair do mais "folha" pro mais "raiz", senão removemos parentes antes
    const order = ['head', 'armL', 'armR', 'legL', 'legR', 'torso'];
    const defMap = Object.fromEntries(defs.map(d => [d.key, d]));

    for (const key of order) {
      const def = defMap[key];
      if (!def || !def.obj) continue;
      if (missingParts && missingParts[key]) continue;

      const obj = def.obj;
      obj.updateMatrixWorld(true);
      obj.getWorldPosition(_v1);
      obj.getWorldQuaternion(_q1);

      if (obj.parent) obj.parent.remove(obj);
      obj.position.copy(_v1);
      obj.quaternion.copy(_q1);
      scene_add(obj);

      const bone = new RagdollBone(key, obj, def.mass, def.radius, def.parentKey);
      this.bones.push(bone);
      this.boneMap[key] = bone;
    }
  }

  _linkParents() {
    for (const bone of this.bones) {
      if (!bone.parentKey) continue;
      const parent = this.boneMap[bone.parentKey];
      if (!parent) continue;
      bone.parentBone = parent;
      bone.restOffset.subVectors(bone.mesh.position, parent.mesh.position);
      bone.restOffsetLen = bone.restOffset.length();
      if (bone.restOffsetLen < 0.001) bone.restOffsetLen = 0.35;
    }
  }

  // ============================================================
  // IMPULSO INICIAL — empurra o corpo inteiro na direção do hit
  // e dá um giro natural, mas mantém tudo junto.
  // ============================================================
  _applyInitialImpulse(hitDir, hitStrength) {
    const dir = hitDir.clone(); dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
    dir.normalize();

    const base = Math.min(2.5, Math.max(0.6, hitStrength)) * 3.5;
    for (const bone of this.bones) {
      const factor = 1 / Math.sqrt(bone.mass);  // peças leves voam mais
      // empurra na direção do hit
      bone.velocity.x += dir.x * base * factor + (Math.random()-0.5) * 1.2;
      bone.velocity.z += dir.z * base * factor + (Math.random()-0.5) * 1.2;
      bone.velocity.y += 1.5 * factor + Math.random() * 1.5;
      // rotação inicial
      bone.angularVelocity.set(
        (Math.random()-0.5) * 6,
        (Math.random()-0.5) * 6,
        (Math.random()-0.5) * 6
      );
      // Caos vertical do torso é reduzido (fica mais firme no chão)
      if (bone.key === 'torso') {
        bone.velocity.x *= 0.5;
        bone.velocity.z *= 0.5;
        bone.velocity.y *= 0.4;
      }
    }
  }

  // ============================================================
  // IMPULSO EXTERNO — chamado quando uma peça (debris) bate nele
  // ============================================================
  applyImpulse(worldPos, dir, force) {
    let nearest = null, nearestDist = Infinity;
    for (const bone of this.bones) {
      if (bone.settled) continue;
      const d = bone.mesh.position.distanceToSquared(worldPos);
      if (d < nearestDist) { nearestDist = d; nearest = bone; }
    }
    if (!nearest) return;
    const f = Math.min(6, force);
    const invMass = 1 / nearest.mass;
    nearest.velocity.addScaledVector(dir, f * invMass);
    nearest.velocity.y += f * 0.3 * invMass;
    nearest.angularVelocity.x += (Math.random()-0.5) * f * 0.8;
    nearest.angularVelocity.y += (Math.random()-0.5) * f * 0.8;
    nearest.angularVelocity.z += (Math.random()-0.5) * f * 0.8;
    this.lastHitTime = performance.now() / 1000;
    this.state = 'falling'; this.settleStart = 0;
    for (const b of this.bones) b.settleTimer = 0;
  }

  // ============================================================
  // SLICE — melee corta um pedaço. Retorna info pra game.js criar Debris.
  // ============================================================
  sliceAt(cameraPos, forward3D, range) {
    if (this.state === 'fading') return null;
    let best = null, bestScore = -Infinity;
    for (const bone of this.bones) {
      if (bone.key === 'torso') continue; // torso não desmembra
      const to = _v1.subVectors(bone.mesh.position, cameraPos);
      const dist = to.length();
      if (dist > range) continue;
      to.normalize();
      const dot = forward3D.dot(to);
      if (dot < 0.25) continue;
      const score = dot - dist * 0.05;
      if (score > bestScore) { bestScore = score; best = bone; }
    }
    if (!best) return null;

    // Remove da lista
    const idx = this.bones.indexOf(best);
    if (idx >= 0) this.bones.splice(idx, 1);
    delete this.boneMap[best.key];
    for (const b of this.bones) {
      if (b.parentBone === best) b.parentBone = null;
    }

    // Extrai wrapper / pos / rot
    const mesh = best.mesh;
    const size = best.size.clone();
    const dir = _v2.subVectors(mesh.position, cameraPos); dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    dir.normalize();

    const outVelocity = new THREE.Vector3(
      dir.x * 12 + (Math.random()-0.5) * 6,
      6 + Math.random() * 5,
      dir.z * 12 + (Math.random()-0.5) * 6
    );
    const outAngular = new THREE.Vector3(
      (Math.random()-0.5) * 35,
      (Math.random()-0.5) * 35,
      (Math.random()-0.5) * 35
    );

    this.lastHitTime = performance.now() / 1000;
    this.state = 'falling'; this.settleStart = 0;
    for (const b of this.bones) b.settleTimer = 0;

    return { mesh, size, key: best.key, velocity: outVelocity, angularVelocity: outAngular };
  }

  // ============================================================
  // UPDATE PRINCIPAL
  // ============================================================
  update(dt) {
    this._life += dt;

    // Estado: FADING → só esmaece
    if (this.state === 'fading') {
      this.fadeProgress += dt / 1.5;
      const op = Math.max(0, 1 - this.fadeProgress);
      for (const bone of this.bones) {
        bone.mesh.traverse(c => {
          if (!c.material) return;
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          for (const m of mats) { m.transparent = true; m.opacity = op; }
        });
      }
      return this.fadeProgress >= 1;
    }

    // 1. Integrar
    for (const bone of this.bones) {
      if (bone.settled) continue;
      bone.velocity.y -= GRAVITY * dt;

      const grounded = (bone.mesh.position.y - bone.radius) <= GROUND_Y + 0.02;
      const linDamp = grounded ? LINEAR_DAMP_GROUND : LINEAR_DAMP_AIR;
      const angDamp = grounded ? ANGULAR_DAMP_GROUND : ANGULAR_DAMP_AIR;

      bone.velocity.multiplyScalar(linDamp);
      bone.mesh.position.addScaledVector(bone.velocity, dt);

      // Integra rotação
      const angSpeed = bone.angularVelocity.length();
      if (angSpeed > 0.001) {
        _v1.copy(bone.angularVelocity).multiplyScalar(1 / angSpeed);
        _q1.setFromAxisAngle(_v1, angSpeed * dt);
        bone.mesh.quaternion.multiply(_q1);
        bone.mesh.quaternion.normalize();
      }
      bone.angularVelocity.multiplyScalar(angDamp);
    }

    // 2. Constraint solver
    for (let iter = 0; iter < CONSTRAINT_ITERATIONS; iter++) {
      for (const bone of this.bones) {
        const parent = bone.parentBone;
        if (!parent) continue;
        if (bone.settled && parent.settled) continue;

        _v1.subVectors(bone.mesh.position, parent.mesh.position);
        const dist = _v1.length();
        if (dist < 0.0001) continue;

        const error = dist - bone.restOffsetLen;
        if (Math.abs(error) > 0.001) {
          _v1.multiplyScalar(1 / dist);

          const totalMass = bone.mass + parent.mass;
          const wBone   = parent.mass / totalMass;
          const wParent = bone.mass   / totalMass;

          const correction = error * CONSTRAINT_STIFFNESS;
          bone.mesh.position.addScaledVector(_v1, -correction * wBone);
          parent.mesh.position.addScaledVector(_v1, correction * wParent);

          // Amortecer velocidade relativa ao longo do eixo
          _v2.subVectors(bone.velocity, parent.velocity);
          const vRel = _v2.dot(_v1);
          const impulse = -vRel * CONSTRAINT_DAMPING;
          bone.velocity.addScaledVector(_v1, impulse * wBone);
          parent.velocity.addScaledVector(_v1, -impulse * wParent);
        }
      }
    }

    // 3. Colisão com chão + paredes
    for (const bone of this.bones) {
      if (bone.settled) continue;
      this._groundCollide(bone);
      this._wallCollide(bone);
    }

    // 4. Settle detection
    let allSettled = true;
    for (const bone of this.bones) {
      if (bone.settled) continue;
      const vSq = bone.velocity.lengthSq();
      const aSq = bone.angularVelocity.lengthSq();
      if (vSq < 0.09 && aSq < 0.18) {
        bone.settleTimer += dt;
        if (bone.settleTimer > 0.55) {
          bone.settled = true;
          bone.velocity.set(0, 0, 0);
          bone.angularVelocity.set(0, 0, 0);
        }
      } else {
        bone.settleTimer = 0;
      }
      if (!bone.settled) allSettled = false;
    }

    if (this.state === 'falling' && allSettled) {
      this.state = 'settled';
      this.settleStart = performance.now() / 1000;
    }

    // 5. Fade quando settleTime passou
    if (this.state === 'settled') {
      const elapsed = performance.now() / 1000 - this.settleStart;
      const sinceHit = performance.now() / 1000 - this.lastHitTime;
      if (elapsed > 20 && sinceHit > 20) {
        if (!this._fadeFired && this.onFadeStart) {
          const torso = this.boneMap['torso'] || this.bones[0];
          if (torso) this.onFadeStart(torso.mesh.position.clone());
          this._fadeFired = true;
        }
        this.state = 'fading';
        this.fadeProgress = 0;
      }
    }

    // 6. Hard cap de vida
    if (this._life > this._maxLife) {
      this.state = 'fading';
      this.fadeProgress = 1;
    }

    return false;
  }

  _groundCollide(bone) {
    const minY = bone.radius;
    if (bone.mesh.position.y < minY) {
      bone.mesh.position.y = minY;
      if (bone.velocity.y < 0) bone.velocity.y = -bone.velocity.y * 0.15;
      bone.velocity.x *= 0.75;
      bone.velocity.z *= 0.75;
      bone.angularVelocity.multiplyScalar(0.85);
    }
  }

  _wallCollide(bone) {
    const r = bone.radius;
    const p = bone.mesh.position;
    const colliders = this.world.wallColliders;
    const furniture = this.world.furnitureColliders;
    if (colliders) this._resolveBoxes(p, r, colliders);
    if (furniture) this._resolveBoxes(p, r, furniture);
  }

  _resolveBoxes(pos, radius, boxes) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (pos.x + radius < b.minX || pos.x - radius > b.maxX) continue;
      if (pos.z + radius < b.minZ || pos.z - radius > b.maxZ) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 > radius * radius) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        pos.x = cx + nx * radius;
        pos.z = cz + nz * radius;
      } else {
        const exL = Math.abs(pos.x - b.minX), exR = Math.abs(b.maxX - pos.x);
        const ezU = Math.abs(pos.z - b.minZ), ezD = Math.abs(b.maxZ - pos.z);
        const m = Math.min(exL, exR, ezU, ezD);
        if (m === exL) pos.x = b.minX - radius;
        else if (m === exR) pos.x = b.maxX + radius;
        else if (m === ezU) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }

  dispose() {
    for (const bone of this.bones) {
      if (bone.mesh.parent) bone.mesh.parent.remove(bone.mesh);
    }
    this.bones.length = 0;
  }
}

// Precisamos adicionar à cena — mas o módulo não tem acesso direto.
// Solução: game.js registra a cena via initRagdollScene().
let _scene = null;
export function initRagdollScene(sceneRef) { _scene = sceneRef; }
function scene_add(obj) {
  if (_scene) _scene.add(obj);
}
