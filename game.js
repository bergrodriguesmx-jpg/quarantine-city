// ============================================================
// game.js — v2
// Integra: IA especialista, Perks por skin, POIs, Boss AI melhorada.
// ============================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as Textures from './textures.js';
import { buildWorld, POIS } from './scenery.js';
import * as Sfx from './audio.js';
import * as bus from './src/core/bus.js';
import { Ev } from './src/core/events.js';
import { nextId } from './src/core/ids.js';
import { LocalAdapter } from './src/net/adapter.js';
import { springStep, springKick } from './src/core/spring.js';
import { SpatialGrid } from './src/core/spatial-grid.js';
import { geoBox, geoSphere, geoCyl, geoTorus, matL, matB, zMat } from './src/core/geo-cache.js';
import { computePartLocalBoxes } from './src/core/part-box.js';
import { enrichWeapons, MELEE_TYPES, ZOMBIE_LORE, formatWeaponTooltip } from './src/core/lore.js';
import { initPhysics, stepPhysics, addStaticBox, clearPhysics, Ragdoll as PhysicsRagdoll } from './src/core/ragdoll-physics.js';

import { Action, getControls } from './save-controls.js';
import { ControlsUI } from './controls-ui.js';

import * as Daytime from './src/core/daytime.js';
import * as Gore from './src/core/gore.js';
import * as ZombieAI from './src/core/zombie-ai.js';
import * as BossAI from './src/core/boss-ai.js';
import * as Extraction from './src/core/extraction.js';
import { survival } from './src/core/survival.js';
import { ZOMBIE_TYPES, pickZombieType, BOSS_ROTATION } from './src/core/zombie-types.js';
import { initStuckState, updateStuckDetection, applyStuckPhysics } from './src/core/zombie-stuck.js';
import { Weapon3DView } from './src/render/viewmodel-3d.js';
import { spawnPickup3D, updatePickups3D, clearPickups3D } from './src/render/pickup-3d.js';
import { getWeaponIconURL, getAmmoIconURL } from './src/render/weapon-icon-renderer.js';
import { WeaponCalibrator } from './src/render/weapon-calibrator.js';

import { preloadGibs, createGib, hasGib } from './gib-models.js';
import { preloadGibGLBs, createLimb, hasLimb, createCorpse, listCorpseTypes } from './gib-glb.js';
import { preloadCharacters, createCharacter } from './character-models.js';
import { precacheAllWeaponGLBs, getStatus as getWeaponStatus } from './src/render/weapon-models.js';
import { preloadZombieAnims, hasZombieAnims, setupZombieAnimator, updateZombieAnim, handleZombieAnimState } from './zombie-anim.js';
import { preloadZombieModel, isModelReady, createZombieInstance, tintZombie } from './zombie-model.js';

// ════════ NOVOS IMPORTS ════════
import { applyPerk, getPerk, PERKS, listPerks } from './perks.js';

bus.setAdapter(new LocalAdapter());

window.ZOMBIE_TYPES_FROM_MODULE = ZOMBIE_TYPES;

const controls = getControls();

// ════════ PRECACHE DOS ASSETS ════════
window.__assetsReady = false;
(async () => {
  console.log('[game] 📦 Carregando assets extraídos...');

  try {
    await precacheAllWeaponGLBs();
    console.log('[game] ✅ Armas prontas');
  } catch (e) { console.warn('[game] ⚠️ Erro nas armas:', e); }

  try {
    await preloadGibs();
    await preloadGibGLBs();
    console.log('[game] ✅ Giblets prontos');
  } catch (e) { console.warn('[game] ⚠️ Erro nos giblets:', e); }

  try {
    await preloadZombieModel();
    if (isModelReady()) console.log('[game] ✅ XBot pronto');
    else console.error('[game] ❌ XBot NÃO carregou — zumbis vão usar fallback');
  } catch (e) { console.warn('[game] ⚠️ Erro no XBot:', e); }

  try {
    await preloadZombieAnims();
    if (hasZombieAnims()) console.log('[game] ✅ Animações prontas');
    else console.warn('[game] ⚠️ Sem animações Mixamo');
  } catch (e) { console.warn('[game] ⚠️ Erro nas animações:', e); }

  try {
    await preloadCharacters();
    console.log('[game] ✅ Personagens prontos');
  } catch (e) { console.warn('[game] ⚠️ Erro nos NPCs:', e); }

  console.log('[game] ✅ Todos os assets prontos');
  window.__assetsReady = true;
})();

// ============================================================
// HELPERS
// ============================================================
const roundedBoxCache = new Map();
function geoRoundBox(w, h, d, radius = 0.03, seg = 3) {
  const k = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${radius.toFixed(3)}`;
  let g = roundedBoxCache.get(k);
  if (!g) {
    const r = Math.min(radius, Math.min(w, h, d) * 0.45);
    const minDim = Math.min(w, h, d);
    g = minDim < 0.08 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
    roundedBoxCache.set(k, g);
  }
  return g;
}

const MAT_EYE_WHITE = matB(0xFFFFFF);
const MAT_EYE_BLACK = matB(0x000000);
const MAT_WOUND = matB(0xC0392B);

const WEAPONS = {
  knife:       { id:'knife',       name:'FACA',           slot:1, type:'melee',  damage:35, range:3.0, cooldown:0.55, cost:0,    color:0xBDC3C7, arc:0.35, hitCount:1, chop:0.65 },
  woodenClub:  { id:'woodenClub',  name:'PORRETE',        slot:1, type:'melee',  damage:55, range:2.8, cooldown:0.75, cost:30,   color:0x8B5A2B, arc:0.4,  hitCount:2, chop:0.15 },
  pipe:        { id:'pipe',        name:'CANO DE FERRO',  slot:1, type:'melee',  damage:60, range:3.2, cooldown:0.65, cost:50,   color:0x7F8C8D, arc:0.35, hitCount:2, chop:0.25 },
  cleaver:     { id:'cleaver',     name:'CUTELO',         slot:1, type:'melee',  damage:70, range:2.5, cooldown:0.7,  cost:80,   color:0xC0C0C0, arc:0.3,  hitCount:1, chop:0.8 },
  shovel:      { id:'shovel',      name:'PÁ',             slot:1, type:'melee',  damage:45, range:3.5, cooldown:0.8,  cost:60,   color:0x5D4030, arc:0.35, hitCount:2, chop:0.1, push:true },
  katana:      { id:'katana',      name:'KATANA',         slot:1, type:'melee',  damage:90, range:3.3, cooldown:0.5,  cost:400,  color:0xE8E8E8, arc:0.4,  hitCount:3, chop:0.95 },
  kukri:       { id:'kukri',       name:'KUKRI',          slot:1, type:'melee',  damage:75, range:2.8, cooldown:0.55, cost:200,  color:0xB0B0B0, arc:0.35, hitCount:2, chop:0.85 },
  pipeWrench:  { id:'pipeWrench',  name:'CHAVE GRIFO',    slot:1, type:'melee',  damage:65, range:2.9, cooldown:0.9,  cost:70,   color:0x4A4A4A, arc:0.4,  hitCount:1, chop:0.1 },
  reaperScythe:{ id:'reaperScythe',name:'FOICE DO CEIFADOR',slot:1,type:'melee', damage:180,range:4.0, cooldown:1.0,  cost:1500, color:0x1A1A1A, arc:0.6,  hitCount:5, chop:1.0 },
  pistol:      { id:'pistol',      name:'PISTOLA',        slot:2, type:'ranged', damage:40, range:16, cooldown:0.28, cost:40,   spread:0.02,  pellets:1, auto:false, color:0x2C3E50, magSize:12, reserveMax:120, reloadTime:1.3 },
  revolver:    { id:'revolver',    name:'REVOLVER',       slot:2, type:'ranged', damage:90, range:15, cooldown:0.75, cost:120,  spread:0.008, pellets:1, auto:false, color:0x4A4A4A, magSize:6,  reserveMax:42,  reloadTime:2.2 },
  smg:         { id:'smg',         name:'SMG',            slot:3, type:'ranged', damage:18, range:13, cooldown:0.075,cost:160,  spread:0.07,  pellets:1, auto:true,  color:0x34495E, magSize:30, reserveMax:240, reloadTime:1.9 },
  rifle:       { id:'rifle',       name:'RIFLE',          slot:3, type:'ranged', damage:160,range:30, cooldown:1.1,  cost:320,  spread:0.005, pellets:1, auto:false, color:0x2C3E50, magSize:5,  reserveMax:40,  reloadTime:2.9 },
  shotgun:     { id:'shotgun',     name:'SHOTGUN',        slot:3, type:'ranged', damage:32, range:8,  cooldown:1.15, cost:220,  spread:0.22,  pellets:10,auto:false, color:0x8B4513, magSize:5,  reserveMax:30,  reloadTime:2.5 },
  launcher:    { id:'launcher',    name:'LANÇA-FOGUETES', slot:4, type:'ranged', damage:250,range:20, cooldown:1.9,  cost:700,  spread:0.02,  pellets:1, auto:false, color:0xC0392B, magSize:1,  reserveMax:5,   reloadTime:3.5 },
};
enrichWeapons(WEAPONS);

const AMMO_PACKS = { pistol:60, revolver:12, smg:90, rifle:15, shotgun:15, launcher:2 };
const AMMO_PRICES = { pistol:5, revolver:15, smg:25, rifle:40, shotgun:30, launcher:100 };

const SKILLS = [
  { id:'vitality',   icon:'V', name:'VITALIDADE',   desc:'+20 HP maximo',         apply:()=>{ state.maxHealth+=20; state.health=Math.min(state.maxHealth,state.health+20); } },
  { id:'strength',   icon:'F', name:'FORCA',        desc:'+15% dano',             apply:()=>{ state.damageMult+=0.15; } },
  { id:'reach',      icon:'A', name:'ALCANCE',      desc:'+0.3m alcance',         apply:()=>{ state.rangeBonus+=0.3; } },
  { id:'agility',    icon:'V', name:'AGILIDADE',    desc:'+8% velocidade',        apply:()=>{ state.speedMult+=0.08; } },
  { id:'precision',  icon:'P', name:'PRECISAO',     desc:'+8% critico',           apply:()=>{ state.critChance=Math.min(0.95,state.critChance+0.08); } },
  { id:'vampirism',  icon:'S', name:'VAMPIRISMO',   desc:'+3 HP por kill',        apply:()=>{ state.lifesteal+=3; } },
  { id:'fortune',    icon:'$', name:'FORTUNA',      desc:'+50% moedas',           apply:()=>{ state.coinMult+=0.5; } },
  { id:'wisdom',     icon:'W', name:'SABEDORIA',    desc:'+30% XP',               apply:()=>{ state.xpMult+=0.3; } },
  { id:'resistance', icon:'R', name:'RESISTENCIA',  desc:'-10% dano recebido',    apply:()=>{ state.damageReduction=Math.min(0.7,state.damageReduction+0.1); } },
  { id:'fury',       icon:'U', name:'FURIA',        desc:'-12% tempo ataque',     apply:()=>{ state.attackSpeedMult+=0.12; } },
  { id:'heavy',      icon:'H', name:'GOLPE PESADO', desc:'+0.5x dano critico',    apply:()=>{ state.critDamageBonus+=0.5; } },
];

const CONFIG = {
  player: {
    speed:5.5, height:1.7, maxHealth:100, radius:0.4,
    staminaMax:100, staminaRegen:25, staminaDrainRun:14,
    sprintMult:1.55,
    jumpForce:7.0,
    jumpForwardForce:6.5,
    jumpAirDecay:2.2,
    gravity:22,
  },
   zombie: { speed:3.0, maxHealth:40, damage:8, attackRange:1.6, attackCooldown:1.2, xpReward:10, coinReward:2, knockbackStagger:0.25, radius:0.4 },
  pursuit: { responsiveness:3.8, arrivalRadius:1.15, minSpeedFactor:0.35 },
  scaling: { hpPerWave:0.10, dmgPerWave:0.05, speedPerWave:0.02, speedCap:1.30 },
   aggro: { alertRadius:8.0, alertDuration:3.0, alertSpeedMult:1.4 },
  wave: { baseZombies:6, zombiesPerWave:2, maxZombies:32, breakTime:5, bossEvery:5, clearBonusBase:15, clearBonusPerWave:5, clearHealFrac:0.15, clearAmmoFrac:0.30 },
  arena: { size:80 },
  ragdoll: { maxActive:3, settleTime:15, fadeDuration:1.2, impactImpulse:10, sliceRange:3.5, sliceDotMin:0.25 },
  crit: { baseChance:0.15, damageMultiplier:2 },
  dismember: { headChance:0.65, armChance:0.55, legChance:0.55, limbSpeed:16, limbLife:12 },
  headshotMultiplier: 2.5,
  shake: { hit:0.05, kill:0.12, shoot:0.03, explosion:0.5 },
  melee: { coneDot:0.35, hitstop:0.055 },
  launcher: { explosionRadius:5, selfDamageFactor:0.4 },
  downed: { selfReviveAt:15000, selfReviveHold:3000, duration:30000, maxHP:30, maxRevives:2 },
  debris: { minHitSpeed2:6, pushRadiusBonus:0.6, staggerTime:0.22 },
  brazier: { fuelPerWave:1, maxFuel:3, costPerBurn:1, waveSpeedBoost:3.0, rewardMult:2.0 },
  vendor: { spawnEveryWaves:3, durationSec:60, buyDiscount:0.8, sellRate:0.4 },
  crawl: { speedMul:0.35, attackRangeMul:0.75, cooldownMul:1.4 },
  ik: {
    lookAtMaxYaw: 0.6,
    lookAtHeadShare: 0.75,
    leanTowardPlayerDist: 4,
    leanAmount: 0.10,
    footMinY: -0.02,
  },
};

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
  ammo:{}, reload:{ active:false, wid:null, startTime:0, endTime:0, duration:0 },
  shopOpen:false,
  downed:false, downedElapsed:0, downedHP:0, downedMaxHP:CONFIG.downed.maxHP,
  reviveProgress:0, revivesLeft:CONFIG.downed.maxRevives, invulnUntil:0,
  pingWheelOpen:false, pingAccumX:0, pingAccumY:0, pingHighlight:null,
  kills:0, headshots:0, damageTotal:0,
  playerSkin: (() => { try { return localStorage.getItem('qb_skin') || 'default'; } catch { return 'default'; } })(),
  stamina: CONFIG.player.staminaMax, staminaMax: CONFIG.player.staminaMax,
  hitstopUntil:0,
  isGrounded:true, velocityY:0, jumpOffset:0,
  jumpVelX:0, jumpVelZ:0,
  isSprinting:false,
  brazierFuel:1, brazierBurning:false, brazierBurnStart:0,
  vendorVanActive:false, vendorVanSpawnedAt:0, vendorVanWave:0,
  bossSpawned: false,
  mouseDX: 0, mouseDY: 0,

  // ════════ PERKS (novos) ════════
  reviveSpeedMult: 1,
  reviveHealBonus: 0,
  shopDiscount: 1,
  sellBonus: 1,
  reloadSpeedMult: 1,
  reserveAmmoBonus: 0,
  healMult: 1,
  autoBandage: false,
  recoilMult: 1,
  sprintSpeedBonus: 1,
  killRefillsStamina: false,
  killStaminaDuration: 0,
  brazierDurationMult: 1,
  brazierFuelBonus: 1,
  activePerk: null,
  staminaBoostUntil: 0,

  // ════════ POIs descobertos (novo) ════════
  discoveredPOIs: new Set(),
};

// ============================================================
// SCENE
// ============================================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xC5E0F5, 50, 130);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth/window.innerHeight, 0.1, 400);
window.__qbCamera = camera;
camera.position.set(0, CONFIG.player.height, 0);

const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1.0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.autoUpdate = false;
container.appendChild(renderer.domElement);

scene.add(new THREE.Mesh(new THREE.SphereGeometry(180, 16, 8), new THREE.MeshBasicMaterial({ map:Textures.skyTexture(), side:THREE.BackSide, fog:false })));
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(50, 80, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 130; sun.shadow.bias = -0.002;
scene.add(sun);

{
  const size = CONFIG.arena.size;
  const tex = Textures.grassTexture(); tex.repeat.set(size/2, size/2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map:tex }));
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
}

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

const caves = [];
{
  const half = CONFIG.arena.size/2 - 3;
  [
    { x:0, z:-half, rot:0 }, { x:0, z:half, rot:Math.PI },
    { x:-half, z:0, rot:Math.PI/2 }, { x:half, z:0, rot:-Math.PI/2 },
    { x:-half*0.7, z:-half*0.7, rot:Math.PI/4 },
    { x:half*0.7, z:-half*0.7, rot:-Math.PI/4 },
    { x:-half*0.7, z:half*0.7, rot:Math.PI*3/4 },
    { x:half*0.7, z:half*0.7, rot:-Math.PI*3/4 },
  ].forEach(({x,z,rot}) => {
    const mesh = createCave(x, z, rot); scene.add(mesh); caves.push({ x, z, rot, mesh });
  });
}
function createCave(x, z, rotationY) {
  const g = new THREE.Group();
  const rockMat = matL(0x5A5A5A, { flatShading:true });
  const darkRock = matL(0x3A3A3A, { flatShading:true });
  const holeMat = matB(0x000000);
  function rock(px, py, pz, sx, sy, sz, mat) {
    const m = new THREE.Mesh(geoBox(sx, sy, sz, 1), mat||rockMat);
    m.position.set(px, py, pz); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m);
  }
  rock(-1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(1.8, 1.4, 0.2, 1.8, 2.8, 2.0, rockMat);
  rock(-0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0.9, 3.2, 0.2, 1.6, 1.4, 2.2, darkRock);
  rock(0, 3.6, 0.2, 3.6, 0.9, 2.0, rockMat);
  const hole = new THREE.Mesh(geoBox(2.6, 2.6, 0.4, 1), holeMat);
  hole.position.set(0, 1.3, -1.0); hole.matrixAutoUpdate = false; hole.updateMatrix(); g.add(hole);
  g.position.set(x, 0, z); g.rotation.y = rotationY;
  g.matrixAutoUpdate = false; g.updateMatrix();
  return g;
}

const limit = CONFIG.arena.size/2 - 1;
const invisible = new THREE.MeshBasicMaterial({ visible:false });
[
  { w:1, h:10, d:CONFIG.arena.size, x:-limit, z:0 },
  { w:1, h:10, d:CONFIG.arena.size, x:limit, z:0 },
  { w:CONFIG.arena.size, h:10, d:1, x:0, z:-limit },
  { w:CONFIG.arena.size, h:10, d:1, x:0, z:limit },
].forEach(({w,h,d,x,z}) => {
  const wall = new THREE.Mesh(geoBox(w, h, d, 1), invisible);
  wall.position.set(x, h/2, z);
  scene.add(wall);
  world.wallColliders.push({ minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2 });
});

const brazierGroup = new THREE.Group();
{
  const base = new THREE.Mesh(geoCyl(0.7, 0.9, 1.2, 8), matL(0x3A3A3A, { flatShading:true }));
  base.position.y = 0.6; base.castShadow = true; brazierGroup.add(base);
  const bowl = new THREE.Mesh(geoCyl(1.0, 0.7, 0.5, 8), matL(0x2A2A2A, { flatShading:true }));
  bowl.position.y = 1.35; bowl.castShadow = true; brazierGroup.add(bowl);
  const dark = new THREE.Mesh(geoBox(1.6, 0.3, 1.6, 1), matB(0x1A1A1A));
  dark.position.y = 1.55; brazierGroup.add(dark);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), new THREE.MeshBasicMaterial({ color:0xFF6600, transparent:true, opacity:0.9 }));
  flame.position.y = 2.4; flame.name = 'flame'; flame.visible = false; brazierGroup.add(flame);
  const flameLight = new THREE.PointLight(0xFF6600, 0, 12, 2);
  flameLight.position.y = 2.4; flameLight.name = 'flameLight'; brazierGroup.add(flameLight);
}
scene.add(brazierGroup);

const vendorVan = new THREE.Group();
{
  const body = new THREE.Mesh(geoRoundBox(2.4, 1.8, 4.5, 0.15, 3), matL(0x8B5A2B));
  body.position.y = 1.2; body.castShadow = true; vendorVan.add(body);
  const cab = new THREE.Mesh(geoRoundBox(2.2, 1.2, 1.6, 0.15, 3), matL(0x5D4030));
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

const headgearMats = {
  cap_red: matL(0xE74C3C), cap_brown: matL(0x5D4030), cap_black: matL(0x1A1A1A),
  helmet_yellow: matL(0xFFCC00), helmet_green: matL(0x2E7D32), beanie_red: matL(0xCC1111),
  balaclava: matL(0x1A1A1A), crown: matL(0xFFD700), hood: matL(0x0A0A0A),
  gasMask: matL(0x2A2A2A), riotShield: matL(0x2C3E50, { transparent:true, opacity:0.6 }),
};

// ============================================================
// VIEWMODEL + CALIBRADOR + CONTROLES
// ============================================================
scene.add(camera);

let weaponView = null;
let calibrator = null;

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

document.getElementById('btn-calibrate').addEventListener('click', () => {
  initCalibrator();
  calibrator.open();
});

let controlsUI = null;
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

function initWeaponView() {
  if (weaponView) weaponView.dispose();
  weaponView = new Weapon3DView(camera);
}

function setWeaponViewModel(weaponId) {
  if (!weaponView) initWeaponView();
  weaponView.setVisible(true);
  weaponView.setWeapon(weaponId);
}

function triggerSwing() {
  if (weaponView) weaponView.swing();
}

// ============================================================
// PLAYER
// ============================================================
const player = {
  id: nextId('p'),
  position: new THREE.Vector3(0, CONFIG.player.height, 0),
  yaw: 0,
  pitch: 0,
  userData: { _pendingDamage: 0 },
};

Daytime.initDaytime(scene, sun, ambientLight);
Gore.initGore(scene);
Extraction.initExtraction(scene, player);
BossAI.initBossSystem(scene, camera, player, spawnBossProjectile);

// 🎯 REGISTRA CALLBACKS DA IA ESPECIALISTA
ZombieAI.registerAICallbacks({
  spawnToxProjectile: ({ origin, dir, speed, damage, radius, ownerId }) => {
    spawnBossProjectile({
      type: 'tox', origin, dir, speed, damage, radius,
    });
  },
  onBoomerExplode: (z) => {
    spawnExplosion(z.mesh.position);
  },
});

bus.on(Ev.WORLD_BLOOD_MOON, () => {
  try { Sfx.playZombieDeath(); } catch(_) {}
  addShake(0.5);
  showWaveBanner('LUA DE SANGUE!');
});
bus.on(Ev.EXTRACTION_SPAWNED, () => showWaveBanner('HELICÓPTERO CHEGANDO!'));
bus.on(Ev.EXTRACTION_LANDED,  () => showWaveBanner('ENTRE NO HELICÓPTERO!'));
bus.on(Ev.EXTRACTION_SUCCESS, () => {
  state.running = false;
  document.getElementById('final-wave').textContent = state.wave;
  document.getElementById('final-level').textContent = state.level;
  document.getElementById('final-coins').textContent = state.coins;
  document.getElementById('final-kills').textContent = state.kills;
  document.getElementById('final-hs').textContent = state.headshots;
  const elapsed = Math.floor((performance.now() - state.startTime)/1000);
  const m = Math.floor(elapsed/60);
  const s = (elapsed % 60).toString().padStart(2, '0');
  document.getElementById('final-time').textContent = `${m}:${s}`;
  document.getElementById('final-record').textContent = '★ VOCÊ ESCAPOU! ★';
  document.getElementById('gameover').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
});

// ============================================================
// BOSS PROJECTILES
// ============================================================
const bossProjectiles = [];
function spawnBossProjectile({ type, origin, dir, speed, damage, radius }) {
  const geo = type === 'tox'
    ? new THREE.SphereGeometry(radius, 10, 8)
    : new THREE.SphereGeometry(radius, 6, 4);
  const color = type === 'tox' ? 0x66ff33 : 0xffdd44;
  const mat = new THREE.MeshBasicMaterial({ color });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(origin);
  scene.add(m);
  bossProjectiles.push({ mesh: m, dir: dir.clone(), speed, damage, life: 3, type });
}

function updateBossProjectiles(dt) {
  for (let i = bossProjectiles.length - 1; i >= 0; i--) {
    const p = bossProjectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.dir, p.speed * dt);
    const d = p.mesh.position.distanceTo(player.position);
    if (d < 0.8) {
      state.health -= p.damage;
      survival.onPlayerHit(p.damage);
      showDamageFlash();
      updateHUD();
      if (state.health <= 0 && !state.downed) enterDownedState();
      scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
      bossProjectiles.splice(i, 1);
      continue;
    }
    if (p.life <= 0 || p.mesh.position.y < 0) {
      scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
      bossProjectiles.splice(i, 1);
    }
  }
}

// ============================================================
// COLISÃO HELPERS
// ============================================================
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function circleVsAABB(px, pz, radius, box) {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  const dx = px - cx, dz = pz - cz;
  const d2 = dx*dx + dz*dz;
  if (d2 > radius * radius) return null;
  const d = Math.sqrt(d2);
  if (d > 0.0001) { const nx = dx/d, nz = dz/d; return { x:px + nx*(radius-d), z:pz + nz*(radius-d) }; }
  const exL = Math.abs(px - box.minX), exR = Math.abs(box.maxX - px);
  const ezU = Math.abs(pz - box.minZ), ezD = Math.abs(box.maxZ - pz);
  const m = Math.min(exL, exR, ezU, ezD);
  if (m === exL) return { x:box.minX - radius, z:pz };
  if (m === exR) return { x:box.maxX + radius, z:pz };
  if (m === ezU) return { x:px, z:box.minZ - radius };
  return { x:px, z:box.maxZ + radius };
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
// ZOMBIES
// ============================================================
const zombies = [];
const HAIR_COLORS = [0x2C1810, 0x1A0F08, 0x4A2818, 0x6B3A1F, 0x3A2A1A];

const P_PELVIS_Y = 0.93;
const P_SPINE_LOW_OFF = 0.12;
const P_SPINE_UP_OFF = 0.22;
const P_SHOULDER_Y = 0.14;

function applyHeadgear(head, headgear, HR) {
  if (!headgear) return;
  if (headgear === 'cap_brown' || headgear === 'cap_red' || headgear === 'cap_black') {
    const mat = headgearMats[headgear];
    const cap = new THREE.Mesh(geoRoundBox(HR*2.2, HR*0.5, HR*2.2, HR*0.15), mat);
    cap.position.y = HR * 1.15; head.add(cap);
    const brim = new THREE.Mesh(geoRoundBox(HR*2.1, HR*0.12, HR*0.9, HR*0.05), mat);
    brim.position.set(0, HR*1.05, HR*1.15); head.add(brim);
  } else if (headgear === 'helmet_yellow') {
    const mat = headgearMats.helmet_yellow;
    const helmet = new THREE.Mesh(geoRoundBox(HR*2.5, HR*0.7, HR*2.5, HR*0.25), mat);
    helmet.position.y = HR * 1.10; head.add(helmet);
    const lamp = new THREE.Mesh(geoSphere(HR*0.18, 6), matB(0xFFFF88));
    lamp.position.set(0, HR*1.05, HR*1.55); head.add(lamp);
  } else if (headgear === 'helmet_green') {
    const mat = headgearMats.helmet_green;
    const helmet = new THREE.Mesh(geoRoundBox(HR*2.3, HR*0.75, HR*2.3, HR*0.25), mat);
    helmet.position.y = HR * 1.15; head.add(helmet);
  } else if (headgear === 'beanie_red') {
    const mat = headgearMats.beanie_red;
    const beanie = new THREE.Mesh(geoRoundBox(HR*2.3, HR*1.1, HR*2.3, HR*0.35), mat);
    beanie.position.y = HR * 1.25; head.add(beanie);
  } else if (headgear === 'balaclava') {
    const mat = headgearMats.balaclava;
    const mask = new THREE.Mesh(geoRoundBox(HR*2.05, HR*1.7, HR*1.9, HR*0.25), mat);
    mask.position.set(0, -HR*0.15, HR*0.15); head.add(mask);
    const top = new THREE.Mesh(geoRoundBox(HR*2.15, HR*0.6, HR*2.15, HR*0.25), mat);
    top.position.y = HR * 0.95; head.add(top);
  } else if (headgear === 'gasMask') {
    const mat = headgearMats.gasMask;
    const mask = new THREE.Mesh(geoRoundBox(HR*2.0, HR*1.4, HR*1.3, HR*0.25), mat);
    mask.position.set(0, -HR*0.3, HR*0.55); head.add(mask);
    const fL = new THREE.Mesh(geoCyl(HR*0.25, HR*0.25, HR*0.35, 6), mat);
    fL.rotation.z = Math.PI/2; fL.position.set(-HR*1.05, -HR*0.4, HR*0.6); head.add(fL);
    const fR = new THREE.Mesh(geoCyl(HR*0.25, HR*0.25, HR*0.35, 6), mat);
    fR.rotation.z = Math.PI/2; fR.position.set(HR*1.05, -HR*0.4, HR*0.6); head.add(fR);
  } else if (headgear === 'crown') {
    const mat = headgearMats.crown;
    const crown = new THREE.Mesh(geoCyl(HR*1.1, HR*1.3, HR*0.6, 6, 1, true), mat);
    crown.position.y = HR * 1.5; head.add(crown);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(HR*0.18, HR*0.4, 3), mat);
      const angle = (Math.PI*2/5) * i;
      spike.position.set(Math.cos(angle)*HR*1.1, HR*1.9, Math.sin(angle)*HR*1.1);
      head.add(spike);
    }
  } else if (headgear === 'hood') {
    const mat = headgearMats.hood;
    const hood = new THREE.Mesh(geoRoundBox(HR*2.6, HR*2.6, HR*2.5, HR*0.4), mat);
    hood.position.set(0, HR*0.4, -HR*0.25); head.add(hood);
    const shadow = new THREE.Mesh(geoSphere(HR*0.85, 8), matB(0x000000));
    shadow.position.set(0, HR*0.1, HR*0.7); head.add(shadow);
  }
}

function buildHumanHead(head, skinMat, hairMat, wound, HR, opts = {}) {
  const skull = new THREE.Mesh(geoSphere(HR, 12), skinMat);
  skull.scale.set(1.05, 1.15, 1.0); head.add(skull);
  const jaw = new THREE.Mesh(geoRoundBox(HR*1.55, HR*0.65, HR*1.45, HR*0.22), skinMat);
  jaw.position.set(0, -HR*0.95, HR*0.15); head.add(jaw);
  if (!opts.balaclava && !opts.hood) {
    const hair = new THREE.Mesh(geoRoundBox(HR*2.05, HR*0.50, HR*2.00, HR*0.22), hairMat);
    hair.position.y = HR*1.05; head.add(hair);
  }
  const eyeGeo = geoBox(HR*0.42, HR*0.32, HR*0.12, 1);
  const wL = new THREE.Mesh(eyeGeo, MAT_EYE_WHITE); wL.position.set(-HR*0.48, HR*0.18, HR*0.90); head.add(wL);
  const wR = new THREE.Mesh(eyeGeo, MAT_EYE_WHITE); wR.position.set(HR*0.48, HR*0.18, HR*0.90); head.add(wR);
  const pupGeo = geoBox(HR*0.17, HR*0.17, HR*0.12, 1);
  const pL = new THREE.Mesh(pupGeo, MAT_EYE_BLACK); pL.position.set(-HR*0.48, HR*0.18, HR*0.95); head.add(pL);
  const pR = new THREE.Mesh(pupGeo, MAT_EYE_BLACK); pR.position.set(HR*0.48, HR*0.18, HR*0.95); head.add(pR);
  const nose = new THREE.Mesh(geoSphere(HR*0.22, 6), skinMat);
  nose.scale.set(0.8,1,1.2); nose.position.set(0, -HR*0.14, HR*0.98); head.add(nose);
  if (!opts.balaclava && !opts.hood) {
    const mouth = new THREE.Mesh(geoBox(HR*0.78, HR*0.16, HR*0.08, 1), matB(0x2B0000));
    mouth.position.set(0, -HR*0.55, HR*0.95); head.add(mouth);
  }
  const woundHead = new THREE.Mesh(geoBox(HR*0.50, HR*0.22, HR*0.08, 1), wound);
  woundHead.position.set(-HR*0.55, HR*0.48, HR*0.92); head.add(woundHead);
  if (opts.headgear) applyHeadgear(head, opts.headgear, HR);
}

function buildDonkeyHead(head, skinMat, wound, HR) {
  const dSkin = matL(0x9E8B7A), dDark = matL(0x6B5D4F), muzzleMat = matL(0xB8A796);
  const skull = new THREE.Mesh(geoSphere(HR*0.95, 10), dSkin);
  skull.scale.set(1.0,1.0,1.10); head.add(skull);
  const muzzle = new THREE.Mesh(geoRoundBox(HR*1.1, HR*0.95, HR*1.5, HR*0.25), muzzleMat);
  muzzle.position.set(0, -HR*0.30, HR*1.55); head.add(muzzle);
  const nostrilMat = matB(0x2A1F1A);
  const nL = new THREE.Mesh(geoBox(HR*0.18, HR*0.14, HR*0.10, 1), nostrilMat); nL.position.set(-HR*0.30, -HR*0.10, HR*2.20); head.add(nL);
  const nR = new THREE.Mesh(geoBox(HR*0.18, HR*0.14, HR*0.10, 1), nostrilMat); nR.position.set(HR*0.30, -HR*0.10, HR*2.20); head.add(nR);
  const eL = new THREE.Mesh(geoBox(HR*0.35, HR*0.32, HR*0.10, 1), MAT_EYE_WHITE); eL.position.set(-HR*0.75, HR*0.35, HR*1.0); head.add(eL);
  const eR = new THREE.Mesh(geoBox(HR*0.35, HR*0.32, HR*0.10, 1), MAT_EYE_WHITE); eR.position.set(HR*0.75, HR*0.35, HR*1.0); head.add(eR);
  const pL = new THREE.Mesh(geoBox(HR*0.17, HR*0.17, HR*0.10, 1), MAT_EYE_BLACK); pL.position.set(-HR*0.75, HR*0.35, HR*1.05); head.add(pL);
  const pR = new THREE.Mesh(geoBox(HR*0.17, HR*0.17, HR*0.10, 1), MAT_EYE_BLACK); pR.position.set(HR*0.75, HR*0.35, HR*1.05); head.add(pR);
  const ear = new THREE.Mesh(geoRoundBox(HR*0.35, HR*0.95, HR*0.35, HR*0.15), dSkin);
  ear.position.set(-HR*0.65, HR*1.05, 0); ear.rotation.z = 0.25; head.add(ear);
  const ear2 = new THREE.Mesh(geoRoundBox(HR*0.35, HR*0.95, HR*0.35, HR*0.15), dSkin);
  ear2.position.set(HR*0.65, HR*1.05, 0); ear2.rotation.z = -0.25; head.add(ear2);
  const woundHead = new THREE.Mesh(geoBox(HR*0.5, HR*0.28, HR*0.10, 1), wound);
  woundHead.position.set(-HR*0.75, HR*0.80, HR*0.90); head.add(woundHead);
}

function buildJudgeHead(head, skinMat, wound, HR) {
  const hs = new THREE.Mesh(geoSphere(HR, 12), skinMat);
  head.add(hs);
  const eL = new THREE.Mesh(geoBox(HR*0.40, HR*0.34, HR*0.10, 1), MAT_EYE_WHITE); eL.position.set(-HR*0.48, HR*0.18, HR*0.92); head.add(eL);
  const eR = new THREE.Mesh(geoBox(HR*0.40, HR*0.34, HR*0.10, 1), MAT_EYE_WHITE); eR.position.set(HR*0.48, HR*0.18, HR*0.92); head.add(eR);
  const pL = new THREE.Mesh(geoBox(HR*0.17, HR*0.17, HR*0.10, 1), MAT_EYE_BLACK); pL.position.set(-HR*0.48, HR*0.18, HR*0.96); head.add(pL);
  const pR = new THREE.Mesh(geoBox(HR*0.17, HR*0.17, HR*0.10, 1), MAT_EYE_BLACK); pR.position.set(HR*0.48, HR*0.18, HR*0.96); head.add(pR);
  const browMat = matB(0x888888);
  const must = new THREE.Mesh(geoBox(HR*0.85, HR*0.16, HR*0.10, 1), browMat); must.position.set(0, -HR*0.30, HR*0.94); head.add(must);
  const beard = new THREE.Mesh(geoRoundBox(HR*0.70, HR*0.32, HR*0.15, HR*0.12), browMat); beard.position.set(0, -HR*0.72, HR*0.85); head.add(beard);
  const woundHead = new THREE.Mesh(geoBox(HR*0.45, HR*0.22, HR*0.10, 1), wound); woundHead.position.set(-HR*0.35, HR*0.62, HR*0.80); head.add(woundHead);
}

function buildJudgeOutfit(spineUpper) {
  const tie = new THREE.Mesh(geoBox(0.025, 0.16, 0.008, 1), matL(0xCC1111)); tie.position.set(0, 0.04, 0.112); spineUpper.add(tie);
}

function pickFromPalette(palette, fallback) {
  if (!palette || palette.length === 0) return fallback;
  return palette[Math.floor(Math.random() * palette.length)];
}

// ============================================================
// FALLBACK PROCEDURAL
// ============================================================
function proceduralFallback(opts = {}) {
  const typeKey = opts.type || 'pt';
  const type = (window.ZOMBIE_TYPES_FROM_MODULE || {})[typeKey]
    || { scale: 1, variant: 'normal' };
  const variant = type.variant || 'normal';
  const scale   = type.scale   || 1;

  const root = new THREE.Group();

  const skinColor  = opts.skin !== undefined
    ? opts.skin
    : pickFromPalette(type.skinPalette, 0x7BC950);
  const shirtColor = pickFromPalette(type.shirtPalette, 0xCC1111);
  const pantsColor = pickFromPalette(type.pantsPalette, 0x8B5A2B);
  const hairColor  = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];

  const skinMat  = matL(skinColor);
  const shirtMat = matL(shirtColor);
  const pantsMat = matL(pantsColor);
  const hairMat  = matL(hairColor);
  const shoeMat  = matL(0x1A1A1A);
  const wound    = MAT_WOUND;

  const pelvis = new THREE.Group();
  pelvis.position.y = P_PELVIS_Y;
  root.add(pelvis);

  const spineLower = new THREE.Group();
  spineLower.position.y = P_SPINE_LOW_OFF;
  pelvis.add(spineLower);

  const torsoMesh = new THREE.Mesh(geoRoundBox(0.42, 0.42, 0.24, 0.05), shirtMat);
  torsoMesh.position.y = 0.10;
  torsoMesh.castShadow = true;
  spineLower.add(torsoMesh);

  const spineUpper = new THREE.Group();
  spineUpper.position.y = P_SPINE_UP_OFF;
  spineLower.add(spineUpper);

  const chestMesh = new THREE.Mesh(geoRoundBox(0.44, 0.32, 0.26, 0.05), shirtMat);
  chestMesh.position.y = 0.08;
  chestMesh.castShadow = true;
  spineUpper.add(chestMesh);

  const neck = new THREE.Group();
  neck.position.y = 0.22;
  spineUpper.add(neck);

  const head = new THREE.Group();
  neck.add(head);

  const HR = 0.13;
  if (variant === 'donkey') {
    buildDonkeyHead(head, skinMat, wound, HR);
  } else if (variant === 'judge') {
    buildJudgeHead(head, skinMat, wound, HR);
    buildJudgeOutfit(spineUpper);
  } else {
    buildHumanHead(head, skinMat, hairMat, wound, HR, {
      headgear: type.headgear || null,
    });
  }

  const shoulderL = new THREE.Group();
  shoulderL.position.set(-0.24, P_SHOULDER_Y, 0);
  spineUpper.add(shoulderL);

  const upperArmL = new THREE.Mesh(geoRoundBox(0.10, 0.24, 0.10, 0.03), shirtMat);
  upperArmL.position.y = -0.12;
  upperArmL.castShadow = true;
  shoulderL.add(upperArmL);

  const elbowL = new THREE.Group();
  elbowL.position.y = -0.22;
  shoulderL.add(elbowL);

  const foreArmL = new THREE.Mesh(geoRoundBox(0.09, 0.22, 0.09, 0.03), skinMat);
  foreArmL.position.y = -0.11;
  foreArmL.castShadow = true;
  elbowL.add(foreArmL);

  const shoulderR = new THREE.Group();
  shoulderR.position.set(0.24, P_SHOULDER_Y, 0);
  spineUpper.add(shoulderR);

  const upperArmR = new THREE.Mesh(geoRoundBox(0.10, 0.24, 0.10, 0.03), shirtMat);
  upperArmR.position.y = -0.12;
  upperArmR.castShadow = true;
  shoulderR.add(upperArmR);

  const elbowR = new THREE.Group();
  elbowR.position.y = -0.22;
  shoulderR.add(elbowR);

  const foreArmR = new THREE.Mesh(geoRoundBox(0.09, 0.22, 0.09, 0.03), skinMat);
  foreArmR.position.y = -0.11;
  foreArmR.castShadow = true;
  elbowR.add(foreArmR);

  const thighL = new THREE.Group();
  thighL.position.set(-0.11, 0, 0);
  pelvis.add(thighL);

  const thighMeshL = new THREE.Mesh(geoRoundBox(0.13, 0.34, 0.13, 0.04), pantsMat);
  thighMeshL.position.y = -0.17;
  thighMeshL.castShadow = true;
  thighL.add(thighMeshL);

  const kneeL = new THREE.Group();
  kneeL.position.y = -0.34;
  thighL.add(kneeL);

  const shinL = new THREE.Mesh(geoRoundBox(0.12, 0.32, 0.12, 0.04), pantsMat);
  shinL.position.y = -0.16;
  shinL.castShadow = true;
  kneeL.add(shinL);

  const footL = new THREE.Group();
  footL.position.y = -0.32;
  kneeL.add(footL);

  const footMeshL = new THREE.Mesh(geoRoundBox(0.13, 0.09, 0.20, 0.03), shoeMat);
  footMeshL.position.set(0, -0.045, 0.05);
  footMeshL.castShadow = true;
  footL.add(footMeshL);

  const thighR = new THREE.Group();
  thighR.position.set(0.11, 0, 0);
  pelvis.add(thighR);

  const thighMeshR = new THREE.Mesh(geoRoundBox(0.13, 0.34, 0.13, 0.04), pantsMat);
  thighMeshR.position.y = -0.17;
  thighMeshR.castShadow = true;
  thighR.add(thighMeshR);

  const kneeR = new THREE.Group();
  kneeR.position.y = -0.34;
  thighR.add(kneeR);

  const shinR = new THREE.Mesh(geoRoundBox(0.12, 0.32, 0.12, 0.04), pantsMat);
  shinR.position.y = -0.16;
  shinR.castShadow = true;
  kneeR.add(shinR);

  const footR = new THREE.Group();
  footR.position.y = -0.32;
  kneeR.add(footR);

  const footMeshR = new THREE.Mesh(geoRoundBox(0.13, 0.09, 0.20, 0.03), shoeMat);
  footMeshR.position.set(0, -0.045, 0.05);
  footMeshR.castShadow = true;
  footR.add(footMeshR);

  const joints = {
    pelvis, spineLower, spineUpper, neck, head,
    shoulderL, elbowL, shoulderR, elbowR,
    thighL, kneeL, footL, thighR, kneeR, footR,
  };

  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const _fb = new THREE.Box3().setFromObject(root);
  const feetOffset = _fb.min.y;
  if (Math.abs(feetOffset) > 0.001) {
    for (const child of root.children) {
      child.position.y -= feetOffset;
    }
  }

  const localBoxes = {
    head:  new THREE.Box3(
      new THREE.Vector3(-0.16, -0.20, -0.16),
      new THREE.Vector3( 0.16,  0.22,  0.18)
    ),
    torso: new THREE.Box3(
      new THREE.Vector3(-0.24, -0.15, -0.15),
      new THREE.Vector3( 0.24,  0.36,  0.15)
    ),
    armL:  new THREE.Box3(
      new THREE.Vector3(-0.07, -0.46, -0.08),
      new THREE.Vector3( 0.07,  0.03,  0.08)
    ),
    armR:  new THREE.Box3(
      new THREE.Vector3(-0.07, -0.46, -0.08),
      new THREE.Vector3( 0.07,  0.03,  0.08)
    ),
    legL:  new THREE.Box3(
      new THREE.Vector3(-0.09, -0.74, -0.12),
      new THREE.Vector3( 0.09,  0.05,  0.14)
    ),
    legR:  new THREE.Box3(
      new THREE.Vector3(-0.09, -0.74, -0.12),
      new THREE.Vector3( 0.09,  0.05,  0.14)
    ),
  };

  const headLoll      = (Math.random() - 0.5) * 0.4;
  const headPitchBase = (Math.random() - 0.5) * 0.3;
  const armDroopL     = -0.10 - Math.random() * 0.30;
  const armDroopR     = -0.10 - Math.random() * 0.30;
  const limpAmount    = Math.random();
  const limpSide      = Math.random() < 0.5 ? -1 : 1;
  const walkStyle     = Math.random();

  root.userData = {
    isXBot: false,
    head,
    torso:  spineLower,
    armL:   shoulderL,
    armR:   shoulderR,
    legL:   thighL,
    legR:   thighR,
    joints,
    localBoxes,
    skinColor,
    variant,
    heightScale: scale,
    zombieType: typeKey,
    typeKey,
    type,
    headLoll,
    headPitchBase,
    armDroopL,
    armDroopR,
    limpAmount,
    limpSide,
    walkStyle,
  };

  return root;
}

// ============================================================
// CREATE ZOMBIE MESH
// ============================================================
function createZombieMesh(opts = {}) {
  const typeKey = opts.type || 'pt';
  const type = (window.ZOMBIE_TYPES_FROM_MODULE || {})[typeKey]
    || { scale: 1, variant: 'normal' };

  if (isModelReady()) {
    const inst = createZombieInstance();

    const jointsValid = inst && inst.joints
      && inst.joints.head && inst.joints.pelvis
      && inst.joints.spineLower && inst.joints.spineUpper;

    if (jointsValid) {
      const skinPal = (type.skinPalette && type.skinPalette.length > 0)
        ? type.skinPalette
        : [0x7BC950, 0x6BB840, 0x8DD65A, 0x5DAE3F, 0x9DE06B];
      const skinColor = opts.skin !== undefined
        ? opts.skin
        : skinPal[Math.floor(Math.random() * skinPal.length)];

      tintZombie(inst, skinColor);

      inst.scene.userData = {
        isXBot: true,
        instance: inst,
        joints: inst.joints,
        head:  inst.joints.head,
        armL:  inst.joints.shoulderL,
        armR:  inst.joints.shoulderR,
        legL:  inst.joints.thighL,
        legR:  inst.joints.thighR,
        torso: inst.joints.spineLower,
        skinColor,
        variant: type.variant || 'normal',
        heightScale: inst.scale,
        zombieType: typeKey,
        typeKey, type,
        localBoxes: null,
        headLoll:      (Math.random() - 0.5) * 0.4,
        headPitchBase: (Math.random() - 0.5) * 0.3,
        armDroopL:     -0.10 - Math.random() * 0.30,
        armDroopR:     -0.10 - Math.random() * 0.30,
        limpAmount:    Math.random(),
        limpSide:      Math.random() < 0.5 ? -1 : 1,
        walkStyle:     Math.random(),
      };

      return inst.scene;
    } else {
      console.warn('[game] ⚠️ XBot sem joints válidos — usando procedural');
    }
  }

  return proceduralFallback(opts);
}

// ============================================================
// SMOOTHING
// ============================================================
function smoothstep(x) {
  if (x < 0) x = 0; else if (x > 1) x = 1;
  return x * x * (3 - 2 * x);
}
function smoothDamp(current, target, speed, dt) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

function makeAnimState() {
  return {
    pelvisRoll:0, pelvisTwist:0, pelvisBob:0,
    spineTwist:0, spineLean:0.10, spineRoll:0, spineSide:0,
    headTwist:0, headRoll:0, headPitch:0,
    headTwistLag:0, headPitchLag:0, headRollLag:0,
    armLX:0, armRX:0, elbowLX:0, elbowRX:0,
    thighLX:0, thighRX:0, kneeLX:0, kneeRX:0, footLX:0, footRX:0,
    pelvisRollVel:0, pelvisTwistVel:0, pelvisBobVel:0,
    spineTwistVel:0, spineLeanVel:0, spineRollVel:0, spineSideVel:0,
    headTwistVel:0, headRollVel:0, headPitchVel:0,
    armLXVel:0, armRXVel:0, elbowLXVel:0, elbowRXVel:0,
    thighLXVel:0, thighRXVel:0, kneeLXVel:0, kneeRXVel:0, footLXVel:0, footRXVel:0,
    bankX:0, bankZ:0, bankXVel:0, bankZVel:0,
    bodyAccelX:0, bodyAccelZ:0,
    walkPhaseSmooth:0, cadenceSmooth:0,
    attackPhase:0, attackPhaseT:0,
    plantPhaseL:0, plantPhaseR:0,
    alertBlend:0, idleBlend:0,
    crawlBlend:0, crawlPhase:0,
    lookAtYaw:0, lookAtPitch:0,
    footCorrectionL:0, footCorrectionR:0,
    leanX:0, leanXVel:0,
  };
}

function applyLookAt(z, joints, player, dt, alerted) {
  const anim = z.anim;
  const cfg = CONFIG.ik;
  if (!alerted) {
    anim.lookAtYaw = smoothDamp(anim.lookAtYaw, 0, 3, dt);
    return;
  }
  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  const targetYaw = Math.atan2(dx, dz);
  let rel = targetYaw - z.mesh.rotation.y;
  while (rel > Math.PI) rel -= Math.PI*2;
  while (rel < -Math.PI) rel += Math.PI*2;
  const limited = Math.max(-cfg.lookAtMaxYaw, Math.min(cfg.lookAtMaxYaw, rel));
  const blend = Math.min(1, dt * 5);
  anim.lookAtYaw += (limited - anim.lookAtYaw) * blend;
  joints.head.rotation.y += anim.lookAtYaw * cfg.lookAtHeadShare;
}

function applyFootIK(z, joints, anim, dt) {
  const cfg = CONFIG.ik;
  const minY = cfg.footMinY;
  const footLY = joints.footL.position.y;
  const targetL = footLY < minY ? minY - footLY : 0;
  anim.footCorrectionL = smoothDamp(anim.footCorrectionL, targetL, 12, dt);
  joints.footL.position.y += anim.footCorrectionL;
  const footRY = joints.footR.position.y;
  const targetR = footRY < minY ? minY - footRY : 0;
  anim.footCorrectionR = smoothDamp(anim.footCorrectionR, targetR, 12, dt);
  joints.footR.position.y += anim.footCorrectionR;
}

function applyBodyLean(z, joints, player, dt, alerted) {
  const anim = z.anim;
  const cfg = CONFIG.ik;
  if (!alerted || z.dying) {
    anim.leanX = smoothDamp(anim.leanX, 0, 4, dt);
    return;
  }
  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > cfg.leanTowardPlayerDist) {
    anim.leanX = smoothDamp(anim.leanX, 0, 4, dt);
    return;
  }
  const proximity = 1 - (dist / cfg.leanTowardPlayerDist);
  const target = cfg.leanAmount * proximity;
  anim.leanX = smoothDamp(anim.leanX, target, 5, dt);
  joints.spineLower.rotation.x += anim.leanX * 0.5;
  joints.spineUpper.rotation.x += anim.leanX * 0.5;
}

function spawnZombie(forceType) {
  const cave = caves[Math.floor(Math.random() * caves.length)];
  const toCX = -cave.x, toCZ = -cave.z;
  const len = Math.sqrt(toCX*toCX + toCZ*toCZ) || 1;
  const dirX = toCX/len, dirZ = toCZ/len;
  const back = 0.8 + Math.random()*0.8;
  const side = (Math.random()-0.5) * 1.6;
  const spawnX = cave.x + dirX*back + (-dirZ)*side;
  const spawnZ = cave.z + dirZ*back + dirX*side;

  const typeKey = forceType || pickZombieType(state.wave);
  const type = window.ZOMBIE_TYPES_FROM_MODULE ? window.ZOMBIE_TYPES_FROM_MODULE[typeKey] : { hpMul:1, dmgMul:1, speedMul:1, xpMul:1, coinMul:1, scale:1, attackRange:1.6, cooldown:1.2 };
  const mesh = createZombieMesh({ type: typeKey });
  mesh.position.set(spawnX, 0, spawnZ);

  if (type.scale && type.scale !== 1) {
    mesh.scale.multiplyScalar(type.scale);
    mesh.updateMatrixWorld(true);
    const _b = new THREE.Box3().setFromObject(mesh);
    mesh.position.y = -_b.min.y;
  }

  scene.add(mesh);

  const hpScale = 1 + CONFIG.scaling.hpPerWave * Math.max(0, state.wave - 1);
  const dmgScale = 1 + CONFIG.scaling.dmgPerWave * Math.max(0, state.wave - 1);
  const spdScale = Math.min(CONFIG.scaling.speedCap, 1 + CONFIG.scaling.speedPerWave * Math.max(0, state.wave - 1));

  const baseHP = CONFIG.zombie.maxHealth * type.hpMul * hpScale;
  const baseDamage = CONFIG.zombie.damage * type.dmgMul * dmgScale;

  const z = {
    id:nextId('z'), mesh,
    health:baseHP, maxHealth:baseHP, damage:baseDamage,
    speed:CONFIG.zombie.speed * type.speedMul * spdScale,
    scale:type.scale, radius:CONFIG.zombie.radius * type.scale,
    attackRange:type.attackRange, attackCooldown:type.cooldown,
    xpReward:Math.round(CONFIG.zombie.xpReward * type.xpMul * (1 + (state.wave - 1) * 0.06)),
    coinReward:Math.round(CONFIG.zombie.coinReward * type.coinMul * (1 + (state.wave - 1) * 0.05)),
    isBoss:!!type.boss, typeKey, type, tier:type.tier,
    lastAttackTime:0, walkPhase:Math.random()*Math.PI*2,
    hitReactEndTime:0, hitDirection:new THREE.Vector3(),
    dismembered:{ head:false, armL:false, armR:false, legL:false, legR:false },
    emergeTime:0, anim:makeAnimState(),
    headLoll:mesh.userData.headLoll,
    headPitchBase:mesh.userData.headPitchBase,
    armDroopL:mesh.userData.armDroopL,
    armDroopR:mesh.userData.armDroopR,
    limpAmount:mesh.userData.limpAmount,
    limpSide:mesh.userData.limpSide,
    walkStyle:mesh.userData.walkStyle,
    vx:0, vz:0, yawVel:0,
    alertedUntil:0, dying:false,
    idlePhase:Math.random()*Math.PI*2,
    attackWindupActive:false, attackWindupEnd:0,
    _prevX:spawnX, _prevZ:spawnZ,
    flinch:{ head:null, armL:null, armR:null, legL:null, legR:null, torso:null },
    teleportCd:0, summonCd:0,
    crawling:false,
    growlCooldown: 3 + Math.random() * 2,
    aggroSoundCooldown: 0,
    _wasAlerted: false,
    _forceGroan: false,
    _groundTime: 0,
  };

  if (mesh.userData.isXBot) {
    z.instance = mesh.userData.instance;
    setupZombieAnimator(z);
  }

  zombies.push(z);
  initStuckState(z);
  ZombieAI.initZombieAIState(z);
  if (z.isBoss) {
    BossAI.initBoss(z, typeKey);
  }
  state.zombiesAlive++;
  bus.emit(Ev.ZOMBIE_SPAWNED, { id:z.id, type:typeKey, tier:type.tier, isBoss:z.isBoss, pos:{ x:mesh.position.x, y:0, z:mesh.position.z } });
  updateHUD();
}

// ============================================================
// BLOOD
// ============================================================
const bloodGeoShared = new THREE.BoxGeometry(1, 1, 1);
const bloodPool = [], bloodActive = [];
function acquireBloodParticle() {
  let p = bloodPool.pop();
  if (!p) p = { mesh:new THREE.Mesh(bloodGeoShared, new THREE.MeshBasicMaterial({ transparent:true })), vel:new THREE.Vector3(), life:0, maxLife:0 };
  return p;
}
function spawnBlood(position, direction = null, count = 16, big = false) {
  count = Math.max(4, Math.floor(count * 0.6));
  for (let i = 0; i < count; i++) {
    const p = acquireBloodParticle();
    const size = (big ? 0.16 : 0.09) + Math.random()*0.12;
    p.mesh.scale.setScalar(size);
    p.mesh.position.copy(position);
    p.mesh.material.color.setHex(Math.random() > 0.4 ? 0xC0392B : 0x8B0000);
    p.mesh.material.opacity = 1;
    if (direction) {
      const dirN = direction.clone().normalize();
      const perp1 = new THREE.Vector3(-dirN.z, 0, dirN.x).normalize();
      const perp2 = new THREE.Vector3().crossVectors(dirN, perp1).normalize();
      const a = (Math.random()-0.5)*1.8, b = (Math.random()-0.5)*1.8;
      const speed = (big ? 9 : 5) + Math.random()*6;
      p.vel.copy(dirN).multiplyScalar(speed);
      p.vel.addScaledVector(perp1, a*speed*0.5);
      p.vel.addScaledVector(perp2, b*speed*0.5);
      p.vel.y += 3 + Math.random()*4;
    } else p.vel.set((Math.random()-0.5)*8, Math.random()*5+3, (Math.random()-0.5)*8);
    p.life = 1.2; p.maxLife = 1.2;
    scene.add(p.mesh);
    bloodActive.push(p);
  }
}
function updateParticles(dt) {
  for (let i = bloodActive.length - 1; i >= 0; i--) {
    const p = bloodActive[i];
    p.vel.y -= 16*dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.vel.y = -p.vel.y*0.3; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    p.life -= dt;
    p.mesh.material.opacity = Math.max(0, p.life/p.maxLife);
    if (p.life <= 0) { scene.remove(p.mesh); bloodPool.push(p); bloodActive.splice(i, 1); }
  }
}
const bloodPools = [];
function spawnBloodPool(position) {
  const size = 0.7 + Math.random()*0.5;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(size, 8), new THREE.MeshBasicMaterial({ color:0x6B0000, transparent:true, opacity:0.75, depthWrite:false }));
  pool.rotation.x = -Math.PI/2; pool.rotation.z = Math.random()*Math.PI*2;
  pool.position.set(position.x, 0.03, position.z); pool.renderOrder = 1;
  scene.add(pool);
  bloodPools.push({ mesh:pool, life:20 });
  if (bloodPools.length > 10) { const old = bloodPools.shift(); scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose(); }
}
function updateBloodPools(dt) {
  for (let i = bloodPools.length - 1; i >= 0; i--) {
    const b = bloodPools[i]; b.life -= dt;
    if (b.life < 3) b.mesh.material.opacity = Math.max(0, (b.life/3)*0.75);
    if (b.life <= 0) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bloodPools.splice(i, 1); }
  }
}

const bloodFountains = [];
function spawnBloodFountain(position, duration = 2.5) {
  bloodFountains.push({ x: position.x, y: position.y, z: position.z, life: duration, maxLife: duration, tick: 0 });
}
function updateBloodFountains(dt) {
  for (let i = bloodFountains.length - 1; i >= 0; i--) {
    const f = bloodFountains[i];
    f.life -= dt;
    f.tick += dt;
    while (f.tick > 0.05) {
      f.tick -= 0.05;
      const p = acquireBloodParticle();
      const size = 0.08 + Math.random() * 0.06;
      p.mesh.scale.setScalar(size);
      p.mesh.position.set(f.x, f.y, f.z);
      p.mesh.material.color.setHex(0x6B0000);
      p.mesh.material.opacity = 1;
      p.vel.set((Math.random() - 0.5) * 0.4, -0.5 - Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
      p.life = 0.6; p.maxLife = 0.6;
      scene.add(p.mesh);
      bloodActive.push(p);
    }
    if (f.life <= 0) bloodFountains.splice(i, 1);
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
    this.isGLB = false;
    this.lastHitZombie = new Map(); this.lastGlobalHit = 0;
  }
  applyImpulse(imp) { this.velocity.addScaledVector(imp, 1/this.mass); }
  applyTorque(t) { this.angularVelocity.addScaledVector(t, 1/this.mass); }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return true;
    if (!this.settled) {
      this.velocity.y -= 22*dt;
      this.velocity.multiplyScalar(0.995);
      this.angularVelocity.multiplyScalar(0.99);
      this.mesh.position.addScaledVector(this.velocity, dt);
      this.mesh.rotation.x += this.angularVelocity.x*dt;
      this.mesh.rotation.y += this.angularVelocity.y*dt;
      this.mesh.rotation.z += this.angularVelocity.z*dt;
      const minDim = Math.min(this.size.x, this.size.y, this.size.z);
      const gY = minDim*0.5;
      if (this.mesh.position.y <= gY) {
        this.mesh.position.y = gY;
        if (this.velocity.y < 0) this.velocity.y = -this.velocity.y*0.3;
        this.velocity.x *= 0.65; this.velocity.z *= 0.65;
        this.angularVelocity.multiplyScalar(0.7);
        const sSq = this.velocity.lengthSq(), aSq = this.angularVelocity.lengthSq();
        if (sSq < 0.12 && aSq < 0.35) {
          this.settleTimer += dt;
          if (this.settleTimer > 0.4) {
            this.settled = true;
            this.velocity.set(0,0,0);
            this.angularVelocity.set(0,0,0);
            if (this.lastHitZombie && this.lastHitZombie.size > 0) this.lastHitZombie.clear();
          }
        } else this.settleTimer = 0;
      }
    }
    return false;
  }
  dispose() { scene.remove(this.mesh); }
}

// ============================================================
// RAGDOLL
// ============================================================
const ragdolls = [];
const _wpTmp = new THREE.Vector3();
const _wqTmp = new THREE.Quaternion();
const flyingLimbs = [];
function startRagdoll(mesh, hitDir, hitStrength, missingParts) {
  if (ragdolls.length >= CONFIG.ragdoll.maxActive) {
    const oldest = ragdolls.shift();
    oldest.dispose();
  }
  const r = new PhysicsRagdoll(mesh, hitDir, hitStrength, missingParts);
  r.onFadeStart = (pos) => spawnBloodPool(pos);
  ragdolls.push(r);
}

function detachLimb(z, key, hitDir, hitPoint) {
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
  z.dismembered[key] = true;

  const parent = limbObj.parent;
  const stumpR = key === 'head' ? 0.065 : (key === 'armL' || key === 'armR') ? 0.055 : 0.075;
  const stumpMat = zMat(0x5A0000);
  const stump = new THREE.Mesh(geoSphere(stumpR, 8), stumpMat);
  stump.position.copy(limbObj.position);
  stump.scale.set(1, 0.8, 1);
  parent.add(stump);

  let gibModel = null;
  let gibSource = 'procedural';
  if (hasLimb(key)) {
    gibModel = createLimb(key);
    gibSource = 'glb';
  }
  if (!gibModel) {
    gibModel = createGib(key);
  }

  if (gibModel) {
    if (z.mesh.userData.isXBot) {
      z.dismembered[key] = true;
      const joint = key === 'head' ? ud.joints.head
                  : key === 'armL' ? ud.joints.shoulderL
                  : key === 'armR' ? ud.joints.shoulderR
                  : key === 'legL' ? ud.joints.thighL
                  : key === 'legR' ? ud.joints.thighR
                  : null;
      if (joint) joint.scale.setScalar(0.01);

      let gibModelX = hasLimb(key) ? createLimb(key) : createGib(key);
      if (gibModelX) {
        const wrapper = new THREE.Group();
        wrapper.position.copy(_wpTmp);
        wrapper.quaternion.copy(_wqTmp);
        scene.add(wrapper);
        wrapper.add(gibModelX);
        const size = gibModelX.userData.size || new THREE.Vector3(0.3, 0.3, 0.3);
        const piece = new Debris(wrapper, size, 1.2, CONFIG.dismember.limbLife);
        piece.key = key;
        piece.velocity.set(hitDir.x*16, 8+Math.random()*4, hitDir.z*16);
        piece.angularVelocity.set((Math.random()-0.5)*35, (Math.random()-0.5)*35, (Math.random()-0.5)*35);
        flyingLimbs.push(piece);
      }

      spawnBlood(_wpTmp, hitDir, 30, true);
      bus.emit(Ev.DISMEMBER, { zombieId:z.id, part:key, pos:{ x:_wpTmp.x, y:_wpTmp.y, z:_wpTmp.z } });
      return;
    }
    limbObj.visible = false;
    const wrapper = new THREE.Group();
    wrapper.position.copy(_wpTmp);
    wrapper.quaternion.copy(_wqTmp);
    scene.add(wrapper);
    wrapper.add(gibModel);
    const size = gibModel.userData.size || new THREE.Vector3(0.3, 0.3, 0.3);
    const piece = new Debris(wrapper, size, 1.2, CONFIG.dismember.limbLife);
    piece.key = key;
    piece.isGLB = true;
    const dir = hitDir.clone().normalize();
    const speed = CONFIG.dismember.limbSpeed;
    piece.velocity.set(dir.x*speed + (Math.random()-0.5)*6, speed*0.8 + Math.random()*5, dir.z*speed + (Math.random()-0.5)*6);
    piece.angularVelocity.set((Math.random()-0.5)*35, (Math.random()-0.5)*35, (Math.random()-0.5)*35);
    flyingLimbs.push(piece);
    if (hitPoint) spawnBlood(hitPoint, dir, gibSource === 'glb' ? 30 : 20, true);
    else spawnBlood(_wpTmp, dir, gibSource === 'glb' ? 30 : 20, true);
    bus.emit(Ev.DISMEMBER, { zombieId:z.id, part:key, pos:{ x:_wpTmp.x, y:_wpTmp.y, z:_wpTmp.z } });
    return;
  }

  limbObj.rotation.set(0, 0, 0);
  if (limbObj.parent) limbObj.parent.remove(limbObj);
  scene.add(limbObj);
  limbObj.position.copy(_wpTmp);
  limbObj.quaternion.copy(_wqTmp);
  limbObj.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(limbObj);
  if (box.isEmpty()) { limbObj.visible = false; return; }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.position.copy(center);
  scene.add(wrapper);
  limbObj.position.sub(center);
  wrapper.add(limbObj);

  const piece = new Debris(wrapper, size, 1.2, CONFIG.dismember.limbLife);
  piece.key = key;
  const dir = hitDir.clone().normalize();
  const speed = CONFIG.dismember.limbSpeed;
  piece.velocity.set(dir.x*speed + (Math.random()-0.5)*6, speed*0.8 + Math.random()*5, dir.z*speed + (Math.random()-0.5)*6);
  piece.angularVelocity.set((Math.random()-0.5)*35, (Math.random()-0.5)*35, (Math.random()-0.5)*35);
  flyingLimbs.push(piece);
  if (hitPoint) spawnBlood(hitPoint, dir, 20, true);
  else spawnBlood(_wpTmp, dir, 20, true);
  bus.emit(Ev.DISMEMBER, { zombieId:z.id, part:key, pos:{ x:_wpTmp.x, y:_wpTmp.y, z:_wpTmp.z } });
}

function randomDismemberOnDeath(_z) { /* no-op */ }

const debrisGrid = new SpatialGrid(4);
const zCollGrid = new SpatialGrid(2);
const _allPiecesScratch = [];
const _debrisDir = new THREE.Vector3();

function checkDebrisZombieCollision() {
  const now = performance.now()/1000;
  debrisGrid.clear();
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    debrisGrid.insert(z, z.mesh.position.x, z.mesh.position.z);
  }
  const allPieces = _allPiecesScratch;
  allPieces.length = 0;
  for (let fl = 0; fl < flyingLimbs.length; fl++) allPieces.push(flyingLimbs[fl]);
  for (let ri = 0; ri < ragdolls.length; ri++) {
    const r = ragdolls[ri];
    if (r.state === 'fading') continue;
    for (let pi = 0; pi < r.pieces.length; pi++) allPieces.push(r.pieces[pi]);
  }
  for (let pi = 0; pi < allPieces.length; pi++) {
    const piece = allPieces[pi];
    if (piece.settled) continue;
    const y = piece.mesh.position.y;
    if (y < 0.55 || y > 2.1) continue;
    const speed2 = piece.velocity.lengthSq();
    if (speed2 < 36) continue;
    if (now - (piece.lastGlobalHit || 0) < 0.18) continue;
    const near = debrisGrid.query(piece.mesh.position.x, piece.mesh.position.z, 1.8);
    for (let ni = 0; ni < near.length; ni++) {
      const z = near[ni];
      if (z.health <= 0) continue;
      const dx = z.mesh.position.x - piece.mesh.position.x;
      const dz = z.mesh.position.z - piece.mesh.position.z;
      const d2 = dx*dx + dz*dz;
      const minD = 0.6 + z.radius;
      if (d2 >= minD*minD || d2 < 0.001) continue;
      const last = piece.lastHitZombie.get(z.id) || 0;
      if (now - last < 0.5) continue;
      const zTopY = 2.0*z.scale;
      if (y > zTopY) continue;
      const d = Math.sqrt(d2);
      const nx = dx/d, nz = dz/d;
      const velMag = Math.sqrt(speed2);
      const dot = (piece.velocity.x*nx + piece.velocity.z*nz) / velMag;
      if (dot < 0.15) continue;
      piece.lastHitZombie.set(z.id, now); piece.lastGlobalHit = now;
      const force = Math.min(3.0, Math.sqrt(speed2) * Math.min(2, piece.mass || 1) * 0.12);
      _debrisDir.set(nx, 0, nz);
      applyHitReaction(z, 'torso', _debrisDir, force);
      z.hitReactEndTime = now + 0.15 + force*0.18;
      z.hitDirection.copy(_debrisDir);
      const pushZ = force*0.09/Math.max(0.5, z.scale);
      z.mesh.position.x += nx*pushZ; z.mesh.position.z += nz*pushZ;
      z.vx -= nx*pushZ*2; z.vz -= nz*pushZ*2;
      const bounce = Math.min(5, force*2.0);
      piece.velocity.x = -nx*bounce + (Math.random()-0.5)*2.5;
      piece.velocity.z = -nz*bounce + (Math.random()-0.5)*2.5;
      piece.velocity.y = Math.max(1.5, piece.velocity.y*0.5);
      piece.angularVelocity.multiplyScalar(1.8);
      piece.settled = false; piece.settleTimer = 0;
      if (force > 0.9) Sfx.playDebrisImpact();
    }
  }
}

// ============================================================
// RAYCAST PRECISO (OBB)
// ============================================================
function rayAABB(origin, dir, min, max, maxDist) {
  let tMin = 0, tMax = maxDist;
  const axes = [
    { o:origin.x, d:dir.x, mn:min.x, mx:max.x },
    { o:origin.y, d:dir.y, mn:min.y, mx:max.y },
    { o:origin.z, d:dir.z, mn:min.z, mx:max.z },
  ];
  for (const { o, d, mn, mx } of axes) {
    if (Math.abs(d) < 1e-6) { if (o < mn || o > mx) return null; }
    else {
      let t1 = (mn-o)/d, t2 = (mx-o)/d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tMin = Math.max(tMin, t1); tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  if (tMax < 0) return null;
  return tMin >= 0 ? tMin : tMax;
}

const _obbInv = new THREE.Matrix4();
const _obbLocalOrigin = new THREE.Vector3();
const _obbLocalDir = new THREE.Vector3();
const _obbHitLocal = new THREE.Vector3();
const _obbHitWorld = new THREE.Vector3();

function rayOBBPart(origin, dir, localBox, group, maxDist, outPoint) {
  group.updateMatrixWorld(true);
  _obbInv.copy(group.matrixWorld).invert();
  _obbLocalOrigin.copy(origin).applyMatrix4(_obbInv);
  _obbLocalDir.copy(dir).transformDirection(_obbInv);
  const t = rayAABB(_obbLocalOrigin, _obbLocalDir, localBox.min, localBox.max, maxDist);
  if (t === null) return null;
  _obbHitLocal.copy(_obbLocalOrigin).addScaledVector(_obbLocalDir, t);
  _obbHitWorld.copy(_obbHitLocal).applyMatrix4(group.matrixWorld);
  if (outPoint) outPoint.copy(_obbHitWorld);
  return origin.distanceTo(_obbHitWorld);
}

const _partBoxSlots = [];
for (let i = 0; i < 6; i++) _partBoxSlots.push({ key:null, box:null, group:null });

function getZombiePartEntries(z, out) {
  out.length = 0;
  if (z.health <= 0) return out;
  const ud = z.mesh.userData;
  const lb = ud.localBoxes;
  if (!lb) return out;
  let slotIdx = 0;
  function addPart(key, group, enabled) {
    if (!enabled || !group || !lb[key]) return;
    const slot = _partBoxSlots[slotIdx++];
    slot.key = key; slot.box = lb[key]; slot.group = group;
    out.push(slot);
  }
  addPart('head', ud.head, !z.dismembered.head);
  addPart('torso', ud.torso, true);
  addPart('armL', ud.armL, !z.dismembered.armL);
  addPart('armR', ud.armR, !z.dismembered.armR);
  addPart('legL', ud.legL, !z.dismembered.legL);
  addPart('legR', ud.legR, !z.dismembered.legR);
  return out;
}

const _partEntriesCache = [];
function collectRaycastCandidates(origin, forward, maxDist) {
  const out = [];
  const maxDPlusR = maxDist + 1.5;
  const maxSq = maxDPlusR * maxDPlusR;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    const dx = z.mesh.position.x - origin.x;
    const dz = z.mesh.position.z - origin.z;
    const distSq = dx*dx + dz*dz;
    if (distSq > maxSq) continue;
    const dist = Math.sqrt(distSq);
    if (dist > 0.001) {
      const dot = (dx*forward.x + dz*forward.z) / dist;
      if (dot < -0.4) continue;
    }
    out.push(z);
  }
  return out;
}

const _hitPointScratch = new THREE.Vector3();

function raycastZombie(origin, dir, maxDist, candidates) {
  const list = candidates || zombies;
  let bestZ = null, bestDist = Infinity, bestPart = null;
  const bestPoint = new THREE.Vector3();

  for (let i = 0; i < list.length; i++) {
    const z = list[i];
    if (z.health <= 0) continue;

    if (z.mesh.userData.isXBot) {
      const joints = z.mesh.userData.joints;
      if (!joints || !joints.head) continue;
      const parts = [
        { key: 'head', bone: joints.head, radius: 0.16 },
        { key: 'torso', bone: joints.spineUpper, radius: 0.28 },
        { key: 'torso', bone: joints.spineLower, radius: 0.28 },
        { key: 'armL', bone: joints.shoulderL, radius: 0.14 },
        { key: 'armL', bone: joints.elbowL, radius: 0.11 },
        { key: 'armR', bone: joints.shoulderR, radius: 0.14 },
        { key: 'armR', bone: joints.elbowR, radius: 0.11 },
        { key: 'legL', bone: joints.thighL, radius: 0.14 },
        { key: 'legL', bone: joints.kneeL, radius: 0.11 },
        { key: 'legR', bone: joints.thighR, radius: 0.14 },
        { key: 'legR', bone: joints.kneeR, radius: 0.11 },
      ];

      for (const p of parts) {
        if (!p.bone) continue;
        if (z.dismembered[p.key]) continue;

        const bonePos = new THREE.Vector3();
        p.bone.getWorldPosition(bonePos);

        const toBone = bonePos.clone().sub(origin);
        const t = toBone.dot(dir);
        if (t < 0 || t > maxDist) continue;
        const closest = origin.clone().addScaledVector(dir, t);
        const distToLine = closest.distanceTo(bonePos);
        if (distToLine <= p.radius && t < bestDist) {
          bestDist = t;
          bestZ = z;
          bestPart = p.key;
          bestPoint.copy(closest);
        }
      }
    } else {
      const entries = getZombiePartEntries(z, _partEntriesCache);
      for (let b = 0; b < entries.length; b++) {
        const e = entries[b];
        const dist = rayOBBPart(origin, dir, e.box, e.group, maxDist, _hitPointScratch);
        if (dist !== null && dist < bestDist) {
          bestDist = dist; bestZ = z; bestPart = e.key;
          bestPoint.copy(_hitPointScratch);
        }
      }
    }
  }
  return { zombie:bestZ, part:bestPart, distance:bestDist, point:bestPoint };
}

function applyHitReaction(z, part, hitDirWorld, force = 1) {
  const localDir = hitDirWorld.clone();
  const zQuat = z.mesh.quaternion.clone(); zQuat.invert();
  localDir.applyQuaternion(zQuat);
  const s = Math.min(2.0, force);
  const anim = z.anim;
  const now = performance.now()/1000;
  if (part === 'head') {
    z.flinch.head = { until:now+0.6, dirX:localDir.x, dirZ:localDir.z, strength:s };
    springKick(anim, 'headTwistVel', localDir.x*s*16);
    springKick(anim, 'headRollVel', -localDir.x*s*14);
    springKick(anim, 'headPitchVel', localDir.z*s*18);
  } else if (part === 'torso') {
    z.flinch.torso = { until:now+0.5, dirX:localDir.x, dirZ:localDir.z, strength:s };
    springKick(anim, 'spineLeanVel', localDir.z*s*10);
    springKick(anim, 'spineTwistVel', localDir.x*s*9);
    springKick(anim, 'spineRollVel', -localDir.x*s*8);
    springKick(anim, 'spineSideVel', localDir.x*s*7);
    springKick(anim, 'headTwistVel', -localDir.x*s*5);
    springKick(anim, 'headPitchVel', localDir.z*s*7);
  } else if (part === 'armL') {
    z.flinch.armL = { until:now+0.55, dirX:localDir.x, dirZ:localDir.z, strength:s };
    springKick(anim, 'armLXVel', -s*18);
    springKick(anim, 'elbowLXVel', s*22);
  } else if (part === 'armR') {
    z.flinch.armR = { until:now+0.55, dirX:localDir.x, dirZ:localDir.z, strength:s };
    springKick(anim, 'armRXVel', -s*18);
    springKick(anim, 'elbowRXVel', s*22);
  } else if (part === 'legL') {
    z.flinch.legL = { until:now+0.75, dirX:localDir.x, dirZ:localDir.z, strength:s };
    springKick(anim, 'thighLXVel', -s*14);
    springKick(anim, 'kneeLXVel', s*24);
  } else if (part === 'legR') {
    z.flinch.legR = { until:now+0.75, dirX:localDir.x, dirZ:localDir.z, strength:s };
    springKick(anim, 'thighRXVel', -s*14);
    springKick(anim, 'kneeRXVel', s*24);
  }
}

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

const explosionLight = new THREE.PointLight(0xFF6600, 0, 14, 2);
scene.add(explosionLight);
let explosionLightEnd = 0;

function spawnMuzzleFlash() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  muzzleLight.position.copy(camera.position).addScaledVector(dir, 1.4);
  muzzleLightEnd = performance.now()/1000 + 0.08; muzzleLight.intensity = 3;
}
const tracerPool = [], tracers = [];
function spawnTracer(from, to) {
  let t = tracerPool.pop();
  if (!t) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color:0xFFDD33, transparent:true, opacity:0.9 });
    t = { mesh:new THREE.Line(geo, mat), life:0 }; scene.add(t.mesh);
  }
  const arr = t.mesh.geometry.attributes.position.array;
  arr[0]=from.x; arr[1]=from.y; arr[2]=from.z;
  arr[3]=to.x; arr[4]=to.y; arr[5]=to.z;
  t.mesh.geometry.attributes.position.needsUpdate = true;
  t.mesh.visible = true; t.mesh.material.opacity = 0.9; t.life = 0.08;
  tracers.push(t);
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt;
    t.mesh.material.opacity = Math.max(0, t.life/0.08);
    if (t.life <= 0) { t.mesh.visible = false; tracerPool.push(t); tracers.splice(i, 1); }
  }
}
const explosions = [];
function reactToExplosion(pos, radius) {
  const now = performance.now()/1000;
  const r2 = radius*radius;
  for (const z of zombies) {
    if (z.health <= 0) continue;
    const dx = z.mesh.position.x - pos.x;
    const dz = z.mesh.position.z - pos.z;
    const d2 = dx*dx + dz*dz;
    if (d2 > r2) continue;
    const d = Math.sqrt(Math.max(d2, 0.01));
    const nx = dx/d, nz = dz/d;
    const strength = 1 - Math.min(1, d/radius);
    const s = 0.6 + strength*1.6;
    z.flinch.torso = { until:now+0.6, dirX:-nx, dirZ:-nz, strength:s };
    z.flinch.head = { until:now+0.5, dirX:nx, dirZ:nz, strength:s };
    springKick(z.anim, 'spineLeanVel', -s*8);
    springKick(z.anim, 'spineRollVel', nx*s*6);
    springKick(z.anim, 'spineTwistVel', nz*s*5);
    springKick(z.anim, 'headPitchVel', -s*10);
    springKick(z.anim, 'headTwistVel', nx*s*8);
    z.alertedUntil = now + CONFIG.aggro.alertDuration;
  }
}
function spawnExplosion(pos) {
  explosionLight.position.copy(pos); explosionLight.position.y += 1;
  explosionLight.intensity = 6;
  explosionLightEnd = performance.now()/1000 + 0.35;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color:0xFFAA33, transparent:true, opacity:1 }));
  sphere.position.copy(pos); sphere.position.y += 0.5; scene.add(sphere);
  spawnBlood(pos, null, 20, true);
  addShake(CONFIG.shake.explosion);
  const radius = CONFIG.launcher.explosionRadius;
  reactToExplosion(pos, radius*1.5);
  const baseDamage = WEAPONS.launcher.damage * state.damageMult;
  const snapshot = [...zombies];
  for (const z of snapshot) {
    const dx = z.mesh.position.x - pos.x, dz = z.mesh.position.z - pos.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    if (d > radius) continue;
    const falloff = 1 - Math.min(1, d/radius);
    const dmg = baseDamage * Math.max(0.25, falloff);
    const dir = new THREE.Vector3(dx/Math.max(d,0.01), 0, dz/Math.max(d,0.01));
    const nearFactor = 1 - Math.min(1, d / (radius * 0.7));
    if (nearFactor > 0.4) {
      const candidates = [];
      if (!z.dismembered.head && nearFactor > 0.8) candidates.push('head');
      if (!z.dismembered.armL) candidates.push('armL');
      if (!z.dismembered.armR) candidates.push('armR');
      if (!z.dismembered.legL) candidates.push('legL');
      if (!z.dismembered.legR) candidates.push('legR');
      const maxLose = nearFactor > 0.8 ? 2 : 1;
      for (let k = 0; k < maxLose && candidates.length > 0; k++) {
        const idx = Math.floor(Math.random() * candidates.length);
        const limb = candidates.splice(idx, 1)[0];
        detachLimb(z, limb, dir, z.mesh.position.clone().setY(1));
      }
    }
    damageZombie(z, dmg, false, 'torso', dir, z.mesh.position.clone().setY(1), 'explosion');
  }
  const ddx = player.position.x - pos.x, ddz = player.position.z - pos.z;
  const selfD = Math.sqrt(ddx*ddx + ddz*ddz);
  if (selfD < radius && !state.downed) {
    const dmg = baseDamage * CONFIG.launcher.selfDamageFactor * (1 - selfD/radius);
    state.health -= dmg; survival.onPlayerHit(dmg); showDamageFlash(); updateHUD();
    if (state.health <= 0) enterDownedState();
  }
  explosions.push({ sphere, life:0.35, maxLife:0.35 });
}
function updateExplosions(dt) {
  if (explosionLightEnd > 0) {
    const remain = explosionLightEnd - performance.now()/1000;
    if (remain <= 0) { explosionLight.intensity = 0; explosionLightEnd = 0; }
    else explosionLight.intensity = 6 * (remain / 0.35);
  }
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i]; e.life -= dt;
    const t = 1 - e.life/e.maxLife;
    e.sphere.scale.setScalar(1 + t*10);
    e.sphere.material.opacity = 1 - t;
    if (e.life <= 0) { scene.remove(e.sphere); e.sphere.geometry.dispose(); e.sphere.material.dispose(); explosions.splice(i, 1); }
  }
}

const _noiseRipples = [];
function spawnNoiseRipple(pos, radius) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.9, radius, 24),
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
    if (r.life <= 0) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); _noiseRipples.splice(i, 1); }
  }
}

function damageZombie(z, damage, isCrit, part, hitDir, hitPoint, sourceType) {
  if (z.dying) return;
  z.health -= damage;
  const isHead = part === 'head';
  bus.emit(Ev.DAMAGE, { attackerId:player.id, victimId:z.id, amount:damage, part, isCrit, headshot:isHead, sourceType, weaponId:state.inventory[state.currentSlot], pos:{ x:hitPoint.x, y:hitPoint.y, z:hitPoint.z } });
  spawnBlood(hitPoint, hitDir, (isCrit||isHead) ? 25 : 12, isHead);
  if (sourceType === 'melee') Sfx.playKnifeHitFlesh();
  else if (sourceType !== 'explosion') Sfx.playBulletImpact();
  showHitMarker(isCrit || isHead);
  addShake(CONFIG.shake.hit);
  applyHitReaction(z, part, hitDir, isCrit||isHead ? 1.4 : 1.0);

  {
    const roll = Math.random();
    let limb = null;
    if (part === 'head') {
      if (isCrit && !z.dismembered.head && roll < CONFIG.dismember.headChance) limb = 'head';
    } else if (part === 'armL' || part === 'armR' || part === 'legL' || part === 'legR') {
      if (!z.dismembered[part]) {
        const baseChance = isCrit ? 0.75 : 0.35;
        if (roll < baseChance) limb = part;
      }
    }
    if (limb) detachLimb(z, limb, hitDir, hitPoint);
  }

  alertNearbyZombies(z, hitPoint);
  ZombieAI.alertNearbyZombies(zombies, hitPoint, 8);
  ZombieAI.staggerZombie(z, isCrit || isHead ? 0.55 : 0.3);

  if (z.health <= 0 && !z.dying) {
    z.dying = true;
    Gore.onZombieDeath(z.mesh.position, hitDir, z.isBoss);

    if (z.type.explodesOnDeath) {
      const radius = z.type.explosionRadius || 4;
      const dmg = z.type.explosionDamage || 60;
      const snap = [...zombies];
      for (const other of snap) {
        if (other === z) continue;
        const dx = other.mesh.position.x - z.mesh.position.x;
        const dz = other.mesh.position.z - z.mesh.position.z;
        const d = Math.sqrt(dx*dx + dz*dz);
        if (d < radius) {
          const falloff = 1 - d / radius;
          damageZombie(other, dmg * falloff, false, 'torso',
            new THREE.Vector3(dx/Math.max(d,0.01), 0, dz/Math.max(d,0.01)),
            other.mesh.position.clone().setY(1), 'explosion');
        }
      }
      const pdx = player.position.x - z.mesh.position.x;
      const pdz = player.position.z - z.mesh.position.z;
      const pd = Math.sqrt(pdx*pdx + pdz*pdz);
      if (pd < radius) {
        const falloff = 1 - pd / radius;
        state.health -= dmg * falloff * 0.7;
        survival.onPlayerHit(dmg * falloff);
        showDamageFlash();
        updateHUD();
        if (state.health <= 0 && !state.downed) enterDownedState();
      }
      spawnExplosion(z.mesh.position);
    }

    Sfx.playZombieDeath(); Sfx.playCoin(); addShake(CONFIG.shake.kill);
    const rewardMul = state.brazierBurning ? CONFIG.brazier.rewardMult : 1;
    const cRew = Math.round(z.coinReward * rewardMul);
    const xRew = Math.round(z.xpReward * rewardMul);
    state.coins += cRew; state.xp += xRew;
    state.kills++; if (isHead) state.headshots++;
    if (state.lifesteal > 0) state.health = Math.min(state.maxHealth, state.health + state.lifesteal);

    // 🎯 PERK: kill refills stamina
    if (state.killRefillsStamina) {
      state.staminaBoostUntil = performance.now()/1000 + state.killStaminaDuration;
      state.stamina = state.staminaMax;
    }

    bus.emit(Ev.DEATH, { id:z.id, killerId:player.id, part });
    bus.emit(Ev.KILL, { killerId:player.id, victimId:z.id, victimType:z.typeKey, headshot:isHead, weaponId:state.inventory[state.currentSlot] });
    if (isHead) bus.emit(Ev.HEADSHOT, { playerId:player.id, victimId:z.id });
    bus.emit(Ev.COIN_GAIN, { playerId:player.id, amount:cRew, total:state.coins });
    bus.emit(Ev.XP_GAIN, { playerId:player.id, amount:xRew, total:state.xp });
    if (z.isBoss) {
      const dropWeapon = z.typeKey === 'reaper' ? 'reaperScythe' : (z.typeKey === 'queen' ? 'katana' : 'pipeWrench');
      spawnWeaponPickup(dropWeapon, z.mesh.position.x, z.mesh.position.z, 0.9, true);
    }
    checkLevelUp();
    randomDismemberOnDeath(z);

    const torsoWorldPos = new THREE.Vector3();
    if (z.mesh.userData.torso) {
      z.mesh.userData.torso.getWorldPosition(torsoWorldPos);
    } else {
      torsoWorldPos.copy(z.mesh.position).setY(1.0);
    }
    const overkill = Math.min(2, Math.max(0.7, -z.health/z.maxHealth + 1));
    startRagdoll(z.mesh, hitDir, isCrit ? overkill*1.4 : overkill, z.dismembered);
    if (z.dismembered.head) { torsoWorldPos.y += 0.35; spawnBloodFountain(torsoWorldPos, 3.0); }
    if (z.dismembered.armL || z.dismembered.armR || z.dismembered.legL || z.dismembered.legR) {
      torsoWorldPos.y += 0.1;
      spawnBloodFountain(torsoWorldPos, 1.5);
    }

    const idx = zombies.indexOf(z);
    if (idx >= 0) zombies.splice(idx, 1);
    state.zombiesAlive--;
    updateHUD();
  } else if (!z.dying) {
    z.hitReactEndTime = performance.now()/1000 + CONFIG.zombie.knockbackStagger * (isCrit||isHead ? 1.5 : 1);
    z.hitDirection.copy(hitDir);
    const impulse = (isCrit||isHead ? 4.5 : 3.0) / z.scale;
    z.vx += hitDir.x * impulse; z.vz += hitDir.z * impulse;
  }
}

function alertNearbyZombies(source, position) {
  const now = performance.now()/1000;
  const R2 = 3.0 * 3.0;
  for (const z of zombies) {
    if (z === source || z.health <= 0) continue;
    const dx = z.mesh.position.x - position.x;
    const dz = z.mesh.position.z - position.z;
    if (dx*dx + dz*dz > R2) continue;
    z.alertedUntil = now + CONFIG.aggro.alertDuration;
  }
}

function makeNoise(position, radius) {
  if (!radius || radius <= 0) return;
  const now = performance.now()/1000;
  const R2 = radius * radius;
  let alerted = 0;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    const dx = z.mesh.position.x - position.x;
    const dz = z.mesh.position.z - position.z;
    const d2 = dx*dx + dz*dz;
    if (d2 > R2) continue;
    const dist = Math.sqrt(d2);
    const t = 1 - Math.min(1, dist / radius);
    z.alertedUntil = now + CONFIG.aggro.alertDuration + t * 5;
    alerted++;
  }
  if (alerted > 0) spawnNoiseRipple(position, radius);
}

function rollCrit() { return Math.random() < state.critChance; }

function startReload(wid) {
  if (state.reload.active) return;
  const w = WEAPONS[wid], am = state.ammo[wid];
  if (!w || !am) return;
  if (am.mag >= w.magSize || am.reserve <= 0) return;
  state.reload.active = true; state.reload.wid = wid;
  state.reload.startTime = performance.now()/1000;
  // 🎯 PERK: reload speed
  const duration = w.reloadTime / state.reloadSpeedMult;
  state.reload.duration = duration;
  state.reload.endTime = state.reload.startTime + duration;
  if (state.aiming) { state.aiming = false; updateCrosshair(); }
  if (weaponView) weaponView.reload(duration);
  Sfx.playReload();
}
function cancelReload() {
  state.reload.active = false; state.reload.wid = null;
  state.reload.startTime = 0; state.reload.endTime = 0; state.reload.duration = 0;
  if (weaponView) weaponView.cancelReload();
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

function attack(isRightClick = false) {
  if (state.downed) {
    const wid = state.inventory[state.currentSlot] || 'knife';
    if (wid !== 'pistol') return false;
  }
  if (state.reload.active) return false;
  const now = performance.now()/1000;
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
  bus.emit(Ev.ATTACK, { playerId:player.id, weaponId, weaponType:weapon.type, aiming:state.aiming, pos:{ x:player.position.x, y:player.position.y, z:player.position.z }, yaw:player.yaw, pitch:player.pitch });
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
    const candidates = collectRaycastCandidates(camOrigin, camForward, range);
    const precise = raycastZombie(camOrigin, camForward, range, candidates);
    let hitCount = 0;
    const maxHits = weapon.hitCount || 1;
    const mt = MELEE_TYPES[weapon.meleeType] || MELEE_TYPES.mixed;

    if (precise.zombie) {
      const z = precise.zombie;
      const part = precise.part;
      const hitPoint = precise.point.clone();
      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult * (isRightClick ? 1.3 : 1.0);
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const headMult = part === 'head' ? CONFIG.headshotMultiplier : 1;
      const dmg = baseDmg * headMult * (isCrit ? critMult : 1);
      const hitDir = new THREE.Vector3();
      hitDir.subVectors(z.mesh.position, camOrigin); hitDir.y = 0;
      if (hitDir.lengthSq() < 0.0001) hitDir.copy(camForward);
      hitDir.normalize();
      damageZombie(z, dmg, isCrit, part, hitDir, hitPoint, 'melee');

      const chopChance = (weapon.chop || 0) * mt.chopMul;
      if (chopChance > 0 && Math.random() < chopChance) {
        if (!z.dismembered[part] && part !== 'torso') detachLimb(z, part, hitDir, hitPoint);
      }
      if (weapon.meleeType === 'blunt') {
        const push = mt.staggerMul * 1.5;
        z.vx += hitDir.x * push; z.vz += hitDir.z * push;
        z.hitReactEndTime = performance.now()/1000 + 0.35;
      }
      hitCount++;

      if (maxHits > 1) {
        const minDot = CONFIG.melee.coneDot;
        for (let i = zombies.length - 1; i >= 0 && hitCount < maxHits; i--) {
          const z2 = zombies[i];
          if (!z2 || z2.health <= 0 || z2 === z) continue;
          const dx = z2.mesh.position.x - camOrigin.x, dz = z2.mesh.position.z - camOrigin.z;
          const horiz = Math.sqrt(dx*dx + dz*dz);
          if (horiz > range) continue;
          if (horiz > 0.001) {
            const dot = (dx*camForward.x + dz*camForward.z) / horiz;
            if (dot < minDot) continue;
          }
          const hp = z2.mesh.position.clone();
          hp.y += 1.0;
          const isCrit2 = rollCrit();
          const baseDmg2 = weapon.damage * state.damageMult * 0.6 * (isRightClick ? 1.3 : 1.0);
          const critMult2 = CONFIG.crit.damageMultiplier + state.critDamageBonus;
          const dmg2 = baseDmg2 * (isCrit2 ? critMult2 : 1);
          const hd2 = new THREE.Vector3(dx/horiz, 0, dz/horiz);
          damageZombie(z2, dmg2, isCrit2, 'torso', hd2, hp, 'melee');
          hitCount++;
        }
      }
    } else {
      const minDot = CONFIG.melee.coneDot;
      for (let i = zombies.length - 1; i >= 0 && hitCount < maxHits; i--) {
        const z = zombies[i];
        if (!z || z.health <= 0) continue;
        const dx = z.mesh.position.x - camOrigin.x, dz = z.mesh.position.z - camOrigin.z;
        const horizDist = Math.sqrt(dx*dx + dz*dz);
        if (horizDist > range) continue;
        if (horizDist > 0.001) {
          const dot = (dx*camForward.x + dz*camForward.z) / horizDist;
          if (dot < minDot) continue;
        }
        const hitPoint = z.mesh.position.clone().setY(z.mesh.position.y + 1.0);
        const isCrit = rollCrit();
        const baseDmg = weapon.damage * state.damageMult * (isRightClick ? 1.3 : 1.0);
        const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
        const dmg = baseDmg * (isCrit ? critMult : 1);
        const hitDir = new THREE.Vector3(dx/horizDist, 0, dz/horizDist);
        damageZombie(z, dmg, isCrit, 'torso', hitDir, hitPoint, 'melee');
        hitCount++;
      }
    }

    if (hitCount > 0) {
      state.hitstopUntil = performance.now() + CONFIG.melee.hitstop * 1000;
      Sfx.playKnifeHitFlesh();
    }
    const camPos = camera.position.clone();
    for (let ri = ragdolls.length - 1; ri >= 0; ri--) {
      const r = ragdolls[ri];
      const detached = r.sliceAt(camPos, camForward, CONFIG.ragdoll.sliceRange);
      if (detached) {
        const piece = new Debris(detached.mesh, detached.size, 1.2, CONFIG.dismember.limbLife);
        piece.key = detached.key;
        piece.velocity.copy(detached.velocity);
        piece.angularVelocity.copy(detached.angularVelocity);
        piece.settled = false; piece.settleTimer = 0;
        flyingLimbs.push(piece);
        Sfx.playKnifeHitFlesh();
        showHitMarker(false);
        spawnBlood(detached.mesh.position.clone(), detached.velocity.clone().normalize(), 15, true);
        spawnBloodFountain(detached.mesh.position.clone(), 1.2);
        break;
      }
    }
    return true;
  }

  const origin = camera.position.clone();
  const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
  const range = weapon.range + state.rangeBonus;
  const baseSpread = state.aiming ? weapon.spread * 0.25 : weapon.spread;
  const candidates = collectRaycastCandidates(origin, forward, range);
  for (let i = 0; i < weapon.pellets; i++) {
    const dir = forward.clone();
    if (baseSpread > 0) {
      dir.x += (Math.random()-0.5)*baseSpread*2;
      dir.y += (Math.random()-0.5)*baseSpread*2;
      dir.z += (Math.random()-0.5)*baseSpread*2;
      dir.normalize();
    }
    if (weaponId === 'launcher') {
      const result = raycastZombie(origin, dir, range, candidates);
      let hitPos;
      if (result.zombie) hitPos = result.point;
      else {
        hitPos = origin.clone().addScaledVector(dir, range);
        if (dir.y < -0.01) { const t = -origin.y/dir.y; if (t > 0 && t < range) { hitPos = origin.clone().addScaledVector(dir, t); hitPos.y = 0.1; } }
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
      const result = raycastZombie(rayOrigin, dir, remainingDist, candidates);
      if (!result.zombie) {
        spawnTracer(rayOrigin.clone().addScaledVector(dir, 0.3), rayOrigin.clone().addScaledVector(dir, remainingDist));
        break;
      }
      if (hitIds.has(result.zombie.id)) break;
      hitIds.add(result.zombie.id);
      spawnTracer(rayOrigin.clone().addScaledVector(dir, 0.3), result.point);
      const isCrit = rollCrit();
      const baseDmg = weapon.damage * state.damageMult * (pierceCount > 0 ? 0.65 : 1);
      const critMult = CONFIG.crit.damageMultiplier + state.critDamageBonus;
      const headMult = result.part === 'head' ? CONFIG.headshotMultiplier : 1;
      const dmg = baseDmg * headMult * (isCrit ? critMult : 1);
      const hd = dir.clone(); hd.y = 0; hd.normalize();
      damageZombie(result.zombie, dmg, isCrit, result.part, hd, result.point, 'ranged');
      pierceCount++;
      rayOrigin = result.point.clone().addScaledVector(dir, 0.15);
      remainingDist -= result.distance + 0.15;
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
    bus.emit(Ev.LEVEL_UP, { playerId:player.id, level:state.level });
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
  for (let i = 0; i < 3 && pool.length > 0; i++) { const idx = Math.floor(Math.random()*pool.length); chosen.push(pool.splice(idx, 1)[0]); }
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
  bus.emit(Ev.SKILL_PICK, { playerId:player.id, skillId, level:state.level });
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
  const bossType = isBossWave ? BOSS_ROTATION[Math.floor(state.wave / CONFIG.wave.bossEvery - 1) % BOSS_ROTATION.length] : null;
  state.zombiesRemainingInWave = count + (isBossWave ? 1 : 0);
  state.bossSpawned = false;
  let waveLabel = isBossWave ? `HORDA CHEFE ${state.wave} — ${bossType.toUpperCase()}` : `HORDA ${state.wave}`;
  if (isBossWave && ZOMBIE_LORE[bossType]) waveLabel += '  ·  ' + ZOMBIE_LORE[bossType];
  showWaveBanner(waveLabel);
  bus.emit(Ev.WAVE_START, { wave:state.wave, count, boss:isBossWave });
  updateHUD();
  const spawnInterval = state.brazierBurning ? 500/CONFIG.brazier.waveSpeedBoost : 500;
  state.waveIntervalId = setInterval(() => {
    if (!state.running || state.paused) { if (!state.running) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; } return; }
    if (state.levelUpActive) return;
    if (state.zombiesRemainingInWave <= 0) { clearInterval(state.waveIntervalId); state.waveIntervalId = null; return; }
    if (isBossWave && !state.bossSpawned) { spawnZombie(bossType); state.bossSpawned = true; }
    else spawnZombie();
    state.zombiesRemainingInWave--; updateHUD();
  }, spawnInterval);
  if (state.wave > 0 && state.wave % CONFIG.vendor.spawnEveryWaves === 0) {
    spawnVendorVan();
  }
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
    // 🎯 PERK: brazier duration + fuel bonus
    state.brazierFuel = Math.min(
      CONFIG.brazier.maxFuel * state.brazierDurationMult,
      state.brazierFuel + CONFIG.brazier.fuelPerWave * state.brazierFuelBonus
    );
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

function switchToSlot(slot) {
  if (!state.inventory[slot] || state.currentSlot === slot) return;
  cancelReload();
  state.currentSlot = slot;
  const weaponId = state.inventory[slot];
  const weapon = WEAPONS[weaponId];
  if (weapon.type === 'melee' && state.aiming) { state.aiming = false; updateCrosshair(); }
  setWeaponViewModel(weaponId);
  bus.emit(Ev.PLAYER_WEAPON, { playerId:player.id, slot, weaponId });
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
  state.isGrounded = true; state.velocityY = 0; state.jumpOffset = 0;
  state.jumpVelX = 0; state.jumpVelZ = 0;
  player.position.y = CONFIG.player.height;
  updateCrosshair(); cancelReload();
  document.body.classList.add('downed');
  document.getElementById('downed-overlay').classList.remove('hidden');
  document.getElementById('downed-timer').textContent = '30';
  document.getElementById('downed-prompt').classList.remove('visible');
  document.getElementById('downed-progress-wrap').classList.remove('visible');
  document.getElementById('downed-progress').style.width = '0%';
  document.getElementById('downed-hp-fill').style.width = '100%';
  Sfx.playPlayerDown(); addShake(0.4); updateHUD();
  bus.emit(Ev.PLAYER_DOWN, { playerId:player.id, pos:{ x:player.position.x, y:player.position.y, z:player.position.z } });
}
function exitDownedState(hpFraction) {
  if (!state.downed) return;
  state.downed = false; state.downedElapsed = 0; state.reviveProgress = 0;
  // 🎯 PERK: revive heal bonus
  const finalFraction = Math.min(1, (hpFraction || 0.5) + state.reviveHealBonus);
  state.health = Math.max(20, Math.round(state.maxHealth * finalFraction));
  state.invulnUntil = performance.now()/1000 + 2.0;
  document.body.classList.remove('downed');
  document.getElementById('downed-overlay').classList.add('hidden');
  Sfx.playRevive(); updateHUD();
  bus.emit(Ev.PLAYER_REVIVE, { playerId:player.id, hp:state.health });
}
function updateDownedState(dt) {
  if (!state.downed) return;
  state.downedElapsed += dt*1000;
  if (state.downedHP <= 0) { exitDownedState(0); gameOver(); return; }
  const remaining = Math.max(0, CONFIG.downed.duration - state.downedElapsed);
  document.getElementById('downed-timer').textContent = Math.ceil(remaining/1000);
  document.getElementById('downed-hp-fill').style.width = Math.max(0, (state.downedHP/state.downedMaxHP)*100) + '%';
  const prompt = document.getElementById('downed-prompt');
  const progressWrap = document.getElementById('downed-progress-wrap');
  const progressBar = document.getElementById('downed-progress');
  if (state.downedElapsed >= CONFIG.downed.selfReviveAt && state.revivesLeft > 0) {
    prompt.classList.add('visible');
    if (controls.isDown(Action.Interact, state.keys)) {
      // 🎯 PERK: revive speed
      state.reviveProgress += dt*1000 * state.reviveSpeedMult;
      progressWrap.classList.add('visible');
      const pct = Math.min(1, state.reviveProgress / CONFIG.downed.selfReviveHold);
      progressBar.style.width = (pct*100) + '%';
      if (state.reviveProgress >= CONFIG.downed.selfReviveHold) { state.revivesLeft--; exitDownedState(0.3); return; }
    } else { state.reviveProgress = 0; progressWrap.classList.remove('visible'); progressBar.style.width = '0%'; }
  } else { prompt.classList.remove('visible'); progressWrap.classList.remove('visible'); }
  if (remaining <= 0) { exitDownedState(0); gameOver(); }
}

// ============================================================
// PING
// ============================================================
const pings = [];
const PING_COLORS = { enemy:0xff2020, help:0xffdd00, go:0x22dd22, careful:0xff8800 };
function updatePingHighlight() {
  const x = state.pingAccumX, y = state.pingAccumY;
  const mag = Math.hypot(x, y);
  if (mag < 25) { state.pingHighlight = null; document.querySelectorAll('.ping-option').forEach(el => el.classList.remove('highlighted')); return; }
  const angle = Math.atan2(y, x); const pi = Math.PI;
  let dir;
  if (angle >= -3*pi/4 && angle < -pi/4) dir = 'top';
  else if (angle >= -pi/4 && angle < pi/4) dir = 'right';
  else if (angle >= pi/4 && angle < 3*pi/4) dir = 'bottom';
  else dir = 'left';
  const map = { top:'enemy', right:'help', bottom:'go', left:'careful' };
  state.pingHighlight = map[dir];
  document.querySelectorAll('.ping-option').forEach(el => { el.classList.toggle('highlighted', el.classList.contains('ping-' + dir)); });
}
function getPingPosition() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const pos = camera.position.clone();
  if (dir.y < -0.01) { const t = (0.1 - pos.y)/dir.y; if (t > 0 && t < 60) { pos.addScaledVector(dir, t); pos.y = 0.1; return pos; } }
  pos.addScaledVector(dir, 15); pos.y = 0.1; return pos;
}
function emitPing(type) {
  const pos = getPingPosition();
  bus.emit(Ev.PING, { playerId:player.id, type, pos:{ x:pos.x, y:pos.y, z:pos.z } });
  spawnPingMarker(pos, type); Sfx.playPing();
}
function spawnPingMarker(pos, type) {
  const color = PING_COLORS[type] || 0xffffff;
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6, 1, true), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.4, side:THREE.DoubleSide, depthWrite:false }));
  pillar.position.y = 3; group.add(pillar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 16), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1, side:THREE.DoubleSide, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.15; group.add(ring);
  group.position.copy(pos); scene.add(group);
  pings.push({ group, pillar, ring, life:3, maxLife:3 });
}
function updatePings(dt) {
  for (let i = pings.length - 1; i >= 0; i--) {
    const p = pings[i]; p.life -= dt;
    const t = Math.max(0, p.life/p.maxLife);
    p.ring.scale.setScalar(1 + (1-t)*2.2);
    p.ring.material.opacity = t;
    p.pillar.material.opacity = t*0.4;
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
    return;
  }

  owned.forEach(wid => {
    const w = WEAPONS[wid], am = state.ammo[wid];
    if (!am || !AMMO_PACKS[wid]) return;
    const pack = AMMO_PACKS[wid];
    // 🎯 PERK: shop discount
    const price = Math.round(AMMO_PRICES[wid] * state.shopDiscount);
    const canBuy = state.coins >= price && am.reserve < w.reserveMax;

    const el = document.createElement('button');
    el.className = 'shop-item' + (canBuy ? '' : ' disabled');

    const gunIcon = document.createElement('img');
    gunIcon.src = getWeaponIconURL(wid);
    gunIcon.className = 'shop-icon-gun';
    gunIcon.alt = wid + '-weapon';
    el.appendChild(gunIcon);

    const iconWrap = document.createElement('div');
    iconWrap.className = 'shop-icon-main';
    const img = document.createElement('img');
    img.src = getAmmoIconURL(wid);
    img.alt = wid;
    iconWrap.appendChild(img);
    el.appendChild(iconWrap);

    const info = document.createElement('div');
    info.className = 'shop-info';
    info.innerHTML = `
      <div class="item-name">${w.name}</div>
      <div class="item-info">${am.mag}/${w.magSize} · reserva ${am.reserve}/${w.reserveMax}</div>
      <div class="item-cost">+${pack} MUNIÇÃO — $${price}</div>
    `;
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
  if (state.brazierFuel <= 0) return;
  if (state.brazierBurning) return;
  state.brazierFuel--;
  state.brazierBurning = true;
  state.brazierBurnStart = performance.now()/1000;
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
  const dist = CONFIG.arena.size * 0.35;
  const x = Math.cos(angle) * dist;
  const z = Math.sin(angle) * dist;
  vendorVan.position.set(x, 0, z);
  vendorVan.rotation.y = -angle + Math.PI;
  vendorVan.visible = true;
  state.vendorVanActive = true;
  state.vendorVanSpawnedAt = performance.now()/1000;
  state.vendorVanWave = state.wave;
  showWaveBanner('VENDEDOR AMBULANTE APARECEU! (60s)');
}
function closeVendorVan() {
  state.vendorVanActive = false;
  vendorVan.visible = false;
}
function updateVendorVan() {
  if (!state.vendorVanActive) return;
  const elapsed = performance.now()/1000 - state.vendorVanSpawnedAt;
  if (elapsed > CONFIG.vendor.durationSec) {
    closeVendorVan();
    showWaveBanner('Vendedor foi embora...');
  }
}

// ============================================================
// PULO
// ============================================================
function tryJump() {
  if (state.downed) return false;
  if (!state.isGrounded) return false;
  if (performance.now() < state.hitstopUntil) return false;

  let mx = 0, mz = 0;
  if (controls.isDown(Action.MoveForward,  state.keys)) mz -= 1;
  if (controls.isDown(Action.MoveBackward, state.keys)) mz += 1;
  if (controls.isDown(Action.MoveLeft,     state.keys)) mx -= 1;
  if (controls.isDown(Action.MoveRight,    state.keys)) mx += 1;

  const fwd   = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3( Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  const dir = new THREE.Vector3();
  dir.addScaledVector(fwd,   -mz);
  dir.addScaledVector(right,  mx);

  if (dir.lengthSq() > 0.0001) {
    dir.normalize();
    state.jumpVelX = dir.x * CONFIG.player.jumpForwardForce;
    state.jumpVelZ = dir.z * CONFIG.player.jumpForwardForce;
  } else {
    state.jumpVelX = 0;
    state.jumpVelZ = 0;
  }

  state.velocityY = CONFIG.player.jumpForce;
  state.isGrounded = false;
  Sfx.playJump();
  return true;
}

// ============================================================
// INPUT
// ============================================================
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

  if (e.code === controls.getKey(Action.Reload) &&
      state.running && !state.downed && !state.shopOpen && !state.reload.active) {
    const wid = state.inventory[state.currentSlot];
    if (wid && WEAPONS[wid].type === 'ranged') startReload(wid);
  }

  if (e.code === controls.getKey(Action.Ping) &&
      state.running && !state.downed && !state.levelUpActive && !state.pingWheelOpen && !state.shopOpen) {
    state.pingWheelOpen = true; state.pingAccumX = 0; state.pingAccumY = 0; state.pingHighlight = null;
    document.getElementById('ping-wheel').classList.remove('hidden');
  }

  if (e.code === controls.getKey(Action.Interact) &&
      state.running && !state.downed && !state.levelUpActive) {
    if (state.shopOpen) { closeShop(); return; }
    const dxB = player.position.x - brazierGroup.position.x;
    const dzB = player.position.z - brazierGroup.position.z;
    if (Math.sqrt(dxB*dxB + dzB*dzB) < 3.0) { tryLightBrazier(); return; }
    if (state.vendorVanActive) {
      const dxV = player.position.x - vendorVan.position.x;
      const dzV = player.position.z - vendorVan.position.z;
      if (Math.sqrt(dxV*dxV + dzV*dzV) < 4.0) { openShop(); return; }
    }
    if (nearWeapon && !nearWeapon.bought) tryBuyWeapon(); else openShop();
  }

  const jumpKey = controls.getKey(Action.Jump);
  if (jumpKey && e.code === jumpKey) {
    e.preventDefault();
    if (state.running && !state.downed && !state.paused && !state.levelUpActive && !state.shopOpen) {
      tryJump();
    }
    return;
  }
});

document.addEventListener('keyup', e => {
  state.keys[e.code] = false;
  if (e.code === controls.getKey(Action.Ping) && state.pingWheelOpen) {
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
const mobile = { moveX:0, moveY:0, looking:false, lastX:0, lastY:0 };

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
  base.addEventListener('touchstart', e => { e.preventDefault(); Sfx.initAudio(); Sfx.resumeAudio(); baseRect = base.getBoundingClientRect(); touching = true; }, { passive:false });
  document.addEventListener('touchmove', e => {
    if (!touching || !baseRect) return;
    for (const t of e.changedTouches) {
      const cx = baseRect.left + baseRect.width/2, cy = baseRect.top + baseRect.height/2;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const maxD = baseRect.width/2, d = Math.hypot(dx, dy);
      if (d > maxD) { dx = dx/d*maxD; dy = dy/d*maxD; }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      mobile.moveX = dx/maxD; mobile.moveY = dy/maxD;
    }
  }, { passive:false });
  document.addEventListener('touchend', () => { touching = false; stick.style.transform = 'translate(0,0)'; mobile.moveX = 0; mobile.moveY = 0; });
  look.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; mobile.looking = true; mobile.lastX = t.clientX; mobile.lastY = t.clientY; }, { passive:false });
  look.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!mobile.looking) return;
    const t = e.touches[0];
    const dx = t.clientX - mobile.lastX, dy = t.clientY - mobile.lastY;
    mobile.lastX = t.clientX; mobile.lastY = t.clientY;
    const sens = controls.getEffectiveSens(state.aiming) * 3.0;
    player.yaw -= dx * sens * 1.5;
    player.pitch -= dy * sens * 1.5;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
    state.mouseDX += dx * 3;
    state.mouseDY += dy * 3;
  }, { passive:false });
  look.addEventListener('touchend', () => { mobile.looking = false; });
  atk.addEventListener('touchstart', e => { e.preventDefault(); attack(false); }, { passive:false });
  ads.addEventListener('touchstart', e => {
    e.preventDefault();
    const wid = state.inventory[state.currentSlot] || 'knife';
    if (WEAPONS[wid].type === 'melee') return;
    state.aiming = !state.aiming; updateCrosshair();
  }, { passive:false });
  rel.addEventListener('touchstart', e => { e.preventDefault(); const wid = state.inventory[state.currentSlot]; if (wid && WEAPONS[wid].type === 'ranged') startReload(wid); }, { passive:false });
  buy.addEventListener('touchstart', e => { e.preventDefault(); if (state.downed) return; if (nearWeapon && !nearWeapon.bought) tryBuyWeapon(); else if (state.shopOpen) closeShop(); else openShop(); }, { passive:false });
  rev.addEventListener('touchstart', e => { e.preventDefault(); if (state.downed) { const k = controls.getKey(Action.Interact); if (k) state.keys[k] = true; } }, { passive:false });
  rev.addEventListener('touchend', e => { e.preventDefault(); const k = controls.getKey(Action.Interact); if (k) state.keys[k] = false; });
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
  if (!state.isGrounded) {
    state.velocityY -= CONFIG.player.gravity * dt;
    state.jumpOffset += state.velocityY * dt;
    if (state.jumpOffset <= 0) {
      state.jumpOffset = 0;
      state.velocityY = 0;
      state.isGrounded = true;
      state.jumpVelX = 0;
      state.jumpVelZ = 0;
    }
  }
  player.position.y = CONFIG.player.height + state.jumpOffset;

  if (!state.isGrounded && (state.jumpVelX !== 0 || state.jumpVelZ !== 0)) {
    player.position.x += state.jumpVelX * dt;
    player.position.z += state.jumpVelZ * dt;
    const decay = Math.exp(-CONFIG.player.jumpAirDecay * dt);
    state.jumpVelX *= decay;
    state.jumpVelZ *= decay;
    if (Math.abs(state.jumpVelX) < 0.05) state.jumpVelX = 0;
    if (Math.abs(state.jumpVelZ) < 0.05) state.jumpVelZ = 0;
  }

  _fwdV.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  _rightV.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  let mx = 0, mz = 0;
  if (isMobile()) { mx = mobile.moveX; mz = mobile.moveY; }
  else {
    if (controls.isDown(Action.MoveForward,  state.keys)) mz -= 1;
    if (controls.isDown(Action.MoveBackward, state.keys)) mz += 1;
    if (controls.isDown(Action.MoveLeft,     state.keys)) mx -= 1;
    if (controls.isDown(Action.MoveRight,    state.keys)) mx += 1;
  }

  _moveV.set(0, 0, 0);
  _moveV.addScaledVector(_fwdV, -mz);
  _moveV.addScaledVector(_rightV, mx);

  state.isMoving = _moveV.lengthSq() > 0.0025;
  if (state.isMoving) _moveV.normalize();

  let speedMult = state.aiming ? 0.5 : 1;
  if (state.downed) speedMult = 0.25;

  // 🎯 PERK: stamina boost ativo
  const now = performance.now()/1000;
  if (now < state.staminaBoostUntil) {
    state.stamina = state.staminaMax;
  }

  const sprintKeyHeld = controls.isDown(Action.Sprint, state.keys);
  const canSprint = state.isMoving && !state.downed && !state.aiming && state.stamina > 0;
  state.isSprinting = canSprint && sprintKeyHeld;
  // 🎯 PERK: sprint speed bonus
  const sprintMult = state.isSprinting ? CONFIG.player.sprintMult * state.sprintSpeedBonus : 1;

  const speed = CONFIG.player.speed * state.speedMult * speedMult * sprintMult;

  player.position.addScaledVector(_moveV, speed * dt);

  resolveWallCollisions(player.position, CONFIG.player.radius);
  const lim = CONFIG.arena.size/2 - 1;
  player.position.x = Math.max(-lim, Math.min(lim, player.position.x));
  player.position.z = Math.max(-lim, Math.min(lim, player.position.z));

  if (state.isSprinting) {
    state.stamina = Math.max(0, state.stamina - CONFIG.player.staminaDrainRun * dt);
  } else {
    state.stamina = Math.min(state.staminaMax, state.stamina + CONFIG.player.staminaRegen * dt);
  }

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
      showDamageFlash();
      updateHUD();
      if (state.health <= 0) enterDownedState();
    }
  }
}

function resolvePlayerZombieCollision() {
  for (const z of zombies) {
    if (z.health <= 0) continue;
    const dx = player.position.x - z.mesh.position.x;
    const dz = player.position.z - z.mesh.position.z;
    const d2 = dx*dx + dz*dz;
    const minD = CONFIG.player.radius + z.radius;
    if (d2 < minD*minD && d2 > 0.0001) {
      const d = Math.sqrt(d2), overlap = minD - d;
      const nx = dx/d, nz = dz/d;
      player.position.x += nx*overlap*0.5;
      player.position.z += nz*overlap*0.5;
      z.mesh.position.x -= nx*overlap*0.5;
      z.mesh.position.z -= nz*overlap*0.5;
    }
  }
}

// ============================================================
// ZOMBIE UPDATE
// ============================================================
const K_THIGH = 55,  C_THIGH = 11;
const K_KNEE  = 50,  C_KNEE  = 10;
const K_FOOT  = 75,  C_FOOT  = 10;
const K_PELVIS = 65, C_PELVIS = 11;
const K_SPINE = 70,  C_SPINE = 12;
const K_HEAD  = 90,  C_HEAD  = 14;
const K_ARM   = 45,  C_ARM   = 9;
const K_ELBOW = 55,  C_ELBOW = 9;
const K_BANK  = 30,  C_BANK  = 5;

let lodFrame = 0;
function updateZombieLOD() {
  lodFrame++;
  if (lodFrame % 5 !== 0) return;
  const camX = player.position.x, camZ = player.position.z;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    const dx = z.mesh.position.x - camX;
    const dz = z.mesh.position.z - camZ;
    const d2 = dx*dx + dz*dz;
    z.mesh.visible = d2 < 2500;
  }
}

function updateZombies(dt) {
  const now = performance.now()/1000;

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.health <= 0) continue;

    ZombieAI.updateZombieAIState(z, player, dt, world);
    const aiMult = ZombieAI.getAIMultiplier(z);
    const aiDir = ZombieAI.getDesiredDirection(z, player);

    // 🎯 BOOMER: check de explosão
    if (z.type && z.type.behavior === 'boomer' && z.aiState === 'SUICIDE_RUN') {
      if (ZombieAI.checkBoomerExplosion(z, player)) {
        bus.emit(Ev.BOOMER_DETONATE, { id: z.id, pos: { x: z.mesh.position.x, y: 0, z: z.mesh.position.z } });
        spawnExplosion(z.mesh.position);
        z.health = 0;
        z.dying = true;
        const idxB = zombies.indexOf(z);
        if (idxB >= 0) zombies.splice(idxB, 1);
        state.zombiesAlive--;
        updateHUD();
        continue;
      }
    }

    const dxLod = z.mesh.position.x - player.position.x;
    const dzLod = z.mesh.position.z - player.position.z;
    const distLod2 = dxLod*dxLod + dzLod*dzLod;
    const skipVisual = distLod2 > 400 && ((i & 1) !== (Math.floor(performance.now() / 33) & 1));

    z.emergeTime += dt;
    const emerge = Math.min(1, z.emergeTime/1.5);
    const ud = z.mesh.userData;
    const joints = ud.joints;
    const anim = z.anim;
    const alerted = z.alertedUntil > now;

    const hasJoints = joints && joints.head && joints.pelvis
                   && joints.spineLower && joints.spineUpper
                   && joints.spineUpper && joints.neck;

    const hpFrac = z.health / z.maxHealth;
    const hpSpeedMul = 0.6 + 0.4 * Math.max(0, Math.min(1, (hpFrac - 0.5) / 0.25));

    z.growlCooldown -= dt;
    if (z.growlCooldown <= 0) {
      const mult = (z.typeKey === 'worker' || z.typeKey === 'miner') ? 0.25 : 1;
      z.growlCooldown = (1 + Math.random() * 1) / mult;
      Sfx.playGroan();
    }

    const lostBothLegs = z.dismembered.legL && z.dismembered.legR;
    const crawlTarget = lostBothLegs || z.type.startsCrawling ? 1 : 0;
    anim.crawlBlend = smoothDamp(anim.crawlBlend, crawlTarget, 4, dt);
    const crawl = anim.crawlBlend;
    z.crawling = crawl > 0.5;

    const targetAlertBlend = alerted ? 1 : 0;
    anim.alertBlend += (targetAlertBlend - anim.alertBlend) * Math.min(1, dt*4);
    const hunt = anim.alertBlend;

    const dxP = player.position.x - z.mesh.position.x;
    const dzP = player.position.z - z.mesh.position.z;
    const dist = Math.hypot(dxP, dzP);
    const staggering = z.hitReactEndTime > now || z.aiState === 'STAGGER';

    const speedFactorCrawl = 1 - crawl * (1 - CONFIG.crawl.speedMul);
    const attackRangeCrawl = 1 - crawl * (1 - CONFIG.crawl.attackRangeMul);
    const cooldownCrawl = 1 + crawl * (CONFIG.crawl.cooldownMul - 1);

    if (z.type.teleport && now > z.teleportCd && dist > 3 && dist < 25 && Math.random() < dt * 0.4) {
      z.mesh.position.x += dxP * 0.7;
      z.mesh.position.z += dzP * 0.7;
      z.teleportCd = now + 5;
      spawnBlood(z.mesh.position.clone().setY(1), null, 10, true);
    }
    if (z.type.summon && now > z.summonCd && zombies.length < CONFIG.wave.maxZombies) {
      z.summonCd = now + 8;
      for (let s = 0; s < 2; s++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 1.5 + Math.random();
        const sx = z.mesh.position.x + Math.cos(ang)*r;
        const sz = z.mesh.position.z + Math.sin(ang)*r;
        const typeKey = pickZombieType(Math.max(1, state.wave - 2));
        const type = window.ZOMBIE_TYPES_FROM_MODULE ? window.ZOMBIE_TYPES_FROM_MODULE[typeKey] : { hpMul:1, dmgMul:1, speedMul:1, xpMul:1, coinMul:1, scale:1, attackRange:1.6, cooldown:1.2 };
        const mesh = createZombieMesh({ type: typeKey });
        mesh.position.set(sx, 0, sz);
        scene.add(mesh);
        const minion = {
          id:nextId('z'), mesh,
          health:CONFIG.zombie.maxHealth * type.hpMul * 0.5,
          maxHealth:CONFIG.zombie.maxHealth * type.hpMul * 0.5,
          damage:CONFIG.zombie.damage * type.dmgMul * 0.6,
          speed:CONFIG.zombie.speed * type.speedMul, scale:type.scale, radius:CONFIG.zombie.radius*type.scale,
          attackRange:type.attackRange, attackCooldown:type.cooldown,
          xpReward:5, coinReward:1, isBoss:false, typeKey, type, tier:type.tier,
          lastAttackTime:0, walkPhase:Math.random()*Math.PI*2,
          hitReactEndTime:0, hitDirection:new THREE.Vector3(),
          dismembered:{ head:false, armL:false, armR:false, legL:false, legR:false },
          emergeTime:0, anim:makeAnimState(),
          headLoll:mesh.userData.headLoll, headPitchBase:mesh.userData.headPitchBase,
          armDroopL:mesh.userData.armDroopL, armDroopR:mesh.userData.armDroopR,
          limpAmount:mesh.userData.limpAmount, limpSide:mesh.userData.limpSide, walkStyle:mesh.userData.walkStyle,
          vx:0, vz:0, yawVel:0, alertedUntil:0, dying:false,
          idlePhase:Math.random()*Math.PI*2,
          attackWindupActive:false, attackWindupEnd:0,
          _prevX:sx, _prevZ:sz,
          flinch:{ head:null, armL:null, armR:null, legL:null, legR:null, torso:null },
          crawling:false, growlCooldown: 3 + Math.random() * 2,
          aggroSoundCooldown: 0, _wasAlerted: false,
          _forceGroan: false, _groundTime: 0,
        };
        setupZombieAnimator(minion);
        initStuckState(minion);
        ZombieAI.initZombieAIState(minion);
        zombies.push(minion); state.zombiesAlive++;
      }
    }

    const targetYaw = Math.atan2(dxP, dzP);
    let yawDiff = targetYaw - z.mesh.rotation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI*2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI*2;
    const yawStep = yawDiff * Math.min(1, dt*7);
    z.mesh.rotation.y += yawStep;
    z.yawVel = yawStep / Math.max(dt, 0.001);

    const arrival = z.attackRange * attackRangeCrawl + CONFIG.pursuit.arrivalRadius;
    const alertMul = alerted ? CONFIG.aggro.alertSpeedMult : 1;
    let desiredVx = 0, desiredVz = 0;

    if (aiDir && (aiDir.x !== 0 || aiDir.z !== 0) && !staggering && emerge >= 0.5) {
      if (dist > arrival) {
        const target = z.speed * hpSpeedMul * alertMul * speedFactorCrawl * aiMult;
        desiredVx = aiDir.x * target;
        desiredVz = aiDir.z * target;
      }
    }

    const k = 1 - Math.exp(-dt * CONFIG.pursuit.responsiveness * (alerted ? 1.3 : 1));
    z.vx += (desiredVx - z.vx) * k;
    z.vz += (desiredVz - z.vz) * k;

    if (staggering) {
      const lean = (z.hitReactEndTime - now) / CONFIG.zombie.knockbackStagger;
      z.vx *= Math.pow(0.85, dt*60/Math.max(0.1, lean+0.1));
      z.vz *= Math.pow(0.85, dt*60/Math.max(0.1, lean+0.1));
      z.vx -= z.hitDirection.x * dt * 5 * lean;
      z.vz -= z.hitDirection.z * dt * 5 * lean;
    }

    z.mesh.position.x += z.vx * dt;
    z.mesh.position.z += z.vz * dt;
    resolveWallCollisions(z.mesh.position, z.radius);

    if (!z.type.flight) {
      updateStuckDetection(z, dt, world);
      applyStuckPhysics(z, dt);
    }

    const realDx = z.mesh.position.x - z._prevX;
    const realDz = z.mesh.position.z - z._prevZ;
    const realSpeed = Math.hypot(realDx, realDz) / Math.max(dt, 0.001);
    z._prevX = z.mesh.position.x;
    z._prevZ = z.mesh.position.z;

    if (!hasJoints) {
      if (z.mixer) updateZombieAnim(z, dt);
    } else {
      const speedNorm = Math.min(1.5, realSpeed / Math.max(0.01, z.speed));
      const walkStyle = z.walkStyle;
      const shuffling = dist < 3.0;

      const accelX = (z.vx - anim.bodyAccelX) / Math.max(dt, 0.001);
      const accelZ = (z.vz - anim.bodyAccelZ) / Math.max(dt, 0.001);
      anim.bodyAccelX = z.vx;
      anim.bodyAccelZ = z.vz;
      anim.bankX = smoothDamp(anim.bankX, Math.max(-1, Math.min(1, accelX * 0.03)), 8, dt);
      anim.bankZ = smoothDamp(anim.bankZ, Math.max(-1, Math.min(1, accelZ * 0.03)), 8, dt);

      const strideLength = 0.85;
      const idealCadence = (realSpeed / strideLength) * Math.PI * 2 + 0.4;
      anim.cadenceSmooth = smoothDamp(anim.cadenceSmooth, idealCadence, 6, dt);
      const styleMul = (1 - walkStyle*0.35) * (shuffling ? 1.35 : 1.0) * (alerted ? 1.15 : 1);
      anim.walkPhaseSmooth += dt * anim.cadenceSmooth * styleMul * emerge;
      const phase = anim.walkPhaseSmooth;

      anim.crawlPhase += dt * (anim.cadenceSmooth * 0.55 + 1.4) * emerge;
      const crawlCycle = Math.sin(anim.crawlPhase);
      const crawlCycle2 = Math.sin(anim.crawlPhase + Math.PI);

      const idleTarget = 1 - smoothstep(Math.min(1, realSpeed / 0.6));
      anim.idleBlend = smoothDamp(anim.idleBlend, idleTarget, 3, dt);
      const idle = anim.idleBlend;

      z.idlePhase += dt * 1.4;
      const breathe = Math.sin(z.idlePhase) * 0.5 + Math.sin(z.idlePhase * 0.37 + 1.3) * 0.5;
      const idleSway = Math.sin(z.idlePhase * 0.6 + walkStyle * 6.28) * 0.015;

      const legLPhase = (phase / (Math.PI * 2)) % 1;
      const legRPhase = ((phase + Math.PI) / (Math.PI * 2)) % 1;
      const inStanceL = (legLPhase > 0.35 && legLPhase < 0.65) ? 1 : 0;
      const inStanceR = (legRPhase > 0.35 && legRPhase < 0.65) ? 1 : 0;
      anim.plantPhaseL = smoothDamp(anim.plantPhaseL, inStanceL, 18, dt);
      anim.plantPhaseR = smoothDamp(anim.plantPhaseR, inStanceR, 18, dt);

      const stepL = Math.sin(phase), stepR = Math.sin(phase + Math.PI);
      const speedAmp = 0.35 + smoothstep(Math.min(1, speedNorm)) * 0.65;
      const legAmp = (0.5 + walkStyle * 0.2) * speedAmp * (1 + hunt * 0.15);
      let legL = stepL * legAmp;
      let legR = stepR * legAmp;

      let thighLTarget = legL, thighRTarget = legR;
      const kneeAmp = 0.85 * (0.4 + speedNorm * 0.6);
      thighLTarget *= (1 - anim.plantPhaseL * 0.55);
      thighRTarget *= (1 - anim.plantPhaseR * 0.55);
      let kneeLTarget = Math.max(0, stepL) * kneeAmp + 0.06 + walkStyle * 0.18;
      let kneeRTarget = Math.max(0, stepR) * kneeAmp + 0.06 + walkStyle * 0.18;
      let footLTarget = -stepL * 0.35 * (1 + walkStyle * 0.4);
      let footRTarget = -stepR * 0.35 * (1 + walkStyle * 0.4);
      footLTarget *= (1 - anim.plantPhaseL * 0.7);
      footRTarget *= (1 - anim.plantPhaseR * 0.7);

      let pelvisRollTarget = -Math.cos(phase) * 0.09 * speedNorm;
      let pelvisTwistTarget = stepL * 0.18 * speedNorm;
      let pelvisBobTarget = -Math.abs(Math.sin(phase)) * 0.04 * speedNorm - 0.008 * speedNorm;
      let pelvisYTmp = P_PELVIS_Y;
      let spineTwistTarget = -stepL * 0.13 * speedNorm;
      const leanBase = hpFrac < 0.5 ? 0.22 : 0.10;
      let spineLeanTarget = leanBase + (dist < 3 ? 0.10 : 0) + speedNorm * 0.05;
      let spineSideTarget = Math.cos(phase) * 0.06 * speedNorm;
      let spineRollTarget = 0;
      let headRollTarget = z.headLoll + Math.cos(phase) * 0.07 * speedNorm + anim.bankZ * 2.0;
      let headTwistTarget = spineTwistTarget * 0.4 + stepL * 0.05 * speedNorm;
      let headPitchTarget = z.headPitchBase + speedNorm * 0.10 + (dist < 3 ? 0.15 : 0);

      if (crawl > 0.001) {
        pelvisYTmp = P_PELVIS_Y * (1 - crawl) + 0.28 * crawl;
        spineLeanTarget = spineLeanTarget * (1 - crawl) + 1.35 * crawl;
        thighLTarget = thighLTarget * (1 - crawl) + (-0.15) * crawl;
        thighRTarget = thighRTarget * (1 - crawl) + (-0.15) * crawl;
        kneeLTarget = kneeLTarget * (1 - crawl) + 0.35 * crawl;
        kneeRTarget = kneeRTarget * (1 - crawl) + 0.35 * crawl;
        footLTarget = footLTarget * (1 - crawl) + 0.5 * crawl;
        footRTarget = footRTarget * (1 - crawl) + 0.5 * crawl;
        pelvisBobTarget = pelvisBobTarget * (1 - crawl) + (crawlCycle * 0.03) * crawl;
        headPitchTarget = headPitchTarget * (1 - crawl) + (-0.5 + crawlCycle * 0.05) * crawl;
      }

      let armLXTarget, armRXTarget;
      if (z.attackWindupActive) {
        const wElapsed = now - (z.attackWindupEnd - 0.30);
        const wT = Math.max(0, Math.min(1, wElapsed / 0.30));
        const windupArm = -0.6 - wT * 0.9;
        armLXTarget = windupArm;
        armRXTarget = windupArm;
        spineLeanTarget -= wT * 0.15 * (1 - crawl);
        headPitchTarget += wT * 0.20 * (1 - crawl);
      } else if (anim.attackPhase === 3) {
        const recT = Math.min(1, (now - anim.attackPhaseT) / 0.25);
        const recArm = -1.2 + recT * 1.2;
        armLXTarget = Math.max(-1.55, recArm);
        armRXTarget = Math.max(-1.55, recArm);
      } else {
        const reaching = dist < 3.5 && !staggering;
        const armAmp = 0.5 * (0.4 + speedNorm * 0.6);
        if (reaching) {
          const reach = -1.55;
          armLXTarget = reach + Math.sin(phase * 2.1 + walkStyle * 6.28) * 0.12;
          armRXTarget = reach + Math.sin(phase * 1.8 + walkStyle * 5.1 + 1.7) * 0.12;
        } else {
          armLXTarget = -stepL * armAmp + z.armDroopL;
          armRXTarget = -stepR * armAmp + z.armDroopR;
        }
      }

      if (crawl > 0.001) {
        const crawlArmL = -1.9 + crawlCycle * 0.9;
        const crawlArmR = -1.9 + crawlCycle2 * 0.9;
        armLXTarget = armLXTarget * (1 - crawl) + crawlArmL * crawl;
        armRXTarget = armRXTarget * (1 - crawl) + crawlArmR * crawl;
      }

      const reaching2 = dist < 3.5 && !staggering && !z.attackWindupActive;
      let elbowLXTarget = reaching2 ? -0.9 : -0.15 - Math.max(0, armLXTarget) * 0.4;
      let elbowRXTarget = reaching2 ? -0.9 : -0.15 - Math.max(0, armRXTarget) * 0.4;

      if (crawl > 0.001) {
        const crawlElbowL = -0.2 - Math.max(0, crawlCycle) * -0.5;
        const crawlElbowR = -0.2 - Math.max(0, crawlCycle2) * -0.5;
        elbowLXTarget = elbowLXTarget * (1 - crawl) + crawlElbowL * crawl;
        elbowRXTarget = elbowRXTarget * (1 - crawl) + crawlElbowR * crawl;
      }

      if (idle > 0.01 && crawl < 0.5) {
        const inv = (1 - idle) * (1 - crawl);
        spineLeanTarget = spineLeanTarget * (1 - inv) + (0.06 + breathe * 0.02) * inv;
        spineSideTarget = spineSideTarget * (1 - inv) + idleSway * inv;
        spineTwistTarget *= (1 - inv);
        headTwistTarget = headTwistTarget * (1 - inv) + Math.sin(z.idlePhase * 0.4) * 0.15 * inv;
        headPitchTarget = headPitchTarget * (1 - inv) + (z.headPitchBase + breathe * 0.03) * inv;
        armLXTarget = armLXTarget * (1 - inv) + (z.armDroopL + breathe * 0.02) * inv;
        armRXTarget = armRXTarget * (1 - inv) + (z.armDroopR + breathe * 0.02) * inv;
        pelvisBobTarget = pelvisBobTarget * (1 - inv) + breathe * 0.008 * inv;
      }
      if (hunt > 0.01 && !z.attackWindupActive) {
        spineLeanTarget -= hunt * 0.08 * (1 - crawl);
        headPitchTarget += hunt * 0.25 * (1 - crawl);
        armLXTarget -= hunt * 0.25 * (1 - crawl);
        armRXTarget -= hunt * 0.25 * (1 - crawl);
      }

      if (z.mixer) {
        updateZombieAnim(z, dt);
        handleZombieAnimState(z, realSpeed);
      } else if (skipVisual) {
        joints.pelvis.position.y = pelvisYTmp + anim.pelvisBob;
      } else {
        springStep(anim, 'bankX', 0, K_BANK, C_BANK, dt);
        springStep(anim, 'bankZ', -z.yawVel*0.05*speedNorm, K_BANK, C_BANK, dt);
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
        springStep(anim, 'headRoll', headRollTarget, K_HEAD*0.7, C_HEAD, dt);
        springStep(anim, 'headPitch', headPitchTarget, K_HEAD, C_HEAD, dt);
        springStep(anim, 'armLX', armLXTarget, K_ARM, C_ARM, dt);
        springStep(anim, 'armRX', armRXTarget, K_ARM, C_ARM, dt);
        springStep(anim, 'elbowLX', elbowLXTarget, K_ELBOW, C_ELBOW, dt);
        springStep(anim, 'elbowRX', elbowRXTarget, K_ELBOW, C_ELBOW, dt);

        joints.pelvis.rotation.z = anim.pelvisRoll;
        joints.pelvis.rotation.y = anim.pelvisTwist;
        joints.pelvis.position.y = pelvisYTmp + anim.pelvisBob;
        joints.spineLower.rotation.x = anim.spineLean*0.4;
        joints.spineLower.rotation.z = anim.spineRoll*0.4 + anim.spineSide*0.3 + anim.bankZ;
        joints.spineUpper.rotation.y = anim.spineTwist;
        joints.spineUpper.rotation.x = anim.spineLean*0.6;
        joints.spineUpper.rotation.z = anim.spineRoll*0.6 + anim.spineSide*0.7 + anim.bankZ*0.5;
        joints.neck.rotation.y = anim.headTwist*0.4;
        joints.neck.rotation.x = anim.headPitch*0.3;
        joints.head.rotation.y = anim.headTwistLag;
        joints.head.rotation.z = anim.headRollLag;
        joints.head.rotation.x = anim.headPitchLag;
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

        applyLookAt(z, joints, player, dt, alerted);
        applyFootIK(z, joints, anim, dt);
        applyBodyLean(z, joints, player, dt, alerted);
      }
    }

    if (z.dismembered.head && !z.dying) {
      z.dying = true;
      Sfx.playZombieDeath();
      state.zombiesAlive--;
      const idx = zombies.indexOf(z);
      if (idx >= 0) zombies.splice(idx, 1);
      startRagdoll(z.mesh, new THREE.Vector3(dxP, 0, dzP).normalize(), 1.0, z.dismembered);
      updateHUD();
      continue;
    }

    // 🎯 Spitter/boomer NÃO causam dano por contato
    const dealsContactDamage = ZombieAI.shouldDealContactDamage(z);

    if (dealsContactDamage &&
        emerge >= 0.5 && !staggering && !z.attackWindupActive && anim.attackPhase === 0
        && now - z.lastAttackTime > z.attackCooldown * cooldownCrawl
        && dist < z.attackRange * attackRangeCrawl + 0.3) {
      z.attackWindupActive = true;
      z.attackWindupEnd = now + 0.30;
      anim.attackPhase = 1;
      springKick(anim, 'armLXVel', -3);
      springKick(anim, 'armRXVel', -3);
    }
    if (z.attackWindupActive && now >= z.attackWindupEnd && dealsContactDamage) {
      z.attackWindupActive = false;
      z.lastAttackTime = now;
      anim.attackPhase = 2;
      anim.attackPhaseT = now;
      springKick(anim, 'armLXVel', 28);
      springKick(anim, 'armRXVel', 28);
      if (dist < z.attackRange * attackRangeCrawl + 0.5) {
        if (state.downed) { state.downedHP -= z.damage*0.8; }
        else {
          const invuln = performance.now()/1000 < state.invulnUntil;
          if (!invuln) {
            const dm = z.damage * (1 - state.damageReduction);
            state.health -= dm;
            survival.onPlayerHit(dm);
            bus.emit(Ev.PLAYER_HIT, { playerId:player.id, attackerId:z.id, amount:dm, pos:{ x:z.mesh.position.x, y:1, z:z.mesh.position.z } });
          }
        }
        Sfx.playPlayerHurt(); showDamageFlash(); addShake(0.15); updateHUD();
        if (state.health <= 0 && !state.downed && performance.now()/1000 >= state.invulnUntil) enterDownedState();
      }
    }
    if (staggering && z.attackWindupActive && dealsContactDamage) z.attackWindupActive = false;

    if (anim.attackPhase === 2 && now - anim.attackPhaseT > 0.12) {
      anim.attackPhase = 3;
      anim.attackPhaseT = now;
    }
    if (anim.attackPhase === 3 && now - anim.attackPhaseT > 0.25) {
      anim.attackPhase = 0;
    }
  }

  zCollGrid.clear();
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z.health <= 0) continue;
    zCollGrid.insert(z, z.mesh.position.x, z.mesh.position.z);
  }
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i];
    if (a.health <= 0) continue;
    const near = zCollGrid.query(a.mesh.position.x, a.mesh.position.z, a.radius + 0.6);
    for (let n = 0; n < near.length; n++) {
      const b = near[n];
      if (b === a || b.health <= 0) continue;
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const d2 = dx*dx + dz*dz;
      const minD = a.radius + b.radius;
      if (d2 < minD*minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const massA = a.scale*a.scale, massB = b.scale*b.scale;
        const totalMass = massA + massB;
        const overlap = minD - d;
        const pushA = overlap * (massB/totalMass);
        const pushB = overlap * (massA/totalMass);
        const nx = dx/d, nz = dz/d;
        a.mesh.position.x -= nx*pushA; a.mesh.position.z -= nz*pushA;
        b.mesh.position.x += nx*pushB; b.mesh.position.z += nz*pushB;
        a.vx -= nx*pushA*3; a.vz -= nz*pushA*3;
        b.vx += nx*pushB*3; b.vz += nz*pushB*3;
      }
    }
  }
}

// ============================================================
// DOORS / PICKUPS
// ============================================================
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

let nearWeapon = null;
const promptEl = document.getElementById('prompt');
const promptText = document.getElementById('prompt-text');

function spawnWeaponPickup(weaponId, x, z, y = 0.9, isDrop = false) {
  const spriteHandle = spawnPickup3D(scene, {
    weaponId, x, z, y: y + 0.3, isDrop, spinSpeed: 1.2, bobAmp: 0.08,
  });
  world.weaponSpots.push({
    x, y, z,
    mesh: spriteHandle.group,
    spriteHandle,
    ring: spriteHandle.ring,
    weaponId, bought: false,
    baseY: y + 0.3, isDrop,
  });
}
function setupWeaponSpawns() {
  // 🎯 Spawns baseados nos POIs
  const houses = [
    { x:-14, z:-14 }, { x:14, z:-14 }, { x:-14, z:14 }, { x:14, z:14 },
    { x:-28, z:-8 }, { x:28, z:-8 }, { x:-28, z:8 }, { x:28, z:8 },
    { x:-8, z:-28 }, { x:8, z:-28 }, { x:-8, z:28 }, { x:8, z:28 },
  ];
  const meleePool = ['woodenClub', 'pipe', 'cleaver', 'shovel', 'kukri'];
  houses.slice(0, 5).forEach((h, i) => spawnWeaponPickup(meleePool[i % meleePool.length], h.x + 2, h.z + 0.5, 0.95));
  const pool = ['pistol', 'pistol', 'smg', 'shotgun', 'revolver', 'rifle', 'launcher'];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  houses.slice(5).forEach((h, i) => spawnWeaponPickup(shuffled[i % shuffled.length], h.x - 2, h.z + 0.5, 0.95));

  // 🎯 Weapon spawns especiais por POI
  // Delegacia: armas de fogo de alta qualidade
  if (world.pois && world.pois.police) {
    const p = world.pois.police;
    spawnWeaponPickup('rifle', p.x, p.z, 0.95);
    spawnWeaponPickup('shotgun', p.x + 3, p.z, 0.95);
  }
  // Hospital: armas de suporte
  if (world.pois && world.pois.hospital) {
    const p = world.pois.hospital;
    spawnWeaponPickup('smg', p.x, p.z, 0.95);
    spawnWeaponPickup('pistol', p.x + 3, p.z, 0.95);
  }
  // Igreja: reaperScythe raro
  if (world.pois && world.pois.church) {
    const p = world.pois.church;
    spawnWeaponPickup('katana', p.x, p.z, 0.95);
  }
}

function spawnCorpsesAroundMap() {
  const types = listCorpseTypes();
  if (types.length === 0) {
    console.log('[corpse] nenhum GLB disponível, pulando cadáveres');
    return;
  }

  const spots = [
    { x: -18, z: -12, rot: 0.4 },
    { x:  14, z: -16, rot: -1.1 },
    { x: -22, z:  10, rot: 1.7 },
    { x:   8, z:  20, rot: 2.3 },
    { x: -25, z: -22, rot: -0.6 },
    { x:  22, z:  22, rot: 0.9 },
    { x:   0, z: -28, rot: 3.0 },
    { x: -30, z:   5, rot: -2.0 },
    { x:  16, z:   5, rot: 1.2 },
    { x:  -6, z: -20, rot: 2.7 },
  ];

  if (!world._corpses) world._corpses = [];

  for (const spot of spots) {
    const typeId = types[Math.floor(Math.random() * types.length)];
    const corpse = createCorpse(typeId);
    if (!corpse) continue;

    const wrapper = new THREE.Group();
    wrapper.position.set(spot.x, 0.06, spot.z);
    wrapper.rotation.y = spot.rot;

    corpse.rotation.x = -Math.PI / 2;
    corpse.position.y = 0.05;

    wrapper.add(corpse);
    scene.add(wrapper);
    world._corpses.push(wrapper);
  }
  console.log(`[corpse] ${world._corpses.length} cadáveres espalhados`);
}

function updateWeaponPickups(dt) {
  updatePickups3D(dt, camera);

  let closest = null, closestDist = 2.0;
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
    promptEl.classList.remove('hidden');
    if (closest.isDrop) promptText.innerHTML = `Pegar <span style="color:${color}">${w.name}</span> (DROP)`;
    else promptText.innerHTML = `Comprar <span style="color:${color}">${w.name}</span> — <span style="color:${color}">$${Math.round(w.cost * state.shopDiscount)}</span>`;
    return;
  }
  const dxB = player.position.x - brazierGroup.position.x;
  const dzB = player.position.z - brazierGroup.position.z;
  const nearBrazier = Math.sqrt(dxB*dxB + dzB*dzB) < 3.0;
  if (nearBrazier && !state.shopOpen) {
    promptEl.classList.remove('hidden');
    if (state.brazierBurning) promptText.innerHTML = `Brazeiro <span style="color:#ff6600">ACESO</span>`;
    else if (state.brazierFuel > 0) promptText.innerHTML = `Acender brazeiro (combustível: <span style="color:#ffdd00">${state.brazierFuel}</span>)`;
    else promptText.innerHTML = `Brazeiro sem combustível`;
    return;
  }
  if (state.vendorVanActive && !state.shopOpen) {
    const dxV = player.position.x - vendorVan.position.x;
    const dzV = player.position.z - vendorVan.position.z;
    if (Math.sqrt(dxV*dxV + dzV*dzV) < 4.0) {
      promptEl.classList.remove('hidden');
      promptText.innerHTML = `Abrir <span style="color:#ffdd00">VENDEDOR AMBULANTE</span>`;
      return;
    }
  }
  promptEl.classList.add('hidden');
}
function tryBuyWeapon() {
  if (!nearWeapon || nearWeapon.bought) return;
  const w = WEAPONS[nearWeapon.weaponId];
  // 🎯 PERK: shop discount
  const finalCost = Math.round(w.cost * state.shopDiscount);
  if (!nearWeapon.isDrop && state.coins < finalCost) { Sfx.playPlayerHurt(); return; }
  if (!nearWeapon.isDrop) state.coins -= finalCost;
  state.inventory[w.slot] = nearWeapon.weaponId;
  if (w.type === 'ranged') {
    // 🎯 PERK: reserve ammo bonus
    const reserveBonus = Math.floor(w.reserveMax * state.reserveAmmoBonus);
    state.ammo[w.id] = { mag: w.magSize, reserve: Math.min(w.reserveMax * 2, w.reserveMax + reserveBonus) };
  }
  nearWeapon.bought = true;

  if (nearWeapon.spriteHandle) nearWeapon.spriteHandle.dispose();

  if (state.currentSlot === w.slot) setWeaponViewModel(nearWeapon.weaponId);
  else switchToSlot(w.slot);
  Sfx.playBuy();
  bus.emit(Ev.WEAPON_BUY, { playerId:player.id, weaponId:w.id, cost:nearWeapon.isDrop ? 0 : finalCost, slot:w.slot });
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
// POI DISCOVERY
// ============================================================
let poiNotifTimer = null;
function showPOINotification(name, subtitle) {
  let el = document.getElementById('poi-notification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'poi-notification';
    document.body.appendChild(el);
  }
  el.innerHTML = `${name}<span class="poi-name">${subtitle || ''}</span>`;
  el.classList.add('show');
  clearTimeout(poiNotifTimer);
  poiNotifTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function checkPOIDiscovery() {
  if (!world.pois) return;
  for (const id in world.pois) {
    if (state.discoveredPOIs.has(id)) continue;
    const poi = world.pois[id];
    const dx = player.position.x - poi.x;
    const dz = player.position.z - poi.z;
    if (dx*dx + dz*dz < 12*12) {
      state.discoveredPOIs.add(id);
      const names = {
        police:   ['DELEGACIA', 'Autoridades não respondem mais...'],
        hospital: ['HOSPITAL',  'Sala de emergência abandonada.'],
        church:   ['IGREJA',    'Algo sombrio reside aqui.'],
        market:   ['MERCADO',   'Suprimentos ainda nas prateleiras.'],
        gas:      ['POSTO',     'Combustível e abrigo.'],
      };
      const [title, sub] = names[poi.type] || ['ÁREA', ''];
      showPOINotification(title, sub);
      bus.emit(Ev.POI_DISCOVERED, { id, type: poi.type });
      Sfx.playPing();
    }
  }
}

// ============================================================
// HUD
// ============================================================
function updateHUD() {
  const hp = Math.max(0, state.health);
  document.getElementById('hp-fill').style.width = `${(hp/state.maxHealth)*100}%`;
  document.getElementById('hp-text').textContent = `${Math.ceil(hp)} / ${state.maxHealth}`;
  document.getElementById('xp-fill').style.width = `${(state.xp/state.xpToNextLevel)*100}%`;
  document.getElementById('coins').textContent = state.coins;
  document.getElementById('wave').textContent = state.wave;
  document.getElementById('level').textContent = state.level;
  document.getElementById('zombies').textContent = state.zombiesAlive;
  document.getElementById('revives').textContent = state.revivesLeft;
  const w = WEAPONS[state.inventory[state.currentSlot] || 'knife'];
  document.getElementById('weapon-name').textContent = w.name;
  const classEl = document.getElementById('weapon-class');
  if (classEl) {
    if (w.type === 'ranged') classEl.textContent = w.className || '';
    else classEl.textContent = w.meleeTypeName || '';
  }
  const ttEl = document.getElementById('weapon-tooltip');
  if (ttEl) ttEl.innerHTML = formatWeaponTooltip(w);
  const ammoEl = document.getElementById('ammo-current');
  const reserveEl = document.getElementById('ammo-reserve');
  if (w.type === 'melee') { ammoEl.textContent = '∞'; reserveEl.textContent = ''; }
  else {
    const am = state.ammo[w.id];
    if (am) {
      if (state.reload.active && state.reload.wid === w.id) {
        const pct = Math.floor(Math.min(1, (performance.now()/1000 - state.reload.startTime) / state.reload.duration) * 100);
        ammoEl.textContent = 'RECARREGANDO ' + pct + '%'; ammoEl.style.color = '#ffdd00';
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
  const now = performance.now()/1000;
  if (performance.now() < state.hitstopUntil) { renderer.render(scene, camera); return; }
  if (muzzleLight.intensity > 0) {
    const remain = muzzleLightEnd - now;
    if (remain <= 0) muzzleLight.intensity = 0;
    else muzzleLight.intensity = 3 * (remain/0.08);
  }
  if (state.running && !state.levelUpActive && !state.paused && !state.shopOpen) {
    updateReload(now);
    updatePlayer(dt);
    resolvePlayerZombieCollision();
    updateZombies(dt);
    updateZombieLOD();
    BossAI.updateBossAI(dt, zombies);
    updateParticles(dt);
    updateBloodPools(dt);
    updateBloodFountains(dt);
    updateTracers(dt);
    updateDoors(dt);
    updateWeaponPickups(dt);
    updateVendorVan();
    checkWaveComplete();
    stepPhysics(dt);
    updateRagdolls(dt);
    updateFlyingLimbs(dt);
    checkDebrisZombieCollision();
    updateDownedState(dt);
    updatePings(dt);
    survival.update(dt, state);
    updateExplosions(dt);
    updateNoiseRipples(dt);

    Daytime.updateDaytime(dt);
    Gore.updateGore(dt);
    Extraction.updateExtraction(dt);
    updateBossProjectiles(dt);

    // 🎯 POI discovery
    checkPOIDiscovery();

    if (state.downed) {
      weaponView.setVisible(false);
    } else {
      weaponView.setVisible(true);
      weaponView.update(dt, {
        aiming: state.aiming,
        moving: state.isMoving,
        bobTime: state.bobTime,
        mouseDX: state.mouseDX,
        mouseDY: state.mouseDY,
      });
      state.mouseDX *= 0.75;
      state.mouseDY *= 0.75;
    }

    if (state.mouseDown && !state.reload.active) {
      const wid = state.inventory[state.currentSlot] || 'knife';
      const w = WEAPONS[wid];
      if (w.auto) { if (!state.downed || wid === 'pistol') attack(false); }
    }
    const targetFov = state.aiming ? 50 : 78;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt*15);
    camera.updateProjectionMatrix();
    shadowFrame++;
    if (shadowFrame >= 20) { renderer.shadowMap.needsUpdate = true; shadowFrame = 0; }
    const elapsed = Math.floor((performance.now() - state.startTime)/1000);
    const m = Math.floor(elapsed/60);
    const s = (elapsed % 60).toString().padStart(2, '0');
    const t = `${m}:${s}`;
    if (t !== lastTimeText) { document.getElementById('timer').textContent = t; lastTimeText = t; }
    const revBtn = document.getElementById('btn-revive');
    if (revBtn) revBtn.classList.toggle('visible', state.downed);
  } else if (!state.running) {
    stepPhysics(dt);
    updateParticles(dt); updateBloodPools(dt); updateBloodFountains(dt); updateTracers(dt);
    updateRagdolls(dt); updateFlyingLimbs(dt); updateExplosions(dt);
    updatePickups3D(dt, camera);
  }
  renderer.render(scene, camera);
}
animate();

// ============================================================
// SKIN SELECTOR UI
// ============================================================
(function initSkinSelector() {
  const optionsEl = document.getElementById('skin-options');
  const previewEl = document.getElementById('skin-perk-preview');
  if (!optionsEl) return;

  const SKINS = [
    { id: 'default',       name: 'PADRÃO',    icon: '👤' },
    { id: 'angel',         name: 'ANJO',      icon: '😇' },
    { id: 'businessMale',  name: 'EXECUTIVO', icon: '💼' },
    { id: 'businessFemale',name: 'EXECUTIVA', icon: '🎯' },
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

    const perk = getPerk(selected);
    previewEl.innerHTML = `
      <span class="perk-name">${perk.icon} ${perk.name}</span>
      ${perk.desc}
    `;
  }

  render();
})();

// ============================================================
// START / GAME OVER
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
  if (!isModelReady()) {
    const btn = document.getElementById('btn-start');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'CARREGANDO...';
      const check = setInterval(() => {
        if (isModelReady()) {
          clearInterval(check);
          btn.disabled = false;
          btn.textContent = 'JOGAR SOLO';
          startGame();
        }
      }, 300);
    }
    return;
  }

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
  state.inventory = { 1:'knife', 2:null, 3:null, 4:null }; state.currentSlot = 1;
  state.mouseDown = false; state.aiming = false; state.shake = 0; state.shopOpen = false;
  state.downed = false; state.downedElapsed = 0; state.downedHP = 0; state.reviveProgress = 0;
  state.revivesLeft = CONFIG.downed.maxRevives; state.invulnUntil = 0;
  state.pingWheelOpen = false; state.pingHighlight = null;
  state.kills = 0; state.headshots = 0; state.damageTotal = 0;
  state.bossSpawned = false;
  state.stamina = CONFIG.player.staminaMax;
  state.hitstopUntil = 0;
  state.isGrounded = true; state.velocityY = 0; state.jumpOffset = 0;
  state.jumpVelX = 0; state.jumpVelZ = 0;
  state.isSprinting = false;
  state.brazierFuel = 1; state.brazierBurning = false;
  state.vendorVanActive = false;
  state.mouseDX = 0; state.mouseDY = 0;
  state.staminaBoostUntil = 0;
  state.discoveredPOIs.clear();
  survival.reset();
  cancelReload();
  state.ammo = {};
  document.body.classList.remove('downed', 'aiming');
  document.getElementById('downed-overlay').classList.add('hidden');
  document.getElementById('ping-wheel').classList.add('hidden');
  document.getElementById('scoreboard').classList.add('hidden');
  document.getElementById('shop').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  pings.forEach(p => { scene.remove(p.group); p.group.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); });
  pings.length = 0;

  // 🎯 APLICA PERK DA SKIN ESCOLHIDA
  const perk = applyPerk(state.playerSkin || 'default', state, player);
  console.log('[game] 🎯 Perk ativada:', perk.name, '—', perk.desc);
  bus.emit(Ev.PERK_ACTIVATED, { perkId: perk.id, name: perk.name });
  showWaveBanner(`${perk.icon} ${perk.name}`);

  world.weaponSpots.forEach(s => { if (s.spriteHandle) s.spriteHandle.dispose(); });
  world.weaponSpots = [];
  clearPickups3D();
  setupWeaponSpawns();

  if (world._corpses) {
    for (const c of world._corpses) scene.remove(c);
  }
  world._corpses = [];
  spawnCorpsesAroundMap();

  zombies.forEach(z => scene.remove(z.mesh));
  zombies.length = 0;
  ragdolls.forEach(r => r.dispose()); ragdolls.length = 0;
  clearPhysics();
  for (const box of world.wallColliders) addStaticBox(box.minX, box.maxX, box.minZ, box.maxZ, 4);
  for (const box of world.furnitureColliders) addStaticBox(box.minX, box.maxX, box.minZ, box.maxZ, 1.2);
  flyingLimbs.forEach(l => l.dispose()); flyingLimbs.length = 0;
  bloodActive.forEach(p => scene.remove(p.mesh)); bloodActive.length = 0;
  bloodPool.forEach(p => { scene.remove(p.mesh); p.mesh.material.dispose(); });
  bloodPool.length = 0;
  bloodPools.forEach(b => { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); });
  bloodPools.length = 0;
  bloodFountains.length = 0;
  tracers.forEach(t => { t.mesh.visible = false; tracerPool.push(t); }); tracers.length = 0;
  _noiseRipples.forEach(r => { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
  _noiseRipples.length = 0;
  bossProjectiles.forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
  bossProjectiles.length = 0;
  player.position.set(0, CONFIG.player.height, 0);
  player.yaw = 0; player.pitch = 0;
  player.userData._pendingDamage = 0;

  if (world._npcs) world._npcs.forEach(m => scene.remove(m));
  world._npcs = [];
  const npcList = [
    { id: 'angel',          x: 6,   z: -6,  rotY: -Math.PI * 0.75 },
    { id: 'businessMale',   x: -6,  z: -6,  rotY: -Math.PI * 0.25 },
    { id: 'businessFemale', x: 0,   z: -10, rotY: 0 },
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
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  updateHUD();
  startWave();
}

function gameOver() {
  bus.emit(Ev.PLAYER_DIED, { playerId:player.id, wave:state.wave, level:state.level, coins:state.coins, xp:state.xp });
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
  const elapsed = Math.floor((performance.now() - state.startTime)/1000);
  const m = Math.floor(elapsed/60);
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
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// MP FEEDBACK
// ============================================================
const playerStats = new Map();
playerStats.set(player.id, { id:player.id, name:'VOCÊ', kills:0, headshots:0, damage:0, coins:0, deaths:0, local:true });
const _projV = new THREE.Vector3();
function worldToScreen(pos) {
  _projV.set(pos.x, pos.y, pos.z).project(camera);
  return { x:(_projV.x*0.5 + 0.5)*window.innerWidth, y:(-_projV.y*0.5 + 0.5)*window.innerHeight, visible:_projV.z < 1 && _projV.z > -1 };
}
function ensureStats(id) {
  let s = playerStats.get(id);
  if (!s) { s = { id, name:id === player.id ? 'VOCÊ' : (id.startsWith('p-') ? 'JOGADOR' : 'INIMIGO'), kills:0, headshots:0, damage:0, coins:0, deaths:0, local:id === player.id }; playerStats.set(id, s); }
  return s;
}
function nameOf(id) {
  if (typeof id !== 'string') return '???';
  if (id.startsWith('z-')) return 'ZUMBI';
  if (id === player.id) return 'VOCÊ';
  return ensureStats(id).name;
}
const damageNumbersEl = document.getElementById('damage-numbers');
const DAMAGE_NUMBERS_MAX = 40;
let damageNumbersActive = 0;

function spawnDamageNumber(worldPos, amount, kind) {
  const screen = worldToScreen(worldPos);
  if (!screen.visible) return;
  while (damageNumbersActive >= DAMAGE_NUMBERS_MAX && damageNumbersEl.firstChild) {
    damageNumbersEl.removeChild(damageNumbersEl.firstChild);
    damageNumbersActive--;
  }
  const el = document.createElement('div');
  el.className = 'dmg-number dmg-' + kind;
  el.textContent = Math.round(amount);
  const jX = (Math.random()-0.5)*30, jY = (Math.random()-0.5)*15;
  el.style.left = (screen.x + jX) + 'px';
  el.style.top = (screen.y + jY) + 'px';
  damageNumbersEl.appendChild(el);
  damageNumbersActive++;
  setTimeout(() => {
    if (el.parentNode) { el.parentNode.removeChild(el); damageNumbersActive--; }
  }, 850);
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
  const list = [...playerStats.values()].sort((a,b) => (b.kills !== a.kills) ? b.kills - a.kills : b.damage - a.damage);
  scoreboardBody.innerHTML = '';
  list.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = s.local ? 'local-row' : '';
    tr.innerHTML = `<td>${s.name}</td><td>${s.kills}</td><td>${s.headshots}</td><td>${Math.round(s.damage)}</td><td>${s.coins}</td>`;
    scoreboardBody.appendChild(tr);
  });
}
document.addEventListener('keydown', e => {
  if (e.code === controls.getKey(Action.Scoreboard) && state.running && !state.paused) {
    e.preventDefault();
    if (!scoreboardOpen) { scoreboardOpen = true; renderScoreboard(); scoreboardEl.classList.remove('hidden'); }
  }
});
document.addEventListener('keyup', e => {
  if (e.code === controls.getKey(Action.Scoreboard) && scoreboardOpen) {
    e.preventDefault(); scoreboardOpen = false; scoreboardEl.classList.add('hidden');
  }
});
window.addEventListener('beforeunload', () => playerStats.clear());
