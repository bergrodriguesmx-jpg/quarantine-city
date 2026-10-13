// ============================================================
// zombie-procedural.js — v2 (mais detalhes, mesmo estilo cartoon)
// Adiciona: dedos, cinto, mandíbula, pálpebras, variação de corpo.
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
// VARIAÇÃO DE CORPO (baseada no typeKey + random)
// magro | normal | gordo
// ════════════════════════════════════════════════════════════
function pickBuild(typeKey) {
  // Types específicos têm build fixo
  if (typeKey === 'brute' || typeKey === 'riot') return 'brute';
  if (typeKey === 'runner' || typeKey === 'crawler') return 'slim';
  if (typeKey === 'boomer') return 'fat';
  // Resto é aleatório
  const r = Math.random();
  if (r < 0.25) return 'slim';
  if (r < 0.80) return 'normal';
  return 'fat';
}

// Multiplicadores de espessura por build
function buildScale(build) {
  switch (build) {
    case 'slim':  return { torso: 0.85, arms: 0.85, legs: 0.90, head: 1.00, belly: 1.00 };
    case 'fat':   return { torso: 1.25, arms: 1.10, legs: 1.10, head: 1.00, belly: 1.35 };
    case 'brute': return { torso: 1.35, arms: 1.30, legs: 1.20, head: 1.10, belly: 1.20 };
    default:      return { torso: 1.00, arms: 1.00, legs: 1.00, head: 1.00, belly: 1.00 };
  }
}

// ════════════════════════════════════════════════════════════
// HEADGEAR
// ════════════════════════════════════════════════════════════
function applyHeadgear(head, headgear) {
  if (!headgear) return;

  if (headgear === 'cap_brown' || headgear === 'cap_red' || headgear === 'cap_black') {
    const col = headgear === 'cap_red' ? 0xE74C3C : headgear === 'cap_brown' ? 0x5D4030 : 0x1A1A1A;
    const mat = toonMat(col);
    const cap = new THREE.Mesh(rb(0.42, 0.12, 0.42, 0.04), mat);
    cap.position.y = 0.24; head.add(cap);
    const brim = new THREE.Mesh(rb(0.4, 0.04, 0.18, 0.01), mat);
    brim.position.set(0, 0.22, 0.27); head.add(brim);
  } else if (headgear === 'helmet_yellow') {
    const mat = toonMat(0xFFCC00);
    const helmet = new THREE.Mesh(rb(0.46, 0.18, 0.46, 0.08), mat);
    helmet.position.y = 0.24; head.add(helmet);
    const stripe = new THREE.Mesh(rb(0.48, 0.04, 0.1, 0.01), toonMat(0x1A1A1A));
    stripe.position.y = 0.28; head.add(stripe);
    const lamp = new THREE.Mesh(rb(0.08, 0.08, 0.06, 0.02), toonMat(0xFFFF88));
    lamp.position.set(0, 0.24, 0.24); head.add(lamp);
  } else if (headgear === 'balaclava') {
    const mat = toonMat(0x0A0A0A);
    const mask = new THREE.Mesh(rb(0.42, 0.32, 0.42, 0.05), mat);
    mask.position.y = -0.02; head.add(mask);
    const top = new THREE.Mesh(rb(0.44, 0.14, 0.44, 0.05), mat);
    top.position.y = 0.24; head.add(top);
    const holeL = new THREE.Mesh(rb(0.1, 0.06, 0.02, 0.005), toonMat(0xFF2020));
    holeL.position.set(-0.1, 0.06, 0.22); head.add(holeL);
    const holeR = new THREE.Mesh(rb(0.1, 0.06, 0.02, 0.005), toonMat(0xFF2020));
    holeR.position.set( 0.1, 0.06, 0.22); head.add(holeR);
  } else if (headgear === 'hood') {
    const mat = toonMat(0x0A0A0A);
    const hood = new THREE.Mesh(rb(0.52, 0.52, 0.5, 0.12), mat);
    hood.position.set(0, 0.1, -0.03); head.add(hood);
    const shadow = new THREE.Mesh(rb(0.32, 0.32, 0.06, 0.05), toonMat(0x000000));
    shadow.position.set(0, 0, 0.22); head.add(shadow);
  } else if (headgear === 'crown') {
    const mat = toonMat(0xFFD700);
    const crown = new THREE.Mesh(rb(0.44, 0.12, 0.44, 0.03), mat);
    crown.position.y = 0.30; head.add(crown);
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), mat);
      spike.position.set(-0.15 + i * 0.1, 0.40, 0);
      head.add(spike);
    }
  }
}

// ════════════════════════════════════════════════════════════
// HEAD — human
// ════════════════════════════════════════════════════════════
function buildHumanHead(head, c, opts = {}) {
  const skinMat  = opts.skinMat;
  const hairMat  = toonMat(c.hair);
  const eyeMat   = toonMat(c.eyeWhite);
  const pupilMat = toonMat(c.pupil);
  const mouthMat = toonMat(c.mouth);
  const bloodMat = toonMat(c.blood);
  const toothMat = toonMat(c.tooth);
  const gumMat   = toonMat(0x8B0000);

  // Crânio
  const skull = new THREE.Mesh(rb(0.42, 0.4, 0.4, 0.08), skinMat);
  skull.castShadow = true;
  skull.receiveShadow = true;
  head.add(skull);

  // Mandíbula (queixo mais pronunciado)
  const jaw = new THREE.Mesh(rb(0.36, 0.16, 0.34, 0.05), skinMat);
  jaw.position.set(0, -0.22, 0.03);
  head.add(jaw);

  // Sobrancelha carrancuda
  const brow = new THREE.Mesh(rb(0.32, 0.05, 0.03, 0.005), hairMat);
  brow.position.set(0, 0.14, 0.21);
  brow.rotation.z = 0.10;
  head.add(brow);

  // Nariz
  const nose = new THREE.Mesh(rb(0.08, 0.08, 0.07, 0.02), skinMat);
  nose.position.set(0, -0.02, 0.22);
  head.add(nose);

  // Olhos com pálpebra
  for (const side of [-1, 1]) {
    // globo
    const eye = new THREE.Mesh(rb(0.13, 0.15, 0.04, 0.02), eyeMat);
    eye.position.set(side * 0.11, 0.06, 0.20);
    head.add(eye);

    // pupila
    const pupil = new THREE.Mesh(rb(0.055, 0.07, 0.02, 0.01), pupilMat);
    pupil.position.set(side * 0.11 + (Math.random() - 0.5) * 0.04, 0.05, 0.22);
    head.add(pupil);

    // pálpebra caída (zumbi)
    const lid = new THREE.Mesh(rb(0.13, 0.05, 0.05, 0.01), skinMat);
    lid.position.set(side * 0.11, 0.10, 0.20);
    lid.rotation.x = 0.3;
    head.add(lid);

    // olheira escura
    const sock = new THREE.Mesh(rb(0.14, 0.06, 0.01, 0.005), toonMat(0x2A1A1A));
    sock.position.set(side * 0.11, 0.00, 0.215);
    head.add(sock);
  }

  // Boca aberta com dentes e gengiva
  const mouth = new THREE.Mesh(rb(0.24, 0.10, 0.02, 0.01), mouthMat);
  mouth.position.set(0, -0.13, 0.22);
  head.add(mouth);

  // Gengiva superior
  const gum = new THREE.Mesh(rb(0.22, 0.03, 0.03, 0.005), gumMat);
  gum.position.set(0, -0.10, 0.225);
  head.add(gum);

  // Dentes — variável
  const nTeeth = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < nTeeth; i++) {
    const tx = -0.08 + i * (0.16 / Math.max(1, nTeeth - 1));
    const tooth = new THREE.Mesh(rb(0.035, 0.05, 0.03, 0.005), toothMat);
    tooth.position.set(tx, -0.105, 0.235);
    tooth.rotation.z = (Math.random() - 0.5) * 0.2;
    head.add(tooth);
  }

  // Ferimento na cabeça (aleatório lado)
  const wSide = Math.random() < 0.5 ? -1 : 1;
  const headWound = new THREE.Mesh(rb(0.14, 0.14, 0.03, 0.02), bloodMat);
  headWound.position.set(wSide * 0.14, 0.14, 0.20);
  head.add(headWound);

  // Cabelo (se não tiver headgear)
  if (!opts.headgear) {
    // base do cabelo
    const hair = new THREE.Mesh(rb(0.44, 0.10, 0.42, 0.04), hairMat);
    hair.position.y = 0.22;
    head.add(hair);

    // tufos laterais
    const tuftL = new THREE.Mesh(rb(0.06, 0.14, 0.10, 0.02), hairMat);
    tuftL.position.set(-0.22, 0.16, -0.04);
    head.add(tuftL);

    const tuftR = new THREE.Mesh(rb(0.06, 0.14, 0.10, 0.02), hairMat);
    tuftR.position.set( 0.22, 0.16, -0.04);
    head.add(tuftR);
  }

  applyHeadgear(head, opts.headgear);
}

// ════════════════════════════════════════════════════════════
// HEAD — donkey
// ════════════════════════════════════════════════════════════
function buildDonkeyHead(head, c, opts = {}) {
  const skinMat = opts.skinMat;
  const eyeMat = toonMat(c.eyeWhite);
  const pupilMat = toonMat(c.pupil);
  const bloodMat = toonMat(c.blood);

  const skull = new THREE.Mesh(rb(0.42, 0.4, 0.42, 0.08), skinMat);
  head.add(skull);

  // Focinho comprido
  const muzzle = new THREE.Mesh(rb(0.26, 0.22, 0.34, 0.06), toonMat(0xB8A796));
  muzzle.position.set(0, -0.10, 0.30);
  head.add(muzzle);

  // Narinas
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(rb(0.05, 0.05, 0.02, 0.01), toonMat(0x2A1F1A));
    nostril.position.set(side * 0.07, -0.06, 0.46);
    head.add(nostril);
  }

  // Orelhas caídas
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(rb(0.12, 0.3, 0.12, 0.04), skinMat);
    ear.position.set(side * 0.18, 0.30, -0.02);
    ear.rotation.z = side * 0.35;
    head.add(ear);
  }

  // Olhos grandes
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(rb(0.13, 0.15, 0.04, 0.02), eyeMat);
    eye.position.set(side * 0.12, 0.08, 0.21);
    head.add(eye);
    const pupil = new THREE.Mesh(rb(0.055, 0.07, 0.02, 0.01), pupilMat);
    pupil.position.set(side * 0.12, 0.07, 0.23);
    head.add(pupil);
  }

  // Ferimento
  const wound = new THREE.Mesh(rb(0.16, 0.16, 0.03, 0.02), bloodMat);
  wound.position.set(-0.16, 0.18, 0.18);
  head.add(wound);
}

// ════════════════════════════════════════════════════════════
// HEAD — judge (juiz)
// ════════════════════════════════════════════════════════════
function buildJudgeHead(head, c, opts = {}) {
  const skinMat = opts.skinMat;
  const eyeMat = toonMat(c.eyeWhite);
  const pupilMat = toonMat(c.pupil);
  const bloodMat = toonMat(c.blood);
  const grayHair = toonMat(0x888888);

  const skull = new THREE.Mesh(rb(0.42, 0.42, 0.42, 0.08), skinMat);
  head.add(skull);

  // Sobrancelha severa
  const brow = new THREE.Mesh(rb(0.34, 0.05, 0.03, 0.005), grayHair);
  brow.position.set(0, 0.14, 0.21);
  brow.rotation.z = 0.05;
  head.add(brow);

  // Olhos
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(rb(0.12, 0.12, 0.04, 0.02), eyeMat);
    eye.position.set(side * 0.11, 0.06, 0.21);
    head.add(eye);
    const pupil = new THREE.Mesh(rb(0.05, 0.05, 0.02, 0.01), pupilMat);
    pupil.position.set(side * 0.11, 0.05, 0.23);
    head.add(pupil);
  }

  // Bigode
  const must = new THREE.Mesh(rb(0.28, 0.06, 0.06, 0.02), grayHair);
  must.position.set(0, -0.10, 0.21);
  head.add(must);

  // Barba quadrada
  const beard = new THREE.Mesh(rb(0.30, 0.20, 0.16, 0.05), grayHair);
  beard.position.set(0, -0.24, 0.14);
  head.add(beard);

  // Cabelo
  const hair = new THREE.Mesh(rb(0.44, 0.12, 0.44, 0.04), grayHair);
  hair.position.y = 0.22;
  head.add(hair);

  // Ferimento
  const wound = new THREE.Mesh(rb(0.14, 0.14, 0.03, 0.02), bloodMat);
  wound.position.set(-0.16, 0.16, 0.18);
  head.add(wound);
}

// ════════════════════════════════════════════════════════════
// MÃO com DEDOS
// ════════════════════════════════════════════════════════════
function buildHand(parent, skinMat, sideSign) {
  const palm = new THREE.Mesh(rb(0.14, 0.12, 0.1, 0.03), skinMat);
  palm.position.set(0, -0.26, 0.02);
  palm.castShadow = true;
  parent.add(palm);

  // 3 dedos esqueléticos
  const fingerLen = 0.07;
  for (let i = 0; i < 3; i++) {
    const finger = new THREE.Mesh(rb(0.028, fingerLen, 0.028, 0.008), skinMat);
    finger.position.set(
      -0.03 + i * 0.03,
      -0.26 - fingerLen * 0.5 - 0.05,
      0.02
    );
    finger.rotation.x = -0.35;
    parent.add(finger);
  }

  // Polegar
  const thumb = new THREE.Mesh(rb(0.032, 0.05, 0.032, 0.008), skinMat);
  thumb.position.set(sideSign * 0.075, -0.24, 0.05);
  thumb.rotation.z = -sideSign * 0.6;
  parent.add(thumb);
}

// ════════════════════════════════════════════════════════════
// PÉ com sola e biqueira
// ════════════════════════════════════════════════════════════
function buildFoot(parent, shoeMat, accentMat) {
  // sola
  const sole = new THREE.Mesh(rb(0.2, 0.04, 0.3, 0.01), accentMat);
  sole.position.set(0, -0.08, 0.06);
  parent.add(sole);

  // corpo do pé
  const foot = new THREE.Mesh(rb(0.19, 0.1, 0.28, 0.03), shoeMat);
  foot.position.set(0, -0.03, 0.06);
  foot.castShadow = true;
  parent.add(foot);

  // biqueira
  const toe = new THREE.Mesh(rb(0.19, 0.06, 0.08, 0.02), accentMat);
  toe.position.set(0, -0.05, 0.18);
  parent.add(toe);
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

  const skinMat  = toonMat(c.skin);
  const shirtMat = toonMat(c.shirt);
  const pantsMat = toonMat(c.pants);
  const shoeMat  = toonMat(c.shoe);
  const beltMat  = toonMat(c.belt);
  const accentMat = toonMat(c.accent);
  const buttonMat = toonMat(c.button);
  const bloodMat = toonMat(c.blood);

  const root = new THREE.Group();

  // ════ PELVIS ════
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.93;
  root.add(pelvis);

  const pelvisMesh = new THREE.Mesh(rb(0.42 * bs.torso, 0.24, 0.26 * bs.torso, 0.05), pantsMat);
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  pelvis.add(pelvisMesh);

  // cinto
  const belt = new THREE.Mesh(rb(0.44 * bs.torso, 0.06, 0.28 * bs.torso, 0.02), beltMat);
  belt.position.y = 0.10;
  pelvis.add(belt);

  // fivela
  const buckle = new THREE.Mesh(rb(0.08, 0.08, 0.02, 0.01), buttonMat);
  buckle.position.set(0, 0.10, 0.15 * bs.torso);
  pelvis.add(buckle);

  // ════ SPINE LOWER ════
  const spineLower = new THREE.Group();
  spineLower.position.y = 0.12;
  pelvis.add(spineLower);

  const torsoLower = new THREE.Mesh(rb(0.44 * bs.torso, 0.30, 0.26 * bs.torso, 0.06), shirtMat);
  torsoLower.position.y = 0.08;
  torsoLower.castShadow = true;
  torsoLower.receiveShadow = true;
  spineLower.add(torsoLower);

  // ════ SPINE UPPER ════
  const spineUpper = new THREE.Group();
  spineUpper.position.y = 0.24;
  spineLower.add(spineUpper);

  const chest = new THREE.Mesh(rb(0.48 * bs.torso, 0.32, 0.28 * bs.torso, 0.07), shirtMat);
  chest.position.y = 0.08;
  chest.castShadow = true;
  chest.receiveShadow = true;
  spineUpper.add(chest);

  // barriga (se gordo)
  if (build === 'fat' || build === 'brute') {
    const belly = new THREE.Mesh(rb(0.42 * bs.torso, 0.22, 0.20 * bs.belly, 0.08), shirtMat);
    belly.position.set(0, -0.14, 0.12 * bs.torso);
    spineLower.add(belly);
  }

  // colarinho
  const collar = new THREE.Mesh(rb(0.32 * bs.torso, 0.06, 0.26 * bs.torso, 0.02), accentMat);
  collar.position.y = 0.23;
  spineUpper.add(collar);

  // mancha de sangue no peito
  const chestWound = new THREE.Mesh(rb(0.16, 0.14, 0.02, 0.02), bloodMat);
  chestWound.position.set(-0.08 * bs.torso, 0.05, 0.15 * bs.torso);
  spineUpper.add(chestWound);

  // ════ NECK ════
  const neck = new THREE.Group();
  neck.position.y = 0.28;
  spineUpper.add(neck);

  const neckMesh = new THREE.Mesh(rb(0.14, 0.12, 0.14, 0.03), skinMat);
  neckMesh.position.y = 0.02;
  neck.add(neckMesh);

  // ════ HEAD ════
  const head = new THREE.Group();
  neck.add(head);

  if (variant === 'donkey') {
    buildDonkeyHead(head, c, { skinMat, headgear: type.headgear });
  } else if (variant === 'judge') {
    buildJudgeHead(head, c, { skinMat });
  } else {
    buildHumanHead(head, c, { skinMat, headgear: type.headgear });
  }

  // ════ BRAÇOS ════
  function buildArm(sideSign) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideSign * 0.30 * bs.torso, 0.14, 0);
    spineUpper.add(shoulder);

    // parte de cima — pode ser manga longa ou curta (aleatório)
    const isShortSleeve = Math.random() < 0.4;
    const upperMat = isShortSleeve ? skinMat : shirtMat;

    const upperArm = new THREE.Mesh(rb(0.14 * bs.arms, 0.26, 0.14 * bs.arms, 0.04), shirtMat);
    upperArm.position.y = -0.13;
    upperArm.castShadow = true;
    upperArm.receiveShadow = true;
    shoulder.add(upperArm);

    // manga curta (faz um anel de pele no meio)
    if (isShortSleeve) {
      const sleeve = new THREE.Mesh(rb(0.15 * bs.arms, 0.1, 0.15 * bs.arms, 0.03), shirtMat);
      sleeve.position.y = -0.05;
      shoulder.add(sleeve);
    }

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    const foreArm = new THREE.Mesh(rb(0.12 * bs.arms, 0.24, 0.12 * bs.arms, 0.03), skinMat);
    foreArm.position.y = -0.12;
    foreArm.castShadow = true;
    foreArm.receiveShadow = true;
    elbow.add(foreArm);

    buildHand(elbow, skinMat, sideSign);

    return { shoulder, elbow };
  }
  const armL = buildArm(-1);
  const armR = buildArm( 1);

  // ════ PERNAS ════
  function buildLeg(sideSign) {
    const thigh = new THREE.Group();
    thigh.position.set(sideSign * 0.12 * bs.torso, 0, 0);
    pelvis.add(thigh);

    const thighMesh = new THREE.Mesh(rb(0.17 * bs.legs, 0.34, 0.17 * bs.legs, 0.04), pantsMat);
    thighMesh.position.y = -0.17;
    thighMesh.castShadow = true;
    thighMesh.receiveShadow = true;
    thigh.add(thighMesh);

    const knee = new THREE.Group();
    knee.position.y = -0.34;
    thigh.add(knee);

    const shin = new THREE.Mesh(rb(0.15 * bs.legs, 0.32, 0.15 * bs.legs, 0.03), pantsMat);
    shin.position.y = -0.16;
    shin.castShadow = true;
    shin.receiveShadow = true;
    knee.add(shin);

    // barra da calça (detalhe)
    const cuff = new THREE.Mesh(rb(0.16 * bs.legs, 0.04, 0.16 * bs.legs, 0.02), accentMat);
    cuff.position.y = -0.30;
    knee.add(cuff);

    const foot = new THREE.Group();
    foot.position.y = -0.32;
    knee.add(foot);

    buildFoot(foot, shoeMat, accentMat);

    return { thigh, knee, foot };
  }
  const legL = buildLeg(-1);
  const legR = buildLeg( 1);

  // ════ JOINTS ════
  const joints = {
    pelvis,
    spineLower,
    spineUpper,
    neck,
    head,
    shoulderL: armL.shoulder,
    elbowL:    armL.elbow,
    shoulderR: armR.shoulder,
    elbowR:    armR.elbow,
    thighL:    legL.thigh,
    kneeL:     legL.knee,
    footL:     legL.foot,
    thighR:    legR.thigh,
    kneeR:     legR.knee,
    footR:     legR.foot,
  };

  // pés no chão
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const feetOffset = bbox.min.y;
  if (Math.abs(feetOffset) > 0.001) {
    for (const child of root.children) {
      child.position.y -= feetOffset;
    }
  }

  // local boxes (raycast OBB)
  const localBoxes = {
    head:  new THREE.Box3(
      new THREE.Vector3(-0.24, -0.26, -0.24),
      new THREE.Vector3( 0.24,  0.28,  0.26)
    ),
    torso: new THREE.Box3(
      new THREE.Vector3(-0.30, -0.18, -0.18),
      new THREE.Vector3( 0.30,  0.42,  0.18)
    ),
    armL:  new THREE.Box3(
      new THREE.Vector3(-0.10, -0.58, -0.10),
      new THREE.Vector3( 0.10,  0.05,  0.10)
    ),
    armR:  new THREE.Box3(
      new THREE.Vector3(-0.10, -0.58, -0.10),
      new THREE.Vector3( 0.10,  0.05,  0.10)
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

  return {
    root,
    joints,
    localBoxes,
    skinColor: c.skin,
    variant,
    build,
    headLoll:      (Math.random() - 0.5) * 0.4,
    headPitchBase: (Math.random() - 0.5) * 0.3,
    armDroopL:     -0.10 - Math.random() * 0.30,
    armDroopR:     -0.10 - Math.random() * 0.30,
    limpAmount:    Math.random(),
    limpSide:      Math.random() < 0.5 ? -1 : 1,
    walkStyle:     Math.random(),
  };
}
