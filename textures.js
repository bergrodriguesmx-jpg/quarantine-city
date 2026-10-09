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
  return tex;
}

export function grassTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7BC950';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#6BB840';
  ctx.fillRect(3, 3, 2, 2);
  ctx.fillRect(10, 8, 2, 2);
  ctx.fillRect(5, 12, 2, 2);
  ctx.fillStyle = '#8DD65A';
  ctx.fillRect(12, 3, 2, 2);
  ctx.fillRect(7, 6, 2, 2);
  return makeTex(c);
}

export function asphaltTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4A4A4A';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#3E3E3E';
  ctx.fillRect(2, 5, 3, 1);
  ctx.fillRect(9, 11, 3, 1);
  ctx.fillRect(11, 3, 2, 1);
  return makeTex(c);
}

export function houseWallTexture(color = '#ECF0F1') {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(15, 0, 1, 16);
  return makeTex(c);
}

export function roofTexture(color = '#C0392B') {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < 16; y += 4) {
    ctx.fillRect(0, y, 16, 1);
  }
  return makeTex(c);
}

export function barkTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7D5A3C';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#5D4030';
  ctx.fillRect(4, 0, 1, 16);
  ctx.fillRect(10, 0, 1, 16);
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
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  function cloud(cx, cy, w, h) {
    ctx.fillRect(cx, cy, w, h);
    ctx.fillRect(cx - 8, cy + 6, w + 16, h - 6);
    ctx.fillRect(cx + 10, cy - 6, w - 20, h + 6);
  }
  cloud(60, 70, 40, 20);
  cloud(180, 50, 60, 24);
  cloud(310, 80, 50, 22);
  cloud(430, 60, 45, 20);
  cloud(120, 130, 55, 20);
  cloud(280, 140, 40, 18);
  cloud(400, 120, 55, 22);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function zombieHeadTexture(skinColorHex, isDead = false) {
  const c = makeCanvas(32);
  const ctx = c.getContext('2d');
  ctx.fillStyle = skinColorHex;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 30, 32, 2);
  ctx.fillRect(30, 0, 2, 32);
  ctx.fillRect(0, 0, 2, 32);
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(4, 6, 3, 2);
  ctx.fillRect(24, 20, 3, 2);
  ctx.fillRect(8, 24, 2, 3);
  ctx.fillStyle = '#C0392B';
  ctx.fillRect(20, 4, 5, 3);
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(22, 6, 2, 1);
  if (isDead) {
    ctx.fillStyle = '#000';
    ctx.fillRect(5, 13, 7, 1);
    ctx.fillRect(5, 14, 1, 1);
    ctx.fillRect(11, 14, 1, 1);
    ctx.fillRect(20, 13, 7, 1);
    ctx.fillRect(20, 14, 1, 1);
    ctx.fillRect(26, 14, 1, 1);
    ctx.fillStyle = 'rgba(80,0,0,0.35)';
    ctx.fillRect(5, 15, 7, 1);
    ctx.fillRect(20, 15, 7, 1);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(5, 11, 7, 5);
    ctx.fillRect(20, 11, 7, 5);
    ctx.fillStyle = '#FFF';
    ctx.fillRect(6, 12, 1, 1);
    ctx.fillRect(21, 12, 1, 1);
    ctx.fillStyle = 'rgba(139,0,0,0.5)';
    ctx.fillRect(4, 10, 9, 1);
    ctx.fillRect(19, 10, 9, 1);
  }
  if (isDead) {
    ctx.fillStyle = '#2B0000';
    ctx.fillRect(10, 21, 12, 6);
    ctx.fillStyle = '#7A0A0A';
    ctx.fillRect(11, 23, 10, 3);
    ctx.fillStyle = '#E8E0D0';
    ctx.fillRect(11, 21, 1, 2);
    ctx.fillRect(14, 21, 1, 2);
    ctx.fillRect(17, 21, 1, 2);
    ctx.fillRect(20, 21, 1, 2);
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(21, 27, 1, 3);
  } else {
    ctx.fillStyle = '#5A0000';
    ctx.fillRect(11, 22, 10, 2);
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(21, 23, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
