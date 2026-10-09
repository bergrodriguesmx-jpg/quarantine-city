// Catálogo central de eventos. Adicione aqui ANTES de usar em qualquer lugar.
// Regra: nunca escreva string crua de evento, sempre use Ev.X
export const Ev = Object.freeze({
  // ---- Combate ----
  ATTACK:          'combat:attack',
  DAMAGE:          'combat:damage',
  DEATH:           'combat:death',
  KILL:            'combat:kill',
  HEADSHOT:        'combat:headshot',
  DISMEMBER:       'combat:dismember',

  // ---- Spawn / Waves ----
  ZOMBIE_SPAWNED:  'spawn:zombie',
  WAVE_START:      'wave:start',
  WAVE_CLEAR:      'wave:clear',

  // ---- Player ----
  PLAYER_HIT:      'player:hit',
  PLAYER_DOWN:     'player:down',
  PLAYER_REVIVE:   'player:revive',
  PLAYER_DIED:     'player:died',
  PLAYER_MOVE:     'player:move',
  PLAYER_LOOK:     'player:look',
  PLAYER_WEAPON:   'player:weapon',

  // ---- Economia / Progressão ----
  COIN_GAIN:       'econ:coin',
  XP_GAIN:         'econ:xp',
  WEAPON_BUY:      'econ:buy',
  LEVEL_UP:        'prog:levelup',
  SKILL_PICK:      'prog:skill',

  // ---- Rede / Sessão ----
  NET_CONNECT:     'net:connect',
  NET_DISCONNECT:  'net:disconnect',
  NET_ROOM_JOIN:   'net:room_join',
  NET_ROOM_LEAVE:  'net:room_leave',
  NET_PLAYER_JOIN: 'net:player_join',
  NET_PLAYER_LEAVE:'net:player_leave',
  NET_LAG:         'net:lag',
});
