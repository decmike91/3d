// Nettoyage des adresses saisies au clavier (caractères invisibles, virgules…)
import { cleanHost, checkHost } from '../src/net/host.js';
let ok = true;
const eq = (a, b, m) => { const r = a === b; console.log(`${r ? 'OK ' : 'ÉCHEC'} ${m} → « ${a} »`); if (!r) ok = false; };
eq(cleanHost('192.168.1.23​'), '192.168.1.23', 'caractère zéro largeur');
eq(cleanHost(' 192.168.1.23 '), '192.168.1.23', 'espace insécable et espace');
eq(cleanHost('192,168,1,23'), '192.168.1.23', 'virgules du pavé numérique');
eq(cleanHost('１９２.１６８.１.２３'), '192.168.1.23', 'chiffres pleine largeur');
eq(cleanHost('http://192.168.1.23:3030/'), '192.168.1.23', 'URL complète collée');
eq(cleanHost('192.168.1.23.'), '192.168.1.23', 'point final');
eq(cleanHost('k1.local'), 'k1.local', 'nom d’hôte');
let err = '';
try { checkHost('192.168.1.300'); } catch (e) { err = e.message; }
eq(/invalide/.test(err) ? 'invalide' : err, 'invalide', 'adresse hors plage refusée clairement');
console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
process.exit(ok ? 0 : 1);
