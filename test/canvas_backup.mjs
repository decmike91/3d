// Mes CANVAS : mémoire par imprimante (bobines modifiées / retirées) et secours à l'envoi.
import http from 'http';
import { WebSocketServer } from 'ws';

// localStorage minimal pour le module de mémoire
const mem = {};
globalThis.localStorage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const { canvasOf, applyRead, editTray, resetTray, backupsFor, updateCanvas } = await import('../src/core/canvasstore.js');
const { ccCanvas, canvasSlotMap } = await import('../src/net/printers.js');

let ok = true;
const check = (c, m) => { console.log(`${c ? 'OK ' : 'ÉCHEC'} ${m}`); if (!c) ok = false; };

// Faux CANVAS : 1 PLA blanc, 2 PETG rouge, 3 vide, 4 PLA noir ; recharge automatique désactivée
const srv = http.createServer((_q, r) => { r.writeHead(404); r.end(); });
const wss = new WebSocketServer({ server: srv, path: '/websocket' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ Attributes: { MainboardID: 'cv1' }, MainboardID: 'cv1', Topic: 'sdcp/attributes/cv1' }));
  ws.on('message', (m) => {
    const j = JSON.parse(m.toString());
    if (j.Data.Cmd === 324) {
      return ws.send(JSON.stringify({ Id: j.Id, Data: { Cmd: 324, RequestID: j.Data.RequestID, MainboardID: 'cv1', Data: { Data: { auto_refill: false, active_canvas_id: 0, active_tray_id: 0, canvas_list: [{ canvas_id: 0, connected: 1, tray_list: [
        { tray_id: 0, brand: 'eSUN', filament_type: 'PLA', filament_color: '#FFFFFF', status: 2 },
        { tray_id: 1, brand: 'eSUN', filament_type: 'PETG', filament_color: 'FF0000', status: 1 },
        { tray_id: 2, filament_type: '', status: 0 },
        { tray_id: 3, filament_type: 'PLA', filament_color: '#000000', status: 1 }] }], Ack: 0 } } }, Topic: 'sdcp/response/cv1' }));
    }
    ws.send(JSON.stringify({ Id: j.Id, Data: { Cmd: j.Data.Cmd, Data: { Ack: 0 }, RequestID: j.Data.RequestID, MainboardID: 'cv1' }, Topic: 'sdcp/response/cv1' }));
  });
});
await new Promise((r) => srv.listen(3030, r));

try {
  const IP = '127.0.0.1';
  const read = await ccCanvas(IP, '');
  check(read.autoRefill === false && read.trays.length === 4, `lecture : 4 bobines, recharge automatique ${read.autoRefill}`);

  // Bobine 3 : couleur choisie dans l'appli, gardée après une nouvelle lecture
  editTray(IP, 2, { color: '#22AA44', mat: 'pla_hs' });
  applyRead(IP, read);
  let p = canvasOf(IP);
  check(p.trays[2].color === '#22AA44' && p.trays[2].edited, 'couleur de la bobine 3 gardée après lecture');
  check(p.trays[1].color === '#FF0000' && p.trays[1].mat.startsWith('petg'), 'bobine 2 non modifiée : reprise de l’imprimante (PETG rouge)');
  resetTray(IP, 0);
  check(canvasOf(IP).trays[0].color === '#FFFFFF', 'valeurs de l’imprimante rétablies');

  // Deux CANVAS indépendants
  editTray('192.168.1.51', 2, { color: '#123456' });
  check(canvasOf('192.168.1.51').trays[2].color === '#123456' && canvasOf(IP).trays[2].color === '#22AA44', 'deux imprimantes, deux CANVAS séparés');

  // Secours « même matière » : la bobine 3 (vide) est remplacée par une bobine PLA chargée
  p = canvasOf(IP);
  const logs = [];
  const opts = { profile: p, backups: (i) => backupsFor(p, i) };
  const map = await canvasSlotMap(IP, 'cv1', [{ t: 2, type: 'PLA' }, { t: 1, type: 'PETG' }], (m) => logs.push(m), opts);
  console.log('   ', logs.join(' | '));
  check(map[0].tray_id === 0 || map[0].tray_id === 3, `bobine 3 vide → bobine ${map[0].tray_id + 1} (PLA)`);
  check(map[1].tray_id === 1, 'bobine 2 (PETG) conservée');
  check(logs.some((l) => /Recharge automatique/.test(l)), 'conseil : activer la recharge automatique sur l’imprimante');

  // Bobine retirée dans l'appli : jamais utilisée
  editTray(IP, 0, { removed: true });
  p = canvasOf(IP);
  const map2 = await canvasSlotMap(IP, 'cv1', [{ t: 0, type: 'PLA' }], () => {}, { profile: p, backups: (i) => backupsFor(p, i) });
  check(map2[0].tray_id === 3, 'bobine 1 retirée → bobine 4 (PLA)');

  // Secours « même couleur » : pas de PLA blanc ailleurs → envoi refusé
  updateCanvas(IP, (q) => { q.backup = 'color'; });
  p = canvasOf(IP);
  let refused = false;
  try { await canvasSlotMap(IP, 'cv1', [{ t: 0, type: 'PLA' }], () => {}, { profile: p, backups: (i) => backupsFor(p, i) }); } catch (e) { refused = /aucune bobine compatible/.test(e.message); }
  check(refused, 'mode « même couleur » sans bobine identique : envoi refusé');
} catch (e) { console.error(e); ok = false; }
srv.close();
for (const c of wss.clients) c.terminate();
console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
process.exit(ok ? 0 : 1);
