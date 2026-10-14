// ============================================================
// scenery.js — v4
// CHANGELOG v4:
//   • FIX CRÍTICO: addBoxMesh agora subdivide paredes rotacionadas
//     em N AABBs pequenos (delegacia/hospital 45° não selam mais o interior)
//   • FIX: createTree reutiliza texturas/geometrias/materiais compartilhados
//   • FIX: createRoad reutiliza material e geometria por dimensão
// ============================================================

import * as THREE from 'three';
import * as Textures from './textures.js';

export const POIS = [
  { id: 'police',    type: 'police',    x: -28, z: -28, rot: Math.PI * 0.25,   size: 'large'  },
  { id: 'hospital',  type: 'hospital',  x:  28, z: -28, rot: -Math.PI * 0.25,  size: 'large'  },
  { id: 'church',    type: 'church',    x:   0, z:  35, rot: Math.PI,          size: 'medium' },
  { id: 'market',    type: 'market',    x: -35, z:  15, rot: 0,                size: 'medium' },
  { id: 'gasStation',type: 'gas',       x:  35, z:  15, rot: 0,                size: 'small'  },
  { id: 'house1',    type: 'house',     x: -14, z: -14, rot: 0,                size: 'medium' },
  { id: 'house2',    type: 'house',     x:  14, z: -14, rot: 0,                size: 'small'  },
  { id: 'house3',    type: 'house',     x: -14, z:  14, rot: 0,                size: 'large'  },
  { id: 'house4',    type: 'house',     x:  14, z:  14, rot: 0,                size: 'medium' },
];

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

  scene.add(createRoad(0, 0, 8, arenaSize, true));
  scene.add(createRoad(0, 0, 8, arenaSize, false));
  scene.add(createRoad(0, -20, 5, arenaSize, true));
  scene.add(createRoad(0, 20, 5, arenaSize, true));
  scene.add(createRoad(-20, 0, 5, arenaSize, false));
  scene.add(createRoad(20, 0, 5, arenaSize, false));

  for (const poi of POIS) {
    let bounds;
    switch (poi.type) {
      case 'police':   bounds = buildPoliceStation(scene, poi, world); break;
      case 'hospital': bounds = buildHospital(scene, poi, world); break;
      case 'church':   bounds = buildChurch(scene, poi, world); break;
      case 'market':   bounds = buildMarket(scene, poi, world); break;
      case 'gas':      bounds = buildGasStation(scene, poi, world); break;
      default:         bounds = buildHouse(scene, poi, world);
    }
    world.pois[poi.id] = { x: poi.x, z: poi.z, type: poi.type, bounds };
  }

  const treePositions = [];
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 22 + Math.random() * (arenaSize * 0.32);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    let tooClose = false;
    for (const poi of POIS) {
      if (Math.hypot(x - poi.x, z - poi.z) < 12) { tooClose = true; break; }
    }
    if (Math.hypot(x, z) < 8) tooClose = true;
    if (!tooClose) treePositions.push([x, z]);
  }
  treePositions.forEach(([x, z]) => {
    if (Math.abs(x) < arenaSize / 2 - 2 && Math.abs(z) < arenaSize / 2 - 2) {
      scene.add(createTree(x, z));
    }
  });

  console.log(`[scenery] 🌍 Mundo construído: ${world.wallColliders.length} wallColliders, ${world.furnitureColliders.length} furnitureColliders`);
  return world;
}

// ════════════════════════════════════════════════════════════
// MATERIAIS
// ════════════════════════════════════════════════════════════
const MATS = {
  wallCream:   new THREE.MeshLambertMaterial({ color: 0xECF0F1 }),
  wallBrick:   new THREE.MeshLambertMaterial({ color: 0x8B4513 }),
  wallWhite:   new THREE.MeshLambertMaterial({ color: 0xF5F5F5 }),
  wallGray:    new THREE.MeshLambertMaterial({ color: 0x7F8C8D }),
  wallStone:   new THREE.MeshLambertMaterial({ color: 0x5D6D7E }),
  roofRed:     new THREE.MeshLambertMaterial({ color: 0xC0392B, flatShading: true }),
  roofGray:    new THREE.MeshLambertMaterial({ color: 0x7F8C8D, flatShading: true }),
  roofDarkRed: new THREE.MeshLambertMaterial({ color: 0x7B241C, flatShading: true }),
  roofBlack:   new THREE.MeshLambertMaterial({ color: 0x2C3E50, flatShading: true }),
  wood:        new THREE.MeshLambertMaterial({ color: 0x8B5A2B }),
  darkWood:    new THREE.MeshLambertMaterial({ color: 0x5D4030 }),
  floorTile:   new THREE.MeshLambertMaterial({ color: 0xBDC3C7 }),
  floorWhite:  new THREE.MeshLambertMaterial({ color: 0xD5DBDB }),
  floorCarpet: new THREE.MeshLambertMaterial({ color: 0x6B4423 }),
  metal:       new THREE.MeshLambertMaterial({ color: 0x95A5A6 }),
  darkMetal:   new THREE.MeshLambertMaterial({ color: 0x34495E }),
  cross:       new THREE.MeshLambertMaterial({ color: 0xC0392B }),
};

// ════════════════════════════════════════════════════════════
// HELPERS DE CONSTRUÇÃO
// ════════════════════════════════════════════════════════════

/**
 * Cria uma mesh e adiciona em `parent`.
 * Se `colliderArray` for passado, registra o(s) collider(es) em WORLD SPACE.
 *
 * 🎯 FIX v4: paredes rotacionadas (ex: delegacia em 45°) eram registradas
 * como um AABB único do Box3.setFromObject — que para uma parede fina
 * rotacionada vira um bloco de ~11x11m selando o interior do prédio.
 *
 * Agora subdividimos o eixo longo em segmentos pequenos (~0.5m), cada um
 * gerando seu próprio AABB. A coleção de segmentos aproxima a parede
 * rotacionada como uma "escada", sem AABB gigante no meio.
 *
 * O formato { minX, maxX, minZ, maxZ } é mantido — 100% compatível com
 * circleVsAABB, resolveCollidersAgainstBoxes e addStaticBox do game.js.
 */
function addBoxMesh(w, h, d, x, y, z, mat, parent, colliderArray) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);

  if (!colliderArray) return m;

  // Parent tem apenas translação + rotação em Y (garantido pelo buildWorld).
  const ry = parent.rotation.y || 0;
  const gx = parent.position.x || 0;
  const gz = parent.position.z || 0;
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const absSin = Math.abs(sin);
  const absCos = Math.abs(cos);

  // Sem rotação real (0, π ou múltiplos): 1 AABB basta.
  if (absSin < 0.001) {
    const wx = gx + cos * x - sin * z;
    const wz = gz + sin * x + cos * z;
    colliderArray.push({
      minX: wx - w / 2, maxX: wx + w / 2,
      minZ: wz - d / 2, maxZ: wz + d / 2,
    });
    return m;
  }

  // Rotação arbitrária: subdivide o eixo longo em segmentos de ~0.5m.
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
    const wx = gx + cos * lx - sin * lz;
    const wz = gz + sin * lx + cos * lz;
    colliderArray.push({
      minX: wx - hw, maxX: wx + hw,
      minZ: wz - hd, maxZ: wz + hd,
    });
  }
  return m;
}

// ════════════════════════════════════════════════════════════
// 🏠 CASA
// ════════════════════════════════════════════════════════════
function buildHouse(scene, poi, world) {
  const sizes = { small: [6, 5], medium: [8, 6], large: [11, 8] };
  const [W, D] = sizes[poi.size] || sizes.medium;
  const H = 3.5, T = 0.22;
  const DOOR_W = 1.4, DOOR_H = 2.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const wallMat = Math.random() < 0.5 ? MATS.wallCream : MATS.wallWhite;
  const roofMat = Math.random() < 0.5 ? MATS.roofRed : MATS.roofGray;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorCarpet);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, wallMat, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const segW = (W - DOOR_W) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, wallMat, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, wallMat, g, world.wallColliders);

  const headerH = H - DOOR_H;
  if (headerH > 0.1) addBoxMesh(DOOR_W, headerH, T, 0, H - headerH/2, frontZ, wallMat, g, null);

  const doorX = -DOOR_W/2;
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX, 0, frontZ);
  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - 0.06, DOOR_H - 0.04, 0.08),
    MATS.darkWood
  );
  doorMesh.position.set((DOOR_W - 0.06)/2, DOOR_H/2, 0);
  doorPivot.add(doorMesh);
  g.add(doorPivot);

  g.updateMatrixWorld(true);
  const doorWorldPos = new THREE.Vector3(doorX, 0, frontZ);
  g.localToWorld(doorWorldPos);
  world.doors.push({
    group: doorPivot,
    currentAngle: 0,
    worldX: doorWorldPos.x,
    worldZ: doorWorldPos.z,
  });

  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.75, 1.6, 4), roofMat);
  roof.position.y = H + 0.8;
  roof.rotation.y = Math.PI/4;
  roof.castShadow = true;
  g.add(roof);

  addBoxMesh(1.4, 0.75, 0.8, 0, 0.375, 2, MATS.wood, g, world.furnitureColliders);
  addBoxMesh(1.6, 0.4, 0.65, 0.5, 0.35, -D/2 + 0.55, MATS.darkWood, g, world.furnitureColliders);

  return { x: poi.x, z: poi.z, w: W, d: D };
}

// ════════════════════════════════════════════════════════════
// 🚓 DELEGACIA
// ════════════════════════════════════════════════════════════
function buildPoliceStation(scene, poi, world) {
  const W = 16, D = 12, H = 4.5, T = 0.28;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallGray, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const doorW = 3.0;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallGray, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, MATS.wallGray, g, world.wallColliders);

  const signMat = new THREE.MeshBasicMaterial({ color: 0x2196F3 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.6, 0.1), signMat);
  sign.position.set(0, H - 0.6, frontZ + 0.06);
  g.add(sign);

  addBoxMesh(6, 1.1, 0.6, 0, 0.55, 2, MATS.darkWood, g, world.furnitureColliders);

  for (let i = 0; i < 2; i++) {
    const cellX = -W/2 + 3 + i * 5;
    addBoxMesh(0.15, 2.5, 3, cellX - 1.5, 1.25, -D/2 + 2.2, MATS.darkMetal, g, world.wallColliders);
    addBoxMesh(0.15, 2.5, 3, cellX + 1.5, 1.25, -D/2 + 2.2, MATS.darkMetal, g, world.wallColliders);
  }

  addBoxMesh(2, 0.9, 1, 4, 0.45, -D/2 + 2, MATS.darkWood, g, world.furnitureColliders);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), MATS.roofBlack);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'police' };
}

// ════════════════════════════════════════════════════════════
// 🏥 HOSPITAL
// ════════════════════════════════════════════════════════════
function buildHospital(scene, poi, world) {
  const W = 18, D = 14, H = 5.0, T = 0.28;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorWhite);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallWhite, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const doorW = 2.8;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, MATS.wallWhite, g, world.wallColliders);

  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.1), MATS.cross);
  crossH.position.set(0, H - 0.9, frontZ + 0.06);
  g.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.1), MATS.cross);
  crossV.position.set(0, H - 0.9, frontZ + 0.06);
  g.add(crossV);

  addBoxMesh(T, H, D * 0.5, -3, H/2, -D/4, MATS.wallWhite, g, world.wallColliders);
  addBoxMesh(T, H, D * 0.5,  3, H/2, -D/4, MATS.wallWhite, g, world.wallColliders);

  for (let i = 0; i < 4; i++) {
    const bx = -W/2 + 3 + i * 4;
    addBoxMesh(1.8, 0.55, 0.9, bx, 0.4, -D/2 + 2.5, MATS.metal, g, world.furnitureColliders);
  }

  addBoxMesh(4, 1.1, 0.7, 0, 0.55, D/2 - 1.5, MATS.floorTile, g, world.furnitureColliders);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), MATS.roofRed);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'hospital' };
}

// ════════════════════════════════════════════════════════════
// ⛪ IGREJA
// ════════════════════════════════════════════════════════════
function buildChurch(scene, poi, world) {
  const W = 12, D = 20, H = 6.5, T = 0.3;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallStone, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const doorW = 2.4;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallStone, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, MATS.wallStone, g, world.wallColliders);

  for (const side of [-1, 1]) {
    const towerX = side * (W/2 - 1);
    addBoxMesh(2.5, 10, 2.5, towerX, 5, -D/2 + 1.2, MATS.wallStone, g, world.wallColliders);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.5, 4), MATS.roofDarkRed);
    spire.position.set(towerX, 11.25, -D/2 + 1.2);
    spire.rotation.y = Math.PI/4;
    spire.castShadow = true;
    g.add(spire);
  }

  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.2), MATS.cross);
  crossH.position.set(0, H + 1.4, frontZ);
  g.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 0.2), MATS.cross);
  crossV.position.set(0, H + 1.0, frontZ);
  g.add(crossV);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const bx = -W/2 + 2 + col * 2.5;
      const bz = -D/2 + 4 + row * 3;
      addBoxMesh(2.0, 0.75, 0.4, bx, 0.375, bz, MATS.darkWood, g, world.furnitureColliders);
    }
  }

  addBoxMesh(3, 1.2, 1.2, 0, 0.6, -D/2 + 3, MATS.darkWood, g, world.furnitureColliders);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.7, 3, 4), MATS.roofDarkRed);
  roof.position.y = H + 1.5;
  roof.rotation.y = Math.PI/4;
  roof.castShadow = true;
  g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'church' };
}

// ════════════════════════════════════════════════════════════
// 🏪 MERCADO
// ════════════════════════════════════════════════════════════
function buildMarket(scene, poi, world) {
  const W = 14, D = 10, H = 3.8, T = 0.22;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, MATS.wallCream, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const doorW = 2.2;
  const segW = (W - doorW) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, MATS.wallCream, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, MATS.wallCream, g, world.wallColliders);

  for (let i = 0; i < 4; i++) {
    const sx = -W/2 + 2 + i * 3;
    addBoxMesh(0.8, 2.4, D - 3, sx, 1.2, 0, MATS.metal, g, world.furnitureColliders);
  }

  addBoxMesh(5, 1.0, 0.6, 0, 0.5, D/2 - 1.5, MATS.darkWood, g, world.furnitureColliders);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), MATS.roofGray);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'market' };
}

// ════════════════════════════════════════════════════════════
// ⛽ POSTO
// ════════════════════════════════════════════════════════════
function buildGasStation(scene, poi, world) {
  const W = 10, D = 8;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(poi.x, 0, poi.z);
  scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  for (let i = 0; i < 4; i++) {
    const px = (i % 2 === 0 ? -W/3 : W/3);
    const pz = (i < 2 ? -D/3 : D/3);
    addBoxMesh(0.4, 3.5, 0.4, px, 1.75, pz, MATS.metal, g, world.furnitureColliders);
  }
  addBoxMesh(W * 0.9, 0.3, D * 0.9, 0, 3.6, 0, MATS.darkMetal, g, null);

  for (const side of [-1, 1]) {
    addBoxMesh(0.7, 1.3, 0.5, side * 2, 0.65, 0, MATS.wallGray, g, world.furnitureColliders);
  }

  addBoxMesh(4, 3, 4, -W/2 + 2, 1.5, -D/2 + 2, MATS.wallCream, g, world.wallColliders);

  return { x: poi.x, z: poi.z, w: W, d: D, type: 'gas' };
}

// ════════════════════════════════════════════════════════════
// 🌳 ÁRVORES — recursos compartilhados
// ════════════════════════════════════════════════════════════
let _treeBarkMat = null;
let _treeLeafMat1 = null;
let _treeLeafMat2 = null;
let _treeTrunkGeo = null;
let _treeCrownGeo1 = null;
let _treeCrownGeo2 = null;
let _treeCrownGeo3 = null;

function getTreeResources() {
  if (!_treeBarkMat) {
    _treeBarkMat   = new THREE.MeshLambertMaterial({ map: Textures.barkTexture() });
    _treeLeafMat1  = new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true });
    _treeLeafMat2  = new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true });
    _treeTrunkGeo  = new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6);
    _treeCrownGeo1 = new THREE.IcosahedronGeometry(1.9, 0);
    _treeCrownGeo2 = new THREE.IcosahedronGeometry(1.4, 0);
    _treeCrownGeo3 = new THREE.IcosahedronGeometry(1.2, 0);
  }
  return { _treeBarkMat, _treeLeafMat1, _treeLeafMat2, _treeTrunkGeo, _treeCrownGeo1, _treeCrownGeo2, _treeCrownGeo3 };
}

function createTree(x, z) {
  const r = getTreeResources();
  const g = new THREE.Group();

  const trunk = new THREE.Mesh(r._treeTrunkGeo, r._treeBarkMat);
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  g.add(trunk);

  const c1 = new THREE.Mesh(r._treeCrownGeo1, r._treeLeafMat1);
  c1.position.y = 4; c1.castShadow = true;
  g.add(c1);

  const c2 = new THREE.Mesh(r._treeCrownGeo2, r._treeLeafMat2);
  c2.position.set(0.8, 4.5, -0.6); c2.castShadow = true;
  g.add(c2);

  const c3 = new THREE.Mesh(r._treeCrownGeo3, r._treeLeafMat1);
  c3.position.set(-0.9, 4.3, 0.7); c3.castShadow = true;
  g.add(c3);

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

// ════════════════════════════════════════════════════════════
// 🛣️ RUAS — material/geometria por dimensão (cache)
// ════════════════════════════════════════════════════════════
const _roadCache = new Map();

function createRoad(x, z, width, length, horizontal = true) {
  const key = `${width}:${length}:${horizontal}`;
  let entry = _roadCache.get(key);
  if (!entry) {
    const tex = Textures.asphaltTexture();
    tex.repeat.set(
      horizontal ? length / 2 : width / 2,
      horizontal ? width / 2 : length / 2
    );
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const geo = new THREE.PlaneGeometry(
      horizontal ? length : width,
      horizontal ? width : length
    );
    entry = { mat, geo };
    _roadCache.set(key, entry);
  }
  const road = new THREE.Mesh(entry.geo, entry.mat);
  road.rotation.x = -Math.PI/2;
  road.position.set(x, 0.02, z);
  road.receiveShadow = true;
  return road;
}

export { createTree, createRoad };
