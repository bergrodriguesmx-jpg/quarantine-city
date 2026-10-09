import * as THREE from 'three';
import * as Textures from './textures.js';

export function buildWorld(scene, arenaSize) {
  const world = {
    wallColliders: [],
    furnitureColliders: [],
    doors: [],
    weaponSpots: [],
  };

  // RUAS
  scene.add(createRoad(0, 0, 6, arenaSize, true));
  scene.add(createRoad(0, 0, 6, arenaSize, false));
  scene.add(createRoad(0, -20, 4, arenaSize, true));
  scene.add(createRoad(0, 20, 4, arenaSize, true));
  scene.add(createRoad(-20, 0, 4, arenaSize, false));
  scene.add(createRoad(20, 0, 4, arenaSize, false));

  // CASAS
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

  // ÁRVORES
  const treePositions = [
    [-18, -18], [-22, -22], [-18, 18], [-22, 22],
    [18, -18], [22, -22], [18, 18], [22, 22],
    [-32, 0], [32, 0], [0, -32], [0, 32],
    [-15, -28], [15, -28], [-15, 28], [15, 28],
    [-28, -15], [28, -15], [-28, 15], [28, 15],
  ];
  treePositions.forEach(([x, z]) => {
    if (Math.abs(x) < arenaSize / 2 - 2 && Math.abs(z) < arenaSize / 2 - 2) {
      scene.add(createTree(x, z));
    }
  });

  return world;
}

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

  // FRENTE (+Z) dividida com porta
  const frontZ = cz + D / 2 - T / 2;
  const segW = (W - DOOR_W) / 2;
  addWall(scene, world, cx - W / 2 + segW / 2, frontZ, segW, T, H, wallMat);
  addWall(scene, world, cx + W / 2 - segW / 2, frontZ, segW, T, H, wallMat);

  const headerH = H - DOOR_H;
  if (headerH > 0.1) {
    const header = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, headerH, T), wallMat);
    header.position.set(cx, H - headerH / 2, frontZ);
    scene.add(header);
  }

  // PORTA
  const doorX = cx - DOOR_W / 2;
  const doorPivot = new THREE.Group();
  doorPivot.position.set(doorX, 0, frontZ);
  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - 0.06, DOOR_H - 0.04, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x5D4030 })
  );
  doorMesh.position.set((DOOR_W - 0.06) / 2, DOOR_H / 2, 0);
  doorPivot.add(doorMesh);
  scene.add(doorPivot);
  world.doors.push({
    group: doorPivot,
    currentAngle: 0,
    worldX: doorX + DOOR_W / 2,
    worldZ: frontZ,
  });

  // PAREDES INTERNAS — afastadas do centro pra não bloquear a porta
  if (size === 'medium' || size === 'large') {
    const innerX = cx + (size === 'large' ? -2.2 : 2.0);
    const gapSize = 1.4;
    const wallSegD = (D - gapSize) / 2;
    addWall(scene, world, innerX, cz - D / 4 - gapSize / 4, T, wallSegD, H, wallMat);
    addWall(scene, world, innerX, cz + D / 4 + gapSize / 4, T, wallSegD, H, wallMat);
  }

  addFurniture(scene, world, cx, cz, size, W, D);

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
    minX: cx - w / 2, maxX: cx + w / 2,
    minZ: cz - d / 2, maxZ: cz + d / 2,
  });
}

function addFurniture(scene, world, cx, cz, size, W, D) {
  const wood = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x5D4030 });
  const fabric = new THREE.MeshLambertMaterial({ color: 0x34495E });

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
  }

  const tableZ = cz + 0.5;
  addBox(1.4, 0.75, 0.8, cx, 0.375, tableZ, wood, true);

  const sofaZ = cz - D / 2 + 0.55;
  const sofaX = cx + (size === 'large' ? -2 : 0.5);
  addBox(1.6, 0.4, 0.65, sofaX, 0.35, sofaZ, fabric, true);
  addBox(1.6, 0.5, 0.15, sofaX, 0.55, sofaZ - 0.28, fabric, false);
  addBox(0.6, 0.35, 0.4, sofaX, 0.18, sofaZ + 0.85, darkWood, false);

  if (size !== 'small') {
    const shelfX = cx - W / 2 + 0.45;
    addBox(0.35, 1.8, 1.4, shelfX, 0.9, tableZ, wood, true);
  }
}

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
  road.rotation.x = -Math.PI / 2;
  road.position.set(x, 0.02, z);
  road.receiveShadow = true;
  return road;
}
