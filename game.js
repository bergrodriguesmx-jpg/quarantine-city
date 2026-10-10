import * as THREE from 'three';
import * as Textures from './textures.js';
import { buildWorld } from './scenery.js';
import * as Sfx from './audio.js';
import * as bus from './src/core/bus.js';
import { Ev } from './src/core/events.js';
import { nextId } from './src/core/ids.js';
import { LocalAdapter } from './src/net/adapter.js';

bus.setAdapter(new LocalAdapter());

// ============================================================
// CACHE GLOBAL DE GEOMETRIAS / MATERIAIS
// ============================================================
const geoCache = new Map();
const matCache = new Map();

function geoBox(w, h, d, seg = 2) {
  const k = `b:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d, seg, seg, seg); geoCache.set(k, g); }
  return g;
}
function geoSphere(r, s = 8) {
  const k = `s:${r.toFixed(3)}:${s}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, s, Math.max(6, Math.floor(s * 0.75))); geoCache.set(k, g); }
  return g;
}
function geoCyl(rt, rb, h, s = 8) {
  const k = `c:${rt.toFixed(3)}:${rb.toFixed(3)}:${h.toFixed(3)}:${s}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, s); geoCache.set(k, g); }
  return g;
}
function geoTorus(r, t, s1, s2, a) {
  const k = `t:${r}:${t}:${s1}:${s2}:${a}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.TorusGeometry(r, t, s1, s2, a); geoCache.set(k, g); }
  return g;
}
function matL(color, opts) {
  const k = `L:${color}:${opts ? JSON.stringify(opts) : ''}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, ...(opts || {}) }); matCache.set(k, m); }
  return m;
}
function matB(color, opts) {
  const k = `B:${color}:${opts ? JSON.stringify(opts) : ''}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...(opts || {}) }); matCache.set(k, m); }
  return m;
}

// ============================================================
// ZUMBI MATERIAL CACHE
// ============================================================
const zombieMatCache = new Map();
function zMat(color) {
  let m = zombieMatCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); zombieMatCache.set(color, m); }
  return m;
}
const MAT_EYE_WHITE = matB(0xFFFFFF);
const MAT_EYE_BLACK = matB(0x000000);
const MAT_WOUND = matB(0xC0392B);
const MAT_BONE_TEETH = matB(0xE8E0D0);

// ============================================================
// SPRING
// ============================================================
function springStep(obj, key, target, k, c, dt) {
  const vKey = key + 'Vel';
  const a = (target - obj[key]) * k - (obj[vKey] || 0) * c;
  obj[vKey] = (obj[vKey] || 0) + a * dt;
  obj[key] += obj[vKey] * dt;
}
function springKick(obj, key, impulse) {
  obj[key + 'Vel'] = (obj[key + 'Vel'] || 0) + impulse;
}

// ============================================================
// WEAPONS
// ============================================================
const WEAPONS = {
  knife:    { id: 'knife',    name: 'FACA',           slot: 1, damage: 35, range: 3.0, cooldown: 0.55, type: 'melee',  cost: 0,    spread: 0,     pellets: 1, auto: false, color: 0xBDC3C7 },
  pistol:   { id: 'pistol',   name: 'PISTOLA',        slot: 2, damage: 40, range: 16,  cooldown: 0.28, type: 'ranged', cost: 40,   spread: 0.02,  pellets: 1, auto: false, color: 0x2C3E50, magSize: 12, reserveMax: 120, reloadTime: 1.3 },
  revolver: { id: 'revolver', name: 'REVOLVER',       slot: 2, damage: 90, range: 15,  cooldown: 0.75, type: 'ranged', cost: 120,  spread: 0.008, pellets: 1, auto: false, color: 0x4A4A4A, magSize: 6,  reserveMax: 42,  reloadTime: 2.2 },
  smg:      { id: 'smg',      name: 'SMG',            slot: 3, damage: 18, range: 13,  cooldown: 0.075, type: 'ranged', cost: 160,  spread: 0.07,  pellets: 1, auto: true,  color: 0x34495E, magSize: 30, reserveMax: 240, reloadTime: 1.9 },
  rifle:    { id: 'rifle',    name: 'RIFLE',          slot: 3, damage: 160, range: 30, cooldown: 1.1,  type: 'ranged', cost: 320,  spread: 0.005, pellets: 1, auto: false, color: 0x2C3E50, magSize: 5,  reserveMax: 40,  reloadTime: 2.9 },
  shotgun:  { id: 'shotgun',  name: 'SHOTGUN',        slot: 3, damage: 32, range: 8,   cooldown: 1.15, type: 'ranged', cost: 220,  spread: 0.22,  pellets: 10, auto: false, color: 0x8B4513, magSize: 5,  reserveMax: 30,  reloadTime: 2.5 },
  launcher: { id: 'launcher', name: 'LANCA-FOGUETES', slot: 4, damage: 250, range: 20, cooldown: 1.9,  type: 'ranged', cost: 700,  spread: 0.02,  pellets: 1, auto: false, color: 0xC0392B, magSize: 1,  reserveMax: 5,   reloadTime: 3.5 },
};
const AMMO_PACKS = { pistol: 60, revolver: 12, smg: 90, rifle: 15, shotgun: 15, launcher: 2 };
const AMMO_PRICES = { pistol: 5, revolver: 15, smg: 25, rifle: 40, shotgun: 30, launcher: 100 };

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

// ============================================================
// ZOMBIE VARIANTS — Stats diferentes por tipo
// ============================================================
const ZOMBIE_TYPES = {
  pt:        { hpMul: 1.00, dmgMul: 1.00, speedMul: 1.00, xpMul: 1.00, coinMul: 1.00, scale: 1.00, weight: 42, attackRange: 1.6, cooldown: 1.20, tint: 0xffffff },
  pt_donkey: { hpMul: 0.75, dmgMul: 0.85, speedMul: 1.35, xpMul: 1.30, coinMul: 1.30, scale: 0.95, weight: 28, attackRange: 1.4, cooldown: 0.95, tint: 0xffeebb },
  judge:     { hpMul: 1.80, dmgMul: 1.60, speedMul: 0.72, xpMul: 2.00, coinMul: 2.20, scale: 1.12, weight: 22, attackRange: 1.9, cooldown: 1.40, tint: 0xffd0d0 },
  runner:    { hpMul: 0.55, dmgMul: 0.75, speedMul: 2.20, xpMul: 1.50, coinMul: 1.70, scale: 0.85, weight: 6,  attackRange: 1.3, cooldown: 0.85, tint: 0xd0ffd0 },
  boss:      { hpMul: 6.0,  dmgMul: 2.4,  speedMul: 0.60, xpMul: 8.00, coinMul: 10.0, scale: 1.55, weight: 0,  attackRange: 2.2, cooldown: 1.60, tint: 0xffaaaa, boss: true },
};

const CONFIG = {
  player: { speed: 5.5, height: 1.7, maxHealth: 100, radius: 0.4 },
  zombie: { speed: 1.9, maxHealth: 40, damage: 8, attackRange: 1.6, attackCooldown: 1.2, xpReward: 10, coinReward: 2, knockbackStagger: 0.25, radius: 0.4 },
  pursuit: { responsiveness: 3.8, arrivalRadius: 1.15, minSpeedFactor: 0.35 },
  // ===== Novos sistemas =====
  scaling: { hpPerWave: 0.10, dmgPerWave: 0.05, speedPerWave: 0.02, speedCap: 1.30 },
  aggro: { alertRadius: 8.0, alertDuration: 3.0, alertSpeedMult: 1.35 },
  wave: { baseZombies: 6, zombiesPerWave: 2, maxZombies: 48, breakTime: 5, bossEvery: 5, clearBonusBase: 15, clearBonusPerWave: 5, clearHealFrac: 0.15, clearAmmoFrac: 0.30 },
  arena: { size: 80 },
  ragdoll: { maxActive: 6, settleTime: 20, fadeDuration: 1.5, impactImpulse: 10, sliceRange: 3.5, sliceDotMin: 0.25 },
  crit: { baseChance: 0.15, damageMultiplier: 2 },
  dismember: { headChance: 0.65, armChance: 0.50, legChance: 0.40, limbSpeed: 16, limbLife: 12 },
  headshotMultiplier: 2.5,
  shake: { hit: 0.05, kill: 0.12, shoot: 0.03, explosion: 0.5 },
  melee: { coneDot: 0.35 },
  launcher: { explosionRadius: 5, selfDamageFactor: 0.4 },
  downed: { selfReviveAt: 15000, selfReviveHold: 3000, duration: 30000, maxHP: 30, maxRevives: 2 },
  debris: { minHitSpeed2: 6, pushRadiusBonus: 0.6, staggerTime: 0.22 },
};

const state = {
  waveIntervalId: null, waveStartTimeoutId: null,
  health: CONFIG.player.maxHealth, maxHealth: CONFIG.player.maxHealth,
  coins: 0, xp: 0, xpToNextLevel: 50, level: 1, wave: 0,
  zombiesAlive: 0, zombiesRemainingInWave: 0,
  running: false, paused: false, betweenWaves: false,
  lastAttackTime: 0, keys: {}, bobTime: 0, isMoving: false, startTime: 0,
  critChance: CONFIG.crit.baseChance,
  damageMult: 1.0, rangeBonus: 0, speedMult: 1.0, lifesteal: 0,
  coinMult: 1.0, xpMult: 1.0, damageReduction: 0,
  attackSpeedMult: 1.0, critDamageBonus: 0,
  levelUpActive: false, pendingLevelUps: 0,
  inventory: { 1: 'knife', 2: null, 3: null, 4: null }, currentSlot: 1,
  mouseDown: false, aiming: false, shake: 0,
  ammo: {}, reload: { active: false, wid: null, startTime: 0, endTime: 0, duration: 0 },
  shopOpen: false,
  downed: false, downedElapsed: 0, downedHP: 0, downedMaxHP: CONFIG.downed.maxHP,
  reviveProgress: 0, revivesLeft: CONFIG.downed.maxRevives, invulnUntil: 0,
  pingWheelOpen: false, pingAccumX: 0, pingAccumY: 0, pingHighlight: null,
  kills: 0, headshots: 0, damageTotal: 0,
};

// ============================================================
// 3D
// ============================================================
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

scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.MeshBasicMaterial({ map: Textures.skyTexture(), side: THREE.BackSide, fog: false })));
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.far = 150; sun.shadow.bias = -0.001;
scene.add(sun);

{
  const size = CONFIG.arena.size;
  const tex = Textures.grassTexture(); tex.repeat.set(size / 2, size / 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
}

const world = buildWorld(scene, CONFIG.arena.size);
const caves = [];
{
  const half = CONFIG.arena.size / 2 - 3;
  [
    { x: 0, z: -half, rot: 0 }, { x: 0, z: half, rot: Math.PI },
    { x: -half, z: 0, rot: Math.PI / 2 }, { x: half, z: 0, rot: -Math.PI / 2 },
    { x: -half * 0.7, z: -half * 0.7, rot: Math.PI / 4 },
    { x: half * 0.7, z: -half * 0.7, rot: -Math.PI / 4 },
    { x: -half * 0.7, z: half * 0.7, rot: Math.PI * 3 / 4 },
    { x: half * 0.7, z: half * 0.7, rot: -Math.PI * 3 / 4 },
  ].forEach(({ x, z, rot }) => {
    const mesh = createCave(x, z, rot);
    scene.add(mesh);
    caves.push({ x, z, rot, mesh });
  });
}
function createCave(x, z, rotationY) {
  const g = new THREE.Group();
  const rockMat = matL(0x5A5A5A, { flatShading: true });
  const darkRock = matL(0x3A3A3A, { flatShading: true });
  const holeMat = matB(0x000000);
  function rock(px, py, pz, sx, sy, sz, mat) {
    const m = new THREE.Mesh(geoBox(sx, sy, sz, 2), mat || rockMat);
    m.position.set(px, py, pz); m.receiveShadow = true; g.add(m);
  }
  rock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(-0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0, 3.6, 0.2, 3.6, 0.9, 2.0, rockMat);
  const hole = new THREE.Mesh(geoBox(2.6, 2.6, 0.4, 1), holeMat);
  hole.position.set(0, 1.3, -1.0); g.add(hole);
  g.position.set(x, 0, z); g.rotation.y = rotationY;
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
  const wall = new THREE.Mesh(geoBox(w, h, d, 1), invisible);
  wall.position.set(x, h / 2, z);
  scene.add(wall);
  world.wallColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
});

function createPTShirtTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const cx = 128, cy = 128, outerR = 100, innerR = 40;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 === 0) ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r, y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
  ctx.fillStyle = '#CC0000';
  ctx.font = 'bold 60px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PT', cx, cy + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.transparent = true;
  return tex;
}
const PT_SHIRT_TEXTURE = createPTShirtTexture();
const PT_DECAL_MAT = new THREE.MeshBasicMaterial({ map: PT_SHIRT_TEXTURE, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });

// ============================================================
// VIEWMODELS
// ============================================================
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);
let currentViewModel = null;
const MAT = {
  metalDark: matL(0x1A1A1A), metalMid: matL(0x2C3E50), metalLight: matL(0x7F8C8D),
  metalSteel: matL(0xBDC3C7), wood: matL(0x5D4030), woodLight: matL(0x8B5A2B),
  grip: matL(0x1A1A1A), accent: matL(0xCC0000),
  skin: matL(0xD4A574), skinDark: matL(0xC09065), nail: matL(0xE8C8A0),
};

function buildViewModel(weaponId) {
  if (currentViewModel) { weaponGroup.remove(currentViewModel); currentViewModel = null; }
  const g = new THREE.Group();
  if (weaponId === 'knife') {
    const handGroup = new THREE.Group();
    g.add(handGroup);
    const forearm = new THREE.Mesh(geoCyl(0.045, 0.055, 0.38, 14), MAT.skin);
    forearm.rotation.z = Math.PI / 2; forearm.rotation.y = -0.10;
    forearm.position.set(0.22, -0.01, 0.14); forearm.castShadow = true;
    handGroup.add(forearm);
    const elbowCap = new THREE.Mesh(geoSphere(0.052, 12), MAT.skinDark);
    elbowCap.position.set(0.40, -0.01, 0.14); handGroup.add(elbowCap);
    const wrist = new THREE.Mesh(geoCyl(0.042, 0.042, 0.06, 12), MAT.skin);
    wrist.rotation.z = Math.PI / 2; wrist.position.set(0.045, -0.01, 0.08); handGroup.add(wrist);
    const hand = new THREE.Mesh(geoBox(0.10, 0.11, 0.13, 2), MAT.skin);
    hand.position.set(0, 0, 0.02); hand.castShadow = true; handGroup.add(hand);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(geoBox(0.028, 0.045, 0.10, 1), MAT.skin);
      finger.position.set(-0.036 + i * 0.024, 0.025, -0.03); handGroup.add(finger);
      const knuckle = new THREE.Mesh(geoBox(0.028, 0.028, 0.06, 1), MAT.skinDark);
      knuckle.position.set(-0.036 + i * 0.024, 0.045, -0.055); handGroup.add(knuckle);
    }
    const thumb = new THREE.Mesh(geoBox(0.04, 0.035, 0.07, 1), MAT.skin);
    thumb.position.set(0.052, 0.015, 0.02); handGroup.add(thumb);
    const knifeG = new THREE.Group();
    knifeG.position.set(0, 0.02, 0.02); handGroup.add(knifeG);
    const handle = new THREE.Mesh(geoBox(0.05, 0.22, 0.05, 1), MAT.grip);
    handle.position.set(0, -0.04, 0.02); knifeG.add(handle);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(geoBox(0.055, 0.018, 0.055, 1), MAT.metalDark);
      ring.position.set(0, -0.13 + i * 0.055, 0.02); knifeG.add(ring);
    }
    const pommel = new THREE.Mesh(geoBox(0.065, 0.03, 0.065, 1), MAT.metalLight);
    pommel.position.set(0, -0.18, 0.02); knifeG.add(pommel);
    const guard = new THREE.Mesh(geoBox(0.16, 0.022, 0.09, 1), MAT.metalDark);
    guard.position.set(0, 0.09, 0.02); knifeG.add(guard);
    const blade = new THREE.Mesh(geoBox(0.048, 0.50, 0.014, 1), MAT.metalSteel);
    blade.position.set(0, 0.36, 0.02); blade.castShadow = true; knifeG.add(blade);
    const edge = new THREE.Mesh(geoBox(0.008, 0.48, 0.015, 1), matB(0xFFFFFF));
    edge.position.set(-0.024, 0.36, 0.02); knifeG.add(edge);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), MAT.metalSteel);
    tip.rotation.y = Math.PI / 4; tip.position.set(0, 0.63, 0.02); knifeG.add(tip);
  } else if (weaponId === 'pistol') {
    const s = new THREE.Mesh(geoBox(0.065, 0.09, 0.30, 1), MAT.metalMid); s.position.set(0, 0.06, -0.06); g.add(s);
    const st = new THREE.Mesh(geoBox(0.05, 0.03, 0.28, 1), MAT.metalDark); st.position.set(0, 0.11, -0.06); g.add(st);
    const b = new THREE.Mesh(geoCyl(0.022, 0.022, 0.08, 8), MAT.metalDark); b.rotation.x = Math.PI / 2; b.position.set(0, 0.06, -0.24); g.add(b);
    const gr = new THREE.Mesh(geoBox(0.055, 0.18, 0.08, 1), MAT.grip); gr.position.set(0, -0.07, 0.06); gr.rotation.x = 0.28; g.add(gr);
    const hand = new THREE.Mesh(geoBox(0.09, 0.11, 0.10, 2), MAT.skin);
    hand.position.set(0, -0.06, 0.07); hand.rotation.x = 0.28; g.add(hand);
  } else if (weaponId === 'revolver') {
    const b = new THREE.Mesh(geoCyl(0.018, 0.018, 0.24, 8), MAT.metalMid); b.rotation.x = Math.PI / 2; b.position.set(0, 0.055, -0.16); g.add(b);
    const cy = new THREE.Mesh(geoCyl(0.045, 0.045, 0.10, 10), MAT.metalDark); cy.rotation.x = Math.PI / 2; cy.position.set(0, 0.045, 0); g.add(cy);
    const gr = new THREE.Mesh(geoBox(0.05, 0.20, 0.09, 1), MAT.wood); gr.position.set(0, -0.08, 0.08); gr.rotation.x = 0.32; g.add(gr);
    const hand = new THREE.Mesh(geoBox(0.09, 0.11, 0.10, 2), MAT.skin);
    hand.position.set(0, -0.07, 0.08); hand.rotation.x = 0.32; g.add(hand);
  } else if (weaponId === 'smg') {
    const b = new THREE.Mesh(geoBox(0.07, 0.10, 0.36, 1), MAT.metalMid); b.position.set(0, 0.04, -0.06); g.add(b);
    const sh = new THREE.Mesh(geoCyl(0.025, 0.025, 0.12, 8), MAT.metalDark); sh.rotation.x = Math.PI / 2; sh.position.set(0, 0.04, -0.30); g.add(sh);
    const mg = new THREE.Mesh(geoBox(0.035, 0.18, 0.06, 1), MAT.metalDark); mg.position.set(0, -0.10, 0.04); g.add(mg);
    const hand = new THREE.Mesh(geoBox(0.08, 0.11, 0.10, 2), MAT.skin);
    hand.position.set(0, -0.06, 0.11); g.add(hand);
  } else if (weaponId === 'rifle') {
    const b = new THREE.Mesh(geoBox(0.06, 0.09, 0.55, 1), MAT.metalMid); b.position.set(0, 0.035, -0.12); g.add(b);
    const bb = new THREE.Mesh(geoCyl(0.014, 0.014, 0.22, 8), MAT.metalDark); bb.rotation.x = Math.PI / 2; bb.position.set(0, 0.035, -0.55); g.add(bb);
    const st = new THREE.Mesh(geoBox(0.055, 0.10, 0.20, 1), MAT.wood); st.position.set(0, 0.005, 0.24); g.add(st);
    const hand = new THREE.Mesh(geoBox(0.08, 0.11, 0.10, 2), MAT.skin);
    hand.position.set(0, -0.06, 0.14); g.add(hand);
  } else if (weaponId === 'shotgun') {
    const b1 = new THREE.Mesh(geoCyl(0.022, 0.022, 0.5, 10), MAT.metalDark); b1.rotation.x = Math.PI / 2; b1.position.set(-0.022, 0.045, -0.24); g.add(b1);
    const b2 = new THREE.Mesh(geoCyl(0.022, 0.022, 0.5, 10), MAT.metalDark); b2.rotation.x = Math.PI / 2; b2.position.set(0.022, 0.045, -0.24); g.add(b2);
    const st = new THREE.Mesh(geoBox(0.06, 0.11, 0.22, 1), MAT.wood); st.position.set(0, 0.01, 0.22); g.add(st);
    const hand = new THREE.Mesh(geoBox(0.08, 0.11, 0.10, 2), MAT.skin);
    hand.position.set(0, -0.07, 0.12); g.add(hand);
  } else if (weaponId === 'launcher') {
    const tu = new THREE.Mesh(geoCyl(0.07, 0.08, 0.75, 12), MAT.metalMid); tu.rotation.x = Math.PI / 2; tu.position.set(0, 0.03, -0.12); g.add(tu);
    const mo = new THREE.Mesh(new THREE.CircleGeometry(0.062, 12), matB(0x000000)); mo.rotation.y = Math.PI; mo.position.set(0, 0.03, -0.49); g.add(mo);
    const hand = new THREE.Mesh(geoBox(0.08, 0.12, 0.10, 2), MAT.skin);
    hand.position.set(0, -0.10, 0.16); g.add(hand);
  }
  g.position.set(0.32, -0.32, -0.6);
  g.rotation.set(-0.15, -0.35, 0.15);
  currentViewModel = g;
  weaponGroup.add(g);
  return g;
}

let swingProgress = 0, swinging = false;
function triggerSwing() { swinging = true; swingProgress = 0; }
function updateWeaponViewModel(dt) {
  if (!currentViewModel) return;
  if (state.reload.active) {
    const t = Math.min(1, (performance.now() / 1000 - state.reload.startTime) / state.reload.duration);
    const dip = Math.sin(t * Math.PI);
    currentViewModel.position.set(0.32, -0.32 - dip * 0.25, -0.6);
    currentViewModel.rotation.set(-0.15 - dip * 0.9, -0.35, 0.15 + dip * 0.5);
    return;
  }
  if (swinging) {
    swingProgress += dt * 4.2;
    if (swingProgress >= 1) { swinging = false; swingProgress = 0; }
    else {
      const t = swingProgress;
      let arcX, arcY, arcZ, posX, posY, posZ;
      if (t < 0.25) {
        const p = t / 0.25, ease = p * p;
        arcX = -0.15 - ease * 0.6; arcY = -0.35 - ease * 0.4; arcZ = 0.15 + ease * 0.9;
        posX = 0.32 + ease * 0.15; posY = -0.32 + ease * 0.15; posZ = -0.6 + ease * 0.1;
      } else {
        const p = (t - 0.25) / 0.75, ease = 1 - Math.pow(1 - p, 3);
        arcX = -0.75 + ease * 1.6; arcY = -0.75 + ease * 1.9; arcZ = 1.05 - ease * 2.2;
        posX = 0.47 - ease * 0.65; posY = -0.17 - ease * 0.25; posZ = -0.5 - ease * 0.25;
      }
      currentViewModel.position.set(posX, posY, posZ);
      currentViewModel.rotation.set(arcX, arcY, arcZ);
    }
  } else {
    const a = state.aiming;
    const tX = a ? 0.02 : 0.32, tY = a ? -0.22 : -0.32, tZ = a ? -0.45 : -0.6;
    const tRX = a ? -0.02 : -0.15, tRY = a ? -0.05 : -0.35, tRZ = a ? 0.02 : 0.15;
    const bob = (state.isMoving && !a) ? Math.sin(state.bobTime) * 0.015 : 0;
    const bobX = (state.isMoving && !a) ? Math.cos(state.bobTime * 0.5) * 0.01 : 0;
    const s = Math.min(1, dt * 14);
    currentViewModel.position.x += (tX + bobX - currentViewModel.position.x) * s;
    currentViewModel.position.y += (tY + bob - currentViewModel.position.y) * s;
    currentViewModel.position.z += (tZ - currentViewModel.position.z) * s;
    currentViewModel.rotation.x += (tRX - currentViewModel.rotation.x) * s;
    currentViewModel.rotation.y += (tRY - currentViewModel.rotation.y) * s;
    currentViewModel.rotation.z += (tRZ - currentViewModel.rotation.z) * s;
  }
}

const player = { id: nextId('p'), position: new THREE.Vector3(0, CONFIG.player.height, 0), yaw: 0, pitch: 0 };
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function getAimRegion() {
  if (player.pitch > 0.15) return 'head';
  if (player.pitch < -0.25) return 'legs';
  return 'torso';
}
function circleVsAABB(px, pz, radius, box) {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  const dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  const d = Math.sqrt(d2);
  if (d > 0.0001) { const nx = dx / d, nz = dz / d; return { x: px + nx * (radius - d), z: pz + nz * (radius - d) }; }
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
const SHIRT_RED = 0xCC1111, SHIRT_BLACK = 0x1A1A1A;

const BODY_TYPES = [
  { slim: 0.90, tall: 1.06, torsoW: 0.33, torsoD: 0.20, arm: 0.09, leg: 0.14 },
  { slim: 1.00, tall: 1.00, torsoW: 0.36, torsoD: 0.22, arm: 0.10, leg: 0.16 },
  { slim: 1.14, tall: 0.95, torsoW: 0.40, torsoD: 0.25, arm: 0.11, leg: 0.18 },
];

const P_PELVIS_Y      = 0.93;
const P_SPINE_LOW_OFF = 0.12;
const P_SPINE_UP_OFF  = 0.22;
const P_HEAD_OFF      = 0.36;
const P_SHOULDER_X    = 0.18;
const P_SHOULDER_Y    = 0.14;
const P_ELBOW_OFF     = 0.30;
const P_WRIST_OFF     = 0.28;
const P_HIP_X         = 0.10;
const P_HIP_Y_OFF     = -0.04;
const P_KNEE_OFF      = 0.42;
const P_ANKLE_OFF     = 0.40;

const BONE_MAT = matL(0xE8E0D0);
const BONE_DARK_MAT = matL(0xC8BFA8);
const BONE_DARKER = matL(0xA89F88);

function buildHumanHead(head, skinMat, hairMat, wound, hasHat, HR, opts = {}) {
  const skull = new THREE.Mesh(geoSphere(HR, 20), skinMat);
  skull.scale.set(1.05, 1.15, 1.0); skull.castShadow = true; head.add(skull);
  const jaw = new THREE.Mesh(geoBox(HR * 1.55, HR * 0.65, HR * 1.45, 3), skinMat);
  jaw.position.set(0, -HR * 0.95, HR * 0.15); head.add(jaw);
  const hair = new THREE.Mesh(geoBox(HR * 2.05, HR * 0.50, HR * 2.00, 3), hairMat);
  hair.position.y = HR * 1.05; head.add(hair);
  const fringe = new THREE.Mesh(geoBox(HR * 1.95, HR * 0.55, HR * 0.35, 3), hairMat);
  fringe.position.set(0, HR * 0.80, HR * 0.85); head.add(fringe);
  const earGeo = geoBox(HR * 0.22, HR * 0.55, HR * 0.42, 2);
  const eL = new THREE.Mesh(earGeo, skinMat); eL.position.set(-HR * 1.10, -HR * 0.10, 0); head.add(eL);
  const eR = new THREE.Mesh(earGeo, skinMat); eR.position.set(HR * 1.10, -HR * 0.10, 0); head.add(eR);
  const eyeGeo = geoBox(HR * 0.42, HR * 0.32, HR * 0.12, 1);
  const wL = new THREE.Mesh(eyeGeo, MAT_EYE_WHITE); wL.position.set(-HR * 0.48, HR * 0.18, HR * 0.90); head.add(wL);
  const wR = new THREE.Mesh(eyeGeo, MAT_EYE_WHITE); wR.position.set(HR * 0.48, HR * 0.18, HR * 0.90); head.add(wR);
  const pupGeo = geoBox(HR * 0.17, HR * 0.17, HR * 0.12, 1);
  const pL = new THREE.Mesh(pupGeo, MAT_EYE_BLACK); pL.position.set(-HR * 0.48, HR * 0.18, HR * 0.95); head.add(pL);
  const pR = new THREE.Mesh(pupGeo, MAT_EYE_BLACK); pR.position.set(HR * 0.48, HR * 0.18, HR * 0.95); head.add(pR);
  const browGeo = geoBox(HR * 0.48, HR * 0.11, HR * 0.10, 1);
  const bL = new THREE.Mesh(browGeo, hairMat); bL.position.set(-HR * 0.48, HR * 0.48, HR * 0.92); head.add(bL);
  const bR = new THREE.Mesh(browGeo, hairMat); bR.position.set(HR * 0.48, HR * 0.48, HR * 0.92); head.add(bR);
  const nose = new THREE.Mesh(geoBox(HR * 0.28, HR * 0.32, HR * 0.30, 3), skinMat);
  nose.position.set(0, -HR * 0.14, HR * 0.98); head.add(nose);
  const mouth = new THREE.Mesh(geoBox(HR * 0.78, HR * 0.16, HR * 0.08, 1), matB(0x2B0000));
  mouth.position.set(0, -HR * 0.55, HR * 0.95); head.add(mouth);
  const teethGeo = geoBox(HR * 0.09, HR * 0.13, HR * 0.08, 1);
  const missing = opts.missingTeeth || 0;
  for (let i = 0; i < 5; i++) {
    if (i === missing) continue;
    const t = new THREE.Mesh(teethGeo, MAT_BONE_TEETH);
    t.position.set(-HR * 0.28 + i * HR * 0.14, -HR * 0.48, HR * 0.97); head.add(t);
  }
  const woundHead = new THREE.Mesh(geoBox(HR * 0.50, HR * 0.22, HR * 0.08, 1), wound);
  woundHead.position.set(-HR * 0.55, HR * 0.48, HR * 0.92); head.add(woundHead);
  // Sangue extra se ferido
  if (opts.bloody) {
    const blood = new THREE.Mesh(geoBox(HR * 0.35, HR * 0.20, HR * 0.06, 1), wound);
    blood.position.set(HR * 0.50, HR * 0.30, HR * 0.88);
    head.add(blood);
  }
  if (hasHat) {
    const hg = new THREE.Group();
    hg.add(new THREE.Mesh(geoBox(HR * 2.5, HR * 0.20, HR * 2.5, 2), MAT.metalMid));
    const ht = new THREE.Mesh(geoBox(HR * 1.75, HR * 0.85, HR * 1.75, 2), MAT.metalDark);
    ht.position.y = HR * 0.55; hg.add(ht);
    hg.position.y = HR * 1.20; head.add(hg);
  }
}
function buildDonkeyHead(head, skinMat, wound, HR) {
  const dSkin = matL(0x9E8B7A), dDark = matL(0x6B5D4F), muzzleMat = matL(0xB8A796);
  const skull = new THREE.Mesh(geoSphere(HR * 0.95, 18), dSkin);
  skull.scale.set(1.0, 1.0, 1.10); skull.castShadow = true; head.add(skull);
  const muzzle = new THREE.Mesh(geoBox(HR * 1.1, HR * 0.95, HR * 1.5, 3), muzzleMat);
  muzzle.position.set(0, -HR * 0.30, HR * 1.55); head.add(muzzle);
  const nostrilMat = matB(0x2A1F1A);
  const nL = new THREE.Mesh(geoBox(HR * 0.18, HR * 0.14, HR * 0.10, 1), nostrilMat);
  nL.position.set(-HR * 0.30, -HR * 0.10, HR * 2.20); head.add(nL);
  const nR = new THREE.Mesh(geoBox(HR * 0.18, HR * 0.14, HR * 0.10, 1), nostrilMat);
  nR.position.set(HR * 0.30, -HR * 0.10, HR * 2.20); head.add(nR);
  const mouth = new THREE.Mesh(geoBox(HR * 0.85, HR * 0.18, HR * 0.10, 1), matB(0x2B0000));
  mouth.position.set(0, -HR * 0.75, HR * 2.20); head.add(mouth);
  const eL = new THREE.Mesh(geoBox(HR * 0.35, HR * 0.32, HR * 0.10, 1), MAT_EYE_WHITE);
  eL.position.set(-HR * 0.75, HR * 0.35, HR * 1.0); head.add(eL);
  const eR = new THREE.Mesh(geoBox(HR * 0.35, HR * 0.32, HR * 0.10, 1), MAT_EYE_WHITE);
  eR.position.set(HR * 0.75, HR * 0.35, HR * 1.0); head.add(eR);
  const pL = new THREE.Mesh(geoBox(HR * 0.17, HR * 0.17, HR * 0.10, 1), MAT_EYE_BLACK);
  pL.position.set(-HR * 0.75, HR * 0.35, HR * 1.05); head.add(pL);
  const pR = new THREE.Mesh(geoBox(HR * 0.17, HR * 0.17, HR * 0.10, 1), MAT_EYE_BLACK);
  pR.position.set(HR * 0.75, HR * 0.35, HR * 1.05); head.add(pR);
  function makeEar(side) {
    const ear = new THREE.Group();
    ear.add(new THREE.Mesh(geoBox(HR * 0.35, HR * 0.95, HR * 0.35, 3), dSkin));
    const mid = new THREE.Mesh(geoBox(HR * 0.30, HR * 0.75, HR * 0.30, 3), dSkin);
    mid.position.y = HR * 0.80; mid.rotation.z = side * 0.15; ear.add(mid);
    const tip = new THREE.Mesh(geoBox(HR * 0.28, HR * 0.45, HR * 0.28, 2), dDark);
    tip.position.y = HR * 1.45; tip.rotation.z = side * 0.22; ear.add(tip);
    return ear;
  }
  const eL2 = makeEar(-1); eL2.position.set(-HR * 0.65, HR * 1.05, 0); eL2.rotation.z = 0.25; head.add(eL2);
  const eR2 = makeEar(1); eR2.position.set(HR * 0.65, HR * 1.05, 0); eR2.rotation.z = -0.25; head.add(eR2);
  const woundHead = new THREE.Mesh(geoBox(HR * 0.5, HR * 0.28, HR * 0.10, 1), wound);
  woundHead.position.set(-HR * 0.75, HR * 0.80, HR * 0.90); head.add(woundHead);
}
function buildJudgeHead(head, skinMat, wound, HR) {
  const hs = new THREE.Mesh(geoSphere(HR, 20), skinMat);
  hs.castShadow = true; head.add(hs);
  const eL = new THREE.Mesh(geoBox(HR * 0.40, HR * 0.34, HR * 0.10, 1), MAT_EYE_WHITE);
  eL.position.set(-HR * 0.48, HR * 0.18, HR * 0.92); head.add(eL);
  const eR = new THREE.Mesh(geoBox(HR * 0.40, HR * 0.34, HR * 0.10, 1), MAT_EYE_WHITE);
  eR.position.set(HR * 0.48, HR * 0.18, HR * 0.92); head.add(eR);
  const pL = new THREE.Mesh(geoBox(HR * 0.17, HR * 0.17, HR * 0.10, 1), MAT_EYE_BLACK);
  pL.position.set(-HR * 0.48, HR * 0.18, HR * 0.96); head.add(pL);
  const pR = new THREE.Mesh(geoBox(HR * 0.17, HR * 0.17, HR * 0.10, 1), MAT_EYE_BLACK);
  pR.position.set(HR * 0.48, HR * 0.18, HR * 0.96); head.add(pR);
  const browMat = matB(0x888888);
  const bL = new THREE.Mesh(geoBox(HR * 0.48, HR * 0.11, HR * 0.10, 1), browMat);
  bL.position.set(-HR * 0.48, HR * 0.48, HR * 0.92); head.add(bL);
  const bR = new THREE.Mesh(geoBox(HR * 0.48, HR * 0.11, HR * 0.10, 1), browMat);
  bR.position.set(HR * 0.48, HR * 0.48, HR * 0.92); head.add(bR);
  const nose = new THREE.Mesh(geoBox(HR * 0.28, HR * 0.28, HR * 0.28, 3), skinMat);
  nose.position.set(0, -HR * 0.05, HR * 0.96); head.add(nose);
  const must = new THREE.Mesh(geoBox(HR * 0.85, HR * 0.16, HR * 0.10, 1), browMat);
  must.position.set(0, -HR * 0.30, HR * 0.94); head.add(must);
  const beard = new THREE.Mesh(geoBox(HR * 0.70, HR * 0.32, HR * 0.15, 1), browMat);
  beard.position.set(0, -HR * 0.72, HR * 0.85); head.add(beard);
  const mouth = new THREE.Mesh(geoBox(HR * 0.70, HR * 0.16, HR * 0.08, 1), matB(0x2B0000));
  mouth.position.set(0, -HR * 0.48, HR * 0.94); head.add(mouth);
  const woundHead = new THREE.Mesh(geoBox(HR * 0.45, HR * 0.22, HR * 0.10, 1), wound);
  woundHead.position.set(-HR * 0.35, HR * 0.62, HR * 0.80); head.add(woundHead);
}
function buildJudgeOutfit(spineUpper, body) {
  const wm = matL(0xF5F5F5);
  const cL = new THREE.Mesh(geoBox(0.06, 0.09, 0.015, 1), wm);
  cL.position.set(-0.05, 0.13, 0.11); cL.rotation.z = 0.5; spineUpper.add(cL);
  const cR = new THREE.Mesh(geoBox(0.06, 0.09, 0.015, 1), wm);
  cR.position.set(0.05, 0.13, 0.11); cR.rotation.z = -0.5; spineUpper.add(cR);
  const tie = new THREE.Mesh(geoBox(0.025, 0.16, 0.008, 1), matL(0xCC1111));
  tie.position.set(0, 0.04, 0.112); spineUpper.add(tie);
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
function pickType() {
  const entries = Object.entries(ZOMBIE_TYPES).filter(([k]) => k !== 'boss');
  const total = entries.reduce((s, [, v]) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) { r -= v.weight; if (r <= 0) return k; }
  return 'pt';
}

function createZombieMesh(opts = {}) {
  const typeKey = opts.type || pickType();
  const type = ZOMBIE_TYPES[typeKey] || ZOMBIE_TYPES.pt;
  const g = new THREE.Group();
  const skinColor = opts.skin !== undefined ? opts.skin : rand(SKIN_COLORS);
  const pantsColor = rand(PANTS_COLORS);
  const hairColor = rand(HAIR_COLORS);
  const body = opts.bodyIndex !== undefined ? BODY_TYPES[opts.bodyIndex] : rand(BODY_TYPES);

  const skinMat = zMat(skinColor);
  const shirtColor = typeKey === 'judge' ? SHIRT_BLACK : SHIRT_RED;
  const shirtMat = zMat(shirtColor);
  const pantsMat = zMat(typeKey === 'judge' ? 0x1A1A1A : pantsColor);
  const hairMat = zMat(hairColor);
  const shoeMat = zMat(0x1A1A1A);
  const wound = MAT_WOUND;

  // Personalidade visual aleatória
  const missingTeeth = Math.random() < 0.3 ? Math.floor(Math.random() * 5) : -1;
  const bloody = Math.random() < 0.4;

  const HR         = 0.115;
  const NECK_R     = 0.055;
  const NECK_H     = 0.09;
  const CHEST_W    = 0.34;
  const CHEST_D    = 0.21;
  const CHEST_H    = 0.34;
  const ABD_W      = 0.28;
  const ABD_D      = 0.18;
  const ABD_H      = 0.18;
  const PELVIS_W   = 0.30;
  const PELVIS_D   = 0.20;
  const PELVIS_H   = 0.14;
  const SHOULDER_R = 0.06;
  const UPPER_ARM_R = 0.048;
  const UPPER_ARM_H = 0.28;
  const ELBOW_R    = 0.048;
  const FOREARM_R  = 0.042;
  const FOREARM_H  = 0.26;
  const WRIST_R    = 0.036;
  const HAND_W     = 0.085;
  const HAND_H     = 0.055;
  const HAND_L     = 0.16;
  const HIP_R      = 0.070;
  const THIGH_R    = 0.085;
  const THIGH_H    = 0.40;
  const KNEE_R     = 0.062;
  const CALF_R     = 0.055;
  const CALF_H     = 0.38;
  const ANKLE_R    = 0.042;
  const FOOT_W     = 0.10;
  const FOOT_H     = 0.06;
  const FOOT_L     = 0.22;

  const pelvis = new THREE.Group();
  pelvis.position.y = P_PELVIS_Y;
  g.add(pelvis);
  const pelvisMesh = new THREE.Mesh(geoBox(PELVIS_W, PELVIS_H, PELVIS_D, 2), pantsMat);
  pelvisMesh.castShadow = true; pelvis.add(pelvisMesh);

  const spineLower = new THREE.Group();
  spineLower.position.y = P_SPINE_LOW_OFF;
  pelvis.add(spineLower);
  const abdomen = new THREE.Mesh(geoBox(ABD_W, ABD_H, ABD_D, 3), shirtMat);
  abdomen.castShadow = true; spineLower.add(abdomen);

  const spineUpper = new THREE.Group();
  spineUpper.position.y = P_SPINE_UP_OFF;
  spineLower.add(spineUpper);
  const chest = new THREE.Mesh(geoBox(CHEST_W, CHEST_H, CHEST_D, 3), shirtMat);
  chest.castShadow = true; spineUpper.add(chest);
  const upperChest = new THREE.Mesh(geoBox(CHEST_W * 1.04, CHEST_H * 0.32, CHEST_D * 1.02, 2), shirtMat);
  upperChest.position.y = CHEST_H * 0.34; spineUpper.add(upperChest);

  if (typeKey === 'pt' || typeKey === 'pt_donkey') {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(CHEST_W * 0.70, CHEST_H * 0.55), PT_DECAL_MAT);
    decal.position.set(0, 0.02, CHEST_D / 2 + 0.006);
    spineUpper.add(decal);
  }
  if (typeKey !== 'judge') {
    const collar = new THREE.Mesh(geoBox(CHEST_W * 0.88, 0.035, CHEST_D * 0.92, 1), MAT.metalDark);
    collar.position.y = CHEST_H * 0.48; spineUpper.add(collar);
  } else buildJudgeOutfit(spineUpper, body);

  const w1 = new THREE.Mesh(geoBox(0.07, 0.05, 0.01, 1), wound);
  w1.position.set(0.08, 0.02, CHEST_D / 2 + 0.005); spineUpper.add(w1);
  const w2 = new THREE.Mesh(geoBox(0.05, 0.07, 0.01, 1), wound);
  w2.position.set(-0.07, -0.02, ABD_D / 2 + 0.005); spineLower.add(w2);
  if (bloody) {
    const w3 = new THREE.Mesh(geoBox(0.10, 0.15, 0.01, 1), wound);
    w3.position.set(0.10, -0.10, ABD_D / 2 + 0.006); spineLower.add(w3);
    const w4 = new THREE.Mesh(geoBox(0.12, 0.08, 0.01, 1), wound);
    w4.position.set(-0.10, 0.15, CHEST_D / 2 + 0.006); spineUpper.add(w4);
  }

  const ribCage = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(geoTorus(CHEST_W * 0.40, 0.018, 6, 14, Math.PI), BONE_MAT);
    rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI;
    rib.position.y = 0.10 - i * 0.06; rib.visible = false; ribCage.add(rib);
  }
  const spineBone = new THREE.Mesh(geoCyl(0.025, 0.025, CHEST_H + ABD_H, 10), BONE_DARK_MAT);
  spineBone.visible = false; spineBone.position.y = -ABD_H * 0.3; ribCage.add(spineBone);
  spineUpper.add(ribCage);

  const neck = new THREE.Group();
  neck.position.y = CHEST_H * 0.5 + 0.04;
  spineUpper.add(neck);
  const neckMesh = new THREE.Mesh(geoCyl(NECK_R, NECK_R * 1.05, NECK_H, 12), skinMat);
  neckMesh.position.y = 0.04; neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 0.10 + NECK_H * 0.4 + HR * 0.55;
  neck.add(head);

  if (typeKey === 'pt' || typeKey === 'runner') {
    buildHumanHead(head, skinMat, hairMat, wound, Math.random() > 0.7, HR, { missingTeeth, bloody });
  } else if (typeKey === 'pt_donkey') {
    buildDonkeyHead(head, skinMat, wound, HR);
  } else {
    buildJudgeHead(head, skinMat, wound, HR);
  }

  const skullBone = new THREE.Mesh(geoSphere(HR * 0.85, 12), BONE_MAT);
  skullBone.visible = false; head.add(skullBone);
  const jawBone = new THREE.Mesh(geoBox(HR * 1.4, HR * 0.65, HR * 1.4, 2), BONE_DARK_MAT);
  jawBone.position.set(0, -HR * 0.95, HR * 0.15); jawBone.visible = false; head.add(jawBone);
  const sockGeo = geoSphere(HR * 0.22, 10);
  const sk1 = new THREE.Mesh(sockGeo, MAT_EYE_BLACK); sk1.position.set(-HR * 0.48, HR * 0.18, HR * 0.85); sk1.visible = false; head.add(sk1);
  const sk2 = new THREE.Mesh(sockGeo, MAT_EYE_BLACK); sk2.position.set(HR * 0.48, HR * 0.18, HR * 0.85); sk2.visible = false; head.add(sk2);
  const skTeeth = [];
  const skTeethGeo = geoBox(HR * 0.09, HR * 0.14, HR * 0.08, 1);
  for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(skTeethGeo, BONE_MAT); t.position.set(-HR * 0.28 + i * HR * 0.14, -HR * 0.48, HR * 0.90); t.visible = false; head.add(t); skTeeth.push(t); }

  function makeArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (CHEST_W * 0.5 + SHOULDER_R * 0.35), P_SHOULDER_Y, 0);
    spineUpper.add(shoulder);
    const shoulderBall = new THREE.Mesh(geoSphere(SHOULDER_R, 16), shirtMat);
    shoulderBall.castShadow = true; shoulder.add(shoulderBall);

    const upperArm = new THREE.Group();
    upperArm.position.y = -SHOULDER_R * 0.4;
    shoulder.add(upperArm);
    const upperMesh = new THREE.Mesh(geoCyl(UPPER_ARM_R, UPPER_ARM_R * 0.92, UPPER_ARM_H, 14), shirtMat);
    upperMesh.position.y = -UPPER_ARM_H / 2; upperMesh.castShadow = true; upperArm.add(upperMesh);

    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM_H - ELBOW_R * 0.3;
    upperArm.add(elbow);
    const elbowBall = new THREE.Mesh(geoSphere(ELBOW_R, 14), skinMat);
    elbowBall.castShadow = true; elbow.add(elbowBall);
    const forearmMesh = new THREE.Mesh(geoCyl(FOREARM_R, FOREARM_R * 0.9, FOREARM_H, 14), skinMat);
    forearmMesh.position.y = -FOREARM_H / 2; forearmMesh.castShadow = true; elbow.add(forearmMesh);

    const hand = new THREE.Group();
    hand.position.y = -FOREARM_H - WRIST_R * 0.3;
    elbow.add(hand);
    const wristBall = new THREE.Mesh(geoSphere(WRIST_R, 12), skinMat);
    wristBall.castShadow = true; hand.add(wristBall);
    const handMesh = new THREE.Mesh(geoBox(HAND_W, HAND_H, HAND_L, 3), skinMat);
    handMesh.position.set(0, -HAND_H * 0.9, HAND_L * 0.10); handMesh.castShadow = true; hand.add(handMesh);
    const fingerGeo = geoBox(HAND_W * 0.20, HAND_H * 0.5, HAND_L * 0.30, 1);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(fingerGeo, skinMat);
      f.position.set(-HAND_W * 0.32 + i * HAND_W * 0.21, -HAND_H * 1.6, HAND_L * 0.20);
      hand.add(f);
    }
    const thumb = new THREE.Mesh(geoBox(HAND_W * 0.22, HAND_H * 0.5, HAND_L * 0.30, 1), skinMat);
    thumb.position.set(side * HAND_W * 0.48, -HAND_H * 1.2, HAND_L * 0.22);
    hand.add(thumb);

    const boneMeshes = [];
    const humerus = new THREE.Mesh(geoCyl(UPPER_ARM_R * 0.8, UPPER_ARM_R * 0.7, UPPER_ARM_H * 0.9, 10), BONE_MAT);
    humerus.position.y = -UPPER_ARM_H / 2; humerus.visible = false; upperArm.add(humerus); boneMeshes.push(humerus);
    const humTop = new THREE.Mesh(geoSphere(SHOULDER_R * 0.85, 10), BONE_MAT);
    humTop.visible = false; shoulder.add(humTop); boneMeshes.push(humTop);
    const humBot = new THREE.Mesh(geoSphere(ELBOW_R * 0.9, 10), BONE_MAT);
    humBot.position.y = -UPPER_ARM_H - ELBOW_R * 0.3; humBot.visible = false; upperArm.add(humBot); boneMeshes.push(humBot);
    const radiusB = new THREE.Mesh(geoCyl(FOREARM_R * 0.8, FOREARM_R * 0.7, FOREARM_H * 0.9, 10), BONE_MAT);
    radiusB.position.y = -FOREARM_H / 2; radiusB.visible = false; elbow.add(radiusB); boneMeshes.push(radiusB);
    const radBot = new THREE.Mesh(geoSphere(WRIST_R * 0.9, 10), BONE_MAT);
    radBot.position.y = -FOREARM_H - WRIST_R * 0.3; radBot.visible = false; elbow.add(radBot); boneMeshes.push(radBot);
    const handBone = new THREE.Mesh(geoBox(HAND_W * 0.7, HAND_H * 0.8, HAND_L * 0.85, 1), BONE_MAT);
    handBone.position.set(0, -HAND_H * 0.9, HAND_L * 0.10); handBone.visible = false; hand.add(handBone); boneMeshes.push(handBone);

    const outerMeshes = [shoulderBall, upperMesh, elbowBall, forearmMesh, wristBall, handMesh];
    shoulder.userData = { outerMeshes, boneMeshes, upperArm, elbow, hand };
    return { shoulder, upperArm, elbow, hand };
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * P_HIP_X, P_HIP_Y_OFF, 0);
    pelvis.add(hip);
    const hipBall = new THREE.Mesh(geoSphere(HIP_R, 16), pantsMat);
    hipBall.castShadow = true; hip.add(hipBall);

    const thigh = new THREE.Group();
    thigh.position.y = -HIP_R * 0.5;
    hip.add(thigh);
    const thighMesh = new THREE.Mesh(geoCyl(THIGH_R, THIGH_R * 0.88, THIGH_H, 14), pantsMat);
    thighMesh.position.y = -THIGH_H / 2; thighMesh.castShadow = true; thigh.add(thighMesh);

    const knee = new THREE.Group();
    knee.position.y = -THIGH_H - KNEE_R * 0.3;
    thigh.add(knee);
    const kneeBall = new THREE.Mesh(geoSphere(KNEE_R, 14), pantsMat);
    kneeBall.castShadow = true; knee.add(kneeBall);
    const calfMesh = new THREE.Mesh(geoCyl(CALF_R, CALF_R * 0.82, CALF_H, 14), pantsMat);
    calfMesh.position.y = -CALF_H / 2; calfMesh.castShadow = true; knee.add(calfMesh);

    const foot = new THREE.Group();
    foot.position.y = -CALF_H - ANKLE_R * 0.3;
    knee.add(foot);
    const ankleBall = new THREE.Mesh(geoSphere(ANKLE_R, 12), shoeMat);
    ankleBall.castShadow = true; foot.add(ankleBall);
    const shoeMesh = new THREE.Mesh(geoBox(FOOT_W, FOOT_H, FOOT_L, 3), shoeMat);
    shoeMesh.position.set(0, -FOOT_H * 0.6, FOOT_L * 0.15); shoeMesh.castShadow = true; foot.add(shoeMesh);
    const toeMesh = new THREE.Mesh(geoBox(FOOT_W * 0.95, FOOT_H * 0.55, FOOT_L * 0.25, 2), shoeMat);
    toeMesh.position.set(0, -FOOT_H * 0.7, FOOT_L * 0.55); foot.add(toeMesh);

    const boneMeshes = [];
    const femur = new THREE.Mesh(geoCyl(THIGH_R * 0.8, THIGH_R * 0.7, THIGH_H * 0.9, 10), BONE_MAT);
    femur.position.y = -THIGH_H / 2; femur.visible = false; thigh.add(femur); boneMeshes.push(femur);
    const femTop = new THREE.Mesh(geoSphere(HIP_R * 0.85, 10), BONE_MAT);
    femTop.visible = false; hip.add(femTop); boneMeshes.push(femTop);
    const femBot = new THREE.Mesh(geoSphere(KNEE_R * 0.9, 10), BONE_MAT);
    femBot.position.y = -THIGH_H - KNEE_R * 0.3; femBot.visible = false; thigh.add(femBot); boneMeshes.push(femBot);
    const tibia = new THREE.Mesh(geoCyl(CALF_R * 0.8, CALF_R * 0.7, CALF_H * 0.9, 10), BONE_MAT);
    tibia.position.y = -CALF_H / 2; tibia.visible = false; knee.add(tibia); boneMeshes.push(tibia);
    const tibBot = new THREE.Mesh(geoSphere(ANKLE_R * 0.9, 10), BONE_MAT);
    tibBot.position.y = -CALF_H - ANKLE_R * 0.3; tibBot.visible = false; knee.add(tibBot); boneMeshes.push(tibBot);
    const footBone = new THREE.Mesh(geoBox(FOOT_W * 0.8, FOOT_H * 0.5, FOOT_L * 0.85, 1), BONE_DARKER);
    footBone.position.set(0, -FOOT_H * 0.6, FOOT_L * 0.15); footBone.visible = false; foot.add(footBone); boneMeshes.push(footBone);

    const outerMeshes = [hipBall, thighMesh, kneeBall, calfMesh, ankleBall, shoeMesh];
    hip.userData = { outerMeshes, boneMeshes, thigh, knee, foot };
    return { hip, thigh, knee, foot };
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  g.scale.set(body.slim * type.scale, body.tall * type.scale, body.slim * type.scale);

  const localBoxes = {
    head: computePartLocalBox(head),
    torso: computePartLocalBox(spineLower),
    armL: computePartLocalBox(armL.shoulder),
    armR: computePartLocalBox(armR.shoulder),
    legL: computePartLocalBox(legL.hip),
    legR: computePartLocalBox(legR.hip),
  };

  g.userData = {
    armL: armL.shoulder, armR: armR.shoulder,
    legL: legL.hip, legR: legR.hip,
    head, torso: spineLower,
    ribCage, skullBone, jawBone, sk1, sk2, skTeeth,
    joints: {
      pelvis, spineLower, spineUpper, neck, head,
      shoulderL: armL.shoulder, upperArmL: armL.upperArm, elbowL: armL.elbow, handL: armL.hand,
      shoulderR: armR.shoulder, upperArmR: armR.upperArm, elbowR: armR.elbow, handR: armR.hand,
      hipL: legL.hip, thighL: legL.thigh, kneeL: legL.knee, footL: legL.foot,
      hipR: legR.hip, thighR: legR.thigh, kneeR: legR.knee, footR: legR.foot,
    },
    skinColor, shirtColor,
    pantsColor, bodyType: body, heightScale: type.scale,
    zombieType: typeKey, typeKey, type, localBoxes,
    headLoll: (Math.random() - 0.5) * 0.35,
    headPitchBase: 0.05 + Math.random() * 0.15,
    armDroopL: -(Math.random() * 0.3),
    armDroopR: -(Math.random() * 0.3),
    limpAmount: Math.random() * 0.12,
    limpSide: Math.random() < 0.5 ? 'L' : 'R',
    walkStyle: Math.random(),
  };

  return g;
}

// ============================================================
// ANIM STATE
// ============================================================
function makeAnimState() {
  return {
    pelvisRoll: 0, pelvisTwist: 0, pelvisBob: 0,
    spineTwist: 0, spineLean: 0.10, spineRoll: 0, spineSide: 0,
    headTwist: 0, headRoll: 0, headPitch: 0,
    armLX: 0, armRX: 0, elbowLX: 0, elbowRX: 0,
    thighLX: 0, thighRX: 0, kneeLX: 0, kneeRX: 0, footLX: 0, footRX: 0,
    pelvisRollVel: 0, pelvisTwistVel: 0, pelvisBobVel: 0,
    spineTwistVel: 0, spineLeanVel: 0, spineRollVel: 0, spineSideVel: 0,
    headTwistVel: 0, headRollVel: 0, headPitchVel: 0,
    armLXVel: 0, armRXVel: 0, elbowLXVel: 0, elbowRXVel: 0,
    thighLXVel: 0, thighRXVel: 0, kneeLXVel: 0, kneeRXVel: 0, footLXVel: 0, footRXVel: 0,
    bankX: 0, bankZ: 0, bankXVel: 0, bankZVel: 0,
  };
}

let groanTimer = 0;

function spawnZombie(forceType) {
  const cave = caves[Math.floor(Math.random() * caves.length)];
  const toCX = -cave.x, toCZ = -cave.z;
  const len = Math.sqrt(toCX * toCX + toCZ * toCZ) || 1;
  const dirX = toCX / len, dirZ = toCZ / len;
  const back = 0.8 + Math.random() * 0.8;
  const side = (Math.random() - 0.5) * 1.6;
  const spawnX = cave.x + dirX * back + (-dirZ) * side;
  const spawnZ = cave.z + dirZ * back + dirX * side;

  const typeKey = forceType || pickType();
  const type = ZOMBIE_TYPES[typeKey];
  const mesh = createZombieMesh({ type: typeKey });
  mesh.position.set(spawnX, 0, spawnZ);
  scene.add(mesh);

  // Escala por wave
  const hpScale = 1 + CONFIG.scaling.hpPerWave * Math.max(0, state.wave - 1);
  const dmgScale = 1 + CONFIG.scaling.dmgPerWave * Math.max(0, state.wave - 1);
  const spdScale = Math.min(CONFIG.scaling.speedCap, 1 + CONFIG.scaling.speedPerWave * Math.max(0, state.wave - 1));

  const baseHP = CONFIG.zombie.maxHealth * type.hpMul * hpScale;
  const baseDamage = CONFIG.zombie.damage * type.dmgMul * dmgScale;

  const z = {
    id: nextId('z'), mesh,
    health: baseHP, maxHealth: baseHP, damage: baseDamage,
    speed: CONFIG.zombie.speed * type.speedMul * spdScale,
    scale: type.scale, radius: CONFIG.zombie.radius * type.scale,
    attackRange: type.attackRange, attackCooldown: type.cooldown,
    xpReward: Math.round(CONFIG.zombie.xpReward * type.xpMul * hpScale),
    coinReward: Math.round(CONFIG.zombie.coinReward * type.coinMul * (1 + (state.wave - 1) * 0.05)),
    isBoss: typeKey === 'boss',
    typeKey,
    lastAttackTime: 0, walkPhase: Math.random() * Math.PI * 2,
    hitReactEndTime: 0, hitDirection: new THREE.Vector3(),
    dismembered: { head: false, armL: false, armR: false, legL: false, legR: false },
    emergeTime: 0, anim: makeAnimState(),
    headLoll: mesh.userData.headLoll,
    headPitchBase: mesh.userData.headPitchBase,
    armDroopL: mesh.userData.armDroopL,
    armDroopR: mesh.userData.armDroopR,
    limpAmount: mesh.userData.limpAmount,
    limpSide: mesh.userData.limpSide,
    walkStyle: mesh.userData.walkStyle,
    vx: 0, vz: 0, yawVel: 0,
    alertedUntil: 0,
    flinch: { head: null, armL: null, armR: null, legL: null, legR: null, torso: null },
  };
  zombies.push(z);
  state.zombiesAlive++;

  bus.emit(Ev.ZOMBIE_SPAWNED, { id: z.id, type: typeKey, isBoss: z.isBoss, pos: { x: mesh.position.x, y: 0, z: mesh.position.z } });
  updateHUD();
}

function disposeZombieMesh(mesh) {
  mesh.traverse(c => {
    // Geometrias e materiais são compartilhados — não dispose
    if (c.geometry) c.geometry = null;
    if (c.material) c.material = null;
  });
}

// ============================================================
// SANGUE
// ============================================================
const bloodGeoShared = new THREE.BoxGeometry(1, 1, 1);
const bloodPool = [];
const bloodActive = [];
function acquireBloodParticle() {
  let p = bloodPool.pop();
  if (!p) p = { mesh: new THREE.Mesh(bloodGeoShared, new THREE.MeshBasicMaterial({ transparent: true })), vel: new THREE.Vector3(), life: 0, maxLife: 0 };
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
      const a = (Math.random() - 0.5) * 1.8, b = (Math.random() - 0.5) * 1.8;
      const speed = (big ? 9 : 5) + Math.random() * 6;
      p.vel.copy(dirN).multiplyScalar(speed);
      p.vel.addScaledVector(perp1, a * speed * 0.5);
      p.vel.addScaledVector(perp2, b * speed * 0.5);
      p.vel.y += 3 + Math.random() * 4;
    } else p.vel.set((Math.random() - 0.5) * 8, Math.random() * 5 + 3, (Math.random() - 0.5) * 8);
    p.life = 1.2; p.maxLife = 1.2;
    scene.add(p.mesh);
    bloodActive.push(p);
  }
}
function updateParticles(dt) {
  for (let i = bloodActive.length - 1; i >= 0; i--) {
    const p = bloodActive[i];
    p.vel.y -= 16 * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.y = -p.vel.y * 0.3; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    if (p.life <= 0) { scene.remove(p.mesh); bloodPool.push(p); bloodActive.splice(i, 1); }
  }
}
const bloodPools = [];
function spawnBloodPool(position) {
  const size = 0.7 + Math.random() * 0.5;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(size, 10), new THREE.MeshBasicMaterial({ color: 0x6B0000, transparent: true, opacity: 0.75, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.rotation.z = Math.random() * Math.PI * 2;
  pool.position.set(position.x, 0.03, position.z); pool.renderOrder = 1;
  scene.add(pool);
  bloodPools.push({ mesh: pool, life: 25 });
  if (bloodPools.length > 15) { const old = bloodPools.shift(); scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); }
}
function updateBloodPools(dt) {
  for (let i = bloodPools.length - 1; i >= 0; i--) {
    const b = bloodPools[i];
    b.life -= dt;
    if (b.life < 3) b.mesh.material.opacity = Math.max(0, (b.life / 3) * 0.75);
    if (b.life <= 0) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bloodPools.splice(i, 1); }
  }
}

// ============================================================
// DEBRIS + RAGDOLL
// ============================================================
class Debris {
  constructor(mesh, size, mass, life = 35) {
    this.mesh = mesh; this.size = size; this.mass = mass;
    this.velocity = new THREE.Vector3(); this.angularVelocity = new THREE.Vector3();
    this.settled = false; this.settleTimer = 0;
    this.life = life; this.maxLife = life;
    this.key = 'piece';
    this.lastHitZombie = new Map();
    this.lastGlobalHit = 0;
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
        const sSq = this.velocity.lengthSq(), aSq = this.angularVelocity.lengthSq();
        if (sSq < 0.12 && aSq < 0.35) {
          this.settleTimer += dt;
          if (this.settleTimer > 0.4) { this.settled = true; this.velocity.set(0, 0, 0); this.angularVelocity.set(0, 0, 0); }
        } else this.settleTimer = 0;
      }
    }
    if (this.life < 3) {
      const op = Math.max(0, this.life / 3);
      this.mesh.traverse(c => {
        if (c.material && c.material.transparent !== false) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(m => { m.transparent = true; m.opacity = op; });
        }
      });
    }
    return false;
  }
  dispose() { scene.remove(this.mesh); }
}

const ragdolls = [];
const _wpTmp = new THREE.Vector3();
const _wqTmp = new THREE.Quaternion();
class Ragdoll {
  constructor(zombieMesh, hitDir, hitStrength, missingParts) {
    zombieMesh.updateMatrixWorld(true);
    this.pieces = [];
    this.lastHitTime = performance.now() / 1000;
    this.settleStart = 0;
    this.state = 'falling';
    this.fadeProgress = 0;
    const ud = zombieMesh.userData;
    const bt = ud.bodyType || BODY_TYPES[1];
    const hitDirN = hitDir.clone(); hitDirN.y = 0; hitDirN.normalize();
    const defs = [
      { key: 'torso', obj: ud.torso, size: new THREE.Vector3(bt.torsoW, 0.85, bt.torsoD), mass: 8 },
      { key: 'head', obj: ud.head, size: new THREE.Vector3(0.4, 0.4, 0.4), mass: 2.5 },
      { key: 'armL', obj: ud.armL, size: new THREE.Vector3(bt.arm * 1.2, 1.0, bt.arm * 1.2), mass: 0.9 },
      { key: 'armR', obj: ud.armR, size: new THREE.Vector3(bt.arm * 1.2, 1.0, bt.arm * 1.2), mass: 0.9 },
      { key: 'legL', obj: ud.legL, size: new THREE.Vector3(bt.leg * 1.1, 1.1, bt.leg * 1.1), mass: 1.3 },
      { key: 'legR', obj: ud.legR, size: new THREE.Vector3(bt.leg * 1.1, 1.1, bt.leg * 1.1), mass: 1.3 },
    ];
    const order = ['head', 'armL', 'armR', 'legL', 'legR', 'torso'];
    const defMap = Object.fromEntries(defs.map(d => [d.key, d]));
    for (const key of order) {
      const def = defMap[key];
      if (missingParts[key] || !def || !def.obj) continue;
      const obj = def.obj;
      obj.getWorldPosition(_wpTmp);
      obj.getWorldQuaternion(_wqTmp);
      obj.rotation.set(0, 0, 0);
      if (obj.parent) obj.parent.remove(obj);
      scene.add(obj);
      obj.position.copy(_wpTmp);
      obj.quaternion.copy(_wqTmp);
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
      piece.key = key;
      const base = CONFIG.ragdoll.impactImpulse * hitStrength;
      piece.applyImpulse(new THREE.Vector3(
        hitDirN.x * base + (Math.random() - 0.5) * 2,
        base * 0.6 + Math.random() * 2,
        hitDirN.z * base + (Math.random() - 0.5) * 2
      ));
      piece.applyTorque(new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20));
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
    best.life = CONFIG.dismember.limbLife; best.maxLife = CONFIG.dismember.limbLife;
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
    if (this.state === 'falling') { if (all) { this.state = 'settled'; this.settleStart = performance.now() / 1000; } }
    else if (this.state === 'settled') {
      const el = performance.now() / 1000 - this.settleStart;
      const sh = performance.now() / 1000 - this.lastHitTime;
      if (el > CONFIG.ragdoll.settleTime && sh > CONFIG.ragdoll.settleTime) {
        this.state = 'fading'; this.fadeProgress = 0;
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
  if (ragdolls.length >= CONFIG.ragdoll.maxActive) { const oldest = ragdolls.shift(); oldest.dispose(); }
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
  limbObj.getWorldPosition(_wpTmp);
  limbObj.getWorldQuaternion(_wqTmp);
  if (key === 'head') {
    ud.skullBone.visible = true; ud.jawBone.visible = true; ud.sk1.visible = true; ud.sk2.visible = true;
    ud.skTeeth.forEach(t => t.visible = true);
    limbObj.children.forEach(c => {
      if (c === ud.skullBone || c === ud.jawBone || c === ud.sk1 || c === ud.sk2) return;
      if (ud.skTeeth.includes(c)) return;
      if (c.isMesh) c.visible = false;
    });
  } else {
    if (limbObj.userData.outerMeshes) limbObj.userData.outerMeshes.forEach(m => m.visible = false);
    if (limbObj.userData.boneMeshes) limbObj.userData.boneMeshes.forEach(m => m.visible = true);
  }
  z.dismembered[key] = true;
  const bt = ud.bodyType || BODY_TYPES[1];
  let size, color;
  if (key === 'head') { size = new THREE.Vector3(0.4, 0.4, 0.4); color = ud.skinColor; }
  else if (key === 'armL' || key === 'armR') { size = new THREE.Vector3(bt.arm * 1.2, 1.0, bt.arm * 1.2); color = ud.shirtColor; }
  else { size = new THREE.Vector3(bt.leg * 1.1, 1.1, bt.leg * 1.1); color = ud.pantsColor; }
  const geo = geoBox(size.x, size.y, size.z, 2);
  const mat = zMat(color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(_wpTmp);
  mesh.quaternion.copy(_wqTmp);
  mesh.castShadow = true;
  scene.add(mesh);
  const piece = new Debris(mesh, size, 1.2, CONFIG.dismember.limbLife);
  piece.key = key;
  const dir = hitDir.clone().normalize();
  const speed = CONFIG.dismember.limbSpeed;
  piece.velocity.set(dir.x * speed + (Math.random() - 0.5) * 6, speed * 0.8 + Math.random() * 5, dir.z * speed + (Math.random() - 0.5) * 6);
  piece.angularVelocity.set((Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35);
  flyingLimbs.push(piece);
  spawnBlood(_wpTmp, dir, 35, true);
  spawnBlood(_wpTmp, null, 15, true);
  bus.emit(Ev.DISMEMBER, { zombieId: z.id, part: key, pos: { x: _wpTmp.x, y: _wpTmp.y, z: _wpTmp.z } });
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
  for (let i = available.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [available[i], available[j]] = [available[j], available[i]]; }
  for (let i = 0; i < partsToLose && i < available.length; i++) {
    const part = available[i];
    const dir = new THREE.Vector3((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 2).normalize();
    detachLimb(z, part, dir);
    if (part === 'head') z.health = 0;
  }
}

// ============================================================
// FÍSICA DE PEDAÇOS
// ============================================================
const _debrisDir = new THREE.Vector3();
function checkDebrisZombieCollision() {
  const now = performance.now() / 1000;
  const allPieces = [...flyingLimbs];
  for (const r of ragdolls) { if (r.state === 'fading') continue; for (const p of r.pieces) allPieces.push(p); }
  for (const piece of allPieces) {
    if (piece.settled) continue;
    const y = piece.mesh.position.y;
    if (y < 0.55 || y > 2.1) continue;
    const speed2 = piece.velocity.lengthSq();
    if (speed2 < CONFIG.debris.minHitSpeed2 * CONFIG.debris.minHitSpeed2) continue;
    if (now - (piece.lastGlobalHit || 0) < 0.18) continue;
    for (const z of zombies) {
      if (z.health <= 0) continue;
      const dx = z.mesh.position.x - piece.mesh.position.x;
      const dz = z.mesh.position.z - piece.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const minD = CONFIG.debris.pushRadiusBonus + z.radius;
      if (d2 >= minD * minD || d2 < 0.001) continue;
      const last = piece.lastHitZombie.get(z.id) || 0;
      if (now - last < 0.5) continue;
      const zTopY = 2.0 * z.scale;
      if (y > zTopY) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const velMag = Math.sqrt(speed2);
      const dot = (piece.velocity.x * nx + piece.velocity.z * nz) / velMag;
      if (dot < 0.15) continue;
      piece.lastHitZombie.set(z.id, now);
      piece.lastGlobalHit = now;
      const force = Math.min(3.0, Math.sqrt(speed2) * Math.min(2, piece.mass) * 0.12);
      _debrisDir.set(nx, 0, nz);
      applyHitReaction(z, 'torso', _debrisDir, force);
      z.hitReactEndTime = now + 0.15 + force * 0.18;
      z.hitDirection.copy(_debrisDir);
      const pushZ = force * 0.09 / Math.max(0.5, z.scale);
      z.mesh.position.x += nx * pushZ;
      z.mesh.position.z += nz * pushZ;
      z.vx -= nx * pushZ * 2; z.vz -= nz * pushZ * 2;
      const bounce = Math.min(5, force * 2.0);
      piece.velocity.x = -nx * bounce + (Math.random() - 0.5) * 2.5;
      piece.velocity.z = -nz * bounce + (Math.random() - 0.5) * 2.5;
      piece.velocity.y = Math.max(1.5, piece.velocity.y * 0.5);
      piece.angularVelocity.multiplyScalar(1.8);
      piece.settled = false; piece.settleTimer = 0;
      if (force > 0.9) Sfx.playDebrisImpact();
      if (force > 1.5) addShake(0.03 * force);
    }
  }
}

// ============================================================
// RAYCAST
// ============================================================
function rayAABB(origin, dir, min, max, maxDist) {
  let tMin = 0, tMax = maxDist;
  const axes = [
    { o: origin.x, d: dir.x, mn: min.x, mx: max.x },
    { o: origin.y, d: dir.y, mn: min.y, mx: max.y },
    { o: origin.z, d: dir.z, mn: min.z, mx: max.z },
  ];
  for (const { o, d, mn, mx } of axes) {
    if (Math.abs(d) < 1e-6) { if (o < mn || o > mx) return null; }
    else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tMin = Math.max(tMin, t1); tMax = Math.min(tMax, t2);
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
      if (t !== null && t < bestDist) { bestDist = t; bestZ = z; bestPart = p.key; bestPoint = origin.clone().addScaledVector(dir, t); }
    }
  }
  return { zombie: bestZ, part: bestPart, distance: bestDist, point: bestPoint };
}

function applyHitReaction(z, part, hitDirWorld, force = 1) {
  const localDir = hitDirWorld.clone();
  const zQuat = z.mesh.quaternion.clone();
  zQuat.invert();
  localDir.applyQuaternion(zQuat);
  const s = Math.min(2.0, force);
  const anim = z.anim;
  const now = performance.now() / 1000;

  if (part === 'head') {
    z.flinch.head = { until: now + 0.6, dirX: localDir.x, dirZ: localDir.z, strength: s };
    springKick(anim, 'headTwistVel', localDir.x * s * 16);
    springKick(anim, 'headRollVel', -localDir.x * s * 14);
    springKick(anim, 'headPitchVel', localDir.z * s * 18);
    springKick(anim, 'spineTwistVel', localDir.x * s * 5);
    springKick(anim, 'spineLeanVel', localDir.z * s * 4);
    springKick(anim, 'kneeLXVel', s * 3);
    springKick(anim, 'kneeRXVel', s * 3);
  } else if (part === 'torso') {
    z.flinch.torso = { until: now + 0.5, dirX: localDir.x, dirZ: localDir.z, strength: s };
    springKick(anim, 'spineLeanVel', localDir.z * s * 10);
    springKick(anim, 'spineTwistVel', localDir.x * s * 9);
    springKick(anim, 'spineRollVel', -localDir.x * s * 8);
    springKick(anim, 'spineSideVel', localDir.x * s * 7);
    springKick(anim, 'pelvisTwistVel', localDir.x * s * 4);
    springKick(anim, 'pelvisRollVel', -localDir.x * s * 5);
    springKick(anim, 'headTwistVel', -localDir.x * s * 5);
    springKick(anim, 'headPitchVel', localDir.z * s * 7);
    springKick(anim, 'armLXVel', localDir.z * s * 5);
    springKick(anim, 'armRXVel', localDir.z * s * 5);
  } else if (part === 'armL') {
    z.flinch.armL = { until: now + 0.55, dirX: localDir.x, dirZ: localDir.z, strength: s };
    springKick(anim, 'armLXVel', -s * 18);
    springKick(anim, 'elbowLXVel', s * 22);
    springKick(anim, 'spineTwistVel', -localDir.x * s * 4);
    springKick(anim, 'spineSideVel', localDir.x * s * 3);
    springKick(anim, 'pelvisRollVel', localDir.x * s * 4);
    springKick(anim, 'headTwistVel', -localDir.x * s * 4);
  } else if (part === 'armR') {
    z.flinch.armR = { until: now + 0.55, dirX: localDir.x, dirZ: localDir.z, strength: s };
    springKick(anim, 'armRXVel', -s * 18);
    springKick(anim, 'elbowRXVel', s * 22);
    springKick(anim, 'spineTwistVel', -localDir.x * s * 4);
    springKick(anim, 'spineSideVel', -localDir.x * s * 3);
    springKick(anim, 'pelvisRollVel', -localDir.x * s * 4);
    springKick(anim, 'headTwistVel', localDir.x * s * 4);
  } else if (part === 'legL') {
    z.flinch.legL = { until: now + 0.75, dirX: localDir.x, dirZ: localDir.z, strength: s };
    springKick(anim, 'thighLXVel', -s * 14);
    springKick(anim, 'kneeLXVel', s * 24);
    springKick(anim, 'footLXVel', -s * 6);
    springKick(anim, 'pelvisRollVel', localDir.x * s * 8);
    springKick(anim, 'pelvisTwistVel', localDir.x * s * 6);
    springKick(anim, 'spineSideVel', -localDir.x * s * 7);
    springKick(anim, 'spineLeanVel', Math.abs(localDir.z) * s * 5);
    springKick(anim, 'armLXVel', -s * 6);
    springKick(anim, 'armRXVel', -s * 6);
    springKick(anim, 'headPitchVel', s * 8);
    springKick(anim, 'headTwistVel', -localDir.x * s * 4);
  } else if (part === 'legR') {
    z.flinch.legR = { until: now + 0.75, dirX: localDir.x, dirZ: localDir.z, strength: s };
    springKick(anim, 'thighRXVel', -s * 14);
    springKick(anim, 'kneeRXVel', s * 24);
    springKick(anim, 'footRXVel', -s * 6);
    springKick(anim, 'pelvisRollVel', -localDir.x * s * 8);
    springKick(anim, 'pelvisTwistVel', -localDir.x * s * 6);
    springKick(anim, 'spineSideVel', localDir.x * s * 7);
    springKick(anim, 'spineLeanVel', Math.abs(localDir.z) * s * 5);
    springKick(anim, 'armLXVel', -s * 6);
    springKick(anim, 'armRXVel', -s * 6);
    springKick(anim, 'headPitchVel', s * 8);
    springKick(anim, 'headTwistVel', localDir.x * s * 4);
  }
}

// ============================================================
// FX
// ============================================================
const hitMarker = document.getElementById('hit-marker');
const damageFlash = document.getElementById('damage-flash');
function showHitMarker(critical = false) {
  hitMarker.classList.remove('active');
  if (critical) hitMarker.classList.add('critical'); else hitMarker.classList.remove('critical');
  void hitMarker.offsetWidth;
  hitMarker.classList.add('active');
  setTimeout(() => hitMarker.classList.remove('critical'), 300);
}
function showDamageFlash() { damageFlash.classList.add('active'); setTimeout(() => damageFlash.classList.remove('active'), 120); }
function addShake(amount) { state.shake = Math.min(0.7, state.shake + amount); }
const muzzleLight = new THREE.PointLight(0xFFAA33, 0, 8, 2);
scene.add(muzzleLight);
let muzzleLightEnd = 0;
function spawnMuzzleFlash() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  muzzleLight.position.copy(camera.position).addScaledVector(dir, 1.4);
  muzzleLightEnd = performance.now() / 1000 + 0.08; muzzleLight.intensity = 4;
}
const tracerPool = [], tracers = [];
function spawnTracer(from, to) {
  let t = tracerPool.pop();
  if (!t) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xFFDD33, transparent: true, opacity: 0.9 });
    t = { mesh: new THREE.Line(geo, mat), life: 0 }; scene.add(t.mesh);
  }
  const arr = t.mesh.geometry.attributes.position.array;
  arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
  arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
  t.mesh.geometry.attributes.position.needsUpdate = true;
  t.mesh.visible = true; t.mesh.material.opacity = 0.9; t.life = 0.08;
  tracers.push(t);
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / 0.08);
    if (t.life <= 0) { t.mesh.visible = false; tracerPool.push(t); tracers.splice(i, 1); }
  }
}
const explosions = [];
function spawnExplosion(pos) {
  const light = new THREE.PointLight(0xFF6600, 8, 14, 2);
  light.position.copy(pos); light.position.y += 1; scene.add(light);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFFAA33, transparent: true, opacity: 1 }));
  sphere.position.copy(pos); sphere.position.y += 0.5; scene.add(sphere);
  spawnBlood(pos, null, 30, true);
  addShake(CONFIG.shake.explosion);
  const radius = CONFIG.launcher.explosionRadius;
  const baseDamage = WEAPONS.launcher.damage * state.damageMult;
  const snapshot = [...zombies];
  for (const z of snapshot) {
    const dx = z.mesh.position.x - pos.x, dz = z.mesh.position.z - pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > radius) continue;
    const falloff = 1 - Math.min(1, d / radius);
    const dmg = baseDamage * Math.max(0.25, falloff);
    const dir = new THREE.Vector3(dx / Math.max(d, 0.01), 0, dz / Math.max(d, 0.01));
    damageZombie(z, dmg, false, 'torso', dir, z.mesh.position.clone().setY(1), 'explosion');
  }
  const ddx = player.position.x - pos.x, ddz = player.position.z - pos.z;
  const selfD = Math.sqrt(ddx * ddx + ddz * ddz);
  if (selfD < radius && !state.downed) {
    const dmg = baseDamage * CONFIG.launcher.selfDamageFactor * (1 - selfD / radius);
    state.health -= dmg; showDamageFlash(); updateHUD();
    if (state.health <= 0) enterDownedState();
  }
  explosions.push({ sphere, light, life: 0.35, maxLife: 0.35 });
}
function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.life -= dt;
    const t = 1 - e.life / e.maxLife;
    e.sphere.scale.setScalar(1 + t * 10);
    e.sphere.material.opacity = 1 - t;
    e.light.intensity = 8 * (1 - t);
    if (e.life <= 0) { scene.remove(e.sphere); scene.remove(e.light); e.sphere.geometry.dispose(); e.sphere.material.dispose(); explosions.splice(i, 1); }
  }
}

// ============================================================
// DAMAGE / RELOAD / ATTACK
// ============================================================
function damageZombie(z, damage, isCrit, part, hitDir, hitPoint, sourceType) {
  z.health -= damage;
  const isHead = part === 'head';
  bus.emit(Ev.DAMAGE, { attackerId: player.id, victimId: z.id, amount: damage, part, isCrit, headshot: isHead, sourceType, weaponId: state.inventory[state.currentSlot], pos: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } });
  spawnBlood(hitPoint, hitDir, (isCrit || isHead) ? 35 : 18, isHead);
  if (isCrit || isHead) spawnBlood(hitPoint, null, 15, true);
  if (sourceType === 'melee') Sfx.playKnifeHitFlesh();
  else if (sourceType !== 'explosion') Sfx.playBulletImpact();
  showHitMarker(isCrit || isHead);
  addShake(CONFIG.shake.hit);
  applyHitReaction(z, part, hitDir, isCrit || isHead ? 1.4 : 1.0);
  if (isCrit || isHead) {
        let limb = null;
    const roll = Math.random();
    if (part === 'head' && !z.dismembered.head) { if (roll < CONFIG.dismember.headChance) limb = 'head'; }
    else if (part === 'torso') {
      const opts = [];
      if (!z.dismembered.armL) opts.push('armL');
      if (!z.dismembered.armR) opts.push('armR');
      if (opts.length > 0 && roll < CONFIG.dismember.armChance) limb = opts[Math.floor(Math.random() * opts.length)];
    } else if (part === 'armL' || part === 'armR' || part === 'legL' || part === 'legR') {
      if (!z.dismembered[part] && roll < 0.65) limb = part;
    }
    if (limb) { detachLimb(z, limb, hitDir); if (limb === 'head') z.health = 0; }
  }

  // ============================================================
  // AGGRO: zumbis atingidos alertam vizinhos (mas o zumbi em si
  // já fica alertado)
  // ============================================================
  alertNearbyZombies(z, hitPoint);

  if (z.health <= 0) {
    Sfx.playZombieDeath(); Sfx.playCoin(); addShake(CONFIG.shake.kill);
    state.coins += z.coinReward; state.xp += z.xpReward;
    state.kills++; if (isHead) state.headshots++;
    if (state.lifesteal > 0) state.health = Math.min(state.maxHealth, state.health + state.lifesteal);
    bus.emit(Ev.DEATH, { id: z.id, killerId: player.id, part });
    bus.emit(Ev.KILL, { killerId: player.id, victimId: z.id, victimType: z.typeKey, headshot: isHead, weaponId: state.inventory[state.currentSlot] });
    if (isHead) bus.emit(Ev.HEADSHOT, { playerId: player.id, victimId: z.id });
    bus.emit(Ev.COIN_GAIN, { playerId: player.id, amount: z.coinReward, total: state.coins });
    bus.emit(Ev.XP_GAIN, { playerId: player.id, amount: z.xpReward, total: state.xp });
    checkLevelUp();
    randomDismemberOnDeath(z);
    const overkill = Math.min(2, Math.max(0.7, -z.health / z.maxHealth + 1));
    startRagdoll(z.mesh, hitDir, isCrit ? overkill * 1.4 : overkill, z.dismembered);
    const idx = zombies.indexOf(z);
    if (idx >= 0) zombies.splice(idx, 1);
    state.zombiesAlive--;
    updateHUD();
  } else {
    z.hitReactEndTime = performance.now() / 1000 + CONFIG.zombie.knockbackStagger * (isCrit || isHead ? 1.5 : 1);
    z.hitDirection.copy(hitDir);
    const impulse = (isCrit || isHead ? 4.5 : 3.0) / z.scale;
    z.vx += hitDir.x * impulse;
    z.vz += hitDir.z * impulse;
  }
}

// ============================================================
// AGGRO — alerta vizinhos
// ============================================================
function alertNearbyZombies(source, position) {
  const now = performance.now() / 1000;
  const R2 = CONFIG.aggro.alertRadius * CONFIG.aggro.alertRadius;
  for (const z of zombies) {
    if (z === source || z.health <= 0) continue;
    const dx = z.mesh.position.x - position.x;
    const dz = z.mesh.position.z - position.z;
    if (dx * dx + dz * dz > R2) continue;
    z.alertedUntil = now + CONFIG.aggro.alertDuration;
  }
}

function rollCrit() { return Math.random() < state.critChance; }

// ============================================================
// RELOAD
// ============================================================
function startReload(wid) {
  if (state.reload.active) return;
  const w = WEAPONS[wid], am = state.ammo[wid];
  if (!w || !am) return;
  if (am.mag >= w.magSize || am.reserve <= 0) return;
  state.reload.active = true; state.reload.wid = wid;
  state.reload.startTime = performance.now() / 1000;
  state.reload.duration = w.reloadTime;
  state.reload.endTime = state.reload.startTime + w.reloadTime;
  if (state.aiming) { state.aiming = false; updateCrosshair(); }
  Sfx.playReload();
}
function cancelReload() {
  state.reload.active = false; state.reload.wid = null;
  state.reload.startTime = 0; state.reload.endTime = 0; state.reload.duration = 0;
}
function updateReload(now) {
  if (!state.reload.active) return;
  if (now >= state.reload.endTime) {
    const wid = state.reload.wid, w = WEAPONS[wid], am = state.ammo[wid];
    if (am && w) {
      const need = w.magSize - am.mag;
      const take = Math.min(need, am.reserve);
      am.mag += take; am.reserve -= take;
    }
    cancelReload(); updateHUD();
  }
}
function attack() {
  if (state.downed) {
    const wid = state.inventory[state.currentSlot] || 'knife';
    if (wid !== 'pistol') return false;
  }
  if (state.reload.active) return false;
  const now = performance.now() / 1000;
  const weaponId = state.inventory[state.currentSlot] || 'knife';
  const weapon = WEAPONS[weaponId];
  const cd = weapon.cooldown / state.attackSpeedMult;
  if (now - state.lastAttackTime < cd) return false;
  if (weapon.type === 'ranged') {
    const am = state.ammo[weaponId];
    if (!am) return false;
    if (am.mag <= 0) { if (am.reserve > 0) startReload(weaponId); state.lastAttackTime = now; return false; }
    am.mag--;
    if (am.mag === 0 && am.reserve > 0) setTimeout(() => { if (state.running) startReload(weaponId); }, 250);
    updateHUD();
  }
  state.lastAttackTime = now;
  bus.emit(Ev.ATTACK, { playerId: player.id, weaponId, weaponType: weapon.type, aiming: state.aiming, pos: { x: player.position.x, y: player.position.y, z: player.position.z }, yaw: player.yaw, pitch: player.pitch });
  if (weapon.type === 'melee') Sfx.playKnifeSwing();
  else if (weaponId === 'pistol') Sfx.playPistol();
  else if (weaponId === 'revolver') Sfx.playRevolver();
  else if (weaponId === 'smg') Sfx.playSMG();
  else if (weaponId === 'rifle') Sfx.playRifle();
  else if (weaponId === 'shotgun') Sfx.playShotgun();
  else if (weaponId === 'launcher') Sfx.playLauncher();
  triggerSwing();
  if (weapon.type === 'ranged') { spawnMuzzleFlash(); addShake(CONFIG.shake.shoot * (weapon.damage / 40)); }
  if (weapon.type === 'melee') {
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const range = weapon.range + state.rangeBonus;
    const aimRegion = getAimRegion();
    const minDot = CONFIG.melee.coneDot;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.health <= 0) continue;
      const dx = z.mesh.position.x - player.position.x, dz = z.mesh.position.z - player.position.z;
      const horizDist = Math.sqrt(dx * dx + dz * dz);
      if (horizDist > range) continue;
      if (horizDist > 0.001) { const dot = (dx * forward.x + dz * forward.z) / horizDist; if (dot < minDot) continue; }
      let part;
      if (aimRegion === 'head') part = 'head';
      else if (aimRegion === 'legs') part = Math.random() < 0.5 ? 'legL' : 'legR';
      else part = 'torso';
      const hitPoint = z.mesh.position.clone();
      hitPoint.y += (part === 'head') ? 1.65 : (part === 'legL' || part === 'legR') ? 0.5 : 1.0;
      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult;
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const headMult = part === 'head' ? CONFIG.headshotMultiplier : 1;
      const dmg = baseDmg * headMult * (isCrit ? critMult : 1);
      const hitDir = horizDist > 0.001 ? new THREE.Vector3(dx / horizDist, 0, dz / horizDist) : forward.clone();
      damageZombie(z, dmg, isCrit, part, hitDir, hitPoint, 'melee');
    }
    const camPos = camera.position.clone();
    for (const r of ragdolls) { if (r.sliceAt(camPos, forward, CONFIG.ragdoll.sliceRange)) { Sfx.playKnifeHitFlesh(); showHitMarker(false); break; } }
    return true;
  }
  const origin = camera.position.clone();
  const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
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
    if (weaponId === 'launcher') {
      const result = raycastZombie(origin, dir, range);
      let hitPos;
      if (result.zombie) hitPos = result.point;
      else {
        hitPos = origin.clone().addScaledVector(dir, range);
        if (dir.y < -0.01) { const t = -origin.y / dir.y; if (t > 0 && t < range) { hitPos = origin.clone().addScaledVector(dir, t); hitPos.y = 0.1; } }
      }
      spawnTracer(origin.clone().addScaledVector(dir, 0.8), hitPos);
      spawnExplosion(hitPos);
      continue;
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

// ============================================================
// LEVEL / WAVES
// ============================================================
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
  if (leveled) { Sfx.playLevelUp(); if (!state.levelUpActive) showLevelUp(); }
  updateHUD();
}
function showLevelUp() {
  state.levelUpActive = true; state.pendingLevelUps--;
  if (document.exitPointerLock) document.exitPointerLock();
  const pool = [...SKILLS];
  const chosen = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) { const idx = Math.floor(Math.random() * pool.length); chosen.push(pool.splice(idx, 1)[0]); }
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
  else { state.levelUpActive = false; if (!isMobile() && state.running) renderer.domElement.requestPointerLock(); }
  updateHUD();
}

const waveBanner = document.getElementById('wave-banner');
function showWaveBanner(text) {
  waveBanner.textContent = text;
  waveBanner.classList.remove('hidden'); waveBanner.classList.add('show');
  setTimeout(() => { waveBanner.classList.remove('show'); setTimeout(() => waveBanner.classList.add('hidden'), 350); }, 1400);
}

// ============================================================
// WAVES — com bônus de clear
// ============================================================
function startWave() {
  if (state.waveIntervalId !== null) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; }
  state.wave++; state.betweenWaves = false;
  const count = Math.min(CONFIG.wave.baseZombies + (state.wave - 1) * CONFIG.wave.zombiesPerWave, CONFIG.wave.maxZombies);
  const isBossWave = state.wave % CONFIG.wave.bossEvery === 0;
  state.zombiesRemainingInWave = count + (isBossWave ? 1 : 0);
  state.bossSpawned = false;
  showWaveBanner((isBossWave ? 'HORDA CHEFE ' : 'HORDA ') + state.wave);
  bus.emit(Ev.WAVE_START, { wave: state.wave, count, boss: isBossWave });
  updateHUD();
  state.waveIntervalId = setInterval(() => {
    if (!state.running || state.paused) { if (!state.running) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; } return; }
    if (state.levelUpActive) return;
    if (state.zombiesRemainingInWave <= 0) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; return; }
    if (isBossWave && !state.bossSpawned) { spawnZombie('boss'); state.bossSpawned = true; }
    else spawnZombie();
    state.zombiesRemainingInWave--; updateHUD();
  }, 500);
}

function checkWaveComplete() {
  if (state.betweenWaves) return;
  if (state.zombiesAlive === 0 && state.zombiesRemainingInWave <= 0) {
    state.betweenWaves = true;
    bus.emit(Ev.WAVE_CLEAR, { wave: state.wave });

    // ============ RECOMPENSA DE FIM DE HORDA ============
    const coinBonus = Math.round((CONFIG.wave.clearBonusBase + (state.wave - 1) * CONFIG.wave.clearBonusPerWave) * state.coinMult);
    state.coins += coinBonus;

    // Heal
    const heal = Math.round(state.maxHealth * CONFIG.wave.clearHealFrac);
    const beforeHP = state.health;
    state.health = Math.min(state.maxHealth, state.health + heal);
    const healed = Math.round(state.health - beforeHP);

    // Munição
    let ammoGiven = 0;
    Object.values(state.inventory).forEach(wid => {
      if (!wid || wid === 'knife') return;
      const w = WEAPONS[wid], am = state.ammo[wid];
      if (!w || !am || w.maxAmmo === null) return;
      const give = Math.ceil(w.reserveMax * CONFIG.wave.clearAmmoFrac);
      const before = am.reserve;
      am.reserve = Math.min(w.reserveMax, am.reserve + give);
      ammoGiven += am.reserve - before;
    });

    showWaveBanner('+' + coinBonus + '$  +' + healed + 'HP' + (ammoGiven ? '  +' + ammoGiven + 'AMMO' : '') + '  — PROXIMA EM ' + CONFIG.wave.breakTime + 's');
    updateHUD();

    if (state.waveStartTimeoutId !== null) clearTimeout(state.waveStartTimeoutId);
    state.waveStartTimeoutId = setTimeout(() => {
      state.waveStartTimeoutId = null;
      if (state.running && !state.paused) startWave();
    }, CONFIG.wave.breakTime * 1000);
  }
}

function switchToSlot(slot) {
  if (!state.inventory[slot] || state.currentSlot === slot) return;
  cancelReload();
  state.currentSlot = slot;
  const weaponId = state.inventory[slot];
  const weapon = WEAPONS[weaponId];
  if (weapon.type === 'melee' && state.aiming) { state.aiming = false; updateCrosshair(); }
  buildViewModel(weaponId);
  bus.emit(Ev.PLAYER_WEAPON, { playerId: player.id, slot, weaponId });
  updateHUD(); updateWeaponSlotsHUD();
}
function updateWeaponSlotsHUD() {
  document.querySelectorAll('#weapon-slots .slot').forEach(el => {
    const slot = parseInt(el.dataset.slot);
    const has = !!state.inventory[slot];
    el.classList.toggle('empty', !has);
    el.classList.toggle('active', state.currentSlot === slot);
    const nameEl = el.querySelector('.slot-name');
    if (has) nameEl.textContent = WEAPONS[state.inventory[slot]].name; else nameEl.textContent = '-';
  });
}
function updateCrosshair() { document.body.classList.toggle('aiming', state.aiming); }

// ============================================================
// DOWNED
// ============================================================
function enterDownedState() {
  if (state.downed) return;
  if (state.revivesLeft <= 0) { gameOver(); return; }
  state.downed = true; state.downedElapsed = 0; state.health = 0;
  state.downedHP = CONFIG.downed.maxHP; state.downedMaxHP = CONFIG.downed.maxHP;
  state.reviveProgress = 0; state.aiming = false; state.mouseDown = false;
  updateCrosshair(); cancelReload();
  if (state.pingWheelOpen) { state.pingWheelOpen = false; document.getElementById('ping-wheel').classList.add('hidden'); }
  document.body.classList.add('downed');
  document.getElementById('downed-overlay').classList.remove('hidden');
  document.getElementById('downed-timer').textContent = '30';
  document.getElementById('downed-prompt').classList.remove('visible');
  document.getElementById('downed-progress-wrap').classList.remove('visible');
  document.getElementById('downed-progress').style.width = '0%';
  document.getElementById('downed-hp-fill').style.width = '100%';
  Sfx.playPlayerDown(); addShake(0.4); updateHUD();
  bus.emit(Ev.PLAYER_DOWN, { playerId: player.id, pos: { x: player.position.x, y: player.position.y, z: player.position.z } });
}
function exitDownedState(hpFraction) {
  if (!state.downed) return;
  state.downed = false; state.downedElapsed = 0; state.reviveProgress = 0;
  state.health = Math.max(20, Math.round(state.maxHealth * (hpFraction || 0.5)));
  state.invulnUntil = performance.now() / 1000 + 2.0;
  document.body.classList.remove('downed');
  document.getElementById('downed-overlay').classList.add('hidden');
  Sfx.playRevive(); updateHUD();
  bus.emit(Ev.PLAYER_REVIVE, { playerId: player.id, hp: state.health });
}
function updateDownedState(dt) {
  if (!state.downed) return;
  state.downedElapsed += dt * 1000;
  if (state.downedHP <= 0) { exitDownedState(0); gameOver(); return; }
  const remaining = Math.max(0, CONFIG.downed.duration - state.downedElapsed);
  document.getElementById('downed-timer').textContent = Math.ceil(remaining / 1000);
  document.getElementById('downed-hp-fill').style.width = Math.max(0, (state.downedHP / state.downedMaxHP) * 100) + '%';
  const prompt = document.getElementById('downed-prompt');
  const progressWrap = document.getElementById('downed-progress-wrap');
  const progressBar = document.getElementById('downed-progress');
  if (state.downedElapsed >= CONFIG.downed.selfReviveAt && state.revivesLeft > 0) {
    prompt.classList.add('visible');
    if (state.keys['KeyE']) {
      state.reviveProgress += dt * 1000;
      progressWrap.classList.add('visible');
      const pct = Math.min(1, state.reviveProgress / CONFIG.downed.selfReviveHold);
      progressBar.style.width = (pct * 100) + '%';
      if (state.reviveProgress >= CONFIG.downed.selfReviveHold) { state.revivesLeft--; exitDownedState(0.3); return; }
    } else { state.reviveProgress = 0; progressWrap.classList.remove('visible'); progressBar.style.width = '0%'; }
  } else { prompt.classList.remove('visible'); progressWrap.classList.remove('visible'); }
  if (remaining <= 0) { exitDownedState(0); gameOver(); }
}

// ============================================================
// PING WHEEL
// ============================================================
const pings = [];
const PING_COLORS = { enemy: 0xff2020, help: 0xffdd00, go: 0x22dd22, careful: 0xff8800 };
function updatePingHighlight() {
  const x = state.pingAccumX, y = state.pingAccumY;
  const mag = Math.hypot(x, y);
  if (mag < 25) { state.pingHighlight = null; document.querySelectorAll('.ping-option').forEach(el => el.classList.remove('highlighted')); return; }
  const angle = Math.atan2(y, x); const pi = Math.PI;
  let dir;
  if (angle >= -3 * pi / 4 && angle < -pi / 4) dir = 'top';
  else if (angle >= -pi / 4 && angle < pi / 4) dir = 'right';
  else if (angle >= pi / 4 && angle < 3 * pi / 4) dir = 'bottom';
  else dir = 'left';
  const map = { top: 'enemy', right: 'help', bottom: 'go', left: 'careful' };
  state.pingHighlight = map[dir];
  document.querySelectorAll('.ping-option').forEach(el => { el.classList.toggle('highlighted', el.classList.contains('ping-' + dir)); });
}
function getPingPosition() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const pos = camera.position.clone();
  if (dir.y < -0.01) { const t = (0.1 - pos.y) / dir.y; if (t > 0 && t < 60) { pos.addScaledVector(dir, t); pos.y = 0.1; return pos; } }
  pos.addScaledVector(dir, 15); pos.y = 0.1; return pos;
}
function emitPing(type) {
  const pos = getPingPosition();
  bus.emit(Ev.PING, { playerId: player.id, type, pos: { x: pos.x, y: pos.y, z: pos.z } });
  spawnPingMarker(pos, type); Sfx.playPing();
}
function spawnPingMarker(pos, type) {
  const color = PING_COLORS[type] || 0xffffff;
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  pillar.position.y = 3; group.add(pillar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; group.add(ring);
  group.position.copy(pos); scene.add(group);
  pings.push({ group, pillar, ring, life: 3, maxLife: 3 });
}
function updatePings(dt) {
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i];
    p.life -= dt;
    const t = Math.max(0, p.life / p.maxLife);
    p.ring.scale.setScalar(1 + (1 - t) * 2.2);
    p.ring.material.opacity = t;
    p.pillar.material.opacity = t * 0.4;
    if (p.life <= 0) { scene.remove(p.group); p.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); pings.splice(i, 1); }
  }
}

// ============================================================
// SHOP
// ============================================================
const shopEl = document.getElementById('shop');
const shopItemsEl = document.getElementById('shop-items');
const shopCoinsEl = document.getElementById('shop-coins');
function openShop() {
  if (state.shopOpen) return;
  state.shopOpen = true;
  if (document.exitPointerLock) document.exitPointerLock();
  renderShop(); shopEl.classList.remove('hidden');
}
function closeShop() {
  if (!state.shopOpen) return;
  state.shopOpen = false; shopEl.classList.add('hidden');
  if (!isMobile() && state.running) renderer.domElement.requestPointerLock();
}
function renderShop() {
  shopCoinsEl.textContent = '$ ' + state.coins;
  shopItemsEl.innerHTML = '';
  const owned = Object.values(state.inventory).filter(x => x && x !== 'knife');
  if (owned.length === 0) {
    const el = document.createElement('div');
    el.style.color = '#888'; el.style.gridColumn = '1 / -1'; el.style.padding = '20px';
    el.textContent = 'Você ainda não tem armas. Compre em uma casa (marcador amarelo).';
    shopItemsEl.appendChild(el);
  } else {
    owned.forEach(wid => {
      const w = WEAPONS[wid], am = state.ammo[wid];
      if (!am) return;
      const pack = AMMO_PACKS[wid], price = AMMO_PRICES[wid];
      const canBuy = state.coins >= price && am.reserve < w.reserveMax;
      const el = document.createElement('button');
      el.className = 'shop-item' + (canBuy ? '' : ' disabled');
      el.innerHTML = `<div class="item-name">${w.name}</div><div class="item-info">${am.mag}/${w.magSize} · reserva ${am.reserve}/${w.reserveMax}</div><div class="item-cost">+${pack} MUNIÇÃO — $${price}</div>`;
      if (canBuy) el.addEventListener('click', () => {
        state.coins -= price;
        am.reserve = Math.min(w.reserveMax, am.reserve + pack);
        Sfx.playBuy(); renderShop(); updateHUD();
      });
      shopItemsEl.appendChild(el);
    });
  }
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
  if (e.code === 'KeyM') Sfx.setMuted(!Sfx.isMuted());
  if (e.code === 'Escape') {
    if (state.shopOpen) { closeShop(); return; }
    if (state.running && !state.levelUpActive) togglePause();
    return;
  }
  if (e.code === 'KeyR' && state.running && !state.downed && !state.shopOpen && !state.reload.active) {
    const wid = state.inventory[state.currentSlot];
    if (wid && WEAPONS[wid].type === 'ranged') startReload(wid);
  }
  if (e.code === 'KeyQ' && state.running && !state.downed && !state.levelUpActive && !state.pingWheelOpen && !state.shopOpen) {
    state.pingWheelOpen = true; state.pingAccumX = 0; state.pingAccumY = 0; state.pingHighlight = null;
    document.getElementById('ping-wheel').classList.remove('hidden');
  }
  if (e.code === 'KeyE' && state.running && !state.downed && !state.levelUpActive) {
    if (state.shopOpen) { closeShop(); return; }
    if (nearWeapon && !nearWeapon.bought) tryBuyWeapon(); else openShop();
  }
});
document.addEventListener('keyup', e => {
  state.keys[e.code] = false;
  if (e.code === 'KeyQ' && state.pingWheelOpen) {
    state.pingWheelOpen = false;
    document.getElementById('ping-wheel').classList.add('hidden');
    if (state.pingHighlight) emitPing(state.pingHighlight);
    state.pingHighlight = null;
  }
});
renderer.domElement.addEventListener('click', () => {
  if (!state.running || isMobile() || state.levelUpActive || state.shopOpen || state.paused) return;
  Sfx.initAudio(); Sfx.resumeAudio();
  renderer.domElement.requestPointerLock();
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (state.pingWheelOpen) { state.pingAccumX += e.movementX; state.pingAccumY += e.movementY; updatePingHighlight(); return; }
  const sens = state.aiming ? 0.0012 : 0.002;
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});
document.addEventListener('mousedown', e => {
  if (state.paused || state.shopOpen) return;
  if (e.button === 0) {
    state.mouseDown = true;
    if (state.running && !state.levelUpActive && document.pointerLockElement === renderer.domElement) attack();
  }
  if (e.button === 2) {
    if (state.downed) return;
    const weaponId = state.inventory[state.currentSlot] || 'knife';
    if (WEAPONS[weaponId].type !== 'melee') { state.aiming = true; updateCrosshair(); }
  }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) state.mouseDown = false;
  if (e.button === 2) { state.aiming = false; updateCrosshair(); }
});
document.addEventListener('contextmenu', e => { if (state.running) e.preventDefault(); });

function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 'ontouchstart' in window; }
const mobile = { moveX: 0, moveY: 0, looking: false, lastX: 0, lastY: 0 };

function setupMobile() {
  if (!isMobile()) return;
  document.getElementById('mobile-controls').classList.remove('hidden');
  const stick = document.getElementById('joystick-stick');
  const base = document.getElementById('joystick-base');
  const look = document.getElementById('look-zone');
  const atk = document.getElementById('btn-attack');
  const ads = document.getElementById('btn-ads');
  const rel = document.getElementById('btn-reload');
  const buy = document.getElementById('btn-buy');
  const rev = document.getElementById('btn-revive');
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

  ads.addEventListener('touchstart', e => {
    e.preventDefault();
    const wid = state.inventory[state.currentSlot] || 'knife';
    if (WEAPONS[wid].type === 'melee') return;
    state.aiming = !state.aiming;
    updateCrosshair();
  }, { passive: false });

  rel.addEventListener('touchstart', e => {
    e.preventDefault();
    const wid = state.inventory[state.currentSlot];
    if (wid && WEAPONS[wid].type === 'ranged') startReload(wid);
  }, { passive: false });

  buy.addEventListener('touchstart', e => {
    e.preventDefault();
    if (state.downed) return;
    if (nearWeapon && !nearWeapon.bought) tryBuyWeapon();
    else if (state.shopOpen) closeShop();
    else openShop();
  }, { passive: false });

  rev.addEventListener('touchstart', e => {
    e.preventDefault();
    if (state.downed) state.keys['KeyE'] = true;
  }, { passive: false });
  rev.addEventListener('touchend', e => {
    e.preventDefault();
    state.keys['KeyE'] = false;
  });
}
setupMobile();

// ============================================================
// PAUSE
// ============================================================
const pauseEl = document.getElementById('pause');
function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) {
    pauseEl.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
  } else {
    pauseEl.classList.add('hidden');
    if (!isMobile()) renderer.domElement.requestPointerLock();
  }
}

// ============================================================
// PLAYER UPDATE
// ============================================================
const clock = new THREE.Clock();
let shadowFrame = 0;
const _fwdV = new THREE.Vector3(), _rightV = new THREE.Vector3(), _moveV = new THREE.Vector3();

function updatePlayer(dt) {
  let speedMult = state.aiming ? 0.5 : 1;
  if (state.downed) speedMult = 0.25;
  const speed = CONFIG.player.speed * state.speedMult * speedMult;
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

  const camBaseY = state.downed ? 0.55 : CONFIG.player.height;
  camera.position.copy(player.position);
  camera.position.y = camBaseY + bobY;
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
    const minD = CONFIG.player.radius + z.radius;
    if (d2 < minD * minD && d2 > 0.0001) {
      const d = Math.sqrt(d2), overlap = minD - d;
      const nx = dx / d, nz = dz / d;
      player.position.x += nx * overlap * 0.5;
      player.position.z += nz * overlap * 0.5;
      z.mesh.position.x -= nx * overlap * 0.5;
      z.mesh.position.z -= nz * overlap * 0.5;
    }
  }
}

// ============================================================
// ZOMBIE UPDATE — com aggro e scaling
// ============================================================
const K_THIGH = 110, C_THIGH = 14;
const K_KNEE = 90, C_KNEE = 12;
const K_FOOT = 130, C_FOOT = 12;
const K_PELVIS = 130, C_PELVIS = 15;
const K_SPINE = 140, C_SPINE = 16;
const K_HEAD = 180, C_HEAD = 17;
const K_ARM = 95, C_ARM = 13;
const K_ELBOW = 110, C_ELBOW = 12;
const K_BANK = 60, C_BANK = 8;

const _toV = new THREE.Vector3();
function updateZombies(dt) {
  const now = performance.now() / 1000;
  groanTimer -= dt;
  if (groanTimer <= 0 && zombies.length > 0) { groanTimer = 1.5 + Math.random() * 3; Sfx.playGroan(); }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    z.emergeTime += dt;
    const emerge = Math.min(1, z.emergeTime / 1.5);
    const isWounded = z.health / z.maxHealth < 0.5;
    const ud = z.mesh.userData;
    const joints = ud.joints;
    const anim = z.anim;
    const alerted = z.alertedUntil > now;

    const dxP = player.position.x - z.mesh.position.x;
    const dzP = player.position.z - z.mesh.position.z;
    const dist = Math.hypot(dxP, dzP);
    const staggering = z.hitReactEndTime > now;

    // Rotação
    const targetYaw = Math.atan2(dxP, dzP);
    let yawDiff = targetYaw - z.mesh.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const yawStep = yawDiff * Math.min(1, dt * 7);
    z.mesh.rotation.y += yawStep;
    z.yawVel = yawStep / Math.max(dt, 0.001);

    // Movimento fluido — com bônus de alerta
    const arrival = z.attackRange + CONFIG.pursuit.arrivalRadius;
    const alertMul = alerted ? CONFIG.aggro.alertSpeedMult : 1;
    let desiredVx = 0, desiredVz = 0;
    if (!staggering && emerge >= 0.5 && dist > arrival) {
      const speedFactor = isWounded ? 0.6 : 1.0;
      const target = z.speed * speedFactor * alertMul;
      desiredVx = (dxP / dist) * target;
      desiredVz = (dzP / dist) * target;
    } else if (!staggering && emerge >= 0.5 && dist > z.attackRange) {
      const t = (dist - z.attackRange) / CONFIG.pursuit.arrivalRadius;
      const target = z.speed * Math.max(CONFIG.pursuit.minSpeedFactor, t) * (isWounded ? 0.6 : 1) * alertMul;
      desiredVx = (dxP / dist) * target;
      desiredVz = (dzP / dist) * target;
    }
    const k = 1 - Math.exp(-dt * CONFIG.pursuit.responsiveness * (alerted ? 1.3 : 1));
    z.vx += (desiredVx - z.vx) * k;
    z.vz += (desiredVz - z.vz) * k;

    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      z.vx *= Math.pow(0.85, dt * 60 / Math.max(0.1, lean + 0.1));
      z.vz *= Math.pow(0.85, dt * 60 / Math.max(0.1, lean + 0.1));
      z.vx -= z.hitDirection.x * dt * 5 * lean;
      z.vz -= z.hitDirection.z * dt * 5 * lean;
    }

    z.mesh.position.x += z.vx * dt;
    z.mesh.position.z += z.vz * dt;

    // Animação
    const actualSpeed = Math.hypot(z.vx, z.vz);
    const speedNorm = Math.min(1.5, actualSpeed / Math.max(0.01, z.speed));
    const walkStyle = z.walkStyle;
    const shuffling = dist < 3.0;
    const cadence = (2.0 + speedNorm * 6.5) * emerge * (1 - walkStyle * 0.35) * (shuffling ? 1.35 : 1.0) * (alerted ? 1.15 : 1);
    z.walkPhase += dt * cadence;
    const phase = z.walkPhase;

    const stumbleWave = Math.sin(phase * 0.31) * Math.sin(phase * 0.73);
    const stumble = stumbleWave > 0.75 ? (stumbleWave - 0.75) * 4 * speedNorm : 0;

    const stepL = Math.sin(phase);
    const stepR = Math.sin(phase + Math.PI);
    const legAmp = (0.5 + walkStyle * 0.2) * (0.35 + speedNorm * 0.65);

    let legL = stepL * legAmp;
    let legR = stepR * legAmp;
    if (z.limpSide === 'L') legL *= (1 - z.limpAmount * 2);
    else legR *= (1 - z.limpAmount * 2);
    if (stumble > 0) {
      if (Math.random() < 0.5) legL += stumble * 0.8;
      else legR += stumble * 0.8;
    }

    let thighLTarget = legL;
    let thighRTarget = legR;
    const kneeAmp = 0.9 * (0.4 + speedNorm * 0.6);
    let kneeLTarget = Math.max(0, stepL) * kneeAmp + 0.08 + walkStyle * 0.2;
    let kneeRTarget = Math.max(0, stepR) * kneeAmp + 0.08 + walkStyle * 0.2;
    let footLTarget = -stepL * 0.35 * (1 + walkStyle * 0.4);
    let footRTarget = -stepR * 0.35 * (1 + walkStyle * 0.4);

    let pelvisRollTarget = -Math.cos(phase) * 0.06 * speedNorm;
    let pelvisTwistTarget = stepL * 0.14 * speedNorm;
    let pelvisBobTarget = -Math.abs(Math.sin(phase)) * 0.035 * speedNorm - 0.008 * speedNorm;

    let spineTwistTarget = -stepL * 0.14 * speedNorm;
    const leanBase = isWounded ? 0.22 : 0.10;
    let spineLeanTarget = leanBase + (dist < 3 ? 0.10 : 0) + speedNorm * 0.06;
    let spineSideTarget = Math.cos(phase) * 0.04 * speedNorm;
    let spineRollTarget = 0;

    let headRollTarget = z.headLoll + Math.cos(phase) * 0.08 * speedNorm;
    let headTwistTarget = spineTwistTarget * 0.4 + stepL * 0.06 * speedNorm;
    let headPitchTarget = z.headPitchBase + speedNorm * 0.12 + (dist < 3 ? 0.15 : 0);

    const reaching = dist < 3.5 && !staggering;
    const armAmp = 0.5 * (0.4 + speedNorm * 0.6);
    let armLXTarget, armRXTarget;
    if (reaching) {
      const reach = -1.55 + Math.sin(phase * 0.9) * 0.08;
      armLXTarget = reach + Math.sin(phase * 1.7) * 0.06;
      armRXTarget = reach + Math.cos(phase * 1.5) * 0.06;
    } else {
      armLXTarget = -stepL * armAmp + z.armDroopL;
      armRXTarget = -stepR * armAmp + z.armDroopR;
    }
    let elbowLXTarget = reaching ? -0.9 + Math.sin(phase * 0.8) * 0.1 : -0.15 - Math.max(0, armLXTarget) * 0.4;
    let elbowRXTarget = reaching ? -0.9 + Math.sin(phase * 0.8 + 1.5) * 0.1 : -0.15 - Math.max(0, armRXTarget) * 0.4;

    // Override flinch
    const flinch = z.flinch;
    if (flinch.head && now < flinch.head.until) {
      const t = (flinch.head.until - now) / 0.6;
      headTwistTarget += flinch.head.dirX * flinch.head.strength * 0.7 * t;
      headPitchTarget += -flinch.head.dirZ * flinch.head.strength * 0.8 * t;
    }
    if (flinch.torso && now < flinch.torso.until) {
      const t = (flinch.torso.until - now) / 0.5;
      spineLeanTarget += -flinch.torso.dirZ * flinch.torso.strength * 0.6 * t;
      spineTwistTarget += flinch.torso.dirX * flinch.torso.strength * 0.5 * t;
    }
    if (flinch.armL && now < flinch.armL.until) {
      const t = (flinch.armL.until - now) / 0.55;
      armLXTarget += -flinch.armL.strength * 0.9 * t;
      elbowLXTarget += flinch.armL.strength * 1.2 * t;
    }
    if (flinch.armR && now < flinch.armR.until) {
      const t = (flinch.armR.until - now) / 0.55;
      armRXTarget += -flinch.armR.strength * 0.9 * t;
      elbowRXTarget += flinch.armR.strength * 1.2 * t;
    }
    if (flinch.legL && now < flinch.legL.until) {
      const t = (flinch.legL.until - now) / 0.75;
      thighLTarget += -flinch.legL.strength * 0.9 * t;
      kneeLTarget += flinch.legL.strength * 1.6 * t;
      footLTarget += -flinch.legL.strength * 0.4 * t;
      pelvisRollTarget += flinch.legL.dirX * flinch.legL.strength * 0.4 * t;
    }
    if (flinch.legR && now < flinch.legR.until) {
      const t = (flinch.legR.until - now) / 0.75;
      thighRTarget += -flinch.legR.strength * 0.9 * t;
      kneeRTarget += flinch.legR.strength * 1.6 * t;
      footRTarget += -flinch.legR.strength * 0.4 * t;
      pelvisRollTarget += -flinch.legR.dirX * flinch.legR.strength * 0.4 * t;
    }

    const bankTarget = -z.yawVel * 0.05 * speedNorm;
    springStep(anim, 'bankX', 0, K_BANK, C_BANK, dt);
    springStep(anim, 'bankZ', bankTarget, K_BANK, C_BANK, dt);

    springStep(anim, 'thighLX', thighLTarget, K_THIGH, C_THIGH, dt);
    springStep(anim, 'thighRX', thighRTarget, K_THIGH, C_THIGH, dt);
    springStep(anim, 'kneeLX', kneeLTarget, K_KNEE, C_KNEE, dt);
    springStep(anim, 'kneeRX', kneeRTarget, K_KNEE, C_KNEE, dt);
    springStep(anim, 'footLX', footLTarget, K_FOOT, C_FOOT, dt);
    springStep(anim, 'footRX', footRTarget, K_FOOT, C_FOOT, dt);
    springStep(anim, 'pelvisRoll', pelvisRollTarget, K_PELVIS, C_PELVIS, dt);
    springStep(anim, 'pelvisTwist', pelvisTwistTarget, K_PELVIS, C_PELVIS, dt);
    springStep(anim, 'pelvisBob', pelvisBobTarget, K_PELVIS, C_PELVIS, dt);
    springStep(anim, 'spineTwist', spineTwistTarget, K_SPINE, C_SPINE, dt);
    springStep(anim, 'spineLean', spineLeanTarget, K_SPINE, C_SPINE, dt);
    springStep(anim, 'spineRoll', spineRollTarget, K_SPINE, C_SPINE, dt);
    springStep(anim, 'spineSide', spineSideTarget, K_SPINE, C_SPINE, dt);
    springStep(anim, 'headTwist', headTwistTarget, K_HEAD, C_HEAD, dt);
    springStep(anim, 'headRoll', headRollTarget, K_HEAD * 0.7, C_HEAD, dt);
    springStep(anim, 'headPitch', headPitchTarget, K_HEAD, C_HEAD, dt);
    springStep(anim, 'armLX', armLXTarget, K_ARM, C_ARM, dt);
    springStep(anim, 'armRX', armRXTarget, K_ARM, C_ARM, dt);
    springStep(anim, 'elbowLX', elbowLXTarget, K_ELBOW, C_ELBOW, dt);
    springStep(anim, 'elbowRX', elbowRXTarget, K_ELBOW, C_ELBOW, dt);

    joints.pelvis.rotation.z = anim.pelvisRoll;
    joints.pelvis.rotation.y = anim.pelvisTwist;
    joints.pelvis.position.y = P_PELVIS_Y + anim.pelvisBob;

    joints.spineLower.rotation.x = anim.spineLean * 0.4;
    joints.spineLower.rotation.z = anim.spineRoll * 0.4 + anim.spineSide * 0.3 + anim.bankZ;

    joints.spineUpper.rotation.y = anim.spineTwist;
    joints.spineUpper.rotation.x = anim.spineLean * 0.6;
    joints.spineUpper.rotation.z = anim.spineRoll * 0.6 + anim.spineSide * 0.7 + anim.bankZ * 0.5;

    joints.head.rotation.y = anim.headTwist;
    joints.head.rotation.z = anim.headRoll;
    joints.head.rotation.x = anim.headPitch;

    joints.shoulderL.rotation.x = anim.armLX;
    joints.shoulderR.rotation.x = anim.armRX;
    joints.elbowL.rotation.x = anim.elbowLX;
    joints.elbowR.rotation.x = anim.elbowRX;

    joints.thighL.rotation.x = anim.thighLX;
    joints.thighR.rotation.x = anim.thighRX;
    joints.kneeL.rotation.x = anim.kneeLX;
    joints.kneeR.rotation.x = anim.kneeRX;
    joints.footL.rotation.x = anim.footLX;
    joints.footR.rotation.x = anim.footRX;

    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      joints.spineUpper.rotation.x -= lean * 0.30;
    }

    if (z.dismembered.head) {
      Sfx.playZombieDeath(); state.zombiesAlive--;
      const idx = zombies.indexOf(z);
      if (idx >= 0) zombies.splice(idx, 1);
      bus.emit(Ev.DEATH, { id: z.id, killerId: player.id, part: 'head' });
      bus.emit(Ev.KILL, { killerId: player.id, victimId: z.id, victimType: z.typeKey, headshot: true, weaponId: state.inventory[state.currentSlot] });
      startRagdoll(z.mesh, new THREE.Vector3(dxP, 0, dzP).normalize(), 1.0, z.dismembered);
      updateHUD();
      continue;
    }

    if (emerge >= 0.5) {
      if (!staggering && now - z.lastAttackTime > z.attackCooldown && dist < z.attackRange + 0.3) {
        z.lastAttackTime = now;
        springKick(anim, 'armLXVel', 8);
        springKick(anim, 'armRXVel', 8);
        springKick(anim, 'elbowLXVel', -6);
        springKick(anim, 'elbowRXVel', -6);
        if (state.downed) { state.downedHP -= z.damage * 0.8; }
        else {
          const invuln = performance.now() / 1000 < state.invulnUntil;
          if (!invuln) {
            const dm = z.damage * (1 - state.damageReduction);
            state.health -= dm;
            bus.emit(Ev.PLAYER_HIT, { playerId: player.id, attackerId: z.id, amount: dm, pos: { x: z.mesh.position.x, y: 1, z: z.mesh.position.z } });
          }
        }
        Sfx.playPlayerHurt(); showDamageFlash(); addShake(0.15); updateHUD();
        if (state.health <= 0 && !state.downed && performance.now() / 1000 >= state.invulnUntil) enterDownedState();
      }
    }
    resolveWallCollisions(z.mesh.position, z.radius);
  }

  // Colisão zumbi-zumbi
  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i], b = zombies[j];
      if (a.health <= 0 || b.health <= 0) continue;
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      const minD = a.radius + b.radius;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const massA = a.scale * a.scale, massB = b.scale * b.scale;
        const totalMass = massA + massB;
        const overlap = minD - d;
        const pushA = overlap * (massB / totalMass);
        const pushB = overlap * (massA / totalMass);
        const nx = dx / d, nz = dz / d;
        a.mesh.position.x -= nx * pushA; a.mesh.position.z -= nz * pushA;
        b.mesh.position.x += nx * pushB; b.mesh.position.z += nz * pushB;
        a.vx -= nx * pushA * 3; a.vz -= nz * pushA * 3;
        b.vx += nx * pushB * 3; b.vz += nz * pushB * 3;
      }
    }
  }
}

// ============================================================
// DOORS / PICKUPS / RAGDOLLS
// ============================================================
function updateDoors(dt) {
  for (const door of world.doors) {
    const dx = player.position.x - door.worldX;
    const dz = player.position.z - door.worldZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const target = dist < 2.2 ? -Math.PI / 2 : 0;
    door.currentAngle += (target - door.currentAngle) * Math.min(1, dt * 6);
    door.group.rotation.y = door.currentAngle;
  }
}

let nearWeapon = null;
const promptEl = document.getElementById('prompt');
const promptText = document.getElementById('prompt-text');

function spawnWeaponPickup(weaponId, x, z, y = 0.9) {
  const w = WEAPONS[weaponId];
  const mesh = new THREE.Mesh(geoBox(0.3, 0.15, 0.6, 1), new THREE.MeshLambertMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.3 }));
  mesh.position.set(x, y, z); scene.add(mesh);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 8, 16), new THREE.MeshBasicMaterial({ color: 0xffdd00 }));
  ring.rotation.x = Math.PI / 2; ring.position.copy(mesh.position); ring.position.y += 0.1; scene.add(ring);
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
  houses.forEach((h, i) => spawnWeaponPickup(shuffled[i % shuffled.length], h.x, h.z + 0.5, 0.95));
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
    const dx = player.position.x - s.x, dz = player.position.z - s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < closestDist) { closestDist = d; closest = s; }
  });
  nearWeapon = closest;
  if (closest && !state.shopOpen) {
    const w = WEAPONS[closest.weaponId];
    const can = state.coins >= w.cost;
    const color = can ? '#ffdd00' : '#ff4444';
    promptEl.classList.remove('hidden');
    promptText.innerHTML = `Comprar <span style="color:${color}">${w.name}</span> — <span style="color:${color}">$${w.cost}</span>`;
  } else promptEl.classList.add('hidden');
}
function tryBuyWeapon() {
  if (!nearWeapon || nearWeapon.bought) return;
  const w = WEAPONS[nearWeapon.weaponId];
  if (state.coins < w.cost) { Sfx.playPlayerHurt(); return; }
  state.coins -= w.cost;
  state.inventory[w.slot] = nearWeapon.weaponId;
  state.ammo[w.id] = { mag: w.magSize, reserve: w.reserveMax };
  nearWeapon.bought = true;
  scene.remove(nearWeapon.mesh); scene.remove(nearWeapon.ring);
  nearWeapon.ring.geometry.dispose(); nearWeapon.ring.material.dispose();
  nearWeapon.mesh.material.dispose();
  if (state.currentSlot === w.slot) buildViewModel(nearWeapon.weaponId);
  else switchToSlot(w.slot);
  Sfx.playBuy();
  bus.emit(Ev.WEAPON_BUY, { playerId: player.id, weaponId: w.id, cost: w.cost, slot: w.slot });
  updateHUD(); updateWeaponSlotsHUD();
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
  document.getElementById('revives').textContent = state.revivesLeft;
  const w = WEAPONS[state.inventory[state.currentSlot] || 'knife'];
  document.getElementById('weapon-name').textContent = w.name;
  const ammoEl = document.getElementById('ammo-current');
  const reserveEl = document.getElementById('ammo-reserve');
  if (w.type === 'melee') { ammoEl.textContent = '∞'; reserveEl.textContent = ''; }
  else {
    const am = state.ammo[w.id];
    if (am) {
      if (state.reload.active && state.reload.wid === w.id) {
        const pct = Math.floor(Math.min(1, (performance.now() / 1000 - state.reload.startTime) / state.reload.duration) * 100);
        ammoEl.textContent = 'RECARREGANDO ' + pct + '%';
        ammoEl.style.color = '#ffdd00';
      } else {
        ammoEl.textContent = am.mag + ' / ' + w.magSize;
        ammoEl.style.color = am.mag <= 0 ? '#ff4444' : '#fff';
      }
      reserveEl.textContent = 'RESERVA ' + am.reserve;
    }
  }
}

// ============================================================
// ANIMATE
// ============================================================
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
  if (state.running && !state.levelUpActive && !state.paused && !state.shopOpen) {
    updateReload(now);
    updatePlayer(dt);
    resolvePlayerZombieCollision();
    updateZombies(dt);
    updateParticles(dt);
    updateBloodPools(dt);
    updateTracers(dt);
    updateDoors(dt);
    updateWeaponPickups(dt);
    checkWaveComplete();
    updateRagdolls(dt);
    updateFlyingLimbs(dt);
    checkDebrisZombieCollision();
    updateDownedState(dt);
    updatePings(dt);
    updateExplosions(dt);
    if (state.downed) weaponGroup.visible = false;
    else { weaponGroup.visible = true; updateWeaponViewModel(dt); }
    if (state.mouseDown && !state.reload.active) {
      const wid = state.inventory[state.currentSlot] || 'knife';
      const w = WEAPONS[wid];
      if (w.auto) { if (!state.downed || wid === 'pistol') attack(); }
    }
    const targetFov = state.aiming ? 50 : 78;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 15);
    camera.updateProjectionMatrix();
    shadowFrame++;
    if (shadowFrame >= 5) { renderer.shadowMap.needsUpdate = true; shadowFrame = 0; }
    const elapsed = Math.floor((performance.now() - state.startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = (elapsed % 60).toString().padStart(2, '0');
    const t = `${m}:${s}`;
    if (t !== lastTimeText) { document.getElementById('timer').textContent = t; lastTimeText = t; }
    const revBtn = document.getElementById('btn-revive');
    if (revBtn) revBtn.classList.toggle('visible', state.downed);
  } else if (!state.running) {
    updateParticles(dt); updateBloodPools(dt); updateTracers(dt);
    updateRagdolls(dt); updateFlyingLimbs(dt); updateExplosions(dt);
  }
  renderer.render(scene, camera);
}
animate();

// ============================================================
// START / OVER
// ============================================================
function getRecord() { try { return parseInt(localStorage.getItem('qb_record_wave') || '0', 10); } catch { return 0; } }
function saveRecord(wave, level) {
  try { const prev = getRecord(); if (wave > prev) { localStorage.setItem('qb_record_wave', String(wave)); localStorage.setItem('qb_record_level', String(level)); return true; } } catch {}
  return false;
}
function updateRecordDisplay() {
  const r = getRecord();
  const el = document.getElementById('menu-record');
  if (el) el.textContent = r > 0 ? 'RECORDE: HORDA ' + r : 'RECORDE: —';
}
updateRecordDisplay();

function startGame() {
  if (state.waveIntervalId !== null) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; }
  if (state.waveStartTimeoutId !== null) { clearTimeout(state.waveStartTimeoutId); state.waveStartTimeoutId = null; }
  Sfx.initAudio(); Sfx.resumeAudio();
  state.maxHealth = CONFIG.player.maxHealth; state.health = state.maxHealth;
  state.coins = 0; state.xp = 0; state.level = 1; state.xpToNextLevel = 50;
  state.wave = 0; state.zombiesAlive = 0; state.zombiesRemainingInWave = 0;
  state.running = true; state.paused = false; state.betweenWaves = false;
  state.startTime = performance.now();
  state.critChance = CONFIG.crit.baseChance;
  state.damageMult = 1.0; state.rangeBonus = 0; state.speedMult = 1.0; state.lifesteal = 0;
  state.coinMult = 1.0; state.xpMult = 1.0; state.damageReduction = 0;
  state.attackSpeedMult = 1.0; state.critDamageBonus = 0;
  state.levelUpActive = false; state.pendingLevelUps = 0;
  state.inventory = { 1: 'knife', 2: null, 3: null, 4: null }; state.currentSlot = 1;
  state.mouseDown = false; state.aiming = false; state.shake = 0; state.shopOpen = false;
  state.downed = false; state.downedElapsed = 0; state.downedHP = 0; state.reviveProgress = 0;
  state.revivesLeft = CONFIG.downed.maxRevives; state.invulnUntil = 0;
  state.pingWheelOpen = false; state.pingHighlight = null;
  state.kills = 0; state.headshots = 0; state.damageTotal = 0;
  state.bossSpawned = false;
  cancelReload();
  state.ammo = { pistol: { mag: 0, reserve: 0 }, revolver: { mag: 0, reserve: 0 }, smg: { mag: 0, reserve: 0 }, rifle: { mag: 0, reserve: 0 }, shotgun: { mag: 0, reserve: 0 }, launcher: { mag: 0, reserve: 0 } };
  document.body.classList.remove('downed', 'aiming');
  document.getElementById('downed-overlay').classList.add('hidden');
  document.getElementById('ping-wheel').classList.add('hidden');
  document.getElementById('scoreboard').classList.add('hidden');
  document.getElementById('shop').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  pings.forEach(p => { scene.remove(p.group); p.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); });
  pings.length = 0;
  world.weaponSpots.forEach(s => { scene.remove(s.mesh); scene.remove(s.ring); s.ring.geometry.dispose(); s.ring.material.dispose(); s.mesh.material.dispose(); });
  world.weaponSpots = [];
  setupWeaponSpawns();
  zombies.forEach(z => scene.remove(z.mesh));
  zombies.length = 0;
  ragdolls.forEach(r => r.dispose()); ragdolls.length = 0;
  flyingLimbs.forEach(l => l.dispose()); flyingLimbs.length = 0;
  bloodActive.forEach(p => scene.remove(p.mesh)); bloodActive.length = 0;
  bloodPool.length = 0;
  bloodPools.forEach(b => { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); });
  bloodPools.length = 0;
  tracers.forEach(t => { t.mesh.visible = false; tracerPool.push(t); }); tracers.length = 0;
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
  bus.emit(Ev.PLAYER_DIED, { playerId: player.id, wave: state.wave, level: state.level, coins: state.coins, xp: state.xp });
  state.running = false; state.aiming = false; state.downed = false; state.paused = false;
  cancelReload();
  document.body.classList.remove('downed');
  document.getElementById('downed-overlay').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  updateCrosshair();
  if (state.waveIntervalId !== null) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; }
  if (state.waveStartTimeoutId !== null) { clearTimeout(state.waveStartTimeoutId); state.waveStartTimeoutId = null; }
  document.getElementById('final-wave').textContent = state.wave;
  document.getElementById('final-level').textContent = state.level;
  document.getElementById('final-coins').textContent = state.coins;
  document.getElementById('final-kills').textContent = state.kills;
  document.getElementById('final-hs').textContent = state.headshots;
  const elapsed = Math.floor((performance.now() - state.startTime) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = (elapsed % 60).toString().padStart(2, '0');
  document.getElementById('final-time').textContent = `${m}:${s}`;
  const isNewRecord = saveRecord(state.wave, state.level);
  document.getElementById('final-record').textContent = isNewRecord ? '★ NOVO RECORDE! ★' : 'RECORDE: HORDA ' + getRecord();
  document.getElementById('gameover').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('prompt').classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  updateRecordDisplay();
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-multiplayer').addEventListener('click', () => alert('Multijogador em breve!'));
document.getElementById('btn-wiki').addEventListener('click', () => window.open('https://zumbiblocks2.wiki.gg/', '_blank'));
document.getElementById('btn-shop-close').addEventListener('click', closeShop);
document.getElementById('btn-resume').addEventListener('click', () => { if (state.paused) togglePause(); });
document.getElementById('btn-quit').addEventListener('click', () => {
  state.paused = false; state.running = false;
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// FEEDBACK MP-READY
// ============================================================
const playerStats = new Map();
playerStats.set(player.id, { id: player.id, name: 'VOCÊ', kills: 0, headshots: 0, damage: 0, coins: 0, deaths: 0, local: true });
const _projV = new THREE.Vector3();
function worldToScreen(pos) {
  _projV.set(pos.x, pos.y, pos.z).project(camera);
  return { x: (_projV.x * 0.5 + 0.5) * window.innerWidth, y: (-_projV.y * 0.5 + 0.5) * window.innerHeight, visible: _projV.z < 1 && _projV.z > -1 };
}
function ensureStats(id) {
  let s = playerStats.get(id);
  if (!s) { s = { id, name: id === player.id ? 'VOCÊ' : (id.startsWith('p-') ? 'JOGADOR' : 'INIMIGO'), kills: 0, headshots: 0, damage: 0, coins: 0, deaths: 0, local: id === player.id }; playerStats.set(id, s); }
  return s;
}
function nameOf(id) {
  if (typeof id !== 'string') return '???';
  if (id.startsWith('z-')) return 'ZUMBI';
  if (id === player.id) return 'VOCÊ';
  return ensureStats(id).name;
}
const damageNumbersEl = document.getElementById('damage-numbers');
function spawnDamageNumber(worldPos, amount, kind) {
  const screen = worldToScreen(worldPos);
  if (!screen.visible) return;
  const el = document.createElement('div');
  el.className = 'dmg-number dmg-' + kind;
  el.textContent = Math.round(amount);
  const jX = (Math.random() - 0.5) * 30, jY = (Math.random() - 0.5) * 15;
  el.style.left = (screen.x + jX) + 'px';
  el.style.top = (screen.y + jY) + 'px';
  damageNumbersEl.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 850);
}
const killFeedEl = document.getElementById('kill-feed');
const KILL_FEED_MAX = 5, KILL_FEED_LIFE = 4200;
function spawnKillFeedEntry(killerId, victimId, weaponId, headshot) {
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  const weapon = (WEAPONS[weaponId] && WEAPONS[weaponId].name) || weaponId || '';
  const weaponShort = weapon.split('-')[0];
  entry.innerHTML = `<span class="killer">${nameOf(killerId)}</span><span class="weapon">${weaponShort}</span>${headshot ? '<span class="hs-badge">HS</span>' : ''}<span class="victim">${nameOf(victimId)}</span>`;
  killFeedEl.insertBefore(entry, killFeedEl.firstChild);
  while (killFeedEl.children.length > KILL_FEED_MAX) killFeedEl.removeChild(killFeedEl.lastChild);
  setTimeout(() => { entry.classList.add('fading'); setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry); }, 400); }, KILL_FEED_LIFE);
}
bus.on(Ev.DAMAGE, p => {
  const s = ensureStats(p.attackerId);
  s.damage += p.amount;
  if (p.attackerId !== player.id || !p.pos) return;
  let kind = 'normal';
  if (p.headshot) kind = 'headshot'; else if (p.isCrit) kind = 'crit';
  spawnDamageNumber(p.pos, p.amount, kind);
});
bus.on(Ev.KILL, p => { const ks = ensureStats(p.killerId); ks.kills++; if (p.headshot) ks.headshots++; spawnKillFeedEntry(p.killerId, p.victimId, p.weaponId, p.headshot); });
bus.on(Ev.COIN_GAIN, p => { const s = playerStats.get(p.playerId); if (s) s.coins = p.total; });
bus.on(Ev.PLAYER_DIED, p => { const s = playerStats.get(p.playerId); if (s) s.deaths++; });
bus.on(Ev.NET_PLAYER_LEAVE, p => { if (p && p.id) playerStats.delete(p.id); });
const scoreboardEl = document.getElementById('scoreboard');
const scoreboardBody = document.getElementById('scoreboard-body');
let scoreboardOpen = false;
function renderScoreboard() {
  const list = [...playerStats.values()].sort((a, b) => (b.kills !== a.kills) ? b.kills - a.kills : b.damage - a.damage);
  scoreboardBody.innerHTML = '';
  list.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = s.local ? 'local-row' : '';
    tr.innerHTML = `<td>${s.name}</td><td>${s.kills}</td><td>${s.headshots}</td><td>${Math.round(s.damage)}</td><td>${s.coins}</td>`;
    scoreboardBody.appendChild(tr);
  });
}
document.addEventListener('keydown', e => {
  if (e.code === 'Tab' && state.running && !state.paused) { e.preventDefault(); if (!scoreboardOpen) { scoreboardOpen = true; renderScoreboard(); scoreboardEl.classList.remove('hidden'); } }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Tab' && scoreboardOpen) { e.preventDefault(); scoreboardOpen = false; scoreboardEl.classList.add('hidden'); }
});
window.addEventListener('beforeunload', () => playerStats.clear());
