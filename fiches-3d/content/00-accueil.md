# Fiches impression 3D FDM

Version du 11 novembre 2026

## Mode d'emploi

Ces fiches couvrent les deux trancheurs (« slicers ») actuels des marques Creality et Elegoo, puis les problèmes d'impression, le remplissage, les supports et les réglages filament. Chaque jeu de fiches est dans sa propre rubrique (menu ☰).

**Versions couvertes (novembre 2026)** : Creality Print 7.x (7.3.0 sortie le 9 octobre 2026) et ElegooSlicer 1.5.x (1.5.3.4, basée sur OrcaSlicer 2.4.2). L'ancien « Creality Slicer » (basé sur Cura) n'est plus développé : si vous l'avez encore, passez à Creality Print, qui le remplace.

**Bon à savoir** : Creality Print et ElegooSlicer descendent tous les deux de la même famille de logiciels (Slic3r → PrusaSlicer → Bambu Studio → OrcaSlicer). La majorité des paramètres portent donc le même nom et ont le même effet. Les fiches signalent quand un réglage n'existe que dans un des deux logiciels.

**Comment lire une fiche** : chaque paramètre suit toujours le même plan.

- **C'est quoi** : ce que fait le réglage, en mots simples.
- **Effet** : ce qui change sur la pièce quand on monte ou baisse la valeur.
- **Valeurs typiques** : un point de départ pour une buse de 0,4 mm.
- **Exemple** : un cas concret.

**Règle d'or du débutant** : partez toujours du profil fourni par le logiciel pour votre imprimante et votre filament, ne changez qu'**un seul** paramètre à la fois, et notez ce que vous avez changé.

## Vocabulaire de base

Ces mots reviennent dans toutes les fiches. Gardez ce tableau sous la main.

| Mot | Ce que ça veut dire |
| --- | --- |
| FDM / FFF | Impression par dépôt de fil fondu : un fil de plastique est fondu dans une buse chaude et déposé couche par couche. |
| Trancheur (slicer) | Logiciel qui découpe le modèle 3D en couches et calcule le trajet de la buse. Il produit un fichier G-code. |
| G-code | Liste d'instructions lue par l'imprimante (déplacements, températures, ventilateur…). |
| Buse | Pièce métallique percée par où sort le plastique fondu. Diamètre courant : 0,4 mm. |
| Hotend | Bloc chauffant qui fond le filament, avec la buse au bout. |
| Extrudeur | Moteur et engrenages qui poussent le filament vers la buse. « Direct drive » = monté sur la tête ; « Bowden » = déporté avec un long tube. |
| Plateau | Surface chauffante sur laquelle la pièce est imprimée (PEI lisse, PEI texturé, verre…). |
| Couche | Une tranche horizontale de la pièce. Son épaisseur = la hauteur de couche. |
| Paroi / périmètre | Contour extérieur et intérieurs de chaque couche. Ce sont eux qui donnent la solidité. |
| Coque (dessus/dessous) | Couches pleines qui ferment la pièce en haut et en bas. |
| Remplissage (infill) | Structure interne alvéolée qui remplit l'intérieur de la pièce. |
| Rétraction | Petit recul du filament avant un déplacement, pour éviter qu'il coule et fasse des fils. |
| Surplomb (overhang) | Partie de la pièce qui « déborde » dans le vide par rapport à la couche du dessous. |
| Pont (bridge) | Filament tendu dans le vide entre deux appuis. |
| Support | Structure temporaire imprimée sous un surplomb, retirée après impression. |
| Débit (flow) | Quantité de plastique extrudée. 100 % = la quantité calculée. |
| Pressure Advance (PA) | Compensation de la pression dans la buse pour éviter les coins gonflés et les débuts de ligne maigres. |
| Warping | Décollement et relèvement des coins de la pièce à cause du retrait du plastique en refroidissant. |
| Stringing | Fils fins comme des toiles d'araignée entre deux parties de la pièce. |
| Couture (seam) | Petite marque verticale à l'endroit où chaque couche commence et finit. |
| Hygroscopique | Se dit d'un filament qui absorbe l'humidité de l'air (PETG, TPU, nylon surtout). |

## Sommaire des jeux de fiches

| Rubrique | Contenu | Fiches |
| --- | --- | --- |
| [1. Creality Print](#/creality-print) | Tous les paramètres de Creality Print 7 : qualité, parois, vitesse, refroidissement, filament, adhérence, imprimante, calibration | CP-01 à CP-09 |
| [2. ElegooSlicer](#/elegooslicer) | Tous les paramètres d'ElegooSlicer 1.5 par onglet, calibration, différences avec Creality Print | ES-01 à ES-09 |
| [3. Problèmes d'impression](#/problemes) | Tableau de diagnostic et 20 fiches symptôme → causes → remèdes | P-01 à P-20 |
| [4. Remplissage](#/remplissage) | Choix du remplissage, comparatif de tous les motifs, avantages et inconvénients, paramètres | R-01 à R-05 |
| [5. Supports](#/supports) | Quand en mettre, normal ou arborescent, distances, interface, recettes, retrait sans marque | S-01 à S-09 |
| [6. Filaments](#/filaments) | PLA, PETG, TPU, ASA, nylon : réglages trancheur et valeurs par marque (eSUN, Creality, Elegoo, Amazon/SUNLU, Polyfab3D/Forshape) | F-00 à F-06 |

**Par où commencer si vous débutez** : lisez CP-01/ES-01 (qualité) et CP-02/ES-02 (parois), puis R-01 (choisir un remplissage), puis la fiche de votre filament. Gardez la rubrique Problèmes pour le jour où une impression rate.

## Sources logiciels

- [Creality Print 7.0.0 — notes de version](https://wiki.creality.com/en/software/6-0/release-notes-7-0-0)
- [Creality Print 7.0.0 — forum Creality](https://forum.creality.com/t/creality-print-7-0-0-release-notes/49346)
- [Creality Print 7.1.0 — notes de version](https://wiki.creality.com/en/software/6-0/release-notes-7-1-0)
- [Creality Print 7.0.1 — notes de version](https://newreleases.io/project/github/CrealityOfficial/CrealityPrint/release/v7.0.1)
- [Creality Print 6.0 — notes de version](https://wiki.creality.com/en/software/6-0/Quick-Start/release-notes)
- [Creality Print 6.2.0 — notes de version](https://wiki.creality.com/en/software/6-0/release-notes-6-2-0)
- [Centre de téléchargement Creality (version 7.3.0)](https://www.creality.com/fr/download/creality-k2-plus-cfs-combo)
- [ElegooSlicer — dépôt GitHub](https://github.com/ELEGOO-3D/ElegooSlicer)
- [ElegooSlicer — versions publiées](https://github.com/elegoo-repo/ElegooSlicer/releases)
- [ElegooSlicer 1.5.3.4 — fusion OrcaSlicer 2.4.2](https://newreleases.io/project/github/elegooofficial/ElegooSlicer/release/v1.5.3.4)
- [ElegooSlicer — historique et versions (OpenELAB)](https://openelab.io/blogs/learn/what-is-the-newest-version-of-elegoo-slicer-latest-release-features-and-download-guide)

Les sources des valeurs de filaments sont en bas de la rubrique [6. Filaments](#/filaments).
