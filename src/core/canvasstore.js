// Mémoire des CANVAS, une par Centauri Carbon (clé : adresse IP).
// Pour chaque bobine : filament et couleur utilisés par l'application, modifiables et gardés en mémoire,
// même si la lecture de l'imprimante renvoie autre chose (bobine sans puce RFID, couleur mal saisie…).
// Une bobine « retirée » n'est plus proposée ni utilisée à l'envoi.
import { matFromTrayType, speedOf, materialProfile } from './materials.js';

const KEY = 'svg2print.canvas.v1';
export const DEFAULT_TRAYS = [
  { mat: 'pla_hs', color: '#F2F2F2' },
  { mat: 'pla_hs', color: '#202020' },
  { mat: 'pla_hs', color: '#D23A2A' },
  { mat: 'petg_hs', color: '#2F6FD0' },
];
/** Secours en fin de bobine : off | type (même matière) | color (même matière et même couleur) */
export const BACKUP_MODES = {
  type: 'Même matière (une autre couleur convient)',
  color: 'Même matière et même couleur',
  off: 'Pas de secours',
};

let all = {};
try { all = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { all = {}; }
const listeners = new Set();
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* */ }
  for (const fn of listeners) { try { fn(); } catch { /* */ } }
}
export function onCanvasChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function blank() {
  return { has: null, backup: 'type', autoRefill: null, lastRead: 0, trays: DEFAULT_TRAYS.map((t) => ({ ...t, name: '', removed: false, edited: false, printer: null })) };
}
/** Profil CANVAS d'une imprimante (créé à la demande, jamais null). */
export function canvasOf(ip) {
  const k = String(ip || '').trim();
  if (!k) return blank();
  if (!all[k]) all[k] = blank();
  const p = all[k];
  while (p.trays.length < 4) p.trays.push({ ...DEFAULT_TRAYS[p.trays.length], name: '', removed: false, edited: false, printer: null });
  return p;
}
export function knownCanvas(ip) { return !!all[String(ip || '').trim()]; }
export function updateCanvas(ip, fn) { const p = canvasOf(ip); fn(p); persist(); return p; }

/** Modification d'une bobine par l'utilisateur : gardée en mémoire, prioritaire sur la lecture de l'imprimante. */
export function editTray(ip, i, patch) {
  return updateCanvas(ip, (p) => { Object.assign(p.trays[i], patch, { edited: true }); if (patch.removed === false) p.trays[i].removed = false; });
}
/** Revient aux valeurs lues sur l'imprimante pour cette bobine. */
export function resetTray(ip, i) {
  return updateCanvas(ip, (p) => {
    const t = p.trays[i];
    t.edited = false; t.removed = false; t.name = '';
    if (t.printer) fromPrinter(t);
  });
}
function fromPrinter(t) {
  const r = t.printer;
  if (!r || !r.loaded) return;
  if (r.color) t.color = r.color.toUpperCase();
  const m = matFromTrayType(`${r.type} ${r.name}`, speedOf(t.mat) || 'hs');
  if (m) t.mat = m;
}
/**
 * Lecture de l'imprimante (résultat de ccCanvas) : mémorise ce que dit le CANVAS ;
 * les bobines modifiées dans l'application gardent leurs réglages.
 */
export function applyRead(ip, read) {
  return updateCanvas(ip, (p) => {
    p.has = read.trays.length > 0;
    p.lastRead = Date.now();
    p.autoRefill = read.autoRefill ?? null;
    for (let i = 0; i < 4; i++) {
      const r = read.trays.find((x) => x.slot === i) || null;
      const t = p.trays[i];
      t.printer = r ? { type: r.type, name: r.name, brand: r.brand, color: r.color, loaded: r.loaded } : null;
      if (!t.edited) fromPrinter(t);
    }
  });
}

const fam = (typeOrMat) => {
  const s = String(typeOrMat || '');
  if (/_|cust:/.test(s)) return materialProfile(s, 'cc').type; // identifiant de matière de l'appli
  return /TPU/i.test(s) ? 'TPU' : /PA|NYLON/i.test(s) ? 'PA' : /PETG|PET/i.test(s) ? 'PETG' : /PLA/i.test(s) ? 'PLA' : s.toUpperCase();
};
const near = (a, b) => {
  const h = (c) => [1, 3, 5].map((k) => parseInt(String(c || '#000000').slice(k, k + 2), 16));
  const [x, y] = [h(a), h(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 60;
};
/** La bobine est-elle utilisable (chargée selon l'imprimante, ou inconnue) et non retirée ? */
export function trayUsable(p, i) {
  const t = p.trays[i];
  return !!t && !t.removed && !(t.printer && t.printer.loaded === false);
}
/**
 * Bobines de secours compatibles avec la bobine i (même matière, et même couleur en mode « color »).
 * Renvoie les indices, les plus proches en couleur d'abord.
 */
export function backupsFor(p, i, mode = p.backup) {
  if (mode === 'off') return [];
  const t = p.trays[i];
  const f = fam(t.mat);
  return [0, 1, 2, 3]
    .filter((j) => j !== i && trayUsable(p, j) && fam(p.trays[j].mat) === f && (mode !== 'color' || near(p.trays[j].color, t.color)))
    .sort((a, b) => (near(p.trays[a].color, t.color) ? 0 : 1) - (near(p.trays[b].color, t.color) ? 0 : 1));
}
