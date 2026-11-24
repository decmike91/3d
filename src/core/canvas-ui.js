// « Mes CANVAS » (onglet Filaments) : une fiche par Centauri Carbon équipée d'un CANVAS.
// Lecture de l'imprimante, modification ou retrait d'une bobine, secours en fin de bobine.
import { canvasOf, updateCanvas, editTray, resetTray, applyRead, onCanvasChange, backupsFor, BACKUP_MODES } from './canvasstore.js';
import { materialPicker } from './matpicker.js';
import { materialProfile } from './materials.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** opts : { printers(): [{ id, name, ip, model }], read(ip): Promise<résultat ccCanvas> } */
export function initCanvasUI(opts) {
  const box = document.querySelector('#canvasCards');
  const busy = new Set();
  const msg = {};
  let rendering = false;

  function card(pr) {
    const p = canvasOf(pr.ip);
    const el = document.createElement('div');
    el.className = 'cv-card';
    el.dataset.ip = pr.ip;
    const ar = p.autoRefill == null ? '' : p.autoRefill
      ? '<span class="ok">Recharge automatique activée sur l’imprimante.</span>'
      : '<span class="warn">Recharge automatique désactivée sur l’imprimante : activez-la sur son écran (CANVAS) pour qu’elle enchaîne seule sur la bobine de secours.</span>';
    el.innerHTML = `
      <div class="cv-head">
        <b>${esc(pr.name)}</b><small>${esc(pr.ip)}</small>
        <label class="check cv-has"><input type="checkbox" ${p.has !== false ? 'checked' : ''}> CANVAS installé</label>
      </div>
      <div class="cv-body" ${p.has === false ? 'hidden' : ''}>
        <div class="row cv-actions">
          <button type="button" class="ghost cv-read" ${busy.has(pr.ip) ? 'disabled' : ''}>${busy.has(pr.ip) ? 'Lecture…' : 'Lire le CANVAS'}</button>
          <small class="cv-msg">${esc(msg[pr.ip] || (p.lastRead ? `Lu le ${new Date(p.lastRead).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : 'Jamais lu'))}</small>
        </div>
        <ol class="cv-trays"></ol>
        <label class="field cv-backup">Fin de bobine pendant l’impression : continuer avec
          <select>${Object.entries(BACKUP_MODES).map(([k, l]) => `<option value="${k}" ${p.backup === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
        <p class="hint cv-ar">${ar}</p>
      </div>`;
    const ol = el.querySelector('.cv-trays');
    p.trays.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = `cv-tray${t.removed ? ' removed' : ''}`;
      const r = t.printer;
      const printerTxt = !r ? 'pas encore lue' : r.loaded ? `${r.brand || ''} ${r.type || r.name || ''} ${r.color || ''}`.replace(/\s+/g, ' ').trim() : 'vide';
      const bk = t.removed ? [] : backupsFor(p, i);
      li.innerHTML = `
        <div class="cv-row">
          <b class="cv-n">${i + 1}</b>
          <input type="color" class="cv-col" value="${esc(t.color)}" title="Couleur de la bobine" ${t.removed ? 'disabled' : ''}>
          <div class="cv-mat"></div>
        </div>
        <div class="cv-row2">
          <input type="text" class="cv-name" maxlength="30" placeholder="Nom (facultatif)" value="${esc(t.name || '')}" ${t.removed ? 'disabled' : ''}>
          <button type="button" class="ghost small cv-rm">${t.removed ? 'Remettre' : 'Retirer'}</button>
          ${t.edited && r ? '<button type="button" class="ghost small cv-reset" title="Reprendre le filament et la couleur lus sur l’imprimante">Valeurs de l’imprimante</button>' : ''}
        </div>
        <small class="cv-info">${t.removed ? 'Retirée : non utilisée à l’envoi.' : `Imprimante : ${esc(printerTxt)}${t.edited ? ' · <i>modifiée dans l’appli</i>' : ''}${p.backup !== 'off' ? ` · secours : ${bk.length ? bk.map((j) => j + 1).join(', ') : 'aucun'}` : ''}`}</small>`;
      if (!t.removed) {
        materialPicker(li.querySelector('.cv-mat'), {
          value: t.mat, printer: () => 'cc', compact: true, canvas: true,
          onChange: (id) => editTray(pr.ip, i, { mat: id }),
        });
      } else {
        li.querySelector('.cv-mat').textContent = materialProfile(t.mat, 'cc').name;
      }
      const col = li.querySelector('.cv-col');
      // « change » en plus de « input » : certains sélecteurs de couleur Android ne déclenchent que « change »
      const setCol = () => editTray(pr.ip, i, { color: col.value.toUpperCase() });
      col.addEventListener('input', setCol);
      col.addEventListener('change', setCol);
      li.querySelector('.cv-name').addEventListener('change', (e) => editTray(pr.ip, i, { name: e.target.value.trim() }));
      li.querySelector('.cv-rm').addEventListener('click', () => editTray(pr.ip, i, { removed: !t.removed }));
      const rs = li.querySelector('.cv-reset');
      if (rs) rs.addEventListener('click', () => resetTray(pr.ip, i));
      ol.append(li);
    });
    el.querySelector('.cv-has input').addEventListener('change', (e) => updateCanvas(pr.ip, (q) => { q.has = e.target.checked; }));
    el.querySelector('.cv-backup select').addEventListener('change', (e) => updateCanvas(pr.ip, (q) => { q.backup = e.target.value; }));
    el.querySelector('.cv-read').addEventListener('click', async () => {
      busy.add(pr.ip); msg[pr.ip] = 'Lecture du CANVAS…'; render();
      try {
        const r = await opts.read(pr.ip);
        applyRead(pr.ip, r);
        msg[pr.ip] = r.trays.length ? `Lu : ${r.trays.filter((t) => t.loaded).length} bobine(s) chargée(s). Vos modifications sont conservées.` : 'Aucun CANVAS connecté à cette imprimante.';
      } catch (e) { msg[pr.ip] = `Lecture impossible : ${e.message}`; }
      busy.delete(pr.ip); render();
    });
    return el;
  }

  function render() {
    if (rendering) return;
    rendering = true;
    try {
      // Ne pas reconstruire pendant qu'on choisit une couleur ou qu'on tape un nom
      const a = document.activeElement;
      if (a && box.contains(a) && (a.type === 'color' || a.type === 'text')) { rendering = false; setTimeout(render, 600); return; }
      const list = opts.printers().filter((x) => x.model === 'cc' && x.ip);
      box.innerHTML = list.length ? '' : '<p class="hint">Ajoutez vos Centauri Carbon dans « Mes imprimantes » (onglet Relief SVG ou Modèle 3D) ou dans Surveiller : chacune aura sa fiche CANVAS ici.</p>';
      for (const pr of list) box.append(card(pr));
    } finally { rendering = false; }
  }
  onCanvasChange(render);
  render();
  return { render };
}
