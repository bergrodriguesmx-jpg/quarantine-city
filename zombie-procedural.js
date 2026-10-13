// ============================================================
// zombie-procedural.js
// Zumbis 100% procedurais em estilo cartoon/quadrado.
// Compatível com o sistema de animação procedural (spring).
// Retorna os 15 joints que o animator espera.
// ============================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ════════════════════════════════════════════════════════════
// CACHE DE MATERIAIS E GEOMETRIAS
// ════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════
// PALETA CARTOON POR TIPO
// ════════════════════════════════════════════════════════════
function pickColor(palette, fallback) {
  if (!palette || palette.length === 0) return fallback;
  return palette[Math.floor(Math.random() * palette.length)];
}

function getCartoonPalette(typeKey, type) {
  return {
    skin:  pickColor(type?.skinPalette,  0x7BC950),
    shirt: pickColor(type?.shirtPalette, 0xCC1111),
    pants: pickColor(type?.pantsPalette, 0x5D4030),
    hair:  [0x2C1810, 0x1A0F08, 0x4A2818, 0x6B3A1F][Math.floor(Math.random() * 4)],
    shoe:  0x1A1A1A,
    eyeWhite: 0xFFFFFF,
    pupil: 0x000000,
    mouth: 0x2B0000,
    blood: 0x8B0000,
    tooth: 0xF5F5DC,
    accent: 0x222222,
  };
}

// ════════════════════════════════════════════════════════════
// HEADGEAR CARTOON
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
    const lamp = new THREE.Mesh(rb(0.08, 0.08, 0.06, 0.02), toonMat(0xFFFF88));
    lamp.position.set(0, 0.24, 0.24); head.add(lamp);
  } else if (headgear === 'balaclava') {
    const mat = toonMat(0x0A0A0A);
    const mask = new THREE.Mesh(rb(0.4, 0.3, 0.4, 0.05), mat);
    mask.position.y = -0.02; head.add(mask);
    const top = new THREE.Mesh(rb(0.42, 0.14, 0.42, 0.05), mat);
    top.position.y = 0.22; head.add(top);
    // Olhos aparecem por cima
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(rb(0.09, 0.05, 0.02, 0.005), toonMat(0xFF2020));
      eye.position.set(side * 0.1, 0.05, 0.21); head.add(eye);
    }
  } else if (headgear === 'hood') {
    const mat = toonMat(0x0A0A0A);
    const hood = new THREE.Mesh(rb(0.5, 0.5, 0.48, 0.1), mat);
    hood.position.set(0, 0.1, -0.03); head.add(hood);
    const shadow = new THREE.Mesh(rb(0.3, 0.3, 0.06, 0.05), toonMat(0x000000));
    shadow.position.set(0, 0, 0.2); head.add(shadow);
  } else if (headgear === 'crown') {
    const mat = toonMat(0xFFD700);
    const crown = new THREE.Mesh(rb(0.44, 0.12, 0.44, 0.03), mat);
    crown.position.y = 0.28; head.add(crown);
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), mat);
      spike.position.set(-0.15 + i * 0.1, 0.38, 0);
      head.add(spike);
    }
  }
}

// ════════════════════════════════════════════════════════════
// BUILDER PRINCIPAL
// ════════════════════════════════════════════════════════════
export function buildCartoonZombie(typeKey = 'pt', type = {}) {
  const c = getCartoonPalette(typeKey, type);
  const variant = type?.variant || 'normal';

  const skinMat  = toonMat(c.skin);
  const shirtMat = toonMat(c.shirt);
  const pantsMat = toonMat(c.pants);
  const shoeMat  = toonMat(c.shoe);
  const hairMat  = toonMat(c.hair);
  const eyeMat   = toonMat(c.eyeWhite);
  const pupilMat = toonMat(c.pupil);
  const mouthMat = toonMat(c.mouth);
  const bloodMat = toonMat(c.blood);
  const toothMat = toonMat(c.tooth);
  const accentMat = toonMat(c.accent);

  const root = new THREE.Group();

  // ════════════════════════════════════════════════════
  // PELVIS
  // ════════════════════════════════════════════════════
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.93;
  root.add(pelvis);

  const pelvisMesh = new THREE.Mesh(rb(0.42, 0.24, 0.26, 0.05), pantsMat);
  pelvisMesh.castShadow = true;
  pelvisMesh.receiveShadow = true;
  pelvis.add(pelvisMesh);

  // ════════════════════════════════════════════════════
  // SPINE LOWER
  // ════════════════════════════════════════════════════
  const spineLower = new THREE.Group();
  spineLower.position.y = 0.12;
  pelvis.add(spineLower);

  const torsoLower = new THREE.Mesh(rb(0.44, 0.3, 0.26, 0.06), shirtMat);
  torsoLower.position.y = 0.08;
  torsoLower.castShadow = true;
  torsoLower.receiveShadow = true;
  spineLower.add(torsoLower);

  // ════════════════════════════════════════════════════
  // SPINE UPPER
  // ════════════════════════════════════════════════════
  const spineUpper = new THREE.Group();
  spineUpper.position.y = 0.24;
  spineLower.add(spineUpper);

  const chest = new THREE.Mesh(rb(0.48, 0.32, 0.28, 0.07), shirtMat);
  chest.position.y = 0.08;
  chest.castShadow = true;
  chest.receiveShadow = true;
  spineUpper.add(chest);

  // Colarinho (detalhe)
  const collar = new THREE.Mesh(rb(0.32, 0.06, 0.24, 0.02), accentMat);
  collar.position.y = 0.23;
  spineUpper.add(collar);

  // Mancha de sangue no peito
  const chestWound = new THREE.Mesh(rb(0.16, 0.14, 0.02, 0.02), bloodMat);
  chestWound.position.set(-0.08, 0.05, 0.15);
  spineUpper.add(chestWound);

  // ════════════════════════════════════════════════════
  // NECK
  // ════════════════════════════════════════════════════
  const neck = new THREE.Group();
  neck.position.y = 0.28;
  spineUpper.add(neck);

  const neckMesh = new THREE.Mesh(rb(0.14, 0.12, 0.14, 0.03), skinMat);
  neckMesh.position.y = 0.02;
  neck.add(neckMesh);

  // ════════════════════════════════════════════════════
  // HEAD
  // ════════════════════════════════════════════════════
  const head = new THREE.Group();
  neck.add(head);

  // Cabeça grande cúbica
  const skull = new THREE.Mesh(rb(0.4, 0.4, 0.38, 0.08), skinMat);
  skull.castShadow = true;
  skull.receiveShadow = true;
  head.add(skull);

  // Sobrancelha carrancuda
  const brow = new THREE.Mesh(rb(0.3, 0.05, 0.03, 0.005), hairMat);
  brow.position.set(0, 0.14, 0.20);
  brow.rotation.z = 0.08;
  head.add(brow);

  if (variant === 'donkey') {
    // Focinho grande
    const muzzle = new THREE.Mesh(rb(0.22, 0.2, 0.3, 0.06), toonMat(0xB8A796));
    muzzle.position.set(0, -0.08, 0.28);
    head.add(muzzle);
    const nostrilL = new THREE.Mesh(rb(0.04, 0.04, 0.02, 0.01), toonMat(0x2A1F1A));
    nostrilL.position.set(-0.06, -0.04, 0.44); head.add(nostrilL);
    const nostrilR = new THREE.Mesh(rb(0.04, 0.04, 0.02, 0.01), toonMat(0x2A1F1A));
    nostrilR.position.set(0.06, -0.04, 0.44); head.add(nostrilR);
    // Orelhas
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(rb(0.1, 0.28, 0.1, 0.03), skinMat);
      ear.position.set(side * 0.16, 0.32, 0);
      ear.rotation.z = side * 0.3;
      head.add(ear);
    }
  } else {
    // Nariz
    const nose = new THREE.Mesh(rb(0.08, 0.06, 0.06, 0.02), skinMat);
    nose.position.set(0, 0, 0.22);
    head.add(nose);
  }

  if (variant !== 'donkey' && variant !== 'judge') {
    // Olhos googly
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(rb(0.12, 0.14, 0.04, 0.02), eyeMat);
      eye.position.set(side * 0.1, 0.05, 0.20);
      head.add(eye);

      const pupil = new THREE.Mesh(rb(0.05, 0.06, 0.02, 0.01), pupilMat);
      pupil.position.set(side * 0.1 + (Math.random() - 0.5) * 0.04, 0.04, 0.22);
      head.add(pupil);
    }

    // Boca grande com dentes
    const mouth = new THREE.Mesh(rb(0.26, 0.09, 0.03, 0.01), mouthMat);
    mouth.position.set(0, -0.13, 0.20);
    head.add(mouth);

    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(rb(0.04, 0.05, 0.03, 0.005), toothMat);
      tooth.position.set(-0.09 + i * 0.06, -0.1, 0.21);
      head.add(tooth);
    }
  }

  if (variant === 'judge') {
    // Barba quadrada
    const beard = new THREE.Mesh(rb(0.32, 0.18, 0.14, 0.05), toonMat(0x888888));
    beard.position.set(0, -0.18, 0.14); head.add(beard);
    // Olhos
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(rb(0.1, 0.1, 0.03, 0.01), eyeMat);
      eye.position.set(side * 0.1, 0.05, 0.20); head.add(eye);
      const pupil = new THREE.Mesh(rb(0.04, 0.04, 0.02, 0.005), pupilMat);
      pupil.position.set(side * 0.1, 0.04, 0.22); head.add(pupil);
    }
  }

  // Ferimento na cabeça
  const headWound = new THREE.Mesh(rb(0.14, 0.14, 0.03, 0.02), bloodMat);
  headWound.position.set(-0.14, 0.14, 0.20);
  head.add(headWound);

  // Cabelo (fita por cima) — exceto se tem headgear
  if (!type.headgear && variant !== 'donkey') {
    const hair = new THREE.Mesh(rb(0.42, 0.1, 0.4, 0.04), hairMat);
    hair.position.y = 0.22;
    head.add(hair);
  }

  // Headgear
  applyHeadgear(head, type.headgear);

  // ════════════════════════════════════════════════════
  // BRAÇOS (função helper pra espelhar)
  // ════════════════════════════════════════════════════
  function buildArm(sideSign) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideSign * 0.3, 0.14, 0);
    spineUpper.add(shoulder);

    const upperArm = new THREE.Mesh(rb(0.14, 0.26, 0.14, 0.04), shirtMat);
    upperArm.position.y = -0.13;
    upperArm.castShadow = true;
    upperArm.receiveShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    const foreArm = new THREE.Mesh(rb(0.12, 0.24, 0.12, 0.03), skinMat);
    foreArm.position.y = -0.12;
    foreArm.castShadow = true;
    foreArm.receiveShadow = true;
    elbow.add(foreArm);

    const hand = new THREE.Mesh(rb(0.14, 0.12, 0.1, 0.03), skinMat);
    hand.position.set(0, -0.26, 0.02);
    elbow.add(hand);

    return { shoulder, elbow };
  }
  const armL = buildArm(-1);
  const armR = buildArm(1);

  // ════════════════════════════════════════════════════
  // PERNAS
  // ════════════════════════════════════════════════════
  function buildLeg(sideSign) {
    const thigh = new THREE.Group();
    thigh.position.set(sideSign * 0.12, 0, 0);
    pelvis.add(thigh);

    const thighMesh = new THREE.Mesh(rb(0.17, 0.34, 0.17, 0.04), pantsMat);
    thighMesh.position.y = -0.17;
    thighMesh.castShadow = true;
    thighMesh.receiveShadow = true;
    thigh.add(thighMesh);

    const knee = new THREE.Group();
    knee.position.y = -0.34;
    thigh.add(knee);

    const shin = new THREE.Mesh(rb(0.15, 0.32, 0.15, 0.03), pantsMat);
    shin.position.y = -0.16;
    shin.castShadow = true;
    shin.receiveShadow = true;
    knee.add(shin);

    const foot = new THREE.Group();
    foot.position.y = -0.32;
    knee.add(foot);

    const footMesh = new THREE.Mesh(rb(0.19, 0.1, 0.28, 0.03), shoeMat);
    footMesh.position.set(0, -0.04, 0.06);
    footMesh.castShadow = true;
    foot.add(footMesh);

    return { thigh, knee, foot };
  }
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // ════════════════════════════════════════════════════
  // JOINTS OBJECT (exatamente o que o game.js espera)
  // ════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════
  // AJUSTE: pés no chão
  // ════════════════════════════════════════════════════
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const feetOffset = bbox.min.y;
  if (Math.abs(feetOffset) > 0.001) {
    for (const child of root.children) {
      child.position.y -= feetOffset;
    }
  }

  // ════════════════════════════════════════════════════
  // LOCAL BOXES (raycast por OBB)
  // ════════════════════════════════════════════════════
  const localBoxes = {
    head:  new THREE.Box3(
      new THREE.Vector3(-0.24, -0.26, -0.24),
      new THREE.Vector3( 0.24,  0.28,  0.26)
    ),
    torso: new THREE.Box3(
      new THREE.Vector3(-0.3, -0.18, -0.18),
      new THREE.Vector3( 0.3,  0.42,  0.18)
    ),
    armL:  new THREE.Box3(
      new THREE.Vector3(-0.1, -0.54, -0.1),
      new THREE.Vector3( 0.1,  0.05,  0.1)
    ),
    armR:  new THREE.Box3(
      new THREE.Vector3(-0.1, -0.54, -0.1),
      new THREE.Vector3( 0.1,  0.05,  0.1)
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

  // ════════════════════════════════════════════════════
  // VARIAÇÕES ALEATÓRIAS (usadas pelo animator)
  // ════════════════════════════════════════════════════
  const headLoll      = (Math.random() - 0.5) * 0.4;
  const headPitchBase = (Math.random() - 0.5) * 0.3;
  const armDroopL     = -0.10 - Math.random() * 0.30;
  const armDroopR     = -0.10 - Math.random() * 0.30;
  const limpAmount    = Math.random();
  const limpSide      = Math.random() < 0.5 ? -1 : 1;
  const walkStyle     = Math.random();

  return {
    root,
    joints,
    localBoxes,
    skinColor: c.skin,
    variant,
    headLoll,
    headPitchBase,
    armDroopL,
    armDroopR,
    limpAmount,
    limpSide,
    walkStyle,
  };
}
