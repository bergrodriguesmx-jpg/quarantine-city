// Gerador de IDs únicos por sessão.
// Em MP, o servidor vai dar seu próprio prefixo para evitar colisão.
let counter = 0;
const sessionPrefix = Math.random().toString(36).slice(2, 6);

export function nextId(type = 'e') {
  return `${type}-${sessionPrefix}-${(++counter).toString(36)}`;
}

export function getSessionPrefix() { return sessionPrefix; }
