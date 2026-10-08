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
  },
  wave: {
    baseZombies: 6,
    zombiesPerWave: 2,
    maxZombies: 40,
    breakTime: 5,
  },
  arena: { size: 80 },
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
// THREE.JS — SETUP (SEM PIXELIZAÇÃO)
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

// Iluminação — clara e alegre (estilo ZB2)
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

// Fill light (evita sombras pretas)
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
// CENÁRIO (bairro completo)
// ============================================================
Scenery.populateScene(scene, CONFIG.arena.size);

// ============================================================
// PAREDES LIMITE (invisíveis, impede sair do mapa)
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
// VIEWMODEL (arma na mão — primeira pessoa)
// ============================================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

function createKnifeViewModel() {
  const g = new THREE.Group();

  // Cabo
  const handleMat = new THREE.MeshLambertMaterial({ color: 0x2C3E50 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), handleMat);
  handle.position.set(0, 0, 0);
  g.add(handle);

  // Guarda
  const guardMat = new THREE.MeshLambertMaterial({ color: 0x7F8C8D });
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.08), guardMat);
  guard.position.set(0, 0.13, 0);
  g.add(guard);

  // Lâmina
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0xBDC3C7 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.02), bladeMat);
  blade.position.set(0, 0.32, 0);
  g.add(blade);

  // Ponta
  const tipMat = new THREE.MeshLambertMaterial({ color: 0xECF0F1 });
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.02), tipMat);
  tip.position.set(0, 0.53, 0);
  g.add(tip);

  return g;
}

const knifeVM = createKnifeViewModel();
knifeVM.position.set(0.35, -0.35, -0.7);
knifeVM.rotation.set(-0.3, -0.4, 0.3);
weaponGroup.add(knifeVM);

// Animação de ataque
let swingProgress = 0;
let swinging = false;

function triggerSwing() {
  swinging = true;
  swingProgress = 0;
}

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
      knifeVM.position.set(
        0.35 - arc * 0.4,
        -0.35 + arc * 0.15,
        -0.7 - arc * 0.15
      );
      knifeVM.rotation.set(
        -0.3 - arc * 0.6,
        -0.4 + arc * 0.8,
        0.3 - arc * 0.5
      );
    }
  } else {
    // Idle bob
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
// ZUMBIS (estilo Roblox/ZB2 — blocos separados + feridas vermelhas)
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

  // --- Cabeça (cubo, textura "cara" simples) ---
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), skinMat);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);

  // Olhos pretos
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.02);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.12, 1.92, 0.28);
  g.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.12, 1.92, 0.28);
  g.add(eyeR);

  // Boca vermelha
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.02), woundMat);
  mouth.position.set(0, 1.72, 0.28);
  g.add(mouth);

  // Ferida na cabeça (lateral)
  const woundHead = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.02), woundMat);
  woundHead.position.set(-0.2, 2, 0.2);
  woundHead.rotation.y = -0.5;
  g.add(woundHead);

  // --- Tronco (camisa) ---
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.35), shirtMat);
  torso.position.y = 1.15;
  torso.castShadow = true;
  g.add(torso);

  // Feridas no tronco
  const woundTorso1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), woundMat);
  woundTorso1.position.set(0.15, 1.2, 0.18);
  g.add(woundTorso1);
  const woundTorso2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), woundMat);
  woundTorso2.position.set(-0.2, 1.05, 0.18);
  g.add(woundTorso2);

  // --- Braços (parte de cima = camisa, parte de baixo = pele) ---
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
    // Mão
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), skinMat);
    hand.position.y = -0.88;
    arm.add(hand);
    // Ferida no braço
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

  // --- Pernas (calça + pé) ---
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

  // Guardar referências para animação
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
  });
  state.zombiesAlive++;
  updateHUD();
}

// ============================================================
// PARTÍCULAS DE SANGUE
// ============================================================
const particles = [];

function spawnBlood(position) {
  for (let i = 0; i < 12; i++) {
    const size = 0.1 + Math.random() * 0.1;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.4 ? 0xC0392B : 0x8B0000,
      transparent: true,
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(position);
    p.position.y += 1.1 + (Math.random() - 0.5) * 0.5;

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      Math.random() * 4 + 2,
      (Math.random() - 0.5) * 5
    );

    scene.add(p);
    particles.push({ mesh: p, vel, life: 0.8, maxLife: 0.8 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vel.y -= 14 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05) {
      p.mesh.position.y = 0.05;
      p.vel.y = -p.vel.y * 0.3;
      p.vel.x *= 0.7;
      p.vel.z *= 0.7;
    }
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    p.mesh.rotation.x += dt * 6;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// ============================================================
// HIT MARKER / DAMAGE FLASH / MUZZLE FLASH
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
    if (z.health <= 0) return;
    const toZ = new THREE.Vector3().subVectors(z.mesh.position, player.position);
    toZ.y = 0;
    if (toZ.length() > CONFIG.player.attackRange) return;
    toZ.normalize();
    if (forward.dot(toZ) < 0.4) return;

    z.health -= CONFIG.player.attackDamage;
    Sfx.playHit();
    showHitMarker();

    const bloodPos = z.mesh.position.clone();
    bloodPos.y += 1.1;
    spawnBlood(bloodPos);

    z.mesh.children.forEach(c => {
      if (c.material && c.material.color && !c.material.emissive) {
        const orig = c.material.color.getHex();
        c.material.color.setHex(0xFFFFFF);
        setTimeout(() => { if (c.material) c.material.color.setHex(orig); }, 80);
      }
    });

    if (z.health <= 0) {
      Sfx.playZombieDeath();
      Sfx.playCoin();
      state.coins += CONFIG.zombie.coinReward;
      state.xp += CONFIG.zombie.xpReward;
      checkLevelUp();
      const deathPos = z.mesh.position.clone();
      deathPos.y += 1.1;
      spawnBlood(deathPos);
      spawnBlood(deathPos);
      scene.remove(z.mesh);
      state.zombiesAlive--;
      updateHUD();
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
// CONTROLES PC
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

// ============================================================
// CONTROLES MOBILE
// ============================================================
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
    const toP = new THREE.Vector3().subVectors(player.position, z.mesh.position);
    toP.y = 0;
    const dist = toP.length();
    z.mesh.lookAt(player.position.x, z.mesh.position.y, player.position.z);

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

    if (dist > CONFIG.zombie.attackRange) {
      toP.normalize();
      z.mesh.position.addScaledVector(toP, CONFIG.zombie.speed * dt);
    } else if (now - z.lastAttackTime > CONFIG.zombie.attackCooldown) {
      z.lastAttackTime = now;
      state.health -= CONFIG.zombie.damage;
      Sfx.playPlayerHurt();
      showDamageFlash();
      updateHUD();
      if (state.health <= 0) gameOver();
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (state.running) {
    updatePlayer(dt);
    updateZombies(dt);
    updateParticles(dt);
    checkWaveComplete();
    updateWeaponViewModel(dt);
    // Timer
    const elapsed = Math.floor((performance.now() - state.startTime) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${min}:${sec}`;
  } else {
    updateParticles(dt);
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

  zombies.forEach(z => scene.remove(z.mesh));
  zombies.length = 0;
  particles.forEach(p => scene.remove(p.mesh));
  particles.length = 0;

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

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
