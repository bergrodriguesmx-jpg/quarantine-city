import * as THREE from 'three';

// ============================================================
// BOSS STAGES  (ported from Zumbi Blocks 2 — Riot / Queen / Reaper)
// Anexa comportamento multi-estágio, teleporte, projéteis e
// ataques especiais aos bosses já existentes no game.js.
//
// Uso:
//   BossStages.initBossStageSystem(scene, camera, player);
//   BossStages.updateBossStages(dt, zombies, spawnProjectile);
// ============================================================

const BOSS_DEFS = {
  riot: {
    stages: 3,
    stageAttackRanges: [3.5, 10, 4],
    tint: 0xa0a0ff,
  },
  queen: {
    stages: 3,
    flight: true,
    tint: 0xffaaff,
  },
  reaper: {
    stages: 3,
    teleport: true,
    tint: 0x6060ff,
  },
};

// Referências globais do módulo (injetadas via initBossStageSystem)
let _scene = null;
let _camera = null;
let _player = null;

// ============================================================
// INIT
// ============================================================
export function initBossStageSystem(scene, camera, player) {
  _scene = scene;
  _camera = camera;
  _player = player;
}

// ============================================================
// INIT POR ZUMBI — chamado quando um boss spawna
// ============================================================
export function initBoss(z) {
  z.bossStage = 1;
  z.bossStageHealthThresholds = [1.0, 0.66, 0.33];
  z.bossActionCooldown = 0;
  z.bossActionState = 'idle';
  z.bossActionTimer = 0;
  z.teleportCooldown = 3 + Math.random() * 2;
  z.projectiles = [];
}

// ============================================================
// UPDATE PRINCIPAL
// ============================================================
export function updateBossStages(dt, zombies, spawnProjectile) {
  if (!_scene || !_camera || !_player) return;
  const now = performance.now() / 1000;

  for (const z of zombies) {
    if (!z || !z.isBoss || z.health <= 0 || z.dying) continue;

    // Garante que o boss tenha os campos (caso spawnou fora do hook)
    if (z.bossStage === undefined) initBoss(z);

    const def = BOSS_DEFS[z.typeKey] || BOSS_DEFS.riot;
    const hpFrac = z.health / z.maxHealth;

    // --- Transição de estágio ---
    let newStage = 1;
    for (let i = 1; i < def.stages; i++) {
      if (hpFrac <= z.bossStageHealthThresholds[i]) newStage = i + 1;
    }
    if (newStage !== z.bossStage) {
      z.bossStage = newStage;
      z.bossActionState = 'transition';
      z.bossActionTimer = 0.8;
      z.bossActionCooldown = 0;
      _onStageChange(z, def);
    }

    // --- Cooldowns ---
    if (z.bossActionCooldown > 0) z.bossActionCooldown -= dt;
    if (z.teleportCooldown > 0) z.teleportCooldown -= dt;

    // --- Executa ação do turno ---
    _updateBossAction(z, def, dt, now, spawnProjectile);
  }
}

// ============================================================
// LÓGICA DE AÇÕES
// ============================================================
function _updateBossAction(z, def, dt, now, spawnProjectile) {
  // Estado: transição
  if (z.bossActionState === 'transition') {
    z.bossActionTimer -= dt;
    if (z.bossActionTimer <= 0) z.bossActionState = 'idle';
    return;
  }

  const dist = z.mesh.position.distanceTo(_player.position);

  // === REAPER: teleporte se estiver longe ===
  if (def.teleport && dist > 8 && z.teleportCooldown <= 0) {
    _teleport(z);
    z.teleportCooldown = 5 + Math.random() * 3;
    z.bossActionState = 'idle';
    return;
  }

  // === QUEEN: tox ball / laser / dash ===
  if (def.flight && z.bossActionCooldown <= 0 && dist > 4 && dist < 20) {
    const roll = Math.random();
    if (roll < 0.4) {
      _shootToxBall(z, spawnProjectile);
    } else if (roll < 0.7) {
      _shootLaser(z);
    } else {
      _dashTowards(z, 12);
    }
    z.bossActionCooldown = 1.2 + Math.random() * 0.8;
    return;
  }

  // === RIOT: shotgun burst (estágio >= 2) ===
  if (z.typeKey === 'riot' && z.bossStage >= 2 && z.bossActionCooldown <= 0 && dist < 14) {
    _riotShotgun(z, spawnProjectile);
    z.bossActionCooldown = 0.8 + Math.random() * 0.5;
    return;
  }

  // === SLAM quando perto ===
  if (z.bossActionCooldown <= 0 && dist < 3.5) {
    _slamAttack(z);
    z.bossActionCooldown = 2.0 + Math.random();
  }
}

// ============================================================
// AÇÕES ESPECÍFICAS
// ============================================================

function _teleport(z) {
  // Partículas no ponto de saída
  _spawnParticles(z.mesh.position, 0x6060ff, 30);

  // Direção "para trás" do player (oposta ao olhar da câmera)
  const forward = new THREE.Vector3();
  _camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();

  // 4 metros atrás do player
  const behind = forward.clone().multiplyScalar(-4);
  const newPos = _player.position.clone().add(behind);
  newPos.y = z.mesh.position.y; // mantém altura
  z.mesh.position.copy(newPos);

  // Zera velocidade para evitar deslize estranho após teleporte
  if (z.vx !== undefined) z.vx = 0;
  if (z.vz !== undefined) z.vz = 0;

  // Partículas no ponto de chegada
  _spawnParticles(newPos, 0x6060ff, 30);
}

function _shootToxBall(z, spawnProjectile) {
  if (typeof spawnProjectile !== 'function') return;
  const origin = z.mesh.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(_player.position, origin);
  dir.y = 0;
  dir.normalize();
  spawnProjectile({
    type: 'tox',
    origin,
    dir,
    speed: 12,
    damage: 25,
    radius: 0.35,
  });
}

function _shootLaser(z) {
  const origin = z.mesh.position.clone().setY(1.5);
  const target = _player.position.clone().setY(1.5);
  const dir = new THREE.Vector3().subVectors(target, origin);
  const dist = dir.length();
  if (dist < 0.001) return;
  dir.normalize();

  // Linha visual do laser
  const geo = new THREE.BufferGeometry().setFromPoints([
    origin, origin.clone().addScaledVector(dir, Math.min(dist, 30)),
  ]);
  const mat = new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  _scene.add(line);

  const startTime = performance.now();
  const fade = () => {
    const t = (performance.now() - startTime) / 250;
    if (t >= 1) {
      _scene.remove(line);
      geo.dispose();
      mat.dispose();
      return;
    }
    mat.opacity = 0.9 * (1 - t);
    requestAnimationFrame(fade);
  };
  fade();

  // Dano se o player estiver sobre a linha (tolerância 1.2m)
  const toPlayer = new THREE.Vector3().subVectors(target, origin);
  const tProj = toPlayer.dot(dir);
  if (tProj > 0 && tProj < 30) {
    const closest = origin.clone().addScaledVector(dir, tProj);
    const perpDist = closest.distanceTo(target);
    if (perpDist < 1.2) {
      _player.userData._pendingDamage = (_player.userData._pendingDamage || 0) + 40;
    }
  }
}

function _dashTowards(z, speed) {
  const dir = new THREE.Vector3()
    .subVectors(_player.position, z.mesh.position);
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
    const dir = new THREE.Vector3()
      .subVectors(_player.position, origin);
    dir.y = 0;
    dir.normalize();
    dir.x += (Math.random() - 0.5) * 0.25;
    dir.z += (Math.random() - 0.5) * 0.25;
    dir.normalize();
    spawnProjectile({
      type: 'pellet',
      origin,
      dir,
      speed: 30,
      damage: 10,
      radius: 0.1,
    });
  }
}

function _slamAttack(z) {
  _spawnParticles(z.mesh.position, 0xffaa00, 40);

  const dx = _player.position.x - z.mesh.position.x;
  const dz = _player.position.z - z.mesh.position.z;
  if (dx * dx + dz * dz < 9) {
    _player.userData._pendingDamage = (_player.userData._pendingDamage || 0) + 20;
  }
}

// ============================================================
// EFEITOS VISUAIS
// ============================================================
function _onStageChange(z, def) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 8),
    new THREE.MeshBasicMaterial({
      color: def.tint,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
  );
  flash.position.copy(z.mesh.position);
  flash.position.y += 1.2;
  _scene.add(flash);

  const startTime = performance.now();
  const anim = () => {
    const t = (performance.now() - startTime) / 400;
    if (t >= 1) {
      _scene.remove(flash);
      flash.geometry.dispose();
      flash.material.dispose();
      return;
    }
    flash.scale.setScalar(1 + t * 3);
    flash.material.opacity = 0.7 * (1 - t);
    requestAnimationFrame(anim);
  };
  anim();
}

function _spawnParticles(pos, color, count) {
  const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);

    const v = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      Math.random() * 6,
      (Math.random() - 0.5) * 8
    );

    _scene.add(m);

    const startTime = performance.now();
    const life = 0.6;
    const anim = () => {
      const t = (performance.now() - startTime) / 1000;
      if (t >= life) {
        _scene.remove(m);
        mat.dispose();
        return;
      }
      m.position.addScaledVector(v, 1 / 60);
      v.y -= 15 / 60;
      mat.opacity = 1 - t / life;
      requestAnimationFrame(anim);
    };
    anim();
  }
}
