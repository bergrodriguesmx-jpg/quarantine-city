// ============================================================
// shop-sprite.js
// Helper pra inserir sprites em elementos DOM da loja/HUD.
// ============================================================

import { SpriteView, ALIGN } from '../core/sprite-view.js';

/**
 * Cria um container quadrado com SpriteView dentro.
 * @param {Object} sprite  - {url,width,height}
 * @param {Object} [opts]
 * @param {number} [opts.size=64]
 * @param {string} [opts.color='#ffffff']
 * @param {string} [opts.background='transparent']
 * @returns {HTMLElement}
 */
export function makeSpriteIcon(sprite, opts = {}) {
  const size = opts.size ?? 64;
  const el = document.createElement('div');
  el.className = 'sprite-icon';
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  el.style.position = 'relative';
  el.style.display = 'inline-block';
  el.style.background = opts.background ?? 'transparent';

  const view = new SpriteView(el, { alignment: ALIGN.CENTER });
  view.show(sprite, opts.color ?? '#ffffff');
  el._spriteView = view;
  return el;
}

/**
 * Atualiza um ícone existente (troca sprite/cor).
 */
export function updateSpriteIcon(el, sprite, color = '#ffffff') {
  if (!el || !el._spriteView) return;
  el._spriteView.show(sprite, color);
}
