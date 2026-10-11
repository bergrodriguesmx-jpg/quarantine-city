// ============================================================
// viewmodel-3d.js
// Viewmodel 3D procedural — mesma interface do WeaponSpriteView.
// Substitui sprites 2D por geometrias 3D (cilindros/caixas).
// ============================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { geoBox, geoSphere, geoCyl, matL, matB } from '../core/geo-cache.js';

// ------------------------------------------------------------
// Cache de rounded boxes (mesma lógica do game.js)
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

// ------------------------------------------------------------
// Materiais compartilhados
// ------------------------------------------------------------
const MAT = {
  metalDark:  matL(0x1A1A1A),
  metalMid:   matL(0x2C3E50),
  metalLight: matL(0x7F8C8D),
  metalSteel: matL(0xBDC3C7),
  wood:       matL(0x5D4030),
  woodLight:  matL(0x8B5A2B),
  grip:       matL(0x1A1A1A),
  accent:     matL(0xCC0000),
  skin:       matL(0xD4A574),
  skinDark:   matL(0xC09065),
  nail:       matL(0xE8C8A0),
  blood:      matL(0x6B0000),
  black:      matB(0x000000),
  scytheBlack:matL(0x0A0A0A),
  scytheMid:  matL(0x2A2A2A),
};

// ------------------------------------------------------------
// Construtores de cada arma
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
  const blade = new THREE.Mesh(geoBox(0.055, 0.02, 0.9, 1), MAT.metalSteel);
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
  const shaft = new THREE.Mesh(geoCyl(0.05, 0.06, 1.6, 6), matL(0x1A1A1A));
  shaft.rotation.x = Math.PI/2; shaft.position.set(0, 0.02, -0.5); g.add(shaft);
  const bladeCurve = new THREE.Mesh(geoBox(0.06, 0.5, 0.06, 1), matL(0x2A2A2A));
  bladeCurve.rotation.z = -0.6; bladeCurve.position.set(0.2, 0.35, -1.28); g.add(bladeCurve);
  const h = new THREE.Mesh(geoRoundBox(0.10, 0.11, 0.13, 0.025), matL(0x0A0A0A));
  h.position.set(0, -0.06, 0.07); g.add(h);
}

function buildPistol(g) {
  const s = new THREE.Mesh(geoBox(0.065, 0.09, 0.30, 1), MAT.metalMid); s.position.set(0, 0.06, -0.06); g.add(s);
  const gr = new THREE.Mesh(geoBox(0.055, 0.18, 0.08, 1), MAT.grip);
  gr.position.set(0, -0.07, 0.06); gr.rotation.x = 0.28; g.add(gr);
  const h = new THREE.Mesh(geoRoundBox(0.09, 0.11, 0.10, 0.02), MAT.skin); h.position.set(0, -0.06, 0.07); g.add(h);
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
}

function buildRifle(g) {
  const b = new THREE.Mesh(geoBox(0.06, 0.09, 0.55, 1), MAT.metalMid); b.position.set(0, 0.035, -0.12); g.add(b);
  const bb = new THREE.Mesh(geoCyl(0.014, 0.014, 0.22, 6), MAT.metalDark);
  bb.rotation.x = Math.PI/2; bb.position.set(0, 0.035, -0.55); g.add(bb);
  const st = new THREE.Mesh(geoBox(0.055, 0.10, 0.20, 1), MAT.wood); st.position.set(0, 0.005, 0.24); g.add(st);
  const h = new THREE.Mesh(geoRoundBox(0.08, 0.11, 0.10, 0.02), MAT.skin); h.position.set(0, -0.06, 0.14); g.add(h);
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
}

// ------------------------------------------------------------
// Construtor por ID
// ------------------------------------------------------------
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
// CLASSE PRINCIPAL — mesma interface do WeaponSpriteView
// ============================================================
export class Weapon3DView {
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.weaponGroup = new THREE.Group();
    this.weaponGroup.position.set(0.32, -0.32, -0.6);
    this.weaponGroup.rotation.set(-0.15, -0.35, 0.15);
    camera.add(this.weaponGroup);

    this.currentViewModel = null;
    this.weaponId = null;

    // Animação
    this.swinging = false;
    this.swingProgress = 0;
    this.reloading = false;
    this.reloadStart = 0;
    this.reloadDuration = 0;
    this.recoilT = 0;
    this.recoilAmt = 0;
    this.swayX = 0;
    this.swayY = 0;
    this._visible = true;
  }

  setWeapon(weaponId, _sprite) {
    if (this.currentViewModel) {
      this.weaponGroup.remove(this.currentViewModel);
      this.currentViewModel = null;
    }
    const g = new THREE.Group();
    const builder = BUILDERS[weaponId];
    if (builder) builder(g);
    this.weaponGroup.add(g);
    this.currentViewModel = g;
    this.weaponId = weaponId;
    this._resetTransforms();
  }

  _resetTransforms() {
    this.weaponGroup.position.set(0.32, -0.32, -0.6);
    this.weaponGroup.rotation.set(-0.15, -0.35, 0.15);
    this.swinging = false;
    this.swingProgress = 0;
    this.reloading = false;
    this.recoilT = 0;
    this.recoilAmt = 0;
  }

  swing() {
    this.swinging = true;
    this.swingProgress = 0;
  }

  recoil(amount = 1) {
    this.recoilT = 1;
    this.recoilAmt = amount;
  }

  reload(duration) {
    this.reloading = true;
    this.reloadStart = performance.now()/1000;
    this.reloadDuration = duration || 1.3;
  }

  cancelReload() {
    this.reloading = false;
  }

  update(dt, ctx = {}) {
    if (!this.currentViewModel) return;

    const aiming = !!ctx.aiming;
    const moving = !!ctx.moving;
    const bobTime = ctx.bobTime || 0;

    // ---------- RELOAD ----------
    if (this.reloading) {
      const t = Math.min(1, (performance.now()/1000 - this.reloadStart) / this.reloadDuration);
      const dip = Math.sin(t * Math.PI);
      this.weaponGroup.position.set(0.32, -0.32 - dip * 0.25, -0.6);
      this.weaponGroup.rotation.set(-0.15 - dip * 0.9, -0.35, 0.15 + dip * 0.5);
      if (t >= 1) this.reloading = false;
      return;
    }

    // ---------- SWING ----------
    if (this.swinging) {
      this.swingProgress += dt * 4.2;
      if (this.swingProgress >= 1) {
        this.swinging = false;
        this.swingProgress = 0;
      } else {
        const t = this.swingProgress;
        let arcX, arcY, arcZ, posX, posY, posZ;
        if (t < 0.25) {
          const p = t / 0.25, ease = p * p;
          arcX = -0.15 - ease * 0.6; arcY = -0.35 - ease * 0.4; arcZ = 0.15 + ease * 0.9;
          posX = 0.32 + ease * 0.15; posY = -0.32 + ease * 0.15; posZ = -0.6 + ease * 0.1;
        } else {
          const p = (t - 0.25) / 0.75, ease = 1 - Math.pow(1 - p, 3);
          arcX = -0.75 + ease * 1.6; arcY = -0.75 + ease * 1.9; arcZ = 1.05 - ease * 2.2;
          posX = 0.47 - ease * 0.65; posY = -0.17 - ease * 0.25; posZ = -0.5 - ease * 0.25;
        }
        this.weaponGroup.position.set(posX, posY, posZ);
        this.weaponGroup.rotation.set(arcX, arcY, arcZ);
      }
      return;
    }

    // ---------- RECOIL ----------
    let recoilZ = 0, recoilRX = 0;
    if (this.recoilT > 0) {
      this.recoilT = Math.max(0, this.recoilT - dt * 6);
      const r = this.recoilT * this.recoilAmt;
      recoilZ = r * 0.09;
      recoilRX = r * 0.18;
    }

    // ---------- SWAY ----------
    const targetSwayX = (ctx.mouseDX || 0) * 0.0006;
    const targetSwayY = (ctx.mouseDY || 0) * 0.0006;
    const sSway = Math.min(1, dt * 10);
    this.swayX += (targetSwayX - this.swayX) * sSway;
    this.swayY += (targetSwayY - this.swayY) * sSway;

    // ---------- IDLE / ADS ----------
    const tX = aiming ? 0.02 : 0.32;
    const tY = aiming ? -0.22 : -0.32;
    const tZ = aiming ? -0.45 : -0.6;
    const tRX = aiming ? -0.02 : -0.15;
    const tRY = aiming ? -0.05 : -0.35;
    const tRZ = aiming ? 0.02 : 0.15;

    const bob  = (moving && !aiming) ? Math.sin(bobTime) * 0.015 : 0;
    const bobX = (moving && !aiming) ? Math.cos(bobTime * 0.5) * 0.010 : 0;
    const s = Math.min(1, dt * 14);

    this.weaponGroup.position.x += (tX + bobX - this.swayX - this.weaponGroup.position.x) * s;
    this.weaponGroup.position.y += (tY + bob  - this.swayY - this.weaponGroup.position.y) * s;
    this.weaponGroup.position.z += (tZ + recoilZ - this.weaponGroup.position.z) * s;
    this.weaponGroup.rotation.x += (tRX + recoilRX - this.weaponGroup.rotation.x) * s;
    this.weaponGroup.rotation.y += (tRY - this.swayX * 0.5 - this.weaponGroup.rotation.y) * s;
    this.weaponGroup.rotation.z += (tRZ - this.weaponGroup.rotation.z) * s;
  }

  setVisible(v) {
    this._visible = !!v;
    this.weaponGroup.visible = this._visible;
  }

  dispose() {
    this.camera.remove(this.weaponGroup);
    this.weaponGroup.traverse(c => {
      if (c.geometry && !roundedBoxCache.has(c.geometry)) c.geometry.dispose();
    });
  }
}
