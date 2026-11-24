// Téléversement + lancement d'impression.
// Creality K1/K1C : API Moonraker  (POST /server/files/upload, print=true)
// Elegoo Centauri Carbon : SDCP v3 (upload HTTP par blocs de 1 Mio + MD5, puis Cmd 128 via WebSocket :3030)
import { http, buildMultipart, uuidHex, platform, throwIfCancelled, sleep } from './transport.js';
import { md5 } from './md5.js';
import { checkHost } from './host.js';

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
  host = checkHost(host);
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

export async function k1Send({ host, port, filename, gcode, start, log, onProgress, signal }) {
  host = checkHost(host);
  const st = await k1Status(host, port, log);
  throwIfCancelled(signal);
  log(`Connecté (${st.base}) — état : ${st.state}`);
  if (start && (st.state === 'printing' || st.state === 'paused')) throw new Error("L'imprimante est déjà en cours d'impression.");
  const bytes = enc.encode(gcode);
  const { body, contentType } = buildMultipart(
    // Lancement séparé après le téléversement : un envoi annulé ne démarre jamais d'impression
    { root: 'gcodes', print: 'false' },
    { field: 'file', name: filename, bytes, type: 'application/octet-stream' },
  );
  onProgress && onProgress(0.1);
  log(`Envoi de ${filename} (${(bytes.length / 1024).toFixed(0)} Kio)…`);
  const r = await http({ url: `${st.base}/server/files/upload`, method: 'POST', headers: { 'Content-Type': contentType }, body, timeoutMs: 180000, signal });
  if (r.status !== 200 && r.status !== 201) throw new Error(`Échec du téléversement (HTTP ${r.status}) : ${r.text.slice(0, 200)}`);
  onProgress && onProgress(1);
  let started = false;
  if (start) {
    throwIfCancelled(signal);
    const r2 = await http({ url: `${st.base}/printer/print/start?filename=${encodeURIComponent(filename)}`, method: 'POST', timeoutMs: 15000 });
    if (r2.status !== 200) throw new Error(`Fichier envoyé mais démarrage refusé (HTTP ${r2.status}).`);
    started = true;
  }
  return { started };
}

// ---------------- SDCP (Centauri Carbon) ----------------
const CHUNK = 1024 * 1024;

async function sdcpUpload(host, filename, bytes, log, onProgress, signal) {
  const digest = md5(bytes);
  const uuid = uuidHex();
  let lastErr = null;
  for (const port of [80, 3030]) {
    try {
      for (let off = 0; off < bytes.length || off === 0; off += CHUNK) {
        throwIfCancelled(signal);
        const chunk = bytes.subarray(off, Math.min(off + CHUNK, bytes.length));
        const { body, contentType } = buildMultipart(
          { Check: '1', 'S-File-MD5': digest, Offset: String(off), Uuid: uuid, TotalSize: String(bytes.length) },
          { field: 'File', name: filename, bytes: chunk },
        );
        const r = await http({ url: `http://${host}:${port}/uploadFile/upload`, method: 'POST', headers: { 'Content-Type': contentType }, body, timeoutMs: 120000, signal });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        let j;
        try { j = JSON.parse(r.text); } catch { throw new Error('réponse inattendue'); }
        if (j.code !== '000000' && j.success !== true) throw new Error(`refusé (${JSON.stringify(j.messages || j.code)})`);
        onProgress && onProgress(Math.min(1, (off + chunk.length) / bytes.length) * 0.9);
        if (bytes.length === 0) break;
      }
      return;
    } catch (e) {
      if (e.cancelled) throw e;
      lastErr = e;
      log(`Téléversement via le port ${port} : ${e.message}`);
    }
  }
  throw new Error(`Échec du téléversement : ${lastErr?.message}. Vérifiez l'adresse IP de l'imprimante.`);
}

// Recherche UDP des Centauri du réseau ; renvoie l'identifiant de celle qui a cette adresse
async function discoverMainboard(host) {
  const p = platform();
  const list = p === 'windows' ? await globalThis.electronAPI.discover()
    : p === 'android' ? (await globalThis.Capacitor.Plugins.PrinterNet.discover()).printers : [];
  const hit = (list || []).find((x) => x && x.ip === host && x.mainboardId);
  return hit ? hit.mainboardId : null;
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
      clearInterval(probeTimer);
      resolve({
        mainboard, ws, get status() { return lastStatus; },
        request(cmd, data, timeoutMs = 10000) {
          const RequestID = uuidHex();
          const msg = { Id: mainboard, Data: { Cmd: cmd, Data: data || {}, RequestID, MainboardID: mainboard, TimeStamp: Date.now(), From: 1 }, Topic: `sdcp/request/${mainboard}` };
          return new Promise((res, rej) => {
            // Délai en deux temps : si l'appli était occupée (tranchage d'un autre modèle pendant l'envoi),
            // les réponses arrivées entre-temps sont traitées avant de conclure à une absence de réponse.
            let t = setTimeout(() => { t = setTimeout(() => { listeners.delete(fn); rej(new Error(`Pas de réponse de l'imprimante (commande ${cmd})`)); }, 200); }, timeoutMs);
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
    // Comme l'écran Surveiller : on demande les attributs (Cmd 1) et l'état (Cmd 0) sans identifiant,
    // la Centauri répond alors avec son MainboardID. On relance toutes les 1,5 s.
    const probe = () => {
      if (resolved || mainboard || ws.readyState !== 1) return;
      for (const cmd of [1, 0]) {
        ws.send(JSON.stringify({ Id: '', Data: { Cmd: cmd, Data: {}, RequestID: uuidHex(), MainboardID: '', TimeStamp: Math.floor(Date.now() / 1000), From: 1 }, Topic: 'sdcp/request/' }));
      }
    };
    const probeTimer = setInterval(probe, 1500);
    const to = setTimeout(async () => {
      await new Promise((r) => setTimeout(r, 200)); // messages reçus pendant un tranchage
      clearInterval(probeTimer);
      if (resolved) return;
      // Dernier recours : recherche réseau (UDP « M99999 ») qui renvoie aussi l'identifiant
      const found = await discoverMainboard(host).catch(() => null);
      if (found && ws.readyState === 1) { mainboard = found; log && log(`Imprimante identifiée par recherche réseau : ${found}`); done(); return; }
      try { ws.close(); } catch {}
      reject(new Error("L'imprimante n'a pas transmis son identifiant (MainboardID). Touchez « Rechercher » (saisie manuelle) ou renseignez-le dans les réglages réseau."));
    }, 8000);
    ws.onerror = () => { if (!resolved) { clearTimeout(to); reject(new Error(`Connexion WebSocket impossible vers ${host}:3030`)); } };
    ws.onopen = () => {
      log && log('WebSocket connecté');
      if (mainboard) done(); else probe();
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
  host = checkHost(host);
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

// Lecture du CANVAS (multifilament Elegoo) : commande SDCP 324.
// Chaque plateau reçoit un numéro d'emplacement (0 à 3 pour le premier CANVAS, 4 à 7 pour un second…).
export async function ccCanvas(host, mainboardHint, log) {
  host = checkHost(host);
  const s = await sdcpSession(host, mainboardHint, log);
  try {
    const r = await s.request(324, {}, 8000);
    const findList = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 5) return null;
      if (Array.isArray(o.canvas_list)) return o;
      for (const v of Object.values(o)) { const f = findList(v, depth + 1); if (f) return f; }
      return null;
    };
    const d = findList(r) || {};
    const units = Array.isArray(d.canvas_list) ? d.canvas_list : [];
    const trays = [];
    units.forEach((u, ui) => {
      if (!u || u.connected === 0) return;
      (u.tray_list || []).forEach((t, ti) => {
        const col = String(t.filament_color || '').replace('#', '');
        trays.push({
          slot: ui * 4 + (Number.isInteger(t.tray_id) && t.tray_id < 4 ? t.tray_id : ti),
          canvas_id: u.canvas_id ?? ui, tray_id: t.tray_id ?? ti,
          type: t.filament_type || '', name: t.filament_name || '', brand: t.brand || '',
          color: /^[0-9a-f]{6}/i.test(col) ? '#' + col.slice(0, 6).toUpperCase() : '',
          loaded: (t.status ?? 0) > 0, minTemp: t.min_nozzle_temp, maxTemp: t.max_nozzle_temp,
        });
      });
    });
    const ar = d.auto_refill;
    return { mainboard: s.mainboard, trays, active: { canvas: d.active_canvas_id, tray: d.active_tray_id }, autoRefill: ar == null ? null : !!ar };
  } finally { s.close(); }
}

const familyOf = (t) => (/TPU/i.test(t) ? 'TPU' : /PA|NYLON/i.test(t) ? 'PA' : /PETG|PET/i.test(t) ? 'PETG' : /PLA/i.test(t) ? 'PLA' : /ABS/i.test(t) ? 'ABS' : /ASA/i.test(t) ? 'ASA' : String(t || '').toUpperCase());

/**
 * Correspondance « outil du G-code → plateau du CANVAS » pour la commande de lancement (slot_map).
 * uses : [{ t: n° d'outil (= emplacement choisi, 0 à 3), type: 'PLA'… }]
 * Lit le CANVAS ; refuse un emplacement vide ; signale une matière différente.
 * Sans réponse du CANVAS : correspondance directe (outil n → plateau n du premier CANVAS).
 */
export async function canvasSlotMap(host, mainboardId, uses, log, opts = {}) {
  let trays = null;
  let read = null;
  try {
    read = await ccCanvas(host, mainboardId, log);
    trays = read.trays;
    if (opts.onRead) opts.onRead(read);
  } catch (e) {
    log && log(`Lecture du CANVAS impossible (${e.message}) : emplacements pris tels quels.`);
  }
  if (trays && !trays.length) throw new Error('Aucun CANVAS connecté à cette imprimante : décochez « Multifilament CANVAS » ou vérifiez le CANVAS.');
  const prof = opts.profile || null; // mémoire de l'application (bobines retirées, secours)
  const loadedOnPrinter = (i) => { const t = trays && trays.find((x) => x.slot === i); return trays ? !!(t && t.loaded) : true; };
  const usable = (i) => !(prof && prof.trays[i] && prof.trays[i].removed) && loadedOnPrinter(i);
  const desc = (i) => {
    const t = trays && trays.find((x) => x.slot === i);
    const c = prof && prof.trays[i];
    return `bobine ${i + 1}${t && t.loaded ? ` (${`${t.brand} ${t.type} ${(c && c.color) || t.color}`.replace(/\s+/g, ' ').trim()})` : ''}`;
  };
  const map = [];
  const taken = new Set();
  for (const u of uses) {
    let slot = u.t;
    if (trays && !trays.find((x) => x.slot === slot)) throw new Error(`L'emplacement ${slot + 1} n'existe pas sur ce CANVAS.`);
    if (!usable(slot)) {
      const why = prof && prof.trays[slot] && prof.trays[slot].removed ? 'retirée dans l’application' : 'vide';
      // Bobine vide ou retirée : on prend une bobine compatible chargée, si le secours est activé
      const alt = (opts.backups ? opts.backups(slot) : []).find((j) => usable(j) && !taken.has(j));
      if (alt == null) throw new Error(`La bobine ${slot + 1} du CANVAS est ${why} et aucune bobine compatible n'est chargée : chargez-la ou choisissez une autre bobine.`);
      log && log(`Bobine ${slot + 1} ${why} : ${desc(alt)} utilisée à la place (filament compatible).`);
      slot = alt;
    }
    taken.add(slot);
    const tray = trays ? trays.find((x) => x.slot === slot) : null;
    if (tray && u.type && tray.type && familyOf(tray.type) !== familyOf(u.type)) {
      log && log(`Attention : bobine ${slot + 1} chargée en ${tray.type}, tranché pour du ${u.type}.`);
    }
    map.push({ t: u.t, canvas_id: tray ? tray.canvas_id : 0, tray_id: tray ? tray.tray_id : slot });
    log && log(`Filament ${u.t + 1} → CANVAS ${desc(slot)}`);
    // Secours pendant l'impression : c'est l'imprimante qui enchaîne (recharge automatique)
    if (opts.backups) {
      const b = opts.backups(slot).filter((j) => usable(j));
      if (b.length) {
        log && log(`Secours en fin de bobine ${slot + 1} : ${b.map((j) => j + 1).join(', ')}${read && read.autoRefill === false ? ' — activez « Recharge automatique » du CANVAS sur l’écran de l’imprimante' : ''}.`);
      }
    }
  }
  return map;
}

export async function ccSend({ host, mainboardId, filename, gcode, start, autoLevel, timelapse, slotMap, log, onProgress, signal }) {
  host = checkHost(host);
  const bytes = enc.encode(gcode);
  log(`Envoi de ${filename} (${(bytes.length / 1024).toFixed(0)} Kio)…`);
  await sdcpUpload(host, filename, bytes, log, onProgress, signal);
  log('Fichier reçu par l’imprimante (MD5 vérifié).');
  if (!start) { onProgress && onProgress(1); return { started: false }; }
  throwIfCancelled(signal);
  const s = await sdcpSession(host, mainboardId, log);
  const ACK = { 1: 'imprimante occupée', 2: 'fichier introuvable', 3: 'MD5 incorrect', 4: 'erreur de lecture', 6: 'format inconnu', 7: 'modèle inconnu' };
  // Après un gros envoi, la Centauri met quelques secondes à enregistrer le fichier :
  // « fichier introuvable » → on patiente et on réessaie (environ 1 min 30), en alternant
  // les deux écritures du nom acceptées par les firmwares (« nom » + path_prefix, ou « /local/nom »).
  const waits = [0, 3, 5, 8, 10, 12, 15, 20, 20];
  try {
    let last = 0;
    for (let i = 0; i < waits.length; i++) {
      if (waits[i]) {
        log(`Fichier pas encore prêt sur l’imprimante, nouvel essai dans ${waits[i]} s…`);
        await sleep(waits[i] * 1000, signal);
      }
      throwIfCancelled(signal);
      const full = i % 2 === 1;
      const r = await s.request(128, {
        Filename: full ? `/local/${filename}` : filename,
        StartLayer: 0,
        Calibration_switch: autoLevel ? 1 : 0,
        PrintPlatformType: 0,
        Tlp_Switch: timelapse ? 1 : 0,
        slot_map: Array.isArray(slotMap) ? slotMap : [],
        ...(full ? {} : { path_prefix: '/local' }),
      }, 15000);
      last = r?.Data?.Data?.Ack ?? 0;
      if (!last) {
        if (i) log('Fichier trouvé, impression lancée.');
        onProgress && onProgress(1);
        return { started: true };
      }
      if (last !== 2) break; // autre refus : inutile d'insister
    }
    throw new Error(`Démarrage refusé : ${ACK[last] || 'code ' + last}${last === 2 ? ' — le fichier est sur l’imprimante, lancez-le depuis son écran (Fichiers › Local).' : ''}`);
  } finally { s.close(); }
}

export async function sendToPrinter(printerId, opts) {
  return printerId === 'k1' ? k1Send(opts) : ccSend(opts);
}
export async function testPrinter(printerId, net, log) {
  return printerId === 'k1' ? k1Status(net.host, net.port, log) : ccStatus(net.host, net.mainboardId, log);
}
