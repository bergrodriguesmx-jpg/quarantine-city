import * as THREE from 'three';
import * as Textures from './textures.js';

export function createTree(x, z) {
  const g = new THREE.Group();
  const barkTex = Textures.barkTexture();
  const barkMat = new THREE.MeshLambertMaterial({ map: barkTex });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 2.5, 6),
    barkMat
  );
  trunk.position.y = 1.25;
  trunk.castShadow = true; trunk.receiveShadow = true;
  g.add(trunk);

  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2E8B3E, flatShading: true });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x3AA850, flatShading: true });

  const canopy1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), leafMat);
  canopy1.position.y = 4;
  canopy1.scale.y = 0.9;
  canopy1.castShadow = true;
  g.add(canopy1);

  const canopy2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), leafMat2);
  canopy2.position.set(0.8, 4.5, -0.6);
  canopy2.castShadow = true;
  g.add(canopy2);

  const canopy3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), leafMat);
  canopy3.position.set(-0.9, 4.3, 0.7);
  canopy3.castShadow = true;
  g.add(canopy3);

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

export function createHouse(x, z, wallColor = '#ECF0F1', roofColor = '#C0392B') {
  const g = new THREE.Group();
  const w = 6, h = 3.5, d = 5;

  const wallTex = Textures.houseWallTexture(wallColor);
  wallTex.repeat.set(2, 1);
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const roofTex = Textures.roofTexture(roofColor);
  roofTex.repeat.set(3, 3);
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTex, flatShading: true });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 1.8, 4), roofMat);
  roof.position.y = h + 0.9;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  const doorMat = new THREE.MeshLambertMaterial({ color: 0x5D4030 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.12), doorMat);
  door.position.set(0, 1, d / 2 + 0.05);
  g.add(door);

  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x7FB8E8,
    emissive: 0x3D5A8C,
    emissiveIntensity: 0.4,
  });
  const winGeo = new THREE.BoxGeometry(0.9, 0.9, 0.1);
  const winPositions = [
    [-1.8, 2.4, d / 2 + 0.05],
    [1.8, 2.4, d / 2 + 0.05],
    [w / 2 + 0.05, 2.4, 0],
    [-w / 2 - 0.05, 2.4, 0],
  ];
  winPositions.forEach(([wx, wy, wz]) => {
    const win = new THREE.Mesh(winGeo, glassMat);
    win.position.set(wx, wy, wz);
    if (Math.abs(wx) > w / 2) win.rotation.y = Math.PI / 2;
    g.add(win);
  });

  g.position.set(x, 0, z);
  return g;
}

export function createFence(x, z, length = 8, horizontal = true) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xECF0F1 });
  const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12);
  const railGeo = new THREE.BoxGeometry(
    horizontal ? length : 0.08,
    0.08,
    horizontal ? 0.08 : length
  );

  const count = Math.floor(length / 0.8);
  for (let i = 0; i <= count; i++) {
    const post = new THREE.Mesh(postGeo, mat);
    const offset = -length / 2 + i * (length / count);
    if (horizontal) post.position.set(offset, 0.4, 0);
    else post.position.set(0, 0.4, offset);
    post.castShadow = true;
    g.add(post);
  }

  [0.25, 0.6].forEach(y => {
    const rail = new THREE.Mesh(railGeo, mat);
    rail.position.y = y;
    rail.castShadow = true;
    g.add(rail);
  });

  g.position.set(x, 0, z);
  return g;
}

export function createRoad(x, z, width, length, horizontal = true) {
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

export function populateScene(scene, arenaSize) {
  const half = arenaSize / 2;

  scene.add(createRoad(0, 0, 6, arenaSize, true));
  scene.add(createRoad(0, 0, 6, arenaSize, false));
  scene.add(createRoad(0, -20, 4, arenaSize, true));
  scene.add(createRoad(0, 20, 4, arenaSize, true));
  scene.add(createRoad(-20, 0, 4, arenaSize, false));
  scene.add(createRoad(20, 0, 4, arenaSize, false));

  const housePositions = [
    [-12, -12, '#ECF0F1', '#C0392B'],
    [12, -12, '#F5DEB3', '#7F8C8D'],
    [-12, 12, '#ECF0F1', '#C0392B'],
    [12, 12, '#F5DEB3', '#7F8C8D'],
    [-25, -8, '#ECF0F1', '#7F8C8D'],
    [25, -8, '#F5DEB3', '#C0392B'],
    [-25, 8, '#ECF0F1', '#C0392B'],
    [25, 8, '#F5DEB3', '#7F8C8D'],
    [-8, -25, '#ECF0F1', '#7F8C8D'],
    [8, -25, '#F5DEB3', '#C0392B'],
    [-8, 25, '#ECF0F1', '#C0392B'],
    [8, 25, '#F5DEB3', '#7F8C8D'],
  ];
  housePositions.forEach(([x, z, wc, rc]) => {
    scene.add(createHouse(x, z, wc, rc));
  });

  const treePositions = [
    [-18, -18], [-22, -22], [-18, 18], [-22, 22],
    [18, -18], [22, -22], [18, 18], [22, 22],
    [-30, 0], [30, 0], [0, -30], [0, 30],
    [-15, -28], [15, -28], [-15, 28], [15, 28],
    [-28, -15], [28, -15], [-28, 15], [28, 15],
    [-35, -25], [35, -25], [-35, 25], [35, 25],
  ];
  treePositions.forEach(([x, z]) => {
    if (Math.abs(x) < half - 2 && Math.abs(z) < half - 2) {
      scene.add(createTree(x, z));
    }
  });

  const fenceData = [
    [-8, -8, 6, true], [8, -8, 6, true], [-8, 8, 6, true], [8, 8, 6, true],
  ];
  fenceData.forEach(([x, z, len, h]) => {
    scene.add(createFence(x, z, len, h));
  });
}
