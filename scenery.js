// ============================================================
// scenery.js — v6 (ULTIMATE EXPANDED EDITION)
// • Cidade muito maior, expansiva e detalhada com múltiplos distritos
// • Prédios com telhados volumétricos, varandas e letreiros
// • Zona industrial, comercial e residencial interligadas
// • Barricadas militares, contentores, frotas de carros e detritos
// • Otimização extrema com InstancedMesh e cache de geometrias
// ============================================================

import * as THREE from 'three';
import * as Textures from './textures.js';

export const POIS = [
  // Distrito Policial / Militar
  { id: 'police',      type: 'police',    x: -32, z: -32, rot: Math.PI * 0.25,   size: 'large'  },
  { id: 'militaryOutpost', type: 'military', x:  32, z: -32, rot: -Math.PI * 0.25, size: 'large'  },
  // Setor Hospitalar
  { id: 'hospital',    type: 'hospital',  x:  32, z:  32, rot: -Math.PI * 0.75,  size: 'large'  },
  { id: 'pharmacy',    type: 'market',    x: -32, z:  32, rot: Math.PI * 0.75,   size: 'medium' },
  // Centro Religioso / Cívico
  { id: 'church',      type: 'church',    x:   0, z:  42, rot: Math.PI,          size: 'medium' },
  { id: 'townHall',    type: 'police',    x:   0, z: -42, rot: 0,                size: 'large'  },
  // Zona Comercial
  { id: 'market',      type: 'market',    x: -42, z:   0, rot: Math.PI * 0.5,    size: 'medium' },
  { id: 'gasStation',  type: 'gas',       x:  42, z:   0, rot: -Math.PI * 0.5,   size: 'small'  },
  { id: 'warehouse',   type: 'market',    x: -42, z: -20, rot: Math.PI * 0.5,    size: 'large'  },
  // Bairro Residencial
  { id: 'house1',      type: 'house',     x: -16, z: -16, rot: 0,                size: 'medium' },
  { id: 'house2',      type: 'house',     x:  16, z: -16, rot: Math.PI * 0.5,    size: 'small'  },
  { id: 'house3',      type: 'house',     x: -16, z:  16, rot: -Math.PI * 0.5,   size: 'large'  },
  { id: 'house4',      type: 'house',     x:  16, z:  16, rot: Math.PI,          size: 'medium' },
  { id: 'house5',      type: 'house',     x: -25, z:   0, rot: 0,                size: 'small'  },
  { id: 'house6',      type: 'house',     x:  25, z:   0, rot: Math.PI,          size: 'medium' },
];

// ════════════════════════════════════════════════════════════
// CACHE DE GEOMETRIAS
// ════════════════════════════════════════════════════════════
const _geoCache = new Map();
function getBoxGeo(w, h, d) {
  const k = `b:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _geoCache.set(k, g); }
  return g;
}
function getUnitBox() {
  let g = _geoCache.get('unitBox');
  if (!g) { g = new THREE.BoxGeometry(1, 1, 1); _geoCache.set('unitBox', g); }
  return g;
}
function getUnitIco() {
  let g = _geoCache.get('unitIco');
  if (!g) { g = new THREE.IcosahedronGeometry(0.5, 0); _geoCache.set('unitIco', g); }
  return g;
}

// ════════════════════════════════════════════════════════════
// MATERIAIS
// ════════════════════════════════════════════════════════════
function makeWallMat(hex, repU = 2, repV = 2) {
  const tex = Textures.houseWallTexture(hex);
  tex.repeat.set(repU, repV);
  return new THREE.MeshLambertMaterial({ map: tex });
}
function makeRoofMat(hex, repU = 4, repV = 4) {
  const tex = Textures.roofTexture(hex);
  tex.repeat.set(repU, repV);
  return new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
}

const MATS = {
  wallCream:   makeWallMat('#ECF0F1'),
  wallBrick:   makeWallMat('#8B4513'),
  wallWhite:   makeWallMat('#F5F5F5'),
  wallGray:    makeWallMat('#7F8C8D'),
  wallStone:   makeWallMat('#5D6D7E'),
  wallRust:    makeWallMat('#544A40'),
  roofRed:     makeRoofMat('#C0392B'),
  roofGray:    makeRoofMat('#7F8C8D'),
  roofDarkRed: makeRoofMat('#7B241C'),
  roofBlack:   makeRoofMat('#2C3E50'),
  wood:        new THREE.MeshLambertMaterial({ color: 0x8B5A2B }),
  darkWood:    new THREE.MeshLambertMaterial({ color: 0x5D4030 }),
  floorTile:   new THREE.MeshLambertMaterial({ color: 0xBDC3C7 }),
  floorWhite:  new THREE.MeshLambertMaterial({ color: 0xD5DBDB }),
  floorCarpet: new THREE.MeshLambertMaterial({ color: 0x6B4423 }),
  metal:       new THREE.MeshLambertMaterial({ color: 0x95A5A6 }),
  darkMetal:   new THREE.MeshLambertMaterial({ color: 0x34495E }),
  militaryGreen: new THREE.MeshLambertMaterial({ color: 0x4B5320 }),
  cross:       new THREE.MeshLambertMaterial({ color: 0xC0392B }),
  window:      new THREE.MeshLambertMaterial({ color: 0x1C2833 }),
  windowLit:   new THREE.MeshLambertMaterial({ color: 0xFFCC66, emissive: 0x664400 }),
  trim:        new THREE.MeshLambertMaterial({ color: 0x4A3527 }),
  concrete:    new THREE.MeshLambertMaterial({ map: Textures.concreteTexture() }),
  rock:        new THREE.MeshLambertMaterial({ color: 0x5A5A5A, flatShading: true }),
  bush:        new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
  bushDry:     new THREE.MeshLambertMaterial({ color: 0x6E8B3E, flatShading: true }),
  barrel:      new THREE.MeshLambertMaterial({ color: 0x8B4513, flatShading: true }),
  crate:       new THREE.MeshLambertMaterial({ color: 0xA0724A, flatShading: true }),
  carBody1:    new THREE.MeshLambertMaterial({ color: 0x8B1E1E }),
  carBody2:    new THREE.MeshLambertMaterial({ color: 0x2C3E50 }),
  carBody3:    new THREE.MeshLambertMaterial({ color: 0x4A4A4A }),
  militaryTruck: new THREE.MeshLambertMaterial({ color: 0x3A4424 }),
  tire:        new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  pole:        new THREE.MeshLambertMaterial({ color: 0x2A2A2A }),
  roadLine:    new THREE.MeshBasicMaterial({ color: 0xF1C40F }),
  sandbag:     new THREE.MeshLambertMaterial({ color: 0x8c7b5d }),
};

// ════════════════════════════════════════════════════════════
// HELPERS DE COLISÃO E POSICIONAMENTO
// ════════════════════════════════════════════════════════════
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

  if (absSin < 0.001) {
    const wx = gx + cos * x + sin * z;
    const wz = gz - sin * x + cos * z;
    colliderArray.push({
      minX: wx - w / 2, maxX: wx + w / 2,
      minZ: wz - d / 2, maxZ: wz + d / 2,
    });
    return m;
  }

  const L = Math.max(w, d);
  const N = Math.max(2, Math.ceil(L / 0.5));
  const segL = L / N;

  for (let i = 0; i < N; i++) {
    let lx, lz, hw, hd;
    if (w >= d) {
      lx = x + (i + 0.5 - N / 2) * segL;
      lz = z;
      hw = (segL / 2) * absCos + (d / 2) * absSin;
      hd = (segL / 2) * absSin + (d / 2) * absCos;
    } else {
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

function isFreeSpot(x, z, minPOIDist = 10, minCenterDist = 6, extraPOIs = POIS) {
  if (Math.hypot(x, z) < minCenterDist) return false;
  for (const poi of extraPOIs) {
    if (Math.hypot(x - poi.x, z - poi.z) < minPOIDist) return false;
  }
  return true;
}

function scatterInstanced(scene, opts) {
  const {
    count, geo, mat, arenaSize,
    minPOIDist = 10, minCenterDist = 6,
    radiusMin = 0.35, radiusMax = 0.5,
    baseY = 0, scaleMin = 1, scaleMax = 1,
    rotRandom = true, name = 'prop',
  } = opts;

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;

  const dummy = new THREE.Object3D();
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 25;

  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const distFrac = radiusMin + Math.random() * (radiusMax - radiusMin);
    const dist = arenaSize * 0.5 * distFrac;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    if (!isFreeSpot(x, z, minPOIDist, minCenterDist)) continue;

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

// ════════════════════════════════════════════════════════════
// BUILD WORLD PRINCIPAL
// ════════════════════════════════════════════════════════════
export function buildWorld(scene, arenaSize) {
  const world = {
    wallColliders: [],
    furnitureColliders: [],
    doors: [],
    weaponSpots: [],
    pois: {},
  };

  // 1. Terreno expansivo e morros de borda
  buildExtendedGround(scene, arenaSize);
  buildRockBorder(scene, arenaSize);

  // 2. Malha Urbana de Ruas Avenues & Boulevards
  buildUrbanGrid(scene, arenaSize);

  // 3. Construção de todos os POIs detalhados
  for (const poi of POIS) {
    let bounds;
    switch (poi.type) {
      case 'police':    bounds = buildPoliceStation(scene, poi, world); break;
      case 'military':  bounds = buildMilitaryOutpost(scene, poi, world); break;
      case 'hospital':  bounds = buildHospital(scene, poi, world); break;
      case 'church':    bounds = buildChurch(scene, poi, world); break;
      case 'market':    bounds = buildMarket(scene, poi, world); break;
      case 'gas':       bounds = buildGasStation(scene, poi, world); break;
      default:          bounds = buildHouse(scene, poi, world);
    }
    world.pois[poi.id] = { x: poi.x, z: poi.z, type: poi.type, bounds };
  }

  // 4. Floresta urbana e vegetação dispersa
  buildForest(scene, arenaSize);

  // 5. Props de rua (Barricadas militares, cones, caixas, postes, lixeiras)
  buildUrbanProps(scene, arenaSize);

  // 6. Frotas de veículos civis e caminhões militares abandonados
  buildAbandonedVehicles(scene, arenaSize);

  console.log(`[scenery v6] 🏙️ Cidade construída: ${world.wallColliders.length} paredes, ${world.furnitureColliders.length} móveis.`);
  return world;
}

// ════════════════════════════════════════════════════════════
// TERRENO E LIMITES
// ════════════════════════════════════════════════════════════
function buildExtendedGround(scene, arenaSize) {
  const size = arenaSize * 3.0; // 240 unidades de mundo aberto
  const tex = Textures.grassTexture();
  tex.repeat.set(size / 3, size / 3);
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.06;
  g.receiveShadow = true;
  scene.add(g);
}

function buildRockBorder(scene, arenaSize) {
  const rockGeo = new THREE.IcosahedronGeometry(1.8, 0);
  const count = 140;
  const mesh = new THREE.InstancedMesh(rockGeo, MATS.rock, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
    const radius = arenaSize * 0.65 + Math.random() * 12;
    dummy.position.set(
      Math.cos(angle) * radius,
      0.6 + Math.random() * 0.8,
      Math.sin(angle) * radius
    );
    dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
    dummy.scale.set(1.2 + Math.random() * 1.5, 0.9 + Math.random() * 1.2, 1.2 + Math.random() * 1.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// ════════════════════════════════════════════════════════════
// MALHA DE RUAS E CALÇADAS COMPLEXAS
// ════════════════════════════════════════════════════════════
function buildUrbanGrid(scene, arenaSize) {
  // Avenidas Principais Cruzadas
  scene.add(createRoad(0, 0, 10, arenaSize, true, 0.020));
  scene.add(createRoad(0, 0, 10, arenaSize, false, 0.021));
  // Ruas Secundárias Periféricas
  scene.add(createRoad(0, -25, 6, arenaSize, true, 0.022));
  scene.add(createRoad(0,  25, 6, arenaSize, true, 0.023));
  scene.add(createRoad(-25, 0, 6, arenaSize, false, 0.024));
  scene.add(createRoad( 25, 0, 6, arenaSize, false, 0.025));

  // Faixas amarelas centrais tracejadas
  const dashGeo = new THREE.PlaneGeometry(0.4, 2.5);
  const mesh = new THREE.InstancedMesh(dashGeo, MATS.roadLine, 80);
  const dummy = new THREE.Object3D();
  let idx = 0;

  for (let i = -35; i <= 35; i += 3) {
    if (Math.abs(i) < 6) continue;
    dummy.position.set(0, 0.028, i);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx++, dummy.matrix);

    dummy.position.set(i, 0.029, 0);
    dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx++, dummy.matrix);
  }
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  // Calçadas elevadas em blocos
  const sidewalkMat = MATS.concrete;
  const swGeo = new THREE.BoxGeometry(arenaSize, 0.15, 2.5);
  
  const sw1 = new THREE.Mesh(swGeo, sidewalkMat);
  sw1.position.set(0, 0.075, -6.25);
  sw1.receiveShadow = true; scene.add(sw1);

  const sw2 = new THREE.Mesh(swGeo, sidewalkMat);
  sw2.position.set(0, 0.075, 6.25);
  sw2.receiveShadow = true; scene.add(sw2);

  const swGeoV = new THREE.BoxGeometry(2.5, 0.15, arenaSize);
  const sw3 = new THREE.Mesh(swGeoV, sidewalkMat);
  sw3.position.set(-6.25, 0.075, 0);
  sw3.receiveShadow = true; scene.add(sw3);

  const sw4 = new THREE.Mesh(swGeoV, sidewalkMat);
  sw4.position.set(6.25, 0.075, 0);
  sw4.receiveShadow = true; scene.add(sw4);
}

function createRoad(x, z, width, length, horizontal = true, yOffset = 0.02) {
  const tex = Textures.asphaltTexture();
  tex.repeat.set(horizontal ? length / 3 : width / 3, horizontal ? width / 3 : length / 3);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const geo = new THREE.PlaneGeometry(horizontal ? length : width, horizontal ? width : length);
  const road = new THREE.Mesh(geo, mat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, yOffset, z);
  road.receiveShadow = true;
  return road;
}

// ════════════════════════════════════════════════════════════
// PROPS URBANOS E BARRICADAS
// ════════════════════════════════════════════════════════════
function buildUrbanProps(scene, arenaSize) {
  // Barris de óleo
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 8);
  scatterInstanced(scene, {
    count: 35, geo: barrelGeo, mat: MATS.barrel, arenaSize,
    minPOIDist: 7, minCenterDist: 5, radiusMin: 0.3, radiusMax: 0.48, baseY: 0.45, scaleMin: 0.9, scaleMax: 1.2
  });

  // Caixas de suprimento
  scatterInstanced(scene, {
    count: 45, geo: getUnitBox(), mat: MATS.crate, arenaSize,
    minPOIDist: 6, minCenterDist: 4, radiusMin: 0.25, radiusMax: 0.48, baseY: 0.3, scaleMin: 0.6, scaleMax: 1.0
  });

  // Postes de luz altos nas calçadas
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 6, 6);
  scatterInstanced(scene, {
    count: 24, geo: poleGeo, mat: MATS.pole, arenaSize,
    minPOIDist: 8, minCenterDist: 7, radiusMin: 0.38, radiusMax: 0.45, baseY: 3.0, scaleMin: 1.0, scaleMax: 1.1
  });
}

// ════════════════════════════════════════════════════════════
// VEÍCULOS ABANDONADOS E FROTAS MILITARES
// ════════════════════════════════════════════════════════════
function buildAbandonedVehicles(scene, arenaSize) {
  const carColors = [MATS.carBody1, MATS.carBody2, MATS.carBody3, MATS.militaryTruck];
  const spots = [
    { x: 14,  z: -24, rot: 0.5, type: 'car' },
    { x: -20, z: 22,  rot: 1.3, type: 'car' },
    { x: 28,  z: 12,  rot: -0.8, type: 'truck' },
    { x: -30, z: -12, rot: 1.0, type: 'car' },
    { x: 12,  z: 30,  rot: 2.2, type: 'car' },
    { x: -14, z: -32, rot: -1.8, type: 'truck' },
  ];

  spots.forEach((p, i) => {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.rot;

    if (p.type === 'truck') {
      // Caminhão Militar
      const body = new THREE.Mesh(getUnitBox(), MATS.militaryTruck);
      body.scale.set(2.4, 1.5, 5.0);
      body.position.y = 1.0; body.castShadow = true; g.add(body);

      const cab = new THREE.Mesh(getUnitBox(), MATS.militaryGreen);
      cab.scale.set(2.3, 1.3, 2.0);
      cab.position.set(0, 1.3, 2.0); cab.castShadow = true; g.add(cab);
    } else {
      // Carro Civil
      const mat = carColors[i % carColors.length];
      const body = new THREE.Mesh(getUnitBox(), mat);
      body.scale.set(1.9, 0.75, 4.0);
      body.position.y = 0.75; body.castShadow = true; g.add(body);

      const cab = new THREE.Mesh(getUnitBox(), mat);
      cab.scale.set(1.7, 0.7, 2.0);
      cab.position.set(0, 1.45, -0.2); cab.castShadow = true; g.add(cab);

      const wind = new THREE.Mesh(getUnitBox(), MATS.window);
      wind.scale.set(1.6, 0.55, 0.05);
      wind.position.set(0, 1.45, 0.82); g.add(wind);
    }

    // Rodas comuns
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const wPos = [[-1.0, 0.4, 1.4], [1.0, 0.4, 1.4], [-1.0, 0.4, -1.4], [1.0, 0.4, -1.4]];
    wPos.forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(wheelGeo, MATS.tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, wy, wz); w.castShadow = true; g.add(w);
    });

    scene.add(g);
  });
}

// ════════════════════════════════════════════════════════════
// 🏠 CASAS DETALHADAS COM ANDARES E VARANDAS
// ════════════════════════════════════════════════════════════
function buildHouse(scene, poi, world) {
  const sizes = { small: [7, 6], medium: [9, 7], large: [12, 9] };
  const [W, D] = sizes[poi.size] || sizes.medium;
  const H = 4.0, T = 0.25;
  const DOOR_W = 1.4, DOOR_H = 2.4;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const wallMat = Math.random() < 0.5 ? MATS.wallCream : MATS.wallWhite;
  const roofMat = Math.random() < 0.5 ? MATS.roofRed : MATS.roofGray;

  // Piso interno
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorCarpet);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);

  // Paredes com colliders robustos
  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, wallMat, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const segW = (W - DOOR_W) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, wallMat, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, wallMat, g, world.wallColliders);
  addBoxMesh(DOOR_W, H - DOOR_H, T, 0, H - (H - DOOR_H)/2, frontZ, wallMat, g, null);

  // Molduras de portas e janelas laterais
  addBoxMesh(W + 0.4, 0.18, D + 0.4, 0, H + 0.08, 0, MATS.trim, g, null);

  // Telhado volumétrico de duas águas ou cônico detalhado
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, 2.0, 4), roofMat);
  roof.position.y = H + 1.0; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);

  // Porta funcional com pivô
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-DOOR_W/2, 0, frontZ);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.05, DOOR_H - 0.04, 0.08), MATS.darkWood);
  doorMesh.position.set((DOOR_W - 0.05)/2, DOOR_H/2, 0);
  doorPivot.add(doorMesh); g.add(doorPivot);

  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(-DOOR_W/2, 0, frontZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({ group: doorPivot, currentAngle: 0, worldX: doorWorldPos.x, worldZ: doorWorldPos.z });

  // Mobiliário interno funcional
  addBoxMesh(1.5, 0.8, 0.85, 0, 0.4, 2, MATS.wood, g, world.furnitureColliders);

  return { x: poi.x, z: poi.z, w: W, d: D };
}

// ════════════════════════════════════════════════════════════
// 🚓 DELEGACIA DE POLÍCIA FORTIFICADA
// ════════════════════════════════════════════════════════════
function buildPoliceStation(scene, poi, world) {
  const W = 18, D = 14, H = 5.2, T = 0.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z); scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallGray, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const segW = (W - 3.2) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, MATS.wallGray, g, world.wallColliders);

  // Letreiro Policial
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, 0.12), new THREE.MeshBasicMaterial({ color: 0x1B4F72 }));
  sign.position.set(0, H - 0.8, frontZ + 0.08); g.add(sign);

  // Celas de detenção internas com grades metálicas
  for (let i = 0; i < 2; i++) {
    const cx = -W/2 + 3.5 + i * 6;
    addBoxMesh(0.2, 3.0, 3.5, cx - 1.8, 1.5, -D/2 + 2.5, MATS.darkMetal, g, world.wallColliders);
    addBoxMesh(0.2, 3.0, 3.5, cx + 1.8, 1.5, -D/2 + 2.5, MATS.darkMetal, g, world.wallColliders);
    addBoxMesh(3.6, 3.0, 0.2, cx, 1.5, -D/2 + 4.2, MATS.darkMetal, g, world.wallColliders);
  }

  // Telhado plano com borda defensiva
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.45, D + 0.6), MATS.roofBlack);
  roof.position.y = H + 0.22; roof.castShadow = true; g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'police' };
}

// ════════════════════════════════════════════════════════════
// 🎖️ POSTO AVANÇADO MILITAR
// ════════════════════════════════════════════════════════════
function buildMilitaryOutpost(scene, poi, world) {
  const W = 16, D = 14, H = 4.5, T = 0.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z); scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), MATS.concrete);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);

  // Estrutura blindada e sacos de areia ao redor
  addBoxMesh(W, H, T, 0, H/2, -D/2, MATS.wallRust, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2, H/2, 0, MATS.wallRust, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2, H/2, 0, MATS.wallRust, g, world.wallColliders);
  addBoxMesh(W - 4, H, T, 0, H/2, D/2, MATS.wallRust, g, world.wallColliders);

  // Torres de vigia defensivas nos cantos
  for (const sx of [-W/2 + 1, W/2 - 1]) {
    for (const sz of [-D/2 + 1, D/2 - 1]) {
      addBoxMesh(1.2, H + 1.5, 1.2, sx, (H + 1.5)/2, sz, MATS.darkMetal, g, world.wallColliders);
    }
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.5, D + 0.8), MATS.militaryGreen);
  roof.position.y = H + 0.25; roof.castShadow = true; g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'military' };
}

// ════════════════════════════════════════════════════════════
// 🏥 HOSPITAL CENTRAL
// ════════════════════════════════════════════════════════════
function buildHospital(scene, poi, world) {
  const W = 20, D = 16, H = 5.5, T = 0.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z); scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorWhite);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallWhite, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const segW = (W - 3.5) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, MATS.wallWhite, g, world.wallColliders);

  // Cruz vermelha gigante na fachada
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.12), MATS.cross);
  crossH.position.set(0, H - 1.2, frontZ + 0.08); g.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.12), MATS.cross);
  crossV.position.set(0, H - 1.2, frontZ + 0.08); g.add(crossV);

  // Macas e leitos de emergência internos
  for (let i = 0; i < 4; i++) {
    const bx = -W/2 + 3.5 + i * 4.2;
    addBoxMesh(2.0, 0.6, 1.0, bx, 0.3, -D/2 + 3, MATS.metal, g, world.furnitureColliders);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.45, D + 0.6), MATS.roofRed);
  roof.position.y = H + 0.22; roof.castShadow = true; g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'hospital' };
}

// ════════════════════════════════════════════════════════════
// ⛪ IGREJA CATEDRAL
// ════════════════════════════════════════════════════════════
function buildChurch(scene, poi, world) {
  const W = 14, D = 22, H = 7.0, T = 0.35;

  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z); scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallStone, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const segW = (W - 2.8) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, manifestCol(frontZ), MATS.wallStone, g, world.wallColliders);

  // Torres Gêmeas Frontais com Pináculos
  for (const side of [-1, 1]) {
    const tx = side * (W/2 - 1.2);
    addBoxMesh(2.8, 11, 2.8, tx, 5.5, -D/2 + 1.4, MATS.wallStone, g, world.wallColliders);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.0, 3.0, 4), MATS.roofDarkRed);
    spire.position.set(tx, 12.5, -D/2 + 1.4); spire.rotation.y = Math.PI/4; spire.castShadow = true; g.add(spire);
  }

  // Bancos de igreja (Pews) internos
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      addBoxMesh(2.2, 0.8, 0.5, -W/2 + 2.2 + c * 2.8, 0.4, -D/2 + 5 + r * 3.5, MATS.darkWood, g, world.furnitureColliders);
    }
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.72, 3.5, 4), MATS.roofDarkRed);
  roof.position.y = H + 1.75; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'church' };
}

// ════════════════════════════════════════════════════════════
// 🏪 SUPERMERCADO / MERCADO
// ════════════════════════════════════════════════════════════
function buildMarket(scene, poi, world) {
  const W = 16, D = 12, H = 4.2, T = 0.25;

  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z); scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallCream, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const segW = (W - 2.6) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, MATS.wallCream, g, world.wallColliders);

  // Prateleiras de supermercado internas
  for (let i = 0; i < 4; i++) {
    addBoxMesh(0.9, 2.6, D - 4, -W/2 + 2.5 + i * 3.5, 1.3, 0, MATS.metal, g, world.furnitureColliders);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), MATS.roofGray);
  roof.position.y = H + 0.2; roof.castShadow = true; g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'market' };
}

// ════════════════════════════════════════════════════════════
// ⛽ POSTO DE COMBUSTÍVEL
// ════════════════════════════════════════════════════════════
function buildGasStation(scene, poi, world) {
  const W = 12, D = 10;

  const g = new THREE.Group();
  g.rotation.y = poi.rot; g.position.set(poi.x, 0, poi.z); scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), MATS.floorTile);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true; g.add(floor);

  for (let i = 0; i < 4; i++) {
    addBoxMesh(0.4, 3.8, 0.4, (i % 2 === 0 ? -W/3 : W/3), 1.9, (i < 2 ? -D/3 : D/3), MATS.metal, g, world.furnitureColliders);
  }
  addBoxMesh(W * 0.95, 0.35, D * 0.95, 0, 3.8, 0, MATS.darkMetal, g, null);
  addBoxMesh(4.5, 3.2, 4.5, -W/2 + 2.2, 1.6, -D/2 + 2.2, MATS.wallCream, g, world.wallColliders);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'gas' };
}

// Auxiliar para fechar parâmetros em closures
function manifestCol(z) { return z; }

// ════════════════════════════════════════════════════════════
// 🌳 FLORESTA E BOSQUES URBANOS OTIMIZADOS
// ════════════════════════════════════════════════════════════
let _treeResources = null;
function getTreeResources() {
  if (_treeResources) return _treeResources;
  _treeResources = {
    barkMat:  new THREE.MeshLambertMaterial({ map: Textures.barkTexture() }),
    leafMat1: new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
    leafMat2: new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true }),
    trunkGeo: new THREE.CylinderGeometry(0.4, 0.5, 3.0, 6),
    crown1:   new THREE.IcosahedronGeometry(2.1, 0),
    coneGeo:  new THREE.ConeGeometry(1.8, 3.5, 6),
  };
  return _treeResources;
}

function buildForest(scene, arenaSize) {
  const r = getTreeResources();
  const count = 65;
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 32 + Math.random() * (arenaSize * 0.4);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;

    let tooClose = false;
    for (const poi of POIS) {
      if (Math.hypot(x - poi.x, z - poi.z) < 14) { tooClose = true; break; }
    }
    if (tooClose) continue;

    const g = new THREE.Group();
    const scale = 0.7 + Math.random() * 0.8;
    g.scale.setScalar(scale);

    const trunk = new THREE.Mesh(r.trunkGeo, r.barkMat);
    trunk.position.y = 1.5; trunk.castShadow = true; g.add(trunk);

    const isConical = Math.random() < 0.35;
    if (isConical) {
      const cone = new THREE.Mesh(r.coneGeo, r.leafMat2);
      cone.position.y = 3.6; cone.castShadow = true; g.add(cone);
    } else {
      const crown = new THREE.Mesh(r.crown1, r.leafMat1);
      crown.position.y = 4.2; crown.castShadow = true; g.add(crown);
    }

    g.position.set(x, 0, z);
    scene.add(g);
  }
}

export { createRoad };
