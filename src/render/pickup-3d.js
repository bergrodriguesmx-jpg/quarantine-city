// ============================================================
// pickup-3d.js
// Pickups no chão em 3D. Substitui pickup-sprite.js.
// Cada pickup é um modelo 3D flutuando + glow + ring.
// ============================================================

import * as THREE from 'three';
import { buildWeaponModel, getWeaponWorldSize, getWeaponPickupColor } from './weapon-models.js';

const pickups = [];

/**
 * @param {THREE.Scene} scene
 * @param {Object} opts
 * @param {string} opts.weaponId
 * @param {number} opts.x
 * @param {number} opts.z
 * @param {number} [opts.y=1.0]
 * @param {boolean} [opts.isDrop=false]
 * @param {number} [opts.spinSpeed=1.2]
 * @param {number} [opts.bobAmp=0.08]
 */
export function spawnPickup3D(scene, opts) {
  const weaponId = opts.weaponId;
  const worldSize = getWeaponWorldSize(weaponId);
  const color = getWeaponPickupColor(weaponId, opts.isDrop);

  // Container (bob + spin)
  const group = new THREE.Group();
  group.position.set(opts.x, opts.y ?? 1.0, opts.z);
  scene.add(group);

  // Modelo 3D
  const model = buildWeaponModel(weaponId);

  // Auto-fit: escala pra bater com `worldSize` e centraliza
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = worldSize / maxDim;

  // Envolve o modelo num pivot pra centralizar + inclinar
  const pivot = new THREE.Group();
  pivot.scale.setScalar(scale);
  pivot.rotation.x = -0.5;   // inclina um pouco pra ficar visível
  pivot.rotation.z = 0.15;
  model.position.sub(center);
  pivot.add(model);
  group.add(pivot);

  // Point light pra dar glow
  const glow = new THREE.PointLight(color, 1.2, 3.5, 2);
  glow.position.set(0, 0, 0);
  group.add(glow);

  // Ring no chão
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.55, 20),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI/2;
  ring.position.set(opts.x, 0.06, opts.z);
  ring.renderOrder = 2;
  scene.add(ring);

  const handle = {
    group,
    pivot,
    model,
    ring,
    glow,
    baseY: opts.y ?? 1.0,
    spinSpeed: opts.spinSpeed ?? 1.2,
    bobAmp: opts.bobAmp ?? 0.08,
    phase: Math.random() * Math.PI * 2,
    alive: true,

    setVisible(v) { group.visible = !!v; ring.visible = !!v; },

    dispose() {
      handle.alive = false;
      scene.remove(group);
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
      const i = pickups.indexOf(handle);
      if (i >= 0) pickups.splice(i, 1);
    },
  };

  pickups.push(handle);
  return handle;
}

export function updatePickups3D(dt, camera) {
  const t = performance.now() / 1000;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (!p.alive) { pickups.splice(i, 1); continue; }

    // Bob
    p.group.position.y = p.baseY + Math.sin(t * 2 + p.phase) * p.bobAmp;

    // Spin
    p.pivot.rotation.y = t * p.spinSpeed;

    // Glow pulsante
    const pulse = 1.0 + Math.sin(t * 3 + p.phase) * 0.3;
    p.glow.intensity = 1.2 * pulse;

    // Ring pulsante
    const ringScale = 1 + Math.sin(t * 2.5 + p.phase) * 0.08;
    p.ring.scale.setScalar(ringScale);
    p.ring.rotation.z += dt * 0.8;
  }
}

export function clearPickups3D() {
  for (let i = pickups.length - 1; i >= 0; i--) pickups[i].dispose();
  pickups.length = 0;
}
