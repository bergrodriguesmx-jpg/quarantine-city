// ============================================================
// viewmodel-sprite.js
// Viewmodel de arma em primeira pessoa usando sprite 2D.
// - Suporta sheets horizontais (frame 0 = idle, 1 = fire, 2 = reload)
// - Anima swing, reload, bob de andar, ADS
// - Substitui buildViewModel() + updateWeaponViewModel() de game.js
// ============================================================

import * as THREE from 'three';

const texCache = new Map();
const texLoader = new THREE.TextureLoader();

function loadTexture(url) {
  if (texCache.has(url)) return texCache.get(url);
  const tex = texLoader.load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  texCache.set(url, tex);
  return tex;
}

// Scratch (zero alloc por frame)
const _tmpVec = new THREE.Vector3();
const _tmpEuler = new THREE.Euler();

export class WeaponSpriteView {
  /**
   * @param {THREE.Camera} camera
   * @param {Object} [opts]
   * @param {number} [opts.baseScale=0.6]   altura do sprite em unidades-mundo
   * @param {THREE.Vector3} [opts.basePos]  posição base em relação à câmera
   * @param {THREE.Euler} [opts.baseRot]    rotação base
   */
  constructor(camera, opts = {}) {
    this.camera = camera;

    this.baseScale = opts.baseScale ?? 0.6;
    this.basePos = opts.basePos
      ? opts.basePos.clone()
      : new THREE.Vector3(0.30, -0.30, -0.55);
    this.baseRot = opts.baseRot
      ? opts.baseRot.clone()
      : new THREE.Euler(-0.12, -0.34, 0.14);

    // Anchor: onde o sprite "gruda" na tela. 0.5,0 = centro-baixo.
    this.anchorX = opts.anchorX ?? 0.5;
    this.anchorY = opts.anchorY ?? 0.0;

    // Grupo preso à câmera
    this.group = new THREE.Group();
    this.group.position.copy(this.basePos);
    this.group.rotation.copy(this.baseRot);
    this.group.renderOrder = 999;
    camera.add(this.group);

    // Material + mesh
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 999;
    this.group.add(this.mesh);

    // Estado
    this.weaponId = null;
    this.frameCount = 1;
    this.frameW = 1;
    this.frameH = 1;
    this.sheetW = 1;
    this.sheetH = 1;
    this._currentFrame = -1;

    // Animações
    this.swingT = 0;
    this.swinging = false;
    this.swingsLeft = 0;

    this.reloadT = 0;
    this.reloading = false;
    this.reloadDuration = 1.3;

    this.recoilT = 0;
    this.recoilAmt = 0;

    this.swayX = 0;
    this.swayY = 0;
  }

  // ============================================================
  // CONFIGURAÇÃO DE ARMA
  // ============================================================
  /**
   * @param {string} weaponId
   * @param {{url:string, frameW:number, frameH:number, sheetW:number, sheetH:number, frames:number}} sprite
   */
  setWeapon(weaponId, sprite) {
    this.weaponId = weaponId;

    const tex = loadTexture(sprite.url);
    this.mat.map = tex;
    this.mat.needsUpdate = true;

    this.sheetW = sprite.sheetW;
    this.sheetH = sprite.sheetH;
    this.frameW = sprite.frameW || sprite.sheetW;
    this.frameH = sprite.frameH || sprite.sheetH;
    this.frameCount = sprite.frames || 1;

    // UV repeat/offset — recorta o frame 0
    tex.repeat.set(this.frameW / this.sheetW, this.frameH / this.sheetH);
    tex.offset.set(0, 0);

    // Aspect e geometria
    const aspect = this.frameW / this.frameH;
    const h = this.baseScale;
    const w = h * aspect;

    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(w, h);

    // Reposiciona o mesh dentro do grupo pra que a âncora fique certa
    this.mesh.position.set(
      w * (0.5 - this.anchorX),
      h * (0.5 - this.anchorY),
      0
    );

    this._currentFrame = 0;
    this._applyFrame(0);
    this._resetTransforms();
  }

  _applyFrame(frame) {
    if (frame === this._currentFrame) return;
    if (frame < 0 || frame >= this.frameCount) return;
    this._currentFrame = frame;
    const cols = Math.max(1, Math.round(this.sheetW / this.frameW));
    const col = frame % cols;
    const row = Math.floor(frame / cols);
    this.mat.map.offset.set(
      (col * this.frameW) / this.sheetW,
      1 - ((row + 1) * this.frameH) / this.sheetH
    );
  }

  _resetTransforms() {
    this.group.position.copy(this.basePos);
    this.group.rotation.copy(this.baseRot);
    this.swinging = false;
    this.swingT = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.recoilT = 0;
    this.recoilAmt = 0;
  }

  // ============================================================
  // GATILHOS
  // ============================================================
  swing() {
    this.swinging = true;
    this.swingT = 0;
    this._applyFrame(1 % this.frameCount);
  }

  recoil(amount = 1) {
    this.recoilT = 1;
    this.recoilAmt = amount;
    if (this.frameCount > 1) {
      this._applyFrame(1);
      this._frameHoldT = 0.06;
    }
  }

  reload(duration) {
    this.reloading = true;
    this.reloadT = 0;
    this.reloadDuration = duration || 1.3;
    if (this.frameCount > 2) this._applyFrame(2);
  }

  cancelReload() {
    this.reloading = false;
    this.reloadT = 0;
    this._applyFrame(0);
  }

  // ============================================================
  // UPDATE
  // ============================================================
  /**
   * @param {number} dt
   * @param {Object} ctx
   * @param {boolean} [ctx.aiming]
   * @param {boolean} [ctx.moving]
   * @param {number}  [ctx.bobTime]
   * @param {number}  [ctx.mouseDX]  - movimento lateral do mouse (pra sway)
   * @param {number}  [ctx.mouseDY]
   */
  update(dt, ctx = {}) {
    if (!this.mat.map) return;

    const aiming = !!ctx.aiming;
    const moving = !!ctx.moving;
    const bobTime = ctx.bobTime || 0;

    // Frame hold (após recoil)
    if (this._frameHoldT > 0) {
      this._frameHoldT -= dt;
      if (this._frameHoldT <= 0) this._applyFrame(0);
    }

    // ---------- RELOAD ----------
    if (this.reloading) {
      this.reloadT += dt;
      const t = Math.min(1, this.reloadT / this.reloadDuration);
      const dip = Math.sin(t * Math.PI);

      this.group.position.set(
        this.basePos.x,
        this.basePos.y - dip * 0.28,
        this.basePos.z
      );
      this.group.rotation.set(
        this.baseRot.x - dip * 0.95,
        this.baseRot.y,
        this.baseRot.z + dip * 0.55
      );

      if (t >= 1) {
        this.reloading = false;
        this._applyFrame(0);
      }
      return;
    }

    // ---------- SWING ----------
    if (this.swinging) {
      this.swingT += dt * 4.2;
      if (this.swingT >= 1) {
        this.swinging = false;
        this.swingT = 0;
        this._applyFrame(0);
      } else {
        const t = this.swingT;
        let x, y, z, rx, ry, rz;
        if (t < 0.25) {
          const p = t / 0.25, e = p * p;
          x  = this.basePos.x + e * 0.16;
          y  = this.basePos.y + e * 0.16;
          z  = this.basePos.z + e * 0.12;
          rx = this.baseRot.x - e * 0.65;
          ry = this.baseRot.y - e * 0.42;
          rz = this.baseRot.z + e * 0.95;
        } else {
          const p = (t - 0.25) / 0.75, e = 1 - Math.pow(1 - p, 3);
          x  = this.basePos.x + 0.16 - e * 0.58;
          y  = this.basePos.y + 0.16 - e * 0.28;
          z  = this.basePos.z + 0.12 - e * 0.28;
          rx = this.baseRot.x - 0.65 + e * 1.65;
          ry = this.baseRot.y - 0.42 + e * 1.95;
          rz = this.baseRot.z + 0.95 - e * 2.25;
        }
        this.group.position.set(x, y, z);
        this.group.rotation.set(rx, ry, rz);
      }
      return;
    }

    // ---------- RECOIL (ranged) ----------
    let recoilZ = 0, recoilRX = 0;
    if (this.recoilT > 0) {
      this.recoilT = Math.max(0, this.recoilT - dt * 6);
      const r = this.recoilT * this.recoilAmt;
      recoilZ  = r * 0.09;
      recoilRX = r * 0.18;
    }

    // ---------- SWAY (mouse) ----------
    const targetSwayX = (ctx.mouseDX || 0) * 0.0006;
    const targetSwayY = (ctx.mouseDY || 0) * 0.0006;
    const sSway = Math.min(1, dt * 10);
    this.swayX += (targetSwayX - this.swayX) * sSway;
    this.swayY += (targetSwayY - this.swayY) * sSway;

    // ---------- IDLE / ADS ----------
    const tX  = aiming ? 0.00 : this.basePos.x;
    const tY  = aiming ? -0.20 : this.basePos.y;
    const tZ  = aiming ? -0.42 : this.basePos.z;
    const tRX = aiming ? -0.02 : this.baseRot.x;
    const tRY = aiming ? -0.06 : this.baseRot.y;
    const tRZ = aiming ?  0.02 : this.baseRot.z;

    const bob  = (moving && !aiming) ? Math.sin(bobTime) * 0.016 : 0;
    const bobX = (moving && !aiming) ? Math.cos(bobTime * 0.5) * 0.010 : 0;

    const s = Math.min(1, dt * 14);

    this.group.position.x += (tX + bobX - this.swayX - this.group.position.x) * s;
    this.group.position.y += (tY + bob  - this.swayY - this.group.position.y) * s;
    this.group.position.z += (tZ + recoilZ - this.group.position.z) * s;

    this.group.rotation.x += (tRX + recoilRX - this.group.rotation.x) * s;
    this.group.rotation.y += (tRY - this.swayX * 0.5 - this.group.rotation.y) * s;
    this.group.rotation.z += (tRZ - this.group.rotation.z) * s;
  }

  // ============================================================
  // VISIBILIDADE / LIMPEZA
  // ============================================================
  setVisible(v) { this.group.visible = !!v; }

  dispose() {
    this.camera.remove(this.group);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
