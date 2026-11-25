#!/usr/bin/env python3
"""Prépare les données des 3 guides (à lancer une seule fois, quand les PDF changent).

Entrées :
  --pdf-dir   dossier des 3 PDF d'origine
  --ocr-dir   sortie Tesseract (fra, 300 dpi) : <ocr-dir>/<livre>/<NNN>.tsv  (voir tools/ocr.sh)
Sorties (dans guides-3d/data/) :
  books.json        titres, sommaires (sections + titre de chaque page)
  text/<livre>.json mots reconnus par page, avec leur position (recherche + surlignage)
  pages/<livre>/NNN.webp et pages/<livre>/t/NNN.webp (avec --pages)
"""
import argparse, csv, glob, json, os, re, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')

BOOKS = [
    ('cp', 'Creality_Print_en_fiches_-_A5.pdf', 'Creality Print en fiches',
     'Bibliothèque visuelle : 80 fiches pour trouver le réglage selon la tâche', '#1f7a3a'),
    ('fc', 'FreeCAD_pas_a_pas_-_Recueil_complet_A5.pdf', 'FreeCAD pas à pas',
     '100 fiches visuelles + bonus : esquisse, modélisation, impression 3D', '#c62828'),
    ('gi', 'Guide_impression_3D_complet_A5.pdf', 'Guide impression 3D complet',
     '100 fiches de configuration : imprimante, filaments, projets, erreurs, supports, checklist', '#1f3fa8'),
]

# ---------------------------------------------------------------- Creality Print
CP_FICHES = """Carte de l'interface|Trouver un paramètre|Outils de l'objet|Sélection des pièces|Écran différent|
Identifiez votre environnement|Tester sans perdre|Importer un modèle|Ouvrir un projet 3MF|Déplacer et poser|
Pivoter et orienter|Changer l'échelle|Dupliquer et répartir|Plusieurs plateaux|Séparer les parties|Couper le modèle|
Ajouter du texte|Profil d'imprimante|Diamètre de buse|Type de plateau|Profil de filament|Profil de traitement|
Auditer un 3MF|Global ou objet|Réglages modifiés|Ensemble modifié|Couches visibles|Couche variable|
Position de la couture|Peindre la couture|Fermeture supérieure|Lissage (ironing)|Ponts et pentes|Détails fins|
Orienter selon l'effort|Nombre de parois|Densité du remplissage|Motif de remplissage|Dessus et dessous pleins|
Renfort localisé|Comparer fonction et temps|Besoin de support ?|Activer les supports|Retrait des supports|
Peindre les supports|Arbre ou normal|Angle de support|Plateau seulement|Interface du support|Checklist des supports|
Surface de contact|Bordure (brim)|Brim ou raft|Paramètres de la première couche|Plateau et matériau|
Pièce haute, petite base|Inspecter la couche 1|Défaut de première couche|Lire les estimations|Profils de vitesse|
Qu'est-ce qui prend le plus ?|Imprimer plus vite|Coût des supports|Test A et B|CFS compatible ?|
Attribuer les filaments|Mapper les filaments|Purge et tour|Révision multicolore|Couche par couche|Zone critique|
Checklist d'envoi|Envoyer ou exporter|Enregistrer le projet|Garder le réglage|N'adhère pas au plateau|
Support collé ou marqué|Défauts de surface|Pièce fragile ou cassée|Après le changement"""
CP_FICHES = [s.strip() for s in CP_FICHES.replace('\n', '').split('|')]
assert len(CP_FICHES) == 80
CP_MODULES = [  # (module, titre, première fiche, dernière fiche)
    (1, 'Trouvez votre tâche dans Creality Print', 1, 7),
    (2, 'Préparez le fichier pour imprimer', 8, 17),
    (3, 'Vérifiez votre point de départ', 18, 26),
    (4, "Améliorez l'aspect de la pièce", 27, 34),
    (5, 'Préparez la pièce pour sa fonction', 35, 41),
    (6, 'Supports', 42, 50),
    (7, 'Adhérence et première couche', 51, 58),
    (8, 'Temps, vitesse et coût', 59, 64),
    (9, 'Préparez couleurs et CFS, si compatible', 65, 69),
    (10, 'Vérifiez, envoyez et sauvegardez', 70, 75),
    (11, 'Analysez un problème par symptôme', 76, 80),
]
CP_INTRO = {1: 'Couverture', 2: 'Commencez ici : comment utiliser la bibliothèque', 3: 'Index par tâche : fiches 01 à 41',
            4: 'Index par tâche : fiches 42 à 80', 5: "Compatibilité : à lire avant d'appliquer",
            6: 'Avant de modifier un réglage', 7: 'Index par tâche : fiches 01 à 41', 8: 'Index par tâche : fiches 42 à 80',
            108: "Fiches d'entretien de votre imprimante 3D", 109: 'Entretien : problèmes courants et solutions',
            110: "Checklist d'entretien", 111: "Guide des opérations d'entretien essentielles"}
CP_FIX = {13: 35, 52: 35, 124: 35, 57: 40, 23: 6, 86: 69, 107: 69, 77: 60, 79: 62}  # n° de fiche mal lu par l'OCR


def cp_structure(n_pages, ocr):
    titles, fiche_of = {}, {}
    for p in range(1, n_pages + 1):
        if p in CP_INTRO or (112 <= p <= 119 and (p - 111) in CP_INTRO):
            titles[p] = CP_INTRO.get(p) or CP_INTRO[p - 111]
            continue
        num = CP_FIX.get(p) or CP_FIX.get(p - 111)
        if not num:
            m = re.search(r'FICHE\s*(\d{2})', ocr_head(ocr, p))
            num = int(m.group(1)) if m else None
        if num:
            fiche_of[p] = num
            titles[p] = f'Fiche {num:02d} · {CP_FICHES[num - 1]}'
        else:
            titles[p] = f'Page {p}'
    sections = [('Introduction et index', 1, 8), ('Aperçu : fiches exemples', 9, 17)]
    for m, t, a, b in CP_MODULES:
        pages = [p for p in range(18, 98) if a <= fiche_of.get(p, 0) <= b]
        sections.append((f'Module {m:02d} · {t}', min(pages), max(pages)))
    sections += [('Compléments : fiches 65 à 80 (rappel)', 98, 107),
                 ('Bonus : entretien de votre imprimante', 108, 111),
                 ('Rappel : introduction et fiches exemples', 112, n_pages)]
    return sections, titles

# ---------------------------------------------------------------- FreeCAD
FC_APERCU = ["L'interface de FreeCAD", 'Créer un corps et une esquisse', "Contraintes d'esquisse", 'Dimensions',
             'Protrusion', 'Congé et chanfrein', 'Cavité', 'Perçage', 'Répétition circulaire', 'Évidement : pièce creuse',
             "Exporter pour l'impression 3D"]


def fc_structure(n_pages, pdf):
    txt = subprocess.run(['pdftotext', '-layout', '-f', '2', '-l', '5', pdf, '-'], capture_output=True, text=True).stdout
    sections, titles, cur = [], {1: 'Couverture', 2: 'Sommaire', 3: 'Sommaire (suite)', 4: 'Sommaire (suite)', 5: 'Sommaire (suite)'}, None
    for i, t in enumerate(FC_APERCU):
        titles[6 + i] = f'Aperçu · Fiche {i + 1:02d} · {t}'
    sections.append(('Couverture et sommaire', 1, 5))
    sections.append(('Aperçu : 100 fiches visuelles (extrait)', 6, 16))
    for line in txt.splitlines():
        line = line.strip()
        h = re.match(r'(MODULE \d+|BONUS(?: \d| EXTRA))\s{2,}(.+?)\s*(\d+)?$', line)
        if h:
            name = h.group(1).replace('MODULE', 'Module').replace('BONUS EXTRA', 'Bonus extra').replace('BONUS', 'Bonus')
            cur = [f'{name} · {h.group(2).strip()}', None, None]
            sections.append(cur)
            continue
        it = re.match(r'(?:(\d{2,3})\s+)?(.+?)\s*\.{3,}\s*(\d+)$', line)
        if it and cur is not None:
            p = int(it.group(3))
            titles[p] = (f'Fiche {it.group(1)} · ' if it.group(1) else '') + it.group(2).strip()
            cur[1] = p if cur[1] is None else min(cur[1], p)
            cur[2] = p if cur[2] is None else max(cur[2], p)
    return [tuple(s) for s in sections], titles

# ---------------------------------------------------------------- Guide impression 3D
GI_TITLES = """1 Volume 1 · Couverture
2 02 · Ce que vous allez configurer
3 03 · Comment utiliser ce matériel
4 04 · Comprendre les principaux réglages
5 01 · Nivellement du plateau
6 02 · Z-offset
7 03 · Première couche
8 04 · Température de la buse
9 05 · Température du plateau
10 06 · Débit d'extrusion
11 07 · Rétraction
12 08 · Vitesse d'impression
13 09 · Ventilation de la pièce
14 10 · Accélération
15 11 · Diamètre de la buse
16 12 · Bon profil d'imprimante
17 13 · Courroies et mouvement des axes
18 14 · Homing et position initiale
19 15 · Calibrage avant d'imprimer
20 16 · Bambu Lab A1
21 17 · Bambu Lab A1 mini
22 18 · Bambu Lab P1S
23 19 · Creality Ender-3 V3 SE
24 20 · Creality Ender-3 V3 KE
25 21 · Creality K1
26 22 · Creality K1C
27 23 · Anycubic Kobra 3
28 24 · Elegoo Neptune 4
29 25 · Original Prusa MK4S
30 26 · Flashforge Adventurer 5M
31 27 · Bambu Lab H2D
32 28 · Creality K2 Plus
33 29 · Anycubic Kobra S1
34 30 · Qidi Q2
35 Quelle fiche consulter ? (index visuel)
36 Volume 2 · Couverture
37 Sommaire visuel : 20 filaments et variantes
38 Avant de changer de filament, vérifiez ceci
39 Comment lire une fiche : que change chaque paramètre ?
40 PLA
41 PLA mat (matte)
42 PLA soie (silk)
43 PETG
44 ABS
45 ASA
46 TPU 95A HF
47 TPU pour AMS
48 PC / polycarbonate
49 Matériau de support pour PLA/PETG
50 PLA-CF
51 PA6-CF
52 PA6-GF
53 PC Blend Carbon Fiber
54 PETG-CF
55 PLA bois (wood)
56 PETG translucide
57 PLA phosphorescent (glow)
58 PVA soluble dans l'eau
59 PVB
60 Quel filament consulter ? (index visuel)
61 Volume 3 · Configurez votre projet
62 Sommaire visuel : 50 types de projets
63 04 · Vase en mode spirale
64 Avant de cliquer sur imprimer : comment configurer un projet
65 01 · Lampe décorative
66 05 · Plaque ou enseigne avec texte
67 02 · Lampe translucide
68 03 · Vase décoratif
69 Les 8 réglages les plus fréquents
70 06 · Sculpture décorative
71 07 · Lithophanie
72 08 · Tableau 3D en relief
73 09 · Décoration à suspendre
74 10 · Dôme ajouré pour luminaire
75 11 · Articulé print-in-place
76 12 · Fidget print-in-place
77 13 · Petite voiture à roues mobiles
78 14 · Figurine articulée à emboîtement
79 15 · Toupie
80 16 · Puzzle à emboîtement
81 17 · Jouet sensoriel en mouvement
82 18 · Engrenages mobiles print-in-place
83 19 · Labyrinthe à bille
84 20 · Blocs de construction à emboîter
85 21 · Boîte à couvercle emboîtable
86 22 · Boîte à charnière print-in-place
87 23 · Organiseur de tiroir
88 24 · Support pour téléphone
89 25 · Porte-outils
90 26 · Plateau vide-poches
91 27 · Support pour casque audio
92 28 · Organiseur et clips pour câbles
93 29 · Support modulaire pour pegboard
94 30 · Support pour bobine de filament
95 31 · Emboîtement snap-fit
96 32 · Filetage et écrou imprimés
97 33 · Engrenage fonctionnel
98 34 · Équerre en L / bracket
99 35 · Gabarit de positionnement
100 36 · Axe et bague
101 37 · Charnière à tige séparée
102 38 · Poulie simple
103 39 · Entretoise et rondelle
104 40 · Bouton de réglage / knob
105 41 · Grande pièce
106 42 · Pièce haute et étroite
107 43 · Pièce très petite et détaillée
108 44 · Pont / bridging
109 45 · Overhangs (porte-à-faux)
110 46 · Parois fines
111 47 · Pièce pour résistance maximale
112 48 · Prototype rapide : réduire le temps
113 49 · Projet multicolore
114 50 · Surface supérieure lisse / ironing
115 Index des 50 configurations de projet
116 Guide visuel des erreurs en impression 3D
117 Ne changez pas tout d'un coup
118 Où est le défaut ? (carte visuelle)
119 Suivez cet ordre de diagnostic
120 01 · La première couche n'accroche pas
121 02 · Buse trop près du plateau
122 03 · Buse trop loin du plateau
123 04 · Stringing / fils
124 05 · Warping / coins qui se soulèvent
125 06 · Sous-extrusion / manque de matière
126 07 · Sur-extrusion / excès de matière
127 08 · Layer shift / décalage de couches
128 09 · Ghosting / ringing
129 10 · Séparation des couches
130 11 · Z-seam très visible / marques latérales
131 12 · Mauvais bridging / ponts affaissés
132 13 · Overhang déformé
133 14 · Mauvaise surface au-dessus des supports
134 15 · Elephant foot / base élargie
135 16 · Spaghetti / impression ratée
136 17 · Buse partiellement bouchée
137 18 · Filament rongé / extrudeur qui patine
138 19 · Trous sur la surface supérieure
139 20 · Pillowing / ondulations sur le dessus
140 21 · Blobs / petites saillies
141 22 · Supports collés / difficiles à retirer
142 23 · Pièce hors cote / trous serrés
143 24 · Parois fines ou détails qui disparaissent
144 25 · Remplissage qui marque la paroi externe
145 26 · Blob sur la hotend / masse de plastique sur la buse
146 Lequel de ces problèmes ressemble au vôtre ?
147 Checklist : mauvaise première couche ? Vérifiez dans cet ordre
148 Checklist : manque ou excès de matière ? Vérifiez ceci
149 Checklist : couches décalées, ondes ou bruits ?
150 Index final : 26 erreurs d'impression 3D
151 Guide visuel des supports pour l'impression 3D
152 La pièce a-t-elle vraiment besoin de support ?
153 L'orientation d'abord, le support ensuite
154 Un overhang n'est pas la même chose qu'un bridge
155 Support normal : le plus direct et polyvalent
156 Support organique / arbre : moins de contact, plus de stratégie
157 Facile à retirer ou meilleure surface ?
158 Sans bonne première couche, le support échoue
159 Supporter toute la pièce n'est pas toujours le meilleur choix
160 Retirez le support sans détruire la pièce
161 Cas : sculpture ou buste
162 Cas : pièce avec bras et saillies
163 Cas : surface plane suspendue
164 Cas : cavités et zones internes
165 Cas : équerre en L / bracket fonctionnel
166 Cas : tunnel, ouverture et bridge
167 Cas : pièce courbe ou sphérique
168 Cas : figurine avec beaucoup de détails
169 Cas : articulé / print-in-place
170 Cas : support haut, fin ou instable
171 Où générer du support ?
172 Distance entre support et pièce
173 Interface de support
174 Densité et structure du support
175 Support sur le plateau uniquement ou partout
176 Bloqueurs, forceurs et peinture de support
177 Matériau de support et multimatériau
178 Imprimez un test de support avant une pièce de 10 heures
179 Quand le support échoue
180 Avant de cliquer sur « Imprimer »
181 Checklist visuelle avant d'imprimer en 3D
182 Avant de cliquer sur imprimer : vérification rapide
183 1 · Vérifiez le plateau d'impression
184 2 · Observez la première couche
185 3 · Avez-vous chargé le bon filament ?
186 4 · Le filament arrive-t-il librement à l'imprimante ?
187 5 · Vérifiez le profil avant de générer le G-code
188 6 · Vérifiez le modèle avant le slicing
189 7 · Est-ce vraiment la meilleure position ?
190 8 · Ne sautez jamais l'aperçu
191 Avant une impression longue
192 Avant une pièce fonctionnelle ou à emboîter
193 Avant une pièce avec beaucoup de supports
194 Avant une impression multicolore
195 Avant d'imprimer du TPU ou un filament flexible
196 Avant d'imprimer un filament abrasif ou renforcé
197 Avant d'imprimer de l'ABS, ASA, PC ou un matériau technique
198 Avant d'imprimer plusieurs pièces en même temps
199 12 astuces avant d'appuyer sur Start
200 Checklist master : prêt à imprimer ?"""
GI_SECTIONS = [
    ('Volume 1 · Configurez votre imprimante', 1, 4), ('Réglages fondamentaux et calibrage (fiches 01 à 15)', 5, 19),
    ('Imprimantes réelles (fiches 16 à 30)', 20, 35),
    ('Volume 2 · 20 filaments et variantes', 36, 39), ('Fiches filaments', 40, 60),
    ('Volume 3 · Configurez votre projet', 61, 64), ('Décoration et éclairage (01 à 10)', 65, 74),
    ('Jouets et articulés (11 à 20)', 75, 84), ('Organisation et utilitaires (21 à 30)', 85, 94),
    ('Pièces fonctionnelles (31 à 40)', 95, 104), ('Impressions spéciales (41 à 50) et index', 105, 115),
    ('Guide visuel des erreurs en impression 3D', 116, 119), ('Les 26 erreurs', 120, 145),
    ('Checklists de diagnostic et index', 146, 150),
    ('Guide visuel des supports', 151, 160), ('Supports : cas pratiques', 161, 170), ('Supports : réglages', 171, 179),
    ("Checklist avant d'imprimer", 180, 190), ('Checklists par situation', 191, 200),
]


def gi_structure(n_pages):
    titles = {}
    for line in GI_TITLES.splitlines():
        p, t = line.split(' ', 1)
        titles[int(p)] = t
    assert len(titles) == n_pages
    return GI_SECTIONS, titles

# ---------------------------------------------------------------- OCR


def read_words(tsv):
    """Mots fiables d'une page : [texte, x, y, l, h] en 1/10000 de la page, une ligne vide = nouvelle ligne."""
    words, W, H, last = [], 1, 1, None
    with open(tsv, newline='', encoding='utf-8') as fh:
        for w in csv.DictReader(fh, delimiter='\t', quoting=csv.QUOTE_NONE):
            if w['level'] == '1':
                W, H = int(w['width']), int(w['height'])
            if w['level'] != '5':
                continue
            t = (w['text'] or '').strip()
            conf = float(w['conf'])
            if not t or conf < 45 or not re.search(r'[0-9A-Za-zÀ-ÿ]', t):
                continue
            if not re.search(r'[0-9A-Za-zÀ-ÿ]{2}', t) and conf < 80:
                continue
            key = (w['block_num'], w['par_num'], w['line_num'])
            if last is not None and key != last:
                words.append(0)  # fin de ligne
            last = key
            words.append([t, round(int(w['left']) * 1e4 / W), round(int(w['top']) * 1e4 / H),
                          round(int(w['width']) * 1e4 / W), round(int(w['height']) * 1e4 / H)])
    return words


_heads = {}


def ocr_head(ocr, p):
    return _heads.get(p, '')


def make_pages(pdf, out):
    from PIL import Image
    os.makedirs(os.path.join(out, 't'), exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(['pdftoppm', '-r', '182', '-jpeg', '-jpegopt', 'quality=95', pdf, f'{td}/p'], check=True)
        for i, src in enumerate(sorted(glob.glob(f'{td}/p-*.jpg')), 1):
            im = Image.open(src).convert('RGB')
            im.save(f'{out}/{i:03d}.webp', 'WEBP', quality=68, method=5)
            im.thumbnail((180, 256))
            im.save(f'{out}/t/{i:03d}.webp', 'WEBP', quality=60, method=5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf-dir', required=True)
    ap.add_argument('--ocr-dir', required=True)
    ap.add_argument('--pages', action='store_true', help='régénérer aussi les images de page')
    a = ap.parse_args()
    os.makedirs(os.path.join(DATA, 'text'), exist_ok=True)
    meta = []
    for key, fname, title, sub, color in BOOKS:
        pdf = os.path.join(a.pdf_dir, fname)
        tsvs = sorted(glob.glob(os.path.join(a.ocr_dir, key, '*.tsv')))
        n = len(tsvs)
        pages = [read_words(t) for t in tsvs]
        _heads.clear()
        for i, ws in enumerate(pages, 1):
            top = [w[0] for w in ws if w and w[2] < 2200]
            _heads[i] = ' '.join(top)
        if key == 'cp':
            sections, titles = cp_structure(n, None)
        elif key == 'fc':
            sections, titles = fc_structure(n, pdf)
        else:
            sections, titles = gi_structure(n)
        for p in range(1, n + 1):
            titles.setdefault(p, f'Page {p}')
        with open(os.path.join(DATA, 'text', f'{key}.json'), 'w', encoding='utf-8') as fh:
            json.dump(pages, fh, ensure_ascii=False, separators=(',', ':'))
        meta.append(dict(id=key, title=title, subtitle=sub, color=color, pages=n, source=fname,
                         sections=[dict(t=s[0], a=s[1], b=s[2]) for s in sections],
                         titles=[titles[p] for p in range(1, n + 1)]))
        if a.pages:
            make_pages(pdf, os.path.join(DATA, 'pages', key))
        print(key, n, 'pages,', len(sections), 'sections')
    with open(os.path.join(DATA, 'books.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
