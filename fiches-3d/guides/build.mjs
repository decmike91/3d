// Construit la partie « Guides » des Fiches 3D (../web/guides/) à partir de data/ et src/index.html.
// Appelé par ../build.mjs (après les fiches) ; seul : node guides/build.mjs
// Aucune dépendance : Node 18+ suffit.
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname);
const data = path.join(here, 'data');
const out = path.join(here, '..', 'web', 'guides');
const version = process.env.FICHES_VERSION || `1.0.${process.env.GITHUB_RUN_NUMBER || 'dev'}`;

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
fs.copyFileSync(path.join(here, 'assets', 'icon.svg'), path.join(out, 'icon.svg'));

// Le manifeste et le service worker sont ceux des Fiches 3D (dossier parent).
const head = `<link rel="icon" href="icon.svg" type="image/svg+xml">
<meta name="generator" content="Fiches 3D ${version}">`;
const html = fs.readFileSync(path.join(here, 'src', 'index.html'), 'utf8')
  .replace('<!--HEAD-->', head)
  .replace('<!--DATA-->', '<script src="data/books.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, f) => a + (f.isDirectory() ? size(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size), 0);
console.log(`web/guides/ construit (version ${version}, ${books.reduce((a, b) => a + b.pages, 0)} pages, ${(size(out) / 1048576).toFixed(1)} Mio)`);
