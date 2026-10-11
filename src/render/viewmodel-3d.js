// ============================================================
// viewmodel-3d.js
// Viewmodel 3D em primeira pessoa. Usa weapon-models.js (GLB ou procedural).
// ============================================================

import * as THREE from 'three';
import { buildWeaponModelSmart as buildWeaponModel } from './weapon-models.js';

export class Weapon3DView {
  constructor(camera, opts = {}) {
    this.camera = camera;
    this.weaponGroup = new THREE.Group();
    this.weaponGroup.position.set(0.32, -0.32, -0.6);
    this.weaponGroup.rotation.set(-0.15, -0.35, 0.15);
    camera.add(this.weaponGroup);

    this.currentViewModel = null;
    this.weaponId = null;

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

  setWeapon(weaponId) {
    if (this.currentViewModel) {
      this.weaponGroup.remove(this.currentViewModel);
      this.currentViewModel = null;
    }
    const g = buildWeaponModel(weaponId);
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

  swing() { this.swinging = true; this.swingProgress = 0; }
  recoil(amount = 1) { this.recoilT = 1; this.recoilAmt = amount; }
  reload(duration) {
    this.reloading = true;
    this.reloadStart = performance.now()/1000;
    this.reloadDuration = duration || 1.3;
  }
  cancelReload() { this.reloading = false; }

  update(dt, ctx = {}) {
    if (!this.currentViewModel) return;

    const aiming = !!ctx.aiming;
    const moving = !!ctx.moving;
    const bobTime = ctx.bobTime || 0;

    if (this.reloading) {
      const t = Math.min(1, (performance.now()/1000 - this.reloadStart) / this.reloadDuration);
      const dip = Math.sin(t * Math.PI);
      this.weaponGroup.position.set(0.32, -0.32 - dip * 0.25, -0.6);
      this.weaponGroup.rotation.set(-0.15 - dip * 0.9, -0.35, 0.15 + dip * 0.5);
      if (t >= 1) this.reloading = false;
      return;
    }

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

    let recoilZ = 0, recoilRX = 0;
    if (this.recoilT > 0) {
      this.recoilT = Math.max(0, this.recoilT - dt * 6);
      const r = this.recoilT * this.recoilAmt;
      recoilZ = r * 0.09;
      recoilRX = r * 0.18;
    }

    const targetSwayX = (ctx.mouseDX || 0) * 0.0006;
    const targetSwayY = (ctx.mouseDY || 0) * 0.0006;
    const sSway = Math.min(1, dt * 10);
    this.swayX += (targetSwayX - this.swayX) * sSway;
    this.swayY += (targetSwayY - this.swayY) * sSway;

    const tX = aiming ? 0.02 : 0.32;
    const tY = aiming ? -0.22 : -0.32;
    const tZ = aiming ? -0.45 : -0.6;
    const tRX = aiming ? -0.02 : -0.15;
    const tRY = aiming ? -0.05 : -0.35;
    const tRZ = aiming ? 0.02 : 0.15;

    const bob = (moving && !aiming) ? Math.sin(bobTime) * 0.015 : 0;
    const bobX = (moving && !aiming) ? Math.cos(bobTime * 0.5) * 0.010 : 0;
    const s = Math.min(1, dt * 14);

    this.weaponGroup.position.x += (tX + bobX - this.swayX - this.weaponGroup.position.x) * s;
    this.weaponGroup.position.y += (tY + bob - this.swayY - this.weaponGroup.position.y) * s;
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
  }
}
