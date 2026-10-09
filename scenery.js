import * as THREE from 'three';
import * as Textures from './textures.js';

// ============================================================
// BUILD WORLD — retorna { wallColliders, doors, weaponSpots, furnitureColliders }
// ============================================================
export function buildWorld(scene, arenaSize) {
  const world = {
    wallColliders: [],
    doors: [],
    weaponSpots: [],
    furnitureColliders: [],
  };

  // ---- RUAS ----
  scene.add(createRoad(0, 0, 6, arenaSize, true));
  scene.add(createRoad(0, 0, 6, arenaSize, false));
  scene.add(createRoad(0, -20, 4, arenaSize, true));
  scene.add(createRoad(0, 20, 4, arenaSize, true));
  scene.add(createRoad(-20, 0, 4, arenaSize, false));
  scene.add(createRoad(20, 0, 4, arenaSize, false));

  // ---- CASAS ----
  const houses = [
    { x: -14, z: -14, size: 'medium', wall: '#ECF0F1', roof: '#C0392B' },
    { x: 14, z: -14, size: 'small', wall: '#F5DEB3', roof: '#7F8C8D' },
    { x: -14, z: 14, size: 'large', wall: '#ECF0F1', roof: '#C0392B' },
    { x: 14, z: 14, size: 'medium', wall: '#F5DEB3', roof: '#7F8C8D' },
    { x: -28, z: -8, size: 'small', wall: '#ECF0F1', roof: '#7F8C8D' },
    { x: 28, z: -8, size: 'medium', wall: '#F5DEB3', roof: '#C0392B' },
    { x: -28, z: 8, size: 'large', wall: '#ECF0F1', roof: '#C0392B' },
    { x: 28, z: 8, size: 'small', wall: '#F5DEB3', roof: '#7F8C8D' },
    { x: -8, z: -28, size: 'medium', wall: '#ECF0F1', roof: '#7F8C8D' },
    { x: 8, z: -28, size: 'large', wall: '#F5DEB3', roof: '#C0392B' },
    { x: -8, z: 28, size: 'small', wall: '#ECF0F1', roof: '#C0392B' },
    { x: 8, z: 28, size: 'medium', wall: '#F5DEB3', roof: '#7F8C8D' },
  ];

  houses.forEach(h => makeHouse(scene, h.x, h.z, h.size, h.wall, h.roof, world));

  // ---- ÁRVORES ----
  const treePositions = [
    [-18, -18], [-22, -22], [-18, 18], [-22, 22],
    [18, -18], [22, -22], [18, 18], [22, 22],
    [-32, 0], [32, 0], [0, -32], [0, 32],
    [-15, -28], [15, -28], [-15, 28], [15, 28],
    [-28, -15], [28, -15], [-28, 15], [28, 15],
    [-35, -25], [35, -25], [-35, 25], [35, 25],
  ];
  treePositions.forEach(([x, z]) => {
    if (Math.abs(x) < arenaSize / 2 - 2 && Math.abs(z) < arenaSize / 2 - 2) {
      scene.add(createTree(x, z));
    }
  });

  return world;
}

// ============================================================
// CASA COM INTERIOR
// ============================================================
const HOUSE_SIZES = {
  small: { w: 6, d: 5 },
  medium: { w: 8, d: 6 },
  large: { w: 11, d: 8 },
};

function makeHouse(scene, cx, cz, size, wallColor, roofColor, world) {
  const dims = HOUSE_SIZES[size];
  const W = dims.w, D = dims.d, H = 3.5;
  const T = 0.22;
  const DOOR_W = 1.4;
  const DOOR_H = 2.3;

  const wallHex = parseInt(wallColor.replace('#', ''), 16);
  const wallMat = new THREE.MeshLambertMaterial({ color: wallHex });
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x8B6F47 });
  const roofHex = parseInt(roofColor.replace('#', ''), 16);
  const roofMat = new THREE.MeshLambertMaterial({ color: roofHex, flatShading: true });

  // CHÃO INTERNO
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - T * 2, D - T * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.06, cz);
  floor.receiveShadow = true;
  scene.add(floor);

  // PAREDES EXTERNAS
  addWall(scene, world, cx, cz - D / 2 + T / 2, W, T, H, wallMat);
  addWall(scene, world, cx - W / 2 + T / 2, cz, T, D, H, wallMat);
  addWall(scene, world, cx + W / 2 - T / 2, cz, T, D, H, wallMat);

  // Frente (+Z) dividida com porta
  const frontZ = cz + D / 2 - T / 2;
  const segW = (W - DOOR_W) / 2;
  addWall(scene, world, cx - W / 2 + segW / 2, frontZ, segW, T, H, wallMat);
  addWall(scene, world, cx + W / 2 - segW / 2, frontZ, segW, T, H, wallMat);

  const headerH = H - DOOR_H;
  if (headerH > 0.1) {
    const header = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, headerH, T), wallMat);
    header.position.set(cx, H - headerH / 2, frontZ);
    header.castShadow = true;
    scene.add(header);
  }

  // PORTA FUNCIONAL
  const doorX = cx - DOOR_W / 2;
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX, 0, frontZ);

  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - 0.06, DOOR_H - 0.04, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x5D4030 })
  );
  doorMesh.position.set((DOOR_W - 0.06) / 2, DOOR_H / 2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xFFCC33 })
  );
  knob.position.set(DOOR_W - 0.25, DOOR_H / 2, 0.08);
  doorPivot.add(knob);

  scene.add(doorPivot);
  world.doors.push({
    group: doorPivot,
    targetAngle: 0,
    currentAngle: 0,
    isOpen: false,
    worldX: doorX + (DOOR_W / 2),
    worldZ: frontZ,
  });

  // PAREDES INTERNAS (medium e large)
  if (size === 'medium' || size === 'large') {
    const innerX = cx + (size === 'large' ? -1.5 : 0);
    const gapSize = 1.4;
    const wallSegD = (D - gapSize) / 2;
    addWall(scene, world, innerX, cz - D / 4 - gapSize / 4, T, wallSegD, H, wallMat);
    addWall(scene, world, innerX, cz + D / 4 + gapSize / 4, T, wallSegD, H, wallMat);
  }

  if (size === 'large') {
    const innerZ = cz - 1.5;
    const gapSize2 = 1.4;
    addWall(scene, world, cx - W / 4 - gapSize2 / 2, innerZ, W / 2 - gapSize2, T, H, wallMat);
    addWall(scene, world, cx + W / 4 + gapSize2 / 2, innerZ, W / 2 - gapSize2, T, H, wallMat);
  }

  // MÓVEIS
  addFurniture(scene, world, cx, cz, size, W, D);

  // TELHADO
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.75, 1.6, 4), roofMat);
  roof.position.set(cx, H + 0.8, cz);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  scene.add(roof);
}

function addWall(scene, world, cx, cz, w, d, h, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(cx, h / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  world.wallColliders.push({
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
  });
}

// ============================================================
// MÓVEIS
// ============================================================
function addFurniture(scene, world, cx, cz, size, W, D) {
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
  const woodDark = new THREE.MeshLambertMaterial({ color: 0x5D4030 });
  const fabricMat = new THREE.MeshLambertMaterial({ color: 0x34495E });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xECF0F1 });
  const screenMat = new THREE.MeshLambertMaterial({ color: 0x1A1A2E, emissive: 0x2C3E50, emissiveIntensity: 0.4 });

  function addBox(w, h, d, x, y, z, mat, collider = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collider) {
      world.furnitureColliders.push({
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2,
      });
    }
    return mesh;
  }

  // MESA CENTRAL
  const tableW = 1.4, tableD = 0.8, tableH = 0.75;
  const tableZ = cz + 0.5;
  addBox(tableW, tableH, tableD, cx, tableH / 2, tableZ, woodMat, true);
  const legH = tableH - 0.05;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    addBox(0.08, legH, 0.08,
      cx + sx * (tableW / 2 - 0.06), legH / 2, tableZ + sz * (tableD / 2 - 0.06),
      woodDark, false);
  });

  // CADEIRAS
  function makeChair(x, z, rotY) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.4), woodDark);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.05), woodDark);
    back.position.set(0, 0.7, -0.18);
    g.add(back);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), woodDark);
      leg.position.set(sx * 0.16, 0.22, sz * 0.16);
      g.add(leg);
    });
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.traverse(c => { if (c.isMesh) c.castShadow = true; });
    scene.add(g);
  }
  makeChair(cx - 0.9, tableZ, Math.PI / 2);
  makeChair(cx + 0.9, tableZ, -Math.PI / 2);
  makeChair(cx, tableZ - 0.65, 0);
  makeChair(cx, tableZ + 0.65, Math.PI);

  // SOFÁ
  const sofaZ = cz - D / 2 + 0.55;
  const sofaX = cx + (size === 'large' ? -2 : 0.5);
  addBox(1.6, 0.4, 0.65, sofaX, 0.35, sofaZ, fabricMat, true);
  addBox(1.6, 0.5, 0.15, sofaX, 0.55, sofaZ - 0.28, fabricMat, false);

  // MESA DE CENTRO
  addBox(0.6, 0.35, 0.4, sofaX, 0.18, sofaZ + 0.85, woodDark, false);

  // ESTANTE
  const shelfX = cx - W / 2 + 0.45;
  const shelfZ = cz + 0.5;
  if (size !== 'small') {
    addBox(0.35, 1.8, 1.4, shelfX, 0.9, shelfZ, woodMat, true);
    for (let i = 1; i <= 3; i++) {
      addBox(0.4, 0.05, 1.35, shelfX, i * 0.45, shelfZ, woodDark, false);
    }
    for (let i = 0; i < 5; i++) {
      const bookMat = new THREE.MeshLambertMaterial({
        color: [0xC0392B, 0x27AE60, 0x3498DB, 0xF39C12, 0x8E44AD][i % 5],
      });
      addBox(0.15, 0.28, 0.06,
        shelfX + 0.05 + Math.random() * 0.05, 1.65, shelfZ - 0.5 + i * 0.22,
        bookMat, false);
    }
  }

  // CAMA (large)
  if (size === 'large') {
    const bedX = cx - W / 4 - 0.5;
    const bedZ = cz + D / 4 + 0.5;
    addBox(2, 0.3, 1, bedX, 0.2, bedZ, whiteMat, true);
    addBox(0.7, 0.15, 0.5, bedX - 0.55, 0.42, bedZ, whiteMat, false);
    const blanketMat = new THREE.MeshLambertMaterial({ color: 0xC0392B });
    addBox(1.6, 0.1, 1.05, bedX + 0.2, 0.42, bedZ, blanketMat, false);
  }

  // TV
  if (size !== 'small') {
    const tvX = cx;
    const tvZ = cz - D / 2 + 0.3;
    addBox(1.0, 0.6, 0.15, tvX, 1.4, tvZ, woodDark, false);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.03), screenMat);
    screen.position.set(tvX, 1.4, tvZ + 0.09);
    scene.add(screen);
  }
}

// ============================================================
// ÁRVORES / RUAS
// ============================================================
function createTree(x, z) {
  const g = new THREE.Group();
  const barkTex = Textures.barkTexture();
  const barkMat = new THREE.MeshLambertMaterial({ map: barkTex });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6), barkMat);
  trunk.position.y = 1.25;
  trunk.castShadow = true; trunk.receiveShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true });
  const canopy1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), leafMat);
  canopy1.position.y = 4; canopy1.scale.y = 0.9; canopy1.castShadow = true;
  g.add(canopy1);
  const canopy2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), leafMat2);
  canopy2.position.set(0.8, 4.5, -0.6); canopy2.castShadow = true;
  g.add(canopy2);
  const canopy3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), leafMat);
  canopy3.position.set(-0.9, 4.3, 0.7); canopy3.castShadow = true;
  g.add(canopy3);
  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

function createRoad(x, z, width, length, horizontal = true) {
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
  const road = new THREE.Mesh(geo, mat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.02, z);
  road.receiveShadow = true;
  return road;
}
