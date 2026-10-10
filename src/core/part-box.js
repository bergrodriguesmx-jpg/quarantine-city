import * as THREE from 'three';

// Cache keyed por combinação (bodyIndex, typeKey) — a geometria é idêntica
const cache = new Map();

function boxFor(typeKey, bodyIndex, part) {
  const k = `${typeKey}:${bodyIndex}:${part}`;
  return cache.get(k) || null;
}
function storeBox(typeKey, bodyIndex, part, box) {
  cache.set(`${typeKey}:${bodyIndex}:${part}`, box);
}

export function computePartLocalBoxes(typeKey, bodyIndex, groups) {
  const result = {};
  for (const key of Object.keys(groups)) {
    let b = boxFor(typeKey, bodyIndex, key);
    if (!b) {
      b = computeBox(groups[key]);
      storeBox(typeKey, bodyIndex, key, b);
    }
    result[key] = b;
  }
  return result;
}

function computeBox(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Matrix4();
  group.traverse(c => {
    if (c.isMesh && c.geometry) {
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const b = c.geometry.boundingBox.clone();
      tmp.multiplyMatrices(inv, c.matrixWorld);
      b.applyMatrix4(tmp);
      box.union(b);
    }
  });
  return box;
}
