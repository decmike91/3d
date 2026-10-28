// Onglet « Modèle 3D » : import STL/3MF/OBJ, orientation solidité, supports automatiques,
// filaments (PLA HS, PETG HS, TPU, nylon), multifilament CANVAS (Centauri Carbon), tranchage CuraEngine.
import { PRINTERS } from '../core/profiles.js';
import { fmtTime } from '../core/gcode.js';
import { MATERIALS, MATERIAL_IDS, materialProfile } from '../core/materials.js';
import { readModelFile, SUPPORTED } from './mesh.js';
import { autoOrient, arrange, m3mul, rotAxis } from './orient.js';
import { makeObject, worldParts, objectSize, prepareSlice } from './job.js';
import { defaultJob, QUALITY } from './settings.js';
import { postProcess, parsePreview, KINDS } from './post.js';
import { createViewer } from './viewer.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const STORE = 'svg2print.3d.v1';
const DEFAULT_SLOTS = [
  { mat: 'pla_hs', color: '#F2F2F2' },
  { mat: 'pla_hs', color: '#202020' },
  { mat: 'pla_hs', color: '#D23A2A' },
  { mat: 'petg_hs', color: '#2F6FD0' },
];
const MAT_OF_TYPE = (t) => (/TPU/i.test(t) ? 'tpu' : /PA|NYLON/i.test(t) ? 'nylon' : /PETG|PET/i.test(t) ? 'petg_hs' : /PLA/i.test(t) ? 'pla_hs' : null);

export function initModel3D(ctx) {
  const { state } = ctx;
  let st = { job: defaultJob(state.printer), canvas: false, slots: DEFAULT_SLOTS.map((s) => ({ ...s })), startAfter: true, autoLevel: true };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.job) st = { ...st, ...saved, job: { ...st.job, ...saved.job }, slots: (saved.slots || st.slots).slice(0, 4).map((s, i) => ({ ...DEFAULT_SLOTS[i], ...s })) };
  } catch { /* défaut */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ job: st.job, canvas: st.canvas, slots: st.slots.map(({ mat, color }) => ({ mat, color })), startAfter: st.startAfter, autoLevel: st.autoLevel })); } catch { /* */ } };

  let objects = [];
  let selected = null;
  let sliced = null;
  let canvasRead = null; // plateaux lus sur l'imprimante
  let viewer = null;
  let busy = false;

  const printer = () => state.printer;
  const P = () => PRINTERS[printer()];
  const canvasOn = () => st.canvas && printer() === 'cc';
  const slotCount = () => (canvasOn() ? 4 : 1);
  const slotFil = (i) => materialProfile(st.slots[i].mat, printer());
  const colorOf = (tool) => st.slots[canvasOn() ? Math.min(3, tool) : 0].color;

  // ---------- Journal ----------
  function log(msg, cls) {
    const li = document.createElement('li');
    li.textContent = msg;
    if (cls) li.className = cls;
    $('#m3Log').prepend(li);
  }
  function progress(f) {
    const el = $('#m3Progress');
    el.hidden = f == null;
    if (f != null) el.firstElementChild.style.width = `${Math.round(f * 100)}%`;
  }
  function setBusy(text) {
    busy = !!text;
    $('#m3Busy').hidden = !text;
    if (text) $('#m3BusyText').textContent = text;
    $('#m3Slice').disabled = !objects.length || busy;
  }

  // ---------- Vue 3D ----------
  let viewerFailed = false;
  function ensureViewer() {
    if (viewer || viewerFailed) return viewer;
    try {
      viewer = createViewer($('#m3Canvas'), {
        onSelect: (id) => { selected = id; renderList(); viewer.select(id); },
        onMove: (id, dx, dy) => {
          const o = objects.find((x) => x.id === id);
          if (!o) return;
          o.x += dx; o.y += dy;
          clampOnBed(o);
          invalidate(); refreshView();
        },
      });
      viewer.setBed(P().bed);
      viewer.resetCamera();
    } catch (e) {
      viewerFailed = true;
      viewer = null;
      addWarn('Aperçu 3D indisponible sur cet appareil (WebGL) : le tranchage reste possible.');
    }
    return viewer;
  }
  function clampOnBed(o) {
    const s = objectSize(o), b = P().bed;
    o.x = Math.min(b.x - s.w / 2, Math.max(s.w / 2, o.x));
    o.y = Math.min(b.y - s.d / 2, Math.max(s.d / 2, o.y));
  }
  function refreshView() {
    $('#m3Empty').hidden = objects.length > 0;
    $('#m3Slice').disabled = !objects.length || busy;
    updateDims();
    if (!viewer) return;
    viewer.setObjects(objects.map((o) => {
      const w = worldParts(o);
      return { id: o.id, parts: o.parts.map((p, k) => ({ positions: w.parts[k], color: colorOf(p.tool) })) };
    }), { overhangAngle: $('#m3Over').checked ? st.job.supportAngle : null });
    viewer.select(selected);
    $('#m3Empty').hidden = objects.length > 0;
    $('#m3Slice').disabled = !objects.length || busy;
    updateDims();
  }
  function updateDims() {
    if (!objects.length) { $('#m3Stats').hidden = true; return; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, h = 0;
    for (const o of objects) {
      const s = objectSize(o);
      x0 = Math.min(x0, o.x - s.w / 2); x1 = Math.max(x1, o.x + s.w / 2);
      y0 = Math.min(y0, o.y - s.d / 2); y1 = Math.max(y1, o.y + s.d / 2); h = Math.max(h, s.h);
    }
    $('#m3Dim').textContent = `${(x1 - x0).toFixed(0)} × ${(y1 - y0).toFixed(0)} × ${h.toFixed(0)} mm`;
    $('#m3Stats').hidden = false;
    const sel = objects.find((o) => o.id === selected);
    $('#m3ObjTools').hidden = !sel;
    $('#m3ScaleRow').hidden = !sel;
    if (sel) {
      const s = objectSize(sel);
      $('#m3Scale').value = Math.round(sel.scale * 1000) / 10;
      $('#m3Size').value = `${s.w.toFixed(1)} × ${s.d.toFixed(1)} × ${s.h.toFixed(1)}`;
    }
  }

  // ---------- Liste des objets ----------
  function renderList() {
    const ul = $('#m3Objects');
    ul.innerHTML = '';
    for (const o of objects) {
      const li = document.createElement('li');
      li.className = o.id === selected ? 'on' : '';
      const tools = [...new Set(o.parts.map((p) => p.tool))];
      const sw = document.createElement('span');
      sw.className = 'sw';
      sw.style.background = colorOf(tools[0]);
      const nm = document.createElement('span');
      nm.className = 'nm';
      const s = objectSize(o);
      nm.innerHTML = `${escapeHtml(o.name)}<small>${s.w.toFixed(0)}×${s.d.toFixed(0)}×${s.h.toFixed(0)} mm · ${o.parts.reduce((a, p) => a + p.triangles, 0).toLocaleString('fr-FR')} triangles</small>`;
      li.append(sw, nm);
      if (canvasOn()) {
        const sel = document.createElement('select');
        sel.title = 'Emplacement CANVAS';
        if (tools.length > 1) sel.append(new Option('Mixte', 'mix'));
        for (let i = 0; i < 4; i++) sel.append(new Option(`Filament ${i + 1}`, String(i)));
        sel.value = tools.length > 1 ? 'mix' : String(Math.min(3, tools[0]));
        sel.addEventListener('click', (e) => e.stopPropagation());
        sel.addEventListener('change', () => {
          if (sel.value === 'mix') return;
          for (const p of o.parts) p.tool = +sel.value;
          invalidate(); renderList(); refreshView();
        });
        li.append(sel);
      } else li.append(document.createElement('span'));
      const del = document.createElement('button');
      del.className = 'x'; del.textContent = '✕'; del.title = 'Retirer';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        objects = objects.filter((x) => x !== o);
        if (selected === o.id) selected = null;
        invalidate(); renderList(); refreshView();
      });
      li.append(del);
      li.addEventListener('click', () => { selected = selected === o.id ? null : o.id; renderList(); if (viewer) viewer.select(selected); updateDims(); });
      ul.append(li);
    }
    updateDims();
  }
  const escapeHtml = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Import ----------
  async function openFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    ensureViewer();
    const warn = $('#m3Warn');
    warn.innerHTML = '';
    setBusy('Lecture des fichiers…');
    let multiTools = false;
    try {
      for (const f of files) {
        const e = (/\.([a-z0-9]+)$/i.exec(f.name) || [])[1]?.toLowerCase();
        if (!SUPPORTED.includes(e)) { addWarn(`${f.name} : format non pris en charge (STL, 3MF, OBJ).`); continue; }
        try {
          const r = await readModelFile(f);
          r.warnings.forEach(addWarn);
          for (const src of r.objects) {
            const o = makeObject(src);
            const s = objectSize(o);
            if (Math.max(s.w, s.d, s.h) < 3) addWarn(`${o.name} : très petit (${Math.max(s.w, s.d, s.h).toFixed(2)} mm) — fichier en pouces ? Échelle 2540 %.`);
            if (o.parts.some((p) => p.tool > 0)) multiTools = true;
            objects.push(o);
          }
          if (r.filaments && r.filaments.length) {
            r.filaments.slice(0, 4).forEach((fl, i) => {
              if (/^#[0-9a-f]{6}$/i.test(fl.color)) st.slots[i].color = fl.color.toUpperCase();
              const m = MAT_OF_TYPE(fl.type);
              if (m) st.slots[i].mat = m;
            });
          }
          log(`${f.name} : ${r.objects.length} objet(s) chargé(s).`);
        } catch (err) { addWarn(`${f.name} : ${err.message}`); }
      }
      if (multiTools && printer() === 'cc' && !st.canvas) {
        st.canvas = true;
        log('Ce projet utilise plusieurs filaments : multifilament CANVAS activé.', 'ok');
      }
      autoArrange(false);
      save(); renderSlots(); renderList(); refreshView();
    } finally { setBusy(null); $('#m3Slice').disabled = !objects.length; }
  }
  function addWarn(m) { const li = document.createElement('li'); li.textContent = m; $('#m3Warn').append(li); }

  // ---------- Placement ----------
  function reservedTower() { return canvasOn() && st.job.primeTower && usedTools().length > 1 ? { w: 40 } : null; }
  function usedTools() { return [...new Set(objects.flatMap((o) => o.parts.map((p) => (canvasOn() ? p.tool : 0))))]; }
  function autoArrange(logIt = true) {
    if (!objects.length) return;
    const r = arrange(objects.map(objectSize), P().bed, 8, reservedTower());
    objects.forEach((o, i) => { o.x = r.positions[i].x; o.y = r.positions[i].y; clampOnBed(o); });
    if (!r.fits) addWarn('Tous les objets ne tiennent pas sur le plateau : réduisez l’échelle ou retirez-en.');
    else if (logIt) log('Objets placés automatiquement.');
    invalidate(); refreshView();
  }
  function orient() {
    const targets = selected ? objects.filter((o) => o.id === selected) : objects;
    if (!targets.length) return;
    setBusy('Recherche de la meilleure orientation…');
    setTimeout(() => {
      try {
        const infos = [];
        for (const o of targets) {
          const cur = o.parts.map((p) => { const a = new Float32Array(p.positions.length); for (let i = 0; i < a.length; i += 3) { const x = p.positions[i] * o.scale, y = p.positions[i + 1] * o.scale, z = p.positions[i + 2] * o.scale; const m = o.rot; a[i] = m[0] * x + m[1] * y + m[2] * z; a[i + 1] = m[3] * x + m[4] * y + m[5] * z; a[i + 2] = m[6] * x + m[7] * y + m[8] * z; } return a; });
          const r = autoOrient(cur, { mode: st.job.orientMode, supportAngle: st.job.supportAngle, bedZ: P().bed.z });
          o.rot = m3mul(r.matrix, o.rot);
          if (r.info) infos.push(r.info);
        }
        autoArrange(false);
        const i0 = infos[0];
        $('#m3OrientInfo').textContent = i0
          ? (st.job.orientMode === 'strength'
            ? `Orientation solidité : ${i0.strengthAligned ? 'grande dimension à plat, couches dans le sens des efforts' : 'pièce compacte, couches au mieux'} · surplombs ${i0.overhangPct} % de la surface.`
            : `Orientation « moins de supports » : surplombs ${i0.overhangPct} % de la surface.`)
          : '';
        log(`${targets.length} objet(s) orienté(s) (${st.job.orientMode === 'strength' ? 'solidité' : 'moins de supports'}).`);
      } finally { setBusy(null); }
    }, 30);
  }

  // ---------- Filaments / CANVAS ----------
  function renderSlots() {
    const isCC = printer() === 'cc';
    $('#m3CanvasRow').hidden = !isCC;
    $('#m3Canvas').checked = canvasOn();
    $('#m3CanvasTools').hidden = !canvasOn();
    $('#m3FlushRow').hidden = !canvasOn();
    $('#m3LevelRow').hidden = !isCC;
    const box = $('#m3Slots');
    box.innerHTML = '';
    for (let i = 0; i < slotCount(); i++) {
      const row = document.createElement('div');
      row.className = 'slot';
      const b = document.createElement('b'); b.textContent = canvasOn() ? i + 1 : '◉';
      const sel = document.createElement('select');
      for (const id of MATERIAL_IDS) {
        const m = MATERIALS[id];
        const o = new Option(m.label + (canvasOn() && m.canvas === false ? ' — hors CANVAS' : ''), id);
        sel.append(o);
      }
      sel.value = st.slots[i].mat;
      sel.addEventListener('change', () => { st.slots[i].mat = sel.value; save(); invalidate(); renderSlots(); });
      const col = document.createElement('input');
      col.type = 'color'; col.value = st.slots[i].color;
      col.title = 'Couleur du filament';
      col.addEventListener('input', () => { st.slots[i].color = col.value.toUpperCase(); save(); invalidate(); renderList(); refreshView(); });
      row.append(b, sel, col);
      const f = slotFil(i);
      const info = document.createElement('small');
      const tray = canvasRead && canvasRead[i];
      info.textContent = `Buse ${f.nozzle} °C · plateau ${f.bed} °C · ${f.fan} % ventilateur` + (tray ? ` · CANVAS : ${tray.loaded ? `${tray.brand} ${tray.type || tray.name}`.trim() : 'vide'}` : '');
      row.append(info);
      box.append(row);
    }
    // Avertissements matière
    const w = $('#m3MatWarn');
    w.innerHTML = '';
    const used = canvasOn() ? usedTools() : [0];
    const mats = [...new Set(used.map((t) => st.slots[Math.min(t, slotCount() - 1)].mat))];
    for (const m of mats) for (const n of MATERIALS[m].notes) { const li = document.createElement('li'); li.textContent = n; w.append(li); }
    if (canvasOn() && used.some((t) => MATERIALS[st.slots[t].mat].canvas === false)) {
      const li = document.createElement('li'); li.textContent = 'Le TPU ne passe pas dans le CANVAS : choisissez une autre matière pour ces objets.'; w.append(li);
    }
    if (printer() === 'k1' && st.canvas) {
      const li = document.createElement('li'); li.textContent = 'Le multifilament CANVAS n’existe que sur les Elegoo : impression en un seul filament sur la K1.'; w.append(li);
    }
  }
  async function readCanvas() {
    const net = state.net.cc;
    if (!net.host) { log("Saisissez l'adresse IP de la Centauri Carbon.", 'err'); return; }
    log('Lecture du CANVAS…');
    try {
      const r = await ctx.ccCanvas(net.host, net.mainboardId, (m) => log(m));
      if (r.mainboard && !net.mainboardId) { net.mainboardId = r.mainboard; ctx.save(); }
      if (!r.trays.length) { log('Aucun CANVAS connecté à cette imprimante.', 'err'); canvasRead = null; renderSlots(); return; }
      canvasRead = r.trays.slice(0, 4);
      canvasRead.forEach((t, i) => {
        if (!t.loaded) return;
        if (t.color) st.slots[i].color = t.color.toUpperCase();
        const m = MAT_OF_TYPE(t.type || t.name);
        if (m) st.slots[i].mat = m;
      });
      save(); invalidate(); renderSlots(); renderList(); refreshView();
      log(`CANVAS lu : ${canvasRead.filter((t) => t.loaded).length} emplacement(s) chargé(s). Couleurs et matières reprises.`, 'ok');
    } catch (e) { log(`Lecture du CANVAS impossible : ${e.message}`, 'err'); }
  }

  // ---------- Réglages ----------
  function fillJob() {
    for (const el of $$('[data-j]')) {
      const v = st.job[el.dataset.j];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    }
    $$('#m3Quality button').forEach((b) => b.classList.toggle('on', b.dataset.q === st.job.quality));
    $$('#m3OrientSeg button').forEach((b) => b.classList.toggle('on', b.dataset.orient === st.job.orientMode));
    $$('#m3PrinterSeg button').forEach((b) => b.classList.toggle('on', b.dataset.printer === printer()));
    $('#m3Start').checked = st.startAfter;
    $('#m3Level').checked = st.autoLevel;
  }
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.j) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? parseFloat(el.value) : el.value;
    if (el.type === 'number' && !Number.isFinite(v)) return;
    st.job[el.dataset.j] = v;
    if (['layerHeight', 'walls', 'infill', 'pattern', 'topLayers', 'bottomLayers'].includes(el.dataset.j)) st.job.quality = 'custom';
    save(); fillJob(); invalidate();
    if (['support', 'supportAngle'].includes(el.dataset.j)) refreshView();
  });
  $('#m3Quality').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const q = QUALITY[b.dataset.q];
    Object.assign(st.job, { quality: b.dataset.q, layerHeight: q.layerHeight, walls: q.walls, topLayers: q.topLayers, bottomLayers: q.bottomLayers, infill: q.infill, pattern: q.pattern });
    save(); fillJob(); invalidate();
  });
  $('#m3OrientSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    st.job.orientMode = b.dataset.orient; save(); fillJob();
  });
  $('#m3PrinterSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ctx.setPrinter(b.dataset.printer);
  });
  $('#m3Canvas').addEventListener('change', (e) => { st.canvas = e.target.checked; save(); invalidate(); renderSlots(); renderList(); refreshView(); });
  $('#m3ReadCanvas').addEventListener('click', readCanvas);
  $('#m3Start').addEventListener('change', (e) => { st.startAfter = e.target.checked; save(); });
  $('#m3Level').addEventListener('change', (e) => { st.autoLevel = e.target.checked; save(); });
  $('#m3Over').addEventListener('change', refreshView);
  $('#m3Cam').addEventListener('click', () => viewer && viewer.resetCamera());
  $('#m3Orient').addEventListener('click', orient);
  $('#m3Arrange').addEventListener('click', () => autoArrange(true));
  $('#m3Open').addEventListener('click', () => $('#m3File').click());
  $('#m3Open2').addEventListener('click', () => $('#m3File').click());
  $('#m3File').addEventListener('change', (e) => { openFiles(e.target.files); e.target.value = ''; });
  const wrap = $('#m3Wrap');
  wrap.addEventListener('dragover', (e) => e.preventDefault());
  wrap.addEventListener('drop', (e) => { e.preventDefault(); openFiles(e.dataTransfer.files); });
  $('#m3ObjTools').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rot]'); if (!b) return;
    const o = objects.find((x) => x.id === selected); if (!o) return;
    o.rot = m3mul(rotAxis(b.dataset.rot, 90), o.rot);
    clampOnBed(o); invalidate(); renderList(); refreshView();
  });
  $('#m3Scale').addEventListener('change', (e) => {
    const o = objects.find((x) => x.id === selected); const v = parseFloat(e.target.value);
    if (!o || !(v > 0)) return;
    o.scale = v / 100; clampOnBed(o); invalidate(); renderList(); refreshView();
  });
  $('#m3Test').addEventListener('click', async () => {
    const net = state.net[printer()];
    const c = $('#m3Conn');
    if (!net.host) { c.className = 'conn err'; c.textContent = "Saisissez l'adresse IP de l'imprimante."; return; }
    c.className = 'conn'; c.textContent = 'Connexion…';
    try {
      const r = await ctx.testPrinter(printer(), { ...net, port: net.port ? +net.port : 0 }, (m) => log(m));
      if (r.mainboard && !net.mainboardId) { net.mainboardId = r.mainboard; ctx.save(); }
      c.className = 'conn ok'; c.textContent = `Connectée — ${r.state}`;
    } catch (err) { c.className = 'conn err'; c.textContent = err.message; }
  });

  // ---------- Tranchage ----------
  function invalidate() {
    sliced = null;
    $('#m3Save').disabled = $('#m3Send').disabled = true;
    $('#m3PathsBtn').disabled = true;
    if (viewer && viewer.showingPaths) { viewer.setToolpaths(null); setView('model'); }
    $('#m3Layers').textContent = $('#m3Time').textContent = $('#m3Fil').textContent = '—';
    $('#m3Legend').hidden = true;
  }
  let enginePromise = null;
  function loadEngine() {
    if (globalThis.Engine3D) return Promise.resolve(globalThis.Engine3D);
    if (!enginePromise) {
      enginePromise = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'engine3d.js';
        s.onload = () => (globalThis.Engine3D ? res(globalThis.Engine3D) : rej(new Error('moteur 3D introuvable')));
        s.onerror = () => { enginePromise = null; rej(new Error('chargement du moteur 3D impossible')); };
        document.head.append(s);
      });
    }
    return enginePromise;
  }
  async function doSlice() {
    if (!objects.length || busy) return null;
    $('#m3Warn').innerHTML = '';
    setBusy('Préparation…');
    $('#m3Slice').disabled = true;
    progress(0);
    const t0 = performance.now();
    try {
      const engine = await loadEngine();
      const slots = st.slots.slice(0, 4).map((s, i) => ({ fil: slotFil(i), color: s.color, slot: i }));
      const prep = prepareSlice(objects, { ...st.job, printer: printer() }, slots, canvasOn());
      prep.warnings.forEach(addWarn);
      if (viewer) viewer.setBed(P().bed, prep.primeTower);
      const thumbs = [];
      if (viewer) for (const [w, h] of P().thumbnails) { const b64 = viewer.thumbnail(w, h); if (b64) thumbs.push({ w, h, base64: b64 }); }
      setBusy('Tranchage (CuraEngine)…');
      const res = await engine.sliceCura({ definition: prep.definition, command: prep.command, files: prep.files, onProgress: (p) => { const f = Math.max(0, Math.min(1, p > 1 ? p / 100 : p)); progress(f * 0.95); $('#m3BusyText').textContent = `Tranchage… ${Math.round(f * 100)} %`; } });
      setBusy('Finalisation…');
      const post = postProcess(res.gcode, { printerId: printer(), tools: prep.tools, metadata: res.metadata, thumbnails: thumbs, flushMultiplier: st.job.flushMultiplier });
      const pv = parsePreview(post.gcode);
      sliced = { gcode: post.gcode, stats: post.stats, tools: prep.tools, preview: pv, printer: printer() };
      const s = post.stats;
      $('#m3Layers').textContent = `${s.layers} · ${st.job.layerHeight} mm`;
      $('#m3Time').textContent = fmtTime(s.timeSec);
      $('#m3Fil').textContent = `${s.grams.toFixed(0)} g`;
      if (s.perTool.length > 1) {
        log(`Filaments : ${s.perTool.map((t) => `n° ${t.slot + 1} ${t.g.toFixed(1)} g`).join(' · ')} · ${s.changes} changements.`);
      }
      log(`Tranché en ${((performance.now() - t0) / 1000).toFixed(1)} s : ${s.layers} couches, ${fmtTime(s.timeSec)}, ${s.grams.toFixed(1)} g.`, 'ok');
      $('#m3Save').disabled = $('#m3Send').disabled = false;
      $('#m3PathsBtn').disabled = false;
      setView('paths');
      return sliced;
    } catch (e) {
      log(`Tranchage impossible : ${e.message}`, 'err');
      return null;
    } finally {
      setBusy(null); progress(null);
      $('#m3Slice').disabled = !objects.length;
    }
  }
  function setView(v) {
    $$('[data-m3view]').forEach((b) => b.classList.toggle('on', b.dataset.m3view === v));
    const paths = v === 'paths' && sliced;
    $('#m3LayerBar').hidden = !paths;
    $('#m3Legend').hidden = !paths;
    if (!viewer) return;
    if (paths) {
      const multi = sliced.tools.length > 1;
      viewer.setToolpaths(sliced.preview, { colorBy: multi ? 'tool' : 'type', toolColors: slotColorsBySlot() });
      const n = sliced.preview.layers.length;
      const sl = $('#m3Layer');
      sl.max = String(n - 1); sl.value = String(n - 1);
      layerLabel(n - 1);
      legend(multi);
    } else viewer.setToolpaths(null);
  }
  const slotColorsBySlot = () => { const c = []; for (const t of sliced.tools) c[t.slot] = t.color; return c; };
  function layerLabel(i) {
    const L = sliced.preview.layers[i];
    $('#m3LayerLabel').textContent = `${i + 1}/${sliced.preview.layers.length} · ${L ? L.z.toFixed(2) : '—'} mm`;
  }
  function legend(multi) {
    const items = multi
      ? sliced.tools.map((t) => [t.color, `Filament ${t.slot + 1} · ${t.fil.type}`]).concat([['#b07ad8', 'Tour de purge']])
      : [['#f2a33a', 'Paroi externe'], ['#f6d36b', 'Parois'], ['#d8553a', 'Remplissage'], ['#4a7fd0', 'Dessus/dessous'], ['#2fb36d', 'Supports'], ['#7fd89c', 'Interface support']];
    $('#m3Legend').innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
    void KINDS;
  }
  $('#m3Layer').addEventListener('input', (e) => { const i = +e.target.value; viewer && viewer.setLayer(i); layerLabel(i); });
  $$('[data-m3view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.m3view)));
  $('#m3Slice').addEventListener('click', doSlice);
  const fileName = () => {
    const base = (objects[0]?.name || 'modele').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36) || 'modele';
    const mat = sliced ? [...new Set(sliced.tools.map((t) => t.fil.type))].join('-') : '';
    return `${base}${objects.length > 1 ? `_x${objects.length}` : ''}_${mat}_${printer().toUpperCase()}.gcode`;
  };
  $('#m3Save').addEventListener('click', async () => {
    if (!sliced) return;
    try { const m = await ctx.saveText(fileName(), sliced.gcode, 'text/plain'); if (m) log(m.replace('Enregistré', 'G-code enregistré'), 'ok'); }
    catch (e) { log(`Enregistrement impossible : ${e.message}`, 'err'); }
  });
  $('#m3Send').addEventListener('click', async () => {
    const net = state.net[printer()];
    if (!net.host) { log("Saisissez l'adresse IP de l'imprimante (étape 3).", 'err'); return; }
    if (!sliced || sliced.printer !== printer()) { if (!(await doSlice())) return; }
    $('#m3Send').disabled = true;
    progress(0);
    try {
      // Correspondance filament → plateau du CANVAS (seulement si le CANVAS a été lu)
      let slotMap = [];
      if (canvasOn() && canvasRead) {
        slotMap = sliced.tools.map((t) => canvasRead[t.slot] && { t: t.slot, canvas_id: canvasRead[t.slot].canvas_id, tray_id: canvasRead[t.slot].tray_id }).filter(Boolean);
      }
      await ctx.sendToPrinter(printer(), {
        host: net.host, port: net.port ? +net.port : 0, mainboardId: net.mainboardId,
        filename: fileName(), gcode: sliced.gcode, start: st.startAfter, autoLevel: st.autoLevel, timelapse: false, slotMap,
        log: (m) => log(m), onProgress: progress,
      });
      log(st.startAfter ? 'Impression lancée sur l’imprimante.' : 'Fichier envoyé.', 'ok');
    } catch (e) { log(e.message, 'err'); }
    finally { $('#m3Send').disabled = false; setTimeout(() => progress(null), 800); }
  });

  // ---------- API pour l'application ----------
  fillJob();
  renderSlots();
  return {
    show() { if (ensureViewer()) viewer.resize(); refreshView(); },
    onPrinterChange() {
      fillJob(); renderSlots(); invalidate();
      if (viewer) { viewer.setBed(P().bed); viewer.resetCamera(); }
      for (const o of objects) clampOnBed(o);
      renderList(); refreshView();
    },
    // pour les tests de bout en bout
    _debug: { get objects() { return objects; }, get sliced() { return sliced; }, openFiles, orient, doSlice, st },
  };
}
