let ctx = null;
let masterGain = null;
let compressor = null;
let noiseBuffer = null;
let muted = false;

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
    masterGain.gain.value = 0.85;
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);
  } catch (e) { console.warn('Web Audio nao suportado'); }
}
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setMuted(m) { muted = !!m; if (masterGain) masterGain.gain.value = muted ? 0 : 0.85; }
export function isMuted() { return muted; }
export function setVolume(v) { if (masterGain) masterGain.gain.value = muted ? 0 : Math.max(0, Math.min(1, v)); }

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
  return { o, g };
}

export function playKnifeSwing() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, t);
  filter.frequency.exponentialRampToValueAtTime(3000, t + 0.1);
  filter.Q.value = 2;
  const g = envGain(t, 0.22, 0.005, 0.16);
  src.connect(filter).connect(g).connect(compressor);
  src.start(t, 0, 0.18); src.stop(t + 0.2);
}
export function playKnifeHitFlesh() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 140, 50, 0.35, 0.18, 0.2);
  playNoise(t, 0.12, 'lowpass', 800, 0.3, 0.1);
}
export function playBulletImpact() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playNoise(t, 0.06, 'highpass', 2500, 0.18, 0.05);
  playOsc(t, 'square', 180, 60, 0.12, 0.05, 0.06);
}
export function playPistol() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'square', 800, 180, 0.35, 0.09, 0.1);
  playNoise(t, 0.08, 'highpass', 1200, 0.4, 0.07);
}
export function playRevolver() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'square', 500, 80, 0.45, 0.22, 0.25);
  playNoise(t, 0.2, 'lowpass', 2500, 0.5, 0.18);
}
export function playSMG() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 600, 150, 0.25, 0.05, 0.06);
  playNoise(t, 0.05, 'highpass', 1500, 0.35, 0.04);
}
export function playRifle() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'square', 700, 90, 0.5, 0.22, 0.25);
  const n = playNoise(t, 0.25, 'bandpass', 2000, 0.45, 0.22);
  n.filter.Q.value = 0.8;
}
export function playShotgun() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 150, 35, 0.55, 0.28, 0.3);
  playNoise(t, 0.3, 'lowpass', 3000, 0.6, 0.28, 500);
}
export function playLauncher() {
  if (!ctx) return;
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
}
export function playZombieDeath() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 320, 40, 0.18, 0.48, 0.5);
}
export function playGroan() {
  if (!ctx) return;
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
}
export function playCoin() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((f, i) => playOsc(t + i * 0.05, 'sine', f, f, 0.13, 0.14, 0.15));
}
export function playLevelUp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    const start = t + i * 0.08;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.18, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    o.connect(g).connect(compressor);
    o.start(start); o.stop(start + 0.32);
  });
}
export function playPlayerHurt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 220, 80, 0.28, 0.22, 0.25);
}
export function playBuy() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'triangle', 660, 990, 0.2, 0.12, 0.13);
}
export function playPlayerDown() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sawtooth', 260, 40, 0.4, 0.9, 1.0);
  playNoise(t, 0.35, 'lowpass', 400, 0.35, 0.3);
}
export function playRevive() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 330, 990, 0.25, 0.5, 0.55);
  playOsc(t + 0.12, 'sine', 660, 1320, 0.2, 0.4, 0.45);
}
export function playPing() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'sine', 1200, 1600, 0.15, 0.1, 0.13);
}
export function playReload() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playOsc(t, 'square', 400, 250, 0.15, 0.06, 0.07);
  playNoise(t + 0.15, 0.05, 'highpass', 2000, 0.12, 0.04);
}
export function playDebrisImpact() {
  if (!ctx) return;
  const t = ctx.currentTime;
  playNoise(t, 0.06, 'lowpass', 1200, 0.22, 0.05);
  playOsc(t, 'square', 200, 90, 0.1, 0.06, 0.07);
}
