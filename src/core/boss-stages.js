import * as THREE from 'three';

// ============================================================
// BOSS STAGES  (ported from Zumbi Blocks 2 — Riot / Queen / Reaper)
// Anexa comportamento multi-estágio, teleporte, projéteis e
// ataques especiais aos bosses já existentes no game.js
// ============================================================

const BOSS_DEFS = {
  riot: {
    stages: 3,
    // Estágio 1: escudo. Estágio 2: escopeta. Estágio 3: slam.
    stageAttackRanges: [3.5, 10, 4],
    tint: 0xa0a0ff,
  },
  queen: {
    stages: 3,
    flight: true,
    tint: 0xffaaff,
    attacks: ['tox', 'laser', 'dash'],
  },
  reaper: {
    stages: 3,
    teleport: true,
    tint: 0x6060ff,
    attacks: ['scythe', 'gun', 'nightcrawler'],
  },
};

export function initBossStageSystem(zombies, scene, player) {
  // Anexa dados de estágio aos bosses que existirem
  for (const z of zombies) {
    if (!z.isBoss) continue;
    z.bossStage = 1;
    z.bossStageHealthThresholds = [1.0, 0.66, 0.33]; // estágio 2/3
    z.bossActionCooldown = 0;
    z.bossActionState = 'idle';
    z.bossActionTimer = 0;
    z.teleportCooldown = 3 + Math.random() * 2;
    z.projectiles = [];
  }
}

export function updateBossStages(dt, zombies, scene, player, spawnProjectile) {
  const now = performance.now() / 1000;

  for (const z of zombies) {
    if (!z.isBoss || z.health <= 0) continue;

    const def = BOSS_DEFS[z.typeKey] || BOSS_DEFS.riot;
    const hpFrac = z.health / z.maxHealth;

    // Transição de estágio
    let newStage = 1;
    for (let i = 1; i < def.stages; i++) {
      if (hpFrac <= z.bossStageHealthThresholds[i]) newStage = i + 1;
    }
    if (newStage !== z.bossStage) {
      z.bossStage = newStage;
      z.bossActionState = 'transition';
      z.bossActionTimer = 0.8;
      z.bossActionCooldown = 0;
      _onStageChange(z, def, scene);
    }

    // Cooldown de ações
    if (z.bossActionCooldown > 0) z.bossActionCooldown -= dt;

    // Executa estado atual
    _updateBossAction(z, def, dt, scene, player, spawnProjectile, now);
  }
}

function _onStageChange(z, def, scene) {
  // Flash + shake visual
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 8),
    new THREE.MeshBasicMaterial({ color: def.tint, transparent: true, opacity: 0.7 })
  );
  flash.position.copy(z.mesh.position);
  flash.position.y += 1.2;
  scene.add(flash);
  const start = performance.now();
  const anim = () => {
    const t = (performance.now() - start) / 400;
    if (t >= 1) { scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); return; }
    flash.scale.setScalar(1 + t * 3);
    flash.material.opacity = 0.7 * (1 - t);
    requestAnimationFrame(anim);
  };
  anim();
}

function _updateBossAction(z, def, dt, scene, player, spawnProjectile, now) {
  // Estado: transição
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }

  const dist = z.mesh.position.distanceTo(player.position);

  // === REAPER: teleporte se longe ===
  if (def.teleport && dist > 8 && z.teleportCooldown <= 0) {
    _teleport(z, player, scene);
    z.teleportCooldown = 5 + Math.random() * 3;
    z.bossActionState = 'idle';
    return;
  }
  if (def.teleport) z.teleportCooldown -= dt;

  // === QUEEN: tox ball / laser ===
  if (def.flight && z.bossActionCooldown <= 0 && dist > 4 && dist < 20) {
    const roll = Math.random();
    if (roll < 0.4) {
      _shootToxBall(z, player, scene, spawnProjectile);
    } else if (roll < 0.7) {
      _shootLaser(z, player, scene, player);
    } else {
      _dashTowards(z, player, 12);
    }
    z.bossActionCooldown = 1.2 + Math.random() * 0.8;
    return;
  }

  // === RIOT: shotgun burst (estágio >= 2) ===
  if (z.typeKey === 'riot' && z.bossStage >= 2 && z.bossActionCooldown <= 0 && dist < 14) {
    _riotShotgun(z, player, scene, spawnProjectile);
    z.bossActionCooldown = 0.8 + Math.random() * 0.5;
    return;
  }

  // === SLAM quando perto ===
  if (z.bossActionCooldown <= 0 && dist < 3.5) {
    _slamAttack(z, player, scene);
    z.bossActionCooldown = 2.0 + Math.random();
    return;
  }
}

function _teleport(z, player, scene) {
  // Vanish particles
  _spawnParticles(scene, z.mesh.position, 0x6060ff, 30);

  // Teleporta para trás do player
  const behind = new THREE.Vector3()
    .subVectors(player.position, player.camera.position)
    .setY(0).normalize().multiplyScalar(-4);
  const newPos = player.position.clone().add(behind);
  z.mesh.position.copy(newPos);

  _spawnParticles(scene, newPos, 0x6060ff, 30);
}

function _shootToxBall(z, player, scene, spawnProjectile) {
  if (typeof spawnProjectile === 'function') {
    const origin = z.mesh.position.clone().setY(1.5);
    const dir = new THREE.Vector3().subVectors(player.position, origin).normalize();
    spawnProjectile({ type: 'tox', origin, dir, speed: 12, damage: 25, radius: 3 });
  }
}

function _shootLaser(z, player, scene, target) {
  // Cria linha vermelha do boss até o player
  const origin = z.mesh.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(target.position, origin).normalize();
  const geo = new THREE.BufferGeometry().setFromPoints([
    origin, origin.clone().addScaledVector(dir, 30)
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff2020 }));
  scene.add(line);
  setTimeout(() => { scene.remove(line); geo.dispose(); line.material.dispose(); }, 250);

  // Dano se player estiver na linha
  const toPlayer = new THREE.Vector3().subVectors(target.position, origin);
  const t = toPlayer.dot(dir);
  if (t > 0 && t < 30) {
    const closest = origin.clone().addScaledVector(dir, t);
    if (closest.distanceTo(target.position) < 1.2) {
      target.userData._pendingDamage = (target.userData._pendingDamage || 0) + 40;
    }
  }
}

function _dashTowards(z, player, speed) {
  const dir = new THREE.Vector3().subVectors(player.position, z.mesh.position).setY(0).normalize();
  z.vx = dir.x * speed;
  z.vz = dir.z * speed;
}

function _riotShotgun(z, player, scene, spawnProjectile) {
  if (typeof spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.3);
  for (let i = 0; i < 6; i++) {
    const dir = new THREE.Vector3()
      .subVectors(player.position, origin).normalize();
    dir.x += (Math.random() - 0.5) * 0.25;
    dir.z += (Math.random() - 0.5) * 0.25;
    dir.normalize();
    spawnProjectile({ type: 'pellet', origin, dir, speed: 30, damage: 10, radius: 0.1 });
  }
}

function _slamAttack(z, player, scene) {
  // AOE no chão em volta do boss
  _spawnParticles(scene, z.mesh.position, 0xffaa00, 40);
  const dx = player.position.x - z.mesh.position.x;
  const dz = player.position.z - z.mesh.position.z;
  if (dx*dx + dz*dz < 9) {
    player.userData._pendingDamage = (player.userData._pendingDamage || 0) + 20;
  }
}

function _spawnParticles(scene, pos, color, count) {
  const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos);
    const v = new THREE.Vector3(
      (Math.random()-0.5)*8, Math.random()*6, (Math.random()-0.5)*8
    );
    scene.add(m);
    const start = performance.now();
    const life = 0.6;
    const anim = () => {
      const dt = (performance.now() - start) / 1000;
      if (dt >= life) { scene.remove(m); m.material.dispose(); return; }
      m.position.addScaledVector(v, 1/60);
      v.y -= 15/60;
      m.material.opacity = 1 - dt/life;
      requestAnimationFrame(anim);
    };
    anim();
  }
}
