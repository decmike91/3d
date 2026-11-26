# STL2STEP — STL vers CAO

Convertit un maillage **STL** de pièce mécanique en solide **STEP** fait de vraies faces
(**plans** et **cylindres**), qui s'ouvre dans Fusion 360, SolidWorks ou FreeCAD.
Même principe que [cutawayhq.com](https://cutawayhq.com/), mais tout est calculé sur l'appareil, sans compte ni connexion.

Deux applications, même algorithme :

| | Dossier | Plateforme |
|---|---|---|
| **Appli Android** (Java, OpenGL ES) | [`android/`](android/) | Android 7 et plus |
| **Appli Python** (ligne de commande + fenêtre) | [`python/`](python/) | Windows, macOS, Linux |

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

## Télécharger

Page **Releases** du dépôt, version « STL2STEP » (tag `stl2step`), recompilée à chaque modification sur `main` :

- `STL2STEP-android.apk` — appli Android (aucune permission).
- `STL2STEP-python.zip` — appli Python.

## Appli Python

```bash
cd stl2step/python
pip install .            # ou : pip install numpy matplotlib, puis python -m stl2step …
stl2step                 # fenêtre (Tkinter + Matplotlib)
stl2step convert piece.stl -o piece.step
stl2step info piece.stl
stl2step sections piece.stl --axis z --count 10        # ou --at 2.5,10,17.5 ; --split : un DXF par section
stl2step cut piece.stl --plane z=12 --keep below -o piece_coupee.stl
```

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
*Sections DXF*, *Enregistrer STL*, *Infos*, *Annuler les modifs*. Un doigt pour tourner, deux doigts pour
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
