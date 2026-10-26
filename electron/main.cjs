// Processus principal Windows (Electron) : fenêtre + réseau sans restriction CORS.
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 380, minHeight: 600,
    backgroundColor: '#1c2733',
    title: 'SVG2Print',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

ipcMain.handle('http', async (_e, req) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), req.timeoutMs || 15000);
  try {
    const r = await fetch(req.url, {
      method: req.method || 'GET',
      headers: req.headers || {},
      body: req.bodyBase64 ? Buffer.from(req.bodyBase64, 'base64') : undefined,
      signal: ctl.signal,
    });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'délai dépassé' : (e.cause && e.cause.code) || e.message);
  } finally { clearTimeout(t); }
});

ipcMain.handle('saveFile', async (e, name, content) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'G-code', extensions: ['gcode'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, content, 'utf8');
  return r.filePath;
});

// Découverte des Centauri Carbon (SDCP : diffusion UDP "M99999" sur le port 3000)
ipcMain.handle('discover', () => new Promise((resolve) => {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const found = new Map();
  sock.on('message', (msg, rinfo) => {
    try {
      const j = JSON.parse(msg.toString());
      const d = j.Data || j;
      found.set(rinfo.address, { ip: d.MainboardIP || rinfo.address, name: d.Name || d.MachineName, mainboardId: d.MainboardID || j.Id || '' });
    } catch {}
  });
  sock.bind(() => {
    sock.setBroadcast(true);
    const m = Buffer.from('M99999');
    sock.send(m, 3000, '255.255.255.255');
    setTimeout(() => sock.send(m, 3000, '255.255.255.255'), 600);
  });
  setTimeout(() => { try { sock.close(); } catch {} resolve([...found.values()]); }, 2500);
}));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
