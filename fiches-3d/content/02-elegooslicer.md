# Fiches ElegooSlicer

ElegooSlicer est le trancheur officiel d'Elegoo, gratuit et open source. C'est une version d'OrcaSlicer adaptée aux imprimantes Elegoo (Centauri Carbon, Centauri Carbon 2, Centauri 2, Neptune 4, OrangeStorm Giga…), avec gestion des imprimantes en réseau. La version 1.5.3.4 intègre l'essentiel d'OrcaSlicer 2.4.2. Elle remplace l'ancien « Elegoo Cura » : les tutoriels Cura ne s'appliquent pas tels quels.

**Où sont les réglages ?** Trois préréglages : **Imprimante**, **Filament**, **Processus**. Le processus est en onglets : **Qualité**, **Résistance**, **Vitesse**, **Support**, **Multimatériau**, **Autres**. Activez le bouton **Avancé** pour tout afficher. Les réglages modifiés s'affichent en orange ; le cadenas/flèche les remet par défaut.

**Mise à jour des profils** : depuis 1.4, ElegooSlicer met à jour les préréglages Elegoo en ligne sans réinstaller. Acceptez ces mises à jour : elles corrigent souvent des valeurs de filament.

## Fiche ES-01 — Onglet Qualité

### Hauteur de couche

- **C'est quoi** : épaisseur d'une tranche. La première couche a sa propre valeur.
- **Effet** : fine = joli mais lent ; épaisse = rapide mais lignes visibles.
- **Valeurs (buse 0,4)** : 0,08 (détail extrême), 0,12 (fin), 0,16 (optimal), 0,20 (standard), 0,24–0,28 (brouillon). Première couche 0,20–0,25 mm.
- **Exemple** : sur une Centauri Carbon, un porte-clés de 4 cm passe de 12 min à 0,28 mm à 25 min à 0,12 mm.

### Largeur de ligne

- **C'est quoi** : largeur du cordon, réglable par type (défaut, première couche, paroi extérieure, intérieure, dessus, remplissage plein, remplissage, support). Peut être en mm ou en % du diamètre de buse.
- **Effet** : large = solide et rapide ; étroit = précis.
- **Valeurs** : 0,42 mm partout, 0,50 mm première couche, 0,45 mm remplissage.

### Couture

- **Options** : *Alignée*, *Arrière*, *La plus proche*, *Aléatoire*. On peut aussi **peindre** la couture à un endroit précis.
- **Couture en écharpe (Scarf joint)** : début et fin de boucle se chevauchent en pente douce. Option *Contour* ou *Contour et trou*, *Seulement sur les surfaces lisses*. Très efficace sur les pièces rondes.
- **Espace de couture** : petit vide en fin de boucle (10–15 %) qui réduit le bourrelet.
- **Rentrer l'essuyage** (role-based wipe) : la buse finit sa boucle vers l'intérieur pour cacher la goutte.

### Précision

- **Paroi précise (Precise wall)** : ajuste l'espacement entre parois extérieure et intérieure pour des cotes plus justes. À activer pour les pièces fonctionnelles.
- **Hauteur Z précise** : ajuste les dernières couches pour que la hauteur totale soit exacte.
- **Compensation trous / contours X-Y** : +0,05 à +0,15 mm pour les trous trop petits.
- **Convertir les trous en polytrous (Polyholes)** : transforme les trous ronds en polygones, qui sortent plus près de la cote voulue. Utile pour les axes et vis.
- **Compensation patte d'éléphant** : 0,1–0,2 mm.
- **Ajustement d'arc** : arcs G2/G3 au lieu de petits segments, conseillé sur Klipper.

### Repassage (Ironing)

- **Types** : surface supérieure, surface la plus haute, toutes les surfaces pleines.
- **Valeurs** : motif rectiligne ou concentrique, débit 10–15 %, espacement 0,10–0,15 mm, angle 45° par rapport au dessus, vitesse 30–50 mm/s.
- **Exemple** : boîtier avec couvercle plat : un dessus lisse sans lignes visibles.

### Générateur de parois

- *Arachne* (largeur variable, recommandé) ou *Classique*. Réglages Arachne : longueur de transition, angle de transition, largeur min. de paroi.

### Rendre les surplombs imprimables / Paroi supplémentaire sur surplombs

- **Rendre les surplombs imprimables** : modifie la géométrie (en cône) pour que les trous et surplombs horizontaux s'impriment sans support. Change l'aspect de la pièce !
- **Périmètres supplémentaires sur surplombs** : ajoute des boucles là où la pièce déborde, pour mieux tenir.
- **Inverser sur les couches impaires** : alterne le sens des parois en surplomb ; les surplombs se relèvent moins.

### Paroi floue (Fuzzy skin)

- Texture granuleuse sur la paroi extérieure. Options : *Contour seulement*, *Partout*, et peinture par zone. Épaisseur 0,2–0,3 mm, distance des points 0,3–0,8 mm.

### Remplissage des espaces (Gap fill)

- **C'est quoi** : remplit les petits vides entre parois.
- **Conseil** : *Partout* pour les pièces techniques ; *Nulle part* si les petites lignes abîment l'aspect des dessus.

## Fiche ES-02 — Onglet Résistance

### Parois

- **Nombre de parois** : 2 (déco), 3 (standard), 4–6 (mécanique). C'est le premier levier de solidité.
- **Ordre des parois** : *Intérieur/Extérieur* (défaut), *Extérieur/Intérieur* (meilleure surface et cotes), *Int./Ext./Int.* (compromis).
- **Paroi supplémentaire alternée** : une paroi en plus une couche sur deux, meilleure accroche avec le remplissage.
- **Une seule paroi sur le dessus** : pour les dessus, utilise une seule paroi pour laisser plus de place au remplissage plein (plus joli sur les petites surfaces).
- **Détecter les parois fines** : imprime les zones plus fines que deux lignes.

### Coques dessus et dessous

- **Couches du dessus** : 4–6 (ou épaisseur min. 0,8–1 mm). **Dessous** : 3–4.
- **Motifs** : *Monotone* (le plus beau sur le dessus), *Monotone en ligne*, *Rectiligne*, *Concentrique*, *Hilbert*, *Archimède*, *Octogramme*.
- **Garantir l'épaisseur verticale de coque** : ajoute du remplissage plein sous les pentes douces pour éviter les trous. *Modéré* ou *Tout* sur les pièces arrondies.
- **Débit de la surface supérieure / inférieure** : multiplicateur spécifique ; 0,95–0,98 si le dessus est boursouflé.
- **Seuil de surface supérieure** et **ponts internes** : règlent comment les couches pleines s'appuient sur le remplissage. *Ne pas filtrer les ponts internes* = dessus mieux soutenus.

### Remplissage (rappel)

- Réglages : *Densité*, *Motif*, *Direction*, *Longueur d'ancrage* (et max), *Remplissage combiné toutes les N couches*, *Chevauchement remplissage/paroi* (15–25 %), *Remplissage plein interne* (motif et seuil), *Compensation de débit des petites zones*.
- **Motifs disponibles (OrcaSlicer 2.4)** : Grille, Lignes, Rectiligne, Rectiligne aligné, Zig-zag, Zig-zag croisé, Triangles, Étoile, Cubique, Quart cubique, Support cubique, Cubique adaptatif, Nid d'abeille, Nid d'abeille 3D, Gyroïde, TPMS-D, Lightning, Concentrique, Hilbert, Archimède, Octogramme. Détails dans la rubrique [Remplissage](#/remplissage).
- **Densité de remplissage graduelle / Remplissage creux autour des trous** : selon version.

### Pont (Bridges)

- **Débit des ponts** : 0,85–1,0. Moins de débit = ponts moins affaissés.
- **Densité des ponts** : 100 % ; jusqu'à 110 % pour des ponts plus jointifs.
- **Ponts épais** : imprime les ponts avec une ligne de la hauteur de la buse : plus solides mais plus visibles. Désactiver pour un dessous de pont plus beau.
- **Angle de pont** : 0 = automatique.

## Fiche ES-03 — Onglet Vitesse

### Vitesses

- **Première couche** : 30–50 mm/s (Centauri Carbon), 20–30 mm/s (Neptune Bowden ancienne génération).
- **Paroi extérieure** : 150–200 mm/s ; baisser à 80–120 si vous voyez des ondulations.
- **Paroi intérieure** : 250–300 mm/s.
- **Remplissage / remplissage plein** : 250–300 mm/s.
- **Surface supérieure** : 150–200 mm/s.
- **Ponts** : 25–50 mm/s. **Déplacements** : 400–500 mm/s.
- **Petits périmètres** : 50 % de la paroi extérieure, sous un seuil de ~6,5 mm (les petits trous sortent plus ronds).

### Ralentissement en surplomb

- Vitesses par tranche de surplomb (10–25 %, 25–50 %, 50–75 %, 75–100 %). Activer **Ralentir pour les périmètres courbés** pour les surplombs arrondis.

### Accélération et jerk

- **Accélération normale** : 10 000 mm/s² (Centauri Carbon), 5 000 mm/s² (Neptune 4).
- **Paroi extérieure** : 3 000–5 000. **Première couche** : 500–1 000. **Surface supérieure** : 2 000–3 000.
- **Accélération vers décélération (Klipper)** : 50 % ; lisse les mouvements.
- **Vitesse de virage carré / jerk** : laisser le profil.
- **Effet** : trop haut = échos (ghosting), décalages de couches ; trop bas = lent.

### Débit volumétrique maximal (dans le filament)

- Limite de fusion de la buse. PLA standard 12–15 mm³/s ; Rapid PLA+ 20–25 ; PETG 10–15 ; TPU 3–6 ; ASA 15–20.
- Formule : vitesse max = débit ÷ (couche × largeur).

## Fiche ES-04 — Onglet Support (résumé)

Les supports ont leur propre jeu de fiches (rubrique [Supports](#/supports)). Dans ElegooSlicer, les réglages clés sont :

- **Activer les supports** + **Type** : *Normal (auto)*, *Arborescent (auto)*, *Normal (manuel)*, *Arborescent (manuel)*. « Manuel » = seulement là où vous avez peint.
- **Style** : *Grille*, *Ajusté* (snug) pour le normal ; *Fin*, *Épais*, *Organique*, *Hybride* pour l'arborescent.
- **Angle de seuil** : 30–45° (en dessous, pas de support).
- **Sur le plateau uniquement** : évite les supports posés sur la pièce.
- **Distance Z supérieure / inférieure** : 0,2 mm (égale à la hauteur de couche) pour un retrait facile.
- **Couches d'interface**, **motif d'interface**, **espacement d'interface** : c'est là que se joue la qualité du dessous.
- **Distance X/Y** : 0,35–0,8 mm.

## Fiche ES-05 — Onglet Multimatériau

Utile avec un système multicouleur (par exemple le module multi-filament Elegoo) ou une seule buse avec changements manuels.

- **Tour de purge (Prime tower)** : largeur, volume de purge, bordure. La tour stabilise le débit après chaque changement.
- **Volumes de purge** : tableau couleur → couleur. Passer du noir au blanc demande plus de purge que l'inverse. Le bouton *Calcul automatique* donne une base.
- **Purger dans le remplissage / dans les supports / dans l'objet** : recycle la purge à l'intérieur de la pièce pour gaspiller moins.
- **Poutres d'imbrication (Interlocking beams)** : quand deux matériaux qui ne collent pas se touchent (PLA + TPU, PLA + PETG), le logiciel crée un engrenage mécanique de petites poutres entre eux. Largeur 0,8 mm, profondeur 2 couches.
- **Pause / changement de filament manuel** : clic droit sur le curseur des couches dans l'aperçu → *Ajouter une pause* ou *Changer de filament*. Idéal pour un texte de couleur différente sans système multicouleur.

## Fiche ES-06 — Onglet Autres

### Jupe, bordure, radeau

- **Jupe** : 1–2 boucles à 3–5 mm, pour amorcer la buse. *Hauteur de jupe* > 1 = rempart contre les courants d'air (ASA).
- **Bordure** : *Auto*, *Extérieur seulement*, *Intérieur seulement*, *Oreilles de souris*, *Peinte*. Largeur 3–8 mm, espace bordure-objet 0,1 mm.
- **Radeau** : couches de radeau 2–3, distance Z de contact 0,1–0,2 mm. Rarement nécessaire.

### Mode spirale (vase)

- Une seule paroi qui monte en continu. Rapide et sans couture, mais pas de dessus ni de solidité. *Spirale lisse* réduit les marques de transition.

### Séquence d'impression

- *Par couche* ou *Par objet* (chaque objet fini avant le suivant ; vérifier les distances de sécurité autour de la tête).

### Post-traitement, G-code personnalisé

- Scripts exécutés après le tranchage et G-code inséré à certaines hauteurs. Réservé aux utilisateurs avancés.

### Notes et étiquettes

- **Étiqueter les objets** : nécessaire pour annuler un objet en cours d'impression (Exclude objects sous Klipper).

## Fiche ES-07 — Préréglage Filament

### Températures

- **Buse** (première couche / autres) : voir la rubrique [Filaments](#/filaments).
- **Plateau** : une température par type de plaque (PEI lisse, PEI texturé, plaque froide…). Vérifiez que le *type de plaque* choisi en haut correspond à celle installée.
- **Caisson** : Centauri Carbon a un caisson fermé non chauffé activement ; pour le PLA, ouvrir le couvercle si l'intérieur dépasse ~35 °C.

### Ratio de débit

- Multiplicateur d'extrusion : PLA 0,98, PETG 0,95–1,0, TPU 1,0–1,05. À calibrer.

### Pressure Advance

- Activer *Pressure Advance* dans le filament et saisir la valeur calibrée (0,02–0,06 en direct drive).
- **Pressure Advance adaptatif** (hérité d'Orca 2.3+) : la valeur change selon la vitesse et l'accélération. Avancé ; laisser désactivé au début.

### Refroidissement

- **Ventilateur min/max**, **couches sans ventilateur** (1–3), **seuil de temps de couche** pour monter au max, **ralentir si la couche est trop rapide** (temps min 4–8 s pour le PLA).
- **Ventilateur forcé pour surplombs et ponts**.
- **Ventilateur auxiliaire** (Centauri Carbon) : 50–70 % pour PLA, 0 % pour ASA.
- Valeurs de ventilation par matériau : PLA 100 %, PETG 30–60 %, TPU 50–100 %, ASA 0–30 %, nylon 0–30 %.

### Rétraction (surcharge filament)

- Le filament peut remplacer la rétraction de l'imprimante : longueur, vitesse, levée Z, essuyage. Centauri Carbon : 0,8 mm à 40 mm/s pour le PLA ; TPU 0,5–1 mm à 20 mm/s.

### Débit volumétrique maximal, retrait, densité, prix

- **Débit max** : la limite de vitesse réelle (voir ES-03).
- **Retrait** (shrinkage) : 100 % PLA, ~99,5 % ASA/nylon.
- **Densité et prix au kg** : servent à calculer le poids et le coût de la pièce.

### Température de ramollissement

- Sert à avertir si le plateau est trop chaud par rapport au matériau (PLA ~55 °C).

## Fiche ES-08 — Préréglage Imprimante

- **Géométrie** : zone d'impression, hauteur, forme du plateau — déjà juste pour une imprimante Elegoo.
- **Extrudeur** : diamètre de buse, décalages, limites de hauteur de couche (min 0,08 / max 0,28 pour 0,4).
- **Rétraction machine** : valeurs par défaut si le filament n'en impose pas.
- **Limites de mouvement** : vitesses et accélérations max.
- **G-code machine** : début, fin, changement de couche, pause. Le début contient le nivellement et la ligne de purge.
- **Imprimantes non Elegoo** : ElegooSlicer inclut des profils tiers ; sinon, créez une imprimante « générique » en recopiant les dimensions et la buse.

## Fiche ES-09 — Menu Calibration

ElegooSlicer reprend tous les tests d'OrcaSlicer (menu **Calibration** en haut) :

1. **Température** : tour par paliers de 5 °C.
2. **Débit (Flow rate)** : passe 1 grossière, passe 2 fine, ou méthode YOLO.
3. **Pressure Advance** : tour, motif de lignes ou motif en chevrons.
4. **Rétraction** : tour avec longueur croissante.
5. **Débit volumétrique max** : spirale qui accélère jusqu'à la limite.
6. **Test VFA** : vitesses provoquant des vibrations sur les surfaces.
7. **Tolérance** : pièces à emboîter pour régler la compensation XY.
8. **Input shaping** (selon version) : réglage anti-vibrations côté Klipper.

Après chaque test, enregistrez la valeur dans **votre** copie du profil filament (icône disquette → nouveau nom, par exemple « eSUN PLA+ noir — CC »).

## Différences pratiques avec Creality Print

| Point | Creality Print 7 | ElegooSlicer 1.5 |
| --- | --- | --- |
| Base | Fork Orca/Bambu remanié par Creality | Fork d'OrcaSlicer (fusion Orca 2.4.2) |
| Remplissages exclusifs | Lateral Lattice, Lateral Honeycomb, Locked Zag, Fill Multiline | Motifs standards d'Orca |
| Supports | Analyse IA des supports, repassage des interfaces de support (7.1) | Supports Orca (arborescents organiques, hybrides) |
| Multicouleur | CFS, catégorie d'adhésion, longue rétraction à la coupe | Tour de purge Orca, poutres d'imbrication |
| Calibration | Menu Calibration (tests Orca) + auto sur K1/K2 | Tous les tests Orca |
| Imprimantes connectées | Creality Cloud, LAN, Fluidd (7.0.1) | Imprimantes Elegoo en réseau, Nexprint |
