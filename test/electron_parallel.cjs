// Deux impressions en parallèle (onglet Modèle 3D) : envoi vers l'imprimante 1 (lent, en arrière-plan),
// puis tranchage d'un autre modèle et envoi vers l'imprimante 2 pendant que le premier envoi continue.
// Lancement : xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/electron_parallel.cjs
const { app, BrowserWindow } = require('electron');
const http = require('http');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
require('../electron/main.cjs');
const outShot = process.argv.find((a) => a.startsWith('--shot='))?.slice(7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function stlBox(name, sx, sy, sz) {
  const v = [[0, 0, 0], [sx, 0, 0], [sx, sy, 0], [0, sy, 0], [0, 0, sz], [sx, 0, sz], [sx, sy, sz], [0, sy, sz]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return `solid ${name}\n${f.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${v[i].join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid ${name}\n`;
}

// Deux faux Moonraker (127.0.0.1 et 127.0.0.2), le premier répond lentement au téléversement
const got = {};
const events = [];
function fake(host, delayMs) {
  return http.createServer((req, res) => {
    let n = 0; req.on('data', (d) => (n += d.length));
    req.on('end', () => {
      if (req.url === '/server/info') return res.end('{"result":{"klippy_state":"ready","klippy_connected":true}}');
      if (req.url.startsWith('/printer/objects')) return res.end('{"result":{"status":{"print_stats":{"state":"standby"}}}}');
      if (req.url === '/server/files/upload') {
        events.push(`${host}:début`);
        return setTimeout(() => { got[host] = n; events.push(`${host}:fin`); res.end('{"print_started":true}'); }, delayMs);
      }
      res.writeHead(404); res.end();
    });
  }).listen(17131, host);
}
const s1 = fake('127.0.0.1', 6000);
const s2 = fake('127.0.0.2', 200);

app.whenReady().then(async () => {
  let ok = true;
  const check = (c, m) => { console.log(`${c ? 'OK ' : 'ÉCHEC'} ${m}`); if (!c) ok = false; };
  try {
    await wait(2500);
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1400, 900);
    const wc = win.webContents;
    wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[page]', msg); });
    const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`);
    await run(`localStorage.clear();`); wc.reload(); await wait(2500);

    await run(`document.querySelector('.tabs [data-tab="model"]').click();`);
    await run(`document.querySelector('#m3PrinterSeg [data-printer="k1"]').click();`);
    const setHost = (h) => run(`const s = document.querySelector('#printView'); const h = s.querySelector('[data-k="host"]'); h.value = '${h}'; h.dispatchEvent(new Event('change', {bubbles:true}));
      const p = s.querySelector('[data-k="port"]'); p.value = '17131'; p.dispatchEvent(new Event('change', {bubbles:true}));`);
    const load = (name, stl) => run(`const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(stl)}], '${name}'));
      const inp = document.querySelector('#m3File'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));`);
    const sliceAndWait = async () => {
      await run(`document.querySelector('#m3Slice').click();`);
      for (let i = 0; i < 240; i++) { await wait(500); if (await run(`return !document.querySelector('#m3Send').disabled && !!window.__m3._debug.sliced;`)) return true; }
      return false;
    };

    // Impression 1 → imprimante 1
    await setHost('127.0.0.1');
    await load('cube.stl', stlBox('cube', 20, 20, 10)); await wait(1200);
    check(await sliceAndWait(), 'tranchage du modèle 1');
    await run(`document.querySelector('#m3Send').click();`);
    for (let i = 0; i < 40 && !events.includes('127.0.0.1:début'); i++) await wait(250);
    check(events.includes('127.0.0.1:début') && !events.includes('127.0.0.1:fin'), 'envoi 1 en cours (arrière-plan)');
    // Un 2e envoi vers la même imprimante est refusé
    await run(`document.querySelector('#m3Send').click();`);
    await wait(300);
    const dup = await run(`return document.querySelector('#m3Log').innerText;`);
    check(/déjà en cours/.test(dup), 'second envoi vers la même imprimante refusé');

    // Pendant ce temps : autre modèle, tranché et envoyé à l'imprimante 2
    await setHost('127.0.0.2');
    await run(`document.querySelector('#m3ClearAll').click();`);
    await load('barre.stl', stlBox('barre', 40, 8, 6)); await wait(1200);
    check(await sliceAndWait(), 'tranchage du modèle 2 pendant l’envoi 1');
    await run(`document.querySelector('#m3Send').click();`);
    for (let i = 0; i < 60 && !(got['127.0.0.1'] && got['127.0.0.2']); i++) await wait(500);
    console.log('   ordre :', events.join(' → '));
    check(got['127.0.0.1'] > 1000 && got['127.0.0.2'] > 1000, 'les deux imprimantes ont reçu leur G-code');
    check(events.indexOf('127.0.0.2:début') < events.indexOf('127.0.0.1:fin'), 'les deux envois se chevauchent (parallèle)');
    await wait(800);
    const m3jobs = await run(`return [...document.querySelector('#m3Send').parentElement.querySelectorAll('.sj')].map((li) => ({ ok: li.classList.contains('ok'), file: li.querySelector('.sj-file').textContent }));`);
    console.log('   envois :', JSON.stringify(m3jobs));
    check(m3jobs.length === 2 && m3jobs.every((j) => j.ok) && /barre/.test(m3jobs[0].file) && /cube/.test(m3jobs[1].file), 'liste « Envois en cours » : 2 envois réussis, fichiers distincts');
    if (outShot) { await run(`document.querySelector('#m3Send').scrollIntoView({block:'start'});`); await wait(300); require('fs').writeFileSync(outShot, (await wc.capturePage()).toPNG()); }
  } catch (e) { console.error(e); ok = false; }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  s1.close(); s2.close();
  app.exit(ok ? 0 : 1);
});
