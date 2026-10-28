// Test de l'onglet Aide : sommaire, recherche, index, aide contextuelle (boutons « ? » et F1)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
require('../electron/main.cjs');
const outDir = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let ok = true;
  const check = (c, m) => { console.log(`${c ? 'OK ' : 'ÉCHEC'} ${m}`); if (!c) ok = false; };
  try {
    await wait(2500);
    const win = BrowserWindow.getAllWindows()[0];
    const wc = win.webContents;
    const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`);
    await run(`document.querySelector('.tabs [data-tab="help"]').click();`);
    await wait(300);
    const toc = await run(`return { nodes: document.querySelectorAll('#hToc .hnode').length, title: document.querySelector('#hBody h1').innerText };`);
    check(toc.nodes >= 10 && toc.title.length > 3, `sommaire (${toc.nodes} entrées visibles), page « ${toc.title} »`);
    await run(`document.querySelector('#hPanes [data-pane="search"]').click(); const q = document.querySelector('#hSearchQ'); q.value = 'purge couleur'; q.dispatchEvent(new Event('input'));`);
    const sr = await run(`return [...document.querySelectorAll('#hSearchList a b')].map(b => b.innerText);`);
    check(sr.length > 0 && sr.some((t) => /CANVAS/.test(t)), `recherche « purge couleur » : ${sr.slice(0, 3).join(' | ')}`);
    await run(`document.querySelector('#hSearchList a').click();`);
    const marks = await run(`return document.querySelectorAll('#hBody mark').length;`);
    check(marks > 2, `mots surlignés dans la page (${marks})`);
    await run(`document.querySelector('#hPanes [data-pane="index"]').click(); const q = document.querySelector('#hIndexQ'); q.value = 'gyro'; q.dispatchEvent(new Event('input'));`);
    const ix = await run(`return document.querySelector('#hIndexList').innerText;`);
    check(/gyroïde/i.test(ix), 'index : entrée « gyroïde »');
    await run(`document.querySelector('.tabs [data-tab="model"]').click(); document.querySelectorAll('#modelView .qhelp')[2].click();`);
    await wait(200);
    const ctx = await run(`return { tab: document.querySelector('.tabs .on').dataset.tab, title: document.querySelector('#hBody h1').innerText };`);
    check(ctx.tab === 'help' && /CANVAS/.test(ctx.title), `bouton « ? » de l'étape 3 (Modèle 3D) → ${ctx.title}`);
    await run(`document.querySelector('.tabs [data-tab="print"]').click(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }));`);
    const f1 = await run(`return document.querySelector('#hBody h1').innerText;`);
    check(/relief/i.test(f1), `F1 depuis Relief SVG → ${f1}`);
    const imgs = await run(`await new Promise(r => setTimeout(r, 300)); document.querySelector('#hBody').scrollTop = 1e6; await new Promise(r => setTimeout(r, 500)); return [...document.querySelectorAll('#hBody img')].map(i => i.naturalWidth);`);
    check(imgs.length && imgs.every((w) => w > 100), `captures d'écran chargées (${imgs.join(', ')} px)`);
    if (outDir) {
      win.setMinimumSize(300, 400); win.setSize(400, 860);
      await run(`document.querySelector('#hNav').click();`);
      await wait(500);
      fs.writeFileSync(path.join(outDir, 'help_mobile.png'), (await wc.capturePage()).toPNG());
    }
  } catch (e) { console.error(e); ok = false; }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  app.exit(ok ? 0 : 1);
});
