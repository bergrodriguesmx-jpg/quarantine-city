// ============================================================
// scenery.js — v11.2 "Performance Optimized"
// ============================================================
// OTIMIZAÇÕES v11.2:
//   • gridSize 6 → 4 (36 → 16 quadras)
//   • buildingsPerBlock 3 → 2
//   • islandInnerRadius 280 → 200
//   • Árvores 160 → 70
//   • Props ~400 → ~180
//   • Carros 45 → 18
//   • SPECIAL_POIS reposicionados para ilha menor
// ============================================================

import * as THREE from 'three';
import * as Textures from './textures.js';

const CITY_CONFIG = {
  gridSize: 4,
  blockSize: 70,
  roadWidth: 16,
  sidewalkWidth: 3,
  buildingsPerBlock: 2,
  islandInnerRadius: 200,
  islandBeachWidth: 22,
  islandWaterRadius: 500,
  islandWaterY: -2.5,
  islandSilhouetteAmp: 0.12,
  islandBeachY: 0.08,
};

const GRID_HALF  = (CITY_CONFIG.gridSize * CITY_CONFIG.blockSize) / 2;
const TOTAL_SIZE = CITY_CONFIG.gridSize * CITY_CONFIG.blockSize;

const COMMON_BUILDINGS = [
  { type: 'house',  size: 'small',  weight: 0.45 },
  { type: 'house',  size: 'medium', weight: 0.30 },
  { type: 'house',  size: 'large',  weight: 0.10 },
  { type: 'market', size: 'medium', weight: 0.08 },
  { type: 'gas',    size: 'small',  weight: 0.07 },
];

export const SPECIAL_POIS = [
  { id: 'government', type: 'government', x:    0, z:    0, rot: 0,              size: 'large'  },
  { id: 'military',   type: 'military',   x:  100, z:  100, rot: 0,              size: 'large'  },
  { id: 'hospital',   type: 'hospital',   x: -100, z:  100, rot: 0,              size: 'large'  },
  { id: 'police',     type: 'police',     x:  100, z: -100, rot: 0,              size: 'medium' },
  { id: 'church',     type: 'church',     x: -100, z: -100, rot: 0,              size: 'medium' },
  { id: 'warehouse',  type: 'warehouse',  x:    0, z:  140, rot: Math.PI * 0.25, size: 'large'  },
];
export const POIS = SPECIAL_POIS;

const _geoCache = new Map();
function _cacheGeo(key, factory) {
  let g = _geoCache.get(key);
  if (!g) { g = factory(); _geoCache.set(key, g); }
  return g;
}
export function getBoxGeo(w, h, d) {
  return _cacheGeo(`box:${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`,
    () => new THREE.BoxGeometry(w, h, d));
}
export function getUnitBox()      { return _cacheGeo('unitBox', () => new THREE.BoxGeometry(1, 1, 1)); }
export function getUnitIco()      { return _cacheGeo('unitIco', () => new THREE.IcosahedronGeometry(0.5, 0)); }
export function getUnitCyl(s = 8) { return _cacheGeo(`cyl:${s}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, s)); }
export function getPlaneGeo(w, h) { return _cacheGeo(`plane:${w.toFixed(2)}:${h.toFixed(2)}`, () => new THREE.PlaneGeometry(w, h)); }

function makeWallMat(hex, rU = 3, rV = 2) {
  const t = Textures.houseWallTexture(hex); t.repeat.set(rU, rV);
  return new THREE.MeshLambertMaterial({ map: t });
}
function makeRoofMat(hex, rU = 3, rV = 3) {
  const t = Textures.roofTexture(hex); t.repeat.set(rU, rV);
  return new THREE.MeshLambertMaterial({ map: t, flatShading: true });
}
function makeConcreteMat(rU = 4, rV = 4) {
  const t = Textures.concreteTexture(); t.repeat.set(rU, rV);
  return new THREE.MeshLambertMaterial({ map: t });
}
function makeAsphaltMat(rU = 8, rV = 8) {
  const t = Textures.asphaltTexture(); t.repeat.set(rU, rV);
  return new THREE.MeshLambertMaterial({ map: t });
}

const MATS = {
  wallCream:     makeWallMat('#ECF0F1'),
  wallBrick:     makeWallMat('#8B4513'),
  wallWhite:     makeWallMat('#F5F5F5'),
  wallGray:      makeWallMat('#7F8C8D'),
  wallStone:     makeWallMat('#5D6D7E'),
  wallMilitary:  makeWallMat('#4A5D3F', 4, 2),
  wallGov:       makeWallMat('#D5DBDB', 4, 3),
  wallWarehouse: makeWallMat('#6E5849', 5, 2),
  roofRed:       makeRoofMat('#C0392B'),
  roofGray:      makeRoofMat('#7F8C8D'),
  roofDarkRed:   makeRoofMat('#7B241C'),
  roofBlack:     makeRoofMat('#2C3E50'),
  roofMetal:     makeRoofMat('#55606A', 5, 4),
  wood:          new THREE.MeshLambertMaterial({ color: 0x8B5A2B }),
  darkWood:      new THREE.MeshLambertMaterial({ color: 0x5D4030 }),
  trim:          new THREE.MeshLambertMaterial({ color: 0x4A3527 }),
  marble:        new THREE.MeshLambertMaterial({ color: 0xE8E8E8 }),
  columnStone:   new THREE.MeshLambertMaterial({ color: 0xD8D8D0 }),
  floorTile:     new THREE.MeshLambertMaterial({ color: 0xBDC3C7 }),
  floorWhite:    new THREE.MeshLambertMaterial({ color: 0xD5DBDB }),
  floorCarpet:   new THREE.MeshLambertMaterial({ color: 0x6B4423 }),
  floorMilitary: new THREE.MeshLambertMaterial({ color: 0x596155 }),
  floorGov:      new THREE.MeshLambertMaterial({ color: 0xB8A88A }),
  floorWarehouse:new THREE.MeshLambertMaterial({ color: 0x7A6F60 }),
  metal:         new THREE.MeshLambertMaterial({ color: 0x95A5A6 }),
  darkMetal:     new THREE.MeshLambertMaterial({ color: 0x34495E }),
  gate:          new THREE.MeshLambertMaterial({ color: 0x4A4A4A }),
  cross:         new THREE.MeshLambertMaterial({ color: 0xC0392B }),
  window:        new THREE.MeshLambertMaterial({ color: 0x1C2833 }),
  windowLit:     new THREE.MeshLambertMaterial({ color: 0xFFCC66, emissive: 0x664400 }),
  concrete:      makeConcreteMat(6, 6),
  asphalt:       makeAsphaltMat(10, 10),
  rock:          new THREE.MeshLambertMaterial({ color: 0x5A5A5A, flatShading: true }),
  rockDark:      new THREE.MeshLambertMaterial({ color: 0x3A3A3A, flatShading: true }),
  bush:          new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
  bushDry:       new THREE.MeshLambertMaterial({ color: 0x6E8B3E, flatShading: true }),
  barrel:        new THREE.MeshLambertMaterial({ color: 0x8B4513, flatShading: true }),
  barrelMetal:   new THREE.MeshLambertMaterial({ color: 0x4A5A3A, flatShading: true }),
  crate:         new THREE.MeshLambertMaterial({ color: 0xA0724A, flatShading: true }),
  crateMetal:    new THREE.MeshLambertMaterial({ color: 0x5A6068, flatShading: true }),
  sandbag:       new THREE.MeshLambertMaterial({ color: 0xC8B48A, flatShading: true }),
  pole:          new THREE.MeshLambertMaterial({ color: 0x2A2A2A }),
  poleTop:       new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  lampOn:        new THREE.MeshBasicMaterial({ color: 0xFFEE99 }),
  carBody1:      new THREE.MeshLambertMaterial({ color: 0x8B1E1E }),
  carBody2:      new THREE.MeshLambertMaterial({ color: 0x2C3E50 }),
  carBody3:      new THREE.MeshLambertMaterial({ color: 0x4A4A4A }),
  carBody4:      new THREE.MeshLambertMaterial({ color: 0x2E5E3A }),
  carBody5:      new THREE.MeshLambertMaterial({ color: 0x8A6A2A }),
  militaryTruck: new THREE.MeshLambertMaterial({ color: 0x4A5D3F }),
  tire:          new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  roadLine:      new THREE.MeshBasicMaterial({ color: 0xEEDD44 }),
  crosswalk:     new THREE.MeshBasicMaterial({ color: 0xEEEEEE }),
  barbed:        new THREE.MeshBasicMaterial({ color: 0x303030 }),
  flagRed:       new THREE.MeshLambertMaterial({ color: 0xB03A3A, side: THREE.DoubleSide }),
  flagGreen:     new THREE.MeshLambertMaterial({ color: 0x2A6B3A, side: THREE.DoubleSide }),
  bark: (() => {
    const t = Textures.barkTexture(); t.repeat.set(2, 2);
    return new THREE.MeshLambertMaterial({ map: t });
  })(),
  leafA: new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
  leafB: new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true }),
  leafC: new THREE.MeshLambertMaterial({ color: 0x4F8B2E, flatShading: true }),
  sand: (() => {
    const t = Textures.sandTexture(); t.repeat.set(20, 20);
    return new THREE.MeshLambertMaterial({ map: t });
  })(),
  wetSand: (() => {
    const t = Textures.wetSandTexture(); t.repeat.set(16, 16);
    return new THREE.MeshLambertMaterial({ map: t });
  })(),
  water: (() => {
    const t = Textures.waterTexture(); t.repeat.set(40, 40);
    return new THREE.MeshLambertMaterial({
      map: t, transparent: true, opacity: 0.82,
      color: 0x88B8D8, depthWrite: false,
    });
  })(),
};

const FURNITURE_DB = {
  table:         { w: 1.4, h: 0.75, d: 0.8,  mat: 'wood' },
  chair:         { w: 0.5, h: 0.9,  d: 0.5,  mat: 'wood' },
  bed:           { w: 1.0, h: 0.55, d: 2.0,  mat: 'darkWood' },
  sofa:          { w: 2.2, h: 0.7,  d: 0.9,  mat: 'darkWood' },
  metalShelf:    { w: 0.8, h: 2.4,  d: 0.6,  mat: 'metal' },
  locker:        { w: 0.6, h: 1.9,  d: 0.5,  mat: 'darkMetal' },
  cabinet:       { w: 1.0, h: 2.0,  d: 0.5,  mat: 'darkWood' },
  bookshelf:     { w: 1.6, h: 2.2,  d: 0.35, mat: 'darkWood' },
  desk:          { w: 1.6, h: 0.85, d: 0.9,  mat: 'darkWood' },
  counter:       { w: 2.0, h: 1.0,  d: 0.7,  mat: 'darkWood' },
  medicalBed:    { w: 1.8, h: 0.55, d: 0.9,  mat: 'metal' },
  gurney:        { w: 2.0, h: 0.6,  d: 0.9,  mat: 'metal' },
  vendingMach:   { w: 0.9, h: 1.9,  d: 0.7,  mat: 'metal' },
  altar:         { w: 3.2, h: 1.3,  d: 1.4,  mat: 'darkWood' },
  prisonerBed:   { w: 0.8, h: 0.4,  d: 1.8,  mat: 'darkMetal' },
  console:       { w: 1.5, h: 1.1,  d: 0.6,  mat: 'darkMetal' },
};

const INTERIOR_TEMPLATES = {
  house_small: [
    { t: 'table', x: 0, z: 1.5, rotY: 0 },
    { t: 'chair', x: 0.9, z: 1.5, rotY: Math.PI / 2 },
  ],
  house_medium: [
    { t: 'sofa',  x: -2.0, z: -1.0, rotY: 0 },
    { t: 'table', x:  1.0, z:  1.0, rotY: 0 },
    { t: 'bed',   x: -2.0, z:  2.0, rotY: 0 },
  ],
  house_large: [
    { t: 'bed',     x: -3.0, z: -1.5, rotY: 0 },
    { t: 'cabinet', x: -3.5, z:  2.0, rotY: 0 },
    { t: 'sofa',    x:  1.0, z:  2.5, rotY: 0 },
  ],
  police_office: [
    { t: 'desk',   x:  1.5, z: -2.0, rotY: 0 },
    { t: 'locker', x: -3.0, z: -4.0, rotY: 0 },
  ],
  hospital_room: [
    { t: 'medicalBed', x: -2.5, z: 1.0, rotY: 0 },
    { t: 'gurney',     x:  0.0, z: -3.5, rotY: Math.PI / 2 },
  ],
  gov_office: [
    { t: 'desk',      x: -3.0, z: -2.0, rotY: 0 },
    { t: 'bookshelf', x: -6.0, z:  2.0, rotY: Math.PI / 2 },
  ],
  military_barracks: [
    { t: 'bed',    x: -4.0, z: -2.0, rotY: 0 },
    { t: 'locker', x: -4.0, z:  2.0, rotY: 0 },
  ],
  market_front: [
    { t: 'counter',     x:  0.0, z:  2.5, rotY: 0 },
  ],
  gas_shop: [
    { t: 'metalShelf',  x: -1.5, z: -1.0, rotY: 0 },
  ],
  warehouse_office: [
    { t: 'desk', x: 0, z: 0, rotY: 0 },
  ],
  church_interior: [
    { t: 'altar', x: 0, z: -7, rotY: 0 },
  ],
};

function addBoxMesh(w, h, d, x, y, z, mat, parent, colliderArray, rotY = 0) {
  const m = new THREE.Mesh(getBoxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  if (rotY) m.rotation.y = rotY;
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  if (!colliderArray) return m;

  const parentRy = parent.rotation.y || 0;
  const gx = parent.position.x || 0;
  const gz = parent.position.z || 0;
  const context = (parent.userData && parent.userData.context) || 'solid';
  const owner   = (parent.userData && parent.userData.poiId)   || null;

  let ew = w, ed = d;
  if (rotY !== 0) {
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    ew = w * c + d * s;
    ed = w * s + d * c;
  }
  const cos = Math.cos(parentRy), sin = Math.sin(parentRy);
  const absSin = Math.abs(sin), absCos = Math.abs(cos);

  if (absSin < 0.001) {
    const wx = gx + cos * x + sin * z;
    const wz = gz - sin * x + cos * z;
    colliderArray.push({
      minX: wx - ew / 2, maxX: wx + ew / 2,
      minZ: wz - ed / 2, maxZ: wz + ed / 2,
      context, owner,
    });
    return m;
  }

  const L = Math.max(ew, ed);
  const N = Math.max(2, Math.ceil(L / 0.5));
  const segL = L / N;
  for (let i = 0; i < N; i++) {
    let lx, lz, hw, hd;
    if (ew >= ed) {
      lx = x + (i + 0.5 - N / 2) * segL; lz = z;
      hw = (segL / 2) * absCos + (ed / 2) * absSin;
      hd = (segL / 2) * absSin + (ed / 2) * absCos;
    } else {
      lx = x; lz = z + (i + 0.5 - N / 2) * segL;
      hw = (ew / 2) * absCos + (segL / 2) * absSin;
      hd = (ew / 2) * absSin + (segL / 2) * absCos;
    }
    const wx = gx + cos * lx + sin * lz;
    const wz = gz - sin * lx + cos * lz;
    colliderArray.push({
      minX: wx - hw, maxX: wx + hw,
      minZ: wz - hd, maxZ: wz + hd,
      context, owner,
    });
  }
  return m;
}

function populateInterior(parent, world, templateKey) {
  const template = INTERIOR_TEMPLATES[templateKey];
  if (!template) return;
  for (const slot of template) {
    const def = FURNITURE_DB[slot.t];
    if (!def) continue;
    const mat = MATS[def.mat] || MATS.wood;
    const y = def.h / 2 + 0.06;
    addBoxMesh(def.w, def.h, def.d, slot.x, y, slot.z, mat, parent,
               world.furnitureColliders, slot.rotY || 0);
  }
}

function registerLootSpot(world, x, z, y, type, amount, roomType) {
  world.lootSpots.push({
    x, y, z, type, amount,
    room: roomType || 'generic',
    collected: false,
  });
}

function registerRooftop(world, poiId, x, z, height, hasAccess = false) {
  world.rooftops.push({ poiId, x, z, height, hasAccess });
}

function registerVaultSpot(world, type, shape, p1, p2, perms = {}) {
  world.vaultSpots.push({
    id: type, shape,
    p1: { x: p1[0], y: p1[1], z: p1[2] },
    p2: { x: p2[0], y: p2[1], z: p2[2] },
    outwardPermission: perms.outward || 'any',
    inwardPermission:  perms.inward  || 'any',
    destroyFurniture:  null,
  });
}

function isFreeSpot(x, z, minPOIDist = 10) {
  if (Math.hypot(x, z) < 6) return false;
  for (const poi of SPECIAL_POIS) {
    if (Math.hypot(x - poi.x, z - poi.z) < minPOIDist) return false;
  }
  return true;
}
function isOnRoad(x, z) {
  const half = CITY_CONFIG.roadWidth / 2 + CITY_CONFIG.sidewalkWidth;
  for (let i = 0; i <= CITY_CONFIG.gridSize; i++) {
    const pos = i * CITY_CONFIG.blockSize - GRID_HALF;
    if (Math.abs(x - pos) < half) return true;
    if (Math.abs(z - pos) < half) return true;
  }
  return false;
}

function scatterInstanced(scene, opts) {
  const {
    count, geo, mat, worldExtent,
    minPOIDist = 10,
    radiusMin = 0.35, radiusMax = 0.5,
    baseY = 0, scaleMin = 1, scaleMax = 1,
    rotRandom = true, name = 'prop',
  } = opts;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = name;
  const dummy = new THREE.Object3D();
  let placed = 0, attempts = 0;
  const maxAttempts = count * 30;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const distFrac = radiusMin + Math.random() * (radiusMax - radiusMin);
    const dist = worldExtent * distFrac;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.hypot(x, z) > CITY_CONFIG.islandInnerRadius - 5) continue;
    if (!isFreeSpot(x, z, minPOIDist)) continue;
    if (isOnRoad(x, z)) continue;
    dummy.position.set(x, baseY, z);
    if (rotRandom) dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    else dummy.rotation.set(0, 0, 0);
    const s = scaleMin + Math.random() * (scaleMax - scaleMin);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

function generateIslandSilhouette(baseRadius, segments = 48) {
  const points = [];
  const seed1 = Math.random() * Math.PI * 2;
  const seed2 = Math.random() * Math.PI * 2;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const noise =
      0.6 * Math.sin(angle * 3 + seed1) +
      0.3 * Math.sin(angle * 5 + seed2) +
      0.1 * Math.sin(angle * 7 + seed1 * 1.7);
    const r = baseRadius * (1 + noise * CITY_CONFIG.islandSilhouetteAmp);
    points.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
  }
  return points;
}

function buildIslandTerrain(scene, silhouette) {
  const shape = new THREE.Shape();
  shape.moveTo(silhouette[0].x, -silhouette[0].z);
  for (let i = 1; i < silhouette.length; i++) shape.lineTo(silhouette[i].x, -silhouette[i].z);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 8);
  geo.rotateX(-Math.PI / 2);
  const tex = Textures.grassTexture();
  tex.repeat.set(1 / 4, 1 / 4);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  mesh.name = 'islandTerrain';
  scene.add(mesh);
}

function buildBeachRing(scene, silhouette, innerR, beachW) {
  const shape = new THREE.Shape();
  const outer = silhouette.map(p => {
    const len = Math.hypot(p.x, p.z) || 1;
    const k = (len + beachW) / len;
    return { x: p.x * k, z: p.z * k };
  });
  shape.moveTo(outer[0].x, -outer[0].z);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i].x, -outer[i].z);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(silhouette[0].x, -silhouette[0].z);
  for (let i = 1; i < silhouette.length; i++) hole.lineTo(silhouette[i].x, -silhouette[i].z);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, 8);
  geo.rotateX(-Math.PI / 2);
  const tex = Textures.sandTexture();
  tex.repeat.set(1 / 6, 1 / 6);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.position.y = CITY_CONFIG.islandBeachY;
  mesh.receiveShadow = true;
  mesh.name = 'beachRing';
  scene.add(mesh);
}

function buildWaterPlane(scene) {
  const size = CITY_CONFIG.islandWaterRadius * 2;
  const tex = Textures.waterTexture();
  tex.repeat.set(1 / 12, 1 / 12);
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  const mesh = new THREE.Mesh(geo, MATS.water);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = CITY_CONFIG.islandWaterY;
  mesh.receiveShadow = true;
  mesh.name = 'waterPlane';
  scene.add(mesh);
}

function buildIslandRockBorder(scene, silhouette) {
  const count = 100;
  const mesh = new THREE.InstancedMesh(getUnitIco(), MATS.rock, count);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'rockBorder';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const t = (i / count) * silhouette.length;
    const idx = Math.floor(t) % silhouette.length;
    const nextIdx = (idx + 1) % silhouette.length;
    const frac = t - Math.floor(t);
    const px = silhouette[idx].x * (1 - frac) + silhouette[nextIdx].x * frac;
    const pz = silhouette[idx].z * (1 - frac) + silhouette[nextIdx].z * frac;
    const dirLen = Math.hypot(px, pz) || 1;
    const outward = 1 + (0.02 + Math.random() * 0.04);
    dummy.position.set((px / dirLen) * dirLen * outward, 0.5 + Math.random() * 0.8, (pz / dirLen) * dirLen * outward);
    dummy.rotation.set(
      Math.random() * 0.35,
      Math.random() * Math.PI * 2,
      Math.random() * 0.35
    );
    dummy.scale.set(
      1.8 + Math.random() * 2.0,
      1.5 + Math.random() * 1.5,
      1.8 + Math.random() * 2.0
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

const _roadCache = new Map();
export function createRoad(x, z, width, length, horizontal = true, yOffset = 0.02) {
  const key = `${width}:${length}:${horizontal}`;
  let entry = _roadCache.get(key);
  if (!entry) {
    const tex = Textures.asphaltTexture();
    tex.repeat.set(
      horizontal ? length / 2 : width / 2,
      horizontal ? width / 2 : length / 2
    );
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const geo = getPlaneGeo(horizontal ? length : width, horizontal ? width : length);
    entry = { mat, geo };
    _roadCache.set(key, entry);
  }
  const road = new THREE.Mesh(entry.geo, entry.mat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, yOffset, z);
  road.receiveShadow = true;
  return road;
}

function buildRoadGrid(scene) {
  const { gridSize, blockSize, roadWidth } = CITY_CONFIG;
  for (let i = 0; i <= gridSize; i++) {
    const x = i * blockSize - GRID_HALF;
    const road = new THREE.Mesh(
      getPlaneGeo(roadWidth, TOTAL_SIZE + roadWidth * 2),
      MATS.asphalt
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.02, 0);
    road.receiveShadow = true;
    scene.add(road);
  }
  const asphalt2 = makeAsphaltMat(10, 10);
  for (let i = 0; i <= gridSize; i++) {
    const z = i * blockSize - GRID_HALF;
    const road = new THREE.Mesh(
      getPlaneGeo(TOTAL_SIZE + roadWidth * 2, roadWidth),
      asphalt2
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.021, z);
    road.receiveShadow = true;
    scene.add(road);
  }
  const swW = CITY_CONFIG.sidewalkWidth;
  for (let i = 0; i <= gridSize; i++) {
    const x = i * blockSize - GRID_HALF;
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(getPlaneGeo(swW, TOTAL_SIZE + swW * 2), MATS.concrete);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(x + side * (roadWidth / 2 + swW / 2), 0.028, 0);
      sw.receiveShadow = true;
      scene.add(sw);
    }
  }
  for (let i = 0; i <= gridSize; i++) {
    const z = i * blockSize - GRID_HALF;
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(getPlaneGeo(TOTAL_SIZE + swW * 2, swW), MATS.concrete);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(0, 0.029, z + side * (roadWidth / 2 + swW / 2));
      sw.receiveShadow = true;
      scene.add(sw);
    }
  }
}

function buildRoadLines(scene) {
  const dashGeo = getPlaneGeo(0.4, 2.5);
  const dashCount = 200;
  const mesh = new THREE.InstancedMesh(dashGeo, MATS.roadLine, dashCount);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let i = 0; i <= CITY_CONFIG.gridSize; i++) {
    const x = i * CITY_CONFIG.blockSize - GRID_HALF;
    for (let z = -GRID_HALF; z <= GRID_HALF; z += 8) {
      if (idx >= dashCount) break;
      dummy.position.set(x, 0.026, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  }
  for (let i = 0; i <= CITY_CONFIG.gridSize; i++) {
    const z = i * CITY_CONFIG.blockSize - GRID_HALF;
    for (let x = -GRID_HALF; x <= GRID_HALF; x += 8) {
      if (idx >= dashCount) break;
      dummy.position.set(x, 0.027, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  }
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

function buildCrosswalks(scene) {
  const stripeGeo = getPlaneGeo(0.6, 4);
  const totalIntersections = (CITY_CONFIG.gridSize + 1) * (CITY_CONFIG.gridSize + 1);
  const mesh = new THREE.InstancedMesh(stripeGeo, MATS.crosswalk, totalIntersections * 8);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let gx = 0; gx <= CITY_CONFIG.gridSize; gx++) {
    for (let gz = 0; gz <= CITY_CONFIG.gridSize; gz++) {
      const cx = gx * CITY_CONFIG.blockSize - GRID_HALF;
      const cz = gz * CITY_CONFIG.blockSize - GRID_HALF;
      const off = CITY_CONFIG.roadWidth / 2 + 1;
      for (let i = 0; i < 4; i++) {
        dummy.position.set(cx - 4 + i * 2.5, 0.033, cz + off);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
      for (let i = 0; i < 4; i++) {
        dummy.position.set(cx + off, 0.033, cz - 4 + i * 2.5);
        dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
  }
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

function buildStreetLights(scene) {
  const positions = [];
  const spacing = CITY_CONFIG.blockSize;
  for (let i = 0; i <= CITY_CONFIG.gridSize; i++) {
    const x = i * CITY_CONFIG.blockSize - GRID_HALF;
    for (let z = -GRID_HALF; z <= GRID_HALF; z += spacing) {
      positions.push({ x: x - CITY_CONFIG.roadWidth / 2 - 0.6, z, rotY: 0 });
      positions.push({ x: x + CITY_CONFIG.roadWidth / 2 + 0.6, z, rotY: Math.PI });
    }
  }
  for (let i = 0; i <= CITY_CONFIG.gridSize; i++) {
    const z = i * CITY_CONFIG.blockSize - GRID_HALF;
    for (let x = -GRID_HALF; x <= GRID_HALF; x += spacing) {
      positions.push({ x, z: z - CITY_CONFIG.roadWidth / 2 - 0.6, rotY: -Math.PI / 2 });
      positions.push({ x, z: z + CITY_CONFIG.roadWidth / 2 + 0.6, rotY: Math.PI / 2 });
    }
  }
  const count = positions.length;
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 5, 6);
  const poleMesh = new THREE.InstancedMesh(poleGeo, MATS.pole, count);
  const armMesh  = new THREE.InstancedMesh(getUnitBox(), MATS.poleTop, count);
  const lampMesh = new THREE.InstancedMesh(getUnitBox(), MATS.lampOn, count);
  poleMesh.castShadow = true; armMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  const tmpV = new THREE.Vector3();
  const upY = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const p = positions[i];
    dummy.position.set(p.x, 2.5, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);

    tmpV.set(0, 4.9, -0.7).applyAxisAngle(upY, p.rotY);
    dummy.position.set(p.x + tmpV.x, tmpV.y, p.z + tmpV.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(0.15, 0.15, 1.6);
    dummy.updateMatrix();
    armMesh.setMatrixAt(i, dummy.matrix);

    tmpV.set(0, 4.7, -1.5).applyAxisAngle(upY, p.rotY);
    dummy.position.set(p.x + tmpV.x, tmpV.y, p.z + tmpV.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(0.35, 0.15, 0.55);
    dummy.updateMatrix();
    lampMesh.setMatrixAt(i, dummy.matrix);
  }
  poleMesh.instanceMatrix.needsUpdate = true;
  armMesh.instanceMatrix.needsUpdate = true;
  lampMesh.instanceMatrix.needsUpdate = true;
  scene.add(poleMesh, armMesh, lampMesh);
}

function prepPoi(group, poi, context = 'indoor') {
  group.userData.context = context;
  group.userData.poiId = poi.id;
}

function buildHouse(scene, poi, world) {
  const sizes = { small: [6, 5], medium: [8, 6], large: [11, 8] };
  const [W, D] = sizes[poi.size] || sizes.medium;
  const H = 3.5, T = 0.24, DOOR_W = 1.4, DOOR_H = 2.3;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor');
  scene.add(g);
  const wallMat = Math.random() < 0.5 ? MATS.wallCream : MATS.wallWhite;
  const roofMat = Math.random() < 0.5 ? MATS.roofRed : MATS.roofGray;
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorCarpet);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  g.add(floor);
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, wallMat, g, world.wallColliders);
  const frontZ = D / 2 - T / 2;
  const segW = (W - DOOR_W) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, wallMat, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, wallMat, g, world.wallColliders);
  if (H - DOOR_H > 0.1) addBoxMesh(DOOR_W, H - DOOR_H, T, 0, H - (H - DOOR_H) / 2, frontZ, wallMat, g, null);
  const doorX = -DOOR_W / 2;
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX, 0, frontZ);
  const doorMesh = new THREE.Mesh(getBoxGeo(DOOR_W - 0.06, DOOR_H - 0.04, 0.08), MATS.darkWood);
  doorMesh.position.set((DOOR_W - 0.06) / 2, DOOR_H / 2, 0);
  doorPivot.add(doorMesh); g.add(doorPivot);
  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(doorX, 0, frontZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({ group: doorPivot, currentAngle: 0, worldX: doorWorldPos.x, worldZ: doorWorldPos.z });
  registerVaultSpot(world, 'stair', 'barrier',
    [doorWorldPos.x - 0.8, 0, doorWorldPos.z],
    [doorWorldPos.x + 0.8, 0, doorWorldPos.z]);
  addBoxMesh(W + 0.35, 0.12, D + 0.35, 0, H + 0.06, 0, MATS.trim, g, null);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, 1.6, 4), roofMat);
  roof.position.y = H + 0.8; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  g.add(roof);
  const templateKey = poi.size === 'large' ? 'house_large'
                    : poi.size === 'small' ? 'house_small' : 'house_medium';
  populateInterior(g, world, templateKey);
  if (Math.random() < 0.4) {
    const roomType = ['bedroom', 'kitchen', 'living_room'][Math.floor(Math.random() * 3)];
    registerLootSpot(world, poi.x + 2, poi.z - 1, 0.3,
      ['food','medkit','ammo','cash'][Math.floor(Math.random() * 4)], 1, roomType);
  }
  registerRooftop(world, poi.id, poi.x, poi.z, H + 1.6);
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'house' };
}

function buildPoliceStation(scene, poi, world) {
  const W = 14, D = 11, H = 4.2, T = 0.28;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  g.add(floor);
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallGray, g, world.wallColliders);
  const frontZ = D / 2 - T / 2;
  const doorW = 2.8, segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallGray, g, world.wallColliders);
  const sign = new THREE.Mesh(getBoxGeo(W * 0.5, 0.5, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x2196F3 }));
  sign.position.set(0, H - 0.5, frontZ + 0.06); g.add(sign);
  populateInterior(g, world, 'police_office');
  const roof = new THREE.Mesh(getBoxGeo(W + 0.5, 0.4, D + 0.5), MATS.roofBlack);
  roof.position.y = H + 0.2; roof.castShadow = true; g.add(roof);
  registerLootSpot(world, poi.x - 3, poi.z - 2, 0.3, 'ammo', 2, 'police_armory');
  registerRooftop(world, poi.id, poi.x, poi.z, H + 0.4);
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'police' };
}

function buildHospital(scene, poi, world) {
  const W = 18, D = 14, H = 5.0, T = 0.28;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorWhite);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  g.add(floor);
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallWhite, g, world.wallColliders);
  const frontZ = D / 2 - T / 2;
  const doorW = 2.8, segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallWhite, g, world.wallColliders);
  const crossH = new THREE.Mesh(getBoxGeo(1.2, 0.4, 0.1), MATS.cross);
  crossH.position.set(0, H - 0.9, frontZ + 0.06); g.add(crossH);
  const crossV = new THREE.Mesh(getBoxGeo(0.4, 1.2, 0.1), MATS.cross);
  crossV.position.set(0, H - 0.9, frontZ + 0.06); g.add(crossV);
  populateInterior(g, world, 'hospital_room');
  const roofL = new THREE.Mesh(getBoxGeo(W + 0.5, 0.3, D * 0.55), MATS.roofRed);
  roofL.position.set(0, H + 0.5, -D * 0.22); roofL.rotation.x = -0.25; roofL.castShadow = true;
  g.add(roofL);
  const roofR = new THREE.Mesh(getBoxGeo(W + 0.5, 0.3, D * 0.55), MATS.roofRed);
  roofR.position.set(0, H + 0.5, D * 0.22); roofR.rotation.x = 0.25; roofR.castShadow = true;
  g.add(roofR);
  registerLootSpot(world, poi.x, poi.z, 0.3, 'medkit', 3, 'healing_items');
  registerRooftop(world, poi.id, poi.x, poi.z, H + 0.9);
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'hospital' };
}

function buildChurch(scene, poi, world) {
  const W = 14, D = 22, H = 7.0, T = 0.3;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  g.add(floor);
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallStone, g, world.wallColliders);
  const frontZ = D / 2 - T / 2;
  const doorW = 2.6, segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallStone, g, world.wallColliders);
  for (const side of [-1, 1]) {
    const towerX = side * (W / 2 - 1.2);
    addBoxMesh(2.8, 11, 2.8, towerX, 5.5, -D / 2 + 1.4, MATS.wallStone, g, world.wallColliders);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.0, 3.0, 4), MATS.roofDarkRed);
    spire.position.set(towerX, 12.5, -D / 2 + 1.4);
    spire.rotation.y = Math.PI / 4; spire.castShadow = true;
    g.add(spire);
  }
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const bx = -W / 2 + 2.4 + col * 2.9;
      const bz = -D / 2 + 6 + row * 2.8;
      addBoxMesh(2.2, 0.8, 0.42, bx, 0.4, bz, MATS.darkWood, g, world.furnitureColliders);
    }
  }
  populateInterior(g, world, 'church_interior');
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.75, 3.4, 4), MATS.roofDarkRed);
  roof.position.y = H + 1.7; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  g.add(roof);
  registerLootSpot(world, poi.x, poi.z - D / 2 + 3, 0.9, 'cash', 2, 'church_supplies');
  registerRooftop(world, poi.id, poi.x, poi.z, H + 3.4);
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'church' };
}

function buildMarket(scene, poi, world) {
  const W = 14, D = 10, H = 3.8, T = 0.24;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  g.add(floor);
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallCream, g, world.wallColliders);
  const frontZ = D / 2 - T / 2;
  const doorW = 2.2, segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallCream, g, world.wallColliders);
  populateInterior(g, world, 'market_front');
  const roof = new THREE.Mesh(getBoxGeo(W + 0.5, 0.4, D + 0.5), MATS.roofGray);
  roof.position.y = H + 0.2; roof.castShadow = true; g.add(roof);
  registerLootSpot(world, poi.x - 3, poi.z, 0.3, 'food', 2, 'food');
  registerLootSpot(world, poi.x + 3, poi.z, 0.3, 'food', 2, 'food');
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'market' };
}

function buildGasStation(scene, poi, world) {
  const W = 12, D = 10;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const floor = new THREE.Mesh(getPlaneGeo(W, D), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  g.add(floor);
  for (let i = 0; i < 4; i++) {
    const px = (i % 2 === 0 ? -W / 3 : W / 3);
    const pz = (i < 2 ? -D / 3 : D / 3);
    addBoxMesh(0.4, 3.5, 0.4, px, 1.75, pz, MATS.metal, g, world.furnitureColliders);
    registerVaultSpot(world, 'barrier', 'barrier',
      [poi.x + px - 1, 0, poi.z + pz], [poi.x + px + 1, 0, poi.z + pz]);
  }
  addBoxMesh(W * 0.9, 0.3, D * 0.9, 0, 3.6, 0, MATS.darkMetal, g, null);
  addBoxMesh(4, 3, 4, -W / 2 + 2, 1.5, -D / 2 + 2, MATS.wallCream, g, world.wallColliders);
  registerLootSpot(world, poi.x, poi.z, 0.3, 'ammo', 1, 'gas_station');
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'gas' };
}

function buildMilitaryBase(scene, poi, world) {
  const W = 22, D = 16, T = 0.3;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const floor = new THREE.Mesh(getPlaneGeo(W, D), MATS.floorMilitary);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.04; floor.receiveShadow = true;
  g.add(floor);
  const BW = 14, BD = 9, BH = 3.6;
  addBoxMesh(BW, BH, T, 0, BH / 2, -BD / 2 + T / 2, MATS.wallMilitary, g, world.wallColliders);
  addBoxMesh(BW, BH, T, 0, BH / 2,  BD / 2 - T / 2, MATS.wallMilitary, g, world.wallColliders);
  addBoxMesh(T, BH, BD, -BW / 2 + T / 2, BH / 2, 0, MATS.wallMilitary, g, world.wallColliders);
  addBoxMesh(T, BH, BD,  BW / 2 - T / 2, BH / 2, 0, MATS.wallMilitary, g, world.wallColliders);
  const roof = new THREE.Mesh(getBoxGeo(BW + 0.5, 0.3, BD + 0.5), MATS.roofMetal);
  roof.position.y = BH + 0.15; roof.castShadow = true; g.add(roof);
  const towers = [
    { x: -11, z: -8 }, { x: 11, z: 8 },
  ];
  for (const t of towers) {
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
      addBoxMesh(0.15, 5, 0.15, t.x + dx, 2.5, t.z + dz, MATS.darkWood, g, world.furnitureColliders);
    }
    addBoxMesh(1.8, 0.18, 1.8, t.x, 5.05, t.z, MATS.darkWood, g, null);
    addBoxMesh(2.1, 0.15, 2.1, t.x, 7.6, t.z, MATS.roofBlack, g, null);
  }
  for (let i = 0; i < 4; i++) {
    const cx = -4 + (i % 4) * 2;
    const cz = -3 + Math.floor(i / 4) * 1.2;
    addBoxMesh(1, 0.8, 0.8, cx, 0.4, cz, MATS.crateMetal, g, world.furnitureColliders);
  }
  populateInterior(g, world, 'military_barracks');
  registerLootSpot(world, poi.x - 3, poi.z, 0.3, 'ammo', 3, 'military');
  registerLootSpot(world, poi.x + 3, poi.z, 0.3, 'ammo', 3, 'military');
  registerRooftop(world, poi.id, poi.x, poi.z, BH + 0.3);
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'military' };
}

function buildWarehouse(scene, poi, world) {
  const W = 20, D = 14, H = 6.5, T = 0.32;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorWarehouse);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  g.add(floor);
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallWarehouse, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallWarehouse, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallWarehouse, g, world.wallColliders);
  const frontZ = D / 2 - T / 2;
  const gateW = 3.4, gateH = 4.5;
  addBoxMesh(W - gateW * 2, H, T, 0, H / 2, frontZ, MATS.wallWarehouse, g, world.wallColliders);
  const roofL = new THREE.Mesh(getBoxGeo(W + 0.6, 0.3, D * 0.6), MATS.roofMetal);
  roofL.position.set(0, H + 1.1, -D * 0.22); roofL.rotation.x = -0.22; roofL.castShadow = true;
  g.add(roofL);
  const roofR = new THREE.Mesh(getBoxGeo(W + 0.6, 0.3, D * 0.6), MATS.roofMetal);
  roofR.position.set(0, H + 1.1, D * 0.22); roofR.rotation.x = 0.22; roofR.castShadow = true;
  g.add(roofR);
  registerLootSpot(world, poi.x - 4, poi.z, 0.3, 'ammo', 2, 'factory_loot');
  registerLootSpot(world, poi.x + 4, poi.z, 0.3, 'ammo', 2, 'factory_loot');
  registerRooftop(world, poi.id, poi.x, poi.z, H + 2.2);
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'warehouse' };
}

function buildGovernment(scene, poi, world) {
  const W = 18, D = 12, floorH = 3.4, numFloors = 3, H = floorH * numFloors, T = 0.32;
  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z);
  prepPoi(g, poi, 'indoor'); scene.add(g);
  const stepsH = 0.6;
  addBoxMesh(W + 3, stepsH, D + 3, 0, stepsH / 2, 0, MATS.marble, g, world.wallColliders);
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorGov);
  floor.rotation.x = -Math.PI / 2; floor.position.y = stepsH + 0.02; floor.receiveShadow = true;
  g.add(floor);
  const yBase = stepsH;
  addBoxMesh(W, H, T, 0, yBase + H / 2, -D / 2 + T / 2, MATS.wallGov, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, yBase + H / 2, 0, MATS.wallGov, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, yBase + H / 2, 0, MATS.wallGov, g, world.wallColliders);
  addBoxMesh(W, H, T, 0, yBase + H / 2,  D / 2 - T / 2, MATS.wallGov, g, world.wallColliders);
  const doorW = 2.2, doorH = 2.8;
  const doorX = -doorW / 2, doorZ = D / 2 - T / 2;
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX, yBase, doorZ);
  const doorMesh = new THREE.Mesh(getBoxGeo(doorW - 0.08, doorH - 0.08, 0.1), MATS.darkWood);
  doorMesh.position.set((doorW - 0.08) / 2, doorH / 2, 0);
  doorPivot.add(doorMesh); g.add(doorPivot);
  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(doorX, 0, doorZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({ group: doorPivot, currentAngle: 0, worldX: doorWorldPos.x, worldZ: doorWorldPos.z });
  addBoxMesh(W + 0.6, 0.4, D + 0.6, 0, yBase + H + 0.2, 0, MATS.marble, g, null);
  addBoxMesh(W + 0.4, 0.3, D + 0.4, 0, yBase + H + 0.5, 0, MATS.roofGray, g, null);
  populateInterior(g, world, 'gov_office');
  registerLootSpot(world, poi.x - 4, poi.z, 0.3, 'cash', 3, 'gov_office');
  registerRooftop(world, poi.id, poi.x, poi.z, yBase + H + 0.8);
  return { x: poi.x, z: poi.z, w: W, d: D, type: 'government' };
}

let _proceduralBuildings = [];
function pickWeightedBuilding() {
  let totalW = 0;
  for (const b of COMMON_BUILDINGS) totalW += b.weight;
  let r = Math.random() * totalW;
  for (const b of COMMON_BUILDINGS) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return COMMON_BUILDINGS[0];
}
function generateCityBlocks(scene, world) {
  const { gridSize, blockSize, buildingsPerBlock, roadWidth, sidewalkWidth } = CITY_CONFIG;
  let counter = 0;
  for (let gx = 0; gx < gridSize; gx++) {
    for (let gz = 0; gz < gridSize; gz++) {
      const blockCenterX = gx * blockSize - GRID_HALF + blockSize / 2;
      const blockCenterZ = gz * blockSize - GRID_HALF + blockSize / 2;
      if (!isFreeSpot(blockCenterX, blockCenterZ, blockSize / 2)) continue;
      const usable = blockSize - roadWidth - sidewalkWidth * 2;
      for (let b = 0; b < buildingsPerBlock; b++) {
        const bType = pickWeightedBuilding();
        const bx = blockCenterX + (Math.random() - 0.5) * (usable - 12);
        const bz = blockCenterZ + (Math.random() - 0.5) * (usable - 12);
        const rot = Math.floor(Math.random() * 4) * Math.PI / 2;
        let tooClose = false;
        for (const p of _proceduralBuildings) {
          if (Math.hypot(bx - p.x, bz - p.z) < 12) { tooClose = true; break; }
        }
        if (tooClose) continue;
        const fakeId = `proc_${gx}_${gz}_${b}`;
        const fakePoi = { id: fakeId, type: bType.type, x: bx, z: bz, rot, size: bType.size };
        let bounds;
        if (bType.type === 'market') bounds = buildMarket(scene, fakePoi, world);
        else if (bType.type === 'gas') bounds = buildGasStation(scene, fakePoi, world);
        else bounds = buildHouse(scene, fakePoi, world);
        _proceduralBuildings.push({ x: bx, z: bz, bounds });
        counter++;
      }
    }
  }
  console.log(`[scenery] 🏘️  ${counter} prédios procedurais`);
}

function buildTrees(scene) {
  const count = 70;
  const positions = [];
  let attempts = 0;
  while (positions.length < count && attempts < count * 30) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * (CITY_CONFIG.islandInnerRadius - 60);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.hypot(x, z) > CITY_CONFIG.islandInnerRadius - 15) continue;
    if (!isFreeSpot(x, z, 8)) continue;
    if (isOnRoad(x, z)) continue;
    let tooClose = false;
    for (const p of _proceduralBuildings) {
      if (Math.hypot(x - p.x, z - p.z) < 10) { tooClose = true; break; }
    }
    if (tooClose) continue;
    positions.push({
      x, z,
      rotY: Math.random() * Math.PI * 2,
      scale: 0.7 + Math.random() * 0.9,
      isConical: Math.random() < 0.3,
      leafTint: Math.random(),
    });
  }
  const N = positions.length;
  if (N === 0) return;
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.9, 0);
  const coneGeo  = new THREE.ConeGeometry(1.6, 3.2, 6);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, MATS.bark, N);
  trunkMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  const tmpQ = new THREE.Quaternion();
  const upY = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const palette = [0x2E8B3E, 0x3AA850, 0x4F8B2E];
  let tIdx = 0;
  for (const p of positions) {
    dummy.position.set(p.x, 1.25 * p.scale, p.z);
    tmpQ.setFromAxisAngle(upY, p.rotY);
    dummy.quaternion.copy(tmpQ);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(tIdx++, dummy.matrix);
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  scene.add(trunkMesh);

  const spherical = positions.filter(p => !p.isConical);
  const conical   = positions.filter(p => p.isConical);
  if (spherical.length > 0) {
    const crownMesh = new THREE.InstancedMesh(crownGeo, MATS.leafA, spherical.length);
    crownMesh.castShadow = true;
    crownMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spherical.length * 3), 3);
    let i = 0;
    for (const p of spherical) {
      dummy.position.set(p.x, 4.0 * p.scale, p.z);
      tmpQ.setFromAxisAngle(upY, p.rotY);
      dummy.quaternion.copy(tmpQ);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      crownMesh.setMatrixAt(i, dummy.matrix);
      const tint = palette[p.leafTint < 0.33 ? 0 : p.leafTint < 0.66 ? 1 : 2];
      color.setHex(tint);
      crownMesh.setColorAt(i, color);
      i++;
    }
    crownMesh.instanceMatrix.needsUpdate = true;
    if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
    scene.add(crownMesh);
  }
  if (conical.length > 0) {
    const coneMesh = new THREE.InstancedMesh(coneGeo, MATS.leafA, conical.length);
    coneMesh.castShadow = true;
    coneMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(conical.length * 3), 3);
    let i = 0;
    for (const p of conical) {
      dummy.position.set(p.x, 4.2 * p.scale, p.z);
      tmpQ.setFromAxisAngle(upY, p.rotY);
      dummy.quaternion.copy(tmpQ);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      coneMesh.setMatrixAt(i, dummy.matrix);
      coneMesh.setColorAt(i, color.setHex(palette[p.leafTint < 0.5 ? 0 : 2]));
      i++;
    }
    coneMesh.instanceMatrix.needsUpdate = true;
    if (coneMesh.instanceColor) coneMesh.instanceColor.needsUpdate = true;
    scene.add(coneMesh);
  }
}

function buildProps(scene) {
  const ext = CITY_CONFIG.islandInnerRadius;
  scatterInstanced(scene, { count: 25, geo: getUnitCyl(8), mat: MATS.barrel, worldExtent: ext,
    minPOIDist: 6, radiusMin: 0.05, radiusMax: 0.95, baseY: 0.45,
    scaleMin: 0.85, scaleMax: 1.15, name: 'barrels' });
  scatterInstanced(scene, { count: 18, geo: getUnitCyl(8), mat: MATS.barrelMetal, worldExtent: ext,
    minPOIDist: 6, radiusMin: 0.05, radiusMax: 0.95, baseY: 0.45,
    scaleMin: 0.85, scaleMax: 1.15, name: 'barrelsMetal' });
  scatterInstanced(scene, { count: 40, geo: getUnitBox(), mat: MATS.crate, worldExtent: ext,
    minPOIDist: 5, radiusMin: 0.03, radiusMax: 0.95, baseY: 0.3,
    scaleMin: 0.5, scaleMax: 0.9, name: 'crates' });
  scatterInstanced(scene, { count: 60, geo: getUnitIco(), mat: MATS.bush, worldExtent: ext,
    minPOIDist: 4, radiusMin: 0.05, radiusMax: 0.95, baseY: 0.35,
    scaleMin: 1.6, scaleMax: 2.6, name: 'bushes' });
  scatterInstanced(scene, { count: 30, geo: getUnitIco(), mat: MATS.bushDry, worldExtent: ext,
    minPOIDist: 4, radiusMin: 0.05, radiusMax: 0.95, baseY: 0.3,
    scaleMin: 1.2, scaleMax: 2.0, name: 'bushesDry' });
  scatterInstanced(scene, { count: 50, geo: getUnitIco(), mat: MATS.rock, worldExtent: ext,
    minPOIDist: 4, radiusMin: 0.03, radiusMax: 0.95, baseY: 0.25,
    scaleMin: 0.7, scaleMax: 1.6, name: 'rocksSmall' });
}

function buildAbandonedCars(scene) {
  const carColors = [MATS.carBody1, MATS.carBody2, MATS.carBody3, MATS.carBody4, MATS.carBody5];
  const carCount = 18;
  for (let i = 0; i < carCount; i++) {
    const x = (Math.random() - 0.5) * TOTAL_SIZE * 0.8;
    const z = (Math.random() - 0.5) * TOTAL_SIZE * 0.8;
    if (!isFreeSpot(x, z, 8)) continue;
    const rot = Math.random() * Math.PI * 2;
    const flipped = Math.random() < 0.35;
    const isTruck = Math.random() < 0.15;
    scene.add(createCar(x, z, rot, carColors[i % carColors.length], isTruck, flipped));
  }
}

function createCar(x, z, rot, bodyMat, isTruck, flipped = false) {
  const g = new THREE.Group();
  g.position.set(x, flipped ? 1.85 : 0, z);
  g.rotation.y = rot;
  if (flipped) g.rotation.x = Math.PI;
  if (isTruck) {
    const body = new THREE.Mesh(getUnitBox(), bodyMat);
    body.scale.set(2.2, 1.4, 5.0); body.position.y = 1.2;
    body.castShadow = true; g.add(body);
    const cab = new THREE.Mesh(getUnitBox(), bodyMat);
    cab.scale.set(2.0, 1.3, 1.8); cab.position.set(0, 1.1, -3.4);
    cab.castShadow = true; g.add(cab);
  } else {
    const body = new THREE.Mesh(getUnitBox(), bodyMat);
    body.scale.set(1.8, 0.7, 3.6); body.position.y = 0.7;
    body.castShadow = true; g.add(body);
    const cab = new THREE.Mesh(getUnitBox(), bodyMat);
    cab.scale.set(1.6, 0.7, 1.8); cab.position.set(0, 1.4, -0.1);
    cab.castShadow = true; g.add(cab);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8);
  const wheelPos = isTruck
    ? [[-1.1, 0.4, 1.8], [1.1, 0.4, 1.8], [-1.1, 0.4, -1.8], [1.1, 0.4, -1.8]]
    : [[-0.95, 0.35, 1.2], [0.95, 0.35, 1.2], [-0.95, 0.35, -1.2], [0.95, 0.35, -1.2]];
  for (const [wx, wy, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, MATS.tire);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz); g.add(w);
  }
  return g;
}

export function buildWorld(scene, arenaSize) {
  _proceduralBuildings = [];
  const world = {
    wallColliders: [],
    furnitureColliders: [],
    doors: [],
    weaponSpots: [],
    pois: {},
    lootSpots: [],
    difficultyRegions: [
      { centerX: 0, centerZ: 0, innerRadius: 0,   outerRadius: 50,  tier: 0, name: 'easy'     },
      { centerX: 0, centerZ: 0, innerRadius: 50,  outerRadius: 100, tier: 1, name: 'medium'   },
      { centerX: 0, centerZ: 0, innerRadius: 100, outerRadius: 150, tier: 2, name: 'hard'     },
      { centerX: 0, centerZ: 0, innerRadius: 150, outerRadius: 999, tier: 3, name: 'veryhard' },
    ],
    rooftops: [],
    vaultSpots: [],
    island: {
      silhouette: null,
      innerRadius: CITY_CONFIG.islandInnerRadius,
      beachWidth: CITY_CONFIG.islandBeachWidth,
      waterY: CITY_CONFIG.islandWaterY,
    },
  };
  console.log(`[scenery] 🏝️  Construindo ilha ZB2 (~${CITY_CONFIG.islandInnerRadius}m raio)...`);
  const silhouette = generateIslandSilhouette(CITY_CONFIG.islandInnerRadius);
  world.island.silhouette = silhouette;
  buildIslandTerrain(scene, silhouette);
  buildBeachRing(scene, silhouette, CITY_CONFIG.islandInnerRadius, CITY_CONFIG.islandBeachWidth);
  buildWaterPlane(scene);
  buildIslandRockBorder(scene, silhouette);
  buildRoadGrid(scene);
  buildRoadLines(scene);
  buildCrosswalks(scene);
  buildStreetLights(scene);
  generateCityBlocks(scene, world);
  for (const poi of SPECIAL_POIS) {
    let bounds;
    switch (poi.type) {
      case 'police':     bounds = buildPoliceStation(scene, poi, world); break;
      case 'hospital':   bounds = buildHospital(scene, poi, world); break;
      case 'church':     bounds = buildChurch(scene, poi, world); break;
      case 'military':   bounds = buildMilitaryBase(scene, poi, world); break;
      case 'government': bounds = buildGovernment(scene, poi, world); break;
      case 'warehouse':  bounds = buildWarehouse(scene, poi, world); break;
      default:           bounds = buildHouse(scene, poi, world);
    }
    world.pois[poi.id] = { x: poi.x, z: poi.z, type: poi.type, bounds };
  }
  buildTrees(scene);
  buildProps(scene);
  buildAbandonedCars(scene);
  console.log(
    `[scenery] ✅ Ilha pronta: ` +
    `${world.wallColliders.length} wallColliders, ` +
    `${world.furnitureColliders.length} furnitureColliders, ` +
    `${world.doors.length} doors, ` +
    `${world.lootSpots.length} lootSpots`
  );
  return world;
}

export function createTree(x, z) {
  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.9, 0);
  const trunk = new THREE.Mesh(trunkGeo, MATS.bark);
  trunk.position.y = 1.25; trunk.castShadow = true; g.add(trunk);
  const crown = new THREE.Mesh(crownGeo, MATS.leafA);
  crown.position.y = 4; crown.castShadow = true; g.add(crown);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.scale.setScalar(0.7 + Math.random() * 0.9);
  return g;
}
