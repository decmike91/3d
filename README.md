# SVG2Print

Application Android et Windows qui transforme un dessin **SVG** en pièce imprimée en 3D (FDM) :
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
3. **Motif** — positif ou négatif, largeur/hauteur (proportions verrouillées ou non), échelle en %, rotation, miroir horizontal/vertical, *Agrandir au plateau*. Par défaut : plaque de 1 mm + motif de 1 mm de haut, marge 5 mm, coins arrondis. Avec une épaisseur de plaque à 0, le mode négatif donne un **pochoir**.
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
