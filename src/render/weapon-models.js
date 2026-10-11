// ============================================================
// weapon-models.js — v2
// Modelos 3D de armas com PBR, mais detalhes, proporções reais.
// Mesma API pública (buildWeaponModel, buildAmmoBox, etc.)
// ============================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------
// Materiais PBR (MUITO melhor que Lambert)
// ------------------------------------------------------------
const MAT = {
  gunMetal:      new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.9, roughness: 0.38 }),
  gunMetalLight: new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.85, roughness: 0.42 }),
  gunMetalWorn:  new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.75, roughness: 0.55 }),
  steel:         new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1.0, roughness: 0.22 }),
  steelDark:     new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 1.0, roughness: 0.45 }),
  chrome:        new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1.0, roughness: 0.08 }),
  wood:          new THREE.MeshStandardMaterial({ color: 0x6b4423, metalness: 0.05, roughness: 0.72 }),
  woodDark:      new THREE.MeshStandardMaterial({ color: 0x4a2f18, metalness: 0.05, roughness: 0.82 }),
  woodVarnish:   new THREE.MeshStandardMaterial({ color: 0x8b5a2b, metalness: 0.1, roughness: 0.5 }),
  gripPoly:      new THREE.MeshStandardMaterial({ color: 0x141618, metalness: 0.15, roughness: 0.92 }),
  brass:         new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1.0, roughness: 0.3 }),
  black:         new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.3, roughness: 0.85 }),
  accent:        new THREE.MeshStandardMaterial({ color: 0xcc0000, metalness: 0.3, roughness: 0.55 }),
  skin:          new THREE.MeshStandardMaterial({ color: 0xd4a574, metalness: 0.0, roughness: 0.78 }),
  blood:         new THREE.MeshStandardMaterial({ color: 0x6b0000, metalness: 0.0, roughness: 0.55 }),
  rust:          new THREE.MeshStandardMaterial({ color: 0x6b3a1f, metalness: 0.4, roughness: 0.85 }),
  fabric:        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.0, roughness: 0.95 }),
  ammoBox:       new THREE.MeshStandardMaterial({ color: 0x3a3a2a, metalness: 0.3, roughness: 0.7 }),
};

// ------------------------------------------------------------
// Helpers de geometria
// ------------------------------------------------------------
const rbc = new Map();
function rb(w, h, d, r = 0.02) {
  const k = `rb:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${r.toFixed(3)}`;
  let g = rbc.get(k);
  if (!g) {
    const rr = Math.min(r, Math.min(w, h, d) * 0.45);
    g = new RoundedBoxGeometry(w, h, d, 3, rr);
    rbc.set(k, g);
  }
  return g;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Cilindro entre dois pontos (pra canos, cabos, etc.)
function cylBetween(x1, y1, z1, x2, y2, z2, radius, mat, segments = 12) {
  const start = new THREE.Vector3(x1, y1, z1);
  const end = new THREE.Vector3(x2, y2, z2);
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, segments);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(start).add(dir.clone().multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  m.castShadow = true;
  return m;
}

// Parafuso (cilindro + rasgo)
function screw(radius, height, mat) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), mat);
  head.castShadow = true;
  g.add(head);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(radius*1.8, height*1.05, radius*0.2), MAT.black);
  g.add(slot);
  return g;
}

// Mira frontal
function frontSight(mat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.015, 0.03), mat);
  base.castShadow = true;
  g.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.025, 0.006), mat);
  post.position.y = 0.015;
  g.add(post);
  return g;
}

// Mira traseira
function rearSight(mat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), mat);
  base.castShadow = true;
  g.add(base);
  const notchL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  notchL.position.set(-0.014, 0.012, 0);
  g.add(notchL);
  const notchR = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.02), mat);
  notchR.position.set(0.014, 0.012, 0);
  g.add(notchR);
  return g;
}

// Trigger (gatilho)
function trigger(mat) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.02, 3, 6), mat);
  t.rotation.x = 0.25;
  t.castShadow = true;
  g.add(t);
  return g;
}

// Trigger guard
function triggerGuard(mat) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 12, Math.PI * 1.2), mat);
  t.rotation.z = -Math.PI * 0.1;
  t.rotation.x = Math.PI / 2;
  t.castShadow = true;
  g.add(t);
  return g;
}

// Magazine curvo (banana mag)
function curvedMag(width, height, curve, mat) {
  const g = new THREE.Group();
  const segments = 8;
  const segH = height / segments;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const tilt = t * curve;
    const seg = new THREE.Mesh(rb(width, segH * 1.05, width * 0.7, 0.008), mat);
    seg.position.y = -i * segH - segH * 0.5;
    seg.position.z = -t * curve * height * 0.5;
    seg.rotation.x = tilt;
    seg.castShadow = true;
    g.add(seg);
  }
  return g;
}

// Hand grip anatômico (empunhadura)
function handGrip(height, width, mat) {
  const g = new THREE.Group();
  const s = 6;
  for (let i = 0; i < s; i++) {
    const t = i / (s - 1);
    const w = width * (1 - t * 0.15);
    const segH = height / s;
    const seg = new THREE.Mesh(rb(w, segH * 1.05, w * 0.75, 0.01), mat);
    seg.position.y = -i * segH - segH * 0.5;
    seg.rotation.x = 0.05;
    seg.castShadow = true;
    g.add(seg);
  }
  return g;
}

// ------------------------------------------------------------
// MODELOS POR ARMA
// ------------------------------------------------------------

// ---------- KNIFE (faca tática) ----------
function buildKnife(g) {
  // Punho com ranhuras
  const handle = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const seg = new THREE.Mesh(rb(0.032, 0.05, 0.028, 0.008), MAT.gripPoly);
    seg.position.y = 0.06 - i * 0.05;
    seg.rotation.x = 0.05;
    handle.add(seg);
  }
  // Guarda
  const guard = mesh(rb(0.055, 0.014, 0.03, 0.004), MAT.steelDark, 0, 0.14, 0);
  handle.add(guard);
  // Lâmina
  const bladeProfile = new THREE.Shape();
  bladeProfile.moveTo(-0.012, 0);
  bladeProfile.lineTo(-0.012, 0.32);
  bladeProfile.lineTo(-0.008, 0.36);
  bladeProfile.lineTo(0.004, 0.38);
  bladeProfile.lineTo(0.012, 0.32);
  bladeProfile.lineTo(0.012, 0);
  bladeProfile.lineTo(-0.012, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeProfile, { depth: 0.006, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2 });
  const blade = new THREE.Mesh(bladeGeo, MAT.steel);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0, 0.14, 0);
  blade.castShadow = true;
  handle.add(blade);
  // Fuller (sangria)
  const fuller = mesh(rb(0.006, 0.22, 0.004, 0.001), MAT.steelDark, 0, 0.25, 0.003);
  handle.add(fuller);
  g.add(handle);

  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.01, 0.02);
  g.add(hand);
  // Dedos
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.03, 3, 6), MAT.skin);
    f.rotation.z = Math.PI / 2;
    f.position.set(0.03, 0.03 - i * 0.018, 0.02);
    g.add(f);
  }
}

// ---------- CLUB (porrete) ----------
function buildClub(g) {
  // Cabo de madeira
  const shaft = mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 10), MAT.woodDark, 0, 0, -0.15);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  // Cabeça bulbosa
  const headShape = new THREE.Shape();
  headShape.moveTo(0, 0);
  headShape.bezierCurveTo(0.05, 0, 0.06, 0.08, 0.045, 0.15);
  headShape.lineTo(-0.045, 0.15);
  headShape.bezierCurveTo(-0.06, 0.08, -0.05, 0, 0, 0);
  const headGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.05, 0.02),
    new THREE.Vector2(0.06, 0.08),
    new THREE.Vector2(0.055, 0.13),
    new THREE.Vector2(0.04, 0.15),
    new THREE.Vector2(0, 0.16),
  ], 12);
  const head = new THREE.Mesh(headGeo, MAT.wood);
  head.rotation.x = -Math.PI / 2;
  head.position.set(0, 0, -0.62);
  head.castShadow = true;
  g.add(head);
  // Pregos
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const nail = mesh(new THREE.SphereGeometry(0.008, 6, 4), MAT.steelDark, Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.55);
    g.add(nail);
  }
  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.08);
  g.add(hand);
}

// ---------- PIPE (cano de ferro) ----------
function buildPipe(g) {
  // Cano principal
  const pipe = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 12), MAT.gunMetalWorn, 0, 0, -0.2);
  pipe.rotation.x = Math.PI / 2;
  g.add(pipe);
  // Rosca perto da ponta
  for (let i = 0; i < 6; i++) {
    const thread = mesh(new THREE.TorusGeometry(0.019, 0.002, 4, 12), MAT.steelDark, 0, 0, -0.4 - i * 0.015);
    thread.rotation.y = Math.PI / 2;
    g.add(thread);
  }
  // Conexão (união)
  const joint = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 12), MAT.steelDark, 0, 0, -0.35);
  joint.rotation.x = Math.PI / 2;
  g.add(joint);
  // Ferrugem na ponta
  const rustTip = mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.06, 12), MAT.rust, 0, 0, -0.56);
  rustTip.rotation.x = Math.PI / 2;
  g.add(rustTip);
  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.06);
  g.add(hand);
}

// ---------- PIPE WRENCH (chave grifo) ----------
function buildPipeWrench(g) {
  // Cabo
  const handle = mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.55, 10), MAT.gunMetalWorn, 0, 0, -0.15);
  handle.rotation.x = Math.PI / 2;
  g.add(handle);
  // Roscado superior
  const screwAdj = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0, -0.35);
  screwAdj.rotation.x = Math.PI / 2;
  g.add(screwAdj);
  // Cabeça — mandíbula fixa
  const jawFix = mesh(rb(0.025, 0.06, 0.08, 0.006), MAT.steelDark, 0, 0.005, -0.62);
  g.add(jawFix);
  // Mandíbula móvel
  const jawMov = mesh(rb(0.025, 0.045, 0.06, 0.006), MAT.steelDark, 0, -0.04, -0.6);
  g.add(jawMov);
  // Parafuso
  const sc = screw(0.008, 0.006, MAT.brass);
  sc.rotation.z = Math.PI / 2;
  sc.position.set(0.016, 0, -0.48);
  g.add(sc);
  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.08);
  g.add(hand);
}

// ---------- CLEAVER (cutelo) ----------
function buildCleaver(g) {
  // Punho de madeira
  const grip = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.14, 10), MAT.woodDark, 0, 0, 0.08);
  grip.rotation.x = Math.PI / 2;
  g.add(grip);
  // Rebites no cabo
  for (let i = 0; i < 2; i++) {
    const rivet = mesh(new THREE.SphereGeometry(0.005, 6, 4), MAT.brass, 0, 0, 0.04 + i * 0.06);
    rivet.scale.set(2, 0.5, 1);
    g.add(rivet);
  }
  // Lâmina retangular grande
  const blade = mesh(rb(0.005, 0.16, 0.28, 0.002), MAT.steel, 0, 0.02, -0.2);
  g.add(blade);
  // Fio (borda de corte) — mais claro
  const edge = mesh(rb(0.002, 0.16, 0.28, 0.001), MAT.chrome, 0.0025, 0.02, -0.2);
  g.add(edge);
  // Sangria
  const blood = mesh(rb(0.006, 0.014, 0.15, 0.002), MAT.steelDark, 0, 0.055, -0.16);
  g.add(blood);
  // Furo na ponta
  const hole = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 10), MAT.black, 0, 0.02, -0.32);
  hole.rotation.z = Math.PI / 2;
  g.add(hole);
  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.08);
  g.add(hand);
}

// ---------- KATANA ----------
function buildKatana(g) {
  // Tsuka (punho) com trança
  const tsuka = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 8), MAT.gripPoly, 0, 0, 0.12);
  tsuka.rotation.x = Math.PI / 2;
  g.add(tsuka);
  // Trança (diamantes) — varios losangos vermelhos
  for (let i = 0; i < 6; i++) {
    const wrap = mesh(rb(0.032, 0.018, 0.018, 0.003), MAT.accent, 0, 0, 0.03 + i * 0.035);
    wrap.rotation.z = Math.PI / 4;
    g.add(wrap);
  }
  // Kashira (pomo)
  const kashira = mesh(new THREE.CylinderGeometry(0.017, 0.014, 0.02, 8), MAT.steelDark, 0, 0, 0.24);
  kashira.rotation.x = Math.PI / 2;
  g.add(kashira);
  // Tsuba (guarda)
  const tsuba = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 8), MAT.gunMetal, 0, 0, 0.005);
  tsuba.rotation.x = Math.PI / 2;
  g.add(tsuba);
  // Habaki (colar)
  const habaki = mesh(rb(0.018, 0.014, 0.025, 0.003), MAT.brass, 0, 0, -0.015);
  g.add(habaki);
  // Lâmina longa com curvatura sutil
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.009, 0);
  bladeShape.lineTo(-0.009, 0.7);
  bladeShape.quadraticCurveTo(-0.008, 0.75, 0.002, 0.78);
  bladeShape.quadraticCurveTo(0.008, 0.76, 0.009, 0.7);
  bladeShape.lineTo(0.009, 0);
  bladeShape.lineTo(-0.009, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0008, bevelSegments: 2 });
  const blade = new THREE.Mesh(bladeGeo, MAT.steel);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0, 0, -0.03);
  blade.castShadow = true;
  g.add(blade);
  // Hamon (linha do temper) — detalhe ondulado
  for (let i = 0; i < 15; i++) {
    const wave = mesh(new THREE.SphereGeometry(0.003, 6, 4), MAT.chrome, 0.008, Math.sin(i * 0.6) * 0.003, -0.05 - i * 0.045);
    g.add(wave);
  }
  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.12);
  g.add(hand);
}

// ---------- KUKRI ----------
function buildKukri(g) {
  // Punho
  const grip = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, 10), MAT.gripPoly, 0, 0, 0.075);
  grip.rotation.x = Math.PI / 2;
  g.add(grip);
  // Pomo metálico
  const pommel = mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.015, 10), MAT.steelDark, 0, 0, 0.145);
  pommel.rotation.x = Math.PI / 2;
  g.add(pommel);
  // Guarda
  const guard = mesh(rb(0.055, 0.014, 0.018, 0.003), MAT.brass, 0, 0, 0.005);
  g.add(guard);
  // Lâmina curvada (recurva)
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.bezierCurveTo(0.05, 0.02, 0.14, 0.03, 0.22, 0.07);
  bladeShape.lineTo(0.23, 0.04);
  bladeShape.bezierCurveTo(0.16, -0.02, 0.08, -0.05, 0, -0.02);
  bladeShape.lineTo(0, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2 });
  const blade = new THREE.Mesh(bladeGeo, MAT.steel);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0, 0, -0.01);
  blade.castShadow = true;
  g.add(blade);
  // Fuller
  const fuller = mesh(rb(0.06, 0.008, 0.004, 0.001), MAT.steelDark, 0.08, 0.04, 0);
  fuller.rotation.y = Math.PI / 2;
  g.add(fuller);
  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.075);
  g.add(hand);
}

// ---------- SHOVEL (pá) ----------
function buildShovel(g) {
  // Cabo
  const handle = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.85, 10), MAT.wood, 0, 0, -0.15);
  handle.rotation.x = Math.PI / 2;
  g.add(handle);
  // Empunhadura em D na ponta
  const grip = mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 12, Math.PI), MAT.woodDark, 0, 0.015, 0.28);
  grip.rotation.x = Math.PI / 2;
  grip.rotation.z = Math.PI / 2;
  g.add(grip);
  // Ferrule (conexão)
  const ferrule = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0, -0.58);
  ferrule.rotation.x = Math.PI / 2;
  g.add(ferrule);
  // Pá
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.055, 0);
  bladeShape.lineTo(-0.065, 0.12);
  bladeShape.lineTo(-0.045, 0.18);
  bladeShape.lineTo(0.045, 0.18);
  bladeShape.lineTo(0.065, 0.12);
  bladeShape.lineTo(0.055, 0);
  bladeShape.lineTo(-0.055, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.005, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2 });
  const blade = new THREE.Mesh(bladeGeo, MAT.steelDark);
  blade.rotation.x = -Math.PI / 2;
  blade.position.set(0, 0, -0.76);
  blade.castShadow = true;
  g.add(blade);
  // Reforço central
  const rib = mesh(rb(0.012, 0.14, 0.008, 0.002), MAT.steelDark, 0, 0.03, -0.7);
  rib.rotation.x = Math.PI / 2;
  g.add(rib);
  // Mão
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.skin);
  hand.position.set(0, -0.02, 0.2);
  g.add(hand);
}

// ---------- SCYTHE (foice do ceifador) ----------
function buildScythe(g) {
  // Cajado longo
  const staff = mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.4, 10), MAT.black, 0, 0, -0.4);
  staff.rotation.x = Math.PI / 2;
  g.add(staff);
  // Enfaixado
  for (let i = 0; i < 8; i++) {
    const wrap = mesh(new THREE.TorusGeometry(0.021, 0.004, 4, 10), MAT.accent, 0, 0, 0.05 - i * 0.035);
    wrap.rotation.y = Math.PI / 2;
    g.add(wrap);
  }
  // Conexão da lâmina
  const joint = mesh(rb(0.03, 0.028, 0.06, 0.005), MAT.gunMetal, 0, 0, -1.05);
  g.add(joint);
  // Lâmina curva (foice)
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.bezierCurveTo(0.15, 0.02, 0.32, 0.1, 0.4, 0.3);
  bladeShape.bezierCurveTo(0.42, 0.35, 0.38, 0.38, 0.34, 0.36);
  bladeShape.bezierCurveTo(0.28, 0.2, 0.14, 0.06, 0, 0.04);
  bladeShape.lineTo(0, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 2 });
  const blade = new THREE.Mesh(bladeGeo, MAT.steelDark);
  blade.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  blade.position.set(0.02, 0.02, -1.06);
  blade.castShadow = true;
  g.add(blade);
  // Fio da lâmina (brilhante)
  const edgeGeo = new THREE.TorusGeometry(0.38, 0.003, 4, 24, Math.PI / 2.5);
  const edge = new THREE.Mesh(edgeGeo, MAT.chrome);
  edge.rotation.set(Math.PI / 2, 0, -0.5);
  edge.position.set(0.02, 0.02, -1.06);
  g.add(edge);
  // Orbe na ponta
  const orb = mesh(new THREE.SphereGeometry(0.02, 10, 8), MAT.accent, 0.3, 0.18, -1.06);
  g.add(orb);
  // Mão (fantasma/preto)
  const hand = new THREE.Mesh(rb(0.06, 0.08, 0.05, 0.02), MAT.black);
  hand.position.set(0, -0.02, 0.2);
  g.add(hand);
}

// ---------- PISTOL ----------
function buildPistol(g) {
  // Slide (ferrolho)
  const slide = mesh(rb(0.032, 0.032, 0.18, 0.006), MAT.gunMetal, 0, 0.02, -0.06);
  g.add(slide);
  // Serrilhas traseiras
  for (let i = 0; i < 6; i++) {
    const serr = mesh(rb(0.033, 0.026, 0.003, 0.001), MAT.gunMetalWorn, 0, 0.02, 0.015 + i * 0.008);
    g.add(serr);
  }
  // Ejeção de porta
  const ejp = mesh(rb(0.02, 0.02, 0.05, 0.003), MAT.black, 0.014, 0.025, -0.07);
  g.add(ejp);
  // Frame
  const frame = mesh(rb(0.03, 0.025, 0.14, 0.005), MAT.gunMetalLight, 0, -0.01, -0.05);
  g.add(frame);
  // Cano
  const barrel = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 10), MAT.black, 0, 0.02, -0.16);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  // Muzzle
  const muzzle = mesh(new THREE.TorusGeometry(0.009, 0.002, 4, 10), MAT.black, 0, 0.02, -0.18);
  g.add(muzzle);
  // Grip
  const grip = handGrip(0.1, 0.032, MAT.gripPoly);
  grip.position.set(0, -0.02, 0.02);
  grip.rotation.x = 0.28;
  g.add(grip);
  // Trigger guard
  const tg = triggerGuard(MAT.gunMetalLight);
  tg.position.set(0, -0.03, -0.015);
  g.add(tg);
  // Trigger
  const tr = trigger(MAT.steel);
  tr.position.set(0, -0.022, -0.015);
  g.add(tr);
  // Mira frontal
  const fs = frontSight(MAT.gunMetal);
  fs.position.set(0, 0.038, -0.14);
  g.add(fs);
  // Mira traseira
  const rs = rearSight(MAT.gunMetal);
  rs.position.set(0, 0.038, 0.02);
  g.add(rs);
  // Magazine release
  const mrel = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 8), MAT.gunMetalLight, 0.014, -0.02, 0.02);
  mrel.rotation.z = Math.PI / 2;
  g.add(mrel);
  // Mão
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.07, 0.06);
  hand.rotation.x = 0.2;
  g.add(hand);
}

// ---------- REVOLVER ----------
function buildRevolver(g) {
  // Cano octogonal
  const barrel = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), MAT.steel, 0, 0.02, -0.12);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  // Underlug
  const under = mesh(rb(0.014, 0.014, 0.13, 0.003), MAT.steel, 0, 0.005, -0.11);
  g.add(under);
  // Top strap
  const top = mesh(rb(0.02, 0.006, 0.05, 0.002), MAT.steel, 0, 0.03, -0.02);
  g.add(top);
  // Cilindro (tambor) — 6 câmaras
  const cyl = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 12), MAT.steelDark, 0, 0.015, -0.02);
  cyl.rotation.x = Math.PI / 2;
  g.add(cyl);
  // Câmaras (buracos)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ch = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.052, 8), MAT.black, Math.cos(a) * 0.012, 0.015 + Math.sin(a) * 0.012, -0.02);
    ch.rotation.x = Math.PI / 2;
    g.add(ch);
  }
  // Frame
  const frame = mesh(rb(0.022, 0.04, 0.06, 0.005), MAT.steel, 0, 0.005, 0.04);
  g.add(frame);
  // Martelo
  const hammer = mesh(rb(0.01, 0.02, 0.014, 0.003), MAT.steel, 0, 0.035, 0.06);
  hammer.rotation.x = -0.2;
  g.add(hammer);
  // Grip de madeira
  const grip = handGrip(0.1, 0.032, MAT.woodVarnish);
  grip.position.set(0, -0.02, 0.075);
  grip.rotation.x = 0.38;
  g.add(grip);
  // Trigger guard
  const tg = triggerGuard(MAT.steel);
  tg.position.set(0, -0.03, 0.045);
  g.add(tg);
  // Trigger
  const tr = trigger(MAT.steelDark);
  tr.position.set(0, -0.022, 0.04);
  g.add(tr);
  // Mira
  const fs = frontSight(MAT.steelDark);
  fs.position.set(0, 0.03, -0.19);
  g.add(fs);
  const rs = rearSight(MAT.steelDark);
  rs.position.set(0, 0.032, 0.005);
  g.add(rs);
  // Mão
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.07, 0.1);
  hand.rotation.x = 0.3;
  g.add(hand);
}

// ---------- SMG (AKS-74U) ----------
function buildSMG(g) {
  // Receiver
  const receiver = mesh(rb(0.036, 0.05, 0.22, 0.008), MAT.gunMetal, 0, 0.02, -0.05);
  g.add(receiver);
  // Dust cover (topo, corrugado)
  for (let i = 0; i < 8; i++) {
    const rib = mesh(rb(0.034, 0.003, 0.005, 0.001), MAT.gunMetalWorn, 0, 0.046, -0.14 + i * 0.022);
    g.add(rib);
  }
  // Cano
  const barrel = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 10), MAT.gunMetal, 0, 0.03, -0.24);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  // Gas block
  const gasBlock = mesh(rb(0.02, 0.018, 0.04, 0.004), MAT.gunMetalWorn, 0, 0.045, -0.22);
  g.add(gasBlock);
  // Muzzle brake / booster
  const muzzle = mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.025, 10), MAT.steelDark, 0, 0.03, -0.33);
  muzzle.rotation.x = Math.PI / 2;
  g.add(muzzle);
  // Handguard superior de madeira
  const hgTop = mesh(rb(0.028, 0.018, 0.12, 0.005), MAT.woodVarnish, 0, 0.055, -0.18);
  g.add(hgTop);
  // Handguard inferior de madeira
  const hgBot = mesh(rb(0.028, 0.022, 0.12, 0.005), MAT.woodVarnish, 0, 0.01, -0.18);
  g.add(hgBot);
  // Magazine curvo
  const mag = curvedMag(0.026, 0.14, 0.4, MAT.gunMetal);
  mag.position.set(0, -0.03, -0.02);
  g.add(mag);
  // Magazine release
  const mrel = mesh(rb(0.006, 0.02, 0.014, 0.002), MAT.gunMetalWorn, 0.02, 0.005, 0.005);
  g.add(mrel);
  // Pistol grip
  const grip = handGrip(0.075, 0.026, MAT.gripPoly);
  grip.position.set(0, -0.03, 0.08);
  grip.rotation.x = 0.22;
  g.add(grip);
  // Trigger guard
  const tg = triggerGuard(MAT.gunMetal);
  tg.position.set(0, -0.04, 0.04);
  g.add(tg);
  // Trigger
  const tr = trigger(MAT.steel);
  tr.position.set(0, -0.032, 0.04);
  g.add(tr);
  // Folding stock (dobrada, do lado)
  const stock = mesh(rb(0.008, 0.05, 0.1, 0.003), MAT.gunMetal, 0.03, 0.02, 0.1);
  g.add(stock);
  // Mira frontal
  const fs = frontSight(MAT.gunMetal);
  fs.position.set(0, 0.058, -0.28);
  g.add(fs);
  // Rear sight
  const rs = rearSight(MAT.gunMetal);
  rs.position.set(0, 0.058, -0.02);
  g.add(rs);
  // Mão
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.08, 0.1);
  hand.rotation.x = 0.2;
  g.add(hand);
}

// ---------- RIFLE (AKM) ----------
function buildRifle(g) {
  // Receiver longo
  const receiver = mesh(rb(0.038, 0.055, 0.28, 0.008), MAT.gunMetal, 0, 0.02, -0.08);
  g.add(receiver);
  // Dust cover corrugado
  for (let i = 0; i < 10; i++) {
    const rib = mesh(rb(0.036, 0.003, 0.005, 0.001), MAT.gunMetalWorn, 0, 0.05, -0.2 + i * 0.024);
    g.add(rib);
  }
  // Cano longo
  const barrel = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 10), MAT.gunMetal, 0, 0.032, -0.34);
  barrel.rotation.x = Math.PI / 2;
  g.add(barrel);
  // Gas tube
  const gasTube = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 10), MAT.gunMetalWorn, 0, 0.055, -0.28);
  gasTube.rotation.x = Math.PI / 2;
  g.add(gasTube);
  // Gas block
  const gasBlock = mesh(rb(0.024, 0.022, 0.04, 0.004), MAT.gunMetal, 0, 0.042, -0.32);
  g.add(gasBlock);
  // Front sight block
  const fsb = mesh(rb(0.02, 0.03, 0.028, 0.004), MAT.gunMetal, 0, 0.055, -0.46);
  g.add(fsb);
  // Muzzle
  const muzzle = mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.03, 10), MAT.steelDark, 0, 0.032, -0.5);
  muzzle.rotation.x = Math.PI / 2;
  g.add(muzzle);
  // Handguard de madeira (inferior)
  const hgBot = mesh(rb(0.03, 0.024, 0.14, 0.005), MAT.woodVarnish, 0, 0.01, -0.26);
  g.add(hgBot);
  // Handguard superior
  const hgTop = mesh(rb(0.028, 0.016, 0.14, 0.005), MAT.woodVarnish, 0, 0.058, -0.26);
  g.add(hgTop);
  // Magazine curvo (7.62)
  const mag = curvedMag(0.028, 0.16, 0.5, MAT.gunMetal);
  mag.position.set(0, -0.035, -0.02);
  g.add(mag);
  // Pistol grip
  const grip = handGrip(0.08, 0.028, MAT.gripPoly);
  grip.position.set(0, -0.03, 0.1);
  grip.rotation.x = 0.22;
  g.add(grip);
  // Trigger guard
  const tg = triggerGuard(MAT.gunMetal);
  tg.position.set(0, -0.04, 0.055);
  g.add(tg);
  // Trigger
  const tr = trigger(MAT.steel);
  tr.position.set(0, -0.032, 0.055);
  g.add(tr);
  // Coronha (stock) de madeira
  const stock = mesh(rb(0.034, 0.05, 0.2, 0.008), MAT.woodVarnish, 0, 0.005, 0.26);
  stock.rotation.x = -0.12;
  g.add(stock);
  // Buttplate
  const butt = mesh(rb(0.036, 0.052, 0.01, 0.003), MAT.steelDark, 0, 0, 0.36);
  g.add(butt);
  // Rear sight (tangente)
  const rs = rearSight(MAT.gunMetal);
  rs.position.set(0, 0.06, -0.14);
  g.add(rs);
  // Safety lever (lado)
  const safety = mesh(rb(0.006, 0.03, 0.06, 0.002), MAT.gunMetalWorn, 0.022, 0.02, -0.05);
  g.add(safety);
  // Mão
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.085, 0.12);
  hand.rotation.x = 0.2;
  g.add(hand);
}

// ---------- SHOTGUN ----------
function buildShotgun(g) {
  // Receiver
  const receiver = mesh(rb(0.04, 0.05, 0.16, 0.008), MAT.gunMetal, 0, 0.02, -0.06);
  g.add(receiver);
  // Canos duplos (over-under)
  const b1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, -0.014, 0.03, -0.28);
  b1.rotation.x = Math.PI / 2; g.add(b1);
  const b2 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 12), MAT.steelDark, 0.014, 0.03, -0.28);
  b2.rotation.x = Math.PI / 2; g.add(b2);
  // Band (abraçadeira)
  const band = mesh(rb(0.045, 0.032, 0.014, 0.003), MAT.gunMetalWorn, 0, 0.03, -0.44);
  g.add(band);
  // Muzzle openings
  const m1 = mesh(new THREE.TorusGeometry(0.011, 0.002, 4, 10), MAT.black, -0.014, 0.03, -0.48);
  g.add(m1);
  const m2 = mesh(new THREE.TorusGeometry(0.011, 0.002, 4, 10), MAT.black, 0.014, 0.03, -0.48);
  g.add(m2);
  // Forend (handguard de madeira)
  const forend = mesh(rb(0.05, 0.03, 0.14, 0.008), MAT.woodVarnish, 0, 0.005, -0.24);
  g.add(forend);
  // Coronha de madeira
  const stock = mesh(rb(0.038, 0.055, 0.2, 0.008), MAT.woodVarnish, 0, 0, 0.24);
  stock.rotation.x = -0.08;
  g.add(stock);
  // Butt plate
  const butt = mesh(rb(0.04, 0.058, 0.012, 0.004), MAT.gunMetalWorn, 0, 0, 0.34);
  g.add(butt);
  // Trigger guard
  const tg = triggerGuard(MAT.gunMetal);
  tg.position.set(0, -0.04, 0.03);
  g.add(tg);
  // Trigger
  const tr = trigger(MAT.steel);
  tr.position.set(0, -0.032, 0.03);
  g.add(tr);
  // Double triggers (aesthetic)
  const tr2 = trigger(MAT.steel);
  tr2.position.set(0.01, -0.032, 0.045);
  g.add(tr2);
  // Mira
  const fs = frontSight(MAT.gunMetal);
  fs.position.set(0, 0.058, -0.44);
  g.add(fs);
  // Mão
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.085, 0.08);
  hand.rotation.x = 0.2;
  g.add(hand);
}

// ---------- LAUNCHER ----------
function buildLauncher(g) {
  // Tubo principal
  const tube = mesh(new THREE.CylinderGeometry(0.055, 0.058, 0.65, 16), MAT.gunMetalLight, 0, 0.02, -0.15);
  tube.rotation.x = Math.PI / 2;
  g.add(tube);
  // Reforço frontal
  const rim = mesh(new THREE.TorusGeometry(0.056, 0.006, 6, 16), MAT.steelDark, 0, 0.02, -0.47);
  g.add(rim);
  // Muzzle (boca do tubo)
  const muzzle = mesh(new THREE.CylinderGeometry(0.058, 0.05, 0.02, 16), MAT.black, 0, 0.02, -0.48);
  muzzle.rotation.x = Math.PI / 2;
  g.add(muzzle);
  // Tubo traseiro (venturi)
  const rear = mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.06, 16), MAT.steelDark, 0, 0.02, 0.19);
  rear.rotation.x = Math.PI / 2;
  g.add(rear);
  // Backblast cone
  const vent = mesh(new THREE.ConeGeometry(0.05, 0.06, 16, 1, true), MAT.black, 0, 0.02, 0.24);
  vent.rotation.x = -Math.PI / 2;
  g.add(vent);
  // Scope
  const scopeMount = mesh(rb(0.02, 0.02, 0.1, 0.003), MAT.gunMetal, 0, 0.08, -0.05);
  g.add(scopeMount);
  const scope = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 12), MAT.gunMetal, 0, 0.12, -0.05);
  scope.rotation.x = Math.PI / 2;
  g.add(scope);
  const lensF = mesh(new THREE.CircleGeometry(0.022, 12), MAT.black, 0, 0.12, -0.12);
  lensF.rotation.y = Math.PI;
  g.add(lensF);
  const lensB = mesh(new THREE.CircleGeometry(0.022, 12), MAT.chrome, 0, 0.12, 0.02);
  g.add(lensB);
  // Front grip
  const fg = handGrip(0.07, 0.03, MAT.gripPoly);
  fg.position.set(0, -0.06, -0.25);
  fg.rotation.x = 0.15;
  g.add(fg);
  // Pistol grip
  const pg = handGrip(0.08, 0.03, MAT.gripPoly);
  pg.position.set(0, -0.06, 0.04);
  pg.rotation.x = 0.25;
  g.add(pg);
  // Trigger guard
  const tg = triggerGuard(MAT.gunMetal);
  tg.position.set(0, -0.07, 0.01);
  g.add(tg);
  // Trigger
  const tr = trigger(MAT.steel);
  tr.position.set(0, -0.062, 0.01);
  g.add(tr);
  // Faixa vermelha
  const stripe = mesh(new THREE.TorusGeometry(0.057, 0.004, 4, 16), MAT.accent, 0, 0.02, 0.05);
  g.add(stripe);
  // Mão
  const hand = new THREE.Mesh(rb(0.055, 0.08, 0.06, 0.02), MAT.skin);
  hand.position.set(0, -0.11, 0.06);
  hand.rotation.x = 0.2;
  g.add(hand);
}

// ------------------------------------------------------------
// Dispatch
// ------------------------------------------------------------
const BUILDERS = {
  knife: buildKnife,
  woodenClub: buildClub,
  pipe: buildPipe,
  pipeWrench: buildPipeWrench,
  cleaver: buildCleaver,
  katana: buildKatana,
  kukri: buildKukri,
  shovel: buildShovel,
  reaperScythe: buildScythe,
  pistol: buildPistol,
  revolver: buildRevolver,
  smg: buildSMG,
  rifle: buildRifle,
  shotgun: buildShotgun,
  launcher: buildLauncher,
};

export function buildWeaponModel(weaponId) {
  const g = new THREE.Group();
  const b = BUILDERS[weaponId];
  if (b) b(g);
  g.userData.weaponId = weaponId;
  return g;
}

// ------------------------------------------------------------
// Metadados (mesma API de antes)
// ------------------------------------------------------------
export const WEAPON_WORLD_SIZE = {
  knife: 0.6, woodenClub: 0.95, pipe: 0.95, pipeWrench: 0.95,
  cleaver: 0.75, katana: 1.4, kukri: 0.75, shovel: 1.5,
  reaperScythe: 2.0,
  pistol: 0.6, revolver: 0.65, smg: 0.95, rifle: 1.3,
  shotgun: 1.2, launcher: 1.3,
};
export function getWeaponWorldSize(id) {
  return WEAPON_WORLD_SIZE[id] || 0.85;
}

export function getWeaponPickupColor(weaponId, isDrop) {
  if (isDrop) return 0xff00ff;
  return 0xffdd00;
}

// ------------------------------------------------------------
// Ammo box (com material melhorado)
// ------------------------------------------------------------
const AMMO_COLORS = {
  pistol:   { box: 0x4a4a2a, accent: 0xc9a227 },
  revolver: { box: 0x5a3a2a, accent: 0xc9a227 },
  smg:      { box: 0x3a4a2a, accent: 0x9acd32 },
  rifle:    { box: 0x2a3a4a, accent: 0xff8c00 },
  shotgun:  { box: 0x4a2a2a, accent: 0xff4444 },
  launcher: { box: 0x3a2a3a, accent: 0xff00ff },
};

export function buildAmmoBox(ammoType) {
  const g = new THREE.Group();
  const c = AMMO_COLORS[ammoType] || AMMO_COLORS.pistol;
  const boxMat = new THREE.MeshStandardMaterial({ color: c.box, metalness: 0.3, roughness: 0.75 });
  const accMat = new THREE.MeshStandardMaterial({ color: c.accent, metalness: 0.5, roughness: 0.4 });

  const box = mesh(rb(0.5, 0.28, 0.35, 0.03), boxMat);
  g.add(box);

  // Reforço superior (tampa)
  const lid = mesh(rb(0.52, 0.03, 0.37, 0.008), boxMat, 0, 0.14, 0);
  g.add(lid);
  // Detalhe da tampa
  const lidRib = mesh(rb(0.5, 0.005, 0.02, 0.001), accMat, 0, 0.158, 0);
  g.add(lidRib);

  // Fita central
  const strap = mesh(rb(0.08, 0.30, 0.37, 0.005), accMat);
  g.add(strap);

  // Parafusos nos cantos
  for (const [x, y] of [[-0.23, -0.1], [0.23, -0.1], [-0.23, 0.1], [0.23, 0.1]]) {
    const sc = screw(0.012, 0.006, MAT.gunMetal);
    sc.rotation.z = Math.PI / 2;
    sc.position.set(x, y, 0.18);
    g.add(sc);
  }

  // 3 balas em cima
  for (let i = 0; i < 3; i++) {
    const bullet = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), MAT.brass, -0.14 + i * 0.14, 0.22, 0);
    bullet.rotation.z = Math.PI / 2;
    g.add(bullet);
    const tip = mesh(new THREE.ConeGeometry(0.03, 0.06, 8), MAT.brass, -0.14 + i * 0.14 + 0.09, 0.22, 0);
    tip.rotation.z = -Math.PI / 2;
    g.add(tip);
    // Culote
    const rim = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 8), MAT.steelDark, -0.14 + i * 0.14 - 0.063, 0.22, 0);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
  }

  return g;
}
