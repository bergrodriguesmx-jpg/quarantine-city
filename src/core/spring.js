// ============================================================
// SPRING ANALÍTICO — estável para qualquer dt
// Resolve x'' + 2ζω x' + ω²(x - target) = 0
// ============================================================

export function springStep(obj, key, target, k, c, dt) {
  const vKey = key + 'Vel';
  const omega = Math.sqrt(k);
  const zeta = c / (2 * omega);
  const d0 = obj[key] - target;
  const v0 = obj[vKey] || 0;

  let x, v;
  if (zeta < 1) {
    // Subamortecido
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * omega * dt);
    const cos = Math.cos(wd * dt);
    const sin = Math.sin(wd * dt);
    const A = d0;
    const B = (v0 + zeta * omega * d0) / wd;
    x = target + e * (A * cos + B * sin);
    v = e * ((B * wd - zeta * omega * A) * cos - (A * wd + zeta * omega * B) * sin);
  } else {
    // Criticamente amortecido (aproximação)
    const e = Math.exp(-omega * dt);
    const A = d0;
    const B = v0 + omega * d0;
    x = target + e * (A + B * dt);
    v = e * (B - omega * (A + B * dt));
  }

  obj[key] = x;
  obj[vKey] = v;
}

export function springKick(obj, key, impulse) {
  obj[key + 'Vel'] = (obj[key + 'Vel'] || 0) + impulse;
}
