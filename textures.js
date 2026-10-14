// ============================================================
// textures.js — v4 "ZB2 Island"
// Adiciona: sandTexture, waterTexture, beachBlendTexture
// ============================================================

import * as THREE from 'three';

function makeCanvas(size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function makeTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function grassTexture() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#7BC950'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#6BB840'; ctx.fillRect(3, 3, 2, 2); ctx.fillRect(10, 8, 2, 2); ctx.fillRect(5, 12, 2, 2);
  ctx.fillStyle = '#8DD65A'; ctx.fillRect(12, 3, 2, 2); ctx.fillRect(7, 6, 2, 2);
  return makeTex(c);
}

export function grassTexture2() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#6BB840'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#5A9E35'; ctx.fillRect(2, 2, 4, 4); ctx.fillRect(10, 10, 3, 3);
  ctx.fillStyle = '#8DD65A'; ctx.fillRect(6, 4, 2, 2); ctx.fillRect(12, 6, 2, 2);
  ctx.fillStyle = '#7D5A3C'; ctx.fillRect(11, 2, 4, 3);
  return makeTex(c);
}

export function dirtTexture() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#7D5A3C'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#5D4030'; ctx.fillRect(2, 4, 4, 3); ctx.fillRect(9, 9, 3, 3);
  ctx.fillStyle = '#8B6A48'; ctx.fillRect(6, 2, 2, 2);
  return makeTex(c);
}

export function concreteTexture() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#9A9A9A'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#8A8A8A'; ctx.fillRect(0, 7, 16, 1); ctx.fillRect(7, 0, 1, 16);
  ctx.fillStyle = '#B0B0B0'; ctx.fillRect(2, 2, 3, 3); ctx.fillRect(10, 11, 3, 2);
  return makeTex(c);
}

export function asphaltTexture() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#4A4A4A'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#3E3E3E'; ctx.fillRect(2, 5, 3, 1); ctx.fillRect(9, 11, 3, 1); ctx.fillRect(11, 3, 2, 1);
  return makeTex(c);
}

export function houseWallTexture(color = '#ECF0F1') {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, 15, 16, 1); ctx.fillRect(15, 0, 1, 16);
  return makeTex(c);
}

export function roofTexture(color = '#C0392B') {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
  return makeTex(c);
}

export function barkTexture() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#7D5A3C'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#5D4030'; ctx.fillRect(4, 0, 1, 16); ctx.fillRect(10, 0, 1, 16);
  return makeTex(c);
}

// ─── NOVOS: ZB2 Island ─────────────────────────────────────
export function sandTexture() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#E4D5A8'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#D4C598'; ctx.fillRect(2, 3, 2, 2); ctx.fillRect(9, 8, 3, 2);
  ctx.fillRect(5, 12, 2, 2); ctx.fillRect(11, 2, 1, 3);
  ctx.fillStyle = '#F0E4B8'; ctx.fillRect(7, 5, 1, 1); ctx.fillRect(13, 13, 1, 1);
  return makeTex(c);
}

export function wetSandTexture() {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#B8A882'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#A89870'; ctx.fillRect(3, 4, 3, 2); ctx.fillRect(10, 9, 2, 3);
  ctx.fillStyle = '#C8B892'; ctx.fillRect(6, 2, 2, 2); ctx.fillRect(12, 12, 2, 2);
  return makeTex(c);
}

export function waterTexture() {
  const c = makeCanvas(32); const ctx = c.getContext('2d');
  ctx.fillStyle = '#3C7DB8'; ctx.fillRect(0, 0, 32, 32);
  // Ondulações sutis
  ctx.fillStyle = 'rgba(60,130,190,0.55)';
  ctx.fillRect(2, 4, 8, 2); ctx.fillRect(18, 10, 10, 2);
  ctx.fillRect(6, 18, 12, 2); ctx.fillRect(22, 26, 8, 2);
  ctx.fillStyle = 'rgba(120,180,220,0.35)';
  ctx.fillRect(4, 8, 6, 1); ctx.fillRect(20, 22, 8, 1);
  return makeTex(c);
}

export function beachBlendTexture() {
  // Transição entre areia e grama
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = '#C8BE8E'; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#9CB565'; ctx.fillRect(0, 0, 16, 8);
  ctx.fillStyle = 'rgba(200,190,142,0.5)';
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(Math.random() * 16);
    const y = 6 + Math.floor(Math.random() * 4);
    ctx.fillRect(x, y, 1, 1);
  }
  return makeTex(c);
}

export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3D7BD9');
  grad.addColorStop(0.5, '#7FB8E8');
  grad.addColorStop(0.85, '#C5E0F5');
  grad.addColorStop(1, '#E8F2FA');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  function cloud(cx, cy, w, h) {
    ctx.fillRect(cx, cy, w, h);
    ctx.fillRect(cx - 8, cy + 6, w + 16, h - 6);
    ctx.fillRect(cx + 10, cy - 6, w - 20, h + 6);
  }
  cloud(60, 70, 40, 20); cloud(180, 50, 60, 24); cloud(310, 80, 50, 22);
  cloud(430, 60, 45, 20); cloud(120, 130, 55, 20); cloud(280, 140, 40, 18);
  cloud(400, 120, 55, 22);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function zombieSkinTexture(skinColorHex) {
  const c = makeCanvas(16); const ctx = c.getContext('2d');
  ctx.fillStyle = skinColorHex; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(2, 3, 2, 1); ctx.fillRect(11, 8, 2, 1); ctx.fillRect(5, 12, 1, 2);
  ctx.fillStyle = '#8B0000'; ctx.fillRect(9, 4, 2, 1);
  return makeTex(c);
}
