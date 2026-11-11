# Fiches remplissage

Le remplissage (infill) est la structure alvéolée à l'intérieur de la pièce. Il soutient les couches du dessus, rigidifie la pièce et fait gagner énormément de matière et de temps par rapport à une pièce pleine. **Mais ce n'est pas le premier levier de solidité** : ajouter des parois est plus efficace qu'augmenter la densité.

## R-01 — Choisir vite : le bon remplissage selon l'usage

| Usage | Motif conseillé | Densité | Parois |
| --- | --- | --- | --- |
| Figurine, déco, maquette | Lightning ou Gyroïde | 5–10 % | 2 |
| Objet du quotidien (boîte, support de téléphone) | Grille ou Gyroïde | 15 % | 3 |
| Pièce fonctionnelle (fixation, équerre) | Gyroïde, Cubique ou Lateral Lattice (Creality) | 20–35 % | 4 |
| Pièce très sollicitée (engrenage, outil) | Gyroïde ou Cubique | 40–60 % | 5–6 |
| Pièce flexible en TPU | Gyroïde ou Concentrique | 10–20 % | 2–3 |
| Grande pièce qui doit rester légère | Cubique adaptatif ou Support cubique | 10–15 % | 3 |
| Pièce translucide ou en mode déco visible | Gyroïde, Nid d'abeille, Octogramme | 10–20 % | 1–2 |

**Densité : repères généraux**

- **0–10 %** : décoratif uniquement. Le dessus peut s'affaisser si le motif ne le soutient pas.
- **15–20 %** : la valeur par défaut pour 80 % des pièces.
- **25–40 %** : pièces fonctionnelles.
- **50–100 %** : rarement utile. Au-delà de ~50 %, chaque % en plus coûte cher en temps et matière pour un gain de solidité faible. Ajoutez plutôt des parois.

## R-02 — Tableau comparatif des motifs

Notes relatives de 1 (faible) à 5 (excellent), à densité égale. Les notes sont indicatives ; la vitesse réelle dépend de l'imprimante.

| Motif | Type | Vitesse | Résistance | Soutien du dessus | Disponible |
| --- | --- | --- | --- | --- | --- |
| Lignes / Rectiligne | 2D | 5 | 2 | 3 | Les deux |
| Rectiligne aligné | 2D | 5 | 2 | 3 | Les deux |
| Zig-zag | 2D | 5 | 2 | 3 | Les deux |
| Zig-zag croisé (Cross-hatch) | 3D | 3 | 4 | 3 | Les deux |
| Grille | 2D | 4 | 3 | 4 | Les deux |
| Triangles | 2D | 4 | 3 | 3 | Les deux |
| Étoile (Tri-hexagone) | 2D | 4 | 3 | 4 | Les deux |
| Nid d'abeille | 2D | 2 | 4 | 4 | Les deux |
| Nid d'abeille 3D | 3D | 3 | 4 | 3 | Les deux |
| Cubique | 3D | 4 | 4 | 3 | Les deux |
| Quart cubique | 3D | 4 | 4 | 3 | Les deux |
| Cubique adaptatif | 3D | 4 | 3 | 3 | Les deux |
| Support cubique | 3D | 5 | 2 | 4 | Les deux |
| Gyroïde | 3D | 3 | 5 | 4 | Les deux |
| TPMS-D | 3D | 3 | 5 | 4 | Les deux |
| Lightning | 3D | 5 | 1 | 4 | Les deux |
| Concentrique | 2D | 4 | 2 | 2 | Les deux |
| Hilbert / Archimède / Octogramme | 2D | 2 | 2 | 3 | Les deux |
| Lateral Lattice | 3D | 4 | 4 | 4 | Creality Print 7 |
| Lateral Honeycomb | 3D | 3 | 5 | 4 | Creality Print 7 |
| Locked Zag | 2D/3D | 4 | 3 | 4 | Creality Print 7 |

**2D ou 3D ?** Un motif 2D répète le même dessin à chaque couche : il est solide dans le plan mais faible en hauteur. Un motif 3D change d'une couche à l'autre et forme une structure qui travaille dans toutes les directions.

## R-03 — Fiches par motif

### Lignes / Rectiligne

Une seule série de lignes parallèles, qui tourne de 90° à chaque couche.

- **Avantages** : le plus rapide et le plus économe ; aucune ligne ne se croise dans la même couche, donc pas de collision de buse.
- **Inconvénients** : faible en torsion et en compression latérale ; liaison moyenne avec les parois.
- **Exemple** : prototype de forme qu'on jettera après vérification des dimensions.

### Rectiligne aligné

Comme Rectiligne, mais les lignes gardent le même sens sur toutes les couches.

- **Avantages** : très rapide, peu de vibrations.
- **Inconvénients** : résistance très directionnelle (forte dans un sens, faible dans l'autre).

### Zig-zag

Lignes reliées en un tracé continu.

- **Avantages** : moins de déplacements et de rétractions, donc moins de fils ; rapide.
- **Inconvénients** : solidité comparable aux lignes simples.

### Zig-zag croisé (Cross-hatch)

Motif qui alterne et se transforme avec la hauteur.

- **Avantages** : bonne résistance dans toutes les directions, peu de croisements dans une même couche (moins de bruit, moins de vibrations que la grille).
- **Inconvénients** : un peu plus lent que les lignes.

### Grille (Grid)

Deux séries de lignes croisées à 90° dans chaque couche.

- **Avantages** : simple, solide en compression verticale, soutient bien le dessus. Bon motif « par défaut ».
- **Inconvénients** : la buse repasse sur les croisements à chaque couche, ce qui peut accrocher et créer du bruit ou des vibrations à haute vitesse ; faible en torsion.
- **Exemple** : boîte de rangement à 15 %.

### Triangles

Trois séries de lignes dans chaque couche, formant des triangles.

- **Avantages** : très rigide dans le plan horizontal (cisaillement).
- **Inconvénients** : triple croisement dans chaque couche (collisions possibles), plus lent que la grille.

### Étoile (Tri-hexagone)

Triangles et hexagones mêlés.

- **Avantages** : bonne répartition des efforts dans le plan, soutien correct du dessus.
- **Inconvénients** : mêmes croisements que Triangles.

### Nid d'abeille (Honeycomb)

Hexagones réguliers.

- **Avantages** : très solide, bel aspect (pièces translucides), excellente résistance à l'écrasement.
- **Inconvénients** : beaucoup de petits changements de direction : un des plus lents, vibrations sur imprimantes rapides.

### Nid d'abeille 3D

Hexagones qui se transforment en carrés selon la hauteur.

- **Avantages** : bonne résistance dans les trois directions, aucun croisement dans une couche.
- **Inconvénients** : plus lent que Cubique.

### Cubique

Cubes empilés penchés sur leur pointe.

- **Avantages** : résistance 3D équilibrée, rapide, bonne valeur sûre pour pièces fonctionnelles.
- **Inconvénients** : croisements dans la couche (moins que Grille).

### Quart cubique

Variante du cubique avec des cellules plus petites.

- **Avantages** : mêmes qualités, structure plus fine et plus homogène.

### Cubique adaptatif

Cubes grands au centre, de plus en plus petits près des parois.

- **Avantages** : économise beaucoup de matière sur les grosses pièces tout en gardant des parois bien soutenues.
- **Inconvénients** : solidité du cœur plus faible.
- **Exemple** : bac de 20 cm de côté : 30 à 40 % de filament en moins qu'un Cubique de même densité (ordre de grandeur, dépend de la forme).

### Support cubique

Remplissage très léger, qui ne se densifie que sous les surfaces du dessus.

- **Avantages** : rapide et économe ; dessus bien soutenus.
- **Inconvénients** : faible ; réservé aux pièces non sollicitées.

### Gyroïde

Surface ondulée continue, comme une éponge mathématique.

- **Avantages** : excellente résistance dans toutes les directions, aucune ligne ne se croise, peu de vibrations ; très bon pour TPU (reste souple et régulier) ; laisse circuler un liquide (pièces à remplir de résine).
- **Inconvénients** : calcul plus long, trajets courbes donc impression un peu plus lente que Grille sur les imprimantes à faible accélération.
- **Exemple** : support de vélo en PETG, 25 % gyroïde + 4 parois.

### TPMS-D

Autre surface minimale triple périodique (famille du gyroïde).

- **Avantages** : très bon rapport résistance/poids, isotrope (pareil dans toutes les directions). Introduit dans Creality Print 6.0 pour concilier solidité, temps et matière.
- **Inconvénients** : récent, moins de recul que le gyroïde ; calcul plus lourd.

### Lightning (Éclair)

Arbre de branches qui ne pousse que sous les surfaces du dessus.

- **Avantages** : le plus rapide et le plus économe ; parfait pour les figurines.
- **Inconvénients** : n'apporte quasiment aucune résistance à la pièce.
- **Exemple** : buste de 15 cm : généralement 30 à 50 % de temps en moins qu'en Grille 15 % (ordre de grandeur).

### Concentrique

Copies successives du contour vers l'intérieur.

- **Avantages** : suit la forme ; bon pour pièces rondes, flexibles (TPU) ou fines.
- **Inconvénients** : faible soutien du dessus, faible liaison entre couches.

### Hilbert, Archimède (spirale), Octogramme

Motifs décoratifs.

- **Avantages** : jolis en surface (utilisés souvent pour le dessus ou le dessous) ou à travers un plastique translucide.
- **Inconvénients** : lents, peu résistants.

### Lateral Lattice (Creality Print 7)

- **Avantages** : selon Creality, vitesse proche du Zig-zag et résistance proche d'un treillis (lattice). Bon choix « rapide mais costaud ».
- **Inconvénients** : exclusif à Creality Print ; peu de tests indépendants.

### Lateral Honeycomb (Creality Print 7)

- **Avantages** : présenté comme un remplissage « ingénierie » équilibrant résistance, vitesse et stabilité.
- **Inconvénients** : exclusif ; plus lent que Lateral Lattice.

### Locked Zag (Creality Print 7)

- **Avantages** : on règle séparément une « peau » de remplissage près des parois et un « cœur » (type et densité). Permet un extérieur dense et un centre léger.
- **Inconvénients** : plus de paramètres à comprendre.

## R-04 — Les paramètres du remplissage

### Densité du remplissage

- **C'est quoi** : pourcentage du volume intérieur occupé par le motif.
- **Effet** : plus de densité = plus rigide et lourd, plus long ; peu d'effet au-delà de 50 %.

### Motif

- Voir R-02 et R-03. On peut choisir un motif différent pour le remplissage plein interne.

### Direction / angle du remplissage

- **C'est quoi** : l'angle des lignes (45° par défaut).
- **Exemple** : pour une poutre longue, orienter à 0° (dans la longueur) augmente sa rigidité en flexion avec un motif Lignes.

### Chevauchement remplissage/paroi (Infill/wall overlap)

- **C'est quoi** : de combien le remplissage mord sur la paroi intérieure.
- **Effet** : trop faible = remplissage décollé des parois (fragile) ; trop fort = bourrelets visibles à travers la paroi.
- **Valeurs** : 15–25 %.

### Longueur d'ancrage (Anchor length)

- **C'est quoi** : longueur de ligne qui longe la paroi pour relier deux lignes de remplissage.
- **Effet** : meilleure accroche ; 0 = lignes indépendantes. Valeurs : 400 % de la largeur de ligne, max 20 mm.

### Combiner le remplissage toutes les N couches

- **C'est quoi** : imprime le remplissage en couches 2 ou 3 fois plus épaisses que les parois.
- **Effet** : gain de temps important sans changer l'aspect. Attention au débit volumétrique max : la vitesse est réduite automatiquement.
- **Exemple** : couches à 0,12 mm et remplissage combiné x2 → remplissage à 0,24 mm.

### Remplissage plein interne (motif, seuil de surface)

- **C'est quoi** : couches pleines internes et petites zones remplies à 100 % (sous les dessus, dans les zones étroites).
- **Conseil** : *Monotone* ou *Rectiligne* ; seuil de petite zone 15 mm².

### Remplissage multi-lignes (Fill Multiline — Creality Print 7)

- **C'est quoi** : chaque trait du motif est imprimé avec 2 ou 3 lignes côte à côte.
- **Effet** : murs internes plus épais et plus solides pour une même densité « perçue » ; moins de déplacements.

### Compensation de débit des petites zones (ElegooSlicer)

- Réduit le débit dans les tout petits remplissages pour éviter les surextrusions. Laisser activé.

### Vitesse et largeur de ligne du remplissage

- Le remplissage est caché : vitesse la plus haute possible (dans la limite du débit), largeur 0,45–0,50 mm pour plus de solidité.

### Remplissage avant les parois

- Option qui imprime le remplissage en premier : parois plus solides, mais motif parfois visible à travers les parois fines. Laisser désactivé pour un bel aspect.

## R-05 — Astuces avancées

- **Densité locale avec un modificateur** : ajoutez un cube ou cylindre modificateur autour d'un trou de vis et mettez-y 50–100 % de remplissage. Le reste de la pièce reste à 15 %.
- **Parois plutôt que remplissage** : pour une pièce qui doit tenir une vis, 4–5 parois autour du trou valent mieux que 80 % de remplissage.
- **Pièce étanche** : 4+ parois et 6+ couches de dessus/dessous ; le remplissage n'apporte pas d'étanchéité.
- **Pièce à poncer ou percer** : densité plus élevée ou parois plus nombreuses sur la zone travaillée.
- **TPU** : la densité règle la souplesse. 10 % gyroïde = très souple ; 40 % = ferme.
