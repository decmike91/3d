// Trancheur 2,5D : plaque + motif en relief (positif) ou en creux (négatif),
// parois pleines (périmètres + remplissage rectiligne 100 %).
import ClipperLib from 'clipper-lib';
import { SCALE, bounds } from './svg.js';

const CL = ClipperLib;

// ---------- Outils géométriques ----------
function union(paths) {
  const c = new CL.Clipper();
  c.AddPaths(paths, CL.PolyType.ptSubject, true);
  const out = new CL.Paths();
  c.Execute(CL.ClipType.ctUnion, out, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return out;
}
function op(a, b, type) {
  const c = new CL.Clipper();
  c.AddPaths(a, CL.PolyType.ptSubject, true);
  c.AddPaths(b, CL.PolyType.ptClip, true);
  const out = new CL.Paths();
  c.Execute(type, out, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return out;
}
export function offset(paths, deltaMM, join = CL.JoinType.jtMiter) {
  const co = new CL.ClipperOffset(3, 0.005 * SCALE);
  co.AddPaths(paths, join, CL.EndType.etClosedPolygon);
  const out = new CL.Paths();
  co.Execute(out, deltaMM * SCALE);
  return out;
}
function clean(paths, distMM = 0.005) {
  return CL.Clipper.CleanPolygons(paths, distMM * SCALE).filter((p) => p.length >= 3);
}
// Sépare en îlots : [{outer, holes}]
function islands(paths) {
  const c = new CL.Clipper();
  c.AddPaths(paths, CL.PolyType.ptSubject, true);
  const tree = new CL.PolyTree();
  c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  const res = [];
  const walk = (node) => {
    for (const ch of node.Childs()) {
      if (!ch.IsHole()) {
        const isl = [ch.Contour()];
        for (const h of ch.Childs()) { isl.push(h.Contour()); walk(h); }
        res.push(isl);
      }
    }
  };
  walk(tree);
  return res;
}

// ---------- Transformations utilisateur ----------
/**
 * t : { mirrorX, mirrorY, rotation (deg), width (mm) | height (mm) | scale (facteur), centerX, centerY }
 * Y du SVG (vers le bas) est inversé pour que la pièce vue de dessus corresponde au dessin.
 */
export function transformPattern(paths, t) {
  const b = bounds(paths);
  if (!b) return [];
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const a = ((t.rotation || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  // dimensions après rotation pour calculer l'échelle
  const pre = (X, Y) => {
    let x = X - cx, y = -(Y - cy);
    if (t.mirrorX) x = -x;
    if (t.mirrorY) y = -y;
    return [x * ca - y * sa, x * sa + y * ca];
  };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of paths) for (const q of p) {
    const [x, y] = pre(q.X, q.Y);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = (maxX - minX) / SCALE, h = (maxY - minY) / SCALE;
  let s = t.scale || 1;
  if (t.width > 0 && w > 0) s = t.width / w;
  else if (t.height > 0 && h > 0) s = t.height / h;
  const ox = (t.centerX || 0) * SCALE - ((minX + maxX) / 2) * s;
  const oy = (t.centerY || 0) * SCALE - ((minY + maxY) / 2) * s;
  const out = paths.map((p) => p.map((q) => {
    const [x, y] = pre(q.X, q.Y);
    return { X: Math.round(x * s + ox), Y: Math.round(y * s + oy) };
  }));
  return union(out);
}

// ---------- Plaque ----------
export function makePlate(pattern, p) {
  const b = bounds(pattern);
  if (!b) return [];
  const m = p.plateMargin * SCALE;
  if (p.plateShape === 'contour') {
    // Contour du motif élargi, trous bouchés
    const grown = offset(pattern, p.plateMargin, CL.JoinType.jtRound);
    return islands(grown).map((isl) => isl[0]);
  }
  const x0 = b.minX - m, y0 = b.minY - m, x1 = b.maxX + m, y1 = b.maxY + m;
  if (p.plateShape === 'ellipse') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = ((x1 - x0) / 2) * Math.SQRT2, ry = ((y1 - y0) / 2) * Math.SQRT2;
    const pts = [];
    for (let i = 0; i < 180; i++) { const a = (i / 180) * 2 * Math.PI; pts.push({ X: Math.round(cx + rx * Math.cos(a)), Y: Math.round(cy + ry * Math.sin(a)) }); }
    return [pts];
  }
  const r = Math.min(p.plateRadius * SCALE, (x1 - x0) / 2 - 1, (y1 - y0) / 2 - 1);
  const rect = [[{ X: x0, Y: y0 }, { X: x1, Y: y0 }, { X: x1, Y: y1 }, { X: x0, Y: y1 }]];
  if (r <= 0) return rect;
  return offset(offset(rect, -r / SCALE), r / SCALE, CL.JoinType.jtRound);
}

// ---------- Couches ----------
export const RELIEF_MIN = 0.2, RELIEF_MAX = 1.0;
export function clampRelief(v) {
  v = Number(v);
  if (!Number.isFinite(v)) return RELIEF_MAX;
  return Math.min(RELIEF_MAX, Math.max(RELIEF_MIN, Math.round(v * 100) / 100));
}
export function buildLayers(pattern, p) {
  const lh = p.layerHeight, flh = p.firstLayerHeight;
  const plate = p.plateThickness > 0 || p.polarity === 'negative' ? makePlate(pattern, p) : [];
  // Hauteur du motif limitée à 0,2–1 mm
  const relief = clampRelief(p.reliefHeight);
  const plateT = p.plateThickness > 0 ? p.plateThickness : 0;
  // Découpe une zone [z0, z1] en couches égales proches de lh (la dernière tombe pile sur z1)
  const zs = [];
  const fill = (z0, z1) => {
    const h = z1 - z0;
    if (h <= 1e-6) return;
    const n = Math.max(1, Math.ceil(h / lh - 0.25));
    for (let k = 1; k <= n; k++) zs.push(+(z0 + (h * k) / n).toFixed(4));
  };
  if (plateT > 0) {
    const first = Math.min(flh, plateT);
    zs.push(+first.toFixed(4));
    fill(first, plateT);
    fill(plateT, plateT + relief);
  } else {
    const first = Math.min(flh, relief);
    zs.push(+first.toFixed(4));
    fill(first, relief);
  }
  const layers = [];
  let negRegion = null;
  for (let i = 0; i < zs.length; i++) {
    const zTop = zs[i];
    const zMid = zTop - (i === 0 ? zs[0] : zTop - zs[i - 1]) / 2;
    let region;
    let kind;
    if (plateT > 0 && zMid < plateT) { region = plate; kind = 'plate'; }
    else if (p.polarity === 'negative') {
      negRegion = negRegion || op(plate, pattern, CL.ClipType.ctDifference);
      region = negRegion; kind = 'relief';
    } else { region = pattern; kind = 'relief'; }
    layers.push({ z: zTop, height: i === 0 ? zs[0] : +(zTop - zs[i - 1]).toFixed(4), region, kind, index: i });
  }
  return { layers, plate };
}

// ---------- Trajets d'une couche ----------
function closedLoop(path) {
  const pts = path.map((q) => [q.X / SCALE, q.Y / SCALE]);
  pts.push(pts[0]);
  return pts;
}
function polyLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}
// Démarre la boucle au point le plus proche (réduit les déplacements)
function rotateLoop(pts, near) {
  if (!near) return pts;
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = (pts[i][0] - near[0]) ** 2 + (pts[i][1] - near[1]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  const core = pts.slice(0, -1);
  const r = core.slice(best).concat(core.slice(0, best));
  r.push(r[0]);
  return r;
}

function infillLines(area, angleDeg, spacingMM) {
  if (!area.length) return [];
  const a = (angleDeg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  // Rotation de la zone de -a pour tracer des lignes horizontales
  const rot = area.map((p) => p.map((q) => ({ X: Math.round(q.X * ca + q.Y * sa), Y: Math.round(-q.X * sa + q.Y * ca) })));
  const b = bounds(rot);
  const sp = spacingMM * SCALE;
  const lines = [];
  const start = Math.ceil(b.minY / sp) * sp; // grille alignée (couches cohérentes)
  for (let y = start; y <= b.maxY; y += sp) lines.push([{ X: b.minX - 10, Y: Math.round(y) }, { X: b.maxX + 10, Y: Math.round(y) }]);
  if (!lines.length) return [];
  const c = new CL.Clipper();
  c.AddPaths(lines, CL.PolyType.ptSubject, false);
  c.AddPaths(rot, CL.PolyType.ptClip, true);
  const tree = new CL.PolyTree();
  c.Execute(CL.ClipType.ctIntersection, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  const open = CL.Clipper.OpenPathsFromPolyTree(tree);
  return open
    .filter((l) => l.length >= 2)
    .map((l) => l.map((q) => [(q.X * ca - q.Y * sa) / SCALE, (q.X * sa + q.Y * ca) / SCALE]))
    .filter((l) => polyLength(l) > spacingMM * 0.3);
}

function pointInArea(area, x, y) {
  const pt = { X: Math.round(x * SCALE), Y: Math.round(y * SCALE) };
  let inside = 0;
  for (const p of area) {
    const r = CL.Clipper.PointInPolygon(pt, p);
    if (r === 0) continue;
    inside += CL.Clipper.Orientation(p) ? 1 : -1;
  }
  return inside > 0;
}

// Ordonne les lignes (plus proche voisin) et les relie en zigzag quand c'est possible
function orderLines(lines, area, start, maxLink) {
  const out = [];
  const used = new Array(lines.length).fill(false);
  let cur = start;
  let lastEnd = null;
  for (let k = 0; k < lines.length; k++) {
    let best = -1, bestD = Infinity, rev = false;
    for (let i = 0; i < lines.length; i++) {
      if (used[i]) continue;
      const l = lines[i];
      const d0 = (l[0][0] - cur[0]) ** 2 + (l[0][1] - cur[1]) ** 2;
      const d1 = (l[l.length - 1][0] - cur[0]) ** 2 + (l[l.length - 1][1] - cur[1]) ** 2;
      if (d0 < bestD) { bestD = d0; best = i; rev = false; }
      if (d1 < bestD) { bestD = d1; best = i; rev = true; }
    }
    used[best] = true;
    const l = rev ? lines[best].slice().reverse() : lines[best];
    const d = Math.sqrt(bestD);
    const mid = lastEnd ? [(lastEnd[0] + l[0][0]) / 2, (lastEnd[1] + l[0][1]) / 2] : null;
    const link = lastEnd && d <= maxLink && pointInArea(area, mid[0], mid[1]);
    out.push({ pts: l, link });
    lastEnd = cur = l[l.length - 1];
  }
  return out;
}

/**
 * Génère les trajets d'une couche.
 * Retourne une liste de "moves" : {type:'outer'|'inner'|'infill', pts:[[x,y]...], link:bool}
 */
export function layerToolpaths(layer, p, startPt) {
  const w = p.lineWidth;
  const spacing = w - layer.height * (1 - Math.PI / 4);
  const moves = [];
  let lost = 0;
  let cur = startPt || [0, 0];
  const isl = islands(clean(layer.region));
  // ordre des îlots : plus proche voisin
  const remaining = isl.map((x) => ({ x, b: bounds(x) }));
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    remaining.forEach((r, i) => {
      const cx = (r.b.minX + r.b.maxX) / 2 / SCALE, cy = (r.b.minY + r.b.maxY) / 2 / SCALE;
      const d = (cx - cur[0]) ** 2 + (cy - cur[1]) ** 2;
      if (d < bd) { bd = d; bi = i; }
    });
    const island = remaining.splice(bi, 1)[0].x;
    const loops = [];
    let inner = island;
    let last = island;
    const nPer = layer.index === 0 ? Math.max(p.walls, 1) : p.walls;
    for (let k = 0; k < nPer; k++) {
      const d = k === 0 ? -w / 2 : -spacing;
      const o = clean(offset(last, d));
      if (!o.length) break;
      loops.push({ k, paths: o });
      last = o;
      inner = o;
    }
    if (!loops.length) { lost++; continue; }
    // Périmètres : intérieurs d'abord, extérieur en dernier (meilleure précision)
    const ordered = loops.slice().reverse();
    for (const L of ordered) {
      for (const path of L.paths) {
        let pts = rotateLoop(closedLoop(path), cur);
        moves.push({ type: L.k === 0 ? 'outer' : 'inner', pts });
        cur = pts[pts.length - 1];
      }
    }
    // Remplissage 100 %
    const overlap = (p.infillOverlap / 100) * w;
    const area = clean(offset(inner, -(spacing / 2) + overlap));
    if (area.length) {
      const angle = (layer.index % 2 === 0 ? 45 : -45) + (p.infillAngle || 0);
      const lines = infillLines(area, angle, spacing);
      const ord = orderLines(lines, offset(inner, w * 0.1), cur, spacing * 2.2);
      for (const o of ord) moves.push({ type: 'infill', pts: o.pts, link: o.link });
      if (ord.length) { const lp = ord[ord.length - 1].pts; cur = lp[lp.length - 1]; }
    }
  }
  return { moves, end: cur, lost };
}
