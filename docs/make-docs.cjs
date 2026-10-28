// Génère la documentation à partir de src/help/content.js :
//   --shots : captures d'écran de l'application (src/help/img/*.jpg)
//   --pdf   : guide PDF (docs/SVG2Print-Guide.pdf), deux passes pour les numéros de page du sommaire
// Lancement (après npm run build) :
//   xvfb-run -a node_modules/electron/dist/electron --no-sandbox docs/make-docs.cjs --shots
//   xvfb-run -a node_modules/electron/dist/electron --no-sandbox docs/make-docs.cjs --pdf
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'src', 'help', 'img');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MODE = process.argv.includes('--shots') ? 'shots' : 'pdf';

if (MODE === 'shots') require('../electron/main.cjs');

// ---------------------------------------------------------------- captures
async function shots() {
  await wait(2500);
  const win = BrowserWindow.getAllWindows()[0];
  win.setSize(1280, 800);
  await wait(500);
  const wc = win.webContents;
  const run = (js) => wc.executeJavaScript(`(async () => { ${js} })()`);
  const snap = async (name) => {
    await wait(700);
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(IMG, `${name}.jpg`), img.resize({ width: 1280 }).toJPEG(80));
    console.log('capture', name);
  };
  fs.mkdirSync(IMG, { recursive: true });
  await run(`localStorage.clear();`);
  wc.reload();
  await wait(2500);

  // Vectoriser (exemple intégré)
  await run(`document.querySelector('.tabs [data-tab="vector"]').click();`);
  for (let i = 0; i < 40; i++) {
    await wait(250);
    const n = await run(`const d = document.querySelector('#vectorFrame').contentDocument; return d && d.querySelector('#s-paths') ? +d.querySelector('#s-paths').textContent.replace(/\\s/g,'') : 0;`);
    if (n) break;
  }
  await snap('vectoriser');

  // Relief SVG : exemple de test
  const svg = fs.readFileSync(path.join(ROOT, 'test', 'sample.svg'), 'utf8');
  await run(`document.querySelector('.tabs [data-tab="print"]').click();
    const f = new File([${JSON.stringify(svg)}], 'logo.svg', { type: 'image/svg+xml' });
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.querySelector('#fileInput'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));`);
  await wait(800);
  await run(`document.querySelector('#fitBtn').click();`);
  await snap('relief');
  await run(`document.querySelector('#sliceBtn').click();`);
  for (let i = 0; i < 100; i++) { await wait(200); if (await run(`return !document.querySelector('#saveBtn').disabled;`)) break; }
  await run(`const s = document.querySelector('#layerSlider'); s.value = String(Math.round(s.max * 0.6)); s.dispatchEvent(new Event('input'));`);
  await snap('relief-couches');

  // Modèle 3D : projet 3MF deux couleurs (repris du test de bout en bout)
  const { zipSync, strToU8 } = require('fflate');
  const boxXml = (x0, y0, z0, x1, y1, z1) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const fc = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    return `<mesh><vertices>${v.map((p) => `<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}</vertices><triangles>${fc.map((t) => `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('')}</triangles></mesh>`;
  };
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>
<object id="1" type="model" name="Patte">${boxXml(0, 0, 0, 14, 14, 70)}</object>
<object id="2" type="model" name="Pied">${boxXml(-6, -6, 0, 6, 6, 18)}</object>
<object id="3" type="model" name="Chapeau">${boxXml(-20, -20, 18, 20, 20, 24)}</object>
<object id="4" type="model" name="Champignon"><components><component objectid="2"/><component objectid="3"/></components></object>
</resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 60 60 0"/><item objectid="4" transform="1 0 0 0 1 0 0 0 1 150 150 0"/></build></model>`;
  const cfg = '<?xml version="1.0"?><config><object id="1"><metadata key="name" value="Patte"/><metadata key="extruder" value="1"/></object><object id="4"><metadata key="name" value="Champignon"/><metadata key="extruder" value="2"/></object></config>';
  const zip = zipSync({ '3D/3dmodel.model': strToU8(model), 'Metadata/model_settings.config': strToU8(cfg), 'Metadata/project_settings.config': strToU8(JSON.stringify({ filament_colour: ['#F2F2F2', '#E0473A'], filament_type: ['PLA', 'PLA'] })) });
  const b64 = Buffer.from(zip).toString('base64');
  await run(`document.querySelector('.tabs [data-tab="model"]').click();
    document.querySelector('#m3PrinterSeg [data-printer="cc"]').click();`);
  await wait(600);
  await run(`const bin = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'exemple-2-couleurs.3mf'));
    const inp = document.querySelector('#m3File'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));`);
  await wait(1500);
  await run(`document.querySelector('#m3Orient').click();`);
  await wait(1500);
  await snap('m3-pieces');
  await run(`document.querySelector('#m3Slice').click();`);
  for (let i = 0; i < 240; i++) { await wait(500); if (await run(`return !document.querySelector('#m3Send').disabled;`)) break; }
  await run(`const s = document.querySelector('#m3Layer'); s.value = String(Math.round(s.max * 0.55)); s.dispatchEvent(new Event('input'));`);
  await snap('m3-couches');

  // Aide elle-même
  await run(`document.querySelector('.tabs [data-tab="help"]').click(); window.__help.openTopic('m3-orient');`);
  await snap('aide');
  // Vue téléphone
  win.setMinimumSize(300, 400);
  win.setSize(400, 860);
  await run(`document.querySelector('.tabs [data-tab="model"]').click(); document.querySelector('[data-m3view="model"]').click();`);
  await wait(800);
  const img = await wc.capturePage();
  fs.writeFileSync(path.join(IMG, 'telephone.jpg'), img.toJPEG(82));
  console.log('capture telephone');
}

// ---------------------------------------------------------------- PDF
async function buildPdf() {
  const { TOPICS } = await import(require('url').pathToFileURL(path.join(ROOT, 'src', 'help', 'content.js')).href);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const children = (id) => TOPICS.filter((t) => t.parent === id);
  const order = [];
  const num = {};
  const depth = {};
  (function walk(parent, prefix, d) {
    children(parent).forEach((t, i) => { num[t.id] = prefix ? `${prefix}.${i + 1}` : `${i + 1}`; depth[t.id] = d; order.push(t); walk(t.id, num[t.id], d + 1); });
  })(null, '', 0);
  const css = fs.readFileSync(path.join(__dirname, 'pdf.css'), 'utf8');
  const imgDir = 'file://' + IMG.replace(/\\/g, '/') + '/';
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const page = (pages) => {
    const toc = order.map((t) => `<li class="d${depth[t.id]}"><a href="#s-${t.id}"><span class="n">${num[t.id]}</span><span class="t">${t.title}</span><span class="dots"></span><span class="p">${pages[t.id] ?? '00'}</span></a></li>`).join('');
    const body = order.map((t) => {
      const h = depth[t.id] === 0 ? 'h1' : depth[t.id] === 1 ? 'h2' : 'h3';
      const html = t.html.replace(/ loading="lazy"/g, '').replace(/src="help\/img\//g, `src="${imgDir}`).replace(/href="#([a-z0-9-]+)"/g, 'href="#s-$1"');
      return `<section class="${depth[t.id] === 0 ? 'chap' : 'sub'}" id="s-${t.id}"><${h}><span class="hn">${num[t.id]}</span> ${t.title}</${h}>${html}</section>`;
    }).join('\n');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>SVG2Print — Guide d’utilisation</title><style>${css}</style></head><body>
<section class="cover">
  <div class="logo"><svg viewBox="0 0 24 24"><path d="M3 18h18v3H3z" fill="currentColor" opacity=".45"/><path d="M6 14c2-6 5-9 6-9s4 3 6 9h-3c-1-3-2-5-3-5s-2 2-3 5z" fill="currentColor"/></svg></div>
  <h1>SVG2Print</h1>
  <p class="sub">Guide d’utilisation</p>
  <p class="lead">Vectoriser une image, imprimer un SVG en relief, trancher des modèles 3D en une ou plusieurs couleurs, surveiller ses imprimantes.</p>
  <div class="hflow"><span>Vectoriser</span><i>→</i><span>Relief SVG</span><i>→</i><span>Modèle 3D</span><i>→</i><span>Surveiller</span></div>
  <img class="shot" src="${imgDir}m3-couches.jpg" alt="">
  <p class="meta">Elegoo Centauri Carbon (CANVAS) · Creality K1 / K1C · Android et Windows<br>Version ${pkg.version} · ${today}</p>
</section>
<section class="toc"><h1>Sommaire</h1><ol>${toc}</ol></section>
${body}
</body></html>`;
  };

  const out = path.join(__dirname, 'SVG2Print-Guide.pdf');
  const tmp = path.join(__dirname, '.guide.html');
  const win = new BrowserWindow({ show: false, width: 1200, height: 1600 });
  const print = async (pages) => {
    fs.writeFileSync(tmp, page(pages));
    await win.loadFile(tmp);
    await win.webContents.executeJavaScript('Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))');
    await wait(300);
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4', printBackground: true, displayHeaderFooter: true,
      margins: { top: 0.65, bottom: 0.65, left: 0.6, right: 0.6 },
      headerTemplate: '<div style="font:8px Helvetica,Arial,sans-serif;color:#7a8794;width:100%;padding:0 14mm;text-align:right">SVG2Print — Guide d’utilisation</div>',
      footerTemplate: '<div style="font:8px Helvetica,Arial,sans-serif;color:#7a8794;width:100%;padding:0 14mm;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    fs.writeFileSync(out, pdf);
  };
  // Passe 1 : repérer la page de chaque titre
  await print({});
  const txtPages = execFileSync('pdftotext', ['-layout', out, '-']).toString().split('\f');
  const pages = {};
  const tocEnd = txtPages.findIndex((p, i) => i > 1 && /\b1\s+Présentation/.test(p) && !/Sommaire/.test(p));
  for (const t of order) {
    const needle = new RegExp(`(^|\\n)\\s*${num[t.id].replace(/\./g, '\\.')}\\s+${t.title.slice(0, 18).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}`);
    for (let i = Math.max(2, tocEnd); i < txtPages.length; i++) if (needle.test(txtPages[i])) { pages[t.id] = i + 1; break; }
  }
  const missing = order.filter((t) => !pages[t.id]).map((t) => num[t.id]);
  if (missing.length) console.log('pages non trouvées :', missing.join(', '));
  // Passe 2 : sommaire avec numéros de page
  await print(pages);
  fs.unlinkSync(tmp);
  console.log('PDF :', out, (fs.statSync(out).size / 1024).toFixed(0), 'Kio', txtPages.length - 1, 'pages');
}

app.whenReady().then(async () => {
  let code = 0;
  try { if (MODE === 'shots') await shots(); else await buildPdf(); } catch (e) { console.error(e); code = 1; }
  app.exit(code);
});
