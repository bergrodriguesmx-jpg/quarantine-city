// ============================================================
// sprite-registry.js
// Mapa central: id lógico → sprite PNG + metadados.
// Todo sprite do ZB2 é um PNG único. Frames ficam lado a lado
// (sheet horizontal). Ajuste 'frames' conforme seu PNG real.
// ============================================================

const BASE = 'assets/sprites/';

// Helper: calcula dimensões do frame a partir do sheet
function sheet(sheetW, sheetH, frames) {
  return {
    sheetW, sheetH, frames,
    frameW: Math.floor(sheetW / frames),
    frameH: sheetH,
  };
}

// ============================================================
// ARMAS — ajuste os tamanhos reais (do .asset: m_Rect.width/height)
// ============================================================
// Exemplos baseados nos arquivos que você mandou:
//   AkmSprite:    696 x 208   (provável sheet de 3 frames: 232x208 cada)
//   AkSuSprite:   556 x 212   (provável sheet de 2-3 frames)
//   allAmmoSprite:370 x 131   (ícone único)
//   africa:       124 x 141   (ícone único / mapa)
//
// Substitua 'assets/sprites/...' pelos paths reais.
// ============================================================

export const WEAPON_SPRITES = {
  // ---------- MELEE ----------
  knife:        { url: BASE + 'knife.png',        sheet: sheet(348, 174, 2) },
  woodenClub:   { url: BASE + 'club.png',         sheet: sheet(348, 174, 2) },
  pipe:         { url: BASE + 'pipe.png',         sheet: sheet(348, 174, 2) },
  cleaver:      { url: BASE + 'cleaver.png',      sheet: sheet(348, 174, 2) },
  shovel:       { url: BASE + 'shovel.png',       sheet: sheet(348, 174, 2) },
  katana:       { url: BASE + 'katana.png',       sheet: sheet(348, 174, 2) },
  kukri:        { url: BASE + 'kukri.png',        sheet: sheet(348, 174, 2) },
  pipeWrench:   { url: BASE + 'pipewrench.png',   sheet: sheet(348, 174, 2) },
  reaperScythe: { url: BASE + 'scythe.png',       sheet: sheet(696, 348, 2) },

  // ---------- RANGED ----------
  // Substitua pelos nomes reais dos seus PNGs do ZB2.
  pistol:       { url: BASE + 'pistol.png',       sheet: sheet(464, 232, 2) },
  revolver:     { url: BASE + 'revolver.png',     sheet: sheet(464, 232, 2) },
  smg:          { url: BASE + 'ak74u.png',        sheet: sheet(556, 212, 2) }, // AKS-74U
  rifle:        { url: BASE + 'akm.png',          sheet: sheet(696, 208, 3) }, // AKM
  shotgun:      { url: BASE + 'shotgun.png',      sheet: sheet(556, 212, 2) },
  launcher:     { url: BASE + 'launcher.png',     sheet: sheet(696, 348, 2) },
};

// ============================================================
// ÍCONES DE ITEM (HUD / Loja / Pickup)
// ============================================================
export const ITEM_SPRITES = {
  ammoAll:      { url: BASE + 'allAmmo.png',   w: 370, h: 131 },
  ammoPistol:   { url: BASE + 'ammo_pistol.png',  w: 240, h: 96 },
  ammoRifle:    { url: BASE + 'ammo_rifle.png',   w: 240, h: 96 },
  ammoShotgun:  { url: BASE + 'ammo_shotgun.png', w: 240, h: 96 },
  coin:         { url: BASE + 'coin.png',      w: 64,  h: 64 },
  medkit:       { url: BASE + 'medkit.png',    w: 128, h: 128 },
  brazier:      { url: BASE + 'brazier.png',   w: 128, h: 128 },
  vendor:       { url: BASE + 'vendor.png',    w: 256, h: 256 },
};

// ============================================================
// MAPAS / FUNDOS
// ============================================================
export const MAP_SPRITES = {
  africa:       { url: BASE + 'africa.png',    w: 124, h: 141 },
};

// ============================================================
// API
// ============================================================

/** Retorna { url, width, height } do frame pedido (para SpriteView). */
export function getWeaponSprite(weaponId, frame = 0) {
  const def = WEAPON_SPRITES[weaponId];
  if (!def) return null;
  const s = def.sheet;
  return {
    url: def.url,
    width: s.sheetW,
    height: s.sheetH,
    frame,
    frameW: s.frameW,
    frameH: s.frameH,
  };
}

/** Número total de frames de uma arma. */
export function getWeaponFrameCount(weaponId) {
  const def = WEAPON_SPRITES[weaponId];
  return def ? def.sheet.frames : 1;
}

/** Ícone de item (HUD/loja). */
export function getItemSprite(itemId) {
  const def = ITEM_SPRITES[itemId];
  if (!def) return null;
  return { url: def.url, width: def.w, height: def.h };
}

/** Mapa. */
export function getMapSprite(mapId) {
  const def = MAP_SPRITES[mapId];
  if (!def) return null;
  return { url: def.url, width: def.w, height: def.h };
}

/** Preload — chama no boot pra evitar flicker. */
export async function preloadWeaponSprites() {
  const urls = new Set();
  for (const id in WEAPON_SPRITES) urls.add(WEAPON_SPRITES[id].url);
  for (const id in ITEM_SPRITES)   urls.add(ITEM_SPRITES[id].url);
  const tasks = [...urls].map(url => new Promise(res => {
    const img = new Image();
    img.onload = img.onerror = () => res();
    img.src = url;
  }));
  await Promise.all(tasks);
}
