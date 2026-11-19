// Onglet « Filaments » : bibliothèque de filaments nommés.
// Mode rapide : seule la vitesse se règle, débit et température sont calculés.
// Mode expert : tous les réglages d'extrusion (températures, débit, vitesses par trajet, rétraction, ventilation),
// à la façon de Cura. Les filaments apparaissent dans les choix des onglets Relief SVG et Modèle 3D.
import {
  MATERIALS, EXPERT_FIELDS, expertDefaults, materialProfile, setCustomFilaments, customFilaments,
  flowForSpeed, speedForFlow, familyOf, LINE_AREA,
} from './materials.js';
import { PRINTERS } from './profiles.js';

const STORE = 'svg2print.filaments.v1';
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fr = (n) => String(n).replace('.', ',');

function read() { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } }
let list = read();
setCustomFilaments(list); // chargé avant la création des sélecteurs des autres onglets

const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); let t = o; for (const k of ks) t = t[k] = t[k] || {}; t[last] = v; };

export function initFilaments({ printer, onChange }) {
  let current = list[0]?.id || null;
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* */ }
    setCustomFilaments(list);
    onChange && onChange();
  };
  const cur = () => list.find((c) => c.id === current) || null;

  // ---------- Liste ----------
  function summary(c) {
    const b = MATERIALS[c.base];
    if (c.mode === 'expert') return `${b ? b.type : ''} · expert · buse ${c.expert?.nozzle ?? '—'} °C`;
    const p = materialProfile(c.id, printer());
    return `${b ? b.type : ''} · rapide · ${p.speedCap} mm/s · ${fr(p.flowNeeded)} mm³/s`;
  }
  function renderList() {
    const ul = $('#filList');
    ul.innerHTML = list.length ? '' : '<li class="fil-empty">Aucun filament personnalisé. Créez-en un à partir d’un réglage existant.</li>';
    for (const c of list) {
      const li = document.createElement('li');
      li.className = c.id === current ? 'on' : '';
      li.innerHTML = `<span class="sw" style="background:${esc(c.color || '#cccccc')}"></span><span class="nm">${esc(c.name)}<small>${esc(summary(c))}</small></span>`;
      li.addEventListener('click', () => { current = c.id; renderList(); renderEditor(); });
      ul.append(li);
    }
  }

  // ---------- Éditeur ----------
  function renderEditor() {
    const c = cur();
    $('#filEditor').hidden = !c;
    $('#filNone').hidden = !!c;
    if (!c) return;
    $('#filName').value = c.name;
    $('#filColor').value = c.color || '#cccccc';
    $('#filBase').value = c.base;
    for (const b of document.querySelectorAll('#filMode button')) b.classList.toggle('on', b.dataset.mode === c.mode);
    $('#filQuick').hidden = c.mode !== 'quick';
    $('#filExpert').hidden = c.mode !== 'expert';
    if (c.mode === 'quick') renderQuick(c); else renderExpert(c);
  }
  function renderQuick(c) {
    $('#filSpeed').value = c.speed; $('#filSpeedNum').value = c.speed;
    const p = materialProfile(c.id, printer());
    const P = PRINTERS[printer()];
    $('#filCalc').innerHTML = `
      <div><dt>Débit nécessaire</dt><dd>${fr(p.flowNeeded)} mm³/s</dd></div>
      <div><dt>Débit max du filament</dt><dd>${fr(p.flowMax)} mm³/s</dd></div>
      <div><dt>Buse / 1re couche</dt><dd>${p.nozzle} / ${p.nozzleFirst} °C</dd></div>
      <div><dt>Plateau</dt><dd>${p.bed} °C</dd></div>
      <div><dt>Vitesse appliquée</dt><dd>${p.speedCap} mm/s</dd></div>
      <div><dt>Accélération</dt><dd>${p.accelCap ? `${p.accelCap} mm/s²` : 'celle de l’imprimante'}</dd></div>`;
    $('#filQuickWarn').textContent = p.limited
      ? `Trop rapide pour ce filament : il ne peut pas fondre plus de ${fr(p.flowMax)} mm³/s, la vitesse est limitée à ${p.speedMax} mm/s.`
      : '';
    $('#filQuickHint').textContent = `Calcul pour une ligne de 0,45 × 0,2 mm (${fr(LINE_AREA.toFixed(3))} mm²) sur ${P.name}. La température monte avec le débit pour que le plastique fonde assez vite.`;
  }
  function renderExpert(c) {
    const box = $('#filExpertFields');
    box.innerHTML = '';
    for (const g of EXPERT_FIELDS) {
      const sec = document.createElement('fieldset');
      sec.className = 'filgroup';
      sec.innerHTML = `<legend>${g.group}</legend>`;
      const grid = document.createElement('div');
      grid.className = 'grid2';
      for (const [key, label, unit, min, max] of g.fields) {
        const lab = document.createElement('label');
        lab.className = 'field';
        const v = getPath(c.expert, key);
        lab.innerHTML = `${label}${unit ? ` (${unit})` : ''}<input type="number" step="any" min="${min}" max="${max}" value="${v ?? ''}" data-x="${key}">`;
        if (key.startsWith('speeds.') && key !== 'speeds.travel') {
          const q = flowForSpeed(+v || 0);
          const over = q > (+c.expert.maxVolumetric || Infinity);
          lab.insertAdjacentHTML('beforeend', `<small class="${over ? 'warn' : ''}">${fr(q)} mm³/s${over ? ' : au-delà du débit max, la vitesse sera réduite' : ''}</small>`);
        }
        grid.append(lab);
      }
      sec.append(grid);
      box.append(sec);
    }
    const q = +c.expert.maxVolumetric || 1;
    $('#filExpertHint').textContent = `Avec un débit max de ${fr(q)} mm³/s, une ligne de 0,45 × 0,2 mm peut être imprimée jusqu'à ${speedForFlow(q)} mm/s environ.`;
  }

  // ---------- Évènements ----------
  $('#filNew').addEventListener('click', () => {
    const base = 'pla_hs';
    const c = { id: `cust:${Date.now().toString(36)}`, name: 'Mon filament', color: MATERIALS[base].color, base, mode: 'quick', speed: 100, expert: expertDefaults(base, PRINTERS.cc.speeds) };
    list.push(c); current = c.id; save(); renderList(); renderEditor();
    $('#filName').focus(); $('#filName').select();
  });
  $('#filDup').addEventListener('click', () => {
    const c = cur(); if (!c) return;
    const d = JSON.parse(JSON.stringify(c)); d.id = `cust:${Date.now().toString(36)}`; d.name = `${c.name} (copie)`;
    list.push(d); current = d.id; save(); renderList(); renderEditor();
  });
  $('#filDel').addEventListener('click', () => {
    const c = cur(); if (!c) return;
    list = list.filter((x) => x !== c); current = list[0]?.id || null; save(); renderList(); renderEditor();
  });
  $('#filName').addEventListener('change', (e) => { const c = cur(); if (!c) return; c.name = e.target.value.trim() || 'Mon filament'; save(); renderList(); });
  $('#filColor').addEventListener('input', (e) => { const c = cur(); if (!c) return; c.color = e.target.value; save(); renderList(); });
  $('#filBase').addEventListener('change', (e) => {
    const c = cur(); if (!c) return;
    c.base = e.target.value;
    c.expert = expertDefaults(c.base, PRINTERS.cc.speeds);
    if (!c.color || c.color === '#cccccc') c.color = MATERIALS[c.base].color;
    save(); renderList(); renderEditor();
  });
  $('#filMode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); const c = cur(); if (!b || !c) return;
    c.mode = b.dataset.mode; save(); renderList(); renderEditor();
  });
  const setSpeed = (v) => { const c = cur(); if (!c) return; c.speed = Math.max(10, Math.min(500, Math.round(+v || 50))); save(); renderList(); renderQuick(c); };
  $('#filSpeed').addEventListener('input', (e) => { $('#filSpeedNum').value = e.target.value; setSpeed(e.target.value); });
  $('#filSpeedNum').addEventListener('change', (e) => { $('#filSpeed').value = e.target.value; setSpeed(e.target.value); });
  $('#filExpertFields').addEventListener('change', (e) => {
    const k = e.target.dataset.x; const c = cur(); if (!k || !c) return;
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!Number.isFinite(v)) return;
    setPath(c.expert, k, v);
    save(); renderList(); renderExpert(c);
  });
  $('#filReset').addEventListener('click', () => {
    const c = cur(); if (!c) return;
    c.expert = expertDefaults(c.base, PRINTERS.cc.speeds); save(); renderExpert(c);
  });

  // Choix des réglages de base
  $('#filBase').innerHTML = Object.values(MATERIALS).map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
  renderList();
  renderEditor();
  return {
    show() { renderList(); renderEditor(); },
    familyOf,
  };
}
