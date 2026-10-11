// ============================================================
// controls-ui.js
// Overlay de configuração: sensibilidade + rebind de teclas.
// ============================================================

import { SaveControls, Action, ACTION_ORDER, ACTION_LABELS, getControls, setControls } from './save-controls.js';

const IGNORE_CODES = new Set(['Escape', 'Tab', 'F5', 'F11', 'F12']);

let listening = null;

export class ControlsUI {
  constructor(dom, opts = {}) {
    this.dom = dom;
    this.onChange = opts.onChange || (() => {});
    this.controls = getControls();
    this._bind();
  }

  _bind() {
    const { openBtn, closeBtn, resetBtn, saveBtn } = this.dom;

    if (openBtn)  openBtn.addEventListener('click', () => this.open());
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (resetBtn) resetBtn.addEventListener('click', () => this._reset());
    if (saveBtn)  saveBtn.addEventListener('click', () => this._saveAndClose());

    if (this.dom.sensSlider) {
      this.dom.sensSlider.addEventListener('input', () => {
        const v = parseFloat(this.dom.sensSlider.value);
        this.controls.sensitivity = v;
        if (this.dom.sensValue) this.dom.sensValue.textContent = v.toFixed(2);
      });
    }

    window.addEventListener('keydown', e => this._onCaptureKey(e), true);
  }

  open() {
    this.controls = getControls();
    this.dom.overlay.classList.remove('hidden');
    this._render();
    if (document.exitPointerLock) document.exitPointerLock();
  }

  close() {
    this.dom.overlay.classList.add('hidden');
    listening = null;
    if (this.dom.hint) this.dom.hint.textContent = '';
    if (typeof this.onChange === 'function') this.onChange();
  }

  _saveAndClose() {
    setControls(this.controls);
    this.close();
  }

  _reset() {
    this.controls = SaveControls.reset();
    setControls(this.controls);
    this._render();
  }

  _render() {
    if (this.dom.sensSlider) this.dom.sensSlider.value = this.controls.sensitivity;
    if (this.dom.sensValue)  this.dom.sensValue.textContent = this.controls.sensitivity.toFixed(2);

    const list = this.dom.listEl;
    if (!list) return;
    list.innerHTML = '';

    ACTION_ORDER.forEach(action => {
      const code = this.controls.getKey(action);

      const row = document.createElement('div');
      row.className = 'ctrl-row';

      const label = document.createElement('span');
      label.className = 'ctrl-label';
      label.textContent = ACTION_LABELS[action] || action;

      const keyBtn = document.createElement('button');
      keyBtn.className = 'ctrl-key';
      keyBtn.dataset.action = action;
      keyBtn.textContent = listening === action ? '...' : prettyKey(code);
      keyBtn.addEventListener('click', () => {
        listening = action;
        if (this.dom.hint) this.dom.hint.textContent = `Pressione uma tecla para "${ACTION_LABELS[action]}"…`;
        this._render();
      });

      row.appendChild(label);
      row.appendChild(keyBtn);
      list.appendChild(row);
    });
  }

  _onCaptureKey(e) {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.code === 'Escape') {
      listening = null;
      if (this.dom.hint) this.dom.hint.textContent = 'Cancelado.';
      this._render();
      return;
    }

    if (IGNORE_CODES.has(e.code)) return;

    this.controls.setKey(listening, e.code);
    const action = listening;
    listening = null;
    if (this.dom.hint) this.dom.hint.textContent = `"${ACTION_LABELS[action]}" → ${prettyKey(e.code)}`;
    this._render();
  }
}

function prettyKey(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Arrow/, '')
    .replace('Left', ' Esq').replace('Right', ' Dir')
    .replace('Shift', 'Shift').replace('Control', 'Ctrl')
    .replace('Space', 'Espaço')
    .replace('Mouse0', 'Botão Esq').replace('Mouse1', 'Botão Dir');
}
