import { Ev } from '../core/events.js';
import { emitRemote } from '../core/bus.js';

// ============================================================
// CLASSIFICAÇÃO DE EVENTOS
// ============================================================

// Eventos que o CLIENTE origina (inputs, cosméticos). Vão pro servidor.
const CLIENT_ORIGIN = new Set([
  Ev.PLAYER_MOVE,
  Ev.PLAYER_LOOK,
  Ev.ATTACK,
  Ev.PLAYER_WEAPON,
  Ev.SKILL_PICK,
]);

// Eventos onde o SERVIDOR é autoridade.
const SERVER_AUTHORITY = new Set([
  Ev.DAMAGE,
  Ev.DEATH,
  Ev.KILL,
  Ev.HEADSHOT,
  Ev.DISMEMBER,
  Ev.ZOMBIE_SPAWNED,
  Ev.WAVE_START,
  Ev.WAVE_CLEAR,
  Ev.COIN_GAIN,
  Ev.XP_GAIN,
  Ev.WEAPON_BUY,
  Ev.LEVEL_UP,
  Ev.PLAYER_HIT,
  Ev.PLAYER_DOWN,
  Ev.PLAYER_REVIVE,
  Ev.PLAYER_DIED,
]);

// ============================================================
// BASE ADAPTER
// ============================================================
export class BaseAdapter {
  onLocalEmit(_type, _payload) { /* override */ }
  isServerAuthoritative(type) { return SERVER_AUTHORITY.has(type); }
  isClientOrigin(type) { return CLIENT_ORIGIN.has(type); }
}

// ============================================================
// LOCAL ADAPTER — Single-player (no-op)
// ============================================================
export class LocalAdapter extends BaseAdapter {
  onLocalEmit() {}
}

// ============================================================
// MULTIPLAYER ADAPTER — Pronto para ligar ao servidor
// ============================================================
export class MultiplayerAdapter extends BaseAdapter {
  constructor(socket, opts = {}) {
    super();
    this.socket = socket;
    this.clientId = opts.clientId || null;
    this.roomId = opts.roomId || null;
    this.sendRate = opts.sendRate || 30;
    this._queue = [];
    this._flushTimer = null;
    this._bindSocket();
    this._startFlush();
  }

  _bindSocket() {
    if (!this.socket) return;
    this.socket.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); }
      catch { return; }
      if (Array.isArray(msg)) {
        for (const m of msg) if (m && m.t) emitRemote(m.t, m.p || {});
      } else if (msg && msg.t) {
        emitRemote(msg.t, msg.p || {});
      }
    });
    this.socket.addEventListener('close', () => this._stopFlush());
  }

  onLocalEmit(type, payload) {
    if (this.isServerAuthoritative(type)) return;
    if (this.isClientOrigin(type)) {
      this._queue.push({ t: type, p: payload });
    }
  }

  _startFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => this._flush(), 1000 / this.sendRate);
  }

  _stopFlush() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  _flush() {
    if (!this._queue.length) return;
    if (!this.socket || this.socket.readyState !== 1) return;
    try {
      this.socket.send(JSON.stringify(this._queue));
      this._queue.length = 0;
    } catch (err) {
      console.warn('[MultiplayerAdapter] send falhou:', err);
    }
  }

  dispose() {
    this._stopFlush();
    this._queue.length = 0;
  }
}
