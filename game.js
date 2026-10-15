// ============================================================
// game.js — v19 "STABLE"
// ============================================================
// Correções v19:
//   • createZombieMesh usa skinPalette/shirtPalette/pantsPalette
//   • reach = state.isGrounded (zumbi ataca)
//   • recentAttackers NÃO é limpo por frame (limite de atacantes)
//   • Importa zombie-dismember v4 (LIMB_IDX + cartoon mesh)
// ============================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as Textures from './textures.js';
import { buildWorld } from './scenery.js';
import * as Sfx from './audio.js';
import * as bus from './src/core/bus.js';
import { Ev } from './src/core/events.js';
import { nextId } from './src/core/ids.js';
import { LocalAdapter } from './src/net/adapter.js';
import { Action, getControls } from './save-controls.js';
import { ControlsUI } from './controls-ui.js';
import * as Daytime from './src/core/daytime.js';
import * as Gore from './src/core/gore.js';
import * as ZombieAI from './src/core/zombie-ai.js';
import * as BossAI from './src/core/boss-ai.js';
import * as Extraction from './src/core/extraction.js';
import { survival } from './src/core/survival.js';
import { ZOMBIE_TYPES, pickZombieType, BOSS_ROTATION } from './src/core/zombie-types.js';
import { initStuckState, updateStuckDetection } from './src/core/zombie-stuck.js';
import { Weapon3DView } from './src/render/viewmodel-3d.js';
import { spawnPickup3D, updatePickups3D, clearPickups3D } from './src/render/pickup-3d.js';
import { WeaponCalibrator } from './src/render/weapon-calibrator.js';
import { preloadGibs } from './gib-models.js';
import { preloadGibGLBs } from './gib-glb.js';
import { preloadCharacters, createCharacter } from './character-models.js';
import { precacheAllWeaponGLBs } from './src/render/weapon-models.js';
import { applyPerk, getPerk } from './perks-system.js';
import { geoBox, geoCyl, matL, matB } from './src/core/geo-cache.js';
import { enrichWeapons, ZOMBIE_LORE, formatWeaponTooltip } from './src/core/lore.js';
import { initPhysics, stepPhysics, addStaticBox, clearPhysics } from './src/core/ragdoll-physics.js';

import {
  ZombieLoadState,
  initZombieSystems,
  updateZombieLOD,
  updateZombieSleepState,
  tickZombiePopulation,
  applyZombieWaterDamage,
} from './zb2-zombie-systems.js';

import {
  LIMBS, L2G, GONE, STUMP, GIBEND, GROUP_CFG, LIMB_IDX,
  computePose, renderFigure,
  VerletRagdoll, LimbGib, tryDismember,
  raySegmentHitFull,
  SHARED_BOX, SHARED_STUMP_GEO,
} from './zombie-dismember.js';

// ─── BOOT ───
bus.setAdapter(new LocalAdapter());
window.ZOMBIE_TYPES_FROM_MODULE = ZOMBIE_TYPES;
const controls = getControls();

window.__assetsReady = false;
(async () => {
  console.log('[game] 📦 Carregando assets...');
  try { await precacheAllWeaponGLBs(); } catch (e) { console.warn('[game] armas:', e); }
  try { await preloadGibs(); await preloadGibGLBs(); } catch (e) { console.warn('[game] gibs:', e); }
  try { await preloadCharacters(); } catch (e) { console.warn('[game] NPCs:', e); }
  console.log('[game] ✅ Assets prontos');
  window.__assetsReady = true;
})();

// ─── HELPERS ───
const roundedBoxCache = new Map();
function geoRoundBox(w, h, d, radius = 0.03) {
  const k = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${radius.toFixed(3)}`;
  let g = roundedBoxCache.get(k);
  if (!g) {
    const r = Math.min(radius, Math.min(w, h, d) * 0.45);
    g = Math.min(w, h, d) < 0.08 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
    roundedBoxCache.set(k, g);
  }
  return g;
}

// ─── WEAPONS ───
const WEAPONS = {
  knife:       { id:'knife',       name:'FACA',             slot:1, type:'melee',  damage:35, range:3.0, cooldown:0.55, cost:0,    color:0xBDC3C7, arc:0.35, hitCount:1, chop:0.65 },
  woodenClub:  { id:'woodenClub',  name:'PORRETE',          slot:1, type:'melee',  damage:55, range:2.8, cooldown:0.75, cost:30,   color:0x8B5A2B, arc:0.4,  hitCount:2, chop:0.15 },
  pipe:        { id:'pipe',        name:'CANO DE FERRO',    slot:1, type:'melee',  damage:60, range:3.2, cooldown:0.65, cost:50,   color:0x7F8C8D, arc:0.35, hitCount:2, chop:0.25 },
  cleaver:     { id:'cleaver',     name:'CUTELO',           slot:1, type:'melee',  damage:70, range:2.5, cooldown:0.7,  cost:80,   color:0xC0C0C0, arc:0.3,  hitCount:1, chop:0.8 },
  shovel:      { id:'shovel',      name:'PÁ',               slot:1, type:'melee',  damage:45, range:3.5, cooldown:0.8,  cost:60,   color:0x5D4030, arc:0.35, hitCount:2, chop:0.1, push:true },
  katana:      { id:'katana',      name:'KATANA',           slot:1, type:'melee',  damage:90, range:3.3, cooldown:0.5,  cost:400,  color:0xE8E8E8, arc:0.4,  hitCount:3, chop:0.95 },
  kukri:       { id:'kukri',       name:'KUKRI',            slot:1, type:'melee',  damage:75, range:2.8, cooldown:0.55, cost:200,  color:0xB0B0B0, arc:0.35, hitCount:2, chop:0.85 },
  pipeWrench:  { id:'pipeWrench',  name:'CHAVE GRIFO',      slot:1, type:'melee',  damage:65, range:2.9, cooldown:0.9,  cost:70,   color:0x4A4A4A, arc:0.4,  hitCount:1, chop:0.1 },
  reaperScythe:{ id:'reaperScythe',name:'FOICE DO CEIFADOR',slot:1, type:'melee',  damage:180,range:4.0, cooldown:1.0,  cost:1500, color:0x1A1A1A, arc:0.6,  hitCount:5, chop:1.0 },
  pistol:      { id:'pistol',      name:'PISTOLA',          slot:2, type:'ranged', damage:40, range:16, cooldown:0.28, cost:40,   spread:0.02,  pellets:1, auto:false, color:0x2C3E50, magSize:12, reserveMax:120, reloadTime:1.3 },
  revolver:    { id:'revolver',    name:'REVOLVER',         slot:2, type:'ranged', damage:90, range:15, cooldown:0.75, cost:120,  spread:0.008, pellets:1, auto:false, color:0x4A4A4A, magSize:6,  reserveMax:42,  reloadTime:2.2 },
  smg:         { id:'smg',         name:'SMG',              slot:3, type:'ranged', damage:18, range:13, cooldown:0.075,cost:160,  spread:0.07,  pellets:1, auto:true,  color:0x34495E, magSize:30, reserveMax:240, reloadTime:1.9 },
  rifle:       { id:'rifle',       name:'RIFLE',            slot:3, type:'ranged', damage:160,range:30, cooldown:1.1,  cost:320,  spread:0.005, pellets:1, auto:false, color:0x2C3E50, magSize:5,  reserveMax:40,  reloadTime:2.9 },
  shotgun:     { id:'shotgun',     name:'SHOTGUN',          slot:3, type:'ranged', damage:32, range:8,  cooldown:1.15, cost:220,  spread:0.22,  pellets:10,auto:false, color:0x8B4513, magSize:5,  reserveMax:30,  reloadTime:2.5 },
  launcher:    { id:'launcher',    name:'LANÇA-FOGUETES',   slot:4, type:'ranged', damage:250,range:20, cooldown:1.9,  cost:700,  spread:0.02,  pellets:1, auto:false, color:0xC0392B, magSize:1,  reserveMax:5,   reloadTime:3.5 },
};
enrichWeapons(WEAPONS);
const AMMO_PACKS  = { pistol:60, revolver:12, smg:90, rifle:15, shotgun:15, launcher:2 };
const AMMO_PRICES = { pistol:5,  revolver:15, smg:25, rifle:40, shotgun:30, launcher:100 };

// ─── SKILLS ───
const SKILLS = [
  { id:'vitality',   icon:'V', name:'VITALIDADE',   desc:'+20 HP maximo',      apply:()=>{ state.maxHealth+=20; state.health=Math.min(state.maxHealth,state.health+20); } },
  { id:'strength',   icon:'F', name:'FORCA',        desc:'+15% dano',          apply:()=>{ state.damageMult+=0.15; } },
  { id:'reach',      icon:'A', name:'ALCANCE',      desc:'+0.3m alcance',      apply:()=>{ state.rangeBonus+=0.3; } },
  { id:'agility',    icon:'V', name:'AGILIDADE',    desc:'+8% velocidade',     apply:()=>{ state.speedMult+=0.08; } },
  { id:'precision',  icon:'P', name:'PRECISAO',     desc:'+8% critico',        apply:()=>{ state.critChance=Math.min(0.95,state.critChance+0.08); } },
  { id:'vampirism',  icon:'S', name:'VAMPIRISMO',   desc:'+3 HP por kill',     apply:()=>{ state.lifesteal+=3; } },
  { id:'fortune',    icon:'$', name:'FORTUNA',      desc:'+50% moedas',        apply:()=>{ state.coinMult+=0.5; } },
  { id:'wisdom',     icon:'W', name:'SABEDORIA',    desc:'+30% XP',            apply:()=>{ state.xpMult+=0.3; } },
  { id:'resistance', icon:'R', name:'RESISTENCIA',  desc:'-10% dano recebido', apply:()=>{ state.damageReduction=Math.min(0.7,state.damageReduction+0.1); } },
  { id:'fury',       icon:'U', name:'FURIA',        desc:'-12% tempo ataque',  apply:()=>{ state.attackSpeedMult+=0.12; } },
  { id:'heavy',      icon:'H', name:'GOLPE PESADO', desc:'+0.5x dano critico', apply:()=>{ state.critDamageBonus+=0.5; } },
];

const WAVE_PACKAGES = [
  { firstWave: 1,  lastWave: 3,   types: ['pt'],                                       baseZombies: 5,  zombiesPerWave: 2, timeVariation: 0.20 },
  { firstWave: 4,  lastWave: 6,   types: ['pt','runner'],                              baseZombies: 8,  zombiesPerWave: 3, timeVariation: 0.25 },
  { firstWave: 7,  lastWave: 9,   types: ['pt','runner','worker','miner','spitter'],   baseZombies: 11, zombiesPerWave: 3, timeVariation: 0.30 },
  { firstWave: 10, lastWave: 12,  types: ['worker','combat','security','boomer'],      baseZombies: 14, zombiesPerWave: 4, timeVariation: 0.35 },
  { firstWave: 13, lastWave: 999, types: ['combat','brute','riot','boomer','spitter'], baseZombies: 16, zombiesPerWave: 4, timeVariation: 0.40 },
];

const CONFIG = {
  player: { speed:7.0, height:1.7, maxHealth:100, radius:0.4, staminaMax:100, staminaRegen:25, staminaDrainRun:14, sprintMult:1.55, jumpForce:7.0, jumpForwardForce:6.5, jumpAirDecay:2.2, gravity:22, vaultSpeed:8.5, vaultDuration:0.55 },
  zombie: { speed:3.0, maxHealth:40, damage:8, attackRange:1.6, attackCooldown:1.2, xpReward:10, coinReward:2, radius:0.4 },
  scaling: { hpPerWave:0.10, dmgPerWave:0.05, speedPerWave:0.02, speedCap:1.30 },
  aggro: { alertRadius:8.0, alertDuration:3.0, alertSpeedMult:1.4 },
  wave: { breakTime:5, bossEvery:5, clearBonusBase:15, clearBonusPerWave:5, clearHealFrac:0.15, clearAmmoFrac:0.30, maxZombies:16 },
  arena: { size: 600 },
  island: { innerRadius: 200, waterY: -2.5, waterMargin: 2.0 },
  crit: { baseChance:0.15, damageMultiplier:2 },
  headshotMultiplier: 2.5,
  shake: { hit:0.05, kill:0.12, shoot:0.03, explosion:0.5 },
  melee: { coneDot:0.35, hitstop:0.055 },
  launcher: { explosionRadius:5, selfDamageFactor:0.4 },
  downed: { selfReviveAt:15000, selfReviveHold:3000, duration:30000, maxHP:30, maxRevives:2 },
  brazier: { fuelPerWave:1, maxFuel:3, waveSpeedBoost:3.0, rewardMult:2.0 },
  vendor: { spawnEveryWaves:3, durationSec:60, buyDiscount:0.8 },
  loot: { pickupRadius: 1.6, bobSpeed: 2.5, spinSpeed: 1.5 },
  attackPermission: { maxAttackersEasy: 4, maxAttackersMedium: 3, maxAttackersHard: 2, maxAttackersVeryHard: 2, cooldownPerZombie: 1.8, distanceThreshold: 18 },
  difficultyRegions: { randomizePerMatch: true, offsetsRange: 40 },
};

const LOOT_TABLE = {
  generic:           { tier1:'food',     tier2:'ammo',     tier3:'medkit',   tier4:'ammo',   tier5:'ammo'   },
  bedroom:           { tier1:'food',     tier2:'medkit',   tier3:'ammo',     tier4:'ammo',   tier5:'ammo'   },
  kitchen:           { tier1:'food',     tier2:'food',     tier3:'medkit',   tier4:'ammo',   tier5:'ammo'   },
  living_room:       { tier1:'food',     tier2:'cash',     tier3:'medkit',   tier4:'ammo',   tier5:'ammo'   },
  police_armory:     { tier1:'ammo',     tier2:'ammo',     tier3:'component',tier4:'ammo',   tier5:'ammo'   },
  police_cells:      { tier1:'cash',     tier2:'medkit',   tier3:'ammo',     tier4:'ammo',   tier5:'ammo'   },
  healing_items:     { tier1:'medkit',   tier2:'medkit',   tier3:'medkit',   tier4:'medkit', tier5:'medkit' },
  church_supplies:   { tier1:'cash',     tier2:'medkit',   tier3:'medkit',   tier4:'ammo',   tier5:'ammo'   },
  factory_loot:      { tier1:'ammo',     tier2:'component',tier3:'ammo',     tier4:'ammo',   tier5:'ammo'   },
  factory_gun_closet:{ tier1:'component',tier2:'ammo',     tier3:'ammo',     tier4:'ammo',   tier5:'ammo'   },
  military:          { tier1:'ammo',     tier2:'ammo',     tier3:'ammo',     tier4:'ammo',   tier5:'ammo'   },
  gas_station:       { tier1:'ammo',     tier2:'food',     tier3:'medkit',   tier4:'ammo',   tier5:'ammo'   },
  gov_office:        { tier1:'cash',     tier2:'cash',     tier3:'cash',     tier4:'medkit', tier5:'ammo'   },
};

// ─── STATE ───
const state = {
  waveIntervalId:null, waveStartTimeoutId:null,
  health:CONFIG.player.maxHealth, maxHealth:CONFIG.player.maxHealth,
  coins:0, xp:0, xpToNextLevel:50, level:1, wave:0,
  zombiesAlive:0, zombiesRemainingInWave:0,
  running:false, paused:false, betweenWaves:false,
  lastAttackTime:0, keys:{}, bobTime:0, isMoving:false, startTime:0,
  critChance:CONFIG.crit.baseChance,
  damageMult:1.0, rangeBonus:0, speedMult:1.0, lifesteal:0,
  coinMult:1.0, xpMult:1.0, damageReduction:0,
  attackSpeedMult:1.0, critDamageBonus:0,
  levelUpActive:false, pendingLevelUps:0,
  inventory:{ 1:'knife', 2:null, 3:null, 4:null }, currentSlot:1,
  mouseDown:false, aiming:false, shake:0,
  ammo:{}, reload:{ active:false, wid:null, elapsed:0, duration:0 },
  shopOpen:false,
  downed:false, downedElapsed:0, downedHP:0, downedMaxHP:CONFIG.downed.maxHP,
  reviveProgress:0, revivesLeft:CONFIG.downed.maxRevives, invulnUntil:0,
  pingWheelOpen:false, pingAccumX:0, pingAccumY:0, pingHighlight:null,
  kills:0, headshots:0, damageTotal:0,
  playerSkin: (() => { try { return localStorage.getItem('qb_skin') || 'default'; } catch { return 'default'; } })(),
  stamina: CONFIG.player.staminaMax, staminaMax: CONFIG.player.staminaMax,
  hitstopUntil:0,
  isGrounded:true, velocityY:0, jumpOffset:0,
  jumpVelX:0, jumpVelZ:0, isSprinting:false,
  brazierFuel:1, brazierBurning:false,
  vendorVanActive:false, vendorVanSpawnedAt:0,
  bossSpawned: false, bossPos: null,
  mouseDX: 0, mouseDY: 0,
  reviveSpeedMult: 1, reviveHealBonus: 0,
  shopDiscount: 1, reloadSpeedMult: 1, reserveAmmoBonus: 0,
  healMult: 1, recoilMult: 1, sprintSpeedBonus: 1,
  killRefillsStamina: false, killStaminaDuration: 0,
  brazierDurationMult: 1, brazierFuelBonus: 1,
  activePerk: null, staminaBoostUntil: 0,
  discoveredPOIs: new Set(),
  vaulting: false, vaultTimer: 0, vaultVelX: 0, vaultVelZ: 0, vaultTargetY: 0,
  attackPermission: { recentAttackers: new Map() },
  zombiesRef: [],
};

const HUD = {
  hpFill:        document.getElementById('hp-fill'),
  hpText:        document.getElementById('hp-text'),
  xpFill:        document.getElementById('xp-fill'),
  coins:         document.getElementById('coins'),
  wave:          document.getElementById('wave'),
  level:         document.getElementById('level'),
  zombies:       document.getElementById('zombies'),
  revives:       document.getElementById('revives'),
  weaponName:    document.getElementById('weapon-name'),
  weaponClass:   document.getElementById('weapon-class'),
  weaponTooltip: document.getElementById('weapon-tooltip'),
  ammoCurrent:   document.getElementById('ammo-current'),
  ammoReserve:   document.getElementById('ammo-reserve'),
  timer:         document.getElementById('timer'),
};

// ─── SCENE ───
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xC5E0F5, 40, 140);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth/window.innerHeight, 0.1, 200);
window.__qbCamera = camera;
camera.position.set(70, CONFIG.player.height, 70);

const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.autoUpdate = false;
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0x8ecae6, 0x5a7a3a, 0.65);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
sun.position.set(80, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(300, 8, 6),
  new THREE.MeshBasicMaterial({ map:Textures.skyTexture(), side:THREE.BackSide, fog:false })
));

console.log(`[game] 🏝️  Construindo ilha...`);
const world = buildWorld(scene, CONFIG.arena.size);
initPhysics(scene);
for (const box of world.wallColliders) addStaticBox(box.minX, box.maxX, box.minZ, box.maxZ, 4);
for (const box of world.furnitureColliders) addStaticBox(box.minX, box.maxX, box.minZ, box.maxZ, 1.2);

scene.traverse(obj => {
  if (obj.isMesh && !obj.userData.dynamic && obj !== sun) {
    obj.matrixAutoUpdate = false;
    obj.updateMatrix();
  }
});

function randomizeDifficultyRegions() {
  if (!CONFIG.difficultyRegions.randomizePerMatch) return;
  const off = CONFIG.difficultyRegions.offsetsRange;
  for (const r of world.difficultyRegions) {
    r.centerX = (Math.random() - 0.5) * off;
    r.centerZ = (Math.random() - 0.5) * off;
  }
}
randomizeDifficultyRegions();

const lootSpots = [];
function initLootSpots() {
  for (const spot of world.lootSpots) {
    const color = spot.type === 'ammo' ? 0xFFAA33
                : spot.type === 'medkit' ? 0xFF4444
                : spot.type === 'food' ? 0x66DD66
                : spot.type === 'cash' ? 0xFFDD33 : 0x99AAFF;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
    mesh.position.set(spot.x, spot.y + 0.3, spot.z);
    scene.add(mesh);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 16),
      new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.5, side:THREE.DoubleSide, depthWrite:false }));
    halo.rotation.x = -Math.PI/2;
    halo.position.set(spot.x, 0.06, spot.z);
    scene.add(halo);
    lootSpots.push({ ...spot, mesh, halo, bobPhase: Math.random() * Math.PI * 2 });
  }
}
initLootSpots();

const caves = [];
{
  const R = world.island.innerRadius * 0.9;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const x = Math.cos(angle) * R;
    const z = Math.sin(angle) * R;
    const mesh = createCave(x, z, angle);
    scene.add(mesh);
    caves.push({ x, z, rot: angle, mesh });
  }
}
function createCave(x, z, rotationY) {
  const g = new THREE.Group();
  const rockMat = matL(0x5A5A5A, { flatShading:true });
  const holeMat = matB(0x000000);
  function rock(px, py, pz, sx, sy, sz, mat) {
    const m = new THREE.Mesh(geoBox(sx, sy, sz, 1), mat||rockMat);
    m.position.set(px, py, pz);
    m.receiveShadow = true;
    g.add(m);
  }
  rock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(0, 3.6, 0.2, 3.6, 0.9, 2.0, rockMat);
  const hole = new THREE.Mesh(geoBox(2.6, 2.6, 0.4, 1), holeMat);
  hole.position.set(0, 1.3, -1.0);
  g.add(hole);
  g.position.set(x, 0, z); g.rotation.y = rotationY;
  return g;
}

function clampToIsland(pos, radius = 0.4) {
  const R = world.island.innerRadius - CONFIG.island.waterMargin - radius;
  const d = Math.hypot(pos.x, pos.z);
  if (d > R) { const k = R / d; pos.x *= k; pos.z *= k; }
}

function tryVaultBarrier() {
  if (state.vaulting || !state.isGrounded) return false;
  const px = player.position.x, pz = player.position.z;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const spot of world.vaultSpots) {
    const cx = (spot.p1.x + spot.p2.x) / 2 - px;
    const cz = (spot.p1.z + spot.p2.z) / 2 - pz;
    const dot = cx * fx + cz * fz;
    if (dot < 0.3 || dot > 2.2) continue;
    const side = Math.abs(cx * fz - cz * fx);
    if (side > 1.5) continue;
    state.vaulting = true;
    state.vaultTimer = CONFIG.player.vaultDuration;
    state.vaultVelX = fx * CONFIG.player.vaultSpeed;
    state.vaultVelZ = fz * CONFIG.player.vaultSpeed;
    state.vaultTargetY = CONFIG.player.height + 0.4;
    Sfx.playJump();
    return true;
  }
  return false;
}

// ─── VIEWMODEL / CONTROLS ───
scene.add(camera);
let weaponView = null;
let calibrator = null;
let controlsUI = null;

function initCalibrator() {
  if (calibrator) return;
  calibrator = new WeaponCalibrator({
    overlay:    document.getElementById('calibration'),
    listEl:     document.getElementById('calib-list'),
    viewportEl: document.getElementById('calib-viewport'),
    slidersEl:  document.getElementById('calib-controls'),
    statusEl:   document.getElementById('calib-status'),
    saveBtn:    document.getElementById('btn-calib-save'),
    resetBtn:   document.getElementById('btn-calib-reset'),
    closeBtn:   document.getElementById('btn-calib-close'),
  });
}
const _btnCalib = document.getElementById('btn-calibrate');
if (_btnCalib) _btnCalib.addEventListener('click', () => { initCalibrator(); calibrator.open(); });

function initControlsUI() {
  if (controlsUI) return;
  controlsUI = new ControlsUI({
    openBtn:    document.getElementById('btn-controls'),
    closeBtn:   document.getElementById('btn-controls-close'),
    resetBtn:   document.getElementById('btn-controls-reset'),
    saveBtn:    document.getElementById('btn-controls-save'),
    sensSlider: document.getElementById('ctrl-sens-slider'),
    sensValue:  document.getElementById('ctrl-sens-value'),
    listEl:     document.getElementById('ctrl-list'),
    hint:       document.getElementById('ctrl-hint'),
    overlay:    document.getElementById('controls-menu'),
  });
}
initControlsUI();

function initWeaponView() { if (weaponView) weaponView.dispose(); weaponView = new Weapon3DView(camera); }
function setWeaponViewModel(wid) { if (!weaponView) initWeaponView(); weaponView.setVisible(true); weaponView.setWeapon(wid); }
function triggerSwing() { if (weaponView) weaponView.swing(); }

// ─── PLAYER ───
const player = {
  id: nextId('p'),
  position: new THREE.Vector3(70, CONFIG.player.height, 70),
  yaw: 0, pitch: 0,
  userData: { _pendingDamage: 0, _dead: false },
};

initZombieSystems({ world, scene, config: CONFIG, caves, player });
Daytime.initDaytime(scene, sun, ambientLight);
Gore.initGore(scene);
Extraction.initExtraction(scene, player);
BossAI.initBossSystem(scene, camera, player, spawnBossProjectile);

ZombieAI.registerAICallbacks({
  spawnToxProjectile: ({ origin, dir, speed, damage, radius }) => spawnBossProjectile({ type: 'tox', origin, dir, speed, damage, radius }),
  onBoomerExplode: (z) => spawnExplosion(z.p ? z.p.clone() : z.mesh.position.clone()),
});

bus.on(Ev.WORLD_BLOOD_MOON, () => { addShake(0.5); showWaveBanner('LUA DE SANGUE!'); });
bus.on(Ev.EXTRACTION_SPAWNED, () => showWaveBanner('HELICÓPTERO CHEGANDO!'));
bus.on(Ev.EXTRACTION_LANDED,  () => showWaveBanner('ENTRE NO HELICÓPTERO!'));

// ─── BOSS PROJECTILES ───
const bossProjectiles = [];
function spawnBossProjectile({ type, origin, dir, speed, damage, radius }) {
  const geo = new THREE.SphereGeometry(radius, type === 'tox' ? 10 : 6, type === 'tox' ? 8 : 4);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: type === 'tox' ? 0x66ff33 : 0xffdd44 }));
  m.position.copy(origin);
  scene.add(m);
  bossProjectiles.push({ mesh: m, dir: dir.clone(), speed, damage, life: 3 });
}
function updateBossProjectiles(dt) {
  for (let i = bossProjectiles.length - 1; i >= 0; i--) {
    const p = bossProjectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.dir, p.speed * dt);
    if (p.mesh.position.distanceTo(player.position) < 0.8) {
      state.health -= p.damage;
      survival.onPlayerHit(p.damage);
      showDamageFlash(); updateHUD();
      if (state.health <= 0 && !state.downed) enterDownedState();
      scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
      bossProjectiles.splice(i, 1);
      continue;
    }
    if (p.life <= 0) {
      scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
      bossProjectiles.splice(i, 1);
    }
  }
}

// ─── DIFFICULTY TIERS ───
function getDifficultyTier(x, z) {
  if (!world.difficultyRegions) return 0;
  for (const r of world.difficultyRegions) {
    const d = Math.hypot(x - r.centerX, z - r.centerZ);
    if (d >= r.innerRadius && d < r.outerRadius) return r.tier;
  }
  return 0;
}
const TIER_MUL = [1.0, 1.15, 1.30, 1.45];
const TIER_ZOMBIE_TYPES = {
  0: ['pt'],
  1: ['pt','runner','worker'],
  2: ['runner','worker','miner','spitter'],
  3: ['combat','security','brute','boomer','spitter'],
};

// ─── HELPERS ───
function rollCrit() { return Math.random() < state.critChance; }

// ─── HUD FEEDBACK ───
const hitMarker = document.getElementById('hit-marker');
const damageFlash = document.getElementById('damage-flash');
const waveBanner = document.getElementById('wave-banner');

function showDamageFlash() {
  if (!damageFlash) return;
  damageFlash.classList.add('active');
  setTimeout(() => damageFlash.classList.remove('active'), 120);
}
function addShake(amount) { state.shake = Math.min(0.7, state.shake + amount); }
function showWaveBanner(text) {
  if (!waveBanner) return;
  waveBanner.textContent = text;
  waveBanner.classList.remove('hidden'); waveBanner.classList.add('show');
  setTimeout(() => {
    waveBanner.classList.remove('show');
    setTimeout(() => waveBanner.classList.add('hidden'), 350);
  }, 1400);
}
let lootToastTimer = null;
function showLootToast(text) {
  let el = document.getElementById('loot-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loot-toast';
    el.style.cssText = 'position:fixed;left:50%;top:70%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#ffdd00;padding:8px 16px;border-radius:6px;font-family:monospace;font-weight:bold;pointer-events:none;transition:opacity 0.4s;z-index:100;';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(lootToastTimer);
  lootToastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1200);
}

// ─── ZOMBIES ───
const zombies = [];
const ragdolls = [];
const flyingLimbs = [];

// ★ CORREÇÃO: usa skinPalette/shirtPalette/pantsPalette do zombie-types.js
function createZombieMesh(opts = {}) {
  const typeKey = opts.type || 'pt';
  const type = (window.ZOMBIE_TYPES_FROM_MODULE || {})[typeKey] || { scale: 1 };
  const g = new THREE.Group();

  const pick = (arr, fb) => Array.isArray(arr) && arr.length
    ? arr[Math.floor(Math.random() * arr.length)]
    : fb;

  const skinHex  = pick(type.skinPalette,  type.skin  || 0x7fc24f);
  const shirtHex = pick(type.shirtPalette, type.cloth || 0x556b3d);
  const pantsHex = pick(type.pantsPalette, 0x3a3a3a);

  const skinCol   = new THREE.Color(skinHex);
  const skinDark  = skinCol.clone().multiplyScalar(0.72).getHex();
  const shirtDark = new THREE.Color(shirtHex).multiplyScalar(0.78).getHex();
  const pantsDark = new THREE.Color(pantsHex).multiplyScalar(0.78).getHex();

  const SKIN    = new THREE.MeshLambertMaterial({ color: skinHex,   flatShading: true });
  const SKIN_D  = new THREE.MeshLambertMaterial({ color: skinDark,  flatShading: true });
  const SHIRT   = new THREE.MeshLambertMaterial({ color: shirtHex,  flatShading: true });
  const SHIRT_D = new THREE.MeshLambertMaterial({ color: shirtDark, flatShading: true });
  const PANTS   = new THREE.MeshLambertMaterial({ color: pantsHex,  flatShading: true });
  const PANTS_D = new THREE.MeshLambertMaterial({ color: pantsDark, flatShading: true });

  if (!window.__zombieGeoCache) {
    window.__zombieGeoCache = {
      HEAD:    new THREE.SphereGeometry(0.20, 12, 8),
      TORSO:   new THREE.BoxGeometry(0.48, 0.55, 0.28),
      BICEP:   new THREE.CylinderGeometry(0.095, 0.095, 1, 8),
      FOREARM: new THREE.CylinderGeometry(0.080, 0.080, 1, 8),
      THIGH:   new THREE.CylinderGeometry(0.115, 0.115, 1, 8),
      SHIN:    new THREE.CylinderGeometry(0.095, 0.095, 1, 8),
      EYE:     new THREE.SphereGeometry(0.045, 8, 6),
      PUPIL:   new THREE.SphereGeometry(0.022, 6, 4),
      MOUTH:   new THREE.BoxGeometry(0.14, 0.035, 0.03),
      WOUND:   new THREE.SphereGeometry(1, 6, 4),
    };
    window.__zombieMatCache = {
      EYE_W: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      EYE_B: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      WOUND: new THREE.MeshLambertMaterial({ color: 0x8b1a1a, flatShading: true }),
    };
  }
  const GEO = window.__zombieGeoCache;
  const MC  = window.__zombieMatCache;

  // Ordem EXATA dos LIMBS em zombie-dismember.js
  const defs = [
    { geo: GEO.HEAD,    mat: SKIN,    kind: 'head'  },
    { geo: GEO.TORSO,   mat: SHIRT,   kind: 'torso' },
    { geo: GEO.BICEP,   mat: SKIN_D,  kind: 'cyl'   },
    { geo: GEO.FOREARM, mat: SKIN,    kind: 'cyl'   },
    { geo: GEO.BICEP,   mat: SKIN,    kind: 'cyl'   },
    { geo: GEO.FOREARM, mat: SKIN_D,  kind: 'cyl'   },
    { geo: GEO.THIGH,   mat: PANTS_D, kind: 'cyl'   },
    { geo: GEO.SHIN,    mat: PANTS,   kind: 'cyl'   },
    { geo: GEO.THIGH,   mat: PANTS_D, kind: 'cyl'   },
    { geo: GEO.SHIN,    mat: PANTS,   kind: 'cyl'   },
  ];

  const limbs = defs.map(def => {
    const m = new THREE.Mesh(def.geo, def.mat);
    m.castShadow = true;
    m.userData.kind = def.kind;
    g.add(m);
    return m;
  });

  const head = limbs[0];
  const eL = new THREE.Mesh(GEO.EYE,  MC.EYE_W); eL.position.set(-0.07,  0.05, 0.16);
  const eR = new THREE.Mesh(GEO.EYE,  MC.EYE_W); eR.position.set( 0.07,  0.05, 0.16);
  const pL = new THREE.Mesh(GEO.PUPIL, MC.EYE_B); pL.position.set(-0.07, 0.05, 0.19);
  const pR = new THREE.Mesh(GEO.PUPIL, MC.EYE_B); pR.position.set( 0.07, 0.05, 0.19);
  const mh = new THREE.Mesh(GEO.MOUTH, MC.EYE_B); mh.position.set(0, -0.07, 0.18);
  head.add(eL); head.add(eR); head.add(pL); head.add(pR); head.add(mh);

  const w = new THREE.Mesh(GEO.WOUND, MC.WOUND);
  w.position.set(0.15, 0.10, 0.15);
  w.scale.set(0.10, 0.06, 0.03);
  limbs[1].add(w);

  g.userData = {
    limbs,
    neck: head,
    gone: {},
    gore: new Set(),
    skinColor: skinHex,
    typeKey,
  };
  return g;
}

const _poseScratch = [];
function poseZombie(z) {
  const p = computePose(z, _poseScratch, false);
  renderFigure(p, z.limbs, z.neck, z.gone);
  return p;
}

function spawnZombie(forceType, spawnX, spawnZ) {
  if (typeof spawnX !== 'number' || typeof spawnZ !== 'number') {
    const cave = caves[Math.floor(Math.random() * caves.length)];
    const toCX = -cave.x, toCZ = -cave.z;
    const len = Math.sqrt(toCX*toCX + toCZ*toCZ) || 1;
    const dirX = toCX/len, dirZ = toCZ/len;
    const back = 0.8 + Math.random()*0.8;
    const side = (Math.random()-0.5) * 1.6;
    spawnX = cave.x + dirX*back + (-dirZ)*side;
    spawnZ = cave.z + dirZ*back + dirX*side;
  }

  const typeKey = forceType || pickZombieType(state.wave);
  const type = window.ZOMBIE_TYPES_FROM_MODULE
    ? window.ZOMBIE_TYPES_FROM_MODULE[typeKey]
    : { hpMul:1, dmgMul:1, speedMul:1, xpMul:1, coinMul:1, scale:1, attackRange:1.6, cooldown:1.2 };

  const tier = getDifficultyTier(spawnX, spawnZ);
  const tierMul = TIER_MUL[tier] || 1.0;

  const mesh = createZombieMesh({ type: typeKey });
  mesh.position.set(spawnX, 0, spawnZ);
  scene.add(mesh);

  const hpScale  = 1 + CONFIG.scaling.hpPerWave  * Math.max(0, state.wave - 1);
  const dmgScale = 1 + CONFIG.scaling.dmgPerWave * Math.max(0, state.wave - 1);
  const spdScale = Math.min(CONFIG.scaling.speedCap, 1 + CONFIG.scaling.speedPerWave * Math.max(0, state.wave - 1));

  const baseHP     = CONFIG.zombie.maxHealth * type.hpMul * hpScale * tierMul;
  const baseDamage = CONFIG.zombie.damage    * type.dmgMul * dmgScale * tierMul;

  const z = {
    id: nextId('z'),
    g: mesh, p: mesh.position, yaw: 0,
    t: typeKey, type,
    s: { speed: CONFIG.zombie.speed * type.speedMul * spdScale, dmg: baseDamage, hp: baseHP },
    hp: baseHP, max: baseHP, v: 0,
    ph: Math.random() * Math.PI * 2,
    state: 'Unaware', ai: 'Idle', tmr: 0,
    tf: Math.random() * 0.3, cd: Math.random(),
    target: false, aggro: 0, lod: 2, sleep: false,
    hit: false, hitDir: new THREE.Vector3(1, 0, 0), hitReactEndTime: 0,
    limbs: mesh.userData.limbs,
    neck:  mesh.userData.neck,
    gone:  mesh.userData.gone,
    gore:  mesh.userData.gore,
    top: 0, acc: 0, pts: null, rm: false,
    isBoss: false, difficultyTier: tier,
    _loadState: ZombieLoadState.REAL,
    _canSleep: false, _waterAccum: 0,
    walkStyle: Math.random(),
    emergeTime: 0, _ragdolled: false,
    mesh,
    speed: CONFIG.zombie.speed * type.speedMul * spdScale,
    scale: type.scale || 1,
    radius: CONFIG.zombie.radius * (type.scale || 1),
    attackRange: type.attackRange || 1.6,
    attackCooldown: type.cooldown || 1.2,
    damage: baseDamage,
    xpReward: Math.round(CONFIG.zombie.xpReward * type.xpMul * (1 + (state.wave - 1) * 0.06) * tierMul),
    coinReward: Math.round(CONFIG.zombie.coinReward * type.coinMul * (1 + (state.wave - 1) * 0.05) * tierMul),
    typeKey,
    alertedUntil: 0, alertUntil: 0, lastAttackTime: 0,
    vx: 0, vz: 0,
  };
  mesh.userData.zombieRef = z;
  zombies.push(z);
  initStuckState(z);
  ZombieAI.initZombieAIState(z);
  state.zombiesAlive++;
  bus.emit(Ev.ZOMBIE_SPAWNED, { id:z.id, type:typeKey, tier:type.tier, isBoss:z.isBoss, pos:{ x:mesh.position.x, y:0, z:mesh.position.z } });
  updateHUD();
}

function maxAttackersForCurrentDifficulty() {
  const w = state.wave;
  if (w <= 2) return CONFIG.attackPermission.maxAttackersEasy;
  if (w <= 5) return CONFIG.attackPermission.maxAttackersMedium;
  if (w <= 8) return CONFIG.attackPermission.maxAttackersHard;
  return CONFIG.attackPermission.maxAttackersVeryHard;
}

// ★ CORREÇÃO: NÃO limpar recentAttackers fora daqui
function zombieCanAttack(z, now) {
  const maxAttackers = maxAttackersForCurrentDifficulty();
  const recent = state.attackPermission.recentAttackers;
  for (const [id, t] of recent) if (now - t > CONFIG.attackPermission.cooldownPerZombie) recent.delete(id);
  if (recent.has(z.id)) { recent.set(z.id, now); return true; }
  if (recent.size >= maxAttackers) return false;
  const d = Math.hypot(player.position.x - z.p.x, player.position.z - z.p.z);
  if (d > CONFIG.attackPermission.distanceThreshold) return false;
  recent.set(z.id, now);
  return true;
}

// ─── BLOOD ───
const BLOOD_MAX = 300;
const bloodGeo = new THREE.BufferGeometry();
const bloodPos = new Float32Array(BLOOD_MAX * 3);
bloodGeo.setAttribute('position', new THREE.BufferAttribute(bloodPos, 3));
const bloodPts = new THREE.Points(bloodGeo, new THREE.PointsMaterial({ color: 0xb11, size: 0.09 }));
bloodPts.frustumCulled = false;
scene.add(bloodPts);
const bloodActive = [];

function emitBlood(pos, big) {
  if (bloodActive.length >= BLOOD_MAX) return;
  const spread = big ? 2 : 1;
  bloodActive.push({
    p: pos.clone(),
    v: new THREE.Vector3((Math.random()-0.5) * 6 * spread, 2 + Math.random() * 4, (Math.random()-0.5) * 6 * spread),
    t: 0.6 + Math.random() * 0.6,
  });
}
function updateBlood(dt) {
  for (let i = bloodActive.length - 1; i >= 0; i--) {
    const b = bloodActive[i];
    b.v.y -= 12 * dt;
    b.p.addScaledVector(b.v, dt);
    b.t -= dt;
    if (b.t <= 0 || b.p.y < -0.05) bloodActive.splice(i, 1);
  }
  for (let i = 0; i < bloodActive.length; i++) {
    bloodPos[i*3]   = bloodActive[i].p.x;
    bloodPos[i*3+1] = bloodActive[i].p.y;
    bloodPos[i*3+2] = bloodActive[i].p.z;
  }
  bloodGeo.attributes.position.needsUpdate = true;
  bloodGeo.setDrawRange(0, bloodActive.length);
}

const bloodPools = [];
const BLOOD_POOL_MAX = 10;
const BLOOD_POOL_GEO = new THREE.CircleGeometry(1, 8);
const BLOOD_POOL_MAT = new THREE.MeshBasicMaterial({ color: 0x6B0000, transparent: true, opacity: 0.75, depthWrite: false });

function spawnBloodPool(position) {
  let pool;
  if (bloodPools.length >= BLOOD_POOL_MAX) {
    const old = bloodPools.shift();
    pool = old.mesh;
    pool.visible = true;
  } else {
    pool = new THREE.Mesh(BLOOD_POOL_GEO, BLOOD_POOL_MAT);
    pool.rotation.x = -Math.PI / 2;
    pool.renderOrder = 1;
    scene.add(pool);
  }
  pool.scale.setScalar(0.7 + Math.random() * 0.5);
  pool.rotation.z = Math.random() * Math.PI * 2;
  pool.position.set(position.x, 0.03, position.z);
  bloodPools.push({ mesh: pool, life: 20 });
}
function updateBloodPools(dt) {
  for (let i = bloodPools.length - 1; i >= 0; i--) {
    const b = bloodPools[i];
    b.life -= dt;
    if (b.life < 3) b.mesh.material.opacity = Math.max(0, (b.life/3)*0.75);
    if (b.life <= 0) { b.mesh.visible = false; bloodPools.splice(i, 1); }
  }
  for (const b of bloodPools) if (b.life >= 3) b.mesh.material.opacity = 0.75;
}

// ─── GORE / DISMEMBER ───
function getLimbMats(skinColor) {
  const c = new THREE.Color(skinColor);
  return {
    SKIN:  matL(skinColor, { flatShading: true }),
    DARK:  matL(c.clone().multiplyScalar(0.7).getHex(), { flatShading: true }),
    BLOOD: matL(0x8b1a1a, { flatShading: true }),
  };
}

function applyGore(z, group) {
  if (z.gore.has(group)) return;
  z.gore.add(group);
  const goneList = GONE[group];
  for (const limbId of goneList) z.gone[limbId] = true;
  for (let i = 0; i < LIMBS.length; i++) {
    if (z.gone[LIMBS[i][0]]) z.limbs[i].visible = false;
  }
  const stumpIdx = STUMP[group];
  const gibEndIdx = GIBEND[group];
  if (stumpIdx == null || gibEndIdx == null || !z.pts) return;
  const stumpPos = z.pts[stumpIdx];
  const matSet = getLimbMats(z.limbs[0]?.material?.color?.getHex() || 0x86bd55);
  const stumpMesh = new THREE.Mesh(SHARED_STUMP_GEO, matSet.BLOOD);
  stumpMesh.position.copy(stumpPos);
  z.g.add(stumpMesh);
  z._stumps = z._stumps || [];
  z._stumps.push(stumpMesh);

  const a = z.pts[stumpIdx].clone();
  const b = z.pts[gibEndIdx].clone();
  const len = Math.max(0.15, a.distanceTo(b));
  const gibMesh = new THREE.Mesh(SHARED_BOX, matSet.SKIN);
  gibMesh.scale.set(0.12, len, 0.12);
  const gib = new LimbGib(gibMesh, a.clone().add(b).multiplyScalar(0.5), z.hitDir, len);
  scene.add(gibMesh);
  flyingLimbs.push(gib);
  while (flyingLimbs.length > 30) {
    const old = flyingLimbs.shift();
    old.dispose(scene);
  }
  spawnBloodPool(z.p.clone().setY(0.03));
}

function damageZombie(z, dmg, isCrit, part, hitDir, hitPoint, sourceType, tAlong) {
  if (z.state === 'Dying' || z.rm) return;
  z.hp -= dmg;
  z.acc += dmg;
  z.top = Math.max(z.top, z.acc);
  z.hitDir.copy(hitDir);
  z.target = true;
  z.sleep = false;
  z.alertedUntil = performance.now() / 1000 + 3;
  emitBlood(hitPoint, isCrit || part === 'Head');
  if (isCrit || part === 'Head') spawnBloodPool(z.p.clone().setY(0.03));

  if (z.hp <= 0) {
    z.state = 'Dying';
    z.tmr = 0;
    if (sourceType === 'explosion') {
      ['Head','BicepL','BicepR','ThighL','ThighR'].forEach(g => {
        if (Math.random() < 0.5 && !z.gore.has(g)) applyGore(z, g);
      });
    } else {
      const out = {};
      if (tryDismember(z, part, false, out, tAlong)) {
        applyGore(z, out.group);
      }
    }
  } else if (z.state !== 'Attack') {
    z.state = 'Stagger';
    z.tmr = 0;
  }
}

// ─── NOISE ───
function makeNoise(position, radius) {
  if (!radius || radius <= 0) return;
  const now = performance.now() / 1000;
  const R2 = radius * radius;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.hp <= 0) continue;
    const dx = z.p.x - position.x, dz = z.p.z - position.z;
    const d2 = dx*dx + dz*dz;
    if (d2 > R2) continue;
    const dist = Math.sqrt(d2);
    const t = 1 - Math.min(1, dist / radius);
    z.alertedUntil = now + CONFIG.aggro.alertDuration + t * 5;
  }
  spawnNoiseRipple(position, radius);
}

const _noiseRipples = [];
function spawnNoiseRipple(pos, radius) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.9, radius, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.08, pos.z);
  scene.add(ring);
  _noiseRipples.push({ mesh: ring, life: 0.4, maxLife: 0.4 });
}
function updateNoiseRipples(dt) {
  for (let i = _noiseRipples.length - 1; i >= 0; i--) {
    const r = _noiseRipples[i];
    r.life -= dt;
    const t = r.life / r.maxLife;
    r.mesh.material.opacity = 0.35 * t;
    r.mesh.scale.setScalar(1 + (1 - t) * 0.3);
    if (r.life <= 0) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      _noiseRipples.splice(i, 1);
    }
  }
}

// ─── RAYCAST ───
function raycastLimbs(origin, dir, maxDist) {
  let bestZ = null, bestLimb = null, bestS = Infinity, bestTc = 0;
  const tmpP = new THREE.Vector3();

  for (let zi = 0; zi < zombies.length; zi++) {
    const z = zombies[zi];
    if (z.state === 'Dying' || !z.pts) continue;
    const dxZ = z.p.x - origin.x, dzZ = z.p.z - origin.z;
    const tProj = dxZ * dir.x + dzZ * dir.z;
    if (tProj < -1 || tProj > maxDist + 1.5) continue;

    for (let li = 0; li < LIMBS.length; li++) {
      const l = LIMBS[li];
      if (z.gone[l[0]] === true) continue;
      const a = z.pts[l[1]];
      const b = z.pts[l[2]];
      const hit = raySegmentHitFull(origin, dir, a, b, l[3] + 0.05, 0.1, maxDist);
      if (hit && hit.s < bestS) {
        bestS = hit.s;
        bestZ = z;
        bestLimb = l[0];
        bestTc = hit.tc;
      }
    }
  }

  if (!bestZ) return null;
  tmpP.copy(origin).addScaledVector(dir, bestS);
  return { s: bestS, z: bestZ, limb: bestLimb, tc: bestTc, point: tmpP.clone() };
}

// ─── MUZZLE / TRACERS / EXPLOSIONS ───
const muzzleLight = new THREE.PointLight(0xFFAA33, 0, 8, 2);
scene.add(muzzleLight);
let muzzleLightEnd = 0;
const explosionLight = new THREE.PointLight(0xFF6600, 0, 14, 2);
scene.add(explosionLight);
let explosionLightEnd = 0;

function spawnMuzzleFlash() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  muzzleLight.position.copy(camera.position).addScaledVector(dir, 1.4);
  muzzleLightEnd = performance.now() / 1000 + 0.08;
  muzzleLight.intensity = 3;
}

const tracerPool = [], tracers = [];
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
  arr[0]=from.x; arr[1]=from.y; arr[2]=from.z;
  arr[3]=to.x;   arr[4]=to.y;   arr[5]=to.z;
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
    if (t.life <= 0) { t.mesh.visible = false; tracerPool.push(t); tracers.splice(i, 1); }
  }
}

const explosions = [];
function spawnExplosion(pos) {
  explosionLight.position.copy(pos);
  explosionLight.position.y += 1;
  explosionLight.intensity = 6;
  explosionLightEnd = performance.now() / 1000 + 0.35;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xFFAA33, transparent: true, opacity: 1 })
  );
  sphere.position.copy(pos);
  sphere.position.y += 0.5;
  scene.add(sphere);
  emitBlood(pos, true);
  addShake(CONFIG.shake.explosion);
  const radius = CONFIG.launcher.explosionRadius;
  const baseDamage = WEAPONS.launcher.damage * state.damageMult;
  const snapshot = [...zombies];
  for (const z of snapshot) {
    const dx = z.p.x - pos.x, dz = z.p.z - pos.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d > radius) continue;
    const falloff = 1 - Math.min(1, d / radius);
    const dmg = baseDamage * Math.max(0.25, falloff);
    const dir = new THREE.Vector3(dx / Math.max(d, 0.01), 0, dz / Math.max(d, 0.01));
    damageZombie(z, dmg, false, 'Torso', dir, z.p.clone().setY(1), 'explosion');
  }
  const ddx = player.position.x - pos.x, ddz = player.position.z - pos.z;
  const selfD = Math.sqrt(ddx*ddx + ddz*ddz);
  if (selfD < radius && !state.downed) {
    const dmg = baseDamage * CONFIG.launcher.selfDamageFactor * (1 - selfD / radius);
    state.health -= dmg;
    survival.onPlayerHit(dmg);
    showDamageFlash();
    updateHUD();
    if (state.health <= 0) enterDownedState();
  }
  explosions.push({ sphere, life: 0.35, maxLife: 0.35 });
}
function updateExplosions(dt) {
  if (explosionLightEnd > 0) {
    const remain = explosionLightEnd - performance.now() / 1000;
    if (remain <= 0) { explosionLight.intensity = 0; explosionLightEnd = 0; }
    else explosionLight.intensity = 6 * (remain / 0.35);
  }
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.life -= dt;
    const t = 1 - e.life / e.maxLife;
    e.sphere.scale.setScalar(1 + t * 10);
    e.sphere.material.opacity = 1 - t;
    if (e.life <= 0) {
      scene.remove(e.sphere);
      e.sphere.geometry.dispose();
      e.sphere.material.dispose();
      explosions.splice(i, 1);
    }
  }
}

// ─── RELOAD ───
function startReload(wid) {
  if (state.reload.active) return;
  const w = WEAPONS[wid], am = state.ammo[wid];
  if (!w || !am || am.mag >= w.magSize || am.reserve <= 0) return;
  state.reload.active = true;
  state.reload.wid = wid;
  state.reload.elapsed = 0;
  state.reload.duration = w.reloadTime / state.reloadSpeedMult;
  if (state.aiming) { state.aiming = false; updateCrosshair(); }
  if (weaponView) weaponView.reload(state.reload.duration);
  Sfx.playReload();
}
function cancelReload() {
  state.reload.active = false;
  state.reload.wid = null;
  state.reload.elapsed = 0;
  state.reload.duration = 0;
  if (weaponView) weaponView.cancelReload();
}
function updateReload(dt) {
  if (!state.reload.active) return;
  state.reload.elapsed += dt;
  if (state.reload.elapsed >= state.reload.duration) {
    const wid = state.reload.wid, w = WEAPONS[wid], am = state.ammo[wid];
    if (am && w) {
      const need = w.magSize - am.mag;
      const take = Math.min(need, am.reserve);
      am.mag += take; am.reserve -= take;
    }
    cancelReload();
    updateHUD();
  }
}

// ─── ATTACK ───
function attack(isRightClick = false) {
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
    if (am.mag <= 0) {
      if (am.reserve > 0) startReload(weaponId);
      state.lastAttackTime = now;
      return false;
    }
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
  if (weapon.type === 'ranged' && weaponView) weaponView.recoil(Math.min(2, weapon.damage / 60) * state.recoilMult);
  makeNoise(player.position, weapon.noise || 15);
  if (weapon.type === 'ranged') { spawnMuzzleFlash(); addShake(CONFIG.shake.shoot * (weapon.damage/40)); }

  if (weapon.type === 'melee') {
    const camOrigin = camera.position.clone();
    const camForward = new THREE.Vector3(); camera.getWorldDirection(camForward);
    const range = weapon.range + state.rangeBonus;
    let hitCount = 0;
    const maxHits = weapon.hitCount || 1;

    const precise = raycastLimbs(camOrigin, camForward, range);
    if (precise) {
      const z = precise.z;
      const part = precise.limb;
      const hitPoint = precise.point.clone();
      const tc = precise.tc;
      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult * (isRightClick ? 1.3 : 1.0);
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const headMult = part === 'Head' ? CONFIG.headshotMultiplier : 1;
      const dmg = baseDmg * headMult * (isCrit ? critMult : 1);
      const hitDir = new THREE.Vector3();
      hitDir.subVectors(z.p, camOrigin).setY(0);
      if (hitDir.lengthSq() < 0.0001) hitDir.copy(camForward);
      hitDir.normalize();
      damageZombie(z, dmg, isCrit, part, hitDir, hitPoint, 'melee', tc);
      hitCount++;
      if (maxHits > 1) {
        const minDot = CONFIG.melee.coneDot;
        for (let i = zombies.length - 1; i >= 0 && hitCount < maxHits; i--) {
          const z2 = zombies[i];
          if (!z2 || z2.hp <= 0 || z2 === z) continue;
          const dx = z2.p.x - camOrigin.x, dz = z2.p.z - camOrigin.z;
          const horiz = Math.sqrt(dx*dx + dz*dz);
          if (horiz > range) continue;
          if (horiz > 0.001) {
            const dot = (dx*camForward.x + dz*camForward.z) / horiz;
            if (dot < minDot) continue;
          }
          const hp = z2.p.clone().setY(1.0);
          const isCrit2 = rollCrit();
          const baseDmg2 = weapon.damage * state.damageMult * 0.6 * (isRightClick ? 1.3 : 1.0);
          const dmg2 = baseDmg2 * (isCrit2 ? (CONFIG.crit.damageMultiplier + state.critDamageBonus) : 1);
          const hd2 = new THREE.Vector3(dx/horiz, 0, dz/horiz);
          damageZombie(z2, dmg2, isCrit2, 'Torso', hd2, hp, 'melee');
          hitCount++;
        }
      }
    }
    if (hitCount > 0) {
      state.hitstopUntil = performance.now() + CONFIG.melee.hitstop * 1000;
      Sfx.playKnifeHitFlesh();
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
      dir.x += (Math.random()-0.5)*baseSpread*2;
      dir.y += (Math.random()-0.5)*baseSpread*2;
      dir.z += (Math.random()-0.5)*baseSpread*2;
      dir.normalize();
    }
    if (weaponId === 'launcher') {
      const result = raycastLimbs(origin, dir, range);
      let hitPos;
      if (result) hitPos = result.point;
      else {
        hitPos = origin.clone().addScaledVector(dir, range);
        if (dir.y < -0.01) {
          const t = -origin.y/dir.y;
          if (t > 0 && t < range) { hitPos = origin.clone().addScaledVector(dir, t); hitPos.y = 0.1; }
        }
      }
      spawnTracer(origin.clone().addScaledVector(dir, 0.8), hitPos);
      spawnExplosion(hitPos);
      continue;
    }
    const maxPierce = (weapon.pierce || 0) + 1;
    let pierceCount = 0;
    const hitIds = new Set();
    let rayOrigin = origin.clone();
    let remainingDist = range;
    while (pierceCount < maxPierce && remainingDist > 0.5) {
      const result = raycastLimbs(rayOrigin, dir, remainingDist);
      if (!result) {
        spawnTracer(rayOrigin.clone().addScaledVector(dir, 0.3), rayOrigin.clone().addScaledVector(dir, remainingDist));
        break;
      }
      if (hitIds.has(result.z.id)) break;
      hitIds.add(result.z.id);
      spawnTracer(rayOrigin.clone().addScaledVector(dir, 0.3), result.point);
      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult * (pierceCount > 0 ? 0.65 : 1);
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const headMult = result.limb === 'Head' ? CONFIG.headshotMultiplier : 1;
      const dmg = baseDmg * headMult * (isCrit ? critMult : 1);
      const hd = dir.clone().setY(0).normalize();
      damageZombie(result.z, dmg, isCrit, result.limb, hd, result.point, 'ranged', result.tc);
      pierceCount++;
      rayOrigin = result.point.clone().addScaledVector(dir, 0.15);
      remainingDist -= result.s + 0.15;
    }
  }
  return true;
}

// ─── LEVEL UP ───
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
  if (!cont) return;
  cont.innerHTML = '';
  chosen.forEach(skill => {
    const card = document.createElement('button');
    card.className = 'skill-card';
    card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-name">${skill.name}</div><div class="skill-desc">${skill.desc}</div>`;
    card.addEventListener('click', () => pickSkill(skill.id));
    cont.appendChild(card);
  });
  const lvlEl = document.getElementById('levelup-level');
  if (lvlEl) lvlEl.textContent = state.level;
  const panel = document.getElementById('levelup');
  if (panel) panel.classList.remove('hidden');
}
function pickSkill(skillId) {
  const skill = SKILLS.find(s => s.id === skillId);
  if (skill) skill.apply();
  bus.emit(Ev.SKILL_PICK, { playerId: player.id, skillId, level: state.level });
  const panel = document.getElementById('levelup');
  if (panel) panel.classList.add('hidden');
  if (state.pendingLevelUps > 0) setTimeout(showLevelUp, 220);
  else {
    state.levelUpActive = false;
    if (!isMobile() && state.running) renderer.domElement.requestPointerLock();
  }
  updateHUD();
}

// ─── HUD ───
function updateHUD() {
  const hp = Math.max(0, state.health);
  if (HUD.hpFill) HUD.hpFill.style.width = `${(hp/state.maxHealth)*100}%`;
  if (HUD.hpText) HUD.hpText.textContent = `${Math.ceil(hp)} / ${state.maxHealth}`;
  if (HUD.xpFill) HUD.xpFill.style.width = `${(state.xp/state.xpToNextLevel)*100}%`;
  if (HUD.coins) HUD.coins.textContent = state.coins;
  if (HUD.wave) HUD.wave.textContent = state.wave;
  if (HUD.level) HUD.level.textContent = state.level;
  if (HUD.zombies) HUD.zombies.textContent = state.zombiesAlive;
  if (HUD.revives) HUD.revives.textContent = state.revivesLeft;
  const w = WEAPONS[state.inventory[state.currentSlot] || 'knife'];
  if (HUD.weaponName) HUD.weaponName.textContent = w.name;
  if (HUD.weaponClass) {
    if (w.type === 'ranged') HUD.weaponClass.textContent = w.className || '';
    else HUD.weaponClass.textContent = w.meleeTypeName || '';
  }
  if (HUD.weaponTooltip) HUD.weaponTooltip.innerHTML = formatWeaponTooltip(w);
  if (w.type === 'melee') {
    if (HUD.ammoCurrent) HUD.ammoCurrent.textContent = '∞';
    if (HUD.ammoReserve) HUD.ammoReserve.textContent = '';
  } else {
    const am = state.ammo[w.id];
    if (am) {
      if (state.reload.active && state.reload.wid === w.id) {
        const pct = Math.floor(Math.min(1, state.reload.elapsed / state.reload.duration) * 100);
        if (HUD.ammoCurrent) { HUD.ammoCurrent.textContent = 'RECARREGANDO ' + pct + '%'; HUD.ammoCurrent.style.color = '#ffdd00'; }
      } else {
        if (HUD.ammoCurrent) { HUD.ammoCurrent.textContent = am.mag + ' / ' + w.magSize; HUD.ammoCurrent.style.color = am.mag <= 0 ? '#ff4444' : '#fff'; }
      }
      if (HUD.ammoReserve) HUD.ammoReserve.textContent = 'RESERVA ' + am.reserve;
    }
  }
}

function updateCrosshair() { document.body.classList.toggle('aiming', state.aiming); }

// ─── DOWNED ───
function enterDownedState() {
  if (state.downed) return;
  if (state.revivesLeft <= 0) { gameOver(); return; }
  state.downed = true;
  state.downedElapsed = 0;
  state.health = 0;
  state.downedHP = CONFIG.downed.maxHP;
  state.downedMaxHP = CONFIG.downed.maxHP;
  state.reviveProgress = 0;
  state.aiming = false;
  state.mouseDown = false;
  state.isGrounded = true;
  state.velocityY = 0;
  state.jumpOffset = 0;
  state.jumpVelX = 0;
  state.jumpVelZ = 0;
  state.vaulting = false;
  player.position.y = CONFIG.player.height;
  updateCrosshair();
  cancelReload();
  document.body.classList.add('downed');
  const overlay = document.getElementById('downed-overlay');
  if (overlay) overlay.classList.remove('hidden');
  Sfx.playPlayerDown();
  addShake(0.4);
  updateHUD();
  bus.emit(Ev.PLAYER_DOWN, { playerId: player.id });
}
function exitDownedState(hpFraction) {
  if (!state.downed) return;
  state.downed = false;
  state.downedElapsed = 0;
  state.reviveProgress = 0;
  const finalFraction = Math.min(1, (hpFraction || 0.5) + state.reviveHealBonus);
  state.health = Math.max(20, Math.round(state.maxHealth * finalFraction));
  state.invulnUntil = performance.now() / 1000 + 2.0;
  document.body.classList.remove('downed');
  const overlay = document.getElementById('downed-overlay');
  if (overlay) overlay.classList.add('hidden');
  Sfx.playRevive();
  updateHUD();
  bus.emit(Ev.PLAYER_REVIVE, { playerId: player.id, hp: state.health });
}
function updateDownedState(dt) {
  if (!state.downed) return;
  state.downedElapsed += dt*1000;
  if (state.downedHP <= 0) { exitDownedState(0); gameOver(); return; }
  const remaining = Math.max(0, CONFIG.downed.duration - state.downedElapsed);
  const timerEl = document.getElementById('downed-timer');
  if (timerEl) timerEl.textContent = Math.ceil(remaining/1000);
  const hpF = document.getElementById('downed-hp-fill');
  if (hpF) hpF.style.width = Math.max(0, (state.downedHP/state.downedMaxHP)*100) + '%';
  const prompt = document.getElementById('downed-prompt');
  const progressWrap = document.getElementById('downed-progress-wrap');
  const progressBar = document.getElementById('downed-progress');
  if (state.downedElapsed >= CONFIG.downed.selfReviveAt && state.revivesLeft > 0) {
    if (prompt) prompt.classList.add('visible');
    if (controls.isDown(Action.Interact, state.keys)) {
      state.reviveProgress += dt*1000 * state.reviveSpeedMult;
      if (progressWrap) progressWrap.classList.add('visible');
      const pct = Math.min(1, state.reviveProgress / CONFIG.downed.selfReviveHold);
      if (progressBar) progressBar.style.width = (pct*100) + '%';
      if (state.reviveProgress >= CONFIG.downed.selfReviveHold) { state.revivesLeft--; exitDownedState(0.3); return; }
    } else {
      state.reviveProgress = 0;
      if (progressWrap) progressWrap.classList.remove('visible');
      if (progressBar) progressBar.style.width = '0%';
    }
  } else {
    if (prompt) prompt.classList.remove('visible');
    if (progressWrap) progressWrap.classList.remove('visible');
  }
  if (remaining <= 0) { exitDownedState(0); gameOver(); }
}

// ─── BRAZIER + VENDOR VAN ───
const brazierGroup = new THREE.Group();
{
  const base = new THREE.Mesh(geoCyl(0.7, 0.9, 1.2, 8), matL(0x3A3A3A, { flatShading:true }));
  base.position.y = 0.6; base.castShadow = true; brazierGroup.add(base);
  const bowl = new THREE.Mesh(geoCyl(1.0, 0.7, 0.5, 8), matL(0x2A2A2A, { flatShading:true }));
  bowl.position.y = 1.35; bowl.castShadow = true; brazierGroup.add(bowl);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), new THREE.MeshBasicMaterial({ color:0xFF6600, transparent:true, opacity:0.9 }));
  flame.position.y = 2.4; flame.name = 'flame'; flame.visible = false; brazierGroup.add(flame);
  const flameLight = new THREE.PointLight(0xFF6600, 0, 12, 2);
  flameLight.position.y = 2.4; flameLight.name = 'flameLight'; brazierGroup.add(flameLight);
}
brazierGroup.position.set(0, 0, 5);
scene.add(brazierGroup);

const vendorVan = new THREE.Group();
{
  const body = new THREE.Mesh(geoRoundBox(2.4, 1.8, 4.5, 0.15), matL(0x8B5A2B));
  body.position.y = 1.2; body.castShadow = true; vendorVan.add(body);
  const cab = new THREE.Mesh(geoRoundBox(2.2, 1.2, 1.6, 0.15), matL(0x5D4030));
  cab.position.set(0, 1.1, -2.5); cab.castShadow = true; vendorVan.add(cab);
  const wheelMat = matL(0x1A1A1A);
  [[-1.1, 0.4, 1.2], [1.1, 0.4, 1.2], [-1.1, 0.4, -1.8], [1.1, 0.4, -1.8]].forEach(([x,y,z]) => {
    const w = new THREE.Mesh(geoCyl(0.4, 0.4, 0.3, 8), wheelMat);
    w.rotation.z = Math.PI/2; w.position.set(x, y, z); w.castShadow = true; vendorVan.add(w);
  });
  const awning = new THREE.Mesh(geoBox(2.6, 0.1, 1.5, 1), matL(0xE74C3C));
  awning.position.set(0, 2.3, -0.5); awning.castShadow = true; vendorVan.add(awning);
  vendorVan.visible = false;
}
scene.add(vendorVan);

// ─── WAVES ───
function findWavePackage(waveNum) {
  for (const pkg of WAVE_PACKAGES) {
    if (waveNum >= pkg.firstWave && waveNum <= pkg.lastWave) return pkg;
  }
  return WAVE_PACKAGES[WAVE_PACKAGES.length - 1];
}
function startWave() {
  if (state.waveIntervalId !== null) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; }
  state.wave++;
  state.betweenWaves = false;
  const pkg = findWavePackage(state.wave);
  const count = Math.min(pkg.baseZombies + (state.wave - pkg.firstWave) * pkg.zombiesPerWave, CONFIG.wave.maxZombies);
  const isBossWave = state.wave % CONFIG.wave.bossEvery === 0;
  const bossType = isBossWave ? BOSS_ROTATION[Math.floor(state.wave / CONFIG.wave.bossEvery - 1) % BOSS_ROTATION.length] : null;
  state.zombiesRemainingInWave = count + (isBossWave ? 1 : 0);
  state.bossSpawned = false;
  let waveLabel = isBossWave ? `HORDA CHEFE ${state.wave} — ${bossType.toUpperCase()}` : `HORDA ${state.wave}`;
  if (isBossWave && ZOMBIE_LORE[bossType]) waveLabel += '  ·  ' + ZOMBIE_LORE[bossType];
  showWaveBanner(waveLabel);
  bus.emit(Ev.WAVE_START, { wave:state.wave, count, boss:isBossWave });
  updateHUD();

  const baseInterval = state.brazierBurning ? 500/CONFIG.brazier.waveSpeedBoost : 500;
  const spawnInterval = baseInterval * (1 + (Math.random() - 0.5) * pkg.timeVariation);
  state.waveIntervalId = setInterval(() => {
    if (!state.running || state.paused) {
      if (!state.running) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; }
      return;
    }
    if (state.levelUpActive) return;
    if (state.zombiesRemainingInWave <= 0) {
      clearInterval(state.waveIntervalId); state.waveIntervalId = null;
      return;
    }
    if (isBossWave && !state.bossSpawned) {
      spawnZombie(bossType);
      state.bossSpawned = true;
      state.bossPos = { x: player.position.x, z: player.position.z };
    } else {
      const cave = caves[Math.floor(Math.random() * caves.length)];
      const regionTier = getDifficultyTier(cave.x, cave.z);
      const regionTypes = TIER_ZOMBIE_TYPES[regionTier] || pkg.types;
      const pool = pkg.types.filter(t => regionTypes.includes(t));
      const typeKey = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : pkg.types[Math.floor(Math.random() * pkg.types.length)];
      spawnZombie(typeKey);
    }
    state.zombiesRemainingInWave--;
    updateHUD();
  }, spawnInterval);

  if (state.wave > 0 && state.wave % CONFIG.vendor.spawnEveryWaves === 0) spawnVendorVan();
}
function checkWaveComplete() {
  if (state.betweenWaves) return;
  if (state.zombiesAlive === 0 && state.zombiesRemainingInWave <= 0) {
    state.betweenWaves = true;
    bus.emit(Ev.WAVE_CLEAR, { wave:state.wave });
    const rewardMul = state.brazierBurning ? CONFIG.brazier.rewardMult : 1;
    const coinBonus = Math.round((CONFIG.wave.clearBonusBase + (state.wave - 1) * CONFIG.wave.clearBonusPerWave) * state.coinMult * rewardMul);
    state.coins += coinBonus;
    const heal = Math.round(state.maxHealth * CONFIG.wave.clearHealFrac * state.healMult);
    const beforeHP = state.health;
    state.health = Math.min(state.maxHealth, state.health + heal);
    const healed = Math.round(state.health - beforeHP);
    let ammoGiven = 0;
    Object.values(state.inventory).forEach(wid => {
      if (!wid || wid === 'knife') return;
      const w = WEAPONS[wid], am = state.ammo[wid];
      if (!w || !am || !w.magSize) return;
      const give = Math.ceil(w.reserveMax * CONFIG.wave.clearAmmoFrac);
      const before = am.reserve;
      am.reserve = Math.min(w.reserveMax, am.reserve + give);
      ammoGiven += am.reserve - before;
    });
    state.brazierFuel = Math.min(CONFIG.brazier.maxFuel * state.brazierDurationMult, state.brazierFuel + CONFIG.brazier.fuelPerWave * state.brazierFuelBonus);
    showWaveBanner(`+${coinBonus}$  +${healed}HP${ammoGiven ? '  +' + ammoGiven + 'AMMO' : ''}  — PROXIMA EM ${CONFIG.wave.breakTime}s`);
    updateHUD();
    Extraction.trySpawnExtraction(state.wave);
    if (state.waveStartTimeoutId !== null) clearTimeout(state.waveStartTimeoutId);
    state.waveStartTimeoutId = setTimeout(() => {
      state.waveStartTimeoutId = null;
      if (state.running && !state.paused) startWave();
    }, CONFIG.wave.breakTime * 1000);
  }
}

// ─── SHOP ───
const shopEl = document.getElementById('shop');
const shopItemsEl = document.getElementById('shop-items');
const shopCoinsEl = document.getElementById('shop-coins');
function openShop() {
  if (state.shopOpen) return;
  state.shopOpen = true;
  if (document.exitPointerLock) document.exitPointerLock();
  renderShop();
  if (shopEl) shopEl.classList.remove('hidden');
}
function closeShop() {
  if (!state.shopOpen) return;
  state.shopOpen = false;
  if (shopEl) shopEl.classList.add('hidden');
  if (!isMobile() && state.running) renderer.domElement.requestPointerLock();
}
function renderShop() {
  if (shopCoinsEl) shopCoinsEl.textContent = '$ ' + state.coins;
  if (!shopItemsEl) return;
  shopItemsEl.innerHTML = '';
  const owned = Object.values(state.inventory).filter(x => x && x !== 'knife');
  if (owned.length === 0) {
    const el = document.createElement('div');
    el.style.color = '#888'; el.style.gridColumn = '1 / -1'; el.style.padding = '20px';
    el.textContent = 'Você ainda não tem armas.';
    shopItemsEl.appendChild(el);
    return;
  }
  owned.forEach(wid => {
    const w = WEAPONS[wid], am = state.ammo[wid];
    if (!am || !AMMO_PACKS[wid]) return;
    const pack = AMMO_PACKS[wid];
    const price = Math.round(AMMO_PRICES[wid] * state.shopDiscount);
    const canBuy = state.coins >= price && am.reserve < w.reserveMax;
    const el = document.createElement('button');
    el.className = 'shop-item' + (canBuy ? '' : ' disabled');
    const info = document.createElement('div');
    info.className = 'shop-info';
    info.innerHTML = `<div class="item-name">${w.name}</div><div class="item-info">${am.mag}/${w.magSize} · reserva ${am.reserve}/${w.reserveMax}</div><div class="item-cost">+${pack} MUNIÇÃO — $${price}</div>`;
    el.appendChild(info);
    if (canBuy) el.addEventListener('click', () => {
      state.coins -= price;
      am.reserve = Math.min(w.reserveMax, am.reserve + pack);
      Sfx.playBuy(); renderShop(); updateHUD();
    });
    shopItemsEl.appendChild(el);
  });
}

function tryLightBrazier() {
  if (state.brazierFuel <= 0 || state.brazierBurning) return;
  state.brazierFuel--;
  state.brazierBurning = true;
  const flame = brazierGroup.getObjectByName('flame');
  const light = brazierGroup.getObjectByName('flameLight');
  if (flame) flame.visible = true;
  if (light) light.intensity = 2.5;
  Sfx.playLevelUp();
  showWaveBanner('BRAZEIRO ACESO! Ondas mais rápidas, recompensas x2');
  if (state.waveStartTimeoutId !== null) {
    clearTimeout(state.waveStartTimeoutId);
    state.waveStartTimeoutId = null;
    if (state.running && !state.paused && state.zombiesAlive === 0) startWave();
  }
  updateHUD();
}
function spawnVendorVan() {
  const angle = Math.random() * Math.PI * 2;
  const dist = 50;
  vendorVan.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
  vendorVan.rotation.y = -angle + Math.PI;
  vendorVan.visible = true;
  state.vendorVanActive = true;
  state.vendorVanSpawnedAt = performance.now()/1000;
  showWaveBanner('VENDEDOR AMBULANTE APARECEU! (60s)');
}
function updateVendorVan() {
  if (!state.vendorVanActive) return;
  const elapsed = performance.now()/1000 - state.vendorVanSpawnedAt;
  if (elapsed > CONFIG.vendor.durationSec) {
    state.vendorVanActive = false;
    vendorVan.visible = false;
    showWaveBanner('Vendedor foi embora...');
  }
}
function updateDynamicLights() {
  const flameLight = brazierGroup.getObjectByName('flameLight');
  if (!flameLight) return;
  const dxB = player.position.x - brazierGroup.position.x;
  const dzB = player.position.z - brazierGroup.position.z;
  const shouldBeOn = (dxB*dxB + dzB*dzB) < 40*40 && state.brazierBurning;
  flameLight.intensity = shouldBeOn ? 2.5 : 0;
}

// ─── JUMP / SWITCH / PAUSE ───
function tryJump() {
  if (state.downed || !state.isGrounded || state.vaulting) return false;
  if (performance.now() < state.hitstopUntil) return false;
  let mx = 0, mz = 0;
  if (controls.isDown(Action.MoveForward,  state.keys)) mz -= 1;
  if (controls.isDown(Action.MoveBackward, state.keys)) mz += 1;
  if (controls.isDown(Action.MoveLeft,     state.keys)) mx -= 1;
  if (controls.isDown(Action.MoveRight,    state.keys)) mx += 1;
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const dir = new THREE.Vector3();
  dir.addScaledVector(fwd, -mz);
  dir.addScaledVector(right, mx);
  if (dir.lengthSq() > 0.0001) {
    dir.normalize();
    state.jumpVelX = dir.x * CONFIG.player.jumpForwardForce;
    state.jumpVelZ = dir.z * CONFIG.player.jumpForwardForce;
  } else { state.jumpVelX = 0; state.jumpVelZ = 0; }
  state.velocityY = CONFIG.player.jumpForce;
  state.isGrounded = false;
  Sfx.playJump();
  return true;
}
function switchToSlot(slot) {
  if (!state.inventory[slot] || state.currentSlot === slot) return;
  cancelReload();
  state.currentSlot = slot;
  const weaponId = state.inventory[slot];
  const weapon = WEAPONS[weaponId];
  if (weapon.type === 'melee' && state.aiming) { state.aiming = false; updateCrosshair(); }
  setWeaponViewModel(weaponId);
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
    if (nameEl) { if (has) nameEl.textContent = WEAPONS[state.inventory[slot]].name; else nameEl.textContent = '-'; }
  });
}
const pauseEl = document.getElementById('pause');
function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  if (state.paused) {
    if (pauseEl) pauseEl.classList.remove('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
  } else {
    if (pauseEl) pauseEl.classList.add('hidden');
    if (!isMobile()) renderer.domElement.requestPointerLock();
  }
}

// ─── INPUT ───
document.addEventListener('keydown', e => {
  const wasDown = !!state.keys[e.code];
  state.keys[e.code] = true;
  if (wasDown) return;
  if (e.code === controls.getKey(Action.Slot1)) switchToSlot(1);
  if (e.code === controls.getKey(Action.Slot2)) switchToSlot(2);
  if (e.code === controls.getKey(Action.Slot3)) switchToSlot(3);
  if (e.code === controls.getKey(Action.Slot4)) switchToSlot(4);
  if (e.code === controls.getKey(Action.Mute)) Sfx.setMuted(!Sfx.isMuted());
  if (e.code === controls.getKey(Action.Pause)) {
    if (state.shopOpen) { closeShop(); return; }
    if (state.running && !state.levelUpActive) togglePause();
    return;
  }
  if (e.code === controls.getKey(Action.Reload) && state.running && !state.downed && !state.shopOpen && !state.reload.active) {
    const wid = state.inventory[state.currentSlot];
    if (wid && WEAPONS[wid].type === 'ranged') startReload(wid);
  }
  if (e.code === controls.getKey(Action.Interact) && state.running && !state.downed && !state.levelUpActive) {
    if (state.shopOpen) { closeShop(); return; }
    const dxB = player.position.x - brazierGroup.position.x;
    const dzB = player.position.z - brazierGroup.position.z;
    if (Math.sqrt(dxB*dxB + dzB*dzB) < 3.0) { tryLightBrazier(); return; }
    if (state.vendorVanActive) {
      const dxV = player.position.x - vendorVan.position.x;
      const dzV = player.position.z - vendorVan.position.z;
      if (Math.sqrt(dxV*dxV + dzV*dzV) < 4.0) { openShop(); return; }
    }
    if (nearWeapon && !nearWeapon.bought) tryBuyWeapon();
  }
  const jumpKey = controls.getKey(Action.Jump);
  if (jumpKey && e.code === jumpKey) {
    e.preventDefault();
    if (state.running && !state.downed && !state.paused && !state.levelUpActive && !state.shopOpen) {
      if (!tryVaultBarrier()) tryJump();
    }
    return;
  }
});
renderer.domElement.addEventListener('click', () => {
  if (!state.running || isMobile() || state.levelUpActive || state.shopOpen || state.paused) return;
  Sfx.initAudio(); Sfx.resumeAudio();
  renderer.domElement.requestPointerLock();
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  const sens = controls.getEffectiveSens(state.aiming);
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
  state.mouseDX += e.movementX;
  state.mouseDY += e.movementY;
});
document.addEventListener('mousedown', e => {
  if (state.paused || state.shopOpen) return;
  if (e.button === 0) {
    state.mouseDown = true;
    if (state.running && !state.levelUpActive && document.pointerLockElement === renderer.domElement) attack(false);
  }
  if (e.button === 2) {
    if (state.downed) return;
    const weaponId = state.inventory[state.currentSlot] || 'knife';
    if (WEAPONS[weaponId].type !== 'melee') { state.aiming = true; updateCrosshair(); }
    else if (state.running && document.pointerLockElement === renderer.domElement) attack(true);
  }
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) state.mouseDown = false;
  if (e.button === 2) { state.aiming = false; updateCrosshair(); }
});
document.addEventListener('contextmenu', e => { if (state.running) e.preventDefault(); });

function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || 'ontouchstart' in window; }

function setupMobile() {
  if (!isMobile()) return;
  const mc = document.getElementById('mobile-controls');
  if (mc) mc.classList.remove('hidden');
  const atk = document.getElementById('btn-attack');
  if (atk) atk.addEventListener('touchstart', e => { e.preventDefault(); attack(false); }, { passive: false });
  const rel = document.getElementById('btn-reload');
  if (rel) rel.addEventListener('touchstart', e => {
    e.preventDefault();
    const wid = state.inventory[state.currentSlot];
    if (wid && WEAPONS[wid].type === 'ranged') startReload(wid);
  }, { passive: false });
}
setupMobile();

// ─── PLAYER UPDATE ───
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3();
function updatePlayer(dt) {
  if (state.vaulting) {
    state.vaultTimer -= dt;
    player.position.x += state.vaultVelX * dt;
    player.position.z += state.vaultVelZ * dt;
    if (state.vaultTimer <= 0) { state.vaulting = false; state.jumpOffset = 0; state.isGrounded = true; }
    player.position.y = CONFIG.player.height + (state.vaultTargetY - CONFIG.player.height) * Math.sin(Math.PI * (1 - state.vaultTimer / CONFIG.player.vaultDuration));
    camera.position.set(player.position.x, player.position.y, player.position.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    return;
  }
  if (!state.isGrounded) {
    state.velocityY -= CONFIG.player.gravity * dt;
    state.jumpOffset += state.velocityY * dt;
    if (state.jumpOffset <= 0) { state.jumpOffset = 0; state.velocityY = 0; state.isGrounded = true; state.jumpVelX = 0; state.jumpVelZ = 0; }
  }
  player.position.y = CONFIG.player.height + state.jumpOffset;
  if (!state.isGrounded && (state.jumpVelX !== 0 || state.jumpVelZ !== 0)) {
    player.position.x += state.jumpVelX * dt;
    player.position.z += state.jumpVelZ * dt;
    const decay = Math.exp(-CONFIG.player.jumpAirDecay * dt);
    state.jumpVelX *= decay; state.jumpVelZ *= decay;
    if (Math.abs(state.jumpVelX) < 0.05) state.jumpVelX = 0;
    if (Math.abs(state.jumpVelZ) < 0.05) state.jumpVelZ = 0;
  }
  _fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let mx = 0, mz = 0;
  if (controls.isDown(Action.MoveForward,  state.keys)) mz -= 1;
  if (controls.isDown(Action.MoveBackward, state.keys)) mz += 1;
  if (controls.isDown(Action.MoveLeft,     state.keys)) mx -= 1;
  if (controls.isDown(Action.MoveRight,    state.keys)) mx += 1;
  _move.set(0, 0, 0);
  _move.addScaledVector(_fwd, -mz);
  _move.addScaledVector(_right, mx);
  state.isMoving = _move.lengthSq() > 0.0025;
  if (state.isMoving) _move.normalize();
  let speedMult = state.aiming ? 0.5 : 1;
  if (state.downed) speedMult = 0.25;
  const now = performance.now() / 1000;
  if (now < state.staminaBoostUntil) state.stamina = state.staminaMax;
  const sprintKeyHeld = controls.isDown(Action.Sprint, state.keys);
  const canSprint = state.isMoving && !state.downed && !state.aiming && state.stamina > 0;
  state.isSprinting = canSprint && sprintKeyHeld;
  const sprintMult = state.isSprinting ? CONFIG.player.sprintMult * state.sprintSpeedBonus : 1;
  const speed = CONFIG.player.speed * state.speedMult * speedMult * sprintMult;
  player.position.addScaledVector(_move, speed * dt);
  resolveWallCollisions(player.position, CONFIG.player.radius);
  clampToIsland(player.position, CONFIG.player.radius);
  if (state.isSprinting) state.stamina = Math.max(0, state.stamina - CONFIG.player.staminaDrainRun * dt);
  else state.stamina = Math.min(state.staminaMax, state.stamina + CONFIG.player.staminaRegen * dt);
  if (state.isMoving) state.bobTime += dt*9; else state.bobTime *= 0.9;
  const bobY = Math.sin(state.bobTime) * (state.aiming ? 0.02 : 0.055);
  const camBaseY = state.downed ? 0.55 : player.position.y;
  camera.position.set(player.position.x, camBaseY + bobY, player.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  if (state.shake > 0.001) {
    camera.position.x += (Math.random()-0.5)*state.shake;
    camera.position.y += (Math.random()-0.5)*state.shake;
    camera.rotation.z = (Math.random()-0.5)*state.shake*0.5;
    state.shake *= Math.pow(0.001, dt);
  } else { camera.rotation.z = 0; state.shake = 0; }
  if (player.userData._pendingDamage) {
    const dmg = player.userData._pendingDamage;
    player.userData._pendingDamage = 0;
    if (!state.downed && performance.now()/1000 >= state.invulnUntil) {
      state.health -= dmg;
      survival.onPlayerHit(dmg);
      showDamageFlash(); updateHUD();
      if (state.health <= 0) enterDownedState();
    }
  }
  sun.position.set(player.position.x + 80, 120, player.position.z + 60);
  sun.target.position.set(player.position.x, 0, player.position.z);
  sun.target.updateMatrixWorld();
}
function circleVsAABB(px, pz, radius, box) {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  const dx = px - cx, dz = pz - cz;
  const d2 = dx*dx + dz*dz;
  if (d2 > radius * radius) return null;
  const d = Math.sqrt(d2);
  if (d > 0.0001) return { x: px + dx/d*(radius-d), z: pz + dz/d*(radius-d) };
  const exL = Math.abs(px - box.minX), exR = Math.abs(box.maxX - px);
  const ezU = Math.abs(pz - box.minZ), ezD = Math.abs(box.maxZ - pz);
  const m = Math.min(exL, exR, ezU, ezD);
  if (m === exL) return { x: box.minX - radius, z: pz };
  if (m === exR) return { x: box.maxX + radius, z: pz };
  if (m === ezU) return { x: px, z: box.minZ - radius };
  return { x: px, z: box.maxZ + radius };
}
function resolveColliders(pos, radius, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const box = colliders[i];
    if (pos.x + radius < box.minX || pos.x - radius > box.maxX) continue;
    if (pos.z + radius < box.minZ || pos.z - radius > box.maxZ) continue;
    const r = circleVsAABB(pos.x, pos.z, radius, box);
    if (r) { pos.x = r.x; pos.z = r.z; }
  }
}
function resolveWallCollisions(pos, radius) {
  resolveColliders(pos, radius, world.wallColliders);
  resolveColliders(pos, radius, world.furnitureColliders);
}
function resolvePlayerZombieCollision() {
  for (const z of zombies) {
    if (z.hp <= 0) continue;
    const dx = player.position.x - z.p.x;
    const dz = player.position.z - z.p.z;
    const d2 = dx*dx + dz*dz;
    const minD = CONFIG.player.radius + (z.radius || 0.4);
    if (d2 < minD*minD && d2 > 0.0001) {
      const d = Math.sqrt(d2), overlap = minD - d;
      const nx = dx/d, nz = dz/d;
      player.position.x += nx*overlap*0.5;
      player.position.z += nz*overlap*0.5;
      z.p.x -= nx*overlap*0.5;
      z.p.z -= nz*overlap*0.5;
    }
  }
}

// ─── ZOMBIE UPDATE ───
let _lodTickAccum = 0, _popTickAccum = 0;
const LOD_TICK_INTERVAL = 0.5;
const POP_TICK_INTERVAL = 2.0;
const _TMP = new THREE.Vector3();

function updateZombies(dt) {
  const now = performance.now() / 1000;
  // ★ FIX: NÃO limpar recentAttackers — precisa sobreviver entre frames

  _lodTickAccum += dt;
  if (_lodTickAccum >= LOD_TICK_INTERVAL) {
    _lodTickAccum = 0;
    state.zombiesRef = zombies;
    updateZombieLOD(zombies, player.position, LOD_TICK_INTERVAL, 140);
  }
  _popTickAccum += dt;
  if (_popTickAccum >= POP_TICK_INTERVAL) {
    _popTickAccum = 0;
    tickZombiePopulation(POP_TICK_INTERVAL, {
      spawnZombie, state,
      bossPos: state.bossPos,
      bossActive: state.bossSpawned,
    });
  }

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.hp <= 0 && z.state !== 'Dying') continue;

    if (z.state === 'Dying') {
      z.tmr += dt;
      if (z.tmr < 0.5) {
        z.p.addScaledVector(z.hitDir, 2 * (1 - z.tmr / 0.5) * dt);
      } else {
        if (!z._ragdolled) {
          z._ragdolled = true;
          const rag = new VerletRagdoll(z, z.hitDir, scene, world);
          ragdolls.push(rag);
          spawnBloodPool(z.p.clone().setY(0.03));
        }
        z.rm = true;
        state.zombiesAlive--;
        state.kills++;
        continue;
      }
    }

    if (z._loadState === ZombieLoadState.UNLOADED) continue;
    if (z._loadState === ZombieLoadState.PROP) {
      z.g.position.set(z.p.x, 0, z.p.z);
      continue;
    }

    updateZombieSleepState(z);
    applyZombieWaterDamage(z, dt, CONFIG.island.waterY);
    ZombieAI.updateZombieAIState(z, player, dt, world);

    _TMP.set(player.position.x - z.p.x, 0, player.position.z - z.p.z);
    const d = _TMP.length();
    const dir = _TMP.divideScalar(d || 1);
    const dot = dir.x * Math.sin(z.yaw) + dir.z * Math.cos(z.yaw);

    z.tf -= dt;
    if (z.tf <= 0) {
      z.tf = 0.2 + Math.random() * 0.2;
      if (player.userData._dead) z.target = false;
      else if (d < 28) {
        const n = 1 - d*d/784;
        const lo = 0.2 + (1 - n) * -0.907;
        const f = Math.pow(Math.max(0, Math.min(1, (dot - lo) / (1 - lo))), 2);
        z.aggro += n * n * f * 2.2 * (z.target ? 1.5 : 1);
        if (z.aggro > 1) z.target = true;
      }
    }

    if (z.ai === 'Idle' && z.target) z.ai = 'Chase';
    if (!z.target) z.ai = 'Idle';

    // ★ FIX CRÍTICO: reach = isGrounded (antes era player.position.y < 1.2, sempre false)
    const reach = state.isGrounded;
    if (z.ai === 'Chase' && reach && d < 2.2) z.ai = 'Combat';
    else if (z.ai === 'Combat' && (d > 2.2 || !reach)) z.ai = 'Chase';

    if (z.state === 'Unaware' && z.ai !== 'Idle') z.state = 'Aware';
    else if (z.state === 'Aware' && z.ai === 'Idle') z.state = 'Unaware';

    let v = 0;
    if (z.state === 'Stagger') {
      z.tmr += dt;
      z.p.addScaledVector(z.hitDir, 1.5 * (1 - z.tmr / 0.35) * dt);
      if (z.tmr > 0.35) z.state = z.ai === 'Idle' ? 'Unaware' : 'Aware';
    } else if (z.state === 'Attack') {
      z.tmr += dt;
      if (z.hit && z.tmr > 0.35) {
        z.hit = false;
        if (d < 2.6 && dot > 0.3 && !player.userData._dead) {
          const dm = (z.s.dmg || z.damage) * (1 - state.damageReduction);
          state.health -= dm;
          survival.onPlayerHit(dm);
          showDamageFlash(); updateHUD();
          if (state.health <= 0 && !state.downed) enterDownedState();
        }
      }
      if (z.tmr > 0.7) z.state = 'Aware';
    } else {
      if (z.ai !== 'Idle') {
        let da = Math.atan2(dir.x, dir.z) - z.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        z.yaw += Math.max(-6 * dt, Math.min(6 * dt, da));
        const top = Math.max(z.s.speed * (0.6 + 0.4 * Math.max(0, Math.min(1, (z.hp / z.max - 0.5) / 0.25))), 1);
        v = z.ai === 'Combat' ? Math.max(-1, Math.min(top, (d - 1.4) * 3)) : top;
        if (z.state === 'Unaware') v *= 0.5;
      }
      z.cd += dt;
      if (z.ai === 'Combat' && z.cd >= 1 && d > 0.8 && d < 2.4 && dot > 0.5) {
        if (zombieCanAttack(z, now)) {
          z.cd = Math.random() * 0.4 - 0.2;
          z.state = 'Attack';
          z.tmr = 0;
          z.hit = true;
        }
      }
    }
    z.v = v;
    z.p.x = Math.max(-200, Math.min(200, z.p.x + Math.sin(z.yaw) * v * dt));
    z.p.z = Math.max(-200, Math.min(200, z.p.z + Math.cos(z.yaw) * v * dt));
    z.ph += Math.abs(v) * dt * 2.4;
    z.g.position.set(z.p.x, 0, z.p.z);
    z.g.rotation.y = z.yaw;

    z._poseFrame = (z._poseFrame || 0) + 1;
    const updateEvery = d < 25 ? 1 : (d < 50 ? 2 : 3);
    if (z._poseFrame % updateEvery === 0 || !z.pts) {
      z.pts = poseZombie(z);
    }

    if (!z.type.flight) {
      z.mesh = z.g;
      z.mesh.position.copy(z.p);
      updateStuckDetection(z, dt, world);
    }
  }

  for (let i = ragdolls.length - 1; i >= 0; i--) {
    if (ragdolls[i].update(dt, emitBlood)) { ragdolls[i].dispose(); ragdolls.splice(i, 1); }
  }
  for (let i = flyingLimbs.length - 1; i >= 0; i--) {
    if (flyingLimbs[i].update(dt)) { flyingLimbs[i].dispose(scene); flyingLimbs.splice(i, 1); }
  }
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].rm) zombies.splice(i, 1);
  }
}

// ─── DOORS / LOOT / WEAPONS ───
function updateDoors(dt) {
  for (const door of world.doors) {
    const dx = player.position.x - door.worldX;
    const dz = player.position.z - door.worldZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const target = dist < 2.2 ? -Math.PI/2 : 0;
    door.currentAngle += (target - door.currentAngle) * Math.min(1, dt*6);
    door.group.rotation.y = door.currentAngle;
  }
}
function lootTypeForRoom(room, tier) {
  const table = LOOT_TABLE[room] || LOOT_TABLE.generic;
  return table[`tier${Math.min(tier + 1, 5)}`] || 'ammo';
}
function collectLoot(spot) {
  Sfx.playBuy();
  const playerTier = Math.min(4, Math.floor(state.level / 5));
  const effectiveType = lootTypeForRoom(spot.room || 'generic', playerTier);
  let label = '';
  switch (effectiveType) {
    case 'ammo': {
      const wid = state.inventory[state.currentSlot];
      const w = WEAPONS[wid]; const am = state.ammo[wid];
      if (w && w.type === 'ranged' && am) {
        const give = Math.min(spot.amount * 30, w.reserveMax - am.reserve);
        am.reserve += give; label = `+${give} MUNIÇÃO`;
      } else label = '+MUNIÇÃO (sem arma)';
      break;
    }
    case 'medkit': {
      const heal = Math.round(25 * spot.amount * state.healMult);
      state.health = Math.min(state.maxHealth, state.health + heal); label = `+${heal} HP`;
      break;
    }
    case 'food': {
      const heal = Math.round(10 * spot.amount * state.healMult);
      state.health = Math.min(state.maxHealth, state.health + heal);
      state.stamina = Math.min(state.staminaMax, state.stamina + 30);
      label = `+${heal} HP, +30 Stam`;
      break;
    }
    case 'cash': { const coins = Math.round(10 * spot.amount * state.coinMult); state.coins += coins; label = `+$${coins}`; break; }
    case 'component': { const coins = Math.round(15 * spot.amount * state.coinMult); state.coins += coins; label = `+$${coins} (componente)`; break; }
    default: label = `Loot (${effectiveType})!`;
  }
  updateHUD();
  showLootToast(label);
}
function updateLootSpots(dt) {
  for (let i = lootSpots.length - 1; i >= 0; i--) {
    const spot = lootSpots[i];
    if (spot.collected) continue;
    spot.bobPhase += dt * CONFIG.loot.bobSpeed;
    spot.mesh.position.y = spot.y + 0.3 + Math.sin(spot.bobPhase) * 0.08;
    spot.mesh.rotation.y += dt * CONFIG.loot.spinSpeed;
    const dx = player.position.x - spot.x;
    const dz = player.position.z - spot.z;
    if (dx*dx + dz*dz < CONFIG.loot.pickupRadius * CONFIG.loot.pickupRadius) {
      collectLoot(spot);
      spot.collected = true;
      scene.remove(spot.mesh); scene.remove(spot.halo);
      spot.mesh.geometry.dispose(); spot.mesh.material.dispose();
      spot.halo.geometry.dispose(); spot.halo.material.dispose();
      lootSpots.splice(i, 1);
    }
  }
}
let nearWeapon = null;
const promptEl = document.getElementById('prompt');
const promptText = document.getElementById('prompt-text');
function spawnWeaponPickup(weaponId, x, z, y = 0.9, isDrop = false) {
  const spriteHandle = spawnPickup3D(scene, { weaponId, x, z, y: y + 0.3, isDrop, spinSpeed: 1.2, bobAmp: 0.08 });
  world.weaponSpots.push({ x, y, z, mesh: spriteHandle.group, spriteHandle, ring: spriteHandle.ring, weaponId, bought: false, baseY: y + 0.3, isDrop });
}
function setupWeaponSpawns() {
  const openSpots = [{ x: 30, z: 30 }, { x: -30, z: 30 }, { x: 30, z: -30 }, { x: -30, z: -30 }, { x: 90, z: 0 }, { x: -90, z: 0 }, { x: 0, z: 90 }, { x: 0, z: -90 }];
  const meleePool = ['woodenClub', 'pipe', 'cleaver', 'shovel', 'kukri'];
  openSpots.slice(0, 5).forEach((h, i) => spawnWeaponPickup(meleePool[i % meleePool.length], h.x, h.z, 0.95));
  const pool = ['pistol', 'pistol', 'smg', 'shotgun', 'revolver', 'rifle', 'launcher'];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  openSpots.slice(5).forEach((h, i) => spawnWeaponPickup(shuffled[i % shuffled.length], h.x, h.z, 0.95));
  const poiWeapons = { police: ['rifle', 'shotgun'], hospital: ['smg', 'pistol'], church: ['katana'], military: ['rifle', 'launcher', 'shotgun'], warehouse: ['kukri', 'pipeWrench', 'revolver'], government: ['reaperScythe'] };
  for (const [poiId, weapons] of Object.entries(poiWeapons)) {
    const p = world.pois[poiId];
    if (!p) continue;
    weapons.forEach((w, i) => {
      const ox = (i - (weapons.length - 1) / 2) * 3;
      spawnWeaponPickup(w, p.x + ox, p.z + 4, 0.95);
    });
  }
}
function updateWeaponPickups(dt) {
  updatePickups3D(dt, camera);
  let closest = null, closestDist = 2.5;
  world.weaponSpots.forEach(s => {
    if (s.bought) return;
    const dx = player.position.x - s.x, dz = player.position.z - s.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d < closestDist) { closestDist = d; closest = s; }
  });
  nearWeapon = closest;
  if (closest && !state.shopOpen) {
    const w = WEAPONS[closest.weaponId];
    const can = closest.isDrop || state.coins >= Math.round(w.cost * state.shopDiscount);
    const color = can ? '#ffdd00' : '#ff4444';
    if (promptEl) promptEl.classList.remove('hidden');
    if (promptText) {
      if (closest.isDrop) promptText.innerHTML = `Pegar <span style="color:${color}">${w.name}</span> (DROP)`;
      else promptText.innerHTML = `Comprar <span style="color:${color}">${w.name}</span> — <span style="color:${color}">$${Math.round(w.cost * state.shopDiscount)}</span>`;
    }
    return;
  }
  const dxB = player.position.x - brazierGroup.position.x;
  const dzB = player.position.z - brazierGroup.position.z;
  if (Math.sqrt(dxB*dxB + dzB*dzB) < 3.0 && !state.shopOpen) {
    if (promptEl) promptEl.classList.remove('hidden');
    if (promptText) {
      if (state.brazierBurning) promptText.innerHTML = `Brazeiro <span style="color:#ff6600">ACESO</span>`;
      else if (state.brazierFuel > 0) promptText.innerHTML = `Acender brazeiro (combustível: <span style="color:#ffdd00">${state.brazierFuel}</span>)`;
      else promptText.innerHTML = `Brazeiro sem combustível`;
    }
    return;
  }
  if (state.vendorVanActive && !state.shopOpen) {
    const dxV = player.position.x - vendorVan.position.x;
    const dzV = player.position.z - vendorVan.position.z;
    if (Math.sqrt(dxV*dxV + dzV*dzV) < 4.0) {
      if (promptEl) promptEl.classList.remove('hidden');
      if (promptText) promptText.innerHTML = `Abrir <span style="color:#ffdd00">VENDEDOR AMBULANTE</span>`;
      return;
    }
  }
  if (promptEl) promptEl.classList.add('hidden');
}
function tryBuyWeapon() {
  if (!nearWeapon || nearWeapon.bought) return;
  const w = WEAPONS[nearWeapon.weaponId];
  const finalCost = Math.round(w.cost * state.shopDiscount);
  if (!nearWeapon.isDrop && state.coins < finalCost) { Sfx.playPlayerHurt(); return; }
  if (!nearWeapon.isDrop) state.coins -= finalCost;
  state.inventory[w.slot] = nearWeapon.weaponId;
  if (w.type === 'ranged') {
    const reserveBonus = Math.floor(w.reserveMax * state.reserveAmmoBonus);
    state.ammo[w.id] = { mag: w.magSize, reserve: Math.min(w.reserveMax * 2, w.reserveMax + reserveBonus) };
  }
  nearWeapon.bought = true;
  if (nearWeapon.spriteHandle) nearWeapon.spriteHandle.dispose();
  if (state.currentSlot === w.slot) setWeaponViewModel(nearWeapon.weaponId);
  else switchToSlot(w.slot);
  Sfx.playBuy();
  bus.emit(Ev.WEAPON_BUY, { playerId: player.id, weaponId: w.id, cost: nearWeapon.isDrop ? 0 : finalCost, slot: w.slot });
  updateHUD(); updateWeaponSlotsHUD();
}
function checkPOIDiscovery() {
  if (!world.pois) return;
  for (const id in world.pois) {
    if (state.discoveredPOIs.has(id)) continue;
    const poi = world.pois[id];
    const dx = player.position.x - poi.x;
    const dz = player.position.z - poi.z;
    if (dx*dx + dz*dz < 20*20) {
      state.discoveredPOIs.add(id);
      bus.emit(Ev.POI_DISCOVERED, { id, type: poi.type });
      Sfx.playPing();
    }
  }
}

// ─── ANIMATE ───
const clock = new THREE.Clock();
let shadowFrame = 0;
let lastTimeText = '';
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now() / 1000;
  if (performance.now() < state.hitstopUntil) { renderer.render(scene, camera); return; }
  if (muzzleLight.intensity > 0) {
    const remain = muzzleLightEnd - now;
    if (remain <= 0) muzzleLight.intensity = 0;
    else muzzleLight.intensity = 3 * (remain / 0.08);
  }
  if (state.running && !state.levelUpActive && !state.paused && !state.shopOpen) {
    updateReload(dt);
    updatePlayer(dt);
    resolvePlayerZombieCollision();
    updateZombies(dt);
    updateBlood(dt);
    updateBloodPools(dt);
    updateTracers(dt);
    updateDoors(dt);
    updateWeaponPickups(dt);
    updateLootSpots(dt);
    updateVendorVan();
    updateDynamicLights();
    checkWaveComplete();
    stepPhysics(dt);
    updateDownedState(dt);
    survival.update(dt, state);
    updateExplosions(dt);
    updateNoiseRipples(dt);
    updateBossProjectiles(dt);
    Daytime.updateDaytime(dt);
    Gore.updateGore(dt);
    Extraction.updateExtraction(dt);
    checkPOIDiscovery();
    checkLevelUp();
    if (weaponView) {
      if (state.downed) weaponView.setVisible(false);
      else {
        weaponView.setVisible(true);
        weaponView.update(dt, { aiming: state.aiming, moving: state.isMoving, bobTime: state.bobTime, mouseDX: state.mouseDX, mouseDY: state.mouseDY });
      }
    }
    state.mouseDX *= 0.75;
    state.mouseDY *= 0.75;
    if (state.mouseDown && !state.reload.active) {
      const wid = state.inventory[state.currentSlot] || 'knife';
      const w = WEAPONS[wid];
      if (w.auto) { if (!state.downed || wid === 'pistol') attack(false); }
    }
    const targetFov = state.aiming ? 50 : 78;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt*15);
    camera.updateProjectionMatrix();
    shadowFrame++;
    if (shadowFrame >= 30) { renderer.shadowMap.needsUpdate = true; shadowFrame = 0; }
    const elapsed = Math.floor((performance.now() - state.startTime)/1000);
    const m = Math.floor(elapsed/60);
    const s = (elapsed % 60).toString().padStart(2, '0');
    const t = `${m}:${s}`;
    if (t !== lastTimeText && HUD.timer) { HUD.timer.textContent = t; lastTimeText = t; }
    const revBtn = document.getElementById('btn-revive');
    if (revBtn) revBtn.classList.toggle('visible', state.downed);
  } else if (!state.running) {
    stepPhysics(dt);
    updateBlood(dt);
    updateBloodPools(dt);
    updateTracers(dt);
    updateExplosions(dt);
    updatePickups3D(dt, camera);
    for (let i = ragdolls.length - 1; i >= 0; i--) {
      if (ragdolls[i].update(dt, emitBlood)) { ragdolls[i].dispose(); ragdolls.splice(i, 1); }
    }
    for (let i = flyingLimbs.length - 1; i >= 0; i--) {
      if (flyingLimbs[i].update(dt)) { flyingLimbs[i].dispose(scene); flyingLimbs.splice(i, 1); }
    }
  }
  renderer.render(scene, camera);
}
animate();

// ─── SKIN SELECTOR ───
(function initSkinSelector() {
  const optionsEl = document.getElementById('skin-options');
  const previewEl = document.getElementById('skin-perk-preview');
  if (!optionsEl) return;
  const SKINS = [
    { id: 'default',        name: 'PADRÃO',    icon: '👤' },
    { id: 'angel',          name: 'ANJO',      icon: '😇' },
    { id: 'businessMale',   name: 'EXECUTIVO', icon: '💼' },
    { id: 'businessFemale', name: 'EXECUTIVA', icon: '🎯' },
  ];
  let selected = state.playerSkin || 'default';
  function render() {
    optionsEl.innerHTML = '';
    SKINS.forEach(skin => {
      const btn = document.createElement('button');
      btn.className = 'skin-option' + (skin.id === selected ? ' active' : '');
      btn.innerHTML = `<div class="skin-icon">${skin.icon}</div><div class="skin-name">${skin.name}</div>`;
      btn.addEventListener('click', () => {
        selected = skin.id;
        try { localStorage.setItem('qb_skin', skin.id); } catch {}
        state.playerSkin = skin.id;
        render();
      });
      optionsEl.appendChild(btn);
    });
    if (previewEl) {
      const perk = getPerk(selected);
      previewEl.innerHTML = `<span class="perk-name">${perk.icon} ${perk.name}</span>${perk.desc}`;
    }
  }
  render();
})();

// ─── START / GAME OVER ───
function getRecord() { try { return parseInt(localStorage.getItem('qb_record_wave') || '0', 10); } catch { return 0; } }
function saveRecord(wave, level) {
  try {
    const prev = getRecord();
    if (wave > prev) {
      localStorage.setItem('qb_record_wave', String(wave));
      localStorage.setItem('qb_record_level', String(level));
      return true;
    }
  } catch {}
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
  randomizeDifficultyRegions();

  Object.assign(state, {
    health: CONFIG.player.maxHealth, maxHealth: CONFIG.player.maxHealth,
    coins: 0, xp: 0, level: 1, xpToNextLevel: 50,
    wave: 0, zombiesAlive: 0, zombiesRemainingInWave: 0,
    running: true, paused: false, betweenWaves: false,
    startTime: performance.now(),
    critChance: CONFIG.crit.baseChance,
    damageMult: 1, rangeBonus: 0, speedMult: 1, lifesteal: 0,
    coinMult: 1, xpMult: 1, damageReduction: 0,
    attackSpeedMult: 1, critDamageBonus: 0,
    inventory: { 1:'knife', 2:null, 3:null, 4:null }, currentSlot: 1,
    mouseDown: false, aiming: false, shake: 0, shopOpen: false,
    downed: false, kills: 0, headshots: 0, damageTotal: 0,
    stamina: CONFIG.player.staminaMax,
    hitstopUntil: 0, isGrounded: true, velocityY: 0, jumpOffset: 0,
    jumpVelX: 0, jumpVelZ: 0, isSprinting: false,
    brazierFuel: 1, brazierBurning: false,
    vendorVanActive: false, bossSpawned: false, bossPos: null,
    mouseDX: 0, mouseDY: 0, vaulting: false, vaultTimer: 0,
    ammo: {}, reload: { active: false, wid: null, elapsed: 0, duration: 0 },
  });

  document.body.classList.remove('downed', 'aiming');
  ['downed-overlay','shop','pause','levelup'].forEach(id => {
    const e = document.getElementById(id); if (e) e.classList.add('hidden');
  });

  const perk = applyPerk(state.playerSkin || 'default', state, player);
  bus.emit(Ev.PERK_ACTIVATED, { perkId: perk.id, name: perk.name });
  showWaveBanner(`${perk.icon} ${perk.name}`);

  world.weaponSpots.forEach(s => { if (s.spriteHandle) s.spriteHandle.dispose(); });
  world.weaponSpots = [];
  clearPickups3D();
  setupWeaponSpawns();

  lootSpots.forEach(s => {
    if (s.mesh) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    if (s.halo) { scene.remove(s.halo); s.halo.geometry.dispose(); s.halo.material.dispose(); }
  });
  lootSpots.length = 0;
  for (const spot of world.lootSpots) spot.collected = false;
  initLootSpots();

  zombies.forEach(z => scene.remove(z.g));
  zombies.length = 0;
  ragdolls.forEach(r => r.dispose());
  ragdolls.length = 0;
  flyingLimbs.forEach(g => g.dispose(scene));
  flyingLimbs.length = 0;
  bloodActive.length = 0;
  bloodPools.forEach(b => { scene.remove(b.mesh); });
  bloodPools.length = 0;
  tracers.forEach(t => { t.mesh.visible = false; tracerPool.push(t); });
  tracers.length = 0;
  _noiseRipples.forEach(r => { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
  _noiseRipples.length = 0;
  bossProjectiles.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
  bossProjectiles.length = 0;

  clearPhysics();
  for (const box of world.wallColliders) addStaticBox(box.minX, box.maxX, box.minZ, box.maxZ, 4);
  for (const box of world.furnitureColliders) addStaticBox(box.minX, box.maxX, box.minZ, box.maxZ, 1.2);

  player.position.set(70, CONFIG.player.height, 70);
  player.yaw = 0; player.pitch = 0;
  player.userData._pendingDamage = 0;
  player.userData._dead = false;

  if (world._npcs) world._npcs.forEach(m => scene.remove(m));
  world._npcs = [];
  const npcList = [
    { id: 'angel',          x: 78, z: 78, rotY: -Math.PI * 0.75 },
    { id: 'businessMale',   x: 62, z: 78, rotY: -Math.PI * 0.25 },
    { id: 'businessFemale', x: 70, z: 60, rotY: 0 },
  ];
  npcList.forEach(n => {
    const model = createCharacter(n.id);
    if (!model) return;
    model.position.set(n.x, 0, n.z);
    model.rotation.y = n.rotY;
    model.userData._isNPC = true;
    scene.add(model);
    world._npcs.push(model);
  });

  initWeaponView();
  setWeaponViewModel('knife');
  updateWeaponSlotsHUD();

  const menu = document.getElementById('menu');
  const gameover = document.getElementById('gameover');
  const hud = document.getElementById('hud');
  if (menu) menu.classList.add('hidden');
  if (gameover) gameover.classList.add('hidden');
  if (hud) hud.classList.remove('hidden');

  updateHUD();
  startWave();
}
function gameOver() {
  bus.emit(Ev.PLAYER_DIED, { playerId: player.id, wave: state.wave, level: state.level, coins: state.coins, xp: state.xp });
  state.running = false;
  state.aiming = false;
  state.downed = false;
  state.paused = false;
  cancelReload();
  document.body.classList.remove('downed');
  ['downed-overlay','pause'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('hidden'); });
  updateCrosshair();
  if (state.waveIntervalId !== null) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; }
  if (state.waveStartTimeoutId !== null) { clearTimeout(state.waveStartTimeoutId); state.waveStartTimeoutId = null; }
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('final-wave', state.wave);
  setText('final-level', state.level);
  setText('final-coins', state.coins);
  setText('final-kills', state.kills);
  setText('final-hs', state.headshots);
  const elapsed = Math.floor((performance.now() - state.startTime)/1000);
  const m = Math.floor(elapsed/60);
  const s = (elapsed % 60).toString().padStart(2, '0');
  setText('final-time', `${m}:${s}`);
  const isNewRecord = saveRecord(state.wave, state.level);
  setText('final-record', isNewRecord ? '★ NOVO RECORDE! ★' : 'RECORDE: HORDA ' + getRecord());
  const gameover = document.getElementById('gameover');
  const hud = document.getElementById('hud');
  const prompt = document.getElementById('prompt');
  if (gameover) gameover.classList.remove('hidden');
  if (hud) hud.classList.add('hidden');
  if (prompt) prompt.classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
  updateRecordDisplay();
}

const btnStart = document.getElementById('btn-start');
if (btnStart) btnStart.addEventListener('click', startGame);
const btnRestart = document.getElementById('btn-restart');
if (btnRestart) btnRestart.addEventListener('click', startGame);
const btnShopClose = document.getElementById('btn-shop-close');
if (btnShopClose) btnShopClose.addEventListener('click', closeShop);
const btnResume = document.getElementById('btn-resume');
if (btnResume) btnResume.addEventListener('click', () => { if (state.paused) togglePause(); });
const btnQuit = document.getElementById('btn-quit');
if (btnQuit) btnQuit.addEventListener('click', () => {
  state.paused = false; state.running = false;
  const pause = document.getElementById('pause');
  const hud = document.getElementById('hud');
  const menu = document.getElementById('menu');
  if (pause) pause.classList.add('hidden');
  if (hud) hud.classList.add('hidden');
  if (menu) menu.classList.remove('hidden');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── MP FEEDBACK (simplificado) ───
const killFeedEl = document.getElementById('kill-feed');
const playerStats = new Map();
playerStats.set(player.id, { id: player.id, name: 'VOCÊ', kills: 0, headshots: 0, damage: 0, local: true });

bus.on(Ev.KILL, p => {
  if (!killFeedEl) return;
  const entry = document.createElement('div');
  entry.className = 'kill-entry';
  const weapon = (WEAPONS[p.weaponId] && WEAPONS[p.weaponId].name) || p.weaponId || '';
  entry.innerHTML = `<span class="killer">VOCÊ</span><span class="weapon">${weapon}</span>${p.headshot ? '<span class="hs-badge">HS</span>' : ''}<span class="victim">ZUMBI</span>`;
  killFeedEl.insertBefore(entry, killFeedEl.firstChild);
  while (killFeedEl.children.length > 5) killFeedEl.removeChild(killFeedEl.lastChild);
  setTimeout(() => {
    entry.classList.add('fading');
    setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry); }, 400);
  }, 4200);
});

window.addEventListener('beforeunload', () => playerStats.clear());

console.log('[game] ✅ v19 "STABLE" carregado.');
