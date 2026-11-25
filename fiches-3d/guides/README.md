# Guides illustrés (rubrique 7 des Fiches 3D)

Les trois guides PDF, consultables **sans connexion** dans l'appli Fiches 3D (menu, rubrique 7, ou lien sur la page d'accueil) :

| Guide | Pages | Sommaire |
|---|---|---|
| Creality Print en fiches | 128 | 11 modules, fiches 01 à 80, bonus entretien |
| FreeCAD pas à pas | 149 | 11 modules, fiches 01 à 100, bonus 1 à 4 et 50 projets |
| Guide impression 3D complet | 200 | imprimante, 20 filaments, 50 projets, 26 erreurs, supports, checklists |

- **Lecture** des pages d'origine : glisser pour tourner la page, pincer ou double-toucher pour zoomer, flèches du clavier sur ordinateur.
- **Sommaire** de chaque guide (sections repliables, titre de chaque page) ou **vignettes**.
- **Recherche** dans le texte des 477 pages, sans tenir compte des accents ; les mots trouvés sont **surlignés sur la page**. Le bouton **T** affiche le texte de la page.
- **Repères** (étoile) et reprise à la dernière page lue ; thème clair ou sombre.

## Télécharger

Page **Releases** du dépôt, version « Fiches impression 3D » (tag `fiches-3d`) :

- `Fiches3D-android.apk` : l'appli Fiches 3D, guides compris.
- `Guides3D.html` : les 3 guides en un seul fichier à ouvrir dans n'importe quel navigateur (images incluses, environ 55 Mo).
- `Fiches3D-site.zip` : fiches et guides, en site installable (PWA).

## Comment c'est fait

Les PDF sont des pages en image. Chaque page a été convertie en WebP (`data/pages/`) et son texte reconnu par OCR (Tesseract, français), avec la position de chaque mot pour le surlignage (`data/text/`). Les sommaires sont dans `data/books.json` : celui de FreeCAD vient du sommaire du PDF, ceux de Creality Print et du Guide ont été établis page par page.

| Dossier / fichier | Rôle |
|---|---|
| `data/` | Images des pages, texte reconnu, sommaires |
| `src/index.html` | Application (mise en page, lecteur, recherche) |
| `build.mjs` | Construit `../web/guides/`, sans dépendance (appelé par `../build.mjs`) |
| `tools/single.py` | Fabrique `Guides3D.html` (fichier unique) |
| `tools/ocr.sh`, `tools/prepare.py` | Régénèrent `data/` à partir des PDF |

## Construire

```bash
cd fiches-3d
node build.mjs                                                          # fiches + guides → web/ (ouvrir web/guides/index.html)
python3 guides/tools/single.py web/guides/index.html Guides3D.html      # fichier unique (Pillow)
```

L'APK et la release sont produits par `.github/workflows/fiches-3d.yml`, comme pour les fiches.

## Mettre à jour un guide

Remplacer un PDF demande de refaire les images et l'OCR (Tesseract avec la langue `fra`, poppler-utils, Pillow) :

```bash
for p in $(seq 1 200); do OCR_DIR=/tmp/ocr guides/tools/ocr.sh gi Guide_impression_3D_complet_A5.pdf $p; done   # idem cp et fc
python3 guides/tools/prepare.py --pdf-dir <dossier des PDF> --ocr-dir /tmp/ocr --pages
```

Les titres de page et les sections se corrigent dans `guides/tools/prepare.py`.
