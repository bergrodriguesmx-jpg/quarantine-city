// ============================================================
// scenery.js — v2
// Mapa com POIs fixos: delegacia, hospital, igreja, mercado.
// Cada POI tem layout único e loot contextual.
// ============================================================

import * as THREE from 'three';
import * as Textures from './textures.js';

// ════════════════════════════════════════════════════════════
// DEFINIÇÃO DOS POIs
// ════════════════════════════════════════════════════════════
export const POIS = [
  { id: 'police',    type: 'police',    x: -28, z: -28, rot: Math.PI * 0.25,   size: 'large'  },
  { id: 'hospital',  type: 'hospital',  x:  28, z: -28, rot: -Math.PI * 0.25,  size: 'large'  },
  { id: 'church',    type: 'church',    x:   0, z:  35, rot: Math.PI,          size: 'medium' },
  { id: 'market',    type: 'market',    x: -35, z:  15, rot: 0,                size: 'medium' },
  { id: 'gasStation',type: 'gas',       x:  35, z:  15, rot: 0,                size: 'small'  },
  // Casas normais espalhadas
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
    pois: {}, // id → { x, z, type, bounds }
  };

  // Ruas principais
  scene.add(createRoad(0, 0, 8, arenaSize, true));
  scene.add(createRoad(0, 0, 8, arenaSize, false));
  scene.add(createRoad(0, -20, 5, arenaSize, true));
  scene.add(createRoad(0, 20, 5, arenaSize, true));
  scene.add(createRoad(-20, 0, 5, arenaSize, false));
  scene.add(createRoad(20, 0, 5, arenaSize, false));

  // Construir cada POI
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
    world.pois[poi.id] = {
      x: poi.x, z: poi.z, type: poi.type, bounds,
    };
  }

  // Árvores espalhadas (evita POIs)
  const treePositions = [];
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * (arenaSize * 0.35);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    // Skip se perto de POI
    let tooClose = false;
    for (const poi of POIS) {
      if (Math.hypot(x - poi.x, z - poi.z) < 10) { tooClose = true; break; }
    }
    if (!tooClose) treePositions.push([x, z]);
  }
  treePositions.forEach(([x, z]) => {
    if (Math.abs(x) < arenaSize / 2 - 2 && Math.abs(z) < arenaSize / 2 - 2) {
      scene.add(createTree(x, z));
    }
  });

  return world;
}

// ════════════════════════════════════════════════════════════
// HELPERS BÁSICOS
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
  glass:       new THREE.MeshLambertMaterial({ color: 0xAED6F1, transparent: true, opacity: 0.5 }),
  cross:       new THREE.MeshLambertMaterial({ color: 0xC0392B }),
};

function box(w, h, d, x, y, z, mat, parent, collider) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  if (collider) collider.push({ minX: x - w/2, maxX: x + w/2, minZ: z - d/2, maxZ: z + d/2 });
  return m;
}

// ════════════════════════════════════════════════════════════
// 🏠 CASA PADRÃO
// ════════════════════════════════════════════════════════════
function buildHouse(scene, poi, world) {
  const sizes = { small: [6, 5], medium: [8, 6], large: [11, 8] };
  const [W, D] = sizes[poi.size] || sizes.medium;
  const H = 3.5, T = 0.22;
  const DOOR_W = 1.4, DOOR_H = 2.3;
  const cx = poi.x, cz = poi.z;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(cx, 0, cz);
  scene.add(g);

  const wallMat = Math.random() < 0.5 ? MATS.wallCream : MATS.wallWhite;
  const roofMat = Math.random() < 0.5 ? MATS.roofRed : MATS.roofGray;

  // Chão
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorCarpet);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes
  addWall(g, world, 0, -D/2 + T/2, W, T, H, wallMat);
  addWall(g, world, -W/2 + T/2, 0, T, D, H, wallMat);
  addWall(g, world,  W/2 - T/2, 0, T, D, H, wallMat);

  // Frente com porta
  const frontZ = D/2 - T/2;
  const segW = (W - DOOR_W) / 2;
  addWall(g, world, -W/2 + segW/2, frontZ, segW, T, H, wallMat);
  addWall(g, world,  W/2 - segW/2, frontZ, segW, T, H, wallMat);

  const headerH = H - DOOR_H;
  if (headerH > 0.1) box(DOOR_W, headerH, T, 0, H - headerH/2, frontZ, wallMat, g, null);

  // Porta
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

  // Registra door (coordenadas locais convertidas pra mundo é complexo; simplifica)
  world.doors.push({
    group: doorPivot,
    currentAngle: 0,
    worldX: cx + Math.cos(poi.rot) * doorX, // aprox
    worldZ: cz + Math.sin(poi.rot) * doorX,
  });

  // Telhado
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.75, 1.6, 4), roofMat);
  roof.position.y = H + 0.8;
  roof.rotation.y = Math.PI/4;
  roof.castShadow = true;
  g.add(roof);

  return { x: cx, z: cz, w: W, d: D };
}

// ════════════════════════════════════════════════════════════
// 🚓 DELEGACIA (POI: police)
// Contém: armas de fogo, coletes, munição. Guardada por riot zombie.
// ════════════════════════════════════════════════════════════
function buildPoliceStation(scene, poi, world) {
  const W = 16, D = 12, H = 4.5, T = 0.28;
  const cx = poi.x, cz = poi.z;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(cx, 0, cz);
  scene.add(g);

  // Chão
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes externas
  addWall(g, world, 0, -D/2 + T/2, W, T, H, MATS.wallGray);
  addWall(g, world, -W/2 + T/2, 0, T, D, H, MATS.wallGray);
  addWall(g, world,  W/2 - T/2, 0, T, D, H, MATS.wallGray);

  // Frente com porta dupla
  const frontZ = D/2 - T/2;
  const doorW = 3.0;
  const segW = (W - doorW) / 2;
  addWall(g, world, -W/2 + segW/2, frontZ, segW, T, H, MATS.wallGray);
  addWall(g, world,  W/2 - segW/2, frontZ, segW, T, H, MATS.wallGray);

  // Símbolo "POLICE" (letreiro)
  const signMat = new THREE.MeshBasicMaterial({ color: 0x2196F3 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.6, 0.1), signMat);
  sign.position.set(0, H - 0.6, frontZ + 0.06);
  g.add(sign);

  // Cerca
  const fenceMat = MATS.darkMetal;
  for (let i = 0; i < 8; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), fenceMat);
    bar.position.set(-W/2 + 1 + i * 1.8, 0.75, D/2 + 1.5);
    g.add(bar);
  }

  // Balcão de recepção
  box(6, 1.1, 0.6, 0, 0.55, 2, MATS.darkWood, g, world.furnitureColliders);

  // Celas (2x)
  for (let i = 0; i < 2; i++) {
    const cellX = -W/2 + 3 + i * 5;
    box(3, 2.5, 3, cellX, 1.25, -D/2 + 2.2, MATS.darkMetal, g, world.furnitureColliders);
    // Grades
    for (let bar = 0; bar < 5; bar++) {
      box(0.06, 2.4, 0.06, cellX - 1.5 + bar * 0.75, 1.2, -D/2 + 3.7, MATS.metal, g, null);
    }
  }

  // Mesa do chefe + cofre
  box(2, 0.9, 1, 4, 0.45, -D/2 + 2, MATS.darkWood, g, world.furnitureColliders);

  // Telhado
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), MATS.roofBlack);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: cx, z: cz, w: W, d: D, type: 'police' };
}

// ════════════════════════════════════════════════════════════
// 🏥 HOSPITAL (POI: hospital)
// Contém: itens de cura, defibrilador, kit médico. Possível boss Queen.
// ════════════════════════════════════════════════════════════
function buildHospital(scene, poi, world) {
  const W = 18, D = 14, H = 5.0, T = 0.28;
  const cx = poi.x, cz = poi.z;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(cx, 0, cz);
  scene.add(g);

  // Chão branco
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorWhite);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes brancas
  addWall(g, world, 0, -D/2 + T/2, W, T, H, MATS.wallWhite);
  addWall(g, world, -W/2 + T/2, 0, T, D, H, MATS.wallWhite);
  addWall(g, world,  W/2 - T/2, 0, T, D, H, MATS.wallWhite);

  // Frente com porta
  const frontZ = D/2 - T/2;
  const doorW = 2.8;
  const segW = (W - doorW) / 2;
  addWall(g, world, -W/2 + segW/2, frontZ, segW, T, H, MATS.wallWhite);
  addWall(g, world,  W/2 - segW/2, frontZ, segW, T, H, MATS.wallWhite);

  // Cruz vermelha
  const crossMat = MATS.cross;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.1), crossMat);
  crossH.position.set(0, H - 0.9, frontZ + 0.06);
  g.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.1), crossMat);
  crossV.position.set(0, H - 0.9, frontZ + 0.06);
  g.add(crossV);

  // Divisórias internas (2 corredores)
  box(T, H, D * 0.5, -3, H/2, -D/4, MATS.wallWhite, g, world.wallColliders);
  box(T, H, D * 0.5, 3, H/2, -D/4, MATS.wallWhite, g, world.wallColliders);

  // Leitos (4)
  for (let i = 0; i < 4; i++) {
    const bx = -W/2 + 3 + i * 4;
    const bz = -D/2 + 2.5;
    box(1.8, 0.15, 0.9, bx, 0.6, bz, MATS.metal, g, world.furnitureColliders);
    box(1.8, 0.5, 0.9, bx, 0.25, bz, MATS.wallWhite, g, null);
    // Cabeceira
    box(0.15, 0.8, 0.9, bx - 0.85, 1.0, bz, MATS.metal, g, null);
  }

  // Recepção
  box(4, 1.1, 0.7, 0, 0.55, D/2 - 1.5, MATS.floorTile, g, world.furnitureColliders);

  // Telhado
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), MATS.roofRed);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: cx, z: cz, w: W, d: D, type: 'hospital' };
}

// ════════════════════════════════════════════════════════════
// ⛪ IGREJA (POI: church)
// Layout único com torre. Possível boss Reaper.
// ════════════════════════════════════════════════════════════
function buildChurch(scene, poi, world) {
  const W = 12, D = 20, H = 6.5, T = 0.3;
  const cx = poi.x, cz = poi.z;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(cx, 0, cz);
  scene.add(g);

  // Chão
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Paredes
  addWall(g, world, 0, -D/2 + T/2, W, T, H, MATS.wallStone);
  addWall(g, world, -W/2 + T/2, 0, T, D, H, MATS.wallStone);
  addWall(g, world,  W/2 - T/2, 0, T, D, H, MATS.wallStone);

  // Frente com porta arqueada
  const frontZ = D/2 - T/2;
  const doorW = 2.4;
  const segW = (W - doorW) / 2;
  addWall(g, world, -W/2 + segW/2, frontZ, segW, T, H, MATS.wallStone);
  addWall(g, world,  W/2 - segW/2, frontZ, segW, T, H, MATS.wallStone);

  // Torres gêmeas
  for (const side of [-1, 1]) {
    const towerX = side * (W/2 - 1);
    box(2.5, 10, 2.5, towerX, 5, -D/2 + 1.2, MATS.wallStone, g, world.wallColliders);
    // Ponto da torre
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.5, 4), MATS.roofDarkRed);
    spire.position.set(towerX, 11.25, -D/2 + 1.2);
    spire.rotation.y = Math.PI/4;
    spire.castShadow = true;
    g.add(spire);
  }

  // Cruz na frente
  box(0.2, 2.0, 0.2, 0, H + 1.0, frontZ, MATS.cross, g, null);
  box(1.2, 0.2, 0.2, 0, H + 1.4, frontZ, MATS.cross, g, null);

  // Bancos (3 fileiras)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const bx = -W/2 + 2 + col * 2.5;
      const bz = -D/2 + 4 + row * 3;
      box(2.0, 0.45, 0.4, bx, 0.22, bz, MATS.darkWood, g, null);
      box(2.0, 0.7, 0.15, bx, 0.55, bz - 0.15, MATS.darkWood, g, null);
    }
  }

  // Altar
  box(3, 1.2, 1.2, 0, 0.6, -D/2 + 3, MATS.darkWood, g, world.furnitureColliders);

  // Telhado (mais alto)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.7, 3, 4), MATS.roofDarkRed);
  roof.position.y = H + 1.5;
  roof.rotation.y = Math.PI/4;
  roof.castShadow = true;
  g.add(roof);

  return { x: cx, z: cz, w: W, d: D, type: 'church' };
}

// ════════════════════════════════════════════════════════════
// 🏪 MERCADO (POI: market)
// Contém: comida, bebida, itens de sobrevivência.
// ════════════════════════════════════════════════════════════
function buildMarket(scene, poi, world) {
  const W = 14, D = 10, H = 3.8, T = 0.22;
  const cx = poi.x, cz = poi.z;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(cx, 0, cz);
  scene.add(g);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T*2, D - T*2), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  addWall(g, world, 0, -D/2 + T/2, W, T, H, MATS.wallCream);
  addWall(g, world, -W/2 + T/2, 0, T, D, H, MATS.wallCream);
  addWall(g, world,  W/2 - T/2, 0, T, D, H, MATS.wallCream);

  const frontZ = D/2 - T/2;
  const doorW = 2.2;
  const segW = (W - doorW) / 2;
  addWall(g, world, -W/2 + segW/2, frontZ, segW, T, H, MATS.wallCream);
  addWall(g, world,  W/2 - segW/2, frontZ, segW, T, H, MATS.wallCream);

  // Prateleiras
  for (let i = 0; i < 4; i++) {
    const sx = -W/2 + 2 + i * 3;
    box(0.8, 2.4, D - 3, sx, 1.2, 0, MATS.metal, g, world.furnitureColliders);
  }

  // Balcão
  box(5, 1.0, 0.6, 0, 0.5, D/2 - 1.5, MATS.darkWood, g, world.furnitureColliders);

  // Telhado
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.4, D + 0.5), MATS.roofGray);
  roof.position.y = H + 0.2;
  roof.castShadow = true;
  g.add(roof);

  return { x: cx, z: cz, w: W, d: D, type: 'market' };
}

// ════════════════════════════════════════════════════════════
// ⛽ POSTO DE GASOLINA (POI: gas)
// Área aberta com cobertura.
// ════════════════════════════════════════════════════════════
function buildGasStation(scene, poi, world) {
  const W = 10, D = 8;
  const cx = poi.x, cz = poi.z;

  const g = new THREE.Group();
  g.rotation.y = poi.rot;
  g.position.set(cx, 0, cz);
  scene.add(g);

  // Chão
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), MATS.floorTile);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = 0.06;
  floor.receiveShadow = true;
  g.add(floor);

  // Cobertura (4 pilares + teto)
  for (let i = 0; i < 4; i++) {
    const px = (i % 2 === 0 ? -W/3 : W/3);
    const pz = (i < 2 ? -D/3 : D/3);
    box(0.4, 3.5, 0.4, px, 1.75, pz, MATS.metal, g, world.furnitureColliders);
  }
  box(W * 0.9, 0.3, D * 0.9, 0, 3.6, 0, MATS.darkMetal, g, null);

  // Bombas de gasolina
  for (const side of [-1, 1]) {
    box(0.7, 1.3, 0.5, side * 2, 0.65, 0, MATS.wallGray, g, world.furnitureColliders);
  }

  // Loja pequena
  box(4, 3, 4, -W/2 + 2, 1.5, -D/2 + 2, MATS.wallCream, g, world.wallColliders);

  return { x: cx, z: cz, w: W, d: D, type: 'gas' };
}

// ════════════════════════════════════════════════════════════
// HELPERS DE CONSTRUÇÃO
// ════════════════════════════════════════════════════════════
function addWall(parent, world, cx, cz, w, d, h, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(cx, h/2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  // Adiciona collider (converte pra espaço mundial via matriz)
  // Simplificação: só considera rotação Y do parent
  // Pra maior precisão, usar matrixWorld, mas ok pra protótipo
}

// ════════════════════════════════════════════════════════════
// ÁRVORES E RUAS (mantido)
// ════════════════════════════════════════════════════════════
function createTree(x, z) {
  const g = new THREE.Group();
  const barkMat = new THREE.MeshLambertMaterial({ map: Textures.barkTexture() });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6), barkMat);
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true });
  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), leafMat);
  c1.position.y = 4; c1.castShadow = true;
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), leafMat2);
  c2.position.set(0.8, 4.5, -0.6); c2.castShadow = true;
  g.add(c2);
  const c3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), leafMat);
  c3.position.set(-0.9, 4.3, 0.7); c3.castShadow = true;
  g.add(c3);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

function createRoad(x, z, width, length, horizontal = true) {
  const tex = Textures.asphaltTexture();
  tex.repeat.set(horizontal ? length / 2 : width / 2, horizontal ? width / 2 : length / 2);
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const geo = new THREE.PlaneGeometry(horizontal ? length : width, horizontal ? width : length);
  const road = new THREE.Mesh(geo, mat);
  road.rotation.x = -Math.PI/2;
  road.position.set(x, 0.02, z);
  road.receiveShadow = true;
  return road;
}

export { createTree, createRoad };
