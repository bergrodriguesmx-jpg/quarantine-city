export async function preloadZombieModel() {
  if (loaded) return baseScene;

  // 🎯 Ordem invertida: FBX primeiro (GLB do conversor online perdeu os bones)
  const MODEL_CANDIDATES = ['XBot.fbx', 'XBot.glb'];

  let lastError = null;
  for (const filename of MODEL_CANDIDATES) {
    try {
      console.log(`[zombie-model] 🔄 Tentando ${filename}...`);
      const result = await loadAnyModel(filename);
      const candidate = result.scene;

      // ── Conta bones reais ANTES de aceitar o modelo ──
      let boneCount = 0;
      candidate.traverse(o => { if (o.isBone) boneCount++; });

      if (boneCount === 0) {
        console.warn(`[zombie-model] ❌ ${filename} carregou mas tem 0 bones (skeleton perdido na conversão) — pulando`);
        lastError = new Error(`${filename} sem skeleton`);
        continue;
      }

      baseScene = candidate;

      // Renomeia bones
      const renamed = [];
      baseScene.traverse(o => {
        if (!o.isBone) return;
        const canon = canonicalBoneName(o.name);
        if (canon && canon !== o.name) { o.name = canon; renamed.push(canon); }
      });
      console.log(`[zombie-model] 🦴 ${boneCount} bones encontrados`);
      if (renamed.length) {
        console.log(`[zombie-model] 🏷️ ${renamed.length} bones renomeados`);
      }

      // Sombras + materiais
      baseScene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
              m.needsUpdate = true;
            }
          }
        }
      });

      // Diagnóstico do mapeamento
      const bonesMap = {};
      baseScene.traverse(o => { if (o.isBone) bonesMap[o.name] = o; });
      const missing = [];
      for (const [ourName, candidates] of Object.entries(BONE_CANDIDATES)) {
        if (!findBone(bonesMap, candidates)) missing.push(ourName);
      }
      if (missing.length) {
        console.warn(`[zombie-model] ⚠️ Bones não mapeados: ${missing.join(', ')}`);
      } else {
        console.log('[zombie-model] ✅ Todos os 17 bones mapeados');
      }

      loaded = true;
      return baseScene;
    } catch (err) {
      lastError = err;
      console.warn(`[zombie-model] ❌ ${filename}: ${err.message || err}`);
    }
  }

  console.error('[zombie-model] ❌❌ NENHUM MODELO VÁLIDO. Último erro:', lastError);
  loaded = false;
  return null;
}
