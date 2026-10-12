// ============================================================
// zombie-stuck.js
// Detecta zumbi preso em parede/canto e reage.
// Porte simplificado de Zombie.cs (StuckDecision + EnterJumpState).
// ============================================================

const STUCK_SPEED_THRESHOLD = 0.15;
const STUCK_TIME = 0.55;
const COOLDOWN = 1.4;
const JUMP_VELOCITY = 3.5;
const JUMP_DURATION = 0.4;
const PUSH_SPEED = 3.5;

export function initStuckState(z) {
  z._stuck = {
    lastX: z.mesh.position.x,
    lastZ: z.mesh.position.z,
    stuckTimer: 0,
    cooldown: 0,
    jumping: false,
    jumpVelY: 0,
    jumpEnd: 0,
  };
}

export function updateStuckDetection(z, dt, world) {
  if (!z._stuck) initStuckState(z);
  const s = z._stuck;

  // Bosses voadores não ficam "presos" no chão
  if (z.type && z.type.flight) {
    s.lastX = z.mesh.position.x;
    s.lastZ = z.mesh.position.z;
    s.stuckTimer = 0;
    return;
  }

  s.cooldown -= dt;

  if (z.dying || z.attackWindupActive || s.jumping) {
    s.lastX = z.mesh.position.x;
    s.lastZ = z.mesh.position.z;
    s.stuckTimer = 0;
    return;
  }

  const dx = z.mesh.position.x - s.lastX;
  const dz = z.mesh.position.z - s.lastZ;
  const realSpeed = Math.hypot(dx, dz) / Math.max(dt, 0.001);
  s.lastX = z.mesh.position.x;
  s.lastZ = z.mesh.position.z;

  const wantsToMove = (z.vx * z.vx + z.vz * z.vz) > 0.25;
  if (wantsToMove && realSpeed < STUCK_SPEED_THRESHOLD) {
    s.stuckTimer += dt;
  } else {
    s.stuckTimer = 0;
  }

  if (s.stuckTimer > STUCK_TIME && s.cooldown <= 0) {
    s.cooldown = COOLDOWN;
    s.stuckTimer = 0;
    _reactToStuck(z);
  }
}

function _reactToStuck(z) {
  const s = z._stuck;

  s.jumping = true;
  s.jumpVelY = JUMP_VELOCITY;
  s.jumpEnd = performance.now() / 1000 + JUMP_DURATION;

  const angle = Math.random() * Math.PI * 2;
  z.vx = Math.cos(angle) * PUSH_SPEED;
  z.vz = Math.sin(angle) * PUSH_SPEED;

  z._prevX = z.mesh.position.x;
  z._prevZ = z.mesh.position.z;

  z.alertedUntil = performance.now() / 1000 + 2.5;
  z._forceGroan = true;
}

export function applyStuckPhysics(z, dt) {
  const s = z._stuck;
  if (!s || !s.jumping) return;

  // Bosses voadores ignoram o hop
  if (z.type && z.type.flight) {
    s.jumping = false;
    s.jumpVelY = 0;
    return;
  }

  z.mesh.position.y += s.jumpVelY * dt;
  s.jumpVelY -= 22 * dt;

  const now = performance.now() / 1000;
  if (z.mesh.position.y <= 0 || now > s.jumpEnd) {
    z.mesh.position.y = 0;
    s.jumping = false;
    s.jumpVelY = 0;
  }
}
