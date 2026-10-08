<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Quarantine Blocks</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <!-- MENU INICIAL -->
  <div id="menu" class="menu-overlay">
    <div class="menu-container">
      <h1>QUARANTINE BLOCKS</h1>
      <p class="menu-subtitle">OPEN ALPHA — SOBREVIVA ÀS HORDAS</p>
      <button class="menu-btn" id="btn-start">JOGAR SOLO</button>
      <button class="menu-btn" id="btn-multiplayer">MULTIJOGADOR</button>
      <button class="menu-btn" id="btn-wiki">WIKI DO JOGO</button>
    </div>
  </div>

  <!-- JOGO -->
  <div id="game-container"></div>

  <!-- HUD -->
  <div id="hud" class="hidden">

    <div id="timer">0:00</div>

    <div id="hud-health">
      <div class="hp-bar"><div id="hp-fill" class="hp-fill"></div></div>
      <span id="hp-text">100 / 100</span>
    </div>

    <div id="hud-ammo">
      <span id="ammo-current">—</span>
      <span id="ammo-sep">/</span>
      <span id="ammo-max">—</span>
    </div>

    <div id="hud-info">
      <div>🌊 HORDA <span id="wave">0</span></div>
      <div>⭐ LVL <span id="level">1</span></div>
      <div>💰 <span id="coins">0</span></div>
      <div>🧟 <span id="zombies">0</span></div>
    </div>

    <div id="xp-bar"><div id="xp-fill"></div></div>

    <div id="crosshair">
      <div class="ch-line ch-top"></div>
      <div class="ch-line ch-bottom"></div>
      <div class="ch-line ch-left"></div>
      <div class="ch-line ch-right"></div>
    </div>

    <div id="hit-marker">✕</div>

    <div id="damage-flash"></div>
  </div>

  <!-- Banner de horda -->
  <div id="wave-banner" class="hidden">HORDA 1</div>

  <!-- Game Over -->
  <div id="gameover" class="menu-overlay hidden">
    <div class="menu-container">
      <h1>VOCÊ MORREU</h1>
      <p class="menu-subtitle">Horda <span id="final-wave">0</span> · Nível <span id="final-level">1</span></p>
      <p class="menu-subtitle">Moedas coletadas: <span id="final-coins">0</span></p>
      <button class="menu-btn" id="btn-restart">TENTAR DE NOVO</button>
    </div>
  </div>

  <!-- Controles mobile -->
  <div id="mobile-controls" class="hidden">
    <div id="joystick-zone">
      <div id="joystick-base"><div id="joystick-stick"></div></div>
    </div>
    <div id="look-zone"></div>
    <button id="btn-attack">⚔</button>
  </div>

  <!-- Importmap — SÓ THREE.JS (cannon-es removido) -->
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
    }
  }
  </script>
  <script type="module" src="game.js"></script>
</body>
</html>
