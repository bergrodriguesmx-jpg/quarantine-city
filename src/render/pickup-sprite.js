// ============================================================
// pickup-sprite.js
// Billboard de sprite pros pickups no chão (armas, munição, itens).
// Substitui as caixas coloridas de spawnWeaponPickup em game.js.
// ============================================================

import * as THREE from 'three';

const texCache = new Map();
const texLoader = new THREE.TextureLoader();

function loadTexture(url) {
  if (texCache.has(url)) return texCache.get(url);
  const tex = texLoader.load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(url, tex);
  return tex;
}

const PICKUP_MAT_TEMPLATE = {
  transparent: true,
  depthWrite: false,
  alphaTest: 0.1,
};

const pickups = [];

/**
 * Cria um pickup sprite.
 * @param {THREE.Scene} scene
 * @param {Object} opts
 * @param {string} opts.url
 * @param {number} opts.width   - pixels
 * @param {number} opts.height
 * @param {number} opts.x
 * @param {number} opts.z
 * @param {number} [opts.y=1.0]
 * @param {number} [opts.worldHeight=0.9]  altura em unidades-mundo
 * @param {number} [opts.spinSpeed=1.5]
 * @param {number} [opts.bobAmp=0.08]
 * @param {number} [opts.color=0xffffff]
 * @returns {Object} handle { group, setVisible, dispose }
 */
export function spawnPickupSprite(scene, opts) {
  const aspect = opts.width / opts.height;
  const h = opts.worldHeight ?? 0.9;
  const w = h * aspect;

  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    ...PICKUP_MAT_TEMPLATE,
    map: loadTexture(opts.url),
    color: opts.color ?? 0xffffff,
  });
  const mesh = new THREE.Mesh(geo, mat);

  const group = new THREE.Group();
  group.position.set(opts.x, opts.y ?? 1.0, opts.z);
  group.add(mesh);
  scene.add(group);

  const handle = {
    group,
    mesh,
    baseY: opts.y ?? 1.0,
    spinSpeed: opts.spinSpeed ?? 1.5,
    bobAmp: opts.bobAmp ?? 0.08,
    phase: Math.random() * Math.PI * 2,
    alive: true,
    setVisible(v) { group.visible = !!v; },
    dispose() {
      handle.alive = false;
      scene.remove(group);
      geo.dispose();
      mat.dispose();
      const i = pickups.indexOf(handle);
      if (i >= 0) pickups.splice(i, 1);
    },
  };

  pickups.push(handle);
  return handle;
}

/** Chama no loop de render. */
export function updatePickupSprites(dt, camera) {
  const t = performance.now() / 1000;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (!p.alive) { pickups.splice(i, 1); continue; }
    p.group.position.y = p.baseY + Math.sin(t * 2 + p.phase) * p.bobAmp;
    p.group.rotation.y = t * p.spinSpeed;
    // Billboard opcional — descomente se quiser que sempre encare a câmera:
    // p.mesh.lookAt(camera.position);
    // p.mesh.rotateY(Math.PI); // corrige normal
  }
}

export function clearPickupSprites() {
  for (let i = pickups.length - 1; i >= 0; i--) pickups[i].dispose();
  pickups.length = 0;
}
