// ============================================================
// gib-models.js — v3 "SELF-CONTAINED"
// Todos os exports que o game.js importa. Zero downloads.
// ============================================================

export async function preloadGibs() {
  console.log('[gib-models] ✅ procedural (zero download)');
}

export function createGib() { return null; }

export function hasGib() { return false; }

export function getGibStatus() {
  return {
    head:  { loaded: false, file: null },
    torso: { loaded: false, file: null },
    armL:  { loaded: false, file: null },
    armR:  { loaded: false, file: null },
    legL:  { loaded: false, file: null },
    legR:  { loaded: false, file: null },
  };
}
