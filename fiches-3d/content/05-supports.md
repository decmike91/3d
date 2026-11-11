# Fiches supports

Un bon support tient la pièce pendant l'impression **et** se retire sans laisser de marque. Ces deux objectifs s'opposent : plus le support est collé, mieux il soutient, mais plus il est dur à enlever. Tout l'art est dans les **distances** et l'**interface**.

## S-01 — Avant d'ajouter des supports : en a-t-on besoin ?

1. **Règle des 45°** : un surplomb de moins de 45° par rapport à la verticale s'imprime en général sans support (jusqu'à 55–60° en PLA bien ventilé).
2. **Ponts** : un pont horizontal de moins de 20–30 mm passe souvent sans support.
3. **Réorienter la pièce** : c'est la meilleure façon de supprimer des supports. Outil *Poser sur une face* (touche F) et *Orientation automatique*.
4. **Couper la pièce** en deux (outil Couper) et la recoller après, avec des tenons.
5. **Modifier le modèle** : chanfreins à 45° au lieu de bords plats, trous en goutte d'eau ou en losange au lieu de trous ronds horizontaux.
6. Creality Print 7 : l'**Analyse IA** indique si des supports sont nécessaires et propose un type.

## S-02 — Normal ou arborescent ?

| Critère | Normal (grille / ajusté) | Arborescent (tree / organique) |
| --- | --- | --- |
| Forme | Colonnes verticales sous toute la zone | Branches qui partent d'un tronc et ne touchent que les zones utiles |
| Matière et temps | Plus | Moins (souvent nettement) |
| Grandes surfaces planes en surplomb | Excellent | Moyen |
| Figurines, formes organiques | Moyen | Excellent |
| Contact avec la pièce | Large | Ponctuel, moins de marques |
| Retrait | Bloc par bloc, peut être dur dans les creux | Souvent en une pièce |
| Calcul | Rapide | Plus long |
| Stabilité très haute | Bonne | Les troncs fins peuvent osciller |

**Règle simple** : pièce mécanique avec surplombs plats = **Normal (Ajusté)**. Figurine, personnage, forme courbe = **Arborescent (Organique ou Hybride)**.

## S-03 — Les paramètres de base

### Activer / Type

- *Normal (auto)*, *Arborescent (auto)* : le logiciel décide où.
- *Normal (manuel)*, *Arborescent (manuel)* : uniquement là où vous avez **peint** les supports (pinceau *Peindre les supports*), et le pinceau *Bloquer* interdit des zones.
- **Conseil** : en auto avec *Sur le plateau uniquement*, puis peindre pour ajouter ou bloquer.

### Style

- **Normal** : *Grille* (bloc qui suit l'emprise) ou *Ajusté / Snug* (colle à la forme de la pièce, moins de matière, plus facile à sortir des recoins).
- **Arborescent** : *Fin*, *Épais*, *Organique* (branches lisses, très robustes), *Hybride* (arbre + morceaux de normal sous les grandes surfaces plates).

### Angle de seuil

- **C'est quoi** : en dessous de cet angle (mesuré depuis l'horizontale), les surplombs reçoivent un support.
- **Valeurs** : 30° (moins de supports, pour PLA bien ventilé) à 45° (plus sûr). PETG/ASA : 40–50°.
- **Exemple** : si le logiciel met des supports sous des pentes qui s'impriment très bien seules, baissez le seuil de 40° à 30°.

### Sur le plateau uniquement

- Interdit les supports qui partiraient de la pièce elle-même. Supprime les marques sur les faces supérieures. À activer dès que possible.

### Supprimer les petits surplombs / Seuil de surface

- Évite les supports sous de minuscules zones (bords de 1–2 mm) qui s'impriment très bien seules.

## S-04 — Les distances : le secret du retrait facile

### Distance Z supérieure (Top Z distance)

- **C'est quoi** : l'espace vertical entre le haut du support et le dessous de la pièce.
- **Effet** : trop petit = support soudé, impossible à retirer sans arracher. Trop grand = dessous qui pend et moche.
- **Valeurs** : **égal à la hauteur de couche** pour commencer (0,2 mm en couche 0,2). PLA : 0,18–0,20 mm. PETG : 0,22–0,25 mm (il colle beaucoup plus). TPU : 0,25–0,3 mm.
- **Astuce** : le logiciel arrondit cette distance à un nombre entier de couches, sauf si l'option de hauteur indépendante est activée.

### Distance Z inférieure

- **C'est quoi** : espace entre le support et la pièce quand le support repose dessus.
- **Valeur** : identique à la distance supérieure, ou 0 avec une interface du bas.

### Distance X/Y

- **C'est quoi** : espace horizontal entre le support et les parois de la pièce.
- **Effet** : trop petit = support collé aux parois verticales (marques) ; trop grand = bords des surplombs mal soutenus.
- **Valeurs** : 0,35–0,8 mm. Préférer 0,5–0,8 mm pour les figurines.
- **Option** *Priorité X/Y ou Z* : *Z prioritaire* garde la distance Z sous les surplombs légers.

## S-05 — L'interface : la zone de contact

L'interface est la « peau » du support : quelques couches plus denses tout en haut, sur lesquelles se pose la pièce.

### Couches d'interface supérieures et inférieures

- **Valeurs** : supérieures 2–3 couches ; inférieures 0–2.
- **Effet** : plus de couches = dessous plus lisse, support un peu plus collé.

### Motif d'interface

- *Rectiligne*, *Rectiligne entrelacé*, *Concentrique*, *Grille*.
- **Conseil** : *Rectiligne entrelacé* pour un dessous propre ; *Concentrique* se retire facilement en pelant.

### Espacement de l'interface

- **C'est quoi** : distance entre les lignes de l'interface.
- **Valeurs** : 0,2–0,5 mm. 0 = interface pleine (beau dessous, mais très collée). 0,3–0,5 = compromis.

### Repassage des interfaces de support (Creality Print 7.1)

- **C'est quoi** : après l'interface, une passe rapide à faible débit (10 % par défaut) lisse le dessus du support.
- **Effet** : la face de la pièce posée dessus est nettement plus lisse.

### Interface dans un autre matériau (multi-filament)

- **Principe** : imprimer seulement les 1–2 couches d'interface dans un matériau qui ne colle pas à la pièce.
- **Combinaisons** : pièce PLA + interface PETG ; pièce PETG + interface PLA. On peut alors mettre une **distance Z de 0** : le dessous est quasi parfait et le support se détache seul.
- **Réglages** : *Filament pour l'interface du support* ; distance Z supérieure 0 ; espacement d'interface 0 ; Creality Print 7 : tirer parti de la *catégorie d'adhésion* pour éviter que les matériaux soient mélangés ailleurs.
- Il existe aussi des filaments « support » dédiés : PVA ou BVOH (solubles à l'eau), « breakaway ».

## S-06 — Corps du support

### Motif de base et espacement

- **Motif** : *Rectiligne* (rapide), *Rectiligne grille* (plus rigide), *Lightning* (très léger), *Creux* (seulement la peau).
- **Espacement** : 2–3 mm. Plus large = moins de matière et retrait plus facile, mais moins stable.

### Paramètres arborescents

- **Angle max des branches** : 40–45° ; plus grand = branches plus couchées, plus fragiles.
- **Diamètre / angle de diamètre des branches** : 2–5 mm, grossit vers le bas pour la stabilité.
- **Distance des branches** : 1–5 mm ; plus petite = plus de points de contact.
- **Densité des branches** et **nombre de parois** : 1–2 parois.
- **Diamètre de la pointe** : 0,8–1,0 mm. Petite pointe = petite marque.
- **Bordure de tronc** : petite collerette au pied pour les supports hauts.

### Vitesse et débit des supports

- Vitesse proche du remplissage ; débit de l'interface 1,0. Sur PETG, ventiler davantage le support (si le réglage existe) aide au décollement.

## S-07 — Recettes prêtes à l'emploi (buse 0,4, couche 0,2 mm)

| Cas | Type / style | Distance Z haut | Distance X/Y | Interface haut | Espacement interface |
| --- | --- | --- | --- | --- | --- |
| Pièce mécanique PLA, surplomb plat | Normal, Ajusté | 0,20 mm | 0,5 mm | 3 couches | 0,3 mm |
| Figurine PLA | Arborescent, Organique | 0,20 mm | 0,6 mm | 2 couches | 0,4 mm |
| Pièce PETG | Normal, Ajusté | 0,25 mm | 0,6 mm | 2 couches | 0,4 mm |
| ASA | Arborescent, Hybride | 0,20 mm | 0,5 mm | 2 couches | 0,3 mm |
| TPU (si indispensable) | Arborescent, Épais | 0,30 mm | 0,8 mm | 1–2 couches | 0,5 mm |
| PLA + interface PETG | Normal ou arbre | 0 mm | 0,4 mm | 2 couches (PETG) | 0 mm |

## S-08 — Retirer les supports sans abîmer la pièce

1. **Laisser refroidir** complètement la pièce (le plastique tiède se déforme).
2. **Commencer par le support le plus accessible** et faire levier doucement avec une spatule fine ou une pince plate.
3. **Arborescent** : saisir le tronc et tourner légèrement : l'arbre vient souvent d'un bloc.
4. **Normal** : décoller d'abord le bord de l'interface, puis tirer parallèlement à la surface, pas perpendiculairement.
5. **Petits restes** : pince coupante à ras (flush cutter), puis ébarbeur ou cutter en tirant vers soi, puis papier abrasif 240 → 400 → 800 à l'eau.
6. **Marques blanches sur PLA de couleur** : un passage très rapide au décapeur thermique ravive la couleur.
7. **PETG très collé** : ne pas forcer ; repartir sur une distance Z plus grande ou une interface PLA.
8. **PVA/BVOH** : tremper dans l'eau tiède, quelques heures.

## S-09 — Problèmes de supports

| Problème | Cause | Remède |
| --- | --- | --- |
| Support soudé à la pièce | Distance Z trop petite, interface trop dense | Distance Z = 1 couche, espacement interface 0,3–0,5 mm |
| Dessous qui pend, rugueux | Distance Z trop grande, pas d'interface | 2–3 couches d'interface, Z à 0,2 mm, repassage d'interface (CP 7.1) |
| Support qui se couche ou tombe | Trop fin, trop haut, mauvaise adhérence | Bordure de support, arborescent épais, plus de parois |
| Supports partout, même inutiles | Angle de seuil trop haut | Seuil 30–35°, *Sur le plateau uniquement*, peinture manuelle |
| Marques sur les parois verticales | Distance X/Y trop petite | 0,6–0,8 mm |
| Impossible d'enlever le support d'un trou | Support dans une cavité | Bloquer avec le pinceau, ou trou en goutte d'eau dans le modèle |
