import * as THREE from 'three';

// ============================================================
// CONFIGURAÇÕES (ajuste aqui para balancear)
// ============================================================
const CONFIG = {
  player: {
    speed: 5,
    height: 1.7,
    maxHealth: 100,
    attackRange: 2.8,
    attackDamage: 25,
    attackCooldown: 0.4,
  },
  zombie: {
    speed: 1.8,
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
  arena: { size: 60 },
};

// ============================================================
// ESTADO DO JOGO
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
};

// ============================================================
// THREE.JS
// ============================================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 25, 90);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 300
);
camera.position.set(0, CONFIG.player.height, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Luzes
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
scene.add(sun);

// ============================================================
// CHÃO QUADRICULADO
// ============================================================
function createFloor() {
  const size = CONFIG.arena.size;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4a7c4a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#3d6b3d';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillRect(32, 32, 32, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(size / 2, size / 2);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;

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
// PAREDES (cercas)
// ============================================================
function createWalls() {
  const size = CONFIG.arena.size;
  const h = size / 2;
  const wh = 4, wt = 0.5;
  const mat = new THREE.MeshLambertMaterial({ color: 0x555566 });
  const walls = [
    { w: size, h: wh, d: wt, x: 0, z: -h },
    { w: size, h: wh, d: wt, x: 0, z: h },
    { w: wt, h: wh, d: size, x: -h, z: 0 },
    { w: wt, h: wh, d: size, x: h, z: 0 },
  ];
  walls.forEach(w => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), mat);
    m.position.set(w.x, w.h / 2, w.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  });
}
createWalls();

// ============================================================
// CASAS
// ============================================================
function createHouse(x, z, color = 0x8b6f47) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4, 6),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(5, 2, 4),
    new THREE.MeshLambertMaterial({ color: 0x8b2f2f })
  );
  roof.position.y = 5;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  g.position.set(x, 0, z);
  scene.add(g);
}
createHouse(-15, -15, 0xa08060);
createHouse(15, -15, 0x907050);
createHouse(-15, 15, 0xb09070);
createHouse(15, 15, 0x806040);
createHouse(0, -20, 0xa08060);
createHouse(0, 20, 0x907050);

// ============================================================
// JOGADOR
// ============================================================
const player = {
  position: new THREE.Vector3(0, CONFIG.player.height, 0),
  yaw: 0,
  pitch: 0,
};

// ============================================================
// ZUMBIS
// ============================================================
const zombies = [];

function createZombieMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a7c3a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), bodyMat);
  body.position.y = 1; body.castShadow = true; g.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x6a9c5a })
  );
  head.position.y = 1.9; head.castShadow = true; g.add(head);

  const armGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.55, 1.2, 0); armL.castShadow = true; g.add(armL);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.55, 1.2, 0); armR.castShadow = true; g.add(armR);

  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const legGeo = new THREE.BoxGeometry(0.3, 1, 0.3);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.2, 0.5, 0); legL.castShadow = true; g.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.2, 0.5, 0); legR.castShadow = true; g.add(legR);

  return g;
}

function spawnZombie() {
  const s = CONFIG.arena.size / 2 - 3;
  const side = Math.floor(Math.random() * 4);
  let x, z;
  if (side === 0) { x = (Math.random() - 0.5) * s * 2; z = -s; }
  else if (side === 1) { x = (Math.random() - 0.5) * s * 2; z = s; }
  else if (side === 2) { x = -s; z = (Math.random() - 0.5) * s * 2; }
  else { x = s; z = (Math.random() - 0.5) * s * 2; }

  const mesh = createZombieMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  zombies.push({ mesh, health: CONFIG.zombie.maxHealth, lastAttackTime: 0 });
  state.zombiesAlive++;
  updateHUD();
}

// ============================================================
// ATAQUE (faca)
// ============================================================
function attack() {
  const now = performance.now() / 1000;
  if (now - state.lastAttackTime < CONFIG.player.attackCooldown) return;
  state.lastAttackTime = now;

  camera.rotation.z = 0.25;
  setTimeout(() => { camera.rotation.z = 0; }, 100);

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

    z.mesh.children.forEach(c => {
      if (c.material) {
        const orig = c.material.color.getHex();
        c.material.color.setHex(0xff0000);
        setTimeout(() => c.material.color.setHex(orig), 100);
      }
    });

    if (z.health <= 0) {
      state.coins += CONFIG.zombie.coinReward;
      state.xp += CONFIG.zombie.xpReward;
      checkLevelUp();
      scene.remove(z.mesh);
      state.zombiesAlive--;
      updateHUD();
    }
  });
}

function checkLevelUp() {
  while (state.xp >= state.xpToNextLevel) {
    state.xp -= state.xpToNextLevel;
    state.level++;
    state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.4);
  }
  updateHUD();
}

// ============================================================
// HORDAS
// ============================================================
function startWave() {
  state.wave++;
  state.betweenWaves = false;
  const count = Math.min(
    CONFIG.wave.baseZombies + (state.wave - 1) * CONFIG.wave.zombiesPerWave,
    CONFIG.wave.maxZombies
  );
  state.zombiesRemainingInWave = count;

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
  renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= e.movementX * 0.002;
  player.pitch -= e.movementY * 0.002;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});

document.addEventListener('mousedown', e => {
  if (e.button === 0 && state.running &&
      document.pointerLockElement === renderer.domElement) {
    attack();
  }
});

// ============================================================
// CONTROLES MOBILE
// ============================================================
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 'ontouchstart' in window;
}

const mobile = {
  moveX: 0, moveY: 0,
  looking: false, lastX: 0, lastY: 0,
};

function setupMobile() {
  if (!isMobile()) return;
  document.getElementById('mobile-controls').classList.remove('hidden');

  const stick = document.getElementById('joystick-stick');
  const base = document.getElementById('joystick-base');
  const look = document.getElementById('look-zone');
  const atk = document.getElementById('btn-attack');

  let baseRect = null;
  let touchingStick = false;

  base.addEventListener('touchstart', e => {
    e.preventDefault();
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
    mobile.lastX = t.clientX;
    mobile.lastY = t.clientY;
  }, { passive: false });

  look.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!mobile.looking) return;
    const t = e.touches[0];
    const dx = t.clientX - mobile.lastX;
    const dy = t.clientY - mobile.lastY;
    mobile.lastX = t.clientX;
    mobile.lastY = t.clientY;
    player.yaw -= dx * 0.005;
    player.pitch -= dy * 0.005;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  }, { passive: false });

  look.addEventListener('touchend', () => { mobile.looking = false; });

  atk.addEventListener('touchstart', e => {
    e.preventDefault();
    attack();
  }, { passive: false });
}
setupMobile();

// ============================================================
// LOOP PRINCIPAL
// ============================================================
const clock = new THREE.Clock();

function updatePlayer(dt) {
  const speed = CONFIG.player.speed;
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  let mx = 0, mz = 0;
  if (isMobile()) {
    mx = mobile.moveX; mz = mobile.moveY;
  } else {
    if (state.keys['KeyW']) mz -= 1;
    if (state.keys['KeyS']) mz += 1;
    if (state.keys['KeyA']) mx -= 1;
    if (state.keys['KeyD']) mx += 1;
  }

  const v = new THREE.Vector3();
  v.addScaledVector(fwd, -mz);
  v.addScaledVector(right, mx);
  if (v.length() > 0) v.normalize();
  player.position.addScaledVector(v, speed * dt);

  const limit = CONFIG.arena.size / 2 - 1;
  player.position.x = Math.max(-limit, Math.min(limit, player.position.x));
  player.position.z = Math.max(-limit, Math.min(limit, player.position.z));

  camera.position.copy(player.position);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function updateZombies(dt) {
  const now = performance.now() / 1000;
  zombies.forEach(z => {
    if (z.health <= 0) return;
    const toP = new THREE.Vector3().subVectors(player.position, z.mesh.position);
    toP.y = 0;
    const dist = toP.length();
    z.mesh.lookAt(player.position.x, z.mesh.position.y, player.position.z);

    if (dist > CONFIG.zombie.attackRange) {
      toP.normalize();
      z.mesh.position.addScaledVector(toP, CONFIG.zombie.speed * dt);
    } else if (now - z.lastAttackTime > CONFIG.zombie.attackCooldown) {
      z.lastAttackTime = now;
      state.health -= CONFIG.zombie.damage;
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
    checkWaveComplete();
  }
  renderer.render(scene, camera);
}
animate();

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  document.getElementById('health-bar').style.width =
    `${Math.max(0, (state.health / state.maxHealth) * 100)}%`;
  document.getElementById('xp-bar').style.width =
    `${(state.xp / state.xpToNextLevel) * 100}%`;
  document.getElementById('coins').textContent = state.coins;
  document.getElementById('wave').textContent = state.wave;
  document.getElementById('level').textContent = state.level;
  document.getElementById('zombies').textContent = state.zombiesAlive;
}

// ============================================================
// START / GAME OVER
// ============================================================
function startGame() {
  state.health = state.maxHealth;
  state.coins = 0;
  state.xp = 0;
  state.level = 1;
  state.xpToNextLevel = 50;
  state.wave = 0;
  state.zombiesAlive = 0;
  state.zombiesRemainingInWave = 0;
  state.running = true;
  state.betweenWaves = false;

  zombies.forEach(z => scene.remove(z.mesh));
  zombies.length = 0;

  player.position.set(0, CONFIG.player.height, 0);
  player.yaw = 0; player.pitch = 0;

  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');

  updateHUD();
  startWave();
}

function gameOver() {
  state.running = false;
  document.getElementById('final-wave').textContent = state.wave;
  document.getElementById('final-level').textContent = state.level;
  document.getElementById('final-coins').textContent = state.coins;
  document.getElementById('gameover').classList.remove('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
