import { parseSVG, bounds, SCALE } from './core/svg.js';
import { transformPattern, makePlate, clampRelief } from './core/slicer.js';
import { slice as sliceSync, fmtTime } from './core/gcode.js';
import { PRINTERS, defaultFilament, defaultPrint } from './core/profiles.js';
import { sendToPrinter, testPrinter, ccCanvas } from './net/printers.js';
import { MATERIALS, MATERIAL_IDS, materialProfile, flushVolume } from './core/materials.js';
import { initModel3D } from './model3d/ui3d.js';
import { platform } from './net/transport.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const STORE = 'svg2print.v1';

// ---------------- État ----------------
const PART_KEYS = ['plateThickness', 'reliefHeight', 'plateShape', 'plateMargin', 'plateRadius'];
function freshState() {
  const dp = defaultPrint('cc');
  return {
    printer: 'cc',
    xf: { mode: 'auto', strokeWidth: 0, whiteIsEmpty: true, rotation: 0, mirrorX: false, mirrorY: false, scale: 1 },
    part: Object.fromEntries(PART_KEYS.map((k) => [k, dp[k]]).concat([['polarity', 'positive']])),
    net: { cc: { host: '', mainboardId: '' }, k1: { host: '', port: '' } },
    fil: { cc: defaultFilament('cc'), k1: defaultFilament('k1') },
    print: { cc: stripPart(defaultPrint('cc')), k1: stripPart(defaultPrint('k1')) },
    autoLevel: true, startAfter: true,
    canvasSvg: { on: false, plateSlot: 0, reliefSlot: 1, reliefMat: 'pla_hs', plateColor: '#F2F2F2', reliefColor: '#202020' },
  };
}
function stripPart(p) { const o = { ...p }; PART_KEYS.concat('polarity').forEach((k) => delete o[k]); return o; }
let state = freshState();
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && saved.fil) {
    const f = freshState();
    state = { ...f, ...saved, xf: { ...f.xf, ...saved.xf, scale: 1, rotation: 0, mirrorX: false, mirrorY: false }, part: { ...f.part, ...saved.part },
      net: { cc: { ...f.net.cc, ...saved.net?.cc }, k1: { ...f.net.k1, ...saved.net?.k1 } },
      fil: { cc: { ...f.fil.cc, ...saved.fil?.cc }, k1: { ...f.fil.k1, ...saved.fil?.k1 } },
      print: { cc: { ...f.print.cc, ...saved.print?.cc }, k1: { ...f.print.k1, ...saved.print?.k1 } },
      canvasSvg: { ...f.canvasSvg, ...saved.canvasSvg } };
    for (const k of ['cc', 'k1']) if (!state.fil[k].material) state.fil[k] = { ...defaultFilament(k), ...state.fil[k], material: 'petg_hs', type: 'PETG' };
  }
} catch {}
state.part.reliefHeight = clampRelief(state.part.reliefHeight);
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} };

let svgText = null, svgName = 'motif', raw = null, baseSize = null;
let pattern = [], plate = [];
let sliced = null, view = 'model', zoomPart = true, layerIdx = 0;

const groupObj = (g) => (g === 'xf' ? state.xf : g === 'part' ? state.part : g === 'net' ? state.net[state.printer] : g === 'fil' ? state.fil[state.printer] : state.print[state.printer]);
const printParams = () => ({ ...state.print[state.printer], ...state.part });

// ---------------- Journal ----------------
function log(msg, cls) {
  const li = document.createElement('li');
  li.textContent = msg;
  if (cls) li.className = cls;
  $('#log').prepend(li);
}
function progress(f) {
  const el = $('#progress');
  el.hidden = f == null;
  if (f != null) el.firstElementChild.style.width = `${Math.round(f * 100)}%`;
}

// ---------------- Formulaires ----------------
function fillForm() {
  for (const el of $$('[data-g]')) {
    const v = groupObj(el.dataset.g)[el.dataset.k];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  }
  $$('#printerSeg button').forEach((b) => b.classList.toggle('on', b.dataset.printer === state.printer));
  $$('#polaritySeg button').forEach((b) => b.classList.toggle('on', b.dataset.pol === state.part.polarity));
  $$('#reliefChips button').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.relief - state.part.reliefHeight) < 1e-6));
  $('#mirrorX').setAttribute('aria-pressed', state.xf.mirrorX);
  $('#mirrorY').setAttribute('aria-pressed', state.xf.mirrorY);
  const P = PRINTERS[state.printer];
  $('#pill').textContent = `${P.name.replace(/^\S+ /, '')} · ${P.bed.x}×${P.bed.y}`;
  $('#portField').hidden = state.printer !== 'k1';
  $('#mbField').hidden = state.printer !== 'cc';
  $('#levelRow').hidden = state.printer !== 'cc';
  $('#discoverBtn').hidden = !(state.printer === 'cc' && platform() !== 'web');
  $('#startChk').checked = state.startAfter;
  $('#levelChk').checked = state.autoLevel;
  $('#matSel').value = state.fil[state.printer].material || 'petg_hs';
  const cs = state.canvasSvg;
  $('#svgCanvasRow').hidden = state.printer !== 'cc';
  $('#svgCanvasOn').checked = cs.on && state.printer === 'cc';
  $('#svgCanvasBox').hidden = !(cs.on && state.printer === 'cc');
  $('#svgPlateSlot').value = String(cs.plateSlot); $('#svgReliefSlot').value = String(cs.reliefSlot);
  $('#svgReliefMat').value = cs.reliefMat; $('#svgPlateColor').value = cs.plateColor; $('#svgReliefColor').value = cs.reliefColor;
  const f = state.fil[state.printer];
  $('#filHint').textContent = `${f.name} — buse ${f.nozzle} °C, plateau ${f.bed} °C, ventilateur ${f.fan} %, parois pleines. Réglage optimisé pour la ${P.name}.`;
  updateSizeInputs();
}
function onField(e) {
  const el = e.target;
  if (!el.dataset.g) return;
  const obj = groupObj(el.dataset.g);
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'number') { v = el.value === '' ? (el.dataset.k === 'port' ? '' : 0) : parseFloat(el.value); if (Number.isNaN(v)) return; }
  else v = el.value.trim();
  if (el.dataset.k === 'reliefHeight') {
    const c = clampRelief(v);
    if (c !== v) log(`Hauteur du motif ramenée à ${String(c).replace('.', ',')} mm (plage autorisée : 0,2 à 1 mm).`);
    v = c;
    el.value = c;
  }
  obj[el.dataset.k] = v;
  save();
  if (el.dataset.g === 'xf' && ['mode', 'strokeWidth', 'whiteIsEmpty'].includes(el.dataset.k)) reparse();
  else if (el.dataset.g === 'xf' || el.dataset.g === 'part') { if (el.dataset.k === 'reliefHeight') fillForm(); rebuild(); }
  else if (el.dataset.g === 'fil' || el.dataset.g === 'print') { invalidate(); if (el.dataset.g === 'fil') fillHintOnly(); }
}
function fillHintOnly() {
  const f = state.fil[state.printer], P = PRINTERS[state.printer];
  $('#filHint').textContent = `${f.name} — buse ${f.nozzle} °C, plateau ${f.bed} °C, ventilateur ${f.fan} %, parois pleines. Réglage optimisé pour la ${P.name}.`;
}
document.addEventListener('change', onField);

// ---------------- SVG ----------------
async function openFile(file) {
  if (!file) return;
  svgText = await file.text();
  svgName = file.name.replace(/\.svg$/i, '');
  $('#fileName').textContent = file.name;
  state.xf.scale = 1; state.xf.rotation = 0; state.xf.mirrorX = false; state.xf.mirrorY = false;
  reparse(true);
  fillForm();
}
function reparse(fit) {
  if (!svgText) return;
  try {
    raw = parseSVG(svgText, { mode: state.xf.mode, strokeWidth: state.xf.strokeWidth, whiteIsEmpty: state.xf.whiteIsEmpty });
  } catch (e) {
    raw = null; $('#warnings').innerHTML = `<li>${e.message}</li>`; return;
  }
  const w = $('#warnings');
  w.innerHTML = '';
  for (const m of raw.warnings) { const li = document.createElement('li'); li.textContent = m; w.append(li); }
  if (!raw.paths.length) { const li = document.createElement('li'); li.textContent = 'Aucun tracé imprimable trouvé dans ce fichier.'; w.append(li); }
  // Si le dessin est plus grand que le plateau, on le réduit automatiquement
  if (fit) {
    const b = bounds(raw.paths);
    if (b) {
      const P = PRINTERS[state.printer];
      const m = 2 * (state.part.plateMargin || 0) + 10;
      const k = Math.min((P.bed.x - m) / (b.w / SCALE), (P.bed.y - m) / (b.h / SCALE));
      if (k < 1) { state.xf.scale = k; log(`Dessin réduit à ${Math.round(k * 100)} % pour tenir sur le plateau.`); }
    }
  }
  rebuild();
}
function rotatedBase() {
  if (!raw || !raw.paths.length) return null;
  const p = transformPattern(raw.paths, { ...state.xf, scale: 1, centerX: 0, centerY: 0 });
  const b = bounds(p);
  return b ? { w: b.w / SCALE, h: b.h / SCALE } : null;
}
function rebuild() {
  invalidate();
  $('#emptyHint').hidden = !!raw;
  if (!raw || !raw.paths.length) { pattern = []; plate = []; draw(); updateSizeInputs(); return; }
  const P = PRINTERS[state.printer];
  baseSize = rotatedBase();
  pattern = transformPattern(raw.paths, { ...state.xf, centerX: P.bed.x / 2, centerY: P.bed.y / 2 });
  const pp = printParams();
  plate = pp.plateThickness > 0 || pp.polarity === 'negative' ? makePlate(pattern, pp) : [];
  updateSizeInputs();
  checkFit();
  draw();
  $('#sliceBtn').disabled = false;
}
function partBounds() {
  const b = bounds(plate.length ? plate.concat(pattern) : pattern);
  return b && { x0: b.minX / SCALE, y0: b.minY / SCALE, x1: b.maxX / SCALE, y1: b.maxY / SCALE };
}
function checkFit() {
  const b = partBounds(), P = PRINTERS[state.printer];
  const el = $('#warnings');
  el.querySelectorAll('.fit').forEach((n) => n.remove());
  if (b && (b.x0 < 0 || b.y0 < 0 || b.x1 > P.bed.x || b.y1 > P.bed.y)) {
    const li = document.createElement('li'); li.className = 'fit';
    li.textContent = `La pièce (${(b.x1 - b.x0).toFixed(0)}×${(b.y1 - b.y0).toFixed(0)} mm) dépasse le plateau ${P.bed.x}×${P.bed.y} mm : réduisez-la.`;
    el.append(li);
    return false;
  }
  return true;
}
function updateSizeInputs() {
  const has = !!baseSize && !!raw;
  for (const id of ['#wInput', '#hInput', '#pctInput']) $(id).disabled = !has;
  if (!has) { $('#wInput').value = $('#hInput').value = $('#pctInput').value = ''; return; }
  $('#wInput').value = (baseSize.w * state.xf.scale).toFixed(1);
  $('#hInput').value = (baseSize.h * state.xf.scale).toFixed(1);
  $('#pctInput').value = Math.round(state.xf.scale * 1000) / 10;
  const b = partBounds();
  if (b) $('#stDim').textContent = `${(b.x1 - b.x0).toFixed(1)} × ${(b.y1 - b.y0).toFixed(1)} mm`;
  $('#stats').hidden = false;
}

// Dimensions (verrou des proportions)
let lockRatio = true;
let freeStretch = null; // {sx, sy} si proportions libres -> appliqué via étirement
$('#lockBtn').addEventListener('click', () => {
  lockRatio = !lockRatio;
  $('#lockBtn').classList.toggle('on', lockRatio);
  $('#lockBtn').setAttribute('aria-pressed', lockRatio);
});
function setSize(kind, val) {
  if (!baseSize || !(val > 0)) return;
  if (kind === 'w') state.xf.scale = val / baseSize.w;
  else if (kind === 'h') state.xf.scale = val / baseSize.h;
  else state.xf.scale = val / 100;
  if (!lockRatio && kind !== 'pct') {
    // Étirement non proportionnel : on applique sur le dessin source
    const other = kind === 'w' ? parseFloat($('#hInput').value) : parseFloat($('#wInput').value);
    const sx = kind === 'w' ? val / baseSize.w : other / baseSize.w;
    const sy = kind === 'h' ? val / baseSize.h : other / baseSize.h;
    stretch(sx / Math.min(sx, sy), sy / Math.min(sx, sy));
    state.xf.scale = Math.min(sx, sy);
  }
  rebuild();
}
function stretch(fx, fy) {
  if (Math.abs(fx - 1) < 1e-6 && Math.abs(fy - 1) < 1e-6) return;
  // Étire dans le repère affiché (après rotation) : on rapporte l'étirement au repère du dessin
  const a = ((state.xf.rotation || 0) * Math.PI) / 180;
  const rot = Math.abs(Math.round(a / (Math.PI / 2))) % 2 === 1;
  const sx = rot ? fy : fx, sy = rot ? fx : fy;
  raw = { ...raw, paths: raw.paths.map((p) => p.map((q) => ({ X: Math.round(q.X * sx), Y: Math.round(q.Y * sy) }))) };
}
$('#wInput').addEventListener('change', (e) => setSize('w', parseFloat(e.target.value)));
$('#hInput').addEventListener('change', (e) => setSize('h', parseFloat(e.target.value)));
$('#pctInput').addEventListener('change', (e) => setSize('pct', parseFloat(e.target.value)));
$('#mirrorX').addEventListener('click', () => { state.xf.mirrorX = !state.xf.mirrorX; fillForm(); rebuild(); });
$('#mirrorY').addEventListener('click', () => { state.xf.mirrorY = !state.xf.mirrorY; fillForm(); rebuild(); });
$('#rot90').addEventListener('click', () => { state.xf.rotation = ((state.xf.rotation || 0) + 90) % 360; fillForm(); rebuild(); });
$('#fitBtn').addEventListener('click', () => {
  if (!baseSize) return;
  const P = PRINTERS[state.printer];
  const m = state.part.plateThickness > 0 || state.part.polarity === 'negative' ? 2 * state.part.plateMargin + 6 : 6;
  state.xf.scale = Math.min((P.bed.x - m) / baseSize.w, (P.bed.y - m) / baseSize.h);
  rebuild();
});
$('#origBtn').addEventListener('click', () => { state.xf.scale = 1; reparse(); });

// ---------------- Imprimante / polarité ----------------
$('#printerSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  setPrinter(b.dataset.printer); $('#connState').textContent = '';
});
$('#reliefChips').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.part.reliefHeight = clampRelief(+b.dataset.relief); save(); fillForm(); rebuild();
});
$('#polaritySeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.part.polarity = b.dataset.pol; save(); fillForm(); rebuild();
});
$('#resetFil').addEventListener('click', () => { state.fil[state.printer] = defaultFilament(state.printer, state.fil[state.printer].material); save(); fillForm(); invalidate(); log('Réglage filament optimisé rétabli.'); });
$('#resetPrint').addEventListener('click', () => { state.print[state.printer] = stripPart(defaultPrint(state.printer)); save(); fillForm(); invalidate(); });
$('#matSel').addEventListener('change', (e) => {
  state.fil[state.printer] = defaultFilament(state.printer, e.target.value);
  save(); fillForm(); invalidate();
  for (const n of MATERIALS[e.target.value].notes) log(n);
});
$('#svgCanvasOn').addEventListener('change', (e) => { state.canvasSvg.on = e.target.checked; save(); fillForm(); invalidate(); });
for (const [id, key, num] of [['#svgPlateSlot', 'plateSlot', true], ['#svgReliefSlot', 'reliefSlot', true], ['#svgReliefMat', 'reliefMat', false], ['#svgPlateColor', 'plateColor', false], ['#svgReliefColor', 'reliefColor', false]]) {
  $(id).addEventListener('change', (e) => { state.canvasSvg[key] = num ? +e.target.value : e.target.value; save(); invalidate(); });
}
function svgCanvas() {
  const cs = state.canvasSvg;
  if (!cs.on || state.printer !== 'cc') return null;
  const reliefFil = materialProfile(cs.reliefMat, 'cc');
  if (reliefFil.type === 'TPU' || state.fil.cc.type === 'TPU') throw new Error('Le TPU ne passe pas dans le CANVAS.');
  return {
    plateTool: cs.plateSlot, reliefTool: cs.reliefSlot, reliefFil,
    flushVol: flushVolume(cs.plateColor, cs.reliefColor),
    colors: { [cs.plateSlot]: cs.plateColor, [cs.reliefSlot]: cs.reliefColor },
  };
}
$('#startChk').addEventListener('change', (e) => { state.startAfter = e.target.checked; save(); });
$('#levelChk').addEventListener('change', (e) => { state.autoLevel = e.target.checked; save(); });

$('#testBtn').addEventListener('click', async () => {
  const net = state.net[state.printer];
  const c = $('#connState');
  if (!net.host) { c.className = 'conn err'; c.textContent = "Saisissez l'adresse IP de l'imprimante."; return; }
  c.className = 'conn'; c.textContent = 'Connexion…';
  try {
    const st = await testPrinter(state.printer, { ...net, port: net.port ? +net.port : 0 }, (m) => log(m));
    if (st.mainboard && !net.mainboardId) { net.mainboardId = st.mainboard; save(); fillForm(); }
    c.className = 'conn ok';
    c.textContent = `Connectée — ${st.state}${st.nozzle != null ? `, buse ${Math.round(st.nozzle)} °C` : ''}${st.bed != null ? `, plateau ${Math.round(st.bed)} °C` : ''}`;
  } catch (e) { c.className = 'conn err'; c.textContent = e.message; }
});
$('#discoverBtn').addEventListener('click', async () => {
  const c = $('#connState'); c.className = 'conn'; c.textContent = 'Recherche sur le réseau…';
  try {
    const list = platform() === 'windows' ? await globalThis.electronAPI.discover() : (await globalThis.Capacitor.Plugins.PrinterNet.discover()).printers;
    if (!list.length) { c.className = 'conn err'; c.textContent = 'Aucune Centauri Carbon trouvée.'; return; }
    const p = list[0];
    Object.assign(state.net.cc, { host: p.ip, mainboardId: p.mainboardId || '' });
    save(); fillForm();
    c.className = 'conn ok'; c.textContent = `Trouvée : ${p.name || 'Centauri Carbon'} (${p.ip})`;
  } catch (e) { c.className = 'conn err'; c.textContent = e.message; }
});

// ---------------- Tranchage ----------------
function invalidate() {
  sliced = null;
  $('#saveBtn').disabled = $('#sendBtn').disabled = true;
  $('#viewLayersBtn').disabled = true;
  if (view === 'layers') setView('model');
  $('#stLayers').textContent = $('#stTime').textContent = $('#stFil').textContent = '—';
}
let worker = null;
try { worker = new Worker('worker.js'); } catch { worker = null; }
function runSlice(payload) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      try { resolve(sliceSync(payload.pattern, payload.printerId, payload.print, payload.fil, { thumbnails: payload.thumbnails, canvas: payload.canvas })); } catch (e) { reject(e); }
      return;
    }
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') progress(e.data.value);
      else if (e.data.type === 'done') resolve(e.data.result);
      else if (e.data.type === 'error') reject(new Error(e.data.message));
    };
    worker.onerror = (e) => { worker = null; reject(new Error(e.message || 'Erreur du trancheur')); };
    worker.postMessage(payload);
  });
}
$('#sliceBtn').addEventListener('click', doSlice);
async function doSlice() {
  if (!pattern.length) return null;
  if (!checkFit()) { log('Pièce trop grande pour le plateau.', 'err'); return null; }
  $('#sliceBtn').disabled = true;
  progress(0);
  const t0 = performance.now();
  try {
    const thumbs = PRINTERS[state.printer].thumbnails.map(([w, h]) => ({ w, h, base64: thumbnail(w, h) }));
    sliced = await runSlice({ pattern, printerId: state.printer, print: printParams(), fil: state.fil[state.printer], thumbnails: thumbs, canvas: svgCanvas() });
    if (sliced.stats.tools && sliced.stats.tools.length > 1) log(`Changement de filament CANVAS au début du motif : emplacement ${sliced.stats.tools[0] + 1} → ${sliced.stats.tools[1] + 1}.`);
    const s = sliced.stats;
    $('#stLayers').textContent = `${s.layers} · ${s.maxZ.toFixed(1)} mm`;
    $('#stTime').textContent = fmtTime(s.timeSec);
    $('#stFil').textContent = `${s.grams.toFixed(1)} g · ${(s.filamentMM / 1000).toFixed(2)} m`;
    if (s.lostIslands) log(`${s.lostIslands} détail(s) plus fin(s) que la largeur d'extrusion ignoré(s) : épaississez les traits.`, 'err');
    log(`Tranchage terminé en ${((performance.now() - t0) / 1000).toFixed(1)} s.`, 'ok');
    $('#saveBtn').disabled = $('#sendBtn').disabled = false;
    $('#viewLayersBtn').disabled = false;
    $('#layerSlider').max = sliced.preview.length - 1;
    layerIdx = sliced.preview.length - 1;
    $('#layerSlider').value = layerIdx;
    setView('layers');
    if (window.innerWidth < 960) $('.stage').scrollIntoView({ behavior: 'smooth' });
    return sliced;
  } catch (e) {
    log(`Erreur de tranchage : ${e.message}`, 'err');
    return null;
  } finally { $('#sliceBtn').disabled = false; progress(null); }
}
const fileBase = () => (svgName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'motif');
const gcodeName = () => `${fileBase()}_${state.part.polarity === 'negative' ? 'neg' : 'pos'}_${state.printer.toUpperCase()}.gcode`;

// Enregistre un fichier texte selon la plateforme (G-code ou SVG). Renvoie un message ou null.
async function saveText(name, content, mime) {
  const p = platform();
  if (p === 'windows') {
    const r = await globalThis.electronAPI.saveFile(name, content);
    return r ? `Enregistré : ${r}` : null;
  }
  if (p === 'android') {
    const { Filesystem, Share } = globalThis.Capacitor.Plugins;
    const res = await Filesystem.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
    await Share.share({ title: name, files: [res.uri], dialogTitle: 'Enregistrer ou partager le fichier' });
    return null;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime || 'text/plain' }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return `Enregistré : ${name}`;
}

$('#saveBtn').addEventListener('click', async () => {
  if (!sliced) return;
  try {
    const m = await saveText(gcodeName(), sliced.gcode, 'text/plain');
    if (m) log(m.replace('Enregistré', 'G-code enregistré'), 'ok');
  } catch (e) { log(`Enregistrement impossible : ${e.message}`, 'err'); }
});

$('#sendBtn').addEventListener('click', async () => {
  const net = state.net[state.printer];
  if (!net.host) { log("Saisissez l'adresse IP de l'imprimante (étape 2).", 'err'); return; }
  if (!sliced && !(await doSlice())) return;
  $('#sendBtn').disabled = true;
  progress(0);
  try {
    await sendToPrinter(state.printer, {
      host: net.host, port: net.port ? +net.port : 0, mainboardId: net.mainboardId,
      filename: gcodeName(), gcode: sliced.gcode, start: state.startAfter,
      autoLevel: state.autoLevel, timelapse: false,
      log: (m) => log(m), onProgress: progress,
    });
    log(state.startAfter ? 'Impression lancée sur l’imprimante.' : 'Fichier envoyé.', 'ok');
  } catch (e) {
    log(e.message, 'err');
  } finally { $('#sendBtn').disabled = false; setTimeout(() => progress(null), 800); }
});

// ---------------- Rendu ----------------
const canvas = $('#view');
const ctx = canvas.getContext('2d');
let peiPattern = null;
function makePei() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#b8924a'; x.fillRect(0, 0, 64, 64);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    x.fillStyle = rnd() > 0.5 ? 'rgba(255,240,200,.16)' : 'rgba(70,45,10,.16)';
    x.fillRect(rnd() * 64, rnd() * 64, 1.2, 1.2);
  }
  return ctx.createPattern(c, 'repeat');
}
function viewport() {
  const P = PRINTERS[state.printer];
  const W = canvas.width, H = canvas.height;
  let x0 = -8, y0 = -8, x1 = P.bed.x + 8, y1 = P.bed.y + 8;
  const b = partBounds();
  if (zoomPart && b) { const m = Math.max(6, (b.x1 - b.x0) * 0.08); x0 = b.x0 - m; y0 = b.y0 - m; x1 = b.x1 + m; y1 = b.y1 + m; }
  const k = Math.min(W / (x1 - x0), H / (y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (H + (y1 - y0) * k) / 2 + y0 * k;
  return { k, X: (x) => ox + x * k, Y: (y) => oy - y * k };
}
function tracePaths(paths, vp) {
  ctx.beginPath();
  for (const p of paths) {
    p.forEach((q, i) => { const x = vp.X(q.X / SCALE), y = vp.Y(q.Y / SCALE); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  }
}
function draw() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(10, Math.round(r.width * dpr)); canvas.height = Math.max(10, Math.round(r.height * dpr));
  if (!peiPattern) peiPattern = makePei();
  const P = PRINTERS[state.printer];
  const vp = viewport();
  ctx.fillStyle = '#2a2f35'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Plateau PEI
  ctx.save();
  ctx.fillStyle = peiPattern;
  ctx.beginPath(); ctx.rect(vp.X(0), vp.Y(P.bed.y), P.bed.x * vp.k, P.bed.y * vp.k); ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,10,.25)'; ctx.lineWidth = 1;
  const step = vp.k * 10 < 14 ? 50 : 10;
  ctx.beginPath();
  for (let x = step; x < P.bed.x; x += step) { ctx.moveTo(vp.X(x), vp.Y(0)); ctx.lineTo(vp.X(x), vp.Y(P.bed.y)); }
  for (let y = step; y < P.bed.y; y += step) { ctx.moveTo(vp.X(0), vp.Y(y)); ctx.lineTo(vp.X(P.bed.x), vp.Y(y)); }
  ctx.stroke();
  ctx.restore();

  if (view === 'layers' && sliced) return drawLayer(vp);
  if (!pattern.length) return;
  const pp = printParams();
  const shadow = Math.max(1, vp.k * 0.6);
  if (pp.polarity === 'negative') {
    if (pp.plateThickness > 0) { ctx.fillStyle = '#0f6f73'; tracePaths(plate, vp); ctx.fill('evenodd'); }
    // surface supérieure (plaque moins motif)
    ctx.save(); ctx.fillStyle = '#26a7ac';
    ctx.beginPath(); tracePathsInto(plate.concat(pattern), vp); ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,40,42,.55)'; ctx.lineWidth = Math.max(1, vp.k * 0.25); tracePaths(pattern, vp); ctx.stroke();
  } else {
    if (plate.length) { ctx.fillStyle = '#1b8d92'; tracePaths(plate, vp); ctx.fill('evenodd'); }
    ctx.save(); ctx.translate(shadow, shadow); ctx.fillStyle = 'rgba(0,30,32,.45)'; tracePaths(pattern, vp); ctx.fill('evenodd'); ctx.restore();
    ctx.fillStyle = '#3cc3c8'; tracePaths(pattern, vp); ctx.fill('evenodd');
  }
}
function tracePathsInto(paths, vp) {
  for (const p of paths) {
    p.forEach((q, i) => { const x = vp.X(q.X / SCALE), y = vp.Y(q.Y / SCALE); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  }
}
const MOVE_COL = { outer: '#f2f6f7', inner: '#7fdde0', infill: '#25a5aa' };
function drawLayer(vp) {
  const L = sliced.preview;
  const lw = Math.max(0.6, printParams().lineWidth * vp.k * 0.9);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (layerIdx > 0) {
    ctx.strokeStyle = 'rgba(20,60,62,.55)'; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const m of L[layerIdx - 1].moves) m.pts.forEach(([x, y], i) => (i ? ctx.lineTo(vp.X(x), vp.Y(y)) : ctx.moveTo(vp.X(x), vp.Y(y))));
    ctx.stroke();
  }
  for (const t of ['infill', 'inner', 'outer']) {
    ctx.strokeStyle = MOVE_COL[t]; ctx.lineWidth = lw * (t === 'infill' ? 0.85 : 1);
    ctx.beginPath();
    for (const m of L[layerIdx].moves) if (m.t === t) m.pts.forEach(([x, y], i) => (i ? ctx.lineTo(vp.X(x), vp.Y(y)) : ctx.moveTo(vp.X(x), vp.Y(y))));
    ctx.stroke();
  }
  const l = L[layerIdx];
  $('#layerLabel').textContent = `${layerIdx + 1}/${L.length} · ${l.z.toFixed(2)} mm`;
}
function setView(v) {
  view = v;
  $$('.stage .seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $('#layerBar').hidden = v !== 'layers';
  draw();
}
$$('.stage .seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('#layerSlider').addEventListener('input', (e) => { layerIdx = +e.target.value; draw(); });
$('#zoomBtn').addEventListener('click', () => { zoomPart = !zoomPart; $('#zoomBtn').textContent = zoomPart ? 'Plateau entier' : 'Zoom sur la pièce'; draw(); });
new ResizeObserver(() => draw()).observe($('#canvasWrap'));

// Vignette pour l'écran de l'imprimante
function thumbnail(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const b = partBounds();
  const k = Math.min((w * 0.9) / (b.x1 - b.x0), (h * 0.9) / (b.y1 - b.y0));
  const ox = (w - (b.x1 - b.x0) * k) / 2 - b.x0 * k, oy = (h + (b.y1 - b.y0) * k) / 2 + b.y0 * k;
  const tr = (paths) => { x.beginPath(); for (const p of paths) { p.forEach((q, i) => { const X = ox + (q.X / SCALE) * k, Y = oy - (q.Y / SCALE) * k; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.closePath(); } };
  const neg = state.part.polarity === 'negative';
  if (plate.length) { x.fillStyle = neg ? '#0f6f73' : '#1b8d92'; tr(plate); x.fill('evenodd'); }
  if (neg) { x.fillStyle = '#3cc3c8'; tr(plate.concat(pattern)); x.fill('evenodd'); }
  else { x.fillStyle = '#3cc3c8'; tr(pattern); x.fill('evenodd'); }
  return c.toDataURL('image/png').split(',')[1];
}

// ---------------- Onglet Modèle 3D ----------------
let m3 = null;
function setPrinter(p) {
  state.printer = p; save(); fillForm(); rebuild();
  if (m3) m3.onPrinterChange();
}
m3 = initModel3D({ state, save, saveText, sendToPrinter, testPrinter, ccCanvas, setPrinter });
globalThis.__m3 = m3;

// ---------------- Onglets : Vectoriser / Imprimer / Surveiller ----------------
const TAB_STORE = 'svg2print.tab';
function showTab(t) {
  if (t === 'monitor') { openMonitor(); return; }
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('#vectorView').hidden = t !== 'vector';
  $('#printView').hidden = t !== 'print';
  $('#modelView').hidden = t !== 'model';
  if (t === 'model') m3.show();
  if (t === 'vector' && !$('#vectorFrame').src) $('#vectorFrame').src = 'vector.html';
  if (t === 'print') requestAnimationFrame(draw);
  try { localStorage.setItem(TAB_STORE, t); } catch {}
}
async function openMonitor() {
  try { await globalThis.Capacitor.Plugins.PrinterNet.openMonitor(); }
  catch (e) { log(`Surveillance indisponible : ${e.message}`, 'err'); }
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#monitorTab').hidden = platform() !== 'android';
$('#toVectorBtn').addEventListener('click', () => showTab('vector'));

// Messages venant de l'outil de vectorisation (cadre vector.html)
const toVector = (text) => $('#vectorFrame').contentWindow?.postMessage({ source: 'svg2print', type: 'toast', text }, '*');
window.addEventListener('message', async (e) => {
  const d = e.data;
  if (!d || d.source !== 'trait-fin' || e.source !== $('#vectorFrame').contentWindow) return;
  if (d.type === 'save') {
    try { const m = await saveText(d.name, d.svg, 'image/svg+xml'); if (m) toVector(m); }
    catch (err) { toVector(`Enregistrement impossible : ${err.message}`); }
  } else if (d.type === 'print') {
    // Le tracé central donne des traits : lecture en mode « parcours » pour les imprimer en lignes
    state.xf.mode = d.mode === 'center' ? 'stroke' : 'auto';
    await openFile(new File([d.svg], `${d.name}.svg`, { type: 'image/svg+xml' }));
    showTab('print');
    log(`Dessin vectorisé « ${d.name} » chargé. Ajustez la taille et la largeur des traits.`, 'ok');
  }
});

// ---------------- Démarrage ----------------
$('#fileInput').addEventListener('change', (e) => openFile(e.target.files[0]));
$('#openBtn').addEventListener('click', () => $('#fileInput').click());
$('#openBtn2').addEventListener('click', () => $('#fileInput').click());
const wrap = $('#canvasWrap');
wrap.addEventListener('dragover', (e) => e.preventDefault());
wrap.addEventListener('drop', (e) => { e.preventDefault(); openFile(e.dataTransfer.files[0]); });
fillForm();
draw();
let startTab = 'print';
try { startTab = localStorage.getItem(TAB_STORE) || 'print'; } catch {}
showTab(['vector', 'model'].includes(startTab) ? startTab : 'print');
