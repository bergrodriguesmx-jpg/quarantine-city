// ============================================================
// zombie-procedural.js — v12 "Cartoony"
// ============================================================
// NOVO v12:
//   • Formas arredondadas (esferas icosaédricas, cilindros, cápsulas)
//   • Cabeça 15% maior (estilo chibi/gorducho)
//   • Olhos gigantes com pupila destacada (leitura cartunesca)
//   • Boca larga com dentes visíveis
//   • Torso arredondado com barriga
//   • Membros afunilados com mãos/pés grandes
//   • Assimetria por instância (ombro/cabeça tortos)
//   • Mais variação de roupa/cor por zumbi
// ============================================================

import * as THREE from 'three';

// ─── Geometrias compartilhadas (unitárias, escala = tamanho) ──
const G_SPH     = new THREE.IcosahedronGeometry(0.5, 0);       // low-poly esfera
const G_SPH_HI  = new THREE.IcosahedronGeometry(0.5, 1);       // esfera suave
const G_BOX     = new THREE.BoxGeometry(1, 1, 1);
const G_CYL     = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const G_CYL_TAP = new THREE.CylinderGeometry(0.35, 0.5, 1, 8); // afunila pra cima
const G_CONE    = new THREE.ConeGeometry(0.5, 1, 6);
const G_CAPSULE = new THREE.CapsuleGeometry(0.5, 1, 4, 8);

// ─── Cor ──────────────────────────────────────────────────────
function darkerSkin(hex, amount = 0.6) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(amount);
  return c.getHex();
}

// ─── Material cache ───────────────────────────────────────────
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

// ─── Paleta ───────────────────────────────────────────────────
const C = {
  skin: 0x8ec253, skinDark: 0x4f7a3c,
  shirt: 0x4a637a, shirt2: 0x7a523a, pants: 0x2f3a4a, shoes: 0x1a1a1a,
  bone: 0xf0e8c8, eye: 0xfaf4d8, pupil: 0x101010, mouth: 0x2a0808,
  blood: 0x8a1a22, metal: 0x707d88, metalDark: 0x2a3440,
  gold: 0xe0b040, purple: 0x5a2e6d, red: 0xa83038, acid: 0xa8ff44,
  orange: 0xff8a27, black: 0x181820, white: 0xe8e8e8,
};

// ─── Helper de bloco ──────────────────────────────────────────
function block(parent, pos, size, color, opts = {}) {
  const geo = opts.geo || G_BOX;
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

function computeLocalBox(group, padding = 0.03) {
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
    pt:        { name: 'PEDESTRE',    shirt: C.shirt,     skin: C.skin,     build: 'normal',  variant: 'civil',    scale: 1.00 },
    pt_donkey: { name: 'BURRO',       shirt: 0x4a3a2a,    skin: 0x9e8b7a,   build: 'normal',  variant: 'donkey',   scale: 0.95 },
    judge:     { name: 'JUIZ',        shirt: C.black,     skin: 0xc8a8a8,   build: 'normal',  variant: 'judge',    scale: 1.12 },
    runner:    { name: 'CORREDOR',    shirt: C.shirt2,    skin: C.skin,     build: 'slim',    variant: 'runner',   scale: 0.85 },
    crawler:   { name: 'RASTEJANTE',  shirt: C.shirt,     skin: 0x9a9a9a,   build: 'crawler', variant: 'crawler',  scale: 0.85 },
    worker:    { name: 'TRABALHADOR', shirt: 0x8b5a2b,    skin: 0xc8a878,   build: 'normal',  variant: 'worker',   scale: 1.02 },
    miner:     { name: 'MINEIRO',     shirt: 0x34495e,    skin: 0xb09878,   build: 'normal',  variant: 'miner',    scale: 1.05 },
    spitter:   { name: 'CUSPIDOR',    shirt: 0x4c593b,    skin: C.skin,     build: 'normal',  variant: 'spitter',  scale: 1.00 },
    boomer:    { name: 'EXPLOSIVO',   shirt: 0x6e493c,    skin: 0x9eff66,   build: 'fat',     variant: 'boomer',   scale: 1.10 },
    security:  { name: 'SEGURANÇA',   shirt: 0x1a1a1a,    skin: 0xa88a68,   build: 'normal',  variant: 'security', scale: 1.06 },
    combat:    { name: 'COMBATENTE',  shirt: 0x1a1a1a,    skin: 0xa8a878,   build: 'normal',  variant: 'combat',   scale: 1.00 },
    brute:     { name: 'BRUTAMONTES', shirt: 0x56433a,    skin: C.skin,     build: 'brute',   variant: 'brute',    scale: 1.30 },
    riot:      { name: 'RIOT',        shirt: C.metalDark, skin: 0x72904c,   build: 'brute',   variant: 'riot',     scale: 1.45 },
    queen:     { name: 'QUEEN',       shirt: C.purple,    skin: C.skin,     build: 'normal',  variant: 'queen',    scale: 1.30 },
    reaper:    { name: 'REAPER',      shirt: C.black,     skin: 0x7d9a51,   build: 'normal',  variant: 'reaper',   scale: 1.25 },
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
    torso: isFat ? 1.30 : isBrute ? 1.45 : isSlim ? 0.85 : 1.05,
    arm:   isBrute ? 1.35 : isFat ? 1.15 : isSlim ? 0.90 : 1.05,
    leg:   isBrute ? 1.20 : isFat ? 1.10 : isSlim ? 0.92 : 1.02,
  };

  // Variações individuais (assimetria)
  const shoulderTilt = (Math.random() - 0.5) * 0.10;
  const headTilt = (Math.random() - 0.5) * 0.20;

  // ═══ ROOT + HIPS ═══
  const root = new THREE.Group();
  const Hips = new THREE.Group();
  Hips.name = 'Hips';
  Hips.position.set(0, isCrawler ? 0.30 : 0.92, 0);
  root.add(Hips);

  // PELVIS arredondado
  block(Hips, [0, -0.02, 0], [0.46 * bs.torso, 0.26, 0.30 * bs.torso], C.pants, { geo: G_SPH_HI });
  block(Hips, [0, 0.08, 0], [0.44 * bs.torso, 0.10, 0.32 * bs.torso], 0x4A2A1A);

  // ═══ SPINE LOWER ═══
  const SpineLower = pivot(Hips, [0, 0.10, 0]);
  SpineLower.name = 'Spine';
  block(SpineLower, [0, 0.05, 0], [0.44 * bs.torso, 0.24, 0.28 * bs.torso], cfg.shirt, { geo: G_SPH_HI });

  // Barriga boomer (bem saliente)
  if (variant === 'boomer') {
    block(SpineLower, [0, 0.02, 0.16 * bs.torso], [0.85, 0.72, 0.52], 0x92a856, { geo: G_SPH_HI });
    for (let i = 0; i < 6; i++) {
      const px = -0.24 + (i % 3) * 0.24;
      const py = -0.12 + Math.floor(i / 3) * 0.20;
      block(SpineLower, [px, py, 0.34 * bs.torso], [0.10, 0.10, 0.06], C.orange, { geo: G_SPH });
    }
  }

  // Saco ácido spitter (lado traseiro)
  if (variant === 'spitter') {
    block(SpineLower, [0, 0.05, -0.22], [0.50, 0.50, 0.40], 0x536b34, { geo: G_SPH_HI });
    for (let i = 0; i < 5; i++) {
      block(SpineLower, [-0.24 + i * 0.12, 0.02, 0.18 * bs.torso], [0.09, 0.09, 0.09], C.acid, { geo: G_SPH });
    }
  }

  // Capa da Queen
  if (variant === 'queen') {
    block(SpineLower, [0, -0.35, -0.28], [0.85, 0.95, 0.15], C.red);
    block(SpineLower, [0, -0.38, -0.36], [0.72, 0.10, 0.05], C.gold);
  }

  // Cinto do Reaper
  if (variant === 'reaper') {
    block(SpineLower, [0, -0.10, 0.16 * bs.torso], [0.70, 0.14, 0.10], C.gold);
  }

  // Túnica do Juiz
  if (variant === 'judge') {
    block(SpineLower, [0, -0.25, 0], [0.55 * bs.torso, 0.70, 0.40 * bs.torso], 0x0A0A0A);
  }

  // ═══ SPINE UPPER ═══
  const SpineUpper = pivot(SpineLower, [0, 0.16, 0]);
  SpineUpper.name = 'Spine2';
  SpineUpper.rotation.z = shoulderTilt;

  const chestSize = isBrute ? [1.05, 0.88, 0.58]
                  : isFat   ? [1.00, 0.82, 0.66]
                            : [0.68, 0.74, 0.42];
  block(SpineUpper, [0, 0.05, 0], chestSize, cfg.shirt, { geo: G_SPH_HI });
  // Pescoço de camisa
  block(SpineUpper, [0, 0.34, 0.01], [0.46 * bs.torso, 0.08, 0.32 * bs.torso], 0x1a1a1a);
  // Mancha de sangue no peito
  block(SpineUpper, [-0.14 * bs.torso, 0.10, 0.20 * bs.torso], [0.16, 0.14, 0.04], C.blood);

  // Brute: ombros enormes
  if (variant === 'brute') {
    block(SpineUpper, [-0.58, 0.24, 0], [0.48, 0.46, 0.52], cfg.skin, { geo: G_SPH_HI });
    block(SpineUpper, [ 0.58, 0.24, 0], [0.48, 0.46, 0.52], cfg.skin, { geo: G_SPH_HI });
  }

  // Riot: colete balístico
  if (variant === 'riot') {
    block(SpineUpper, [0, 0.10, 0.22], [0.75, 0.50, 0.14], C.metalDark);
    block(SpineUpper, [0, 0.20, 0.30], [0.18, 0.18, 0.04], C.red, { geo: G_SPH });
  }

  // Queen: gola dourada
  if (variant === 'queen') {
    block(SpineUpper, [0, 0.34, 0.03], [0.78, 0.20, 0.50], C.gold);
  }

  // Judge: cruz vermelha
  if (variant === 'judge') {
    block(SpineUpper, [0, 0.12, 0.24], [0.10, 0.30, 0.04], C.red);
    block(SpineUpper, [0, -0.02, 0.20], [0.70, 0.60, 0.07], 0x0A0A0A);
  }

  // Security: distintivo + rádio
  if (variant === 'security') {
    block(SpineUpper, [-0.16, 0.18, 0.22], [0.12, 0.12, 0.04], C.gold, { geo: G_SPH });
    block(SpineUpper, [0.26, 0.26, 0], [0.12, 0.16, 0.12], 0x0A0A0A);
    block(SpineUpper, [0.26, 0.34, 0.06], [0.05, 0.09, 0.03], 0x111111);
  }

  // Combat: placas táticas
  if (variant === 'combat') {
    block(SpineUpper, [0, 0.10, 0.22], [0.76, 0.56, 0.12], 0x2C3E50);
    for (let i = 0; i < 3; i++) block(SpineUpper, [-0.12 + i * 0.12, 0.02, 0.28], [0.07, 0.12, 0.03], 0x1A1A1A);
    block(SpineUpper, [0.32, -0.10, 0.12], [0.12, 0.34, 0.12], 0x3A2A1A);
  }

  // Worker: avental + crachá
  if (variant === 'worker') {
    block(SpineLower, [0, -0.16, 0.20], [0.48, 0.14, 0.07], 0x3A2A1A);
    block(SpineUpper, [-0.18, 0.18, 0.22], [0.14, 0.16, 0.04], C.gold);
  }

  // Miner: mochila de ferramentas
  if (variant === 'miner') {
    block(SpineLower, [0, 0.12, -0.26], [0.42, 0.42, 0.16], 0x3A3A3A);
    block(SpineLower, [0, 0.12, -0.36], [0.16, 0.16, 0.06], C.gold, { geo: G_SPH });
  }

  // ═══ NECK ═══
  const Neck = pivot(SpineUpper, [0, 0.36, 0]);
  Neck.name = 'Neck';
  block(Neck, [0, 0.04, 0], [0.22, 0.20, 0.22], cfg.skin, { geo: G_SPH_HI });

  // ═══ HEAD ═══
  const Head = pivot(Neck, [0, 0.10, 0]);
  Head.name = 'Head';
  Head.rotation.z = headTilt;
  buildHead(Head, cfg, variant, skinDark);

  // ═══ BRAÇOS ═══
  const armLen = isBrute ? 0.78 : 0.66;
  const armX = (isBrute ? 0.62 : 0.36) * bs.torso;
  const armL = buildArmHierarchy(SpineUpper, +1, armX, armLen, cfg, bs, variant, isBrute);
  const armR = buildArmHierarchy(SpineUpper, -1, armX, armLen, cfg, bs, variant, isBrute);

  // Gear de braço
  if (variant === 'riot') {
    block(armL.shoulder, [0.10, -armLen * 0.5, 0.24], [0.16, 1.10, 0.64], C.metal);
    block(armL.shoulder, [0.10, -armLen * 0.45, 0.32], [0.05, 0.15, 0.02], 0xe4e9e9);
  }
  if (variant === 'queen') {
    block(armL.hand, [0.10, 0.34, 0.10], [0.10, 1.05, 0.10], C.gold);
    block(armL.hand, [0.10, 0.90, 0.10], [0.22, 0.22, 0.22], C.acid, { geo: G_SPH });
  }
  if (variant === 'reaper') {
    block(armL.hand, [0.08, 0.44, 0.14], [0.10, 1.65, 0.10], 0x60472f, { rot: [0, 0, -0.2] });
    block(armL.hand, [0.08, 0.78, 0.14], [0.14, 0.65, 0.14], C.metal, { rot: [0, 0, -0.9] });
  }
  if (variant === 'judge') {
    block(armR.hand, [0, -0.02, 0.12], [0.11, 0.11, 0.32], 0x5D4030);
    block(armR.hand, [0, -0.02, 0.28], [0.26, 0.16, 0.16], 0x3A2A1A);
  }

  // ═══ PERNAS ═══
  const legX = (isBrute ? 0.30 : 0.17) * bs.torso;
  const hipY = -0.06;

  let legL = null, legR = null;
  if (!isCrawler) {
    legL = buildLegHierarchy(Hips, +1, legX, hipY, cfg, bs, isBrute, variant);
    legR = buildLegHierarchy(Hips, -1, legX, hipY, cfg, bs, isBrute, variant);
  } else {
    block(Hips, [-0.16, -0.08, -0.12], [0.22, 0.18, 0.28], C.blood);
    block(Hips, [ 0.16, -0.08, -0.12], [0.22, 0.18, 0.28], skinDark);
  }

  // Pose inicial corredor
  if (variant === 'runner') {
    SpineLower.rotation.x = 0.18;
    SpineUpper.rotation.x = 0.12;
    armL.shoulder.rotation.x = -0.60;
    armR.shoulder.rotation.x = -0.60;
    armL.elbow.rotation.x = 0.95;
    armR.elbow.rotation.x = 0.95;
  }

  // Escala do tipo
  const typeScale = cfg.scale || 1;
  if (typeScale !== 1) root.scale.setScalar(typeScale);

  // Pés no chão (não aplica pra crawler)
  if (!isCrawler) {
    root.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(root);
    Hips.position.y -= bbox.min.y;
    root.updateMatrixWorld(true);
  }

  const localBoxes = {
    head:  computeLocalBox(Head, 0.03),
    torso: computeLocalBox(SpineUpper, 0.03),
    armL:  computeLocalBox(armL.shoulder, 0.03),
    armR:  computeLocalBox(armR.shoulder, 0.03),
    legL:  legL ? computeLocalBox(legL.thigh, 0.03) : computeLocalBox(Hips, 0.03),
    legR:  legR ? computeLocalBox(legR.thigh, 0.03) : computeLocalBox(Hips, 0.03),
  };

  const joints = {
    pelvis: Hips,
    spineLower: SpineLower,
    spineUpper: SpineUpper,
    neck: Neck,
    head: Head,
    shoulderL: armL.shoulder, elbowL: armL.elbow,
    shoulderR: armR.shoulder, elbowR: armR.elbow,
    thighL: legL ? legL.thigh : Hips, kneeL: legL ? legL.knee : Hips, footL: legL ? legL.foot : Hips,
    thighR: legR ? legR.thigh : Hips, kneeR: legR ? legR.knee : Hips, footR: legR ? legR.foot : Hips,
  };

  return {
    root, hips: Hips, scene: root, joints, localBoxes,
    skinColor: cfg.skin, variant, build: cfg.build, isRigged: false,
    headLoll: (Math.random() - 0.5) * 0.3,
    headPitchBase: (Math.random() - 0.5) * 0.2,
    armDroopL: -0.05, armDroopR: -0.05,
    limpAmount: Math.random(),
    limpSide: Math.random() < 0.5 ? -1 : 1,
    walkStyle: Math.random(),
    scale: typeScale,
  };
}

// ══════════════════════════════════════════════════════════════
// HEAD — cabeça grande cartunesca
// ══════════════════════════════════════════════════════════════
function buildHead(Head, cfg, variant, skinDark) {
  // Cabeça principal: esfera achatada e GRANDE
  block(Head, [0, 0.26, 0], [0.58, 0.58, 0.52], cfg.skin, { geo: G_SPH_HI });

  // Mandíbula saliente (dá expressão)
  block(Head, [0, 0.14, 0.10], [0.42, 0.28, 0.36], cfg.skin, { geo: G_SPH_HI });

  if (variant === 'donkey') {
    block(Head, [0, 0.18, 0.32], [0.32, 0.24, 0.34], 0xB8A796, { geo: G_SPH_HI });
    block(Head, [-0.09, 0.14, 0.48], [0.06, 0.06, 0.04], 0x2A1F1A);
    block(Head, [ 0.09, 0.14, 0.48], [0.06, 0.06, 0.04], 0x2A1F1A);
    block(Head, [-0.22, 0.52, 0], [0.12, 0.34, 0.12], cfg.skin, { rot: [0, 0, 0.35] });
    block(Head, [ 0.22, 0.52, 0], [0.12, 0.34, 0.12], cfg.skin, { rot: [0, 0, -0.35] });
    addEye(Head, -0.14, 0.32, 0.24, 1.0, skinDark);
    addEye(Head,  0.14, 0.32, 0.24, 1.0, skinDark);
    return;
  }

  if (variant === 'judge') {
    // Peruca branca (3 camadas)
    block(Head, [0, 0.52, -0.02], [0.62, 0.18, 0.56], 0xf0f0f0);
    block(Head, [0, 0.38, 0.26], [0.48, 0.08, 0.06], 0xf0f0f0);
    addEye(Head, -0.14, 0.28, 0.24, 0.95, skinDark);
    addEye(Head,  0.14, 0.28, 0.24, 0.95, skinDark);
    block(Head, [0, 0.14, 0.26], [0.34, 0.08, 0.06], 0x666666);
    block(Head, [0, 0.00, 0.16], [0.36, 0.24, 0.18], 0x666666);
    return;
  }

  if (variant === 'reaper') {
    // Capuz gigante
    block(Head, [0, 0.40, -0.02], [0.72, 0.52, 0.62], C.black, { geo: G_SPH_HI });
    block(Head, [0, 0.24, 0.26], [0.42, 0.36, 0.10], 0x08090b);
    // Olhos vermelhos brilhantes
    block(Head, [-0.11, 0.27, 0.34], [0.10, 0.06, 0.04], 0xff392d);
    block(Head, [ 0.11, 0.27, 0.34], [0.10, 0.06, 0.04], 0xff392d);
    return;
  }

  if (variant === 'riot') {
    block(Head, [0, 0.54, 0], [0.66, 0.26, 0.62], C.metalDark);
    block(Head, [0, 0.32, 0.28], [0.48, 0.14, 0.08], 0x121b20);
    addEye(Head, -0.14, 0.32, 0.26, 0.95, skinDark);
    addEye(Head,  0.14, 0.32, 0.26, 0.95, skinDark);
    block(Head, [0, 0.06, 0.28], [0.32, 0.12, 0.06], C.mouth);
    for (let i = 0; i < 4; i++) block(Head, [-0.12 + i * 0.08, 0.07, 0.31], [0.045, 0.045, 0.03], C.bone);
    return;
  }

  if (variant === 'queen') {
    // Coroa enorme
    for (let i = 0; i < 5; i++) {
      block(Head, [-0.24 + i * 0.12, 0.82 + (i % 2) * 0.09, 0.02], [0.09, 0.32, 0.09], C.gold, { geo: G_CONE });
    }
    block(Head, [0, 0.62, 0.01], [0.64, 0.12, 0.58], C.gold);
    block(Head, [0, 0.44, -0.06], [0.60, 0.24, 0.60], C.red, { geo: G_SPH_HI });
    addEye(Head, -0.14, 0.30, 0.24, 0.95, skinDark);
    addEye(Head,  0.14, 0.30, 0.24, 0.95, skinDark);
    block(Head, [0, 0.05, 0.28], [0.32, 0.12, 0.04], C.mouth);
    return;
  }

  if (variant === 'worker') {
    block(Head, [0, 0.56, 0], [0.58, 0.18, 0.58], 0x5D4030);
    block(Head, [0, 0.50, 0.32], [0.50, 0.06, 0.24], 0x3A2A1A);
    addEye(Head, -0.14, 0.28, 0.24, 0.95, skinDark);
    addEye(Head,  0.14, 0.28, 0.24, 0.95, skinDark);
    block(Head, [0, 0.05, 0.28], [0.31, 0.12, 0.05], C.mouth);
    for (let i = 0; i < 4; i++) block(Head, [-0.12 + i * 0.08, 0.06, 0.31], [0.04, 0.04, 0.025], C.bone);
    return;
  }

  if (variant === 'miner') {
    // Capacetes com lanterna
    block(Head, [0, 0.56, 0], [0.62, 0.22, 0.62], 0xFFCC00);
    block(Head, [0, 0.66, 0], [0.62, 0.05, 0.14], 0x1A1A1A);
    block(Head, [0, 0.56, 0.32], [0.12, 0.12, 0.08], 0xFFFF88, { geo: G_SPH });
    addEye(Head, -0.14, 0.28, 0.24, 0.95, skinDark);
    addEye(Head,  0.14, 0.28, 0.24, 0.95, skinDark);
    block(Head, [0, 0.05, 0.28], [0.31, 0.12, 0.05], C.mouth);
    return;
  }

  if (variant === 'security') {
    block(Head, [0, 0.54, 0], [0.58, 0.18, 0.58], 0x1A1A1A);
    block(Head, [0, 0.48, 0.32], [0.48, 0.06, 0.22], 0x0A0A0A);
    addEye(Head, -0.14, 0.28, 0.24, 0.95, skinDark);
    addEye(Head,  0.14, 0.28, 0.24, 0.95, skinDark);
    block(Head, [0, 0.05, 0.28], [0.31, 0.12, 0.05], C.mouth);
    return;
  }

  if (variant === 'combat') {
    // Balaclava cobrindo tudo
    block(Head, [0, 0.34, 0], [0.60, 0.44, 0.54], 0x0A0A0A, { geo: G_SPH_HI });
    block(Head, [-0.12, 0.32, 0.28], [0.10, 0.07, 0.04], 0xFF2020);
    block(Head, [ 0.12, 0.32, 0.28], [0.10, 0.07, 0.04], 0xFF2020);
    block(Head, [0, 0.10, 0.28], [0.28, 0.06, 0.04], 0x000000);
    return;
  }

  if (variant === 'spitter') {
    block(Head, [0, 0.54, -0.02], [0.56, 0.14, 0.48], 0x30302a);
    addEye(Head, -0.14, 0.28, 0.24, 0.95, skinDark);
    addEye(Head,  0.14, 0.28, 0.24, 0.95, skinDark);
    block(Head, [0, 0.05, 0.28], [0.32, 0.14, 0.05], C.mouth);
    block(Head, [0, 0.05, 0.33], [0.22, 0.07, 0.05], C.acid);
    return;
  }

  if (variant === 'boomer') {
    block(Head, [0, 0.26, 0], [0.60, 0.58, 0.54], cfg.skin, { geo: G_SPH_HI });
    block(Head, [0.12, 0.62, 0], [0.10, 0.24, 0.10], C.orange, { geo: G_CONE });
    addEye(Head, -0.14, 0.30, 0.24, 0.95, skinDark);
    addEye(Head,  0.14, 0.30, 0.24, 0.95, skinDark);
    block(Head, [0, 0.03, 0.28], [0.34, 0.16, 0.05], C.mouth);
    return;
  }

  if (variant === 'brute') {
    block(Head, [0, 0.26, 0], [0.48, 0.48, 0.46], cfg.skin, { geo: G_SPH_HI });
    addEye(Head, -0.11, 0.28, 0.22, 0.80, skinDark);
    addEye(Head,  0.11, 0.28, 0.22, 0.80, skinDark);
    block(Head, [0.12, 0.20, 0.23], [0.22, 0.06, 0.04], C.blood);
    block(Head, [0, 0.05, 0.24], [0.28, 0.10, 0.05], C.mouth);
    return;
  }

  // ─── Padrão (pt, runner, crawler) ───
  // Cabelo/chapéu de zumbi
  block(Head, [0, 0.52, -0.015], [0.60, 0.16, 0.54], 0x30302a);
  addEye(Head, -0.14, 0.29, 0.25, 0.95, skinDark);
  addEye(Head,  0.14, 0.29, 0.25, 0.95, skinDark);
  // Nariz achatado
  block(Head, [0, 0.18, 0.27], [0.10, 0.14, 0.10], cfg.skin);
  // Boca aberta com dentes
  block(Head, [0, 0.05, 0.26], [0.32, 0.12, 0.05], C.mouth);
  block(Head, [0, -0.01, 0.24], [0.32, 0.06, 0.07], skinDark);
  for (let i = 0; i < 4; i++) block(Head, [-0.12 + i * 0.08, 0.06, 0.30], [0.04, 0.04, 0.025], C.bone);
  // Sangue no rosto
  block(Head, [0.19, 0.14, 0.25], [0.08, 0.05, 0.02], C.blood);
}

// ══════════════════════════════════════════════════════════════
// EYE — olho grande cartunesco
// ══════════════════════════════════════════════════════════════
function addEye(parent, x, y, z, s = 1, darkColor) {
  // Órbita escura (recesso)
  block(parent, [x, y, z], [0.26 * s, 0.28 * s, 0.10], darkColor, { geo: G_SPH });
  // Globo branco
  block(parent, [x, y + 0.005, z + 0.06], [0.20 * s, 0.20 * s, 0.08], C.eye, { geo: G_SPH });
  // Pupila
  block(parent, [x + 0.03 * (x > 0 ? 1 : -1), y - 0.005, z + 0.10], [0.09 * s, 0.13 * s, 0.04], C.pupil, { geo: G_SPH });
}

// ══════════════════════════════════════════════════════════════
// ARM HIERARCHY — braços afunilados com mão grande
// ══════════════════════════════════════════════════════════════
function buildArmHierarchy(parent, side, armX, armLen, cfg, bs, variant, isBrute) {
  const shoulder = pivot(parent, [side * armX, 0.15, 0]);
  shoulder.name = side > 0 ? 'LeftArm' : 'RightArm';
  shoulder.rotation.z = -side * 0.08;

  const upperH = armLen * 0.72;
  const upperC = -armLen * 0.34;
  block(shoulder, [0, upperC, 0],
        [(isBrute ? 0.32 : 0.24 * bs.arm), upperH, (isBrute ? 0.28 : 0.26 * bs.arm)],
        cfg.shirt, { geo: G_CAPSULE });

  const elbow = pivot(shoulder, [0, -armLen * 0.68, 0]);
  elbow.name = side > 0 ? 'LeftForeArm' : 'RightForeArm';

  const foreH = armLen * 0.58;
  const foreC = -armLen * 0.26;
  block(elbow, [0, foreC, 0.015],
        [(isBrute ? 0.30 : 0.22 * bs.arm), foreH, (isBrute ? 0.26 : 0.24 * bs.arm)],
        cfg.skin, { geo: G_CYL_TAP });

  const hand = pivot(elbow, [0, -armLen * 0.52, 0]);
  hand.name = side > 0 ? 'LeftHand' : 'RightHand';

  // MÃO GRANDE (dá ênfase cartunesca)
  block(hand, [0, -0.06, 0.05], [0.28, 0.26, 0.30], cfg.skin, { geo: G_SPH_HI });
  // Dedos
  for (let i = -1; i <= 1; i++) {
    block(hand, [i * 0.08, -0.18, 0.12], [0.06, 0.10, 0.06], cfg.skin, { geo: G_CYL });
  }

  if (variant === 'riot') {
    block(elbow, [0, -armLen * 0.15, 0.18], [0.36, 0.34, 0.10], C.metal);
    block(elbow, [0, -armLen * 0.15, 0.24], [0.06, 0.06, 0.03], C.gold);
  }
  if (variant === 'queen') {
    block(elbow, [0, -armLen * 0.22, 0.16], [0.28, 0.10, 0.06], C.gold);
  }

  return { shoulder, elbow, hand };
}

// ══════════════════════════════════════════════════════════════
// LEG HIERARCHY — pernas afuniladas com bota grande
// ══════════════════════════════════════════════════════════════
function buildLegHierarchy(parent, side, legX, hipY, cfg, bs, isBrute, variant) {
  const thigh = pivot(parent, [side * legX, hipY, 0]);
  thigh.name = side > 0 ? 'LeftUpLeg' : 'RightUpLeg';

  block(thigh, [0, -0.22, 0],
        [(isBrute ? 0.32 : 0.24 * bs.leg), 0.50, (isBrute ? 0.30 : 0.30 * bs.leg)],
        C.pants, { geo: G_CAPSULE });

  const knee = pivot(thigh, [0, -0.46, 0]);
  knee.name = side > 0 ? 'LeftLeg' : 'RightLeg';

  block(knee, [0, -0.22, 0.015],
        [(isBrute ? 0.28 : 0.21 * bs.leg), 0.50, (isBrute ? 0.28 : 0.27 * bs.leg)],
        cfg.skin, { geo: G_CYL_TAP });

  const foot = pivot(knee, [0, -0.46, 0]);
  foot.name = side > 0 ? 'LeftFoot' : 'RightFoot';

  const shoeColor = variant === 'riot' ? C.metalDark : C.shoes;
  // BOTA grande
  block(foot, [0, -0.06, 0.08], [0.32, 0.20, 0.44], shoeColor, { geo: G_SPH_HI });
  block(foot, [0, -0.11, 0.24], [0.30, 0.08, 0.10], variant === 'riot' ? C.metal : 0x151515);

  if (variant === 'riot') {
    block(knee, [0, -0.10, 0.18], [0.34, 0.20, 0.10], C.metal);
  }

  return { thigh, knee, foot };
}

export function buildCartoonZombieFallback(typeKey, type) {
  return buildCartoonZombie(typeKey, type);
}
