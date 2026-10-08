let ctx = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio nao suportado');
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function playKnife() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 1.5;
  const g = ctx.createGain();
  g.gain.value = 0.35;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
}

export function playHit() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.15);
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
