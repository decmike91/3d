// Couche réseau multiplateforme.
// - Windows (Electron) : requêtes HTTP faites par le processus principal (pas de CORS).
// - Android (Capacitor) : plugin natif PrinterNet (HttpURLConnection, pas de CORS).
// - Navigateur : fetch classique (peut être bloqué par CORS selon l'imprimante).

export function platform() {
  if (globalThis.electronAPI) return 'windows';
  const C = globalThis.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform()) return 'android';
  return 'web';
}

export function toBase64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

/** Erreur levée quand l'utilisateur annule un envoi. */
export class CancelledError extends Error {
  constructor() { super('Envoi annulé.'); this.name = 'CancelledError'; this.cancelled = true; }
}
export function throwIfCancelled(signal) { if (signal && signal.aborted) throw new CancelledError(); }
/** Attente interrompue par l'annulation. */
export function sleep(ms, signal) {
  return new Promise((res, rej) => {
    if (signal && signal.aborted) return rej(new CancelledError());
    const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', on); res(); }, ms);
    const on = () => { clearTimeout(t); rej(new CancelledError()); };
    if (signal) signal.addEventListener('abort', on, { once: true });
  });
}

let reqSeq = 0;
/**
 * req : { url, method, headers, body: Uint8Array|string|undefined, timeoutMs, signal }
 * -> { status, text }
 * signal (AbortSignal) : annule la requête en cours, y compris le téléversement natif.
 */
export async function http(req) {
  const method = req.method || 'GET';
  const headers = req.headers || {};
  const timeoutMs = req.timeoutMs || 15000;
  const signal = req.signal;
  throwIfCancelled(signal);
  let bytes = req.body;
  if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
  const p = platform();
  const id = `r${++reqSeq}`;
  let doCancel = () => {};
  let pending;
  if (p === 'windows') {
    pending = globalThis.electronAPI.http({ id, url: req.url, method, headers, bodyBase64: bytes ? toBase64(bytes) : null, timeoutMs });
    doCancel = () => globalThis.electronAPI.httpCancel && globalThis.electronAPI.httpCancel(id);
  } else if (p === 'android') {
    const plugin = globalThis.Capacitor.Plugins.PrinterNet;
    pending = plugin.request({ id, url: req.url, method, headers, bodyBase64: bytes ? toBase64(bytes) : '', timeoutMs });
    doCancel = () => plugin.cancelRequest && plugin.cancelRequest({ id }).catch(() => {});
  } else {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    doCancel = () => ctl.abort();
    pending = fetch(req.url, { method, headers, body: bytes, signal: ctl.signal })
      .then(async (r) => ({ status: r.status, text: await r.text() }))
      .finally(() => clearTimeout(t));
  }
  if (!signal) return pending;
  let onAbort;
  const aborted = new Promise((_, rej) => { onAbort = () => { doCancel(); rej(new CancelledError()); }; signal.addEventListener('abort', onAbort, { once: true }); });
  pending.catch(() => {}); // erreur de la requête coupée : ignorée après annulation
  try { return await Promise.race([pending, aborted]); } finally { signal.removeEventListener('abort', onAbort); }
}

export function buildMultipart(fields, file) {
  const boundary = '----SVG2Print' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const enc = new TextEncoder();
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (file) {
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`));
    parts.push(file.bytes);
    parts.push(enc.encode('\r\n'));
  }
  parts.push(enc.encode(`--${boundary}--\r\n`));
  const len = parts.reduce((a, p) => a + p.length, 0);
  const body = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { body.set(p, o); o += p.length; }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export function uuidHex() {
  const b = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = (Math.random() * 256) | 0));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
