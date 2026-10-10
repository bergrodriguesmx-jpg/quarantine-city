import * as THREE from 'three';

// ============================================================
// BOSS DEFINITIONS — extraídas do C# (BossDescriptor)
// ============================================================
const BOSS_DEFS = {
  riot:   { stages: 3, healthStages: [1.0, 0.66, 0.33], tint: 0xa0a0ff },
  queen:  { stages: 3, healthStages: [1.0, 0.66, 0.33], tint: 0xffaaff, flight: true },
  reaper: { stages: 4, healthStages: [1.0, 0.75, 0.50, 0.25], tint: 0x6060ff, teleport: true },
};

// Distâncias de teleporte por stage (ReaperAttackDecision.StageTeleportCloserDistance)
const REAPER_TELEPORT_DIST = { 1: 4, 2: 6, 3: 8, 4: 6 };

let _scene = null, _camera = null, _player = null;

export function initBossStageSystem(scene, camera, player) {
  _scene = scene; _camera = camera; _player = player;
}

export function initBoss(z, key) {
  const def = BOSS_DEFS[z.typeKey] || BOSS_DEFS.riot;
  z.bossStage = 1;
  z.bossStageHealthThresholds = def.healthStages;
  z.bossActionCooldown = 0;
  z.bossActionState = 'idle';
  z.bossActionTimer = 0;
  z.teleportCooldown = 3 + Math.random() * 2;
  z.ammo = def.stages >= 3 ? 4 : 0; // só reaper usa ammo
  z.flightHeight = 4;
  z.strafeDir = Math.random() < 0.5 ? 1 : -1;
  z.strafeTimer = 2 + Math.random() * 2;
}

export function updateBossStages(dt, zombies, spawnProjectile) {
  if (!_scene || !_camera || !_player) return;
  const now = performance.now() / 1000;

  for (const z of zombies) {
    if (!z || !z.isBoss || z.health <= 0 || z.dying) continue;
    if (z.bossStage === undefined) initBoss(z);

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
      z.bossActionTimer = 0.9;
      z.bossActionCooldown = 0;
      _onStageChange(z, def);
      if (z.typeKey === 'reaper') z.ammo = 4; // reaper recarrega
    }

    if (z.bossActionCooldown > 0) z.bossActionCooldown -= dt;
    if (z.teleportCooldown > 0) z.teleportCooldown -= dt;

    if (z.typeKey === 'riot') _updateRiot(z, def, dt, now, spawnProjectile);
    else if (z.typeKey === 'queen') _updateQueen(z, def, dt, now, spawnProjectile);
    else if (z.typeKey === 'reaper') _updateReaper(z, def, dt, now, spawnProjectile);
  }
}

// ============================================================
// RIOT — Shield (s1) → Shotgun (s2) → Slam (s3)
// Ref: RiotBossBehaviour.AttackDecision
// ============================================================
function _updateRiot(z, def, dt, now, spawnProjectile) {
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }
  const dist = z.mesh.position.distanceTo(_player.position);

  if (z.bossStage === 1) {
    if (dist < 2) { _slam(z, 30); z.bossActionCooldown = 0.8 + Math.random() * 0.6; }
    else if (dist < 6 && z.bossActionCooldown <= 0 && Math.random() < 0.5) {
      _dashTowards(z, 10); z.bossActionCooldown = 1.5;
    }
  } else if (z.bossStage === 2) {
    if (dist < 2) { _slam(z, 35); z.bossActionCooldown = 1.0; }
    else if (dist < 15 && z.bossActionCooldown <= 0) {
      _riotShotgun(z, spawnProjectile); z.bossActionCooldown = 0.8 + Math.random() * 0.6;
    }
  } else if (z.bossStage === 3) {
    if (dist < 2.5 && z.bossActionCooldown <= 0) { _slam(z, 45); z.bossActionCooldown = 1.2; }
    else if (dist < 8 && z.bossActionCooldown <= 0 && Math.random() < 0.7) {
      _leapSlam(z); z.bossActionCooldown = 2.0;
    } else if (dist < 12 && z.bossActionCooldown <= 0) {
      _riotTripleShot(z, spawnProjectile); z.bossActionCooldown = 1.2;
    }
  }
}

// ============================================================
// QUEEN — voadora, 3 estágios de distanciamento
// Ref: QueenBossBehaviour.SelectActionByStage
// ============================================================
function _updateQueen(z, def, dt, now, spawnProjectile) {
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }
  // Voo
  const targetY = 3.5 + Math.sin(now * 1.5) * 0.5;
  z.mesh.position.y += (targetY - z.mesh.position.y) * Math.min(1, dt * 2);

  // Strafe
  z.strafeTimer -= dt;
  if (z.strafeTimer <= 0) {
    z.strafeTimer = 2 + Math.random() * 2.5;
    z.strafeDir *= -1;
  }
  const toPlayer = new THREE.Vector3().subVectors(_player.position, z.mesh.position).setY(0);
  const dist = toPlayer.length();
  if (dist > 0.1) {
    toPlayer.normalize();
    const perp = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    z.mesh.position.addScaledVector(perp, z.strafeDir * 2.5 * dt);
  }

  if (z.bossActionCooldown > 0) return;
  const dist3D = z.mesh.position.distanceTo(_player.position);

  if (z.bossStage === 1) {
    if (dist3D > 10) _shootToxBall(z, spawnProjectile);
    else if (dist3D > 6.5) _queenStab(z, spawnProjectile);
    else _slam(z, 22);
  } else if (z.bossStage === 2) {
    const r = Math.random();
    if (dist3D > 10) {
      if (r < 0.4) _shootToxBall(z, spawnProjectile);
      else if (r < 0.7) _queenLaser(z);
      else _dashTowards(z, 14);
    } else if (dist3D > 6.5) _queenStab(z, spawnProjectile);
    else if (dist3D > 4) _slam(z, 25);
    else _queenTwirl(z);
  } else {
    const r = Math.random();
    if (dist3D > 5) {
      if (r < 0.3) _multiTox(z, spawnProjectile);
      else if (r < 0.6) _queenLaser(z);
      else if (r < 0.8) _queenCurvedLaser(z);
      else _dashTowards(z, 16);
    } else _queenLaser(z);
  }
  z.bossActionCooldown = z.bossStage === 3 ? 0.4 + Math.random() * 0.4 : 1.2 + Math.random() * 0.7;
}

// ============================================================
// REAPER — 4 estágios, teleporte, arma de fogo
// Ref: ReaperBehaviour + ReaperAttackDecision
// ============================================================
function _updateReaper(z, def, dt, now, spawnProjectile) {
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }
  const dist = z.mesh.position.distanceTo(_player.position);

  // Teleporte quando está longe
  const teleportDist = REAPER_TELEPORT_DIST[z.bossStage] || 5;
  if (dist > teleportDist + 2 && z.teleportCooldown <= 0) {
    _teleportCloser(z, teleportDist);
    z.teleportCooldown = 1.5 + Math.random() * 1.5;
    return;
  }

  if (z.bossActionCooldown > 0) return;

  if (z.bossStage === 1) {
    // Só melee — cross punch, sweep, dash
    if (dist < 2) { _meleeStrike(z, 40); z.bossActionCooldown = 0.5 + Math.random() * 0.4; }
    else if (dist < 6 && Math.random() < 0.6) { _dashTowards(z, 16); z.bossActionCooldown = 0.9; }
    else z.bossActionCooldown = 0.3;
  } else if (z.bossStage === 2) {
    // Ganha foice — scythe basic/blast
    if (dist < 4 && Math.random() < 0.6) { _meleeStrike(z, 55); z.bossActionCooldown = 0.6; }
    else if (dist < 5 && Math.random() < 0.5) { _scytheBlast(z, spawnProjectile); z.bossActionCooldown = 1.0; }
    else if (dist < 8 && Math.random() < 0.4) { _dashTowards(z, 18); z.bossActionCooldown = 0.8; }
    else z.bossActionCooldown = 0.3;
  } else if (z.bossStage === 3) {
    // Ganha pistola
    if (z.ammo > 0 && dist > 3 && dist < 20) {
      _gunShortBurst(z, spawnProjectile);
      z.ammo--;
      z.bossActionCooldown = 0.8;
    } else if (z.ammo <= 0) {
      z.ammo = 4;
      z.bossActionCooldown = 1.5; // "reload"
    } else if (dist < 3) {
      _meleeStrike(z, 60);
      z.bossActionCooldown = 0.6;
    }
  } else {
    // Stage 4 — combo completo
    const r = Math.random();
    if (dist < 2.5 && r < 0.4) { _meleeStrike(z, 70); z.bossActionCooldown = 0.5; }
    else if (dist < 4 && r < 0.6) { _scytheBlast(z, spawnProjectile); z.bossActionCooldown = 0.9; }
    else if (dist < 12 && z.ammo > 0 && r < 0.85) {
      _gunTripleBurst(z, spawnProjectile);
      z.ammo -= 3;
      z.bossActionCooldown = 1.0;
    } else if (dist < 8) { _dashTowards(z, 20); z.bossActionCooldown = 0.7; }
    else z.bossActionCooldown = 0.25;
    if (z.ammo <= 0) { z.ammo = 4; z.bossActionCooldown = 1.5; }
  }
}

// ============================================================
// AÇÕES
// ============================================================
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

function _shootToxBall(z, spawnProjectile) {
  if (typeof spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(_player.position, origin); dir.y = 0; dir.normalize();
  spawnProjectile({ type: 'tox', origin, dir, speed: 14, damage: 28, radius: 0.4 });
}

function _multiTox(z, spawnProjectile) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => _shootToxBall(z, spawnProjectile), i * 200);
  }
}

function _queenStab(z, spawnProjectile) {
  _dashTowards(z, 18);
  if (typeof spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(_player.position, origin); dir.y = 0; dir.normalize();
  spawnProjectile({ type: 'tox', origin, dir, speed: 24, damage: 35, radius: 0.3 });
}

function _queenTwirl(z) {
  const dx = _player.position.x - z.mesh.position.x;
  const dz = _player.position.z - z.mesh.position.z;
  if (dx*dx + dz*dz < 12) {
    _player.userData._pendingDamage = (_player.userData._pendingDamage || 0) + 45;
  }
  _spawnParticles(z.mesh.position, 0xffaaff, 20);
}

function _queenLaser(z) {
  _fireLaser(z, 0);
}
function _queenCurvedLaser(z) {
  _fireLaser(z, 0.15);
}

function _fireLaser(z, curveAmount) {
  const origin = z.mesh.position.clone().setY(1.5);
  const target = _player.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(target, origin);
  const dist = dir.length();
  if (dist < 0.001) return;
  dir.normalize();
  // Aplica curvatura (lead)
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

function _riotShotgun(z, spawnProjectile) {
  if (typeof spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.3);
  for (let i = 0; i < 6; i++) {
    const dir = new THREE.Vector3().subVectors(_player.position, origin); dir.y = 0; dir.normalize();
    dir.x += (Math.random() - 0.5) * 0.3;
    dir.z += (Math.random() - 0.5) * 0.3;
    dir.normalize();
    spawnProjectile({ type: 'pellet', origin, dir, speed: 34, damage: 12, radius: 0.1 });
  }
}

function _riotTripleShot(z, spawnProjectile) {
  for (let i = 0; i < 3; i++) setTimeout(() => _riotShotgun(z, spawnProjectile), i * 220);
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

function _scytheBlast(z, spawnProjectile) {
  if (typeof spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.2);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    spawnProjectile({ type: 'scythe', origin, dir, speed: 18, damage: 25, radius: 0.35 });
  }
}

function _gunShortBurst(z, spawnProjectile) {
  if (typeof spawnProjectile !== 'function') return;
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const origin = z.mesh.position.clone().setY(1.4);
      const dir = new THREE.Vector3().subVectors(_player.position, origin); dir.y = 0; dir.normalize();
      dir.x += (Math.random() - 0.5) * 0.08;
      dir.z += (Math.random() - 0.5) * 0.08;
      dir.normalize();
      spawnProjectile({ type: 'bullet', origin, dir, speed: 55, damage: 18, radius: 0.08 });
    }, i * 90);
  }
}

function _gunTripleBurst(z, spawnProjectile) {
  for (let i = 0; i < 3; i++) setTimeout(() => _gunShortBurst(z, spawnProjectile), i * 300);
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
