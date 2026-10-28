# SVG2Print

Application unique qui réunit trois outils, organisés en onglets :

| Onglet | Rôle | Plateformes |
|---|---|---|
| **Vectoriser** | *Trait Fin* : photo, scan ou croquis → SVG (ligne centrale ou contour), puis bouton **Imprimer en 3D** | Android, Windows |
| **Relief SVG** | *SVG2Print* : tranchage du SVG en plaque/relief et envoi à l'imprimante (détails ci-dessous) | Android, Windows |
| **Modèle 3D** | Fichiers STL, 3MF, OBJ : orientation « solidité », supports automatiques, PLA/PETG/TPU/nylon, multifilament CANVAS, tranchage et envoi | Android, Windows |
| **Surveiller** | *PrintMonitor* : état des 2 Centauri Carbon et de la K1, caméras, prises Tapo, alertes de fin d'impression | Android |

La surveillance est un écran Android natif (Kotlin/Compose) qui garde son service en arrière-plan et ses notifications.
Elle se règle dans son propre écran *Réglages* (IP des imprimantes, prises Tapo) ; le plan d'adresses et la configuration Livebox sont dans [docs/GUIDE-surveillance.md](docs/GUIDE-surveillance.md).

## Aide et guide PDF

- Onglet **Aide** dans l'application, à la manière d'un fichier .chm : sommaire en arbre, index, recherche plein texte avec surlignage, précédent/suivant, impression. Les boutons **?** de chaque étape (et la touche F1) ouvrent le sujet correspondant.
- **docs/SVG2Print-Guide.pdf** : le même contenu en guide A4 (couverture, sommaire paginé, captures d'écran), publié aussi dans Releases.
- Source unique : `src/help/content.js`. Régénérer captures et PDF : `npm run build`, puis `xvfb-run -a node_modules/electron/dist/electron --no-sandbox docs/make-docs.cjs --shots` et `… --pdf`.

## Onglet Modèle 3D

1. **Fichiers** — un ou plusieurs STL / 3MF / OBJ (glisser-déposer possible). Les projets 3MF de Bambu Studio, OrcaSlicer ou ElegooSlicer gardent leurs objets, pièces, filaments et couleurs. Déplacement des objets au doigt ou à la souris, rotation 90°, échelle.
2. **Placement et supports** — *Orienter automatiquement* :
   - **Solidité** : la plus grande dimension est couchée sur le plateau, pour que les couches (point faible d'une pièce FDM) soient dans le sens des efforts, avec une grande face d'appui ;
   - **Moins de supports** : surplombs minimaux.
   Supports automatiques arborescents (par défaut) ou classiques, angle de surplomb réglable (50°), surplombs affichés en rouge. *Placer automatiquement* range les objets sur le plateau.
3. **Imprimante et filament** — PLA HS (eSUN ePLA-HS), PETG HS (eSUN PETG+HS), TPU 95A, nylon PA, avec réglages optimisés par imprimante (températures, ventilation, débit max, vitesses plafonnées pour le TPU et le nylon, bordure automatique pour le nylon).
   **Multifilament CANVAS** (Elegoo Centauri Carbon) : 4 emplacements, un filament par objet ou par pièce, lecture du CANVAS de l'imprimante (matières et couleurs chargées), tour de purge, purge calculée d'après les couleurs. Le TPU est refusé dans le CANVAS.
4. **Qualité et solidité** — préréglages Rapide / Standard / Solide (4 parois, 40 % gyroïde) / Résistance max, tout est modifiable.
5. **Trancher et imprimer** — aperçu couche par couche (par type de trajet ou par filament), durée, poids par filament, enregistrement du G-code, envoi et lancement. Sur la Centauri Carbon, l'emplacement de chaque filament est transmis à l'imprimante (`slot_map`) quand le CANVAS a été lu.

Le tranchage 3D utilise **CuraEngine** compilé en WebAssembly (paquet `cura-wasm`, licence AGPL-3.0), sur l'appareil, sans connexion. Le G-code est ensuite adapté à Klipper (Centauri Carbon et K1) : début/fin de l'imprimante, changements de filament `M6211` du CANVAS (repris d'ElegooSlicer), progression par couche, vignettes.

Dans l'onglet **Relief SVG**, la matière est aussi au choix, et sur la Centauri Carbon le CANVAS permet une plaque et un motif de couleurs différentes (un seul changement de filament, au début du motif).

## Onglet Relief SVG

L'onglet Relief SVG transforme un dessin **SVG** en pièce imprimée en 3D (FDM) :
une plaque avec le motif **en relief (positif)** ou **en creux (négatif)**, parois pleines,
tranchée directement dans l'application puis **envoyée et lancée** sur l'imprimante.

Imprimantes prises en charge :

| Imprimante | Connexion | Plateau |
|---|---|---|
| Elegoo Centauri Carbon | SDCP v3 : envoi HTTP par blocs de 1 Mio avec contrôle MD5, démarrage par WebSocket (port 3030) | 256 × 256 mm |
| Creality K1 / K1C | API Moonraker (port 7125, ou 4408/4409 avec un mod) | 220 × 220 mm |

## Utilisation

1. **Fichier** — ouvrez un SVG. Les formes pleines, les traits (parcours) et les transformations sont pris en compte. Le blanc peut être traité comme du vide. Le texte doit être converti en tracés (Inkscape : *Chemin › Objet en chemin*).
2. **Imprimante** — choisissez la Centauri Carbon ou la K1 et saisissez son adresse IP (bouton *Rechercher* pour la Centauri Carbon sous Windows et Android).
3. **Motif** — positif ou négatif, largeur/hauteur (proportions verrouillées ou non), échelle en %, rotation, miroir horizontal/vertical, *Agrandir au plateau*. Hauteur du motif réglable de 0,2 à 1 mm (raccourcis 0,2 · 0,4 · 0,6 · 0,8 · 1 mm). Par défaut : plaque de 1 mm + motif de 1 mm, marge 5 mm, coins arrondis. Avec une épaisseur de plaque à 0, le mode négatif donne un **pochoir**.
4. **Filament** — réglage eSUN PETG+HS optimisé proposé d'office pour chaque imprimante, modifiable et réinitialisable.
5. **Trancher et imprimer** — aperçu couche par couche, durée et poids estimés, enregistrement du G-code, envoi et lancement de l'impression.

## Réglages par défaut (eSUN PETG+HS, buse 0,4)

| | Centauri Carbon | K1 / K1C |
|---|---|---|
| Buse (1re couche) | 240 °C (245 °C) | 240 °C (245 °C) |
| Plateau | 75 °C | 75 °C |
| Ventilateur | 40 % (aucun sur 2 premières couches) | 40 % (idem) |
| Débit / volumique max | 0,95 / 16 mm³/s | 0,95 / 15 mm³/s |
| Rétraction / levée Z | 0,8 mm à 30 mm/s / 0,4 mm | 0,8 mm à 40 mm/s / 0,4 mm |
| Couche / largeur | 0,20 mm / 0,45 mm, 2 parois + remplissage 100 % | idem |
| Vitesses (1re couche · paroi ext. · int. · remplissage) | 50 · 150 · 200 · 220 mm/s | 40 · 120 · 180 · 200 mm/s |

Les G-code de début et de fin reprennent ceux des profils OrcaSlicer officiels des deux imprimantes
(purge, nettoyage de buse, `START_PRINT`/`END_PRINT` sur K1). Une vignette est intégrée pour l'écran de l'imprimante.

## Compiler

Prérequis : Node.js 22.

```bash
npm install
npm test          # tranchage + contrôle G-code + envoi vers des imprimantes simulées
npm start         # lance la version Windows/PC (Electron)
npm run dist:win  # installateur + exécutable portable Windows (à lancer sous Windows)
npm run android:apk  # APK Android (JDK 21 + SDK Android requis)
```

Le plus simple : pousser ce dossier sur GitHub. Le workflow `.github/workflows/build.yml` compile
automatiquement l'**APK Android** et l'**installateur Windows** (onglet *Actions › Artifacts*) ;
un tag `v1.0.0` publie une release avec les deux fichiers.

## Structure

- `src/model3d/` — onglet Modèle 3D : lecture STL/3MF/OBJ (`mesh.js`), orientation et placement (`orient.js`), réglages CuraEngine (`settings.js`, `job.js`), moteur WASM (`engine.js`, empaqueté à part dans `www/engine3d.js`), post-traitement Klipper/CANVAS (`post.js`), vue 3D three.js (`viewer.js`)
- `src/core/materials.js` — filaments PLA HS, PETG HS, TPU, nylon et bloc de changement CANVAS
- `src/vector/vector.html` — vectorisation Trait Fin (page autonome chargée dans un cadre ; elle transmet le SVG à l'onglet Imprimer par `postMessage`).
- `android/app/src/main/java/fr/printmonitor/` — surveillance PrintMonitor (Kotlin/Compose), ouverte par `PrinterNet.openMonitor()`.

- `src/core/svg.js` — lecture du SVG (styles, classes CSS, transformations, unités) → polygones
- `src/core/slicer.js` — miroir/rotation/échelle, plaque, couches, périmètres et remplissage
- `src/core/gcode.js` — G-code Klipper (E relatif), estimation durée/filament, vignettes
- `src/core/profiles.js` — profils imprimantes et filament
- `src/net/` — envoi Moonraker et SDCP, couche réseau Windows/Android
- `electron/` — application Windows ; `android/` — application Android (plugin natif `PrinterNetPlugin`)

## Notes réseau

- Le téléphone ou le PC doit être sur le même réseau que l'imprimante.
- K1 : Moonraker doit être accessible (firmware récent ou mod root). Si l'authentification Moonraker est activée, l'envoi sera refusé.
- Centauri Carbon : l'identifiant de carte mère est détecté automatiquement ; s'il ne l'est pas (imprimante en pause/erreur), utilisez *Rechercher* ou saisissez-le.
