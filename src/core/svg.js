// Lecture d'un SVG et conversion en polygones (mm), sans dépendre du DOM rendu.
// Gère : path, rect, circle, ellipse, line, polyline, polygon, g, use, symbol,
// transformations imbriquées, styles (attributs, style="", classes CSS simples),
// fill-rule, traits (stroke) convertis en surfaces, unités (mm, cm, in, pt, px).
import svgpath from 'svgpath';
import ClipperLib from 'clipper-lib';

export const SCALE = 1000; // 1 unité Clipper = 1 µm

// ---------- Matrices affines [a b c d e f] ----------
const I = [1, 0, 0, 1, 0, 0];
export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function parseTransform(str) {
  let m = I.slice();
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(str))) {
    const v = t[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let n = I;
    switch (t[1]) {
      case 'matrix': n = v.length === 6 ? v : I; break;
      case 'translate': n = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
      case 'scale': n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0]; break;
      case 'rotate': {
        const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        n = [c, s, -s, c, 0, 0];
        if (v.length === 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
        break;
      }
      case 'skewX': n = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': n = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, n);
  }
  return m;
}
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

// ---------- Unités ----------
const UNIT_MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
function lengthMM(s) {
  if (s == null) return null;
  const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(String(s));
  if (!m || m[2] === '%') return null;
  return parseFloat(m[1]) * (UNIT_MM[m[2].toLowerCase()] ?? UNIT_MM.px);
}
const num = (s, d = 0) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : d;
};

// ---------- Styles ----------
function parseStyleAttr(s) {
  const o = {};
  if (!s) return o;
  for (const part of s.split(';')) {
    const i = part.indexOf(':');
    if (i > 0) o[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return o;
}
function parseCss(text) {
  // Prend en charge les sélecteurs simples .classe, #id, élément (séparés par des virgules)
  const rules = [];
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const decl = parseStyleAttr(m[2]);
    for (const sel of m[1].split(',')) rules.push({ sel: sel.trim(), decl });
  }
  return rules;
}
const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'display', 'visibility', 'fill-opacity', 'stroke-opacity', 'opacity', 'stroke-linejoin', 'stroke-linecap'];

function cssFor(el, rules) {
  const o = {};
  if (!rules.length) return o;
  const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  const id = el.getAttribute('id');
  const tag = localName(el);
  for (const r of rules) {
    const s = r.sel;
    if ((s.startsWith('.') && cls.includes(s.slice(1))) || (s.startsWith('#') && s.slice(1) === id) || s === tag)
      Object.assign(o, r.decl);
  }
  return o;
}
function localName(el) {
  return (el.localName || el.nodeName || '').replace(/^.*:/, '');
}
function computeStyle(el, parent, rules) {
  const st = { ...parent };
  const css = cssFor(el, rules);
  const inline = parseStyleAttr(el.getAttribute && el.getAttribute('style'));
  for (const p of STYLE_PROPS) {
    const a = el.getAttribute && el.getAttribute(p);
    if (a != null && a !== '') st[p] = a.trim();
    if (css[p] != null) st[p] = css[p];
    if (inline[p] != null) st[p] = inline[p];
  }
  return st;
}
const isNone = (v) => !v || v === 'none' || v === 'transparent';
function isWhite(c) {
  if (!c) return false;
  c = c.replace(/\s+/g, '').toLowerCase();
  return ['white', '#fff', '#ffffff', 'rgb(255,255,255)', 'rgb(100%,100%,100%)'].includes(c);
}

// ---------- Aplatissement des courbes ----------
function flattenPath(d, m, tol) {
  // tol en unités finales (mm). Retourne [{pts:[[x,y]...], closed}]
  const subs = [];
  let cur = null;
  let sx = 0, sy = 0, x = 0, y = 0;
  const p = svgpath(d).matrix(m).abs().unarc().unshort();
  const push = (px, py) => cur.pts.push([px, py]);
  p.iterate((seg) => {
    const c = seg[0];
    switch (c) {
      case 'M':
        cur = { pts: [[seg[1], seg[2]]], closed: false };
        subs.push(cur);
        x = sx = seg[1]; y = sy = seg[2];
        break;
      case 'L': if (!cur) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); } push(seg[1], seg[2]); x = seg[1]; y = seg[2]; break;
      case 'H': push(seg[1], y); x = seg[1]; break;
      case 'V': push(x, seg[1]); y = seg[1]; break;
      case 'C': {
        const [, x1, y1, x2, y2, x3, y3] = seg;
        const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
        const n = Math.max(2, Math.min(200, Math.ceil(Math.sqrt(len / tol) * 1.2)));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
               u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
        }
        x = x3; y = y3;
        break;
      }
      case 'Q': {
        const [, x1, y1, x2, y2] = seg;
        const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1);
        const n = Math.max(2, Math.min(200, Math.ceil(Math.sqrt(len / tol))));
        for (let i = 1; i <= n; i++) {
          const t = i / n, u = 1 - t;
          push(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
        }
        x = x2; y = y2;
        break;
      }
      case 'Z': case 'z':
        if (cur) { cur.closed = true; x = sx; y = sy; cur = null; }
        break;
    }
  });
  return subs.filter((s) => s.pts.length >= 2);
}

function ellipsePts(cx, cy, rx, ry, m, tol) {
  const r = Math.max(rx, ry) * scaleOf(m);
  const n = Math.max(24, Math.min(720, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tol / Math.max(r, tol))))));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(apply(m, cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return pts;
}
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function elementToSubpaths(el, m, tol) {
  const tag = localName(el);
  const g = (a) => el.getAttribute(a);
  switch (tag) {
    case 'path': return g('d') ? flattenPath(g('d'), m, tol) : [];
    case 'rect': {
      const x = num(g('x')), y = num(g('y')), w = num(g('width')), h = num(g('height'));
      if (w <= 0 || h <= 0) return [];
      let rx = g('rx'), ry = g('ry');
      rx = rx == null ? (ry == null ? 0 : num(ry)) : num(rx);
      ry = ry == null ? rx : num(ry);
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (rx > 0 && ry > 0) {
        const d = `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
        return flattenPath(d, m, tol);
      }
      return [{ pts: [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)], closed: true }];
    }
    case 'circle': {
      const r = num(g('r'));
      return r > 0 ? [{ pts: ellipsePts(num(g('cx')), num(g('cy')), r, r, m, tol), closed: true }] : [];
    }
    case 'ellipse': {
      const rx = num(g('rx')), ry = num(g('ry'));
      return rx > 0 && ry > 0 ? [{ pts: ellipsePts(num(g('cx')), num(g('cy')), rx, ry, m, tol), closed: true }] : [];
    }
    case 'line':
      return [{ pts: [apply(m, num(g('x1')), num(g('y1'))), apply(m, num(g('x2')), num(g('y2')))], closed: false }];
    case 'polyline': case 'polygon': {
      const v = (g('points') || '').trim().split(/[\s,]+/).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push(apply(m, v[i], v[i + 1]));
      return pts.length >= 2 ? [{ pts, closed: tag === 'polygon' }] : [];
    }
  }
  return [];
}

// ---------- Conversion en surfaces Clipper ----------
const toInt = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));

function fillShape(subs, fillRule) {
  const paths = subs.filter((s) => s.pts.length >= 3).map((s) => toInt(s.pts));
  if (!paths.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  const ft = fillRule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero;
  c.Execute(ClipperLib.ClipType.ctUnion, out, ft, ft);
  return out;
}
function strokeShape(subs, widthMM, join, cap) {
  if (widthMM <= 0) return [];
  const co = new ClipperLib.ClipperOffset(2, 0.01 * SCALE);
  const jt = join === 'miter' ? ClipperLib.JoinType.jtMiter : join === 'bevel' ? ClipperLib.JoinType.jtSquare : ClipperLib.JoinType.jtRound;
  const et = cap === 'butt' ? ClipperLib.EndType.etOpenButt : cap === 'square' ? ClipperLib.EndType.etOpenSquare : ClipperLib.EndType.etOpenRound;
  for (const s of subs) {
    const pts = toInt(s.pts);
    co.AddPath(pts, s.closed ? jt : jt, s.closed ? ClipperLib.EndType.etClosedLine : et);
  }
  const out = new ClipperLib.Paths();
  co.Execute(out, (widthMM / 2) * SCALE);
  return out;
}
export function boolOp(a, b, op) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(a, ClipperLib.PolyType.ptSubject, true);
  if (b && b.length) c.AddPaths(b, ClipperLib.PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(op, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
}

/**
 * Analyse un texte SVG.
 * options : { mode: 'auto'|'stroke'|'fill', strokeWidth: mm (0 = largeur du SVG), whiteIsEmpty: bool, tolerance: mm, DOMParser }
 * Retourne { paths: Clipper Paths (µm, Y vers le bas comme le SVG), widthMM, heightMM, warnings }
 */
export function parseSVG(text, options = {}) {
  const opt = { mode: 'auto', strokeWidth: 0, minStroke: 0.4, whiteIsEmpty: true, tolerance: 0.02, ...options };
  const Parser = opt.DOMParser || globalThis.DOMParser;
  const doc = new Parser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || localName(root) !== 'svg') throw new Error('Fichier SVG invalide');
  const warnings = new Set();

  // Échelle unités utilisateur -> mm
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const wmm = lengthMM(root.getAttribute('width'));
  const hmm = lengthMM(root.getAttribute('height'));
  let base = [25.4 / 96, 0, 0, 25.4 / 96, 0, 0];
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    let sx = wmm ? wmm / vb[2] : null, sy = hmm ? hmm / vb[3] : null;
    if (!sx && !sy) sx = sy = 25.4 / 96;
    sx = sx || sy; sy = sy || sx;
    const s = Math.min(sx, sy); // preserveAspectRatio par défaut (meet)
    base = [s, 0, 0, s, -vb[0] * s, -vb[1] * s];
  }

  // CSS
  const rules = [];
  for (const st of Array.from(doc.getElementsByTagName('style'))) rules.push(...parseCss(st.textContent || ''));

  // Index des id pour <use>
  const byId = {};
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) { const id = all[i].getAttribute('id'); if (id) byId[id] = all[i]; }

  let result = [];
  const tol = opt.tolerance;

  const visit = (el, m, style, depth) => {
    if (depth > 40) return;
    const tag = localName(el);
    if (['defs', 'clipPath', 'mask', 'marker', 'pattern', 'metadata', 'title', 'desc', 'style', 'linearGradient', 'radialGradient', 'filter', 'symbol'].includes(tag)) return;
    if (tag === 'text' || tag === 'tspan') { warnings.add('Le SVG contient du texte : convertissez-le en tracés (Inkscape : Chemin > Objet en chemin).'); return; }
    if (tag === 'image') { warnings.add('Les images bitmap intégrées sont ignorées.'); return; }
    const st = computeStyle(el, style, rules);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    const mm = mul(m, parseTransform(el.getAttribute('transform')));

    if (tag === 'svg' || tag === 'g' || tag === 'a' || tag === 'switch') {
      let mx = mm;
      if (tag === 'svg' && el !== root) mx = mul(mm, [1, 0, 0, 1, num(el.getAttribute('x')), num(el.getAttribute('y'))]);
      for (const ch of Array.from(el.childNodes)) if (ch.nodeType === 1) visit(ch, mx, st, depth + 1);
      return;
    }
    if (tag === 'use') {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href') || (el.getAttributeNS && el.getAttributeNS('http://www.w3.org/1999/xlink', 'href'));
      const target = href && byId[href.replace(/^#/, '')];
      if (!target) return;
      const mu = mul(mm, [1, 0, 0, 1, num(el.getAttribute('x')), num(el.getAttribute('y'))]);
      if (localName(target) === 'symbol') {
        for (const ch of Array.from(target.childNodes)) if (ch.nodeType === 1) visit(ch, mu, computeStyle(target, st, rules), depth + 1);
      } else visit(target, mu, st, depth + 1);
      return;
    }

    const subs = elementToSubpaths(el, mm, tol);
    if (!subs.length) return;

    const fill = st.fill === undefined ? '#000' : st.fill;
    const stroke = st.stroke;
    const hasFill = !isNone(fill) && opt.mode !== 'stroke' && tag !== 'line' && tag !== 'polyline';
    const hasStroke = opt.mode === 'stroke' ? true : !isNone(stroke) && opt.mode !== 'fill';

    let shape = [];
    if (hasFill) shape = shape.concat(fillShape(subs, st['fill-rule']));
    if (hasStroke) {
      let w = opt.strokeWidth > 0 ? opt.strokeWidth : num(st['stroke-width'], 1) * scaleOf(mm);
      if (w < opt.minStroke) { w = opt.minStroke; warnings.add(`Traits très fins élargis à ${opt.minStroke} mm (réglable).`); }
      shape = shape.concat(strokeShape(subs, w, st['stroke-linejoin'], st['stroke-linecap']));
    }
    if (!hasFill && !hasStroke && opt.mode === 'auto') {
      // Tracé sans remplissage ni trait : on le traite comme un parcours
      const w = opt.strokeWidth > 0 ? opt.strokeWidth : opt.minStroke;
      shape = strokeShape(subs, w, 'round', 'round');
    }
    if (!shape.length) return;

    const white = opt.whiteIsEmpty && isWhite(hasFill ? fill : stroke);
    result = white ? boolOp(result, shape, ClipperLib.ClipType.ctDifference)
                   : boolOp(result, shape, ClipperLib.ClipType.ctUnion);
  };

  visit(root, base, {}, 0);
  return { paths: result, warnings: [...warnings], docWidthMM: wmm, docHeightMM: hmm };
}

export function bounds(paths) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) for (const q of p) {
    if (q.X < minX) minX = q.X; if (q.X > maxX) maxX = q.X;
    if (q.Y < minY) minY = q.Y; if (q.Y > maxY) maxY = q.Y;
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
