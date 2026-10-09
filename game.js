import * as THREE from 'three';
import * as Textures from './textures.js';
import { buildWorld } from './scenery.js';
import * as Sfx from './audio.js';
import * as bus from './src/core/bus.js';
import { Ev } from './src/core/events.js';
import { nextId } from './src/core/ids.js';
import { LocalAdapter } from './src/net/adapter.js';

// Em single-player usa LocalAdapter (no-op). Em MP: trocar por MultiplayerAdapter.
bus.setAdapter(new LocalAdapter());
// Descomente para debug de eventos no console:
// bus.setDebug(true);
// bus.onAny((t, p) => console.log('[EVT]', t, p));

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
  ragdoll: { maxActive: 6, settleTime: 20, fadeDuration: 1.5, impactImpulse: 10, sliceRange: 3.5, sliceDotMin: 0.25 },
  crit: { baseChance: 0.15, damageMultiplier: 2 },
  dismember: { headChance: 0.65, armChance: 0.50, legChance: 0.40, limbSpeed: 16, limbLife: 12 },
  headshotMultiplier: 2.5,
  shake: { hit: 0.05, kill: 0.12, shoot: 0.03 },
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
  aiming: false,
  shake: 0,
};

const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xC5E0F5, 60, 160);
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, CONFIG.player.height, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
container.appendChild(renderer.domElement);

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(200, 32, 16),
  new THREE.MeshBasicMaterial({ map: Textures.skyTexture(), side: THREE.BackSide, fog: false })
));

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.001;
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
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz, 2, 2, 2), mat || rockMat);
    m.position.set(px, py, pz);
    m.receiveShadow = true;
    g.add(m);
  }
  rock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(-0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0, 3.6, 0.2, 3.6, 0.9, 2.0, rockMat);
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
// TEXTURA DA CAMISA PT
// ============================================================
function createPTShirtTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const cx = 128, cy = 128, outerR = 100, innerR = 40;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 === 0) ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.fillStyle = '#CC0000';
  ctx.font = 'bold 60px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PT', cx, cy + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.transparent = true;
  return tex;
}

const PT_SHIRT_TEXTURE = createPTShirtTexture();
const PT_DECAL_MAT = new THREE.MeshBasicMaterial({
  map: PT_SHIRT_TEXTURE, transparent: true, depthWrite: false,
  side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4,
});

// ============================================================
// VIEWMODELS
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
};

function buildViewModel(weaponId) {
  if (currentViewModel) {
    weaponGroup.remove(currentViewModel);
    currentViewModel.traverse(c => { if (c.geometry) c.geometry.dispose(); });
    currentViewModel = null;
  }
  const g = new THREE.Group();

  if (weaponId === 'knife') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.20, 0.06), MAT.grip));
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.02, 0.065), MAT.metalDark);
      ring.position.y = -0.07 + i * 0.05; g.add(ring);
    }
    const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.075), MAT.metalLight);
    pommel.position.set(0, -0.12, 0); g.add(pommel);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.09), MAT.metalDark);
    guard.position.set(0, 0.11, 0); g.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.015), MAT.metalSteel);
    blade.position.set(0, 0.37, 0); g.add(blade);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.46, 0.016), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
    edge.position.set(-0.024, 0.37, 0); g.add(edge);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), MAT.metalSteel);
    tip.rotation.y = Math.PI / 4; tip.position.set(0, 0.65, 0); g.add(tip);
  } else if (weaponId === 'pistol') {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.30), MAT.metalMid);
    s.position.set(0, 0.06, -0.06); g.add(s);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.28), MAT.metalDark);
    st.position.set(0, 0.11, -0.06); g.add(st);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 8), MAT.metalDark);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.06, -0.24); g.add(bar);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.08), MAT.grip);
    grip.position.set(0, -0.07, 0.06); grip.rotation.x = 0.28; g.add(grip);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.02), MAT.metalDark);
    rear.position.set(0, 0.13, 0.07); g.add(rear);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.015), MAT.metalDark);
    front.position.set(0, 0.13, -0.20); g.add(front);
  } else if (weaponId === 'revolver') {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), MAT.metalMid);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.055, -0.16); g.add(bar);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.10, 10), MAT.metalDark);
    cyl.rotation.x = Math.PI / 2; cyl.position.set(0, 0.045, 0); g.add(cyl);
    for (let i = 0; i < 6; i++) {
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.102, 5), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      ch.rotation.x = Math.PI / 2;
      const a = (i / 6) * Math.PI * 2;
      ch.position.set(Math.cos(a) * 0.028, 0.045 + Math.sin(a) * 0.028, 0);
      g.add(ch);
    }
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.16), MAT.metalMid);
    fr.position.set(0, 0.04, -0.02); g.add(fr);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.09), MAT.wood);
    grip.position.set(0, -0.08, 0.08); grip.rotation.x = 0.32; g.add(grip);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.03), MAT.metalDark);
    hammer.position.set(0, 0.09, 0.08); g.add(hammer);
    const tg = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 10, Math.PI), MAT.metalDark);
    tg.rotation.z = Math.PI; tg.position.set(0, -0.02, 0.03); g.add(tg);
  } else if (weaponId === 'smg') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.36), MAT.metalMid);
    b.position.set(0, 0.04, -0.06); g.add(b);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), MAT.metalDark);
    sh.rotation.x = Math.PI / 2; sh.position.set(0, 0.04, -0.30); g.add(sh);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.06), MAT.metalDark);
    mag.position.set(0, -0.10, 0.04); mag.rotation.x = 0.15; g.add(mag);
    const fg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.10, 0.05), MAT.grip);
    fg.position.set(0, -0.06, -0.17); g.add(fg);
    const rg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.06), MAT.grip);
    rg.position.set(0, -0.07, 0.10); rg.rotation.x = 0.22; g.add(rg);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.10), MAT.metalDark);
    st.position.set(0, 0.03, 0.20); g.add(st);
  } else if (weaponId === 'rifle') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.55), MAT.metalMid);
    b.position.set(0, 0.035, -0.12); g.add(b);
    const hg = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.20), MAT.metalDark);
    hg.position.set(0, 0.035, -0.35); g.add(hg);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), MAT.metalDark);
    bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.035, -0.55); g.add(bar);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.07), MAT.metalDark);
    mag.position.set(0, -0.10, 0.02); mag.rotation.x = 0.15; g.add(mag);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.10, 0.20), MAT.wood);
    st.position.set(0, 0.005, 0.24); g.add(st);
    const rg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.05), MAT.wood);
    rg.position.set(0, -0.06, 0.12); rg.rotation.x = 0.2; g.add(rg);
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), MAT.metalDark);
    sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.14, -0.05); g.add(sc);
    const sfr = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 10), MAT.metalDark);
    sfr.rotation.x = Math.PI / 2; sfr.position.set(0, 0.14, -0.17); g.add(sfr);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), new THREE.MeshBasicMaterial({ color: 0x4A90D9 }));
    lens.rotation.y = Math.PI; lens.position.set(0, 0.14, -0.185); g.add(lens);
  } else if (weaponId === 'shotgun') {
    const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), MAT.metalDark);
    b1.rotation.x = Math.PI / 2; b1.position.set(-0.022, 0.045, -0.24); g.add(b1);
    const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 10), MAT.metalDark);
    b2.rotation.x = Math.PI / 2; b2.position.set(0.022, 0.045, -0.24); g.add(b2);
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 8), MAT.metalMid);
    mag.rotation.x = Math.PI / 2; mag.position.set(0, -0.02, -0.22); g.add(mag);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.12), MAT.wood);
    pump.position.set(0, -0.02, -0.18); g.add(pump);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.22), MAT.wood);
    st.position.set(0, 0.01, 0.22); g.add(st);
    const rg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), MAT.wood);
    rg.position.set(0, -0.07, 0.10); rg.rotation.x = 0.18; g.add(rg);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.025), MAT.metalDark);
    hammer.position.set(0, 0.09, 0.14); g.add(hammer);
  } else if (weaponId === 'launcher') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.75, 12), MAT.metalMid);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.03, -0.12); g.add(tube);
    const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.03, 12), MAT.metalDark);
    r1.rotation.x = Math.PI / 2; r1.position.set(0, 0.03, -0.30); g.add(r1);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.062, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mouth.rotation.y = Math.PI; mouth.position.set(0, 0.03, -0.49); g.add(mouth);
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.083, 0.025, 12), MAT.accent);
    s1.rotation.x = Math.PI / 2; s1.position.set(0, 0.03, -0.40); g.add(s1);
    const fg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), MAT.grip);
    fg.position.set(0, -0.10, -0.20); g.add(fg);
    const rg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), MAT.grip);
    rg.position.set(0, -0.11, 0.15); rg.rotation.x = 0.15; g.add(rg);
    const sB = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.08), MAT.metalDark);
    sB.position.set(0, 0.10, 0.05); g.add(sB);
    const sR = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 10), MAT.metalDark);
    sR.rotation.y = Math.PI / 2; sR.position.set(0, 0.15, 0.05); g.add(sR);
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
  if (!currentViewModel) return;

  if (swinging) {
    swingProgress += dt * 5;
    if (swingProgress >= 1) { swinging = false; swingProgress = 0; }
    else {
      const arc = Math.sin(swingProgress * Math.PI);
      currentViewModel.position.set(0.32 - arc * 0.35, -0.32 + arc * 0.12, -0.6 - arc * 0.15);
      currentViewModel.rotation.set(-0.15 - arc * 0.5, -0.35 + arc * 0.7, 0.15 - arc * 0.4);
    }
  } else {
    const aiming = state.aiming;
    const baseX = aiming ? 0.02 : 0.32;
    const baseY = aiming ? -0.22 : -0.32;
    const baseZ = aiming ? -0.45 : -0.6;
    const baseRX = aiming ? -0.02 : -0.15;
    const baseRY = aiming ? -0.05 : -0.35;
    const baseRZ = aiming ? 0.02 : 0.15;
    const bob = (state.isMoving && !aiming) ? Math.sin(state.bobTime) * 0.015 : 0;
    const bobX = (state.isMoving && !aiming) ? Math.cos(state.bobTime * 0.5) * 0.01 : 0;
    const speed = Math.min(1, dt * 14);
    currentViewModel.position.x += (baseX + bobX - currentViewModel.position.x) * speed;
    currentViewModel.position.y += (baseY + bob - currentViewModel.position.y) * speed;
    currentViewModel.position.z += (baseZ - currentViewModel.position.z) * speed;
    currentViewModel.rotation.x += (baseRX - currentViewModel.rotation.x) * speed;
    currentViewModel.rotation.y += (baseRY - currentViewModel.rotation.y) * speed;
    currentViewModel.rotation.z += (baseRZ - currentViewModel.rotation.z) * speed;
  }
}

// ============================================================
// PLAYER (com ID único para rede)
// ============================================================
const player = {
  id: nextId('p'),
  position: new THREE.Vector3(0, CONFIG.player.height, 0),
  yaw: 0,
  pitch: 0,
};

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function makeBox(w, h, d, s = 5) { return new THREE.BoxGeometry(w, h, d, s, s, s); }
function makeJoint(r, seg = 10) { return new THREE.SphereGeometry(r, seg, Math.max(6, Math.floor(seg * 0.75))); }

// ============================================================
// AIM REGION
// ============================================================
function getAimRegion() {
  if (player.pitch > 0.15) return 'head';
  if (player.pitch < -0.25) return 'legs';
  return 'torso';
}

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

function resolveCollidersAgainstBoxes(pos, radius, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const box = colliders[i];
    if (pos.x + radius < box.minX || pos.x - radius > box.maxX) continue;
    if (pos.z + radius < box.minZ || pos.z - radius > box.maxZ) continue;
    const r = circleVsAABB(pos.x, pos.z, radius, box);
    if (r) { pos.x = r.x; pos.z = r.z; }
  }
}

function resolveWallCollisions(pos, radius) {
  resolveCollidersAgainstBoxes(pos, radius, world.wallColliders);
  resolveCollidersAgainstBoxes(pos, radius, world.furnitureColliders);
}

// ============================================================
// ZUMBIS
// ============================================================
const zombies = [];
const PANTS_COLORS = [0x8B5A2B, 0x5D4030, 0x3E2723, 0x2C3E50, 0x34495E, 0x1B2631];
const SKIN_COLORS = [0x7BC950, 0x6BB840, 0x8DD65A, 0x5DAE3F, 0x9DE06B];
const HAIR_COLORS = [0x2C1810, 0x1A0F08, 0x4A2818, 0x6B3A1F, 0x3A2A1A];
const SHIRT_RED = 0xCC1111;
const SHIRT_BLACK = 0x1A1A1A;
const BODY_TYPES = [
  { torsoW: 0.55, torsoD: 0.30, arm: 0.18, leg: 0.22, heightScale: 1.05 },
  { torsoW: 0.70, torsoD: 0.35, arm: 0.22, leg: 0.26, heightScale: 1.00 },
  { torsoW: 0.85, torsoD: 0.45, arm: 0.26, leg: 0.30, heightScale: 0.95 },
];

const BONE_MAT = new THREE.MeshLambertMaterial({ color: 0xE8E0D0 });
const BONE_DARK_MAT = new THREE.MeshLambertMaterial({ color: 0xC8BFA8 });
const BONE_DARKER = new THREE.MeshLambertMaterial({ color: 0xA89F88 });

function buildHumanHead(headGroup, skinMat, hairMat, wound, hasHat) {
  const skull = new THREE.Mesh(makeBox(0.55, 0.55, 0.55, 5), skinMat);
  skull.castShadow = true;
  headGroup.add(skull);
  const hair = new THREE.Mesh(makeBox(0.58, 0.10, 0.58, 3), hairMat);
  hair.position.y = 0.30; headGroup.add(hair);
  const fringe = new THREE.Mesh(makeBox(0.58, 0.14, 0.08, 3), hairMat);
  fringe.position.set(0, 0.24, 0.28); headGroup.add(fringe);
  const earGeo = makeBox(0.06, 0.14, 0.10, 2);
  const earL = new THREE.Mesh(earGeo, skinMat); earL.position.set(-0.31, 0, 0); headGroup.add(earL);
  const earR = new THREE.Mesh(earGeo, skinMat); earR.position.set(0.31, 0, 0); headGroup.add(earR);
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeGeo = makeBox(0.13, 0.11, 0.02, 2);
  const eL = new THREE.Mesh(eyeGeo, eyeW); eL.position.set(-0.13, 0.08, 0.285); headGroup.add(eL);
  const eR = new THREE.Mesh(eyeGeo, eyeW); eR.position.set(0.13, 0.08, 0.285); headGroup.add(eR);
  const pupGeo = makeBox(0.05, 0.05, 0.02, 2);
  const pL = new THREE.Mesh(pupGeo, pupil); pL.position.set(-0.13, 0.08, 0.295); headGroup.add(pL);
  const pR = new THREE.Mesh(pupGeo, pupil); pR.position.set(0.13, 0.08, 0.295); headGroup.add(pR);
  const browGeo = makeBox(0.14, 0.02, 0.02, 2);
  const bL = new THREE.Mesh(browGeo, hairMat); bL.position.set(-0.13, 0.16, 0.29); headGroup.add(bL);
  const bR = new THREE.Mesh(browGeo, hairMat); bR.position.set(0.13, 0.16, 0.29); headGroup.add(bR);
  const nose = new THREE.Mesh(makeBox(0.08, 0.08, 0.06, 3), skinMat);
  nose.position.set(0, -0.02, 0.30); headGroup.add(nose);
  const mouth = new THREE.Mesh(makeBox(0.20, 0.06, 0.02, 2), new THREE.MeshBasicMaterial({ color: 0x2B0000 }));
  mouth.position.set(0, -0.14, 0.285); headGroup.add(mouth);
  const teethGeo = makeBox(0.025, 0.03, 0.02, 1);
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(teethGeo, new THREE.MeshBasicMaterial({ color: 0xE8E0D0 }));
    t.position.set(-0.08 + i * 0.04, -0.12, 0.292);
    headGroup.add(t);
  }
  const woundHead = new THREE.Mesh(makeBox(0.12, 0.06, 0.02, 2), wound);
  woundHead.position.set(-0.15, 0.16, 0.285); headGroup.add(woundHead);
  if (hasHat) {
    const hatGroup = new THREE.Group();
    hatGroup.add(new THREE.Mesh(makeBox(0.65, 0.05, 0.65, 3), MAT.metalMid));
    const hatTop = new THREE.Mesh(makeBox(0.45, 0.25, 0.45, 3), MAT.metalDark);
    hatTop.position.y = 0.15; hatGroup.add(hatTop);
    hatGroup.position.y = 0.34; headGroup.add(hatGroup);
  }
}

function buildDonkeyHead(headGroup, skinMat, wound) {
  const donkeySkinMat = new THREE.MeshLambertMaterial({ color: 0x9E8B7A });
  const donkeyDarkMat = new THREE.MeshLambertMaterial({ color: 0x6B5D4F });
  const muzzleMat = new THREE.MeshLambertMaterial({ color: 0xB8A796 });
  const skull = new THREE.Mesh(makeBox(0.55, 0.55, 0.55, 5), donkeySkinMat);
  skull.castShadow = true;
  headGroup.add(skull);
  const muzzle = new THREE.Mesh(makeBox(0.32, 0.28, 0.35, 4), muzzleMat);
  muzzle.position.set(0, -0.08, 0.42); muzzle.castShadow = true;
  headGroup.add(muzzle);
  const nostrilMat = new THREE.MeshBasicMaterial({ color: 0x2A1F1A });
  const nL = new THREE.Mesh(makeBox(0.05, 0.04, 0.02, 1), nostrilMat);
  nL.position.set(-0.08, -0.02, 0.60); headGroup.add(nL);
  const nR = new THREE.Mesh(makeBox(0.05, 0.04, 0.02, 1), nostrilMat);
  nR.position.set(0.08, -0.02, 0.60); headGroup.add(nR);
  const mouth = new THREE.Mesh(makeBox(0.24, 0.05, 0.02, 2), new THREE.MeshBasicMaterial({ color: 0x2B0000 }));
  mouth.position.set(0, -0.20, 0.60); headGroup.add(mouth);
  const teethGeo = makeBox(0.03, 0.04, 0.02, 1);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(teethGeo, new THREE.MeshBasicMaterial({ color: 0xE8E0D0 }));
    t.position.set(-0.075 + i * 0.05, -0.18, 0.60);
    headGroup.add(t);
  }
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeGeo = makeBox(0.10, 0.10, 0.02, 2);
  const eL = new THREE.Mesh(eyeGeo, eyeW); eL.position.set(-0.20, 0.10, 0.28); headGroup.add(eL);
  const eR = new THREE.Mesh(eyeGeo, eyeW); eR.position.set(0.20, 0.10, 0.28); headGroup.add(eR);
  const pupGeo = makeBox(0.05, 0.05, 0.02, 2);
  const pL = new THREE.Mesh(pupGeo, pupil); pL.position.set(-0.20, 0.10, 0.29); headGroup.add(pL);
  const pR = new THREE.Mesh(pupGeo, pupil); pR.position.set(0.20, 0.10, 0.29); headGroup.add(pR);
  function makeEar(side) {
    const ear = new THREE.Group();
    const base = new THREE.Mesh(makeBox(0.10, 0.25, 0.10, 2), donkeySkinMat);
    base.position.y = 0.15; base.castShadow = true; ear.add(base);
    const mid = new THREE.Mesh(makeBox(0.09, 0.20, 0.09, 2), donkeySkinMat);
    mid.position.y = 0.38; mid.rotation.z = side * 0.15; ear.add(mid);
    const tip = new THREE.Mesh(makeBox(0.08, 0.12, 0.08, 2), donkeyDarkMat);
    tip.position.y = 0.55; tip.rotation.z = side * 0.2; ear.add(tip);
    const innerMat = new THREE.MeshLambertMaterial({ color: 0xE8B8B0 });
    const inner = new THREE.Mesh(makeBox(0.05, 0.20, 0.02, 1), innerMat);
    inner.position.set(0, 0.25, 0.06); ear.add(inner);
    return ear;
  }
  const earL = makeEar(-1);
  earL.position.set(-0.18, 0.28, 0); earL.rotation.z = 0.25; earL.rotation.x = -0.15;
  headGroup.add(earL);
  const earR = makeEar(1);
  earR.position.set(0.18, 0.28, 0); earR.rotation.z = -0.25; earR.rotation.x = -0.15;
  headGroup.add(earR);
  const maneMat = new THREE.MeshLambertMaterial({ color: 0x3A2A1A });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(makeBox(0.06, 0.12, 0.06, 1), maneMat);
    m.position.set(0, 0.32 + i * 0.08, -0.05);
    headGroup.add(m);
  }
  const woundHead = new THREE.Mesh(makeBox(0.14, 0.08, 0.02, 2), wound);
  woundHead.position.set(-0.20, 0.22, 0.24); headGroup.add(woundHead);
}

function buildJudgeHead(headGroup, skinMat, wound) {
  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), skinMat);
  headSphere.castShadow = true;
  headGroup.add(headSphere);
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eyeGeo = makeBox(0.11, 0.10, 0.02, 2);
  const eL = new THREE.Mesh(eyeGeo, eyeW); eL.position.set(-0.13, 0.06, 0.30); headGroup.add(eL);
  const eR = new THREE.Mesh(eyeGeo, eyeW); eR.position.set(0.13, 0.06, 0.30); headGroup.add(eR);
  const pupGeo = makeBox(0.05, 0.05, 0.02, 2);
  const pL = new THREE.Mesh(pupGeo, pupil); pL.position.set(-0.13, 0.06, 0.31); headGroup.add(pL);
  const pR = new THREE.Mesh(pupGeo, pupil); pR.position.set(0.13, 0.06, 0.31); headGroup.add(pR);
  const browMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  const browGeo = makeBox(0.14, 0.03, 0.02, 2);
  const bL = new THREE.Mesh(browGeo, browMat); bL.position.set(-0.13, 0.15, 0.30); headGroup.add(bL);
  const bR = new THREE.Mesh(browGeo, browMat); bR.position.set(0.13, 0.15, 0.30); headGroup.add(bR);
  const nose = new THREE.Mesh(makeBox(0.08, 0.07, 0.06, 3), skinMat);
  nose.position.set(0, -0.02, 0.31); headGroup.add(nose);
  const mustache = new THREE.Mesh(makeBox(0.24, 0.05, 0.03, 2), browMat);
  mustache.position.set(0, -0.10, 0.30); headGroup.add(mustache);
  const chinBeard = new THREE.Mesh(makeBox(0.20, 0.10, 0.04, 2), browMat);
  chinBeard.position.set(0, -0.22, 0.28); headGroup.add(chinBeard);
  const mouth = new THREE.Mesh(makeBox(0.20, 0.05, 0.02, 2), new THREE.MeshBasicMaterial({ color: 0x2B0000 }));
  mouth.position.set(0, -0.15, 0.31); headGroup.add(mouth);
  const woundHead = new THREE.Mesh(makeBox(0.12, 0.06, 0.02, 2), wound);
  woundHead.position.set(-0.10, 0.20, 0.26); headGroup.add(woundHead);
}

function buildJudgeOutfit(torsoGroup, body, woundMat) {
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xF5F5F5 });
  const collarL = new THREE.Mesh(makeBox(0.15, 0.20, 0.04, 2), whiteMat);
  collarL.position.set(-0.12, 0.30, body.torsoD / 2 + 0.008);
  collarL.rotation.z = 0.5;
  torsoGroup.add(collarL);
  const collarR = new THREE.Mesh(makeBox(0.15, 0.20, 0.04, 2), whiteMat);
  collarR.position.set(0.12, 0.30, body.torsoD / 2 + 0.008);
  collarR.rotation.z = -0.5;
  torsoGroup.add(collarR);
  const tieMat = new THREE.MeshLambertMaterial({ color: 0xCC1111 });
  const tie = new THREE.Mesh(makeBox(0.06, 0.35, 0.02, 1), tieMat);
  tie.position.set(0, 0.10, body.torsoD / 2 + 0.012);
  torsoGroup.add(tie);
}

function computePartLocalBox(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Matrix4();
  group.traverse(c => {
    if (c.isMesh && c.geometry) {
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const b = c.geometry.boundingBox.clone();
      tmp.multiplyMatrices(inv, c.matrixWorld);
      b.applyMatrix4(tmp);
      box.union(b);
    }
  });
  return box;
}

function createZombieMesh() {
  const g = new THREE.Group();
  const skinColor = rand(SKIN_COLORS);
  const pantsColor = rand(PANTS_COLORS);
  const hairColor = rand(HAIR_COLORS);
  const body = rand(BODY_TYPES);

  const typeRoll = Math.random();
  let zombieType;
  if (typeRoll < 0.40) zombieType = 'pt';
  else if (typeRoll < 0.70) zombieType = 'pt_donkey';
  else zombieType = 'judge';

  const skinMat = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirtMat = new THREE.MeshLambertMaterial({ color: zombieType === 'judge' ? SHIRT_BLACK : SHIRT_RED });
  const pantsMat = new THREE.MeshLambertMaterial({ color: zombieType === 'judge' ? 0x1A1A1A : pantsColor });
  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1A1A1A });
  const wound = new THREE.MeshBasicMaterial({ color: 0xC0392B });

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.85;

  if (zombieType === 'pt') buildHumanHead(headGroup, skinMat, hairMat, wound, Math.random() > 0.7);
  else if (zombieType === 'pt_donkey') buildDonkeyHead(headGroup, skinMat, wound);
  else buildJudgeHead(headGroup, skinMat, wound);

  const skullBone = new THREE.Mesh(makeBox(0.48, 0.48, 0.48, 4), BONE_MAT);
  skullBone.visible = false; headGroup.add(skullBone);
  const jawBone = new THREE.Mesh(makeBox(0.38, 0.14, 0.38, 3), BONE_DARK_MAT);
  jawBone.position.set(0, -0.22, 0.04); jawBone.visible = false; headGroup.add(jawBone);
  const socketMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const sockGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const sk1 = new THREE.Mesh(sockGeo, socketMat);
  sk1.position.set(-0.13, 0.08, 0.24); sk1.visible = false; headGroup.add(sk1);
  const sk2 = new THREE.Mesh(sockGeo, socketMat);
  sk2.position.set(0.13, 0.08, 0.24); sk2.visible = false; headGroup.add(sk2);
  const skTeethGeo = makeBox(0.025, 0.04, 0.02, 1);
  const skTeeth = [];
  for (let i = 0; i < 5; i++) {
    const t = new THREE.Mesh(skTeethGeo, BONE_MAT);
    t.position.set(-0.09 + i * 0.045, -0.18, 0.22);
    t.visible = false;
    headGroup.add(t);
    skTeeth.push(t);
  }
  g.add(headGroup);

  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 1.15;
  const torso = new THREE.Mesh(makeBox(body.torsoW, 0.85, body.torsoD, 5), shirtMat);
  torso.castShadow = true;
  torsoGroup.add(torso);

  if (zombieType === 'pt' || zombieType === 'pt_donkey') {
    const decalW = body.torsoW * 0.85;
    const decalH = 0.65;
    const decalGeo = new THREE.PlaneGeometry(decalW, decalH);
    const decal = new THREE.Mesh(decalGeo, PT_DECAL_MAT);
    decal.position.set(0, 0.02, body.torsoD / 2 + 0.008);
    torsoGroup.add(decal);
  }

  if (zombieType !== 'judge') {
    const collar = new THREE.Mesh(makeBox(body.torsoW * 0.85, 0.06, body.torsoD * 0.9, 3), MAT.metalDark);
    collar.position.y = 0.43; torsoGroup.add(collar);
  } else {
    buildJudgeOutfit(torsoGroup, body, wound);
  }

  const w1 = new THREE.Mesh(makeBox(0.14, 0.10, 0.02, 2), wound);
  w1.position.set(0.15, 0.25, body.torsoD / 2 + 0.01); torsoGroup.add(w1);
  const w2 = new THREE.Mesh(makeBox(0.10, 0.14, 0.02, 2), wound);
  w2.position.set(-0.18, -0.28, body.torsoD / 2 + 0.01); torsoGroup.add(w2);

  const ribCage = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(body.torsoW * 0.42, 0.022, 6, 12, Math.PI), BONE_MAT);
    rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI;
    rib.position.y = 0.30 - i * 0.14; rib.visible = false;
    ribCage.add(rib);
  }
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), BONE_DARK_MAT);
  spine.visible = false; ribCage.add(spine);
  const pelvis = new THREE.Mesh(makeBox(body.torsoW * 0.7, 0.18, body.torsoD * 0.85, 3), BONE_MAT);
  pelvis.position.y = -0.38; pelvis.visible = false; ribCage.add(pelvis);
  torsoGroup.add(ribCage);
  g.add(torsoGroup);

  function makeArm(side) {
    const arm = new THREE.Group();
    const outerMeshes = [], boneMeshes = [];
    const shoulder = new THREE.Mesh(makeJoint(body.arm * 0.55, 8), shirtMat);
    shoulder.castShadow = true; arm.add(shoulder); outerMeshes.push(shoulder);
    const upper = new THREE.Mesh(makeBox(body.arm, 0.42, body.arm, 4), shirtMat);
    upper.position.y = -0.22; upper.castShadow = true;
    arm.add(upper); outerMeshes.push(upper);
    const elbow = new THREE.Mesh(makeJoint(body.arm * 0.45, 8), shirtMat);
    elbow.position.y = -0.46; arm.add(elbow); outerMeshes.push(elbow);
    const lower = new THREE.Mesh(makeBox(body.arm * 0.92, 0.42, body.arm * 0.92, 4), skinMat);
    lower.position.y = -0.68; lower.castShadow = true;
    arm.add(lower); outerMeshes.push(lower);
    const wrist = new THREE.Mesh(makeJoint(body.arm * 0.38, 6), skinMat);
    wrist.position.y = -0.90; arm.add(wrist); outerMeshes.push(wrist);
    const hand = new THREE.Mesh(makeBox(body.arm * 1.05, 0.14, body.arm * 1.15, 3), skinMat);
    hand.position.y = -0.99; hand.castShadow = true;
    arm.add(hand); outerMeshes.push(hand);
    const fingerGeo = makeBox(body.arm * 0.18, 0.13, body.arm * 0.18, 2);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fingerGeo, skinMat);
      f.position.set(-body.arm * 0.36 + i * body.arm * 0.24, -1.11, body.arm * 0.28);
      arm.add(f); outerMeshes.push(f);
    }
    const thumb = new THREE.Mesh(makeBox(body.arm * 0.22, 0.11, body.arm * 0.22, 2), skinMat);
    thumb.position.set(side * body.arm * 0.5, -1.02, body.arm * 0.38);
    arm.add(thumb); outerMeshes.push(thumb);
    const humerus = new THREE.Mesh(new THREE.CylinderGeometry(body.arm * 0.22, body.arm * 0.20, 0.36, 8), BONE_MAT);
    humerus.position.y = -0.22; humerus.visible = false; arm.add(humerus); boneMeshes.push(humerus);
    const humTop = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.30, 8, 8), BONE_MAT);
    humTop.position.y = -0.04; humTop.visible = false; arm.add(humTop); boneMeshes.push(humTop);
    const humBot = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.26, 8, 8), BONE_MAT);
    humBot.position.y = -0.44; humBot.visible = false; arm.add(humBot); boneMeshes.push(humBot);
    const radius = new THREE.Mesh(new THREE.CylinderGeometry(body.arm * 0.18, body.arm * 0.16, 0.38, 8), BONE_MAT);
    radius.position.y = -0.68; radius.visible = false; arm.add(radius); boneMeshes.push(radius);
    const radTop = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.22, 8, 8), BONE_MAT);
    radTop.position.y = -0.48; radTop.visible = false; arm.add(radTop); boneMeshes.push(radTop);
    const radBot = new THREE.Mesh(new THREE.SphereGeometry(body.arm * 0.20, 8, 8), BONE_MAT);
    radBot.position.y = -0.88; radBot.visible = false; arm.add(radBot); boneMeshes.push(radBot);
    const handBone = new THREE.Mesh(makeBox(body.arm * 0.7, 0.10, body.arm * 0.85, 3), BONE_MAT);
    handBone.position.y = -0.99; handBone.visible = false; arm.add(handBone); boneMeshes.push(handBone);
    arm.userData = { outerMeshes, boneMeshes };
    return arm;
  }
  const armL = makeArm(-1); armL.position.set(-body.torsoW / 2 - body.arm / 2 + 0.05, 1.5, 0); g.add(armL);
  const armR = makeArm(1); armR.position.set(body.torsoW / 2 + body.arm / 2 - 0.05, 1.5, 0); g.add(armR);

  function makeLeg() {
    const leg = new THREE.Group();
    const outerMeshes = [], boneMeshes = [];
    const hip = new THREE.Mesh(makeJoint(body.leg * 0.58, 8), pantsMat);
    leg.add(hip); outerMeshes.push(hip);
    const thigh = new THREE.Mesh(makeBox(body.leg, 0.55, body.leg, 4), pantsMat);
    thigh.position.y = -0.30; thigh.castShadow = true;
    leg.add(thigh); outerMeshes.push(thigh);
    const knee = new THREE.Mesh(makeJoint(body.leg * 0.48, 8), pantsMat);
    knee.position.y = -0.60; leg.add(knee); outerMeshes.push(knee);
    const shin = new THREE.Mesh(makeBox(body.leg * 0.9, 0.40, body.leg * 0.9, 4), pantsMat);
    shin.position.y = -0.82; shin.castShadow = true;
    leg.add(shin); outerMeshes.push(shin);
    const ankle = new THREE.Mesh(makeJoint(body.leg * 0.4, 6), shoeMat);
    ankle.position.y = -1.04; leg.add(ankle); outerMeshes.push(ankle);
    const shoe = new THREE.Mesh(makeBox(body.leg * 1.15, 0.14, body.leg * 1.35, 3), shoeMat);
    shoe.position.set(0, -1.12, 0.03); shoe.castShadow = true;
    leg.add(shoe); outerMeshes.push(shoe);
    const tip = new THREE.Mesh(makeBox(body.leg * 1.15, 0.08, body.leg * 0.45, 2), shoeMat);
    tip.position.set(0, -1.14, body.leg * 0.85);
    leg.add(tip); outerMeshes.push(tip);
    const femur = new THREE.Mesh(new THREE.CylinderGeometry(body.leg * 0.22, body.leg * 0.20, 0.50, 8), BONE_MAT);
    femur.position.y = -0.30; femur.visible = false; leg.add(femur); boneMeshes.push(femur);
    const femTop = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.28, 8, 8), BONE_MAT);
    femTop.position.y = -0.05; femTop.visible = false; leg.add(femTop); boneMeshes.push(femTop);
    const femBot = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.26, 8, 8), BONE_MAT);
    femBot.position.y = -0.56; femBot.visible = false; leg.add(femBot); boneMeshes.push(femBot);
    const tibia = new THREE.Mesh(new THREE.CylinderGeometry(body.leg * 0.18, body.leg * 0.16, 0.40, 8), BONE_MAT);
    tibia.position.y = -0.82; tibia.visible = false; leg.add(tibia); boneMeshes.push(tibia);
    const fibula = new THREE.Mesh(new THREE.CylinderGeometry(body.leg * 0.10, body.leg * 0.09, 0.38, 6), BONE_DARK_MAT);
    fibula.position.set(body.leg * 0.12, -0.82, 0); fibula.visible = false; leg.add(fibula); boneMeshes.push(fibula);
    const tibTop = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.20, 8, 8), BONE_MAT);
    tibTop.position.y = -0.62; tibTop.visible = false; leg.add(tibTop); boneMeshes.push(tibTop);
    const tibBot = new THREE.Mesh(new THREE.SphereGeometry(body.leg * 0.18, 8, 8), BONE_MAT);
    tibBot.position.y = -1.02; tibBot.visible = false; leg.add(tibBot); boneMeshes.push(tibBot);
    const footBone = new THREE.Mesh(makeBox(body.leg * 0.8, 0.08, body.leg * 1.1, 3), BONE_DARKER);
    footBone.position.set(0, -1.10, 0.15); footBone.visible = false; leg.add(footBone); boneMeshes.push(footBone);
    leg.userData = { outerMeshes, boneMeshes };
    return leg;
  }
  const legL = makeLeg(); legL.position.set(-body.leg * 0.55, 0.72, 0); g.add(legL);
  const legR = makeLeg(); legR.position.set(body.leg * 0.55, 0.72, 0); g.add(legR);

  g.scale.y = body.heightScale;
  g.rotation.order = 'YXZ';
  g.rotation.x = 0.12;
  g.traverse(c => { c.frustumCulled = false; });

  const localBoxes = {
    head: computePartLocalBox(headGroup),
    torso: computePartLocalBox(torsoGroup),
    armL: computePartLocalBox(armL),
    armR: computePartLocalBox(armR),
    legL: computePartLocalBox(legL),
    legR: computePartLocalBox(legR),
  };

  g.userData = {
    armL, armR, legL, legR,
    head: headGroup, torso: torsoGroup,
    skullBone, jawBone, sk1, sk2, ribCage, skTeeth,
    skinColor, shirtColor: zombieType === 'judge' ? SHIRT_BLACK : SHIRT_RED,
    pantsColor, bodyType: body,
    heightScale: body.heightScale,
    zombieType,
    localBoxes,
  };
  return g;
}

let groanTimer = 0;

function spawnZombie() {
  const cave = caves[Math.floor(Math.random() * caves.length)];
  const toCX = -cave.x, toCZ = -cave.z;
  const len = Math.sqrt(toCX * toCX + toCZ * toCZ) || 1;
  const dirX = toCX / len, dirZ = toCZ / len;
  const back = 0.8 + Math.random() * 0.8;
  const side = (Math.random() - 0.5) * 1.6;
  const spawnX = cave.x + dirX * back + (-dirZ) * side;
  const spawnZ = cave.z + dirZ * back + dirX * side;

  const mesh = createZombieMesh();
  mesh.position.set(spawnX, 0, spawnZ);
  scene.add(mesh);

  const z = {
    id: nextId('z'),
    mesh, health: CONFIG.zombie.maxHealth, maxHealth: CONFIG.zombie.maxHealth,
    lastAttackTime: 0, walkPhase: Math.random() * Math.PI * 2,
    hitReactEndTime: 0, hitDirection: new THREE.Vector3(),
    dismembered: { head: false, armL: false, armR: false, legL: false, legR: false },
    emergeTime: 0,
    recoil: null,
    anim: { armLX: 0, armRX: 0, legLX: 0, legRX: 0, headRZ: 0, headRY: 0, bodyLean: 0.12 },
  };
  zombies.push(z);
  state.zombiesAlive++;

  bus.emit(Ev.ZOMBIE_SPAWNED, {
    id: z.id,
    type: mesh.userData.zombieType,
    pos: { x: mesh.position.x, y: 0, z: mesh.position.z },
  });

  updateHUD();
}

// ============================================================
// SANGUE — POOL DE PARTÍCULAS
// ============================================================
const bloodGeo = new THREE.BoxGeometry(1, 1, 1);
const bloodPool = [];
const bloodActive = [];

function acquireBloodParticle() {
  let p = bloodPool.pop();
  if (!p) {
    p = {
      mesh: new THREE.Mesh(bloodGeo, new THREE.MeshBasicMaterial({ transparent: true })),
      vel: new THREE.Vector3(),
      life: 0, maxLife: 0,
    };
  }
  return p;
}

function spawnBlood(position, direction = null, count = 16, big = false) {
  for (let i = 0; i < count; i++) {
    const p = acquireBloodParticle();
    const size = (big ? 0.16 : 0.09) + Math.random() * 0.12;
    p.mesh.scale.setScalar(size);
    p.mesh.position.copy(position);
    p.mesh.material.color.setHex(Math.random() > 0.4 ? 0xC0392B : 0x8B0000);
    p.mesh.material.opacity = 1;

    if (direction) {
      const dirN = direction.clone().normalize();
      const perp1 = new THREE.Vector3(-dirN.z, 0, dirN.x).normalize();
      const perp2 = new THREE.Vector3().crossVectors(dirN, perp1).normalize();
      const a = (Math.random() - 0.5) * 1.8;
      const b = (Math.random() - 0.5) * 1.8;
      const speed = (big ? 9 : 5) + Math.random() * 6;
      p.vel.copy(dirN).multiplyScalar(speed);
      p.vel.addScaledVector(perp1, a * speed * 0.5);
      p.vel.addScaledVector(perp2, b * speed * 0.5);
      p.vel.y += 3 + Math.random() * 4;
    } else {
      p.vel.set((Math.random() - 0.5) * 8, Math.random() * 5 + 3, (Math.random() - 0.5) * 8);
    }
    p.life = 1.2;
    p.maxLife = 1.2;
    scene.add(p.mesh);
    bloodActive.push(p);
  }
}

function updateParticles(dt) {
  for (let i = bloodActive.length - 1; i >= 0; i--) {
    const p = bloodActive[i];
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
      bloodPool.push(p);
      bloodActive.splice(i, 1);
    }
  }
}

const bloodPools = [];
function spawnBloodPool(position) {
  const size = 0.7 + Math.random() * 0.5;
  const geo = new THREE.CircleGeometry(size, 10);
  const mat = new THREE.MeshBasicMaterial({ color: 0x6B0000, transparent: true, opacity: 0.75, depthWrite: false });
  const pool = new THREE.Mesh(geo, mat);
  pool.rotation.x = -Math.PI / 2;
  pool.rotation.z = Math.random() * Math.PI * 2;
  pool.position.set(position.x, 0.03, position.z);
  pool.renderOrder = 1;
  scene.add(pool);
  bloodPools.push({ mesh: pool, life: 25 });
  if (bloodPools.length > 15) {
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
      this.mesh.traverse(c => {
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(m => { m.transparent = true; m.opacity = op; });
        }
      });
    }
    return false;
  }
  dispose() {
    scene.remove(this.mesh);
    this.mesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(m => m.dispose());
      }
    });
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

    const ud = zombieMesh.userData;
    const bt = ud.bodyType || BODY_TYPES[1];
    const hitDirN = hitDir.clone(); hitDirN.y = 0; hitDirN.normalize();

    const defs = [
      { key: 'torso', obj: ud.torso, size: new THREE.Vector3(bt.torsoW, 0.85, bt.torsoD), mass: 8 },
      { key: 'head', obj: ud.head, size: new THREE.Vector3(0.55, 0.55, 0.55), mass: 2.5 },
      { key: 'armL', obj: ud.armL, size: new THREE.Vector3(bt.arm, 0.95, bt.arm), mass: 0.8 },
      { key: 'armR', obj: ud.armR, size: new THREE.Vector3(bt.arm, 0.95, bt.arm), mass: 0.8 },
      { key: 'legL', obj: ud.legL, size: new THREE.Vector3(bt.leg, 1.0, bt.leg), mass: 1.2 },
      { key: 'legR', obj: ud.legR, size: new THREE.Vector3(bt.leg, 1.0, bt.leg), mass: 1.2 },
    ];

    for (const def of defs) {
      if (missingParts[def.key]) continue;
      const obj = def.obj;
      if (!obj) continue;

      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      obj.getWorldPosition(wp);
      obj.getWorldQuaternion(wq);
      obj.rotation.set(0, 0, 0);

      if (obj.parent) obj.parent.remove(obj);
      scene.add(obj);
      obj.position.copy(wp);
      obj.quaternion.copy(wq);
      obj.scale.set(1, 1, 1);

      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) { obj.visible = false; continue; }
      const center = box.getCenter(new THREE.Vector3());

      const wrapper = new THREE.Group();
      wrapper.position.copy(center);
      scene.add(wrapper);

      obj.position.sub(center);
      wrapper.add(obj);

      const piece = new Debris(wrapper, def.size, def.mass, 9999);
      piece.key = def.key;

      const base = CONFIG.ragdoll.impactImpulse * hitStrength;
      piece.applyImpulse(new THREE.Vector3(
        hitDirN.x * base + (Math.random() - 0.5) * 2,
        base * 0.6 + Math.random() * 2,
        hitDirN.z * base + (Math.random() - 0.5) * 2
      ));
      piece.applyTorque(new THREE.Vector3(
        (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20
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
    best.settled = false; best.settleTimer = 0;
    best.life = CONFIG.dismember.limbLife;
    best.maxLife = CONFIG.dismember.limbLife;
    best.velocity.set(dir.x * 12 + (Math.random() - 0.5) * 6, 6 + Math.random() * 5, dir.z * 12 + (Math.random() - 0.5) * 6);
    best.angularVelocity.set((Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35);
    spawnBlood(best.mesh.position.clone(), dir, 20, true);
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
        p.mesh.traverse(c => {
          if (c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => { m.transparent = true; m.opacity = op; });
          }
        });
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

  if (key === 'head') {
    ud.skullBone.visible = true;
    ud.jawBone.visible = true;
    ud.sk1.visible = true;
    ud.sk2.visible = true;
    ud.skTeeth.forEach(t => t.visible = true);
    limbObj.children.forEach(c => {
      if (c === ud.skullBone || c === ud.jawBone || c === ud.sk1 || c === ud.sk2) return;
      if (ud.skTeeth.includes(c)) return;
      c.visible = false;
    });
  } else {
    if (limbObj.userData.outerMeshes) limbObj.userData.outerMeshes.forEach(m => m.visible = false);
    if (limbObj.userData.boneMeshes) limbObj.userData.boneMeshes.forEach(m => m.visible = true);
  }

  z.dismembered[key] = true;

  const bt = ud.bodyType || BODY_TYPES[1];
  let size, color;
  if (key === 'head') { size = new THREE.Vector3(0.6, 0.6, 0.6); color = ud.skinColor; }
  else if (key === 'armL' || key === 'armR') { size = new THREE.Vector3(bt.arm * 1.15, 1.0, bt.arm * 1.15); color = ud.shirtColor; }
  else { size = new THREE.Vector3(bt.leg * 1.15, 1.1, bt.leg * 1.15); color = ud.pantsColor; }

  const geo = new THREE.BoxGeometry(size.x, size.y, size.z, 4, 4, 4);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.copy(wp);
  mesh.quaternion.copy(wq);
  mesh.castShadow = true;
  scene.add(mesh);

  const piece = new Debris(mesh, size, 1.2, CONFIG.dismember.limbLife);
  piece.key = key;
  const dir = hitDir.clone().normalize();
  const speed = CONFIG.dismember.limbSpeed;
  piece.velocity.set(
    dir.x * speed + (Math.random() - 0.5) * 6,
    speed * 0.8 + Math.random() * 5,
    dir.z * speed + (Math.random() - 0.5) * 6
  );
  piece.angularVelocity.set(
    (Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35
  );
  flyingLimbs.push(piece);
  spawnBlood(wp, dir, 35, true);
  spawnBlood(wp, null, 15, true);

  bus.emit(Ev.DISMEMBER, {
    zombieId: z.id,
    part: key,
    pos: { x: wp.x, y: wp.y, z: wp.z },
  });
}

function randomDismemberOnDeath(z) {
  const roll = Math.random();
  let partsToLose = 0;
  if (roll < 0.35) partsToLose = 0;
  else if (roll < 0.70) partsToLose = 1;
  else if (roll < 0.90) partsToLose = 2;
  else partsToLose = 3;

  const available = [];
  if (!z.dismembered.head) available.push('head');
  if (!z.dismembered.armL) available.push('armL');
  if (!z.dismembered.armR) available.push('armR');
  if (!z.dismembered.legL) available.push('legL');
  if (!z.dismembered.legR) available.push('legR');
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  for (let i = 0; i < partsToLose && i < available.length; i++) {
    const part = available[i];
    const dir = new THREE.Vector3((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 2).normalize();
    detachLimb(z, part, dir);
    if (part === 'head') z.health = 0;
  }
}

// ============================================================
// RAYCAST OTIMIZADO
// ============================================================
function rayAABB(origin, dir, min, max, maxDist) {
  let tMin = 0, tMax = maxDist;
  const axes = [
    { o: origin.x, d: dir.x, mn: min.x, mx: max.x },
    { o: origin.y, d: dir.y, mn: min.y, mx: max.y },
    { o: origin.z, d: dir.z, mn: min.z, mx: max.z },
  ];
  for (const { o, d, mn, mx } of axes) {
    if (Math.abs(d) < 1e-6) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  if (tMax < 0) return null;
  return tMin >= 0 ? tMin : tMax;
}

const _tmpBox = new THREE.Box3();
function getZombiePartBoxes(z, out) {
  out.length = 0;
  if (z.health <= 0) return out;
  const ud = z.mesh.userData;
  const lb = ud.localBoxes;
  if (!lb) return out;

  function addPart(key, group, enabled) {
    if (!enabled || !group || !lb[key]) return;
    group.updateMatrixWorld(true);
    _tmpBox.copy(lb[key]).applyMatrix4(group.matrixWorld);
    out.push({ key, box: _tmpBox.clone() });
  }
  addPart('head', ud.head, !z.dismembered.head);
  addPart('torso', ud.torso, true);
  addPart('armL', ud.armL, !z.dismembered.armL);
  addPart('armR', ud.armR, !z.dismembered.armR);
  addPart('legL', ud.legL, !z.dismembered.legL);
  addPart('legR', ud.legR, !z.dismembered.legR);
  return out;
}

const _partBoxesCache = [];
function raycastZombie(origin, dir, maxDist) {
  let bestZ = null, bestDist = Infinity, bestPart = null, bestPoint = null;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    z.mesh.updateMatrixWorld(true);
    const boxes = getZombiePartBoxes(z, _partBoxesCache);
    for (let b = 0; b < boxes.length; b++) {
      const p = boxes[b];
      const t = rayAABB(origin, dir, p.box.min, p.box.max, maxDist);
      if (t !== null && t < bestDist) {
        bestDist = t;
        bestZ = z;
        bestPart = p.key;
        bestPoint = origin.clone().addScaledVector(dir, t);
      }
    }
  }
  return { zombie: bestZ, part: bestPart, distance: bestDist, point: bestPoint };
}

function applyHitReaction(z, part, hitDirWorld) {
  const now = performance.now() / 1000;
  const localDir = hitDirWorld.clone();
  const zQuat = z.mesh.quaternion.clone();
  zQuat.invert();
  localDir.applyQuaternion(zQuat);
  z.recoil = {
    part,
    dirX: localDir.x,
    dirZ: localDir.z,
    startTime: now,
    duration: 0.55,
  };
}

// ============================================================
// HIT MARKER / FX
// ============================================================
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
function addShake(amount) {
  state.shake = Math.min(0.6, state.shake + amount);
}

const muzzleLight = new THREE.PointLight(0xFFAA33, 0, 8, 2);
scene.add(muzzleLight);
let muzzleLightEnd = 0;
function spawnMuzzleFlash() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  muzzleLight.position.copy(camera.position).addScaledVector(dir, 1.4);
  muzzleLightEnd = performance.now() / 1000 + 0.08;
  muzzleLight.intensity = 4;
}

const tracerPool = [];
const tracers = [];
function spawnTracer(from, to) {
  let t = tracerPool.pop();
  if (!t) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xFFDD33, transparent: true, opacity: 0.9 });
    t = { mesh: new THREE.Line(geo, mat), life: 0 };
    scene.add(t.mesh);
  }
  const arr = t.mesh.geometry.attributes.position.array;
  arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
  arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
  t.mesh.geometry.attributes.position.needsUpdate = true;
  t.mesh.visible = true;
  t.mesh.material.opacity = 0.9;
  t.life = 0.08;
  tracers.push(t);
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life / 0.08);
    if (t.life <= 0) {
      t.mesh.visible = false;
      tracerPool.push(t);
      tracers.splice(i, 1);
    }
  }
}

function damageZombie(z, damage, isCrit, part, hitDir, hitPoint, sourceType) {
  z.health -= damage;
  const isHead = part === 'head';

  bus.emit(Ev.DAMAGE, {
    attackerId: player.id,
    victimId: z.id,
    amount: damage,
    part,
    isCrit,
    headshot: isHead,
    sourceType,
    weaponId: state.inventory[state.currentSlot],
    pos: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
  });

  spawnBlood(hitPoint, hitDir, (isCrit || isHead) ? 35 : 18, isHead);
  if (isCrit || isHead) spawnBlood(hitPoint, null, 15, true);

  if (sourceType === 'melee') Sfx.playKnifeHitFlesh();
  else Sfx.playBulletImpact();
  showHitMarker(isCrit || isHead);
  addShake(CONFIG.shake.hit);

  applyHitReaction(z, part, hitDir);

  if (isCrit || isHead) {
    let limb = null;
    const roll = Math.random();
    if (part === 'head' && !z.dismembered.head) {
      if (roll < CONFIG.dismember.headChance) limb = 'head';
    } else if (part === 'torso') {
      const opts = [];
      if (!z.dismembered.armL) opts.push('armL');
      if (!z.dismembered.armR) opts.push('armR');
      if (opts.length > 0 && roll < CONFIG.dismember.armChance) limb = opts[Math.floor(Math.random() * opts.length)];
    } else if (part === 'armL' || part === 'armR' || part === 'legL' || part === 'legR') {
      if (!z.dismembered[part] && roll < 0.65) limb = part;
    }
    if (limb) {
      detachLimb(z, limb, hitDir);
      if (limb === 'head') z.health = 0;
    }
  }

  if (z.health <= 0) {
    Sfx.playZombieDeath();
    Sfx.playCoin();
    addShake(CONFIG.shake.kill);

    const coinGain = Math.round(CONFIG.zombie.coinReward * state.coinMult);
    const xpGain = Math.round(CONFIG.zombie.xpReward * state.xpMult);

    state.coins += coinGain;
    state.xp += xpGain;
    if (state.lifesteal > 0) state.health = Math.min(state.maxHealth, state.health + state.lifesteal);

    bus.emit(Ev.DEATH, { id: z.id, killerId: player.id, part });
    bus.emit(Ev.KILL, {
      killerId: player.id,
      victimId: z.id,
      victimType: z.mesh.userData.zombieType,
      headshot: isHead,
      weaponId: state.inventory[state.currentSlot],
    });
    if (isHead) bus.emit(Ev.HEADSHOT, { playerId: player.id, victimId: z.id });
    bus.emit(Ev.COIN_GAIN, { playerId: player.id, amount: coinGain, total: state.coins });
    bus.emit(Ev.XP_GAIN, { playerId: player.id, amount: xpGain, total: state.xp });

    checkLevelUp();
    randomDismemberOnDeath(z);
    const overkill = Math.min(2, Math.max(0.7, -z.health / CONFIG.zombie.maxHealth + 1));
    startRagdoll(z.mesh, hitDir, isCrit ? overkill * 1.4 : overkill, z.dismembered);
    const idx = zombies.indexOf(z);
    if (idx >= 0) zombies.splice(idx, 1);
    state.zombiesAlive--;
    updateHUD();
  } else {
    z.hitReactEndTime = performance.now() / 1000 + CONFIG.zombie.knockbackStagger * (isCrit || isHead ? 1.5 : 1);
    z.hitDirection.copy(hitDir);
  }
}

function attack() {
  const now = performance.now() / 1000;
  const weaponId = state.inventory[state.currentSlot] || 'knife';
  const weapon = WEAPONS[weaponId];
  const cd = weapon.cooldown / state.attackSpeedMult;
  if (now - state.lastAttackTime < cd) return false;

  if (weapon.type === 'ranged' && weapon.ammo !== null) {
    if (weapon.ammo <= 0) { state.lastAttackTime = now; return false; }
    weapon.ammo--;
    updateHUD();
  }

  state.lastAttackTime = now;

  bus.emit(Ev.ATTACK, {
    playerId: player.id,
    weaponId,
    weaponType: weapon.type,
    ammo: weapon.ammo,
    aiming: state.aiming,
    pos: { x: player.position.x, y: player.position.y, z: player.position.z },
    yaw: player.yaw,
    pitch: player.pitch,
  });

  if (weapon.type === 'melee') Sfx.playKnifeSwing();
  else if (weaponId === 'pistol') Sfx.playPistol();
  else if (weaponId === 'revolver') Sfx.playRevolver();
  else if (weaponId === 'smg') Sfx.playSMG();
  else if (weaponId === 'rifle') Sfx.playRifle();
  else if (weaponId === 'shotgun') Sfx.playShotgun();
  else if (weaponId === 'launcher') Sfx.playLauncher();

  triggerSwing();
  if (weapon.type === 'ranged') {
    spawnMuzzleFlash();
    addShake(CONFIG.shake.shoot);
  }

  if (weapon.type === 'melee') {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const range = weapon.range + state.rangeBonus;
    const aimRegion = getAimRegion();

    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.health <= 0) continue;
      const dx = z.mesh.position.x - player.position.x;
      const dz = z.mesh.position.z - player.position.z;
      const horizDist = Math.sqrt(dx * dx + dz * dz);
      if (horizDist > range) continue;

      let part;
      if (aimRegion === 'head') part = 'head';
      else if (aimRegion === 'legs') part = Math.random() < 0.5 ? 'legL' : 'legR';
      else part = 'torso';

      const hitPoint = z.mesh.position.clone();
      hitPoint.y += (part === 'head') ? 1.85 : (part === 'legL' || part === 'legR') ? 0.5 : 1.15;

      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult;
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const headMult = part === 'head' ? CONFIG.headshotMultiplier : 1;
      const dmg = baseDmg * headMult * (isCrit ? critMult : 1);
      const hitDir = horizDist > 0.001
        ? new THREE.Vector3(dx / horizDist, 0, dz / horizDist)
        : forward.clone();
      damageZombie(z, dmg, isCrit, part, hitDir, hitPoint, 'melee');
    }

    const camPos = camera.position.clone();
    for (const r of ragdolls) {
      if (r.sliceAt(camPos, forward, CONFIG.ragdoll.sliceRange)) {
        Sfx.playKnifeHitFlesh();
        showHitMarker(false);
        break;
      }
    }
    return true;
  }

  const origin = camera.position.clone();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const range = weapon.range + state.rangeBonus;
  const baseSpread = state.aiming ? weapon.spread * 0.25 : weapon.spread;

  for (let i = 0; i < weapon.pellets; i++) {
    const dir = forward.clone();
    if (baseSpread > 0) {
      dir.x += (Math.random() - 0.5) * baseSpread * 2;
      dir.y += (Math.random() - 0.5) * baseSpread * 2;
      dir.z += (Math.random() - 0.5) * baseSpread * 2;
      dir.normalize();
    }
    const result = raycastZombie(origin, dir, range);
    if (result.zombie) {
      spawnTracer(origin.clone().addScaledVector(dir, 0.8), result.point);
      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult;
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const headMult = result.part === 'head' ? CONFIG.headshotMultiplier : 1;
      const dmg = baseDmg * headMult * (isCrit ? critMult : 1);
      const hd = dir.clone(); hd.y = 0; hd.normalize();
      damageZombie(result.zombie, dmg, isCrit, result.part, hd, result.point, 'ranged');
    } else {
      spawnTracer(origin.clone().addScaledVector(dir, 0.8), origin.clone().addScaledVector(dir, range));
    }
  }
  return true;
}

function rollCrit() { return Math.random() < state.critChance; }

function checkLevelUp() {
  let leveled = false;
  while (state.xp >= state.xpToNextLevel) {
    state.xp -= state.xpToNextLevel;
    state.level++;
    state.xpToNextLevel = Math.floor(state.xpToNextLevel * 1.4);
    state.pendingLevelUps++;
    bus.emit(Ev.LEVEL_UP, { playerId: player.id, level: state.level });
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

  bus.emit(Ev.SKILL_PICK, { playerId: player.id, skillId, level: state.level });

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
  const count = Math.min(
    CONFIG.wave.baseZombies + (state.wave - 1) * CONFIG.wave.zombiesPerWave,
    CONFIG.wave.maxZombies
  );
  state.zombiesRemainingInWave = count;
  showWaveBanner('HORDA ' + state.wave);

  bus.emit(Ev.WAVE_START, { wave: state.wave, count });

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

    bus.emit(Ev.WAVE_CLEAR, { wave: state.wave });

    showWaveBanner('PROXIMA EM 5s');
    setTimeout(() => { if (state.running) startWave(); }, CONFIG.wave.breakTime * 1000);
  }
}

function switchToSlot(slot) {
  if (!state.inventory[slot] || state.currentSlot === slot) return;
  state.currentSlot = slot;
  const weaponId = state.inventory[slot];
  const weapon = WEAPONS[weaponId];
  if (weapon.type === 'melee' && state.aiming) {
    state.aiming = false;
    updateCrosshair();
  }
  buildViewModel(weaponId);

  bus.emit(Ev.PLAYER_WEAPON, { playerId: player.id, slot, weaponId });

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

function updateCrosshair() {
  document.body.classList.toggle('aiming', state.aiming);
}

document.addEventListener('keydown', e => {
  state.keys[e.code] = true;
  if (e.code === 'Digit1') switchToSlot(1);
  if (e.code === 'Digit2') switchToSlot(2);
  if (e.code === 'Digit3') switchToSlot(3);
  if (e.code === 'Digit4') switchToSlot(4);
  if (e.code === 'KeyE') tryBuyWeapon();
  if (e.code === 'KeyM') Sfx.setMuted(!Sfx.isMuted());
});
document.addEventListener('keyup', e => { state.keys[e.code] = false; });

renderer.domElement.addEventListener('click', () => {
  if (!state.running || isMobile() || state.levelUpActive) return;
  Sfx.initAudio(); Sfx.resumeAudio();
  renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const sens = state.aiming ? 0.0012 : 0.002;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});

document.addEventListener('mousedown', e => {
  if (e.button === 0) {
    state.mouseDown = true;
    if (state.running && !state.levelUpActive && document.pointerLockElement === renderer.domElement) {
      attack();
    }
  }
  if (e.button === 2) {
    const weaponId = state.inventory[state.currentSlot] || 'knife';
    const weapon = WEAPONS[weaponId];
    if (weapon.type !== 'melee') {
      state.aiming = true;
      updateCrosshair();
    }
  }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) state.mouseDown = false;
  if (e.button === 2) {
    state.aiming = false;
    updateCrosshair();
  }
});
document.addEventListener('contextmenu', e => { if (state.running) e.preventDefault(); });

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

const clock = new THREE.Clock();
let shadowFrame = 0;

const _fwdV = new THREE.Vector3();
const _rightV = new THREE.Vector3();
const _moveV = new THREE.Vector3();

function updatePlayer(dt) {
  const speed = CONFIG.player.speed * state.speedMult * (state.aiming ? 0.5 : 1);
  _fwdV.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _rightV.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let mx = 0, mz = 0;
  if (isMobile()) { mx = mobile.moveX; mz = mobile.moveY; }
  else {
    if (state.keys['KeyW']) mz -= 1;
    if (state.keys['KeyS']) mz += 1;
    if (state.keys['KeyA']) mx -= 1;
    if (state.keys['KeyD']) mx += 1;
  }
  _moveV.set(0, 0, 0);
  _moveV.addScaledVector(_fwdV, -mz);
  _moveV.addScaledVector(_rightV, mx);
  state.isMoving = _moveV.lengthSq() > 0.0025;
  if (state.isMoving) _moveV.normalize();
  player.position.addScaledVector(_moveV, speed * dt);

  resolveWallCollisions(player.position, CONFIG.player.radius);

  const lim = CONFIG.arena.size / 2 - 1;
  player.position.x = Math.max(-lim, Math.min(lim, player.position.x));
  player.position.z = Math.max(-lim, Math.min(lim, player.position.z));

  if (state.isMoving) state.bobTime += dt * 9;
  else state.bobTime *= 0.9;
  const bobY = Math.sin(state.bobTime) * (state.aiming ? 0.02 : 0.055);

  camera.position.copy(player.position);
  camera.position.y += bobY;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  if (state.shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * state.shake;
    camera.position.y += (Math.random() - 0.5) * state.shake;
    camera.rotation.z = (Math.random() - 0.5) * state.shake * 0.5;
    state.shake *= Math.pow(0.001, dt);
  } else {
    camera.rotation.z = 0;
    state.shake = 0;
  }
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
  resolveWallCollisions(z.mesh.position, CONFIG.zombie.radius);
}

const _toV = new THREE.Vector3();
function updateZombies(dt) {
  const now = performance.now() / 1000;
  groanTimer -= dt;
  if (groanTimer <= 0 && zombies.length > 0) {
    groanTimer = 1.5 + Math.random() * 3;
    Sfx.playGroan();
  }
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    z.emergeTime += dt;
    const emerge = Math.min(1, z.emergeTime / 1.5);
    const isWounded = z.health / z.maxHealth < 0.5;
    const ud = z.mesh.userData;
    _toV.subVectors(player.position, z.mesh.position);
    _toV.y = 0;
    const dist = _toV.length();

    const _dx = player.position.x - z.mesh.position.x;
    const _dz = player.position.z - z.mesh.position.z;
    z.mesh.rotation.y = Math.atan2(_dx, _dz);

    const staggering = z.hitReactEndTime > now;
    let sm = emerge;
    if (z.dismembered.legL || z.dismembered.legR) sm *= 0.55;
    if (z.dismembered.legL && z.dismembered.legR) sm *= 0.3;
    const ws = (isWounded ? 3.2 : 5) * sm;
    z.walkPhase += dt * ws;

    const legSwing = Math.sin(z.walkPhase) * 0.6;
    const legLX = z.dismembered.legL ? 0 : legSwing;
    const legRX = z.dismembered.legR ? 0 : -legSwing;

    const reaching = dist < 3.5;
    const armLTarget = z.dismembered.armL ? 0 : (reaching ? -1.5 + Math.sin(z.walkPhase) * 0.08 : -legSwing * 0.7);
    const armRTarget = z.dismembered.armR ? 0 : (reaching ? -1.5 + Math.cos(z.walkPhase) * 0.08 : legSwing * 0.7);
    z.anim.armLX += (armLTarget - z.anim.armLX) * Math.min(1, dt * 8);
    z.anim.armRX += (armRTarget - z.anim.armRX) * Math.min(1, dt * 8);

    z.anim.headRZ = Math.sin(z.walkPhase * 0.5) * 0.08;
    z.anim.headRY = Math.sin(z.walkPhase * 0.3) * 0.1;

    const targetLean = isWounded ? 0.20 + (dist < 3 ? 0.1 : 0) : 0.12 + (dist < 3 ? 0.08 : 0);
    z.anim.bodyLean += (targetLean - z.anim.bodyLean) * 0.05;

    if (ud.legL) ud.legL.rotation.x = legLX;
    if (ud.legR) ud.legR.rotation.x = legRX;
    if (ud.armL) ud.armL.rotation.x = z.anim.armLX;
    if (ud.armR) ud.armR.rotation.x = z.anim.armRX;
    ud.head.rotation.z = z.anim.headRZ;
    ud.head.rotation.y = z.anim.headRY;
    z.mesh.rotation.x = z.anim.bodyLean;

    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      z.mesh.rotation.x -= lean * 0.45;
      z.mesh.position.addScaledVector(z.hitDirection, -dt * 4 * lean);
    }

    if (z.recoil) {
      const el = now - z.recoil.startTime;
      if (el >= z.recoil.duration) z.recoil = null;
      else {
        const t = el / z.recoil.duration;
        const curve = Math.sin(t * Math.PI);
        const amp = curve * 1.3;
        const { part, dirX, dirZ } = z.recoil;
        let obj = null;
        if (part === 'head' && !z.dismembered.head) obj = ud.head;
        else if (part === 'armL' && !z.dismembered.armL) obj = ud.armL;
        else if (part === 'armR' && !z.dismembered.armR) obj = ud.armR;
        else if (part === 'legL' && !z.dismembered.legL) obj = ud.legL;
        else if (part === 'legR' && !z.dismembered.legR) obj = ud.legR;
        if (obj) {
          obj.rotation.x += dirZ * amp;
          obj.rotation.z += dirX * amp;
        }
        if (part === 'head' || part === 'torso') {
          z.mesh.rotation.x += dirZ * amp * 0.4;
          z.mesh.rotation.z += dirX * amp * 0.35;
        }
        if (part === 'legL' || part === 'legR') {
          z.mesh.rotation.z += dirX * amp * 0.55;
          z.mesh.position.y = Math.abs(dirX * curve) * 0.02;
        }
      }
    } else {
      z.mesh.rotation.z *= 0.9;
    }

    if (z.dismembered.head) {
      Sfx.playZombieDeath();
      state.zombiesAlive--;
      const idx = zombies.indexOf(z);
      if (idx >= 0) zombies.splice(idx, 1);

      bus.emit(Ev.DEATH, { id: z.id, killerId: player.id, part: 'head' });
      bus.emit(Ev.KILL, {
        killerId: player.id,
        victimId: z.id,
        victimType: z.mesh.userData.zombieType,
        headshot: true,
        weaponId: state.inventory[state.currentSlot],
      });

      startRagdoll(z.mesh, new THREE.Vector3(_dx, 0, _dz).normalize(), 1.0, z.dismembered);
      updateHUD();
      continue;
    }

    if (emerge >= 0.5) {
      const zs = CONFIG.zombie.speed * (isWounded ? 0.6 : 1);
      if (!staggering && dist > CONFIG.zombie.attackRange) {
        _toV.normalize();
        z.mesh.position.addScaledVector(_toV, zs * dt);
      } else if (!staggering && now - z.lastAttackTime > CONFIG.zombie.attackCooldown) {
        z.lastAttackTime = now;
        const _dmg = CONFIG.zombie.damage * (1 - state.damageReduction);
        state.health -= _dmg;
        Sfx.playPlayerHurt();
        showDamageFlash();
        addShake(0.15);

        bus.emit(Ev.PLAYER_HIT, {
          playerId: player.id,
          attackerId: z.id,
          amount: _dmg,
          pos: { x: z.mesh.position.x, y: 1, z: z.mesh.position.z },
        });

        updateHUD();
        if (state.health <= 0) gameOver();
      }
    }

    resolveZombieWallCollision(z);
  }

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
  Sfx.playBuy();

  bus.emit(Ev.WEAPON_BUY, {
    playerId: player.id,
    weaponId: w.id,
    cost: w.cost,
    slot: w.slot,
  });

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

let lastTimeText = '';

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now() / 1000;

  if (muzzleLight.intensity > 0) {
    const remain = muzzleLightEnd - now;
    if (remain <= 0) muzzleLight.intensity = 0;
    else muzzleLight.intensity = 4 * (remain / 0.08);
  }

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

    const targetFov = state.aiming ? 50 : 78;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 15);
    camera.updateProjectionMatrix();

    shadowFrame++;
    if (shadowFrame >= 5) {
      renderer.shadowMap.needsUpdate = true;
      shadowFrame = 0;
    }

    const elapsed = Math.floor((performance.now() - state.startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = (elapsed % 60).toString().padStart(2, '0');
    const t = `${m}:${s}`;
    if (t !== lastTimeText) {
      document.getElementById('timer').textContent = t;
      lastTimeText = t;
    }
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
  state.aiming = false;
  state.shake = 0;
  state.lastAttackTime = 0;
  updateCrosshair();

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
  bloodActive.forEach(p => scene.remove(p.mesh));
  bloodActive.length = 0;
  bloodPools.forEach(b => scene.remove(b.mesh));
  bloodPools.length = 0;
  tracers.forEach(t => { t.mesh.visible = false; tracerPool.push(t); });
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
  bus.emit(Ev.PLAYER_DIED, {
    playerId: player.id,
    wave: state.wave,
    level: state.level,
    coins: state.coins,
    xp: state.xp,
  });

  state.running = false;
  state.aiming = false;
  updateCrosshair();
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
