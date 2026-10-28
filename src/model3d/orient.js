// Orientation automatique et placement des objets sur le plateau.
//
// Orientation « solidité » : en FDM la pièce est la plus faible entre les couches (axe Z).
// On cherche donc à coucher la plus grande dimension de la pièce dans le plan du plateau
// (couches parallèles aux efforts), en gardant une grande face d'appui et peu de surplombs.
// Orientation « supports » : priorité à la surface de surplomb la plus faible.

export const M3_ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function m3mul(a, b) { // a × b (b appliquée en premier)
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
export function rotAxis(axis, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
// Rotation qui amène le vecteur unitaire d sur (0, 0, -1) (Rodrigues)
export function rotToDown(d) {
  const [x, y, z] = d;
  const t = [0, 0, -1];
  const c = x * t[0] + y * t[1] + z * t[2];
  if (c > 0.999999) return M3_ID.slice();
  if (c < -0.999999) return [1, 0, 0, 0, -1, 0, 0, 0, -1]; // demi-tour autour de X
  const v = [y * t[2] - z * t[1], z * t[0] - x * t[2], x * t[1] - y * t[0]];
  const k = 1 / (1 + c);
  return [
    v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1],
    v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0],
    v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c,
  ];
}

export function transformPositions(src, m, scale = 1, out = null) {
  const o = out || new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i] * scale, y = src[i + 1] * scale, z = src[i + 2] * scale;
    o[i] = m[0] * x + m[1] * y + m[2] * z;
    o[i + 1] = m[3] * x + m[4] * y + m[5] * z;
    o[i + 2] = m[6] * x + m[7] * y + m[8] * z;
  }
  return o;
}

export function boundsOf(arrays) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const a of arrays) {
    for (let i = 0; i < a.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = a[i + k];
        if (v < b.min[k]) b.min[k] = v;
        if (v > b.max[k]) b.max[k] = v;
      }
    }
  }
  b.size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  return b;
}

// Prépare les triangles (normales unitaires, aires, sommets) d'un ensemble de pièces, avec sous-échantillonnage
function triangles(arrays, maxTris = 200000) {
  let n = 0;
  for (const a of arrays) n += a.length / 9;
  const step = Math.max(1, Math.ceil(n / maxTris));
  const N = [], A = [], V = [];
  let idx = 0;
  for (const a of arrays) {
    for (let p = 0; p < a.length; p += 9, idx++) {
      if (idx % step) continue;
      const ax = a[p + 3] - a[p], ay = a[p + 4] - a[p + 1], az = a[p + 5] - a[p + 2];
      const bx = a[p + 6] - a[p], by = a[p + 7] - a[p + 1], bz = a[p + 8] - a[p + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      N.push(nx / l, ny / l, nz / l);
      A.push((l / 2) * step);
      V.push(a[p], a[p + 1], a[p + 2], a[p + 3], a[p + 4], a[p + 5], a[p + 6], a[p + 7], a[p + 8]);
    }
  }
  return { N: Float64Array.from(N), A: Float64Array.from(A), V: Float64Array.from(V) };
}

// Directions candidates « vers le bas » : axes + grandes faces planes (regroupées par normale)
function candidates(T) {
  const groups = new Map();
  for (let i = 0; i < T.A.length; i++) {
    const nx = T.N[i * 3], ny = T.N[i * 3 + 1], nz = T.N[i * 3 + 2];
    const key = `${Math.round(nx * 30)},${Math.round(ny * 30)},${Math.round(nz * 30)}`;
    const g = groups.get(key) || { a: 0, x: 0, y: 0, z: 0 };
    g.a += T.A[i]; g.x += nx * T.A[i]; g.y += ny * T.A[i]; g.z += nz * T.A[i];
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((p, q) => q.a - p.a).slice(0, 24).map((g) => {
    const l = Math.hypot(g.x, g.y, g.z) || 1;
    return [g.x / l, g.y / l, g.z / l];
  });
  for (const d of [[0, 0, -1], [0, 0, 1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) list.push(d);
  // dédoublonnage
  const out = [];
  for (const d of list) if (!out.some((e) => e[0] * d[0] + e[1] * d[1] + e[2] * d[2] > 0.995)) out.push(d);
  return out;
}

function evaluate(T, R, supportAngle) {
  const n = T.A.length;
  const cosOver = Math.cos(((90 - supportAngle) * Math.PI) / 180); // normale vers le bas au-delà de l'angle
  let minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const Z = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const o = i * 9 + k * 3;
      const x = T.V[o], y = T.V[o + 1], z = T.V[o + 2];
      const rx = R[0] * x + R[1] * y + R[2] * z, ry = R[3] * x + R[4] * y + R[5] * z, rz = R[6] * x + R[7] * y + R[8] * z;
      Z[i * 3 + k] = rz;
      if (rz < minZ) minZ = rz; if (rz > maxZ) maxZ = rz;
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
    }
  }
  let base = 0, over = 0, total = 0, overHeight = 0;
  for (let i = 0; i < n; i++) {
    const nz = R[6] * T.N[i * 3] + R[7] * T.N[i * 3 + 1] + R[8] * T.N[i * 3 + 2];
    const a = T.A[i];
    total += a;
    const zMax = Math.max(Z[i * 3], Z[i * 3 + 1], Z[i * 3 + 2]);
    if (nz < -0.995 && zMax - minZ < 0.15) { base += a; continue; }
    if (nz < -cosOver && zMax - minZ > 0.3) {
      over += a * (-nz);
      overHeight += a * (-nz) * (Math.min(Z[i * 3], Z[i * 3 + 1], Z[i * 3 + 2]) - minZ);
    }
  }
  const h = maxZ - minZ, w = maxX - minX, d = maxY - minY;
  return { base, over, total, h, w, d, overHeight };
}

/**
 * Cherche la meilleure orientation.
 * opts : { mode: 'strength' | 'supports', supportAngle (°), bedZ (mm) }
 * Renvoie la matrice 3×3 à appliquer (en plus de la rotation actuelle).
 */
export function autoOrient(arrays, opts = {}) {
  const mode = opts.mode || 'strength';
  const supportAngle = opts.supportAngle ?? 50;
  const T = triangles(arrays);
  if (!T.A.length) return { matrix: M3_ID.slice(), info: null };
  let best = null;
  for (const dvec of candidates(T)) {
    const R = rotToDown(dvec);
    const e = evaluate(T, R, supportAngle);
    if (opts.bedZ && e.h > opts.bedZ) continue;
    const maxDim = Math.max(e.h, e.w, e.d) || 1;
    const footprint = Math.max(1, e.w * e.d);
    const strength = e.h / maxDim; // 1 = la plus grande dimension est verticale (couches perpendiculaires aux efforts)
    const overFrac = e.over / (e.total || 1);
    const baseFrac = Math.min(1, e.base / (0.35 * footprint));
    const tip = Math.min(1, e.h / (3 * Math.max(1, Math.min(e.w, e.d)))); // pièce haute et étroite = risque de décollement
    const score = mode === 'supports'
      ? 1.6 * overFrac + 0.35 * strength + 0.6 * (1 - baseFrac) + 0.25 * tip
      : 1.3 * strength + 0.8 * overFrac + 0.55 * (1 - baseFrac) + 0.3 * tip;
    if (!best || score < best.score - 1e-9) best = { score, R, e, strength, overFrac, baseFrac };
  }
  if (!best) return { matrix: M3_ID.slice(), info: null };
  // Rotation autour de Z : aligner la pièce sur les axes (plus petite emprise)
  const yaw = bestYaw(T, best.R);
  const matrix = m3mul(rotAxis('z', yaw), best.R);
  return { matrix, info: { overhangPct: Math.round(best.overFrac * 100), height: best.e.h, strengthAligned: best.strength < 0.75, baseArea: best.e.base } };
}

function bestYaw(T, R) {
  let bestA = 0, bestArea = Infinity;
  for (let a = 0; a < 180; a += 3) {
    const M = m3mul(rotAxis('z', a), R);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < T.V.length; i += 3) {
      const x = T.V[i], y = T.V[i + 1], z = T.V[i + 2];
      const rx = M[0] * x + M[1] * y + M[2] * z, ry = M[3] * x + M[4] * y + M[5] * z;
      if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea - 1e-6) { bestArea = area; bestA = a; }
  }
  return bestA;
}

/**
 * Range des emprises rectangulaires {w, d} sur le plateau (rangées), centré.
 * Renvoie [{x, y}] = centres, ou null si ça ne tient pas.
 */
export function arrange(sizes, bed, gap = 6, reserved = null) {
  const order = sizes.map((s, i) => ({ ...s, i })).sort((a, b) => b.d - a.d);
  const W = bed.x - 2 * gap - (reserved ? reserved.w + gap : 0);
  const rows = [];
  let row = { items: [], w: 0, d: 0 };
  for (const it of order) {
    if (row.items.length && row.w + gap + it.w > W) { rows.push(row); row = { items: [], w: 0, d: 0 }; }
    row.items.push(it); row.w += (row.items.length > 1 ? gap : 0) + it.w; row.d = Math.max(row.d, it.d);
  }
  if (row.items.length) rows.push(row);
  const totalD = rows.reduce((a, r) => a + r.d, 0) + gap * (rows.length - 1);
  const out = new Array(sizes.length);
  const usableW = W;
  let y = bed.y / 2 + totalD / 2;
  let fits = totalD <= bed.y - 2 * gap && rows.every((r) => r.w <= usableW + 1e-6);
  for (const r of rows) {
    let x = gap + (usableW - r.w) / 2;
    const cy = y - r.d / 2;
    for (const it of r.items) { out[it.i] = { x: x + it.w / 2, y: cy }; x += it.w + gap; }
    y -= r.d + gap;
  }
  return { positions: out, fits };
}
