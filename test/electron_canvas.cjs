// « Mes CANVAS » : deux Centauri Carbon, lecture, couleur de la bobine 3 gardée, bobine retirée,
// reprise dans Modèle 3D selon l'imprimante choisie.
// Lancement : xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/electron_canvas.cjs [--shot=fichier.png]
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
require('../electron/main.cjs');
const shot = process.argv.find((a) => a.startsWith('--shot='))?.slice(7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = http.createServer((_q, r) => { r.writeHead(404); r.end(); });
const wss = new WebSocketServer({ server: srv, path: '/websocket' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ Attributes: { MainboardID: 'cv1' }, MainboardID: 'cv1', Topic: 'sdcp/attributes/cv1' }));
  ws.on('message', (m) => {
    const j = JSON.parse(m.toString());
    if (j.Data.Cmd === 324) {
      return ws.send(JSON.stringify({ Id: j.Id, Data: { Cmd: 324, RequestID: j.Data.RequestID, MainboardID: 'cv1', Data: { Data: { auto_refill: true, canvas_list: [{ canvas_id: 0, connected: 1, tray_list: [
        { tray_id: 0, brand: 'eSUN', filament_type: 'PLA', filament_color: '#FFFFFF', status: 1 },
        { tray_id: 1, brand: 'eSUN', filament_type: 'PETG', filament_color: 'FF0000', status: 1 },
        { tray_id: 2, brand: 'Generic', filament_type: 'PLA', filament_color: '#808080', status: 1 },
        { tray_id: 3, filament_type: 'PLA', filament_color: '#000000', status: 1 }] }], Ack: 0 } } }, Topic: 'sdcp/response/cv1' }));
    }
    ws.send(JSON.stringify({ Id: j.Id, Data: { Cmd: j.Data.Cmd, Data: { Ack: 0 }, RequestID: j.Data.RequestID, MainboardID: 'cv1' }, Topic: 'sdcp/response/cv1' }));
  });
});
srv.listen(3030);

app.whenReady().then(async () => {
  let ok = true;
  const check = (c, m) => { console.log(`${c ? 'OK ' : 'ÉCHEC'} ${m}`); if (!c) ok = false; };
  try {
    await wait(2500);
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(1200, 1000);
    const wc = win.webContents;
    wc.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('[page]', msg); });
    const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`);
    await run(`localStorage.clear(); localStorage.setItem('svg2print.v1', JSON.stringify({ fil: {}, myPrinters: [
      { id: 'app:a', name: 'Centauri 1', model: 'cc', ip: '127.0.0.1' },
      { id: 'app:b', name: 'Centauri 2', model: 'cc', ip: '127.0.0.2' }] }));`);
    wc.reload(); await wait(2500);

    await run(`document.querySelector('.tabs [data-tab="filaments"]').click();`);
    await wait(300);
    const n = await run(`return document.querySelectorAll('#canvasCards .cv-card').length;`);
    check(n === 2, `deux fiches CANVAS (${n})`);
    // Lecture du CANVAS de la Centauri 1
    await run(`document.querySelector('.cv-card[data-ip="127.0.0.1"] .cv-read').click();`);
    for (let i = 0; i < 40; i++) { await wait(250); if (await run(`return !/Lecture/.test(document.querySelector('.cv-card[data-ip="127.0.0.1"] .cv-read').textContent);`)) break; }
    const t2 = await run(`return document.querySelectorAll('.cv-card[data-ip="127.0.0.1"] .cv-tray')[1].querySelector('.cv-col').value;`);
    check(t2.toUpperCase() === '#FF0000', `bobine 2 reprise de l’imprimante (${t2})`);
    const ar = await run(`return document.querySelector('.cv-card[data-ip="127.0.0.1"] .cv-ar').textContent;`);
    check(/activée/.test(ar), 'état de la recharge automatique affiché');
    // Couleur de la bobine 3 (évènement « change » seul, comme sur certains Android)
    await run(`const c = document.querySelectorAll('.cv-card[data-ip="127.0.0.1"] .cv-tray')[2].querySelector('.cv-col'); c.value = '#22aa44'; c.dispatchEvent(new Event('change', { bubbles: true })); c.blur();`);
    await wait(900);
    // Retirer la bobine 2
    await run(`document.querySelectorAll('.cv-card[data-ip="127.0.0.1"] .cv-tray')[1].querySelector('.cv-rm').click();`);
    await wait(300);
    // Nouvelle lecture puis rechargement de l'appli : la couleur doit rester
    await run(`document.querySelector('.cv-card[data-ip="127.0.0.1"] .cv-read').click();`);
    await wait(2000);
    wc.reload(); await wait(2500);
    await run(`document.querySelector('.tabs [data-tab="filaments"]').click();`);
    await wait(300);
    const after = await run(`const t = document.querySelectorAll('.cv-card[data-ip="127.0.0.1"] .cv-tray'); return { c3: t[2].querySelector('.cv-col').value, rm2: t[1].classList.contains('removed'), info3: t[2].querySelector('.cv-info').textContent, other: document.querySelectorAll('.cv-card[data-ip="127.0.0.2"] .cv-tray')[2].querySelector('.cv-col').value };`);
    console.log('   ', JSON.stringify(after));
    check(after.c3.toUpperCase() === '#22AA44', 'couleur de la bobine 3 gardée (nouvelle lecture + redémarrage)');
    check(after.rm2, 'bobine 2 retirée, mémorisée');
    check(after.other.toUpperCase() !== '#22AA44', 'la 2e Centauri a son propre CANVAS');
    if (shot) { await run(`document.querySelector('#canvasMgr').scrollIntoView();`); await wait(300); fs.writeFileSync(shot, (await wc.capturePage()).toPNG()); }

    // Modèle 3D : Centauri 1 choisie, CANVAS coché → bobines de sa fiche
    await run(`document.querySelector('.tabs [data-tab="model"]').click();`);
    await run(`const s = document.querySelector('#modelView .mypick select') || document.querySelector('.mypick select'); if (s) { s.value = 'app:a'; s.dispatchEvent(new Event('change', { bubbles: true })); }`);
    await wait(300);
    await run(`const c = document.querySelector('#m3CanvasOn'); if (!c.checked) c.click();`);
    await wait(400);
    const m3 = await run(`const rows = document.querySelectorAll('#m3Slots .slot'); return { n: rows.length, c3: rows[2] && rows[2].querySelector('input[type=color]').value, rm2: rows[1] && rows[1].classList.contains('removed'), info2: rows[1] && rows[1].querySelector(':scope > small').textContent };`);
    console.log('   ', JSON.stringify(m3));
    check(m3.n === 4 && m3.c3.toUpperCase() === '#22AA44', 'Modèle 3D : bobine 3 avec la couleur mémorisée');
    check(m3.rm2 && /retirée/.test(m3.info2), 'Modèle 3D : bobine 2 marquée retirée');
    // Changer la couleur dans Modèle 3D l'enregistre dans la fiche de la Centauri 1
    await run(`const c = document.querySelectorAll('#m3Slots .slot')[3].querySelector('input[type=color]'); c.value = '#3366ff'; c.dispatchEvent(new Event('change', { bubbles: true })); c.blur();`);
    await wait(500);
    const saved = await run(`return JSON.parse(localStorage.getItem('svg2print.canvas.v1'))['127.0.0.1'].trays[3].color;`);
    check(saved === '#3366FF', `couleur changée dans Modèle 3D enregistrée pour cette imprimante (${saved})`);
  } catch (e) { console.error(e); ok = false; }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  srv.close();
  app.exit(ok ? 0 : 1);
});
