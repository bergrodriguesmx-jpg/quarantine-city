import { Ev } from './events.js';

const listeners = new Map();
const anyListeners = new Set();
let adapter = null;
let debug = false;

export function setAdapter(a) { adapter = a; }
export function getAdapter() { return adapter; }
export function setDebug(v) { debug = !!v; }

export function on(type, fn) {
  let s = listeners.get(type);
  if (!s) { s = new Set(); listeners.set(type, s); }
  s.add(fn);
  return () => s.delete(fn);
}

export function once(type, fn) {
  const off = on(type, (p, m) => { off(); fn(p, m); });
  return off;
}

export function off(type, fn) {
  const s = listeners.get(type);
  if (s) s.delete(fn);
}

// Escuta TODOS os eventos — útil p/ kill feed, scoreboard, replay/log
export function onAny(fn) {
  anyListeners.add(fn);
  return () => anyListeners.delete(fn);
}

function fire(type, payload, meta) {
  if (debug) console.log(`[bus] ${type}`, payload, meta);
  const s = listeners.get(type);
  if (s) for (const fn of s) {
    try { fn(payload, meta); }
    catch (e) { console.error('[bus] listener error', type, e); }
  }
  for (const fn of anyListeners) {
    try { fn(type, payload, meta); }
    catch (e) { console.error('[bus:any]', type, e); }
  }
}

// Evento LOCAL: originado aqui (input do player, simulação local)
export function emit(type, payload = {}) {
  fire(type, payload, { remote: false });
  if (adapter) adapter.onLocalEmit(type, payload);
}

// Evento REMOTO: chegou do servidor. NUNCA re-enviar.
export function emitRemote(type, payload = {}) {
  fire(type, payload, { remote: true });
}
