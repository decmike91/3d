# Guides 3D : lecture, sommaires et recherche

Les trois guides PDF réunis dans une appli de consultation **sans connexion** :

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

Page **Releases** du dépôt, version « Guides 3D » (tag `guides-3d`), mise à jour à chaque modification :

- `Guides3D-android.apk` : appli Android (Android 7 et plus, aucune permission).
- `Guides3D.html` : un seul fichier à ouvrir dans n'importe quel navigateur (images incluses, environ 55 Mo).
- `Guides3D-site.zip` : site complet installable (PWA) à héberger, par exemple sur GitHub Pages.

## Comment c'est fait

Les PDF sont des pages en image. Chaque page a été convertie en WebP (`data/pages/`) et son texte reconnu par OCR (Tesseract, français), avec la position de chaque mot pour le surlignage (`data/text/`). Les sommaires sont dans `data/books.json` : celui de FreeCAD vient du sommaire du PDF, ceux de Creality Print et du Guide ont été établis page par page.

| Dossier / fichier | Rôle |
|---|---|
| `data/` | Images des pages, texte reconnu, sommaires |
| `src/index.html` | Application (mise en page, lecteur, recherche) |
| `build.mjs` | Construit `web/` (site + manifeste + service worker), sans dépendance |
| `tools/single.py` | Fabrique `Guides3D.html` (fichier unique) |
| `tools/ocr.sh`, `tools/prepare.py` | Régénèrent `data/` à partir des PDF |
| `android/` | Appli Android (WebView sur le site embarqué), id `fr.guides3d.app` |

## Construire

```bash
cd guides-3d
node build.mjs                                       # → web/ (ouvrir web/index.html)
python3 tools/single.py web/index.html Guides3D.html # fichier unique (Pillow)
cd android && ./gradlew assembleRelease              # APK (JDK 17+, SDK Android API 36)
```

Pousser sur `main` relance la compilation GitHub (`.github/workflows/guides-3d.yml`) : site, fichier unique et APK signé, publiés dans Releases.
L'APK est signé avec la clé fixe `android/guides3d.keystore` (mot de passe `guides3d`), pour que chaque version s'installe par-dessus la précédente. Pour une autre clé : variables `GUIDES_KEYSTORE_FILE`, `GUIDES_KEYSTORE_PASSWORD`, `GUIDES_KEY_ALIAS`, `GUIDES_KEY_PASSWORD`.

## Mettre à jour un guide

Remplacer un PDF demande de refaire les images et l'OCR (Tesseract avec la langue `fra`, poppler-utils, Pillow) :

```bash
for p in $(seq 1 200); do OCR_DIR=/tmp/ocr tools/ocr.sh gi Guide_impression_3D_complet_A5.pdf $p; done   # idem cp et fc
python3 tools/prepare.py --pdf-dir <dossier des PDF> --ocr-dir /tmp/ocr --pages
```

Les titres de page et les sections se corrigent dans `tools/prepare.py`.
