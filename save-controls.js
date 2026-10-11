// ============================================================
// save-controls.js
// Porte de SaveControls.cs (Unity) para JS.
// Guarda sensitivity + keyBinds, aplica refControls com
// validação de tamanho, persiste em localStorage.
// ============================================================

export const Action = Object.freeze({
  MoveForward:  'MoveForward',
  MoveBackward: 'MoveBackward',
  MoveLeft:     'MoveLeft',
  MoveRight:    'MoveRight',
  Jump:         'Jump',
  Sprint:       'Sprint',
  Crouch:       'Crouch',
  Interact:     'Interact',
  Reload:       'Reload',
  Ping:         'Ping',
  Mute:         'Mute',
  Pause:        'Pause',
  Scoreboard:   'Scoreboard',
  Slot1:        'Slot1',
  Slot2:        'Slot2',
  Slot3:        'Slot3',
  Slot4:        'Slot4',
  Dodge:        'Dodge',
  Attack:       'Attack',
  Aim:          'Aim',
});

export const ACTION_ORDER = [
  Action.MoveForward, Action.MoveBackward, Action.MoveLeft, Action.MoveRight,
  Action.Jump, Action.Sprint, Action.Crouch, Action.Interact,
  Action.Reload, Action.Ping, Action.Mute, Action.Pause,
  Action.Scoreboard, Action.Slot1, Action.Slot2, Action.Slot3, Action.Slot4,
  Action.Dodge,
];

export const ACTION_LABELS = {
  MoveForward:  'Frente',
  MoveBackward: 'Trás',
  MoveLeft:     'Esquerda',
  MoveRight:    'Direita',
  Jump:         'Pular',
  Sprint:       'Correr',
  Crouch:       'Agachar',
  Interact:     'Interagir / Reviver',
  Reload:       'Recarregar',
  Ping:         'Roda de Ping',
  Mute:         'Mudo',
  Pause:        'Pausa',
  Scoreboard:   'Placar',
  Slot1:        'Slot 1',
  Slot2:        'Slot 2',
  Slot3:        'Slot 3',
  Slot4:        'Slot 4',
  Dodge:        'Esquiva',
};

const DEFAULTS = {
  MoveForward:  'KeyW',
  MoveBackward: 'KeyS',
  MoveLeft:     'KeyA',
  MoveRight:    'KeyD',
  Jump:         'Space',
  Sprint:       'ShiftLeft',
  Crouch:       'ControlLeft',
  Interact:     'KeyE',
  Reload:       'KeyR',
  Ping:         'KeyQ',
  Mute:         'KeyM',
  Pause:        'Escape',
  Scoreboard:   'Tab',
  Slot1:        'Digit1',
  Slot2:        'Digit2',
  Slot3:        'Digit3',
  Slot4:        'Digit4',
  Dodge:        'Space',
};

const STORAGE_KEY = 'qb_controls_v1';
const BASE_SENS   = 0.001;
const AIM_SENS    = 0.6;

export class SaveControls {
  constructor(data = null) {
    this.sensitivity = 2.0;
    this.keyBinds = ACTION_ORDER.map(a => DEFAULTS[a]);
    if (data) this.applyControls(data);
  }

  get adaptedSensitivity() {
    return this.sensitivity;
  }

  getEffectiveSens(aiming) {
    const base = this.sensitivity * BASE_SENS;
    return aiming ? base * AIM_SENS : base;
  }

  getKey(action) {
    const idx = ACTION_ORDER.indexOf(action);
    if (idx < 0) return null;
    return this.keyBinds[idx];
  }

  setKey(action, code) {
    const idx = ACTION_ORDER.indexOf(action);
    if (idx < 0 || !code) return false;
    const existing = this.keyBinds.indexOf(code);
    if (existing >= 0 && existing !== idx) {
      this.keyBinds[existing] = this.keyBinds[idx];
    }
    this.keyBinds[idx] = code;
    return true;
  }

  isDown(action, keys) {
    const k = this.getKey(action);
    return k ? !!keys[k] : false;
  }

  // Porte de ApplyControls(refControls) do C#
  applyControls(refControls) {
    if (!refControls) return;

    if (typeof refControls.sensitivity === 'number') {
      this.sensitivity = refControls.sensitivity;
    }

    if (!Array.isArray(refControls.keyBinds)) {
      console.warn('[SaveControls] refControls.keyBinds inválido.');
      return;
    }

    if (refControls.keyBinds.length !== this.keyBinds.length) {
      console.warn('[SaveControls] keyBinds com tamanho incompatível. Resetando para padrão.');
      this.keyBinds = ACTION_ORDER.map(a => DEFAULTS[a]);
      return;
    }

    for (let i = 0; i < this.keyBinds.length; i++) {
      this.keyBinds[i] = refControls.keyBinds[i];
    }
  }

  toJSON() {
    return { sensitivity: this.sensitivity, keyBinds: this.keyBinds.slice() };
  }

  clone() {
    return new SaveControls(this.toJSON());
  }

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toJSON())); }
    catch (e) { console.warn('[SaveControls] save falhou:', e); }
  }

  static load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new SaveControls();
      const data = JSON.parse(raw);
      const c = new SaveControls();
      c.applyControls(data);
      return c;
    } catch (e) {
      console.warn('[SaveControls] load falhou:', e);
      return new SaveControls();
    }
  }

  static reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    return new SaveControls();
  }

  static defaults() { return new SaveControls(); }
}

let _instance = null;
export function getControls() {
  if (!_instance) _instance = SaveControls.load();
  return _instance;
}

export function setControls(c) {
  _instance = c;
  _instance.save();
}
