// Envois en arrière-plan : chaque envoi (téléversement + lancement) devient une tâche affichée dans
// « Envois en cours », commune aux onglets Relief SVG et Modèle 3D. Pendant qu'un fichier part vers
// l'imprimante 1, on peut charger et trancher un autre modèle et l'envoyer à l'imprimante 2.
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createSendQueue() {
  const jobs = [];
  let seq = 0;

  function render() {
    for (const box of $$('.sendJobs')) {
      box.hidden = !jobs.length;
      const ul = box.querySelector('ul');
      ul.innerHTML = jobs.map((j) => `
        <li class="sj ${j.state}" data-id="${j.id}">
          <div class="sj-head"><b>${esc(j.printer)}</b><span>${j.state === 'run' ? (j.pct != null ? `${Math.round(j.pct * 100)} %` : '…') : j.state === 'ok' ? '✓' : '✕'}</span></div>
          <div class="sj-file">${esc(j.file)}</div>
          ${j.state === 'run' ? `<div class="progress"><span style="width:${Math.round((j.pct || 0) * 100)}%"></span></div>` : ''}
          <small>${esc(j.msg)}</small>
          ${j.state !== 'run' ? '<button type="button" class="ghost small sj-x" title="Retirer">✕</button>' : ''}
        </li>`).join('');
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.sj-x');
    if (!b) return;
    const id = +b.closest('.sj').dataset.id;
    const i = jobs.findIndex((j) => j.id === id);
    if (i >= 0) jobs.splice(i, 1);
    render();
  });

  return {
    /** Un envoi vers cette adresse est-il déjà en cours ? */
    busy(host) { return jobs.some((j) => j.state === 'run' && j.host === host); },
    /**
     * Lance une tâche. run(log, onProgress) fait l'envoi ; log(msg, cls) va dans le journal de l'onglet.
     * Renvoie une promesse résolue à la fin (true = réussi).
     */
    start({ printer, host, file, run, log, doneMsg }) {
      const j = { id: ++seq, printer, host, file, state: 'run', pct: 0, msg: 'Préparation…' };
      jobs.unshift(j);
      while (jobs.length > 6) jobs.pop();
      render();
      const jlog = (m, cls) => { j.msg = m; render(); log && log(`${printer} : ${m}`, cls); };
      const prog = (f) => { j.pct = f; render(); };
      return (async () => {
        try {
          await run(jlog, prog);
          j.state = 'ok'; j.pct = 1; jlog(doneMsg || 'Envoyé.', 'ok');
          return true;
        } catch (e) {
          j.state = 'err'; jlog(e.message || String(e), 'err');
          return false;
        }
      })();
    },
    _jobs: jobs,
  };
}
