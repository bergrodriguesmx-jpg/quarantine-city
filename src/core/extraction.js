import * as THREE from 'three';

// ============================================================
// BREAKOUT EXTRACTION MODE
// Após limpar a horda X, um helicóptero aterrissa. Entre para extrair.
// Inspirado no modo Breakout do Zumbi Blocks 2.
// ============================================================

let heli = null;
let heliState = 'off';  // off | landing | landed | taking_off
let heliTimer = 0;
let sceneRef = null;
let playerRef = null;

const HELI_CONFIG = {
  triggerWave: 10,        // extração disponível após horda 10
  landingDuration: 6,
  takeoffDuration: 5,
  landingPoint: new THREE.Vector3(20, 0, 20),
};

export function initExtraction(scene, player) {
  sceneRef = scene;
  playerRef = player;
}

export function trySpawnExtraction(currentWave) {
  if (heliState !== 'off') return;
  if (currentWave < HELI_CONFIG.triggerWave) return;
  _spawnHelicopter();
}

function _spawnHelicopter() {
  const g = new THREE.Group();
  // Corpo
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1.4, 5),
    new THREE.MeshLambertMaterial({ color: 0x2E7D32 })
  );
  body.position.y = 1.5;
  g.add(body);
  // Cauda
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 2.5),
    new THREE.MeshLambertMaterial({ color: 0x1B5E20 })
  );
  tail.position.set(0, 1.5, 3.2);
  g.add(tail);
  // Rotor principal
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.1, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x1A1A1A })
  );
  rotor.position.y = 2.4;
  rotor.name = 'rotor';
  g.add(rotor);
  // Luz
  const light = new THREE.PointLight(0x00ff00, 0, 20);
  light.position.y = 2.5;
  light.name = 'heliLight';
  g.add(light);

  // Começa no céu, longe
  g.position.set(60, 25, 60);
  sceneRef.add(g);
  heli = g;
  heliState = 'landing';
  heliTimer = 0;

  import('./bus.js').then(bus => {
    import('./events.js').then(ev => {
      bus.emit('extraction:spawned', {});
    }).catch(() => {});
  }).catch(() => {});
}

export function updateExtraction(dt) {
  if (!heli || heliState === 'off') return;

  const rotor = heli.getObjectByName('rotor');
  if (rotor) rotor.rotation.y += dt * 40;

  heliTimer += dt;
  const light = heli.getObjectByName('heliLight');
  if (light) light.intensity = 1 + Math.sin(performance.now() * 0.005) * 0.5;

  if (heliState === 'landing') {
    const t = Math.min(1, heliTimer / HELI_CONFIG.landingDuration);
    const target = HELI_CONFIG.landingPoint;
    heli.position.lerpVectors(
      new THREE.Vector3(60, 25, 60),
      new THREE.Vector3(target.x, 2.5, target.z),
      t
    );
    if (t >= 1) {
      heliState = 'landed';
      heliTimer = 0;
      import('./bus.js').then(bus => {
        import('./events.js').then(ev => {
          bus.emit('extraction:landed', { pos: target });
        }).catch(() => {});
      }).catch(() => {});
    }
  } else if (heliState === 'landed') {
    // Bobeira
    heli.position.y = 2.5 + Math.sin(performance.now() * 0.003) * 0.1;
    // Checa se player entrou
    if (playerRef) {
      const d = playerRef.position.distanceTo(heli.position);
      if (d < 2.5) {
        heliState = 'taking_off';
        heliTimer = 0;
        import('./bus.js').then(bus => {
          import('./events.js').then(ev => {
            bus.emit('extraction:success', {});
          }).catch(() => {});
        }).catch(() => {});
      }
    }
  } else if (heliState === 'taking_off') {
    const t = Math.min(1, heliTimer / HELI_CONFIG.takeoffDuration);
    heli.position.y = 2.5 + t * 30;
    heli.position.x = HELI_CONFIG.landingPoint.x + t * 40;
    heli.position.z = HELI_CONFIG.landingPoint.z + t * 40;
    if (t >= 1) {
      sceneRef.remove(heli);
      heli = null;
      heliState = 'off';
    }
  }
}

export function isExtractionActive() {
  return heliState === 'landed' || heliState === 'landing';
}
