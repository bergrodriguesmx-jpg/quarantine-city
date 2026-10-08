import * as THREE from 'three';
import * as Textures from './textures.js';
import * as Scenery from './scenery.js';
import * as Sfx from './audio.js';

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  player: {
    speed: 5.5,
    height: 1.7,
    maxHealth: 100,
    attackRange: 3.2,
    attackDamage: 25,
    attackCooldown: 0.4,
  },
  zombie: {
    speed: 1.9,
    maxHealth: 40,
    damage: 8,
    attackRange: 1.6,
    attackCooldown: 1.2,
    xpReward: 10,
    coinReward: 2,
    knockbackStagger: 0.25,
  },
  wave: {
    baseZombies: 6,
    zombiesPerWave: 2,
    maxZombies: 40,
    breakTime: 5,
  },
  arena: { size: 80 },
  ragdoll: {
    maxActive: 8,
    settleTime: 25,       // tempo parado antes de fade (com interação reseta)
    fadeDuration: 1.5,
    impactImpulse: 9,
    sliceRange: 3.5,
    sliceDotMin: 0.25,
  },
  crit: {
    baseChance: 0.15,
    damageMultiplier: 2,
  },
  dismember: {
    headChance: 0.65,
    armChance:  0.50,
    legChance:  0.40,
    limbSpeed:  14,
    limbLife:   10,
  },
};

// ============================================================
// ESTADO
// ============================================================
const state = {
  waveIntervalId: null,
  health: CONFIG.player.maxHealth,
  maxHealth: CONFIG.player.maxHealth,
  coins: 0,
  xp: 0,
  xpToNextLevel: 50,
  level: 1,
  wave: 0,
  zombiesAlive: 0,
  zombiesRemainingInWave: 0,
  running: false,
  betweenWaves: false,
  lastAttackTime: 0,
  keys: {},
  bobTime: 0,
  isMoving: false,
  startTime: 0,
  critChance: CONFIG.crit.baseChance,
};

// ============================================================
// THREE.JS SETUP
// ============================================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xC5E0F5, 60, 160);

const camera = new THREE.PerspectiveCamera(
  78, window.innerWidth / window.innerHeight, 0.1, 400
);
camera.position.set(0, CONFIG.player.height, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const skyGeo = new THREE.SphereGeometry(200, 32, 16);
const skyMat = new THREE.MeshBasicMaterial({
  map: Textures.skyTexture(), side: THREE.BackSide, fog: false,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(50, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0004;
scene.add(sun);

const fillLight = new THREE.DirectionalLight(0xC5E0F5, 0.35);
fillLight.position.set(-40, 30, -30);
scene.add(fillLight);

// ============================================================
// CHÃO / CENÁRIO
// ============================================================
function createFloor() {
  const size = CONFIG.arena.size;
  const tex = Textures.grassTexture();
  tex.repeat.set(size / 2, size / 2);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}
createFloor();
Scenery.populateScene(scene, CONFIG.arena.size);

const limit = CONFIG.arena.size / 2 - 2;
const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });
[
  { w: 1, h: 10, d: CONFIG.arena.size, x: -limit, z: 0 },
  { w: 1, h: 10, d: CONFIG.arena.size, x: limit, z: 0 },
  { w: CONFIG.arena.size, h: 10, d: 1, x: 0, z: -limit },
  { w: CONFIG.arena.size, h: 10, d: 1, x: 0, z: limit },
].forEach(({ w, h, d, x, z }) => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), invisibleMat);
  wall.position.set(x, h / 2, z);
  scene.add(wall);
});

// ============================================================
// VIEWMODEL
// ============================================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

function createKnifeViewModel() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.22, 0.06, 2, 4, 2),
    new THREE.MeshLambertMaterial({ color: 0x2C3E50 })
  );
  g.add(handle);
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.03, 0.08, 3, 1, 2),
    new THREE.MeshLambertMaterial({ color: 0x7F8C8D })
  );
  guard.position.set(0, 0.13, 0);
  g.add(guard);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.35, 0.02, 2, 5, 1),
    new THREE.MeshLambertMaterial({ color: 0xBDC3C7 })
  );
  blade.position.set(0, 0.32, 0);
  g.add(blade);
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.08, 0.02, 2, 2, 1),
    new THREE.MeshLambertMaterial({ color: 0xECF0F1 })
  );
  tip.position.set(0, 0.53, 0);
  g.add(tip);
  return g;
}

const knifeVM = createKnifeViewModel();
knifeVM.position.set(0.35, -0.35, -0.7);
knifeVM.rotation.set(-0.3, -0.4, 0.3);
weaponGroup.add(knifeVM);

let swingProgress = 0;
let swinging = false;
function triggerSwing() { swinging = true; swingProgress = 0; }

function updateWeaponViewModel(dt) {
  if (swinging) {
    swingProgress += dt * 5;
    if (swingProgress >= 1) {
      swinging = false;
      swingProgress = 0;
      knifeVM.position.set(0.35, -0.35, -0.7);
      knifeVM.rotation.set(-0.3, -0.4, 0.3);
    } else {
      const t = swingProgress;
      const arc = Math.sin(t * Math.PI);
      knifeVM.position.set(0.35 - arc * 0.4, -0.35 + arc * 0.15, -0.7 - arc * 0.15);
      knifeVM.rotation.set(-0.3 - arc * 0.6, -0.4 + arc * 0.8, 0.3 - arc * 0.5);
    }
  } else {
    const bob = Math.sin(state.bobTime) * 0.015;
    const bobX = Math.cos(state.bobTime * 0.5) * 0.01;
    knifeVM.position.x = 0.35 + (state.isMoving ? bobX : 0);
    knifeVM.position.y = -0.35 + (state.isMoving ? bob : 0);
  }
}

// ============================================================
// JOGADOR / HELPERS
// ============================================================
const player = {
  position: new THREE.Vector3(0, CONFIG.player.height, 0),
  yaw: 0,
  pitch: 0,
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function hexToCss(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
function makeBox(w, h, d) { return new THREE.BoxGeometry(w, h, d, 4, 4, 4); }
function makeJoint(size) { return new THREE.SphereGeometry(size, 8, 6); }

// ============================================================
// ZUMBIS
// ============================================================
const zombies = [];

const SHIRT_COLORS = [0x8E44AD, 0x2ECC71, 0xE74C3C, 0x3498DB, 0xF39C12];
const PANTS_COLORS = [0x8B5A2B, 0x5D4030, 0x3E2723];
const SKIN_COLORS  = [0x7BC950, 0x6BB840, 0x8DD65A];

function createZombieMesh() {
  const g = new THREE.Group();

  const skinColor  = rand(SKIN_COLORS);
  const shirtColor = rand(SHIRT_COLORS);
  const pantsColor = rand(PANTS_COLORS);

  const skinMat  = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
  const woundMat = new THREE.MeshBasicMaterial({ color: 0xC0392B });

  const faceTex = Textures.zombieHeadTexture(hexToCss(skinColor), false);
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTex });
  const headSideMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const headGeo = makeBox(0.55, 0.55, 0.55);
  const head = new THREE.Mesh(headGeo, [
    headSideMat, headSideMat, headSideMat, headSideMat, faceMat, headSideMat,
  ]);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);

  const hairMat = new THREE.MeshLambertMaterial({ color: 0x2C1810 });
  const hair = new THREE.Mesh(makeBox(0.58, 0.08, 0.58), hairMat);
  hair.position.y = 2.13;
  g.add(hair);
  const fringe = new THREE.Mesh(makeBox(0.58, 0.12, 0.1), hairMat);
  fringe.position.set(0, 2.05, 0.26);
  g.add(fringe);

  const earGeo = makeBox(0.06, 0.14, 0.1);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-0.31, 1.85, 0);
  g.add(earL);
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(0.31, 1.85, 0);
  g.add(earR);

  const torso = new THREE.Mesh(makeBox(0.7, 0.85, 0.35), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);

  const woundTorso1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), woundMat);
  woundTorso1.position.set(0.15, 1.2, 0.18);
  g.add(woundTorso1);
  const woundTorso2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), woundMat);
  woundTorso2.position.set(-0.2, 1.05, 0.18);
  g.add(woundTorso2);

  const collar = new THREE.Mesh(
    makeBox(0.55, 0.06, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x000000 })
  );
  collar.position.y = 1.58;
  g.add(collar);

  function makeArm(side) {
    const arm = new THREE.Group();
    const shoulder = new THREE.Mesh(makeJoint(0.13), shirtMat);
    shoulder.position.y = -0.05;
    arm.add(shoulder);
    const upper = new THREE.Mesh(makeBox(0.22, 0.4, 0.22), shirtMat);
    upper.position.y = -0.22;
    upper.castShadow = true;
    arm.add(upper);
    const elbow = new THREE.Mesh(makeJoint(0.1), skinMat);
    elbow.position.y = -0.44;
    arm.add(elbow);
    const lower = new THREE.Mesh(makeBox(0.2, 0.4, 0.2), skinMat);
    lower.position.y = -0.62;
    lower.castShadow = true;
    arm.add(lower);
    const hand = new THREE.Mesh(makeBox(0.22, 0.14, 0.24), skinMat);
    hand.position.y = -0.87;
    hand.castShadow = true;
    arm.add(hand);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(makeBox(0.04, 0.12, 0.04), skinMat);
      finger.position.set(-0.075 + i * 0.05, -0.99, 0.06);
      finger.castShadow = true;
      arm.add(finger);
    }
    const thumb = new THREE.Mesh(makeBox(0.05, 0.09, 0.05), skinMat);
    thumb.position.set(side * 0.1, -0.92, 0.1);
    arm.add(thumb);
    const wound = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), woundMat);
    wound.position.set(side * 0.11, -0.55, 0);
    wound.rotation.y = side * Math.PI / 2;
    arm.add(wound);
    return arm;
  }

  const armL = makeArm(-1);
  armL.position.set(-0.46, 1.5, 0);
  g.add(armL);
  const armR = makeArm(1);
  armR.position.set(0.46, 1.5, 0);
  g.add(armR);

  function makeLeg() {
    const leg = new THREE.Group();
    const hip = new THREE.Mesh(makeJoint(0.14), pantsMat);
    hip.position.y = 0;
    leg.add(hip);
    const upper = new THREE.Mesh(makeBox(0.26, 0.55, 0.26), pantsMat);
    upper.position.y = -0.28;
    upper.castShadow = true;
    leg.add(upper);
    const knee = new THREE.Mesh(makeJoint(0.11), pantsMat);
    knee.position.y = -0.56;
    leg.add(knee);
    const lower = new THREE.Mesh(makeBox(0.24, 0.4, 0.24), pantsMat);
    lower.position.y = -0.78;
    lower.castShadow = true;
    leg.add(lower);
    const shoeBase = new THREE.Mesh(makeBox(0.3, 0.14, 0.36), pantsMat);
    shoeBase.position.set(0, -1.02, 0.03);
    shoeBase.castShadow = true;
    leg.add(shoeBase);
    const shoeTip = new THREE.Mesh(makeBox(0.3, 0.08, 0.12), pantsMat);
    shoeTip.position.set(0, -1.05, 0.24);
    leg.add(shoeTip);
    const sole = new THREE.Mesh(
      makeBox(0.31, 0.03, 0.37),
      new THREE.MeshLambertMaterial({ color: 0xF0F0F0 })
    );
    sole.position.set(0, -1.1, 0.03);
    leg.add(sole);
    return leg;
  }

  const legL = makeLeg();
  legL.position.set(-0.18, 0.72, 0);
  g.add(legL);
  const legR = makeLeg();
  legR.position.set(0.18, 0.72, 0);
  g.add(legR);

  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.head = head;
  g.userData.torso = torso;
  g.userData.skinColor = skinColor;
  g.userData.shirtColor = shirtColor;
  g.userData.pantsColor = pantsColor;

  return g;
}

let groanTimer = 0;

function spawnZombie() {
  const s = CONFIG.arena.size / 2 - 5;
  const side = Math.floor(Math.random() * 4);
  let x, z;
  if (side === 0) { x = (Math.random() - 0.5) * s * 2; z = -s; }
  else if (side === 1) { x = (Math.random() - 0.5) * s * 2; z = s; }
  else if (side === 2) { x = -s; z = (Math.random() - 0.5) * s * 2; }
  else { x = s; z = (Math.random() - 0.5) * s * 2; }

  const mesh = createZombieMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);

  zombies.push({
    mesh,
    health: CONFIG.zombie.maxHealth,
    maxHealth: CONFIG.zombie.maxHealth,
    lastAttackTime: 0,
    walkPhase: Math.random() * Math.PI * 2,
    hitReactEndTime: 0,
    hitDirection: new THREE.Vector3(),
    dismembered: { head: false, armL: false, armR: false, legL: false, legR: false },
  });
  state.zombiesAlive++;
  updateHUD();
}

// ============================================================
// PARTÍCULAS DE SANGUE
// ============================================================
const particles = [];

function spawnBlood(position, direction = null, count = 16, big = false) {
  for (let i = 0; i < count; i++) {
    const size = (big ? 0.14 : 0.08) + Math.random() * 0.1;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.4 ? 0xC0392B : 0x8B0000,
      transparent: true, opacity: 1,
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(position);

    let vel;
    if (direction) {
      const spread = 0.7;
      const dir = direction.clone().normalize();
      const perp1 = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
      const a = (Math.random() - 0.5) * spread * 2;
      const b = (Math.random() - 0.5) * spread * 2;
      const speed = (big ? 7 : 4) + Math.random() * 5;
      vel = dir.clone().multiplyScalar(speed);
      vel.addScaledVector(perp1, a * speed * 0.5);
      vel.addScaledVector(perp2, b * speed * 0.5);
      vel.y += 2 + Math.random() * 3;
    } else {
      vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 4 + 2,
        (Math.random() - 0.5) * 6
      );
    }

    scene.add(p);
    particles.push({ mesh: p, vel, life: 1.1, maxLife: 1.1 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vel.y -= 16 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05) {
      p.mesh.position.y = 0.05;
      p.vel.y = -p.vel.y * 0.3;
      p.vel.x *= 0.7;
      p.vel.z *= 0.7;
    }
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    p.mesh.rotation.x += dt * 8;
    p.mesh.rotation.y += dt * 5;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

const bloodPools = [];

function spawnBloodPool(position) {
  const size = 0.7 + Math.random() * 0.5;
  const geo = new THREE.CircleGeometry(size, 12);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x6B0000, transparent: true, opacity: 0.75, depthWrite: false,
  });
  const pool = new THREE.Mesh(geo, mat);
  pool.rotation.x = -Math.PI / 2;
  pool.rotation.z = Math.random() * Math.PI * 2;
  pool.position.set(position.x, 0.03, position.z);
  pool.renderOrder = 1;
  scene.add(pool);
  bloodPools.push({ mesh: pool, life: 30 });
  if (bloodPools.length > 20) {
    const old = bloodPools.shift();
    scene.remove(old.mesh);
    old.mesh.geometry.dispose();
    old.mesh.material.dispose();
  }
}

function updateBloodPools(dt) {
  for (let i = bloodPools.length - 1; i >= 0; i--) {
    const b = bloodPools[i];
    b.life -= dt;
    if (b.life < 3) b.mesh.material.opacity = Math.max(0, (b.life / 3) * 0.75);
    if (b.life <= 0) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      bloodPools.splice(i, 1);
    }
  }
}

// ============================================================
// DEBRIS — física manual, 100% estável (substitui cannon-es)
// ============================================================
class Debris {
  constructor(mesh, size, mass, life = 35) {
    this.mesh = mesh;
    this.size = size;
    this.mass = mass;
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.settled = false;
    this.settleTimer = 0;
    this.life = life;
    this.maxLife = life;
    this.key = 'piece';
  }

  applyImpulse(impulse) {
    this.velocity.addScaledVector(impulse, 1 / this.mass);
  }

  applyTorque(torque) {
    this.angularVelocity.addScaledVector(torque, 1 / this.mass);
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return true;

    if (!this.settled) {
      // Gravidade
      this.velocity.y -= 22 * dt;

      // Atrito do ar
      this.velocity.multiplyScalar(0.995);
      this.angularVelocity.multiplyScalar(0.99);

      // Integrar posição
      this.mesh.position.addScaledVector(this.velocity, dt);

      // Integrar rotação (Euler — simples mas funciona)
      this.mesh.rotation.x += this.angularVelocity.x * dt;
      this.mesh.rotation.y += this.angularVelocity.y * dt;
      this.mesh.rotation.z += this.angularVelocity.z * dt;

      // Colisão com o chão — usa a MENOR dimensão como raio de apoio
      const minDim = Math.min(this.size.x, this.size.y, this.size.z);
      const groundY = minDim * 0.5;

      if (this.mesh.position.y <= groundY) {
        this.mesh.position.y = groundY;

        if (this.velocity.y < 0) this.velocity.y = -this.velocity.y * 0.3;
        this.velocity.x *= 0.65;
        this.velocity.z *= 0.65;
        this.angularVelocity.multiplyScalar(0.7);

        // Se está lento o bastante → settle
        const speedSq = this.velocity.lengthSq();
        const angSq = this.angularVelocity.lengthSq();
        if (speedSq < 0.5 && angSq < 1.0) {
          this.settleTimer += dt;
          if (this.settleTimer > 0.4) {
            this.settled = true;
            this.velocity.set(0, 0, 0);
            this.angularVelocity.set(0, 0, 0);
          }
        } else {
          this.settleTimer = 0;
        }
      }

      // Bate nas paredes invisíveis do mapa
      const lim = CONFIG.arena.size / 2 - 1;
      if (this.mesh.position.x < -lim) {
        this.mesh.position.x = -lim;
        this.velocity.x = Math.abs(this.velocity.x) * 0.5;
      }
      if (this.mesh.position.x > lim) {
        this.mesh.position.x = lim;
        this.velocity.x = -Math.abs(this.velocity.x) * 0.5;
      }
      if (this.mesh.position.z < -lim) {
        this.mesh.position.z = -lim;
        this.velocity.z = Math.abs(this.velocity.z) * 0.5;
      }
      if (this.mesh.position.z > lim) {
        this.mesh.position.z = lim;
        this.velocity.z = -Math.abs(this.velocity.z) * 0.5;
      }
    }

    // Fade quando a vida acaba
    if (this.life < 3) {
      const opacity = Math.max(0, this.life / 3);
      const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
      mats.forEach(m => {
        m.transparent = true;
        m.opacity = opacity;
      });
    }

    return false;
  }

  dispose() {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    mats.forEach(m => m.dispose());
  }
}

// ============================================================
// RAGDOLL — conjunto de peças com física manual
// ============================================================
const ragdolls = [];

class Ragdoll {
  constructor(zombieMesh, hitDir, hitStrength, missingParts) {
    zombieMesh.updateMatrixWorld(true);

    this.pieces = [];
    this.startTime = performance.now() / 1000;
    this.lastHitTime = this.startTime;
    this.settleStart = 0;
    this.state = 'falling';
    this.fadeProgress = 0;

    const skin = zombieMesh.userData.skinColor;
    const shirt = zombieMesh.userData.shirtColor;
    const pants = zombieMesh.userData.pantsColor;

    const hitDirN = hitDir.clone();
    hitDirN.y = 0;
    hitDirN.normalize();

    const defs = [
      {
        key: 'torso',
        size: new THREE.Vector3(0.7, 0.85, 0.35),
        mass: 8,
        obj: zombieMesh.userData.torso,
        offsetY: 0,
        materialColor: shirt,
      },
      {
        key: 'head',
        size: new THREE.Vector3(0.55, 0.55, 0.55),
        mass: 2.5,
        obj: zombieMesh.userData.head,
        offsetY: 0,
        isHead: true,
      },
      {
        key: 'armL',
        size: new THREE.Vector3(0.22, 0.9, 0.22),
        mass: 0.8,
        obj: zombieMesh.userData.armL,
        offsetY: -0.45,
        materialColor: shirt,
      },
      {
        key: 'armR',
        size: new THREE.Vector3(0.22, 0.9, 0.22),
        mass: 0.8,
        obj: zombieMesh.userData.armR,
        offsetY: -0.45,
        materialColor: shirt,
      },
      {
        key: 'legL',
        size: new THREE.Vector3(0.26, 0.75, 0.26),
        mass: 1.2,
        obj: zombieMesh.userData.legL,
        offsetY: -0.35,
        materialColor: pants,
      },
      {
        key: 'legR',
        size: new THREE.Vector3(0.26, 0.75, 0.26),
        mass: 1.2,
        obj: zombieMesh.userData.legR,
        offsetY: -0.35,
        materialColor: pants,
      },
    ];

    for (const def of defs) {
      if (missingParts[def.key]) continue;

      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      def.obj.getWorldPosition(worldPos);
      def.obj.getWorldQuaternion(worldQuat);
      worldPos.y += def.offsetY;

      // Cria material
      let materials;
      if (def.isHead) {
        const deadFaceTex = Textures.zombieHeadTexture(hexToCss(skin), true);
        const deadFaceMat = new THREE.MeshLambertMaterial({ map: deadFaceTex });
        const headSideMat = new THREE.MeshLambertMaterial({ color: skin });
        materials = [
          headSideMat, headSideMat, headSideMat, headSideMat,
          deadFaceMat, headSideMat,
        ];
      } else {
        materials = new THREE.MeshLambertMaterial({ color: def.materialColor });
      }

      const geo = new THREE.BoxGeometry(
        def.size.x, def.size.y, def.size.z, 2, 2, 2
      );
      const mesh = new THREE.Mesh(geo, materials);
      mesh.position.copy(worldPos);
      mesh.quaternion.copy(worldQuat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const piece = new Debris(mesh, def.size, def.mass, 9999);
      piece.key = def.key;

      // Impulso na direção do golpe
      const baseImpulse = CONFIG.ragdoll.impactImpulse * hitStrength;
      const spreadX = (Math.random() - 0.5) * 2;
      const spreadZ = (Math.random() - 0.5) * 2;

      piece.applyImpulse(new THREE.Vector3(
        hitDirN.x * baseImpulse + spreadX,
        baseImpulse * 0.5 + Math.random() * 1.5,
        hitDirN.z * baseImpulse + spreadZ
      ));

      // Giro dramático
      piece.applyTorque(new THREE.Vector3(
        (Math.random() - 0.5) * 25,
        (Math.random() - 0.5) * 25,
        (Math.random() - 0.5) * 25
      ));

      this.pieces.push(piece);
    }

    scene.remove(zombieMesh);
  }

  sliceAt(cameraPos, forward3D, range) {
    if (this.state === 'fading') return false;
    if (this.pieces.length <= 1) return false;

    let bestPiece = null;
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];

      const toPiece = new THREE.Vector3().subVectors(p.mesh.position, cameraPos);
      const dist = toPiece.length();
      if (dist > range) continue;
      toPiece.normalize();
      const dot = forward3D.dot(toPiece);
      if (dot < CONFIG.ragdoll.sliceDotMin) continue;

      const score = dot - dist * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestPiece = p;
        bestIndex = i;
      }
    }

    if (!bestPiece) return false;

    const sliceDir = new THREE.Vector3().subVectors(bestPiece.mesh.position, cameraPos);
    sliceDir.y = 0;
    sliceDir.normalize();

    // Vira membro voador: sai do ragdoll e vai pra lista flyingLimbs
    bestPiece.settled = false;
    bestPiece.settleTimer = 0;
    bestPiece.life = CONFIG.dismember.limbLife;
    bestPiece.maxLife = CONFIG.dismember.limbLife;

    // Impulso de fatiamento
    bestPiece.velocity.set(
      sliceDir.x * 10 + (Math.random() - 0.5) * 5,
      5 + Math.random() * 4,
      sliceDir.z * 10 + (Math.random() - 0.5) * 5
    );
    bestPiece.angularVelocity.set(
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 30
    );

    // Sangue
    spawnBlood(bestPiece.mesh.position.clone(), sliceDir, 18, true);

    this.pieces.splice(bestIndex, 1);
    flyingLimbs.push(bestPiece);

    // Reseta timer de interação (dá mais tempo de fatiar)
    this.lastHitTime = performance.now() / 1000;
    this.settleStart = 0;
    this.state = 'falling';

    return true;
  }

  update(dt) {
    if (this.state === 'fading') {
      this.fadeProgress += dt / CONFIG.ragdoll.fadeDuration;
      const opacity = Math.max(0, 1 - this.fadeProgress);
      this.pieces.forEach(p => {
        const mats = Array.isArray(p.mesh.material) ? p.mesh.material : [p.mesh.material];
        mats.forEach(m => { m.transparent = true; m.opacity = opacity; });
      });
      return this.fadeProgress >= 1;
    }

    // Atualiza peças
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      // Peças do ragdoll não morrem por vida (life = 9999)
      p.update(dt);
    }

    // Verifica se todas pararam
    const allSettled = this.pieces.length === 0 ||
      this.pieces.every(p => p.settled);

    if (this.state === 'falling') {
      if (allSettled) {
        this.state = 'settled';
        this.settleStart = performance.now() / 1000;
      }
    } else if (this.state === 'settled') {
      const elapsed = performance.now() / 1000 - this.settleStart;
      const sinceHit = performance.now() / 1000 - this.lastHitTime;
      // Só começa a fade se passou tempo desde a ÚLTIMA interação
      if (elapsed > CONFIG.ragdoll.settleTime && sinceHit > CONFIG.ragdoll.settleTime) {
        this.state = 'fading';
        this.fadeProgress = 0;
        const torso = this.pieces.find(p => p.key === 'torso');
        if (torso) spawnBloodPool(torso.mesh.position);
      }
    }

    return false;
  }

  dispose() {
    this.pieces.forEach(p => p.dispose());
    this.pieces = [];
  }
}

// Lista de membros voadores (também usa Debris)
const flyingLimbs = [];

function startRagdoll(zombieMesh, hitDir, hitStrength, missingParts) {
  if (ragdolls.length >= CONFIG.ragdoll.maxActive) {
    const oldest = ragdolls.shift();
    oldest.dispose();
  }
  const ragdoll = new Ragdoll(zombieMesh, hitDir, hitStrength, missingParts);
  ragdolls.push(ragdoll);
}

// ============================================================
// DESMEMBRAMENTO (em vida)
// ============================================================
function detachLimb(z, limbKey, hitDir) {
  const ud = z.mesh.userData;
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  let limbObj;

  if (limbKey === 'head') limbObj = ud.head;
  else if (limbKey === 'armL') limbObj = ud.armL;
  else if (limbKey === 'armR') limbObj = ud.armR;
  else if (limbKey === 'legL') limbObj = ud.legL;
  else if (limbKey === 'legR') limbObj = ud.legR;

  if (!limbObj) return;

  z.mesh.updateMatrixWorld(true);
  limbObj.getWorldPosition(worldPos);
  limbObj.getWorldQuaternion(worldQuat);

  limbObj.visible = false;
  z.dismembered[limbKey] = true;

  if (limbKey === 'armL' || limbKey === 'armR') worldPos.y -= 0.45;
  else if (limbKey === 'legL' || limbKey === 'legR') worldPos.y -= 0.35;

  // Cria o membro voador
  let size, materials;
  if (limbKey === 'head') {
    size = new THREE.Vector3(0.55, 0.55, 0.55);
    const deadFaceTex = Textures.zombieHeadTexture(hexToCss(ud.skinColor), true);
    const deadFaceMat = new THREE.MeshLambertMaterial({ map: deadFaceTex });
    const headSideMat = new THREE.MeshLambertMaterial({ color: ud.skinColor });
    materials = [headSideMat, headSideMat, headSideMat, headSideMat, deadFaceMat, headSideMat];
  } else if (limbKey === 'armL' || limbKey === 'armR') {
    size = new THREE.Vector3(0.24, 0.95, 0.24);
    materials = new THREE.MeshLambertMaterial({ color: ud.shirtColor });
  } else {
    size = new THREE.Vector3(0.28, 0.8, 0.28);
    materials = new THREE.MeshLambertMaterial({ color: ud.pantsColor });
  }

  const geo = new THREE.BoxGeometry(size.x, size.y, size.z, 2, 2, 2);
  const mesh = new THREE.Mesh(geo, materials);
  mesh.position.copy(worldPos);
  mesh.quaternion.copy(worldQuat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const piece = new Debris(mesh, size, 1.2, CONFIG.dismember.limbLife);
  piece.key = limbKey;

  const dir = hitDir.clone().normalize();
  piece.velocity.set(
    dir.x * CONFIG.dismember.limbSpeed + (Math.random() - 0.5) * 4,
    CONFIG.dismember.limbSpeed * 0.6 + Math.random() * 3,
    dir.z * CONFIG.dismember.limbSpeed + (Math.random() - 0.5) * 4
  );
  piece.angularVelocity.set(
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20
  );

  flyingLimbs.push(piece);

  spawnBlood(worldPos, dir, 25, true);
  spawnBlood(worldPos, null, 10, true);
}

// ============================================================
// AIM / CRIT
// ============================================================
function getAimRegion() {
  const pitch = player.pitch;
  if (pitch > 0.15) return 'head';
  if (pitch < -0.25) return 'legs';
  return 'torso';
}
function rollCrit() { return Math.random() < state.critChance; }

// ============================================================
// HIT MARKER / DAMAGE FLASH / MUZZLE FLASH
// ============================================================
const hitMarker  = document.getElementById('hit-marker');
const damageFlash = document.getElementById('damage-flash');

function showHitMarker(critical = false) {
  hitMarker.classList.remove('active');
  if (critical) hitMarker.classList.add('critical');
  else hitMarker.classList.remove('critical');
  void hitMarker.offsetWidth;
  hitMarker.classList.add('active');
  setTimeout(() => hitMarker.classList.remove('critical'), 300);
}
function showDamageFlash() {
  damageFlash.classList.add('active');
  setTimeout(() => damageFlash.classList.remove('active'), 120);
}
function spawnMuzzleFlash() {
  const flash = new THREE.PointLight(0xFFAA33, 4, 7, 2);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  flash.position.copy(camera.position).addScaledVector(dir, 1.4);
  flash.position.y -= 0.3;
  scene.add(flash);
  const start = performance.now() / 1000;
  (function fade() {
    const t = (performance.now() / 1000 - start) / 0.08;
    if (t >= 1) { scene.remove(flash); return; }
    flash.intensity = 4 * (1 - t);
    requestAnimationFrame(fade);
  })();
}

// ============================================================
// ATAQUE
// ============================================================
function attack() {
  const now = performance.now() / 1000;
  if (now - state.lastAttackTime < CONFIG.player.attackCooldown) return;
  state.lastAttackTime = now;

  Sfx.playKnife();
  triggerSwing();
  spawnMuzzleFlash();

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const forward3D = forward.clone();
  forward.y = 0; forward.normalize();

  const aimRegion = getAimRegion();

  const zombiesSnapshot = [...zombies];
  zombiesSnapshot.forEach(z => {
    if (z.health <= 0) return;

    const toZ = new THREE.Vector3().subVectors(z.mesh.position, player.position);
    toZ.y = 0;
    if (toZ.length() > CONFIG.player.attackRange) return;
    toZ.normalize();
    if (forward.dot(toZ) < 0.4) return;

    const isCrit = rollCrit();
    const damage = isCrit
      ? CONFIG.player.attackDamage * CONFIG.crit.damageMultiplier
      : CONFIG.player.attackDamage;

    z.health -= damage;

    const hitDir = new THREE.Vector3().subVectors(z.mesh.position, player.position);
    hitDir.y = 0;
    hitDir.normalize();

    const hitPoint = z.mesh.position.clone();
    if (aimRegion === 'head') hitPoint.y += 1.85;
    else if (aimRegion === 'legs') hitPoint.y += 0.5;
    else hitPoint.y += 1.1;

    if (isCrit) {
      spawnBlood(hitPoint, hitDir, 30, true);
      spawnBlood(hitPoint, null, 12, true);
    } else {
      spawnBlood(hitPoint, hitDir, 14, false);
    }

    Sfx.playHit();
    if (isCrit) Sfx.playHit();
    showHitMarker(isCrit);

    z.mesh.traverse(c => {
      if (c.material && c.material.color && !c.material.emissive && c.material.visible !== false) {
        if (!c.userData._origColor) c.userData._origColor = c.material.color.getHex();
        c.material.color.setHex(isCrit ? 0xFFFF00 : 0xFFFFFF);
        setTimeout(() => {
          if (c.material && c.userData._origColor !== undefined) {
            c.material.color.setHex(c.userData._origColor);
          }
        }, isCrit ? 130 : 70);
      }
    });

    if (isCrit) {
      let limbToDetach = null;
      const roll = Math.random();
      if (aimRegion === 'head' && !z.dismembered.head) {
        if (roll < CONFIG.dismember.headChance) limbToDetach = 'head';
      } else if (aimRegion === 'torso') {
        const availableArms = [];
        if (!z.dismembered.armL) availableArms.push('armL');
        if (!z.dismembered.armR) availableArms.push('armR');
        if (availableArms.length > 0 && roll < CONFIG.dismember.armChance) {
          limbToDetach = availableArms[Math.floor(Math.random() * availableArms.length)];
        }
      } else if (aimRegion === 'legs') {
        const availableLegs = [];
        if (!z.dismembered.legL) availableLegs.push('legL');
        if (!z.dismembered.legR) availableLegs.push('legR');
        if (availableLegs.length > 0 && roll < CONFIG.dismember.legChance) {
          limbToDetach = availableLegs[Math.floor(Math.random() * availableLegs.length)];
        }
      }
      if (limbToDetach) {
        detachLimb(z, limbToDetach, hitDir);
        if (limbToDetach === 'head') z.health = 0;
      }
    }

    if (z.health <= 0) {
      Sfx.playZombieDeath();
      Sfx.playCoin();
      state.coins += CONFIG.zombie.coinReward;
      state.xp += CONFIG.zombie.xpReward;
      checkLevelUp();
      const overkill = Math.min(2, Math.max(0.7, -z.health / CONFIG.zombie.maxHealth + 1));
      const finalStrength = isCrit ? overkill * 1.4 : overkill;
      startRagdoll(z.mesh, hitDir, finalStrength, z.dismembered);
      const idx = zombies.indexOf(z);
      if (idx >= 0) zombies.splice(idx, 1);
      state.zombiesAlive--;
      updateHUD();
    } else if (!isCrit) {
      z.hitReactEndTime = now + CONFIG.zombie.knockbackStagger;
      z.hitDirection.copy(hitDir);
    } else {
      z.hitReactEndTime = now + CONFIG.zombie.knockbackStagger * 1.5;
      z.hitDirection.copy(hitDir);
    }
  });

  // Fatiar cadáveres
  const camPos = camera.position.clone();
  let sliced = false;
  for (const ragdoll of ragdolls) {
    if (sliced) break;
    if (ragdoll.sliceAt(camPos, forward3D, CONFIG.ragdoll.sliceRange)) {
      sliced = true;
      Sfx.playHit();
      showHitMarker(false);
    }
  }
}

// ============================================================
// LEVEL UP / HORDAS
// ============================================================
function checkLevelUp() {
  let leveled = false;
  while (state.xp >= state.xpToNextLevel) {
    state.xp -= state.xpToNextLevel;
    state.level++;
    state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.4);
    leveled = true;
    if (state.level % 3 === 0) {
      state.critChance = Math.min(0.75, state.critChance + 0.02);
    }
  }
  if (leveled) Sfx.playLevelUp();
  updateHUD();
}

const waveBanner = document.getElementById('wave-banner');
function showWaveBanner(text) {
  waveBanner.textContent = text;
  waveBanner.classList.remove('hidden');
  waveBanner.classList.add('show');
  setTimeout(() => {
    waveBanner.classList.remove('show');
    setTimeout(() => waveBanner.classList.add('hidden'), 350);
  }, 1400);
}

function startWave() {
  if (state.waveIntervalId !== null) {
    clearInterval(state.waveIntervalId);
    state.waveIntervalId = null;
  }

  state.wave++;
  state.betweenWaves = false;
  const count = Math.min(
    CONFIG.wave.baseZombies + (state.wave - 1) * CONFIG.wave.zombiesPerWave,
    CONFIG.wave.maxZombies
  );
  state.zombiesRemainingInWave = count;
  showWaveBanner(`HORDA ${state.wave}`);

  let spawned = 0;
  state.waveIntervalId = setInterval(() => {
    if (spawned >= count || !state.running) {
      clearInterval(state.waveIntervalId);
      state.waveIntervalId = null;
      return;
    }
    spawnZombie();
    spawned++;
  }, 500);
  updateHUD();
}

function checkWaveComplete() {
  if (state.betweenWaves) return;
  if (state.zombiesAlive === 0 && state.zombiesRemainingInWave <= 0) {
    state.betweenWaves = true;
    showWaveBanner('PRÓXIMA EM 5s');
    setTimeout(() => { if (state.running) startWave(); }, CONFIG.wave.breakTime * 1000);
  }
}

// ============================================================
// CONTROLES
// ============================================================
document.addEventListener('keydown', e => { state.keys[e.code] = true; });
document.addEventListener('keyup', e => { state.keys[e.code] = false; });

renderer.domElement.addEventListener('click', () => {
  if (!state.running || isMobile()) return;
  Sfx.initAudio();
  Sfx.resumeAudio();
  renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= e.movementX * 0.002;
  player.pitch -= e.movementY * 0.002;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});

document.addEventListener('mousedown', e => {
  if (e.button === 0 && state.running && document.pointerLockElement === renderer.domElement) {
    attack();
  }
});

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 'ontouchstart' in window;
}

const mobile = { moveX: 0, moveY: 0, looking: false, lastX: 0, lastY: 0 };

function setupMobile() {
  if (!isMobile()) return;
  document.getElementById('mobile-controls').classList.remove('hidden');

  const stick = document.getElementById('joystick-stick');
  const base  = document.getElementById('joystick-base');
  const look  = document.getElementById('look-zone');
  const atk   = document.getElementById('btn-attack');

  let baseRect = null, touchingStick = false;

  base.addEventListener('touchstart', e => {
    e.preventDefault();
    Sfx.initAudio(); Sfx.resumeAudio();
    baseRect = base.getBoundingClientRect();
    touchingStick = true;
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!touchingStick || !baseRect) return;
    for (const t of e.changedTouches) {
      const cx = baseRect.left + baseRect.width / 2;
      const cy = baseRect.top + baseRect.height / 2;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const maxD = baseRect.width / 2;
      const d = Math.hypot(dx, dy);
      if (d > maxD) { dx = dx / d * maxD; dy = dy / d * maxD; }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      mobile.moveX = dx / maxD;
      mobile.moveY = dy / maxD;
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    touchingStick = false;
    stick.style.transform = 'translate(0,0)';
    mobile.moveX = 0; mobile.moveY = 0;
  });

  look.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    mobile.looking = true;
    mobile.lastX = t.clientX; mobile.lastY = t.clientY;
  }, { passive: false });

  look.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!mobile.looking) return;
    const t = e.touches[0];
    const dx = t.clientX - mobile.lastX;
    const dy = t.clientY - mobile.lastY;
    mobile.lastX = t.clientX; mobile.lastY = t.clientY;
    player.yaw -= dx * 0.005;
    player.pitch -= dy * 0.005;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  }, { passive: false });

  look.addEventListener('touchend', () => { mobile.looking = false; });
  atk.addEventListener('touchstart', e => { e.preventDefault(); attack(); }, { passive: false });
}
setupMobile();

// ============================================================
// LOOP
// ============================================================
const clock = new THREE.Clock();

function updatePlayer(dt) {
  const speed = CONFIG.player.speed;
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  let mx = 0, mz = 0;
  if (isMobile()) { mx = mobile.moveX; mz = mobile.moveY; }
  else {
    if (state.keys['KeyW']) mz -= 1;
    if (state.keys['KeyS']) mz += 1;
    if (state.keys['KeyA']) mx -= 1;
    if (state.keys['KeyD']) mx += 1;
  }

  const v = new THREE.Vector3();
  v.addScaledVector(fwd, -mz);
  v.addScaledVector(right, mx);
  state.isMoving = v.length() > 0.05;
  if (v.length() > 0) v.normalize();
  player.position.addScaledVector(v, speed * dt);

  const lim = CONFIG.arena.size / 2 - 1;
  player.position.x = Math.max(-lim, Math.min(lim, player.position.x));
  player.position.z = Math.max(-lim, Math.min(lim, player.position.z));

  if (state.isMoving) state.bobTime += dt * 9;
  else state.bobTime *= 0.9;
  const bobY = Math.sin(state.bobTime) * 0.055;

  camera.position.copy(player.position);
  camera.position.y += bobY;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function updateZombies(dt) {
  const now = performance.now() / 1000;

  groanTimer -= dt;
  if (groanTimer <= 0 && zombies.length > 0) {
    groanTimer = 1.5 + Math.random() * 3;
    Sfx.playGroan();
  }

  zombies.forEach(z => {
    if (z.health <= 0) return;

    const hpPercent = z.health / z.maxHealth;
    const isWounded = hpPercent < 0.5;
    const woundedFactor = isWounded ? hpPercent / 0.5 : 1;

    const toP = new THREE.Vector3().subVectors(player.position, z.mesh.position);
    toP.y = 0;
    const dist = toP.length();

    z.mesh.lookAt(player.position.x, z.mesh.position.y, player.position.z);

    const staggering = z.hitReactEndTime > now;
    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      z.mesh.rotateX(-lean * 0.45);
      z.mesh.position.addScaledVector(z.hitDirection, -dt * 4 * lean);
      if (!z.dismembered.armL && z.mesh.userData.armL) {
        z.mesh.userData.armL.rotation.x = -1.5 + lean * 0.8;
      }
      if (!z.dismembered.armR && z.mesh.userData.armR) {
        z.mesh.userData.armR.rotation.x = -1.5 + lean * 0.8;
      }
    } else {
      let speedMod = 1;
      if (z.dismembered.legL || z.dismembered.legR) speedMod *= 0.55;
      if (z.dismembered.legL && z.dismembered.legR) speedMod *= 0.3;

      const walkSpeed = (isWounded ? 3.2 : 5) * speedMod;
      z.walkPhase += dt * walkSpeed;

      let swing = Math.sin(z.walkPhase) * 0.55;
      let legLSwing = swing;
      let legRSwing = -swing;

      if (!z.dismembered.legL && !z.dismembered.legR && isWounded) {
        const dragAmount = 1 - woundedFactor;
        legLSwing = swing * (1 - dragAmount * 0.8);
        legRSwing = -swing * (1 - dragAmount * 0.4);
      }

      if (z.mesh.userData.legL && !z.dismembered.legL) z.mesh.userData.legL.rotation.x = legLSwing;
      if (z.mesh.userData.legR && !z.dismembered.legR) z.mesh.userData.legR.rotation.x = legRSwing;

      const armLAvailable = !z.dismembered.armL && z.mesh.userData.armL;
      const armRAvailable = !z.dismembered.armR && z.mesh.userData.armR;
      if (armLAvailable) z.mesh.userData.armL.rotation.x = -1.5 + Math.sin(z.walkPhase) * 0.12;
      if (armRAvailable) z.mesh.userData.armR.rotation.x = -1.5 + Math.cos(z.walkPhase) * 0.12;

      if (isWounded) {
        const tilt = (1 - woundedFactor) * 0.25;
        z.mesh.rotation.z = Math.sin(z.walkPhase * 0.5) * tilt;
      } else {
        z.mesh.rotation.z = 0;
      }
    }

    if (z.dismembered.head) { z.health = 0; return; }

    const zombieSpeed = CONFIG.zombie.speed * (isWounded ? 0.6 : 1);
    if (!staggering && dist > CONFIG.zombie.attackRange) {
      toP.normalize();
      z.mesh.position.addScaledVector(toP, zombieSpeed * dt);
    } else if (!staggering && now - z.lastAttackTime > CONFIG.zombie.attackCooldown) {
      z.lastAttackTime = now;
      state.health -= CONFIG.zombie.damage;
      Sfx.playPlayerHurt();
      showDamageFlash();
      updateHUD();
      if (state.health <= 0) gameOver();
    }
  });
}

function updateRagdolls(dt) {
  for (let i = ragdolls.length - 1; i >= 0; i--) {
    const r = ragdolls[i];
    if (r.update(dt)) {
      r.dispose();
      ragdolls.splice(i, 1);
    }
  }
}

function updateFlyingLimbs(dt) {
  for (let i = flyingLimbs.length - 1; i >= 0; i--) {
    const l = flyingLimbs[i];
    if (l.update(dt)) {
      l.dispose();
      flyingLimbs.splice(i, 1);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (state.running) {
    updatePlayer(dt);
    updateZombies(dt);
    updateParticles(dt);
    updateBloodPools(dt);
    checkWaveComplete();
    updateWeaponViewModel(dt);
    updateRagdolls(dt);
    updateFlyingLimbs(dt);

    const elapsed = Math.floor((performance.now() - state.startTime) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${min}:${sec}`;
  } else {
    updateParticles(dt);
    updateBloodPools(dt);
    updateRagdolls(dt);
    updateFlyingLimbs(dt);
  }
  renderer.render(scene, camera);
}
animate();

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  const hp = Math.max(0, state.health);
  document.getElementById('hp-fill').style.width = `${(hp / state.maxHealth) * 100}%`;
  document.getElementById('hp-text').textContent = `${Math.ceil(hp)} / ${state.maxHealth}`;
  document.getElementById('xp-fill').style.width = `${(state.xp / state.xpToNextLevel) * 100}%`;
  document.getElementById('coins').textContent = state.coins;
  document.getElementById('wave').textContent = state.wave;
  document.getElementById('level').textContent = state.level;
  document.getElementById('zombies').textContent = state.zombiesAlive;
  document.getElementById('ammo-current').textContent = '⚔';
  document.getElementById('ammo-max').textContent = '∞';
}

// ============================================================
// START / GAME OVER
// ============================================================
function startGame() {
  if (state.waveIntervalId !== null) {
    clearInterval(state.waveIntervalId);
    state.waveIntervalId = null;
  }

  Sfx.initAudio(); Sfx.resumeAudio();

  state.health = state.maxHealth;
  state.coins = 0; state.xp = 0;
  state.level = 1; state.xpToNextLevel = 50;
  state.wave = 0; state.zombiesAlive = 0;
  state.zombiesRemainingInWave = 0;
  state.running = true; state.betweenWaves = false;
  state.startTime = performance.now();
  state.critChance = CONFIG.crit.baseChance;

  zombies.forEach(z => scene.remove(z.mesh));
  zombies.length = 0;
  ragdolls.forEach(r => r.dispose());
  ragdolls.length = 0;
  flyingLimbs.forEach(l => l.dispose());
  flyingLimbs.length = 0;
  particles.forEach(p => scene.remove(p.mesh));
  particles.length = 0;
  bloodPools.forEach(b => scene.remove(b.mesh));
  bloodPools.length = 0;

  player.position.set(0, CONFIG.player.height, 0);
  player.yaw = 0; player.pitch = 0;

  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  updateHUD();
  startWave();
}

function gameOver() {
  state.running = false;
  if (state.waveIntervalId !== null) {
    clearInterval(state.waveIntervalId);
    state.waveIntervalId = null;
  }
  document.getElementById('final-wave').textContent = state.wave;
  document.getElementById('final-level').textContent = state.level;
  document.getElementById('final-coins').textContent = state.coins;
  document.getElementById('gameover').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-multiplayer').addEventListener('click', () => {
  alert('Multijogador em breve!');
});
document.getElementById('btn-wiki').addEventListener('click', () => {
  window.open('https://zumbiblocks2.wiki.gg/', '_blank');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
