# STL2STEP — STL vers CAO

Convertit un maillage **STL** de pièce mécanique en solide **STEP** fait de vraies faces
(**plans** et **cylindres**), qui s'ouvre dans Fusion 360, SolidWorks ou FreeCAD.
Même principe que [cutawayhq.com](https://cutawayhq.com/), mais tout est calculé sur l'appareil, sans compte ni connexion.

Deux applications, même algorithme :

| | Dossier | Plateforme |
|---|---|---|
| **Appli Android** (Java, OpenGL ES) | [`android/`](android/) | Android 7 et plus |
| **Appli Python** (fenêtre PyQt6 modifiable + ligne de commande) | [`python/`](python/) | Windows, macOS, Linux |

## Ce que ça fait

1. **Ouvrir** un STL binaire ou texte, jusqu'à 120 000 triangles.
2. **Convertir** : la tolérance d'ajustement s'adapte à la taille de la pièce (1/10 000 de la diagonale).
   Les zones non reconnues (congés sphériques, formes libres…) restent en **facettes planes**.
   L'échelle est conservée ; l'unité du STEP est le **millimètre**.
3. **Inspecter** : vues ombré + arêtes, ombré, filaire, et **carte de conversion**
   (triangles d'origine et limites des faces CAO ; bleu = plan, orange = cylindre, gris = facette).
4. **Modifier** (facultatif) : mesurer (dimensions, surface, volume ; distance entre deux points sur Android),
   **couper** par un plan (la coupe est rebouchée), enregistrer le **STL modifié**.
5. **Enregistrer le STEP** (AP214, `MANIFOLD_SOLID_BREP` si le maillage est fermé, surface ouverte sinon).

**Sections DXF** : coupe le STL en sections planes régulières (ou à des cotes précises), un calque par
section, coordonnées dans le plan de coupe, à décalquer dans la CAO.

**Découpe en 2 pièces avec plots de jonction** (pour imprimer une pièce trop grande pour le plateau) :

- *plots mâles / trous femelles* : plots chanfreinés sur la pièce basse, trous ajustés (jeu radial, profondeur
  en plus) dans la pièce haute ;
- *trous + goupilles séparées* : trous dans les deux pièces et goupilles chanfreinées à imprimer debout ;
- *sans plots* : découpe simple, faces de coupe rebouchées.

Les plots sont placés automatiquement : écartés le plus possible, en retrait des bords, et seulement là où
la matière est assez épaisse pour le trou et sa paroi (contrôle par lancer de rayons). Une section en plusieurs
zones reçoit des plots dans chaque zone. On peut aussi imposer les centres. Les pièces restent des solides fermés,
convertibles en STEP (plots et trous deviennent des cylindres).

## Télécharger

Page **Releases** du dépôt, version « STL2STEP » (tag `stl2step`), recompilée à chaque modification sur `main` :

- `STL2STEP-android.apk` — appli Android (aucune permission).
- `STL2STEP-python.zip` — appli Python.

## Appli Python

```bash
cd stl2step/python
pip install ".[qt]"      # numpy + PyQt6, pyqtgraph, PyOpenGL
stl2step-qt piece.stl    # fenêtre PyQt6 (ou : stl2step gui ; sans PyQt6 : fenêtre Tkinter simple)
stl2step convert piece.stl -o piece.step
stl2step info piece.stl
stl2step sections piece.stl --axis z --count 10        # ou --at 2.5,10,17.5 ; --split : un DXF par section
stl2step cut piece.stl --plane z=12 --keep below -o piece_coupee.stl
stl2step split piece.stl --plane z=40 --mode male --diameter 5 --length 6 --clearance 0.15
stl2step split piece.stl --plane x=120 --mode pins --at "20,15;80,15"   # goupilles, centres imposés
```

### Fenêtre PyQt6 modifiable

- **Mise en page** : `stl2step/qt/main_window.ui`, au format **Qt Designer**. Boutons, panneaux, libellés,
  raccourcis et valeurs par défaut s'y modifient sans toucher au code. Le code retrouve chaque élément
  par son nom d'objet ; un élément supprimé est simplement ignoré.
- **Apparence** : `stl2step/qt/style.qss` (feuille de style Qt). *Affichage › Recharger le style* (Ctrl+R)
  l'applique sans redémarrer. Les couleurs de la vue 3D sont dans `COLORS` (`stl2step/qt/viewer.py`).
- *Aide › Personnaliser l'interface* copie ces deux fichiers dans votre dossier de configuration, où ils
  prennent le pas sur ceux du paquet. Pour revenir à l'interface d'origine, supprimez ces copies. Vous pouvez
  aussi donner d'autres fichiers avec `stl2step-qt --ui ma_fenetre.ui --style mon_style.qss`.
- **Disposition** : les panneaux (Paramètres, Infos, Coupe, Découpe en 2 pièces, Sections, Mesure) se
  déplacent, s'empilent en onglets ou se détachent. La disposition et les réglages sont mémorisés.
- Souris : clic gauche pour tourner, molette pour zoomer, clic milieu ou Ctrl+clic pour déplacer.
  Raccourcis : 1 à 4 pour les vues, 0/7/8/9 pour les vues standard, F pour tout voir.

Utilisation comme bibliothèque :

```python
from stl2step import convert_file
r = convert_file("piece.stl", "piece.step")
print(r.report())   # faces, plans, cylindres, facettes, solide fermé…
```

Tests : `python -m pytest -q tests` (avec `pip install cadquery-ocp`, les STEP produits sont en plus
relus et contrôlés par OpenCascade : validité du solide et volume).

## Appli Android

Boutons en haut de l'écran : *Ouvrir STL*, *Convertir*, *Enregistrer STEP*, *Vue*, *Mesurer*, *Couper*,
*Découper (plots)*, *Sections DXF*, *Enregistrer STL*, *Infos*, *Annuler les modifs*. La découpe montre
les pièces écartées en couleur, puis les enregistre dans le dossier choisi (`_basse.stl`, `_haute.stl`,
`_goupilles.stl`), ou continue avec l'une d'elles. Un doigt pour tourner, deux doigts pour
zoomer et déplacer, double appui pour revenir à la vue initiale. Un STL peut aussi être ouvert depuis
un gestionnaire de fichiers ou partagé vers l'appli.

Compiler : `cd stl2step/android && ./gradlew assembleRelease` (JDK 21 et SDK Android).
Le cœur de calcul (`fr.stl2step.core`) est du Java pur, testable sans Android :

```bash
cd stl2step/android
javac -d /tmp/core app/src/main/java/fr/stl2step/core/*.java coretest/CoreSelfTest.java
java -cp /tmp/core CoreSelfTest ../samples
```

## Comment ça marche

1. **Soudure** des sommets identiques, voisinage des triangles par arête.
2. **Régions planes** : croissance depuis les plus grands triangles ; un voisin est ajouté si sa normale
   est à moins de 0,3° et ses sommets à moins de la tolérance du plan.
3. **Cylindres** : les facettes voisines reliées par des arêtes « lisses » (< 45°) sont regroupées tant que
   leurs normales restent perpendiculaires à un axe commun, que chaque facette a une arête parallèle à
   l'axe (génératrice) et que leurs sommets tombent sur un même cercle.
4. **Topologie** : sommets aux jonctions d'au moins trois faces, arêtes = chaînes de segments entre deux
   faces, ajustées en **droites** ou en **arcs de cercle** ; un cylindre dont une limite n'est ni l'un ni
   l'autre (intersection avec une sphère, par exemple) redevient des facettes.
5. **Écriture STEP** : `PLANE`, `CYLINDRICAL_SURFACE`, `LINE`, `CIRCLE`, `ADVANCED_FACE`, `CLOSED_SHELL`.

Limites : cônes, sphères, tores et formes libres restent en facettes ; pas d'identification manuelle de
faces ni d'extrusion comme sur le site.

`samples/` contient des pièces de test (cube, plaque percée, bossage, congés).
