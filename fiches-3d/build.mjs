// Construit la version HTML hors connexion (web/) à partir des fiches Markdown (content/).
// Usage : node build.mjs   →  web/index.html, manifest, service worker, icônes
import fs from 'fs';
import path from 'path';
import { Marked } from 'marked';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, 'web');
const RUBRIQUES = [
  ['00-accueil.md', 'accueil', 'Accueil'],
  ['01-creality-print.md', 'creality-print', '1. Creality Print'],
  ['02-elegooslicer.md', 'elegooslicer', '2. ElegooSlicer'],
  ['03-problemes.md', 'problemes', "3. Problèmes d'impression"],
  ['04-remplissage.md', 'remplissage', '4. Remplissage'],
  ['05-supports.md', 'supports', '5. Supports'],
  ['06-filaments.md', 'filaments', '6. Filaments'],
];
const version = process.env.FICHES_VERSION || `1.0.${process.env.GITHUB_RUN_NUMBER || 'dev'}`;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&[a-z]+;|&#\d+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

let nav = '', sections = '';
RUBRIQUES.forEach(([file, slug, label], i) => {
  const md = fs.readFileSync(path.join(here, 'content', file), 'utf8');
  const used = new Set(), subs = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        let id = `${slug}--${slugify(strip(html)) || 'h'}`, n = 2;
        while (used.has(id)) id = `${slug}--${slugify(strip(html))}-${n++}`;
        used.add(id);
        if (depth === 2) subs.push([id, strip(html)]);
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
    },
  });
  let html = marked.parse(md);
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  const prev = RUBRIQUES[i - 1], next = RUBRIQUES[i + 1];
  const pager = '<div class="pager">'
    + (prev ? `<a class="prev" href="#/${prev[1]}"><small>← Précédent</small>${esc(prev[2])}</a>` : '<span></span>')
    + (next ? `<a class="next" href="#/${next[1]}"><small>Suivant →</small>${esc(next[2])}</a>` : '<span></span>')
    + '</div>';
  sections += `\n<section class="rubrique" id="r-${slug}">\n${html}${pager}\n</section>`;
  nav += `<div class="grp" data-slug="${slug}"><a class="rub" href="#/${slug}">${esc(label)}</a><div class="subs">`
    + subs.map(([id, t]) => `<a href="#/${slug}/${id}">${esc(t)}</a>`).join('') + '</div></div>';
});

const tpl = fs.readFileSync(path.join(here, 'src', 'template.html'), 'utf8');
const page = tpl.replace('__NAV__', () => nav).replace('__SECTIONS__', () => sections)
  .replace('<img src="icon.svg" alt="">', () => `<img src="data:image/svg+xml;base64,${fs.readFileSync(path.join(here, 'assets', 'icon.svg')).toString('base64')}" alt="">`)
  .replace('__ORDER__', JSON.stringify(RUBRIQUES.map((r) => r[1]))).replaceAll('__VERSION__', version);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), page);
fs.copyFileSync(path.join(here, 'assets', 'icon.svg'), path.join(out, 'icon.svg'));
// Icônes PNG pré-générées depuis assets/icon.svg (rsvg-convert -w 512 -h 512 …)
for (const size of [192, 512]) fs.copyFileSync(path.join(here, 'assets', `icon-${size}.png`), path.join(out, `icon-${size}.png`));
fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
  name: 'Fiches impression 3D', short_name: 'Fiches 3D', lang: 'fr', start_url: './', scope: './',
  display: 'standalone', background_color: '#1d1b19', theme_color: '#1d1b19',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
}, null, 2));
const files = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
fs.writeFileSync(path.join(out, 'sw.js'), `// Cache hors connexion, renouvelé à chaque version
const CACHE = 'fiches3d-${version}';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(${JSON.stringify(files)}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
`);
console.log(`web/ construit (version ${version}, ${(page.length / 1024).toFixed(0)} Kio)`);
