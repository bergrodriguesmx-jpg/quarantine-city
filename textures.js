// ============================================================
// textures.js — v3 "PROCEDURAL"
// Todas as texturas geradas em canvas. Zero dependência externa.
// ============================================================

import * as THREE from 'three';

const _cache = new Map();

function _canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function _toTexture(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function _noise(ctx, size, baseColor, variance, count) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 3 + 1;
    const v = (Math.random() - 0.5) * variance;
    const c = new THREE.Color(baseColor);
    c.offsetHSL(0, 0, v / 255);
    ctx.fillStyle = '#' + c.getHexString();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Céu (gradiente azul → branco) ─────────────────────────
export function skyTexture() {
  if (_cache.has('sky')) return _cache.get('sky');
  const c = _canvas(256);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#3a7bd5');
  grd.addColorStop(0.5, '#7bb5e8');
  grd.addColorStop(1, '#c5e0f5');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = _toTexture(c);
  _cache.set('sky', t);
  return t;
}

// ── Grama ─────────────────────────────────────────────────
export function grassTexture() {
  if (_cache.has('grass')) return _cache.get('grass');
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#4a7c3a';
  g.fillRect(0, 0, 128, 128);
  _noise(g, 128, '#4a7c3a', 40, 800);
  _noise(g, 128, '#5a8c3a', 30, 400);
  _noise(g, 128, '#3a6c2a', 30, 400);
  const t = _toTexture(c);
  _cache.set('grass', t);
  return t;
}

// ── Areia ─────────────────────────────────────────────────
export function sandTexture() {
  if (_cache.has('sand')) return _cache.get('sand');
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#e8d5a0';
  g.fillRect(0, 0, 128, 128);
  _noise(g, 128, '#e8d5a0', 30, 1200);
  _noise(g, 128, '#d8c590', 25, 600);
  const t = _toTexture(c);
  _cache.set('sand', t);
  return t;
}

export function wetSandTexture() {
  if (_cache.has('wetSand')) return _cache.get('wetSand');
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#b8a070';
  g.fillRect(0, 0, 128, 128);
  _noise(g, 128, '#b8a070', 30, 1000);
  _noise(g, 128, '#a89060', 25, 500);
  const t = _toTexture(c);
  _cache.set('wetSand', t);
  return t;
}

// ── Água ──────────────────────────────────────────────────
export function waterTexture() {
  if (_cache.has('water')) return _cache.get('water');
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#4a90b8';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.1})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 128;
    g.moveTo(0, y);
    g.bezierCurveTo(32, y + 5, 64, y - 5, 128, y);
    g.stroke();
  }
  const t = _toTexture(c);
  _cache.set('water', t);
  return t;
}

// ── Asfalto ───────────────────────────────────────────────
export function asphaltTexture() {
  if (_cache.has('asphalt')) return _cache.get('asphalt');
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#2a2a2a';
  g.fillRect(0, 0, 128, 128);
  _noise(g, 128, '#2a2a2a', 25, 1500);
  const t = _toTexture(c);
  _cache.set('asphalt', t);
  return t;
}

// ── Concreto ──────────────────────────────────────────────
export function concreteTexture() {
  if (_cache.has('concrete')) return _cache.get('concrete');
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#a8a8a8';
  g.fillRect(0, 0, 128, 128);
  _noise(g, 128, '#a8a8a8', 20, 1000);
  // Linhas de placa
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 64); g.lineTo(128, 64);
  g.moveTo(64, 0); g.lineTo(64, 128);
  g.stroke();
  const t = _toTexture(c);
  _cache.set('concrete', t);
  return t;
}

// ── Parede de casa ────────────────────────────────────────
export function houseWallTexture(hex) {
  const key = 'wall:' + hex;
  if (_cache.has(key)) return _cache.get(key);
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.fillRect(0, 0, 128, 128);
  _noise(g, 128, hex, 15, 600);
  // Tijolos sutis
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  g.lineWidth = 1;
  for (let y = 0; y < 128; y += 16) {
    g.beginPath();
    g.moveTo(0, y); g.lineTo(128, y);
    g.stroke();
    const off = (y / 16) % 2 === 0 ? 0 : 16;
    for (let x = off; x < 128; x += 32) {
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x, y + 16);
      g.stroke();
    }
  }
  const t = _toTexture(c);
  _cache.set(key, t);
  return t;
}

// ── Telhado ───────────────────────────────────────────────
export function roofTexture(hex) {
  const key = 'roof:' + hex;
  if (_cache.has(key)) return _cache.get(key);
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = hex;
  g.fillRect(0, 0, 128, 128);
  _noise(g, 128, hex, 20, 500);
  // Telhas
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 1;
  for (let y = 0; y < 128; y += 8) {
    g.beginPath();
    g.moveTo(0, y); g.lineTo(128, y);
    g.stroke();
  }
  const t = _toTexture(c);
  _cache.set(key, t);
  return t;
}

// ── Casca de árvore ───────────────────────────────────────
export function barkTexture() {
  if (_cache.has('bark')) return _cache.get('bark');
  const c = _canvas(128);
  const g = c.getContext('2d');
  g.fillStyle = '#5a3a20';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.2})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const x = Math.random() * 128;
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 5, 40, x - 5, 80, x + 2, 128);
    g.stroke();
  }
  const t = _toTexture(c);
  _cache.set('bark', t);
  return t;
}

export function clearTextureCache() {
  for (const t of _cache.values()) t.dispose?.();
  _cache.clear();
}
