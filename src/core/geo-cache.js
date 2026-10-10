import * as THREE from 'three';

// ============================================================
// CACHE GLOBAL DE GEOMETRIAS / MATERIAIS
// Compartilhado entre game.js, scenery.js, entities/*.js
// ============================================================

const geoCache = new Map();
const matCache = new Map();
const zMatCache = new Map();

export function geoBox(w, h, d, seg = 2) {
  const k = `b:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d, seg, seg, seg); geoCache.set(k, g); }
  return g;
}

export function geoSphere(r, s = 8) {
  const k = `s:${r.toFixed(3)}:${s}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, s, Math.max(6, Math.floor(s * 0.75))); geoCache.set(k, g); }
  return g;
}

export function geoCyl(rt, rb, h, s = 8) {
  const k = `c:${rt.toFixed(3)}:${rb.toFixed(3)}:${h.toFixed(3)}:${s}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, s); geoCache.set(k, g); }
  return g;
}

export function geoTorus(r, t, s1, s2, a) {
  const k = `t:${r}:${t}:${s1}:${s2}:${a}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.TorusGeometry(r, t, s1, s2, a); geoCache.set(k, g); }
  return g;
}

export function matL(color, opts) {
  const k = `L:${color}:${opts ? JSON.stringify(opts) : ''}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, ...(opts || {}) }); matCache.set(k, m); }
  return m;
}

export function matB(color, opts) {
  const k = `B:${color}:${opts ? JSON.stringify(opts) : ''}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, ...(opts || {}) }); matCache.set(k, m); }
  return m;
}

// Materiais de zumbi — cache separado por cor
export function zMat(color) {
  let m = zMatCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); zMatCache.set(color, m); }
  return m;
}

export function clearCaches() {
  geoCache.forEach(g => g.dispose && g.dispose());
  matCache.forEach(m => m.dispose && m.dispose());
  zMatCache.forEach(m => m.dispose && m.dispose());
  geoCache.clear(); matCache.clear(); zMatCache.clear();
}
