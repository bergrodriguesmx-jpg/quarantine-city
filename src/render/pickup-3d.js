// ============================================================
// pickup-3d.js — v2
// Pickups no chão usando EXATAMENTE o mesmo modelo da mão,
// incluindo offsets da calibração. Aplica só uma leve rotação
// "deitada" para ficar visível no chão.
// ============================================================

import * as THREE from 'three';
import { buildWeaponModelSmart as buildWeaponModel, getWeaponWorldSize, getWeaponPickupColor } from './weapon-models.js';

const pickups = [];

// Mesma chave usada no viewmodel-3d.js
const STORAGE_KEY = 'qb_weapon_offsets_v1';

function loadOffsets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function spawnPickup3D(scene, opts) {
  const weaponId = opts.weaponId;
  const worldSize = getWeaponWorldSize(weaponId);
  const color = getWeaponPickupColor(weaponId, opts.isDrop);

  const group = new THREE.Group();
  group.position.set(opts.x, opts.y ?? 1.0, opts.z);
  scene.add(group);

  // 🎯 Usa o MESMO modelo que a mão usa (GLB se disponível)
  const model = buildWeaponModel(weaponId);
  model.updateMatrixWorld(true);

  // 🎯 Aplica os MESMOS offsets da calibração
  const all = loadOffsets();
  const off = all[weaponId];
  if (off) {
    model.position.set(off.px || 0, off.py || 0, off.pz || 0);
    model.rotation.set(off.rx || 0, off.ry || 0, off.rz || 0);
    model.scale.setScalar(off.scale || 1);
  }

  // 🔧 Normaliza para o tamanho do mundo (mantém proporção)
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = worldSize / maxDim;

  // Remove o offset aplicado ANTES de centralizar
  // (senão o center fica errado)
  model.position.sub(center);

  const pivot = new THREE.Group();
  pivot.scale.setScalar(scale);

  // 🎯 Rotação de "deitado" — só pra ficar visível no chão.
  //    Como os offsets do calibrador já deixaram o modelo na
  //    posição correta da mão, aqui só inclinamos um pouco.
  pivot.rotation.x = -0.45;
  pivot.rotation.z = 0.15;
  pivot.rotation.y = Math.random() * 0.5 - 0.25;

  pivot.add(model);
  group.add(pivot);

  // Sombras
  model.traverse(c => {
    if (c.isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  // Glow
  const glow = new THREE.PointLight(color, 1.2, 3.5, 2);
  group.add(glow);

  // Ring no chão
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.55, 20),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(opts.x, 0.06, opts.z);
  ring.renderOrder = 2;
  scene.add(ring);

  const handle = {
    group, pivot, model, ring, glow,
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
    p.group.position.y = p.baseY + Math.sin(t * 2 + p.phase) * p.bobAmp;

    // Gira só em Y (não gira o X/Z que ficam travados na pose "deitada")
    p.pivot.rotation.y += dt * p.spinSpeed * 0.8;

    const pulse = 1.0 + Math.sin(t * 3 + p.phase) * 0.3;
    p.glow.intensity = 1.2 * pulse;
    const ringScale = 1 + Math.sin(t * 2.5 + p.phase) * 0.08;
    p.ring.scale.setScalar(ringScale);
    p.ring.rotation.z += dt * 0.8;
  }
}

export function clearPickups3D() {
  for (let i = pickups.length - 1; i >= 0; i--) pickups[i].dispose();
  pickups.length = 0;
}
