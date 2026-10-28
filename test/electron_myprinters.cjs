// Test « Mes imprimantes » : ajout dans la liste, choix dans un onglet, effet dans l'autre.
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
    await run(`localStorage.clear();`); wc.reload(); await wait(2500);
    await run(`document.querySelector('.tabs [data-tab="print"]').click();`);
    // Gérer la liste… → ajout de deux imprimantes
    await run(`const s = document.querySelector('#printView .myPrinterSel'); s.value = 'manage'; s.dispatchEvent(new Event('change'));`);
    await wait(200);
    check(await run(`return document.querySelector('#myPrintersDlg').open;`), 'boîte « Mes imprimantes » ouverte');
    const add = async (name, model, ip) => run(`document.querySelector('#myAdd').click();
      const li = [...document.querySelectorAll('#myList li')].pop();
      const set = (f, v) => { const el = li.querySelector('[data-f="' + f + '"]'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('name', ${JSON.stringify(name)}); set('model', ${JSON.stringify(model)}); set('ip', ${JSON.stringify(ip)});`);
    await add('Centauri atelier', 'cc', '192.168.1.50');
    await add('Centauri bureau', 'cc', '192.168.1.54');
    await add('K1 garage', 'k1', '192.168.1.51');
    if (outDir) fs.writeFileSync(path.join(outDir, 'myp_dialog.png'), (await wc.capturePage()).toPNG());
    await run(`document.querySelector('#myPrintersDlg').close();`);
    await wait(200);
    const opts = await run(`return [...document.querySelectorAll('#modelView .myPrinterSel option')].map(o => o.textContent);`);
    check(opts.includes('Centauri bureau — 192.168.1.54') && opts.includes('K1 garage — 192.168.1.51'), `liste identique dans Modèle 3D (${opts.length} choix)`);
    // Choix de la 2e Centauri dans l'onglet Relief SVG, avec un identifiant carte mère connu
    await run(`const s = document.querySelector('#printView .myPrinterSel'); s.value = s.options[1].value; s.dispatchEvent(new Event('change'));`);
    await run(`const mb = document.querySelector('#printView [data-k="mainboardId"]'); mb.value = 'ABC2'; mb.dispatchEvent(new Event('change', { bubbles: true }));`);
    let st = await run(`return { printer: document.querySelector('#pill').textContent, host: document.querySelector('#printView [data-k="host"]').value, info: document.querySelector('#printView .mypick-info').innerText, manualHidden: document.querySelector('#printView .manual-printer').hidden };`);
    check(st.host === '192.168.1.54' && /Centauri bureau/.test(st.info) && st.manualHidden, `Relief SVG : ${st.info}`);
    // K1 depuis l'onglet Modèle 3D : l'onglet Relief SVG suit
    await run(`document.querySelector('.tabs [data-tab="model"]').click(); const s = document.querySelector('#modelView .myPrinterSel'); s.value = [...s.options].find(o => /K1 garage/.test(o.text)).value; s.dispatchEvent(new Event('change'));`);
    await wait(300);
    st = await run(`return { pill: document.querySelector('#pill').textContent, svgInfo: document.querySelector('#printView .mypick-info').innerText, svgSel: document.querySelector('#printView .myPrinterSel').selectedOptions[0].text, m3host: document.querySelector('#modelView [data-k="host"]').value };`);
    check(/K1/.test(st.pill) && /K1 garage/.test(st.svgSel) && st.m3host === '192.168.1.51', `Modèle 3D → K1 ; Relief SVG suit (${st.svgSel})`);
    if (outDir) fs.writeFileSync(path.join(outDir, 'myp_m3.png'), (await wc.capturePage()).toPNG());
    // Retour à la Centauri bureau : son identifiant carte mère revient
    await run(`const s = document.querySelector('#modelView .myPrinterSel'); s.value = [...s.options].find(o => /bureau/.test(o.text)).value; s.dispatchEvent(new Event('change'));`);
    const mb = await run(`return document.querySelector('#printView [data-k="mainboardId"]').value;`);
    check(mb === 'ABC2', `identifiant carte mère mémorisé pour 192.168.1.54 (${mb})`);
    await run(`const s = document.querySelector('#modelView .myPrinterSel'); s.value = [...s.options].find(o => /atelier/.test(o.text)).value; s.dispatchEvent(new Event('change'));`);
    const mb1 = await run(`return document.querySelector('#printView [data-k="mainboardId"]').value;`);
    check(mb1 === '', 'autre Centauri : identifiant remis à « auto »');
    // Saisie manuelle
    await run(`const s = document.querySelector('#modelView .myPrinterSel'); s.value = 'manual'; s.dispatchEvent(new Event('change'));`);
    check(!(await run(`return document.querySelector('#modelView .manual-printer').hidden;`)), 'saisie manuelle : champs IP affichés');
    // Persistance
    wc.reload(); await wait(2500);
    const n = await run(`return document.querySelectorAll('#printView .myPrinterSel option').length;`);
    check(n === 5, `liste conservée après redémarrage (${n - 2} imprimantes)`);
  } catch (e) { console.error(e); ok = false; }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  app.exit(ok ? 0 : 1);
});
