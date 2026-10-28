// Aide de SVG2Print : source unique pour l'onglet Aide (style .chm) et le guide PDF.
// Chaque sujet : { id, title, parent, keywords: [...], html }.
// Les images sont dans src/help/img (copiées dans www/help/img).

const fig = (name, caption) => `<figure class="hfig"><img src="help/img/${name}.jpg" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
const figN = (name, caption) => `<figure class="hfig narrow"><img src="help/img/${name}.jpg" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
const tip = (t) => `<div class="hnote tip"><b>Conseil</b>${t}</div>`;
const warn = (t) => `<div class="hnote warn"><b>Attention</b>${t}</div>`;
const see = (...ids) => `<p class="hsee">Voir aussi : ${ids.map((i) => `<a href="#${i}" data-topic="${i}">${'@@' + i + '@@'}</a>`).join(' · ')}</p>`;

export const TOPICS = [
  // ===================================================================== 1
  {
    id: 'intro', title: 'Présentation', parent: null,
    keywords: ['présentation', 'SVG2Print', 'onglets', 'fonctions'],
    html: `
<p><b>SVG2Print</b> réunit dans une seule application, pour Android et Windows, tout le chemin d'une idée jusqu'à la pièce imprimée en 3D :</p>
<ol>
<li>transformer une photo, un scan ou un croquis en dessin vectoriel <b>SVG</b> ;</li>
<li>imprimer ce SVG en <b>relief</b> (motif en saillie) ou en <b>creux</b> sur une plaque ;</li>
<li>trancher et imprimer des <b>modèles 3D</b> (STL, 3MF, OBJ), en une ou plusieurs couleurs ;</li>
<li><b>surveiller</b> les imprimantes depuis le téléphone (Android).</li>
</ol>
<p>Tout le calcul se fait <b>sur l'appareil</b> : aucune image ni aucun modèle n'est envoyé sur Internet, et l'application fonctionne sans connexion (hors envoi à l'imprimante, qui passe par le réseau local).</p>
<div class="hflow">
  <span>Photo / croquis</span><i>→</i><span>Vectoriser</span><i>→</i><span>Relief SVG</span><i>→</i><span>Imprimante</span>
</div>
<div class="hflow">
  <span>Fichier STL / 3MF / OBJ</span><i>→</i><span>Modèle 3D</span><i>→</i><span>Imprimante</span><i>→</i><span>Surveiller</span>
</div>
${see('tabs', 'printers', 'install')}`,
  },
  {
    id: 'tabs', title: 'Les onglets de l’application', parent: 'intro',
    keywords: ['onglets', 'navigation', 'Vectoriser', 'Relief SVG', 'Modèle 3D', 'Surveiller', 'Aide'],
    html: `
<p>La barre du haut donne accès aux outils. L'application rouvre le dernier onglet utilisé.</p>
<table class="htab">
<tr><th>Onglet</th><th>Rôle</th><th>Plateformes</th></tr>
<tr><td><b>Vectoriser</b></td><td>Image (PNG, JPG…) → SVG, en ligne centrale ou en contour. Bouton <i>Imprimer en 3D</i> pour passer directement au relief.</td><td>Android, Windows</td></tr>
<tr><td><b>Relief SVG</b></td><td>SVG → plaque avec motif en relief (positif) ou en creux (négatif), tranchage intégré et envoi à l'imprimante.</td><td>Android, Windows</td></tr>
<tr><td><b>Modèle 3D</b></td><td>STL / 3MF / OBJ → orientation, supports, filaments, multicolore CANVAS, tranchage CuraEngine et envoi.</td><td>Android, Windows</td></tr>
<tr><td><b>Surveiller</b></td><td>État des imprimantes, caméras, pause / reprise / arrêt, lumière, prises Tapo, alertes de fin d'impression.</td><td>Android</td></tr>
<tr><td><b>Aide</b></td><td>Cette aide : sommaire, index, recherche. Les boutons <b>?</b> des étapes ouvrent directement le bon sujet (touche <kbd>F1</kbd> sous Windows).</td><td>Android, Windows</td></tr>
</table>
<h4>Utiliser l'aide</h4>
<ul>
<li><b>Sommaire</b> : les chapitres (📕) s'ouvrent d'un clic sur ▸ ; les pages (📄) s'affichent à droite.</li>
<li><b>Index</b> : taper le début d'un mot-clé (« purge », « supports »…).</li>
<li><b>Rechercher</b> : tous les sujets contenant les mots saisis ; les mots sont surlignés dans la page.</li>
<li>Barre d'outils : Volet (masquer le sommaire), Retour, Accueil, Précédent / Suivant, Imprimer.</li>
</ul>
${fig('aide', 'L’onglet Aide : sommaire, index, recherche et page du sujet')}
${figN('telephone', 'Sur téléphone, les réglages passent sous la vue')}`,
  },
  {
    id: 'printers', title: 'Imprimantes et filaments pris en charge', parent: 'intro',
    keywords: ['imprimante', 'Centauri Carbon', 'Elegoo', 'Creality', 'K1', 'K1C', 'plateau', 'filament', 'matière'],
    html: `
<table class="htab">
<tr><th>Imprimante</th><th>Volume</th><th>Connexion</th><th>Multicolore</th></tr>
<tr><td>Elegoo Centauri Carbon</td><td>256 × 256 × 256 mm</td><td>SDCP : envoi HTTP par blocs de 1 Mio avec contrôle MD5, lancement par WebSocket (port 3030)</td><td>CANVAS, 4 emplacements</td></tr>
<tr><td>Creality K1 / K1C</td><td>220 × 220 × 250 mm</td><td>Moonraker (port 7125, ou 4408/4409 avec un mod) ; WebSocket 9999 pour la surveillance</td><td>—</td></tr>
</table>
<p>Filaments proposés (1,75 mm, buse 0,4) avec un réglage optimisé par imprimante :</p>
<table class="htab">
<tr><th>Matière</th><th>Buse (1re couche)</th><th>Plateau</th><th>Ventilateur</th><th>Débit max</th><th>Remarques</th></tr>
<tr><td>PLA HS (eSUN ePLA-HS)</td><td>220 °C (225)</td><td>60 °C</td><td>100 %</td><td>21 mm³/s (CC) · 20 (K1)</td><td>Ventilation de la chambre activée sur la Centauri</td></tr>
<tr><td>PETG HS (eSUN PETG+HS)</td><td>240 °C (245)</td><td>75 °C</td><td>40 %</td><td>16 mm³/s (CC) · 15 (K1)</td><td>Réglage par défaut du relief SVG</td></tr>
<tr><td>TPU 95A (eSUN eTPU-95A)</td><td>225 °C (230)</td><td>45 °C</td><td>60 %</td><td>3,6 mm³/s</td><td>30 mm/s max, peu de rétraction, jamais via le CANVAS</td></tr>
<tr><td>Nylon PA (eSUN ePA)</td><td>255 °C (260)</td><td>85 °C (90)</td><td>10 %</td><td>8 mm³/s</td><td>Bobine séchée, capot fermé, colle sur le PEI, bordure automatique</td></tr>
</table>
${tip('Tous ces réglages restent modifiables. Le bouton <i>Rétablir le réglage optimisé</i> (onglet Relief SVG) revient aux valeurs ci-dessus.')}`,
  },
  {
    id: 'install', title: 'Installation et mises à jour', parent: 'intro',
    keywords: ['installer', 'APK', 'Windows', 'exe', 'mise à jour', 'SmartScreen', 'GitHub', 'Releases', 'portable'],
    html: `
<p>Les versions sont compilées automatiquement sur GitHub et publiées dans la page <b>Releases</b> du dépôt <code>decmike91/3d</code> (version « latest »).</p>
<h4>Android</h4>
<ol>
<li>Sur le téléphone, ouvrir la page Releases et télécharger <b>SVG2Print-android.apk</b>.</li>
<li>Ouvrir le fichier ; Android demande d'autoriser l'installation depuis cette source (l'appli ne vient pas du Play Store).</li>
<li>Les versions suivantes s'installent <b>par-dessus</b> : la signature est fixe et le numéro de version augmente à chaque compilation, les réglages sont conservés.</li>
</ol>
<h4>Windows</h4>
<ul>
<li><b>SVG2Print-Setup</b> : installateur en français (raccourcis Bureau et menu Démarrer).</li>
<li><b>SVG2Print-Portable</b> : un seul fichier, sans installation.</li>
</ul>
<p>Au premier lancement, Windows SmartScreen peut afficher un avertissement (exécutable non signé) : <i>Informations complémentaires › Exécuter quand même</i>.</p>
${tip('Les réglages (adresses IP, filaments, préférences) sont enregistrés sur l’appareil et conservés d’une version à l’autre.')}`,
  },

  // ===================================================================== 2
  {
    id: 'start', title: 'Premiers pas', parent: null,
    keywords: ['démarrer', 'premiers pas', 'première impression'],
    html: `
<p>Pour une première impression :</p>
<ol>
<li>Donner une <b>adresse IP fixe</b> à chaque imprimante dans la box (voir <a href="#net-ip" data-topic="net-ip">@@net-ip@@</a>).</li>
<li>Dans l'onglet <b>Relief SVG</b> ou <b>Modèle 3D</b>, choisir l'imprimante, saisir son adresse IP et toucher <b>Tester la connexion</b>.</li>
<li>Ouvrir un fichier (SVG ou modèle 3D), régler, puis <b>Trancher</b>.</li>
<li>Vérifier l'aperçu des couches, puis <b>Envoyer à l'imprimante</b> (case <i>Lancer l'impression après l'envoi</i> cochée).</li>
</ol>
${see('first-connect', 'svg', 'm3')}`,
  },
  {
    id: 'first-connect', title: 'Connecter une imprimante', parent: 'start',
    keywords: ['connexion', 'adresse IP', 'tester', 'identifiant carte mère', 'MainboardID', 'rechercher', 'port', 'Moonraker'],
    html: `
<p>Le téléphone ou le PC doit être sur le <b>même réseau</b> que l'imprimante (ou relié par VPN, voir <a href="#net-remote" data-topic="net-remote">@@net-remote@@</a>).</p>
<table class="htab">
<tr><th>Champ</th><th>Centauri Carbon</th><th>K1 / K1C</th></tr>
<tr><td>Adresse IP</td><td colspan="2">Affichée dans les réglages réseau de l'écran de l'imprimante. Exemple : 192.168.1.50.</td></tr>
<tr><td>Identifiant carte mère</td><td>Laisser « auto » : il est lu automatiquement au premier test.</td><td>—</td></tr>
<tr><td>Port Moonraker</td><td>—</td><td>Laisser vide : 7125, 4408, 4409 et 80 sont essayés.</td></tr>
<tr><td>Rechercher</td><td>Trouve la Centauri sur le réseau (diffusion « M99999 », port 3000).</td><td>—</td></tr>
</table>
<p><b>Tester la connexion</b> affiche l'état de l'imprimante et ses températures. L'adresse saisie est commune aux onglets Relief SVG et Modèle 3D.</p>
${warn('Ne jamais ouvrir les ports des imprimantes sur Internet (box, DMZ) : ils n’ont ni mot de passe ni chiffrement.')}`,
  },

  // ===================================================================== 3
  {
    id: 'vec', title: 'Vectoriser une image', parent: null,
    keywords: ['vectoriser', 'Trait Fin', 'image', 'photo', 'scan', 'croquis', 'SVG', 'PNG', 'JPG'],
    html: `
<p>L'onglet <b>Vectoriser</b> (outil <i>Trait Fin</i>) transforme une image matricielle en tracés vectoriels propres, prêts à imprimer.</p>
${fig('vectoriser', 'Onglet Vectoriser : l’image d’exemple et son tracé en ligne centrale')}
<h4>Ouvrir une image</h4>
<ul>
<li><b>Ouvrir une image</b> (galerie, fichiers), <b>glisser-déposer</b> sur la feuille, ou <b>coller</b> (<kbd>Ctrl</kbd>+<kbd>V</kbd>).</li>
<li><b>Exemple</b> charge une image de démonstration.</li>
<li>Affichage : <i>Tracé</i>, <i>Superposé</i> (tracé sur l'image) ou <i>Image</i>. Zoom à deux doigts ou à la molette, déplacement au doigt.</li>
</ul>
${see('vec-modes', 'vec-settings', 'vec-export')}`,
  },
  {
    id: 'vec-modes', title: 'Ligne centrale ou contour', parent: 'vec',
    keywords: ['ligne centrale', 'contour', 'squelette', 'mode', 'remplir'],
    html: `
<table class="htab">
<tr><th>Mode</th><th>Résultat</th><th>Idéal pour</th></tr>
<tr><td><b>Ligne centrale</b></td><td>Chaque trait devient <b>une seule ligne</b> passant par son milieu ; l'épaisseur est choisie ensuite.</td><td>Croquis, plans, dessins au trait, écriture manuscrite</td></tr>
<tr><td><b>Contour</b></td><td>Une ligne fine et lisse suit le <b>bord</b> des formes ; option <i>Remplir les formes</i>.</td><td>Logos, aplats, texte, silhouettes</td></tr>
</table>
${tip('Pour imprimer un dessin au trait en relief, la ligne centrale donne des traits d’épaisseur régulière : l’onglet Relief SVG les lit en mode « parcours ».')}`,
  },
  {
    id: 'vec-settings', title: 'Réglages de détection et de nettoyage', parent: 'vec',
    keywords: ['seuil', 'Otsu', 'inversion', 'bruit', 'résolution', 'taches', 'trous', 'barbules', 'lissage', 'simplification', 'nœuds'],
    html: `
<table class="htab">
<tr><th>Réglage</th><th>Défaut</th><th>Effet</th></tr>
<tr><td>Seuil noir / blanc</td><td>auto</td><td>Niveau de gris séparant trait et fond. Automatique (méthode d'Otsu) ou manuel.</td></tr>
<tr><td>Traits clairs sur fond sombre</td><td>non</td><td>À cocher pour un tableau noir, un négatif…</td></tr>
<tr><td>Adoucir le bruit</td><td>×1</td><td>Flou léger avant le seuil (grain de photo, scan).</td></tr>
<tr><td>Résolution de calcul</td><td>1200 px</td><td>Plus haut = plus de détails, calcul plus long.</td></tr>
<tr><td>Supprimer les taches</td><td>20 px²</td><td>Efface les points isolés plus petits.</td></tr>
<tr><td>Boucher les petits trous</td><td>30 px²</td><td>Remplit les trous dans les traits.</td></tr>
<tr><td>Couper les barbules</td><td>8 px</td><td>Retire les petites branches parasites (ligne centrale).</td></tr>
<tr><td>Ignorer les traits courts</td><td>6 px</td><td>Supprime les tracés plus courts.</td></tr>
<tr><td>Lissage</td><td>4</td><td>Adoucit les courbes.</td></tr>
<tr><td>Simplification</td><td>0,6 px</td><td>Écart toléré avant d'ajouter un nœud : plus haut = fichier plus léger.</td></tr>
</table>
<p>Le bandeau d'état signale un fond pris pour du trait (« Essayez Traits clairs sur fond sombre ») ou l'absence de trait (« Ajustez le seuil »).</p>`,
  },
  {
    id: 'vec-export', title: 'Enregistrer ou imprimer le SVG', parent: 'vec',
    keywords: ['enregistrer SVG', 'copier le code', 'Imprimer en 3D', 'épaisseur', 'couleur'],
    html: `
<ul>
<li><b>Épaisseur</b> et <b>Couleur</b> du trait : appliquées au SVG enregistré.</li>
<li><b>Enregistrer le SVG</b> : boîte « Enregistrer sous » (Windows) ou partage Android (Fichiers, Drive…).</li>
<li><b>Copier le code</b> : le SVG en texte dans le presse-papiers.</li>
<li><b>Imprimer en 3D</b> : ouvre directement le tracé dans l'onglet <b>Relief SVG</b> (mode « parcours » pour la ligne centrale). Il ne reste qu'à régler la taille et la largeur des traits.</li>
</ul>
<p>Les compteurs indiquent le nombre de tracés, de nœuds et la taille du fichier.</p>`,
  },

  // ===================================================================== 4
  {
    id: 'svg', title: 'Imprimer un SVG en relief', parent: null,
    keywords: ['relief', 'SVG', 'plaque', 'positif', 'négatif', 'creux', 'pochoir', 'trancheur 2,5D'],
    html: `
<p>L'onglet <b>Relief SVG</b> fabrique une pièce à partir d'un dessin SVG : une <b>plaque</b> avec le motif en <b>relief</b> (positif) ou en <b>creux</b> (négatif). Les parois sont pleines (remplissage 100 %). Le tranchage est intégré et ne dépend d'aucun logiciel externe.</p>
${fig('relief', 'Onglet Relief SVG : motif positif sur plaque, prêt à trancher')}
<p>Le travail suit cinq étapes numérotées dans le panneau de droite (sous l'aperçu sur téléphone).</p>
${see('svg-file', 'svg-pattern', 'svg-filament', 'svg-slice')}`,
  },
  {
    id: 'svg-file', title: 'Étape 1 – Fichier', parent: 'svg',
    keywords: ['ouvrir SVG', 'lecture du dessin', 'traits', 'formes pleines', 'blanc est du vide', 'largeur des traits', 'texte'],
    html: `
<ul>
<li><b>Ouvrir un SVG</b> ou glisser-déposer le fichier sur le plateau. Les formes pleines, les traits, les transformations, les styles CSS et les unités (mm, cm, in, pt, px) sont pris en compte.</li>
<li><b>Lecture du dessin</b> : <i>Automatique</i> (remplissages + traits), <i>Parcours uniquement</i> (traits) ou <i>Formes pleines uniquement</i>.</li>
<li><b>Largeur des traits</b> : 0 = largeur du SVG ; sinon largeur imposée en mm. Les traits plus fins que 0,4 mm sont élargis (signalé en rouge).</li>
<li><b>Le blanc est du vide</b> : les zones blanches du dessin ne sont pas imprimées.</li>
</ul>
${tip('Le texte d’un SVG doit être converti en tracés (Inkscape : Chemin › Objet en chemin).')}
${warn('Un dessin plus grand que le plateau est réduit automatiquement ; le journal l’indique.')}`,
  },
  {
    id: 'svg-pattern', title: 'Étapes 2 et 3 – Imprimante et motif', parent: 'svg',
    keywords: ['positif', 'négatif', 'miroir', 'rotation', 'échelle', 'proportions', 'agrandir au plateau', 'épaisseur plaque', 'hauteur motif', 'forme de plaque', 'marge', 'coins'],
    html: `
<p><b>Imprimante</b> : Centauri Carbon ou K1 (voir <a href="#first-connect" data-topic="first-connect">@@first-connect@@</a>).</p>
<p><b>Motif</b> :</p>
<table class="htab">
<tr><th>Réglage</th><th>Défaut</th><th>Détail</th></tr>
<tr><td>Positif / Négatif</td><td>Positif</td><td>Motif en saillie, ou en creux dans la plaque. Avec une plaque de 0 mm, le négatif donne un <b>pochoir</b>.</td></tr>
<tr><td>Largeur / hauteur / échelle</td><td>—</td><td>Chaîne ⛓ : proportions verrouillées ou libres.</td></tr>
<tr><td>Rotation, miroir ↔ ↕, pivoter 90°</td><td>—</td><td>Le miroir sert par exemple aux tampons.</td></tr>
<tr><td>Agrandir au plateau / Taille d'origine</td><td>—</td><td>Remplit le plateau en gardant les proportions.</td></tr>
<tr><td>Épaisseur plaque</td><td>1 mm</td><td>0 = motif seul.</td></tr>
<tr><td>Hauteur du motif</td><td>1 mm</td><td>De 0,2 à 1 mm (raccourcis 0,2 · 0,4 · 0,6 · 0,8 · 1).</td></tr>
<tr><td>Forme de plaque</td><td>Rectangle</td><td>Rectangle, suit le contour, ou ovale.</td></tr>
<tr><td>Marge / rayon des coins</td><td>5 mm / 3 mm</td><td>Bord autour du motif, arrondi des coins.</td></tr>
</table>`,
  },
  {
    id: 'svg-filament', title: 'Étape 4 – Filament et CANVAS', parent: 'svg',
    keywords: ['matière', 'filament', 'PLA', 'PETG', 'TPU', 'nylon', 'CANVAS', 'plaque et motif', 'deux couleurs', 'réglages avancés', 'vitesses'],
    html: `
<ul>
<li><b>Matière</b> : PLA HS, PETG HS (défaut), TPU 95A ou nylon PA. Le réglage optimisé de l'imprimante est appliqué (voir <a href="#printers" data-topic="printers">@@printers@@</a>).</li>
<li><b>Modifier les réglages filament</b> : températures, ventilateur, débit, débit volumique max, avance de pression, rétraction, levée Z.</li>
<li><b>Réglages d'impression avancés</b> : hauteur de couche (0,2 mm), largeur d'extrusion (0,45 mm), parois (2), vitesses, accélérations.</li>
</ul>
<h4>Plaque et motif de couleurs différentes (CANVAS)</h4>
<p>Sur la Centauri Carbon équipée du CANVAS, cocher <b>Plaque et motif de couleurs différentes</b>, puis choisir l'emplacement (1 à 4) et la couleur de la plaque et du motif, et la matière du motif. Un <b>seul changement de filament</b> a lieu, juste avant la première couche du motif ; la purge est calculée d'après les deux couleurs.</p>
${tip('Plaque blanche et motif noir, ou l’inverse : l’effet le plus lisible, avec une seule purge.')}`,
  },
  {
    id: 'svg-slice', title: 'Étape 5 – Trancher et imprimer', parent: 'svg',
    keywords: ['trancher', 'G-code', 'couches', 'aperçu', 'durée', 'filament', 'envoyer', 'nivellement', 'vignette'],
    html: `
<ol>
<li><b>Trancher</b> calcule le G-code (quelques secondes). L'aperçu passe en vue <b>Couches</b> : curseur pour parcourir chaque couche.</li>
<li>Le bandeau affiche dimensions, nombre de couches, durée et poids de filament estimés.</li>
<li><b>Enregistrer le G-code</b> pour l'imprimer depuis une clé USB, ou <b>Envoyer à l'imprimante</b>.</li>
</ol>
<ul>
<li><b>Lancer l'impression après l'envoi</b> : sinon le fichier est seulement déposé sur l'imprimante.</li>
<li><b>Nivellement automatique avant impression</b> (Centauri Carbon).</li>
</ul>
${fig('relief-couches', 'Aperçu couche par couche après tranchage')}
<p>Le G-code reprend les débuts et fins officiels des imprimantes (purge, nettoyage de buse, <code>START_PRINT</code> sur K1) et contient une vignette affichée sur leur écran.</p>`,
  },

  // ===================================================================== 5
  {
    id: 'm3', title: 'Imprimer un modèle 3D', parent: null,
    keywords: ['modèle 3D', 'STL', '3MF', 'OBJ', 'trancheur', 'CuraEngine', 'impression 3D'],
    html: `
<p>L'onglet <b>Modèle 3D</b> tranche des fichiers <b>STL</b>, <b>3MF</b> et <b>OBJ</b> avec <b>CuraEngine</b> (le moteur de Cura), exécuté sur l'appareil. Le G-code est ensuite adapté à Klipper (Centauri Carbon et K1).</p>
${fig('m3-pieces', 'Onglet Modèle 3D : deux objets, deux filaments, sur la Centauri Carbon')}
${see('m3-open', 'm3-move', 'm3-orient', 'm3-support', 'm3-filament', 'm3-canvas', 'm3-quality', 'm3-slice')}`,
  },
  {
    id: 'm3-open', title: 'Ouvrir des fichiers 3D', parent: 'm3',
    keywords: ['ouvrir', 'STL', '3MF', 'OBJ', 'Bambu Studio', 'OrcaSlicer', 'ElegooSlicer', 'projet', 'pièces', 'unités', 'pouces'],
    html: `
<ul>
<li><b>Ouvrir des fichiers 3D</b> (plusieurs à la fois) ou glisser-déposer sur la vue.</li>
<li>Les projets <b>3MF</b> de Bambu Studio, OrcaSlicer ou ElegooSlicer gardent leurs <b>objets</b>, leurs <b>pièces</b> (assemblages), le <b>filament</b> attribué à chacun et les <b>couleurs</b> des filaments. S'il y a plusieurs filaments, le multicolore CANVAS s'active tout seul (Centauri Carbon).</li>
<li>La peinture multicolore (pinceau de Bambu/Orca) n'est pas reprise : les couleurs se choisissent par objet ou par pièce.</li>
<li>Un modèle de moins de 3 mm est signalé : souvent un fichier en pouces → échelle 2540 %.</li>
</ul>`,
  },
  {
    id: 'm3-move', title: 'Sélectionner, déplacer, pivoter', parent: 'm3',
    keywords: ['sélection', 'déplacer', 'pivoter', 'rotation', 'échelle', 'retirer', 'vue 3D', 'caméra', 'surplombs'],
    html: `
<ul>
<li><b>Vue</b> : un doigt (ou clic gauche) pour tourner, deux doigts (ou molette) pour zoomer, clic droit / deux doigts pour décaler. <b>Recentrer</b> revient à la vue d'ensemble.</li>
<li><b>Sélectionner</b> : toucher l'objet dans la vue ou dans la liste. <b>Déplacer</b> : faire glisser l'objet sélectionné sur le plateau.</li>
<li>Pour l'objet sélectionné : <b>Pivoter X / Y / Z 90°</b>, <b>Échelle (%)</b> et dimensions.</li>
<li><b>✕</b> retire l'objet de la liste.</li>
<li>Case <b>Surplombs</b> : les faces qui auront besoin de supports s'affichent en <b style="color:#e0473a">rouge</b>.</li>
</ul>`,
  },
  {
    id: 'm3-orient', title: 'Orientation automatique : solidité ou supports', parent: 'm3',
    keywords: ['orientation', 'solidité', 'résistance', 'couches', 'anisotropie', 'moins de supports', 'placer automatiquement', 'placement'],
    html: `
<p>Une pièce imprimée en FDM est nettement plus <b>faible entre les couches</b> (axe vertical) que dans le plan des couches : sous un effort, elle casse d'abord en se délaminant. L'orientation compte donc autant que le remplissage.</p>
<table class="htab">
<tr><th>Mode</th><th>Ce que cherche l'application</th></tr>
<tr><td><b>Solidité</b></td><td>Coucher la <b>plus grande dimension</b> de la pièce à plat, pour que les couches soient dans le sens des efforts ; garder une grande face d'appui et peu de surplombs ; éviter les pièces hautes et étroites qui se décollent.</td></tr>
<tr><td><b>Moins de supports</b></td><td>La surface en surplomb la plus faible possible (moins de matière perdue, surfaces plus propres), avec une bonne face d'appui.</td></tr>
</table>
<p><b>Orienter automatiquement</b> s'applique à l'objet sélectionné, ou à tous si aucun n'est sélectionné. L'application compare les grandes faces planes du modèle et les six directions principales, puis aligne la pièce sur les axes du plateau. Le résultat (surplombs en %) s'affiche sous les boutons.</p>
<p><b>Placer automatiquement</b> range tous les objets sur le plateau en laissant la place de la tour de purge.</p>
${tip('Une barre, un crochet ou une patte de fixation doivent presque toujours être imprimés couchés. Un bac ou un boîtier : ouverture vers le haut.')}`,
  },
  {
    id: 'm3-support', title: 'Supports et adhérence', parent: 'm3',
    keywords: ['supports', 'arborescents', 'tree', 'classiques', 'angle de surplomb', 'depuis le plateau', 'jupe', 'bordure', 'brim', 'adhérence', 'interface'],
    html: `
<table class="htab">
<tr><th>Réglage</th><th>Défaut</th><th>Détail</th></tr>
<tr><td>Supports</td><td>Auto · arborescents</td><td><b>Arborescents</b> : branches qui touchent peu la pièce, faciles à retirer. <b>Classiques</b> : colonnes en zigzag, pour les grands surplombs plats. <b>Aucun</b>.</td></tr>
<tr><td>Angle de surplomb</td><td>50°</td><td>Une face penchée au-delà de cet angle (par rapport à la verticale) reçoit un support.</td></tr>
<tr><td>Depuis le plateau uniquement</td><td>non</td><td>Interdit les supports posés sur la pièce elle-même.</td></tr>
<tr><td>Adhérence</td><td>Automatique</td><td>Jupe (une boucle autour), bordure / brim (collerette qui tient la pièce), ou aucune. En automatique : bordure pour le nylon et le TPU, jupe sinon.</td></tr>
</table>
<p>Les supports ont une <b>interface</b> dense sous la pièce (surface plus nette) et un écart d'une couche pour se détacher facilement.</p>`,
  },
  {
    id: 'm3-filament', title: 'Imprimante et filament', parent: 'm3',
    keywords: ['imprimante', 'filament', 'matière', 'couleur', 'PLA HS', 'PETG HS', 'TPU', 'nylon', 'séchage', 'colle'],
    html: `
<p>Choisir l'imprimante (l'adresse IP est la même que dans l'onglet Relief SVG), puis la matière et la couleur du filament. La couleur sert à l'aperçu et, en multicolore, au calcul des purges.</p>
<ul>
<li><b>PLA HS</b> : le plus simple, rapide, net. Ventilation de la chambre activée sur la Centauri pour éviter le bouchage.</li>
<li><b>PETG HS</b> : plus résistant à la chaleur et aux chocs, plus souple que le PLA.</li>
<li><b>TPU 95A</b> : souple. Vitesse plafonnée à 30 mm/s, rétraction courte ; bobine montée en direct.</li>
<li><b>Nylon PA</b> : très résistant, absorbe l'humidité. <b>Sécher la bobine</b> (70 °C, 8 h) juste avant, capot fermé, film de colle sur le plateau PEI ; bordure automatique.</li>
</ul>
<p>Les vitesses sont automatiquement limitées par le débit maximal de chaque filament.</p>`,
  },
  {
    id: 'm3-canvas', title: 'Multicolore CANVAS (Elegoo)', parent: 'm3',
    keywords: ['CANVAS', 'multicolore', 'multifilament', 'emplacement', 'slot', 'tour de purge', 'purge', 'M6211', 'slot_map', 'lire le CANVAS', 'AMS'],
    html: `
<p>Le <b>CANVAS</b> est le système 4 couleurs d'Elegoo pour la Centauri Carbon. Il n'existe pas sur la K1.</p>
<ol>
<li>Cocher <b>Multifilament CANVAS (4 emplacements)</b>. Quatre lignes apparaissent : matière et couleur de chaque emplacement.</li>
<li><b>Lire le CANVAS de l'imprimante</b> : reprend les matières et couleurs réellement chargées, et mémorise la correspondance avec les plateaux.</li>
<li>Dans la liste des objets, choisir le <b>filament 1 à 4</b> de chaque objet (« Mixte » pour un assemblage dont les pièces ont des filaments différents).</li>
<li><b>Tour de purge</b> (conseillée) : petite tour imprimée à l'arrière pour stabiliser le débit après chaque changement.</li>
<li><b>Volume de purge (×)</b> : multiplie la purge calculée d'après les couleurs (passer du foncé au clair demande plus de purge).</li>
</ol>
<p>À l'envoi, si le CANVAS a été lu, l'application indique à l'imprimante quel plateau utiliser pour chaque filament. Sinon, l'imprimante utilise l'ordre des emplacements.</p>
${warn('Le TPU ne passe pas dans le CANVAS (il est refusé). Le nylon y est possible mais doit être parfaitement sec.')}
${tip('Chaque couche où deux couleurs se côtoient coûte un changement (environ 1 min et quelques grammes de purge). Grouper les couleurs par hauteur réduit fortement le temps.')}`,
  },
  {
    id: 'm3-quality', title: 'Qualité et solidité', parent: 'm3',
    keywords: ['qualité', 'préréglage', 'rapide', 'standard', 'solide', 'résistance max', 'parois', 'remplissage', 'gyroïde', 'couches pleines', 'hauteur de couche'],
    html: `
<table class="htab">
<tr><th>Préréglage</th><th>Couche</th><th>Parois</th><th>Dessus / dessous</th><th>Remplissage</th></tr>
<tr><td>Rapide</td><td>0,28 mm</td><td>2</td><td>3 / 3</td><td>15 % grille</td></tr>
<tr><td>Standard</td><td>0,20 mm</td><td>3</td><td>4 / 4</td><td>20 % gyroïde</td></tr>
<tr><td><b>Solide</b> (défaut)</td><td>0,20 mm</td><td>4</td><td>5 / 5</td><td>40 % gyroïde</td></tr>
<tr><td>Résistance max</td><td>0,20 mm</td><td>6</td><td>6 / 6</td><td>60 % gyroïde</td></tr>
</table>
<p>Ce qui rend une pièce solide, dans l'ordre : l'<b>orientation</b>, le nombre de <b>parois</b> (elles portent l'essentiel des efforts), puis le <b>remplissage</b>. Le motif <b>gyroïde</b> résiste à peu près autant dans toutes les directions.</p>`,
  },
  {
    id: 'm3-slice', title: 'Trancher, vérifier, envoyer', parent: 'm3',
    keywords: ['trancher', 'aperçu', 'couches', 'légende', 'durée', 'poids', 'G-code', 'envoyer', 'vignette', 'CuraEngine'],
    html: `
<ol>
<li><b>Trancher</b> : le moteur se charge à la première utilisation, puis le calcul prend de quelques secondes à quelques minutes selon le modèle.</li>
<li>La vue <b>Couches</b> montre les trajets : couleurs par type (paroi externe, parois, remplissage, dessus/dessous, supports) ou, en multicolore, par filament. Le curseur parcourt les couches.</li>
<li>Le bandeau donne la durée, le poids total ; le journal détaille le poids par filament et le nombre de changements.</li>
<li><b>Enregistrer le G-code</b> ou <b>Envoyer à l'imprimante</b>.</li>
</ol>
${fig('m3-couches', 'Aperçu des couches en multicolore : filament 1, filament 2, tour de purge')}
<p>Toute modification (objet, réglage, imprimante) efface le tranchage précédent : il faut retrancher avant d'envoyer.</p>`,
  },

  // ===================================================================== 6
  {
    id: 'mon', title: 'Surveiller les imprimantes (Android)', parent: null,
    keywords: ['surveiller', 'surveillance', 'PrintMonitor', 'tableau de bord', 'Android'],
    html: `
<p>L'onglet <b>Surveiller</b> ouvre l'écran natif de surveillance (Android uniquement). Il suit les <b>deux Centauri Carbon</b> et la <b>K1</b>, avec leurs caméras et leurs prises Tapo, entièrement en local (aucun cloud Elegoo, Creality ou TP-Link).</p>
<p><b>‹ Retour</b> revient à l'application ; <b>Réglages</b> ouvre la configuration.</p>
${see('mon-dash', 'mon-tapo', 'mon-settings')}`,
  },
  {
    id: 'mon-dash', title: 'Tableau de bord et commandes', parent: 'mon',
    keywords: ['tableau de bord', 'progression', 'températures', 'caméra', 'pause', 'reprendre', 'arrêter', 'lumière', 'fin de filament', 'notifications'],
    html: `
<p>Une carte par imprimante :</p>
<ul>
<li><b>État</b>, fichier en cours, <b>progression</b>, couche, temps écoulé / restant, heure de fin estimée ;</li>
<li>températures buse, plateau, caisson ;</li>
<li><b>caméra</b> en direct (masquable) ;</li>
<li>boutons <b>Pause</b>, <b>Reprendre</b>, <b>Arrêter l'impression</b> (avec confirmation) ;</li>
<li><b>Lumière interne</b> marche / arrêt ;</li>
<li>indicateur <b>Filament</b> (détecteur de fin de filament).</li>
</ul>
<p><b>Notifications</b> : impression terminée, pause (fin de filament ?), erreur, arrêt, perte de connexion pendant une impression.</p>
${warn('La surveillance à distance ne remplace pas un détecteur de fumée près des imprimantes.')}`,
  },
  {
    id: 'mon-tapo', title: 'Prises Tapo et extinction automatique', parent: 'mon',
    keywords: ['Tapo', 'prise', 'P110', 'P115', 'consommation', 'puissance', 'extinction automatique', 'compatibilité tierce'],
    html: `
<ul>
<li>Marche / arrêt de la prise, <b>puissance</b> instantanée et <b>consommation du jour</b> (P110 / P115).</li>
<li>Garde-fou : couper une prise alors que la buse est chaude ou qu'une impression tourne demande une confirmation.</li>
<li><b>Extinction automatique</b> (option par imprimante) : la prise est coupée après la fin de l'impression, une fois la buse sous 50 °C, plus 2 minutes.</li>
</ul>
${tip('Dans l’appli Tapo : Moi › Services tiers › Compatibilité tierce → activer. Sans cette option, les firmwares récents refusent les connexions locales.')}`,
  },
  {
    id: 'mon-settings', title: 'Réglages de la surveillance', parent: 'mon',
    keywords: ['réglages', 'nom affiché', 'adresse IP', 'URL caméra', 'e-mail', 'mot de passe', 'arrière-plan', 'batterie'],
    html: `
<table class="htab">
<tr><th>Réglage</th><th>Rôle</th></tr>
<tr><td>Nom affiché</td><td>Distinguer les deux Centauri (« atelier », « bureau »…) dans le tableau de bord et les notifications.</td></tr>
<tr><td>Adresse IP de l'imprimante</td><td>Laisser vide pour masquer l'imprimante.</td></tr>
<tr><td>IP de la prise Tapo</td><td>Prise associée à l'imprimante.</td></tr>
<tr><td>Extinction automatique</td><td>Voir <a href="#mon-tapo" data-topic="mon-tapo">@@mon-tapo@@</a>.</td></tr>
<tr><td>URL caméra</td><td>À remplir seulement si l'adresse par défaut ne fonctionne pas (ex. K1 rootée : <code>http://IP:4408/webcam/?action=stream</code>).</td></tr>
<tr><td>E-mail / mot de passe Tapo</td><td>Identifiants du compte Tapo, gardés sur le téléphone uniquement.</td></tr>
<tr><td>Surveillance en arrière-plan</td><td>Garde les connexions ouvertes écran éteint pour recevoir les alertes.</td></tr>
</table>
${tip('Pour les alertes écran éteint : Paramètres Android › Applis › SVG2Print › Batterie → Non restreinte.')}`,
  },

  // ===================================================================== 7
  {
    id: 'net', title: 'Réseau et accès à distance', parent: null,
    keywords: ['réseau', 'Livebox', 'box', 'Wi-Fi', 'VPN'],
    html: `
<p>Les imprimantes et les prises se pilotent sur le <b>réseau local</b>. Deux réglages rendent l'ensemble fiable : des <b>adresses IP fixes</b>, et un <b>VPN</b> pour y accéder hors de la maison.</p>
${see('net-ip', 'net-remote')}`,
  },
  {
    id: 'net-ip', title: 'Adresses IP fixes (Livebox 5)', parent: 'net',
    keywords: ['IP fixe', 'bail statique', 'DHCP', 'Livebox', 'adresse MAC', 'plan d’adressage'],
    html: `
<p>Sans IP fixe, une imprimante peut changer d'adresse après un redémarrage et l'application ne la retrouve plus.</p>
<ol>
<li>Ouvrir <code>http://192.168.1.1</code> ; identifiant <code>admin</code>, mot de passe par défaut : les 8 premiers caractères de la clé Wi-Fi.</li>
<li><i>Paramètres avancés › Réseau › DHCP</i> : ajouter un <b>bail statique</b> pour chaque appareil.</li>
<li>Redémarrer chaque appareil et vérifier l'adresse sur son écran.</li>
</ol>
<table class="htab">
<tr><th>Appareil</th><th>IP conseillée</th></tr>
<tr><td>Raspberry Pi / NAS (VPN)</td><td>192.168.1.10</td></tr>
<tr><td>Centauri Carbon n° 1 / sa prise</td><td>192.168.1.50 / .52</td></tr>
<tr><td>Creality K1 / sa prise</td><td>192.168.1.51 / .53</td></tr>
<tr><td>Centauri Carbon n° 2 / sa prise</td><td>192.168.1.54 / .55</td></tr>
</table>`,
  },
  {
    id: 'net-remote', title: 'Accès depuis l’extérieur (VPN)', parent: 'net',
    keywords: ['VPN', 'Tailscale', 'WireGuard', 'à distance', '4G', 'NAT', 'sécurité', 'DynDNS'],
    html: `
${warn('Ne jamais ouvrir dans la box (NAT/PAT, DMZ) les ports des imprimantes ou des prises (80, 3030, 3031, 7125, 8080, 9999) : n’importe qui pourrait lancer ou modifier une impression.')}
<p>La bonne méthode est un <b>VPN</b> : le téléphone rejoint le réseau de la maison et l'application garde les mêmes adresses 192.168.1.x. Il faut un petit appareil toujours allumé (Raspberry Pi, NAS ou PC).</p>
<table class="htab">
<tr><th>Solution</th><th>Avantages</th><th>À faire</th></tr>
<tr><td><b>Tailscale</b> (recommandé)</td><td>Gratuit, chiffré, rien à ouvrir sur la box</td><td>Installer Tailscale sur le Pi avec la route 192.168.1.0/24, approuver la route dans la console, installer Tailscale sur le téléphone.</td></tr>
<tr><td><b>WireGuard</b> (PiVPN)</td><td>Indépendant de tout service</td><td>Règle NAT UDP 51820 vers le Pi, nom DynDNS, profil importé par QR code.</td></tr>
</table>
<p>Test : couper le Wi-Fi, rester en 4G/5G, ouvrir l'application. La procédure complète est dans <code>docs/GUIDE-surveillance.md</code>.</p>`,
  },

  // ===================================================================== 8
  {
    id: 'trouble', title: 'Dépannage', parent: null,
    keywords: ['dépannage', 'problème', 'erreur', 'ne fonctionne pas'],
    html: `
<table class="htab">
<tr><th>Symptôme</th><th>Cause probable / solution</th></tr>
<tr><td>« Impossible de joindre l'imprimante »</td><td>Vérifier l'IP et que l'appareil est sur le même réseau (ou VPN actif).</td></tr>
<tr><td>Centauri « Hors ligne » ou WebSocket refusé</td><td>Elle accepte 5 connexions au plus : fermer Home Assistant, ElegooSlicer… Un refus immédiat sur le port 3030 peut aussi signaler une Centauri Carbon 2, pas encore prise en charge.</td></tr>
<tr><td>« L'imprimante n'a pas transmis son identifiant »</td><td>Saisir l'identifiant carte mère (menu réseau de l'imprimante) ou utiliser <i>Rechercher</i>.</td></tr>
<tr><td>Démarrage refusé : imprimante occupée</td><td>Une impression est en cours ou un message attend sur l'écran.</td></tr>
<tr><td>K1 : « Moonraker refuse l'accès »</td><td>Authentification activée sur Moonraker : l'autoriser pour le réseau local.</td></tr>
<tr><td>« Les objets dépassent du plateau »</td><td><i>Placer automatiquement</i>, réduire l'échelle ou retirer un objet.</td></tr>
<tr><td>« Pas de place pour la tour de purge »</td><td>Libérer le coin arrière ; sinon la purge se fait seulement par le CANVAS.</td></tr>
<tr><td>« Le TPU ne passe pas dans le CANVAS »</td><td>Imprimer le TPU seul, en bobine directe, sans multicolore.</td></tr>
<tr><td>Aperçu 3D indisponible (WebGL)</td><td>Appareil trop ancien : le tranchage et l'envoi restent possibles.</td></tr>
<tr><td>Vectorisation : le fond devient du trait</td><td>Cocher <i>Traits clairs sur fond sombre</i> ou régler le seuil.</td></tr>
<tr><td>Caméra Centauri noire</td><td>Un seul flux possible : fermer la caméra dans ElegooSlicer / l'appli Elegoo.</td></tr>
<tr><td>Caméra K1 injoignable après mise à jour</td><td>Les firmwares récents ne diffusent plus le MJPEG 8080 : réappliquer le correctif <code>S59mjpg_streamer</code> (K1 rootée, voir le guide de surveillance).</td></tr>
<tr><td>Prise Tapo « HTTP 403 »</td><td>Activer <i>Compatibilité tierce</i> dans l'appli Tapo.</td></tr>
<tr><td>Pas d'alerte écran éteint</td><td>Batterie « Non restreinte », surveillance en arrière-plan activée, notifications autorisées.</td></tr>
<tr><td>Mise à jour Android impossible</td><td>Seulement depuis une très ancienne version signée autrement : désinstaller une fois, puis réinstaller.</td></tr>
</table>`,
  },

  // ===================================================================== 9
  {
    id: 'glossary', title: 'Glossaire', parent: null,
    keywords: ['glossaire', 'définitions', 'vocabulaire'],
    html: `
<dl class="hgloss">
<dt>CANVAS</dt><dd>Système multicolore 4 emplacements d'Elegoo pour la Centauri Carbon.</dd>
<dt>CuraEngine</dt><dd>Moteur de tranchage du logiciel Cura, utilisé ici en WebAssembly pour l'onglet Modèle 3D.</dd>
<dt>Débit volumique</dt><dd>Quantité de plastique fondu par seconde (mm³/s) ; limite la vitesse réellement possible.</dd>
<dt>G-code</dt><dd>Fichier d'instructions exécuté par l'imprimante (déplacements, températures…).</dd>
<dt>Gyroïde</dt><dd>Motif de remplissage ondulé, résistant dans toutes les directions.</dd>
<dt>Jupe / bordure (brim)</dt><dd>Boucle autour de la pièce / collerette collée à la pièce pour l'aider à tenir au plateau.</dd>
<dt>Klipper</dt><dd>Micrologiciel des Centauri Carbon et K1.</dd>
<dt>Ligne centrale</dt><dd>Vectorisation qui garde le milieu de chaque trait (squelette).</dd>
<dt>Moonraker</dt><dd>Interface réseau de Klipper utilisée pour envoyer les fichiers à la K1.</dd>
<dt>Parois</dt><dd>Contours successifs de chaque couche ; elles portent l'essentiel des efforts.</dd>
<dt>PEI</dt><dd>Revêtement du plateau, sur lequel le plastique adhère à chaud.</dd>
<dt>Purge / tour de purge</dt><dd>Plastique expulsé à chaque changement de couleur pour nettoyer la buse ; petite tour qui stabilise le débit.</dd>
<dt>SDCP</dt><dd>Protocole réseau des imprimantes Elegoo (WebSocket port 3030).</dd>
<dt>Surplomb</dt><dd>Partie d'une pièce qui « déborde » au-dessus du vide et nécessite un support.</dd>
<dt>SVG</dt><dd>Format de dessin vectoriel (tracés, formes) indépendant de la résolution.</dd>
<dt>Tranchage</dt><dd>Découpage du modèle en couches et calcul des trajets de la buse.</dd>
<dt>VPN</dt><dd>Tunnel chiffré qui relie le téléphone au réseau de la maison.</dd>
</dl>`,
  },
  {
    id: 'about', title: 'À propos et licences', parent: null,
    keywords: ['à propos', 'version', 'licence', 'AGPL', 'CuraEngine', 'three.js', 'Clipper', 'sources', 'GitHub'],
    html: `
<p><b>SVG2Print</b> réunit trois projets : <i>Trait Fin</i> (vectorisation), <i>SVG2Print</i> (relief SVG et tranchage 3D) et <i>PrintMonitor</i> (surveillance Android). Code source : dépôt GitHub <code>decmike91/3d</code>.</p>
<table class="htab">
<tr><th>Composant</th><th>Licence</th></tr>
<tr><td>CuraEngine (paquet <code>cura-wasm</code>)</td><td>AGPL-3.0</td></tr>
<tr><td>three.js (vue 3D)</td><td>MIT</td></tr>
<tr><td>Clipper (géométrie 2D)</td><td>Boost</td></tr>
<tr><td>Capacitor (Android), Electron (Windows)</td><td>MIT</td></tr>
<tr><td>fflate (lecture 3MF), esbuild</td><td>MIT</td></tr>
</table>
<p>Les G-code de début et de fin, ainsi que le changement de filament CANVAS (<code>M6211</code>), reprennent les profils officiels ElegooSlicer / OrcaSlicer. Le guide PDF (<b>SVG2Print-Guide.pdf</b>, dans la page Releases du dépôt) reprend le contenu de cette aide, avec un sommaire paginé.</p>`,
  },
];

// Remplace les renvois @@id@@ par le titre du sujet
const byId = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
for (const t of TOPICS) t.html = t.html.replace(/@@([a-z0-9-]+)@@/g, (_, id) => (byId[id] ? byId[id].title : id));

// Aide contextuelle : identifiant d'étape → sujet
export const CONTEXT = {
  vector: 'vec', print: 'svg', model: 'm3',
  'svg-1': 'svg-file', 'svg-2': 'first-connect', 'svg-3': 'svg-pattern', 'svg-4': 'svg-filament', 'svg-5': 'svg-slice',
  'm3-1': 'm3-open', 'm3-2': 'm3-orient', 'm3-3': 'm3-canvas', 'm3-4': 'm3-quality', 'm3-5': 'm3-slice',
};
