import * as THREE from 'three';

// ============================================================
// DAY/NIGHT CYCLE + BLOOD MOON  (ported from Zumbi Blocks 2)
// Manages sun position, ambient light, fog color, blood moon tint.
// ============================================================

let instance = null;

const CONFIG = {
  dayDurationSec: 600,      // 10 minutos por dia completo
  startTime: 10.0,          // 10h da manhã
  bloodMoonChance: 0.15,    // 15% de chance por noite
  bloodMoonWindowStart: 22, // 22h
  bloodMoonWindowEnd: 4,    // até 4h
  sunColorDay: 0xffffff,
  sunColorDusk: 0xff8844,
  sunColorBlood: 0xff3030,
  fogDay: 0xC5E0F5,
  fogDusk: 0xE8A070,
  fogNight: 0x1A2030,
  fogBlood: 0x3A0808,
};

function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

export function initDaytime(scene, sun, ambient) {
  instance = {
    scene, sun, ambient,
    time: CONFIG.startTime,
    bloodMoon: false,
    bloodMoonCheckedTonight: false,
    dayCount: 0,
  };
  _applyLighting(0);
}

export function getTime() { return instance ? instance.time : 12; }
export function isBloodMoon() { return instance ? instance.bloodMoon : false; }
export function isNight() { return instance ? (instance.time >= 20 || instance.time < 5) : false; }

export function updateDaytime(dt) {
  if (!instance) return;
  const { scene, sun, ambient } = instance;

  // Avanço do tempo (1 min real = ~2.4min in-game)
  const rate = 24 / CONFIG.dayDurationSec;
  instance.time += rate * dt;
  if (instance.time >= 24) {
    instance.time -= 24;
    instance.dayCount++;
    instance.bloodMoonCheckedTonight = false;
  }

  // Rola blood moon ao entrar na janela noturna
  if (!instance.bloodMoonCheckedTonight &&
      instance.time >= CONFIG.bloodMoonWindowStart) {
    instance.bloodMoonCheckedTonight = true;
    instance.bloodMoon = Math.random() < CONFIG.bloodMoonChance;
    if (instance.bloodMoon) {
      // Notifica o bus — game.js pode reagir (spawnar mais zombies, etc.)
      import('./bus.js').then(bus => {
        import('./events.js').then(ev => {
          bus.emit('world:blood_moon', { day: instance.dayCount });
        }).catch(() => {});
      }).catch(() => {});
    }
  }
  if (instance.time < CONFIG.bloodMoonWindowEnd) {
    // continua a noite anterior
  } else if (instance.time > 6 && instance.time < 20) {
    instance.bloodMoon = false;
  }

  _applyLighting(dt);
}

function _applyLighting(_dt) {
  const { sun, ambient, scene } = instance;
  const t = instance.time;

  // Posição do sol (nasce 6h, pico 12h, poente 18h)
  const sunAngle = ((t - 6) / 12) * Math.PI; // 0..PI
  const elevation = Math.sin(sunAngle);
  const azimuth = Math.PI * 2 * ((t - 6) / 24);

  sun.position.set(
    Math.cos(azimuth) * 80,
    Math.max(2, elevation * 80),
    Math.sin(azimuth) * 80
  );
  sun.target?.updateMatrixWorld?.();

  // Luz do dia: 0 (noite) → 1 (meio-dia)
  let lightEval = Math.max(0, elevation);
  if (instance.bloodMoon) lightEval = Math.max(lightEval, 0.15);

  // Cor do sol
  let sunColor;
  if (instance.bloodMoon) {
    sunColor = lerpColor(CONFIG.sunColorDusk, CONFIG.sunColorBlood, lightEval);
  } else if (t < 7 || t > 17) {
    sunColor = new THREE.Color(CONFIG.sunColorDusk);
  } else {
    sunColor = new THREE.Color(CONFIG.sunColorDay);
  }
  sun.color.copy(sunColor);
  sun.intensity = Math.max(0.05, lightEval * 1.1);

  // Ambient light
  if (ambient) {
    const amb = instance.bloodMoon
      ? lerpColor(0x220000, 0x553333, 0.3 + lightEval * 0.7)
      : lerpColor(0x101828, 0xffffff, 0.25 + lightEval * 0.75);
    ambient.color.copy(amb);
    ambient.intensity = 0.4 + lightEval * 0.55;
  }

  // Fog
  let fogColor;
  if (instance.bloodMoon) {
    fogColor = lerpColor(CONFIG.fogNight, CONFIG.fogBlood, 0.7);
  } else if (t < 6 || t > 19) {
    fogColor = new THREE.Color(CONFIG.fogNight);
  } else if (t < 8 || t > 17) {
    fogColor = new THREE.Color(CONFIG.fogDusk);
  } else {
    fogColor = new THREE.Color(CONFIG.fogDay);
  }
  if (scene.fog) scene.fog.color.copy(fogColor);
  if (scene.background && scene.background.isColor) {
    scene.background.copy(fogColor);
  }
  // Ajusta fog perto do horizonte
  if (scene.fog) {
    scene.fog.near = 20 + lightEval * 30;
    scene.fog.far = 80 + lightEval * 50;
  }
}

// Retorna multiplicador de dificuldade (mais forte em blood moon / noite)
export function getNightDifficultyMult() {
  if (!instance) return 1;
  if (instance.bloodMoon) return 1.5;
  if (isNight()) return 1.2;
  return 1.0;
}

// Retorna string HH:MM para HUD
export function getClockString() {
  if (!instance) return '12:00';
  const h = Math.floor(instance.time);
  const m = Math.floor((instance.time - h) * 60);
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}
