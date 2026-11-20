// Reprise en JS de l'analyse d'en-tête du micrologiciel Centauri Carbon
// (firmware/core/klippy/gcode_preview.c, dépôt elegooofficial/CentauriCarbon) :
// sert à vérifier que l'imprimante retrouvera la durée estimée et le nombre de couches.
function getKeyValue(line, key, delim) {
  const toks = line.split(delim).filter((t) => t.length); // strtok_r ignore les séparateurs vides
  let found = false;
  for (const t of toks) {
    if (found) { const v = t.replace(/^ +/, ''); return v.length ? v.slice(0, -1) : null; } // retire le dernier caractère (\n)
    if (t.includes(key)) found = true;
  }
  return null;
}
function firmwarePreview(gcode) {
  const lines = gcode.split('\n').map((l) => l + '\n');
  let slicer = 'others';
  outer: for (const l of lines.slice(0, 30)) { // ligne par ligne, comme find_gcode_slicer()
    for (const [k, v] of [['PrusaSlicer', 'prusa'], ['AnycubicSlicer', 'anycubic'], ['Cura_SteamEngine', 'cura'], ['OrcaSlicer', 'orca'], ['ElegooSlicer', 'elegoo']]) {
      if (l.includes(k)) { slicer = v; break outer; }
    }
  }
  const r = { slicer, totalLayers: 0, estimatedTime: 0 };
  if (slicer === 'others' || slicer === 'cura') return r; // (Cura : non utilisé ici)
  const handle = (line) => {
    let v;
    if (line.length < 5) return;
    if ((v = getKeyValue(line, 'estimated printing time (normal mode)', '=')) != null) {
      const m = /^(?:(\d{1,2})d)?(?:(\d{1,2})h)?(?:(\d{1,2})m)?(?:(\d{1,2})s)?/.exec(v.replace(/ /g, ''));
      r.estimatedTime = (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
    } else if ((v = getKeyValue(line, 'total layers count', '=')) != null || (v = getKeyValue(line, 'total_layers', '=')) != null) {
      r.totalLayers = parseInt(v, 10) || 0;
    }
  };
  for (const l of lines) { if ('MGmg'.includes(l[0])) break; handle(l); }   // lecture avant jusqu'au 1er G/M
  for (let i = lines.length - 1; i >= 0; i--) { const l = lines[i]; if ('MGmg'.includes(l[0]) && l.length >= 5) break; handle(l); } // puis depuis la fin
  return r;
}
module.exports = { firmwarePreview };
