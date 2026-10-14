// ============================================================
// scenery.js — v5
// CHANGELOG v5:
//   • FIX CRÍTICO: addBoxMesh — rotação Y corrigida
//     (wx = gx + cos*lx + sin*lz;  wz = gz - sin*lx + cos*lz)
//   • Terreno estendido (2.5x arena) + morros instanciados ao redor
//   • Texturas aplicadas em paredes (houseWallTexture) e telhados (roofTexture)
//   • Janelas, molduras de porta, rodapé e beiral em construções
//   • Props instanciados: barris, caixas, arbustos, pedras, postes, carros
//   • Ruas com yOffset variável (anti z-fighting) + faixas + calçada
//   • Árvores variadas (escala + tipo cônico/esférico)
//   • Mantém API buildWorld(scene, arenaSize) e formato { minX, maxX, minZ, maxZ }
//
// ⚠️ NOTA: Os props (barris, caixas, arbustos, pedras, postes, carros) são
//    DECORATIVOS — NÃO têm collider (para manter a física barata). Apenas
//    paredes, móveis e as paredes invisíveis da arena entram em colliders.
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
// CACHE DE GEOMETRIAS (evita duplicatas)
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
function getUnitCyl(segments = 8) {
  const k = `cyl:${segments}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(0.5, 0.5, 1, segments); _geoCache.set(k, g); }
  return g;
}
function getUnitIco() {
  let g = _geoCache.get('unitIco');
  if (!g) { g = new THREE.IcosahedronGeometry(0.5, 0); _geoCache.set('unitIco', g); }
  return g;
}
function getUnitCone(segments = 4) {
  const k = `cone:${segments}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.ConeGeometry(0.5, 1, segments); _geoCache.set(k, g); }
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
  cross:       new THREE.MeshLambertMaterial({ color: 0xC0392B }),
  // Props
  window:      new THREE.MeshLambertMaterial({ color: 0x1C2833 }),
  windowLit:   new THREE.MeshLambertMaterial({ color: 0xFFCC66, emissive: 0x664400 }),
  trim:        new THREE.MeshLambertMaterial({ color: 0x4A3527 }),
  concrete:    new THREE.MeshLambertMaterial({ map: Textures.concreteTexture() }),
  rock:        new THREE.MeshLambertMaterial({ color: 0x5A5A5A, flatShading: true }),
  bush:        new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
  bushDry:     new THREE.MeshLambertMaterial({ color: 0x6E8B3E, flatShading: true }),
  barrel:      new THREE.MeshLambertMaterial({ color: 0x8B4513, flatShading: true }),
  barrelTop:   new THREE.MeshLambertMaterial({ color: 0x4A3527 }),
  crate:       new THREE.MeshLambertMaterial({ color: 0xA0724A, flatShading: true }),
  carBody1:    new THREE.MeshLambertMaterial({ color: 0x8B1E1E }),
  carBody2:    new THREE.MeshLambertMaterial({ color: 0x2C3E50 }),
  carBody3:    new THREE.MeshLambertMaterial({ color: 0x4A4A4A }),
  tire:        new THREE.MeshLambertMaterial({ color: 0x1A1A1A }),
  pole:        new THREE.MeshLambertMaterial({ color: 0x2A2A2A }),
  roadLine:    new THREE.MeshBasicMaterial({ color: 0xDDDDDD }),
};

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Cria mesh e, se colliderArray for passado, registra collider(es) em world space.
 *
 * FIX v5: conversão local→mundo com rotação Y correta (right-handed, Y-up):
 *   wx = gx + cos*lx + sin*lz
 *   wz = gz - sin*lx + cos*lz
 *
 * Paredes finas rotacionadas são subdivididas em AABBs pequenos (~0.5m),
 * evitando um único AABB gigante que selava o interior dos prédios a 45°.
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

  // Sem rotação real (0, π ou múltiplos): 1 AABB basta.
  if (absSin < 0.001) {
    const wx = gx + cos * x + sin * z;
    const wz = gz - sin * x + cos * z;
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

// Verifica se um ponto está livre de POIs e do centro
function isFreeSpot(x, z, minPOIDist = 10, minCenterDist = 6, extraPOIs = POIS) {
  if (Math.hypot(x, z) < minCenterDist) return false;
  for (const poi of extraPOIs) {
    if (Math.hypot(x - poi.x, z - poi.z) < minPOIDist) return false;
  }
  return true;
}

// Scatter genérico com InstancedMesh
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

  // ── 1. TERRENO ESTENDIDO (esconde a borda do mundo) ─────
  buildExtendedGround(scene, arenaSize);

  // ── 2. MORROS AO REDOR (InstancedMesh) ──────────────────
  buildRockBorder(scene, arenaSize);

  // ── 3. RUAS ─────────────────────────────────────────────
  // yOffsets ligeiramente distintos em cada eixo para evitar z-fighting
  scene.add(createRoad(0, 0, 8, arenaSize, true,  0.020));
  scene.add(createRoad(0, 0, 8, arenaSize, false, 0.021));
  scene.add(createRoad(0, -20, 5, arenaSize, true,  0.022));
  scene.add(createRoad(0,  20, 5, arenaSize, true,  0.023));
  scene.add(createRoad(-20, 0, 5, arenaSize, false, 0.024));
  scene.add(createRoad( 20, 0, 5, arenaSize, false, 0.025));

  // Faixas centrais (linhas amarelas/brancas)
  buildRoadLines(scene, arenaSize);

  // Calçadas nas bordas de cada rua
  buildSidewalks(scene, arenaSize);

  // ── 4. POIs ─────────────────────────────────────────────
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

  // ── 5. ÁRVORES VARIADAS ─────────────────────────────────
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

  // ── 6. PROPS DECORATIVOS (InstancedMesh, sem collider) ──
  buildProps(scene, arenaSize);

  // ── 7. CARROS ABANDONADOS ───────────────────────────────
  buildAbandonedCars(scene, arenaSize);

  console.log(`[scenery] 🌍 Mundo construído: ${world.wallColliders.length} wallColliders, ${world.furnitureColliders.length} furnitureColliders`);
  return world;
}

// ════════════════════════════════════════════════════════════
// TERRENO ESTENDIDO
// ════════════════════════════════════════════════════════════
function buildExtendedGround(scene, arenaSize) {
  const size = arenaSize * 2.5; // 200 para arena 80
  const tex = Textures.grassTexture();
  tex.repeat.set(size / 2, size / 2); // mesma densidade do chão do game.js
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.05; // abaixo do chão principal (game.js y=0)
  g.receiveShadow = true;
  g.name = 'extendedGround';
  scene.add(g);

  // Manchas de terra esparsas
  const dirtTex = Textures.dirtTexture();
  dirtTex.repeat.set(2, 2);
  const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTex, transparent: true, opacity: 0.85 });
  const dirtCount = 18;
  const dirtGeo = new THREE.CircleGeometry(3 + Math.random() * 2, 8);
  const dirtMesh = new THREE.InstancedMesh(dirtGeo, dirtMat, dirtCount);
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let i = 0; i < dirtCount * 5 && placed < dirtCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = arenaSize * 0.4 + Math.random() * arenaSize * 0.4;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (!isFreeSpot(x, z, 12, 8)) continue;
    dummy.position.set(x, -0.04, z);
    dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    dummy.scale.setScalar(0.7 + Math.random() * 0.8);
    dummy.updateMatrix();
    dirtMesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  dirtMesh.count = placed;
  dirtMesh.instanceMatrix.needsUpdate = true;
  dirtMesh.receiveShadow = true;
  scene.add(dirtMesh);
}

// ════════════════════════════════════════════════════════════
// MORROS AO REDOR (barreira visual low-poly)
// ════════════════════════════════════════════════════════════
function buildRockBorder(scene, arenaSize) {
  const rockGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const rockCount = 100;
  const mesh = new THREE.InstancedMesh(rockGeo, MATS.rock, rockCount);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < rockCount; i++) {
    const angle = (i / rockCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    const radius = arenaSize * 0.55 + Math.random() * 8;
    dummy.position.set(
      Math.cos(angle) * radius,
      0.4 + Math.random() * 0.6,
      Math.sin(angle) * radius
    );
    dummy.rotation.set(
      Math.random() * 0.3,
      Math.random() * Math.PI * 2,
      Math.random() * 0.3
    );
    dummy.scale.set(
      0.8 + Math.random() * 1.3,
      0.7 + Math.random() * 0.9,
      0.8 + Math.random() * 1.3
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'rockBorder';
  scene.add(mesh);
}

// ════════════════════════════════════════════════════════════
// FAIXAS DE RUA
// ════════════════════════════════════════════════════════════
function buildRoadLines(scene, arenaSize) {
  // Faixa central (tracejada) — usa InstancedMesh
  const dashGeo = new THREE.PlaneGeometry(0.35, 2);
  const dashCount = 60;
  const mesh = new THREE.InstancedMesh(dashGeo, MATS.roadLine, dashCount);
  const dummy = new THREE.Object3D();
  let idx = 0;

  // Linha horizontal (Y) — central
  for (let i = 0; i < 30 && idx < dashCount; i++) {
    const z = -arenaSize / 2 + 3 + i * 3;
    dummy.position.set(0, 0.026, z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx++, dummy.matrix);
  }
  // Linha vertical (X) — central
  for (let i = 0; i < 30 && idx < dashCount; i++) {
    const x = -arenaSize / 2 + 3 + i * 3;
    dummy.position.set(x, 0.027, 0);
    dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx++, dummy.matrix);
  }
  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

// ════════════════════════════════════════════════════════════
// CALÇADAS (bordas das ruas)
// ════════════════════════════════════════════════════════════
function buildSidewalks(scene, arenaSize) {
  const sw = new THREE.Mesh(
    new THREE.PlaneGeometry(2, arenaSize),
    MATS.concrete
  );
  sw.rotation.x = -Math.PI / 2;
  sw.position.set(-5, 0.028, 0);
  sw.receiveShadow = true;
  scene.add(sw);

  const sw2 = sw.clone();
  sw2.position.set(5, 0.029, 0);
  scene.add(sw2);

  const sw3 = new THREE.Mesh(
    new THREE.PlaneGeometry(arenaSize, 2),
    MATS.concrete
  );
  sw3.rotation.x = -Math.PI / 2;
  sw3.position.set(0, 0.030, -5);
  sw3.receiveShadow = true;
  scene.add(sw3);

  const sw4 = sw3.clone();
  sw4.position.set(0, 0.031, 5);
  scene.add(sw4);
}

// ════════════════════════════════════════════════════════════
// PROPS DECORATIVOS (InstancedMesh)
// ════════════════════════════════════════════════════════════
function buildProps(scene, arenaSize) {
  // Barris
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.9, 8);
  scatterInstanced(scene, {
    count: 22, geo: barrelGeo, mat: MATS.barrel, arenaSize,
    minPOIDist: 8, minCenterDist: 6,
    radiusMin: 0.3, radiusMax: 0.45,
    baseY: 0.45, scaleMin: 0.85, scaleMax: 1.15,
    name: 'barrels',
  });

  // Caixas de madeira
  scatterInstanced(scene, {
    count: 35, geo: getUnitBox(), mat: MATS.crate, arenaSize,
    minPOIDist: 7, minCenterDist: 5,
    radiusMin: 0.25, radiusMax: 0.48,
    baseY: 0.3, scaleMin: 0.5, scaleMax: 0.85,
    name: 'crates',
  });

  // Arbustos verdes
  scatterInstanced(scene, {
    count: 60, geo: getUnitIco(), mat: MATS.bush, arenaSize,
    minPOIDist: 6, minCenterDist: 4,
    radiusMin: 0.25, radiusMax: 0.5,
    baseY: 0.35, scaleMin: 1.4, scaleMax: 2.4,
    name: 'bushes',
  });

  // Arbustos secos
  scatterInstanced(scene, {
    count: 30, geo: getUnitIco(), mat: MATS.bushDry, arenaSize,
    minPOIDist: 6, minCenterDist: 4,
    radiusMin: 0.25, radiusMax: 0.5,
    baseY: 0.3, scaleMin: 1.0, scaleMax: 1.8,
    name: 'bushesDry',
  });

  // Pedras pequenas
  scatterInstanced(scene, {
    count: 45, geo: getUnitIco(), mat: MATS.rock, arenaSize,
    minPOIDist: 6, minCenterDist: 4,
    radiusMin: 0.2, radiusMax: 0.5,
    baseY: 0.25, scaleMin: 0.7, scaleMax: 1.6,
    name: 'rocksSmall',
  });

  // Postes (cilindros verticais altos)
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 5, 6);
  scatterInstanced(scene, {
    count: 18, geo: poleGeo, mat: MATS.pole, arenaSize,
    minPOIDist: 9, minCenterDist: 8,
    radiusMin: 0.35, radiusMax: 0.48,
    baseY: 2.5, scaleMin: 0.9, scaleMax: 1.1,
    name: 'poles',
  });
}

// ════════════════════════════════════════════════════════════
// CARROS ABANDONADOS
// ════════════════════════════════════════════════════════════
function buildAbandonedCars(scene, arenaSize) {
  const carBodyColors = [MATS.carBody1, MATS.carBody2, MATS.carBody3];
  const carCount = 6;

  const positions = [
    { x: 12,  z: -22, rot: 0.4 },
    { x: -18, z: 20,  rot: 1.2 },
    { x: 25,  z: 8,   rot: -0.7 },
    { x: -32, z: -8,  rot: 0.9 },
    { x: 8,   z: 28,  rot: 2.1 },
    { x: -10, z: -30, rot: -1.5 },
  ];

  positions.slice(0, carCount).forEach((p, i) => {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.rot;

    const bodyMat = carBodyColors[i % carBodyColors.length];

    // Corpo principal
    const body = new THREE.Mesh(getUnitBox(), bodyMat);
    body.scale.set(1.8, 0.7, 3.6);
    body.position.y = 0.7;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Cabine
    const cab = new THREE.Mesh(getUnitBox(), bodyMat);
    cab.scale.set(1.6, 0.7, 1.8);
    cab.position.set(0, 1.4, -0.1);
    cab.castShadow = true;
    g.add(cab);

    // Para-brisa escuro
    const wind = new THREE.Mesh(getUnitBox(), MATS.window);
    wind.scale.set(1.5, 0.55, 0.05);
    wind.position.set(0, 1.4, 0.82);
    g.add(wind);

    // Rodas
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8);
    const wheelPositions = [
      [-0.95, 0.35, 1.2], [0.95, 0.35, 1.2],
      [-0.95, 0.35, -1.2], [0.95, 0.35, -1.2],
    ];
    for (const [wx, wy, wz] of wheelPositions) {
      const w = new THREE.Mesh(wheelGeo, MATS.tire);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, wy, wz);
      w.castShadow = true;
      g.add(w);
    }

    scene.add(g);
  });
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

  // Paredes
  addBoxMesh(W, H, T, 0, H/2, -D/2 + T/2, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D, -W/2 + T/2, H/2, 0, wallMat, g, world.wallColliders);
  addBoxMesh(T, H, D,  W/2 - T/2, H/2, 0, wallMat, g, world.wallColliders);

  const frontZ = D/2 - T/2;
  const segW = (W - DOOR_W) / 2;
  addBoxMesh(segW, H, T, -W/2 + segW/2, H/2, frontZ, wallMat, g, world.wallColliders);
  addBoxMesh(segW, H, T,  W/2 - segW/2, H/2, frontZ, wallMat, g, world.wallColliders);

  const headerH = H - DOOR_H;
  if (headerH > 0.1) addBoxMesh(DOOR_W, headerH, T, 0, H - headerH/2, frontZ, wallMat, g, null);

  // Moldura da porta
  const trimT = 0.08;
  addBoxMesh(trimT, DOOR_H, trimT, -DOOR_W/2 - trimT/2, DOOR_H/2, frontZ + T/2, MATS.trim, g, null);
  addBoxMesh(trimT, DOOR_H, trimT,  DOOR_W/2 + trimT/2, DOOR_H/2, frontZ + T/2, MATS.trim, g, null);
  addBoxMesh(DOOR_W + trimT*2, trimT, trimT, 0, DOOR_H + trimT/2, frontZ + T/2, MATS.trim, g, null);

  // Rodapé
  const baseH = 0.4;
  addBoxMesh(W, baseH, T + 0.02, 0, baseH/2, -D/2 + T/2, MATS.trim, g, null);
  addBoxMesh(T + 0.02, baseH, D, -W/2 + T/2, baseH/2, 0, MATS.trim, g, null);
  addBoxMesh(T + 0.02, baseH, D,  W/2 - T/2, baseH/2, 0, MATS.trim, g, null);

  // Janelas (laterais)
  const winW = 1.0, winH = 1.0, winY = 1.9;
  const winPositions = [
    // lado esquerdo
    { x: -W/2 + T/2 - 0.03, y: winY, z: -D/4, rotY: -Math.PI/2 },
    { x: -W/2 + T/2 - 0.03, y: winY, z:  D/4, rotY: -Math.PI/2 },
    // lado direito
    { x:  W/2 - T/2 + 0.03, y: winY, z: -D/4, rotY:  Math.PI/2 },
    { x:  W/2 - T/2 + 0.03, y: winY, z:  D/4, rotY:  Math.PI/2 },
  ];
  winPositions.forEach(wp => {
    // Moldura
    addBoxMesh(winW + 0.15, winH + 0.15, 0.06, wp.x, wp.y, wp.z, MATS.trim, g, null).rotation.y = wp.rotY;
    // Vidro
    addBoxMesh(winW, winH, 0.05, wp.x, wp.y, wp.z, MATS.window, g, null).rotation.y = wp.rotY;
  });

  // Porta (pivot para animação do game.js)
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

  // Beiral (moldura sob o telhado)
  addBoxMesh(W + 0.4, 0.15, D + 0.4, 0, H + 0.05, 0, MATS.trim, g, null);

  // Telhado (cônico)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.75, 1.6, 4), roofMat);
  roof.position.y = H + 0.8;
  roof.rotation.y = Math.PI/4;
  roof.castShadow = true;
  g.add(roof);

  // Móveis
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
// 🌳 ÁRVORES — recursos compartilhados, variadas
// ════════════════════════════════════════════════════════════
let _treeResources = null;

function getTreeResources() {
  if (_treeResources) return _treeResources;
  _treeResources = {
    barkMat:    new THREE.MeshLambertMaterial({ map: Textures.barkTexture() }),
    leafMat1:   new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true }),
    leafMat2:   new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true }),
    leafMat3:   new THREE.MeshLambertMaterial({ color: 0x4F8B2E, flatShading: true }),
    trunkGeo:   new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6),
    crownGeo1:  new THREE.IcosahedronGeometry(1.9, 0),
    crownGeo2:  new THREE.IcosahedronGeometry(1.4, 0),
    crownGeo3:  new THREE.IcosahedronGeometry(1.2, 0),
    coneGeo:    new THREE.ConeGeometry(1.6, 3.2, 6),
  };
  return _treeResources;
}

function createTree(x, z) {
  const r = getTreeResources();
  const g = new THREE.Group();

  // Variação: 70% esférica, 30% cônica
  const isConical = Math.random() < 0.3;
  const scale = 0.65 + Math.random() * 0.8;
  g.scale.setScalar(scale);

  // Variação de cor
  const leafRoll = Math.random();
  const leafMat = leafRoll < 0.33 ? r.leafMat1 : leafRoll < 0.66 ? r.leafMat2 : r.leafMat3;

  // Tronco
  const trunk = new THREE.Mesh(r.trunkGeo, r.barkMat);
  trunk.position.y = 1.25;
  trunk.castShadow = true;
  g.add(trunk);

  if (isConical) {
    // Árvore cônica (pinheiro)
    const cone1 = new THREE.Mesh(r.coneGeo, leafMat);
    cone1.position.y = 3.2;
    cone1.castShadow = true;
    g.add(cone1);
    const cone2 = new THREE.Mesh(r.coneGeo, leafMat);
    cone2.position.y = 4.6;
    cone2.scale.setScalar(0.7);
    cone2.castShadow = true;
    g.add(cone2);
  } else {
    // Árvore esférica (folhosa)
    const c1 = new THREE.Mesh(r.crownGeo1, leafMat);
    c1.position.y = 4;
    c1.castShadow = true;
    g.add(c1);
    const c2 = new THREE.Mesh(r.crownGeo2, leafMat);
    c2.position.set(0.8, 4.5, -0.6);
    c2.castShadow = true;
    g.add(c2);
    const c3 = new THREE.Mesh(r.crownGeo3, leafMat);
    c3.position.set(-0.9, 4.3, 0.7);
    c3.castShadow = true;
    g.add(c3);
  }

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

// ════════════════════════════════════════════════════════════
// 🛣️ RUAS — material/geometria por dimensão (cache)
// ════════════════════════════════════════════════════════════
const _roadCache = new Map();

function createRoad(x, z, width, length, horizontal = true, yOffset = 0.02) {
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
  road.position.set(x, yOffset, z);
  road.receiveShadow = true;
  return road;
}

export { createTree, createRoad };
