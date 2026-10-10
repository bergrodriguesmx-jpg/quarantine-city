import * as THREE from 'three';

// ============================================================
// GORE SYSTEM — gibs, blood fountains, blood pools
// Ported / inspired by Zumbi Blocks 2's Gore.cs + BloodFountainManager
// ============================================================

const gibs = [];         // pedaços voando
const bloodPools = [];   // poças no chão
const fountains = [];    // jatos contínuos
const MAX_GIBS = 40;
const MAX_POOLS = 12;

const GIB_GEO = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const GIB_MAT = new THREE.MeshLambertMaterial({ color: 0x8B0000 });

let sceneRef = null;

export function initGore(scene) {
  sceneRef = scene;
}

export function spawnGib(position, direction, force = 1) {
  if (!sceneRef || gibs.length >= MAX_GIBS) return;
  const mat = GIB_MAT.clone();
  mat.color.setHex(Math.random() > 0.5 ? 0x8B0000 : 0xC0392B);
  const m = new THREE.Mesh(GIB_GEO, mat);
  m.position.copy(position);
  const vel = new THREE.Vector3(
    direction.x * force * 6 + (Math.random()-0.5)*4,
    3 + Math.random()*5,
    direction.z * force * 6 + (Math.random()-0.5)*4
  );
  const angVel = new THREE.Vector3(
    (Math.random()-0.5)*20, (Math.random()-0.5)*20, (Math.random()-0.5)*20
  );
  sceneRef.add(m);
  gibs.push({ mesh: m, vel, angVel, life: 8 });
}

export function spawnBloodFountain(position, direction, duration = 2) {
  if (!sceneRef) return;
  fountains.push({
    position: position.clone(),
    direction: direction.clone().normalize(),
    timeLeft: duration,
    tick: 0,
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
  m.position.set(position.x, 0.03, position.z);
  m.renderOrder = 1;
  sceneRef.add(m);
  bloodPools.push({ mesh: m, life: 25 });
}

export function updateGore(dt) {
  // Gibs
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

  // Fountains
  for (let i = fountains.length - 1; i >= 0; i--) {
    const f = fountains[i];
    f.timeLeft -= dt;
    f.tick += dt;
    if (f.tick > 0.05) {
      f.tick = 0;
      const dir = f.direction.clone().multiplyScalar(0.6);
      dir.x += (Math.random()-0.5)*0.6;
      dir.z += (Math.random()-0.5)*0.6;
      spawnGib(f.position, dir, 0.4);
      if (Math.random() < 0.3) spawnBloodPool(f.position, 0.4);
    }
    if (f.timeLeft <= 0) fountains.splice(i, 1);
  }

  // Pools fade
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

// Chamado quando um zumbi morre — combina gibs + fountain + pool
export function onZombieDeath(position, hitDir, isBoss) {
  const count = isBoss ? 14 : 6;
  for (let i = 0; i < count; i++) spawnGib(position, hitDir, 1.5);
  spawnBloodFountain(position, hitDir, isBoss ? 4 : 1.8);
  spawnBloodPool(position, isBoss ? 2 : 1);
}
