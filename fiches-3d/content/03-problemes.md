# Fiches problèmes d'impression

Chaque fiche donne le symptôme, les causes de la plus fréquente à la plus rare, puis les remèdes. Les noms de réglages sont valables dans Creality Print et ElegooSlicer. Testez les remèdes **dans l'ordre** et un seul à la fois.

## Diagnostic rapide

| Ce que je vois | Fiche |
| --- | --- |
| La pièce ne colle pas ou se décolle en cours | P-01 |
| Les coins se relèvent | P-02 |
| Le bas de la pièce déborde | P-03 |
| Fils d'araignée entre les parties | P-04 |
| Trous, lignes maigres, pièce fragile | P-05 |
| Surface boursouflée, pièce trop grosse | P-06 |
| Les couches se séparent ou fissurent | P-07 |
| Couches décalées en escalier | P-08 |
| Échos / ondulations après les coins | P-09 |
| Surplombs enroulés, ponts qui pendent | P-10 |
| Trous ou bosses sur le dessus | P-11 |
| L'extrudeur claque, rien ne sort | P-12 |
| Bandes horizontales régulières | P-13 |
| Bourrelets, points, couture très visible | P-14 |
| Coins gonflés ou arrondis | P-15 |
| Cotes fausses, trous trop petits | P-16 |
| Petites pièces fondues | P-17 |
| Craquements, bulles, surface rugueuse | P-18 |
| Pièce arrachée, « spaghetti » | P-19 |
| Problèmes propres à un matériau | P-20 |

## P-01 — La première couche ne colle pas

**Symptôme** : le filament se traîne, fait des boules, ou la pièce se détache en cours.

**Causes** : plateau gras (traces de doigts) ; buse trop haute (Z-offset) ; plateau trop froid ; première couche trop rapide ; ventilateur actif dès la première couche ; mauvais type de plaque déclaré ; plaque usée.

**Remèdes** :

1. Laver la plaque PEI à l'eau chaude et au liquide vaisselle, rincer, sécher. Ensuite ne plus toucher la surface. L'alcool isopropylique entre deux lavages.
2. Relancer le nivellement automatique, puis ajuster le Z-offset : la ligne doit être légèrement écrasée, plate, sans transparence ni bourrelets.
3. Plateau : +5 °C (PLA 60–65 °C, PETG 75–85 °C).
4. Vitesse de première couche : 20–30 mm/s ; largeur de ligne première couche 0,50 mm.
5. *Couches sans ventilateur* : 1 à 3.
6. Vérifier que le *type de plaque* dans le logiciel correspond à la plaque installée.
7. Ajouter une bordure de 5 mm, ou un bâton de colle (PETG sur PEI lisse, nylon, TPU).

## P-02 — Warping : les coins se relèvent

**Symptôme** : les angles du bas se soulèvent ; parfois fissure horizontale sur les grandes pièces.

**Causes** : le plastique rétrécit en refroidissant. Très fréquent sur ASA, ABS, nylon ; possible sur PLA et PETG pour les grandes pièces. Courants d'air, ventilation trop forte, plateau trop froid.

**Remèdes** :

1. Fermer le caisson (ASA, nylon) et préchauffer 10 min avant de lancer.
2. Bordure de 5–10 mm ou « oreilles de souris » aux coins.
3. Plateau : ASA 90–100 °C, nylon 80–100 °C.
4. Ventilateur : ASA 0–20 %, nylon 0–30 % ; ventilateur auxiliaire à 0.
5. Coller : colle en bâton ou laque spéciale (type Dimafix, Magigoo).
6. Modèle : arrondir les angles vifs du bas (congé de 2–3 mm) si vous dessinez la pièce.
7. Remplissage moins dense (15 %) : moins de matière qui tire.

## P-03 — Patte d'éléphant

**Symptôme** : les premières couches débordent vers l'extérieur.

**Causes** : buse trop basse, plateau trop chaud, poids de la pièce sur un plastique encore mou.

**Remèdes** : remonter un peu le Z-offset (+0,02 à +0,05 mm) ; baisser le plateau de 5 °C ; *Compensation de la patte d'éléphant* 0,1–0,2 mm ; chanfrein de 0,5 mm au bas du modèle.

## P-04 — Stringing (fils, toiles d'araignée)

**Causes** : filament humide (PETG, TPU surtout) ; température trop haute ; rétraction insuffisante ; déplacements qui traversent le vide.

**Remèdes** :

1. **Sécher le filament** (voir P-18) : règle la moitié des cas.
2. Baisser la buse de 5 °C, puis encore 5 °C (tour de température).
3. Calibrer la rétraction : direct drive 0,5 → 1,5 mm ; Bowden 4 → 6 mm.
4. Activer *Éviter de traverser les parois* et *Essuyage*.
5. Réduire ou désactiver la *Levée en Z* : elle crée souvent des fils.
6. PETG : un peu de fils est normal ; un coup de décapeur thermique rapide les fait disparaître.

## P-05 — Sous-extrusion

**Symptôme** : lignes trop fines, trous dans les parois et le dessus, remplissage qui ne touche pas les parois, pièce cassante.

**Causes** : vitesse supérieure au débit volumétrique possible ; température trop basse ; buse partiellement bouchée ; filament humide ou de diamètre irrégulier ; ratio de débit trop bas ; tension de l'extrudeur mal réglée ; bobine qui accroche.

**Remèdes** :

1. Vérifier que la bobine tourne librement et que le filament n'est pas emmêlé.
2. Baisser le *Débit volumétrique max* du filament (ex. 20 → 15 mm³/s) ou les vitesses.
3. Monter la buse de 5–10 °C.
4. Faire un « cold pull » (pousser le filament à chaud, laisser refroidir à ~90 °C pour le PLA, tirer d'un coup) ou changer la buse.
5. Calibrer le *Ratio de débit*.
6. Augmenter le *Chevauchement remplissage/paroi* à 20–25 %.

## P-06 — Sur-extrusion

**Symptôme** : surface bosselée, bords qui débordent, dessus rugueux, pièces qui ne s'emboîtent plus.

**Remèdes** : calibrer le ratio de débit (souvent 0,95–0,98) ; vérifier le diamètre de filament déclaré (1,75 mm) ; baisser le *Débit de surface supérieure* à 0,95 ; vérifier que la largeur de ligne correspond à la buse installée.

## P-07 — Délamination : les couches se séparent

**Causes** : température trop basse ; trop de ventilation ; vitesse trop haute ; couches trop épaisses ; courants d'air (ASA) ; filament humide.

**Remèdes** :

1. Buse +5 à +10 °C.
2. Ventilation réduite (PETG 30–40 %, ASA 0–15 %, nylon 0–20 %).
3. Vitesse paroi réduite de 20–30 %.
4. Hauteur de couche ≤ 0,2 mm, largeur de ligne 0,45 mm.
5. Caisson fermé pour ASA et nylon.
6. Orienter la pièce pour que l'effort ne tire pas dans le sens Z (les couches sont le point faible).

## P-08 — Décalage de couches (layer shift)

**Symptôme** : la pièce « glisse » d'un coup, en escalier.

**Causes** : buse qui accroche la pièce (surplombs enroulés) ; courroies détendues ; accélération trop haute ; moteur qui chauffe ; obstacle mécanique.

**Remèdes** : activer la *Levée en Z* (0,2–0,4 mm) uniquement sur les surfaces supérieures ; vérifier la tension des courroies ; réduire l'accélération de 20–30 % ; nettoyer et lubrifier les axes ; vérifier qu'aucun câble ne frotte.

## P-09 — Ghosting / ringing (échos et ondulations)

**Symptôme** : une ombre répétée des détails, juste après les coins ou les lettres.

**Causes** : vibrations de la machine à haute accélération.

**Remèdes** : refaire la calibration *Input shaping* de l'imprimante (automatique sur K1/K2/Centauri Carbon) ; réduire l'accélération de la paroi extérieure (3 000–5 000 mm/s²) ; poser l'imprimante sur un support lourd et stable ; vérifier les courroies et les vis.

## P-10 — Surplombs et ponts ratés

**Symptôme** : les bords en surplomb se recourbent vers le haut ; les ponts pendent ou cassent.

**Remèdes** :

1. Ventilation à 100 % sur surplombs et ponts (PLA) ; 60–80 % (PETG).
2. *Ralentir en surplomb* activé.
3. Baisser la buse de 5 °C.
4. Ponts : *Débit des ponts* 0,85–0,9, vitesse 25–40 mm/s, désactiver *Ponts épais* si la face du dessous doit être belle.
5. Au-delà de 50–55° de surplomb : supports, ou réorienter la pièce, ou *Rendre les surplombs imprimables* (ElegooSlicer/Orca).

## P-11 — Dessus troués ou bosselés (pillowing)

**Causes** : pas assez de couches pleines du dessus ; remplissage trop peu dense ; ventilation faible ; sous-extrusion.

**Remèdes** : 5–7 couches du dessus (épaisseur ≥ 1 mm) ; remplissage ≥ 15 % ou motif qui soutient bien (Grille, Gyroïde) ; ventilation 100 % (PLA) ; *Ne pas filtrer les ponts internes* ; repassage pour finir.

## P-12 — Bouchage, claquement de l'extrudeur

**Symptôme** : clic régulier de l'extrudeur, filament grignoté, plus rien ne sort.

**Causes** : température trop basse pour la vitesse ; buse bouchée (poussière, carbonisation) ; rétraction excessive ; caisson trop chaud avec du PLA (le filament ramollit trop tôt) ; buse trop proche du plateau à la première couche.

**Remèdes** :

1. Monter de 10 °C et extruder à la main pour voir si ça coule.
2. Cold pull, ou aiguille de nettoyage 0,4 mm, ou remplacer la buse (pas cher).
3. Rétraction direct drive ≤ 1,5 mm.
4. PLA dans une imprimante fermée : ouvrir le capot ou la porte.
5. Après un matériau chaud (ASA, nylon), purger à haute température avant de remettre du PLA.

## P-13 — Bandes horizontales (Z-banding)

**Causes** : tige filetée Z voilée ou mal alignée ; variations de température du plateau ; changements brusques de vitesse entre couches ; diamètre de filament irrégulier.

**Remèdes** : vérifier et graisser la ou les vis Z ; *Temps de couche minimum* cohérent ; Creality Print 7 : *Lissage de vitesse des parois le long de Z* ; filament de meilleure qualité ; hauteur de couche multiple du pas moteur (0,04 mm : 0,12 / 0,16 / 0,20 / 0,24 / 0,28).

## P-14 — Bourrelets, points (zits) et couture trop visible

**Remèdes** : couture *Arrière* ou *Alignée* ; *Couture en écharpe* ; *Espace de couture* 10–15 % ; calibrer le Pressure Advance ; activer l'*Essuyage* ; peindre la couture dans un angle de la pièce où elle se cache.

## P-15 — Coins gonflés ou arrondis

**Causes** : Pressure Advance mal réglé ; vitesse de virage trop haute ; sur-extrusion.

**Remèdes** : calibrer le Pressure Advance (P-A trop bas = coins gonflés ; trop haut = coins creusés) ; ordre des parois *Extérieur/Intérieur* ; réduire légèrement le ratio de débit.

## P-16 — Cotes fausses, trous trop petits, pièces qui ne s'emboîtent pas

**Remèdes** :

1. Calibrer le débit d'abord : la sur-extrusion réduit tous les trous.
2. *Compensation de trou XY* +0,05 à +0,15 mm ; *Polytrous* (ElegooSlicer).
3. Prévoir 0,2–0,3 mm de jeu entre deux pièces à emboîter (0,1 mm pour un serrage).
4. Ordre des parois *Extérieur/Intérieur*, *Paroi précise*.
5. Matériaux qui rétrécissent (ASA, nylon) : régler le *Retrait* du filament.

## P-17 — Petites pièces ou pointes fondues

**Cause** : la couche est imprimée si vite que la précédente est encore molle.

**Remèdes** : *Temps de couche minimum* 6–10 s ; ventilation 100 % (PLA) ; imprimer plusieurs exemplaires en même temps (chaque couche dure plus longtemps) ; baisser la buse de 5 °C.

## P-18 — Filament humide

**Symptôme** : petits craquements ou « pops » pendant l'impression, vapeur, bulles, surface rugueuse, beaucoup de fils, pièce cassante.

**Remèdes** : sécher dans un déshydrateur à filament ou un four à chaleur tournante bien réglé :

| Matériau | Température de séchage | Durée |
| --- | --- | --- |
| PLA | 45–50 °C | 4–6 h |
| PETG | 55–65 °C | 4–6 h |
| TPU | 50–60 °C | 6–8 h |
| ASA | 70–80 °C | 4–6 h |
| Nylon (PA) | 70–90 °C | 8–12 h |

Stockage ensuite en boîte ou sac étanche avec dessiccant. Le nylon doit idéalement être imprimé depuis un séchoir en fonctionnement.

## P-19 — « Spaghetti » : la pièce est arrachée en cours

**Causes** : adhérence insuffisante (P-01), warping (P-02), buse qui accroche un surplomb enroulé (P-10), pièce haute et fine qui oscille.

**Remèdes** : traiter la cause ; bordure ; pour les pièces hautes et fines, ralentir les déplacements et ajouter des supports-témoins ou imprimer couché. Activer la détection IA de la caméra si l'imprimante en a une (K1/K2, Centauri Carbon).

## P-20 — Problèmes typiques par matériau

| Matériau | Problème fréquent | Remède rapide |
| --- | --- | --- |
| PLA | Bouchage dans imprimante fermée | Ouvrir capot/porte, ventilateur caisson |
| PLA | Pointes fondues | Temps de couche min. 8 s, ventilation 100 % |
| PETG | Colle trop sur PEI lisse (arrache la couche PEI) | Colle en bâton comme séparateur, ou PEI texturé |
| PETG | Bourrelet qui s'accumule sur la buse | Baisser de 5 °C, débit 0,95, nettoyer la buse à chaud |
| TPU | Filament qui s'enroule dans l'extrudeur | Vitesse 20–40 mm/s, rétraction 0–1 mm, pas de système multicouleur (CFS/AMS) |
| ASA | Fissures entre couches, odeur | Caisson fermé et chaud, ventilation 0–15 %, aérer la pièce où se trouve l'imprimante |
| Nylon | Pièce molle, bulles, décollement | Sécher 8–12 h, colle sur plateau, caisson chaud |
| Fibre de carbone (-CF) | Buse laiton usée en quelques bobines | Buse en acier trempé |
