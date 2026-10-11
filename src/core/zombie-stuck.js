// ============================================================
// zombie-stuck.js
// Detecta zumbi preso em parede/canto e reage:
//   - Hop (pulo curto) + empurrão lateral aleatório
//   - Alterna direção de perseguição
//   - Cooldown entre tentativas
//
// Porte simplificado de Zombie.cs (StuckDecision + EnterJumpState).
// ============================================================

const STUCK_SPEED_THRESHOLD = 0.15;   // velocidade mínima aceitável
const STUCK_TIME = 0.55;              // segundos parado antes de agir
const COOLDOWN = 1.4;                 // segundos entre tentativas
const JUMP_VELOCITY = 3.5;            // impulso vertical (hop)
const JUMP_DURATION = 0.4;            // segundos do hop
const PUSH_SPEED = 3.5;               // empurrão lateral ao desentalar

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

/**
 * Chama a cada frame, DEPOIS de resolveWallCollisions.
 * @param {Object} z       - objeto do zumbi
 * @param {number} dt      - delta time
 * @param {Object} world   - world com wallColliders/furnitureColliders (não usado agora, mas fica pro futuro)
 */
export function updateStuckDetection(z, dt, world) {
  if (!z._stuck) initStuckState(z);
  const s = z._stuck;

  s.cooldown -= dt;

  // Enquanto estiver no ar ou atacando, não conta como preso
  if (z.dying || z.attackWindupActive || s.jumping) {
    s.lastX = z.mesh.position.x;
    s.lastZ = z.mesh.position.z;
    s.stuckTimer = 0;
    return;
  }

  // Distância real andada no frame
  const dx = z.mesh.position.x - s.lastX;
  const dz = z.mesh.position.z - s.lastZ;
  const realSpeed = Math.hypot(dx, dz) / Math.max(dt, 0.001);
  s.lastX = z.mesh.position.x;
  s.lastZ = z.mesh.position.z;

  // Quer se mover mas não anda? Acumula timer
  const wantsToMove = (z.vx * z.vx + z.vz * z.vz) > 0.25;
  if (wantsToMove && realSpeed < STUCK_SPEED_THRESHOLD) {
    s.stuckTimer += dt;
  } else {
    s.stuckTimer = 0;
  }

  // Tempo suficiente preso + cooldown ok? Reage.
  if (s.stuckTimer > STUCK_TIME && s.cooldown <= 0) {
    s.cooldown = COOLDOWN;
    s.stuckTimer = 0;
    _reactToStuck(z);
  }
}

function _reactToStuck(z) {
  const s = z._stuck;

  // 1) Hop vertical curto
  s.jumping = true;
  s.jumpVelY = JUMP_VELOCITY;
  s.jumpEnd = performance.now() / 1000 + JUMP_DURATION;

  // 2) Empurrão lateral aleatório — escolhe direção oposta ao movimento atual
  const angle = Math.random() * Math.PI * 2;
  z.vx = Math.cos(angle) * PUSH_SPEED;
  z.vz = Math.sin(angle) * PUSH_SPEED;

  // Força o _prevX/_prevZ pro novo lugar pra não marcar como preso de novo
  z._prevX = z.mesh.position.x;
  z._prevZ = z.mesh.position.z;

  // 3) Zumbi fica alertado por uns segundos (re-avalia rota)
  z.alertedUntil = performance.now() / 1000 + 2.5;

  // 4) Som de grunhido (o zumbi ficou irritado)
  // (o game.js cuida do som via aggroSoundCooldown)
  z._forceGroan = true;
}

/**
 * Aplica a física do hop. Chama a cada frame, no loop de zumbis.
 */
export function applyStuckPhysics(z, dt) {
  const s = z._stuck;
  if (!s || !s.jumping) return;

  z.mesh.position.y += s.jumpVelY * dt;
  s.jumpVelY -= 22 * dt; // gravidade

  const now = performance.now() / 1000;
  if (z.mesh.position.y <= 0 || now > s.jumpEnd) {
    z.mesh.position.y = 0;
    s.jumping = false;
    s.jumpVelY = 0;
  }
}
