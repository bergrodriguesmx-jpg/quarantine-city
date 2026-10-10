import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as Textures from './textures.js';
import { buildWorld } from './scenery.js';
import * as Sfx from './audio.js';
import * as bus from './src/core/bus.js';
import { Ev } from './src/core/events.js';
import { nextId } from './src/core/ids.js';
import { LocalAdapter } from './src/net/adapter.js';

bus.setAdapter(new LocalAdapter());

// ============================================================
// CONFIGURAÇÃO DO MODELO GLB
// ============================================================
const ZOMBIE_GLB_PATH = './low_poly_zombie_game_animation.glb';
const ZOMBIE_FACING_OFFSET = 0;

const ANIM_TIMESCALE = {
  Idle:   1.0,
  Walk:   2.8,
  Attack: 6.0,
  Death:  3.5,
};

const ROOT_MOTION_BONES = ['_rootJoint', 'COG_00'];

const BONE_FOR_LIMB = {
  head: 'Neck_02_030',
  armL: 'L_Shoulder_RK_Jnt_038',
  armR: 'R_Shoulder_RK_Jnt_053',
  legL: 'L_Thigh_RK_Jnt_08',
  legR: 'R_Thigh_RK_Jnt_020',
};

const BONE_HITBOX = {
  head:  { bone: 'Neck_02_030',          r: 0.15 },
  torso: { bone: 'Spine_02_027',         r: 0.22 },
  armL:  { bone: 'L_Elbow_RK_Jnt_039',   r: 0.11 },
  armR:  { bone: 'R_Elbow_RK_Jnt_054',   r: 0.11 },
  legL:  { bone: 'L_Knee_RK_Jnt_09',     r: 0.13 },
  legR:  { bone: 'R_Knee_RK_Jnt_021',    r: 0.13 },
};

let ZOMBIE_GLTF = null;
let ZOMBIE_SCALE = 1;
let ZOMBIE_CLIPS = [];

async function loadZombieModel() {
  const loader = new GLTFLoader();
  ZOMBIE_GLTF = await loader.loadAsync(ZOMBIE_GLB_PATH);

  const box = new THREE.Box3().setFromObject(ZOMBIE_GLTF.scene);
  const size = box.getSize(new THREE.Vector3());
  ZOMBIE_SCALE = 1.75 / size.y;
  console.log('[ZOMBIE] Altura original:', size.y.toFixed(2), 'm → scale', ZOMBIE_SCALE.toFixed(4));

  ZOMBIE_GLTF.scene.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      c.frustumCulled = false;
    }
  });

  ZOMBIE_CLIPS = ZOMBIE_GLTF.animations.map(clip => {
    const cleaned = clip.clone();
    const before = cleaned.tracks.length;

    cleaned.tracks = cleaned.tracks.filter(track => {
      const dotIdx = track.name.lastIndexOf('.');
      if (dotIdx < 0) return true;
      const boneName = track.name.slice(0, dotIdx);
      const prop = track.name.slice(dotIdx + 1);

      if (ROOT_MOTION_BONES.includes(boneName)) {
        if (prop === 'position' || prop === 'scale') return false;
      }
      return true;
    });

    console.log(`[ZOMBIE] "${clip.name}": ${before} → ${cleaned.tracks.length} tracks (${clip.duration.toFixed(2)}s)`);
    return cleaned;
  });

  const required = Object.values(BONE_FOR_LIMB);
  for (const name of required) {
    const found = ZOMBIE_GLTF.scene.getObjectByName(name);
    if (!found) console.warn('[ZOMBIE] ⚠️ Bone não encontrado:', name);
  }
}

// ============================================================
// CACHE
// ============================================================
const geoCache = new Map();
const matCache = new Map();
const HQ = 4, MQ = 3, LQ = 2;

function geoBox(w, h, d, seg = MQ) {
  const k = `b:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d, seg, seg, seg); geoCache.set(k, g); }
  return g;
}
function geoSphere(r, s = 16) {
  const k = `s:${r.toFixed(3)}:${s}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, s, Math.max(8, Math.floor(s * 0.75))); geoCache.set(k, g); }
  return g;
}
function geoCyl(rt, rb, h, s = 12) {
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
// WEAPONS
// ============================================================
const WEAPONS = {
  knife:    { id: 'knife',    name: 'FACA',           slot: 1, damage: 35, range: 3.0, cooldown: 0.55, type: 'melee',  cost: 0,    spread: 0,     pellets: 1, auto: false, color: 0xBDC3C7 },
  pistol:   { id: 'pistol',   name: 'PISTOLA',        slot: 2, damage: 40, range: 16,  cooldown: 0.28, type: 'ranged', cost: 40,   spread: 0.02,  pellets: 1, auto: false, color: 0x2C3E50, magSize: 12, reserveMax: 120, reloadTime: 1.3 },
  revolver: { id: 'revolver', name: 'REVOLVER',       slot: 2, damage: 90, range: 15,  cooldown: 0.75, type: 'ranged', cost: 150,  spread: 0.008, pellets: 1, auto: false, color: 0x4A4A4A, magSize: 6,  reserveMax: 42,  reloadTime: 2.2 },
  smg:      { id: 'smg',      name: 'SMG',            slot: 3, damage: 18, range: 13,  cooldown: 0.075, type: 'ranged', cost: 200,  spread: 0.07,  pellets: 1, auto: true,  color: 0x34495E, magSize: 30, reserveMax: 240, reloadTime: 1.9 },
  rifle:    { id: 'rifle',    name: 'RIFLE',          slot: 3, damage: 160, range: 30, cooldown: 1.1,  type: 'ranged', cost: 400,  spread: 0.005, pellets: 1, auto: false, color: 0x2C3E50, magSize: 5,  reserveMax: 40,  reloadTime: 2.9 },
  shotgun:  { id: 'shotgun',  name: 'SHOTGUN',        slot: 3, damage: 32, range: 8,   cooldown: 1.15, type: 'ranged', cost: 300,  spread: 0.22,  pellets: 10, auto: false, color: 0x8B4513, magSize: 5,  reserveMax: 30,  reloadTime: 2.5 },
  launcher: { id: 'launcher', name: 'LANCA-FOGUETES', slot: 4, damage: 250, range: 20, cooldown: 1.9,  type: 'ranged', cost: 1200, spread: 0.02,  pellets: 1, auto: false, color: 0xC0392B, magSize: 1,  reserveMax: 5,   reloadTime: 3.5 },
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

const ZOMBIE_VARIANTS = {
  normal:  { hpMul: 1.0,  speedMul: 1.0,  dmgMul: 1.0, xpMul: 1.0, coinMul: 1.0,  scale: 1.00, ranged: false, weight: 68, attackRange: 1.6, cooldown: 1.2, tint: 0xffffff },
  runner:  { hpMul: 0.5,  speedMul: 2.3,  dmgMul: 0.7, xpMul: 1.4, coinMul: 1.6,  scale: 0.85, ranged: false, weight: 20, attackRange: 1.4, cooldown: 0.85, tint: 0xffeebb },
  tank:    { hpMul: 3.2,  speedMul: 0.45, dmgMul: 2.0, xpMul: 2.8, coinMul: 3.2,  scale: 1.35, ranged: false, weight: 8,  attackRange: 2.0, cooldown: 1.6, tint: 0xffcccc },
  spitter: { hpMul: 0.75, speedMul: 0.9,  dmgMul: 0.6, xpMul: 2.0, coinMul: 2.2,  scale: 0.95, ranged: true,  weight: 4,  attackRange: 1.5, cooldown: 1.4, range: 12, rangedCooldown: 2.8, tint: 0xccffcc },
  boss:    { hpMul: 9.0,  speedMul: 0.55, dmgMul: 2.6, xpMul: 9.0, coinMul: 12.0, scale: 1.55, ranged: false, weight: 0,  attackRange: 2.2, cooldown: 1.8, tint: 0xffaaaa },
};

const CONFIG = {
  player: { speed: 5.5, height: 1.7, maxHealth: 100, radius: 0.4 },
  zombie: { speed: 1.9, maxHealth: 40, damage: 8, attackRange: 1.6, attackCooldown: 1.2, xpReward: 10, coinReward: 2, knockbackStagger: 0.25, radius: 0.4 },
  pursuit: { responsiveness: 3.8, arrivalRadius: 1.15, minSpeedFactor: 0.35 },
  wave: { baseZombies: 6, zombiesPerWave: 2, maxZombies: 40, breakTime: 5, coinBonus: 50, bossEvery: 5 },
  arena: { size: 80 },
  crit: { baseChance: 0.15, damageMultiplier: 2 },
  dismember: { headChance: 0.65, armChance: 0.50, legChance: 0.40, limbSpeed: 14, limbLife: 8 },
  headshotMultiplier: 2.5,
  shake: { hit: 0.05, kill: 0.12, shoot: 0.03, explosion: 0.5 },
  melee: { coneDot: 0.35 },
  launcher: { explosionRadius: 5, selfDamageFactor: 0.4 },
  downed: { selfReviveAt: 15000, selfReviveHold: 3000, duration: 30000, maxHP: 30, maxRevives: 2 },
  difficultyScalePerWave: 0.08,
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
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
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
    const m = new THREE.Mesh(geoBox(sx, sy, sz, MQ), mat || rockMat);
    m.position.set(px, py, pz); m.receiveShadow = true; g.add(m);
  }
  rock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(-0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0, 3.6, 0.2, 3.6, 0.9, 2.0, rockMat);
  const hole = new THREE.Mesh(geoBox(2.6, 2.6, 0.4, LQ), holeMat);
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
  const wall = new THREE.Mesh(geoBox(w, h, d, LQ), invisible);
  wall.position.set(x, h / 2, z);
  scene.add(wall);
  world.wallColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
});

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
    const hand = new THREE.Mesh(geoBox(0.10, 0.11, 0.13, MQ), MAT.skin);
    hand.position.set(0, 0, 0.02); hand.castShadow = true; handGroup.add(hand);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(geoBox(0.028, 0.045, 0.10, LQ), MAT.skin);
      finger.position.set(-0.036 + i * 0.024, 0.025, -0.03); handGroup.add(finger);
      const knuckle = new THREE.Mesh(geoBox(0.028, 0.028, 0.06, LQ), MAT.skinDark);
      knuckle.position.set(-0.036 + i * 0.024, 0.045, -0.055); handGroup.add(knuckle);
    }
    const thumb = new THREE.Mesh(geoBox(0.04, 0.035, 0.07, LQ), MAT.skin);
    thumb.position.set(0.052, 0.015, 0.02); handGroup.add(thumb);
    const knifeG = new THREE.Group();
    knifeG.position.set(0, 0.02, 0.02); handGroup.add(knifeG);
    const handle = new THREE.Mesh(geoBox(0.05, 0.22, 0.05, LQ), MAT.grip);
    handle.position.set(0, -0.04, 0.02); knifeG.add(handle);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(geoBox(0.055, 0.018, 0.055, LQ), MAT.metalDark);
      ring.position.set(0, -0.13 + i * 0.055, 0.02); knifeG.add(ring);
    }
    const pommel = new THREE.Mesh(geoBox(0.065, 0.03, 0.065, LQ), MAT.metalLight);
    pommel.position.set(0, -0.18, 0.02); knifeG.add(pommel);
    const guard = new THREE.Mesh(geoBox(0.16, 0.022, 0.09, LQ), MAT.metalDark);
    guard.position.set(0, 0.09, 0.02); knifeG.add(guard);
    const blade = new THREE.Mesh(geoBox(0.048, 0.50, 0.014, LQ), MAT.metalSteel);
    blade.position.set(0, 0.36, 0.02); blade.castShadow = true; knifeG.add(blade);
    const edge = new THREE.Mesh(geoBox(0.008, 0.48, 0.015, LQ), matB(0xFFFFFF));
    edge.position.set(-0.024, 0.36, 0.02); knifeG.add(edge);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), MAT.metalSteel);
    tip.rotation.y = Math.PI / 4; tip.position.set(0, 0.63, 0.02); knifeG.add(tip);
  } else if (weaponId === 'pistol') {
    const s = new THREE.Mesh(geoBox(0.065, 0.09, 0.30, LQ), MAT.metalMid); s.position.set(0, 0.06, -0.06); g.add(s);
    const st = new THREE.Mesh(geoBox(0.05, 0.03, 0.28, LQ), MAT.metalDark); st.position.set(0, 0.11, -0.06); g.add(st);
    const b = new THREE.Mesh(geoCyl(0.022, 0.022, 0.08, 8), MAT.metalDark); b.rotation.x = Math.PI / 2; b.position.set(0, 0.06, -0.24); g.add(b);
    const gr = new THREE.Mesh(geoBox(0.055, 0.18, 0.08, LQ), MAT.grip); gr.position.set(0, -0.07, 0.06); gr.rotation.x = 0.28; g.add(gr);
    const hand = new THREE.Mesh(geoBox(0.09, 0.11, 0.10, MQ), MAT.skin);
    hand.position.set(0, -0.06, 0.07); hand.rotation.x = 0.28; g.add(hand);
  } else if (weaponId === 'revolver') {
    const b = new THREE.Mesh(geoCyl(0.018, 0.018, 0.24, 8), MAT.metalMid); b.rotation.x = Math.PI / 2; b.position.set(0, 0.055, -0.16); g.add(b);
    const cy = new THREE.Mesh(geoCyl(0.045, 0.045, 0.10, 10), MAT.metalDark); cy.rotation.x = Math.PI / 2; cy.position.set(0, 0.045, 0); g.add(cy);
    const gr = new THREE.Mesh(geoBox(0.05, 0.20, 0.09, LQ), MAT.wood); gr.position.set(0, -0.08, 0.08); gr.rotation.x = 0.32; g.add(gr);
    const hand = new THREE.Mesh(geoBox(0.09, 0.11, 0.10, MQ), MAT.skin);
    hand.position.set(0, -0.07, 0.08); hand.rotation.x = 0.32; g.add(hand);
  } else if (weaponId === 'smg') {
    const b = new THREE.Mesh(geoBox(0.07, 0.10, 0.36, LQ), MAT.metalMid); b.position.set(0, 0.04, -0.06); g.add(b);
    const sh = new THREE.Mesh(geoCyl(0.025, 0.025, 0.12, 8), MAT.metalDark); sh.rotation.x = Math.PI / 2; sh.position.set(0, 0.04, -0.30); g.add(sh);
    const mg = new THREE.Mesh(geoBox(0.035, 0.18, 0.06, LQ), MAT.metalDark); mg.position.set(0, -0.10, 0.04); g.add(mg);
    const hand = new THREE.Mesh(geoBox(0.08, 0.11, 0.10, MQ), MAT.skin);
    hand.position.set(0, -0.06, 0.11); g.add(hand);
  } else if (weaponId === 'rifle') {
    const b = new THREE.Mesh(geoBox(0.06, 0.09, 0.55, LQ), MAT.metalMid); b.position.set(0, 0.035, -0.12); g.add(b);
    const bb = new THREE.Mesh(geoCyl(0.014, 0.014, 0.22, 8), MAT.metalDark); bb.rotation.x = Math.PI / 2; bb.position.set(0, 0.035, -0.55); g.add(bb);
    const st = new THREE.Mesh(geoBox(0.055, 0.10, 0.20, LQ), MAT.wood); st.position.set(0, 0.005, 0.24); g.add(st);
    const hand = new THREE.Mesh(geoBox(0.08, 0.11, 0.10, MQ), MAT.skin);
    hand.position.set(0, -0.06, 0.14); g.add(hand);
  } else if (weaponId === 'shotgun') {
    const b1 = new THREE.Mesh(geoCyl(0.022, 0.022, 0.5, 10), MAT.metalDark); b1.rotation.x = Math.PI / 2; b1.position.set(-0.022, 0.045, -0.24); g.add(b1);
    const b2 = new THREE.Mesh(geoCyl(0.022, 0.022, 0.5, 10), MAT.metalDark); b2.rotation.x = Math.PI / 2; b2.position.set(0.022, 0.045, -0.24); g.add(b2);
    const st = new THREE.Mesh(geoBox(0.06, 0.11, 0.22, LQ), MAT.wood); st.position.set(0, 0.01, 0.22); g.add(st);
    const hand = new THREE.Mesh(geoBox(0.08, 0.11, 0.10, MQ), MAT.skin);
    hand.position.set(0, -0.07, 0.12); g.add(hand);
  } else if (weaponId === 'launcher') {
    const tu = new THREE.Mesh(geoCyl(0.07, 0.08, 0.75, 12), MAT.metalMid); tu.rotation.x = Math.PI / 2; tu.position.set(0, 0.03, -0.12); g.add(tu);
    const mo = new THREE.Mesh(new THREE.CircleGeometry(0.062, 12), matB(0x000000)); mo.rotation.y = Math.PI; mo.position.set(0, 0.03, -0.49); g.add(mo);
    const hand = new THREE.Mesh(geoBox(0.08, 0.12, 0.10, MQ), MAT.skin);
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

function createZombieMesh(variantKey) {
  const variant = ZOMBIE_VARIANTS[variantKey] || ZOMBIE_VARIANTS.normal;
  const clone = SkeletonUtils.clone(ZOMBIE_GLTF.scene);
  clone.scale.setScalar(ZOMBIE_SCALE * variant.scale);

  if (variant.tint && variant.tint !== 0xffffff) {
    clone.traverse(c => {
      if (c.isMesh && c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        const cloned = mats.map(m => {
          const cm = m.clone();
          cm.color.multiply(new THREE.Color(variant.tint));
          cm.needsUpdate = true;
          return cm;
        });
        c.material = cloned.length === 1 ? cloned[0] : cloned;
      }
    });
  }

  const mixer = new THREE.AnimationMixer(clone);
  const actions = {};
  for (const clip of ZOMBIE_CLIPS) {
    const action = mixer.clipAction(clip);
    action.timeScale = ANIM_TIMESCALE[clip.name] ?? 1.0;
    if (clip.name === 'Death') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    actions[clip.name] = action;
  }

  if (actions.Idle) actions.Idle.reset().play();
  else if (actions.Walk) actions.Walk.reset().play();

  clone.userData = {
    mixer,
    actions,
    currentAction: actions.Idle ? 'Idle' : 'Walk',
    bones: {
      head: clone.getObjectByName(BONE_FOR_LIMB.head),
      armL: clone.getObjectByName(BONE_FOR_LIMB.armL),
      armR: clone.getObjectByName(BONE_FOR_LIMB.armR),
      legL: clone.getObjectByName(BONE_FOR_LIMB.legL),
      legR: clone.getObjectByName(BONE_FOR_LIMB.legR),
    },
    zombieType: variantKey,
  };
  return clone;
}

function setZombieAction(z, name, fade = 0.25) {
  const ud = z.mesh.userData;
  if (ud.currentAction === name) return;
  const next = ud.actions[name];
  if (!next) return;
  const prev = ud.actions[ud.currentAction];

  next.reset();
  if (name === 'Death') {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  }
  next.play();

  if (prev && prev !== next) {
    try { next.crossFadeFrom(prev, fade, true); }
    catch (e) { prev.stop(); }
  }
  ud.currentAction = name;
}

function pickVariant() {
  const entries = Object.entries(ZOMBIE_VARIANTS).filter(([k]) => k !== 'boss');
  const total = entries.reduce((s, [, v]) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) { r -= v.weight; if (r <= 0) return k; }
  return 'normal';
}

let groanTimer = 0;

function spawnZombie(forceVariant) {
  const cave = caves[Math.floor(Math.random() * caves.length)];
  const toCX = -cave.x, toCZ = -cave.z;
  const len = Math.sqrt(toCX * toCX + toCZ * toCZ) || 1;
  const dirX = toCX / len, dirZ = toCZ / len;
  const back = 0.8 + Math.random() * 0.8;
  const side = (Math.random() - 0.5) * 1.6;
  const spawnX = cave.x + dirX * back + (-dirZ) * side;
  const spawnZ = cave.z + dirZ * back + dirX * side;

  const variantKey = forceVariant || pickVariant();
  const variant = ZOMBIE_VARIANTS[variantKey];
  const mesh = createZombieMesh(variantKey);
  mesh.position.set(spawnX, 0, spawnZ);
  scene.add(mesh);

  const waveScale = 1 + CONFIG.difficultyScalePerWave * Math.max(0, state.wave - 1);
  const baseHP = CONFIG.zombie.maxHealth * variant.hpMul * waveScale;
  const baseDamage = CONFIG.zombie.damage * variant.dmgMul * waveScale;
  const sizeSpeedFactor = Math.pow(1 / Math.max(0.5, variant.scale), 0.7);
  const finalSpeed = CONFIG.zombie.speed * variant.speedMul * sizeSpeedFactor;

  const z = {
    id: nextId('z'), mesh,
    health: baseHP, maxHealth: baseHP, damage: baseDamage, speed: finalSpeed,
    scale: variant.scale, radius: CONFIG.zombie.radius * variant.scale,
    attackRange: variant.attackRange || CONFIG.zombie.attackRange,
    attackCooldown: variant.cooldown || CONFIG.zombie.attackCooldown,
    xpReward: Math.round(CONFIG.zombie.xpReward * variant.xpMul * waveScale),
    coinReward: Math.round(CONFIG.zombie.coinReward * variant.coinMul),
    isBoss: variantKey === 'boss',
    isRanged: !!variant.ranged,
    rangedRange: variant.range || 0,
    rangedCooldown: variant.rangedCooldown || 2.8,
    lastRangedShot: 0,
    lastAttackTime: 0, walkPhase: Math.random() * Math.PI * 2,
    hitReactEndTime: 0, hitDirection: new THREE.Vector3(),
    dismembered: { head: false, armL: false, armR: false, legL: false, legR: false },
    emergeTime: 0,
    vx: 0, vz: 0, yawVel: 0,
    attackAnimUntil: 0,
  };
  zombies.push(z);
  state.zombiesAlive++;

  bus.emit(Ev.ZOMBIE_SPAWNED, { id: z.id, type: variantKey, isBoss: z.isBoss, pos: { x: mesh.position.x, y: 0, z: mesh.position.z } });
  updateHUD();
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
// DEBRIS
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
const flyingLimbs = [];

// ============================================================
// RAGDOLL — Death clip + fade
// ============================================================
const ragdolls = [];
function startRagdoll(mesh, hitDir, hitStrength, missingParts) {
  const ud = mesh.userData;
  const actions = ud.actions;
  if (!actions) { scene.remove(mesh); return; }

  if (actions.Death) {
    if (actions.Idle) actions.Idle.stop();
    if (actions.Walk) actions.Walk.stop();
    if (actions.Attack) actions.Attack.stop();
    actions.Death.reset();
    actions.Death.setLoop(THREE.LoopOnce, 1);
    actions.Death.clampWhenFinished = true;
    actions.Death.play();
    ud.currentAction = 'Death';
  }

  const rd = {
    mesh,
    mixer: ud.mixer,
    bornAt: performance.now() / 1000,
    disposed: false,
    dispose() { if (!this.disposed) { scene.remove(mesh); this.disposed = true; } },
    update(dt) {
      ud.mixer.update(dt);
      const elapsed = performance.now() / 1000 - this.bornAt;
      if (elapsed > 5) {
        const op = Math.max(0, 1 - (elapsed - 5) / 2);
        mesh.traverse(c => {
          if (c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => { m.transparent = true; m.opacity = op; });
          }
        });
        if (op <= 0) return true;
      }
      return false;
    },
  };
  ragdolls.push(rd);
}

function detachLimb(z, key, hitDir) {
  const ud = z.mesh.userData;
  const bone = ud.bones[key];
  if (!bone || z.dismembered[key]) return;
  z.mesh.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  bone.getWorldPosition(wp);

  bone.traverse(c => {
    if (c.isBone) c.scale.setScalar(0.001);
  });
  z.dismembered[key] = true;

  let size, color;
  if (key === 'head') { size = new THREE.Vector3(0.28, 0.32, 0.28); color = 0x7BC950; }
  else if (key === 'armL' || key === 'armR') { size = new THREE.Vector3(0.16, 0.9, 0.16); color = 0xCC1111; }
  else { size = new THREE.Vector3(0.18, 1.0, 0.18); color = 0x3E2723; }
  size.multiplyScalar(z.scale);
  const geo = geoBox(size.x, size.y, size.z, MQ);
  const mesh = new THREE.Mesh(geo, matL(color));
  mesh.position.copy(wp);
  mesh.castShadow = true;
  scene.add(mesh);
  const piece = new Debris(mesh, size, 1.2, CONFIG.dismember.limbLife);
  piece.key = key;
  const dir = hitDir.clone().normalize();
  const speed = CONFIG.dismember.limbSpeed;
  piece.velocity.set(dir.x * speed + (Math.random() - 0.5) * 6, speed * 0.8 + Math.random() * 5, dir.z * speed + (Math.random() - 0.5) * 6);
  piece.angularVelocity.set((Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35);
  flyingLimbs.push(piece);
  spawnBlood(wp, dir, 35, true);
  spawnBlood(wp, null, 15, true);
  bus.emit(Ev.DISMEMBER, { zombieId: z.id, part: key, pos: { x: wp.x, y: wp.y, z: wp.z } });
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
  for (const piece of flyingLimbs) {
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
const _bonePos = new THREE.Vector3();
function raySphere(origin, dir, center, radius, maxDist) {
  const ocx = origin.x - center.x, ocy = origin.y - center.y, ocz = origin.z - center.z;
  const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
  const c = ocx * ocx + ocy * ocy + ocz * ocz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return null;
  return t;
}

const _hitboxes = [];
function getZombieHitboxes(z) {
  _hitboxes.length = 0;
  for (const [key, info] of Object.entries(BONE_HITBOX)) {
    if (z.dismembered[key]) continue;
    const bone = z.mesh.getObjectByName(info.bone);
    if (!bone) continue;
    bone.updateMatrixWorld(true);
    bone.getWorldPosition(_bonePos);
    _hitboxes.push({ key, pos: _bonePos.clone(), radius: info.r * z.scale });
  }
  return _hitboxes;
}

function raycastZombie(origin, dir, maxDist) {
  let bestZ = null, bestDist = Infinity, bestPart = null, bestPoint = null;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    z.mesh.updateMatrixWorld(true);
    const boxes = getZombieHitboxes(z);
    for (let b = 0; b < boxes.length; b++) {
      const h = boxes[b];
      const t = raySphere(origin, dir, h.pos, h.radius, maxDist);
      if (t !== null && t < bestDist) {
        bestDist = t; bestZ = z; bestPart = h.key;
        bestPoint = origin.clone().addScaledVector(dir, t);
      }
    }
  }
  return { zombie: bestZ, part: bestPart, distance: bestDist, point: bestPoint };
}

function applyHitReaction(z, part, hitDirWorld, force = 1) {
  z.hitDirection.copy(hitDirWorld);
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
// DAMAGE
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
  if (z.health <= 0) {
    Sfx.playZombieDeath(); Sfx.playCoin(); addShake(CONFIG.shake.kill);
    state.coins += z.coinReward; state.xp += z.xpReward;
    state.kills++; if (isHead) state.headshots++;
    if (state.lifesteal > 0) state.health = Math.min(state.maxHealth, state.health + state.lifesteal);
    bus.emit(Ev.DEATH, { id: z.id, killerId: player.id, part });
    bus.emit(Ev.KILL, { killerId: player.id, victimId: z.id, victimType: z.mesh.userData.zombieType, headshot: isHead, weaponId: state.inventory[state.currentSlot] });
    if (isHead) bus.emit(Ev.HEADSHOT, { playerId: player.id, victimId: z.id });
    bus.emit(Ev.COIN_GAIN, { playerId: player.id, amount: z.coinReward, total: state.coins });
    bus.emit(Ev.XP_GAIN, { playerId: player.id, amount: z.xpReward, total: state.xp });
    checkLevelUp();
    randomDismemberOnDeath(z);
    const idx = zombies.indexOf(z);
    if (idx >= 0) zombies.splice(idx, 1);
    startRagdoll(z.mesh, hitDir, 1, z.dismembered);
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
function rollCrit() { return Math.random() < state.critChance; }

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
function startWave() {
  if (state.waveIntervalId !== null) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; }
  state.wave++; state.betweenWaves = false;
  const count = Math.min(CONFIG.wave.baseZombies + (state.wave - 1) * CONFIG.wave.zombiesPerWave, CONFIG.wave.maxZombies);
  const isBossWave = state.wave % CONFIG.wave.bossEvery === 0;
  state.zombiesRemainingInWave = count + (isBossWave ? 1 : 0);
  showWaveBanner((isBossWave ? 'HORDA CHEFE ' : 'HORDA ') + state.wave);
  bus.emit(Ev.WAVE_START, { wave: state.wave, count, boss: isBossWave });
  let spawnedBoss = false; updateHUD();
  state.waveIntervalId = setInterval(() => {
    if (!state.running || state.paused) { if (!state.running) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; } return; }
    if (state.levelUpActive) return;
    if (state.zombiesRemainingInWave <= 0) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; return; }
    if (isBossWave && !spawnedBoss) { spawnZombie('boss'); spawnedBoss = true; } else spawnZombie();
    state.zombiesRemainingInWave--; updateHUD();
  }, 500);
}
function checkWaveComplete() {
  if (state.betweenWaves) return;
  if (state.zombiesAlive === 0 && state.zombiesRemainingInWave <= 0) {
    state.betweenWaves = true;
    bus.emit(Ev.WAVE_CLEAR, { wave: state.wave });
    const bonus = Math.round(CONFIG.wave.coinBonus * state.coinMult);
    state.coins += bonus; updateHUD();
    showWaveBanner('+' + bonus + ' $ - PROXIMA EM 5s');
    if (state.waveStartTimeoutId !== null) clearTimeout(state.waveStartTimeoutId);
    state.waveStartTimeoutId = setTimeout(() => { state.waveStartTimeoutId = null; if (state.running && !state.paused) startWave(); }, CONFIG.wave.breakTime * 1000);
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
  base.addEventListener('touchstart', e => { e.preventDefault(); Sfx.initAudio(); Sfx.resumeAudio(); baseRect = base.getBoundingClientRect(); touching = true; }, { passive: false });
  document.addEventListener('touchmove', e => {
    if (!touching || !baseRect) return;
    for (const t of e.changedTouches) {
      const cx = baseRect.left + baseRect.width / 2, cy = baseRect.top + baseRect.height / 2;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const maxD = baseRect.width / 2, d = Math.hypot(dx, dy);
      if (d > maxD) { dx = dx / d * maxD; dy = dy / d * maxD; }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      mobile.moveX = dx / maxD; mobile.moveY = dy / maxD;
    }
  }, { passive: false });
  document.addEventListener('touchend', () => { touching = false; stick.style.transform = 'translate(0,0)'; mobile.moveX = 0; mobile.moveY = 0; });
  look.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; mobile.looking = true; mobile.lastX = t.clientX; mobile.lastY = t.clientY; }, { passive: false });
  look.addEventListener('touchmove', e => {
    e.preventDefault(); if (!mobile.looking) return;
    const t = e.touches[0];
    const dx = t.clientX - mobile.lastX, dy = t.clientY - mobile.lastY;
    mobile.lastX = t.clientX; mobile.lastY = t.clientY;
    player.yaw -= dx * 0.005; player.pitch -= dy * 0.005;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  }, { passive: false });
  look.addEventListener('touchend', () => { mobile.looking = false; });
  atk.addEventListener('touchstart', e => { e.preventDefault(); attack(); }, { passive: false });
  ads.addEventListener('touchstart', e => {
    e.preventDefault();
    const wid = state.inventory[state.currentSlot] || 'knife';
    if (WEAPONS[wid].type === 'melee') return;
    state.aiming = !state.aiming; updateCrosshair();
  }, { passive: false });
  rel.addEventListener('touchstart', e => {
    e.preventDefault();
    const wid = state.inventory[state.currentSlot];
    if (wid && WEAPONS[wid].type === 'ranged') startReload(wid);
  }, { passive: false });
  buy.addEventListener('touchstart', e => {
    e.preventDefault(); if (state.downed) return;
    if (nearWeapon && !nearWeapon.bought) tryBuyWeapon();
    else if (state.shopOpen) closeShop(); else openShop();
  }, { passive: false });
  rev.addEventListener('touchstart', e => { e.preventDefault(); if (state.downed) state.keys['KeyE'] = true; }, { passive: false });
  rev.addEventListener('touchend', e => { e.preventDefault(); state.keys['KeyE'] = false; });
}
setupMobile();
const pauseEl = document.getElementById('pause');
function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) { pauseEl.classList.remove('hidden'); if (document.exitPointerLock) document.exitPointerLock(); }
  else { pauseEl.classList.add('hidden'); if (!isMobile()) renderer.domElement.requestPointerLock(); }
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
  else { if (state.keys['KeyW']) mz -= 1; if (state.keys['KeyS']) mz += 1; if (state.keys['KeyA']) mx -= 1; if (state.keys['KeyD']) mx += 1; }
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
  if (state.isMoving) state.bobTime += dt * 9; else state.bobTime *= 0.9;
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
  } else { camera.rotation.z = 0; state.shake = 0; }
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
// ZOMBIE UPDATE
// ============================================================
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

    const dxP = player.position.x - z.mesh.position.x;
    const dzP = player.position.z - z.mesh.position.z;
    const dist = Math.hypot(dxP, dzP);
    const staggering = z.hitReactEndTime > now;

    // Rotação suave (com offset de facing se o modelo precisar)
    const targetYaw = Math.atan2(dxP, dzP) + ZOMBIE_FACING_OFFSET;
    let yawDiff = targetYaw - z.mesh.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    const yawStep = yawDiff * Math.min(1, dt * 7);
    z.mesh.rotation.y += yawStep;

    // Movimento fluido
    const arrival = z.attackRange + CONFIG.pursuit.arrivalRadius;
    let desiredVx = 0, desiredVz = 0;
    if (!staggering && emerge >= 0.5 && dist > arrival) {
      const speedFactor = isWounded ? 0.6 : 1.0;
      const target = z.speed * speedFactor;
      desiredVx = (dxP / dist) * target;
      desiredVz = (dzP / dist) * target;
    } else if (!staggering && emerge >= 0.5 && dist > z.attackRange) {
      const t = (dist - z.attackRange) / CONFIG.pursuit.arrivalRadius;
      const target = z.speed * Math.max(CONFIG.pursuit.minSpeedFactor, t) * (isWounded ? 0.6 : 1);
      desiredVx = (dxP / dist) * target;
      desiredVz = (dzP / dist) * target;
    }
    const k = 1 - Math.exp(-dt * CONFIG.pursuit.responsiveness);
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

    // ============================================
    // ESCOLHA DE ANIMAÇÃO
    // ============================================
    const actualSpeed = Math.hypot(z.vx, z.vz);
    const speedNorm = actualSpeed / Math.max(0.01, z.speed);
    const ud2 = z.mesh.userData;
    const actions = ud2.actions;

    let targetAnim = 'Idle';
    if (staggering || isWounded) targetAnim = 'Idle';
    else if (now < z.attackAnimUntil) targetAnim = 'Attack';
    else if (speedNorm > 0.15) targetAnim = 'Walk';

    if (!actions[targetAnim]) targetAnim = actions.Walk ? 'Walk' : 'Idle';

    setZombieAction(z, targetAnim, targetAnim === 'Attack' ? 0.08 : 0.25);

    if (targetAnim === 'Walk' && actions.Walk) {
      actions.Walk.timeScale = ANIM_TIMESCALE.Walk * (0.5 + speedNorm);
    }
    if (targetAnim === 'Attack' && actions.Attack) {
      actions.Attack.timeScale = ANIM_TIMESCALE.Attack;
    }

    ud2.mixer.update(dt);

    // Ataque lógico
    if (emerge >= 0.5) {
      if (z.isRanged && !staggering) {
        if (dist < z.rangedRange && now - z.lastRangedShot > z.rangedCooldown) {
          z.lastRangedShot = now;
          z.attackAnimUntil = now + 1.4;
          setTimeout(() => {
            if (state.downed || !state.running) return;
            const dm = z.damage * (1 - state.damageReduction);
            state.health -= dm;
            Sfx.playPlayerHurt(); showDamageFlash(); addShake(0.15);
            bus.emit(Ev.PLAYER_HIT, { playerId: player.id, attackerId: z.id, amount: dm, pos: { x: player.position.x, y: 1, z: player.position.z } });
            updateHUD();
            if (state.health <= 0 && !state.downed) enterDownedState();
          }, 500);
        }
      } else if (!staggering && now - z.lastAttackTime > z.attackCooldown && dist < z.attackRange + 0.5) {
        z.lastAttackTime = now;
        z.attackAnimUntil = now + 1.4;
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
  const mesh = new THREE.Mesh(geoBox(0.3, 0.15, 0.6, LQ), new THREE.MeshLambertMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.3 }));
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

// ============================================================
// BOOTSTRAP
// ============================================================
const loadingEl = document.createElement('div');
loadingEl.style.cssText = 'position:fixed;inset:0;background:#0b0b0b;color:#cc0000;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:24px;z-index:999;';
loadingEl.textContent = 'CARREGANDO MODELO...';
document.body.appendChild(loadingEl);

loadZombieModel().then(() => {
  loadingEl.remove();
  animate();
}).catch(err => {
  loadingEl.textContent = '❌ ERRO: ' + err.message;
  console.error(err);
});

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
  if (!ZOMBIE_GLTF) { alert('Modelo ainda carregando...'); return; }
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
