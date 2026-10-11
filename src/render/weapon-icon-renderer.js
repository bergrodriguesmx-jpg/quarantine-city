// ============================================================
// weapon-icon-renderer.js
// Renderiza ícones 3D das armas em offscreen canvas.
// ============================================================

import * as THREE from 'three';
import { buildWeaponModelSmart as buildWeaponModel, buildAmmoBox } from './weapon-models.js';

let renderer = null;
let scene = null;
let camera = null;
const cache = new Map();

const ICON_SIZE = 128;

function ensureRenderer() {
  if (renderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_SIZE;

  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, preserveDrawingBuffer: true,
  });
  renderer.setSize(ICON_SIZE, ICON_SIZE, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(1.4, 1.0, 1.8);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));

  const key = new THREE.DirectionalLight(0xfff6e0, 1.4);
  key.position.set(3, 4, 3);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.6);
  fill.position.set(-3, 1, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd0a0, 0.8);
  rim.position.set(0, 2, -4);
  scene.add(rim);
}

function clearModelSlot() {
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const c = scene.children[i];
    if (c.isLight) continue;
    scene.remove(c);
  }
}

function fitModel(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const wrap = new THREE.Group();
  model.position.sub(center);
  wrap.add(model);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 1.8;
  wrap.scale.setScalar(targetSize / maxDim);
  return wrap;
}

export function getWeaponIconURL(weaponId) {
  if (cache.has('w:' + weaponId)) return cache.get('w:' + weaponId);
  ensureRenderer();

  const model = buildWeaponModel(weaponId);
  model.rotation.y = -0.4;
  model.rotation.x = 0.15;
  const wrap = fitModel(model);
  scene.add(wrap);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  cache.set('w:' + weaponId, url);
  clearModelSlot();
  return url;
}

export function getAmmoIconURL(ammoType) {
  if (cache.has('a:' + ammoType)) return cache.get('a:' + ammoType);
  ensureRenderer();

  const model = buildAmmoBox(ammoType);
  model.rotation.y = 0.4;
  model.rotation.x = 0.2;
  const wrap = fitModel(model);
  scene.add(wrap);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  cache.set('a:' + ammoType, url);
  clearModelSlot();
  return url;
}

export function clearIconCache() {
  cache.clear();
}
