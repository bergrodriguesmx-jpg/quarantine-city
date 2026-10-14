// ============================================================
// zombie-procedural.js — v11
// CHANGELOG v11:
//   • APLICA type.scale internamente (fix crítico)
//   • skinDark computado via darkerSkin() (não usa cfg.skinDark)
//   • shin 0.46 (sem gap na tíbia)
//   • material cache robusto (ordem de chaves estável)
//   • crawler sem pré-rotação (game.js anima)
//   • frustum culling ativo (padrão Three.js)
//   • localBoxes computadas da geometria real
// ============================================================

import * as THREE from 'three';

// ─── Geometrias compartilhadas ────────────────────────────────
const GEO_BOX = new THREE.BoxGeometry(1, 1, 1);
const GEO_SPHERE = new THREE.IcosahedronGeometry(1, 0);
const GEO_CONE = new THREE.ConeGeometry(0.5, 1, 5);

// ─── Helpers de cor ───────────────────────────────────────────
function darkerSkin(hex, amount = 0.55) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(amount);
  return c.getHex();
}

// ─── Material cache robusto ───────────────────────────────────
const MAT_CACHE = new Map();
function matKey(color, opts) {
  if (!opts) return `${color}`;
  const keys = Object.keys(opts).sort();
  let k = `${color}|`;
  for (const key of keys) k += `${key}=${opts[key]};`;
  return k;
}
function toonMat(color, opts) {
  const key = matKey(color, opts);
  let m = MAT_CACHE.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(opts || {}) });
    MAT_CACHE.set(key, m);
  }
  return m;
}

// ─── Palette ──────────────────────────────────────────────────
const C = {
  skin: 0x86bd55, skinDark: 0x456f38,
  shirt: 0x425a70, shirt2: 0x704b3a, pants: 0x303a45, shoes: 0x211f22,
  bone: 0xe0d7ad, eye: 0xf7f0c9, pupil: 0x1a1718, mouth: 0x281416, blood: 0x842d32,
  metal: 0x64727c, metalDark: 0x29343c, gold: 0xd8a83e, purple: 0x4a245d,
  red: 0x982d32, acid: 0x8aff37, orange: 0xff8a27, black: 0x15181d,
};

// ─── Helpers de construção ────────────────────────────────────
function block(parent, pos, size, color, opts = {}) {
  const geo = opts.geo || GEO_BOX;
  const m = new THREE.Mesh(geo, toonMat(color));
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(size[0], size[1], size[2]);
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, pos) {
  const p = new THREE.Group();
  p.position.set(pos[0], pos[1], pos[2]);
  parent.add(p);
  return p;
}

function computeLocalBox(group, padding = 0.02) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Matrix4();
  group.traverse(c => {
    if (!c.isMesh || !c.geometry) return;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    const lb = c.geometry.boundingBox.clone();
    tmp.multiplyMatrices(inv, c.matrixWorld);
    lb.applyMatrix4(tmp);
    box.union(lb);
  });
  box.min.x -= padding; box.min.y -= padding; box.min.z -= padding;
  box.max.x += padding; box.max.y += padding; box.max.z += padding;
  return box;
}

// ─── Config por tipo ──────────────────────────────────────────
function getTypeConfig(typeKey) {
  const configs = {
    pt:        { name: 'PEDESTRE',    shirt: C.shirt,      skin: C.skin,     build: 'normal',  variant: 'civil',    scale: 1.00 },
    pt_donkey: { name: 'BURRO',       shirt: 0x4a3a2a,     skin: 0x9e8b7a,   build: 'normal',  variant: 'donkey',   scale: 0.95 },
    judge:     { name: 'JUIZ',        shirt: C.black,      skin: 0xc8a8a8,   build: 'normal',  variant: 'judge',    scale: 1.12 },
    runner:    { name: 'CORREDOR',    shirt: C.shirt2,     skin: C.skin,     build: 'slim',    variant: 'runner',   scale: 0.85 },
    crawler:   { name: 'RASTEJANTE',  shirt: C.shirt,      skin: 0x9a9a9a,   build: 'crawler', variant: 'crawler',  scale: 0.85 },
    worker:    { name: 'TRABALHADOR', shirt: 0x8b5a2b,     skin: 0xc8a878,   build: 'normal',  variant: 'worker',   scale: 1.02 },
    miner:     { name: 'MINEIRO',     shirt: 0x34495e,     skin: 0xb09878,   build: 'normal',  variant: 'miner',    scale: 1.05 },
    spitter:   { name: 'CUSPIDOR',    shirt: 0x4c593b,     skin: C.skin,     build: 'normal',  variant: 'spitter',  scale: 1.00 },
    boomer:    { name: 'EXPLOSIVO',   shirt: 0x6e493c,     skin: 0x88ff66,   build: 'fat',     variant: 'boomer',   scale: 1.10 },
    security:  { name: 'SEGURANÇA',   shirt: 0x1a1a1a,     skin: 0xa88a68,   build: 'normal',  variant: 'security', scale: 1.06 },
    combat:    { name: 'COMBATENTE',  shirt: 0x1a1a1a,     skin: 0xa8a878,   build: 'normal',  variant: 'combat',   scale: 1.00 },
    brute:     { name: 'BRUTAMONTES', shirt: 0x56433a,     skin: C.skin,     build: 'brute',   variant: 'brute',    scale: 1.30 },
    riot:      { name: 'RIOT',        shirt: C.metalDark,  skin: 0x72904c,   build: 'brute',   variant: 'riot',     scale: 1.45 },
    queen:     { name: 'QUEEN',       shirt: C.purple,     skin: C.skin,     build: 'normal',  variant: 'queen',    scale: 1.30 },
    reaper:    { name: 'REAPER',      shirt: C.black,      skin: 0x7d9a51,   build: 'normal',  variant: 'reaper',   scale: 1.25 },
  };
  return configs[typeKey] || configs.pt;
}

// ══════════════════════════════════════════════════════════════
// CONSTRUTOR PRINCIPAL
// ══════════════════════════════════════════════════════════════
export function buildCartoonZombie(typeKey = 'pt', type = {}) {
  const cfg = getTypeConfig(typeKey);
  const variant = cfg.variant;
  const isCrawler = variant === 'crawler';
  const isBrute = cfg.build === 'brute';
  const isFat = cfg.build === 'fat';
  const isSlim = cfg.build === 'slim';

  const skinDark = darkerSkin(cfg.skin);

  const bs = {
    torso: isFat ? 1.20 : isBrute ? 1.35 : isSlim ? 0.88 : 1.00,
    arm:   isBrute ? 1.25 : isFat ? 1.10 : isSlim ? 0.92 : 1.00,
    leg:   isBrute ? 1.15 : isFat ? 1.05 : isSlim ? 0.94 : 1.00,
  };

  // ═══ ROOT + HIPS ═══
  const root = new THREE.Group();
  const Hips = new THREE.Group();
  Hips.name = 'Hips';
  Hips.position.set(0, isCrawler ? 0.30 : 0.92, 0);
  root.add(Hips);

  // ─── PELVIS ───
  block(Hips, [0, -0.02, 0], [0.42 * bs.torso, 0.22, 0.28 * bs.torso], C.pants);
  block(Hips, [0, 0.08, 0], [0.44 * bs.torso, 0.06, 0.30 * bs.torso], 0x4A2A1A);
  block(Hips, [0, 0.08, 0.16 * bs.torso], [0.09, 0.09, 0.03], C.gold);

  // ═══ SPINE LOWER ═══
  const SpineLower = pivot(Hips, [0, 0.10, 0]);
  SpineLower.name = 'Spine';
  block(SpineLower, [0, 0.04, 0], [0.40 * bs.torso, 0.20, 0.26 * bs.torso], cfg.shirt);

  // Barriga boomer
  if (variant === 'boomer') {
    block(SpineLower, [0, 0.02, 0.14 * bs.torso], [0.72, 0.62, 0.42], 0x81934c, { geo: GEO_SPHERE });
    for (let i = 0; i < 5; i++) {
      const px = -0.22 + (i % 3) * 0.22;
      const py = -0.10 + Math.floor(i / 3) * 0.18;
      block(SpineLower, [px, py, 0.30 * bs.torso], [0.08, 0.08, 0.05], C.orange, { geo: GEO_SPHERE });
    }
  }

  // Saco ácido spitter
  if (variant === 'spitter') {
    block(SpineLower, [0, 0.04, -0.20], [0.42, 0.42, 0.32], 0x536b34, { geo: GEO_SPHERE });
    for (let i = 0; i < 4; i++) {
      block(SpineLower, [-0.20 + i * 0.14, 0.02, 0.16 * bs.torso], [0.07, 0.07, 0.07], C.acid, { geo: GEO_SPHERE });
    }
  }

  // Capa da Queen
  if (variant === 'queen') {
    block(SpineLower, [0, -0.30, -0.24], [0.72, 0.78, 0.12], C.red);
    block(SpineLower, [0, -0.32, -0.31], [0.62, 0.08, 0.04], C.gold);
  }

  // Cinto do Reaper
  if (variant === 'reaper') {
    block(SpineLower, [0, -0.10, 0.14 * bs.torso], [0.66, 0.10, 0.08], C.gold);
  }

  // Túnica do Juiz
  if (variant === 'judge') {
    block(SpineLower, [0, -0.20, 0], [0.50 * bs.torso, 0.55, 0.36 * bs.torso], 0x0A0A0A);
  }

  // ═══ SPINE UPPER ═══
  const SpineUpper = pivot(SpineLower, [0, 0.15, 0]);
  SpineUpper.name = 'Spine2';
  const chestSize = isBrute ? [0.95, 0.80, 0.52]
                  : isFat   ? [0.90, 0.72, 0.58]
                            : [0.62, 0.68, 0.38];
  block(SpineUpper, [0, 0.04, 0], chestSize, cfg.shirt);
  block(SpineUpper, [0, 0.32, 0.01], [0.42 * bs.torso, 0.06, 0.30 * bs.torso], 0x222222);
  block(SpineUpper, [-0.12 * bs.torso, 0.10, 0.17 * bs.torso], [0.14, 0.12, 0.03], C.blood);

  // Features de torso
  if (variant === 'brute') {
    block(SpineUpper, [-0.53, 0.20, 0], [0.43, 0.40, 0.47], cfg.skin);
    block(SpineUpper, [ 0.53, 0.20, 0], [0.43, 0.40, 0.47], cfg.skin);
  }
  if (variant === 'riot') {
    block(SpineUpper, [0, 0.10, 0.19], [0.67, 0.43, 0.12], C.metalDark);
    block(SpineUpper, [0, 0.20, 0.26], [0.15, 0.15, 0.03], C.red);
  }
  if (variant === 'queen') {
    block(SpineUpper, [0, 0.32, 0.03], [0.72, 0.17, 0.46], C.gold);
  }
  if (variant === 'judge') {
    block(SpineUpper, [0, 0.12, 0.20], [0.08, 0.25, 0.03], C.red);
    block(SpineUpper, [0, -0.02, 0.16], [0.66, 0.55, 0.06], 0x0A0A0A);
  }
  if (variant === 'security') {
    block(SpineUpper, [-0.14, 0.16, 0.20], [0.10, 0.10, 0.03], C.gold);
    block(SpineUpper, [0.22, 0.24, 0], [0.10, 0.14, 0.10], 0x0A0A0A);
    block(SpineUpper, [0.22, 0.30, 0.05], [0.04, 0.08, 0.02], 0x111111);
  }
  if (variant === 'combat') {
    block(SpineUpper, [0, 0.10, 0.19], [0.68, 0.48, 0.10], 0x2C3E50);
    for (let i = 0; i < 3; i++) block(SpineUpper, [-0.10 + i * 0.10, 0.02, 0.25], [0.06, 0.10, 0.03], 0x1A1A1A);
    block(SpineUpper, [0.28, -0.10, 0.10], [0.10, 0.30, 0.10], 0x3A2A1A);
  }
  if (variant === 'worker') {
    block(SpineLower, [0, -0.14, 0.18], [0.42, 0.12, 0.06], 0x3A2A1A);
    block(SpineUpper, [-0.16, 0.16, 0.20], [0.12, 0.14, 0.03], C.gold);
  }
  if (variant === 'miner') {
    block(SpineLower, [0, 0.10, -0.22], [0.36, 0.36, 0.14], 0x3A3A3A);
    block(SpineLower, [0, 0.10, -0.30], [0.14, 0.14, 0.05], C.gold);
  }

  // ═══ NECK ═══
  const Neck = pivot(SpineUpper, [0, 0.35, 0]);
  Neck.name = 'Neck';
  block(Neck, [0, 0.04, 0], [0.20, 0.20, 0.20], cfg.skin);

  // ═══ HEAD ═══
  const Head = pivot(Neck, [0, 0.10, 0]);
  Head.name = 'Head';
  buildHead(Head, cfg, variant, skinDark);

  // ═══ BRAÇOS ═══
  const armLen = isBrute ? 0.72 : 0.62;
  const armX = (isBrute ? 0.55 : 0.32) * bs.torso;
  const armL = buildArmHierarchy(SpineUpper, +1, armX, armLen, cfg, bs, variant, isBrute);
  const armR = buildArmHierarchy(SpineUpper, -1, armX, armLen, cfg, bs, variant, isBrute);

  // Gear específico no braço
  if (variant === 'riot') {
    block(armL.shoulder, [0.10, -armLen * 0.5, 0.20], [0.15, 0.95, 0.56], C.metal);
    block(armL.shoulder, [0.10, -armLen * 0.45, 0.27], [0.05, 0.15, 0.02], 0xe4e9e9);
  }
  if (variant === 'queen') {
    block(armL.hand, [0.10, 0.30, 0.10], [0.09, 0.92, 0.09], C.gold);
    block(armL.hand, [0.10, 0.80, 0.10], [0.19, 0.19, 0.19], C.acid, { geo: GEO_SPHERE });
  }
  if (variant === 'reaper') {
    block(armL.hand, [0.08, 0.40, 0.12], [0.09, 1.50, 0.09], 0x60472f, { rot: [0, 0, -0.2] });
    block(armL.hand, [0.08, 0.70, 0.12], [0.12, 0.58, 0.12], C.metal, { rot: [0, 0, -0.9] });
  }
  if (variant === 'judge') {
    block(armR.hand, [0, -0.02, 0.10], [0.10, 0.10, 0.28], 0x5D4030);
    block(armR.hand, [0, -0.02, 0.24], [0.22, 0.14, 0.14], 0x3A2A1A);
  }

  // ═══ PERNAS ═══
  const legX = (isBrute ? 0.27 : 0.15) * bs.torso;
  const hipY = -0.06;

  let legL = null, legR = null;
  if (!isCrawler) {
    legL = buildLegHierarchy(Hips, +1, legX, hipY, cfg, bs, isBrute, variant);
    legR = buildLegHierarchy(Hips, -1, legX, hipY, cfg, bs, isBrute, variant);
  } else {
    block(Hips, [-0.15, -0.08, -0.10], [0.20, 0.16, 0.25], C.blood);
    block(Hips, [ 0.15, -0.08, -0.10], [0.20, 0.16, 0.25], skinDark);
  }

  // Pose inicial corredor
  if (variant === 'runner') {
    SpineLower.rotation.x = 0.15;
    SpineUpper.rotation.x = 0.10;
    armL.shoulder.rotation.x = -0.55;
    armR.shoulder.rotation.x = -0.55;
    armL.elbow.rotation.x = 0.90;
    armR.elbow.rotation.x = 0.90;
  }

  // 🎯 APLICA ESCALA DO TIPO (brute, riot, queen, reaper ficam maiores)
  const typeScale = cfg.scale || 1;
  if (typeScale !== 1) {
    root.scale.setScalar(typeScale);
  }

  // Ajuste final: pés no chão (não aplica pra crawler — game.js anima)
  if (!isCrawler) {
    root.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(root);
    Hips.position.y -= bbox.min.y;
    root.updateMatrixWorld(true);
  }

  // Local boxes computadas da geometria real (escala já aplicada)
  const localBoxes = {
    head:  computeLocalBox(Head, 0.02),
    torso: computeLocalBox(SpineUpper, 0.02),
    armL:  computeLocalBox(armL.shoulder, 0.02),
    armR:  computeLocalBox(armR.shoulder, 0.02),
    legL:  legL ? computeLocalBox(legL.thigh, 0.02) : computeLocalBox(Hips, 0.02),
    legR:  legR ? computeLocalBox(legR.thigh, 0.02) : computeLocalBox(Hips, 0.02),
  };

  const joints = {
    pelvis: Hips,
    spineLower: SpineLower,
    spineUpper: SpineUpper,
    neck: Neck,
    head: Head,
    shoulderL: armL.shoulder,
    elbowL: armL.elbow,
    shoulderR: armR.shoulder,
    elbowR: armR.elbow,
    thighL: legL ? legL.thigh : Hips,
    kneeL: legL ? legL.knee : Hips,
    footL: legL ? legL.foot : Hips,
    thighR: legR ? legR.thigh : Hips,
    kneeR: legR ? legR.knee : Hips,
    footR: legR ? legR.foot : Hips,
  };

  return {
    root,
    hips: Hips,
    scene: root,
    joints,
    localBoxes,
    skinColor: cfg.skin,
    variant,
    build: cfg.build,
    isRigged: false,
    headLoll:      (Math.random() - 0.5) * 0.3,
    headPitchBase: (Math.random() - 0.5) * 0.2,
    armDroopL:     -0.05,
    armDroopR:     -0.05,
    limpAmount:    Math.random(),
    limpSide:      Math.random() < 0.5 ? -1 : 1,
    walkStyle:     Math.random(),
    scale:         typeScale,
  };
}

// ══════════════════════════════════════════════════════════════
// HEAD
// ══════════════════════════════════════════════════════════════
function buildHead(Head, cfg, variant, skinDark) {
  const headSize = [0.48, 0.48, 0.43];
  block(Head, [0, 0.24, 0], headSize, cfg.skin);

  if (variant === 'donkey') {
    block(Head, [0, 0.16, 0.28], [0.28, 0.20, 0.30], 0xB8A796);
    block(Head, [-0.08, 0.12, 0.44], [0.05, 0.05, 0.03], 0x2A1F1A);
    block(Head, [ 0.08, 0.12, 0.44], [0.05, 0.05, 0.03], 0x2A1F1A);
    block(Head, [-0.20, 0.48, 0], [0.10, 0.30, 0.10], cfg.skin, { rot: [0, 0, 0.35] });
    block(Head, [ 0.20, 0.48, 0], [0.10, 0.30, 0.10], cfg.skin, { rot: [0, 0, -0.35] });
    addEye(Head, -0.12, 0.30, 0.20, 0.9, skinDark);
    addEye(Head,  0.12, 0.30, 0.20, 0.9, skinDark);
    return;
  }

  if (variant === 'judge') {
    block(Head, [0, 0.48, -0.02], [0.52, 0.14, 0.46], 0x888888);
    block(Head, [0, 0.32, 0.22], [0.40, 0.06, 0.04], 0x888888);
    addEye(Head, -0.12, 0.26, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.26, 0.22, 0.85, skinDark);
    block(Head, [0, 0.14, 0.22], [0.30, 0.07, 0.06], 0x666666);
    block(Head, [0, 0.02, 0.14], [0.32, 0.20, 0.16], 0x666666);
    return;
  }

  if (variant === 'reaper') {
    block(Head, [0, 0.37, -0.02], [0.62, 0.44, 0.54], C.black);
    block(Head, [0, 0.22, 0.23], [0.38, 0.32, 0.08], 0x08090b);
    block(Head, [-0.10, 0.25, 0.30], [0.08, 0.05, 0.03], 0xff392d);
    block(Head, [ 0.10, 0.25, 0.30], [0.08, 0.05, 0.03], 0xff392d);
    return;
  }

  if (variant === 'riot') {
    block(Head, [0, 0.50, 0], [0.58, 0.22, 0.54], C.metalDark);
    block(Head, [0, 0.30, 0.24], [0.44, 0.12, 0.06], 0x121b20);
    addEye(Head, -0.12, 0.30, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.30, 0.22, 0.85, skinDark);
    block(Head, [0, 0.06, 0.24], [0.28, 0.10, 0.04], C.mouth);
    for (let i = 0; i < 3; i++) block(Head, [-0.08 + i * 0.08, 0.07, 0.27], [0.04, 0.04, 0.02], C.bone);
    return;
  }

  if (variant === 'queen') {
    for (let i = 0; i < 5; i++) {
      block(Head, [-0.20 + i * 0.10, 0.72 + (i % 2) * 0.07, 0.02], [0.07, 0.26, 0.07], C.gold, { geo: GEO_CONE });
    }
    block(Head, [0, 0.56, 0.01], [0.56, 0.10, 0.50], C.gold);
    block(Head, [0, 0.40, -0.06], [0.52, 0.20, 0.52], C.red);
    addEye(Head, -0.12, 0.28, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.28, 0.22, 0.85, skinDark);
    block(Head, [0, 0.05, 0.24], [0.28, 0.10, 0.04], C.mouth);
    return;
  }

  if (variant === 'worker') {
    block(Head, [0, 0.52, 0], [0.52, 0.14, 0.52], 0x5D4030);
    block(Head, [0, 0.46, 0.28], [0.44, 0.05, 0.22], 0x3A2A1A);
    addEye(Head, -0.12, 0.27, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.27, 0.22, 0.85, skinDark);
    block(Head, [0, 0.05, 0.24], [0.27, 0.10, 0.045], C.mouth);
    for (let i = 0; i < 3; i++) block(Head, [-0.08 + i * 0.08, 0.06, 0.27], [0.035, 0.035, 0.02], C.bone);
    return;
  }

  if (variant === 'miner') {
    block(Head, [0, 0.52, 0], [0.54, 0.18, 0.54], 0xFFCC00);
    block(Head, [0, 0.60, 0], [0.56, 0.04, 0.12], 0x1A1A1A);
    block(Head, [0, 0.52, 0.28], [0.10, 0.10, 0.06], 0xFFFF88);
    addEye(Head, -0.12, 0.27, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.27, 0.22, 0.85, skinDark);
    block(Head, [0, 0.05, 0.24], [0.27, 0.10, 0.045], C.mouth);
    return;
  }

  if (variant === 'security') {
    block(Head, [0, 0.50, 0], [0.52, 0.14, 0.52], 0x1A1A1A);
    block(Head, [0, 0.44, 0.28], [0.42, 0.05, 0.20], 0x0A0A0A);
    addEye(Head, -0.12, 0.27, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.27, 0.22, 0.85, skinDark);
    block(Head, [0, 0.05, 0.24], [0.27, 0.10, 0.045], C.mouth);
    return;
  }

  if (variant === 'combat') {
    block(Head, [0, 0.32, 0], [0.51, 0.36, 0.46], 0x0A0A0A);
    block(Head, [-0.11, 0.30, 0.24], [0.09, 0.06, 0.03], 0xFF2020);
    block(Head, [ 0.11, 0.30, 0.24], [0.09, 0.06, 0.03], 0xFF2020);
    block(Head, [0, 0.10, 0.24], [0.24, 0.05, 0.03], 0x000000);
    return;
  }

  if (variant === 'spitter') {
    block(Head, [0, 0.48, -0.02], [0.50, 0.12, 0.44], 0x30302a);
    addEye(Head, -0.12, 0.27, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.27, 0.22, 0.85, skinDark);
    block(Head, [0, 0.05, 0.24], [0.28, 0.12, 0.045], C.mouth);
    block(Head, [0, 0.05, 0.28], [0.18, 0.06, 0.04], C.acid);
    return;
  }

  if (variant === 'boomer') {
    block(Head, [0, 0.24, 0], [0.52, 0.50, 0.46], cfg.skin);
    block(Head, [0.10, 0.54, 0], [0.08, 0.20, 0.08], C.orange);
    addEye(Head, -0.12, 0.28, 0.22, 0.85, skinDark);
    addEye(Head,  0.12, 0.28, 0.22, 0.85, skinDark);
    block(Head, [0, 0.03, 0.24], [0.30, 0.14, 0.045], C.mouth);
    return;
  }

  if (variant === 'brute') {
    block(Head, [0, 0.24, 0], [0.42, 0.42, 0.40], cfg.skin);
    addEye(Head, -0.10, 0.26, 0.20, 0.7, skinDark);
    addEye(Head,  0.10, 0.26, 0.20, 0.7, skinDark);
    block(Head, [0.10, 0.18, 0.21], [0.20, 0.05, 0.03], C.blood);
    block(Head, [0, 0.05, 0.21], [0.26, 0.10, 0.04], C.mouth);
    return;
  }

  // Padrão (pt, runner, crawler)
  block(Head, [0, 0.48, -0.015], [0.51, 0.13, 0.46], 0x30302a);
  addEye(Head, -0.12, 0.275, 0.224, 0.82, skinDark);
  addEye(Head,  0.12, 0.275, 0.224, 0.82, skinDark);
  block(Head, [0, 0.165, 0.25], [0.09, 0.12, 0.09], cfg.skin);
  block(Head, [0, 0.05, 0.239], [0.27, 0.10, 0.045], C.mouth);
  block(Head, [0, -0.005, 0.22], [0.28, 0.055, 0.07], skinDark);
  for (let i = 0; i < 3; i++) block(Head, [-0.08 + i * 0.08, 0.06, 0.27], [0.035, 0.035, 0.02], C.bone);
  block(Head, [0.17, 0.13, 0.229], [0.07, 0.04, 0.018], C.blood);
}

// ══════════════════════════════════════════════════════════════
// EYE
// ══════════════════════════════════════════════════════════════
function addEye(parent, x, y, z, s = 1, darkColor) {
  block(parent, [x, y, z],                 [0.22 * s, 0.23 * s, 0.09], darkColor);
  block(parent, [x, y + 0.005, z + 0.052], [0.15 * s, 0.145 * s, 0.055], C.eye);
  block(parent, [x + 0.025 * (x > 0 ? 1 : -1), y - 0.005, z + 0.087],
        [0.055 * s, 0.09 * s, 0.025], C.pupil);
}

// ══════════════════════════════════════════════════════════════
// ARM HIERARCHY
// ══════════════════════════════════════════════════════════════
function buildArmHierarchy(parent, side, armX, armLen, cfg, bs, variant, isBrute) {
  const shoulder = pivot(parent, [side * armX, 0.15, 0]);
  shoulder.name = side > 0 ? 'LeftArm' : 'RightArm';
  shoulder.rotation.z = -side * 0.06;

  const upperH = armLen * 0.70;
  const upperC = -armLen * 0.32;
  block(shoulder, [0, upperC, 0],
        [(isBrute ? 0.30 : 0.20 * bs.arm), upperH, (isBrute ? 0.24 : 0.24 * bs.arm)], cfg.shirt);

  const elbow = pivot(shoulder, [0, -armLen * 0.65, 0]);
  elbow.name = side > 0 ? 'LeftForeArm' : 'RightForeArm';

  const foreH = armLen * 0.55;
  const foreC = -armLen * 0.25;
  block(elbow, [0, foreC, 0.015],
        [(isBrute ? 0.30 : 0.21 * bs.arm), foreH, (isBrute ? 0.25 : 0.25 * bs.arm)], cfg.skin);

  const hand = pivot(elbow, [0, -armLen * 0.50, 0]);
  hand.name = side > 0 ? 'LeftHand' : 'RightHand';

  block(hand, [0, -0.05, 0.04], [0.22, 0.20, 0.23], cfg.skin);

  if (variant === 'riot') {
    block(elbow, [0, -armLen * 0.15, 0.14], [0.32, 0.30, 0.08], C.metal);
    block(elbow, [0, -armLen * 0.15, 0.19], [0.05, 0.05, 0.025], C.gold);
  }
  if (variant === 'queen') {
    block(elbow, [0, -armLen * 0.20, 0.13], [0.24, 0.08, 0.05], C.gold);
  }

  return { shoulder, elbow, hand };
}

// ══════════════════════════════════════════════════════════════
// LEG HIERARCHY
// ══════════════════════════════════════════════════════════════
function buildLegHierarchy(parent, side, legX, hipY, cfg, bs, isBrute, variant) {
  const thigh = pivot(parent, [side * legX, hipY, 0]);
  thigh.name = side > 0 ? 'LeftUpLeg' : 'RightUpLeg';

  block(thigh, [0, -0.20, 0],
        [(isBrute ? 0.30 : 0.20 * bs.leg), 0.46, (isBrute ? 0.28 : 0.28 * bs.leg)], C.pants);

  const knee = pivot(thigh, [0, -0.42, 0]);
  knee.name = side > 0 ? 'LeftLeg' : 'RightLeg';

  block(knee, [0, -0.21, 0.015],
        [(isBrute ? 0.26 : 0.18 * bs.leg), 0.46, (isBrute ? 0.26 : 0.26 * bs.leg)], cfg.skin);

  const foot = pivot(knee, [0, -0.42, 0]);
  foot.name = side > 0 ? 'LeftFoot' : 'RightFoot';

  const shoeColor = variant === 'riot' ? C.metalDark : C.shoes;
  block(foot, [0, -0.06, 0.06], [0.26, 0.16, 0.38], shoeColor);
  block(foot, [0, -0.10, 0.20], [0.26, 0.06, 0.08], variant === 'riot' ? C.metal : 0x151515);

  if (variant === 'riot') {
    block(knee, [0, -0.10, 0.14], [0.30, 0.16, 0.08], C.metal);
  }

  return { thigh, knee, foot };
}

export function buildCartoonZombieFallback(typeKey, type) {
  return buildCartoonZombie(typeKey, type);
}
