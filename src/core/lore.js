// ============================================================
// LORE / METADATA DE ARMAS — identidade própria do Quarantine Blocks
// ============================================================

export const GUN_CLASSES = {
  Pistol:             'PISTOLA',
  Revolver:           'REVÓLVER',
  MachinePistol:      'PISTOLA AUTOMÁTICA',
  SMG:                'SUBMETRALHADORA',
  Carbine:            'CARABINA',
  AssaultRifle:       'FUZIL DE ASSALTO',
  BattleRifle:        'FUZIL DE BATALHA',
  DMR:                'FUZIL DE PRECISÃO',
  SniperRifle:        'RIFLE DE SNIPER',
  LMG:                'METRALHADORA LEVE',
  Shotgun:            'ESPINGARDA',
  ExplosivesLauncher: 'LANÇA-EXPLOSIVOS',
};

export const MELEE_TYPES = {
  sharp: { name: 'AFIADA',      chopMul: 1.35, staggerMul: 0.6, desc: 'corta e decepa' },
  mixed: { name: 'MISTA',       chopMul: 1.00, staggerMul: 1.0, desc: 'equilibrada' },
  blunt: { name: 'CONTUNDENTE', chopMul: 0.55, staggerMul: 1.6, desc: 'amassa e empurra' },
};

export const NOISE_RADIUS = {
  knife: 3, woodenClub: 4, pipe: 4, cleaver: 3, shovel: 4,
  katana: 2, kukri: 3, pipeWrench: 4, reaperScythe: 2,
  pistol: 18, revolver: 22, smg: 16, rifle: 40, shotgun: 35, launcher: 65,
};

export const WEAPON_LORE = {
  knife:        { meleeType: 'sharp', desc: 'Lâmina curta, rápida de sacar. Silenciosa o bastante para não acordar a vizinhança.' },
  woodenClub:   { meleeType: 'blunt', desc: 'Um pedaço de madeira que alguém achou que valia a pena guardar. Quebra pernas com uma eficiência surpreendente.' },
  pipe:         { meleeType: 'blunt', desc: 'Cano de metal achado em qualquer ferro-velho. Alcança mais longe que o seu bom senso.' },
  cleaver:      { meleeType: 'sharp', desc: 'Feito para cortar carne. A definição de "carne" é flexível ultimamente.' },
  shovel:       { meleeType: 'mixed', desc: 'Cabo longo mantém os zumbis a uma distância saudável. A parte de metal continua servindo pra cavar.' },
  katana:       { meleeType: 'sharp', desc: 'Aço dobrado mil vezes por alguém que sabia o que estava fazendo. Não é enfeite de parede.' },
  kukri:        { meleeType: 'sharp', desc: 'Faca de campo pesada e curvada. Abre caminho e depois segura a linha.' },
  pipeWrench:   { meleeType: 'blunt', desc: 'Ferramenta industrial. Lenta, mas cada golpe bem colocado é definitivo.' },
  reaperScythe: { meleeType: 'sharp', desc: 'Alcance absurdo, cadência brutal. O tipo de arma que faz o portador parecer o vilão da história.' },
  pistol:       { className: 'Pistol',             desc: 'Confiável, barata de alimentar. O tipo de arma que você aprende a respeitar quando a munição acaba.' },
  revolver:     { className: 'Revolver',           desc: 'Seis tiros. Se você precisar de mais que isso, foi mal preparado.' },
  smg:          { className: 'SMG',                desc: 'Cadência alta, precisão baixa. Feita pra esvaziar o pente em dois segundos e rezar pra acertar algo.' },
  rifle:        { className: 'BattleRifle',        desc: 'Derruba qualquer coisa que respire no alcance. O recuo cobra o preço em munição e tempo.' },
  shotgun:      { className: 'Shotgun',            desc: 'Uma carga de chumbo pra resolver o problema, dez pra decidir se resolveu.' },
  launcher:     { className: 'ExplosivesLauncher', desc: 'Não resolve problemas pequenos. Resolve problemas grandes com um raio de cinco metros.' },
};

export function enrichWeapons(weapons) {
  for (const id in weapons) {
    const w = weapons[id];
    const lore = WEAPON_LORE[id] || {};

    if (w.type === 'melee') {
      w.meleeType = lore.meleeType || 'mixed';
      w.meleeTypeName = MELEE_TYPES[w.meleeType].name;
    }
    if (w.type === 'ranged') {
      w.className = lore.className ? GUN_CLASSES[lore.className] : 'ARMA';
    }
    w.desc = lore.desc || '';
    w.noise = NOISE_RADIUS[id] || 15;

    if (w.type === 'ranged') {
      if (id === 'rifle')         w.pierce = 2;
      else if (id === 'revolver') w.pierce = 1;
      else                        w.pierce = 0;
    }
  }
  return weapons;
}

export const ZOMBIE_LORE = {
  pt:        'Sobrevivente comum. Não durou muito.',
  pt_donkey: 'Algo aconteceu no meio da transformação. Não terminou bem.',
  judge:     'Ainda tenta julgar. O martelo já não significa nada.',
  runner:    'Correu quando deveria ter parado.',
  worker:    'Ainda tem o crachá pendurado. Alguém deve estar procurando ele.',
  miner:     'Voltou da mina com algo além de minério.',
  security:  'O colete parou duas balas. Não parou ele.',
  combat:    'Treinado, equipado, e mesmo assim…',
  riot:      '☠ AINDA PROTEGE ALGO QUE NÃO EXISTE MAIS.',
  queen:     '☠ ELA AINDA GRITA ORDENS. NINGUÉM OBEDECE.',
  reaper:    '☠ NÃO CORRA. ELE JÁ SABE ONDE VOCÊ ESTÁ.',
};

export function formatWeaponTooltip(w) {
  if (!w) return '';
  const lines = [];
  if (w.type === 'ranged') {
    lines.push(`<span class="tt-class">${w.className}</span>`);
    lines.push(`Dano <b>${w.damage}</b> · Pente <b>${w.magSize}</b>`);
    lines.push(`Ruído <b>${w.noise}m</b>${w.pierce > 0 ? ` · Perfura <b>${w.pierce}</b>` : ''}`);
  } else {
    lines.push(`<span class="tt-class">${w.meleeTypeName}</span>`);
    lines.push(`Dano <b>${w.damage}</b> · Alcance <b>${w.range}m</b>`);
    lines.push(`Ruído <b>${w.noise}m</b>`);
  }
  if (w.desc) lines.push(`<span class="tt-desc">${w.desc}</span>`);
  return lines.join('<br>');
}
