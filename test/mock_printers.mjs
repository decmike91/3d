// Faux serveurs Moonraker et SDCP pour tester l'envoi sans imprimante.
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import { k1Send, ccSend, ccStatus } from '../src/net/printers.js';

function readBody(req) { return new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }); }
function parseMultipart(buf, ct) {
  const boundary = '--' + /boundary=(.+)$/.exec(ct)[1];
  const parts = {}; let pos = 0;
  const b = Buffer.from(boundary);
  while (true) {
    const s = buf.indexOf(b, pos); if (s < 0) break;
    const e = buf.indexOf(b, s + b.length); if (e < 0) break;
    const part = buf.subarray(s + b.length + 2, e - 2);
    const he = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, he).toString();
    const name = /name="([^"]+)"/.exec(head)[1];
    const fn = /filename="([^"]+)"/.exec(head);
    parts[name] = fn ? { filename: fn[1], data: part.subarray(he + 4) } : part.subarray(he + 4).toString();
    pos = e;
  }
  return parts;
}
const gcode = fs.readFileSync('test/out_cc_positive.gcode', 'utf8');

// --- Moonraker ---
let k1Got = null;
const moon = http.createServer(async (req, res) => {
  const body = await readBody(req);
  if (req.url === '/server/info') return res.end(JSON.stringify({ result: { klippy_state: 'ready' } }));
  if (req.url.startsWith('/printer/objects/query')) return res.end(JSON.stringify({ result: { status: { print_stats: { state: 'standby' }, extruder: { temperature: 24 }, heater_bed: { temperature: 23 } } } }));
  if (req.url === '/server/files/upload') {
    const p = parseMultipart(body, req.headers['content-type']);
    k1Got = { name: p.file.filename, size: p.file.data.length, print: p.print, root: p.root };
    res.writeHead(201); return res.end(JSON.stringify({ item: { path: p.file.filename }, print_started: p.print === 'true', action: 'create_file' }));
  }
  res.writeHead(404); res.end();
}).listen(17125);

// --- SDCP (Centauri Carbon) ---
const chunks = []; let ccStart = null;
const sd = http.createServer(async (req, res) => {
  const body = await readBody(req);
  if (req.url === '/uploadFile/upload') {
    const p = parseMultipart(body, req.headers['content-type']);
    chunks.push({ off: +p.Offset, md5: p['S-File-MD5'], total: +p.TotalSize, data: p.File.data, name: p.File.filename });
    return res.end(JSON.stringify({ code: '000000', messages: null, data: {}, success: true }));
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server: sd, path: '/websocket' });
wss.on('connection', (ws) => {
  setTimeout(() => ws.send(JSON.stringify({ Attributes: { Name: 'CC', MainboardID: 'abc123' }, MainboardID: 'abc123', Topic: 'sdcp/attributes/abc123' })), 100);
  ws.on('message', (m) => {
    const j = JSON.parse(m.toString());
    if (j.Data.Cmd === 128) ccStart = j;
    ws.send(JSON.stringify({ Id: j.Id, Data: { Cmd: j.Data.Cmd, Data: { Ack: 0 }, RequestID: j.Data.RequestID, MainboardID: 'abc123' }, Topic: 'sdcp/response/abc123' }));
  });
});
sd.listen(3030);

const log = (m) => console.log('  ·', m);
try {
  console.log('K1 (Moonraker) :');
  await k1Send({ host: '127.0.0.1', port: 17125, filename: 'test_K1.gcode', gcode, start: true, log });
  console.log('  reçu =>', k1Got);
  console.log('Centauri Carbon (SDCP) :');
  const big = gcode.repeat(4); // > 1 Mio pour tester le découpage
  await ccSend({ host: '127.0.0.1', filename: 'test_CC.gcode', gcode: big, start: true, autoLevel: true, log });
  const all = Buffer.concat(chunks.sort((a, b) => a.off - b.off).map((c) => c.data));
  const md5 = crypto.createHash('md5').update(all).digest('hex');
  console.log('  blocs:', chunks.length, 'offsets', chunks.map((c) => c.off), 'taille', all.length, '/', chunks[0].total, 'md5 ok:', md5 === chunks[0].md5, 'identique:', all.toString() === big);
  console.log('  commande démarrage =>', JSON.stringify(ccStart.Data.Data), ccStart.Topic);
  const st = await ccStatus('127.0.0.1', '', log);
  console.log('  statut =>', st);
} catch (e) { console.error('ÉCHEC', e); process.exitCode = 1; }
moon.close(); sd.close(); wss.close(); process.exit();
