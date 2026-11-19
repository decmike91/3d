// Onglet Filaments : filament rapide (vitesse → débit), filament expert, utilisation dans Relief SVG et Modèle 3D
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
    win.setSize(1300, 900);
    const wc = win.webContents;
    wc.on('console-message', (e) => { if ((e.level ?? 0) >= 3 || e.level === 'error') console.log('[page]', e.message); });
    const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`);
    await run(`localStorage.clear();`); wc.reload(); await wait(2500);
    const shot = async (n) => { if (outDir) fs.writeFileSync(path.join(outDir, n), (await wc.capturePage()).toPNG()); };

    // 1. Vitesse personnalisée dans Relief SVG : 120 mm/s en PLA
    await run(`document.querySelector('.tabs [data-tab="print"]').click();
      const box = document.querySelector('#svgMatPick'); const [fam, spd] = box.querySelectorAll('select');
      fam.value = 'pla'; fam.dispatchEvent(new Event('change'));
      spd.value = 'custom'; spd.dispatchEvent(new Event('change'));
      const n = box.querySelector('input[type=number]'); n.value = '120'; n.dispatchEvent(new Event('change'));`);
    await wait(200);
    const svgInfo = await run(`return document.querySelector('#svgMatPick .matpick-info').innerText;`);
    check(/Débit nécessaire 9,8 mm³\/s/.test(svgInfo), `Relief SVG, PLA à 120 mm/s : ${svgInfo}`);
    const svgFil = await run(`return JSON.parse(localStorage.getItem('svg2print.v1') || '{}').fil?.cc;`);
    check(svgFil && svgFil.speedCap === 120 && svgFil.nozzle === 214, `profil appliqué : ${svgFil && svgFil.speedCap} mm/s, buse ${svgFil && svgFil.nozzle} °C`);

    // 2. Onglet Filaments : nouveau filament rapide
    await run(`document.querySelector('.tabs [data-tab="filaments"]').click(); document.querySelector('#filNew').click();
      const n = document.querySelector('#filName'); n.value = 'PETG gris atelier'; n.dispatchEvent(new Event('change'));
      const b = document.querySelector('#filBase'); b.value = 'petg_hs'; b.dispatchEvent(new Event('change'));
      const s = document.querySelector('#filSpeedNum'); s.value = '90'; s.dispatchEvent(new Event('change'));`);
    await wait(200);
    const calc = await run(`return document.querySelector('#filCalc').innerText.replace(/\\n/g, ' ');`);
    check(/7,3 mm³\/s/.test(calc) && /90 mm\/s/.test(calc), `mode rapide, PETG à 90 mm/s : ${calc}`);
    await shot('fil_rapide.png');
    // 3. Filament expert : paroi externe 40 mm/s, buse 248 °C
    await run(`document.querySelector('#filNew').click();
      const n = document.querySelector('#filName'); n.value = 'PLA expert'; n.dispatchEvent(new Event('change'));
      document.querySelector('#filMode [data-mode="expert"]').click();
      const set = (k, v) => { const i = document.querySelector('[data-x="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); };
      set('nozzle', '228'); set('speeds.outerWall', '40'); set('speeds.innerWall', '60');`);
    await wait(200);
    const nFields = await run(`return document.querySelectorAll('#filExpertFields input').length;`);
    check(nFields >= 20, `mode expert : ${nFields} réglages d'extrusion`);
    await shot('fil_expert.png');
    // 4. Ces filaments apparaissent dans Modèle 3D ; tranchage avec le filament expert
    await run(`document.querySelector('.tabs [data-tab="model"]').click(); document.querySelector('#m3PrinterSeg [data-printer="cc"]')?.click();`);
    await wait(500);
    const opts = await run(`return [...document.querySelectorAll('#m3Slots .slot select')[0].options].map(o => o.text);`);
    check(opts.includes('PETG gris atelier') && opts.includes('PLA expert'), `filaments proposés dans Modèle 3D (${opts.slice(-2).join(', ')})`);
    const stl = (() => { const v=[[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,10],[20,0,10],[20,20,10],[0,20,10]]; const f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]; return 'solid c\n'+f.map(t=>'facet normal 0 0 0\nouter loop\n'+t.map(i=>'vertex '+v[i].join(' ')).join('\n')+'\nendloop\nendfacet').join('\n')+'\nendsolid c\n'; })();
    await run(`const c = document.querySelector('#m3CanvasOn'); if (c.checked) c.click();
      const sel = document.querySelectorAll('#m3Slots .slot select')[0]; sel.value = [...sel.options].find(o => o.text === 'PLA expert').value; sel.dispatchEvent(new Event('change'));
      const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(stl)}], 'cube.stl')); const i = document.querySelector('#m3File'); i.files = dt.files; i.dispatchEvent(new Event('change'));`);
    await wait(1500);
    await run(`document.querySelector('#m3Slice').click();`);
    let done = false;
    for (let i = 0; i < 200 && !done; i++) { await wait(500); done = await run(`return !!window.__m3._debug.sliced;`); }
    const r = await run(`const g = window.__m3._debug.sliced.gcode; let f = 0, outer = 0, inner = 0, type = '';
      for (const l of g.slice(g.indexOf(';LAYER:2')).split('\\n')) {
        if (l.startsWith(';TYPE:')) type = l.slice(6);
        const m = /^G1 .*F(\\d+)/.exec(l); if (m) f = +m[1];
        if (/^G1 .*X.*E[0-9.]+/.test(l)) { if (type === 'WALL-OUTER') outer = Math.max(outer, f); if (type === 'WALL-INNER') inner = Math.max(inner, f); }
      }
      return { outer: outer / 60, inner: inner / 60, temp: /^M104 S228$|^M109 S228$/m.test(g) || /EXTRUDER_TEMP=228|M109 S228/.test(g) };`);
    check(done && r.outer === 40 && r.inner === 60, `G-code : paroi externe ${r.outer} mm/s, parois internes ${r.inner} mm/s`);
    check(r.temp, 'G-code : buse à 228 °C (mode expert)');
    // 5. Persistance
    wc.reload(); await wait(2500);
    const n2 = await run(`return JSON.parse(localStorage.getItem('svg2print.filaments.v1') || '[]').length;`);
    check(n2 === 2, `bibliothèque conservée (${n2} filaments)`);
  } catch (e) { console.error(e); ok = false; }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  app.exit(ok ? 0 : 1);
});
