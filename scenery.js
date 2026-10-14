// ============================================================
// scenery.js — v6 "Zombie Blocks 2 Style"
// ============================================================
// Arquitetura:
//   • POIS: array de Pontos de Interesse (delegacia, hospital,
//     igreja, mercado, posto, base militar, casas).
//   • buildWorld(scene, arenaSize): constrói o mundo e retorna
//     { wallColliders, furnitureColliders, doors, weaponSpots, pois }.
//
// Padrões aplicados:
//   • Cache de geometrias (_geoCache + getBoxGeo/getUnitBox/...).
//   • InstancedMesh para árvores, morros, ruas tracejadas,
//     calçadas, postes, barris, caixas, arbustos, pedras,
//     sacos de areia e carros abandonados.
//   • Texturas dinâmicas (Textures.grassTexture, asphaltTexture,
//     houseWallTexture, roofTexture, barkTexture, concreteTexture).
//   • addBoxMesh com conversão local→mundo CORRETA:
//       wx = gx + cos*lx + sin*lz
//       wz = gz - sin*lx + cos*lz
//     Paredes rotacionadas subdivididas em segmentos (~0.5m)
//     para AABBs fiéis à geometria visual.
//
// Formato de collider: { minX, maxX, minZ, maxZ } (compatível
// com circleVsAABB / resolveCollidersAgainstBoxes / addStaticBox).
// ============================================================

import * as THREE from 'three';
import * as Textures from './textures.js';

// ────────────────────────────────────────────────────────────
// POIS
// ────────────────────────────────────────────────────────────
export const POIS = [
  { id: 'police',     type: 'police',     x: -28, z: -28, rot:  Math.PI * 0.25, size: 'large'  },
  { id: 'hospital',   type: 'hospital',   x:  28, z: -28, rot: -Math.PI * 0.25, size: 'large'  },
  { id: 'church',     type: 'church',     x:   0, z:  35, rot:  Math.PI,        size: 'medium' },
  { id: 'market',     type: 'market',     x: -35, z:  15, rot:  0,              size: 'medium' },
  { id: 'gasStation', type: 'gas',        x:  35, z:  15, rot:  0,              size: 'small'  },
  { id: 'military',   type: 'military',   x:   0, z: -40, rot:  0,              size: 'large'  },
  { id: 'house1',     type: 'house',      x: -14, z: -14, rot:  0,              size: 'medium' },
  { id: 'house2',     type: 'house',      x:  14, z: -14, rot:  0,              size: 'small'  },
  { id: 'house3',     type: 'house',      x: -14, z:  14, rot:  0,              size: 'large'  },
  { id: 'house4',     type: 'house',      x:  14, z:  14, rot:  0,              size: 'medium' },
];

// ────────────────────────────────────────────────────────────
// CACHE DE GEOMETRIAS
// ────────────────────────────────────────────────────────────
const _geoCache = new Map();

function _cacheGeo(key, factory) {
  let g = _geoCache.get(key);
  if (!g) { g = factory(); _geoCache.set(key, g); }
  return g;
}

export function getBoxGeo(w, h, d) {
  const k = `box:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  return _cacheGeo(k, () => new THREE.BoxGeometry(w, h, d));
}
export function getUnitBox() {
  return _cacheGeo('unitBox', () => new THREE.BoxGeometry(1, 1, 1));
}
export function getUnitIco() {
  return _cacheGeo('unitIco', () => new THREE.IcosahedronGeometry(0.5, 0));
}
export function getUnitCone(segments = 6) {
  const k = `cone:${segments}`;
  return _cacheGeo(k, () => new THREE.ConeGeometry(0.5, 1, segments));
}
export function getUnitCyl(segments = 8) {
  const k = `cyl:${segments}`;
  return _cacheGeo(k, () => new THREE.CylinderGeometry(0.5, 0.5, 1, segments));
}
export function getPlaneGeo(w, h) {
  const k = `plane:${w.toFixed(3)}:${h.toFixed(3)}`;
  return _cacheGeo(k, () => new THREE.PlaneGeometry(w, h));
}

// ────────────────────────────────────────────────────────────
// FÁBRICAS DE MATERIAIS COM TEXTURA
// ────────────────────────────────────────────────────────────
function makeWallMat(hexColor, repU = 2, repV = 2) {
  const tex = Textures.houseWallTexture(hexColor);
  tex.repeat.set(repU, repV);
  return new THREE.MeshLambertMaterial({ map: tex });
}
function makeRoofMat(hexColor, repU = 3, repV = 3) {
  const tex = Textures.roofTexture(hexColor);
  tex.repeat.set(repU, repV);
  return new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
}
function makeConcreteMat(repU = 4, repV = 4) {
  const tex = Textures.concreteTexture();
  tex.repeat.set(repU, repV);
  return new THREE.MeshLambertMaterial({ map: tex });
}

// ────────────────────────────────────────────────────────────
// MATERIAIS COMPARTILHADOS
// ────────────────────────────────────────────────────────────
const MATS = {
  // Paredes
  wallCream:   makeWallMat('#ECF0F1', 3, 2),
  wallBrick:   makeWallMat('#8B4513', 3, 2),
  wallWhite:   makeWallMat('#F5F5F5', 3, 2),
  wallGray:    makeWallMat('#7F8C8D', 3, 2),
  wallStone:   makeWallMat('#5D6D7E', 3, 2),
  wallMilitary:makeWallMat('#4A5D3F', 4, 2),
  // Telhados
  roofRed:     makeRoofMat('#C0392B'),
  roofGray:    makeRoofMat('#7F8C8D'),
  roofDarkRed: makeRoofMat('#7B241C'),
  roofBlack:   makeRoofMat('#2C3E50'),
  // Estruturais
  wood:        new THREE.MeshLambertMaterial({ color: 0x8B5A2B }),
  darkWood:    new THREE.MeshLambertMaterial({ color: 0x5D4030 }),
  trim:        new THREE.MeshLambertMaterial({ color: 0x4A3527 }),
  floorTile:   new THREE.MeshLambertMaterial({ color: 0xBDC3C7 }),
  floorWhite:  new THREE.MeshLambertMaterial({ color: 0xD5DBDB }),
  floorCarpet: new THREE.MeshLambertMaterial({ color: 0x6B4423 }),
  floorMilitary:new THREE.MeshLambertMaterial({ color: 0x596155 }),
  metal:       new THREE.MeshLambertMaterial({ color: 0x95A5A6 }),
  darkMetal:   new THREE.MeshLambertMaterial({ color: 0x34495E }),
  cross:       new THREE.MeshLambertMaterial({ color: 0xC0392B }),
  window:      new THREE.MeshLambertMaterial({ color: 0x1C2833 }),
  windowLit:   new THREE.MeshLambertMaterial({ color: 0xFFCC66, emissive: 0x664400 }),
  concrete:    makeConcreteMat(4, 4),
  // Props
  rock:        new THREE.MeshLambertMaterial({ color: 0x5A5A5A, flatShading: true }),
  rockDark:    new THREE.MeshLambertMaterial({ color: 0x3A3A3A, flatShading: true }),
  bush:        new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
  bushDry:     new THREE.MeshLambertMaterial({ color: 0x6E8B3E, flatShading: true }),
  barrel:      new THREE.MeshLambertMaterial({ color: 0x8B4513, flatShading: true }),
  barrelMetal: new THREE.MeshLambertMaterial({ color: 0x4A5A3A, flatShading: true }),
  crate:       new THREE.MeshLambertMaterial({ color: 0xA0724A, flatShading: true }),
  sandbag:     new THREE.MeshLambertMaterial({ color: 0xC8B48A, flatShading: true }),
  pole:        new THREE.MeshLambertMaterial({ color: 0x2A2A2A }),
  poleTop:     new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  lampOn:      new THREE.MeshBasicMaterial({ color: 0xFFEE99 }),
  carBody1:    new THREE.MeshLambertMaterial({ color: 0x8B1E1E }),
  carBody2:    new THREE.MeshLambertMaterial({ color: 0x2C3E50 }),
  carBody3:    new THREE.MeshLambertMaterial({ color: 0x4A4A4A }),
  carBody4:    new THREE.MeshLambertMaterial({ color: 0x2E5E3A }),
  militaryTruck:new THREE.MeshLambertMaterial({ color: 0x4A5D3F }),
  tire:        new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  roadLine:    new THREE.MeshBasicMaterial({ color: 0xEEDD44 }),
  barbed:      new THREE.MeshBasicMaterial({ color: 0x303030 }),
  // Árvores
  bark:        (() => {
    const tex = Textures.barkTexture();
    tex.repeat.set(2, 2);
    return new THREE.MeshLambertMaterial({ map: tex });
  })(),
  leafA:       new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
  leafB:       new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true }),
  leafC:       new THREE.MeshLambertMaterial({ color: 0x4F8B2E, flatShading: true }),
};

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

/**
 * Cria uma mesh do tipo caixa e, opcionalmente, registra collider(es)
 * em WORLD SPACE. Conversão local→mundo com rotação Y (right-handed):
 *
 *   wx = gx + cos*lx + sin*lz
 *   wz = gz - sin*lx + cos*lz
 *
 * Se a rotação for ~0 (múltiplos de π), gera um único AABB.
 * Caso contrário, subdivide o eixo longo da parede em segmentos de
 * ~0.5m, cada um gerando seu próprio AABB (aproximação "escada"),
 * evitando o bug de um AABB gigante selar o interior de edifícios
 * rotacionados (ex: delegacia/hospital a 45°).
 */
function addBoxMesh(w, h, d, x, y, z, mat, parent, colliderArray) {
  const m = new THREE.Mesh(getBoxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);

  if (!colliderArray) return m;

  const ry = parent.rotation.y || 0;
  const gx = parent.position.x || 0;
  const gz = parent.position.z || 0;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const absSin = Math.abs(sin);
  const absCos = Math.abs(cos);

  // Caso 1: sem rotação (ou múltiplos de π): um único AABB.
  if (absSin < 0.001) {
    const wx = gx + cos * x + sin * z;
    const wz = gz - sin * x + cos * z;
    colliderArray.push({
      minX: wx - w / 2, maxX: wx + w / 2,
      minZ: wz - d / 2, maxZ: wz + d / 2,
    });
    return m;
  }

  // Caso 2: rotação arbitrária → subdividir o eixo longo em N segmentos.
  const L = Math.max(w, d);
  const N = Math.max(2, Math.ceil(L / 0.5));
  const segL = L / N;

  for (let i = 0; i < N; i++) {
    let lx, lz, hw, hd;
    if (w >= d) {
      // Eixo longo = X local
      lx = x + (i + 0.5 - N / 2) * segL;
      lz = z;
      hw = (segL / 2) * absCos + (d / 2) * absSin;
      hd = (segL / 2) * absSin + (d / 2) * absCos;
    } else {
      // Eixo longo = Z local
      lx = x;
      lz = z + (i + 0.5 - N / 2) * segL;
      hw = (w / 2) * absCos + (segL / 2) * absSin;
      hd = (w / 2) * absSin + (segL / 2) * absCos;
    }
    const wx = gx + cos * lx + sin * lz;
    const wz = gz - sin * lx + cos * lz;
    colliderArray.push({
      minX: wx - hw, maxX: wx + hw,
      minZ: wz - hd, maxZ: wz + hd,
    });
  }
  return m;
}

/**
 * Verifica se (x, z) está livre de POIs e do centro, para scatter.
 */
function isFreeSpot(x, z, minPOIDist = 10, minCenterDist = 6) {
  if (Math.hypot(x, z) < minCenterDist) return false;
  for (const poi of POIS) {
    if (Math.hypot(x - poi.x, z - poi.z) < minPOIDist) return false;
  }
  return true;
}

/**
 * Scatter genérico com InstancedMesh.
 */
function scatterInstanced(scene, opts) {
  const {
    count, geo, mat, arenaSize,
    minPOIDist = 10, minCenterDist = 6,
    radiusMin = 0.35, radiusMax = 0.5,
    baseY = 0, scaleMin = 1, scaleMax = 1,
    rotRandom = true, yRandom = 0, name = 'prop',
  } = opts;

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;

  const dummy = new THREE.Object3D();
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 30;

  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const distFrac = radiusMin + Math.random() * (radiusMax - radiusMin);
    const dist = arenaSize * 0.5 * distFrac;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    if (!isFreeSpot(x, z, minPOIDist, minCenterDist)) continue;

    dummy.position.set(x, baseY + (Math.random() - 0.5) * yRandom, z);
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

// ════════════════════════════════════════════════════════════
// BUILD WORLD
// ════════════════════════════════════════════════════════════
export function buildWorld(scene, arenaSize) {
  const world = {
    wallColliders: [],
    furnitureColliders: [],
    doors: [],
    weaponSpots: [],
    pois: {},
  };

  // 1. Terreno estendido + patches de terra
  buildExtendedGround(scene, arenaSize);

  // 2. Barreira de morros low-poly
  buildRockBorder(scene, arenaSize);

  // 3. Ruas (yOffset distintos → anti z-fighting)
  buildRoads(scene, arenaSize);

  // 4. Faixas amarelas centrais tracejadas
  buildRoadLines(scene, arenaSize);

  // 5. Calçadas elevadas nas bordas das ruas
  buildSidewalks(scene, arenaSize);

  // 6. Faixas de pedestres nos cruzamentos
  buildCrosswalks(scene, arenaSize);

  // 7. Postes de iluminação urbana (InstancedMesh)
  buildStreetLights(scene, arenaSize);

  // 8. POIs (edifícios)
  for (const poi of POIS) {
    let bounds;
    switch (poi.type) {
      case 'police':    bounds = buildPoliceStation(scene, poi, world); break;
      case 'hospital':  bounds = buildHospital(scene, poi, world); break;
      case 'church':    bounds = buildChurch(scene, poi, world); break;
      case 'market':    bounds = buildMarket(scene, poi, world); break;
      case 'gas':       bounds = buildGasStation(scene, poi, world); break;
      case 'military':  bounds = buildMilitaryBase(scene, poi, world); break;
      default:          bounds = buildHouse(scene, poi, world);
    }
    world.pois[poi.id] = { x: poi.x, z: poi.z, type: poi.type, bounds };
  }

  // 9. Árvores variadas (InstancedMesh)
  buildTrees(scene, arenaSize);

  // 10. Props (barris, caixas, arbustos, pedras)
  buildProps(scene, arenaSize);

  // 11. Carros abandonados (civis + militares)
  buildAbandonedCars(scene, arenaSize);

  // 12. Barricadas de sacos de areia
  buildSandbagBarricades(scene, arenaSize);

  // 13. Cercas de arame (decorativas)
  buildBarbedWire(scene, arenaSize);

  console.log(
    `[scenery] 🌍 Mundo construído: ` +
    `${world.wallColliders.length} wallColliders, ` +
    `${world.furnitureColliders.length} furnitureColliders, ` +
    `${world.doors.length} doors`
  );

  return world;
}

// ────────────────────────────────────────────────────────────
// 1. TERRENO ESTENDIDO
// ────────────────────────────────────────────────────────────
function buildExtendedGround(scene, arenaSize) {
  const size = arenaSize * 2.5;
  const tex = Textures.grassTexture();
  tex.repeat.set(size / 2, size / 2);

  const ground = new THREE.Mesh(
    getPlaneGeo(size, size),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  ground.name = 'extendedGround';
  scene.add(ground);

  // Patches de terra (decorativos)
  const dirtTex = Textures.grassTexture();
  dirtTex.repeat.set(2, 2);
  const dirtMat = new THREE.MeshLambertMaterial({
    map: dirtTex, color: 0x7D5A3C, transparent: true, opacity: 0.6,
  });
  const dirtGeo = new THREE.CircleGeometry(1, 8);
  const dirtCount = 20;
  const dirtMesh = new THREE.InstancedMesh(dirtGeo, dirtMat, dirtCount);
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let i = 0; i < dirtCount * 6 && placed < dirtCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = arenaSize * 0.4 + Math.random() * arenaSize * 0.4;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (!isFreeSpot(x, z, 12, 8)) continue;
    dummy.position.set(x, -0.04, z);
    dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    dummy.scale.setScalar(2 + Math.random() * 3);
    dummy.updateMatrix();
    dirtMesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  dirtMesh.count = placed;
  dirtMesh.instanceMatrix.needsUpdate = true;
  dirtMesh.receiveShadow = true;
  dirtMesh.name = 'dirtPatches';
  scene.add(dirtMesh);
}

// ────────────────────────────────────────────────────────────
// 2. MORROS AO REDOR
// ────────────────────────────────────────────────────────────
function buildRockBorder(scene, arenaSize) {
  const rockCount = 110;
  const mesh = new THREE.InstancedMesh(getUnitIco(), MATS.rock, rockCount);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'rockBorder';

  const dummy = new THREE.Object3D();
  for (let i = 0; i < rockCount; i++) {
    const angle = (i / rockCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.09;
    const radius = arenaSize * 0.56 + Math.random() * 9;
    dummy.position.set(
      Math.cos(angle) * radius,
      0.5 + Math.random() * 0.8,
      Math.sin(angle) * radius
    );
    dummy.rotation.set(
      Math.random() * 0.35,
      Math.random() * Math.PI * 2,
      Math.random() * 0.35
    );
    dummy.scale.set(
      2.4 + Math.random() * 2.8,
      2.0 + Math.random() * 1.8,
      2.4 + Math.random() * 2.8
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// ────────────────────────────────────────────────────────────
// 3. RUAS
// ────────────────────────────────────────────────────────────
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
    const geo = getPlaneGeo(
      horizontal ? length : width,
      horizontal ? width : length
    );
    entry = { mat, geo };
    _roadCache.set(key, entry);
  }
  const road = new THREE.Mesh(entry.geo, entry.mat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, yOffset, z);
  road.receiveShadow = true;
  return road;
}

function buildRoads(scene, arenaSize) {
  // Ruas principais (cruz): yOffsets distintos para anti z-fighting
  scene.add(createRoad(0, 0, 8, arenaSize, true,  0.020));
  scene.add(createRoad(0, 0, 8, arenaSize, false, 0.021));
  // Ruas secundárias
  scene.add(createRoad(0, -20, 5, arenaSize, true,  0.022));
  scene.add(createRoad(0,  20, 5, arenaSize, true,  0.023));
  scene.add(createRoad(-20, 0, 5, arenaSize, false, 0.024));
  scene.add(createRoad( 20, 0, 5, arenaSize, false, 0.025));
}

// ────────────────────────────────────────────────────────────
// 4. FAIXAS AMARELAS CENTRAIS TRACEJADAS
// ────────────────────────────────────────────────────────────
function buildRoadLines(scene, arenaSize) {
  const dashGeo = getPlaneGeo(0.35, 1.8);
  const dashCount = 80;
  const mesh = new THREE.InstancedMesh(dashGeo, MATS.roadLine, dashCount);
  const dummy = new THREE.Object3D();
  let idx = 0;

  // Faixas horizontais (ao longo de Z) nas ruas verticais
  for (const roadX of [0, -20, 20]) {
    for (let i = 0; i < 20 && idx < dashCount; i++) {
      const z = -arenaSize / 2 + 3 + i * 3;
      dummy.position.set(roadX, 0.026 + idx * 0.00005, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  }
  // Faixas verticais (ao longo de X) nas ruas horizontais
  for (const roadZ of [0, -20, 20]) {
    for (let i = 0; i < 20 && idx < dashCount; i++) {
      const x = -arenaSize / 2 + 3 + i * 3;
      dummy.position.set(x, 0.027 + idx * 0.00005, roadZ);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  }
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'roadDashes';
  scene.add(mesh);
}

// ────────────────────────────────────────────────────────────
// 5. CALÇADAS ELEVADAS
// ────────────────────────────────────────────────────────────
function buildSidewalks(scene, arenaSize) {
  // Calçadas ao longo das ruas principais
  const segments = [
    // Verticais (paralelas a X, ao lado da rua X=0)
    { w: arenaSize, h: 2, x: -5, z: 0, y: 0.028 },
    { w: arenaSize, h: 2, x:  5, z: 0, y: 0.029 },
    // Horizontais (paralelas a Z, ao lado da rua Z=0)
    { w: 2, h: arenaSize, x: 0, z: -5, y: 0.030 },
    { w: 2, h: arenaSize, x: 0, z:  5, y: 0.031 },
  ];
  for (const s of segments) {
    const sw = new THREE.Mesh(getPlaneGeo(s.w, s.h), MATS.concrete);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(s.x, s.y, s.z);
    sw.receiveShadow = true;
    scene.add(sw);
  }

  // Meio-fio (borda de concreto mais alta)
  const curbMat = new THREE.MeshLambertMaterial({ color: 0x7A7A7A });
  const curbH = 0.1;
  const curbGeo = getUnitBox();
  const curbs = [
    { x: -6, z: 0, sx: 0.2, sy: curbH, sz: arenaSize },
    { x:  6, z: 0, sx: 0.2, sy: curbH, sz: arenaSize },
    { x: 0, z: -6, sx: arenaSize, sy: curbH, sz: 0.2 },
    { x: 0, z:  6, sx: arenaSize, sy: curbH, sz: 0.2 },
  ];
  for (const c of curbs) {
    const m = new THREE.Mesh(curbGeo, curbMat);
    m.position.set(c.x, curbH / 2, c.z);
    m.scale.set(c.sx, c.sy, c.sz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
}

// ────────────────────────────────────────────────────────────
// 6. FAIXAS DE PEDESTRES
// ────────────────────────────────────────────────────────────
function buildCrosswalks(scene, arenaSize) {
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xEEEEEE });
  const stripeGeo = getPlaneGeo(0.5, 3.5);
  const intersections = [
    { x: 0, z: 0 }, { x: -20, z: 0 }, { x: 20, z: 0 },
    { x: 0, z: -20 }, { x: 0, z: 20 },
  ];
  const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, intersections.length * 8);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (const inter of intersections) {
    // Stripes verticais (cruzando rua horizontal)
    for (let i = 0; i < 4; i++) {
      dummy.position.set(inter.x - 3 + i * 2, 0.033 + idx * 0.00005, inter.z + 4.5);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      stripes.setMatrixAt(idx++, dummy.matrix);
    }
    // Stripes horizontais
    for (let i = 0; i < 4; i++) {
      dummy.position.set(inter.x + 4.5, 0.033 + idx * 0.00005, inter.z - 3 + i * 2);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      stripes.setMatrixAt(idx++, dummy.matrix);
    }
  }
  stripes.count = idx;
  stripes.instanceMatrix.needsUpdate = true;
  stripes.name = 'crosswalks';
  scene.add(stripes);
}

// ────────────────────────────────────────────────────────────
// 7. POSTES DE ILUMINAÇÃO
// ────────────────────────────────────────────────────────────
function buildStreetLights(scene, arenaSize) {
  const positions = [];
  const spacing = 20;
  const half = arenaSize / 2 - 6;
  // Ao longo das ruas principais
  for (let z = -half; z <= half; z += spacing) {
    if (Math.abs(z) > 4) {
      positions.push({ x: -7, z, rotY: 0 });
      positions.push({ x:  7, z, rotY: Math.PI });
    }
  }
  for (let x = -half; x <= half; x += spacing) {
    if (Math.abs(x) > 4) {
      positions.push({ x, z: -7, rotY: -Math.PI / 2 });
      positions.push({ x, z:  7, rotY:  Math.PI / 2 });
    }
  }

  const count = positions.length;
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 4.5, 6);
  const armGeo = getUnitBox();
  const lampGeo = getUnitBox();

  const poleMesh = new THREE.InstancedMesh(poleGeo, MATS.pole, count);
  const armMesh = new THREE.InstancedMesh(armGeo, MATS.poleTop, count);
  const lampMesh = new THREE.InstancedMesh(lampGeo, MATS.lampOn, count);

  poleMesh.castShadow = true;
  armMesh.castShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const p = positions[i];

    // Poste
    dummy.position.set(p.x, 2.25, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);

    // Braço horizontal apontando para a rua
    const armOffsetLocal = new THREE.Vector3(0, 4.4, -0.6);
    armOffsetLocal.applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
    dummy.position.set(p.x + armOffsetLocal.x, armOffsetLocal.y, p.z + armOffsetLocal.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(0.15, 0.15, 1.4);
    dummy.updateMatrix();
    armMesh.setMatrixAt(i, dummy.matrix);

    // Lâmpada
    const lampOffsetLocal = new THREE.Vector3(0, 4.2, -1.3);
    lampOffsetLocal.applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
    dummy.position.set(p.x + lampOffsetLocal.x, lampOffsetLocal.y, p.z + lampOffsetLocal.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.scale.set(0.3, 0.15, 0.5);
    dummy.updateMatrix();
    lampMesh.setMatrixAt(i, dummy.matrix);
  }
  poleMesh.instanceMatrix.needsUpdate = true;
  armMesh.instanceMatrix.needsUpdate = true;
  lampMesh.instanceMatrix.needsUpdate = true;

  poleMesh.name = 'streetPoles';
  armMesh.name = 'streetArms';
  lampMesh.name = 'streetLamps';
  scene.add(poleMesh, armMesh, lampMesh);
}

// ────────────────────────────────────────────────────────────
// 9. ÁRVORES VARIADAS (InstancedMesh)
// ────────────────────────────────────────────────────────────
function buildTrees(scene, arenaSize) {
  // Gerar posições de árvores
  const positions = [];
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * (arenaSize * 0.32);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.abs(x) > arenaSize / 2 - 2 || Math.abs(z) > arenaSize / 2 - 2) continue;
    if (!isFreeSpot(x, z, 12, 8)) continue;
    positions.push({
      x, z,
      rotY: Math.random() * Math.PI * 2,
      scale: 0.65 + Math.random() * 0.8,
      isConical: Math.random() < 0.35,
      leafTint: Math.random(),
    });
  }

  const N = positions.length;
  if (N === 0) return;

  const spherical = positions.filter(p => !p.isConical);
  const conical = positions.filter(p => p.isConical);

  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.9, 0);
  const coneGeo = new THREE.ConeGeometry(1.6, 3.2, 6);

  // Troncos (todos)
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, MATS.bark, N);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  trunkMesh.name = 'treeTrunks';
  trunkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);

  // Copas esféricas
  const crownMesh = spherical.length > 0
    ? new THREE.InstancedMesh(crownGeo, MATS.leafA, spherical.length)
    : null;
  if (crownMesh) {
    crownMesh.castShadow = true;
    crownMesh.name = 'treeCrownsSpherical';
    crownMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spherical.length * 3), 3);
  }

  // Copas cônicas
  const coneMesh = conical.length > 0
    ? new THREE.InstancedMesh(coneGeo, MATS.leafA, conical.length)
    : null;
  if (coneMesh) {
    coneMesh.castShadow = true;
    coneMesh.name = 'treeCrownsConical';
    coneMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(conical.length * 3), 3);
  }

  const dummy = new THREE.Object3D();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const tmpMat = new THREE.Matrix4();
  const parentMat = new THREE.Matrix4();
  const color = new THREE.Color();

  const leafColors = [0x2E8B3E, 0x3AA850, 0x4F8B2E];

  // Troncos
  let trunkIdx = 0;
  for (const p of positions) {
    tmpPos.set(p.x, 1.25 * p.scale, p.z);
    tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
    tmpScale.setScalar(p.scale);
    dummy.position.copy(tmpPos);
    dummy.quaternion.copy(tmpQuat);
    dummy.scale.copy(tmpScale);
    dummy.updateMatrix();
    trunkMesh.setMatrixAt(trunkIdx, dummy.matrix);
    trunkIdx++;
  }
  trunkMesh.instanceMatrix.needsUpdate = true;
  scene.add(trunkMesh);

  // Copas esféricas
  if (crownMesh) {
    let i = 0;
    for (const p of spherical) {
      // Três sub-copas compostas na mesma instância via matrix composta
      // (para manter baixo custo, usamos uma única copa por árvore)
      tmpPos.set(p.x, 4.0 * p.scale, p.z);
      tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
      tmpScale.setScalar(p.scale);
      dummy.position.copy(tmpPos);
      dummy.quaternion.copy(tmpQuat);
      dummy.scale.copy(tmpScale);
      dummy.updateMatrix();
      crownMesh.setMatrixAt(i, dummy.matrix);

      const tint = p.leafTint < 0.33 ? leafColors[0] : p.leafTint < 0.66 ? leafColors[1] : leafColors[2];
      color.setHex(tint);
      crownMesh.setColorAt(i, color);
      i++;
    }
    crownMesh.instanceMatrix.needsUpdate = true;
    if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
    scene.add(crownMesh);
  }

  // Copas cônicas
  if (coneMesh) {
    let i = 0;
    for (const p of conical) {
      tmpPos.set(p.x, 4.2 * p.scale, p.z);
      tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
      tmpScale.setScalar(p.scale);
      dummy.position.copy(tmpPos);
      dummy.quaternion.copy(tmpQuat);
      dummy.scale.copy(tmpScale);
      dummy.updateMatrix();
      coneMesh.setMatrixAt(i, dummy.matrix);

      const tint = p.leafTint < 0.5 ? leafColors[0] : leafColors[2];
      color.setHex(tint);
      coneMesh.setColorAt(i, color);
      i++;
    }
    coneMesh.instanceMatrix.needsUpdate = true;
    if (coneMesh.instanceColor) coneMesh.instanceColor.needsUpdate = true;
    scene.add(coneMesh);
  }
}

// ────────────────────────────────────────────────────────────
// 10. PROPS (barris, caixas, arbustos, pedras)
// ────────────────────────────────────────────────────────────
function buildProps(scene, arenaSize) {
  // Barris de óleo
  scatterInstanced(scene, {
    count: 24, geo: getUnitCyl(8), mat: MATS.barrel, arenaSize,
    minPOIDist: 8, minCenterDist: 6,
    radiusMin: 0.28, radiusMax: 0.48,
    baseY: 0.45, scaleMin: 0.85, scaleMax: 1.15,
    name: 'barrels',
  });

  // Barris metálicos (variedade)
  scatterInstanced(scene, {
    count: 14, geo: getUnitCyl(8), mat: MATS.barrelMetal, arenaSize,
    minPOIDist: 8, minCenterDist: 6,
    radiusMin: 0.28, radiusMax: 0.48,
    baseY: 0.45, scaleMin: 0.85, scaleMax: 1.15,
    name: 'barrelsMetal',
  });

  // Caixas de madeira
  scatterInstanced(scene, {
    count: 38, geo: getUnitBox(), mat: MATS.crate, arenaSize,
    minPOIDist: 7, minCenterDist: 5,
    radiusMin: 0.22, radiusMax: 0.5,
    baseY: 0.3, scaleMin: 0.5, scaleMax: 0.85,
    name: 'crates',
  });

  // Arbustos verdes
  scatterInstanced(scene, {
    count: 60, geo: getUnitIco(), mat: MATS.bush, arenaSize,
    minPOIDist: 5, minCenterDist: 4,
    radiusMin: 0.22, radiusMax: 0.5,
    baseY: 0.35, scaleMin: 1.6, scaleMax: 2.6,
    name: 'bushes',
  });

  // Arbustos secos
  scatterInstanced(scene, {
    count: 28, geo: getUnitIco(), mat: MATS.bushDry, arenaSize,
    minPOIDist: 5, minCenterDist: 4,
    radiusMin: 0.22, radiusMax: 0.5,
    baseY: 0.3, scaleMin: 1.2, scaleMax: 2.0,
    name: 'bushesDry',
  });

  // Pedras pequenas
  scatterInstanced(scene, {
    count: 45, geo: getUnitIco(), mat: MATS.rock, arenaSize,
    minPOIDist: 5, minCenterDist: 4,
    radiusMin: 0.2, radiusMax: 0.5,
    baseY: 0.25, scaleMin: 0.7, scaleMax: 1.6,
    name: 'rocksSmall',
  });

  // Pedras escuras (variação)
  scatterInstanced(scene, {
    count: 20, geo: getUnitIco(), mat: MATS.rockDark, arenaSize,
    minPOIDist: 6, minCenterDist: 5,
    radiusMin: 0.3, radiusMax: 0.5,
    baseY: 0.3, scaleMin: 0.8, scaleMax: 1.4,
    name: 'rocksDark',
  });
}

// ────────────────────────────────────────────────────────────
// 11. CARROS ABANDONADOS
// ────────────────────────────────────────────────────────────
function buildAbandonedCars(scene, arenaSize) {
  const carColors = [MATS.carBody1, MATS.carBody2, MATS.carBody3, MATS.carBody4];

  // 6 carros civis
  const carPositions = [
    { x: 12,  z: -22, rot: 0.4 },
    { x: -18, z: 20,  rot: 1.2 },
    { x: 25,  z: 8,   rot: -0.7 },
    { x: -32, z: -8,  rot: 0.9 },
    { x: 8,   z: 28,  rot: 2.1 },
    { x: -10, z: -30, rot: -1.5 },
  ];
  for (let i = 0; i < carPositions.length; i++) {
    const p = carPositions[i];
    scene.add(createCar(p.x, p.z, p.rot, carColors[i % carColors.length], false));
  }

  // 2 caminhões militares
  const truckPositions = [
    { x: -18, z: -40, rot: 0.2 },
    { x:  18, z: -40, rot: -0.3 },
  ];
  for (const p of truckPositions) {
    scene.add(createCar(p.x, p.z, p.rot, MATS.militaryTruck, true));
  }
}

function createCar(x, z, rot, bodyMat, isTruck) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;

  if (isTruck) {
    // Caminhão militar
    const body = new THREE.Mesh(getUnitBox(), bodyMat);
    body.scale.set(2.2, 1.4, 5.0);
    body.position.y = 1.2;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const cab = new THREE.Mesh(getUnitBox(), bodyMat);
    cab.scale.set(2.0, 1.3, 1.8);
    cab.position.set(0, 1.1, -3.4);
    cab.castShadow = true;
    g.add(cab);

    const windshield = new THREE.Mesh(getUnitBox(), MATS.window);
    windshield.scale.set(1.8, 0.9, 0.05);
    windshield.position.set(0, 1.4, -2.5);
    g.add(windshield);
  } else {
    // Carro civil
    const body = new THREE.Mesh(getUnitBox(), bodyMat);
    body.scale.set(1.8, 0.7, 3.6);
    body.position.y = 0.7;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const cab = new THREE.Mesh(getUnitBox(), bodyMat);
    cab.scale.set(1.6, 0.7, 1.8);
    cab.position.set(0, 1.4, -0.1);
    cab.castShadow = true;
    g.add(cab);

    const wind = new THREE.Mesh(getUnitBox(), MATS.window);
    wind.scale.set(1.5, 0.55, 0.05);
    wind.position.set(0, 1.4, 0.82);
    g.add(wind);
  }

  // Rodas
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8);
  const wheelPositions = isTruck
    ? [[-1.1, 0.4, 1.8], [1.1, 0.4, 1.8], [-1.1, 0.4, -1.8], [1.1, 0.4, -1.8], [-1.1, 0.4, -3.2], [1.1, 0.4, -3.2]]
    : [[-0.95, 0.35, 1.2], [0.95, 0.35, 1.2], [-0.95, 0.35, -1.2], [0.95, 0.35, -1.2]];

  for (const [wx, wy, wz] of wheelPositions) {
    const w = new THREE.Mesh(wheelGeo, MATS.tire);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz);
    w.castShadow = true;
    g.add(w);
  }

  return g;
}

// ────────────────────────────────────────────────────────────
// 12. BARRICADAS DE SACOS DE AREIA
// ────────────────────────────────────────────────────────────
function buildSandbagBarricades(scene, arenaSize) {
  const barricadeGeo = getUnitBox();
  const positions = [
    { x: -8, z: -8, rot: 0,     length: 3 },
    { x:  8, z:  8, rot: Math.PI / 2, length: 3 },
    { x: -22, z: 22, rot: 0,     length: 4 },
    { x:  22, z: -22, rot: 0,    length: 4 },
    { x: -30, z: 0, rot: Math.PI / 2, length: 3 },
    { x:  30, z: 0, rot: Math.PI / 2, length: 3 },
  ];

  const sandbagCount = 8; // por barricada
  const totalInstances = positions.length * sandbagCount * 2; // 2 camadas
  const mesh = new THREE.InstancedMesh(barricadeGeo, MATS.sandbag, totalInstances);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'sandbags';

  const dummy = new THREE.Object3D();
  const parentMat = new THREE.Matrix4();
  const localMat = new THREE.Matrix4();
  const finalMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  let idx = 0;

  for (const barricade of positions) {
    const bagSpacing = 0.6;
    const bagW = 0.55, bagH = 0.3, bagD = 0.6;

    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < sandbagCount; i++) {
        const offsetAlong = (i - (sandbagCount - 1) / 2) * bagSpacing;
        const localX = layer === 0 ? offsetAlong : offsetAlong * 0.9;
        const localY = layer === 0 ? bagH / 2 : bagH + bagH / 2;
        const localZ = layer === 0 ? 0 : (Math.random() - 0.5) * 0.1;

        // Posição local (antes da rotação da barricada)
        tmpPos.set(
          localX + (layer === 1 ? 0.1 : 0),
          localY,
          localZ
        );
        tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), barricade.rot);
        tmpPos.applyQuaternion(tmpQuat);

        dummy.position.set(
          barricade.x + tmpPos.x,
          tmpPos.y,
          barricade.z + tmpPos.z
        );
        dummy.rotation.set(0, barricade.rot + (Math.random() - 0.5) * 0.15, 0);
        dummy.scale.set(bagW, bagH, bagD);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
  }

  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// ────────────────────────────────────────────────────────────
// 13. CERCA DE ARAME FARPADO (decorativa)
// ────────────────────────────────────────────────────────────
function buildBarbedWire(scene, arenaSize) {
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 5);
  const wireGeo = getUnitBox();

  const posts = [];
  const wires = [];

  // Cerca ao redor da base militar (z ≈ -40)
  const baseZ = -40;
  const halfW = 14;
  const spacing = 2;
  const postCount = Math.floor((halfW * 2) / spacing) + 1;

  const postMesh = new THREE.InstancedMesh(postGeo, MATS.pole, postCount * 2 + 4);
  const dummy = new THREE.Object3D();
  let idx = 0;

  // Posts frontais
  for (let i = 0; i < postCount; i++) {
    const x = -halfW + i * spacing;
    dummy.position.set(x, 0.8, baseZ + 8);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postMesh.setMatrixAt(idx++, dummy.matrix);
  }
  // Posts traseiros
  for (let i = 0; i < postCount; i++) {
    const x = -halfW + i * spacing;
    dummy.position.set(x, 0.8, baseZ - 8);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    postMesh.setMatrixAt(idx++, dummy.matrix);
  }
  postMesh.count = idx;
  postMesh.instanceMatrix.needsUpdate = true;
  postMesh.name = 'barbedWirePosts';
  scene.add(postMesh);

  // Fios horizontais (visual)
  const wireMesh = new THREE.InstancedMesh(wireGeo, MATS.barbed, 6);
  let wIdx = 0;
  for (let layer = 0; layer < 3; layer++) {
    const y = 0.4 + layer * 0.5;
    // Frente
    dummy.position.set(0, y, baseZ + 8);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(halfW * 2, 0.03, 0.03);
    dummy.updateMatrix();
    wireMesh.setMatrixAt(wIdx++, dummy.matrix);
    // Trás
    dummy.position.set(0, y, baseZ - 8);
    dummy.updateMatrix();
    wireMesh.setMatrixAt(wIdx++, dummy.matrix);
  }
  wireMesh.count = wIdx;
  wireMesh.instanceMatrix.needsUpdate = true;
  wireMesh.name = 'barbedWires';
  scene.add(wireMesh);
}

// ════════════════════════════════════════════════════════════
// POI BUILDERS
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// 🏠 CASA
// ────────────────────────────────────────────────────────────
function buildHouse(scene, poi, world) {
  const sizes = { small: [6, 5], medium: [8, 6], large: [11, 8] };
  const [W, D] = sizes[poi.size] || sizes.medium;
  const H = 3.5, T = 0.24;
  const DOOR_W = 1.4, DOOR_H = 2.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const wallMat = Math.random() < 0.5 ? MATS.wallCream : MATS.wallWhite;
  const roofMat = Math.random() < 0.5 ? MATS.roofRed : MATS.roofGray;

  // Piso
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorCarpet);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes (traseira + laterais)
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, wallMat, g, world.wallColliders);

  // Parede frontal com recorte para porta
  const frontZ = D / 2 - T / 2;
  const segW = (W - DOOR_W) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, wallMat, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, wallMat, g, world.wallColliders);

  const headerH = H - DOOR_H;
  if (headerH > 0.1) {
    addBoxMesh(DOOR_W, headerH, T, 0, H - headerH / 2, frontZ, wallMat, g, null);
  }

  // Moldura da porta
  const trimT = 0.08;
  addBoxMesh(trimT, DOOR_H, trimT, -DOOR_W / 2 - trimT / 2, DOOR_H / 2, frontZ + T / 2, MATS.trim, g, null);
  addBoxMesh(trimT, DOOR_H, trimT,  DOOR_W / 2 + trimT / 2, DOOR_H / 2, frontZ + T / 2, MATS.trim, g, null);
  addBoxMesh(DOOR_W + trimT * 2, trimT, trimT, 0, DOOR_H + trimT / 2, frontZ + T / 2, MATS.trim, g, null);

  // Rodapé
  const baseH = 0.35;
  addBoxMesh(W + 0.04, baseH, T + 0.02, 0, baseH / 2, -D / 2 + T / 2, MATS.trim, g, null);
  addBoxMesh(T + 0.02, baseH, D, -W / 2 + T / 2, baseH / 2, 0, MATS.trim, g, null);
  addBoxMesh(T + 0.02, baseH, D,  W / 2 - T / 2, baseH / 2, 0, MATS.trim, g, null);

  // Janelas laterais
  const winW = 0.9, winH = 1.0, winY = 1.9;
  const windows = [
    { x: -W / 2 + T / 2 - 0.03, y: winY, z: -D / 4, rotY: -Math.PI / 2 },
    { x: -W / 2 + T / 2 - 0.03, y: winY, z:  D / 4, rotY: -Math.PI / 2 },
    { x:  W / 2 - T / 2 + 0.03, y: winY, z: -D / 4, rotY:  Math.PI / 2 },
    { x:  W / 2 - T / 2 + 0.03, y: winY, z:  D / 4, rotY:  Math.PI / 2 },
  ];
  for (const wp of windows) {
    const frame = addBoxMesh(winW + 0.14, winH + 0.14, 0.06, wp.x, wp.y, wp.z, MATS.trim, g, null);
    frame.rotation.y = wp.rotY;
    const glass = addBoxMesh(winW, winH, 0.05, wp.x, wp.y, wp.z, MATS.window, g, null);
    glass.rotation.y = wp.rotY;
  }

  // Porta com pivô animável
  const doorX = -DOOR_W / 2;
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX, 0, frontZ);
  const doorMesh = new THREE.Mesh(
    getBoxGeo(DOOR_W - 0.06, DOOR_H - 0.04, 0.08),
    MATS.darkWood
  );
  doorMesh.position.set((DOOR_W - 0.06) / 2, DOOR_H / 2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);
  g.add(doorPivot);

  // Puxador
  const handle = new THREE.Mesh(getBoxGeo(0.06, 0.06, 0.18), MATS.metal);
  handle.position.set(DOOR_W - 0.28, DOOR_H / 2, 0.08);
  doorPivot.add(handle);

  // Registrar no array de portas (posição em world space)
  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(doorX, 0, frontZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({
    group: doorPivot,
    currentAngle: 0,
    worldX: doorWorldPos.x,
    worldZ: doorWorldPos.z,
  });

  // Beiral
  addBoxMesh(W + 0.35, 0.12, D + 0.35, 0, H + 0.06, 0, MATS.trim, g, null);

  // Telhado cônico (4 águas)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, 1.6, 4), roofMat);
  roof.position.y = H + 0.8;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  // Móveis internos
  addBoxMesh(1.4, 0.75, 0.8, 0, 0.375, 2, MATS.wood, g, world.furnitureColliders);
  addBoxMesh(1.6, 0.4, 0.65, 0.5, 0.35, -D / 2 + 0.55, MATS.darkWood, g, world.furnitureColliders);
  addBoxMesh(0.6, 0.5, 0.6, -W / 2 + 1.2, 0.25, 1.5, MATS.wood, g, world.furnitureColliders);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'house' };
}

// ────────────────────────────────────────────────────────────
// 🚓 DELEGACIA
// ────────────────────────────────────────────────────────────
function buildPoliceStation(scene, poi, world) {
  const W = 16, D = 12, H = 4.5, T = 0.28;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  // Piso
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes perimetrais
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallGray, g, world.wallColliders);

  // Frontal com porta
  const frontZ = D / 2 - T / 2;
  const doorW = 3.0;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallGray, g, world.wallColliders);

  // Letreiro azul acima da porta
  const signMat = new THREE.MeshBasicMaterial({ color: 0x2196F3 });
  const sign = new THREE.Mesh(getBoxGeo(W * 0.55, 0.6, 0.1), signMat);
  sign.position.set(0, H - 0.6, frontZ + 0.06);
  g.add(sign);

  // Porta com pivô
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-doorW / 2, 0, frontZ);
  const doorMesh = new THREE.Mesh(
    getBoxGeo(doorW - 0.1, H - 0.5, 0.1),
    MATS.darkMetal
  );
  doorMesh.position.set((doorW - 0.1) / 2, (H - 0.5) / 2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);
  g.add(doorPivot);

  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(-doorW / 2, 0, frontZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({
    group: doorPivot,
    currentAngle: 0,
    worldX: doorWorldPos.x,
    worldZ: doorWorldPos.z,
  });

  // Balcão de recepção
  addBoxMesh(6, 1.1, 0.7, 0, 0.55, 2, MATS.darkWood, g, world.furnitureColliders);

  // Celas (divisórias de metal)
  for (let i = 0; i < 2; i++) {
    const cellX = -W / 2 + 3 + i * 5;
    addBoxMesh(0.15, 2.5, 3, cellX - 1.5, 1.25, -D / 2 + 2.2, MATS.darkMetal, g, world.wallColliders);
    addBoxMesh(0.15, 2.5, 3, cellX + 1.5, 1.25, -D / 2 + 2.2, MATS.darkMetal, g, world.wallColliders);
    // Bancos
    addBoxMesh(1.8, 0.4, 0.5, cellX, 0.3, -D / 2 + 1.5, MATS.darkWood, g, world.furnitureColliders);
  }

  // Mesa de escritório
  addBoxMesh(2, 0.9, 1, 4, 0.45, -D / 2 + 2, MATS.darkWood, g, world.furnitureColliders);

  // Telhado (plano, industrial)
  const roof = new THREE.Mesh(getBoxGeo(W + 0.5, 0.4, D + 0.5), MATS.roofBlack);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'police' };
}

// ────────────────────────────────────────────────────────────
// 🏥 HOSPITAL
// ────────────────────────────────────────────────────────────
function buildHospital(scene, poi, world) {
  const W = 18, D = 14, H = 5.0, T = 0.28;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  // Piso
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorWhite);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallWhite, g, world.wallColliders);

  // Frontal com entrada
  const frontZ = D / 2 - T / 2;
  const doorW = 2.8;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallWhite, g, world.wallColliders);

  // Cruz vermelha
  const crossH = new THREE.Mesh(getBoxGeo(1.2, 0.4, 0.1), MATS.cross);
  crossH.position.set(0, H - 0.9, frontZ + 0.06);
  g.add(crossH);
  const crossV = new THREE.Mesh(getBoxGeo(0.4, 1.2, 0.1), MATS.cross);
  crossV.position.set(0, H - 0.9, frontZ + 0.06);
  g.add(crossV);

  // Divisórias internas
  addBoxMesh(T, H, D * 0.5, -3, H / 2, -D / 4, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D * 0.5,  3, H / 2, -D / 4, MATS.wallWhite, g, world.wallColliders);

  // Macas nos corredores
  for (let i = 0; i < 4; i++) {
    const bx = -W / 2 + 3 + i * 4;
    addBoxMesh(1.8, 0.55, 0.9, bx, 0.4, -D / 2 + 2.5, MATS.metal, g, world.furnitureColliders);
  }

  // Balcão de recepção
  addBoxMesh(4, 1.1, 0.7, 0, 0.55, D / 2 - 1.5, MATS.floorTile, g, world.furnitureColliders);

  // Porta com pivô
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-doorW / 2, 0, frontZ);
  const doorMesh = new THREE.Mesh(
    getBoxGeo(doorW - 0.08, H - 0.4, 0.08),
    MATS.window
  );
  doorMesh.position.set((doorW - 0.08) / 2, (H - 0.4) / 2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);
  g.add(doorPivot);

  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(-doorW / 2, 0, frontZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({
    group: doorPivot,
    currentAngle: 0,
    worldX: doorWorldPos.x,
    worldZ: doorWorldPos.z,
  });

  // Telhado (duas águas via 2 planos inclinados)
  const roofL = new THREE.Mesh(getBoxGeo(W + 0.5, 0.3, D * 0.55), MATS.roofRed);
  roofL.position.set(0, H + 0.5, -D * 0.22);
  roofL.rotation.x = -0.25;
  roofL.castShadow = true;
  g.add(roofL);
  const roofR = new THREE.Mesh(getBoxGeo(W + 0.5, 0.3, D * 0.55), MATS.roofRed);
  roofR.position.set(0, H + 0.5, D * 0.22);
  roofR.rotation.x = 0.25;
  roofR.castShadow = true;
  g.add(roofR);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'hospital' };
}

// ────────────────────────────────────────────────────────────
// ⛪ IGREJA
// ────────────────────────────────────────────────────────────
function buildChurch(scene, poi, world) {
  const W = 12, D = 20, H = 6.5, T = 0.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  // Piso
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallStone, g, world.wallColliders);

  const frontZ = D / 2 - T / 2;
  const doorW = 2.4;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallStone, g, world.wallColliders);

  // Torres sineiras (frontal traseira)
  for (const side of [-1, 1]) {
    const towerX = side * (W / 2 - 1);
    addBoxMesh(2.5, 10, 2.5, towerX, 5, -D / 2 + 1.2, MATS.wallStone, g, world.wallColliders);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.5, 4), MATS.roofDarkRed);
    spire.position.set(towerX, 11.25, -D / 2 + 1.2);
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = true;
    g.add(spire);
  }

  // Cruz no topo
  const crossH = new THREE.Mesh(getBoxGeo(1.2, 0.2, 0.2), MATS.cross);
  crossH.position.set(0, H + 1.4, frontZ);
  g.add(crossH);
  const crossV = new THREE.Mesh(getBoxGeo(0.2, 2.0, 0.2), MATS.cross);
  crossV.position.set(0, H + 1.0, frontZ);
  g.add(crossV);

  // Bancos de igreja (3 fileiras x 4 colunas)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const bx = -W / 2 + 2 + col * 2.5;
      const bz = -D / 2 + 4 + row * 3;
      addBoxMesh(2.0, 0.75, 0.4, bx, 0.375, bz, MATS.darkWood, g, world.furnitureColliders);
    }
  }

  // Altar
  addBoxMesh(3, 1.2, 1.2, 0, 0.6, -D / 2 + 3, MATS.darkWood, g, world.furnitureColliders);

  // Telhado cônico
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.75, 3, 4), MATS.roofDarkRed);
  roof.position.y = H + 1.5;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'church' };
}

// ────────────────────────────────────────────────────────────
// 🏪 MERCADO
// ────────────────────────────────────────────────────────────
function buildMarket(scene, poi, world) {
  const W = 14, D = 10, H = 3.8, T = 0.24;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  // Piso
  const floor = new THREE.Mesh(getPlaneGeo(W - T * 2, D - T * 2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes
  addBoxMesh(W, H, T, 0, H / 2, -D / 2 + T / 2, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D, -W / 2 + T / 2, H / 2, 0, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D,  W / 2 - T / 2, H / 2, 0, MATS.wallCream, g, world.wallColliders);

  const frontZ = D / 2 - T / 2;
  const doorW = 2.2;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W / 2 + segW / 2, H / 2, frontZ, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W / 2 - segW / 2, H / 2, frontZ, MATS.wallCream, g, world.wallColliders);

  // Prateleiras
  for (let i = 0; i < 4; i++) {
    const sx = -W / 2 + 2 + i * 3;
    addBoxMesh(0.8, 2.4, D - 3, sx, 1.2, 0, MATS.metal, g, world.furnitureColliders);
  }

  // Balcão de caixa
  addBoxMesh(5, 1.0, 0.6, 0, 0.5, D / 2 - 1.5, MATS.darkWood, g, world.furnitureColliders);

  // Porta pivotada
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-doorW / 2, 0, frontZ);
  const doorMesh = new THREE.Mesh(
    getBoxGeo(doorW - 0.08, H - 0.3, 0.08),
    MATS.window
  );
  doorMesh.position.set((doorW - 0.08) / 2, (H - 0.3) / 2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);
  g.add(doorPivot);

  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(-doorW / 2, 0, frontZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({
    group: doorPivot,
    currentAngle: 0,
    worldX: doorWorldPos.x,
    worldZ: doorWorldPos.z,
  });

  // Telhado plano
  const roof = new THREE.Mesh(getBoxGeo(W + 0.5, 0.4, D + 0.5), MATS.roofGray);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'market' };
}

// ────────────────────────────────────────────────────────────
// ⛽ POSTO DE GASOLINA
// ────────────────────────────────────────────────────────────
function buildGasStation(scene, poi, world) {
  const W = 10, D = 8;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  // Piso
  const floor = new THREE.Mesh(getPlaneGeo(W, D), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Colunas do toldo
  for (let i = 0; i < 4; i++) {
    const px = (i % 2 === 0 ? -W / 3 : W / 3);
    const pz = (i < 2 ? -D / 3 : D / 3);
    addBoxMesh(0.4, 3.5, 0.4, px, 1.75, pz, MATS.metal, g, world.furnitureColliders);
  }

  // Toldo
  addBoxMesh(W * 0.9, 0.3, D * 0.9, 0, 3.6, 0, MATS.darkMetal, g, null);

  // Bombas de gasolina
  for (const side of [-1, 1]) {
    addBoxMesh(0.7, 1.3, 0.5, side * 2, 0.65, 0, MATS.wallGray, g, world.furnitureColliders);
    // Visor da bomba
    const display = new THREE.Mesh(getBoxGeo(0.5, 0.25, 0.1), MATS.lampOn);
    display.position.set(side * 2, 1.05, 0.28);
    g.add(display);
  }

  // Loja de conveniência
  addBoxMesh(4, 3, 4, -W / 2 + 2, 1.5, -D / 2 + 2, MATS.wallCream, g, world.wallColliders);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'gas' };
}

// ────────────────────────────────────────────────────────────
// 🪖 BASE MILITAR
// ────────────────────────────────────────────────────────────
function buildMilitaryBase(scene, poi, world) {
  const W = 22, D = 14, H = 3.8, T = 0.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  // Piso de concreto
  const floor = new THREE.Mesh(getPlaneGeo(W, D), MATS.floorMilitary);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  g.add(floor);

  // ── Quartel (barracão retangular)
  const BW = 14, BD = 8, BH = 3.5;
  addBoxMesh(BW, BH, T, 0, BH / 2, -BD / 2 + T / 2, MATS.wallMilitary, g, world.wallColliders);
  addBoxMesh(BW, BH, T, 0, BH / 2,  BD / 2 - T / 2, MATS.wallMilitary, g, world.wallColliders);
  addBoxMesh(T, BH, BD, -BW / 2 + T / 2, BH / 2, 0, MATS.wallMilitary, g, world.wallColliders);
  addBoxMesh(T, BH, BD,  BW / 2 - T / 2, BH / 2, 0, MATS.wallMilitary, g, world.wallColliders);

  // Telhado
  const roof = new THREE.Mesh(getBoxGeo(BW + 0.4, 0.3, BD + 0.4), MATS.roofBlack);
  roof.position.y = BH + 0.15;
  roof.castShadow = true;
  g.add(roof);

  // ── Torres de vigia
  const towers = [
    { x: -10, z: -7 },
    { x:  10, z: -7 },
    { x: -10, z:  7 },
    { x:  10, z:  7 },
  ];
  for (const t of towers) {
    // Pernas
    for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      addBoxMesh(0.15, 4, 0.15, t.x + dx, 2, t.z + dz, MATS.darkWood, g, world.furnitureColliders);
    }
    // Plataforma
    addBoxMesh(1.6, 0.15, 1.6, t.x, 4.05, t.z, MATS.darkWood, g, null);
    // Cobertura
    addBoxMesh(1.8, 0.15, 1.8, t.x, 6.2, t.z, MATS.roofBlack, g, null);
    // Colunas de suporte da cobertura
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      addBoxMesh(0.1, 2, 0.1, t.x + dx, 5.15, t.z + dz, MATS.darkWood, g, null);
    }
    // Sacos de areia na base da torre
    for (let i = 0; i < 4; i++) {
      addBoxMesh(0.5, 0.3, 0.5, t.x - 1 + i * 0.65, 0.15, t.z + 1, MATS.sandbag, g, null);
    }
  }

  // ── Caixas de munição empilhadas
  for (let i = 0; i < 8; i++) {
    const cx = -4 + (i % 4) * 2;
    const cz = -3 + Math.floor(i / 4) * 1.2;
    addBoxMesh(1, 0.8, 0.8, cx, 0.4, cz, MATS.crate, g, world.furnitureColliders);
  }

  // ── Barris de combustível
  for (let i = 0; i < 4; i++) {
    addBoxMesh(0.9, 0.9, 0.9, 6 + i * 0.7, 0.45, 4, MATS.barrelMetal, g, world.furnitureColliders);
  }

  // ── Antena de rádio
  addBoxMesh(0.2, 8, 0.2, 8, 4, -5, MATS.metal, g, null);
  addBoxMesh(0.05, 0.05, 1, 8, 8, -4.5, MATS.metal, g, null);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'military' };
}

// ════════════════════════════════════════════════════════════
// API legada: createTree / createRoad (compatibilidade)
// ════════════════════════════════════════════════════════════
export function createTree(x, z) {
  // Wrapper: cria uma árvore individual (não-otimizada) para
  // compatibilidade com código que ainda chama createTree().
  // Para performance, buildWorld() usa InstancedMesh internamente.
  const g = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.9, 0);
  const trunk = new THREE.Mesh(trunkGeo, MATS.bark);
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  g.add(trunk);
  const crown = new THREE.Mesh(crownGeo, MATS.leafA);
  crown.position.y = 4;
  crown.castShadow = true;
  g.add(crown);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  g.scale.setScalar(0.65 + Math.random() * 0.8);
  return g;
}
