// « Mes imprimantes » : liste de choix commune aux onglets Relief SVG et Modèle 3D.
// - Android : imprimantes saisies dans l'écran Surveiller (nom + adresse IP), lues par le plugin natif ;
// - partout : imprimantes ajoutées dans l'application (utile sous Windows).
// Choisir une imprimante règle le modèle (Centauri Carbon / K1) et l'adresse IP dans les deux onglets.

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const MODEL = { cc: 'Elegoo Centauri Carbon', k1: 'Creality K1 / K1C' };
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isIp = (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v);

export function initMyPrinters({ state, save, setPrinter, platform }) {
  if (!Array.isArray(state.myPrinters)) state.myPrinters = [];
  if (!state.mbByIp) state.mbByIp = {};
  let monitor = [];

  const entries = () => [
    ...monitor.map((m) => ({ id: `mon:${m.key}`, name: m.name, model: m.model, ip: m.ip, source: 'monitor' })),
    ...state.myPrinters.filter((p) => p.ip).map((p) => ({ ...p, source: 'app' })),
  ];
  const find = (id) => entries().find((e) => e.id === id);

  function apply(e, quiet) {
    state.selPrinter = e.id;
    const net = state.net[e.model];
    net.host = e.ip;
    if (e.model === 'cc') net.mainboardId = state.mbByIp[e.ip] || '';
    save();
    setPrinter(e.model);
    render();
    if (!quiet) for (const c of $$('.conn')) { c.className = 'conn'; c.textContent = ''; }
  }

  function render() {
    const list = entries();
    const sel = state.selPrinter;
    for (const s of $$('.myPrinterSel')) {
      const groups = [
        ['Depuis Surveiller', list.filter((e) => e.source === 'monitor')],
        ['Ajoutées ici', list.filter((e) => e.source === 'app')],
      ];
      s.innerHTML = groups.filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${g}">${l.map((e) => `<option value="${esc(e.id)}">${esc(e.name)} — ${esc(e.ip)}</option>`).join('')}</optgroup>`).join('')
        + '<option value="manual">Autre imprimante (saisie manuelle)</option><option value="manage">Gérer la liste…</option>';
      s.value = sel && find(sel) ? sel : 'manual';
    }
    const e = sel && find(sel);
    for (const p of $$('.mypick-info')) {
      p.innerHTML = e ? `<b>${esc(e.name)}</b> · ${MODEL[e.model]} · ${esc(e.ip)}`
        : list.length ? 'Choisissez une imprimante de la liste, ou saisissez-la ci-dessous.'
          : platform() === 'android' ? 'Aucune imprimante dans Surveiller : renseignez-les dans Surveiller › Réglages, ou ajoutez-les avec « Gérer la liste… ».'
            : 'Ajoutez vos imprimantes avec « Gérer la liste… » pour les retrouver ici.';
    }
    for (const m of $$('.manual-printer')) m.hidden = !!e;
  }

  // Lecture des imprimantes de Surveiller (Android)
  async function refreshMonitor() {
    if (platform() !== 'android') return;
    try {
      const r = await globalThis.Capacitor.Plugins.PrinterNet.monitorPrinters();
      monitor = (r && r.printers) || [];
    } catch { monitor = []; }
    // L'imprimante choisie a changé d'adresse dans Surveiller : on suit
    const e = state.selPrinter && find(state.selPrinter);
    if (e && state.net[e.model].host !== e.ip) apply(e, true);
    // Premier lancement : choisir l'imprimante correspondant à l'adresse déjà saisie, sinon la première
    if (!state.selPrinter && entries().length) {
      const cur = entries().find((x) => x.model === state.printer && x.ip === state.net[state.printer].host) || entries()[0];
      apply(cur, true);
    }
    render();
  }

  for (const s of $$('.myPrinterSel')) {
    s.addEventListener('change', () => {
      const v = s.value;
      if (v === 'manage') { s.value = state.selPrinter && find(state.selPrinter) ? state.selPrinter : 'manual'; openDialog(); return; }
      if (v === 'manual') { state.selPrinter = 'manual'; save(); render(); return; }
      const e = find(v);
      if (e) apply(e);
    });
  }

  // ---------- Boîte « Gérer la liste » ----------
  const dlg = $('#myPrintersDlg');
  function renderDialog() {
    $('#myDlgHint').textContent = monitor.length
      ? 'Les imprimantes de Surveiller se modifient dans Surveiller › Réglages. Vous pouvez en ajouter d’autres ici.'
      : 'Nom libre, modèle et adresse IP (visible dans les réglages réseau de l’imprimante).';
    const ul = $('#myList');
    ul.innerHTML = '';
    for (const m of monitor) {
      const li = document.createElement('li');
      li.innerHTML = `<input value="${esc(m.name)}" disabled><select disabled><option>${m.model === 'k1' ? 'K1 / K1C' : 'Centauri Carbon'}</option></select><input value="${esc(m.ip)}" disabled><span></span><small class="src">Depuis Surveiller</small>`;
      ul.append(li);
    }
    state.myPrinters.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<input placeholder="Nom (ex. Centauri atelier)" value="${esc(p.name)}" data-f="name">
        <select data-f="model"><option value="cc">Centauri Carbon</option><option value="k1">K1 / K1C</option></select>
        <input placeholder="192.168.1.50" inputmode="decimal" value="${esc(p.ip)}" data-f="ip">
        <button type="button" class="x ghost small" title="Supprimer">✕</button>`;
      li.querySelector('select').value = p.model;
      li.addEventListener('change', (ev) => {
        const f = ev.target.dataset.f;
        if (!f) return;
        p[f] = ev.target.value.trim();
        if (f === 'ip' && p.ip && !isIp(p.ip)) ev.target.setCustomValidity('Adresse IP invalide'); else ev.target.setCustomValidity('');
        if (state.selPrinter === p.id && p.ip) apply(p.ip ? { ...p, source: 'app' } : p, true);
        save(); render();
      });
      li.querySelector('button').addEventListener('click', () => {
        state.myPrinters.splice(i, 1);
        if (state.selPrinter === p.id) state.selPrinter = 'manual';
        save(); renderDialog(); render();
      });
      ul.append(li);
    });
  }
  function openDialog() {
    renderDialog();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('#myAdd').addEventListener('click', () => {
    const cur = state.net[state.printer];
    state.myPrinters.push({ id: `app:${Date.now().toString(36)}`, name: '', model: state.printer, ip: state.selPrinter === 'manual' || !state.selPrinter ? cur.host || '' : '' });
    save(); renderDialog();
    const inputs = $$('#myList input[data-f="name"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  dlg.addEventListener('close', () => {
    state.myPrinters = state.myPrinters.filter((p) => p.ip || p.name);
    for (const p of state.myPrinters) if (!p.name) p.name = `${p.model === 'k1' ? 'K1' : 'Centauri'} ${p.ip}`;
    save(); render();
  });

  // Retour de l'écran Surveiller (ou de l'arrière-plan) : relire la liste
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshMonitor(); });
  try { globalThis.Capacitor?.Plugins?.App?.addListener?.('resume', refreshMonitor); } catch { /* facultatif */ }

  render();
  refreshMonitor();
  return { render, refresh: refreshMonitor, entries };
}
