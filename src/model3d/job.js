// Assemblage d'une tâche d'impression 3D : objets placés → fichiers STL par filament → appel CuraEngine.
import { PRINTERS } from '../core/profiles.js';
import { toBinarySTL } from './mesh.js';
import { transformPositions, boundsOf, M3_ID } from './orient.js';
import { buildCura } from './settings.js';
import { START_MARK, END_MARK } from './post.js';

let nextId = 1;

// Objet chargé : pièces recentrées (centre XY de la boîte = 0, base à Z = 0)
export function makeObject(src) {
  const b = boundsOf(src.parts.map((p) => p.positions));
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = b.min[2];
  const parts = src.parts.map((p) => {
    const a = new Float32Array(p.positions.length);
    for (let i = 0; i < a.length; i += 3) { a[i] = p.positions[i] - cx; a[i + 1] = p.positions[i + 1] - cy; a[i + 2] = p.positions[i + 2] - cz; }
    return { name: p.name, positions: a, tool: p.extruder ? Math.max(0, p.extruder - 1) : 0, triangles: a.length / 9 };
  });
  return { id: nextId++, name: src.name, parts, rot: M3_ID.slice(), scale: 1, x: 0, y: 0 };
}

// Positions finales (mm, repère plateau) de chaque pièce + boîte englobante
export function worldParts(obj) {
  const rotated = obj.parts.map((p) => transformPositions(p.positions, obj.rot, obj.scale));
  const b = boundsOf(rotated);
  const dx = obj.x - (b.min[0] + b.max[0]) / 2, dy = obj.y - (b.min[1] + b.max[1]) / 2, dz = -b.min[2];
  for (const a of rotated) for (let i = 0; i < a.length; i += 3) { a[i] += dx; a[i + 1] += dy; a[i + 2] += dz; }
  return { parts: rotated, bounds: boundsOf(rotated) };
}

export function objectSize(obj) {
  const b = boundsOf(obj.parts.map((p) => transformPositions(p.positions, obj.rot, obj.scale)));
  return { w: b.size[0], d: b.size[1], h: b.size[2] };
}

/**
 * objects : objets placés ; job : réglages ; slots : [{ mat profile (fil), color }] (4 emplacements CANVAS ou 1)
 * canvas : true si multifilament CANVAS actif. Renvoie { definition, command, files, tools, warnings }.
 */
export function prepareSlice(objects, job, slots, canvas) {
  const P = PRINTERS[job.printer];
  const warnings = [];
  // Filaments réellement utilisés → extrudeurs Cura consécutifs
  const usedSlots = [];
  const slotOfPart = (p) => (canvas ? Math.min(slots.length - 1, p.tool) : 0);
  for (const o of objects) for (const p of o.parts) { const s = slotOfPart(p); if (!usedSlots.includes(s)) usedSlots.push(s); }
  usedSlots.sort((a, b) => a - b);
  if (!usedSlots.length) throw new Error('Aucun objet à trancher.');
  const tools = usedSlots.map((s) => ({ slot: canvas ? s : (slots[0].slot ?? 0), fil: slots[s].fil, color: slots[s].color }));
  if (canvas && tools.length > 1 && tools.some((t) => t.fil.type === 'TPU')) {
    throw new Error('Le TPU ne passe pas dans le CANVAS : imprimez-le seul, en bobine directe.');
  }
  if (canvas && tools.some((t) => t.fil.type === 'PA')) warnings.push('Nylon dans le CANVAS : bobine bien sèche indispensable.');
  const types = new Set(tools.map((t) => t.fil.type));
  if (types.size > 1 && (types.has('PA') || types.has('TPU'))) warnings.push('Matières très différentes dans la même pièce : l’adhérence entre elles sera faible.');

  // Un STL par filament (toutes les pièces de ce filament), coordonnées centrées sur le plateau (convention CuraEngine)
  const files = [];
  const meshes = [];
  let bb = null;
  const groups = new Map();
  for (const o of objects) {
    const w = worldParts(o);
    bb = bb ? boundsOf([new Float32Array([...w.bounds.min, ...w.bounds.max, ...bb.min, ...bb.max])]) : w.bounds;
    o.parts.forEach((p, k) => {
      const t = usedSlots.indexOf(slotOfPart(p));
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(w.parts[k]);
    });
  }
  if (bb.min[0] < -0.01 || bb.min[1] < -0.01 || bb.max[0] > P.bed.x + 0.01 || bb.max[1] > P.bed.y + 0.01) {
    throw new Error(`Les objets dépassent du plateau (${P.bed.x}×${P.bed.y} mm) : utilisez « Placer automatiquement » ou réduisez l’échelle.`);
  }
  if (bb.max[2] > P.bed.z) throw new Error(`Hauteur ${bb.max[2].toFixed(0)} mm supérieure au volume de l’imprimante (${P.bed.z} mm).`);
  [...groups.keys()].sort((a, b) => a - b).forEach((t, n) => {
    const arrs = groups.get(t);
    const total = arrs.reduce((a, x) => a + x.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const a of arrs) { all.set(a, o); o += a.length; }
    for (let i = 0; i < all.length; i += 3) { all[i] -= P.bed.x / 2; all[i + 1] -= P.bed.y / 2; }
    const name = n === 0 ? 'Model.stl' : `m${n}.stl`;
    files.push({ name, data: toBinarySTL(all) });
    meshes.push({ file: name, tool: t });
  });

  // Tour de purge : coin arrière droit libre, à défaut arrière gauche
  let primeTowerPos = null;
  if (tools.length > 1 && job.primeTower) {
    const size = 25, m = 16;
    const right = { x: P.bed.x - m - size / 2, y: P.bed.y - m - size / 2 };
    const left = { x: m + size / 2 + 5, y: P.bed.y - m - size / 2 };
    const clash = (c) => bb.max[0] > c.x - size / 2 - 6 && bb.min[0] < c.x + size / 2 + 6 && bb.max[1] > c.y - size / 2 - 6;
    primeTowerPos = !clash(right) ? right : !clash(left) ? left : null;
    if (!primeTowerPos) warnings.push('Pas de place pour la tour de purge : elle est désactivée (purge par le CANVAS seulement).');
    // Repère de CuraEngine pour la tour (mesuré) : centre = (x − 20,5 ; y + 4,5) pour une tour de 25 mm
    if (primeTowerPos) primeTowerPos = { x: +(primeTowerPos.x + 20.5).toFixed(2), y: +(primeTowerPos.y - 4.5).toFixed(2), cx: primeTowerPos.x, cy: primeTowerPos.y };
  }
  const jobEff = { ...job, primeTower: !!primeTowerPos };
  const { definition, command, adhesion } = buildCura(jobEff, tools, meshes, { startGcode: START_MARK, endGcode: END_MARK, primeTowerPos });
  return { definition, command, files, tools, warnings, adhesion, bounds: bb, primeTower: primeTowerPos && { x: primeTowerPos.cx, y: primeTowerPos.cy, size: 25 } };
}
