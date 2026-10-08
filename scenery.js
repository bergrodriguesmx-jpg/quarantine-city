import * as THREE from 'three';
import * as Textures from './textures.js';

// ============================================================
// CENÁRIO — árvores, pedras, carros, barris, caixas
// Estilo voxel Zumbi Blocks 2
// ============================================================

// Árvore voxel
export function createTree(x, z) {
  const g = new THREE.Group();
  const barkTex = Textures.barkTexture();
  const leafTex = Textures.leafTexture();

  // Tronco
  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 3, 0.8),
    new THREE.MeshLambertMaterial({ map: barkTex })
  );
  trunk.position.y = 1.5;
  trunk.castShadow = true; trunk.receiveShadow = true;
  g.add(trunk);

  // Copa (3 blocos empilhados)
  const leafMat = new THREE.MeshLambertMaterial({ map: leafTex });
  const canopy1 = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 3), leafMat);
  canopy1.position.y = 3.75;
  canopy1.castShadow = true;
  g.add(canopy1);

  const canopy2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.2), leafMat);
  canopy2.position.y = 4.85;
  canopy2.castShadow = true;
  g.add(canopy2);

  const canopy3 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.3), leafMat);
  canopy3.position.y = 5.75;
  canopy3.castShadow = true;
  g.add(canopy3);

  g.position.set(x, 0, z);
  return g;
}

// Pedra voxel
export function createRock(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x95A5A6 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x7F8C8D });

  const sizes = [
    { s: 1.2, x: 0, y: 0.6, z: 0 },
    { s: 0.8, x: 0.7, y: 0.4, z: 0.3 },
    { s: 0.6, x: -0.5, y: 0.3, z: -0.6 },
  ];

  sizes.forEach(({ s, x, y, z }) => {
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.8, s),
      Math.random() > 0.5 ? mat : darkMat
    );
    rock.position.set(x, y, z);
    rock.rotation.y = Math.random() * Math.PI;
    rock.castShadow = true; rock.receiveShadow = true;
    g.add(rock);
  });

  g.position.set(x, 0, z);
  return g;
}

// Carro abandonado voxel
export function createCar(x, z, color = 0xE74C3C) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2C3E50 });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x85C1E9,
    emissive: 0x1A5276,
    emissiveIntensity: 0.3,
  });

  // Corpo principal
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4), bodyMat);
  body.position.y = 0.7;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // Cabine
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2), glassMat);
  cabin.position.set(0, 1.45, -0.2);
  cabin.castShadow = true;
  g.add(cabin);

  // Rodas
  const wheelGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const positions = [
    [-1.1, 0.25, 1.3], [1.1, 0.25, 1.3],
    [-1.1, 0.25, -1.3], [1.1, 0.25, -1.3],
  ];
  positions.forEach(([wx, wy, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    g.add(wheel);
  });

  // Faróis
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xF1C40F });
  const lightGeo = new THREE.BoxGeometry(0.3, 0.2, 0.1);
  const lightL = new THREE.Mesh(lightGeo, lightMat);
  lightL.position.set(-0.6, 0.7, 2.05);
  g.add(lightL);
  const lightR = new THREE.Mesh(lightGeo, lightMat);
  lightR.position.set(0.6, 0.7, 2.05);
  g.add(lightR);

  g.position.set(x, 0, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

// Barril explosivo
export function createBarrel(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xE67E22 });
  const topMat = new THREE.MeshLambertMaterial({ color: 0xD35400 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), mat);
  body.position.y = 0.6;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), topMat);
  top.position.y = 1.25;
  top.castShadow = true;
  g.add(top);

  g.position.set(x, 0, z);
  return g;
}

// Caixa de madeira
export function createCrate(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xD35400 });
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });

  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  box.position.y = 0.5;
  box.castShadow = true; box.receiveShadow = true;
  g.add(box);

  // Bordas
  const edgeGeo = new THREE.BoxGeometry(1.02, 0.1, 1.02);
  [0.1, 0.9].forEach(y => {
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.y = y;
    g.add(edge);
  });

  g.position.set(x, 0, z);
  return g;
}

// Poste de luz
export function createLampPost(x, z) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x7F8C8D });

  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), poleMat);
  pole.position.y = 2;
  pole.castShadow = true;
  g.add(pole);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xF1C40F });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), lampMat);
  lamp.position.y = 4.1;
  g.add(lamp);

  // Luz real
  const light = new THREE.PointLight(0xF1C40F, 0.8, 12, 2);
  light.position.y = 4;
  g.add(light);

  g.position.set(x, 0, z);
  return g;
}

// Função para popular o mapa
export function populateScene(scene, arenaSize) {
  const half = arenaSize / 2 - 2;

  // Árvores (10 espalhadas)
  const treePositions = [
    [-25, -10], [-28, 5], [-22, 18], [-18, -25],
    [25, -12], [28, 8], [22, -20], [18, 25],
    [-5, -28], [5, 28],
  ];
  treePositions.forEach(([x, z]) => {
    if (Math.abs(x) < half && Math.abs(z) < half) {
      scene.add(createTree(x, z));
    }
  });

  // Pedras (8)
  const rockPositions = [
    [-20, 5], [-10, 20], [12, -22], [24, 15],
    [-26, -18], [8, 24], [-15, -8], [20, -5],
  ];
  rockPositions.forEach(([x, z]) => {
    if (Math.abs(x) < half && Math.abs(z) < half) {
      scene.add(createRock(x, z));
    }
  });

  // Carros (4)
  const carPositions = [
    [-8, 12, 0xE74C3C], [10, -8, 0x3498DB],
    [-12, -15, 0xF1C40F], [15, 10, 0x2ECC71],
  ];
  carPositions.forEach(([x, z, color]) => {
    if (Math.abs(x) < half && Math.abs(z) < half) {
      scene.add(createCar(x, z, color));
    }
  });

  // Barris (5)
  const barrelPositions = [
    [-5, 5], [5, -5], [-12, 8], [12, -8], [0, 15],
  ];
  barrelPositions.forEach(([x, z]) => {
    if (Math.abs(x) < half && Math.abs(z) < half) {
      scene.add(createBarrel(x, z));
    }
  });

  // Caixas (6)
  const cratePositions = [
    [-3, 8], [3, -8], [-15, -5], [15, 5], [-7, -12], [7, 12],
  ];
  cratePositions.forEach(([x, z]) => {
    if (Math.abs(x) < half && Math.abs(z) < half) {
      scene.add(createCrate(x, z));
    }
  });

  // Postes de luz (4)
  const lampPositions = [
    [-10, -10], [10, -10], [-10, 10], [10, 10],
  ];
  lampPositions.forEach(([x, z]) => {
    if (Math.abs(x) < half && Math.abs(z) < half) {
      scene.add(createLampPost(x, z));
    }
  });
}
