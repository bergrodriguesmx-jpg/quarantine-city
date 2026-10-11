// ============================================================
// weapon-models.js
// Fonte única de verdade: constrói modelos 3D pra QUALQUER arma.
// Usado por: viewmodel-3d.js, pickup-3d.js, weapon-icon-renderer.js
// ============================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { geoBox, geoSphere, geoCyl, matL, matB } from '../core/geo-cache.js';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const roundedBoxCache = new Map();
function geoRoundBox(w, h, d, radius = 0.03, seg = 3) {
  const k = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${radius.toFixed(3)}`;
  let g = roundedBoxCache.get(k);
  if (!g) {
    const r = Math.min(radius, Math.min(w, h, d) * 0.45);
    const minDim = Math.min(w, h, d);
    g = minDim < 0.08 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
    roundedBoxCache.set(k, g);
  }
  return g;
}

const MAT = {
  metalDark:   matL(0x1A1A1A),
  metalMid:    matL(0x2C3E50),
  metalLight:  matL(0x7F8C8D),
  metalSteel:  matL(0xBDC3C7),
  metalShiny:  matL(0xE8E8E8),
  wood:        matL(0x5D4030),
  woodLight:   matL(0x8B5A2B),
  grip:        matL(0x1A1A1A),
  accent:      matL(0xCC0000),
  skin:        matL(0xD4A574),
  skinDark:    matL(0xC09065),
  blood:       matL(0x6B0000),
  black:       matB(0x000000),
  scytheBlack: matL(0x0A0A0A),
  scytheMid:   matL(0x2A2A2A),
  gold:        matL(0xFFCC00),
  ammoBox:     matL(0x3A3A2A),
  ammoBoxDark: matL(0x1A1A0A),
  bullet:      matL(0xC9A227),
};

// ------------------------------------------------------------
// Builders (cada um cria geometria nova dentro do group)
// ------------------------------------------------------------
function buildKnife(g) {
  const hand = new THREE.Group(); g.add(hand);
  const fa = new THREE.Mesh(geoCyl(0.045, 0.055, 0.38, 10), MAT.skin);
  fa.rotation.z = Math.PI/2; fa.rotation.y = -0.10; fa.position.set(0.22, -0.01, 0.14); hand.add(fa);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, 0, 0.02); hand.add(h);
  const kG = new THREE.Group(); kG.position.set(0, 0.02, 0.02); hand.add(kG);
  const handle = new THREE.Mesh(geoBox(0.05, 0.22, 0.05, 1), MAT.grip);
  handle.position.set(0, -0.04, 0.02); kG.add(handle);
  const blade = new THREE.Mesh(geoBox(0.048, 0.50, 0.014, 1), MAT.metalSteel);
  blade.position.set(0, 0.36, 0.02); kG.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), MAT.metalSteel);
  tip.rotation.y = Math.PI/4; tip.position.set(0, 0.63, 0.02); kG.add(tip);
}

function buildClub(g) {
  const hand = new THREE.Group(); g.add(hand);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, -0.06, 0.07); hand.add(h);
  const shaft = new THREE.Mesh(geoCyl(0.035, 0.045, 0.7, 6), MAT.wood);
  shaft.rotation.x = Math.PI/2; shaft.position.set(0, 0.02, -0.35); g.add(shaft);
  const head = new THREE.Mesh(geoRoundBox(0.09, 0.09, 0.15, 0.03), MAT.wood);
  head.position.set(0, 0.02, -0.72); g.add(head);
}

function buildPipe(g) {
  const hand = new THREE.Group(); g.add(hand);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, -0.06, 0.07); hand.add(h);
  const shaft = new THREE.Mesh(geoCyl(0.035, 0.045, 0.7, 6), MAT.metalMid);
  shaft.rotation.x = Math.PI/2; shaft.position.set(0, 0.02, -0.35); g.add(shaft);
}

function buildPipeWrench(g) {
  const hand = new THREE.Group(); g.add(hand);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, -0.06, 0.07); hand.add(h);
  const shaft = new THREE.Mesh(geoCyl(0.035, 0.045, 0.7, 6), MAT.metalMid);
  shaft.rotation.x = Math.PI/2; shaft.position.set(0, 0.02, -0.35); g.add(shaft);
  const jaw = new THREE.Mesh(geoBox(0.12, 0.05, 0.12, 1), MAT.metalMid);
  jaw.position.set(0, 0.02, -0.70); g.add(jaw);
}

function buildCleaver(g) {
  const hand = new THREE.Group(); g.add(hand);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, -0.06, 0.07); hand.add(h);
  const handle = new THREE.Mesh(geoRoundBox(0.05, 0.20, 0.05, 0.02), MAT.grip);
  handle.position.set(0, 0, 0.10); handle.rotation.x = -Math.PI/2.2; hand.add(handle);
  const blade = new THREE.Mesh(geoBox(0.22, 0.02, 0.45, 1), MAT.metalLight);
  blade.position.set(0, 0.02, -0.38); g.add(blade);
}

function buildKatana(g) {
  const hand = new THREE.Group(); g.add(hand);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, -0.06, 0.07); hand.add(h);
  const handle = new THREE.Mesh(geoRoundBox(0.05, 0.20, 0.05, 0.02), MAT.grip);
  handle.position.set(0, 0, 0.10); handle.rotation.x = -Math.PI/2.2; hand.add(handle);
  const blade = new THREE.Mesh(geoBox(0.055, 0.02, 0.9, 1), MAT.metalShiny);
  blade.position.set(0, 0.02, -0.60); g.add(blade);
}

function buildKukri(g) {
  const hand = new THREE.Group(); g.add(hand);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, -0.06, 0.07); hand.add(h);
  const handle = new THREE.Mesh(geoRoundBox(0.05, 0.20, 0.05, 0.02), MAT.grip);
  handle.position.set(0, 0, 0.10); handle.rotation.x = -Math.PI/2.2; hand.add(handle);
  const blade = new THREE.Mesh(geoBox(0.09, 0.02, 0.4, 1), MAT.metalLight);
  blade.position.set(0, 0.02, -0.35); g.add(blade);
}

function buildShovel(g) {
  const shaft = new THREE.Mesh(geoCyl(0.035, 0.045, 1.4, 6), MAT.wood);
  shaft.rotation.x = Math.PI/2; shaft.position.set(0, 0.02, -0.4); g.add(shaft);
  const blade = new THREE.Mesh(geoBox(0.28, 0.03, 0.32, 1), MAT.metalLight);
  blade.position.set(0, 0.02, -1.15); g.add(blade);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.skin);
  h.position.set(0, -0.06, 0.07); g.add(h);
}

function buildScythe(g) {
  const shaft = new THREE.Mesh(geoCyl(0.05, 0.06, 1.6, 6), MAT.scytheBlack);
  shaft.rotation.x = Math.PI/2; shaft.position.set(0, 0.02, -0.5); g.add(shaft);
  const bladeCurve = new THREE.Mesh(geoBox(0.06, 0.5, 0.06, 1), MAT.scytheMid);
  bladeCurve.rotation.z = -0.6; bladeCurve.position.set(0.2, 0.35, -1.28); g.add(bladeCurve);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), MAT.scytheBlack);
  h.position.set(0, -0.06, 0.07); g.add(h);
}

function buildPistol(g) {
  const s = new THREE.Mesh(geoBox(0.065, 0.09, 0.30, 1), MAT.metalMid); s.position.set(0, 0.06, -0.06); g.add(s);
  const gr = new THREE.Mesh(geoBox(0.055, 0.18, 0.08, 1), MAT.grip);
  gr.position.set(0, -0.07, 0.06); gr.rotation.x = 0.28; g.add(gr);
  const h = new THREE.Mesh(geoRoundBox(0.09, 0.11, 0.10, 0.02), MAT.skin); h.position.set(0, -0.06, 0.07); g.add(h);
  // cano
  const barrel = new THREE.Mesh(geoCyl(0.018, 0.018, 0.06, 6), MAT.metalDark);
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.06, -0.24); g.add(barrel);
}

function buildRevolver(g) {
  const b = new THREE.Mesh(geoCyl(0.018, 0.018, 0.24, 6), MAT.metalMid);
  b.rotation.x = Math.PI/2; b.position.set(0, 0.055, -0.16); g.add(b);
  const cy = new THREE.Mesh(geoCyl(0.045, 0.045, 0.10, 8), MAT.metalDark);
  cy.rotation.x = Math.PI/2; cy.position.set(0, 0.045, 0); g.add(cy);
  const gr = new THREE.Mesh(geoBox(0.05, 0.20, 0.09, 1), MAT.wood);
  gr.position.set(0, -0.08, 0.08); gr.rotation.x = 0.32; g.add(gr);
  const h = new THREE.Mesh(geoRoundBox(0.09, 0.11, 0.10, 0.02), MAT.skin); h.position.set(0, -0.07, 0.08); g.add(h);
}

function buildSMG(g) {
  const b = new THREE.Mesh(geoBox(0.07, 0.10, 0.36, 1), MAT.metalMid); b.position.set(0, 0.04, -0.06); g.add(b);
  const sh = new THREE.Mesh(geoCyl(0.025, 0.025, 0.12, 6), MAT.metalDark);
  sh.rotation.x = Math.PI/2; sh.position.set(0, 0.04, -0.30); g.add(sh);
  const mg = new THREE.Mesh(geoBox(0.035, 0.18, 0.06, 1), MAT.metalDark); mg.position.set(0, -0.10, 0.04); g.add(mg);
  const h = new THREE.Mesh(geoRoundBox(0.08, 0.11, 0.10, 0.02), MAT.skin); h.position.set(0, -0.06, 0.11); g.add(h);
  const stock = new THREE.Mesh(geoBox(0.05, 0.05, 0.10, 1), MAT.metalDark); stock.position.set(0, 0.04, 0.18); g.add(stock);
}

function buildRifle(g) {
  const b = new THREE.Mesh(geoBox(0.06, 0.09, 0.55, 1), MAT.metalMid); b.position.set(0, 0.035, -0.12); g.add(b);
  const bb = new THREE.Mesh(geoCyl(0.014, 0.014, 0.22, 6), MAT.metalDark);
  bb.rotation.x = Math.PI/2; bb.position.set(0, 0.035, -0.55); g.add(bb);
  const st = new THREE.Mesh(geoBox(0.055, 0.10, 0.20, 1), MAT.wood); st.position.set(0, 0.005, 0.24); g.add(st);
  const h = new THREE.Mesh(geoRoundBox(0.08, 0.11, 0.10, 0.02), MAT.skin); h.position.set(0, -0.06, 0.14); g.add(h);
  // magazine
  const mag = new THREE.Mesh(geoBox(0.035, 0.15, 0.08, 1), MAT.metalDark);
  mag.position.set(0, -0.09, 0.02); mag.rotation.x = 0.15; g.add(mag);
}

function buildShotgun(g) {
  const b1 = new THREE.Mesh(geoCyl(0.022, 0.022, 0.5, 6), MAT.metalDark);
  b1.rotation.x = Math.PI/2; b1.position.set(-0.022, 0.045, -0.24); g.add(b1);
  const b2 = new THREE.Mesh(geoCyl(0.022, 0.022, 0.5, 6), MAT.metalDark);
  b2.rotation.x = Math.PI/2; b2.position.set(0.022, 0.045, -0.24); g.add(b2);
  const st = new THREE.Mesh(geoBox(0.06, 0.11, 0.22, 1), MAT.wood); st.position.set(0, 0.01, 0.22); g.add(st);
  const h = new THREE.Mesh(geoRoundBox(0.08, 0.11, 0.10, 0.02), MAT.skin); h.position.set(0, -0.07, 0.12); g.add(h);
}

function buildLauncher(g) {
  const tu = new THREE.Mesh(geoCyl(0.07, 0.08, 0.75, 10), MAT.metalMid);
  tu.rotation.x = Math.PI/2; tu.position.set(0, 0.03, -0.12); g.add(tu);
  const mo = new THREE.Mesh(new THREE.CircleGeometry(0.062, 10), matB(0x000000));
  mo.rotation.y = Math.PI; mo.position.set(0, 0.03, -0.49); g.add(mo);
  const h = new THREE.Mesh(geoRoundBox(0.08, 0.12, 0.10, 0.02), MAT.skin); h.position.set(0, -0.10, 0.16); g.add(h);
  // scope
  const scope = new THREE.Mesh(geoCyl(0.04, 0.04, 0.15, 8), MAT.metalDark);
  scope.rotation.x = Math.PI/2; scope.position.set(0, 0.14, -0.05); g.add(scope);
}

const BUILDERS = {
  knife: buildKnife,
  woodenClub: buildClub,
  pipe: buildPipe,
  pipeWrench: buildPipeWrench,
  cleaver: buildCleaver,
  katana: buildKatana,
  kukri: buildKukri,
  shovel: buildShovel,
  reaperScythe: buildScythe,
  pistol: buildPistol,
  revolver: buildRevolver,
  smg: buildSMG,
  rifle: buildRifle,
  shotgun: buildShotgun,
  launcher: buildLauncher,
};

// ============================================================
// API PÚBLICA
// ============================================================

/** Cria um modelo 3D fresco de qualquer arma. */
export function buildWeaponModel(weaponId) {
  const g = new THREE.Group();
  const builder = BUILDERS[weaponId];
  if (builder) builder(g);
  g.userData.weaponId = weaponId;
  return g;
}

/** Tamanho no mundo (pickup) por arma. Ajuste pra ficar bonito no chão. */
export const WEAPON_WORLD_SIZE = {
  knife: 0.55, woodenClub: 0.9, pipe: 0.9, pipeWrench: 0.9,
  cleaver: 0.7, katana: 1.3, kukri: 0.7, shovel: 1.4,
  reaperScythe: 1.8,
  pistol: 0.55, revolver: 0.6, smg: 0.9, rifle: 1.2,
  shotgun: 1.1, launcher: 1.2,
};
export function getWeaponWorldSize(weaponId) {
  return WEAPON_WORLD_SIZE[weaponId] || 0.8;
}

/** Cor do glow do pickup por raridade (drop = roxo, normal = amarelo). */
export function getWeaponPickupColor(weaponId, isDrop) {
  if (isDrop) return 0xff00ff;
  return 0xffdd00;
}

// ------------------------------------------------------------
// Caixas de munição (pra loja)
// ------------------------------------------------------------
const AMMO_COLORS = {
  pistol:   { box: 0x4A4A2A, accent: 0xC9A227 },
  revolver: { box: 0x5A3A2A, accent: 0xC9A227 },
  smg:      { box: 0x3A4A2A, accent: 0x9ACD32 },
  rifle:    { box: 0x2A3A4A, accent: 0xFF8C00 },
  shotgun:  { box: 0x4A2A2A, accent: 0xFF4444 },
  launcher: { box: 0x3A2A3A, accent: 0xFF00FF },
};

export function buildAmmoBox(ammoType) {
  const g = new THREE.Group();
  const c = AMMO_COLORS[ammoType] || AMMO_COLORS.pistol;

  // Caixa base
  const box = new THREE.Mesh(geoRoundBox(0.5, 0.28, 0.35, 0.03), matL(c.box));
  box.castShadow = true;
  g.add(box);

  // Fita central
  const strap = new THREE.Mesh(geoBox(0.1, 0.30, 0.37, 1), matL(c.accent));
  g.add(strap);

  // 3 balas em cima
  for (let i = 0; i < 3; i++) {
    const bullet = new THREE.Mesh(geoCyl(0.03, 0.03, 0.12, 6), MAT.bullet);
    bullet.rotation.z = Math.PI/2;
    bullet.position.set(-0.14 + i*0.14, 0.20, 0);
    g.add(bullet);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 6), MAT.bullet);
    tip.rotation.z = -Math.PI/2;
    tip.position.set(-0.14 + i*0.14 + 0.09, 0.20, 0);
    g.add(tip);
  }

  return g;
}
