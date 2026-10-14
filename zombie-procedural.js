// ============================================================
// zombie-procedural.js — v10
// CORREÇÕES:
//   1. Hierarquia de braços: antebraço dentro do cotovelo
//   2. localBoxes computadas da geometria real (auto-escala)
//   3. Rastejante em pose horizontal completa
//   4. Identidade visual única para 15 tipos
//   5. Frustum culling ativado (padrão Three.js)
// ============================================================

import * as THREE from 'three';

// ─── Geometrias compartilhadas ────────────────────────────────
const GEO_BOX = new THREE.BoxGeometry(1, 1, 1);
const GEO_SPHERE = new THREE.IcosahedronGeometry(1, 0);
const GEO_CONE = new THREE.ConeGeometry(0.5, 1, 5);
const GEO_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

// ─── Cache de materiais ───────────────────────────────────────
const MAT_CACHE = new Map();
function toonMat(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : '');
  let m = MAT_CACHE.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...(opts || {}) });
    MAT_CACHE.set(key, m);
  }
  return m;
}

// ─── Palette ──────────────────────────────────────────────────
const C = {
  skin: 0x86bd55, skinLight: 0xa7d86a, skinDark: 0x456f38,
  shirt: 0x425a70, shirt2: 0x704b3a, pants: 0x303a45, shoes: 0x211f22,
  bone: 0xe0d7ad, eye: 0xf7f0c9, pupil: 0x1a1718, mouth: 0x281416, blood: 0x842d32,
  metal: 0x64727c, metalDark: 0x29343c, gold: 0xd8a83e, purple: 0x4a245d,
  red: 0x982d32, acid: 0x8aff37, orange: 0xff8a27, black: 0x15181d,
};

// ─── Helpers ──────────────────────────────────────────────────
function block(parent, pos, size, color, opts = {}) {
  const geo = opts.geo || GEO_BOX;
  const m = new THREE.Mesh(geo, toonMat(color, opts.matOpts));
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(size[0], size[1], size[2]);
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  // frustumCulled = true (padrão) — seguro com Groups
  parent.add(m);
  return m;
}

function pivot(parent, pos) {
  const p = new THREE.Group();
  p.position.set(pos[0], pos[1], pos[2]);
  parent.add(p);
  return p;
}

// ─── Computa bounding box local REAL (auto-escala) ────────────
function computeLocalBox(group, padding = 0.02) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmpMat = new THREE.Matrix4();

  group.traverse(c => {
    if (!c.isMesh || !c.geometry) return;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    const localBox = c.geometry.boundingBox.clone();
    tmpMat.multiplyMatrices(inv, c.matrixWorld);
    localBox.applyMatrix4(tmpMat);
    box.union(localBox);
  });

  // Padding
  box.min.x -= padding; box.min.y -= padding; box.min.z -= padding;
  box.max.x += padding; box.max.y += padding; box.max.z += padding;
  return box;
}

// ─── Config por tipo ──────────────────────────────────────────
function getTypeConfig(typeKey) {
  const configs = {
    pt:       { name: 'PEDESTRE',    shirt: C.shirt,       skin: C.skin,     build: 'normal',  variant: 'civil' },
    pt_donkey:{ name: 'BURRO',       shirt: 0x4a3a2a,      skin: 0x9e8b7a,   build: 'normal',  variant: 'donkey' },
    judge:    { name: 'JUIZ',        shirt: C.black,       skin: 0xc8a8a8,   build: 'normal',  variant: 'judge' },
    runner:   { name: 'CORREDOR',    shirt: C.shirt2,      skin: C.skin,     build: 'slim',    variant: 'runner' },
    crawler:  { name: 'RASTEJANTE',  shirt: C.shirt,       skin: 0x9a9a9a,   build: 'crawler', variant: 'crawler' },
    worker:   { name: 'TRABALHADOR', shirt: 0x8b5a2b,      skin: 0xc8a878,   build: 'normal',  variant: 'worker' },
    miner:    { name: 'MINEIRO',     shirt: 0x34495e,      skin: 0xb09878,   build: 'normal',  variant: 'miner' },
    spitter:  { name: 'CUSPIDOR',    shirt: 0x4c593b,      skin: C.skin,     build: 'normal',  variant: 'spitter' },
    boomer:   { name: 'EXPLOSIVO',   shirt: 0x6e493c,      skin: 0x88ff66,   build: 'fat',     variant: 'boomer' },
    security: { name: 'SEGURANÇA',   shirt: 0x1a1a1a,      skin: 0xa88a68,   build: 'normal',  variant: 'security' },
    combat:   { name: 'COMBATENTE',  shirt: 0x1a1a1a,      skin: 0xa8a878,   build: 'normal',  variant: 'combat' },
    brute:    { name: 'BRUTAMONTES', shirt: 0x56433a,      skin: C.skin,     build: 'brute',   variant: 'brute',  scale: 1.35 },
    riot:     { name: 'RIOT',        shirt: C.metalDark,   skin: 0x72904c,   build: 'brute',   variant: 'riot',   scale: 1.30 },
    queen:    { name: 'QUEEN',       shirt: C.purple,      skin: C.skin,     build: 'normal',  variant: 'queen',  scale: 1.25 },
    reaper:   { name: 'REAPER',      shirt: C.black,       skin: 0x7d9a51,   build: 'normal',  variant: 'reaper', scale: 1.20 },
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
  const isBrute   = cfg.build === 'brute';
  const isFat     = cfg.build === 'fat';
  const isSlim    = cfg.build === 'slim';
  const scale     = cfg.scale || 1;

  // ═══ ROOT + HIPS ═══
  const root = new THREE.Group();
  const Hips = new THREE.Group();
  Hips.name = 'Hips';
  Hips.position.set(0, isCrawler ? 0.28 : 0.92 * scale, 0);
  root.add(Hips);

  const bs = {
    torso: isFat ? 1.20 : isBrute ? 1.35 : isSlim ? 0.88 : 1.00,
    arm:   isBrute ? 1.25 : isFat ? 1.10 : isSlim ? 0.92 : 1.00,
    leg:   isBrute ? 1.15 : isFat ? 1.05 : isSlim ? 0.94 : 1.00,
  };

  // ═══ PELVIS MESH ═══
  block(Hips, [0, -0.02, 0], [0.42 * bs.torso, 0.22, 0.28 * bs.torso], C.pants);
  block(Hips, [0, 0.08, 0], [0.44 * bs.torso, 0.06, 0.30 * bs.torso], 0x4A2A1A);
  block(Hips, [0, 0.08, 0.16 * bs.torso], [0.09, 0.09, 0.03], C.gold);

  // ═══ SPINE LOWER ═══
  const SpineLower = pivot(Hips, [0, 0.10, 0]);
  SpineLower.name = 'Spine';
  block(SpineLower, [0, 0.04, 0], [0.40 * bs.torso, 0.20, 0.26 * bs.torso], cfg.shirt);

  // Barriga para fat/boomer
  if (variant === 'boomer') {
    block(SpineLower, [0, 0.02, 0.14 * bs.torso], [0.72, 0.62, 0.42], 0x81934c, { geo: GEO_SPHERE });
    for (let i = 0; i < 5; i++) {
      const px = -0.22 + (i % 3) * 0.22;
      const py = -0.10 + Math.floor(i / 3) * 0.18;
      block(SpineLower, [px, py, 0.30 * bs.torso], [0.08, 0.08, 0.05], C.orange, { geo: GEO_SPHERE });
    }
  }

  // Saco ácido do spitter
  if (variant === 'spitter') {
    block(SpineLower, [0, 0.04, -0.20], [0.42, 0.42, 0.32], 0x536b34, { geo: GEO_SPHERE });
    for (let i = 0; i < 4; i++) {
      block(SpineLower, [-0.20 + i * 0.14, 0.02, 0.16 * bs.torso], [0.07, 0.07, 0.07], C.acid, { geo: GEO_SPHERE });
    }
  }

  // Capa da Queen (nas costas)
  if (variant === 'queen') {
    block(SpineLower, [0, -0.30, -0.24], [0.72, 0.78, 0.12], C.red);
    block(SpineLower, [0, -0.32, -0.31], [0.62, 0.08, 0.04], C.gold);
  }

  // Cinto do Reaper
  if (variant === 'reaper') {
    block(SpineLower, [0, -0.10, 0.14 * bs.torso], [0.66, 0.10, 0.08], C.gold);
  }

  // Túnica do Juiz (cobre pernas)
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

  // Colarinho
  block(SpineUpper, [0, 0.32, 0.01], [0.42 * bs.torso, 0.06, 0.30 * bs.torso], 0x222222);

  // Mancha de sangue genérica
  block(SpineUpper, [-0.12 * bs.torso, 0.10, 0.17 * bs.torso], [0.14, 0.12, 0.03], C.blood);

  // ─── FEATURES ESPECÍFICAS DO TORSO ───

  // Brutamontes: ombros enormes
  if (variant === 'brute') {
    block(SpineUpper, [-0.53, 0.20, 0], [0.43, 0.40, 0.47], cfg.skin);
    block(SpineUpper, [ 0.53, 0.20, 0], [0.43, 0.40, 0.47], cfg.skin);
  }

  // RIOT: placa peitoral
  if (variant === 'riot') {
    block(SpineUpper, [0, 0.10, 0.19], [0.67, 0.43, 0.12], C.metalDark);
    block(SpineUpper, [0, 0.20, 0.26], [0.15, 0.15, 0.03], C.red);
  }

  // QUEEN: colarinho régio
  if (variant === 'queen') {
    block(SpineUpper, [0, 0.32, 0.03], [0.72, 0.17, 0.46], C.gold);
  }

  // JUIZ: gravata vermelha + colete
  if (variant === 'judge') {
    block(SpineUpper, [0, 0.12, 0.20], [0.08, 0.25, 0.03], C.red);
    block(SpineUpper, [0, -0.02, 0.16], [0.66, 0.55, 0.06], 0x0A0A0A);
  }

  // SEGURANÇA: distintivo + rádio
  if (variant === 'security') {
    block(SpineUpper, [-0.14, 0.16, 0.20], [0.10, 0.10, 0.03], C.gold);
    block(SpineUpper, [0.22, 0.24, 0], [0.10, 0.14, 0.10], 0x0A0A0A);
    block(SpineUpper, [0.22, 0.30, 0.05], [0.04, 0.08, 0.02], 0x111111);
  }

  // COMBATENTE: colete tático + cartucheira
  if (variant === 'combat') {
    block(SpineUpper, [0, 0.10, 0.19], [0.68, 0.48, 0.10], 0x2C3E50);
    for (let i = 0; i < 3; i++) {
      block(SpineUpper, [-0.10 + i * 0.10, 0.02, 0.25], [0.06, 0.10, 0.03], 0x1A1A1A);
    }
    block(SpineUpper, [0.28, -0.10, 0.10], [0.10, 0.30, 0.10], 0x3A2A1A);
  }

  // TRABALHADOR: cinto de ferramentas
  if (variant === 'worker') {
    block(SpineLower, [0, -0.14, 0.18], [0.42, 0.12, 0.06], 0x3A2A1A);
    block(SpineUpper, [-0.16, 0.16, 0.20], [0.12, 0.14, 0.03], C.gold);
  }

  // MINEIRO: mochila com lanterna
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
  buildHead(Head, cfg, variant);

  // ═══ BRAÇOS — HIERARQUIA CORRIGIDA ═══
  const armLen = isBrute ? 0.72 : 0.62;
  const armX = (isBrute ? 0.55 : 0.32) * bs.torso;

  const armL = buildArmHierarchy(SpineUpper, +1, armX, armLen, cfg, bs, variant, isBrute);
  const armR = buildArmHierarchy(SpineUpper, -1, armX, armLen, cfg, bs, variant, isBrute);

  // Gear específico por tipo
  if (variant === 'riot') {
    // Escudo no braço esquerdo
    block(armL.shoulder, [0.10, -armLen * 0.5, 0.20], [0.15, 0.95, 0.56], C.metal);
    block(armL.shoulder, [0.10, -armLen * 0.45, 0.27], [0.05, 0.15, 0.02], 0xe4e9e9);
  }
  if (variant === 'queen') {
    // Cetro
    block(armL.hand, [0.10, 0.30, 0.10], [0.09, 0.92, 0.09], C.gold);
    block(armL.hand, [0.10, 0.80, 0.10], [0.19, 0.19, 0.19], C.acid, { geo: GEO_SPHERE });
  }
  if (variant === 'reaper') {
    // Foice
    block(armL.hand, [0.08, 0.40, 0.12], [0.09, 1.50, 0.09], 0x60472f, { rot: [0, 0, -0.2] });
    block(armL.hand, [0.08, 0.70, 0.12], [0.12, 0.58, 0.12], C.metal, { rot: [0, 0, -0.9] });
  }
  if (variant === 'judge') {
    // Martelo no braço direito
    block(armR.hand, [0, -0.02, 0.10], [0.10, 0.10, 0.28], 0x5D4030);
    block(armR.hand, [0, -0.02, 0.24], [0.22, 0.14, 0.14], 0x3A2A1A);
  }

  // ═══ PERNAS — HIERARQUIA CORRIGIDA ═══
  const legX = (isBrute ? 0.27 : 0.15) * bs.torso;
  const hipY = -0.06;

  let legL = null, legR = null;
  if (!isCrawler) {
    legL = buildLegHierarchy(Hips, +1, legX, hipY, cfg, bs, isBrute, variant);
    legR = buildLegHierarchy(Hips, -1, legX, hipY, cfg, bs, isBrute, variant);
  }

  // ═══ CRAWLER — pose horizontal completa ═══
  if (isCrawler) {
    // Rotaciona o tronco para frente (deitado)
    SpineLower.rotation.x = 1.30;      // ~75° para frente
    SpineUpper.rotation.x = 0.15;      // leve arco no peito
    Neck.rotation.x = -1.10;           // pescoço levanta a cabeça
    Head.rotation.x = -0.30;           // cabeça olhando pra frente

    // Braços para baixo + ligeiramente para frente (rastejando)
    armL.shoulder.rotation.x = -0.80;
    armR.shoulder.rotation.x = -0.80;
    armL.shoulder.rotation.z = -0.25;
    armR.shoulder.rotation.z = 0.25;
    armL.elbow.rotation.x = 0.60;
    armR.elbow.rotation.x = 0.60;

    // Stumps no lugar das pernas
    block(Hips, [-0.15, -0.08, -0.10], [0.20, 0.16, 0.25], C.blood);
    block(Hips, [ 0.15, -0.08, -0.10], [0.20, 0.16, 0.25], cfg.skinDark);

    // Sobe o quadril (pra ficar no chão)
    Hips.position.y = 0.28;
  }

  // ═══ CORREDOR — inclina o corpo ═══
  if (variant === 'runner') {
    SpineLower.rotation.x = 0.15;
    SpineUpper.rotation.x = 0.10;
    armL.shoulder.rotation.x = -0.55;
    armR.shoulder.rotation.x = -0.55;
    armL.elbow.rotation.x = 0.90;
    armR.elbow.rotation.x = 0.90;
  }

  // ═══ AJUSTE FINAL: pés no chão ═══
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  Hips.position.y -= bbox.min.y;
  root.updateMatrixWorld(true);

  // ═══ LOCAL BOXES — COMPUTADAS DA GEOMETRIA REAL ═══
  const localBoxes = {
    head:  computeLocalBox(Head, 0.02),
    torso: computeLocalBox(SpineUpper, 0.02),
    armL:  computeLocalBox(armL.shoulder, 0.02),
    armR:  computeLocalBox(armR.shoulder, 0.02),
    legL:  legL ? computeLocalBox(legL.thigh, 0.02) : computeLocalBox(Hips, 0.02),
    legR:  legR ? computeLocalBox(legR.thigh, 0.02) : computeLocalBox(Hips, 0.02),
  };

  // ═══ JOINTS ═══
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
    scale:         scale,
  };
}

// ══════════════════════════════════════════════════════════════
// HEAD — features únicas por tipo
// ══════════════════════════════════════════════════════════════
function buildHead(Head, cfg, variant) {
  const headSize = [0.48, 0.48, 0.43];

  // Crânio
  block(Head, [0, 0.24, 0], headSize, cfg.skin);

  // ─── VARIANTES ESPECIAIS ───

  if (variant === 'donkey') {
    // Focinho comprido
    block(Head, [0, 0.16, 0.28], [0.28, 0.20, 0.30], 0xB8A796);
    // Narinas
    block(Head, [-0.08, 0.12, 0.44], [0.05, 0.05, 0.03], 0x2A1F1A);
    block(Head, [ 0.08, 0.12, 0.44], [0.05, 0.05, 0.03], 0x2A1F1A);
    // Orelhas grandes
    block(Head, [-0.20, 0.48, 0], [0.10, 0.30, 0.10], cfg.skin, { rot: [0, 0, 0.35] });
    block(Head, [ 0.20, 0.48, 0], [0.10, 0.30, 0.10], cfg.skin, { rot: [0, 0, -0.35] });
    // Olhos
    addEye(Head, -0.12, 0.30, 0.20, 0.9);
    addEye(Head,  0.12, 0.30, 0.20, 0.9);
    return;
  }

  if (variant === 'judge') {
    // Cabelo grisalho
    block(Head, [0, 0.48, -0.02], [0.52, 0.14, 0.46], 0x888888);
    // Sobrancelha pesada
    block(Head, [0, 0.32, 0.22], [0.40, 0.06, 0.04], 0x888888);
    // Olhos severos
    addEye(Head, -0.12, 0.26, 0.22, 0.85);
    addEye(Head,  0.12, 0.26, 0.22, 0.85);
    // Bigode
    block(Head, [0, 0.14, 0.22], [0.30, 0.07, 0.06], 0x666666);
    // Barba quadrada
    block(Head, [0, 0.02, 0.14], [0.32, 0.20, 0.16], 0x666666);
    return;
  }

  if (variant === 'reaper') {
    // Capuz
    block(Head, [0, 0.37, -0.02], [0.62, 0.44, 0.54], C.black);
    block(Head, [0, 0.22, 0.23], [0.38, 0.32, 0.08], 0x08090b);
    // Olhos vermelhos brilhantes
    block(Head, [-0.10, 0.25, 0.30], [0.08, 0.05, 0.03], 0xff392d);
    block(Head, [ 0.10, 0.25, 0.30], [0.08, 0.05, 0.03], 0xff392d);
    return;
  }

  if (variant === 'riot') {
    // Capacete tático
    block(Head, [0, 0.50, 0], [0.58, 0.22, 0.54], C.metalDark);
    block(Head, [0, 0.30, 0.24], [0.44, 0.12, 0.06], 0x121b20);
    // Olhos por trás do visor
    addEye(Head, -0.12, 0.30, 0.22, 0.85);
    addEye(Head,  0.12, 0.30, 0.22, 0.85);
    // Boca visível
    block(Head, [0, 0.06, 0.24], [0.28, 0.10, 0.04], C.mouth);
    // Dentes
    for (let i = 0; i < 3; i++) block(Head, [-0.08 + i * 0.08, 0.07, 0.27], [0.04, 0.04, 0.02], C.bone);
    return;
  }

  if (variant === 'queen') {
    // Coroa
    for (let i = 0; i < 5; i++) {
      block(Head, [-0.20 + i * 0.10, 0.72 + (i % 2) * 0.07, 0.02], [0.07, 0.26, 0.07], C.gold, { geo: GEO_CONE });
    }
    block(Head, [0, 0.56, 0.01], [0.56, 0.10, 0.50], C.gold);
    // Cabelo longo vermelho
    block(Head, [0, 0.40, -0.06], [0.52, 0.20, 0.52], C.red);
    // Olhos
    addEye(Head, -0.12, 0.28, 0.22, 0.85);
    addEye(Head,  0.12, 0.28, 0.22, 0.85);
    // Boca
    block(Head, [0, 0.05, 0.24], [0.28, 0.10, 0.04], C.mouth);
    return;
  }

  if (variant === 'worker') {
    // Chapéu de aba
    block(Head, [0, 0.52, 0], [0.52, 0.14, 0.52], 0x5D4030);
    block(Head, [0, 0.46, 0.28], [0.44, 0.05, 0.22], 0x3A2A1A);
    // Olhos
    addEye(Head, -0.12, 0.27, 0.22, 0.85);
    addEye(Head,  0.12, 0.27, 0.22, 0.85);
    // Boca
    block(Head, [0, 0.05, 0.24], [0.27, 0.10, 0.045], C.mouth);
    for (let i = 0; i < 3; i++) block(Head, [-0.08 + i * 0.08, 0.06, 0.27], [0.035, 0.035, 0.02], C.bone);
    return;
  }

  if (variant === 'miner') {
    // Capacete com lanterna
    block(Head, [0, 0.52, 0], [0.54, 0.18, 0.54], 0xFFCC00);
    block(Head, [0, 0.60, 0], [0.56, 0.04, 0.12], 0x1A1A1A);
    block(Head, [0, 0.52, 0.28], [0.10, 0.10, 0.06], 0xFFFF88);
    // Olhos
    addEye(Head, -0.12, 0.27, 0.22, 0.85);
    addEye(Head,  0.12, 0.27, 0.22, 0.85);
    // Boca
    block(Head, [0, 0.05, 0.24], [0.27, 0.10, 0.045], C.mouth);
    return;
  }

  if (variant === 'security') {
    // Boné preto
    block(Head, [0, 0.50, 0], [0.52, 0.14, 0.52], 0x1A1A1A);
    block(Head, [0, 0.44, 0.28], [0.42, 0.05, 0.20], 0x0A0A0A);
    // Olhos
    addEye(Head, -0.12, 0.27, 0.22, 0.85);
    addEye(Head,  0.12, 0.27, 0.22, 0.85);
    // Boca
    block(Head, [0, 0.05, 0.24], [0.27, 0.10, 0.045], C.mouth);
    return;
  }

  if (variant === 'combat') {
    // Balaclava
    block(Head, [0, 0.32, 0], [0.51, 0.36, 0.46], 0x0A0A0A);
    // Olhos vermelhos brilhantes
    block(Head, [-0.11, 0.30, 0.24], [0.09, 0.06, 0.03], 0xFF2020);
    block(Head, [ 0.11, 0.30, 0.24], [0.09, 0.06, 0.03], 0xFF2020);
    // Fenda da boca
    block(Head, [0, 0.10, 0.24], [0.24, 0.05, 0.03], 0x000000);
    return;
  }

  if (variant === 'spitter') {
    // Cabelo ralo
    block(Head, [0, 0.48, -0.02], [0.50, 0.12, 0.44], 0x30302a);
    // Olhos
    addEye(Head, -0.12, 0.27, 0.22, 0.85);
    addEye(Head,  0.12, 0.27, 0.22, 0.85);
    // Boca com ácido
    block(Head, [0, 0.05, 0.24], [0.28, 0.12, 0.045], C.mouth);
    block(Head, [0, 0.05, 0.28], [0.18, 0.06, 0.04], C.acid);
    return;
  }

  if (variant === 'boomer') {
    // Cabeça inchada
    block(Head, [0, 0.24, 0], [0.52, 0.50, 0.46], cfg.skin);
    // Pavio
    block(Head, [0.10, 0.54, 0], [0.08, 0.20, 0.08], C.orange);
    // Olhos
    addEye(Head, -0.12, 0.28, 0.22, 0.85);
    addEye(Head,  0.12, 0.28, 0.22, 0.85);
    // Boca grande
    block(Head, [0, 0.03, 0.24], [0.30, 0.14, 0.045], C.mouth);
    return;
  }

  if (variant === 'brute') {
    // Cabeça pequena relativa ao corpo
    block(Head, [0, 0.24, 0], [0.42, 0.42, 0.40], cfg.skin);
    // Olhos pequenos
    addEye(Head, -0.10, 0.26, 0.20, 0.7);
    addEye(Head,  0.10, 0.26, 0.20, 0.7);
    // Cicatriz
    block(Head, [0.10, 0.18, 0.21], [0.20, 0.05, 0.03], C.blood);
    // Boca
    block(Head, [0, 0.05, 0.21], [0.26, 0.10, 0.04], C.mouth);
    return;
  }

  // ─── PADRÃO (pt, runner, crawler) ───
  // Cabelo
  block(Head, [0, 0.48, -0.015], [0.51, 0.13, 0.46], 0x30302a);

  // Olhos
  addEye(Head, -0.12, 0.275, 0.224, 0.82);
  addEye(Head,  0.12, 0.275, 0.224, 0.82);

  // Nariz
  block(Head, [0, 0.165, 0.25], [0.09, 0.12, 0.09], cfg.skin);

  // Boca
  block(Head, [0, 0.05, 0.239], [0.27, 0.10, 0.045], C.mouth);
  block(Head, [0, -0.005, 0.22], [0.28, 0.055, 0.07], C.skinDark);

  // Dentes
  for (let i = 0; i < 3; i++) {
    block(Head, [-0.08 + i * 0.08, 0.06, 0.27], [0.035, 0.035, 0.02], C.bone);
  }

  // Ferimento
  block(Head, [0.17, 0.13, 0.229], [0.07, 0.04, 0.018], C.blood);
}

// ══════════════════════════════════════════════════════════════
// EYE helper
// ══════════════════════════════════════════════════════════════
function addEye(parent, x, y, z, s = 1) {
  block(parent, [x, y, z],                     [0.22 * s, 0.23 * s, 0.09], C.skinDark);
  block(parent, [x, y + 0.005, z + 0.052],     [0.15 * s, 0.145 * s, 0.055], C.eye);
  block(parent, [x + 0.025 * (x > 0 ? 1 : -1), y - 0.005, z + 0.087],
        [0.055 * s, 0.09 * s, 0.025], C.pupil);
}

// ══════════════════════════════════════════════════════════════
// ARM HIERARCHY — CORRIGIDO: antebraço dentro do cotovelo
// ══════════════════════════════════════════════════════════════
function buildArmHierarchy(parent, side, armX, armLen, cfg, bs, variant, isBrute) {
  // 1. Shoulder pivot
  const shoulder = pivot(parent, [side * armX, 0.15, 0]);
  shoulder.name = side > 0 ? 'LeftArm' : 'RightArm';
  shoulder.rotation.z = -side * 0.06;

  // 2. Mesh do braço (parte de cima)
  const upperSize = isBrute ? [0.30, armLen * 0.70, 0.24] : [0.20 * bs.arm, armLen * 0.70, 0.24 * bs.arm];
  block(shoulder, [0, -armLen * 0.32, 0], upperSize, cfg.shirt);

  // 3. Elbow pivot — FILHO do shoulder
  const elbow = pivot(shoulder, [0, -armLen * 0.65, 0]);
  elbow.name = side > 0 ? 'LeftForeArm' : 'RightForeArm';

  // 4. Mesh do antebraço — FILHO do elbow ✅
  const foreSize = isBrute ? [0.30, armLen * 0.55, 0.25] : [0.21 * bs.arm, armLen * 0.55, 0.25 * bs.arm];
  block(elbow, [0, -armLen * 0.25, 0.015], foreSize, cfg.skin);

  // 5. Hand pivot — FILHO do elbow
  const hand = pivot(elbow, [0, -armLen * 0.50, 0]);
  hand.name = side > 0 ? 'LeftHand' : 'RightHand';

  // 6. Mesh da mão — FILHO do hand ✅
  block(hand, [0, -0.05, 0.04], [0.22, 0.20, 0.23], cfg.skin);

  // 7. Features específicas no braço
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
// LEG HIERARCHY — já estava correta, mantida
// ══════════════════════════════════════════════════════════════
function buildLegHierarchy(parent, side, legX, hipY, cfg, bs, isBrute, variant) {
  // Thigh pivot
  const thigh = pivot(parent, [side * legX, hipY, 0]);
  thigh.name = side > 0 ? 'LeftUpLeg' : 'RightUpLeg';

  // Coxa
  block(thigh, [0, -0.20, 0], [(isBrute ? 0.30 : 0.20) * bs.leg, 0.46, 0.28 * bs.leg], C.pants);

  // Knee pivot
  const knee = pivot(thigh, [0, -0.42, 0]);
  knee.name = side > 0 ? 'LeftLeg' : 'RightLeg';

  // Canela
  block(knee, [0, -0.18, 0.015], [(isBrute ? 0.26 : 0.18) * bs.leg, 0.42, 0.26 * bs.leg], cfg.skin);

  // Foot pivot
  const foot = pivot(knee, [0, -0.42, 0]);
  foot.name = side > 0 ? 'LeftFoot' : 'RightFoot';

  // Pé
  const shoeColor = variant === 'riot' ? C.metalDark : C.shoes;
  block(foot, [0, -0.06, 0.06], [0.26, 0.16, 0.38], shoeColor);
  block(foot, [0, -0.10, 0.20], [0.26, 0.06, 0.08], variant === 'riot' ? C.metal : 0x151515);

  // Features específicas
  if (variant === 'riot') {
    block(knee, [0, -0.10, 0.14], [0.30, 0.16, 0.08], C.metal);
  }

  return { thigh, knee, foot };
}

export function buildCartoonZombieFallback(typeKey, type) {
  return buildCartoonZombie(typeKey, type);
}
