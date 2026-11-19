// Nettoyage d'une adresse d'imprimante saisie au clavier du téléphone :
// caractères invisibles (espace insécable, zéro largeur…), virgules à la place des points,
// chiffres « pleine largeur », « http:// » ou « /chemin » collés par erreur.
export function cleanHost(raw) {
  let s = String(raw ?? '').normalize('NFKC');
  s = s.replace(/^[a-z]+:\/\//i, '').replace(/[/?#].*$/, '');
  s = s.replace(/[,;]/g, '.');
  s = s.replace(/[^0-9A-Za-z.:\-]/g, '');
  s = s.replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
  // Un port collé à une adresse IPv4 (192.168.1.50:3030) n'est pas une adresse : on le retire
  const m = /^((?:\d{1,3}\.){3}\d{1,3}):\d+$/.exec(s);
  if (m) s = m[1];
  return s;
}

export function checkHost(raw) {
  const h = cleanHost(raw);
  if (!h) throw new Error("Saisissez l'adresse IP de l'imprimante.");
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4 ? ipv4.slice(1).some((n) => +n > 255) : !/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/.test(h)) {
    throw new Error(`Adresse IP invalide : « ${h} ». Exemple attendu : 192.168.1.50`);
  }
  return h;
}
