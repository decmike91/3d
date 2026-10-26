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

/**
 * req : { url, method, headers, body: Uint8Array|string|undefined, timeoutMs }
 * -> { status, text }
 */
export async function http(req) {
  const method = req.method || 'GET';
  const headers = req.headers || {};
  const timeoutMs = req.timeoutMs || 15000;
  let bytes = req.body;
  if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
  const p = platform();
  if (p === 'windows') {
    return globalThis.electronAPI.http({ url: req.url, method, headers, bodyBase64: bytes ? toBase64(bytes) : null, timeoutMs });
  }
  if (p === 'android') {
    const plugin = globalThis.Capacitor.Plugins.PrinterNet;
    return plugin.request({ url: req.url, method, headers, bodyBase64: bytes ? toBase64(bytes) : '', timeoutMs });
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(req.url, { method, headers, body: bytes, signal: ctl.signal });
    return { status: r.status, text: await r.text() };
  } finally {
    clearTimeout(t);
  }
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
