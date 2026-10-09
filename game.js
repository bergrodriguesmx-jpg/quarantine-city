import * as THREE from 'three';
import * as Textures from './textures.js';
import * as Scenery from './scenery.js';
import * as Sfx from './audio.js';

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
    settleTime: 25,
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
container.appendChild(renderer.domElement);

const skyGeo = new THREE.SphereGeometry(200, 32, 16);
const skyMat = new THREE.MeshBasicMaterial({
  map: Textures.skyTexture(), side: THREE.BackSide, fog: false,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 80, 40);
scene.add(sun);
const fillLight = new THREE.DirectionalLight(0xC5E0F5, 0.4);
fillLight.position.set(-40, 30, -30);
scene.add(fillLight);

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

// ============================================================
// CAVERNAS — nas bordas do mapa
// ============================================================
const caves = [];

function createCave(x, z, rotationY) {
  const g = new THREE.Group();

  const rockMat     = new THREE.MeshLambertMaterial({ color: 0x5A5A5A, flatShading: true });
  const darkRockMat = new THREE.MeshLambertMaterial({ color: 0x3A3A3A, flatShading: true });
  const holeMat     = new THREE.MeshBasicMaterial({ color: 0x000000 });

  // Helper pra criar pedra
  function makeRock(px, py, pz, sx, sy, sz, mat) {
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz, 3, 3, 3),
      mat || rockMat
    );
    rock.position.set(px, py, pz);
    rock.rotation.y = Math.random() * 0.4 - 0.2;
    rock.rotation.z = Math.random() * 0.2 - 0.1;
    rock.castShadow = true;
    rock.receiveShadow = true;
    g.add(rock);
    return rock;
  }

  // Pilares laterais (esquerda e direita)
  makeRock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  makeRock( 1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);

  // Topo (arco)
  makeRock(-0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRockMat);
  makeRock( 0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRockMat);
  makeRock( 0,   3.6, 0.2, 3.6, 0.9, 2.0, rockMat);

  // Pedras extras ao redor (deixa mais natural)
  makeRock(-2.8, 0.6, -0.8, 1.4, 1.2, 1.4, darkRockMat);
  makeRock( 2.8, 0.6, -0.8, 1.4, 1.2, 1.4, darkRockMat);
  makeRock(-2.4, 0.4, 1.4, 1.0, 0.8, 1.0, rockMat);
  makeRock( 2.4, 0.4, 1.4, 1.0, 0.8, 1.0, rockMat);

  // Buraco escuro no fundo (a "boca" da caverna)
  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 2.6, 0.4),
    holeMat
  );
  hole.position.set(0, 1.3, -1.0);
  g.add(hole);

  // Detalhe de "profundidade" (escurece mais fundo)
  const deep = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.8, 1.2),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
  );
  deep.position.set(0, 1.1, -1.4);
  g.add(deep);

  g.position.set(x, 0, z);
  g.rotation.y = rotationY;
  return g;
}

function setupCaves() {
  const half = CONFIG.arena.size / 2 - 3;

  const caveData = [
    { x: 0,    z: -half, rot: 0 },           // Norte
    { x: 0,    z:  half, rot: Math.PI },     // Sul
    { x: -half, z: 0,    rot: Math.PI / 2 }, // Oeste
    { x:  half, z: 0,    rot: -Math.PI / 2 },// Leste
    { x: -half * 0.7, z: -half * 0.7, rot: Math.PI / 4 },   // Noroeste
    { x:  half * 0.7, z: -half * 0.7, rot: -Math.PI / 4 },  // Nordeste
    { x: -half * 0.7, z:  half * 0.7, rot: Math.PI * 3 / 4 },// Sudoeste
    { x:  half * 0.7, z:  half * 0.7, rot: -Math.PI * 3 / 4 },// Sudeste
  ];

  caveData.forEach(({ x, z, rot }) => {
    const mesh = createCave(x, z, rot);
    scene.add(mesh);
    caves.push({ x, z, rot, mesh });
  });
}
setupCaves();

// Limites invisíveis (pra ninguém sair do mapa)
const limit = CONFIG.arena.size / 2 - 1;
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
    new THREE.BoxGeometry(0.05, 0.42, 0.02, 2, 6, 1),
    new THREE.MeshLambertMaterial({ color: 0xBDC3C7 })
  );
  blade.position.set(0, 0.34, 0);
  g.add(blade);
  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.08, 0.02, 2, 2, 1),
    new THREE.MeshLambertMaterial({ color: 0xECF0F1 })
  );
  tip.position.set(0, 0.59, 0);
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

const player = {
  position: new THREE.Vector3(0, CONFIG.player.height, 0),
  yaw: 0,
  pitch: 0,
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function makeBox(w, h, d, s = 3) { return new THREE.BoxGeometry(w, h, d, s, s, s); }
function makeJoint(r, seg = 12) { return new THREE.SphereGeometry(r, seg, Math.floor(seg * 0.75)); }

// ============================================================
// ZUMBIS
// ============================================================
const zombies = [];

const SHIRT_COLORS = [0x8E44AD, 0x2ECC71, 0xE74C3C, 0x3498DB, 0xF39C12, 0xE67E22, 0x16A085, 0xC0392B];
const PANTS_COLORS = [0x8B5A2B, 0x5D4030, 0x3E2723, 0x2C3E50, 0x34495E, 0x1B2631];
const SKIN_COLORS  = [0x7BC950, 0x6BB840, 0x8DD65A, 0x5DAE3F, 0x9DE06B];
const HAIR_COLORS  = [0x2C1810, 0x1A0F08, 0x4A2818, 0x6B3A1F, 0x3A2A1A];

const BODY_TYPES = [
  { name: 'magro',  torsoW: 0.55, torsoD: 0.30, arm: 0.18, leg: 0.22, heightScale: 1.05 },
  { name: 'normal', torsoW: 0.70, torsoD: 0.35, arm: 0.22, leg: 0.26, heightScale: 1.00 },
  { name: 'gordo',  torsoW: 0.85, torsoD: 0.45, arm: 0.26, leg: 0.30, heightScale: 0.95 },
];

function createZombieMesh() {
  const g = new THREE.Group();

  const skinColor  = rand(SKIN_COLORS);
  const shirtColor = rand(SHIRT_COLORS);
  const pantsColor = rand(PANTS_COLORS);
  const hairColor  = rand(HAIR_COLORS);
  const bodyType   = rand(BODY_TYPES);
  const sleeveLong = Math.random() > 0.5;
  const hasHat     = Math.random() > 0.7;
  const wounded    = Math.random() > 0.5;

  const skinMat    = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirtMat   = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat   = new THREE.MeshLambertMaterial({ color: pantsColor });
  const hairMat    = new THREE.MeshLambertMaterial({ color: hairColor });
  const shoeMat    = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
  const soleMat    = new THREE.MeshLambertMaterial({ color: 0xECF0F1 });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const pupilMat   = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouthMat   = new THREE.MeshBasicMaterial({ color: 0x2B0000 });
  const woundMat   = new THREE.MeshBasicMaterial({ color: 0xC0392B });
  const bloodMat   = new THREE.MeshBasicMaterial({ color: 0x8B0000 });

  // === CABEÇA ===
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.85;

  const head = new THREE.Mesh(makeBox(0.55, 0.55, 0.55, 3), skinMat);
  head.castShadow = true;
  headGroup.add(head);

  const hair = new THREE.Mesh(makeBox(0.58, 0.10, 0.58, 3), hairMat);
  hair.position.y = 0.30;
  headGroup.add(hair);

  const fringe = new THREE.Mesh(makeBox(0.58, 0.14, 0.08, 3), hairMat);
  fringe.position.set(0, 0.24, 0.28);
  headGroup.add(fringe);

  const earGeo = makeBox(0.06, 0.14, 0.10, 2);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-0.31, 0, 0);
  headGroup.add(earL);
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(0.31, 0, 0);
  headGroup.add(earR);

  const eyeWhiteGeo = makeBox(0.13, 0.11, 0.02, 2);
  const eyeWhiteL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeWhiteL.position.set(-0.13, 0.08, 0.285);
  headGroup.add(eyeWhiteL);
  const eyeWhiteR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
  eyeWhiteR.position.set(0.13, 0.08, 0.285);
  headGroup.add(eyeWhiteR);

  const pupilGeo = makeBox(0.05, 0.05, 0.02, 2);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
  pupilL.position.set(-0.13, 0.08, 0.295);
  headGroup.add(pupilL);
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
  pupilR.position.set(0.13, 0.08, 0.295);
  headGroup.add(pupilR);

  const nose = new THREE.Mesh(makeBox(0.08, 0.08, 0.06, 2), skinMat);
  nose.position.set(0, -0.02, 0.30);
  headGroup.add(nose);

  const mouth = new THREE.Mesh(makeBox(0.20, 0.06, 0.02, 2), mouthMat);
  mouth.position.set(0, -0.14, 0.285);
  headGroup.add(mouth);
  const teeth = new THREE.Mesh(makeBox(0.18, 0.02, 0.02, 2), eyeWhiteMat);
  teeth.position.set(0, -0.11, 0.29);
  headGroup.add(teeth);

  if (wounded) {
    const woundHead = new THREE.Mesh(makeBox(0.12, 0.06, 0.02, 2), woundMat);
    woundHead.position.set(-0.15, 0.16, 0.285);
    headGroup.add(woundHead);
    const blood = new THREE.Mesh(makeBox(0.04, 0.10, 0.02, 2), bloodMat);
    blood.position.set(-0.15, 0.07, 0.285);
    headGroup.add(blood);
  }

  if (hasHat) {
    const hatGroup = new THREE.Group();
    const hatBase = new THREE.Mesh(
      makeBox(0.65, 0.05, 0.65, 3),
      new THREE.MeshLambertMaterial({ color: 0x2C3E50 })
    );
    hatGroup.add(hatBase);
    const hatTop = new THREE.Mesh(
      makeBox(0.45, 0.25, 0.45, 3),
      new THREE.MeshLambertMaterial({ color: 0x34495E })
    );
    hatTop.position.y = 0.15;
    hatGroup.add(hatTop);
    hatGroup.position.y = 0.34;
    headGroup.add(hatGroup);
  }

  g.add(headGroup);

  // === TRONCO ===
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 1.15;

  const torso = new THREE.Mesh(
    makeBox(bodyType.torsoW, 0.85, bodyType.torsoD, 3),
    shirtMat
  );
  torso.castShadow = true;
  torsoGroup.add(torso);

  const collar = new THREE.Mesh(
    makeBox(bodyType.torsoW * 0.85, 0.06, bodyType.torsoD * 0.9, 2),
    new THREE.MeshLambertMaterial({ color: 0x000000 })
  );
  collar.position.y = 0.43;
  torsoGroup.add(collar);

  const shoulderGeo = makeBox(0.20, 0.15, bodyType.torsoD * 0.9, 3);
  const shoulderL = new THREE.Mesh(shoulderGeo, shirtMat);
  shoulderL.position.set(-bodyType.torsoW / 2 + 0.02, 0.35, 0);
  torsoGroup.add(shoulderL);
  const shoulderR = new THREE.Mesh(shoulderGeo, shirtMat);
  shoulderR.position.set(bodyType.torsoW / 2 - 0.02, 0.35, 0);
  torsoGroup.add(shoulderR);

  if (wounded) {
    const w1 = new THREE.Mesh(makeBox(0.14, 0.10, 0.02, 2), woundMat);
    w1.position.set(0.15, 0.05, bodyType.torsoD / 2 + 0.01);
    torsoGroup.add(w1);
    const w2 = new THREE.Mesh(makeBox(0.10, 0.14, 0.02, 2), woundMat);
    w2.position.set(-0.18, -0.15, bodyType.torsoD / 2 + 0.01);
    torsoGroup.add(w2);
    const b1 = new THREE.Mesh(makeBox(0.04, 0.15, 0.02, 2), bloodMat);
    b1.position.set(0.15, -0.05, bodyType.torsoD / 2 + 0.01);
    torsoGroup.add(b1);
  }

  g.add(torsoGroup);

  // === BRAÇOS ===
  const armW = bodyType.arm;

  function makeArm(side) {
    const arm = new THREE.Group();

    const shoulder = new THREE.Mesh(makeJoint(armW * 0.55), shirtMat);
    arm.add(shoulder);

    const upperMat = sleeveLong ? shirtMat : skinMat;
    const upper = new THREE.Mesh(makeBox(armW, 0.42, armW, 3), upperMat);
    upper.position.y = -0.22;
    upper.castShadow = true;
    arm.add(upper);

    const elbow = new THREE.Mesh(makeJoint(armW * 0.45), upperMat);
    elbow.position.y = -0.46;
    arm.add(elbow);

    const lowerMat = sleeveLong ? shirtMat : skinMat;
    const lower = new THREE.Mesh(makeBox(armW * 0.92, 0.42, armW * 0.92, 3), lowerMat);
    lower.position.y = -0.68;
    lower.castShadow = true;
    arm.add(lower);

    const wrist = new THREE.Mesh(makeJoint(armW * 0.4), skinMat);
    wrist.position.y = -0.90;
    arm.add(wrist);

    const hand = new THREE.Mesh(makeBox(armW * 1.05, 0.14, armW * 1.15, 3), skinMat);
    hand.position.y = -0.99;
    hand.castShadow = true;
    arm.add(hand);

    const fingerGeo = makeBox(armW * 0.18, 0.13, armW * 0.18, 2);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(fingerGeo, skinMat);
      finger.position.set(
        -armW * 0.36 + i * armW * 0.24,
        -1.11,
        armW * 0.28
      );
      arm.add(finger);
    }

    const thumb = new THREE.Mesh(makeBox(armW * 0.22, 0.11, armW * 0.22, 2), skinMat);
    thumb.position.set(side * armW * 0.5, -1.02, armW * 0.38);
    arm.add(thumb);

    if (wounded) {
      const w = new THREE.Mesh(makeBox(0.08, 0.08, 0.02, 2), woundMat);
      w.position.set(side * armW * 0.5, -0.55, 0);
      w.rotation.y = side * Math.PI / 2;
      arm.add(w);
    }

    return arm;
  }

  const armL = makeArm(-1);
  armL.position.set(-bodyType.torsoW / 2 - armW / 2 + 0.05, 1.5, 0);
  g.add(armL);

  const armR = makeArm(1);
  armR.position.set(bodyType.torsoW / 2 + armW / 2 - 0.05, 1.5, 0);
  g.add(armR);

  // === PERNAS ===
  const legW = bodyType.leg;

  function makeLeg() {
    const leg = new THREE.Group();

    const hip = new THREE.Mesh(makeJoint(legW * 0.58), pantsMat);
    leg.add(hip);

    const thigh = new THREE.Mesh(makeBox(legW, 0.55, legW, 3), pantsMat);
    thigh.position.y = -0.30;
    thigh.castShadow = true;
    leg.add(thigh);

    const knee = new THREE.Mesh(makeJoint(legW * 0.48), pantsMat);
    knee.position.y = -0.60;
    leg.add(knee);

    const shin = new THREE.Mesh(makeBox(legW * 0.9, 0.40, legW * 0.9, 3), pantsMat);
    shin.position.y = -0.82;
    shin.castShadow = true;
    leg.add(shin);

    const ankle = new THREE.Mesh(makeJoint(legW * 0.42), shoeMat);
    ankle.position.y = -1.04;
    leg.add(ankle);

    const shoeBase = new THREE.Mesh(makeBox(legW * 1.15, 0.14, legW * 1.35, 3), shoeMat);
    shoeBase.position.set(0, -1.12, 0.03);
    shoeBase.castShadow = true;
    leg.add(shoeBase);

    const shoeTip = new THREE.Mesh(makeBox(legW * 1.15, 0.08, legW * 0.45, 3), shoeMat);
    shoeTip.position.set(0, -1.16, legW * 0.85);
    leg.add(shoeTip);

    const sole = new THREE.Mesh(makeBox(legW * 1.18, 0.04, legW * 1.4, 3), soleMat);
    sole.position.set(0, -1.20, 0.03);
    leg.add(sole);

    return leg;
  }

  const legL = makeLeg();
  legL.position.set(-legW * 0.55, 0.72, 0);
  g.add(legL);

  const legR = makeLeg();
  legR.position.set(legW * 0.55, 0.72, 0);
  g.add(legR);

  g.scale.y = bodyType.heightScale;

  // Postura curvada (zumbi corcunda)
  g.rotation.x = 0.12;

  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.head = headGroup;
  g.userData.torso = torsoGroup;
  g.userData.skinColor = skinColor;
  g.userData.shirtColor = shirtColor;
  g.userData.pantsColor = pantsColor;
  g.userData.bodyType = bodyType;

  return g;
}

let groanTimer = 0;

function spawnZombie() {
  // Sorteia uma caverna
  const cave = caves[Math.floor(Math.random() * caves.length)];

  // Spawna dentro da caverna (virado pra dentro do mapa)
  const toCenterX = -cave.x;
  const toCenterZ = -cave.z;
  const len = Math.sqrt(toCenterX * toCenterX + toCenterZ * toCenterZ) || 1;
  const dirX = toCenterX / len;
  const dirZ = toCenterZ / len;

  // Posição inicial: um pouco atrás da entrada (dentro da caverna)
  const offsetBack = 0.8 + Math.random() * 0.8;
  const offsetSide = (Math.random() - 0.5) * 1.6;

  const x = cave.x + dirX * offsetBack + (-dirZ) * offsetSide;
  const z = cave.z + dirZ * offsetBack + (dirX) * offsetSide;

  const mesh = createZombieMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);

  // Zumbi recém-nascido da caverna — começa devagar
  zombies.push({
    mesh,
    health: CONFIG.zombie.maxHealth,
    maxHealth: CONFIG.zombie.maxHealth,
    lastAttackTime: 0,
    walkPhase: Math.random() * Math.PI * 2,
    hitReactEndTime: 0,
    hitDirection: new THREE.Vector3(),
    dismembered: { head: false, armL: false, armR: false, legL: false, legR: false },
    emergeTime: 0, // tempo desde o nascimento
  });
  state.zombiesAlive++;
  updateHUD();
}

// ============================================================
// SANGUE
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
// DEBRIS
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

  applyImpulse(impulse) { this.velocity.addScaledVector(impulse, 1 / this.mass); }
  applyTorque(torque) { this.angularVelocity.addScaledVector(torque, 1 / this.mass); }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return true;

    if (!this.settled) {
      this.velocity.y -= 22 * dt;
      this.velocity.multiplyScalar(0.995);
      this.angularVelocity.multiplyScalar(0.99);

      this.mesh.position.addScaledVector(this.velocity, dt);
      this.mesh.rotation.x += this.angularVelocity.x * dt;
      this.mesh.rotation.y += this.angularVelocity.y * dt;
      this.mesh.rotation.z += this.angularVelocity.z * dt;

      const minDim = Math.min(this.size.x, this.size.y, this.size.z);
      const groundY = minDim * 0.5;

      if (this.mesh.position.y <= groundY) {
        this.mesh.position.y = groundY;
        if (this.velocity.y < 0) this.velocity.y = -this.velocity.y * 0.3;
        this.velocity.x *= 0.65;
        this.velocity.z *= 0.65;
        this.angularVelocity.multiplyScalar(0.7);

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
    }

    if (this.life < 3) {
      const opacity = Math.max(0, this.life / 3);
      const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
      mats.forEach(m => { m.transparent = true; m.opacity = opacity; });
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
// RAGDOLL
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
    const bodyType = zombieMesh.userData.bodyType || BODY_TYPES[1];

    const hitDirN = hitDir.clone();
    hitDirN.y = 0;
    hitDirN.normalize();

    const defs = [
      { key: 'torso', size: new THREE.Vector3(bodyType.torsoW, 0.85, bodyType.torsoD), mass: 8, obj: zombieMesh.userData.torso, materialColor: shirt },
      { key: 'head', size: new THREE.Vector3(0.55, 0.55, 0.55), mass: 2.5, obj: zombieMesh.userData.head, materialColor: skin },
      { key: 'armL', size: new THREE.Vector3(bodyType.arm, 0.95, bodyType.arm), mass: 0.8, obj: zombieMesh.userData.armL, materialColor: shirt },
      { key: 'armR', size: new THREE.Vector3(bodyType.arm, 0.95, bodyType.arm), mass: 0.8, obj: zombieMesh.userData.armR, materialColor: shirt },
      { key: 'legL', size: new THREE.Vector3(bodyType.leg, 1.0, bodyType.leg), mass: 1.2, obj: zombieMesh.userData.legL, materialColor: pants },
      { key: 'legR', size: new THREE.Vector3(bodyType.leg, 1.0, bodyType.leg), mass: 1.2, obj: zombieMesh.userData.legR, materialColor: pants },
    ];

    for (const def of defs) {
      if (missingParts[def.key]) continue;

      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      def.obj.getWorldPosition(worldPos);
      def.obj.getWorldQuaternion(worldQuat);

      const mat = new THREE.MeshLambertMaterial({ color: def.materialColor });
      const geo = makeBox(def.size.x, def.size.y, def.size.z, 3);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(worldPos);
      mesh.quaternion.copy(worldQuat);
      mesh.castShadow = true;
      scene.add(mesh);

      const piece = new Debris(mesh, def.size, def.mass, 9999);
      piece.key = def.key;

      const baseImpulse = CONFIG.ragdoll.impactImpulse * hitStrength;
      const spreadX = (Math.random() - 0.5) * 2;
      const spreadZ = (Math.random() - 0.5) * 2;

      piece.applyImpulse(new THREE.Vector3(
        hitDirN.x * baseImpulse + spreadX,
        baseImpulse * 0.5 + Math.random() * 1.5,
        hitDirN.z * baseImpulse + spreadZ
      ));

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

    bestPiece.settled = false;
    bestPiece.settleTimer = 0;
    bestPiece.life = CONFIG.dismember.limbLife;
    bestPiece.maxLife = CONFIG.dismember.limbLife;

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

    spawnBlood(bestPiece.mesh.position.clone(), sliceDir, 18, true);

    this.pieces.splice(bestIndex, 1);
    flyingLimbs.push(bestPiece);

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

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      this.pieces[i].update(dt);
    }

    const allSettled = this.pieces.length === 0 || this.pieces.every(p => p.settled);

    if (this.state === 'falling') {
      if (allSettled) {
        this.state = 'settled';
        this.settleStart = performance.now() / 1000;
      }
    } else if (this.state === 'settled') {
      const elapsed = performance.now() / 1000 - this.settleStart;
      const sinceHit = performance.now() / 1000 - this.lastHitTime;
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

const flyingLimbs = [];

function startRagdoll(zombieMesh, hitDir, hitStrength, missingParts) {
  if (ragdolls.length >= CONFIG.ragdoll.maxActive) {
    const oldest = ragdolls.shift();
    oldest.dispose();
  }
  const ragdoll = new Ragdoll(zombieMesh, hitDir, hitStrength, missingParts);
  ragdolls.push(ragdoll);
}

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

  const bodyType = ud.bodyType || BODY_TYPES[1];
  let size, color;
  if (limbKey === 'head') {
    size = new THREE.Vector3(0.55, 0.55, 0.55);
    color = ud.skinColor;
  } else if (limbKey === 'armL' || limbKey === 'armR') {
    size = new THREE.Vector3(bodyType.arm, 0.95, bodyType.arm);
    color = ud.shirtColor;
  } else {
    size = new THREE.Vector3(bodyType.leg, 1.0, bodyType.leg);
    color = ud.pantsColor;
  }

  const geo = makeBox(size.x, size.y, size.z, 3);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.copy(worldPos);
  mesh.quaternion.copy(worldQuat);
  mesh.castShadow = true;
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

function getAimRegion() {
  const pitch = player.pitch;
  if (pitch > 0.15) return 'head';
  if (pitch < -0.25) return 'legs';
  return 'torso';
}
function rollCrit() { return Math.random() < state.critChance; }

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
  scene.add(flash);
  const start = performance.now() / 1000;
  (function fade() {
    const t = (performance.now() / 1000 - start) / 0.08;
    if (t >= 1) { scene.remove(flash); return; }
    flash.intensity = 4 * (1 - t);
    requestAnimationFrame(fade);
  })();
}

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
    showHitMarker(isCrit);

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
  showWaveBanner('HORDA ' + state.wave);

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
    showWaveBanner('PROXIMA EM 5s');
    setTimeout(() => { if (state.running) startWave(); }, CONFIG.wave.breakTime * 1000);
  }
}

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

// ============================================================
// ATUALIZA ZUMBIS — agora com animação realista
// ============================================================
function updateZombies(dt) {
  const now = performance.now() / 1000;

  groanTimer -= dt;
  if (groanTimer <= 0 && zombies.length > 0) {
    groanTimer = 1.5 + Math.random() * 3;
    Sfx.playGroan();
  }

  zombies.forEach(z => {
    if (z.health <= 0) return;

    // Tempo desde o spawn (emerge da caverna devagar)
    z.emergeTime = (z.emergeTime || 0) + dt;
    const emergeFactor = Math.min(1, z.emergeTime / 1.5);

    const hpPercent = z.health / z.maxHealth;
    const isWounded = hpPercent < 0.5;

    const toP = new THREE.Vector3().subVectors(player.position, z.mesh.position);
    toP.y = 0;
    const dist = toP.length();

    z.mesh.lookAt(player.position.x, z.mesh.position.y, player.position.z);

    const staggering = z.hitReactEndTime > now;
    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      z.mesh.rotateX(-lean * 0.45);
      z.mesh.position.addScaledVector(z.hitDirection, -dt * 4 * lean);
    } else {
      let speedMod = emergeFactor;
      if (z.dismembered.legL || z.dismembered.legR) speedMod *= 0.55;
      if (z.dismembered.legL && z.dismembered.legR) speedMod *= 0.3;

      const walkSpeed = (isWounded ? 3.2 : 5) * speedMod;
      z.walkPhase += dt * walkSpeed;

      const armLAvailable = !z.dismembered.armL && z.mesh.userData.armL;
      const armRAvailable = !z.dismembered.armR && z.mesh.userData.armR;
      const legLAvailable = !z.dismembered.legL && z.mesh.userData.legL;
      const legRAvailable = !z.dismembered.legR && z.mesh.userData.legR;

      // ============================================================
      // ANIMAÇÃO REALISTA
      // ============================================================
      // Pernas: passada natural (uma frente, outra atrás)
      const legSwing = Math.sin(z.walkPhase) * 0.6;
      if (legLAvailable) z.mesh.userData.legL.rotation.x = legSwing;
      if (legRAvailable) z.mesh.userData.legR.rotation.x = -legSwing;

      // Braços: se está LONGE do player, balança naturalmente como um humano
      //           se está PERTO, estica os braços pra te agarrar (pose clássica)
      const isReaching = dist < 3.5;

      if (armLAvailable) {
        const target = isReaching
          ? -1.5 + Math.sin(z.walkPhase) * 0.08
          : -legSwing * 0.7;
        // Interpolação suave
        const current = z.mesh.userData.armL.rotation.x;
        z.mesh.userData.armL.rotation.x = current + (target - current) * 0.15;
      }
      if (armRAvailable) {
        const target = isReaching
          ? -1.5 + Math.cos(z.walkPhase) * 0.08
          : legSwing * 0.7;
        const current = z.mesh.userData.armR.rotation.x;
        z.mesh.userData.armR.rotation.x = current + (target - current) * 0.15;
      }

      // Cabeça balança levemente (movimento vivo)
      if (z.mesh.userData.head) {
        z.mesh.userData.head.rotation.z = Math.sin(z.walkPhase * 0.5) * 0.08;
        z.mesh.userData.head.rotation.y = Math.sin(z.walkPhase * 0.3) * 0.1;
      }

      // Postura: quanto mais perto do player, mais pra frente se inclina
      // (fica mais agressivo quando ataca)
      const targetLean = isWounded
        ? 0.20 + (dist < 3 ? 0.10 : 0)
        : 0.12 + (dist < 3 ? 0.08 : 0);
      z.mesh.rotation.x += (targetLean - z.mesh.rotation.x) * 0.05;

      // Balanço lateral quando ferido (manca)
      if (isWounded) {
        z.mesh.rotation.z = Math.sin(z.walkPhase * 0.5) * 0.15;
      } else {
        z.mesh.rotation.z *= 0.9;
      }
    }

    if (z.dismembered.head) { z.health = 0; return; }

    // Só anda se já saiu da caverna
    if (emergeFactor >= 0.5) {
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

function updateHUD() {
  const hp = Math.max(0, state.health);
  document.getElementById('hp-fill').style.width = `${(hp / state.maxHealth) * 100}%`;
  document.getElementById('hp-text').textContent = `${Math.ceil(hp)} / ${state.maxHealth}`;
  document.getElementById('xp-fill').style.width = `${(state.xp / state.xpToNextLevel) * 100}%`;
  document.getElementById('coins').textContent = state.coins;
  document.getElementById('wave').textContent = state.wave;
  document.getElementById('level').textContent = state.level;
  document.getElementById('zombies').textContent = state.zombiesAlive;
  document.getElementById('ammo-current').textContent = 'FACA';
  document.getElementById('ammo-max').textContent = 'INF';
}

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
