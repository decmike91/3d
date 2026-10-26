// Vérifie la découpe en couches pour toutes les hauteurs de motif autorisées (0,2 à 1 mm)
import { buildLayers, clampRelief } from '../src/core/slicer.js';
import { defaultPrint } from '../src/core/profiles.js';
const sq = [[{ X: 0, Y: 0 }, { X: 20000, Y: 0 }, { X: 20000, Y: 20000 }, { X: 0, Y: 20000 }]];
let fail = 0;
for (const plate of [1, 0]) for (const pol of ['positive', 'negative']) {
  if (plate === 0 && pol === 'negative') continue;
  for (let r = 0.2; r <= 1.0001; r += 0.1) {
    const rel = +r.toFixed(1);
    const p = { ...defaultPrint('cc'), plateThickness: plate, reliefHeight: rel, polarity: pol };
    const { layers } = buildLayers(sq, p);
    const top = layers.at(-1).z;
    const rl = layers.filter((l) => l.kind === 'relief');
    const hs = layers.map((l) => l.height);
    const ok = Math.abs(top - (plate + rel)) < 1e-3 && Math.min(...hs) >= 0.099 && Math.max(...hs) <= 0.2501
      && Math.abs(rl.reduce((a, l) => a + l.height, 0) - rel) < 1e-3 * (plate ? 1 : 0) + (plate ? 0 : 1);
    if (!ok) fail++;
    console.log(`plaque ${plate} ${pol.padEnd(8)} motif ${rel.toFixed(1)} -> sommet ${top.toFixed(2)} mm, couches motif ${rl.length} × [${[...new Set(rl.map((l) => l.height))].join(', ')}] ${ok ? 'OK' : 'ÉCHEC'}`);
  }
}
for (const [v, e] of [[0, 0.2], [0.1, 0.2], [1.6, 1], [-3, 0.2], ['abc', 1], [0.55, 0.55]]) {
  const c = clampRelief(v); if (c !== e) { fail++; console.log('clamp ÉCHEC', v, c); }
}
console.log(fail ? `${fail} ÉCHEC(S)` : 'Toutes les hauteurs OK');
process.exit(fail ? 1 : 0);
