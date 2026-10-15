// ============================================================
// audio.js — v4 "LIMPO"
// Somente arquivos que EXISTEM no servidor.
// 298 sons reais + fallback procedural automático.
// ============================================================

let ctx = null;
let masterGain = null;
let compressor = null;
let noiseBuffer = null;
let muted = false;
let volume = 0.85;

const BASE = 'assets/audio/';
const bufferCache = new Map();
const failedLoads = new Set();
let preloadStarted = false;
let preloadDone = false;
let loadedCount = 0;

// ════════ CATÁLOGO (só arquivos que existem) ════════
const SOUND_FILES = [
  // ────── PISTOLAS ──────
  'Jb1991_1.wav','Jb1991_2.wav','Jb1991_3.wav',
  'Jb1911_MagIn.wav','Jb1911_MagOut.wav','Jb1911_Rack.wav',
  'pistolmag1.wav','pistolmag2.wav','pistolmag3.wav',
  'slidePickupPistol.wav','genericHolster.wav',
  'Luger1.wav','Luger2.wav','Luger3.wav',
  'LugerHandle1.wav','LugerHandle2.wav','LugerHandle3.wav',
  'Python_1.wav','Python_2.wav','Python_3.wav',
  'PythonClose.wav','PythonEject.wav','PythonFillup.wav',
  'B381.wav','B382.wav','b383.wav','B38Tech.wav',
  'Bizon_1.wav','Bizon_2.wav','Bizon_3.wav',
  'BizonCycle.wav','BizonMagIn.wav','BizonMagOut.wav',

  // ────── REVOLVERS ──────
  'revolver1.wav','revolver2.wav','revolver3.wav',
  'revolverClose1.wav','revolverDryFire1.wav','revolverDryFire2.wav','revolverDryFire3.wav',
  'revolverInsertBullets1.wav','ejectRevolverBullets1.wav',

  // ────── SMGs ──────
  'Aksu_1.wav','Aksu_2.wav','Aksu_3.wav',
  'AksuCycle.wav','AksuMagIn.wav','AksuMagOut.wav',
  'Mp5_1.wav','Mp5_2.wav','Mp5_3.wav',
  'Mp5MagIn.wav','Mp5MagOut.wav','Mp5OpenBolt.wav','Mp5Slap.wav',
  'Skorpion_1.wav','Skorpion_2.wav','Skorpion_3.wav',
  'SkorpionCycle.wav','SkorpionMagin.wav','SkorpionMagout.wav',
  'AsVal_Cycle.wav','AsVal_MagIn.wav','AsVal_MagOut.wav',
  'AsVal1.wav','AsVal2.wav','AsVal3.wav',

  // ────── RIFLES ──────
  'AmericanPredator_1.wav','AmericanPredator_2.wav','AmericanPredator_3.wav',
  'Ar16_1.wav','Ar16_2.wav','Ar16_3.wav',
  'Ar16DropBolt.wav','Ar16MagIn.wav','Ar16MagOut.wav',
  'M14_1.wav','M14_2.wav','M14_3.wav',
  'M14_Cycle.wav','M14_MagIn.wav','M14_MagOut.wav',
  'm1Carbine1.wav','m1Carbine2.wav','m1Carbine3.wav','m1Mech.wav',
  'M30Carbine1.wav','M30Carbine2.wav','M30Carbine3.wav',
  'Garand1.wav','Garand2.wav','Garand3.wav',
  'GarandHandle1.wav','GarandHandle2.wav','GarandPing1.wav',
  'PPSH2.wav','PPSH3.wav','PPSHTech.wav','PPSHTech2.wav','PPSHTech3.wav',
  'Famas1.wav','Famas2.wav','Famas3.wav','FamasCycle.wav',
  'FamasMagIn.wav','FamasMagOut.wav',
  'GreaseGunS1.wav','GreaseGunS2.wav','GreaseGunS3.wav','greaseGunTech.wav',
  'DeLisle3.wav','DeLisle4.wav','DeLisle5.wav',
  'Enfield2.wav','EnfieldBlack.wav','EnfieldBlackMagIn.wav','EnfieldBlackMagOut.wav',
  'Bolt1.wav','Bolt2.wav','Bolt3.wav','Bolt6.wav',

  // ────── SHOTGUNS ──────
  'Spas1.wav','Spas2.wav','Spas3.wav',
  'riotShot.wav','bossPumpShotgun.wav',
  'pumpShotgunFast.wav',
  '12gaugeShellDrop.wav','12gaugeShellLoad.wav',
  'grabShotgun.wav','pickShotgun.wav',

  // ────── MELEE ──────
  'knifePull.wav','knifeStab1.wav','knifeStab2.wav','ak47StabSound.wav',
  'clubSound1.wav','clubSound2.wav','longerClubSound.wav',
  'metalSwoosh.ogg',
  'punch1.wav','punch2.wav','punch3.wav','punch4.wav',
  'punchHitHuman1.wav','punchHitHuman2.wav','punchHitHuman3.wav',
  'punchHitZombie1.wav','punchHitZombie2.wav','punchHitZombie3.wav',
  'bitchSlap.wav','clothAttack.wav',
  'DrawScythe.wav','ReaperSlice1.wav','ReaperSlice2.wav','ReaperSlice3.wav',
  'ReaperSlice5.wav','ReaperSlice6.wav','ReaperSlice8.wav','ReaperSlice10.wav',
  'ReaperSwosh1.wav','ReaperSwosh2.wav','ReaperSwosh3.wav','ReaperSwosh4.wav',
  'ReaperSwosh5.wav','ReaperSwosh6.wav','ReaperSwosh7.wav','ReaperSwosh8.wav',
  'ReaperSwosh9.wav','ReaperSwosh10.wav','ReaperSwosh11.wav','ReaperSwosh13.wav',
  'ReaperSheathScythe.wav','ReaperDitchCloak.wav',

  // ────── ZUMBIS ──────
  'growl1.wav','growl2.wav','growl4.wav','growl5.wav','growl6.wav',
  'Grawl - Fast.wav','Grawl - Medium.wav','Grawl - Laser.wav',
  'grunt1.wav','grunt2.wav','riotGrunt.wav',
  'ReaperGrowl1.wav','ReaperGrowl2.wav','ReaperGrowl3.wav','ReaperGrowl4.wav',
  'ReaperDarkPound.wav',
  'chew1.wav','chew2.wav','chew3.wav',
  'sizzling3.wav',

  // ────── BOSS ──────
  'BossIntro.wav','BossAr_4.wav','BossAr_5.wav','BossAr_6.wav',
  'Queen Stab.wav','Queen Swing.wav','Queen Twirl.wav',
  'QueenLaser.wav','QueenLaserCurved.wav','QueenUnsheathe.wav',
  'shieldbash.wav','shieldPoundJump.wav','holsterShield.wav',
  'pound1.wav','pound2.wav',
  'poundShield1.wav','poundShield2.wav',
  'poundSingle1.wav','poundSingle2.wav',
  'ReaperAr15ChargeHandle.wav','ReaperAr15MagIn.wav','ReaperAr15MagOut.wav',
  'ReaperArPickup.wav',
  'MultiToxThrow.ogg',

  // ────── PLAYER ──────
  'step1.wav','step3.wav','step4.wav','step5.wav',
  'jump.wav',
  'Dodge 1.wav','Dodge 2.wav','Dodge 3.wav','Dodge 4.wav',
  'rollGeneric.wav',
  'DeathPlayer.wav','defibrilatorZap.wav',
  'deafEffect.wav',
  'DrinkPills.wav',
  'slurp3.wav','slurp4.wav','slurp5.wav','slurp6.wav',

  // ────── UI / FEEDBACK ──────
  'coins1.wav','coins2.wav','coins3.wav',
  'killfeed.wav','killfeed2.wav','killfeed3.wav',
  'hitmarker3high.wav',
  'BurnNotification.ogg',

  // ────── MECÂNICA DE ARMAS ──────
  'flashImpact.wav','FlashBangImproved2.wav',
  'pullPin.wav',
  'closeDoor.wav','openDoorReal.wav',
  'leatherFoley.wav','ClothFoley.ogg',
  'drop3.wav','drop4.wav','drop8.wav','dropItemInventory.wav',

  // ────── IMPACTOS ──────
  'metalImpact.wav','dirtHit.wav','rocksDirt.wav',
  'glassDoorBreak.wav',
  'shelfBreak.wav',
  'cellDoorBreak.wav',
  'DynamiteExplosion.wav','FragExplosion.wav',

  // ────── PICKUP ──────
  'pickup1.wav','PickBadange.wav',
  'pickUpBottle1.wav','pickUpBottle2.wav',
  'pickUpFlask1.wav','pickUpFlask2.wav',
  'PickUpFruit.wav',
  'pickUpPaper1.wav','pickUpPaper2.wav',
  'pickUpSmg.wav',
  'crackOpenSodaCan.wav',

  // ────── CRAFT ──────
  'craft1.wav','craft2.wav','craft3.wav',
  'Recycle1.wav','Recycle2.wav','Recycle3.wav',

  // ────── AMBIENTE / MUNDO ──────
  'Seamless City Ambient 1.ogg',
  'Menu placeholder ambience.ogg',
  'PyreFire.wav',
  'EngineLoop.wav',
  'RotorLoopNear.wav','RotorLoopFarAway.wav',
  'ChurchBellSync.wav',
  'ChurchIntroFallImpact.wav','ChurchIntroFallSound.wav',
  'rampUp.wav','rampDown.wav',
  'Flap1.wav','Flap2.wav','Flap3.wav','Flap4.wav',
  'Flap5.wav','Flap6.wav','Flap7.wav','Flap8.wav',
];

// ════════ INIT ════════
export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 8;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.22;
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    if (!preloadStarted) {
      preloadStarted = true;
      preloadSounds();
    }
  } catch (e) { console.warn('[audio] Web Audio não suportado'); }
}

// ════════ PRELOAD ════════
async function preloadSounds() {
  const CONCURRENCY = 6;
  let idx = 0;

  async function worker() {
    while (idx < SOUND_FILES.length) {
      const i = idx++;
      const name = SOUND_FILES[i];
      try {
        const url = BASE + encodeURIComponent(name);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const arr = await resp.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        bufferCache.set(name, buf);
        loadedCount++;
      } catch (_) {
        failedLoads.add(name);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  preloadDone = true;
  console.log(`[audio] ✅ ${loadedCount}/${SOUND_FILES.length} sons carregados`);
  if (failedLoads.size > 0) {
    console.log(`[audio] ⚠️ ${failedLoads.size} faltando (usando procedural)`);
    console.log('[audio] Faltando:', [...failedLoads]);
  }
}

// ════════ HELPERS ════════
function playBuffer(name, { volume = 1, rate = 1 } = {}) {
  const buf = bufferCache.get(name);
  if (!buf || !ctx) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(compressor);
  src.start();
  return true;
}

function playRandom(names, opts = {}) {
  if (!ctx) return false;
  const available = names.filter(n => bufferCache.has(n));
  if (available.length === 0) return false;
  const name = available[Math.floor(Math.random() * available.length)];
  const rate = 0.94 + Math.random() * 0.12;
  return playBuffer(name, { ...opts, rate });
}

function playRandomFlat(names, opts = {}) {
  if (!ctx) return false;
  const available = names.filter(n => bufferCache.has(n));
  if (available.length === 0) return false;
  return playBuffer(available[Math.floor(Math.random() * available.length)], opts);
}

export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = !!m; if (masterGain) masterGain.gain.value = muted ? 0 : volume; }
export function isMuted() { return muted; }
export function setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (masterGain) masterGain.gain.value = muted ? 0 : volume; }

// ════════ FALLBACK PROCEDURAL ════════
function getNoiseBuffer() {
  if (!noiseBuffer && ctx) {
    const len = Math.floor(ctx.sampleRate * 1.0);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
function envGain(t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
  return g;
}
function autoCleanup(source, nodes, durationSec) {
  if (!source) return;
  let done = false;
  const cleanup = () => {
    if (done) return; done = true;
    try { source.disconnect(); } catch (_) {}
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      try { n.disconnect(); } catch (_) {}
    }
  };
  try { source.onended = cleanup; } catch (_) {}
  setTimeout(cleanup, (durationSec + 0.6) * 1000);
}
function playNoise(t, duration, filterType, filterFreq, peak, decay, freqEnd) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, t);
  if (freqEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
  const g = envGain(t, peak, 0.002, decay);
  src.connect(filter).connect(g).connect(compressor);
  src.start(t, 0, duration);
  src.stop(t + duration + 0.01);
  autoCleanup(src, [filter, g], duration + 0.1);
  return { src, filter, g };
}
function playOsc(t, type, freqStart, freqEnd, peak, decay, duration) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freqStart, t);
  if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
  const g = envGain(t, peak, 0.003, decay);
  o.connect(g).connect(compressor);
  o.start(t); o.stop(t + duration + 0.02);
  autoCleanup(o, [g], duration + 0.1);
  return { o, g };
}
function pitchVar() { return 0.94 + Math.random() * 0.12; }

// ════════ API PÚBLICA ════════

export function playKnifeSwing() {
  if (!ctx) return;
  if (playRandomFlat(['knifePull.wav','metalSwoosh.ogg'], { volume: 0.7 })) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(3200, t + 0.1);
  filter.Q.value = 2.2;
  const g = envGain(t, 0.22, 0.005, 0.16);
  src.connect(filter).connect(g).connect(compressor);
  src.start(t, 0, 0.18); src.stop(t + 0.2);
  autoCleanup(src, [filter, g], 0.25);
}

export function playBluntSwing() {
  if (!ctx) return;
  if (playRandom(['clubSound1.wav','clubSound2.wav','longerClubSound.wav'], { volume: 0.7 })) return;
  const t = ctx.currentTime;
  playNoise(t, 0.12, 'lowpass', 700, 0.18, 0.1, 300);
}

export function playKnifeHitFlesh() {
  if (!ctx) return;
  if (playRandom(['knifeStab1.wav','knifeStab2.wav','ak47StabSound.wav'], { volume: 1.0 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 140, 50, 0.35, 0.18, 0.2);
  playNoise(t, 0.12, 'lowpass', 800, 0.32, 0.1);
}

export function playBluntHitFlesh() {
  if (!ctx) return;
  if (playRandom(['punchHitZombie1.wav','punchHitZombie2.wav','punchHitZombie3.wav'], { volume: 0.9 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 90, 40, 0.4, 0.22, 0.25);
  playNoise(t, 0.15, 'lowpass', 500, 0.4, 0.12);
}

export function playPistol() {
  if (!ctx) return;
  if (playRandom(['Jb1991_1.wav','Jb1991_2.wav','Jb1991_3.wav'], { volume: 1.0 })) return;
  const t = ctx.currentTime;
  const p = pitchVar();
  playOsc(t, 'square', 800 * p, 180 * p, 0.35, 0.09, 0.1);
  playNoise(t, 0.08, 'highpass', 1200, 0.42, 0.07);
}

export function playRevolver() {
  if (!ctx) return;
  if (playRandom(['revolver1.wav','revolver2.wav','revolver3.wav'], { volume: 1.0 })) return;
  const t = ctx.currentTime;
  const p = pitchVar();
  playOsc(t, 'square', 500 * p, 80 * p, 0.48, 0.22, 0.25);
  playNoise(t, 0.2, 'lowpass', 2500, 0.5, 0.18);
}

export function playSMG() {
  if (!ctx) return;
  if (playRandom([
    'Aksu_1.wav','Aksu_2.wav','Aksu_3.wav',
    'Mp5_1.wav','Mp5_2.wav','Mp5_3.wav',
    'Bizon_1.wav','Bizon_2.wav','Bizon_3.wav',
    'Skorpion_1.wav','Skorpion_2.wav','Skorpion_3.wav',
  ], { volume: 0.85 })) return;
  const t = ctx.currentTime;
  const p = pitchVar();
  playOsc(t, 'sawtooth', 600 * p, 150 * p, 0.22, 0.05, 0.06);
  playNoise(t, 0.05, 'highpass', 1500, 0.32, 0.04);
}

export function playRifle() {
  if (!ctx) return;
  if (playRandom([
    'AmericanPredator_1.wav','AmericanPredator_2.wav','AmericanPredator_3.wav',
    'Ar16_1.wav','Ar16_2.wav','Ar16_3.wav',
    'M14_1.wav','M14_2.wav','M14_3.wav',
  ], { volume: 1.0 })) return;
  const t = ctx.currentTime;
  const p = pitchVar();
  playOsc(t, 'square', 700 * p, 90 * p, 0.5, 0.22, 0.25);
  const n = playNoise(t, 0.25, 'bandpass', 2000, 0.45, 0.22);
  n.filter.Q.value = 0.8;
}

export function playShotgun() {
  if (!ctx) return;
  if (playRandom(['Spas1.wav','Spas2.wav','Spas3.wav','bossPumpShotgun.wav'], { volume: 1.0 })) return;
  const t = ctx.currentTime;
  const p = pitchVar();
  playOsc(t, 'sawtooth', 150 * p, 35 * p, 0.55, 0.28, 0.3);
  playNoise(t, 0.3, 'lowpass', 3000, 0.6, 0.28, 500);
}

export function playLauncher() {
  if (!ctx) return;
  if (playBuffer('DynamiteExplosion.wav', { volume: 1.0, rate: 0.85 })) return;
  if (playBuffer('FragExplosion.wav', { volume: 1.0, rate: 0.85 })) return;
  const t = ctx.currentTime;
  playNoise(t, 0.5, 'lowpass', 800, 0.45, 0.45, 200);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(120, t + 0.3);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t + 0.3);
  g.gain.linearRampToValueAtTime(0.6, t + 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  o.connect(g).connect(compressor);
  o.start(t + 0.3); o.stop(t + 0.95);
  autoCleanup(o, [g], 1.05);
}

export function playBulletImpact() {
  if (!ctx) return;
  if (playRandom(['metalImpact.wav','dirtHit.wav','rocksDirt.wav'], { volume: 0.6 })) return;
  const t = ctx.currentTime;
  const p = 0.9 + Math.random() * 0.25;
  playNoise(t, 0.06, 'highpass', 2500 * p, 0.2, 0.05);
  playOsc(t, 'square', 180 * p, 60 * p, 0.14, 0.05, 0.06);
}

export function playDebrisImpact() {
  if (!ctx) return;
  if (playRandom(['dirtHit.wav','rocksDirt.wav','metalImpact.wav'], { volume: 0.5 })) return;
  const t = ctx.currentTime;
  playNoise(t, 0.06, 'lowpass', 1200, 0.22, 0.05);
  playOsc(t, 'square', 200, 90, 0.1, 0.06, 0.07);
}

export function playZombieDeath() {
  if (!ctx) return;
  if (playBuffer('Grawl - Fast.wav', { volume: 0.9 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 320, 40, 0.18, 0.48, 0.5);
}

export function playGroan() {
  if (!ctx) return;
  if (playRandom(['growl1.wav','growl2.wav','growl4.wav','growl5.wav','growl6.wav'], { volume: 0.5 })) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const base = 80 + Math.random() * 40;
  o.frequency.setValueAtTime(base, t);
  o.frequency.linearRampToValueAtTime(base * 0.7, t + 0.8);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 6 + Math.random() * 3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain).connect(o.frequency);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.11, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(filter).connect(g).connect(compressor);
  o.start(t); lfo.start(t);
  o.stop(t + 0.82); lfo.stop(t + 0.82);
  autoCleanup(o, [lfo, lfoGain, filter, g], 0.9);
}

export function playFootstep() {
  if (!ctx) return;
  if (playRandomFlat(['step1.wav','step3.wav','step4.wav','step5.wav'], { volume: 0.4 })) return;
  const t = ctx.currentTime;
  const p = 0.8 + Math.random() * 0.5;
  playNoise(t, 0.05, 'lowpass', 400 * p, 0.08, 0.04);
}

export function playJump() {
  if (!ctx) return;
  if (playBuffer('jump.wav', { volume: 0.7 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 400, 700, 0.15, 0.12, 0.14);
}

export function playRoll() {
  if (!ctx) return;
  if (playRandomFlat(['rollGeneric.wav','Dodge 1.wav','Dodge 2.wav'], { volume: 0.6 })) return;
  const t = ctx.currentTime;
  playNoise(t, 0.25, 'bandpass', 800, 0.2, 0.2, 400);
}

export function playWallJump() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playNoise(t, 0.08, 'lowpass', 600, 0.22, 0.06);
  playOsc(t, 'sine', 300, 600, 0.18, 0.1, 0.12);
}

export function playPlayerHurt() {
  if (!ctx) return;
  if (playRandom(['grunt1.wav','grunt2.wav'], { volume: 0.9 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 220, 80, 0.28, 0.22, 0.25);
}

export function playPlayerDown() {
  if (!ctx) return;
  if (playBuffer('DeathPlayer.wav', { volume: 1.0 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 260, 40, 0.4, 0.9, 1.0);
  playNoise(t, 0.35, 'lowpass', 400, 0.35, 0.3);
}

export function playRevive() {
  if (!ctx) return;
  if (playBuffer('defibrilatorZap.wav', { volume: 1.0 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 330, 990, 0.25, 0.5, 0.55);
  playOsc(t + 0.12, 'sine', 660, 1320, 0.2, 0.4, 0.45);
}

export function playCoin() {
  if (!ctx) return;
  if (playRandom(['coins1.wav','coins2.wav','coins3.wav'], { volume: 0.7 })) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((f, i) => playOsc(t + i * 0.05, 'sine', f, f, 0.13, 0.14, 0.15));
}

export function playLevelUp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain();
    const start = t + i * 0.08;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.18, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    o.connect(g).connect(compressor);
    o.start(start); o.stop(start + 0.32);
    autoCleanup(o, [g], (i * 0.08) + 0.4);
  });
}

export function playBuy() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'triangle', 660, 990, 0.2, 0.12, 0.13);
}

export function playPing() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 1200, 1600, 0.15, 0.1, 0.13);
}

export function playReload() {
  if (!ctx) return;
  if (playRandom([
    'pistolmag1.wav','pistolmag2.wav','pistolmag3.wav',
    'Mp5Slap.wav','Ar16DropBolt.wav',
    'Jb1911_MagIn.wav','Jb1911_Rack.wav',
  ], { volume: 0.7 })) return;
  const t = ctx.currentTime;
  playOsc(t, 'square', 400, 250, 0.15, 0.06, 0.07);
  playNoise(t + 0.15, 0.05, 'highpass', 2000, 0.12, 0.04);
  playOsc(t + 0.30, 'square', 300, 200, 0.12, 0.05, 0.06);
}

export function playEat() {
  if (!ctx) return;
  playRandom(['chew1.wav','chew2.wav','chew3.wav'], { volume: 0.6 });
}
export function playDrink() {
  if (!ctx) return;
  playRandom(['slurp3.wav','slurp4.wav','slurp5.wav','slurp6.wav'], { volume: 0.6 });
}
export function playPickupSound() {
  if (!ctx) return;
  playRandom(['pickup1.wav','pickUpPaper1.wav','pickUpPaper2.wav'], { volume: 0.7 });
}
export function playHeal() {
  if (!ctx) return;
  playBuffer('PickBadange.wav', { volume: 0.8 });
}
export function playSoda() {
  if (!ctx) return;
  playBuffer('crackOpenSodaCan.wav', { volume: 0.8 });
}
export function playBossIntro() {
  if (!ctx) return;
  playBuffer('BossIntro.wav', { volume: 1.0 });
}
export function playWaveStart() {
  if (!ctx) return;
  playRandom(['BossIntro.wav'], { volume: 0.5, rate: 1.3 });
}
export function playWaveEnd() {
  if (!ctx) return;
  playBuffer('unlockLoadout.wav', { volume: 0.7 });
}
export function playKillFeed() {
  if (!ctx) return;
  playRandom(['killfeed.wav','killfeed2.wav','killfeed3.wav'], { volume: 0.6 });
}
export function playHitmarker() {
  if (!ctx) return;
  playBuffer('hitmarker3high.wav', { volume: 0.7 });
}
export function playDoorOpen() {
  if (!ctx) return;
  playBuffer('openDoorReal.wav', { volume: 0.7 });
}
export function playDoorClose() {
  if (!ctx) return;
  playBuffer('closeDoor.wav', { volume: 0.7 });
}
export function playDoorBreak() {
  if (!ctx) return;
  playRandom(['cellDoorBreak.wav','glassDoorBreak.wav','shelfBreak.wav'], { volume: 0.9 });
}
export function playWindowBreak() {
  if (!ctx) return;
  playBuffer('glassDoorBreak.wav', { volume: 0.9, rate: 1.15 });
}
export function playHelicopterLoop() {
  if (!ctx) return;
  playBuffer('RotorLoopNear.wav', { volume: 0.7 });
}
export function playEngineLoop() {
  if (!ctx) return;
  playBuffer('EngineLoop.wav', { volume: 0.6 });
}
export function playBrazierFire() {
  if (!ctx) return;
  playBuffer('PyreFire.wav', { volume: 0.5 });
}

export function getAudioStatus() {
  return {
    loaded: loadedCount,
    failed: failedLoads.size,
    total: SOUND_FILES.length,
    done: preloadDone,
    failedList: [...failedLoads],
  };
}
