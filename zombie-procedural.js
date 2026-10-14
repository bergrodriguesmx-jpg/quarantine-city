// ============================================================
// zombie-procedural.js — v7
// Anatomia humana + Bones Mixamo exatos + Meshes contínuos
// Design cartoon preservado. Pronto pra animações FBX.
// ============================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const MAT_CACHE = new Map();
function toonMat(color) {
  let m = MAT_CACHE.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    MAT_CACHE.set(color, m);
  }
  return m;
}

const RB_CACHE = new Map();
function rb(w, h, d, r = 0.02) {
  const k = `${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`;
  let g = RB_CACHE.get(k);
  if (!g) {
    const minDim = Math.min(w, h, d);
    const radius = Math.min(r, minDim * 0.45);
    g = minDim < 0.06
      ? new THREE.BoxGeometry(w, h, d)
      : new RoundedBoxGeometry(w, h, d, 2, radius);
    RB_CACHE.set(k, g);
  }
  return g;
}

function pickColor(palette, fallback) {
  if (!palette || palette.length === 0) return fallback;
  return palette[Math.floor(Math.random() * palette.length)];
}

function pickBuild(typeKey) {
  if (typeKey === 'brute' || typeKey === 'riot') return 'brute';
  if (typeKey === 'runner' || typeKey === 'crawler') return 'slim';
  if (typeKey === 'boomer') return 'fat';
  const r = Math.random();
  if (r < 0.25) return 'slim';
  if (r < 0.80) return 'normal';
  return 'fat';
}

function buildScale(build) {
  switch (build) {
    case 'slim':  return { torso: 0.88, arms: 0.92, legs: 0.94, head: 1.00 };
    case 'fat':   return { torso: 1.20, arms: 1.08, legs: 1.04, head: 0.96 };
    case 'brute': return { torso: 1.32, arms: 1.22, legs: 1.12, head: 1.04 };
    default:      return { torso: 1.00, arms: 1.00, legs: 1.00, head: 1.00 };
  }
}

function disableFrustumCulling(obj) {
  obj.traverse(c => {
    if (c.isMesh) {
      c.frustumCulled = false;
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

// ════════════════════════════════════════════════════════════
// HEADGEAR
// ════════════════════════════════════════════════════════════
function makeHeadgear(headgear) {
  const g = new THREE.Group();
  if (!headgear) return g;

  if (headgear === 'cap_brown' || headgear === 'cap_red' || headgear === 'cap_black') {
    const col = headgear === 'cap_red' ? 0xE74C3C : headgear === 'cap_brown' ? 0x5D4030 : 0x1A1A1A;
    const mat = toonMat(col);
    const cap = new THREE.Mesh(rb(0.42, 0.14, 0.42, 0.04), mat);
    cap.position.set(0, 0.24, 0); g.add(cap);
    const brim = new THREE.Mesh(rb(0.40, 0.05, 0.20, 0.01), mat);
    brim.position.set(0, 0.20, 0.26); g.add(brim);
  } else if (headgear === 'helmet_yellow') {
    const mat = toonMat(0xFFCC00);
    const helmet = new THREE.Mesh(rb(0.46, 0.18, 0.46, 0.08), mat);
    helmet.position.set(0, 0.24, 0); g.add(helmet);
    const stripe = new THREE.Mesh(rb(0.48, 0.04, 0.10, 0.01), toonMat(0x1A1A1A));
    stripe.position.set(0, 0.28, 0); g.add(stripe);
    const lamp = new THREE.Mesh(rb(0.10, 0.10, 0.06, 0.02), toonMat(0xFFFF88));
    lamp.position.set(0, 0.24, 0.26); g.add(lamp);
  } else if (headgear === 'balaclava') {
    const mat = toonMat(0x0A0A0A);
    const mask = new THREE.Mesh(rb(0.42, 0.34, 0.42, 0.05), mat);
    mask.position.set(0, 0.10, 0); g.add(mask);
    for (const s of [-1, 1]) {
      const hole = new THREE.Mesh(rb(0.10, 0.06, 0.02, 0.005), toonMat(0xFF2020));
      hole.position.set(s * 0.10, 0.16, 0.22); g.add(hole);
    }
  } else if (headgear === 'hood') {
    const mat = toonMat(0x0A0A0A);
    const hood = new THREE.Mesh(rb(0.52, 0.52, 0.50, 0.12), mat);
    hood.position.set(0, 0.14, -0.04); g.add(hood);
    const shadow = new THREE.Mesh(rb(0.32, 0.32, 0.06, 0.05), toonMat(0x000000));
    shadow.position.set(0, 0.14, 0.22); g.add(shadow);
  } else if (headgear === 'crown') {
    const mat = toonMat(0xFFD700);
    const crown = new THREE.Mesh(rb(0.44, 0.12, 0.44, 0.03), mat);
    crown.position.set(0, 0.32, 0); g.add(crown);
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.10, 4), mat);
      spike.position.set(-0.14 + i * 0.09, 0.42, 0); g.add(spike);
    }
  }
  return g;
}

// ════════════════════════════════════════════════════════════
// HEAD VISUAL
// ════════════════════════════════════════════════════════════
function buildHeadVisual(c, variant, opts) {
  const g = new THREE.Group();
  const skinMat = opts.skinMat;
  const eyeMat = toonMat(c.eyeWhite);
  const pupilMat = toonMat(c.pupil);
  const mouthMat = toonMat(c.mouth);
  const bloodMat = toonMat(c.blood);
  const toothMat = toonMat(c.tooth);
  const hairMat = toonMat(c.hair);

  // Crânio (grande, cartoon)
  const skull = new THREE.Mesh(rb(0.36, 0.40, 0.36, 0.08), skinMat);
  g.add(skull);

  // Sobrancelha
  const brow = new THREE.Mesh(rb(0.28, 0.05, 0.03, 0.005), hairMat);
  brow.position.set(0, 0.14, 0.19);
  brow.rotation.z = 0.10;
  g.add(brow);

  if (variant === 'donkey') {
    const muzzle = new THREE.Mesh(rb(0.24, 0.20, 0.32, 0.06), toonMat(0xB8A796));
    muzzle.position.set(0, -0.06, 0.28); g.add(muzzle);
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(rb(0.05, 0.05, 0.03, 0.01), toonMat(0x2A1F1A));
      n.position.set(s * 0.08, 0, 0.42); g.add(n);
    }
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(rb(0.10, 0.28, 0.10, 0.04), skinMat);
      ear.position.set(s * 0.17, 0.28, -0.02);
      ear.rotation.z = s * 0.35;
      g.add(ear);
    }
  } else {
    const nose = new THREE.Mesh(rb(0.08, 0.08, 0.07, 0.02), skinMat);
    nose.position.set(0, -0.02, 0.20); g.add(nose);
  }

  if (variant !== 'donkey') {
    // Olhos
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(rb(0.12, 0.14, 0.04, 0.02), eyeMat);
      eye.position.set(s * 0.09, 0.04, 0.19); g.add(eye);
      const pupil = new THREE.Mesh(rb(0.05, 0.06, 0.02, 0.01), pupilMat);
      pupil.position.set(s * 0.09 + (Math.random() - 0.5) * 0.03, 0.03, 0.21); g.add(pupil);
      const lid = new THREE.Mesh(rb(0.12, 0.05, 0.05, 0.01), skinMat);
      lid.position.set(s * 0.09, 0.08, 0.19);
      lid.rotation.x = 0.35;
      g.add(lid);
      const sock = new THREE.Mesh(rb(0.13, 0.05, 0.02, 0.005), toonMat(0x2A1A1A));
      sock.position.set(s * 0.09, -0.02, 0.20); g.add(sock);
    }
    // Boca
    const mouth = new THREE.Mesh(rb(0.22, 0.10, 0.02, 0.01), mouthMat);
    mouth.position.set(0, -0.11, 0.20); g.add(mouth);
    const gum = new THREE.Mesh(rb(0.20, 0.03, 0.03, 0.005), toonMat(0x8B0000));
    gum.position.set(0, -0.09, 0.21); g.add(gum);
    const nTeeth = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < nTeeth; i++) {
      const tx = -0.075 + i * (0.15 / Math.max(1, nTeeth - 1));
      const tooth = new THREE.Mesh(rb(0.035, 0.05, 0.03, 0.005), toothMat);
      tooth.position.set(tx, -0.095, 0.22);
      tooth.rotation.z = (Math.random() - 0.5) * 0.2;
      g.add(tooth);
    }
  }

  if (variant === 'judge') {
    const grayHair = toonMat(0x888888);
    const must = new THREE.Mesh(rb(0.26, 0.06, 0.06, 0.02), grayHair);
    must.position.set(0, -0.09, 0.20); g.add(must);
    const beard = new THREE.Mesh(rb(0.28, 0.18, 0.16, 0.05), grayHair);
    beard.position.set(0, -0.22, 0.12); g.add(beard);
    const hairTop = new THREE.Mesh(rb(0.40, 0.10, 0.40, 0.04), grayHair);
    hairTop.position.set(0, 0.22, 0); g.add(hairTop);
  } else if (variant !== 'donkey' && !opts.headgear) {
    const hairTop = new THREE.Mesh(rb(0.40, 0.10, 0.38, 0.04), hairMat);
    hairTop.position.set(0, 0.22, 0); g.add(hairTop);
    for (const s of [-1, 1]) {
      const tuft = new THREE.Mesh(rb(0.07, 0.14, 0.10, 0.03), hairMat);
      tuft.position.set(s * 0.21, 0.14, -0.03); g.add(tuft);
    }
  }

  const wSide = Math.random() < 0.5 ? -1 : 1;
  const wound = new THREE.Mesh(rb(0.13, 0.13, 0.04, 0.02), bloodMat);
  wound.position.set(wSide * 0.13, 0.12, 0.19);
  g.add(wound);

  g.add(makeHeadgear(opts.headgear));
  return g;
}

// ════════════════════════════════════════════════════════════
// HAND — palma + dedos, direção +X
// ════════════════════════════════════════════════════════════
function buildHandVisual(skinMat) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(rb(0.14, 0.13, 0.06, 0.02), skinMat);
  palm.position.set(0.06, 0, 0);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(rb(0.10, 0.026, 0.05, 0.008), skinMat);
    finger.position.set(0.17, -0.045 + i * 0.03, 0);
    g.add(finger);
  }
  const thumb = new THREE.Mesh(rb(0.06, 0.032, 0.032, 0.008), skinMat);
  thumb.position.set(0.10, -0.055, 0.035);
  thumb.rotation.z = 0.5;
  g.add(thumb);
  return g;
}

function buildFootVisual(shoeMat, accentMat) {
  const g = new THREE.Group();
  const sole = new THREE.Mesh(rb(0.20, 0.03, 0.34, 0.01), accentMat);
  sole.position.set(0, -0.10, 0.06); g.add(sole);
  const foot = new THREE.Mesh(rb(0.19, 0.12, 0.30, 0.03), shoeMat);
  foot.position.set(0, -0.02, 0.06); g.add(foot);
  const toe = new THREE.Mesh(rb(0.19, 0.07, 0.09, 0.02), accentMat);
  toe.position.set(0, -0.06, 0.20); g.add(toe);
  return g;
}

// ════════════════════════════════════════════════════════════
// BUILDER PRINCIPAL
// ════════════════════════════════════════════════════════════
export function buildCartoonZombie(typeKey = 'pt', type = {}) {
  const build = pickBuild(typeKey);
  const bs = buildScale(build);
  const variant = type?.variant || 'normal';

  const c = {
    skin:  pickColor(type?.skinPalette,  0x7BC950),
    shirt: pickColor(type?.shirtPalette, 0xCC1111),
    pants: pickColor(type?.pantsPalette, 0x5D4030),
    hair:  [0x2C1810, 0x1A0F08, 0x4A2818, 0x6B3A1F][Math.floor(Math.random() * 4)],
    shoe:  0x1A1A1A,
    belt:  0x4A2A1A,
    eyeWhite: 0xFFFFFF,
    pupil: 0x000000,
    mouth: 0x2B0000,
    blood: 0x8B0000,
    tooth: 0xF5F5DC,
    accent: 0x222222,
    button: 0xD4AF37,
  };

  const skinMat   = toonMat(c.skin);
  const shirtMat  = toonMat(c.shirt);
  const pantsMat  = toonMat(c.pants);
  const shoeMat   = toonMat(c.shoe);
  const beltMat   = toonMat(c.belt);
  const accentMat = toonMat(c.accent);
  const buttonMat = toonMat(c.button);

  // ═══════════════════════════════════════════════════════════
  // BONES — nomes EXATAMENTE como Mixamo
  // ═══════════════════════════════════════════════════════════

  const Hips = new THREE.Bone();  Hips.name = 'Hips';
  Hips.position.set(0, 0, 0); // posição real aplicada no root

  const Spine = new THREE.Bone();  Spine.name = 'Spine';
  Spine.position.set(0, 0.10, 0);
  Hips.add(Spine);

  const Spine1 = new THREE.Bone(); Spine1.name = 'Spine1';
  Spine1.position.set(0, 0.10, 0);
  Spine.add(Spine1);

  const Spine2 = new THREE.Bone(); Spine2.name = 'Spine2';
  Spine2.position.set(0, 0.10, 0);
  Spine1.add(Spine2);

  const Neck = new THREE.Bone();   Neck.name = 'Neck';
  Neck.position.set(0, 0.10, 0);
  Spine2.add(Neck);

  const Head = new THREE.Bone();   Head.name = 'Head';
  Head.position.set(0, 0.07, 0);
  Neck.add(Head);

  // Braço esquerdo
  const LeftShoulder = new THREE.Bone();  LeftShoulder.name = 'LeftShoulder';
  LeftShoulder.position.set(0.07, 0.07, 0);
  Spine2.add(LeftShoulder);

  const LeftArm = new THREE.Bone();  LeftArm.name = 'LeftArm';
  LeftArm.position.set(0.07, 0, 0);
  LeftShoulder.add(LeftArm);

  const LeftForeArm = new THREE.Bone();  LeftForeArm.name = 'LeftForeArm';
  LeftForeArm.position.set(0.26, 0, 0);
  LeftArm.add(LeftForeArm);

  const LeftHand = new THREE.Bone();  LeftHand.name = 'LeftHand';
  LeftHand.position.set(0.24, 0, 0);
  LeftForeArm.add(LeftHand);

  // Braço direito
  const RightShoulder = new THREE.Bone();  RightShoulder.name = 'RightShoulder';
  RightShoulder.position.set(-0.07, 0.07, 0);
  Spine2.add(RightShoulder);

  const RightArm = new THREE.Bone();  RightArm.name = 'RightArm';
  RightArm.position.set(-0.07, 0, 0);
  RightShoulder.add(RightArm);

  const RightForeArm = new THREE.Bone();  RightForeArm.name = 'RightForeArm';
  RightForeArm.position.set(-0.26, 0, 0);
  RightArm.add(RightForeArm);

  const RightHand = new THREE.Bone();  RightHand.name = 'RightHand';
  RightHand.position.set(-0.24, 0, 0);
  RightForeArm.add(RightHand);

  // Perna esquerda
  const LeftUpLeg = new THREE.Bone();  LeftUpLeg.name = 'LeftUpLeg';
  LeftUpLeg.position.set(0.10, -0.04, 0);
  Hips.add(LeftUpLeg);

  const LeftLeg = new THREE.Bone();  LeftLeg.name = 'LeftLeg';
  LeftLeg.position.set(0, -0.42, 0);
  LeftUpLeg.add(LeftLeg);

  const LeftFoot = new THREE.Bone();  LeftFoot.name = 'LeftFoot';
  LeftFoot.position.set(0, -0.42, 0);
  LeftLeg.add(LeftFoot);

  const LeftToeBase = new THREE.Bone();  LeftToeBase.name = 'LeftToeBase';
  LeftToeBase.position.set(0, -0.05, 0.14);
  LeftFoot.add(LeftToeBase);

  // Perna direita
  const RightUpLeg = new THREE.Bone();  RightUpLeg.name = 'RightUpLeg';
  RightUpLeg.position.set(-0.10, -0.04, 0);
  Hips.add(RightUpLeg);

  const RightLeg = new THREE.Bone();  RightLeg.name = 'RightLeg';
  RightLeg.position.set(0, -0.42, 0);
  RightUpLeg.add(RightLeg);

  const RightFoot = new THREE.Bone();  RightFoot.name = 'RightFoot';
  RightFoot.position.set(0, -0.42, 0);
  RightLeg.add(RightFoot);

  const RightToeBase = new THREE.Bone();  RightToeBase.name = 'RightToeBase';
  RightToeBase.position.set(0, -0.05, 0.14);
  RightFoot.add(RightToeBase);

  // ═══════════════════════════════════════════════════════════
  // MESHES — preenchem cada segmento (span bone até bone filho)
  // ═══════════════════════════════════════════════════════════

  // HIPS — cobre -0.08 a +0.08 do bone
  {
    const pelvis = new THREE.Mesh(rb(0.42 * bs.torso, 0.22, 0.28 * bs.torso, 0.05), pantsMat);
    pelvis.position.set(0, -0.02, 0);
    Hips.add(pelvis);

    const belt = new THREE.Mesh(rb(0.44 * bs.torso, 0.06, 0.30 * bs.torso, 0.02), beltMat);
    belt.position.set(0, 0.08, 0);
    Hips.add(belt);

    const buckle = new THREE.Mesh(rb(0.09, 0.09, 0.03, 0.01), buttonMat);
    buckle.position.set(0, 0.08, 0.16 * bs.torso);
    Hips.add(buckle);
  }

  // SPINE — cobre -0.02 a +0.10
  {
    const torso = new THREE.Mesh(rb(0.40 * bs.torso, 0.20, 0.26 * bs.torso, 0.05), shirtMat);
    torso.position.set(0, 0.04, 0);
    Spine.add(torso);
  }

  // SPINE1 — cobre -0.02 a +0.10
  {
    const torso = new THREE.Mesh(rb(0.42 * bs.torso, 0.20, 0.28 * bs.torso, 0.05), shirtMat);
    torso.position.set(0, 0.04, 0);
    Spine1.add(torso);
  }

  // SPINE2 — cobre -0.02 a +0.10 + ombros
  {
    const chest = new THREE.Mesh(rb(0.48 * bs.torso, 0.24, 0.30 * bs.torso, 0.06), shirtMat);
    chest.position.set(0, 0.04, 0);
    Spine2.add(chest);

    // Colarinho
    const collar = new THREE.Mesh(rb(0.32 * bs.torso, 0.06, 0.28 * bs.torso, 0.02), accentMat);
    collar.position.set(0, 0.17, 0);
    Spine2.add(collar);

    // Mancha de sangue
    const wound = new THREE.Mesh(rb(0.14, 0.12, 0.03, 0.02), toonMat(c.blood));
    wound.position.set(-0.09 * bs.torso, 0.03, 0.16 * bs.torso);
    Spine2.add(wound);
  }

  // NECK — cobre -0.03 a +0.07
  {
    const neck = new THREE.Mesh(rb(0.14, 0.14, 0.14, 0.03), skinMat);
    neck.position.set(0, 0.02, 0);
    Neck.add(neck);
  }

  // HEAD — cobre a cabeça inteira (center no topo do pescoço)
  {
    const headVisual = buildHeadVisual(c, variant, {
      skinMat, headgear: type.headgear,
    });
    // Head bone está em +0.07 do Neck. O mesh da cabeça tem centro Y=0.
    // Bottom do crânio em Y-0.20. Então bottom fica em -0.20 do bone Head = -0.13 do Neck.
    // Isso dá overlap suficiente com o neck mesh (que vai de -0.03 a +0.07).
    headVisual.position.set(0, 0.04, 0);
    Head.add(headVisual);
  }

  // LEFT SHOULDER — ombro
  {
    const shoulder = new THREE.Mesh(rb(0.16, 0.18, 0.20, 0.04), shirtMat);
    shoulder.position.set(0.03, 0.04, 0);
    LeftShoulder.add(shoulder);
  }

  // LEFT ARM — cobre de 0 a 0.26 (+ overlap até 0.28)
  {
    const upperArm = new THREE.Mesh(rb(0.30, 0.15, 0.15, 0.04), shirtMat);
    upperArm.position.set(0.13, 0, 0);
    LeftArm.add(upperArm);
  }

  // LEFT FOREARM — cobre de 0 a 0.24 (+ overlap até 0.26)
  {
    const foreArm = new THREE.Mesh(rb(0.28, 0.13, 0.13, 0.03), skinMat);
    foreArm.position.set(0.12, 0, 0);
    LeftForeArm.add(foreArm);
  }

  // LEFT HAND
  {
    const hand = buildHandVisual(skinMat);
    LeftHand.add(hand);
  }

  // RIGHT SHOULDER — espelhado
  {
    const shoulder = new THREE.Mesh(rb(0.16, 0.18, 0.20, 0.04), shirtMat);
    shoulder.position.set(-0.03, 0.04, 0);
    RightShoulder.add(shoulder);
  }

  // RIGHT ARM
  {
    const upperArm = new THREE.Mesh(rb(0.30, 0.15, 0.15, 0.04), shirtMat);
    upperArm.position.set(-0.13, 0, 0);
    RightArm.add(upperArm);
  }

  // RIGHT FOREARM
  {
    const foreArm = new THREE.Mesh(rb(0.28, 0.13, 0.13, 0.03), skinMat);
    foreArm.position.set(-0.12, 0, 0);
    RightForeArm.add(foreArm);
  }

  // RIGHT HAND — espelhada
  {
    const hand = buildHandVisual(skinMat);
    hand.scale.x = -1;
    RightHand.add(hand);
  }

  // LEFT LEGS
  {
    const thigh = new THREE.Mesh(rb(0.18 * bs.legs, 0.46, 0.18 * bs.legs, 0.04), pantsMat);
    thigh.position.set(0, -0.20, 0);
    LeftUpLeg.add(thigh);
  }
  {
    const shin = new THREE.Mesh(rb(0.16 * bs.legs, 0.44, 0.16 * bs.legs, 0.03), pantsMat);
    shin.position.set(0, -0.20, 0);
    LeftLeg.add(shin);
  }
  {
    LeftFoot.add(buildFootVisual(shoeMat, accentMat));
  }

  // RIGHT LEGS
  {
    const thigh = new THREE.Mesh(rb(0.18 * bs.legs, 0.46, 0.18 * bs.legs, 0.04), pantsMat);
    thigh.position.set(0, -0.20, 0);
    RightUpLeg.add(thigh);
  }
  {
    const shin = new THREE.Mesh(rb(0.16 * bs.legs, 0.44, 0.16 * bs.legs, 0.03), pantsMat);
    shin.position.set(0, -0.20, 0);
    RightLeg.add(shin);
  }
  {
    RightFoot.add(buildFootVisual(shoeMat, accentMat));
  }

  // ═══════════════════════════════════════════════════════════
  // ROOT
  // ═══════════════════════════════════════════════════════════
  const root = new THREE.Group();
  root.add(Hips);

  // Posiciona hips na altura correta
  Hips.position.y = 0.92;
  root.updateMatrixWorld(true);

  // Ajusta para pés tocarem o chão
  const bbox = new THREE.Box3().setFromObject(root);
  Hips.position.y -= bbox.min.y;
  root.updateMatrixWorld(true);

  // Local boxes para raycast (OBB)
  const localBoxes = {
    head:  new THREE.Box3(
      new THREE.Vector3(-0.24, -0.24, -0.24),
      new THREE.Vector3( 0.24,  0.26,  0.24)
    ),
    torso: new THREE.Box3(
      new THREE.Vector3(-0.30, -0.16, -0.18),
      new THREE.Vector3( 0.30,  0.20,  0.18)
    ),
    armL:  new THREE.Box3(
      new THREE.Vector3(-0.06, -0.10, -0.12),
      new THREE.Vector3( 0.34,  0.12,  0.12)
    ),
    armR:  new THREE.Box3(
      new THREE.Vector3(-0.34, -0.10, -0.12),
      new THREE.Vector3( 0.06,  0.12,  0.12)
    ),
    legL:  new THREE.Box3(
      new THREE.Vector3(-0.12, -0.88, -0.14),
      new THREE.Vector3( 0.12,  0.04,  0.16)
    ),
    legR:  new THREE.Box3(
      new THREE.Vector3(-0.12, -0.88, -0.14),
      new THREE.Vector3( 0.12,  0.04,  0.16)
    ),
  };

  const joints = {
    pelvis: Hips,
    spineLower: Spine,
    spineUpper: Spine2,
    neck: Neck,
    head: Head,
    shoulderL: LeftArm,
    elbowL: LeftForeArm,
    shoulderR: RightArm,
    elbowR: RightForeArm,
    thighL: LeftUpLeg,
    kneeL: LeftLeg,
    footL: LeftFoot,
    thighR: RightUpLeg,
    kneeR: RightLeg,
    footR: RightFoot,
  };

  disableFrustumCulling(root);

  return {
    root,
    hips: Hips,
    scene: root,
    joints,
    localBoxes,
    skinColor: c.skin,
    variant,
    build,
    isRigged: true,
    headLoll:      (Math.random() - 0.5) * 0.3,
    headPitchBase: (Math.random() - 0.5) * 0.2,
    armDroopL:     -0.05 - Math.random() * 0.10,
    armDroopR:     -0.05 - Math.random() * 0.10,
    limpAmount:    Math.random(),
    limpSide:      Math.random() < 0.5 ? -1 : 1,
    walkStyle:     Math.random(),
  };
}

export function buildCartoonZombieFallback(typeKey, type) {
  return buildCartoonZombie(typeKey, type);
}
