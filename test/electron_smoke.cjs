// Test de fumée : lance l'appli Electron, charge un SVG, tranche, envoie à un faux Moonraker via IPC.
const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
require('../electron/main.cjs');
let got = null;
const srv = http.createServer((req, res) => {
  let n = 0; req.on('data', (d) => (n += d.length));
  req.on('end', () => {
    if (req.url === '/server/info') return res.end('{"result":{"klippy_state":"ready"}}');
    if (req.url.startsWith('/printer/objects')) return res.end('{"result":{"status":{"print_stats":{"state":"standby"}}}}');
    if (req.url === '/server/files/upload') { got = n; return res.end('{"print_started":true}'); }
    res.writeHead(404); res.end();
  });
}).listen(17126);
app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  const wc = BrowserWindow.getAllWindows()[0].webContents;
  const svg = fs.readFileSync(__dirname + '/sample.svg', 'utf8');
  const out = await wc.executeJavaScript(`(async () => {
    const r = { api: !!window.electronAPI };
    const f = new File([${JSON.stringify(svg)}], 'sample.svg', { type: 'image/svg+xml' });
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.querySelector('#fileInput'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 500));
    document.querySelector('#printerSeg button[data-printer="k1"]').click();
    const host = document.querySelector('[data-k="host"]'); host.value = '127.0.0.1'; host.dispatchEvent(new Event('change', {bubbles:true}));
    const port = document.querySelector('[data-k="port"]'); port.value = '17126'; port.dispatchEvent(new Event('change', {bubbles:true}));
    document.querySelector('#sliceBtn').click();
    for (let i=0;i<100 && document.querySelector('#saveBtn').disabled;i++) await new Promise(r=>setTimeout(r,100));
    document.querySelector('#sendBtn').click();
    await new Promise(r => setTimeout(r, 2000));
    r.log = document.querySelector('#log').innerText;
    r.stats = document.querySelector('#stats').innerText.replace(/\\n/g,' ');
    return r;
  })()`);
  console.log(JSON.stringify(out, null, 1), '\nupload bytes reçus:', got);
  srv.close(); app.quit();
});
