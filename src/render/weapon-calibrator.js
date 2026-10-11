// ============================================================
// weapon-calibrator.js
// Tela de calibração de armas no menu principal.
// - Lista de armas à esquerda
// - Preview 3D no centro (com OrbitControls)
// - Sliders à direita
// - Salva no localStorage (mesma chave que viewmodel-3d.js usa)
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildWeaponModelSmart, hasGLB, precacheAllWeaponGLBs } from './weapon-models.js';

export const STORAGE_KEY = 'qb_weapon_offsets_v1';

export function loadAllOffsets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveAllOffsets(obj) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch {}
}

export function getOffsetFor(weaponId) {
  const all = loadAllOffsets();
  return Object.assign({
    px: 0, py: 0, pz: 0,
    rx: 0, ry: 0, rz: 0,
    scale: 1.0,
  }, all[weaponId] || {});
}

// ============================================================
// LISTA DE ARMAS
// ============================================================
const WEAPONS = [
  { id: 'knife',        name: 'FACA' },
  { id: 'woodenClub',   name: 'PORRETE' },
  { id: 'pipe',         name: 'CANO' },
  { id: 'pipeWrench',   name: 'CHAVE GRIFO' },
  { id: 'cleaver',      name: 'CUTELO' },
  { id: 'katana',       name: 'KATANA' },
  { id: 'kukri',        name: 'KUKRI' },
  { id: 'shovel',       name: 'PÁ' },
  { id: 'reaperScythe', name: 'FOICE' },
  { id: 'pistol',       name: 'PISTOLA' },
  { id: 'revolver',     name: 'REVOLVER' },
  { id: 'smg',          name: 'SMG' },
  { id: 'rifle',        name: 'RIFLE' },
  { id: 'shotgun',      name: 'SHOTGUN' },
  { id: 'launcher',     name: 'LANÇA-FOGUETES' },
];

// ============================================================
// CALIBRATOR
// ============================================================
export class WeaponCalibrator {
  constructor(dom) {
    this.dom = dom;               // { overlay, listEl, viewportEl, slidersEl, saveBtn, resetBtn, closeBtn, statusEl }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.weaponGroup = null;
    this.currentModel = null;
    this.currentId = null;
    this.offset = null;
    this.running = false;
    this._allOffsets = loadAllOffsets();
    this._needsRebuild = true;
    this._lastTime = 0;

    this._bindUI();
  }

  _bindUI() {
    const { saveBtn, resetBtn, closeBtn } = this.dom;

    saveBtn.addEventListener('click', () => this._save());
    resetBtn.addEventListener('click', () => this._reset());
    closeBtn.addEventListener('click', () => this.close());
  }

  // ============================================================
  // ABRIR / FECHAR
  // ============================================================
  async open() {
    if (this.running) return;

    this.dom.overlay.classList.remove('hidden');
    this._buildList();
    this._buildSliders();

    if (!this.renderer) this._initThree();

    this.running = true;
    this._needsRebuild = true;
    this._loop();

    // Se não tem GLBs ainda, espera
    if (!hasGLB('pistol')) {
      this._setStatus('Aguardando modelos GLB carregarem...');
      await precacheAllWeaponGLBs();
      this._setStatus('');
      this._needsRebuild = true;
    }

    // Carrega primeira arma
    this.loadWeapon(this.currentId || 'knife');
  }

  close() {
    this.running = false;
    this.dom.overlay.classList.add('hidden');
    this._setStatus('');
  }

  // ============================================================
  // THREE.JS
  // ============================================================
  _initThree() {
    const vp = this.dom.viewportEl;
    const w = vp.clientWidth || 600;
    const h = vp.clientHeight || 400;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    vp.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.01, 100);
    this.camera.position.set(1.0, 0.5, 1.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 3;
    this.controls.target.set(0, -0.1, 0);

    // Luzes
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2, 3, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb0d0ff, 0.5);
    fill.position.set(-3, 1, 2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd0a0, 0.7);
    rim.position.set(0, 2, -3);
    this.scene.add(rim);

    // Grid + eixos
    const grid = new THREE.GridHelper(1, 10, 0x444444, 0x222222);
    grid.position.y = -0.4;
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(0.4);
    this.scene.add(axes);

    // Grupo da arma
    this.weaponGroup = new THREE.Group();
    this.scene.add(this.weaponGroup);

    // Resize
    const ro = new ResizeObserver(() => this._resize());
    ro.observe(vp);
  }

  _resize() {
    if (!this.renderer || !this.dom.viewportEl) return;
    const w = this.dom.viewportEl.clientWidth;
    const h = this.dom.viewportEl.clientHeight;
    if (w < 10 || h < 10) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    if (this._needsRebuild) {
      this._needsRebuild = false;
      this._rebuildModel();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ============================================================
  // LISTA DE ARMAS
  // ============================================================
  _buildList() {
    const listEl = this.dom.listEl;
    listEl.innerHTML = '';
    WEAPONS.forEach(w => {
      const btn = document.createElement('button');
      btn.className = 'calib-weapon-btn';
      btn.dataset.id = w.id;
      btn.textContent = w.name;
      btn.addEventListener('click', () => this.loadWeapon(w.id));
      listEl.appendChild(btn);
    });
  }

  _highlightList() {
    this.dom.listEl.querySelectorAll('.calib-weapon-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.id === this.currentId);
    });
  }

  // ============================================================
  // SLIDERS
  // ============================================================
  _buildSliders() {
    const el = this.dom.slidersEl;
    el.innerHTML = '';

    const makeSlider = (label, key, min, max, step, unit = '') => {
      const row = document.createElement('div');
      row.className = 'calib-row';
      const lab = document.createElement('label');
      lab.innerHTML = `${label} <span data-val="${key}">0</span>`;
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = min; inp.max = max; inp.step = step;
      inp.dataset.key = key;
      inp.value = 0;
      inp.addEventListener('input', () => {
        this.offset[key] = parseFloat(inp.value);
        this._updateLabels();
        this._applyOffset();
      });
      row.appendChild(lab);
      row.appendChild(inp);
      el.appendChild(row);
    };

    // POSIÇÃO
    makeSlider('X (esq/dir)', 'px', -1, 1, 0.005);
    makeSlider('Y (cima/baixo)', 'py', -1, 1, 0.005);
    makeSlider('Z (frente/trás)', 'pz', -1, 1, 0.005);

    // ROTAÇÃO (graus)
    makeSlider('Rot Y (vira)', 'ryDeg', -180, 180, 1);
    makeSlider('Rot X (inclina)', 'rxDeg', -180, 180, 1);
    makeSlider('Rot Z (torce)', 'rzDeg', -180, 180, 1);

    // ESCALA
    makeSlider('Escala', 'scale', 0.05, 3, 0.01);
  }

  _updateLabels() {
    this.dom.slidersEl.querySelectorAll('span[data-val]').forEach(s => {
      const k = s.dataset.val;
      let v = this.offset[k] ?? 0;
      if (k.endsWith('Deg')) v = Math.round(v);
      else v = v.toFixed(3);
      s.textContent = v;
    });

    this.dom.slidersEl.querySelectorAll('input[data-key]').forEach(inp => {
      const k = inp.dataset.key;
      inp.value = this.offset[k] ?? 0;
    });
  }

  _applyOffset() {
    if (!this.currentModel) return;
    const o = this.offset;
    this.currentModel.position.set(o.px, o.py, o.pz);
    this.currentModel.rotation.set(
      THREE.MathUtils.degToRad(o.rxDeg || 0),
      THREE.MathUtils.degToRad(o.ryDeg || 0),
      THREE.MathUtils.degToRad(o.rzDeg || 0),
    );
    this.currentModel.scale.setScalar(o.scale || 1);
  }

  // ============================================================
  // CARREGAR / REBUILD
  // ============================================================
  loadWeapon(id) {
    this.currentId = id;
    this.offset = getOffsetFor(id);
    // Converte rad pra graus pra sliders
    this.offset.rxDeg = THREE.MathUtils.radToDeg(this.offset.rx || 0);
    this.offset.ryDeg = THREE.MathUtils.radToDeg(this.offset.ry || 0);
    this.offset.rzDeg = THREE.MathUtils.radToDeg(this.offset.rz || 0);

    this._highlightList();
    this._updateLabels();
    this._needsRebuild = true;
  }

  _rebuildModel() {
    while (this.weaponGroup.children.length) {
      this.weaponGroup.remove(this.weaponGroup.children[0]);
    }
    if (!this.currentId) return;

    const model = buildWeaponModelSmart(this.currentId);
    model.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    // Envolve em Group pra poder aplicar offset sem afetar a bbox
    const wrap = new THREE.Group();
    wrap.add(model);
    this.weaponGroup.add(wrap);
    this.currentModel = wrap;

    // Auto-fit visual (não salva)
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    // Escala inicial razoável
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fitScale = 0.8 / maxDim;

    // Aplica offset + fit
    const o = this.offset;
    this.currentModel.position.set(o.px, o.py, o.pz);
    this.currentModel.rotation.set(
      THREE.MathUtils.degToRad(o.rxDeg || 0),
      THREE.MathUtils.degToRad(o.ryDeg || 0),
      THREE.MathUtils.degToRad(o.rzDeg || 0),
    );
    // Aplica fit inicial × escala do usuário
    this.currentModel.scale.setScalar(fitScale * (o.scale || 1));

    // Guarda fitScale pra somar depois
    this._fitScale = fitScale;

    const src = model.userData.source || '?';
    this._setStatus(`Carregado: ${this.currentId} (${src})`);
  }

  // Sobreposição: aplica offset com o fitScale salvo
  _applyOffset() {
    if (!this.currentModel) return;
    const o = this.offset;
    const fit = this._fitScale || 1;
    this.currentModel.position.set(o.px, o.py, o.pz);
    this.currentModel.rotation.set(
      THREE.MathUtils.degToRad(o.rxDeg || 0),
      THREE.MathUtils.degToRad(o.ryDeg || 0),
      THREE.MathUtils.degToRad(o.rzDeg || 0),
    );
    this.currentModel.scale.setScalar(fit * (o.scale || 1));
  }

  // ============================================================
  // SALVAR / RESET
  // ============================================================
  _save() {
    if (!this.currentId || !this.offset) return;
    const o = this.offset;
    // Salva em radianos (pro viewmodel usar direto)
    this._allOffsets[this.currentId] = {
      px: o.px, py: o.py, pz: o.pz,
      rx: THREE.MathUtils.degToRad(o.rxDeg || 0),
      ry: THREE.MathUtils.degToRad(o.ryDeg || 0),
      rz: THREE.MathUtils.degToRad(o.rzDeg || 0),
      scale: o.scale || 1,
    };
    saveAllOffsets(this._allOffsets);
    this._setStatus(`✓ Salvo: ${this.currentId}`);
    console.log('[calibrador] salvo', this.currentId, this._allOffsets[this.currentId]);
  }

  _reset() {
    if (!this.currentId) return;
    delete this._allOffsets[this.currentId];
    saveAllOffsets(this._allOffsets);
    this.offset = getOffsetFor(this.currentId);
    this.offset.rxDeg = 0;
    this.offset.ryDeg = 0;
    this.offset.rzDeg = 0;
    this._updateLabels();
    this._applyOffset();
    this._setStatus(`↺ Resetado: ${this.currentId}`);
  }

  _setStatus(msg) {
    if (this.dom.statusEl) this.dom.statusEl.textContent = msg || '';
  }
}
