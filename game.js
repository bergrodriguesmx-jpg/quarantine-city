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
    knockbackStagger: 0.2,  // tempo que cambaleia ao ser atingido
  },
  wave: {
    baseZombies: 6,
    zombiesPerWave: 2,
    maxZombies: 40,
    breakTime: 5,
  },
  arena: { size: 80 },
  death: {
    fallDuration: 0.9,   // tempo para cair
    stayOnGround: 4,     // tempo morto no chão antes de desaparecer
    fadeDuration: 1.2,   // tempo do fade
  },
};

// ============================================================
// ESTADO
// ============================================================
const state = {
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

// Skybox
const skyGeo = new THREE.SphereGeometry(200, 32, 16);
const skyMat = new THREE.MeshBasicMaterial({
  map: Textures.skyTexture(),
  side: THREE.BackSide,
  fog: false,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Iluminação
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
// CHÃO
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

// ============================================================
// CENÁRIO
// ============================================================
Scenery.populateScene(scene, CONFIG.arena.size);

// ============================================================
// LIMITES INVISÍVEIS
// ============================================================
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
// VIEWMODEL (faca)
// ============================================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

function createKnifeViewModel() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.22, 0.06),
    new THREE.MeshLambertMaterial({ color: 0x2C3E50 })
  );
  g.add(handle);

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.03, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x7F8C8D })
  );
  guard.position.set(0, 0.13, 0);
  g.add(guard);

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.35, 0.02),
    new THREE.MeshLambertMaterial({ color: 0xBDC3C7 })
  );
  blade.position.set(0, 0.32, 0);
  g.add(blade);

  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.08, 0.02),
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
// JOGADOR
// ============================================================
const player = {
  position: new THREE.Vector3(0, CONFIG.player.height, 0),
  yaw: 0,
  pitch: 0,
};

// ============================================================
// ZUMBIS — com sistema de ragdoll
// ============================================================
const zombies = [];

const SHIRT_COLORS = [0x8E44AD, 0x2ECC71, 0xE74C3C, 0x3498DB, 0xF39C12];
const PANTS_COLORS = [0x8B5A2B, 0x5D4030, 0x3E2723];
const SKIN_COLORS  = [0x7BC950, 0x6BB840, 0x8DD65A];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function createZombieMesh() {
  const g = new THREE.Group();

  const skinColor  = rand(SKIN_COLORS);
  const shirtColor = rand(SHIRT_COLORS);
  const pantsColor = rand(PANTS_COLORS);

  const skinMat  = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
  const woundMat = new THREE.MeshBasicMaterial({ color: 0xC0392B });
  const eyeMat   = new THREE.MeshBasicMaterial({ color: 0x000000 });

  // Cabeça
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);

  // Olhos
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.12, 1.92, 0.28);
  g.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.12, 1.92, 0.28);
  g.add(eyeR);

  // Boca
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.02), woundMat);
  mouth.position.set(0, 1.72, 0.28);
  g.add(mouth);

  // Ferida na cabeça
  const woundHead = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.02), woundMat);
  woundHead.position.set(-0.2, 2, 0.2);
  woundHead.rotation.y = -0.5;
  g.add(woundHead);

  // Tronco
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.35), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);

  const woundTorso1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), woundMat);
  woundTorso1.position.set(0.15, 1.2, 0.18);
  g.add(woundTorso1);
  const woundTorso2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), woundMat);
  woundTorso2.position.set(-0.2, 1.05, 0.18);
  g.add(woundTorso2);

  // Braços
  function makeArm(side) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.22), shirtMat);
    upper.position.y = -0.2;
    upper.castShadow = true;
    arm.add(upper);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), skinMat);
    lower.position.y = -0.6;
    lower.castShadow = true;
    arm.add(lower);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), skinMat);
    hand.position.y = -0.88;
    arm.add(hand);
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

  // Pernas
  function makeLeg() {
    const leg = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.26), pantsMat);
    upper.position.y = -0.275;
    upper.castShadow = true;
    leg.add(upper);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.32), pantsMat);
    shoe.position.set(0, -0.6, 0.03);
    shoe.castShadow = true;
    leg.add(shoe);
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
    lastAttackTime: 0,
    walkPhase: Math.random() * Math.PI * 2,
    // Sistema de estados
    state: 'alive',           // 'alive' | 'dying' | 'dead'
    dieStartTime: 0,
    fallAxis: new THREE.Vector3(1, 0, 0),
    fallDirection: new THREE.Vector3(0, 0, 1),
    hitReactEndTime: 0,       // cambaleio ao ser atingido (não morre)
    hitDirection: new THREE.Vector3(),
    maxFallAngle: Math.PI / 2,
    yStart: 0,
  });
  state.zombiesAlive++;
  updateHUD();
}

// ============================================================
// PARTÍCULAS DE SANGUE — spray direcional
// ============================================================
const particles = [];

function spawnBlood(position, direction = null, count = 16) {
  // direction: direção do spray (ex: direção do ataque)
  // se null, spray radial
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.1;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.4 ? 0xC0392B : 0x8B0000,
      transparent: true,
      opacity: 1,
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(position);

    // Velocidade: se tem direção, spray em cone na direção + espalhamento
    let vel;
    if (direction) {
      const spread = 0.7;
      const dir = direction.clone().normalize();
      // Vetores perpendiculares
      const perp1 = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
      const a = (Math.random() - 0.5) * spread * 2;
      const b = (Math.random() - 0.5) * spread * 2;

      const speed = 4 + Math.random() * 5;
      vel = dir.clone().multiplyScalar(speed);
      vel.addScaledVector(perp1, a * speed * 0.5);
      vel.addScaledVector(perp2, b * speed * 0.5);
      vel.y += 2 + Math.random() * 3; // sobe um pouco
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

// ============================================================
// POÇAS DE SANGUE (marcas no chão)
// ============================================================
const bloodPools = [];

function spawnBloodPool(position, fallDirection) {
  const size = 0.6 + Math.random() * 0.5;
  const geo = new THREE.CircleGeometry(size, 12);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x6B0000,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const pool = new THREE.Mesh(geo, mat);
  pool.rotation.x = -Math.PI / 2;
  pool.rotation.z = Math.random() * Math.PI * 2;
  // Estica na direção da queda
  if (fallDirection) {
    pool.scale.set(1 + Math.random() * 0.5, 0.6, 1);
    pool.rotation.z = Math.atan2(fallDirection.x, fallDirection.z);
  }
  pool.position.set(position.x, 0.03, position.z);
  pool.renderOrder = 1;
  scene.add(pool);
  bloodPools.push({ mesh: pool, life: 30 });

  // Limita a 20 poças
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
    if (b.life < 3) {
      b.mesh.material.opacity = Math.max(0, (b.life / 3) * 0.75);
    }
    if (b.life <= 0) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      bloodPools.splice(i, 1);
    }
  }
}

// ============================================================
// RAGDOLL — iniciar queda e animar
// ============================================================
function startDying(z, hitDirection) {
  z.state = 'dying';
  z.dieStartTime = performance.now() / 1000;
  z.yStart = z.mesh.position.y;

  // Direção da queda: empurrado na direção do golpe
  let fallDir;
  if (hitDirection && hitDirection.lengthSq() > 0.01) {
    fallDir = hitDirection.clone().normalize();
  } else {
    fallDir = new THREE.Vector3(
      (Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2
    ).normalize();
  }
  z.fallDirection.copy(fallDir);

  // Eixo de rotação perpendicular à direção da queda (para o zumbi tombar de lado)
  z.fallAxis.set(-fallDir.z, 0, fallDir.x).normalize();

  // Quantidade de rotação: tomba ~90 graus
  z.maxFallAngle = Math.PI / 2;

  // Pernas e braços ficam moles
  if (z.mesh.userData.armL) {
    z.mesh.userData.armL.rotation.x = -0.3 + Math.random() * 0.6;
    z.mesh.userData.armL.rotation.z = (Math.random() - 0.5) * 0.5;
    z.mesh.userData.armR.rotation.x = -0.3 + Math.random() * 0.6;
    z.mesh.userData.armR.rotation.z = (Math.random() - 0.5) * 0.5;
    z.mesh.userData.legL.rotation.x = (Math.random() - 0.5) * 0.5;
    z.mesh.userData.legL.rotation.z = (Math.random() - 0.5) * 0.3;
    z.mesh.userData.legR.rotation.x = (Math.random() - 0.5) * 0.5;
    z.mesh.userData.legR.rotation.z = (Math.random() - 0.5) * 0.3;
  }

  // Prepara materiais para fade futuro
  z.mesh.traverse(c => {
    if (c.material) {
      c.material.transparent = true;
    }
  });

  // Guarda rotação inicial (posição do "olhar" antes da morte)
  z.initialQuat = z.mesh.quaternion.clone();

  // Poça de sangue embaixo (será criada conforme cai)
  spawnBloodPool(z.mesh.position.clone(), fallDir);
}

function updateDying(z, now) {
  const t = now - z.dieStartTime;
  const fallDur = CONFIG.death.fallDuration;
  const stayDur = CONFIG.death.stayOnGround;
  const fadeDur = CONFIG.death.fadeDuration;

  if (t < fallDur) {
    // Fase de queda com ease-out
    const p = t / fallDur;
    const ease = 1 - Math.pow(1 - p, 3);
    const angle = ease * z.maxFallAngle;

    // Aplica rotação: parte da rotação original + giro de queda
    const fallQuat = new THREE.Quaternion().setFromAxisAngle(z.fallAxis, angle);
    z.mesh.quaternion.copy(z.initialQuat).multiply(fallQuat);

    // Ajusta Y: sobe um pouco no meio (impacto) e assenta
    const bumpY = Math.sin(p * Math.PI) * 0.15;
    z.mesh.position.y = z.yStart + ease * 0.25 + bumpY;

  } else if (t < fallDur + stayDur) {
    // Parado no chão
    const fallQuat = new THREE.Quaternion().setFromAxisAngle(z.fallAxis, z.maxFallAngle);
    z.mesh.quaternion.copy(z.initialQuat).multiply(fallQuat);
    z.mesh.position.y = z.yStart + 0.25;

  } else if (t < fallDur + stayDur + fadeDur) {
    // Fade out
    const p = (t - fallDur - stayDur) / fadeDur;
    const fallQuat = new THREE.Quaternion().setFromAxisAngle(z.fallAxis, z.maxFallAngle);
    z.mesh.quaternion.copy(z.initialQuat).multiply(fallQuat);
    z.mesh.position.y = z.yStart + 0.25;

    z.mesh.traverse(c => {
      if (c.material && c.material.transparent) {
        c.material.opacity = 1 - p;
      }
    });

  } else {
    // Remove
    scene.remove(z.mesh);
    z.mesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    return true;
  }
  return false;
}

// ============================================================
// HIT MARKER / DAMAGE FLASH
// ============================================================
const hitMarker  = document.getElementById('hit-marker');
const damageFlash = document.getElementById('damage-flash');

function showHitMarker() {
  hitMarker.classList.remove('active');
  void hitMarker.offsetWidth;
  hitMarker.classList.add('active');
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
  forward.y = 0; forward.normalize();

  zombies.forEach(z => {
    if (z.state !== 'alive') return;

    const toZ = new THREE.Vector3().subVectors(z.mesh.position, player.position);
    toZ.y = 0;
    if (toZ.length() > CONFIG.player.attackRange) return;
    toZ.normalize();
    if (forward.dot(toZ) < 0.4) return;

    // === DANO ===
    z.health -= CONFIG.player.attackDamage;

    // Direção do hit (do jogador para o zumbi)
    const hitDir = new THREE.Vector3()
      .subVectors(z.mesh.position, player.position);
    hitDir.y = 0;
    hitDir.normalize();

    // Ponto de impacto (peito do zumbi, ~1.1m)
    const hitPoint = z.mesh.position.clone();
    hitPoint.y += 1.1;

    // === SANGUE NO PONTO DE IMPACTO ===
    spawnBlood(hitPoint, hitDir, 14);

    // === FEEDBACK VISUAL ===
    Sfx.playHit();
    showHitMarker();

    // Pisca branco rápido
    z.mesh.traverse(c => {
      if (c.material && c.material.color && !c.material.emissive) {
        if (!c.userData._origColor) c.userData._origColor = c.material.color.getHex();
        c.material.color.setHex(0xFFFFFF);
        setTimeout(() => {
          if (c.material && c.userData._origColor !== undefined) {
            c.material.color.setHex(c.userData._origColor);
          }
        }, 70);
      }
    });

    // === MORTE ou CAMBALEIO ===
    if (z.health <= 0) {
      // MORTE: inicia ragdoll
      Sfx.playZombieDeath();
      Sfx.playCoin();
      state.coins += CONFIG.zombie.coinReward;
      state.xp += CONFIG.zombie.xpReward;
      checkLevelUp();
      startDying(z, hitDir);
      state.zombiesAlive--;
      updateHUD();
    } else {
      // CAMBALEIO: empurra pra trás e inclina
      z.hitReactEndTime = now + CONFIG.zombie.knockbackStagger;
      z.hitDirection.copy(hitDir);
    }
  });
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
  state.wave++;
  state.betweenWaves = false;
  const count = Math.min(
    CONFIG.wave.baseZombies + (state.wave - 1) * CONFIG.wave.zombiesPerWave,
    CONFIG.wave.maxZombies
  );
  state.zombiesRemainingInWave = count;
  showWaveBanner(`HORDA ${state.wave}`);

  let spawned = 0;
  const interval = setInterval(() => {
    if (spawned >= count || !state.running) {
      clearInterval(interval); return;
    }
    spawnZombie(); spawned++;
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
  if (groanTimer <= 0 && zombies.some(z => z.state === 'alive')) {
    groanTimer = 1.5 + Math.random() * 3;
    Sfx.playGroan();
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];

    // Morto (ragdoll)
    if (z.state === 'dying') {
      const removed = updateDying(z, now);
      if (removed) zombies.splice(i, 1);
      continue;
    }

    if (z.state !== 'alive') continue;

    const toP = new THREE.Vector3().subVectors(player.position, z.mesh.position);
    toP.y = 0;
    const dist = toP.length();

    // Olhar para o jogador
    z.mesh.lookAt(player.position.x, z.mesh.position.y, player.position.z);

    // === CAMBALEIO (impacto) ===
    const staggering = z.hitReactEndTime > now;
    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      // Inclina pra trás (sentido contrário ao hit)
      z.mesh.rotateX(-lean * 0.45);
      // Empurra um pouco pra trás
      z.mesh.position.addScaledVector(z.hitDirection, -dt * 4 * lean);
      // Braços pra trás (impacto)
      if (z.mesh.userData.armL) {
        z.mesh.userData.armL.rotation.x = -1.5 + lean * 0.8;
        z.mesh.userData.armR.rotation.x = -1.5 + lean * 0.8;
      }
    } else {
      // Animação normal de andar
      z.walkPhase += dt * 5;
      const swing = Math.sin(z.walkPhase) * 0.55;
      if (z.mesh.userData.legL) {
        z.mesh.userData.legL.rotation.x = swing;
        z.mesh.userData.legR.rotation.x = -swing;
      }
      if (z.mesh.userData.armL) {
        z.mesh.userData.armL.rotation.x = -1.5 + Math.sin(z.walkPhase) * 0.12;
        z.mesh.userData.armR.rotation.x = -1.5 + Math.cos(z.walkPhase) * 0.12;
      }
    }

    // Movimento
    if (!staggering && dist > CONFIG.zombie.attackRange) {
      toP.normalize();
      z.mesh.position.addScaledVector(toP, CONFIG.zombie.speed * dt);
    } else if (!staggering && now - z.lastAttackTime > CONFIG.zombie.attackCooldown) {
      z.lastAttackTime = now;
      state.health -= CONFIG.zombie.damage;
      Sfx.playPlayerHurt();
      showDamageFlash();
      updateHUD();
      if (state.health <= 0) gameOver();
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

    const elapsed = Math.floor((performance.now() - state.startTime) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${min}:${sec}`;
  } else {
    updateParticles(dt);
    updateBloodPools(dt);
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
  Sfx.initAudio(); Sfx.resumeAudio();

  state.health = state.maxHealth;
  state.coins = 0; state.xp = 0;
  state.level = 1; state.xpToNextLevel = 50;
  state.wave = 0; state.zombiesAlive = 0;
  state.zombiesRemainingInWave = 0;
  state.running = true; state.betweenWaves = false;
  state.startTime = performance.now();

  // Limpa zumbis
  zombies.forEach(z => {
    scene.remove(z.mesh);
    z.mesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  });
  zombies.length = 0;

  // Limpa partículas
  particles.forEach(p => scene.remove(p.mesh));
  particles.length = 0;

  // Limpa poças de sangue
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
