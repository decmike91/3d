# Fiches impression 3D (FDM)

Fiches pratiques pour débutants, consultables **sans connexion** :

| Rubrique | Fiches |
|---|---|
| 1. Creality Print 7 — tous les paramètres | CP-01 à CP-09 |
| 2. ElegooSlicer 1.5 — tous les paramètres | ES-01 à ES-09 |
| 3. Problèmes d'impression et remèdes | P-01 à P-20 |
| 4. Remplissage : motifs, avantages/inconvénients, réglages | R-01 à R-05 |
| 5. Supports : efficacité et retrait propre | S-01 à S-09 |
| 6. Filaments PLA, PETG, TPU, ASA, nylon par marque | F-00 à F-06 |
| 7. Guides illustrés : Creality Print en fiches, FreeCAD pas à pas, Guide impression 3D complet | 477 pages, voir [`guides/`](guides/) |

Recherche plein texte, mode sombre, taille du texte réglable, sommaire par fiche.

## Télécharger

Page **Releases** du dépôt, version « Fiches impression 3D » (tag `fiches-3d`), mise à jour à chaque modification :

- `Fiches3D-android.apk` — appli Android (Android 7 et plus, aucune permission).
- `Fiches3D.html` — fichier unique à ouvrir dans n'importe quel navigateur (fiches seules).
- `Guides3D.html` — les 3 guides illustrés en un seul fichier (environ 55 Mo).
- `Fiches3D-site.zip` — site complet installable (PWA), fiches et guides, à héberger, par exemple sur GitHub Pages.

Le site construit est aussi dans [`web/`](web/) (sauf `web/guides/`, reconstruit à chaque compilation).

## Modifier les fiches

Le contenu est en Markdown dans [`content/`](content/) (un fichier par rubrique). Après modification :

```bash
cd fiches-3d
npm ci
node build.mjs          # régénère web/
```

Pousser sur `main` relance la compilation GitHub (`.github/workflows/fiches-3d.yml`) : site + APK signé, publiés dans Releases.

## Compiler l'APK localement

Prérequis : JDK 17+ et SDK Android (API 36).

```bash
node build.mjs
cd android && ./gradlew assembleRelease
```

L'APK est signé avec la clé fixe `android/fiches3d.keystore` (mot de passe `fiches3d`), pour que chaque version s'installe par-dessus la précédente. Pour une autre clé : variables `FICHES_KEYSTORE_FILE`, `FICHES_KEYSTORE_PASSWORD`, `FICHES_KEY_ALIAS`, `FICHES_KEY_PASSWORD`.

## Structure

| Dossier | Rôle |
|---|---|
| `content/` | Fiches en Markdown (source) |
| `src/template.html` | Mise en page, recherche, thème |
| `build.mjs` | Markdown → `web/index.html` + manifeste + service worker, puis `guides/build.mjs` → `web/guides/` |
| `guides/` | Guides illustrés : pages, texte reconnu, sommaires, lecteur avec recherche |
| `web/` | Site construit |
| `android/` | Appli Android (WebView sur le site embarqué), id `fr.fiches3d.app` |
| `assets/` | Icône (SVG + PNG) |
