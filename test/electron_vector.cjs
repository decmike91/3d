// Test de bout en bout (Windows/Electron) : onglet Vectoriser -> « Imprimer en 3D » -> tranchage.
// Lancement : xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/electron_vector.cjs [dossier_captures]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
require('../electron/main.cjs');
const outDir = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(win, name) {
  if (!outDir) return;
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, name), img.toPNG());
}

app.whenReady().then(async () => {
  let ok = false;
  try {
    await wait(2500);
    const win = BrowserWindow.getAllWindows()[0];
    const wc = win.webContents;
    const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`);
    await run(`document.querySelector('.tabs [data-tab="vector"]').click();`);
    // l'exemple de Trait Fin se calcule au chargement du cadre
    let nodes = 0;
    for (let i = 0; i < 60 && !nodes; i++) {
      await wait(250);
      nodes = await run(`const d = document.querySelector('#vectorFrame').contentDocument; return d && d.querySelector('#s-paths') ? +d.querySelector('#s-paths').textContent.replace(/\\s/g,'') : 0;`);
    }
    console.log('tracés vectorisés :', nodes);
    await wait(1500);
    await shot(win, 'vectoriser.png');
    await run(`document.querySelector('#vectorFrame').contentDocument.querySelector('#toPrint').click();`);
    await wait(1500);
    const st = await run(`return { tab: document.querySelector('.tabs .on').dataset.tab, file: document.querySelector('#fileName').textContent,
      mode: document.querySelector('[data-k="mode"]').value, dim: document.querySelector('#stDim').textContent, slice: !document.querySelector('#sliceBtn').disabled };`);
    console.log('après envoi :', JSON.stringify(st));
    await run(`document.querySelector('#sliceBtn').click();`);
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await wait(150); ready = await run(`return !document.querySelector('#saveBtn').disabled;`); }
    const stats = await run(`return document.querySelector('#stats').innerText.replace(/\\n/g,' ');`);
    console.log('tranchage :', ready ? 'ok' : 'ÉCHEC', '·', stats);
    await shot(win, 'imprimer.png');
    await run(`document.querySelector('[data-view="model"]').click();`);
    await wait(400);
    await shot(win, 'piece.png');
    ok = nodes > 0 && st.tab === 'print' && st.file.endsWith('.svg') && st.mode === 'stroke' && ready;
  } catch (e) { console.error(e); }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  app.exit(ok ? 0 : 1);
});
