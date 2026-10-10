// ============================================================
// sprite-view.js
// Porte fiel do SpriteView.cs do Zumbi Blocks 2.
// Faz layout DOM de um PNG (Sprite) num container.
// Suporta: escala por área, rotação 90°, alinhamento, tint.
// ============================================================

const MAX_AREA = 50000;
const MIN_AREA = 20000;

export const ALIGN = Object.freeze({
  LEFT: 0,
  CENTER: 1,
  RIGHT: 2,
  FIT_CONTENT: 3,
});

function inverseLerp(a, b, v) {
  if (a === b) return 0;
  return Math.max(0, Math.min(1, (v - a) / (b - a)));
}
function lerp(a, b, t) { return a + (b - a) * t; }

// Cache global de imagens por URL (evita flicker ao re-renderizar)
const imageCache = new Map();
function getImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  imageCache.set(url, img);
  return img;
}

// Tint via canvas offscreen (pra respeitar alfa do sprite)
const tintCanvas = document.createElement('canvas');
const tintCtx = tintCanvas.getContext('2d');
function tintedURL(url, color) {
  const src = getImage(url);
  if (!src.complete || src.naturalWidth === 0) return url; // fallback
  tintCanvas.width = src.naturalWidth;
  tintCanvas.height = src.naturalHeight;
  tintCtx.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
  tintCtx.drawImage(src, 0, 0);
  tintCtx.globalCompositeOperation = 'source-in';
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
  tintCtx.globalCompositeOperation = 'source-over';
  return tintCanvas.toDataURL();
}

export class SpriteView {
  /**
   * @param {HTMLElement} container - elemento DOM que define o espaço
   * @param {Object} [opts]
   * @param {number} [opts.defaultScaledown=1]
   * @param {number} [opts.minimumScaledown=0.75]
   * @param {number} [opts.alignment=ALIGN.CENTER]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.defaultScaledown = opts.defaultScaledown ?? 1;
    this.minimumScaledown = opts.minimumScaledown ?? 0.75;
    this.alignment = opts.alignment ?? ALIGN.CENTER;
    this._currentURL = null;
    this._currentColor = '#ffffff';
    this._currentSprite = null;

    // Container
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.style.overflow = 'hidden';

    // Imagem
    this.img = document.createElement('img');
    this.img.style.position = 'absolute';
    this.img.style.top = '50%';
    this.img.style.left = '50%';
    this.img.style.imageRendering = 'pixelated';
    this.img.style.pointerEvents = 'none';
    this.img.style.userSelect = 'none';
    this.img.style.willChange = 'transform, width, height';
    this.img.draggable = false;
    this.img.style.display = 'none';
    container.appendChild(this.img);

    // ResizeObserver pra refazer layout quando o container muda
    this._ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._layout());
      this._ro.observe(container);
    }
  }

  setAlpha(a) {
    this.img.style.opacity = String(a);
  }

  setAlignment(alignment) {
    this.alignment = alignment;
    this._layout();
  }

  clear() {
    this.img.style.display = 'none';
    this._currentSprite = null;
  }

  /**
   * @param {{url:string,width:number,height:number}|null} sprite
   * @param {string} [color='#ffffff']
   */
  show(sprite, color = '#ffffff') {
    if (!sprite || !sprite.url) { this.clear(); return; }

    this._currentSprite = sprite;
    this._currentColor = color;

    const url = (color && color !== '#ffffff')
      ? tintedURL(sprite.url, color)
      : sprite.url;

    if (this._currentURL !== url) {
      this.img.src = url;
      this._currentURL = url;
    }
    this.img.style.display = 'block';
    this._layout();
  }

  _layout() {
    const sprite = this._currentSprite;
    if (!sprite) return;

    const rect = this.container.getBoundingClientRect();
    const refW = Math.max(1, rect.width);
    const refH = Math.max(1, rect.height);

    const sw = sprite.width  / this.defaultScaledown;
    const sh = sprite.height / this.defaultScaledown;

    // --- Decisão de rotação (espelho do .cs) ---
    const rx = sw / refW;
    const ry = sh / refH;
    const maxR = Math.max(rx, ry);
    const minR = Math.max(Math.min(rx, ry), 1e-6);
    const ratio = maxR / minR;
    const spriteAspect = sh / Math.max(sw, 1e-6);
    const rotate = ratio > 3 && spriteAspect > 2;

    // --- FitSprite ---
    const flippedW = rotate ? sh : sw;
    const flippedH = rotate ? sw : sh;
    const fx = flippedW / refW;
    const fy = flippedH / refH;
    const fitDiv = Math.max(fx, fy, 1);
    const scaleDown = this._scaleDown(sw, sh);

    const finalW  = (sw / fitDiv) * scaleDown;
    const finalH  = (sh / fitDiv) * scaleDown;
    const layoutW = (flippedW / fitDiv) * scaleDown;
    const layoutH = (flippedH / fitDiv) * scaleDown;

    // --- AlignSprite ---
    let offsetX = 0;
    if (this.alignment === ALIGN.LEFT)  offsetX = -(refW - layoutW) * 0.5;
    if (this.alignment === ALIGN.RIGHT) offsetX =  (refW - layoutW) * 0.5;

    this.img.style.width  = finalW + 'px';
    this.img.style.height = finalH + 'px';
    this.img.style.transform =
      `translate(calc(-50% + ${offsetX}px), -50%) rotate(${rotate ? 90 : 0}deg)`;

    if (this.alignment === ALIGN.FIT_CONTENT) {
      this.container.style.width  = layoutW + 'px';
      this.container.style.height = layoutH + 'px';
    }
  }

  _scaleDown(w, h) {
    const area = w * h;
    const t = inverseLerp(MIN_AREA, MAX_AREA, area);
    return lerp(this.minimumScaledown, 1, t);
  }

  dispose() {
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this.img.parentNode) this.img.parentNode.removeChild(this.img);
  }
}
