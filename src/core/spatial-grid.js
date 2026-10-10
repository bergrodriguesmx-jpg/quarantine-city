// ============================================================
// SPATIAL GRID — broadphase O(vizinhos) em vez de O(N).
// Reutilizável: debris, raycast, aggro, som.
// ============================================================

export class SpatialGrid {
  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  _key(cx, cz) { return cx + ',' + cz; }

  clear() { this.cells.clear(); }

  insert(item, x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const k = this._key(cx, cz);
    let cell = this.cells.get(k);
    if (!cell) { cell = []; this.cells.set(k, cell); }
    cell.push(item);
  }

  // Retorna todos os itens em células que cobrem [x-r, x+r] × [z-r, z+r]
  query(x, z, radius) {
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const out = [];
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const cell = this.cells.get(this._key(cx + i, cz + j));
        if (cell) {
          for (let k = 0; k < cell.length; k++) out.push(cell[k]);
        }
      }
    }
    return out;
  }
}
