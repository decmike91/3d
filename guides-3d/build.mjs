// Construit le site de lecture hors connexion (web/) à partir de data/ et src/index.html.
// Usage : node build.mjs   →  web/index.html, data/*.js, pages/, manifeste, service worker, icônes
// Aucune dépendance : Node 18+ suffit.
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname);
const data = path.join(here, 'data');
const out = path.join(here, 'web');
const version = process.env.GUIDES_VERSION || `1.0.${process.env.GITHUB_RUN_NUMBER || 'dev'}`;

const books = JSON.parse(fs.readFileSync(path.join(data, 'books.json'), 'utf8'));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'data'), { recursive: true });

// Données en .js (et non .json) : chargées par <script>, elles fonctionnent aussi en file:// et dans l'appli Android.
fs.writeFileSync(path.join(out, 'data', 'books.js'), `window.G3D_BOOKS=${JSON.stringify(books)};\n`);
for (const b of books) {
  const text = fs.readFileSync(path.join(data, 'text', `${b.id}.json`), 'utf8');
  fs.writeFileSync(path.join(out, 'data', `text-${b.id}.js`), `(window.G3D_TEXT=window.G3D_TEXT||{}).${b.id}=${text};\n`);
  const n = fs.readdirSync(path.join(data, 'pages', b.id)).filter((f) => f.endsWith('.webp')).length;
  if (n !== b.pages) throw new Error(`${b.id} : ${n} images pour ${b.pages} pages`);
}
fs.cpSync(path.join(data, 'pages'), path.join(out, 'pages'), { recursive: true });
for (const f of ['icon.svg', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(here, 'assets', f), path.join(out, f));

const head = `<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<meta name="generator" content="Guides 3D ${version}">`;
const html = fs.readFileSync(path.join(here, 'src', 'index.html'), 'utf8')
  .replace('<!--HEAD-->', head)
  .replace('<!--DATA-->', '<script src="data/books.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Guides 3D', short_name: 'Guides 3D', lang: 'fr', start_url: './', display: 'standalone',
  background_color: '#e9ecef', theme_color: '#232a31',
  description: 'Creality Print en fiches, FreeCAD pas à pas et le Guide impression 3D complet, hors connexion.',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
}, null, 1));

// Service worker : l'application et le texte sont mis en cache à l'installation, les pages au fil de la lecture.
const core = ['./', 'index.html', 'data/books.js', ...books.map((b) => `data/text-${b.id}.js`), 'icon.svg', 'icon-192.png', 'manifest.webmanifest',
  ...books.map((b) => `pages/${b.id}/t/001.webp`)];
fs.writeFileSync(path.join(out, 'sw.js'), `const CACHE = 'guides3d-${version}';
const CORE = ${JSON.stringify(core)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const isPage = /\\/pages\\//.test(e.request.url);
  e.respondWith(isPage
    ? caches.match(e.request).then((r) => r || fetch(e.request).then((n) => { const c = n.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return n; }))
    : fetch(e.request).then((n) => { const c = n.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return n; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
`);
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, f) => a + (f.isDirectory() ? size(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size), 0);
console.log(`web/ construit (version ${version}, ${books.reduce((a, b) => a + b.pages, 0)} pages, ${(size(out) / 1048576).toFixed(1)} Mio)`);
