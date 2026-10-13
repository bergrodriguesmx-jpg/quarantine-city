// ============================================================
// zombie-procedural.js — v3 (RIGGED)
// Zumbi cartoon cúbico com ESQUELETO COMPATÍVEL COM MIXAMO.
// Permite usar as animações FBX da pasta assets/zombie-anim/.
// Se as animações não carregarem, cai no fallback procedural.
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
function rb(w, h, d, r = 0.03) {
  const k = `${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`;
  let g = RB_CACHE.get(k);
  if (!g) {
    const minDim = Math.min(w, h, d);
    const radius = Math.min(r, minDim * 0.45);
    g = minDim < 0.07
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

// ════════════════════════════════════════════════════════════
// BUILD (variação de corpo) — mantido
// ════════════════════════════════════════════════════════════
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
    case 'slim':  return { torso: 0.88, arms: 0.88, legs: 0.92, head: 1.00, belly: 1.00 };
    case 'fat':   return { torso: 1.22, arms: 1.10, legs: 1.05, head: 1.00, belly: 1.35 };
    case 'brute': return { torso: 1.35, arms: 1.28, legs: 1.15, head: 1.08, belly: 1.20 };
    default:      return { torso: 1.00, arms: 1.00, legs: 1.00, head: 1.00, belly: 1.00 };
  }
}

// ════════════════════════════════════════════════════════════
// HEADGEAR (mesmos shapes de antes, mas sem depender de parent)
// ════════════════════════════════════════════════════════════
function makeHeadgear(headgear) {
  const g = new THREE.Group();
  if (!headgear) return g;

  if (headgear === 'cap_brown' || headgear === 'cap_red' || headgear === 'cap_black') {
    const col = headgear === 'cap_red' ? 0xE74C3C : headgear === 'cap_brown' ? 0x5D4030 : 0x1A1A1A;
    const mat = toonMat(col);
    const cap = new THREE.Mesh(rb(0.44, 0.14, 0.44, 0.04), mat);
    cap.position.set(0, 0.32, 0); g.add(cap);
    const brim = new THREE.Mesh(rb(0.42, 0.05, 0.2, 0.01), mat);
    brim.position.set(0, 0.28, 0.28); g.add(brim);
  } else if (headgear === 'helmet_yellow') {
    const mat = toonMat(0xFFCC00);
    const helmet = new THREE.Mesh(rb(0.48, 0.2, 0.48, 0.08), mat);
    helmet.position.set(0, 0.32, 0); g.add(helmet);
    const stripe = new THREE.Mesh(rb(0.5, 0.05, 0.11, 0.01), toonMat(0x1A1A1A));
    stripe.position.set(0, 0.36, 0); g.add(stripe);
    const lamp = new THREE.Mesh(rb(0.1, 0.1, 0.08, 0.02), toonMat(0xFFFF88));
    lamp.position.set(0, 0.32, 0.26); g.add(lamp);
  } else if (headgear === 'balaclava') {
    const mat = toonMat(0x0A0A0A);
    const mask = new THREE.Mesh(rb(0.44, 0.36, 0.44, 0.06), mat);
    mask.position.set(0, 0.12, 0); g.add(mask);
    const holeL = new THREE.Mesh(rb(0.1, 0.07, 0.02, 0.005), toonMat(0xFF2020));
    holeL.position.set(-0.10, 0.2, 0.23); g.add(holeL);
    const holeR = new THREE.Mesh(rb(0.1, 0.07, 0.02, 0.005), toonMat(0xFF2020));
    holeR.position.set( 0.10, 0.2, 0.23); g.add(holeR);
  } else if (headgear === 'hood') {
    const mat = toonMat(0x0A0A0A);
    const hood = new THREE.Mesh(rb(0.56, 0.56, 0.54, 0.14), mat);
    hood.position.set(0, 0.18, -0.04); g.add(hood);
    const shadow = new THREE.Mesh(rb(0.34, 0.34, 0.06, 0.05), toonMat(0x000000));
    shadow.position.set(0, 0.18, 0.22); g.add(shadow);
  } else if (headgear === 'crown') {
    const mat = toonMat(0xFFD700);
    const crown = new THREE.Mesh(rb(0.46, 0.14, 0.46, 0.03), mat);
    crown.position.set(0, 0.38, 0); g.add(crown);
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 4), mat);
      spike.position.set(-0.16 + i * 0.1, 0.49, 0); g.add(spike);
    }
  }
  return g;
}

// ════════════════════════════════════════════════════════════
// HEAD VISUAL (com face frontal em +Z)
// ════════════════════════════════════════════════════════════
function buildHeadVisual(c, variant, opts) {
  const g = new THREE.Group();
  const skinMat = opts.skinMat;
  const eyeMat = toonMat(c.eyeWhite);
  const pupilMat = toonMat(c.pupil);
  const mouthMat = toonMat(c.mouth);
  const bloodMat = toonMat(c.blood);
  const toothMat = toonMat(c.tooth);
  const gumMat = toonMat(0x8B0000);
  const hairMat = toonMat(c.hair);

  // CRÂNIO — cabeça grande, cartoon
  const skull = new THREE.Mesh(rb(0.4, 0.42, 0.4, 0.09), skinMat);
  skull.castShadow = true;
  skull.receiveShadow = true;
  g.add(skull);

  // SOBRANCELHA
  const brow = new THREE.Mesh(rb(0.32, 0.06, 0.04, 0.005), hairMat);
  brow.position.set(0, 0.16, 0.21);
  brow.rotation.z = 0.10;
  g.add(brow);

  if (variant === 'donkey') {
    // Focinho comprido
    const muzzle = new THREE.Mesh(rb(0.28, 0.24, 0.38, 0.06), toonMat(0xB8A796));
    muzzle.position.set(0, -0.08, 0.32);
    g.add(muzzle);
    // Narinas
    for (const s of [-1, 1]) {
      const n = new THREE.Mesh(rb(0.06, 0.06, 0.03, 0.01), toonMat(0x2A1F1A));
      n.position.set(s * 0.08, -0.02, 0.48); g.add(n);
    }
    // Orelhas caídas
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(rb(0.13, 0.32, 0.13, 0.04), skinMat);
      ear.position.set(s * 0.2, 0.34, -0.02);
      ear.rotation.z = s * 0.35;
      g.add(ear);
    }
  } else {
    // Nariz
    const nose = new THREE.Mesh(rb(0.09, 0.09, 0.08, 0.02), skinMat);
    nose.position.set(0, -0.02, 0.23);
    g.add(nose);
  }

  // OLHOS com pálpebra caída
  if (variant !== 'donkey') {
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(rb(0.14, 0.16, 0.05, 0.02), eyeMat);
      eye.position.set(s * 0.11, 0.05, 0.21);
      g.add(eye);

      const pupil = new THREE.Mesh(rb(0.06, 0.07, 0.02, 0.01), pupilMat);
      pupil.position.set(s * 0.11 + (Math.random() - 0.5) * 0.04, 0.04, 0.235);
      g.add(pupil);

      const lid = new THREE.Mesh(rb(0.14, 0.06, 0.06, 0.01), skinMat);
      lid.position.set(s * 0.11, 0.10, 0.21);
      lid.rotation.x = 0.35;
      g.add(lid);

      const sock = new THREE.Mesh(rb(0.15, 0.07, 0.02, 0.005), toonMat(0x2A1A1A));
      sock.position.set(s * 0.11, -0.02, 0.22);
      g.add(sock);
    }

    // BOCA aberta
    const mouth = new THREE.Mesh(rb(0.26, 0.11, 0.02, 0.01), mouthMat);
    mouth.position.set(0, -0.13, 0.22);
    g.add(mouth);

    const gum = new THREE.Mesh(rb(0.24, 0.03, 0.03, 0.005), gumMat);
    gum.position.set(0, -0.10, 0.23);
    g.add(gum);

    const nTeeth = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < nTeeth; i++) {
      const tx = -0.09 + i * (0.18 / Math.max(1, nTeeth - 1));
      const tooth = new THREE.Mesh(rb(0.04, 0.055, 0.03, 0.005), toothMat);
      tooth.position.set(tx, -0.105, 0.24);
      tooth.rotation.z = (Math.random() - 0.5) * 0.2;
      g.add(tooth);
    }
  }

  if (variant === 'judge') {
    const grayHair = toonMat(0x888888);
    // Bigode
    const must = new THREE.Mesh(rb(0.3, 0.07, 0.07, 0.02), grayHair);
    must.position.set(0, -0.10, 0.22);
    g.add(must);
    // Barba
    const beard = new THREE.Mesh(rb(0.32, 0.22, 0.18, 0.06), grayHair);
    beard.position.set(0, -0.26, 0.14);
    g.add(beard);
    // Cabelo grisalho
    const hairTop = new THREE.Mesh(rb(0.44, 0.12, 0.44, 0.04), grayHair);
    hairTop.position.set(0, 0.24, 0);
    g.add(hairTop);
  } else if (variant !== 'donkey' && !opts.headgear) {
    // Cabelo padrão
    const hairTop = new THREE.Mesh(rb(0.44, 0.12, 0.42, 0.04), hairMat);
    hairTop.position.set(0, 0.24, 0);
    g.add(hairTop);

    const tuftL = new THREE.Mesh(rb(0.08, 0.16, 0.12, 0.03), hairMat);
    tuftL.position.set(-0.23, 0.16, -0.04);
    g.add(tuftL);
    const tuftR = new THREE.Mesh(rb(0.08, 0.16, 0.12, 0.03), hairMat);
    tuftR.position.set( 0.23, 0.16, -0.04);
    g.add(tuftR);
  }

  // Ferimento
  const wSide = Math.random() < 0.5 ? -1 : 1;
  const wound = new THREE.Mesh(rb(0.15, 0.15, 0.04, 0.02), bloodMat);
  wound.position.set(wSide * 0.15, 0.14, 0.21);
  g.add(wound);

  // Headgear
  g.add(makeHeadgear(opts.headgear));

  return g;
}

// ════════════════════════════════════════════════════════════
// MAINS
// ════════════════════════════════════════════════════════════
function buildHandVisual(skinMat, sideSign) {
  const g = new THREE.Group();

  const palm = new THREE.Mesh(rb(0.14, 0.1, 0.11, 0.03), skinMat);
  palm.position.set(0, 0, 0);
  palm.castShadow = true;
  g.add(palm);

  // Dedos (3) — apontando em +X (continuação do braço)
  const fingerLen = 0.08;
  for (let i = 0; i < 3; i++) {
    const finger = new THREE.Mesh(rb(fingerLen, 0.032, 0.032, 0.008), skinMat);
    finger.position.set(0.07 + fingerLen * 0.5, -0.02 + i * 0.035, 0.02);
    finger.rotation.z = 0.05;
    g.add(finger);
  }
  // Polegar
  const thumb = new THREE.Mesh(rb(0.05, 0.035, 0.035, 0.01), skinMat);
  thumb.position.set(0.02, 0.05, 0.04);
  thumb.rotation.z = -sideSign * 0.7;
  g.add(thumb);

  return g;
}

function buildFootVisual(shoeMat, accentMat) {
  const g = new THREE.Group();
  // sola
  const sole = new THREE.Mesh(rb(0.22, 0.045, 0.34, 0.01), accentMat);
  sole.position.set(0, -0.075, 0.08); g.add(sole);
  // corpo
  const foot = new THREE.Mesh(rb(0.21, 0.11, 0.32, 0.03), shoeMat);
  foot.position.set(0, -0.03, 0.08);
  foot.castShadow = true; g.add(foot);
  // biqueira
  const toe = new THREE.Mesh(rb(0.21, 0.07, 0.09, 0.02), accentMat);
  toe.position.set(0, -0.055, 0.21); g.add(toe);
  return g;
}

// ════════════════════════════════════════════════════════════
// BUILDER PRINCIPAL — com SKELETON MIXAMO-COMPATÍVEL
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

  const skinMat  = toonMat(c.skin);
  const shirtMat = toonMat(c.shirt);
  const pantsMat = toonMat(c.pants);
  const shoeMat  = toonMat(c.shoe);
  const beltMat  = toonMat(c.belt);
  const accentMat = toonMat(c.accent);
  const buttonMat = toonMat(c.button);

  // ════════════════════════════════════════════════════════
  // CRIA BONES (compatíveis com Mixamo)
  // ════════════════════════════════════════════════════════

  const Hips = new THREE.Bone();
  Hips.name = 'Hips';
  Hips.position.set(0, 0, 0); // root position é o root group

  const Spine = new THREE.Bone();
  Spine.name = 'Spine';
  Spine.position.set(0, 0.08, 0);
  Hips.add(Spine);

  const Spine1 = new THREE.Bone();
  Spine1.name = 'Spine1';
  Spine1.position.set(0, 0.14, 0);
  Spine.add(Spine1);

  const Spine2 = new THREE.Bone();
  Spine2.name = 'Spine2';
  Spine2.position.set(0, 0.14, 0);
  Spine1.add(Spine2);

  const Neck = new THREE.Bone();
  Neck.name = 'Neck';
  Neck.position.set(0, 0.14, 0);
  Spine2.add(Neck);

  const Head = new THREE.Bone();
  Head.name = 'Head';
  Head.position.set(0, 0.10, 0);
  Neck.add(Head);

  // Ombros + Braços (T-pose → braços para os lados em X)
  const LeftShoulder = new THREE.Bone();
  LeftShoulder.name = 'LeftShoulder';
  LeftShoulder.position.set(0.06, 0.14, 0);
  Spine2.add(LeftShoulder);

  const LeftArm = new THREE.Bone();
  LeftArm.name = 'LeftArm';
  LeftArm.position.set(0.08, 0, 0);
  LeftShoulder.add(LeftArm);

  const LeftForeArm = new THREE.Bone();
  LeftForeArm.name = 'LeftForeArm';
  LeftForeArm.position.set(0.26, 0, 0);
  LeftArm.add(LeftForeArm);

  const LeftHand = new THREE.Bone();
  LeftHand.name = 'LeftHand';
  LeftHand.position.set(0.24, 0, 0);
  LeftForeArm.add(LeftHand);

  const RightShoulder = new THREE.Bone();
  RightShoulder.name = 'RightShoulder';
  RightShoulder.position.set(-0.06, 0.14, 0);
  Spine2.add(RightShoulder);

  const RightArm = new THREE.Bone();
  RightArm.name = 'RightArm';
  RightArm.position.set(-0.08, 0, 0);
  RightShoulder.add(RightArm);

  const RightForeArm = new THREE.Bone();
  RightForeArm.name = 'RightForeArm';
  RightForeArm.position.set(-0.26, 0, 0);
  RightArm.add(RightForeArm);

  const RightHand = new THREE.Bone();
  RightHand.name = 'RightHand';
  RightHand.position.set(-0.24, 0, 0);
  RightForeArm.add(RightHand);

  // Pernas
  const LeftUpLeg = new THREE.Bone();
  LeftUpLeg.name = 'LeftUpLeg';
  LeftUpLeg.position.set(0.10, -0.06, 0);
  Hips.add(LeftUpLeg);

  const LeftLeg = new THREE.Bone();
  LeftLeg.name = 'LeftLeg';
  LeftLeg.position.set(0, -0.40, 0);
  LeftUpLeg.add(LeftLeg);

  const LeftFoot = new THREE.Bone();
  LeftFoot.name = 'LeftFoot';
  LeftFoot.position.set(0, -0.40, 0);
  LeftLeg.add(LeftFoot);

  const LeftToeBase = new THREE.Bone();
  LeftToeBase.name = 'LeftToeBase';
  LeftToeBase.position.set(0, -0.08, 0.14);
  LeftFoot.add(LeftToeBase);

  const RightUpLeg = new THREE.Bone();
  RightUpLeg.name = 'RightUpLeg';
  RightUpLeg.position.set(-0.10, -0.06, 0);
  Hips.add(RightUpLeg);

  const RightLeg = new THREE.Bone();
  RightLeg.name = 'RightLeg';
  RightLeg.position.set(0, -0.40, 0);
  RightUpLeg.add(RightLeg);

  const RightFoot = new THREE.Bone();
  RightFoot.name = 'RightFoot';
  RightFoot.position.set(0, -0.40, 0);
  RightLeg.add(RightFoot);

  const RightToeBase = new THREE.Bone();
  RightToeBase.name = 'RightToeBase';
  RightToeBase.position.set(0, -0.08, 0.14);
  RightFoot.add(RightToeBase);

  // ════════════════════════════════════════════════════════
  // MESHES VISUAIS POR BONE
  // ════════════════════════════════════════════════════════

  // HIPS — pelvis + cinto
  {
    const pelvis = new THREE.Mesh(rb(0.44 * bs.torso, 0.26, 0.28 * bs.torso, 0.05), pantsMat);
    pelvis.position.set(0, 0.06, 0);
    pelvis.castShadow = true; pelvis.receiveShadow = true;
    Hips.add(pelvis);

    const belt = new THREE.Mesh(rb(0.46 * bs.torso, 0.06, 0.3 * bs.torso, 0.02), beltMat);
    belt.position.set(0, 0.16, 0);
    Hips.add(belt);

    const buckle = new THREE.Mesh(rb(0.09, 0.09, 0.03, 0.01), buttonMat);
    buckle.position.set(0, 0.16, 0.16 * bs.torso);
    Hips.add(buckle);
  }

  // SPINE — lower torso
  {
    const torso = new THREE.Mesh(rb(0.42 * bs.torso, 0.22, 0.26 * bs.torso, 0.05), shirtMat);
    torso.position.set(0, 0.10, 0);
    torso.castShadow = true; torso.receiveShadow = true;
    Spine.add(torso);

    if (build === 'fat' || build === 'brute') {
      const belly = new THREE.Mesh(rb(0.4 * bs.torso, 0.2, 0.18 * bs.belly, 0.08), shirtMat);
      belly.position.set(0, 0.06, 0.14 * bs.torso);
      Spine.add(belly);
    }
  }

  // SPINE1 — mid torso
  {
    const torso = new THREE.Mesh(rb(0.46 * bs.torso, 0.20, 0.28 * bs.torso, 0.05), shirtMat);
    torso.position.set(0, 0.10, 0);
    torso.castShadow = true; torso.receiveShadow = true;
    Spine1.add(torso);
  }

  // SPINE2 — chest
  {
    const chest = new THREE.Mesh(rb(0.5 * bs.torso, 0.24, 0.3 * bs.torso, 0.06), shirtMat);
    chest.position.set(0, 0.06, 0);
    chest.castShadow = true; chest.receiveShadow = true;
    Spine2.add(chest);

    // Colarinho
    const collar = new THREE.Mesh(rb(0.34 * bs.torso, 0.06, 0.28 * bs.torso, 0.02), accentMat);
    collar.position.set(0, 0.18, 0);
    Spine2.add(collar);

    // Mancha de sangue
    const wound = new THREE.Mesh(rb(0.18, 0.15, 0.03, 0.02), toonMat(c.blood));
    wound.position.set(-0.09 * bs.torso, 0.02, 0.16 * bs.torso);
    Spine2.add(wound);
  }

  // NECK
  {
    const neck = new THREE.Mesh(rb(0.14, 0.12, 0.14, 0.03), skinMat);
    neck.position.set(0, 0.06, 0);
    Neck.add(neck);
  }

  // HEAD — visual grande, cabeça cartoon
  {
    const headVisual = buildHeadVisual(c, variant, {
      skinMat, headgear: type.headgear,
    });
    headVisual.position.set(0, 0.20, 0);
    Head.add(headVisual);
  }

  // LEFT SHOULDER — pequeno bump
  {
    const shoulder = new THREE.Mesh(rb(0.16, 0.16, 0.16, 0.05), shirtMat);
    shoulder.position.set(0.02, 0.02, 0);
    LeftShoulder.add(shoulder);
  }

  // LEFT ARM — braço estendido em +X (T-pose)
  {
    const upperArm = new THREE.Mesh(rb(0.28, 0.15, 0.15, 0.04), shirtMat);
    // rotaciona -90° em Z: Y→X, então "altura" da caixa vira o comprimento do braço
    upperArm.rotation.z = -Math.PI / 2;
    upperArm.position.set(0.13, 0, 0); // meio do bone
    upperArm.castShadow = true; upperArm.receiveShadow = true;
    LeftArm.add(upperArm);
  }

  // LEFT FOREARM — skin
  {
    const foreArm = new THREE.Mesh(rb(0.24, 0.13, 0.13, 0.03), skinMat);
    foreArm.rotation.z = -Math.PI / 2;
    foreArm.position.set(0.12, 0, 0);
    foreArm.castShadow = true; foreArm.receiveShadow = true;
    LeftForeArm.add(foreArm);
  }

  // LEFT HAND — aponta +X
  {
    const handVisual = buildHandVisual(skinMat, -1);
    LeftHand.add(handVisual);
  }

  // RIGHT SHOULDER
  {
    const shoulder = new THREE.Mesh(rb(0.16, 0.16, 0.16, 0.05), shirtMat);
    shoulder.position.set(-0.02, 0.02, 0);
    RightShoulder.add(shoulder);
  }

  // RIGHT ARM — espelhado (aponta -X)
  {
    const upperArm = new THREE.Mesh(rb(0.28, 0.15, 0.15, 0.04), shirtMat);
    upperArm.rotation.z = Math.PI / 2;
    upperArm.position.set(-0.13, 0, 0);
    upperArm.castShadow = true; upperArm.receiveShadow = true;
    RightArm.add(upperArm);
  }

  // RIGHT FOREARM
  {
    const foreArm = new THREE.Mesh(rb(0.24, 0.13, 0.13, 0.03), skinMat);
    foreArm.rotation.z = Math.PI / 2;
    foreArm.position.set(-0.12, 0, 0);
    foreArm.castShadow = true; foreArm.receiveShadow = true;
    RightForeArm.add(foreArm);
  }

  // RIGHT HAND — espelhada
  {
    const handVisual = buildHandVisual(skinMat, 1);
    handVisual.scale.x = -1; // espelha
    RightHand.add(handVisual);
  }

  // LEFT UPPER LEG — aponta -Y (para baixo)
  {
    const thigh = new THREE.Mesh(rb(0.18 * bs.legs, 0.34, 0.18 * bs.legs, 0.04), pantsMat);
    thigh.position.set(0, -0.17, 0);
    thigh.castShadow = true; thigh.receiveShadow = true;
    LeftUpLeg.add(thigh);
  }

  // LEFT LOWER LEG
  {
    const shin = new THREE.Mesh(rb(0.16 * bs.legs, 0.32, 0.16 * bs.legs, 0.03), pantsMat);
    shin.position.set(0, -0.16, 0);
    shin.castShadow = true; shin.receiveShadow = true;
    LeftLeg.add(shin);

    // barra da calça
    const cuff = new THREE.Mesh(rb(0.17 * bs.legs, 0.05, 0.17 * bs.legs, 0.02), accentMat);
    cuff.position.set(0, -0.30, 0);
    LeftLeg.add(cuff);
  }

  // LEFT FOOT
  {
    LeftFoot.add(buildFootVisual(shoeMat, accentMat));
  }

  // LEFT TOE
  {
    const toe = new THREE.Mesh(rb(0.18, 0.06, 0.08, 0.02), accentMat);
    toe.position.set(0, 0, 0);
    LeftToeBase.add(toe);
  }

  // RIGHT UPPER LEG
  {
    const thigh = new THREE.Mesh(rb(0.18 * bs.legs, 0.34, 0.18 * bs.legs, 0.04), pantsMat);
    thigh.position.set(0, -0.17, 0);
    thigh.castShadow = true; thigh.receiveShadow = true;
    RightUpLeg.add(thigh);
  }

  // RIGHT LOWER LEG
  {
    const shin = new THREE.Mesh(rb(0.16 * bs.legs, 0.32, 0.16 * bs.legs, 0.03), pantsMat);
    shin.position.set(0, -0.16, 0);
    shin.castShadow = true; shin.receiveShadow = true;
    RightLeg.add(shin);

    const cuff = new THREE.Mesh(rb(0.17 * bs.legs, 0.05, 0.17 * bs.legs, 0.02), accentMat);
    cuff.position.set(0, -0.30, 0);
    RightLeg.add(cuff);
  }

  // RIGHT FOOT
  {
    RightFoot.add(buildFootVisual(shoeMat, accentMat));
  }

  // RIGHT TOE
  {
    const toe = new THREE.Mesh(rb(0.18, 0.06, 0.08, 0.02), accentMat);
    toe.position.set(0, 0, 0);
    RightToeBase.add(toe);
  }

  // ════════════════════════════════════════════════════════
  // ROOT GROUP — contém Hips
  // ════════════════════════════════════════════════════════
  const root = new THREE.Group();
  root.add(Hips);

  // ════════════════════════════════════════════════════════
  // POSICIONA HIPS no chão (pés em y=0)
  // ════════════════════════════════════════════════════════
  Hips.position.y = 0.94; // altura do quadril
  root.updateMatrixWorld(true);

  // Verifica pés
  const bbox = new THREE.Box3().setFromObject(root);
  const feetOffset = bbox.min.y;
  if (Math.abs(feetOffset) > 0.001) {
    Hips.position.y -= feetOffset;
    root.updateMatrixWorld(true);
  }

  // ════════════════════════════════════════════════════════
  // LOCAL BOXES (raycast por OBB, opcional — quando não tem mixer)
  // ════════════════════════════════════════════════════════
  const localBoxes = {
    head:  new THREE.Box3(
      new THREE.Vector3(-0.26, -0.10, -0.24),
      new THREE.Vector3( 0.26,  0.50,  0.26)
    ),
    torso: new THREE.Box3(
      new THREE.Vector3(-0.32, -0.10, -0.20),
      new THREE.Vector3( 0.32,  0.50,  0.20)
    ),
    armL:  new THREE.Box3(
      new THREE.Vector3( 0.00, -0.12, -0.10),
      new THREE.Vector3( 0.55,  0.12,  0.10)
    ),
    armR:  new THREE.Box3(
      new THREE.Vector3(-0.55, -0.12, -0.10),
      new THREE.Vector3( 0.00,  0.12,  0.10)
    ),
    legL:  new THREE.Box3(
      new THREE.Vector3(-0.12, -0.78, -0.15),
      new THREE.Vector3( 0.12,  0.06,  0.18)
    ),
    legR:  new THREE.Box3(
      new THREE.Vector3(-0.12, -0.78, -0.15),
      new THREE.Vector3( 0.12,  0.06,  0.18)
    ),
  };

  // ════════════════════════════════════════════════════════
  // RETORNA tudo que o game.js precisa
  // ════════════════════════════════════════════════════════
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

  return {
    root,
    hips: Hips,
    scene: root, // compatível com AnimationMixer
    joints,
    localBoxes,
    skinColor: c.skin,
    variant,
    build,
    isRigged: true,
    // valores "legado" pra fallback procedural (não usados quando mixer ativo)
    headLoll:      (Math.random() - 0.5) * 0.35,
    headPitchBase: (Math.random() - 0.5) * 0.25,
    armDroopL:     -0.10 - Math.random() * 0.25,
    armDroopR:     -0.10 - Math.random() * 0.25,
    limpAmount:    Math.random(),
    limpSide:      Math.random() < 0.5 ? -1 : 1,
    walkStyle:     Math.random(),
  };
}

// Fallback: se não tem animação, ainda funciona como procedural (spring-based)
export function buildCartoonZombieFallback(typeKey, type) {
  return buildCartoonZombie(typeKey, type);
}
