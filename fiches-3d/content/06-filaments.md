# Fiches filaments : PLA, PETG, nylon, TPU, ASA

Ces fiches donnent les réglages à entrer dans le préréglage **Filament** de Creality Print ou d'ElegooSlicer, d'abord par matière, puis par marque. **Les valeurs de marque viennent des fiches fabricants ou des profils officiels quand ils ont été trouvés** ; sinon c'est indiqué « générique ». La plage imprimée sur l'étiquette de votre bobine reste la référence, et une tour de température reste le meilleur arbitre.

**À propos des marques** :

- **Amazon** est une place de marché, pas une marque. La colonne « Amazon » prend **SUNLU** comme exemple (une des marques les plus vendues), avec des valeurs génériques quand SUNLU ne publie rien de clair. Pour une bobine inconnue, partez du profil « Générique » du logiciel.
- **Polyfab3D** est un revendeur français. Sa marque maison est **Forshape** : c'est elle qui est utilisée ici.
- **Creality** et **Elegoo** ont des profils intégrés dans leurs trancheurs : choisissez-les en priorité avec leurs filaments.

## F-00 — Comparatif des cinq matières

| | PLA | PETG | TPU | ASA | Nylon (PA) |
| --- | --- | --- | --- | --- | --- |
| Facilité | Très facile | Facile à moyen | Moyen à difficile | Difficile | Difficile |
| Buse (°C) | 190–230 | 220–260 | 200–240 | 240–270 | 240–290 |
| Plateau (°C) | 45–65 | 65–90 | 30–60 | 90–110 | 70–110 |
| Ventilation | 100 % | 30–60 % | 50–100 % | 0–30 % | 0–30 % |
| Caisson fermé | Non (ouvert) | Facultatif | Non | Oui | Oui |
| Tenue à la chaleur | ~55 °C | ~70 °C | ~60–80 °C | ~95–105 °C | 80–180 °C selon type |
| Extérieur / UV | Mauvais | Moyen | Moyen | Excellent | Moyen |
| Absorbe l'humidité | Peu | Moyen | Beaucoup | Peu | Énormément |
| Usages | Déco, prototypes, figurines | Pièces fonctionnelles, boîtiers | Joints, coques, pneus, amortisseurs | Pièces d'extérieur, auto | Engrenages, charnières, pièces techniques |

Les températures de tenue sont des ordres de grandeur (début de ramollissement), elles varient selon les formulations.

## F-01 — PLA

**En bref** : le plus simple. Rigide, précis, peu d'odeur. Fragile aux chocs et à la chaleur (une pièce dans une voiture au soleil se déforme). Variantes : PLA+ (plus résistant), Silk (brillant), Mat, haute vitesse (« Hyper », « Rapid », « HS »), chargé bois/carbone.

### Réglages à entrer dans le trancheur

| Réglage | PLA standard | PLA haute vitesse |
| --- | --- | --- |
| Buse | 200–215 °C (1re couche +5 °C) | 210–230 °C |
| Plateau PEI | 55–60 °C | 50–60 °C |
| Ventilateur | 100 % (0 % couche 1) | 100 % |
| Débit volumétrique max | 12–15 mm³/s | 20–25 mm³/s |
| Ratio de débit | 0,98 | 0,98 |
| Pressure Advance (direct drive) | 0,02–0,04 | 0,02–0,04 |
| Rétraction | Direct 0,8 mm / Bowden 5 mm | Direct 0,8 mm |
| Temps de couche min. | 6–8 s | 4–6 s |
| Séchage | 45–50 °C, 4–6 h | idem |

**Piège** : dans une imprimante fermée (K1, K2, Centauri Carbon), ouvrez le capot si le caisson dépasse ~35 °C, sinon risque de bouchage.

### PLA par marque

| Marque / produit | Buse | Plateau | Remarques |
| --- | --- | --- | --- |
| eSUN PLA+ | 205–230 °C | 45–60 °C | Point de départ ~220 / 50 °C. Plus résistant aux chocs que le PLA simple. |
| Creality Hyper PLA | 210–230 °C | 45–60 °C | Profils Creality à 220 °C / 45 °C (Ender-5 Max) et 210 °C / 60 °C (CR-10 SE) ; rétraction 0,8 mm ; conçu pour la haute vitesse. |
| Creality CR-PLA | 190–230 °C | 45–60 °C | Profil 190 °C / 60 °C sur Ender-3 V3 SE, 230 °C / 45 °C sur K1 (vitesse plus élevée). |
| Elegoo Rapid PLA+ | 200–230 °C | 40–60 °C | PLA rapide ; le PLA Elegoo en général va de 180 à 240 °C selon la gamme. |
| Amazon — SUNLU PLA | 200–210 °C | 50–60 °C | Fiche SUNLU : 50–100 mm/s. Pour sa version haute vitesse, monter vers 220–230 °C. |
| Polyfab3D — Forshape PLA+ Premium | 195–215 °C (190–230 selon couleur) | 0–60 °C | Plateau chauffant facultatif ; compatible CFS/AMS/ACE (pas AMS Lite). Transition vitreuse 57 °C. |
| Polyfab3D — Forshape High-Speed PLA+ | 200–230 °C | 40–60 °C | Annoncé jusqu'à 600 mm/s. |

## F-02 — PETG

**En bref** : plus résistant aux chocs et à la chaleur que le PLA, légèrement souple, résiste à l'eau. Fait facilement des fils et colle très fort au PEI lisse (risque d'arracher le revêtement). Absorbe l'humidité.

### Réglages à entrer dans le trancheur

| Réglage | Valeur |
| --- | --- |
| Buse | 230–250 °C (haute vitesse : 240–260 °C) |
| Plateau | 70–85 °C ; PEI texturé conseillé, ou colle en bâton sur PEI lisse |
| Ventilateur | 30–60 % ; 0 % sur les 2–3 premières couches ; ponts 60–80 % |
| Débit volumétrique max | 10–15 mm³/s (PETG rapide : 18–22) |
| Ratio de débit | 0,95–1,00 |
| Pressure Advance | 0,04–0,07 (direct drive) |
| Rétraction | Direct 0,8–1,2 mm à 30–40 mm/s ; Bowden 5–6 mm |
| Première couche | Z-offset légèrement plus haut qu'en PLA (+0,02 à +0,05 mm) |
| Distance Z des supports | 0,22–0,25 mm |
| Séchage | 55–65 °C, 4–6 h |

### PETG par marque

| Marque / produit | Buse | Plateau | Remarques |
| --- | --- | --- | --- |
| eSUN PETG | 225–250 °C | 70–90 °C | Les utilisateurs ajustent souvent rétraction et vitesse. |
| Creality CR-PETG | 230–250 °C | 50–80 °C | Profils Creality : 250 / 70 °C (K1, Ender-5 Max, caisson conseillé), 230 / 80 °C (CR-10 SE, rétraction 1,2 mm). |
| Creality Hyper PETG | Voir profil intégré | Voir profil | Version haute vitesse ; utiliser le préréglage Creality Print. |
| Elegoo PETG | 220–250 °C | 70–90 °C | |
| Elegoo Rapid PETG | 220–260 °C | 70–90 °C | Annoncé pour la haute vitesse ; pas de caisson nécessaire. |
| Elegoo PETG PRO | 230–260 °C | 65–75 °C | |
| Amazon — SUNLU PETG | 230–250 °C (générique) | 70–85 °C (générique) | Pas de fiche fabricant claire trouvée : partir du profil « PETG générique ». |
| Polyfab3D — Forshape PETG Premium | 220–250 °C | 65–90 °C | Buse 0,4 mm minimum ; compatible AMS/CFS/ACE. |
| Polyfab3D — Forshape High-Speed PETG | 220–260 °C | 75–90 °C | Jusqu'à 600 mm/s annoncés. |

## F-03 — TPU (flexible)

**En bref** : caoutchouteux, élastique, quasi incassable. Dureté notée en Shore A : **95A** est le plus courant et le plus facile ; 85A et moins sont très difficiles. Le filament mou se plie dans l'extrudeur : il faut imprimer **lentement**, et de préférence en direct drive.

### Réglages à entrer dans le trancheur

| Réglage | Valeur |
| --- | --- |
| Buse | 210–235 °C |
| Plateau | 30–50 °C (colle en bâton sur PEI lisse comme séparateur) |
| Ventilateur | 50–100 % |
| Vitesse | 20–40 mm/s (TPU « rapide » : jusqu'à ~100 mm/s sur imprimante adaptée) |
| Débit volumétrique max | 3–6 mm³/s |
| Rétraction | 0–1 mm à 20 mm/s (Bowden : 0–2 mm, très lentement) |
| Ratio de débit | 1,00–1,05 |
| Remplissage | Gyroïde ou Concentrique 10–30 % (règle la souplesse) |
| Séchage | 50–60 °C, 6–8 h |

**Pièges** : Creality déconseille de charger le TPU via le CFS (il se plie dans les canaux) et déconseille les TPU de 80A et moins sur ses machines. Passer le filament en direct, sans long tube PTFE.

### TPU par marque

| Marque / produit | Buse | Plateau | Remarques |
| --- | --- | --- | --- |
| eSUN eTPU-95A | 210–240 °C | Non chauffé | Dureté 95A. |
| Creality CR-TPU | 215–230 °C | 30 °C | Profils : 215 °C, rétraction 2 mm, 50 mm/s (CR-10 SE) ; 230 °C, 50 mm/s (K1). |
| Creality HP-TPU | 195–215 °C | 30–45 °C | Profils : 210 °C / 30 °C, rétraction 2 mm, 50 mm/s (Ender-3 V3 SE) ; 195 °C / 45 °C, rétraction 3 mm, 40 mm/s (Ender-5 Max). |
| Elegoo TPU 95A | 210–230 °C | 35–60 °C | |
| Elegoo Rapid TPU 95A | 200–230 °C | 30–45 °C | Version plus rapide. |
| Amazon — SUNLU TPU | 210–230 °C (générique) | 40–60 °C (générique) | Pas de fiche claire trouvée. |
| Polyfab3D — Forshape TPU | Générique 210–230 °C | 30–50 °C | Pas de fiche Forshape TPU trouvée : vérifier l'étiquette. |

## F-04 — ASA

**En bref** : cousin de l'ABS, mais résiste aux UV et aux intempéries. Idéal pour l'extérieur et l'automobile. Fort warping, odeur et émissions : **caisson fermé** et pièce aérée indispensables.

### Réglages à entrer dans le trancheur

| Réglage | Valeur |
| --- | --- |
| Buse | 245–265 °C |
| Plateau | 90–105 °C ; colle ou laque d'adhérence conseillée |
| Caisson | Fermé ; 50–60 °C si chauffé (K2 Plus/Pro) ; préchauffer 10 min |
| Ventilateur | 0–30 % (profil Creality jusqu'à 70 % sur K1, sans ventilateur auxiliaire) ; ventilateur auxiliaire à 0 |
| Débit volumétrique max | 15–20 mm³/s |
| Rétraction | Direct 0,8 mm |
| Bordure | 5–10 mm, systématique sur les pièces > 5 cm |
| Retrait (shrinkage) | ~99,5 % |
| Séchage | 70–80 °C, 4–6 h |

### ASA par marque

| Marque / produit | Buse | Plateau | Remarques |
| --- | --- | --- | --- |
| eSUN eASA | 240–260 °C | 90–110 °C | eSUN recommande les mêmes réglages que l'ABS (ABS+ : 230–270 / 80–110 °C). |
| Creality HP-ASA | 250–260 °C | 100 °C | Profils : 250 °C / 100 °C, ventilation 50 % (CR-10 SE) ; 260 °C / 100 °C, 70 % sans auxiliaire (K1). Caisson conseillé. |
| Elegoo ASA | 240–270 °C | 90–100 °C | Avec colle PVP, certains guides descendent à 75–95 °C. |
| Amazon — SUNLU ASA | 245–255 °C | 80–120 °C | |
| Polyfab3D — Forshape ASA | Générique 240–260 °C | 90–110 °C | Pas de fiche ASA trouvée : vérifier l'étiquette. |

## F-05 — Nylon (PA, polyamide)

**En bref** : très résistant à l'usure, aux chocs et à la fatigue ; légèrement souple. Absorbe l'humidité en quelques heures : un nylon humide imprime mal (bulles, fils, pièce molle). Les versions chargées (PA-CF, PAHT-CF) sont plus rigides et warpent moins, mais exigent une **buse en acier trempé**.

### Réglages à entrer dans le trancheur

| Réglage | PA standard | PA-CF / PAHT-CF |
| --- | --- | --- |
| Buse | 240–270 °C | 260–300 °C |
| Plateau | 70–100 °C + colle en bâton | 80–110 °C + colle |
| Caisson | Fermé, chaud | Fermé, chaud |
| Ventilateur | 0–30 % | 0–30 % |
| Vitesse | 30–100 mm/s | 50–150 mm/s |
| Rétraction | Direct 1–1,5 mm | Direct 0,8–1 mm |
| Buse | Laiton possible | **Acier trempé obligatoire** |
| Bordure | Oui, 5–10 mm | Oui |
| Séchage | 70–90 °C, 8–12 h, puis imprimer depuis le séchoir | idem |

### Nylon par marque

| Marque / produit | Buse | Plateau | Remarques |
| --- | --- | --- | --- |
| eSUN ePA | 230–260 °C | 80–110 °C | Fiche technique eSUN. |
| eSUN ePA-CF | 230–260 °C | 80–90 °C | Buse acier trempé. |
| Creality CR-Nylon | 250–260 °C | 45–50 °C | Profils : 250 °C / 45 °C, rétraction 1,5 mm, 30 mm/s (Ender-5 Max) ; 260 °C / 50 °C, ventilation 30 % (K1). |
| Creality Hyper PA6-CF | 280–300 °C | 80 °C | Buse acier trempé, caisson. |
| Elegoo PAHT-CF | 260–290 °C | 90–110 °C | Elegoo ne propose pas de nylon pur ; buse acier trempé (Centauri Carbon : d'origine). |
| Amazon — SUNLU PA / Easy PA | Générique 240–270 °C | 70–90 °C | Pas de fiche claire trouvée. |
| Polyfab3D — Forshape / nylon | Générique 240–270 °C | 70–100 °C | Polyfab3D vend du nylon d'autres marques ; suivre l'étiquette. |

## F-06 — Créer son propre profil filament (méthode)

1. Dans le trancheur, choisir le profil le plus proche (ex. « Generic PETG » ou le profil de la marque).
2. Saisir la plage de température de l'étiquette, prendre le milieu.
3. Imprimer dans l'ordre : tour de température → débit → Pressure Advance → rétraction → débit volumétrique max.
4. Enregistrer sous un nom explicite : « Marque Matière Couleur — Imprimante ».
5. Noter la date et le lot : deux couleurs d'une même marque peuvent demander 5 °C d'écart.

## Sources

Valeurs fabricants relevées le 11 novembre 2026 :

- [Fiche technique eSUN (PDF)](https://cdn.shopify.com/s/files/1/1745/6181/files/eSUN_3D_Printing_Filament_Datasheet.pdf)
- [eSUN PLA+ — réglages](https://filamentsettings.pages.dev/filament/esun-pla-plus/)
- [Guide des filaments eSUN (All3DP)](https://all3dp.com/2/esun-filament-guide/)
- [eSUN — série ingénierie (eASA)](https://esun3d.com/news/7224)
- [Creality — réglages CR-10 SE](https://store.creality.com/blogs/all/creality-cr-10-se-printing-parameter-settings)
- [Creality — guide matériaux Ender-5 Max (PDF)](https://wiki.creality.com/products/diy/ender%E7%B3%BB%E5%88%97/ender-5max/ender-5_max_material_guide.pdf)
- [Creality — guide matériaux Ender-3 V3 SE (PDF)](https://wiki.creality.com/products/diy/ender%E7%B3%BB%E5%88%97/ender-3v3se/ender-3_v3_se_material_guide.pdf)
- [Creality — paramètres filaments K1 (PDF)](https://centros.edu.xunta.gal/ceipperezviondi/aulavirtual/pluginfile.php/12040/mod_label/intro/k1_series_complete_recommended_filament_parameters.pdf)
- [Creality — paramètres filaments K2 Plus](https://wiki.creality.com/zh/k2-flagship-series/k2-plus/filament-parameters)
- [Filaments Creality (SimplyPrint)](https://simplyprint.io/filaments/creality)
- [Filaments Elegoo (SimplyPrint)](https://simplyprint.io/filaments/elegoo)
- [Elegoo Rapid PETG](https://printer-hub.ru/en/materials/elegoo-rapid-petg)
- [Guide des filaments Elegoo (All3DP)](https://all3dp.com/2/elegoo-filament-guide/)
- [SUNLU — fiche filaments](https://manuals.plus/m/ce68dce202b6ee1206a941007e3dc37a709e750190d94d06dc4cf29366936c0b)
- [Guide des filaments SUNLU (All3DP)](https://all3dp.com/2/sunlu-filament-guide/)
- [Forshape PLA+ (Polyfab3D)](https://www.polyfab3d.fr/filament-pla/1986-pla-blanc-forshape-premium-175mm-1kg.html)
- [Forshape PETG Premium (Polyfab3D)](https://www.polyfab3d.fr/filament-imprimante-3d/2064-petg-transparent-forshape-premium-175mm-1kg.html)
- [Forshape High-Speed PLA+ (Polyfab3D)](https://www.polyfab3d.fr/filament-3d-forshape-premium/3398-high-speed-pla-gris-forshape-175-mm-1-kg.html)
- [Forshape High-Speed PETG (Polyfab3D)](https://www.polyfab3d.fr/forshape/3405-high-speed-petg-bleu-forshape-175-mm-1-kg.html)
