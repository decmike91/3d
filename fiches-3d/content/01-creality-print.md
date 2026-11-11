# Fiches Creality Print 7

Creality Print est le trancheur gratuit de Creality (Windows, macOS, Linux). La version 7 apporte une analyse IA des supports, de nouveaux motifs de remplissage, l'imbrication parois-remplissage et le lissage des interfaces de support. Les noms ci-dessous sont ceux de l'interface en français ; entre parenthèses, le nom anglais quand il aide à chercher sur Internet.

**Où sont les réglages ?** Trois familles de préréglages en haut à gauche : **Imprimante**, **Filament** et **Processus** (aussi appelé « Traitement » ou « Process »). Les réglages de processus sont rangés en onglets : Qualité, Résistance, Vitesse, Support, Autres. Cliquez sur l'icône **Avancé** (ou « Mode expert ») pour voir tous les paramètres.

**Astuce** : un paramètre modifié apparaît en orange ; la petite flèche à côté le remet à la valeur d'origine du profil.

## Fiche CP-01 — Qualité : couches et lignes

### Hauteur de couche (Layer height)

- **C'est quoi** : l'épaisseur de chaque tranche de plastique déposée.
- **Effet** : plus fin = surface plus lisse et détails plus nets, mais impression plus longue. Plus épais = plus rapide, lignes de couche visibles, pièce souvent un peu plus solide entre couches.
- **Valeurs typiques (buse 0,4)** : 0,08–0,12 mm (figurine, détails), 0,16 mm (bon compromis), 0,20 mm (standard), 0,24–0,28 mm (pièce rapide). Règle : ne pas dépasser 75 % du diamètre de buse.
- **Exemple** : une figurine de 8 cm à 0,12 mm prendra environ deux fois plus de temps qu'à 0,24 mm, mais les courbes du visage seront nettement plus douces.

### Hauteur de la première couche (Initial layer height)

- **C'est quoi** : l'épaisseur de la toute première couche, posée sur le plateau.
- **Effet** : une première couche un peu plus épaisse « pardonne » un plateau imparfait et colle mieux.
- **Valeurs typiques** : 0,20–0,25 mm avec une buse 0,4.
- **Exemple** : si la première couche a des trous ou des lignes qui ne se touchent pas, passer de 0,20 à 0,25 mm aide souvent.

### Largeur de ligne (Line width)

- **C'est quoi** : la largeur du cordon de plastique. Réglable séparément pour : défaut, première couche, paroi extérieure, paroi intérieure, surface supérieure, remplissage plein, remplissage, support.
- **Effet** : plus large = pièce plus solide et impression plus rapide (moins de passes), mais détails moins fins. Plus étroit = meilleurs détails.
- **Valeurs typiques (buse 0,4)** : 0,42 mm partout ; 0,50 mm pour la première couche (meilleure adhérence) ; 0,45 mm pour le remplissage.
- **Exemple** : pour graver un petit texte en relief, réduire la largeur de la paroi extérieure à 0,38 mm rend les lettres plus nettes.

### Couture (Seam position)

- **C'est quoi** : l'endroit où chaque couche commence et finit sur le contour extérieur. Il y laisse une petite marque verticale.
- **Options** : *Aligné* (une seule ligne verticale), *Arrière* / *Alignement arrière* (ajouté en 7.0.1, pousse la couture vers l'arrière de la pièce), *Le plus proche* (rapide mais marques un peu partout), *Aléatoire* (pas de ligne, mais petits points dispersés).
- **Effet** : purement esthétique, sauf sur pièces à emboîter où une couture saillante peut gêner.
- **Exemple** : pour un vase vu de face, choisir *Arrière* : la cicatrice se retrouve côté mur.
- **Réglages associés** : *Espace de couture* (gap, ~10 % ou 0,1 mm) réduit le bourrelet ; *Couture en écharpe* (scarf seam) fait se chevaucher le début et la fin en pente douce, ce qui rend la couture presque invisible sur les pièces lisses.

### Résolution / Précision (Resolution, Arc fitting)

- **C'est quoi** : la finesse avec laquelle les courbes du modèle sont converties en petits segments. *Ajustement d'arc* (arc fitting) remplace les suites de segments par de vrais arcs.
- **Effet** : résolution trop fine = fichier lourd et saccades possibles sur imprimantes lentes. Arc fitting = cercles plus doux et fichier plus léger (laisser activé sur Klipper/K1/K2).
- **Valeurs typiques** : résolution 0,012 mm (défaut).

### Compensation XY (X-Y hole / contour compensation)

- **C'est quoi** : agrandit ou rétrécit légèrement les trous et les contours extérieurs.
- **Effet** : corrige les trous trop petits (cas très fréquent) et les pièces qui ne s'emboîtent pas.
- **Valeurs typiques** : trous +0,05 à +0,15 mm ; contours 0 à −0,05 mm.
- **Exemple** : un trou de 5 mm qui sort à 4,8 mm → compensation trou +0,1 mm.

### Compensation de la patte d'éléphant (Elephant foot compensation)

- **C'est quoi** : rétrécit la première couche pour compenser l'écrasement qui la fait déborder.
- **Effet** : bords du bas droits au lieu d'évasés.
- **Valeurs typiques** : 0,1–0,2 mm.

### Repassage (Ironing)

- **C'est quoi** : après la dernière couche du dessus, la buse repasse très lentement avec un débit minuscule pour lisser la surface.
- **Options** : *Surface supérieure*, *Surface la plus haute seulement*, *Toutes les surfaces pleines*. En 7.1, nouveau **Repassage des interfaces de support** (voir fiche Supports).
- **Effet** : dessus brillant et lisse, mais temps plus long.
- **Valeurs typiques** : débit 10–15 %, espacement 0,1 mm, vitesse 30–50 mm/s.
- **Exemple** : une plaque avec un logo plat devient presque « miroir » avec le repassage.

### Paroi floue (Fuzzy skin)

- **C'est quoi** : fait trembler volontairement la buse sur la paroi extérieure pour donner un aspect texturé, granuleux.
- **Nouveau en 7.1** : on peut **peindre** la paroi floue uniquement sur certaines zones de la pièce.
- **Valeurs typiques** : épaisseur 0,2–0,3 mm, distance des points 0,3–0,8 mm.
- **Exemple** : une poignée d'outil avec texture antidérapante peinte seulement sur la zone de prise.

### Lissage de vitesse des parois le long de Z (expérimental, 7.0)

- **C'est quoi** : évite les changements brusques de vitesse d'une couche à l'autre sur la paroi extérieure.
- **Effet** : réduit les bandes horizontales visibles sur les pièces qui ont des couches de durées très différentes.
- **Conseil** : laisser désactivé tant que vous n'avez pas ce défaut précis.

## Fiche CP-02 — Résistance : parois et coques

### Nombre de parois (Wall loops)

- **C'est quoi** : combien de contours sont imprimés autour de chaque couche.
- **Effet** : c'est le réglage le plus efficace pour la solidité. Ajouter une paroi renforce plus qu'ajouter 10 % de remplissage.
- **Valeurs typiques** : 2 (déco), 3 (standard), 4–6 (pièce mécanique, vis, charnière).
- **Exemple** : un support d'étagère qui casse avec 2 parois tient très bien avec 4 parois et seulement 15 % de remplissage.

### Ordre des parois (Wall order)

- **Options** : *Intérieur/Extérieur* (défaut, meilleure précision des surplombs), *Extérieur/Intérieur* (meilleure précision dimensionnelle et surface), *Intérieur/Extérieur/Intérieur* (bon compromis).
- **Exemple** : pour une pièce qui doit s'emboîter au dixième de mm, choisir *Extérieur/Intérieur*.

### Générateur de parois (Wall generator)

- **Options** : *Classique* ou *Arachne*. Arachne fait varier la largeur des lignes pour remplir les zones fines.
- **Effet** : Arachne = textes et zones minces mieux remplies, moins de trous. Classique = un peu plus prévisible.
- **Conseil** : Arachne par défaut.

### Détecter les parois fines / ponts sur parois

- **C'est quoi** : options qui permettent d'imprimer des zones plus fines que deux lignes, et d'appliquer les réglages de pont aux parois au-dessus du vide.
- **Conseil** : activer *Détecter les parois fines* pour les petits textes et pièces fines.

### Paroi supplémentaire alternée (Alternate extra wall)

- **C'est quoi** : ajoute une paroi en plus une couche sur deux, ce qui « tisse » les parois avec le remplissage.
- **Effet** : pièce plus solide, en particulier contre l'arrachement entre couches.

### Imbrication parois-remplissage (nouveau en 7.1)

- **C'est quoi** : crée des « dents » imbriquées entre les parois et le remplissage, décalées d'une couche à l'autre.
- **Effet** : meilleure liaison entre l'extérieur et l'intérieur de la pièce ; utile pour les pièces sollicitées.
- **Conseil** : à activer sur les pièces mécaniques avec peu de parois.

### Couches pleines du dessus et du dessous (Top / Bottom shell layers)

- **C'est quoi** : nombre de couches pleines qui ferment la pièce.
- **Effet** : trop peu = trous ou « effet oreiller » (bosses) sur le dessus. Plus de couches = dessus plus propre et plus étanche.
- **Valeurs typiques** : dessus 4–5 couches (ou épaisseur ≥ 0,8–1 mm), dessous 3–4 couches.
- **Exemple** : à 0,12 mm de couche, 5 couches du dessus ne font que 0,6 mm : montez à 7–8 couches.

### Motif des surfaces supérieure et inférieure

- **Options** : *Monotone* (lignes toutes dans le même sens, rendu uniforme), *Monotone en ligne*, *Rectiligne*, *Concentrique*, *Hilbert*, *Spirale d'Archimède*, *Octogramme*.
- **Conseil** : *Monotone* pour le dessus (le plus beau), *Rectiligne* pour le dessous. *Concentrique* pour les pièces rondes.

### Seuil de remplissage plein interne

- **C'est quoi** : transforme en remplissage plein les petites zones internes où un remplissage alvéolé n'aurait pas de sens.
- **Effet** : évite les zones creuses fragiles dans les parties fines.

## Fiche CP-03 — Remplissage (rappel rapide)

Tous les motifs et leurs réglages sont détaillés dans la rubrique [Remplissage](#/remplissage). Dans Creality Print, ils sont dans l'onglet **Résistance** : *Densité du remplissage*, *Motif*, *Longueur d'ancrage*, *Remplissage combiné tous les N couches*, *Chevauchement remplissage/parois*.

**Spécifique à Creality Print 7** : nouveaux motifs **Lateral Lattice** (vitesse proche du Zig-zag, solidité proche du Lattice), **Lateral Honeycomb** (nid d'abeille « ingénierie »), **Locked Zag** (on règle séparément la peau et le cœur du remplissage), **TPMS-D** (apparu en 6.0) et le paramètre **Fill Multiline** (plusieurs lignes parallèles par trait de remplissage).

## Fiche CP-04 — Vitesse et accélération

### Vitesses par type de ligne

- **C'est quoi** : une vitesse en mm/s pour chaque type de trajet : première couche, paroi extérieure, paroi intérieure, remplissage, remplissage plein, surface supérieure, pont, support, petits périmètres, déplacement.
- **Effet** : la paroi extérieure est celle qu'on voit : la ralentir améliore l'aspect. Le remplissage est caché : on peut l'accélérer. Trop vite = sous-extrusion, mauvaise adhésion entre couches.
- **Valeurs typiques (imprimante rapide type K1/K2, PLA rapide)** : première couche 50 mm/s, paroi extérieure 200 mm/s, parois intérieures 300 mm/s, remplissage 270–300 mm/s, surface supérieure 200 mm/s, pont 50 mm/s, déplacement 500 mm/s.
- **Valeurs typiques (Ender 3 classique, Bowden)** : première couche 20–25 mm/s, paroi extérieure 40 mm/s, intérieure 60 mm/s, remplissage 80 mm/s.
- **Exemple** : si la surface extérieure montre des vagues après chaque coin, baisser la paroi extérieure de 200 à 120 mm/s.

### Débit volumétrique maximal (Max volumetric speed) — réglage filament

- **C'est quoi** : la quantité maximale de plastique (mm³/s) que la buse peut fondre. Le logiciel ralentit automatiquement si une vitesse demandée dépasse cette limite.
- **Effet** : c'est souvent la *vraie* limite de vitesse. Trop haut = sous-extrusion ; trop bas = impression inutilement lente.
- **Valeurs typiques** : PLA standard 12–15 mm³/s, PLA « Hyper/Rapid » 20–25 mm³/s, PETG 9–15 mm³/s, TPU 3–6 mm³/s, ASA 14–20 mm³/s.
- **Calcul** : vitesse max (mm/s) = débit max ÷ (hauteur de couche × largeur de ligne). Ex. 20 ÷ (0,2 × 0,42) ≈ 238 mm/s.

### Ralentissement en surplomb (Slow down for overhangs)

- **C'est quoi** : réduit la vitesse selon le pourcentage de la ligne qui est dans le vide (0–25 %, 25–50 %, 50–75 %, 75–100 %).
- **Effet** : surplombs plus propres, moins d'enroulement vers le haut. Amélioré en 6.2 (surplombs de 20°) et en 7.1 (moins de sous-extrusion juste après un surplomb).
- **Conseil** : toujours activé.

### Accélération

- **C'est quoi** : la rapidité avec laquelle la tête atteint sa vitesse (mm/s²). Réglable par type de ligne.
- **Effet** : trop haute = vibrations, « ghosting » (échos des formes sur la surface), décalage de couches. Plus basse = surface plus propre, impression plus longue.
- **Valeurs typiques (K1/K2)** : 10 000–20 000 mm/s² en général, 5 000 mm/s² pour la paroi extérieure, 500–1 000 mm/s² pour la première couche.
- **Nouveau 7.0** : *Accélération des courts déplacements* et *Seuil de court déplacement* : les petits sauts de la tête se font avec une accélération réduite (défaut 200 mm/s²) pour limiter les vibrations.

### Jerk / Vitesse de virage carré (Square corner velocity)

- **C'est quoi** : vitesse à laquelle la tête peut prendre un angle sans ralentir.
- **Effet** : trop haut = coins arrondis et vibrations ; trop bas = coins gonflés.
- **Conseil** : garder la valeur du profil d'imprimante.

## Fiche CP-05 — Refroidissement (dans le préréglage Filament)

### Ventilateur de pièce (Part cooling fan)

- **C'est quoi** : le ventilateur qui souffle sur le plastique qui vient d'être déposé. On règle une vitesse mini et maxi, et le nombre de couches sans ventilation au début.
- **Effet** : plus de ventilation = surplombs, ponts et petits détails plus propres. Moins = meilleure adhésion entre couches, moins de warping.
- **Valeurs typiques** : PLA 100 % ; PETG 30–60 % ; TPU 50–100 % ; ASA 0–30 % ; nylon 0–30 %. Ventilateur coupé sur les 1 à 3 premières couches.
- **Exemple** : un PETG imprimé avec 100 % de ventilation casse facilement entre les couches : redescendre à 40 %.

### Ventilateur auxiliaire et ventilateur de caisson

- **C'est quoi** : sur K1/K2, un ventilateur latéral puissant (auxiliaire) et un ventilateur d'extraction du caisson.
- **Conseil** : auxiliaire 50–100 % pour le PLA, 0 % pour ASA/ABS/nylon. Caisson fermé et chauffé pour ASA et nylon ; ouvrir le capot pour le PLA si le caisson dépasse ~35 °C (sinon bouchage).

### Temps de couche minimum (Slow printing down for better layer cooling)

- **C'est quoi** : si une couche est imprimée trop vite, l'imprimante ralentit pour que le plastique ait le temps de refroidir.
- **Effet** : indispensable pour les petites pièces et les pointes (sinon elles fondent et se déforment).
- **Valeurs typiques** : 4–8 s pour le PLA ; vitesse minimale 10–20 mm/s.
- **Nouveau 7.0 — Logique de ralentissement** : *Surface homogène* (Consistent Surface) ralentit en douceur avec une distance de transition réglable pour éviter une bande visible ; *Refroidissement uniforme* (Uniform Cooling) privilégie un refroidissement égal de toute la couche.

### Ventilation des ponts et surplombs

- **C'est quoi** : force le ventilateur à une vitesse donnée sur les ponts et surplombs.
- **Valeurs typiques** : 100 % (PLA), 60–80 % (PETG), 40–60 % (ASA).

## Fiche CP-06 — Filament : températures, débit, rétraction

### Température de buse

- **C'est quoi** : la température de fusion. On règle une valeur pour la première couche et une pour les suivantes.
- **Effet** : trop chaud = fils (stringing), surplombs moches, gouttes. Trop froid = sous-extrusion, couches qui se séparent, claquements de l'extrudeur.
- **Valeurs** : voir la rubrique [Filaments](#/filaments). Faites toujours une **tour de température** (menu *Calibration*).

### Température du plateau (par type de plaque)

- **C'est quoi** : une température pour chaque type de surface (plaque lisse PEI, texturée PEI, époxy…). Le logiciel choisit selon la plaque déclarée.
- **Effet** : trop froid = décollement ; trop chaud = patte d'éléphant, pièce qui se déforme en bas (PLA).

### Température de caisson (Chamber temperature)

- **C'est quoi** : sur K2 Plus/K2 Pro, température du caisson chauffé. Les profils ABS/ASA/PC/PA l'activent à 50–60 °C.
- **Conseil** : 0 (désactivé) pour PLA, PETG, TPU.

### Ratio de débit (Flow ratio)

- **C'est quoi** : multiplicateur de la quantité de plastique extrudée.
- **Effet** : trop haut = surface boursouflée, bords qui débordent, dessus rugueux ; trop bas = trous entre lignes, pièce fragile.
- **Valeurs typiques** : 0,95–1,00 (PLA), 0,95–1,02 (PETG), 1,00–1,05 (TPU).
- **Comment le régler** : menu *Calibration* → *Débit* (flow rate), choisir le carré dont le dessus est le plus lisse.

### Pressure Advance / Avance de pression

- **C'est quoi** : compense le retard entre la poussée de l'extrudeur et la sortie du plastique.
- **Effet** : coins nets, débuts et fins de lignes réguliers.
- **Valeurs typiques** : 0,02–0,06 (direct drive), 0,3–0,6 (Bowden). Les K1/K2 peuvent le calibrer automatiquement.
- **Comment le régler** : *Calibration* → *Pressure Advance* (motif de lignes ou tour).

### Rétraction (longueur et vitesse)

- **C'est quoi** : recul du filament avant un déplacement.
- **Effet** : pas assez = fils et gouttes ; trop = bouchage, trous au début des lignes, filament abîmé.
- **Valeurs typiques** : direct drive 0,5–1 mm à 30–40 mm/s ; Bowden 4–6 mm à 40–45 mm/s. TPU : 0–1 mm, lentement.
- **Réglages associés** : *Levée en Z* (z-hop, 0,2–0,4 mm, évite que la buse accroche la pièce, mais peut augmenter les fils), *Essuyage* (wipe : la buse frotte la paroi en rétractant), *Rétracter lors du changement de couche*, *Pas de rétraction sur le remplissage* (évite des rétractions inutiles cachées).

### Longue rétraction à la coupe (multicouleur, 7.0, expérimental)

- **C'est quoi** : avec le boîtier multi-filament CFS, le filament recule plus avant d'être coupé lors d'un changement de couleur.
- **Effet** : moins de purge gaspillée. Option expérimentale, à tester.

### Retrait / Rétractation du matériau (Shrinkage)

- **C'est quoi** : compense le fait que certains plastiques rétrécissent en refroidissant.
- **Valeurs typiques** : PLA 100 %, ASA ~99,5 %, nylon ~99–99,5 %. À mesurer sur un cube de 20 mm.

## Fiche CP-07 — Adhérence et autres

### Jupe (Skirt), Bordure (Brim), Radeau (Raft)

- **Jupe** : une ligne autour de la pièce, sans la toucher. Sert à amorcer la buse. 1–2 tours, distance 3–5 mm.
- **Bordure** : collerette collée à la pièce à la première couche. Empêche le décollement des coins. Largeur 3–8 mm ; type *Oreilles de souris* (brim ears) = seulement aux coins, plus facile à retirer. *Espace bordure-objet* 0,1 mm facilite le retrait.
- **Radeau** : plateforme épaisse sous la pièce. Rarement utile avec un plateau PEI ; garde pour les pièces très petites à la base ou un plateau abîmé.
- **Exemple** : une pièce ASA de 15 cm de long → bordure de 8 mm, sinon les coins se relèvent.

### Mode vase / spirale (Spiral vase)

- **C'est quoi** : imprime une seule paroi en montée continue, sans couture ni remplissage ni dessus.
- **Effet** : vases et abat-jours ultra rapides et sans couture, mais fragiles et sans couvercle.
- **Conseil** : augmenter la largeur de ligne (0,6–0,8 mm) pour une paroi plus solide.

### Séquence d'impression : par couche ou par objet

- **Par couche** (défaut) : toutes les pièces avancent ensemble.
- **Par objet** : chaque pièce est finie avant la suivante. Si une rate, les autres sont sauvées. Attention à la hauteur de la tête (risque de collision) : le logiciel limite la hauteur.

### Tour de purge (Prime tower) — multicouleur

- **C'est quoi** : petite tour à côté de la pièce où la buse se vide lors des changements de couleur.
- **Nouveautés 7.0** : parois extérieures pour la tour (plus stable), placement à 2 mm du bord, impression de la tour sur un côté, *catégorie d'adhésion* pour gérer les filaments qui ne collent pas entre eux (PLA + PETG), *Purger dans les supports* ou *dans un objet* pour réduire le gaspillage.

### Hauteur variable de couche (Adaptive layer height)

- **C'est quoi** : couches plus fines sur les courbes, plus épaisses sur les zones droites.
- **Effet** : bon compromis temps/qualité sur les pièces arrondies. Activable par objet (clic droit → *Hauteur variable*).

### Outils d'objet utiles

- **Modificateur** (clic droit → *Ajouter un modificateur*) : boîte où l'on change localement un réglage, par exemple 50 % de remplissage seulement autour d'un trou de vis.
- **Peinture de supports / couture / paroi floue** : pinceaux dans la barre d'outils.
- **Analyse IA** (7.0) : avec le service cloud activé, le logiciel indique si un modèle a besoin de supports et propose normal ou arborescent ; *Appliquer* modifie les réglages de support de l'objet.

## Fiche CP-08 — Préréglage Imprimante (à toucher rarement)

- **Taille du plateau, hauteur max, forme** : déjà corrects si vous avez choisi votre modèle.
- **Diamètre de buse** : à changer si vous montez une buse 0,2 / 0,6 / 0,8 ; choisissez plutôt le préréglage dédié à cette buse.
- **G-code de début et de fin** : instructions de chauffe, de nivellement et de purge. Ne modifiez que si vous savez ce que vous faites.
- **Limites machine** : vitesses et accélérations maximales autorisées ; le trancheur ne dépassera jamais ces valeurs.
- **Type de firmware / Klipper** : détermine les commandes envoyées (Pressure Advance, etc.).

## Fiche CP-09 — Menu Calibration (ordre conseillé)

1. **Température** (tour) : choisir l'étage le plus propre sans fils.
2. **Débit** (flow) : choisir le carré le plus lisse.
3. **Pressure Advance** : choisir la ligne la plus régulière.
4. **Rétraction** (tour) : choisir la hauteur où les fils disparaissent.
5. **Débit volumétrique max** : repérer la hauteur où la paroi commence à se dégrader et prendre 80 % de la valeur.
6. **Tolérances / VFA** : pour les pièces d'assemblage et les vibrations.

Refaire 1 à 4 à chaque nouvelle marque de filament.
