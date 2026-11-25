#!/usr/bin/env python3
"""Fabrique Guides3D.html : un seul fichier, images incluses (réduites), à ouvrir dans n'importe quel navigateur.
Usage (dans fiches-3d/) : python3 guides/tools/single.py web/guides/index.html Guides3D.html   (après « node build.mjs » ; nécessite Pillow)
"""
import base64, glob, io, json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
WIDTH, QUALITY = 860, 55


def uri(path, width=None, q=QUALITY):
    if width is None:
        raw = open(path, 'rb').read()
    else:
        im = Image.open(path).convert('RGB')
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=q, method=5); raw = buf.getvalue()
    return 'data:image/webp;base64,' + base64.b64encode(raw).decode()


def main(src_html, dst):
    books = json.load(open(os.path.join(DATA, 'books.json'), encoding='utf-8'))
    parts = [f'<script>window.G3D_BOOKS={json.dumps(books, ensure_ascii=False)};window.G3D_TEXT={{}};window.G3D_IMG={{}};</script>']
    for b in books:
        k = b['id']
        text = open(os.path.join(DATA, 'text', f'{k}.json'), encoding='utf-8').read()
        pages = sorted(glob.glob(os.path.join(DATA, 'pages', k, '*.webp')))
        thumbs = sorted(glob.glob(os.path.join(DATA, 'pages', k, 't', '*.webp')))
        parts.append(f'<script>G3D_TEXT.{k}={text};</script>')
        parts.append(f'<script>G3D_IMG.{k}={{t:{json.dumps([uri(t) for t in thumbs])},p:{json.dumps([uri(p, WIDTH) for p in pages])}}};</script>')
        print(k, len(pages), 'pages', flush=True)
    html = open(src_html, encoding='utf-8').read()
    icon = 'data:image/svg+xml;base64,' + base64.b64encode(open(os.path.join(HERE, '..', 'assets', 'icon.svg'), 'rb').read()).decode()
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '')
    html = html.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', f'<link rel="icon" href="{icon}">')
    html = html.replace('<link rel="apple-touch-icon" href="icon-192.png">', '')
    html = html.replace('<script src="data/books.js"></script>', '\n'.join(parts))
    open(dst, 'w', encoding='utf-8').write(html)
    print(dst, f'{os.path.getsize(dst) / 1048576:.1f} Mio')


if __name__ == '__main__':
    main(*sys.argv[1:3])
