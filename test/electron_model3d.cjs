// Test de bout en bout (Windows/Electron) de l'onglet Modèle 3D :
// 3MF à deux objets (2 filaments) → orientation solidité → tranchage CuraEngine (navigateur) → CANVAS
// puis STL seul sur K1 → envoi à un faux Moonraker.
// Lancement : xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/electron_model3d.cjs [--shots=dossier]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { zipSync, strToU8 } = require('fflate');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
require('../electron/main.cjs');
const outDir = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boxXml(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return `<mesh><vertices>${v.map((p) => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}</vertices><triangles>${f.map((t) => `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('')}</triangles></mesh>`;
}
function make3mf() {
  // Objet 1 : barre 60×8×8 posée debout ; objet 2 : champignon (surplomb), filament n° 2
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<resources>
<object id="1" type="model" name="Barre">${boxXml(0, 0, 0, 8, 8, 60)}</object>
<object id="2" type="model" name="Pied">${boxXml(-4, -4, 0, 4, 4, 12)}</object>
<object id="3" type="model" name="Chapeau">${boxXml(-12, -12, 12, 12, 12, 16)}</object>
<object id="4" type="model" name="Champignon"><components><component objectid="2"/><component objectid="3"/></components></object>
</resources>
<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 60 60 0"/><item objectid="4" transform="1 0 0 0 1 0 0 0 1 150 150 0"/></build>
</model>`;
  const cfg = `<?xml version="1.0" encoding="UTF-8"?><config>
<object id="1"><metadata key="name" value="Barre"/><metadata key="extruder" value="1"/></object>
<object id="4"><metadata key="name" value="Champignon"/><metadata key="extruder" value="2"/></object>
</config>`;
  const proj = JSON.stringify({ filament_colour: ['#FFFFFF', '#E02020'], filament_type: ['PLA', 'PLA'] });
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '3D/3dmodel.model': strToU8(model),
    'Metadata/model_settings.config': strToU8(cfg),
    'Metadata/project_settings.config': strToU8(proj),
  });
}

let uploaded = null;
const srv = http.createServer((req, res) => {
  let n = 0; req.on('data', (d) => (n += d.length));
  req.on('end', () => {
    if (req.url === '/server/info') return res.end('{"result":{"klippy_state":"ready","klippy_connected":true}}');
    if (req.url.startsWith('/printer/objects')) return res.end('{"result":{"status":{"print_stats":{"state":"standby"}}}}');
    if (req.url === '/server/files/upload') { uploaded = n; return res.end('{"print_started":true}'); }
    res.writeHead(404); res.end();
  });
}).listen(17127);

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
    const shot = async (name) => { if (outDir) fs.writeFileSync(path.join(outDir, name), (await wc.capturePage()).toPNG()); };
    const b64 = Buffer.from(make3mf()).toString('base64');

    await run(`document.querySelector('.tabs [data-tab="model"]').click();`);
    await run(`document.querySelector('#printerSeg button[data-printer="cc"]').click();`);
    await wait(500);
    // Chargement du 3MF
    await run(`
      const bin = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([bin], 'projet-2-couleurs.3mf'));
      const inp = document.querySelector('#m3File'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));`);
    await wait(1500);
    let st = await run(`const d = window.__m3._debug; return { n: d.objects.length, names: d.objects.map(o => o.name), tools: d.objects.map(o => o.parts.map(p => p.tool)), canvas: document.querySelector('#m3Canvas').checked, slotColor: d.st.slots[1].color, warn: document.querySelector('#m3Warn').innerText };`);
    console.log('   chargé :', JSON.stringify(st));
    check(st.n === 2 && st.tools[1].every((t) => t === 1), '3MF : 2 objets, le champignon sur le filament 2');
    check(st.canvas && st.slotColor === '#E02020', 'CANVAS activé automatiquement, couleurs reprises du projet');
    await shot('m3_charge.png');

    // Orientation solidité de la barre (sélection puis bouton)
    await run(`const li = document.querySelectorAll('#m3Objects li')[0]; li.click(); document.querySelector('#m3OrientSeg [data-orient="strength"]').click(); document.querySelector('#m3Orient').click();`);
    await wait(1500);
    const dim = await run(`return document.querySelector('#m3Size').value;`);
    console.log('   barre après orientation :', dim);
    check(/^60\.0 × 8\.0 × 8\.0$|^8\.0 × 60\.0 × 8\.0$/.test(dim), 'barre couchée (solidité)');
    await run(`document.querySelectorAll('#m3Objects li')[0].click();`); // désélection

    // Tranchage
    await run(`document.querySelector('#m3Slice').click();`);
    let done = false;
    for (let i = 0; i < 240 && !done; i++) { await wait(500); done = await run(`return !document.querySelector('#m3Send').disabled;`); }
    const log = await run(`return document.querySelector('#m3Log').innerText;`);
    console.log('   journal :', log.split('\n').slice(0, 3).join(' | '));
    check(done, 'tranchage CuraEngine dans l’application');
    const g = await run(`const s = window.__m3._debug.sliced; return s ? { len: s.gcode.length, m6211: (s.gcode.match(/^M6211 T\\d/gm) || []).length, tools: s.tools.map(t => t.slot), sup: /;TYPE:SUPPORT/.test(s.gcode), thumb: /thumbnail begin 144x144/.test(s.gcode), layers: s.stats.layers } : null;`);
    console.log('   G-code :', JSON.stringify(g));
    check(g && g.m6211 > 0 && g.tools.join() === '0,1', 'changements CANVAS dans le G-code (emplacements 1 et 2)');
    check(g && g.sup, 'supports automatiques sous le chapeau');
    check(g && g.thumb, 'vignette 144×144 pour l’écran de la Centauri');
    await wait(500);
    await shot('m3_couches.png');
    await run(`document.querySelector('[data-m3view="model"]').click();`);
    await wait(400);
    await shot('m3_pieces.png');

    // K1 : un seul filament, envoi au faux Moonraker
    await run(`document.querySelector('#m3PrinterSeg [data-printer="k1"]').click();`);
    await run(`const h = document.querySelector('#m3Wrap').closest('main').querySelector('[data-k="host"]'); h.value = '127.0.0.1'; h.dispatchEvent(new Event('change', {bubbles:true}));
               const p = document.querySelector('#printView [data-k="port"]'); p.value = '17127'; p.dispatchEvent(new Event('change', {bubbles:true}));`);
    await run(`document.querySelector('#m3Slice').click();`);
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) { await wait(500); ready = await run(`return !document.querySelector('#m3Send').disabled;`); }
    await run(`document.querySelector('#m3Send').click();`);
    for (let i = 0; i < 240 && uploaded == null; i++) await wait(500);
    await wait(800);
    const log2 = await run(`return document.querySelector('#m3Log').innerText.split('\\n').slice(0, 3).join(' | ');`);
    console.log('   journal :', log2);
    check(uploaded > 10000, `K1 : G-code reçu par le faux Moonraker (${uploaded} octets)`);
    const k1 = await run(`const s = window.__m3._debug.sliced; return { start: /START_PRINT EXTRUDER_TEMP=225/.test(s.gcode), noT: !/^M6211/m.test(s.gcode) };`);
    check(k1.start && k1.noT, 'K1 : G-code mono-filament PLA (START_PRINT, sans CANVAS)');
  } catch (e) { console.error(e); ok = false; }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  srv.close();
  app.exit(ok ? 0 : 1);
});
