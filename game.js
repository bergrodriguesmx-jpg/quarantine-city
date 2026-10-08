import * as THREE from 'three';
import * as Textures from './textures.js';
import * as Scenery from './scenery.js';
import * as Sfx from './audio.js';

// ============================================================
// CONFIG
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
  renderScale: 0.35, // Pixelização (0.35 = 35% da resolução)
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
};

// ============================================================
// THREE.JS — SETUP COM PIXELIZAÇÃO
// ============================================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87CEEB, 40, 120);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 400
);
camera.position.set(0, CONFIG.player.height, 0);

// Renderer principal (tela cheia, suave)
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Render target em baixa resolução (para pixelização)
let renderTarget = new THREE.WebGLRenderTarget(
  Math.floor(window.innerWidth * CONFIG.renderScale),
  Math.floor(window.innerHeight * CONFIG.renderScale),
  {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
  }
);

// Cena 2D para exibir o render target pixelizado
const pixelScene = new THREE.Scene();
const pixelCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const pixelMaterial = new THREE.MeshBasicMaterial({
  map: renderTarget.texture,
});
const pixelQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), pixelMaterial);
pixelScene.add(pixelQuad);

// Skybox
const skyGeo = new THREE.SphereGeometry(200, 16, 8);
const skyMat = new THREE.MeshBasicMaterial({
  map: Textures.skyTexture(),
  side: THREE.BackSide,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Iluminação clara e colorida (estilo Zumbi Blocks 2)
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xFFF5E6, 1.0);
sun.position.set(40, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Luz de preenchimento (fill light) azulada
const fillLight = new THREE.DirectionalLight(0xAED6F1, 0.3);
fillLight.position.set(-30, 20, -20);
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
// CERCA
// ============================================================
function createWalls() {
  const size = CONFIG.arena.size;
  const h = size / 2;
  const wh = 4, wt = 0.5;
  const tex = Textures.wallTexture();
  tex.repeat.set(size / 4, 1);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
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
function createHouse(x, z, baseColor) {
  const g = new THREE.Group();

  const wallTex = Textures.houseWallTexture(baseColor);
  wallTex.repeat.set(2, 1.5);
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), wallMat);
  body.position.y = 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // Porta
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x2C3E50 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.15), doorMat);
  door.position.set(0, 1.1, 3.02);
  g.add(door);

  // Janelas
  const winMat = new THREE.MeshLambertMaterial({
    color: 0x85C1E9,
    emissive: 0x1A5276,
    emissiveIntensity: 0.5,
  });
  const winGeo = new THREE.BoxGeometry(1, 1, 0.15);
  const windowPositions = [
    [-2, 2.7, 3.02], [2, 2.7, 3.02],
    [-2, 1.5, 3.02], [2, 1.5, 3.02],
    [-3.02, 2.7, -2], [3.02, 2.7, -2],
    [-3.02, 2.7, 2], [3.02, 2.7, 2],
  ];
  windowPositions.forEach(([wx, wy, wz]) => {
    const w = new THREE.Mesh(winGeo, winMat);
    w.position.set(wx, wy, wz);
    if (Math.abs(wx) > 2.9) w.rotation.y = Math.PI / 2;
    g.add(w);
  });

  // Telhado
  const roofTex = Textures.roofTexture();
  roofTex.repeat.set(3, 3);
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTex });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.5, 4), roofMat);
  roof.position.y = 5.25;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  g.position.set(x, 0, z);
  scene.add(g);
}
createHouse(-15, -15, '#D35400');
createHouse(15, -15, '#E67E22');
createHouse(-15, 15, '#F39C12');
createHouse(15, 15, '#D35400');
createHouse(0, -20, '#E67E22');
createHouse(0, 20, '#F39C12');

// ============================================================
// CENÁRIO (árvores, carros, etc.)
// ============================================================
Scenery.populateScene(scene, CONFIG.arena.size);

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
  const bodyColors = [0x27AE60, 0x2ECC71, 0x1E8449, 0x229954];
  const bodyColor = bodyColors[Math.floor(Math.random() * bodyColors.length)];
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), bodyMat);
  body.position.y = 1; body.castShadow = true; g.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x58D68D })
  );
  head.position.y = 1.9; head.castShadow = true; g.add(head);

  // Olhos vermelhos brilhantes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
  const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.05);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.15, 1.95, 0.32); g.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.15, 1.95, 0.32); g.add(eyeR);

  const armGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
  const armL = new THREE.Mesh(armGeo, bodyMat);
  armL.position.set(-0.55, 1.2, 0); armL.castShadow = true; g.add(armL);
  const armR = new THREE.Mesh(armGeo, bodyMat);
  armR.position.set(0.55, 1.2, 0); armR.castShadow = true; g.add(armR);

  const legMat = new THREE.MeshLambertMaterial({ color: 0x2C3E50 });
  const legGeo = new THREE.BoxGeometry(0.3, 1, 0.3);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.2, 0.5, 0); legL.castShadow = true; g.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.2, 0.5, 0); legR.castShadow = true; g.add(legR);

  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.legL = legL;
  g.userData.legR = legR;

  return g;
}

let groanTimer = 0;

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
  const count = 14;
  for (let i = 0; i < count; i++) {
    const size = 0.1 + Math.random() * 0.12;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.4 ? 0xCC0000 : 0x990000,
      transparent: true,
      opacity: 1,
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(position);
    p.position.y += 1.2 + (Math.random() - 0.5) * 0.5;

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      Math.random() * 4 + 2,
      (Math.random() - 0.5) * 6
    );

    scene.add(p);
    particles.push({ mesh: p, vel, life: 0.9, maxLife: 0.9 });
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
    p.mesh.rotation.y += dt * 4;

    if (p.life <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// ============================================================
// HIT MARKER + DAMAGE FLASH
// ============================================================
const hitMarker = document.getElementById('hit-marker');
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

// ============================================================
// MUZZLE FLASH
// ============================================================
function spawnMuzzleFlash() {
  const flash = new THREE.PointLight(0xFFAA33, 3, 6, 2);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  flash.position.copy(camera.position).addScaledVector(dir, 1.2);
  flash.position.y -= 0.2;
  scene.add(flash);

  let life = 0.08;
  const start = performance.now() / 1000;
  function fade() {
    const now = performance.now() / 1000;
    const t = (now - start) / life;
    if (t >= 1) { scene.remove(flash); return; }
    flash.intensity = 3 * (1 - t);
    requestAnimationFrame(fade);
  }
  fade();
}

// ============================================================
// ATAQUE
// ============================================================
function attack() {
  const now = performance.now() / 1000;
  if (now - state.lastAttackTime < CONFIG.player.attackCooldown) return;
  state.lastAttackTime = now;

  Sfx.playKnife();
  spawnMuzzleFlash();

  const startSwing = performance.now() / 1000;
  function swingAnim() {
    const t = performance.now() / 1000 - startSwing;
    if (t > 0.18) { camera.rotation.z = 0; return; }
    camera.rotation.z = Math.sin(t / 0.18 * Math.PI) * 0.35;
    requestAnimationFrame(swingAnim);
  }
  swingAnim();

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
    bloodPos.y += 1;
    spawnBlood(bloodPos);

    z.mesh.children.forEach(c => {
      if (c.material && c.material.color && !c.material.emissive) {
        const orig = c.material.color.getHex();
        c.material.color.setHex(0xFF0000);
        setTimeout(() => {
          if (c.material) c.material.color.setHex(orig);
        }, 100);
      }
    });

    if (z.health <= 0) {
      Sfx.playZombieDeath();
      Sfx.playCoin();
      state.coins += CONFIG.zombie.coinReward;
      state.xp += CONFIG.zombie.xpReward;
      checkLevelUp();

      const deathPos = z.mesh.position.clone();
      deathPos.y += 1;
      spawnBlood(deathPos);
      spawnBlood(deathPos);

      scene.remove(z.mesh);
      state.zombiesAlive--;
      updateHUD();
    }
  });
}

// ============================================================
// LEVEL UP
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

// ============================================================
// HORDAS
// ============================================================
const waveBanner = document.getElementById('wave-banner');
const waveBannerText = document.getElementById('wave-banner-text');

function showWaveBanner(text) {
  waveBannerText.textContent = text;
  waveBanner.classList.remove('hidden');
  waveBanner.classList.add('show');
  setTimeout(() => {
    waveBanner.classList.remove('show');
    setTimeout(() => waveBanner.classList.add('hidden'), 400);
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
    setTimeout(() => {
      if (state.running) startWave();
    }, CONFIG.wave.breakTime * 1000);
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
    Sfx.initAudio();
    Sfx.resumeAudio();
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

  state.isMoving = v.length() > 0.05;

  if (v.length() > 0) v.normalize();
  player.position.addScaledVector(v, speed * dt);

  const limit = CONFIG.arena.size / 2 - 1;
  player.position.x = Math.max(-limit, Math.min(limit, player.position.x));
  player.position.z = Math.max(-limit, Math.min(limit, player.position.z));

  if (state.isMoving) {
    state.bobTime += dt * 8;
  } else {
    state.bobTime *= 0.9;
  }
  const bobY = Math.sin(state.bobTime) * 0.06;
  const bobX = Math.cos(state.bobTime * 0.5) * 0.03;

  camera.position.copy(player.position);
  camera.position.y += bobY;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.position.x += bobX * Math.cos(player.yaw);
  camera.position.z += bobX * Math.sin(player.yaw);
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

    z.walkPhase += dt * 6;
    const swing = Math.sin(z.walkPhase) * 0.5;
    if (z.mesh.userData.legL) {
      z.mesh.userData.legL.rotation.x = swing;
      z.mesh.userData.legR.rotation.x = -swing;
    }
    if (z.mesh.userData.armL) {
      z.mesh.userData.armL.rotation.x = -1.4 + Math.sin(z.walkPhase) * 0.1;
      z.mesh.userData.armR.rotation.x = -1.4 + Math.cos(z.walkPhase) * 0.1;
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
  } else {
    updateParticles(dt);
  }

  // RENDER PIXELIZADO
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(pixelScene, pixelCamera);
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
  Sfx.initAudio();
  Sfx.resumeAudio();

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
  particles.forEach(p => scene.remove(p.mesh));
  particles.length = 0;

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

  // Recriar render target em baixa resolução
  renderTarget.dispose();
  renderTarget = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * CONFIG.renderScale),
    Math.floor(window.innerHeight * CONFIG.renderScale),
    {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    }
  );
  pixelMaterial.map = renderTarget.texture;
  pixelMaterial.needsUpdate = true;
});
