import * as THREE from 'three';

const gibs = [];
const bloodPools = [];
const fountains = [];
const MAX_GIBS = 60;
const MAX_POOLS = 20;

const GIB_GEO_SMALL = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const GIB_GEO_BIG = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const GIB_MATS = [
  new THREE.MeshLambertMaterial({ color: 0x8B0000 }),
  new THREE.MeshLambertMaterial({ color: 0xC0392B }),
  new THREE.MeshLambertMaterial({ color: 0x6B0000 }),
];

// Curva de "squirt" — copiada do conceito de AnimationCurve squirtCurve do C#
function squirtCurve(t) {
  // Bate forte no começo, decai
  return Math.pow(1 - t, 1.6);
}

let sceneRef = null;

export function initGore(scene) { sceneRef = scene; }

export function spawnGib(position, direction, force = 1, type = 'small') {
  if (!sceneRef || gibs.length >= MAX_GIBS) return;
  const isBig = type === 'big' || type === 'head';
  const geo = isBig ? GIB_GEO_BIG : GIB_GEO_SMALL;
  const mat = GIB_MATS[(Math.random() * GIB_MATS.length) | 0].clone();
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(position);
  const speedMul = isBig ? 0.7 : 1.0;
  const vel = new THREE.Vector3(
    direction.x * force * 6 * speedMul + (Math.random() - 0.5) * 4,
    3 + Math.random() * 5,
    direction.z * force * 6 * speedMul + (Math.random() - 0.5) * 4,
  );
  const angVel = new THREE.Vector3(
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
  );
  sceneRef.add(m);
  gibs.push({ mesh: m, vel, angVel, life: isBig ? 10 : 6 });
}

export function spawnBloodFountain(position, direction, duration = 2, freq = 55) {
  if (!sceneRef) return;
  fountains.push({
    position: position.clone(),
    direction: direction.clone().normalize(),
    timeLeft: duration,
    totalTime: duration,
    tick: 0,
    freq,
  });
}

export function spawnBloodPool(position, size = 1) {
  if (!sceneRef) return;
  if (bloodPools.length >= MAX_POOLS) {
    const old = bloodPools.shift();
    sceneRef.remove(old.mesh);
    old.mesh.geometry.dispose();
    old.mesh.material.dispose();
  }
  const radius = (0.6 + Math.random() * 0.6) * size;
  const geo = new THREE.CircleGeometry(radius, 10);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x6B0000, transparent: true, opacity: 0.75, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * Math.PI * 2;
  m.position.set(position.x, 0.03, position.z);
  m.renderOrder = 1;
  sceneRef.add(m);
  bloodPools.push({ mesh: m, life: 25 });
}

export function updateGore(dt) {
  // Gibs com gravidade
  for (let i = gibs.length - 1; i >= 0; i--) {
    const g = gibs[i];
    g.vel.y -= 22 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    g.mesh.rotation.x += g.angVel.x * dt;
    g.mesh.rotation.y += g.angVel.y * dt;
    g.mesh.rotation.z += g.angVel.z * dt;
    if (g.mesh.position.y < 0.15) {
      g.mesh.position.y = 0.15;
      g.vel.y = -g.vel.y * 0.3;
      g.vel.x *= 0.7; g.vel.z *= 0.7;
      g.angVel.multiplyScalar(0.6);
    }
    g.life -= dt;
    if (g.life <= 0) {
      sceneRef.remove(g.mesh);
      g.mesh.material.dispose();
      gibs.splice(i, 1);
    }
  }

  // Fountains com curva tipo squirt
  for (let i = fountains.length - 1; i >= 0; i--) {
    const f = fountains[i];
    f.timeLeft -= dt;
    const t = 1 - f.timeLeft / f.totalTime; // 0 → 1
    const curve = squirtCurve(t);
    f.tick += dt * f.freq * curve;
    while (f.tick > 1) {
      f.tick -= 1;
      const dir = f.direction.clone().multiplyScalar(0.7);
      dir.x += (Math.random() - 0.5) * 0.9;
      dir.z += (Math.random() - 0.5) * 0.9;
      dir.y = 0.5 + Math.random() * 0.8;
      spawnGib(f.position, dir, 0.45, 'small');
      if (Math.random() < 0.25) spawnBloodPool(f.position, 0.35);
    }
    if (f.timeLeft <= 0) fountains.splice(i, 1);
  }

  // Poças com fade
  for (let i = bloodPools.length - 1; i >= 0; i--) {
    const p = bloodPools[i];
    p.life -= dt;
    if (p.life < 4) p.mesh.material.opacity = Math.max(0, p.life / 4) * 0.75;
    if (p.life <= 0) {
      sceneRef.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      bloodPools.splice(i, 1);
    }
  }
}

export function onZombieDeath(position, hitDir, isBoss) {
  const count = isBoss ? 20 : 8;
  for (let i = 0; i < count; i++) {
    const type = Math.random() < 0.25 ? 'big' : 'small';
    spawnGib(position, hitDir, 1.5, type);
  }
  spawnBloodFountain(position, hitDir, isBoss ? 5 : 2.2, isBoss ? 80 : 55);
  spawnBloodPool(position, isBoss ? 2.2 : 1);
}
