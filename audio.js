let ctx = null;

export function initAudio() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { console.warn('Web Audio nao suportado'); }
}
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function makeNoise(duration, decay = 2) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, decay);
  }
  return buffer;
}

export function playKnifeSwing() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.18, 3);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(800, t);
  filter.frequency.exponentialRampToValueAtTime(3000, t + 0.1);
  filter.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
}

export function playKnifeHitFlesh() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.4, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g1).connect(ctx.destination);
  o.start(t); o.stop(t + 0.2);
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.12, 2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 4;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.35, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(filter).connect(g2).connect(ctx.destination);
  src.start(t);
}

export function playPistol() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(800, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.1);
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.08, 4);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1200;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.5, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  src.connect(filter).connect(g2).connect(ctx.destination);
  src.start(t);
}

export function playRevolver() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(500, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.25);
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.2, 2.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2500;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.6, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(filter).connect(g2).connect(ctx.destination);
  src.start(t);
}

export function playSMG() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(600, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.06);
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.05, 3);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1500;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.4, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(filter).connect(g2).connect(ctx.destination);
  src.start(t);
}

export function playRifle() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(700, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.25);
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.25, 2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 0.8;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.5, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(filter).connect(g2).connect(ctx.destination);
  src.start(t);
}

export function playShotgun() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.3);
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.3, 2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, t);
  filter.frequency.exponentialRampToValueAtTime(500, t + 0.3);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.7, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  src.connect(filter).connect(g2).connect(ctx.destination);
  src.start(t);
}

export function playLauncher() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(0.5, 1.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, t);
  filter.frequency.exponentialRampToValueAtTime(200, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(120, t + 0.3);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, t + 0.3);
  g2.gain.linearRampToValueAtTime(0.7, t + 0.35);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  o.connect(g2).connect(ctx.destination);
  o.start(t + 0.3); o.stop(t + 0.9);
}

export function playZombieDeath() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(320, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.5);
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
  g.gain.linearRampToValueAtTime(0.12, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(filter).connect(g).connect(ctx.destination);
  o.start(t); lfo.start(t);
  o.stop(t + 0.8); lfo.stop(t + 0.8);
}

export function playCoin() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    const start = t + i * 0.05;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.15, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
    o.connect(g).connect(ctx.destination);
    o.start(start); o.stop(start + 0.15);
  });
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
    g.gain.linearRampToValueAtTime(0.2, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start(start); o.stop(start + 0.3);
  });
}

export function playPlayerHurt() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.25);
}
