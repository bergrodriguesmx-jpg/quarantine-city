// ============================================================
// sprite-registry.js
// ============================================================

const BASE = 'assets/sprites/';

function sheet(sheetW, sheetH, frames) {
  return {
    sheetW, sheetH, frames,
    frameW: Math.floor(sheetW / frames),
    frameH: sheetH,
  };
}

export const WEAPON_SPRITES = {
  knife:        { url: BASE + 'knife.png',        sheet: sheet(348, 174, 2) },
  woodenClub:   { url: BASE + 'club.png',         sheet: sheet(348, 174, 2) },
  pipe:         { url: BASE + 'pipe.png',         sheet: sheet(348, 174, 2) },
  cleaver:      { url: BASE + 'cleaver.png',      sheet: sheet(348, 174, 2) },
  shovel:       { url: BASE + 'shovel.png',       sheet: sheet(348, 174, 2) },
  katana:       { url: BASE + 'katana.png',       sheet: sheet(348, 174, 2) },
  kukri:        { url: BASE + 'kukri.png',        sheet: sheet(348, 174, 2) },
  pipeWrench:   { url: BASE + 'pipewrench.png',   sheet: sheet(348, 174, 2) },
  reaperScythe: { url: BASE + 'scythe.png',       sheet: sheet(696, 348, 2) },
  pistol:       { url: BASE + 'pistol.png',       sheet: sheet(464, 232, 2) },
  revolver:     { url: BASE + 'revolver.png',     sheet: sheet(464, 232, 2) },
  smg:          { url: BASE + 'ak74u.png',        sheet: sheet(556, 212, 2) },
  rifle:        { url: BASE + 'akm.png',          sheet: sheet(696, 208, 3) },
  shotgun:      { url: BASE + 'shotgun.png',      sheet: sheet(556, 212, 2) },
  launcher:     { url: BASE + 'launcher.png',     sheet: sheet(696, 348, 2) },
};

export const ITEM_SPRITES = {
  ammoAll:      { url: BASE + 'allAmmo.png',   w: 370, h: 131 },
  coin:         { url: BASE + 'coin.png',      w: 64,  h: 64 },
};

export const MAP_SPRITES = {
  africa:       { url: BASE + 'africa.png',    w: 124, h: 141 },
};

// ⚠️ CORREÇÃO: retorna TODOS os campos que o viewmodel espera
export function getWeaponSprite(weaponId, frame = 0) {
  const def = WEAPON_SPRITES[weaponId];
  if (!def) {
    console.warn('[sprite-registry] sprite não encontrado:', weaponId);
    return null;
  }
  const s = def.sheet;
  return {
    url: def.url,
    // Ambos os nomes pra compatibilidade
    sheetW: s.sheetW,
    sheetH: s.sheetH,
    width: s.sheetW,
    height: s.sheetH,
    frameW: s.frameW,
    frameH: s.frameH,
    frames: s.frames,
    frame,
  };
}

export function getWeaponFrameCount(weaponId) {
  const def = WEAPON_SPRITES[weaponId];
  return def ? def.sheet.frames : 1;
}

export function getItemSprite(itemId) {
  const def = ITEM_SPRITES[itemId];
  if (!def) return null;
  return { url: def.url, width: def.w, height: def.h };
}

export function getMapSprite(mapId) {
  const def = MAP_SPRITES[mapId];
  if (!def) return null;
  return { url: def.url, width: def.w, height: def.h };
}

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
