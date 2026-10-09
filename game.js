import * as THREE from 'three';
import * as Textures from './textures.js';
import { buildWorld } from './scenery.js';
import * as Sfx from './audio.js';

// ============================================================
// ARMAS
// ============================================================
const WEAPONS = {
  knife:    { id: 'knife',    name: 'FACA',           slot: 1, damage: 25, range: 3.2, cooldown: 0.4, type: 'melee',  ammo: null, maxAmmo: null, cost: 0,    spread: 0,    pellets: 1, auto: false, color: 0xBDC3C7, size: [0.05, 0.4, 0.02] },
  pistol:   { id: 'pistol',   name: 'PISTOLA',        slot: 2, damage: 35, range: 15,  cooldown: 0.3, type: 'ranged', ammo: 999,  maxAmmo: 999,  cost: 40,   spread: 0.015, pellets: 1, auto: false, color: 0x2C3E50, size: [0.08, 0.15, 0.28] },
  revolver: { id: 'revolver', name: 'REVOLVER',       slot: 2, damage: 60, range: 14,  cooldown: 0.6, type: 'ranged', ammo: 30,   maxAmmo: 30,   cost: 150,  spread: 0.01,  pellets: 1, auto: false, color: 0x4A4A4A, size: [0.09, 0.16, 0.3] },
  smg:      { id: 'smg',      name: 'SMG',            slot: 3, damage: 20, range: 12,  cooldown: 0.09, type: 'ranged', ammo: 180, maxAmmo: 180,  cost: 200,  spread: 0.06,  pellets: 1, auto: true,  color: 0x34495E, size: [0.09, 0.14, 0.4] },
  rifle:    { id: 'rifle',    name: 'RIFLE',          slot: 3, damage: 70, range: 25,  cooldown: 0.15, type: 'ranged', ammo: 90,  maxAmmo: 90,   cost: 400,  spread: 0.02,  pellets: 1, auto: true,  color: 0x2C3E50, size: [0.08, 0.16, 0.55] },
  shotgun:  { id: 'shotgun',  name: 'SHOTGUN',        slot: 3, damage: 30, range: 8,   cooldown: 0.8, type: 'ranged', ammo: 24,   maxAmmo: 24,   cost: 300,  spread: 0.18,  pellets: 8, auto: false, color: 0x8B4513, size: [0.1, 0.16, 0.5] },
  launcher: { id: 'launcher', name: 'LANCA-FOGUETES', slot: 4, damage: 200, range: 18, cooldown: 1.4, type: 'ranged', ammo: 5,    maxAmmo: 5,    cost: 1200, spread: 0.03,  pellets: 1, auto: false, color: 0xC0392B, size: [0.14, 0.18, 0.6] },
};

// ============================================================
// HABILIDADES
// ============================================================
const SKILLS = [
  { id: 'vitality', icon: 'V', name: 'VITALIDADE', desc: '+20 HP maximo', apply: () => { state.maxHealth += 20; state.health = Math.min(state.maxHealth, state.health + 20); } },
  { id: 'strength', icon: 'F', name: 'FORCA', desc: '+15% de dano', apply: () => { state.damageMult += 0.15; } },
  { id: 'reach', icon: 'A', name: 'ALCANCE', desc: '+0.3m de alcance', apply: () => { state.rangeBonus += 0.3; } },
  { id: 'agility', icon: 'V', name: 'AGILIDADE', desc: '+8% velocidade', apply: () => { state.speedMult += 0.08; } },
  { id: 'precision', icon: 'P', name: 'PRECISAO', desc: '+8% chance de critico', apply: () => { state.critChance = Math.min(0.95, state.critChance + 0.08); } },
  { id: 'vampirism', icon: 'S', name: 'VAMPIRISMO', desc: '+3 HP por zumbi', apply: () => { state.lifesteal += 3; } },
  { id: 'fortune', icon: '$', name: 'FORTUNA', desc: '+50% moedas', apply: () => { state.coinMult += 0.5; } },
  { id: 'wisdom', icon: 'W', name: 'SABEDORIA', desc: '+30% XP', apply: () => { state.xpMult += 0.3; } },
  { id: 'resistance', icon: 'R', name: 'RESISTENCIA', desc: '-10% dano recebido', apply: () => { state.damageReduction = Math.min(0.7, state.damageReduction + 0.1); } },
  { id: 'fury', icon: 'U', name: 'FURIA', desc: '-12% tempo entre ataques', apply: () => { state.attackSpeedMult += 0.12; } },
  { id: 'heavy', icon: 'H', name: 'GOLPE PESADO', desc: '+0.5x dano em critico', apply: () => { state.critDamageBonus += 0.5; } },
];

const CONFIG = {
  player: { speed: 5.5, height: 1.7, maxHealth: 100, radius: 0.4 },
  zombie: {
    speed: 1.9, maxHealth: 40, damage: 8, attackRange: 1.6,
    attackCooldown: 1.2, xpReward: 10, coinReward: 2,
    knockbackStagger: 0.25, radius: 0.4,
  },
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

// ============================================================
// THREE.JS
// ============================================================
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
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

const world = buildWorld(scene, CONFIG.arena.size);

const caves = [];
{
  const half = CONFIG.arena.size / 2 - 3;
  const caveData = [
    { x: 0, z: -half, rot: 0 }, { x: 0, z: half, rot: Math.PI },
    { x: -half, z: 0, rot: Math.PI / 2 }, { x: half, z: 0, rot: -Math.PI / 2 },
    { x: -half * 0.7, z: -half * 0.7, rot: Math.PI / 4 },
    { x: half * 0.7, z: -half * 0.7, rot: -Math.PI / 4 },
    { x: -half * 0.7, z: half * 0.7, rot: Math.PI * 3 / 4 },
    { x: half * 0.7, z: half * 0.7, rot: -Math.PI * 3 / 4 },
  ];
  caveData.forEach(({ x, z, rot }) => {
    const mesh = createCave(x, z, rot);
    scene.add(mesh);
    caves.push({ x, z, rot, mesh });
  });
}

function createCave(x, z, rotationY) {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x5A5A5A, flatShading: true });
  const darkRockMat = new THREE.MeshLambertMaterial({ color: 0x3A3A3A, flatShading: true });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  function makeRock(px, py, pz, sx, sy, sz, mat) {
    const rock = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz, 3, 3, 3), mat || rockMat);
    rock.position.set(px, py, pz);
    rock.rotation.y = Math.random() * 0.4 - 0.2;
    rock.castShadow = true; rock.receiveShadow = true;
    g.add(rock);
  }
  makeRock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  makeRock(1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  makeRock(-0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRockMat);
  makeRock(0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRockMat);
  makeRock(0, 3.6, 0.2, 3.6, 0.9, 2.0, rockMat);
  makeRock(-2.8, 0.6, -0.8, 1.4, 1.2, 1.4, darkRockMat);
  makeRock(2.8, 0.6, -0.8, 1.4, 1.2, 1.4, darkRockMat);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.4), holeMat);
  hole.position.set(0, 1.3, -1.0);
  g.add(hole);
  const deep = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.2), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
  deep.position.set(0, 1.1, -1.4);
  g.add(deep);
  g.position.set(x, 0, z);
  g.rotation.y = rotationY;
  return g;
}

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
  world.wallColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
});

// ============================================================
// VIEWMODEL
// ============================================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

let currentViewModel = null;

function buildViewModel(weaponId) {
  if (currentViewModel) {
    weaponGroup.remove(currentViewModel);
    currentViewModel.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    currentViewModel = null;
  }
  const w = WEAPONS[weaponId];
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x2C3E50 });
  const darkMetal = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
  const lightMetal = new THREE.MeshLambertMaterial({ color: 0x7F8C8D });
  const wood = new THREE.MeshLambertMaterial({ color: 0x5D4030 });
  const grip = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });

  if (weaponId === 'knife') {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.20, 0.055), grip);
    g.add(handle);
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.07), lightMetal);
    pommel.position.set(0, -0.10, 0);
    g.add(pommel);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.08), darkMetal);
    guard.position.set(0, 0.11, 0);
    g.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.5, 0.018), lightMetal);
    blade.position.set(0, 0.37, 0);
    g.add(blade);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.48, 0.02), new THREE.MeshBasicMaterial({ color: 0xECF0F1 }));
    edge.position.set(-0.02, 0.37, 0);
    g.add(edge);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.018), lightMetal);
    tip.position.set(0, 0.65, 0);
    g.add(tip);
  }
  else if (weaponId === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.28), metal);
    slide.position.set(0, 0.06, -0.05);
    g.add(slide);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.06, -0.22);
    g.add(barrel);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), grip);
    gripMesh.position.set(0, -0.05, 0.06);
    gripMesh.rotation.x = 0.25;
    g.add(gripMesh);
    const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI), darkMetal);
    triggerGuard.rotation.z = Math.PI;
    triggerGuard.position.set(0, -0.02, 0.01);
    g.add(triggerGuard);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.02), darkMetal);
    rearSight.position.set(0, 0.11, 0.06);
    g.add(rearSight);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.015, 0.02), darkMetal);
    frontSight.position.set(0, 0.11, -0.19);
    g.add(frontSight);
  }
  else if (weaponId === 'revolver') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.15);
    g.add(barrel);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 8), darkMetal);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0, 0.04, 0);
    g.add(cylinder);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.18), metal);
    frame.position.set(0, 0.03, -0.02);
    g.add(frame);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.18, 0.08), wood);
    gripMesh.position.set(0, -0.07, 0.08);
    gripMesh.rotation.x = 0.3;
    g.add(gripMesh);
    const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), darkMetal);
    triggerGuard.rotation.z = Math.PI;
    triggerGuard.position.set(0, -0.02, 0.03);
    g.add(triggerGuard);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.04, 0.03), darkMetal);
    hammer.position.set(0, 0.08, 0.08);
    g.add(hammer);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.02), darkMetal);
    sight.position.set(0, 0.075, -0.25);
    g.add(sight);
  }
  else if (weaponId === 'smg') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.34), metal);
    body.position.set(0, 0.03, -0.05);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.26);
    g.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.06), darkMetal);
    mag.position.set(0, -0.09, 0.05);
    mag.rotation.x = 0.15;
    g.add(mag);
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), grip);
    foregrip.position.set(0, -0.06, -0.15);
    g.add(foregrip);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), grip);
    rearGrip.position.set(0, -0.06, 0.09);
    rearGrip.rotation.x = 0.2;
    g.add(rearGrip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.08), metal);
    stock.position.set(0, 0.02, 0.16);
    g.add(stock);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.02), darkMetal);
    sight.position.set(0, 0.08, 0.05);
    g.add(sight);
  }
  else if (weaponId === 'rifle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.5), metal);
    body.position.set(0, 0.03, -0.1);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.45);
    g.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.06), darkMetal);
    mag.position.set(0, -0.08, 0.02);
    mag.rotation.x = 0.1;
    g.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.16), wood);
    stock.position.set(0, 0.0, 0.22);
    g.add(stock);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.05), wood);
    rearGrip.position.set(0, -0.06, 0.1);
    rearGrip.rotation.x = 0.2;
    g.add(rearGrip);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), darkMetal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.11, -0.05);
    g.add(scope);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x4A90D9 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.022, 8), lensMat);
    lens.position.set(0, 0.11, -0.15);
    g.add(lens);
  }
  else if (weaponId === 'shotgun') {
    const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), darkMetal);
    barrel1.rotation.x = Math.PI / 2;
    barrel1.position.set(-0.02, 0.04, -0.2);
    g.add(barrel1);
    const barrel2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), darkMetal);
    barrel2.rotation.x = Math.PI / 2;
    barrel2.position.set(0.02, 0.04, -0.2);
    g.add(barrel2);
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), metal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.02, -0.2);
    g.add(magTube);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.2), wood);
    stock.position.set(0, 0.0, 0.2);
    g.add(stock);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.06), wood);
    rearGrip.position.set(0, -0.06, 0.08);
    rearGrip.rotation.x = 0.15;
    g.add(rearGrip);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.1), wood);
    pump.position.set(0, -0.02, -0.15);
    g.add(pump);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), darkMetal);
    hammer.position.set(0, 0.08, 0.15);
    g.add(hammer);
  }
  else if (weaponId === 'launcher') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 12), metal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.02, -0.1);
    g.add(tube);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mouth.rotation.y = Math.PI;
    mouth.position.set(0, 0.02, -0.45);
    g.add(mouth);
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), grip);
    foregrip.position.set(0, -0.08, -0.15);
    g.add(foregrip);
    const rearGrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.07), grip);
    rearGrip.position.set(0, -0.09, 0.12);
    rearGrip.rotation.x = 0.15;
    g.add(rearGrip);
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.06), darkMetal);
    sightBase.position.set(0, 0.09, 0.05);
    g.add(sightBase);
    const sightTop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), darkMetal);
    sightTop.position.set(0, 0.12, 0.05);
    g.add(sightTop);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.04, 12), new THREE.MeshBasicMaterial({ color: 0xCC0000 }));
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(0, 0.02, -0.35);
    g.add(stripe);
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
      const t = swingProgress;
      const arc = Math.sin(t * Math.PI);
      if (currentViewModel) {
        currentViewModel.position.set(0.32 - arc * 0.35, -0.32 + arc * 0.12, -0.6 - arc * 0.15);
        currentViewModel.rotation.set(-0.15 - arc * 0.5, -0.35 + arc * 0.7, 0.15 - arc * 0.4);
      }
    }
  } else {
    if (currentViewModel) {
      const bob = Math.sin(state.bobTime) * 0.015;
      const bobX = Math.cos(state.bobTime * 0.5) * 0.01;
      currentViewModel.position.x = 0.32 + (state.isMoving ? bobX : 0);
      currentViewModel.position.y = -0.32 + (state.isMoving ? bob : 0);
    }
  }
}

const player = {
  position: new THREE.Vector3(0, CONFIG.player.height, 0),
  yaw: 0, pitch: 0,
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function makeBox(w, h, d, s = 3) { return new THREE.BoxGeometry(w, h, d, s, s, s); }
function makeJoint(r, seg = 12) { return new THREE.SphereGeometry(r, seg, Math.floor(seg * 0.75)); }

// ============================================================
// COLISÃO
// ============================================================
function circleVsAABB(px, pz, radius, box) {
  const closestX = Math.max(box.minX, Math.min(px, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
  const dx = px - closestX;
  const dz = pz - closestZ;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  const dist = Math.sqrt(d2);
  if (dist > 0.0001) {
    const nx = dx / dist;
    const nz = dz / dist;
    const push = radius - dist;
    return { x: px + nx * push, z: pz + nz * push };
  } else {
    const exL = Math.abs(px - box.minX);
    const exR = Math.abs(box.maxX - px);
    const ezU = Math.abs(pz - box.minZ);
    const ezD = Math.abs(box.maxZ - pz);
    const minE = Math.min(exL, exR, ezU, ezD);
    if (minE === exL) return { x: box.minX - radius, z: pz };
    if (minE === exR) return { x: box.maxX + radius, z: pz };
    if (minE === ezU) return { x: px, z: box.minZ - radius };
    return { x: px, z: box.maxZ + radius };
  }
}

function resolveWallCollisions(pos, radius) {
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 4) {
    changed = false;
    iterations++;
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
// ZUMBIS
// ============================================================
const zombies = [];
const SHIRT_COLORS = [0x8E44AD, 0x2ECC71, 0xE74C3C, 0x3498DB, 0xF39C12, 0xE67E22, 0x16A085, 0xC0392B];
const PANTS_COLORS = [0x8B5A2B, 0x5D4030, 0x3E2723, 0x2C3E50, 0x34495E, 0x1B2631];
const SKIN_COLORS = [0x7BC950, 0x6BB840, 0x8DD65A, 0x5DAE3F, 0x9DE06B];
const HAIR_COLORS = [0x2C1810, 0x1A0F08, 0x4A2818, 0x6B3A1F, 0x3A2A1A];
const BODY_TYPES = [
  { name: 'magro', torsoW: 0.55, torsoD: 0.30, arm: 0.18, leg: 0.22, heightScale: 1.05 },
  { name: 'normal', torsoW: 0.70, torsoD: 0.35, arm: 0.22, leg: 0.26, heightScale: 1.00 },
  { name: 'gordo', torsoW: 0.85, torsoD: 0.45, arm: 0.26, leg: 0.30, heightScale: 0.95 },
];

function createZombieMesh() {
  const g = new THREE.Group();
  const skinColor = rand(SKIN_COLORS);
  const shirtColor = rand(SHIRT_COLORS);
  const pantsColor = rand(PANTS_COLORS);
  const hairColor = rand(HAIR_COLORS);
  const bodyType = rand(BODY_TYPES);
  const sleeveLong = Math.random() > 0.5;
  const hasHat = Math.random() > 0.7;
  const wounded = Math.random() > 0.5;

  const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
  const soleMat = new THREE.MeshLambertMaterial({ color: 0xECF0F1 });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2B0000 });
  const woundMat = new THREE.MeshBasicMaterial({ color: 0xC0392B });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8B0000 });

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.85;
  headGroup.add(new THREE.Mesh(makeBox(0.55, 0.55, 0.55, 3), skinMat));
  const hair = new THREE.Mesh(makeBox(0.58, 0.10, 0.58, 3), hairMat);
  hair.position.y = 0.30; headGroup.add(hair);
  const fringe = new THREE.Mesh(makeBox(0.58, 0.14, 0.08, 3), hairMat);
  fringe.position.set(0, 0.24, 0.28); headGroup.add(fringe);
  const earGeo = makeBox(0.06, 0.14, 0.10, 2);
  const earL = new THREE.Mesh(earGeo, skinMat); earL.position.set(-0.31, 0, 0); headGroup.add(earL);
  const earR = new THREE.Mesh(earGeo, skinMat); earR.position.set(0.31, 0, 0); headGroup.add(earR);
  const eyeWGeo = makeBox(0.13, 0.11, 0.02, 2);
  const eyeL = new THREE.Mesh(eyeWGeo, eyeWhiteMat); eyeL.position.set(-0.13, 0.08, 0.285); headGroup.add(eyeL);
  const eyeR = new THREE.Mesh(eyeWGeo, eyeWhiteMat); eyeR.position.set(0.13, 0.08, 0.285); headGroup.add(eyeR);
  const pupGeo = makeBox(0.05, 0.05, 0.02, 2);
  const pupL = new THREE.Mesh(pupGeo, pupilMat); pupL.position.set(-0.13, 0.08, 0.295); headGroup.add(pupL);
  const pupR = new THREE.Mesh(pupGeo, pupilMat); pupR.position.set(0.13, 0.08, 0.295); headGroup.add(pupR);
  const nose = new THREE.Mesh(makeBox(0.08, 0.08, 0.06, 2), skinMat); nose.position.set(0, -0.02, 0.30); headGroup.add(nose);
  const mouth = new THREE.Mesh(makeBox(0.20, 0.06, 0.02, 2), mouthMat); mouth.position.set(0, -0.14, 0.285); headGroup.add(mouth);
  const teeth = new THREE.Mesh(makeBox(0.18, 0.02, 0.02, 2), eyeWhiteMat); teeth.position.set(0, -0.11, 0.29); headGroup.add(teeth);
  if (wounded) {
    const woundHead = new THREE.Mesh(makeBox(0.12, 0.06, 0.02, 2), woundMat);
    woundHead.position.set(-0.15, 0.16, 0.285); headGroup.add(woundHead);
    const blood = new THREE.Mesh(makeBox(0.04, 0.10, 0.02, 2), bloodMat);
    blood.position.set(-0.15, 0.07, 0.285); headGroup.add(blood);
  }
  if (hasHat) {
    const hatGroup = new THREE.Group();
    hatGroup.add(new THREE.Mesh(makeBox(0.65, 0.05, 0.65, 3), new THREE.MeshLambertMaterial({ color: 0x2C3E50 })));
    const hatTop = new THREE.Mesh(makeBox(0.45, 0.25, 0.45, 3), new THREE.MeshLambertMaterial({ color: 0x34495E }));
    hatTop.position.y = 0.15; hatGroup.add(hatTop);
    hatGroup.position.y = 0.34; headGroup.add(hatGroup);
  }
  g.add(headGroup);

  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 1.15;
  torsoGroup.add(new THREE.Mesh(makeBox(bodyType.torsoW, 0.85, bodyType.torsoD, 3), shirtMat));
  const collar = new THREE.Mesh(makeBox(bodyType.torsoW * 0.85, 0.06, bodyType.torsoD * 0.9, 2), new THREE.MeshLambertMaterial({ color: 0x000000 }));
  collar.position.y = 0.43; torsoGroup.add(collar);
  if (wounded) {
    const w1 = new THREE.Mesh(makeBox(0.14, 0.10, 0.02, 2), woundMat); w1.position.set(0.15, 0.05, bodyType.torsoD / 2 + 0.01); torsoGroup.add(w1);
    const w2 = new THREE.Mesh(makeBox(0.10, 0.14, 0.02, 2), woundMat); w2.position.set(-0.18, -0.15, bodyType.torsoD / 2 + 0.01); torsoGroup.add(w2);
  }
  g.add(torsoGroup);

  function makeArm(side) {
    const arm = new THREE.Group();
    arm.add(new THREE.Mesh(makeJoint(bodyType.arm * 0.55), shirtMat));
    const upperMat = sleeveLong ? shirtMat : skinMat;
    const upper = new THREE.Mesh(makeBox(bodyType.arm, 0.42, bodyType.arm, 3), upperMat);
    upper.position.y = -0.22; arm.add(upper);
    const elbow = new THREE.Mesh(makeJoint(bodyType.arm * 0.45), upperMat); elbow.position.y = -0.46; arm.add(elbow);
    const lower = new THREE.Mesh(makeBox(bodyType.arm * 0.92, 0.42, bodyType.arm * 0.92, 3), upperMat);
    lower.position.y = -0.68; arm.add(lower);
    const hand = new THREE.Mesh(makeBox(bodyType.arm * 1.05, 0.14, bodyType.arm * 1.15, 3), skinMat);
    hand.position.y = -0.99; arm.add(hand);
    const fingerGeo = makeBox(bodyType.arm * 0.18, 0.13, bodyType.arm * 0.18, 2);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(fingerGeo, skinMat);
      finger.position.set(-bodyType.arm * 0.36 + i * bodyType.arm * 0.24, -1.11, bodyType.arm * 0.28);
      arm.add(finger);
    }
    return arm;
  }
  const armL = makeArm(-1); armL.position.set(-bodyType.torsoW / 2 - bodyType.arm / 2 + 0.05, 1.5, 0); g.add(armL);
  const armR = makeArm(1); armR.position.set(bodyType.torsoW / 2 + bodyType.arm / 2 - 0.05, 1.5, 0); g.add(armR);

  function makeLeg() {
    const leg = new THREE.Group();
    leg.add(new THREE.Mesh(makeJoint(bodyType.leg * 0.58), pantsMat));
    const thigh = new THREE.Mesh(makeBox(bodyType.leg, 0.55, bodyType.leg, 3), pantsMat);
    thigh.position.y = -0.30; leg.add(thigh);
    const knee = new THREE.Mesh(makeJoint(bodyType.leg * 0.48), pantsMat); knee.position.y = -0.60; leg.add(knee);
    const shin = new THREE.Mesh(makeBox(bodyType.leg * 0.9, 0.40, bodyType.leg * 0.9, 3), pantsMat);
    shin.position.y = -0.82; leg.add(shin);
    const shoeBase = new THREE.Mesh(makeBox(bodyType.leg * 1.15, 0.14, bodyType.leg * 1.35, 3), shoeMat);
    shoeBase.position.set(0, -1.12, 0.03); leg.add(shoeBase);
    const sole = new THREE.Mesh(makeBox(bodyType.leg * 1.18, 0.04, bodyType.leg * 1.4, 3), soleMat);
    sole.position.set(0, -1.20, 0.03); leg.add(sole);
    return leg;
  }
  const legL = makeLeg(); legL.position.set(-bodyType.leg * 0.55, 0.72, 0); g.add(legL);
  const legR = makeLeg(); legR.position.set(bodyType.leg * 0.55, 0.72, 0); g.add(legR);

  g.scale.y = bodyType.heightScale;
  g.rotation.x = 0.12;

  g.userData.armL = armL; g.userData.armR = armR;
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.head = headGroup; g.userData.torso = torsoGroup;
  g.userData.skinColor = skinColor; g.userData.shirtColor = shirtColor;
  g.userData.pantsColor = pantsColor; g.userData.bodyType = bodyType;
  return g;
}

let groanTimer = 0;

function spawnZombie() {
  const cave = caves[Math.floor(Math.random() * caves.length)];
  const toCenterX = -cave.x;
  const toCenterZ = -cave.z;
  const len = Math.sqrt(toCenterX * toCenterX + toCenterZ * toCenterZ) || 1;
  const dirX = toCenterX / len;
  const dirZ = toCenterZ / len;
  const offsetBack = 0.8 + Math.random() * 0.8;
  const offsetSide = (Math.random() - 0.5) * 1.6;
  const x = cave.x + dirX * offsetBack + (-dirZ) * offsetSide;
  const z = cave.z + dirZ * offsetBack + (dirX) * offsetSide;

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
    p.mesh.rotation.x += dt * 8;
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
  applyTorque(tor) { this.angularVelocity.addScaledVector(tor, 1 / this.mass); }
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
// RAGDOLL
// ============================================================
const ragdolls = [];
class Ragdoll {
  constructor(zombieMesh, hitDir, hitStrength, missingParts) {
    zombieMesh.updateMatrixWorld(true);
    this.pieces = [];
    this.startTime = performance.now() / 1000;
    this.lastHitTime = this.startTime;
    this.settleStart = 0; this.state = 'falling'; this.fadeProgress = 0;

    const skin = zombieMesh.userData.skinColor;
    const shirt = zombieMesh.userData.shirtColor;
    const pants = zombieMesh.userData.pantsColor;
    const bodyType = zombieMesh.userData.bodyType || BODY_TYPES[1];

    const hitDirN = hitDir.clone(); hitDirN.y = 0; hitDirN.normalize();

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
      piece.applyImpulse(new THREE.Vector3(
        hitDirN.x * baseImpulse + (Math.random() - 0.5) * 2,
        baseImpulse * 0.5 + Math.random() * 1.5,
        hitDirN.z * baseImpulse + (Math.random() - 0.5) * 2
      ));
      piece.applyTorque(new THREE.Vector3(
        (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25
      ));
      this.pieces.push(piece);
    }
    scene.remove(zombieMesh);
  }
  sliceAt(cameraPos, forward3D, range) {
    if (this.state === 'fading' || this.pieces.length <= 1) return false;
    let bestPiece = null, bestIndex = -1, bestScore = -Infinity;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      const toPiece = new THREE.Vector3().subVectors(p.mesh.position, cameraPos);
      const dist = toPiece.length();
      if (dist > range) continue;
      toPiece.normalize();
      const dot = forward3D.dot(toPiece);
      if (dot < CONFIG.ragdoll.sliceDotMin) continue;
      const score = dot - dist * 0.05;
      if (score > bestScore) { bestScore = score; bestPiece = p; bestIndex = i; }
    }
    if (!bestPiece) return false;
    const sliceDir = new THREE.Vector3().subVectors(bestPiece.mesh.position, cameraPos);
    sliceDir.y = 0; sliceDir.normalize();
    bestPiece.settled = false;
    bestPiece.settleTimer = 0;
    bestPiece.life = CONFIG.dismember.limbLife;
    bestPiece.maxLife = CONFIG.dismember.limbLife;
    bestPiece.velocity.set(sliceDir.x * 10 + (Math.random() - 0.5) * 5, 5 + Math.random() * 4, sliceDir.z * 10 + (Math.random() - 0.5) * 5);
    bestPiece.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
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
      const op = Math.max(0, 1 - this.fadeProgress);
      this.pieces.forEach(p => {
        const mats = Array.isArray(p.mesh.material) ? p.mesh.material : [p.mesh.material];
        mats.forEach(m => { m.transparent = true; m.opacity = op; });
      });
      return this.fadeProgress >= 1;
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) this.pieces[i].update(dt);
    const allSettled = this.pieces.length === 0 || this.pieces.every(p => p.settled);
    if (this.state === 'falling') {
      if (allSettled) { this.state = 'settled'; this.settleStart = performance.now() / 1000; }
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
  if (limbKey === 'head') { size = new THREE.Vector3(0.55, 0.55, 0.55); color = ud.skinColor; }
  else if (limbKey === 'armL' || limbKey === 'armR') { size = new THREE.Vector3(bodyType.arm, 0.95, bodyType.arm); color = ud.shirtColor; }
  else { size = new THREE.Vector3(bodyType.leg, 1.0, bodyType.leg); color = ud.pantsColor; }
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
  piece.angularVelocity.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
  flyingLimbs.push(piece);
  spawnBlood(worldPos, dir, 25, true);
}

// ============================================================
// AIM / CRIT / RAYCAST
// ============================================================
function getAimRegion() {
  const pitch = player.pitch;
  if (pitch > 0.15) return 'head';
  if (pitch < -0.25) return 'legs';
  return 'torso';
}
function rollCrit() { return Math.random() < state.critChance; }

function raycastZombie(origin, dir, maxDist) {
  let bestZ = null;
  let bestDist = Infinity;
  for (const z of zombies) {
    if (z.health <= 0) continue;
    const cx = z.mesh.position.x;
    const cz = z.mesh.position.z;
    const halfW = 0.45;
    const minY = 0;
    const maxY = 2.1;
    const minX = cx - halfW, maxX = cx + halfW;
    const minZ = cz - halfW, maxZ = cz + halfW;
    let tMin = 0, tMax = maxDist, hit = true;
    if (Math.abs(dir.x) < 1e-6) {
      if (origin.x < minX || origin.x > maxX) hit = false;
    } else {
      const t1 = (minX - origin.x) / dir.x;
      const t2 = (maxX - origin.x) / dir.x;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }
    if (hit) {
      if (Math.abs(dir.y) < 1e-6) {
        if (origin.y < minY || origin.y > maxY) hit = false;
      } else {
        const t1 = (minY - origin.y) / dir.y;
        const t2 = (maxY - origin.y) / dir.y;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
      }
    }
    if (hit) {
      if (Math.abs(dir.z) < 1e-6) {
        if (origin.z < minZ || origin.z > maxZ) hit = false;
      } else {
        const t1 = (minZ - origin.z) / dir.z;
        const t2 = (maxZ - origin.z) / dir.z;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
      }
    }
    if (hit && tMin <= tMax && tMin >= 0 && tMin < bestDist) {
      bestDist = tMin;
      bestZ = z;
    }
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

function damageZombie(z, damage, isCrit, aimRegion, hitDir) {
  z.health -= damage;
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
  Sfx.playKnifeHitFlesh();
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
    state.coins += Math.round(CONFIG.zombie.coinReward * state.coinMult);
    state.xp += Math.round(CONFIG.zombie.xpReward * state.xpMult);
    if (state.lifesteal > 0) state.health = Math.min(state.maxHealth, state.health + state.lifesteal);
    checkLevelUp();
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

function attack() {
  const now = performance.now() / 1000;
  const weaponId = state.inventory[state.currentSlot] || 'knife';
  const weapon = WEAPONS[weaponId];
  const cooldown = weapon.cooldown / state.attackSpeedMult;
  if (now - state.lastAttackTime < cooldown) return;
  state.lastAttackTime = now;

  if (weapon.type === 'ranged' && weapon.ammo !== null) {
    if (weapon.ammo <= 0) return;
    weapon.ammo--;
    updateHUD();
  }

  // SOM ÚNICO POR ARMA
  if (weapon.type === 'melee') {
    Sfx.playKnifeSwing();
  } else if (weaponId === 'pistol') {
    Sfx.playPistol();
  } else if (weaponId === 'revolver') {
    Sfx.playRevolver();
  } else if (weaponId === 'smg') {
    Sfx.playSMG();
  } else if (weaponId === 'rifle') {
    Sfx.playRifle();
  } else if (weaponId === 'shotgun') {
    Sfx.playShotgun();
  } else if (weaponId === 'launcher') {
    Sfx.playLauncher();
  }

  triggerSwing();
  if (weapon.type === 'ranged') spawnMuzzleFlash();

  const aimRegion = getAimRegion();

  if (weapon.type === 'melee') {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const range = weapon.range + state.rangeBonus;
    const snapshot = [...zombies];
    snapshot.forEach(z => {
      if (z.health <= 0) return;
      const toZ = new THREE.Vector3().subVectors(z.mesh.position, player.position);
      toZ.y = 0;
      if (toZ.length() > range) return;
      toZ.normalize();
      if (forward.dot(toZ) < 0.4) return;
      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult;
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const dmg = isCrit ? baseDmg * critMult : baseDmg;
      damageZombie(z, dmg, isCrit, aimRegion, toZ.clone());
    });
    const camPos = camera.position.clone();
    let sliced = false;
    for (const r of ragdolls) {
      if (sliced) break;
      if (r.sliceAt(camPos, forward, CONFIG.ragdoll.sliceRange)) {
        sliced = true;
        Sfx.playKnifeHitFlesh();
        showHitMarker(false);
      }
    }
    return;
  }

  // ARMA DE FOGO
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
      const baseDmg = weapon.damage * state.damageMult;
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const dmg = isCrit ? baseDmg * critMult : baseDmg;
      const hitDir = dir.clone(); hitDir.y = 0; hitDir.normalize();
      damageZombie(result.zombie, dmg, isCrit, aimRegion, hitDir);
    } else {
      const endPoint = origin.clone().addScaledVector(dir, range);
      spawnTracer(origin.clone().addScaledVector(dir, 0.8), endPoint);
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
  const count = Math.min(CONFIG.wave.baseZombies + (state.wave - 1) * CONFIG.wave.zombiesPerWave, CONFIG.wave.maxZombies);
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
// TROCA DE ARMA
// ============================================================
function switchToSlot(slot) {
  if (!state.inventory[slot]) return;
  if (state.currentSlot === slot) return;
  state.currentSlot = slot;
  buildViewModel(state.inventory[slot]);
  updateHUD();
  updateWeaponSlotsHUD();
}

function updateWeaponSlotsHUD() {
  const slots = document.querySelectorAll('#weapon-slots .slot');
  slots.forEach(el => {
    const slot = parseInt(el.dataset.slot);
    const hasWeapon = !!state.inventory[slot];
    el.classList.toggle('empty', !hasWeapon);
    el.classList.toggle('active', state.currentSlot === slot);
    const nameEl = el.querySelector('.slot-name');
    if (hasWeapon) {
      const w = WEAPONS[state.inventory[slot]];
      nameEl.textContent = w.name;
    } else {
      nameEl.textContent = '-';
    }
  });
}

// ============================================================
// CONTROLES
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
    const minDist = CONFIG.player.radius + CONFIG.zombie.radius;
    if (d2 < minDist * minDist && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const overlap = minDist - d;
      const nx = dx / d;
      const nz = dz / d;
      player.position.x += nx * overlap * 0.5;
      player.position.z += nz * overlap * 0.5;
      z.mesh.position.x -= nx * overlap * 0.5;
      z.mesh.position.z -= nz * overlap * 0.5;
    }
  }
}

function resolveZombieWallCollision(z) {
  const pos = z.mesh.position;
  for (const box of world.wallColliders) {
    const r = circleVsAABB(pos.x, pos.z, CONFIG.zombie.radius, box);
    if (r) { pos.x = r.x; pos.z = r.z; }
  }
  for (const box of world.furnitureColliders) {
    const r = circleVsAABB(pos.x, pos.z, CONFIG.zombie.radius, box);
    if (r) { pos.x = r.x; pos.z = r.z; }
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
      const legSwing = Math.sin(z.walkPhase) * 0.6;
      if (legLAvailable) z.mesh.userData.legL.rotation.x = legSwing;
      if (legRAvailable) z.mesh.userData.legR.rotation.x = -legSwing;
      const isReaching = dist < 3.5;
      if (armLAvailable) {
        const target = isReaching ? -1.5 + Math.sin(z.walkPhase) * 0.08 : -legSwing * 0.7;
        const cur = z.mesh.userData.armL.rotation.x;
        z.mesh.userData.armL.rotation.x = cur + (target - cur) * 0.15;
      }
      if (armRAvailable) {
        const target = isReaching ? -1.5 + Math.cos(z.walkPhase) * 0.08 : legSwing * 0.7;
        const cur = z.mesh.userData.armR.rotation.x;
        z.mesh.userData.armR.rotation.x = cur + (target - cur) * 0.15;
      }
      if (z.mesh.userData.head) {
        z.mesh.userData.head.rotation.z = Math.sin(z.walkPhase * 0.5) * 0.08;
        z.mesh.userData.head.rotation.y = Math.sin(z.walkPhase * 0.3) * 0.1;
      }
      const targetLean = isWounded ? 0.20 + (dist < 3 ? 0.10 : 0) : 0.12 + (dist < 3 ? 0.08 : 0);
      z.mesh.rotation.x += (targetLean - z.mesh.rotation.x) * 0.05;
      if (isWounded) z.mesh.rotation.z = Math.sin(z.walkPhase * 0.5) * 0.15;
      else z.mesh.rotation.z *= 0.9;
    }

    if (z.dismembered.head) { z.health = 0; return; }

    if (emergeFactor >= 0.5) {
      const zombieSpeed = CONFIG.zombie.speed * (isWounded ? 0.6 : 1);
      if (!staggering && dist > CONFIG.zombie.attackRange) {
        toP.normalize();
        z.mesh.position.addScaledVector(toP, zombieSpeed * dt);
      } else if (!staggering && now - z.lastAttackTime > CONFIG.zombie.attackCooldown) {
        z.lastAttackTime = now;
        const dmg = CONFIG.zombie.damage * (1 - state.damageReduction);
        state.health -= dmg;
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
        a.mesh.position.x -= nx * push;
        a.mesh.position.z -= nz * push;
        b.mesh.position.x += nx * push;
        b.mesh.position.z += nz * push;
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
    const targetAngle = shouldOpen ? -Math.PI / 2 : 0;
    door.currentAngle += (targetAngle - door.currentAngle) * Math.min(1, dt * 6);
    door.group.rotation.y = door.currentAngle;
  }
}

let nearWeapon = null;
const promptEl = document.getElementById('prompt');
const promptText = document.getElementById('prompt-text');

function spawnWeaponPickup(weaponId, x, z, y = 0.9) {
  const w = WEAPONS[weaponId];
  const geo = new THREE.BoxGeometry(0.3, 0.15, 0.6);
  const mat = new THREE.MeshLambertMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.random() * Math.PI * 2;
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
  const weaponPool = ['pistol', 'pistol', 'smg', 'shotgun', 'revolver', 'rifle', 'launcher'];
  const shuffled = [...weaponPool].sort(() => Math.random() - 0.5);
  houses.forEach((h, i) => {
    const weaponId = shuffled[i % shuffled.length];
    spawnWeaponPickup(weaponId, h.x, h.z + 0.5, 0.95);
  });
}

function updateWeaponPickups(dt) {
  const t = performance.now() / 1000;
  world.weaponSpots.forEach(spot => {
    if (spot.bought) return;
    spot.mesh.rotation.y += dt * 1.5;
    spot.mesh.position.y = spot.baseY + Math.sin(t * 2) * 0.08;
    spot.ring.rotation.z += dt * 2;
    spot.ring.position.y = spot.mesh.position.y + 0.1;
  });

  let closest = null;
  let closestDist = 2.0;
  world.weaponSpots.forEach(spot => {
    if (spot.bought) return;
    const dx = player.position.x - spot.x;
    const dz = player.position.z - spot.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < closestDist) {
      closestDist = d;
      closest = spot;
    }
  });

  nearWeapon = closest;

  if (closest) {
    const w = WEAPONS[closest.weaponId];
    const canAfford = state.coins >= w.cost;
    const color = canAfford ? '#ffdd00' : '#ff4444';
    promptEl.classList.remove('hidden');
    promptText.innerHTML = `Comprar <span style="color:${color}">${w.name}</span> — <span style="color:${color}">$${w.cost}</span>`;
  } else {
    promptEl.classList.add('hidden');
  }
}

function tryBuyWeapon() {
  if (!nearWeapon || nearWeapon.bought) return;
  const w = WEAPONS[nearWeapon.weaponId];
  if (state.coins < w.cost) {
    Sfx.playPlayerHurt();
    return;
  }
  state.coins -= w.cost;
  const slot = w.slot;
  state.inventory[slot] = nearWeapon.weaponId;
  nearWeapon.bought = true;
  scene.remove(nearWeapon.mesh);
  scene.remove(nearWeapon.ring);
  nearWeapon.mesh.geometry.dispose();
  nearWeapon.mesh.material.dispose();
  nearWeapon.ring.geometry.dispose();
  nearWeapon.ring.material.dispose();
  if (state.currentSlot === slot) {
    buildViewModel(nearWeapon.weaponId);
  } else {
    switchToSlot(slot);
  }
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
    const min = Math.floor(elapsed / 60);
    const sec = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `${min}:${sec}`;
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
  if (w.ammo === null) {
    ammoEl.textContent = '∞';
  } else {
    ammoEl.textContent = w.ammo + ' / ' + w.maxAmmo;
    ammoEl.style.color = w.ammo <= 0 ? '#ff4444' : '#fff';
  }
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

  world.weaponSpots.forEach(spot => {
    scene.remove(spot.mesh);
    scene.remove(spot.ring);
    spot.mesh.geometry.dispose();
    spot.mesh.material.dispose();
    spot.ring.geometry.dispose();
    spot.ring.material.dispose();
  });
  world.weaponSpots = [];
  Object.values(WEAPONS).forEach(w => {
    if (w.maxAmmo !== null) w.ammo = w.maxAmmo;
  });
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
