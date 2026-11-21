// Envois en arrière-plan : chaque envoi (téléversement + lancement) devient une tâche affichée dans
// « Envois en cours », commune aux onglets Relief SVG et Modèle 3D. Pendant qu'un fichier part vers
// l'imprimante 1, on peut charger et trancher un autre modèle et l'envoyer à l'imprimante 2.
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createSendQueue() {
  const jobs = [];
  let seq = 0;

  // Mise à jour sur place (pas de reconstruction) : le bouton « Annuler » reste cliquable pendant la progression
  function render() {
    for (const box of $$('.sendJobs')) {
      box.hidden = !jobs.length;
      const ul = box.querySelector('ul');
      for (const li of [...ul.children]) if (!jobs.some((j) => String(j.id) === li.dataset.id)) li.remove();
      jobs.forEach((j, idx) => {
        let li = ul.querySelector(`li[data-id="${j.id}"]`);
        if (!li) {
          li = document.createElement('li');
          li.dataset.id = j.id;
          li.innerHTML = `<div class="sj-head"><b>${esc(j.printer)}</b><span class="sj-st"></span></div>
            <div class="sj-file">${esc(j.file)}</div><div class="progress"><span></span></div><small></small><div class="sj-btn"></div>`;
        }
        if (ul.children[idx] !== li) ul.insertBefore(li, ul.children[idx] || null);
        li.className = `sj ${j.state}`;
        li.querySelector('.sj-st').textContent = j.state === 'run' ? `${Math.round((j.pct || 0) * 100)} %` : j.state === 'ok' ? '✓' : j.state === 'cancel' ? 'annulé' : '✕';
        li.querySelector('.progress').hidden = j.state !== 'run';
        li.querySelector('.progress span').style.width = `${Math.round((j.pct || 0) * 100)}%`;
        li.querySelector('small').textContent = j.msg;
        const key = `${j.state}/${!!j.stopping}`;
        const bt = li.querySelector('.sj-btn');
        if (bt.dataset.key !== key) {
          bt.dataset.key = key;
          bt.innerHTML = j.state === 'run'
            ? `<button type="button" class="ghost small sj-stop"${j.stopping ? ' disabled' : ''}>${j.stopping ? 'Annulation…' : 'Annuler l’envoi'}</button>`
            : '<button type="button" class="ghost small sj-x" title="Retirer">✕</button>';
        }
      });
    }
  }
  document.addEventListener('click', (e) => {
    const stop = e.target.closest('.sj-stop');
    if (stop) {
      const j = jobs.find((x) => x.id === +stop.closest('.sj').dataset.id);
      if (j && j.state === 'run') { j.stopping = true; j.ctl.abort(); render(); }
      return;
    }
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
      const j = { id: ++seq, printer, host, file, state: 'run', pct: 0, msg: 'Préparation…', ctl: new AbortController() };
      jobs.unshift(j);
      // On garde les 6 derniers (jamais un envoi en cours)
      for (let i = jobs.length - 1; jobs.length > 6 && i >= 0; i--) if (jobs[i].state !== 'run') jobs.splice(i, 1);
      render();
      const jlog = (m, cls) => { j.msg = m; render(); log && log(`${printer} : ${m}`, cls); };
      const prog = (f) => { j.pct = f; render(); };
      return (async () => {
        try {
          await run(jlog, prog, j.ctl.signal);
          j.state = 'ok'; j.pct = 1; jlog(doneMsg || 'Envoyé.', 'ok');
          return true;
        } catch (e) {
          if (e && e.cancelled) { j.state = 'cancel'; jlog('envoi annulé, aucune impression lancée.', 'err'); return false; }
          j.state = 'err'; jlog(e.message || String(e), 'err');
          return false;
        }
      })();
    },
    _jobs: jobs,
  };
}
