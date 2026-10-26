// Téléversement + lancement d'impression.
// Creality K1/K1C : API Moonraker  (POST /server/files/upload, print=true)
// Elegoo Centauri Carbon : SDCP v3 (upload HTTP par blocs de 1 Mio + MD5, puis Cmd 128 via WebSocket :3030)
import { http, buildMultipart, uuidHex } from './transport.js';
import { md5 } from './md5.js';

const enc = new TextEncoder();

// ---------------- Moonraker (K1) ----------------
const MOONRAKER_PORTS = [7125, 4408, 4409, 80];

async function moonrakerBase(host, port, log) {
  const ports = port ? [port] : MOONRAKER_PORTS;
  for (const p of ports) {
    const base = `http://${host}:${p}`;
    try {
      const r = await http({ url: `${base}/server/info`, timeoutMs: 4000 });
      if (r.status === 200 && r.text.includes('klippy')) return base;
      if (r.status === 401 || r.status === 403) throw new Error(`Moonraker refuse l'accès sur le port ${p} (authentification activée ?)`);
    } catch (e) {
      if (/refuse/.test(e.message)) throw e;
      log && log(`Port ${p} : pas de réponse`);
    }
  }
  throw new Error(`Impossible de joindre l'imprimante ${host} (ports essayés : ${ports.join(', ')}). Vérifiez l'adresse IP et que le téléphone/PC est sur le même réseau.`);
}

export async function k1Status(host, port, log) {
  const base = await moonrakerBase(host, port, log);
  const r = await http({ url: `${base}/printer/objects/query?print_stats&extruder&heater_bed`, timeoutMs: 5000 });
  const j = JSON.parse(r.text).result.status;
  return {
    base,
    state: j.print_stats?.state || 'inconnu',
    nozzle: j.extruder?.temperature,
    bed: j.heater_bed?.temperature,
  };
}

export async function k1Send({ host, port, filename, gcode, start, log, onProgress }) {
  const st = await k1Status(host, port, log);
  log(`Connecté (${st.base}) — état : ${st.state}`);
  if (start && (st.state === 'printing' || st.state === 'paused')) throw new Error("L'imprimante est déjà en cours d'impression.");
  const bytes = enc.encode(gcode);
  const { body, contentType } = buildMultipart(
    { root: 'gcodes', print: start ? 'true' : 'false' },
    { field: 'file', name: filename, bytes, type: 'application/octet-stream' },
  );
  onProgress && onProgress(0.1);
  log(`Envoi de ${filename} (${(bytes.length / 1024).toFixed(0)} Kio)…`);
  const r = await http({ url: `${st.base}/server/files/upload`, method: 'POST', headers: { 'Content-Type': contentType }, body, timeoutMs: 180000 });
  if (r.status !== 200 && r.status !== 201) throw new Error(`Échec du téléversement (HTTP ${r.status}) : ${r.text.slice(0, 200)}`);
  onProgress && onProgress(1);
  let started = false;
  try { started = JSON.parse(r.text).print_started === true; } catch {}
  if (start && !started) {
    // Certaines versions ne démarrent pas via le champ print : on lance explicitement
    const r2 = await http({ url: `${st.base}/printer/print/start?filename=${encodeURIComponent(filename)}`, method: 'POST', timeoutMs: 15000 });
    if (r2.status !== 200) throw new Error(`Fichier envoyé mais démarrage refusé (HTTP ${r2.status}).`);
    started = true;
  }
  return { started };
}

// ---------------- SDCP (Centauri Carbon) ----------------
const CHUNK = 1024 * 1024;

async function sdcpUpload(host, filename, bytes, log, onProgress) {
  const digest = md5(bytes);
  const uuid = uuidHex();
  let lastErr = null;
  for (const port of [80, 3030]) {
    try {
      for (let off = 0; off < bytes.length || off === 0; off += CHUNK) {
        const chunk = bytes.subarray(off, Math.min(off + CHUNK, bytes.length));
        const { body, contentType } = buildMultipart(
          { Check: '1', 'S-File-MD5': digest, Offset: String(off), Uuid: uuid, TotalSize: String(bytes.length) },
          { field: 'File', name: filename, bytes: chunk },
        );
        const r = await http({ url: `http://${host}:${port}/uploadFile/upload`, method: 'POST', headers: { 'Content-Type': contentType }, body, timeoutMs: 120000 });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        let j;
        try { j = JSON.parse(r.text); } catch { throw new Error('réponse inattendue'); }
        if (j.code !== '000000' && j.success !== true) throw new Error(`refusé (${JSON.stringify(j.messages || j.code)})`);
        onProgress && onProgress(Math.min(1, (off + chunk.length) / bytes.length) * 0.9);
        if (bytes.length === 0) break;
      }
      return;
    } catch (e) {
      lastErr = e;
      log(`Téléversement via le port ${port} : ${e.message}`);
    }
  }
  throw new Error(`Échec du téléversement : ${lastErr?.message}. Vérifiez l'adresse IP de l'imprimante.`);
}

function findMainboard(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj.MainboardID === 'string' && obj.MainboardID) return obj.MainboardID;
  if (typeof obj.Topic === 'string') { const m = /^sdcp\/\w+\/(.+)$/.exec(obj.Topic); if (m) return m[1]; }
  for (const v of Object.values(obj)) { const r = findMainboard(v); if (r) return r; }
  return null;
}

function sdcpSession(host, mainboardHint, log) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(`ws://${host}:3030/websocket`); } catch (e) { reject(e); return; }
    const listeners = new Set();
    let mainboard = mainboardHint || null;
    let lastStatus = null;
    let resolved = false;
    const done = () => {
      if (resolved || !mainboard) return;
      resolved = true;
      clearTimeout(to);
      resolve({
        mainboard, ws, get status() { return lastStatus; },
        request(cmd, data, timeoutMs = 10000) {
          const RequestID = uuidHex();
          const msg = { Id: mainboard, Data: { Cmd: cmd, Data: data || {}, RequestID, MainboardID: mainboard, TimeStamp: Date.now(), From: 1 }, Topic: `sdcp/request/${mainboard}` };
          return new Promise((res, rej) => {
            const t = setTimeout(() => { listeners.delete(fn); rej(new Error(`Pas de réponse de l'imprimante (commande ${cmd})`)); }, timeoutMs);
            const fn = (j) => {
              if (j?.Data?.RequestID === RequestID || (j?.Data?.Cmd === cmd && /response/.test(j.Topic || ''))) {
                clearTimeout(t); listeners.delete(fn); res(j);
              }
            };
            listeners.add(fn);
            ws.send(JSON.stringify(msg));
          });
        },
        close() { try { ws.close(); } catch {} },
      });
    };
    const to = setTimeout(() => {
      if (!resolved) { try { ws.close(); } catch {} reject(new Error("L'imprimante n'a pas transmis son identifiant (MainboardID). Renseignez-le dans les réglages réseau.")); }
    }, 8000);
    ws.onerror = () => { if (!resolved) { clearTimeout(to); reject(new Error(`Connexion WebSocket impossible vers ${host}:3030`)); } };
    ws.onopen = () => {
      log && log('WebSocket connecté');
      if (mainboard) done();
    };
    ws.onmessage = (ev) => {
      let j;
      try { j = JSON.parse(ev.data); } catch { return; }
      if (!mainboard) { mainboard = findMainboard(j); if (mainboard) log && log(`Imprimante identifiée : ${mainboard}`); }
      if (/status/.test(j.Topic || '') && j.Status) lastStatus = j.Status;
      if (j.Status) lastStatus = j.Status;
      for (const fn of [...listeners]) fn(j);
      done();
    };
  });
}

export async function ccStatus(host, mainboardHint, log) {
  const s = await sdcpSession(host, mainboardHint, log);
  try {
    if (!s.status) { try { await s.request(0, {}, 4000); } catch {} }
    await new Promise((r) => setTimeout(r, 300));
    const st = s.status || {};
    const cur = st.CurrentStatus;
    return {
      mainboard: s.mainboard,
      state: Array.isArray(cur) ? (cur.includes(1) ? 'printing' : 'prêt') : 'connecté',
      nozzle: st.TempOfNozzle,
      bed: st.TempOfHotbed,
    };
  } finally { s.close(); }
}

export async function ccSend({ host, mainboardId, filename, gcode, start, autoLevel, timelapse, log, onProgress }) {
  const bytes = enc.encode(gcode);
  log(`Envoi de ${filename} (${(bytes.length / 1024).toFixed(0)} Kio)…`);
  await sdcpUpload(host, filename, bytes, log, onProgress);
  log('Fichier reçu par l’imprimante (MD5 vérifié).');
  if (!start) { onProgress && onProgress(1); return { started: false }; }
  const s = await sdcpSession(host, mainboardId, log);
  try {
    const r = await s.request(128, {
      Filename: filename,
      StartLayer: 0,
      Calibration_switch: autoLevel ? 1 : 0,
      PrintPlatformType: 0,
      Tlp_Switch: timelapse ? 1 : 0,
      slot_map: [],
      path_prefix: '/local',
    }, 15000);
    const ack = r?.Data?.Data?.Ack;
    const ACK = { 1: "imprimante occupée", 2: 'fichier introuvable', 3: 'MD5 incorrect', 4: 'erreur de lecture', 6: 'format inconnu', 7: 'modèle inconnu' };
    if (ack && ack !== 0) throw new Error(`Démarrage refusé : ${ACK[ack] || 'code ' + ack}`);
    onProgress && onProgress(1);
    return { started: true };
  } finally { s.close(); }
}

export async function sendToPrinter(printerId, opts) {
  return printerId === 'k1' ? k1Send(opts) : ccSend(opts);
}
export async function testPrinter(printerId, net, log) {
  return printerId === 'k1' ? k1Status(net.host, net.port, log) : ccStatus(net.host, net.mainboardId, log);
}
