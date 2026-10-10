import * as THREE from 'three';

// ============================================================
// CACHE DE BOUNDING BOXES LOCAIS POR TIPO DE CORPO
// Chave: (typeKey, bodyIndex, part)
// Evita recomputar 6 travessias × N zumbis por spawn.
// ============================================================

const cache = new Map();

function keyOf(typeKey, bodyIndex, part) {
  return `${typeKey}:${bodyIndex}:${part}`;
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

// groups = { head, torso, armL, armR, legL, legR }
export function computePartLocalBoxes(typeKey, bodyIndex, groups) {
  const result = {};
  for (const key of Object.keys(groups)) {
    const ck = keyOf(typeKey, bodyIndex, key);
    let b = cache.get(ck);
    if (!b) {
      b = computeBox(groups[key]);
      cache.set(ck, b);
    }
    result[key] = b;
  }
  return result;
}

export function clearPartBoxCache() { cache.clear(); }
