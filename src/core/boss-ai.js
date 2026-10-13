// ============================================================
// boss-ai.js — v2
// IA mais agressiva e diferenciada por boss.
// Reaper teleporta mais, Queen usa padrões de voo, Riot tem rush.
// ============================================================

import * as THREE from 'three';

const BOSS_DEFS = {
  riot: {
    stages: 3,
    healthStages: [1.0, 0.66, 0.33],
    tint: 0xa0a0ff,
    name: 'RIOT',
    // 🎯 Comportamento: rush em estágios baixos, shotgun em altos
    aggression: 1.0,
  },
  queen: {
    stages: 3,
    healthStages: [1.0, 0.66, 0.33],
    tint: 0xffaaff,
    name: 'QUEEN',
    flight: true,
    aggression: 1.3,
    flightHeightBase: 3.5,
  },
  reaper: {
    stages: 4,
    healthStages: [1.0, 0.75, 0.50, 0.25],
    tint: 0x6060ff,
    name: 'REAPER',
    teleport: true,
    aggression: 1.5,
  },
};

const REAPER_TELEPORT_DIST = { 1: 4, 2: 6, 3: 8, 4: 6 };

let _scene = null, _camera = null, _player = null;
let _spawnProjectile = null;

export function initBossSystem(scene, camera, player, spawnProjectile) {
  _scene = scene;
  _camera = camera;
  _player = player;
  _spawnProjectile = spawnProjectile;
}

export function initBoss(z, key) {
  const def = BOSS_DEFS[z.typeKey] || BOSS_DEFS.riot;
  z.bossStage = 1;
  z.bossStageHealthThresholds = def.healthStages;
  z.bossActionCooldown = 0;
  z.bossActionState = 'idle';
  z.bossActionTimer = 0;
  z.teleportCooldown = 2 + Math.random() * 1.5;
  z.ammo = def.stages >= 3 ? 4 : 0;
  z.flightHeight = def.flightHeightBase || 0;
  z.strafeDir = Math.random() < 0.5 ? 1 : -1;
  z.strafeTimer = 1.5 + Math.random() * 1.5;
  z.comboCount = 0;
}

export function updateBossAI(dt, zombies) {
  if (!_scene || !_camera || !_player) return;
  const now = performance.now() / 1000;

  for (const z of zombies) {
    if (!z || !z.isBoss || z.health <= 0 || z.dying) continue;
    if (z.bossStage === undefined) initBoss(z);

    const def = BOSS_DEFS[z.typeKey] || BOSS_DEFS.riot;
    const hpFrac = z.health / z.maxHealth;

    let newStage = 1;
    for (let i = 1; i < def.stages; i++) {
      if (hpFrac <= z.bossStageHealthThresholds[i]) newStage = i + 1;
    }
    if (newStage !== z.bossStage) {
      z.bossStage = newStage;
      z.bossActionState = 'transition';
      z.bossActionTimer = 0.9;
      z.bossActionCooldown = 0;
      _onStageChange(z, def);
      if (z.typeKey === 'reaper') z.ammo = 4;
    }

    if (z.bossActionCooldown > 0) z.bossActionCooldown -= dt;
    if (z.teleportCooldown > 0) z.teleportCooldown -= dt;

    if (z.typeKey === 'riot')        _updateRiot(z, def, dt, now);
    else if (z.typeKey === 'queen')  _updateQueen(z, def, dt, now);
    else if (z.typeKey === 'reaper') _updateReaper(z, def, dt, now);
  }
}

// ════════════════════════════════════════════════════════════
// RIOT: rush em estágio baixo, ranges em estágio alto
// ════════════════════════════════════════════════════════════
function _updateRiot(z, def, dt, now) {
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }
  const dist = z.mesh.position.distanceTo(_player.position);

  // Estágio 3: rush + triple shot
  if (z.bossStage === 3) {
    if (z.comboCount > 0 && z.bossActionCooldown <= 0) {
      _dashTowards(z, 20);
      z.bossActionCooldown = 0.3;
      z.comboCount--;
      if (z.comboCount === 0) z.bossActionCooldown = 1.5;
      return;
    }
    if (dist < 3 && z.bossActionCooldown <= 0) {
      _slam(z, 50);
      z.bossActionCooldown = 1.0;
    } else if (dist < 15 && z.bossActionCooldown <= 0) {
      z.comboCount = 3;
      z.bossActionCooldown = 0.05;
    } else if (dist < 20 && z.bossActionCooldown <= 0) {
      _riotTripleShot(z);
      z.bossActionCooldown = 1.2;
    }
    return;
  }

  if (z.bossStage === 2) {
    if (dist < 2.5 && z.bossActionCooldown <= 0) { _slam(z, 35); z.bossActionCooldown = 0.9; }
    else if (dist < 18 && z.bossActionCooldown <= 0) { _riotShotgun(z); z.bossActionCooldown = 0.7; }
    else if (dist < 8 && z.bossActionCooldown <= 0 && Math.random() < 0.5) {
      _dashTowards(z, 14); z.bossActionCooldown = 1.2;
    }
  } else {
    if (dist < 2.2 && z.bossActionCooldown <= 0) { _slam(z, 30); z.bossActionCooldown = 0.7; }
    else if (dist < 8 && z.bossActionCooldown <= 0 && Math.random() < 0.6) {
      _dashTowards(z, 12); z.bossActionCooldown = 1.4;
    }
  }
}

// ════════════════════════════════════════════════════════════
// QUEEN: voo + tox + laser
// ════════════════════════════════════════════════════════════
function _updateQueen(z, def, dt, now) {
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }

  // Voo oscilante
  const targetY = (def.flightHeightBase || 3.5) + Math.sin(now * 1.5) * 0.6;
  z.mesh.position.y += (targetY - z.mesh.position.y) * Math.min(1, dt * 2.5);

  // Strafe e manutenção de distância
  z.strafeTimer -= dt;
  if (z.strafeTimer <= 0) {
    z.strafeTimer = 1.5 + Math.random() * 2;
    z.strafeDir *= -1;
  }
  const toPlayer = new THREE.Vector3().subVectors(_player.position, z.mesh.position).setY(0);
  const dist = toPlayer.length();
  if (dist > 0.1) {
    toPlayer.normalize();
    const perp = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    // Manter ~10m de distância
    const idealDist = 10;
    const approachDir = dist > idealDist + 2 ? toPlayer : (dist < idealDist - 2 ? toPlayer.clone().negate() : new THREE.Vector3(0,0,0));
    z.mesh.position.addScaledVector(perp, z.strafeDir * 2.8 * dt);
    z.mesh.position.addScaledVector(approachDir, 2.0 * dt);
  }

  if (z.bossActionCooldown > 0) return;
  const dist3D = z.mesh.position.distanceTo(_player.position);

  if (z.bossStage === 3) {
    // Padrão agressivo: multi-tox + laser curvo + dash
    const r = Math.random();
    if (r < 0.35) _multiTox(z);
    else if (r < 0.6) _queenLaser(z);
    else if (r < 0.8) _queenCurvedLaser(z);
    else _dashTowards(z, 16);
    z.bossActionCooldown = 0.35 + Math.random() * 0.35;
  } else if (z.bossStage === 2) {
    const r = Math.random();
    if (dist3D > 10) {
      if (r < 0.4) _shootToxBall(z);
      else if (r < 0.7) _queenLaser(z);
      else _dashTowards(z, 14);
    } else if (dist3D > 6.5) _queenStab(z);
    else if (dist3D > 4) _slam(z, 25);
    else _queenTwirl(z);
    z.bossActionCooldown = 0.9 + Math.random() * 0.6;
  } else {
    if (dist3D > 10) _shootToxBall(z);
    else if (dist3D > 6.5) _queenStab(z);
    else _slam(z, 22);
    z.bossActionCooldown = 1.1 + Math.random() * 0.7;
  }
}

// ════════════════════════════════════════════════════════════
// REAPER: teleporte agressivo + bursts
// ════════════════════════════════════════════════════════════
function _updateReaper(z, def, dt, now) {
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }
  const dist = z.mesh.position.distanceTo(_player.position);

  const teleportDist = REAPER_TELEPORT_DIST[z.bossStage] || 5;

  // Estágio 4: teleporte constante
  if (z.bossStage === 4) {
    if (z.teleportCooldown <= 0 && Math.random() < 0.6) {
      _teleportBehind(z);
      z.teleportCooldown = 0.6 + Math.random() * 0.6;
      return;
    }
  } else if (dist > teleportDist + 2 && z.teleportCooldown <= 0) {
    _teleportCloser(z, teleportDist);
    z.teleportCooldown = 1.2 + Math.random() * 1.2;
    return;
  }

  if (z.bossActionCooldown > 0) return;

  if (z.bossStage === 4) {
    // Combos agressivos
    const r = Math.random();
    if (dist < 3 && r < 0.4) { _meleeStrike(z, 70); z.bossActionCooldown = 0.4; }
    else if (dist < 5 && r < 0.6) { _scytheBlast(z); z.bossActionCooldown = 0.7; }
    else if (z.ammo > 0 && r < 0.85) {
      _gunTripleBurst(z);
      z.ammo -= 3;
      z.bossActionCooldown = 0.6;
    } else { _dashTowards(z, 22); z.bossActionCooldown = 0.5; }
    if (z.ammo <= 0) { z.ammo = 4; z.bossActionCooldown = 1.0; }
    return;
  }

  if (z.bossStage === 3) {
    if (z.ammo > 0 && dist > 3 && dist < 22) {
      _gunShortBurst(z);
      z.ammo--;
      z.bossActionCooldown = 0.7;
    } else if (z.ammo <= 0) {
      z.ammo = 4;
      z.bossActionCooldown = 1.3;
    } else if (dist < 3) {
      _meleeStrike(z, 60);
      z.bossActionCooldown = 0.5;
    } else {
      _dashTowards(z, 20);
      z.bossActionCooldown = 0.6;
    }
    return;
  }

  if (z.bossStage === 2) {
    if (dist < 4 && Math.random() < 0.6) { _meleeStrike(z, 55); z.bossActionCooldown = 0.55; }
    else if (dist < 5 && Math.random() < 0.5) { _scytheBlast(z); z.bossActionCooldown = 0.9; }
    else if (dist < 10 && Math.random() < 0.4) { _dashTowards(z, 18); z.bossActionCooldown = 0.7; }
    else z.bossActionCooldown = 0.25;
    return;
  }

  // Estágio 1
  if (dist < 2) { _meleeStrike(z, 40); z.bossActionCooldown = 0.45 + Math.random() * 0.35; }
  else if (dist < 8 && Math.random() < 0.6) { _dashTowards(z, 16); z.bossActionCooldown = 0.8; }
  else z.bossActionCooldown = 0.3;
}

// ════════════════════════════════════════════════════════════
// AÇÕES
// ════════════════════════════════════════════════════════════
function _teleportCloser(z, targetDist) {
  _spawnParticles(z.mesh.position, 0x6060ff, 30);
  const forward = new THREE.Vector3();
  _camera.getWorldDirection(forward); forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const behind = forward.clone().multiplyScalar(-targetDist);
  const newPos = _player.position.clone().add(behind);
  newPos.y = z.mesh.position.y;
  z.mesh.position.copy(newPos);
  if (z.vx !== undefined) z.vx = 0;
  if (z.vz !== undefined) z.vz = 0;
  _spawnParticles(newPos, 0x6060ff, 30);
}

function _teleportBehind(z) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * 3;
  const newPos = _player.position.clone();
  newPos.x += Math.cos(angle) * dist;
  newPos.z += Math.sin(angle) * dist;
  newPos.y = z.mesh.position.y;
  _spawnParticles(z.mesh.position, 0x6060ff, 25);
  z.mesh.position.copy(newPos);
  if (z.vx !== undefined) z.vx = 0;
  if (z.vz !== undefined) z.vz = 0;
  _spawnParticles(newPos, 0x6060ff, 25);
}

function _spawnParticles(pos, color, count) {
  const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    const v = new THREE.Vector3(
      (Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8,
    );
    _scene.add(m);
    const start = performance.now();
    const life = 600;
    const anim = () => {
      const t = (performance.now() - start) / life;
      if (t >= 1) { _scene.remove(m); mat.dispose(); return; }
      m.position.addScaledVector(v, 1/60);
      v.y -= 15/60;
      mat.opacity = 1 - t;
      requestAnimationFrame(anim);
    };
    anim();
  }
}

function _shootToxBall(z) {
  if (typeof _spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(_player.position, origin); dir.y = 0; dir.normalize();
  _spawnProjectile({ type: 'tox', origin, dir, speed: 14, damage: 28, radius: 0.4 });
}

function _multiTox(z) {
  for (let i = 0; i < 3; i++) setTimeout(() => _shootToxBall(z), i * 150);
}

function _queenStab(z) {
  _dashTowards(z, 18);
  setTimeout(() => _shootToxBall(z), 100);
}

function _queenTwirl(z) {
  const dx = _player.position.x - z.mesh.position.x;
  const dz = _player.position.z - z.mesh.position.z;
  if (dx*dx + dz*dz < 12) {
    _player.userData._pendingDamage = (_player.userData._pendingDamage || 0) + 45;
  }
  _spawnParticles(z.mesh.position, 0xffaaff, 20);
}

function _queenLaser(z) { _fireLaser(z, 0); }
function _queenCurvedLaser(z) { _fireLaser(z, 0.15); }

function _fireLaser(z, curveAmount) {
  const origin = z.mesh.position.clone().setY(1.5);
  const target = _player.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(target, origin);
  const dist = dir.length();
  if (dist < 0.001) return;
  dir.normalize();
  if (curveAmount > 0) {
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    dir.addScaledVector(perp, curveAmount).normalize();
  }
  const geo = new THREE.BufferGeometry().setFromPoints([
    origin, origin.clone().addScaledVector(dir, Math.min(dist, 30)),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat);
  _scene.add(line);
  const startTime = performance.now();
  const fade = () => {
    const t = (performance.now() - startTime) / 350;
    if (t >= 1) { _scene.remove(line); geo.dispose(); mat.dispose(); return; }
    mat.opacity = 0.95 * (1 - t);
    requestAnimationFrame(fade);
  };
  fade();
  const toPlayer = new THREE.Vector3().subVectors(target, origin);
  const tProj = toPlayer.dot(dir);
  if (tProj > 0 && tProj < 30) {
    const closest = origin.clone().addScaledVector(dir, tProj);
    if (closest.distanceTo(target) < 1.2) {
      _player.userData._pendingDamage = (_player.userData._pendingDamage || 0) + 50;
    }
  }
}

function _dashTowards(z, speed) {
  const dir = new THREE.Vector3().subVectors(_player.position, z.mesh.position);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  z.vx = dir.x * speed;
  z.vz = dir.z * speed;
}

function _riotShotgun(z) {
  if (typeof _spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.3);
  for (let i = 0; i < 6; i++) {
    const dir = new THREE.Vector3().subVectors(_player.position, origin); dir.y = 0; dir.normalize();
    dir.x += (Math.random() - 0.5) * 0.3;
    dir.z += (Math.random() - 0.5) * 0.3;
    dir.normalize();
    _spawnProjectile({ type: 'pellet', origin, dir, speed: 34, damage: 12, radius: 0.1 });
  }
}

function _riotTripleShot(z) {
  for (let i = 0; i < 3; i++) setTimeout(() => _riotShotgun(z), i * 180);
}

function _leapSlam(z) {
  _spawnParticles(z.mesh.position, 0xff8800, 30);
  const toPlayer = new THREE.Vector3().subVectors(_player.position, z.mesh.position).setY(0);
  if (toPlayer.lengthSq() < 100) z.mesh.position.addScaledVector(toPlayer, 0.8);
  setTimeout(() => _slam(z, 55), 350);
}

function _meleeStrike(z, dmg) {
  const dx = _player.position.x - z.mesh.position.x;
  const dz = _player.position.z - z.mesh.position.z;
  if (dx*dx + dz*dz < 9) {
    _player.userData._pendingDamage = (_player.userData._pendingDamage || 0) + dmg;
  }
  _spawnParticles(z.mesh.position, 0xff4444, 15);
}

function _scytheBlast(z) {
  if (typeof _spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.2);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    _spawnProjectile({ type: 'scythe', origin, dir, speed: 18, damage: 25, radius: 0.35 });
  }
}

function _gunShortBurst(z) {
  if (typeof _spawnProjectile !== 'function') return;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const origin = z.mesh.position.clone().setY(1.4);
      const dir = new THREE.Vector3().subVectors(_player.position, origin); dir.y = 0; dir.normalize();
      dir.x += (Math.random() - 0.5) * 0.08;
      dir.z += (Math.random() - 0.5) * 0.08;
      dir.normalize();
      _spawnProjectile({ type: 'bullet', origin, dir, speed: 55, damage: 18, radius: 0.08 });
    }, i * 90);
  }
}

function _gunTripleBurst(z) {
  for (let i = 0; i < 3; i++) setTimeout(() => _gunShortBurst(z), i * 250);
}

function _slam(z, dmg) {
  _spawnParticles(z.mesh.position, 0xffaa00, 40);
  const dx = _player.position.x - z.mesh.position.x;
  const dz = _player.position.z - z.mesh.position.z;
  if (dx*dx + dz*dz < 16) {
    _player.userData._pendingDamage = (_player.userData._pendingDamage || 0) + dmg;
  }
}

function _onStageChange(z, def) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 8),
    new THREE.MeshBasicMaterial({ color: def.tint, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  flash.position.copy(z.mesh.position); flash.position.y += 1.2;
  _scene.add(flash);
  const start = performance.now();
  const anim = () => {
    const t = (performance.now() - start) / 450;
    if (t >= 1) { _scene.remove(flash); flash.geometry.dispose(); flash.material.dispose(); return; }
    flash.scale.setScalar(1 + t * 3.5);
    flash.material.opacity = 0.75 * (1 - t);
    requestAnimationFrame(anim);
  };
  anim();
}

export { BOSS_DEFS };
