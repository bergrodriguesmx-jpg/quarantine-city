import * as THREE from 'three';
import * as Textures from './textures.js';
import { buildWorld } from './scenery.js';
import * as Sfx from './audio.js';

// ============================================================
// ARMAS
// ============================================================
const WEAPONS = {
  knife:    { id: 'knife',    name: 'FACA',           slot: 1, damage: 25, range: 3.2, cooldown: 0.4,  type: 'melee',  ammo: null, maxAmmo: null, cost: 0,    spread: 0,     pellets: 1, auto: false, color: 0xBDC3C7 },
  pistol:   { id: 'pistol',   name: 'PISTOLA',        slot: 2, damage: 35, range: 15,  cooldown: 0.3,  type: 'ranged', ammo: 999, maxAmmo: 999,  cost: 40,   spread: 0.015, pellets: 1, auto: false, color: 0x2C3E50 },
  revolver: { id: 'revolver', name: 'REVOLVER',       slot: 2, damage: 60, range: 14,  cooldown: 0.6,  type: 'ranged', ammo: 30,  maxAmmo: 30,   cost: 150,  spread: 0.01,  pellets: 1, auto: false, color: 0x4A4A4A },
  smg:      { id: 'smg',      name: 'SMG',            slot: 3, damage: 20, range: 12,  cooldown: 0.09, type: 'ranged', ammo: 180, maxAmmo: 180,  cost: 200,  spread: 0.06,  pellets: 1, auto: true,  color: 0x34495E },
  rifle:    { id: 'rifle',    name: 'RIFLE',          slot: 3, damage: 70, range: 25,  cooldown: 0.15, type: 'ranged', ammo: 90,  maxAmmo: 90,   cost: 400,  spread: 0.02,  pellets: 1, auto: true,  color: 0x2C3E50 },
  shotgun:  { id: 'shotgun',  name: 'SHOTGUN',        slot: 3, damage: 30, range: 8,   cooldown: 0.8,  type: 'ranged', ammo: 24,  maxAmmo: 24,   cost: 300,  spread: 0.18,  pellets: 8, auto: false, color: 0x8B4513 },
  launcher: { id: 'launcher', name: 'LANCA-FOGUETES', slot: 4, damage: 200, range: 18, cooldown: 1.4,  type: 'ranged', ammo: 5,   maxAmmo: 5,    cost: 1200, spread: 0.03,  pellets: 1, auto: false, color: 0xC0392B },
};

const SKILLS = [
  { id: 'vitality', icon: 'V', name: 'VITALIDADE', desc: '+20 HP maximo', apply: () => { state.maxHealth += 20; state.health = Math.min(state.maxHealth, state.health + 20); } },
  { id: 'strength', icon: 'F', name: 'FORCA', desc: '+15% dano', apply: () => { state.damageMult += 0.15; } },
  { id: 'reach', icon: 'A', name: 'ALCANCE', desc: '+0.3m alcance', apply: () => { state.rangeBonus += 0.3; } },
  { id: 'agility', icon: 'V', name: 'AGILIDADE', desc: '+8% velocidade', apply: () => { state.speedMult += 0.08; } },
  { id: 'precision', icon: 'P', name: 'PRECISAO', desc: '+8% critico', apply: () => { state.critChance = Math.min(0.95, state.critChance + 0.08); } },
  { id: 'vampirism', icon: 'S', name: 'VAMPIRISMO', desc: '+3 HP por kill', apply: () => { state.lifesteal += 3; } },
  { id: 'fortune', icon: '$', name: 'FORTUNA', desc: '+50% moedas', apply: () => { state.coinMult += 0.5; } },
  { id: 'wisdom', icon: 'W', name: 'SABEDORIA', desc: '+30% XP', apply: () => { state.xpMult += 0.3; } },
  { id: 'resistance', icon: 'R', name: 'RESISTENCIA', desc: '-10% dano recebido', apply: () => { state.damageReduction = Math.min(0.7, state.damageReduction + 0.1); } },
  { id: 'fury', icon: 'U', name: 'FURIA', desc: '-12% tempo ataque', apply: () => { state.attackSpeedMult += 0.12; } },
  { id: 'heavy', icon: 'H', name: 'GOLPE PESADO', desc: '+0.5x dano critico', apply: () => { state.critDamageBonus += 0.5; } },
];

const CONFIG = {
  player: { speed: 5.5, height: 1.7, maxHealth: 100, radius: 0.4 },
  zombie: { speed: 1.9, maxHealth: 40, damage: 8, attackRange: 1.6, attackCooldown: 1.2, xpReward: 10, coinReward: 2, knockbackStagger: 0.25, radius: 0.4 },
  wave: { baseZombies: 6, zombiesPerWave: 2, maxZombies: 40, breakTime: 5 },
  arena: { size: 80 },
  ragdoll: { maxActive: 8, settleTime: 25, fadeDuration: 1.5, impactImpulse: 9, sliceRange: 3.5, sliceDotMin: 0.25 },
  crit: { baseChance: 0.15, damageMultiplier: 2 },
  dismember: { headChance: 0.65, armChance: 0.50, legChance: 0.40, limbSpeed: 14, limbLife: 10 },
};

const state = {
  waveIntervalId: null,
  health: CONFIG.player.maxHealth, maxHealth: CONFIG.player.maxHealth,
  coins: 0, xp: 0, xpToNextLevel: 50, level: 1, wave: 0,
  zombiesAlive: 0, zombiesRemainingInWave: 0,
  running: false, betweenWaves: false,
  lastAttackTime: 0, keys: {}, bobTime: 0, isMoving: false, startTime: 0,
  critChance: CONFIG.crit.baseChance,
  damageMult: 1.0, rangeBonus: 0, speedMult: 1.0, lifesteal: 0,
  coinMult: 1.0, xpMult: 1.0, damageReduction: 0,
  attackSpeedMult: 1.0, critDamageBonus: 0,
  levelUpActive: false, pendingLevelUps: 0,
  inventory: { 1: 'knife', 2: null, 3: null, 4: null },
  currentSlot: 1,
  mouseDown: false,
};

const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xC5E0F5, 60, 160);
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, CONFIG.player.height, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(200, 32, 16),
  new THREE.MeshBasicMaterial({ map: Textures.skyTexture(), side: THREE.BackSide, fog: false })
));

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0004;
scene.add(sun);

{
  const size = CONFIG.arena.size;
  const tex = Textures.grassTexture();
  tex.repeat.set(size / 2, size / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

const world = buildWorld(scene, CONFIG.arena.size);

const caves = [];
{
  const half = CONFIG.arena.size / 2 - 3;
  const data = [
    { x: 0, z: -half, rot: 0 }, { x: 0, z: half, rot: Math.PI },
    { x: -half, z: 0, rot: Math.PI / 2 }, { x: half, z: 0, rot: -Math.PI / 2 },
    { x: -half * 0.7, z: -half * 0.7, rot: Math.PI / 4 },
    { x: half * 0.7, z: -half * 0.7, rot: -Math.PI / 4 },
    { x: -half * 0.7, z: half * 0.7, rot: Math.PI * 3 / 4 },
    { x: half * 0.7, z: half * 0.7, rot: -Math.PI * 3 / 4 },
  ];
  data.forEach(({ x, z, rot }) => {
    const mesh = createCave(x, z, rot);
    scene.add(mesh);
    caves.push({ x, z, rot, mesh });
  });
}

function createCave(x, z, rotationY) {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5A5A5A, flatShading: true });
  const darkRock = new THREE.MeshLambertMaterial({ color: 0x3A3A3A, flatShading: true });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  function rock(px, py, pz, sx, sy, sz, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat || rockMat);
    m.position.set(px, py, pz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  rock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(-0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0, 3.6, 0.2, 3.6, 0.9, 2.0, rockMat);
  rock(-2.8, 0.6, -0.8, 1.4, 1.2, 1.4, darkRock);
  rock(2.8, 0.6, -0.8, 1.4, 1.2, 1.4, darkRock);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.4), holeMat);
  hole.position.set(0, 1.3, -1.0);
  g.add(hole);
  g.position.set(x, 0, z);
  g.rotation.y = rotationY;
  return g;
}

const limit = CONFIG.arena.size / 2 - 1;
const invisible = new THREE.MeshBasicMaterial({ visible: false });
[
  { w: 1, h: 10, d: CONFIG.arena.size, x: -limit, z: 0 },
  { w: 1, h: 10, d: CONFIG.arena.size, x: limit, z: 0 },
  { w: CONFIG.arena.size, h: 10, d: 1, x: 0, z: -limit },
  { w: CONFIG.arena.size, h: 10, d: 1, x: 0, z: limit },
].forEach(({ w, h, d, x, z }) => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), invisible);
  wall.position.set(x, h / 2, z);
  scene.add(wall);
  world.wallColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
});

// ============================================================
// VIEWMODELS — armas detalhadas e distintas
// ============================================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

let currentViewModel = null;

const MAT = {
  metalDark: new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  metalMid: new THREE.MeshLambertMaterial({ color: 0x2C3E50 }),
  metalLight: new THREE.MeshLambertMaterial({ color: 0x7F8C8D }),
  metalSteel: new THREE.MeshLambertMaterial({ color: 0xBDC3C7 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x5D4030 }),
  woodLight: new THREE.MeshLambertMaterial({ color: 0x8B5A2B }),
  grip: new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  accent: new THREE.MeshLambertMaterial({ color: 0xCC0000 }),
  gold: new THREE.MeshLambertMaterial({ color: 0xFFCC33 }),
};

function buildViewModel(weaponId) {
  if (currentViewModel) {
    weaponGroup.remove(currentViewModel);
    currentViewModel.traverse(c => {
      if (c.geometry) c.geometry.dispose();
    });
    currentViewModel = null;
  }
  const g = new THREE.Group();

  if (weaponId === 'knife') {
    // Faca tática — cabo + guarda + lâmina + fio
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.20, 0.06), MAT.grip);
    g.add(handle);
    // Textura do cabo (anéis)
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.02, 0.065), MAT.metalDark);
      ring.position.y = -0.07 + i * 0.05;
      g.add(ring);
    }
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.075), MAT.metalLight);
    pommel.position.set(0, -0.12, 0);
    g.add(pommel);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.09), MAT.metalDark);
    guard.position.set(0, 0.11, 0);
    g.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.015), MAT.metalSteel);
    blade.position.set(0, 0.37, 0);
    g.add(blade);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.46, 0.016), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
    edge.position.set(-0.024, 0.37, 0);
    g.add(edge);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), MAT.metalSteel);
    tip.rotation.y = Math.PI / 4;
    tip.position.set(0, 0.65, 0);
    g.add(tip);
  }
  else if (weaponId === 'pistol') {
    // Pistola: slide, cano, gatilho, empunhadura, miras
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.30), MAT.metalMid);
    slide.position.set(0, 0.06, -0.06);
    g.add(slide);
    const slideTop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.28), MAT.metalDark);
    slideTop.position.set(0, 0.11, -0.06);
    g.add(slideTop);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 10), MAT.metalDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.06, -0.24);
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.08), MAT.grip);
    grip.position.set(0, -0.07, 0.06);
    grip.rotation.x = 0.28;
    g.add(grip);
    // Padrão de grip (linhas)
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.008, 0.082), MAT.metalDark);
      line.position.set(0, -0.04 - i * 0.04, 0.06);
      line.rotation.x = 0.28;
      g.add(line);
    }
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.05), MAT.metalDark);
    guard.position.set(0, -0.02, 0.02);
    g.add(guard);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.01), MAT.metalDark);
    trigger.position.set(0, -0.02, 0.03);
    g.add(trigger);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.02), MAT.metalDark);
    rearSight.position.set(0, 0.13, 0.07);
    g.add(rearSight);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.015), MAT.metalDark);
    frontSight.position.set(0, 0.13, -0.20);
    g.add(frontSight);
  }
  else if (weaponId === 'revolver') {
    // Revólver: cano longo, tambor, cão, empunhadura de madeira
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 10), MAT.metalMid);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.055, -0.16);
    g.add(barrel);
    const barrelRib = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, 0.24), MAT.metalMid);
    barrelRib.position.set(0, 0.075, -0.16);
    g.add(barrelRib);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.10, 10), MAT.metalDark);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0, 0.045, 0);
    g.add(cylinder);
    // Furos do tambor
    for (let i = 0; i < 6; i++) {
      const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.102, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      chamber.rotation.x = Math.PI / 2;
      const ang = (i / 6) * Math.PI * 2;
      chamber.position.set(Math.cos(ang) * 0.028, 0.045 + Math.sin(ang) * 0.028, 0);
      g.add(chamber);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.16), MAT.metalMid);
    frame.position.set(0, 0.04, -0.02);
    g.add(frame);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.09), MAT.wood);
    grip.position.set(0, -0.08, 0.08);
    grip.rotation.x = 0.32;
    g.add(grip);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.03), MAT.metalDark);
    hammer.position.set(0, 0.09, 0.08);
    g.add(hammer);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 12, Math.PI), MAT.metalDark);
    guard.rotation.z = Math.PI;
    guard.position.set(0, -0.02, 0.03);
    g.add(guard);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.02), MAT.metalDark);
    sight.position.set(0, 0.078, -0.28);
    g.add(sight);
  }
  else if (weaponId === 'smg') {
    // SMG: corpo compacto, cano curto, pente, coronha dobrável
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.36), MAT.metalMid);
    body.position.set(0, 0.04, -0.06);
    g.add(body);
    const barrelShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10), MAT.metalDark);
    barrelShroud.rotation.x = Math.PI / 2;
    barrelShroud.position.set(0, 0.04, -0.30);
    g.add(barrelShroud);
    // Furos de refrigeração
    for (let i = 0; i < 4; i++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      hole.position.set(0.025, 0.04, -0.28 - i * 0.025);
      hole.rotation.z = Math.PI / 2;
      g.add(hole);
    }
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.06), MAT.metalDark);
    mag.position.set(0, -0.10, 0.04);
    mag.rotation.x = 0.15;
    g.add(mag);
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.10, 0.05), MAT.grip);
    foregrip.position.set(0, -0.06, -0.17);
    g.add(foregrip);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.06), MAT.grip);
    rearGrip.position.set(0, -0.07, 0.10);
    rearGrip.rotation.x = 0.22;
    g.add(rearGrip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.10), MAT.metalDark);
    stock.position.set(0, 0.03, 0.20);
    g.add(stock);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.02), MAT.metalDark);
    sight.position.set(0, 0.10, 0.02);
    g.add(sight);
  }
  else if (weaponId === 'rifle') {
    // Rifle de assalto: corpo longo, luneta, pente curvo, coronha
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), MAT.metalMid);
    body.position.set(0, 0.035, -0.12);
    g.add(body);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.20), MAT.metalDark);
    handguard.position.set(0, 0.035, -0.35);
    g.add(handguard);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 10), MAT.metalDark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, -0.55);
    g.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 10), MAT.metalDark);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.035, -0.65);
    g.add(muzzle);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.07), MAT.metalDark);
    mag.position.set(0, -0.10, 0.02);
    mag.rotation.x = 0.15;
    g.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.10, 0.20), MAT.wood);
    stock.position.set(0, 0.005, 0.24);
    g.add(stock);
    const stockTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.08), MAT.wood);
    stockTop.position.set(0, 0.09, 0.18);
    g.add(stockTop);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.05), MAT.wood);
    rearGrip.position.set(0, -0.06, 0.12);
    rearGrip.rotation.x = 0.2;
    g.add(rearGrip);
    // Luneta
    const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 12), MAT.metalDark);
    scopeBody.rotation.x = Math.PI / 2;
    scopeBody.position.set(0, 0.14, -0.05);
    g.add(scopeBody);
    const scopeFront = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 12), MAT.metalDark);
    scopeFront.rotation.x = Math.PI / 2;
    scopeFront.position.set(0, 0.14, -0.17);
    g.add(scopeFront);
    const scopeRear = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 12), MAT.metalDark);
    scopeRear.rotation.x = Math.PI / 2;
    scopeRear.position.set(0, 0.14, 0.07);
    g.add(scopeRear);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshBasicMaterial({ color: 0x4A90D9 }));
    lens.rotation.y = Math.PI;
    lens.position.set(0, 0.14, -0.185);
    g.add(lens);
    // Suportes da luneta
    const mount1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), MAT.metalDark);
    mount1.position.set(0, 0.10, -0.10);
    g.add(mount1);
    const mount2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.02), MAT.metalDark);
    mount2.position.set(0, 0.10, 0.05);
    g.add(mount2);
  }
  else if (weaponId === 'shotgun') {
    // Shotgun: cano duplo, bomba, coronha de madeira
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), MAT.metalDark);
    barrel1.rotation.x = Math.PI / 2;
    barrel1.position.set(-0.022, 0.045, -0.24);
    g.add(barrel1);
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), MAT.metalDark);
    barrel2.rotation.x = Math.PI / 2;
    barrel2.position.set(0.022, 0.045, -0.24);
    g.add(barrel2);
    // Boca dupla
    const mouth1 = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mouth1.position.set(-0.022, 0.045, -0.49);
    g.add(mouth1);
    const mouth2 = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mouth2.position.set(0.022, 0.045, -0.49);
    g.add(mouth2);
    // Tubo de munição embaixo
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 8), MAT.metalMid);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.02, -0.22);
    g.add(magTube);
    // Bomba (pump)
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.12), MAT.wood);
    pump.position.set(0, -0.02, -0.18);
    g.add(pump);
    // Padrão da bomba
    for (let i = 0; i < 5; i++) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.055, 0.005), MAT.woodLight);
      groove.position.set(0, -0.02, -0.23 + i * 0.025);
      g.add(groove);
    }
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.22), MAT.wood);
    stock.position.set(0, 0.01, 0.22);
    g.add(stock);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), MAT.wood);
    rearGrip.position.set(0, -0.07, 0.10);
    rearGrip.rotation.x = 0.18;
    g.add(rearGrip);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.025), MAT.metalDark);
    hammer.position.set(0, 0.09, 0.14);
    g.add(hammer);
  }
  else if (weaponId === 'launcher') {
    // Lança-foguetes: tubo grande, miras, grips
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.75, 14), MAT.metalMid);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.03, -0.12);
    g.add(tube);
    // Reforço metálico
    const ring1 = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.03, 14), MAT.metalDark);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.set(0, 0.03, -0.30);
    g.add(ring1);
    const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14), MAT.metalDark);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.set(0, 0.03, 0.10);
    g.add(ring2);
    // Boca
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.062, 14), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mouth.rotation.y = Math.PI;
    mouth.position.set(0, 0.03, -0.49);
    g.add(mouth);
    // Bocal (sino)
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.06, 14), MAT.metalMid);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(0, 0.03, -0.48);
    g.add(bell);
    // Faixa de perigo
    const stripe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.025, 14), MAT.accent);
    stripe1.rotation.x = Math.PI / 2;
    stripe1.position.set(0, 0.03, -0.40);
    g.add(stripe1);
    const stripe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.025, 14), MAT.accent);
    stripe2.rotation.x = Math.PI / 2;
    stripe2.position.set(0, 0.03, -0.35);
    g.add(stripe2);
    // Grip frontal
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), MAT.grip);
    foregrip.position.set(0, -0.10, -0.20);
    g.add(foregrip);
    // Grip traseiro
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), MAT.grip);
    rearGrip.position.set(0, -0.11, 0.15);
    rearGrip.rotation.x = 0.15;
    g.add(rearGrip);
    // Mira grande
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.08), MAT.metalDark);
    sightBase.position.set(0, 0.10, 0.05);
    g.add(sightBase);
    const sightRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 12), MAT.metalDark);
    sightRing.rotation.y = Math.PI / 2;
    sightRing.position.set(0, 0.15, 0.05);
    g.add(sightRing);
    const sightPost = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.025, 0.008), MAT.metalDark);
    sightPost.position.set(0, 0.12, 0.05);
    g.add(sightPost);
  }

  g.position.set(0.32, -0.32, -0.6);
  g.rotation.set(-0.15, -0.35, 0.15);
  currentViewModel = g;
  weaponGroup.add(g);
  return g;
}

let swingProgress = 0;
let swinging = false;
function triggerSwing() { swinging = true; swingProgress = 0; }

function updateWeaponViewModel(dt) {
  if (swinging) {
    swingProgress += dt * 5;
    if (swingProgress >= 1) {
      swinging = false;
      swingProgress = 0;
      if (currentViewModel) {
        currentViewModel.position.set(0.32, -0.32, -0.6);
        currentViewModel.rotation.set(-0.15, -0.35, 0.15);
      }
    } else {
      const arc = Math.sin(swingProgress * Math.PI);
      if (currentViewModel) {
        currentViewModel.position.set(0.32 - arc * 0.35, -0.32 + arc * 0.12, -0.6 - arc * 0.15);
        currentViewModel.rotation.set(-0.15 - arc * 0.5, -0.35 + arc * 0.7, 0.15 - arc * 0.4);
      }
    }
  } else if (currentViewModel) {
    const bob = Math.sin(state.bobTime) * 0.015;
    const bobX = Math.cos(state.bobTime * 0.5) * 0.01;
    currentViewModel.position.x = 0.32 + (state.isMoving ? bobX : 0);
    currentViewModel.position.y = -0.32 + (state.isMoving ? bobY : 0);
  }
}

const player = { position: new THREE.Vector3(0, CONFIG.player.height, 0), yaw: 0, pitch: 0 };

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
// Subdivisões ALTAS para mais polígonos
function makeBox(w, h, d, s = 4) { return new THREE.BoxGeometry(w, h, d, s, s, s); }
function makeJoint(r, seg = 12) { return new THREE.SphereGeometry(r, seg, Math.max(6, Math.floor(seg * 0.75))); }

// ============================================================
// COLISÃO
// ============================================================
function circleVsAABB(px, pz, radius, box) {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  const dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  const d = Math.sqrt(d2);
  if (d > 0.0001) {
    const nx = dx / d, nz = dz / d, push = radius - d;
    return { x: px + nx * push, z: pz + nz * push };
  }
  const exL = Math.abs(px - box.minX), exR = Math.abs(box.maxX - px);
  const ezU = Math.abs(pz - box.minZ), ezD = Math.abs(box.maxZ - pz);
  const m = Math.min(exL, exR, ezU, ezD);
  if (m === exL) return { x: box.minX - radius, z: pz };
  if (m === exR) return { x: box.maxX + radius, z: pz };
  if (m === ezU) return { x: px, z: box.minZ - radius };
  return { x: px, z: box.maxZ + radius };
}

function resolveWallCollisions(pos, radius) {
  let changed = true, iter = 0;
  while (changed && iter < 4) {
    changed = false; iter++;
    for (const box of world.wallColliders) {
      const r = circleVsAABB(pos.x, pos.z, radius, box);
      if (r && (Math.abs(r.x - pos.x) > 0.001 || Math.abs(r.z - pos.z) > 0.001)) {
        pos.x = r.x; pos.z = r.z; changed = true;
      }
    }
    for (const box of world.furnitureColliders) {
      const r = circleVsAABB(pos.x, pos.z, radius, box);
      if (r && (Math.abs(r.x - pos.x) > 0.001 || Math.abs(r.z - pos.z) > 0.001)) {
        pos.x = r.x; pos.z = r.z; changed = true;
      }
    }
  }
}

// ============================================================
// ZUMBIS — com esqueleto interno
// ============================================================
const zombies = [];
const SHIRT_COLORS = [0x8E44AD, 0x2ECC71, 0xE74C3C, 0x3498DB, 0xF39C12, 0xE67E22, 0x16A085, 0xC0392B];
const PANTS_COLORS = [0x8B5A2B, 0x5D4030, 0x3E2723, 0x2C3E50, 0x34495E, 0x1B2631];
const SKIN_COLORS = [0x7BC950, 0x6BB840, 0x8DD65A, 0x5DAE3F, 0x9DE06B];
const HAIR_COLORS = [0x2C1810, 0x1A0F08, 0x4A2818, 0x6B3A1F, 0x3A2A1A];
const BODY_TYPES = [
  { torsoW: 0.55, torsoD: 0.30, arm: 0.18, leg: 0.22, heightScale: 1.05 },
  { torsoW: 0.70, torsoD: 0.35, arm: 0.22, leg: 0.26, heightScale: 1.00 },
  { torsoW: 0.85, torsoD: 0.45, arm: 0.26, leg: 0.30, heightScale: 0.95 },
];

const BONE_MAT = new THREE.MeshLambertMaterial({ color: 0xE8E0D0 });
const BONE_DARK_MAT = new THREE.MeshLambertMaterial({ color: 0xC8BFA8 });

function createZombieMesh() {
  const g = new THREE.Group();
  const skinColor = rand(SKIN_COLORS);
  const shirtColor = rand(SHIRT_COLORS);
  const pantsColor = rand(PANTS_COLORS);
  const hairColor = rand(HAIR_COLORS);
  const body = rand(BODY_TYPES);
  const hasHat = Math.random() > 0.7;

  const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const wound = new THREE.MeshBasicMaterial({ color: 0xC0392B });

  // ===== CABEÇA =====
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.85;
  const skull = new THREE.Mesh(makeBox(0.55, 0.55, 0.55, 4), skinMat);
  skull.castShadow = true;
  headGroup.add(skull);
  // Cabelo
  const hair = new THREE.Mesh(makeBox(0.58, 0.10, 0.58, 3), hairMat);
  hair.position.y = 0.30; headGroup.add(hair);
  const fringe = new THREE.Mesh(makeBox(0.58, 0.14, 0.08, 2), hairMat);
  fringe.position.set(0, 0.24, 0.28); headGroup.add(fringe);
  // Orelhas
  const earGeo = makeBox(0.06, 0.14, 0.10, 2);
  const earL = new THREE.Mesh(earGeo, skinMat); earL.position.set(-0.31, 0, 0); headGroup.add(earL);
  const earR = new THREE.Mesh(earGeo, skinMat); earR.position.set(0.31, 0, 0); headGroup.add(earR);
  // Olhos
  const eyeGeo = makeBox(0.13, 0.11, 0.02, 2);
  const eL = new THREE.Mesh(eyeGeo, eyeW); eL.position.set(-0.13, 0.08, 0.285); headGroup.add(eL);
  const eR = new THREE.Mesh(eyeGeo, eyeW); eR.position.set(0.13, 0.08, 0.285); headGroup.add(eR);
  const pupGeo = makeBox(0.05, 0.05, 0.02, 2);
  const pL = new THREE.Mesh(pupGeo, pupil); pL.position.set(-0.13, 0.08, 0.295); headGroup.add(pL);
  const pR = new THREE.Mesh(pupGeo, pupil); pR.position.set(0.13, 0.08, 0.295); headGroup.add(pR);
  // Sobrancelha
  const browGeo = makeBox(0.14, 0.02, 0.02, 2);
  const bL = new THREE.Mesh(browGeo, hairMat); bL.position.set(-0.13, 0.16, 0.29); headGroup.add(bL);
  const bR = new THREE.Mesh(browGeo, hairMat); bR.position.set(0.13, 0.16, 0.29); headGroup.add(bR);
  // Nariz
  const nose = new THREE.Mesh(makeBox(0.08, 0.08, 0.06, 2), skinMat);
  nose.position.set(0, -0.02, 0.30); headGroup.add(nose);
  // Boca
  const mouth = new THREE.Mesh(makeBox(0.20, 0.06, 0.02, 2), new THREE.MeshBasicMaterial({ color: 0x2B0000 }));
  mouth.position.set(0, -0.14, 0.285); headGroup.add(mouth);
  // Dentes
  const teethGeo = makeBox(0.025, 0.03, 0.02, 1);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(teethGeo, new THREE.MeshBasicMaterial({ color: 0xE8E0D0 }));
    t.position.set(-0.08 + i * 0.04, -0.12, 0.292);
    headGroup.add(t);
  }
  // Ferida
  const woundHead = new THREE.Mesh(makeBox(0.12, 0.06, 0.02, 2), wound);
  woundHead.position.set(-0.15, 0.16, 0.285); headGroup.add(woundHead);
  // Chapéu
  if (hasHat) {
    const hatGroup = new THREE.Group();
    hatGroup.add(new THREE.Mesh(makeBox(0.65, 0.05, 0.65, 3), MAT.metalMid));
    const hatTop = new THREE.Mesh(makeBox(0.45, 0.25, 0.45, 3), MAT.metalDark);
    hatTop.position.y = 0.15; hatGroup.add(hatTop);
    hatGroup.position.y = 0.34; headGroup.add(hatGroup);
  }
  // CRÂNIO INTERNO (escondido — aparece quando decapitado)
  const skullBone = new THREE.Mesh(makeBox(0.45, 0.45, 0.45, 2), BONE_MAT);
  skullBone.visible = false;
  headGroup.add(skullBone);
  // Maxilar
  const jawBone = new THREE.Mesh(makeBox(0.35, 0.12, 0.35, 2), BONE_DARK_MAT);
  jawBone.position.set(0, -0.20, 0.05);
  jawBone.visible = false;
  headGroup.add(jawBone);
  // Olhos vazios do crânio
  const socketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const socketGeo = new THREE.SphereGeometry(0.05, 6, 6);
  const sk1 = new THREE.Mesh(socketGeo, socketMat);
  sk1.position.set(-0.12, 0.08, 0.23); sk1.visible = false; headGroup.add(sk1);
  const sk2 = new THREE.Mesh(socketGeo, socketMat);
  sk2.position.set(0.12, 0.08, 0.23); sk2.visible = false; headGroup.add(sk2);

  g.add(headGroup);

  // ===== TRONCO =====
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 1.15;
  const torso = new THREE.Mesh(makeBox(body.torsoW, 0.85, body.torsoD, 4), shirtMat);
  torso.castShadow = true;
  torsoGroup.add(torso);
  const collar = new THREE.Mesh(makeBox(body.torsoW * 0.85, 0.06, body.torsoD * 0.9, 2), MAT.metalDark);
  collar.position.y = 0.43; torsoGroup.add(collar);
  // Ferida no tronco
  const w1 = new THREE.Mesh(makeBox(0.14, 0.10, 0.02, 2), wound);
  w1.position.set(0.15, 0.05, body.torsoD / 2 + 0.01); torsoGroup.add(w1);
  const w2 = new THREE.Mesh(makeBox(0.10, 0.14, 0.02, 2), wound);
  w2.position.set(-0.18, -0.15, body.torsoD / 2 + 0.01); torsoGroup.add(w2);
  // COSTELAS INTERNAS (escondidas)
  const ribCage = new THREE.Group();
  const ribMat = BONE_MAT;
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(body.torsoW * 0.4, 0.02, 6, 12, Math.PI), ribMat);
    rib.rotation.x = Math.PI / 2;
    rib.rotation.z = Math.PI;
    rib.position.y = 0.28 - i * 0.14;
    rib.visible = false;
    ribCage.add(rib);
  }
  // Coluna
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), BONE_MAT);
  spine.position.y = 0;
  spine.visible = false;
  ribCage.add(spine);
  torsoGroup.add(ribCage);

  g.add(torsoGroup);

  // ===== BRAÇO =====
  function makeArm(side) {
    const arm = new THREE.Group();
    const outerMeshes = [];
    const boneMeshes = [];

    // Ombro
    const shoulder = new THREE.Mesh(makeJoint(body.arm * 0.55, 8), shirtMat);
    shoulder.castShadow = true;
    arm.add(shoulder); outerMeshes.push(shoulder);

    // Braço superior
    const upper = new THREE.Mesh(makeBox(body.arm, 0.42, body.arm, 3), shirtMat);
    upper.position.y = -0.22;
    upper.castShadow = true;
    arm.add(upper); outerMeshes.push(upper);

    // Cotovelo
    const elbow = new THREE.Mesh(makeJoint(body.arm * 0.45, 8), shirtMat);
    elbow.position.y = -0.46;
    arm.add(elbow); outerMeshes.push(elbow);

    // Antebraço
    const lower = new THREE.Mesh(makeBox(body.arm * 0.92, 0.42, body.arm * 0.92, 3), skinMat);
    lower.position.y = -0.68;
    lower.castShadow = true;
    arm.add(lower); outerMeshes.push(lower);

    // Pulso
    const wrist = new THREE.Mesh(makeJoint(body.arm * 0.38, 6), skinMat);
    wrist.position.y = -0.90;
    arm.add(wrist); outerMeshes.push(wrist);

    // Mão
    const hand = new THREE.Mesh(makeBox(body.arm * 1.05, 0.14, body.arm * 1.15, 3), skinMat);
    hand.position.y = -0.99;
    hand.castShadow = true;
    arm.add(hand); outerMeshes.push(hand);

    // Dedos
    const fingerGeo = makeBox(body.arm * 0.18, 0.13, body.arm * 0.18, 2);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fingerGeo, skinMat);
      f.position.set(-body.arm * 0.36 + i * body.arm * 0.24, -1.11, body.arm * 0.28);
      arm.add(f); outerMeshes.push(f);
    }
    // Polegar
    const thumb = new THREE.Mesh(makeBox(body.arm * 0.22, 0.11, body.arm * 0.22, 2), skinMat);
    thumb.position.set(side * body.arm * 0.5, -1.02, body.arm * 0.38);
    arm.add(thumb); outerMeshes.push(thumb);

    // OS INTERNOS (escondidos)
    const humerus = new THREE.Mesh(new THREE.CylinderGeometry(body.arm * 0.22, body.arm * 0.20, 0.36, 6), BONE_MAT);
    humerus.position.y = -0.22;
    humerus.visible = false;
    arm.add(humerus); boneMeshes.push(humerus);
    const humerusTop = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.28, 6, 6), BONE_MAT);
    humerusTop.position.y = -0.04;
    humerusTop.visible = false;
    arm.add(humerusTop); boneMeshes.push(humerusTop);
    const humerusBottom = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.25, 6, 6), BONE_MAT);
    humerusBottom.position.y = -0.44;
    humerusBottom.visible = false;
    arm.add(humerusBottom); boneMeshes.push(humerusBottom);

    const radius = new THREE.Mesh(new THREE.CylinderGeometry(body.arm * 0.18, body.arm * 0.16, 0.38, 6), BONE_MAT);
    radius.position.y = -0.68;
    radius.visible = false;
    arm.add(radius); boneMeshes.push(radius);
    const radiusTop = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.22, 6, 6), BONE_MAT);
    radiusTop.position.y = -0.48;
    radiusTop.visible = false;
    arm.add(radiusTop); boneMeshes.push(radiusTop);
    const radiusBottom = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.20, 6, 6), BONE_MAT);
    radiusBottom.position.y = -0.88;
    radiusBottom.visible = false;
    arm.add(radiusBottom); boneMeshes.push(radiusBottom);

    const handBone = new THREE.Mesh(makeBox(body.arm * 0.7, 0.10, body.arm * 0.85, 2), BONE_MAT);
    handBone.position.y = -0.99;
    handBone.visible = false;
    arm.add(handBone); boneMeshes.push(handBone);

    arm.userData.outerMeshes = outerMeshes;
    arm.userData.boneMeshes = boneMeshes;
    return arm;
  }
  const armL = makeArm(-1); armL.position.set(-body.torsoW / 2 - body.arm / 2 + 0.05, 1.5, 0); g.add(armL);
  const armR = makeArm(1); armR.position.set(body.torsoW / 2 + body.arm / 2 - 0.05, 1.5, 0); g.add(armR);

  // ===== PERNA =====
  function makeLeg() {
    const leg = new THREE.Group();
    const outerMeshes = [];
    const boneMeshes = [];

    const hip = new THREE.Mesh(makeJoint(body.leg * 0.58, 8), pantsMat);
    leg.add(hip); outerMeshes.push(hip);

    const thigh = new THREE.Mesh(makeBox(body.leg, 0.55, body.leg, 3), pantsMat);
    thigh.position.y = -0.30;
    thigh.castShadow = true;
    leg.add(thigh); outerMeshes.push(thigh);

    const knee = new THREE.Mesh(makeJoint(body.leg * 0.48, 8), pantsMat);
    knee.position.y = -0.60;
    leg.add(knee); outerMeshes.push(knee);

    const shin = new THREE.Mesh(makeBox(body.leg * 0.9, 0.40, body.leg * 0.9, 3), pantsMat);
    shin.position.y = -0.82;
    shin.castShadow = true;
    leg.add(shin); outerMeshes.push(shin);

    const ankle = new THREE.Mesh(makeJoint(body.leg * 0.4, 6), shoeMat);
    ankle.position.y = -1.04;
    leg.add(ankle); outerMeshes.push(ankle);

    const shoe = new THREE.Mesh(makeBox(body.leg * 1.15, 0.14, body.leg * 1.35, 3), shoeMat);
    shoe.position.set(0, -1.12, 0.03);
    shoe.castShadow = true;
    leg.add(shoe); outerMeshes.push(shoe);

    const shoeTip = new THREE.Mesh(makeBox(body.leg * 1.15, 0.08, body.leg * 0.45, 2), shoeMat);
    shoeTip.position.set(0, -1.14, body.leg * 0.85);
    leg.add(shoeTip); outerMeshes.push(shoeTip);

    // OS INTERNOS (escondidos)
    const femur = new THREE.Mesh(new THREE.CylinderGeometry(body.leg * 0.22, body.leg * 0.20, 0.50, 6), BONE_MAT);
    femur.position.y = -0.30;
    femur.visible = false;
    leg.add(femur); boneMeshes.push(femur);
    const femurTop = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.26, 6, 6), BONE_MAT);
    femurTop.position.y = -0.05;
    femurTop.visible = false;
    leg.add(femurTop); boneMeshes.push(femurTop);
    const femurBottom = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.24, 6, 6), BONE_MAT);
    femurBottom.position.y = -0.56;
    femurBottom.visible = false;
    leg.add(femurBottom); boneMeshes.push(femurBottom);

    const tibia = new THREE.Mesh(new THREE.CylinderGeometry(body.leg * 0.18, body.leg * 0.16, 0.40, 6), BONE_MAT);
    tibia.position.y = -0.82;
    tibia.visible = false;
    leg.add(tibia); boneMeshes.push(tibia);
    const tibiaTop = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.20, 6, 6), BONE_MAT);
    tibiaTop.position.y = -0.62;
    tibiaTop.visible = false;
    leg.add(tibiaTop); boneMeshes.push(tibiaTop);
    const tibiaBottom = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.18, 6, 6), BONE_MAT);
    tibiaBottom.position.y = -1.02;
    tibiaBottom.visible = false;
    leg.add(tibiaBottom); boneMeshes.push(tibiaBottom);

    leg.userData.outerMeshes = outerMeshes;
    leg.userData.boneMeshes = boneMeshes;
    return leg;
  }
  const legL = makeLeg(); legL.position.set(-body.leg * 0.55, 0.72, 0); g.add(legL);
  const legR = makeLeg(); legR.position.set(body.leg * 0.55, 0.72, 0); g.add(legR);

  g.scale.y = body.heightScale;
  g.rotation.x = 0.12;

  g.userData = {
    armL, armR, legL, legR,
    head: headGroup, torso: torsoGroup,
    skullBone, jawBone, sk1, sk2, ribCage,
    skinColor, shirtColor, pantsColor, bodyType: body,
  };
  return g;
}

let groanTimer = 0;

function spawnZombie() {
  const cave = caves[Math.floor(Math.random() * caves.length)];
  const toCX = -cave.x, toCZ = -cave.z;
  const len = Math.sqrt(toCX * toCX + toCZ * toCZ) || 1;
  const dx = toCX / len, dz = toCZ / len;
  const back = 0.8 + Math.random() * 0.8;
  const side = (Math.random() - 0.5) * 1.6;
  const x = cave.x + dx * back + (-dz) * side;
  const z = cave.z + dz * back + dx * side;

  const mesh = createZombieMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);

  zombies.push({
    mesh, health: CONFIG.zombie.maxHealth, maxHealth: CONFIG.zombie.maxHealth,
    lastAttackTime: 0, walkPhase: Math.random() * Math.PI * 2,
    hitReactEndTime: 0, hitDirection: new THREE.Vector3(),
    dismembered: { head: false, armL: false, armR: false, legL: false, legR: false },
    emergeTime: 0,
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
      const dir = direction.clone().normalize();
      const perp1 = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
      const a = (Math.random() - 0.5) * 1.4;
      const b = (Math.random() - 0.5) * 1.4;
      const speed = (big ? 7 : 4) + Math.random() * 5;
      vel = dir.clone().multiplyScalar(speed);
      vel.addScaledVector(perp1, a * speed * 0.5);
      vel.addScaledVector(perp2, b * speed * 0.5);
      vel.y += 2 + Math.random() * 3;
    } else {
      vel = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 2, (Math.random() - 0.5) * 6);
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
      p.vel.x *= 0.7; p.vel.z *= 0.7;
    }
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
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
  const mat = new THREE.MeshBasicMaterial({ color: 0x6B0000, transparent: true, opacity: 0.75, depthWrite: false });
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
    this.mesh = mesh; this.size = size; this.mass = mass;
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.settled = false; this.settleTimer = 0;
    this.life = life; this.maxLife = life;
    this.key = 'piece';
  }
  applyImpulse(imp) { this.velocity.addScaledVector(imp, 1 / this.mass); }
  applyTorque(t) { this.angularVelocity.addScaledVector(t, 1 / this.mass); }
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
      const gY = minDim * 0.5;
      if (this.mesh.position.y <= gY) {
        this.mesh.position.y = gY;
        if (this.velocity.y < 0) this.velocity.y = -this.velocity.y * 0.3;
        this.velocity.x *= 0.65; this.velocity.z *= 0.65;
        this.angularVelocity.multiplyScalar(0.7);
        const sSq = this.velocity.lengthSq();
        const aSq = this.angularVelocity.lengthSq();
        if (sSq < 0.5 && aSq < 1.0) {
          this.settleTimer += dt;
          if (this.settleTimer > 0.4) {
            this.settled = true;
            this.velocity.set(0, 0, 0);
            this.angularVelocity.set(0, 0, 0);
          }
        } else { this.settleTimer = 0; }
      }
    }
    if (this.life < 3) {
      const op = Math.max(0, this.life / 3);
      const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
      mats.forEach(m => { m.transparent = true; m.opacity = op; });
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
// RAGDOLL — mais pedaços pra física caótica
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

    const ud = zombieMesh.userData;
    const bt = ud.bodyType || BODY_TYPES[1];
    const hitDirN = hitDir.clone(); hitDirN.y = 0; hitDirN.normalize();

    // Cada membro se divide em MAIS pedaços (upper + lower)
    const defs = [
      { key: 'torso', size: new THREE.Vector3(bt.torsoW, 0.85, bt.torsoD), mass: 8, obj: ud.torso, color: ud.shirtColor },
      { key: 'head', size: new THREE.Vector3(0.55, 0.55, 0.55), mass: 2.5, obj: ud.head, color: ud.skinColor },
      // Braço esquerdo — 2 pedaços
      { key: 'armL_upper', size: new THREE.Vector3(bt.arm, 0.5, bt.arm), mass: 0.5, obj: ud.armL, offsetY: 0, color: ud.shirtColor, customPos: new THREE.Vector3(-bt.torsoW / 2 - bt.arm / 2 + 0.05, 1.28, 0) },
      { key: 'armL_lower', size: new THREE.Vector3(bt.arm * 0.92, 0.55, bt.arm * 0.92), mass: 0.4, obj: ud.armL, offsetY: 0, color: ud.skinColor, customPos: new THREE.Vector3(-bt.torsoW / 2 - bt.arm / 2 + 0.05, 0.78, 0) },
      // Braço direito — 2 pedaços
      { key: 'armR_upper', size: new THREE.Vector3(bt.arm, 0.5, bt.arm), mass: 0.5, obj: ud.armR, offsetY: 0, color: ud.shirtColor, customPos: new THREE.Vector3(bt.torsoW / 2 + bt.arm / 2 - 0.05, 1.28, 0) },
      { key: 'armR_lower', size: new THREE.Vector3(bt.arm * 0.92, 0.55, bt.arm * 0.92), mass: 0.4, obj: ud.armR, offsetY: 0, color: ud.skinColor, customPos: new THREE.Vector3(bt.torsoW / 2 + bt.arm / 2 - 0.05, 0.78, 0) },
      // Perna esquerda — 2 pedaços
      { key: 'legL_upper', size: new THREE.Vector3(bt.leg, 0.6, bt.leg), mass: 1.0, obj: ud.legL, offsetY: 0, color: ud.pantsColor, customPos: new THREE.Vector3(-bt.leg * 0.55, 0.42, 0) },
      { key: 'legL_lower', size: new THREE.Vector3(bt.leg * 0.9, 0.55, bt.leg * 0.9), mass: 0.8, obj: ud.legL, offsetY: 0, color: ud.pantsColor, customPos: new THREE.Vector3(-bt.leg * 0.55, -0.10, 0) },
      // Perna direita — 2 pedaços
      { key: 'legR_upper', size: new THREE.Vector3(bt.leg, 0.6, bt.leg), mass: 1.0, obj: ud.legR, offsetY: 0, color: ud.pantsColor, customPos: new THREE.Vector3(bt.leg * 0.55, 0.42, 0) },
      { key: 'legR_lower', size: new THREE.Vector3(bt.leg * 0.9, 0.55, bt.leg * 0.9), mass: 0.8, obj: ud.legR, offsetY: 0, color: ud.pantsColor, customPos: new THREE.Vector3(bt.leg * 0.55, -0.10, 0) },
    ];

    // Mapeia os "keys" originais para os "keys" do ragdoll
    const limbMap = {
      'head': ['head'],
      'armL': ['armL_upper', 'armL_lower'],
      'armR': ['armR_upper', 'armR_lower'],
      'legL': ['legL_upper', 'legL_lower'],
      'legR': ['legR_upper', 'legR_lower'],
    };

    for (const def of defs) {
      // Checa se a parte inteira está faltando
      let skip = false;
      if (def.key === 'torso') skip = false;
      else if (def.key === 'head') skip = missingParts.head;
      else if (def.key.startsWith('armL')) skip = missingParts.armL;
      else if (def.key.startsWith('armR')) skip = missingParts.armR;
      else if (def.key.startsWith('legL')) skip = missingParts.legL;
      else if (def.key.startsWith('legR')) skip = missingParts.legR;
      if (skip) continue;

      let wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();

      if (def.customPos) {
        // Pega posição mundo do torso e offseta
        const torsoWP = new THREE.Vector3();
        ud.torso.getWorldPosition(torsoWP);
        wp.copy(torsoWP).add(def.customPos);
      } else {
        def.obj.getWorldPosition(wp);
        def.obj.getWorldQuaternion(wq);
      }

      const mat = new THREE.MeshLambertMaterial({ color: def.color });
      const geo = new THREE.BoxGeometry(def.size.x, def.size.y, def.size.z, 3, 3, 3);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(wp);
      mesh.quaternion.copy(wq);
      mesh.castShadow = true;
      scene.add(mesh);

      const piece = new Debris(mesh, def.size, def.mass, 9999);
      piece.key = def.key;

      const base = CONFIG.ragdoll.impactImpulse * hitStrength;
      piece.applyImpulse(new THREE.Vector3(
        hitDirN.x * base + (Math.random() - 0.5) * 2,
        base * 0.5 + Math.random() * 1.5,
        hitDirN.z * base + (Math.random() - 0.5) * 2
      ));
      piece.applyTorque(new THREE.Vector3(
        (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30
      ));
      this.pieces.push(piece);
    }
    scene.remove(zombieMesh);
  }

  sliceAt(cameraPos, forward3D, range) {
    if (this.state === 'fading' || this.pieces.length <= 1) return false;
    let best = null, bestIdx = -1, bestScore = -Infinity;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      const to = new THREE.Vector3().subVectors(p.mesh.position, cameraPos);
      const dist = to.length();
      if (dist > range) continue;
      to.normalize();
      const dot = forward3D.dot(to);
      if (dot < CONFIG.ragdoll.sliceDotMin) continue;
      const score = dot - dist * 0.05;
      if (score > bestScore) { bestScore = score; best = p; bestIdx = i; }
    }
    if (!best) return false;
    const dir = new THREE.Vector3().subVectors(best.mesh.position, cameraPos);
    dir.y = 0; dir.normalize();
    best.settled = false;
    best.settleTimer = 0;
    best.life = CONFIG.dismember.limbLife;
    best.maxLife = CONFIG.dismember.limbLife;
    best.velocity.set(dir.x * 10 + (Math.random() - 0.5) * 5, 5 + Math.random() * 4, dir.z * 10 + (Math.random() - 0.5) * 5);
    best.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    spawnBlood(best.mesh.position.clone(), dir, 18, true);
    this.pieces.splice(bestIdx, 1);
    flyingLimbs.push(best);
    this.lastHitTime = performance.now() / 1000;
    this.settleStart = 0;
    this.state = 'falling';
    return true;
  }

  update(dt) {
    if (this.state === 'fading') {
      this.fadeProgress += dt / CONFIG.ragdoll.fadeDuration;
      const op = Math.max(0, 1 - this.fadeProgress);
      this.pieces.forEach(p => {
        const mats = Array.isArray(p.mesh.material) ? p.mesh.material : [p.mesh.material];
        mats.forEach(m => { m.transparent = true; m.opacity = op; });
      });
      return this.fadeProgress >= 1;
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) this.pieces[i].update(dt);
    const all = this.pieces.length === 0 || this.pieces.every(p => p.settled);
    if (this.state === 'falling') {
      if (all) { this.state = 'settled'; this.settleStart = performance.now() / 1000; }
    } else if (this.state === 'settled') {
      const el = performance.now() / 1000 - this.settleStart;
      const sh = performance.now() / 1000 - this.lastHitTime;
      if (el > CONFIG.ragdoll.settleTime && sh > CONFIG.ragdoll.settleTime) {
        this.state = 'fading';
        this.fadeProgress = 0;
        const t = this.pieces.find(p => p.key === 'torso');
        if (t) spawnBloodPool(t.mesh.position);
      }
    }
    return false;
  }

  dispose() { this.pieces.forEach(p => p.dispose()); this.pieces = []; }
}

const flyingLimbs = [];

function startRagdoll(mesh, hitDir, hitStrength, missingParts) {
  if (ragdolls.length >= CONFIG.ragdoll.maxActive) {
    const oldest = ragdolls.shift();
    oldest.dispose();
  }
  ragdolls.push(new Ragdoll(mesh, hitDir, hitStrength, missingParts));
}

// ============================================================
// DESMEMBRAMENTO — REVELA ESQUELETO
// ============================================================
function detachLimb(z, key, hitDir) {
  const ud = z.mesh.userData;
  let limbObj = null;
  if (key === 'head') limbObj = ud.head;
  else if (key === 'armL') limbObj = ud.armL;
  else if (key === 'armR') limbObj = ud.armR;
  else if (key === 'legL') limbObj = ud.legL;
  else if (key === 'legR') limbObj = ud.legR;
  if (!limbObj || z.dismembered[key]) return;

  z.mesh.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  const wq = new THREE.Quaternion();
  limbObj.getWorldPosition(wp);
  limbObj.getWorldQuaternion(wq);

  // Se for cabeça: esconde a cabeça e mostra o crânio + maxilar
  if (key === 'head') {
    // Mostra os ossos dentro da cabeça
    ud.skullBone.visible = true;
    ud.jawBone.visible = true;
    ud.sk1.visible = true;
    ud.sk2.visible = true;
    // Esconde a pele/cabelo/olhos
    limbObj.children.forEach(c => {
      if (c === ud.skullBone || c === ud.jawBone || c === ud.sk1 || c === ud.sk2) return;
      c.visible = false;
    });
  } else {
    // Braço/perna: esconde os meshes externos e mostra os ossos
    if (limbObj.userData.outerMeshes) {
      limbObj.userData.outerMeshes.forEach(m => m.visible = false);
    }
    if (limbObj.userData.boneMeshes) {
      limbObj.userData.boneMeshes.forEach(m => m.visible = true);
    }
  }

  z.dismembered[key] = true;

  // Spawna o membro voador (com aparência externa)
  const bt = ud.bodyType || BODY_TYPES[1];
  let size, color;
  if (key === 'head') { size = new THREE.Vector3(0.55, 0.55, 0.55); color = ud.skinColor; }
  else if (key === 'armL' || key === 'armR') { size = new THREE.Vector3(bt.arm, 0.95, bt.arm); color = ud.shirtColor; }
  else { size = new THREE.Vector3(bt.leg, 1.0, bt.leg); color = ud.pantsColor; }

  const geo = new THREE.BoxGeometry(size.x, size.y, size.z, 3, 3, 3);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.copy(wp);
  mesh.quaternion.copy(wq);
  mesh.castShadow = true;
  scene.add(mesh);

  const piece = new Debris(mesh, size, 1.2, CONFIG.dismember.limbLife);
  piece.key = key;
  const dir = hitDir.clone().normalize();
  piece.velocity.set(
    dir.x * CONFIG.dismember.limbSpeed + (Math.random() - 0.5) * 4,
    CONFIG.dismember.limbSpeed * 0.6 + Math.random() * 3,
    dir.z * CONFIG.dismember.limbSpeed + (Math.random() - 0.5) * 4
  );
  piece.angularVelocity.set((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25);
  flyingLimbs.push(piece);
  spawnBlood(wp, dir, 30, true);
  spawnBlood(wp, null, 10, true);
}

// ============================================================
// MORTE ALEATÓRIA
// ============================================================
function randomDismemberOnDeath(z) {
  const roll = Math.random();
  let partsToLose = 0;
  if (roll < 0.30) partsToLose = 0;
  else if (roll < 0.65) partsToLose = 1;
  else if (roll < 0.88) partsToLose = 2;
  else partsToLose = 3;

  const available = [];
  if (!z.dismembered.head) available.push('head');
  if (!z.dismembered.armL) available.push('armL');
  if (!z.dismembered.armR) available.push('armR');
  if (!z.dismembered.legL) available.push('legL');
  if (!z.dismembered.legR) available.push('legR');

  for (let i = 0; i < partsToLose && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length);
    const part = available.splice(idx, 1)[0];
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2
    ).normalize();
    detachLimb(z, part, dir);
    if (part === 'head') z.health = 0;
  }
}

// ============================================================
// AIM / CRIT / RAYCAST
// ============================================================
function getAimRegion() {
  if (player.pitch > 0.15) return 'head';
  if (player.pitch < -0.25) return 'legs';
  return 'torso';
}
function rollCrit() { return Math.random() < state.critChance; }

function raycastZombie(origin, dir, maxDist) {
  let bestZ = null, bestDist = Infinity;
  for (const z of zombies) {
    if (z.health <= 0) continue;
    const cx = z.mesh.position.x, cz = z.mesh.position.z;
    const half = 0.45, minY = 0, maxY = 2.1;
    const minX = cx - half, maxX = cx + half;
    const minZ = cz - half, maxZ = cz + half;
    let tMin = 0, tMax = maxDist, hit = true;
    if (Math.abs(dir.x) < 1e-6) { if (origin.x < minX || origin.x > maxX) hit = false; }
    else { const t1 = (minX - origin.x) / dir.x, t2 = (maxX - origin.x) / dir.x; tMin = Math.max(tMin, Math.min(t1, t2)); tMax = Math.min(tMax, Math.max(t1, t2)); }
    if (hit) {
      if (Math.abs(dir.y) < 1e-6) { if (origin.y < minY || origin.y > maxY) hit = false; }
      else { const t1 = (minY - origin.y) / dir.y, t2 = (maxY - origin.y) / dir.y; tMin = Math.max(tMin, Math.min(t1, t2)); tMax = Math.min(tMax, Math.max(t1, t2)); }
    }
    if (hit) {
      if (Math.abs(dir.z) < 1e-6) { if (origin.z < minZ || origin.z > maxZ) hit = false; }
      else { const t1 = (minZ - origin.z) / dir.z, t2 = (maxZ - origin.z) / dir.z; tMin = Math.max(tMin, Math.min(t1, t2)); tMax = Math.min(tMax, Math.max(t1, t2)); }
    }
    if (hit && tMin <= tMax && tMin >= 0 && tMin < bestDist) { bestDist = tMin; bestZ = z; }
  }
  return { zombie: bestZ, distance: bestDist };
}

const hitMarker = document.getElementById('hit-marker');
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

const tracers = [];
function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0xFFDD33, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ mesh: line, life: 0.08 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life / 0.08);
    if (t.life <= 0) {
      scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

// ============================================================
// DAMAGE
// ============================================================
function damageZombie(z, damage, isCrit, aimRegion, hitDir) {
  z.health -= damage;
  const hp = z.mesh.position.clone();
  if (aimRegion === 'head') hp.y += 1.85;
  else if (aimRegion === 'legs') hp.y += 0.5;
  else hp.y += 1.1;

  spawnBlood(hp, hitDir, isCrit ? 30 : 14, isCrit);
  if (isCrit) spawnBlood(hp, null, 12, true);

  Sfx.playKnifeHitFlesh();
  showHitMarker(isCrit);

  if (isCrit) {
    let limb = null;
    const roll = Math.random();
    if (aimRegion === 'head' && !z.dismembered.head) {
      if (roll < CONFIG.dismember.headChance) limb = 'head';
    } else if (aimRegion === 'torso') {
      const opts = [];
      if (!z.dismembered.armL) opts.push('armL');
      if (!z.dismembered.armR) opts.push('armR');
      if (opts.length > 0 && roll < CONFIG.dismember.armChance) limb = opts[Math.floor(Math.random() * opts.length)];
    } else if (aimRegion === 'legs') {
      const opts = [];
      if (!z.dismembered.legL) opts.push('legL');
      if (!z.dismembered.legR) opts.push('legR');
      if (opts.length > 0 && roll < CONFIG.dismember.legChance) limb = opts[Math.floor(Math.random() * opts.length)];
    }
    if (limb) {
      detachLimb(z, limb, hitDir);
      if (limb === 'head') z.health = 0;
    }
  }

  if (z.health <= 0) {
    Sfx.playZombieDeath();
    Sfx.playCoin();
    state.coins += Math.round(CONFIG.zombie.coinReward * state.coinMult);
    state.xp += Math.round(CONFIG.zombie.xpReward * state.xpMult);
    if (state.lifesteal > 0) state.health = Math.min(state.maxHealth, state.health + state.lifesteal);
    checkLevelUp();
    randomDismemberOnDeath(z);
    const overkill = Math.min(2, Math.max(0.7, -z.health / CONFIG.zombie.maxHealth + 1));
    startRagdoll(z.mesh, hitDir, isCrit ? overkill * 1.4 : overkill, z.dismembered);
    const idx = zombies.indexOf(z);
    if (idx >= 0) zombies.splice(idx, 1);
    state.zombiesAlive--;
    updateHUD();
  } else {
    z.hitReactEndTime = performance.now() / 1000 + CONFIG.zombie.knockbackStagger * (isCrit ? 1.5 : 1);
    z.hitDirection.copy(hitDir);
  }
}

// ============================================================
// ATTACK
// ============================================================
function attack() {
  const now = performance.now() / 1000;
  const weaponId = state.inventory[state.currentSlot] || 'knife';
  const weapon = WEAPONS[weaponId];
  const cd = weapon.cooldown / state.attackSpeedMult;
  if (now - state.lastAttackTime < cd) return;
  state.lastAttackTime = now;

  if (weapon.type === 'ranged' && weapon.ammo !== null) {
    if (weapon.ammo <= 0) return;
    weapon.ammo--;
    updateHUD();
  }

  if (weapon.type === 'melee') Sfx.playKnifeSwing();
  else if (weaponId === 'pistol') Sfx.playPistol();
  else if (weaponId === 'revolver') Sfx.playRevolver();
  else if (weaponId === 'smg') Sfx.playSMG();
  else if (weaponId === 'rifle') Sfx.playRifle();
  else if (weaponId === 'shotgun') Sfx.playShotgun();
  else if (weaponId === 'launcher') Sfx.playLauncher();

  triggerSwing();
  if (weapon.type === 'ranged') spawnMuzzleFlash();

  const aimRegion = getAimRegion();

  if (weapon.type === 'melee') {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const range = weapon.range + state.rangeBonus;
    [...zombies].forEach(z => {
      if (z.health <= 0) return;
      const to = new THREE.Vector3().subVectors(z.mesh.position, player.position);
      to.y = 0;
      if (to.length() > range) return;
      to.normalize();
      if (forward.dot(to) < 0.4) return;
      const isCrit = rollCrit();
      const base = weapon.damage * state.damageMult;
      const cm = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      damageZombie(z, isCrit ? base * cm : base, isCrit, aimRegion, to.clone());
    });
    const camPos = camera.position.clone();
    for (const r of ragdolls) {
      if (r.sliceAt(camPos, forward, CONFIG.ragdoll.sliceRange)) {
        Sfx.playKnifeHitFlesh();
        showHitMarker(false);
        break;
      }
    }
    return;
  }

  const origin = camera.position.clone();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const range = weapon.range + state.rangeBonus;

  for (let i = 0; i < weapon.pellets; i++) {
    const dir = forward.clone();
    if (weapon.spread > 0) {
      dir.x += (Math.random() - 0.5) * weapon.spread * 2;
      dir.y += (Math.random() - 0.5) * weapon.spread * 2;
      dir.z += (Math.random() - 0.5) * weapon.spread * 2;
      dir.normalize();
    }
    const result = raycastZombie(origin, dir, range);
    if (result.zombie) {
      const hitPoint = origin.clone().addScaledVector(dir, result.distance);
      spawnTracer(origin.clone().addScaledVector(dir, 0.8), hitPoint);
      const isCrit = rollCrit();
      const base = weapon.damage * state.damageMult;
      const cm = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const hd = dir.clone(); hd.y = 0; hd.normalize();
      damageZombie(result.zombie, isCrit ? base * cm : base, isCrit, aimRegion, hd);
    } else {
      spawnTracer(origin.clone().addScaledVector(dir, 0.8), origin.clone().addScaledVector(dir, range));
    }
  }
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
    state.pendingLevelUps++;
    leveled = true;
  }
  if (leveled) {
    Sfx.playLevelUp();
    if (!state.levelUpActive) showLevelUp();
  }
  updateHUD();
}

function showLevelUp() {
  state.levelUpActive = true;
  state.pendingLevelUps--;
  if (document.exitPointerLock) document.exitPointerLock();
  const pool = [...SKILLS];
  const chosen = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  const cont = document.getElementById('levelup-choices');
  cont.innerHTML = '';
  chosen.forEach(skill => {
    const card = document.createElement('button');
    card.className = 'skill-card';
    card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-name">${skill.name}</div><div class="skill-desc">${skill.desc}</div>`;
    card.addEventListener('click', () => pickSkill(skill.id));
    cont.appendChild(card);
  });
  document.getElementById('levelup-level').textContent = state.level;
  document.getElementById('levelup').classList.remove('hidden');
}

function pickSkill(skillId) {
  const skill = SKILLS.find(s => s.id === skillId);
  if (skill) skill.apply();
  document.getElementById('levelup').classList.add('hidden');
  if (state.pendingLevelUps > 0) setTimeout(showLevelUp, 220);
  else {
    state.levelUpActive = false;
    if (!isMobile() && state.running) renderer.domElement.requestPointerLock();
  }
  updateHUD();
}

// ============================================================
// WAVES
// ============================================================
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
  updateHUD();
  state.waveIntervalId = setInterval(() => {
    if (!state.running) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; return; }
    if (state.levelUpActive) return;
    if (state.zombiesRemainingInWave <= 0) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; return; }
    spawnZombie();
    state.zombiesRemainingInWave--;
    updateHUD();
  }, 500);
}

function checkWaveComplete() {
  if (state.betweenWaves) return;
  if (state.zombiesAlive === 0 && state.zombiesRemainingInWave <= 0) {
    state.betweenWaves = true;
    showWaveBanner('PROXIMA EM 5s');
    setTimeout(() => { if (state.running) startWave(); }, CONFIG.wave.breakTime * 1000);
  }
}

// ============================================================
// WEAPON SWITCH
// ============================================================
function switchToSlot(slot) {
  if (!state.inventory[slot] || state.currentSlot === slot) return;
  state.currentSlot = slot;
  buildViewModel(state.inventory[slot]);
  updateHUD();
  updateWeaponSlotsHUD();
}

function updateWeaponSlotsHUD() {
  document.querySelectorAll('#weapon-slots .slot').forEach(el => {
    const slot = parseInt(el.dataset.slot);
    const has = !!state.inventory[slot];
    el.classList.toggle('empty', !has);
    el.classList.toggle('active', state.currentSlot === slot);
    const nameEl = el.querySelector('.slot-name');
    if (has) nameEl.textContent = WEAPONS[state.inventory[slot]].name;
    else nameEl.textContent = '-';
  });
}

// ============================================================
// INPUT
// ============================================================
document.addEventListener('keydown', e => {
  state.keys[e.code] = true;
  if (e.code === 'Digit1') switchToSlot(1);
  if (e.code === 'Digit2') switchToSlot(2);
  if (e.code === 'Digit3') switchToSlot(3);
  if (e.code === 'Digit4') switchToSlot(4);
  if (e.code === 'KeyE') tryBuyWeapon();
});
document.addEventListener('keyup', e => { state.keys[e.code] = false; });

renderer.domElement.addEventListener('click', () => {
  if (!state.running || isMobile() || state.levelUpActive) return;
  Sfx.initAudio(); Sfx.resumeAudio();
  renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= e.movementX * 0.002;
  player.pitch -= e.movementY * 0.002;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});

document.addEventListener('mousedown', e => {
  if (e.button === 0) {
    state.mouseDown = true;
    if (state.running && !state.levelUpActive && document.pointerLockElement === renderer.domElement) {
      attack();
    }
  }
});
document.addEventListener('mouseup', e => { if (e.button === 0) state.mouseDown = false; });

// ============================================================
// MOBILE
// ============================================================
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 'ontouchstart' in window;
}

const mobile = { moveX: 0, moveY: 0, looking: false, lastX: 0, lastY: 0 };

function setupMobile() {
  if (!isMobile()) return;
  document.getElementById('mobile-controls').classList.remove('hidden');
  const stick = document.getElementById('joystick-stick');
  const base = document.getElementById('joystick-base');
  const look = document.getElementById('look-zone');
  const atk = document.getElementById('btn-attack');
  let baseRect = null, touching = false;

  base.addEventListener('touchstart', e => {
    e.preventDefault();
    Sfx.initAudio(); Sfx.resumeAudio();
    baseRect = base.getBoundingClientRect();
    touching = true;
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!touching || !baseRect) return;
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
    touching = false;
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
  const speed = CONFIG.player.speed * state.speedMult;
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

  resolveWallCollisions(player.position, CONFIG.player.radius);

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

function resolvePlayerZombieCollision() {
  for (const z of zombies) {
    if (z.health <= 0) continue;
    const dx = player.position.x - z.mesh.position.x;
    const dz = player.position.z - z.mesh.position.z;
    const d2 = dx * dx + dz * dz;
    const minD = CONFIG.player.radius + CONFIG.zombie.radius;
    if (d2 < minD * minD && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const overlap = minD - d;
      const nx = dx / d, nz = dz / d;
      player.position.x += nx * overlap * 0.5;
      player.position.z += nz * overlap * 0.5;
      z.mesh.position.x -= nx * overlap * 0.5;
      z.mesh.position.z -= nz * overlap * 0.5;
    }
  }
}

function resolveZombieWallCollision(z) {
  const p = z.mesh.position;
  for (const box of world.wallColliders) {
    const r = circleVsAABB(p.x, p.z, CONFIG.zombie.radius, box);
    if (r) { p.x = r.x; p.z = r.z; }
  }
  for (const box of world.furnitureColliders) {
    const r = circleVsAABB(p.x, p.z, CONFIG.zombie.radius, box);
    if (r) { p.x = r.x; p.z = r.z; }
  }
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
    z.emergeTime += dt;
    const emerge = Math.min(1, z.emergeTime / 1.5);
    const isWounded = z.health / z.maxHealth < 0.5;
    const to = new THREE.Vector3().subVectors(player.position, z.mesh.position);
    to.y = 0;
    const dist = to.length();
    z.mesh.lookAt(player.position.x, z.mesh.position.y, player.position.z);

    const staggering = z.hitReactEndTime > now;
    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      z.mesh.rotateX(-lean * 0.45);
      z.mesh.position.addScaledVector(z.hitDirection, -dt * 4 * lean);
    } else {
      let sm = emerge;
      if (z.dismembered.legL || z.dismembered.legR) sm *= 0.55;
      if (z.dismembered.legL && z.dismembered.legR) sm *= 0.3;
      const ws = (isWounded ? 3.2 : 5) * sm;
      z.walkPhase += dt * ws;

      const legSwing = Math.sin(z.walkPhase) * 0.6;
      if (z.mesh.userData.legL && !z.dismembered.legL && z.mesh.userData.legL.visible) {
        z.mesh.userData.legL.rotation.x = legSwing;
      }
      if (z.mesh.userData.legR && !z.dismembered.legR && z.mesh.userData.legR.visible) {
        z.mesh.userData.legR.rotation.x = -legSwing;
      }

      const reaching = dist < 3.5;
      if (z.mesh.userData.armL && !z.dismembered.armL) {
        const target = reaching ? -1.5 + Math.sin(z.walkPhase) * 0.08 : -legSwing * 0.7;
        const cur = z.mesh.userData.armL.rotation.x;
        z.mesh.userData.armL.rotation.x = cur + (target - cur) * 0.15;
      }
      if (z.mesh.userData.armR && !z.dismembered.armR) {
        const target = reaching ? -1.5 + Math.cos(z.walkPhase) * 0.08 : legSwing * 0.7;
        const cur = z.mesh.userData.armR.rotation.x;
        z.mesh.userData.armR.rotation.x = cur + (target - cur) * 0.15;
      }
      const targetLean = isWounded ? 0.20 + (dist < 3 ? 0.1 : 0) : 0.12 + (dist < 3 ? 0.08 : 0);
      z.mesh.rotation.x += (targetLean - z.mesh.rotation.x) * 0.05;
    }

    if (z.dismembered.head) { z.health = 0; return; }

    if (emerge >= 0.5) {
      const zs = CONFIG.zombie.speed * (isWounded ? 0.6 : 1);
      if (!staggering && dist > CONFIG.zombie.attackRange) {
        to.normalize();
        z.mesh.position.addScaledVector(to, zs * dt);
      } else if (!staggering && now - z.lastAttackTime > CONFIG.zombie.attackCooldown) {
        z.lastAttackTime = now;
        state.health -= CONFIG.zombie.damage * (1 - state.damageReduction);
        Sfx.playPlayerHurt();
        showDamageFlash();
        updateHUD();
        if (state.health <= 0) gameOver();
      }
    }

    resolveZombieWallCollision(z);
  });

  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i], b = zombies[j];
      if (a.health <= 0 || b.health <= 0) continue;
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const minD = CONFIG.zombie.radius * 2;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minD - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.mesh.position.x -= nx * push; a.mesh.position.z -= nz * push;
        b.mesh.position.x += nx * push; b.mesh.position.z += nz * push;
      }
    }
  }
}

function updateDoors(dt) {
  for (const door of world.doors) {
    const dx = player.position.x - door.worldX;
    const dz = player.position.z - door.worldZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const shouldOpen = dist < 2.2;
    const target = shouldOpen ? -Math.PI / 2 : 0;
    door.currentAngle += (target - door.currentAngle) * Math.min(1, dt * 6);
    door.group.rotation.y = door.currentAngle;
  }
}

// ============================================================
// WEAPON PICKUPS
// ============================================================
let nearWeapon = null;
const promptEl = document.getElementById('prompt');
const promptText = document.getElementById('prompt-text');

function spawnWeaponPickup(weaponId, x, z, y = 0.9) {
  const w = WEAPONS[weaponId];
  const geo = new THREE.BoxGeometry(0.3, 0.15, 0.6, 2, 2, 2);
  const mat = new THREE.MeshLambertMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.04, 8, 16),
    new THREE.MeshBasicMaterial({ color: 0xffdd00 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(mesh.position);
  ring.position.y += 0.1;
  scene.add(ring);
  world.weaponSpots.push({ x, y, z, mesh, ring, weaponId, bought: false, baseY: y });
}

function setupWeaponSpawns() {
  const houses = [
    { x: -14, z: -14 }, { x: 14, z: -14 }, { x: -14, z: 14 }, { x: 14, z: 14 },
    { x: -28, z: -8 }, { x: 28, z: -8 }, { x: -28, z: 8 }, { x: 28, z: 8 },
    { x: -8, z: -28 }, { x: 8, z: -28 }, { x: -8, z: 28 }, { x: 8, z: 28 },
  ];
  const pool = ['pistol', 'pistol', 'smg', 'shotgun', 'revolver', 'rifle', 'launcher'];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  houses.forEach((h, i) => {
    spawnWeaponPickup(shuffled[i % shuffled.length], h.x, h.z + 0.5, 0.95);
  });
}

function updateWeaponPickups(dt) {
  const t = performance.now() / 1000;
  world.weaponSpots.forEach(s => {
    if (s.bought) return;
    s.mesh.rotation.y += dt * 1.5;
    s.mesh.position.y = s.baseY + Math.sin(t * 2) * 0.08;
    s.ring.rotation.z += dt * 2;
    s.ring.position.y = s.mesh.position.y + 0.1;
  });

  let closest = null, closestDist = 2.0;
  world.weaponSpots.forEach(s => {
    if (s.bought) return;
    const dx = player.position.x - s.x;
    const dz = player.position.z - s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < closestDist) { closestDist = d; closest = s; }
  });
  nearWeapon = closest;

  if (closest) {
    const w = WEAPONS[closest.weaponId];
    const can = state.coins >= w.cost;
    const color = can ? '#ffdd00' : '#ff4444';
    promptEl.classList.remove('hidden');
    promptText.innerHTML = `Comprar <span style="color:${color}">${w.name}</span> — <span style="color:${color}">$${w.cost}</span>`;
  } else {
    promptEl.classList.add('hidden');
  }
}

function tryBuyWeapon() {
  if (!nearWeapon || nearWeapon.bought) return;
  const w = WEAPONS[nearWeapon.weaponId];
  if (state.coins < w.cost) { Sfx.playPlayerHurt(); return; }
  state.coins -= w.cost;
  state.inventory[w.slot] = nearWeapon.weaponId;
  nearWeapon.bought = true;
  scene.remove(nearWeapon.mesh);
  scene.remove(nearWeapon.ring);
  nearWeapon.mesh.geometry.dispose();
  nearWeapon.mesh.material.dispose();
  nearWeapon.ring.geometry.dispose();
  nearWeapon.ring.material.dispose();
  if (state.currentSlot === w.slot) buildViewModel(nearWeapon.weaponId);
  else switchToSlot(w.slot);
  Sfx.playCoin();
  updateHUD();
  updateWeaponSlotsHUD();
}

function updateRagdolls(dt) {
  for (let i = ragdolls.length - 1; i >= 0; i--) {
    const r = ragdolls[i];
    if (r.update(dt)) { r.dispose(); ragdolls.splice(i, 1); }
  }
}
function updateFlyingLimbs(dt) {
  for (let i = flyingLimbs.length - 1; i >= 0; i--) {
    const l = flyingLimbs[i];
    if (l.update(dt)) { l.dispose(); flyingLimbs.splice(i, 1); }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (state.running && !state.levelUpActive) {
    updatePlayer(dt);
    resolvePlayerZombieCollision();
    updateZombies(dt);
    updateParticles(dt);
    updateBloodPools(dt);
    updateTracers(dt);
    updateDoors(dt);
    updateWeaponPickups(dt);
    checkWaveComplete();
    updateWeaponViewModel(dt);
    updateRagdolls(dt);
    updateFlyingLimbs(dt);

    if (state.mouseDown) {
      const w = WEAPONS[state.inventory[state.currentSlot] || 'knife'];
      if (w.auto) attack();
    }

    const elapsed = Math.floor((performance.now() - state.startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${m}:${s}`;
  } else if (!state.running) {
    updateParticles(dt);
    updateBloodPools(dt);
    updateTracers(dt);
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
  const w = WEAPONS[state.inventory[state.currentSlot] || 'knife'];
  document.getElementById('weapon-name').textContent = w.name;
  const ammoEl = document.getElementById('ammo-current');
  if (w.ammo === null) ammoEl.textContent = '∞';
  else { ammoEl.textContent = w.ammo + ' / ' + w.maxAmmo; ammoEl.style.color = w.ammo <= 0 ? '#ff4444' : '#fff'; }
}

function startGame() {
  if (state.waveIntervalId !== null) {
    clearInterval(state.waveIntervalId);
    state.waveIntervalId = null;
  }
  Sfx.initAudio(); Sfx.resumeAudio();
  state.maxHealth = CONFIG.player.maxHealth;
  state.health = state.maxHealth;
  state.coins = 0; state.xp = 0;
  state.level = 1; state.xpToNextLevel = 50;
  state.wave = 0; state.zombiesAlive = 0;
  state.zombiesRemainingInWave = 0;
  state.running = true; state.betweenWaves = false;
  state.startTime = performance.now();
  state.critChance = CONFIG.crit.baseChance;
  state.damageMult = 1.0; state.rangeBonus = 0;
  state.speedMult = 1.0; state.lifesteal = 0;
  state.coinMult = 1.0; state.xpMult = 1.0;
  state.damageReduction = 0;
  state.attackSpeedMult = 1.0; state.critDamageBonus = 0;
  state.levelUpActive = false; state.pendingLevelUps = 0;
  state.inventory = { 1: 'knife', 2: null, 3: null, 4: null };
  state.currentSlot = 1;
  state.mouseDown = false;
  state.lastAttackTime = 0;

  world.weaponSpots.forEach(s => {
    scene.remove(s.mesh);
    scene.remove(s.ring);
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
    s.ring.geometry.dispose();
    s.ring.material.dispose();
  });
  world.weaponSpots = [];
  Object.values(WEAPONS).forEach(w => { if (w.maxAmmo !== null) w.ammo = w.maxAmmo; });
  setupWeaponSpawns();

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
  tracers.forEach(t => scene.remove(t.mesh));
  tracers.length = 0;

  player.position.set(0, CONFIG.player.height, 0);
  player.yaw = 0; player.pitch = 0;

  buildViewModel('knife');
  updateWeaponSlotsHUD();

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
  document.getElementById('prompt').classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-multiplayer').addEventListener('click', () => alert('Multijogador em breve!'));
document.getElementById('btn-wiki').addEventListener('click', () => window.open('https://zumbiblocks2.wiki.gg/', '_blank'));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
