// Lecture des fichiers 3D : STL (binaire/ASCII), OBJ, 3MF (dont projets Bambu/Orca/Elegoo).
// Chaque objet = { name, parts: [{ name, positions: Float32Array (triangles, mm), extruder }] , color? }
// Les positions sont déjà transformées (matrices 3MF) et exprimées en millimètres.
import { unzipSync, strFromU8 } from 'fflate';

const ext = (name) => (/\.([a-z0-9]+)$/i.exec(name || '') || [])[1]?.toLowerCase() || '';
export const SUPPORTED = ['stl', '3mf', 'obj'];

export async function readModelFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  return parseModel(buf, file.name || 'modele');
}

export function parseModel(bytes, name) {
  const e = ext(name);
  const base = name.replace(/\.[^.]+$/, '');
  if (e === 'stl') return { objects: [{ name: base, parts: [{ name: base, positions: parseSTL(bytes), extruder: null }] }], warnings: [] };
  if (e === 'obj') return { objects: [{ name: base, parts: [{ name: base, positions: parseOBJ(strFromU8(bytes)), extruder: null }] }], warnings: [] };
  if (e === '3mf') return parse3MF(bytes, base);
  throw new Error(`Format « .${e} » non pris en charge (STL, 3MF ou OBJ).`);
}

// ---------------- STL ----------------
export function parseSTL(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === bytes.length) {
      const out = new Float32Array(n * 9);
      for (let i = 0, o = 84; i < n; i++, o += 50) {
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true);
      }
      return out;
    }
  }
  const text = strFromU8(bytes);
  if (!/^\s*solid/i.test(text) || !/vertex/i.test(text)) throw new Error('Fichier STL illisible ou endommagé.');
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const v = [];
  let m;
  while ((m = re.exec(text))) v.push(+m[1], +m[2], +m[3]);
  return new Float32Array(v.length - (v.length % 9) === v.length ? v : v.slice(0, v.length - (v.length % 9)));
}

export function toBinarySTL(positions) {
  const n = positions.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let i = 0, o = 84; i < n; i++, o += 50) {
    const p = i * 9;
    const ax = positions[p + 3] - positions[p], ay = positions[p + 4] - positions[p + 1], az = positions[p + 5] - positions[p + 2];
    const bx = positions[p + 6] - positions[p], by = positions[p + 7] - positions[p + 1], bz = positions[p + 8] - positions[p + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, positions[p + k], true);
  }
  return new Uint8Array(buf);
}

// ---------------- OBJ ----------------
export function parseOBJ(text) {
  const v = [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      v.push([+p[1], +p[2], +p[3]]);
    } else if (line.startsWith('f ')) {
      const idx = line.trim().split(/\s+/).slice(1).map((t) => {
        const i = parseInt(t.split('/')[0], 10);
        return i < 0 ? v.length + i : i - 1;
      });
      for (let k = 1; k + 1 < idx.length; k++) {
        for (const j of [idx[0], idx[k], idx[k + 1]]) { const p = v[j]; if (!p) throw new Error('Fichier OBJ endommagé.'); out.push(p[0], p[1], p[2]); }
      }
    }
  }
  if (!out.length) throw new Error('Aucune face trouvée dans le fichier OBJ.');
  return new Float32Array(out);
}

// ---------------- 3MF ----------------
const UNIT = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function parseMatrix(t) {
  if (!t) return IDENTITY;
  const a = t.trim().split(/\s+/).map(Number);
  return a.length === 12 && a.every(Number.isFinite) ? a : IDENTITY;
}
// 3MF : point ligne [x y z 1] × matrice 4×3 (m00 m01 m02 / m10 … / m30 m31 m32)
function mul(a, b) { // a puis b
  const r = new Array(12);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j] + (i === 3 ? b[9 + j] : 0);
    }
  }
  return r;
}

function xmlDoc(text) {
  return new DOMParser().parseFromString(text, 'application/xml');
}
const byLocal = (el, name) => Array.from(el.getElementsByTagName('*')).filter((n) => n.localName === name);
const childrenNamed = (el, name) => Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === name);
const attr = (el, name) => {
  if (el.hasAttribute(name)) return el.getAttribute(name);
  for (const a of Array.from(el.attributes)) if (a.localName === name) return a.value;
  return null;
};

export function parse3MF(bytes, baseName) {
  let files;
  try { files = unzipSync(bytes); } catch { throw new Error('Fichier 3MF illisible (archive endommagée).'); }
  const warnings = [];
  const rootPath = Object.keys(files).find((k) => /^3D\/[^/]+\.model$/i.test(k)) || Object.keys(files).find((k) => /\.model$/i.test(k));
  if (!rootPath) throw new Error('Le 3MF ne contient pas de modèle 3D.');
  const models = {};
  const loadModel = (path) => {
    const key = path.replace(/^\//, '');
    if (models[key]) return models[key];
    const f = files[key] || files[Object.keys(files).find((k) => k.toLowerCase() === key.toLowerCase())];
    if (!f) return null;
    const doc = xmlDoc(strFromU8(f));
    const modelEl = byLocal(doc, 'model')[0] || doc.documentElement;
    const scale = UNIT[modelEl.getAttribute('unit') || 'millimeter'] || 1;
    const objects = {};
    for (const o of byLocal(doc, 'object')) objects[o.getAttribute('id')] = o;
    return (models[key] = { doc, scale, objects });
  };
  const root = loadModel(rootPath);

  // Réglages Bambu/Orca/Elegoo : extrudeur par objet et par pièce, couleurs des filaments
  const extruderOf = {}; // `${objectId}` ou `${objectId}:${partId}` -> n° (1..)
  const nameOf = {};
  const cfg = files['Metadata/model_settings.config'];
  if (cfg) {
    try {
      const d = xmlDoc(strFromU8(cfg));
      for (const o of byLocal(d, 'object')) {
        const oid = o.getAttribute('id');
        for (const m of childrenNamed(o, 'metadata')) {
          if (m.getAttribute('key') === 'extruder') extruderOf[oid] = +m.getAttribute('value');
          if (m.getAttribute('key') === 'name') nameOf[oid] = m.getAttribute('value');
        }
        for (const p of childrenNamed(o, 'part')) {
          for (const m of childrenNamed(p, 'metadata')) {
            if (m.getAttribute('key') === 'extruder') extruderOf[`${oid}:${p.getAttribute('id')}`] = +m.getAttribute('value');
          }
        }
      }
    } catch { /* réglages facultatifs */ }
  }
  let filaments = null;
  const proj = files['Metadata/project_settings.config'];
  if (proj) {
    try {
      const j = JSON.parse(strFromU8(proj));
      if (Array.isArray(j.filament_colour)) filaments = j.filament_colour.map((c, i) => ({ color: c.slice(0, 7), type: (j.filament_type || [])[i] || '' }));
    } catch { /* facultatif */ }
  }

  let painted = false;
  const meshOf = (model, objEl, matrix, out, partId) => {
    const mesh = childrenNamed(objEl, 'mesh')[0];
    if (mesh) {
      const vEl = childrenNamed(mesh, 'vertices')[0];
      const tEl = childrenNamed(mesh, 'triangles')[0];
      if (!vEl || !tEl) return;
      const vs = childrenNamed(vEl, 'vertex');
      const s = model.scale;
      const V = new Float64Array(vs.length * 3);
      vs.forEach((v, i) => { V[i * 3] = +v.getAttribute('x') * s; V[i * 3 + 1] = +v.getAttribute('y') * s; V[i * 3 + 2] = +v.getAttribute('z') * s; });
      const tris = childrenNamed(tEl, 'triangle');
      const P = new Float32Array(tris.length * 9);
      const m = matrix;
      tris.forEach((t, i) => {
        if (!painted && (t.hasAttribute('paint_color') || t.hasAttribute('slic3rpe:mmu_segmentation'))) painted = true;
        const ids = [+t.getAttribute('v1'), +t.getAttribute('v2'), +t.getAttribute('v3')];
        ids.forEach((id, k) => {
          const x = V[id * 3], y = V[id * 3 + 1], z = V[id * 3 + 2];
          P[i * 9 + k * 3] = x * m[0] + y * m[3] + z * m[6] + m[9];
          P[i * 9 + k * 3 + 1] = x * m[1] + y * m[4] + z * m[7] + m[10];
          P[i * 9 + k * 3 + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
        });
      });
      out.push({ positions: P, partId });
      return;
    }
    const comps = byLocal(objEl, 'component');
    for (const c of comps) {
      const path = attr(c, 'path');
      const target = path ? loadModel(path) : model;
      if (!target) continue;
      const child = target.objects[c.getAttribute('objectid')];
      if (!child) continue;
      meshOf(target, child, mul(parseMatrix(c.getAttribute('transform')), matrix), out, partId ?? c.getAttribute('objectid'));
    }
  };

  const objects = [];
  const build = byLocal(root.doc, 'build')[0];
  const items = build ? childrenNamed(build, 'item') : Object.keys(root.objects).map((id) => ({ getAttribute: (k) => (k === 'objectid' ? id : null) }));
  for (const it of items) {
    const oid = it.getAttribute('objectid');
    const o = root.objects[oid];
    if (!o || (o.getAttribute('type') && !/model|solidsupport/.test(o.getAttribute('type')))) continue;
    const parts = [];
    meshOf(root, o, parseMatrix(it.getAttribute('transform')), parts, null);
    if (!parts.length) continue;
    const name = nameOf[oid] || o.getAttribute('name') || `${baseName} ${objects.length + 1}`;
    objects.push({
      name,
      parts: parts.map((p, i) => ({
        name: parts.length > 1 ? `${name} · pièce ${i + 1}` : name,
        positions: p.positions,
        extruder: extruderOf[`${oid}:${p.partId}`] ?? extruderOf[oid] ?? null,
      })),
    });
  }
  if (!objects.length) throw new Error('Aucun objet imprimable dans ce 3MF.');
  if (painted) warnings.push('Ce 3MF contient de la peinture multicolore : elle est ignorée. Les couleurs se choisissent par objet ou par pièce.');
  return { objects, warnings, filaments };
}
