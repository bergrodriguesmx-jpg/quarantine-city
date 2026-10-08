import * as THREE from 'three';

function makeCanvas(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Chão de grama com variação
export function grassTexture() {
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a7c3a';
  ctx.fillRect(0, 0, 64, 64);
  const colors = ['#5a8c4a', '#3d6b30', '#66a055', '#427236'];
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 2, 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(8, 8, 16, 16);
  ctx.fillRect(40, 40, 16, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Parede de tijolos
export function wallTexture() {
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#555';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#666';
  for (let y = 0; y < 64; y += 16) {
    const offset = (y / 16) % 2 === 0 ? 0 : 16;
    for (let x = -16; x < 64; x += 32) {
      ctx.fillRect(x + offset, y, 30, 14);
    }
  }
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  for (let y = 0; y <= 64; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Parede de casa (tábuas)
export function houseWallTexture(baseColor = '#8b6f47') {
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < 64; y += 8) {
    ctx.fillRect(0, y, 64, 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 30; i++) {
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 4, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Telhado
export function roofTexture() {
  const c = makeCanvas(64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a2f2f';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#8b3a3a';
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 16) {
      const offset = (y / 8) % 2 === 0 ? 0 : 8;
      ctx.fillRect(x + offset, y, 14, 6);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 64; y += 8) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(64, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Céu com nuvens
export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0a1a2c');
  grad.addColorStop(0.35, '#2a4a6c');
  grad.addColorStop(0.75, '#7a9ab8');
  grad.addColorStop(1, '#b8c8d8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 300;
    const w = 40 + Math.random() * 100;
    const h = 12 + Math.random() * 25;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
