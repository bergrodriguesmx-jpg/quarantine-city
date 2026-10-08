import * as THREE from 'three';

// ============================================================
// TEXTURAS PIXELADAS — estilo Zumbi Blocks 2
// 16x16, cores saturadas, NearestFilter (pixel nítido)
// ============================================================

function makeCanvas(size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Chão de grama verde-limão vibrante
export function grassTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7BC950';
  ctx.fillRect(0, 0, 16, 16);
  const colors = ['#8DD65A', '#6BB840', '#9EE86B', '#5AA835'];
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 2, 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(2, 2, 4, 4);
  ctx.fillRect(10, 10, 4, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Parede de tijolo vermelho-vivo
export function wallTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#C0392B';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#A93226';
  for (let y = 0; y < 16; y += 4) {
    const offset = (y / 4) % 2 === 0 ? 0 : 4;
    for (let x = -4; x < 16; x += 8) {
      ctx.fillRect(x + offset, y, 7, 3);
    }
  }
  ctx.strokeStyle = '#7B241C';
  ctx.lineWidth = 1;
  for (let y = 0; y <= 16; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(16, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Parede de casa (madeira laranja)
export function houseWallTexture(baseColor = '#D35400') {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = 0; y < 16; y += 3) {
    ctx.fillRect(0, y, 16, 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(Math.random() * 16, Math.random() * 16, 3, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Telhado vermelho
export function roofTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#E74C3C';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#C0392B';
  for (let y = 0; y < 16; y += 4) {
    for (let x = 0; x < 16; x += 8) {
      const offset = (y / 4) % 2 === 0 ? 0 : 4;
      ctx.fillRect(x + offset, y, 6, 3);
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 16; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(16, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Tronco de árvore
export function barkTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8B5A2B';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#6B4226';
  for (let x = 0; x < 16; x += 3) {
    ctx.fillRect(x, 0, 1, 16);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(Math.random() * 16, Math.random() * 16, 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Folhas verde-esmeralda
export function leafTexture() {
  const c = makeCanvas(16);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2ECC71';
  ctx.fillRect(0, 0, 16, 16);
  const colors = ['#27AE60', '#2ECC71', '#58D68D', '#1E8449'];
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// Céu com nuvens pixeladas
export function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  // Gradiente azul céu
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#4A90D9');
  grad.addColorStop(0.5, '#87CEEB');
  grad.addColorStop(1, '#B0E0E6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  // Nuvens pixeladas (blocos)
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.random() * 256 / 4) * 4;
    const y = Math.floor(Math.random() * 80 / 4) * 4;
    const w = 4 + Math.floor(Math.random() * 6) * 4;
    const h = 4 + Math.floor(Math.random() * 3) * 4;
    ctx.fillRect(x, y, w, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}
