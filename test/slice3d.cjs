// Test du tranchage 3D de bout en bout (Node) : modèle → orientation → CuraEngine → post-traitement.
// Lancement : npm run build && node test/slice3d.cjs
const fs = require('fs');
const path = require('path');
// CuraEngine WASM (version CommonJS) avec la même correction multi-maillages que build.mjs
function patchedCura() {
  const src = fs.readFileSync(require.resolve('cura-wasm/dist/cjs.js'), 'utf8');
  const old = "engine.FS.writeFile(\\'Model.stl\\', stl);";
  const build = fs.readFileSync(path.join(__dirname, '..', 'build.mjs'), 'utf8');
  const neu = eval(build.slice(build.indexOf("const neu = ") + 12, build.indexOf(";\n", build.indexOf("const neu = "))));
  if (!src.includes(old)) throw new Error('point de correction introuvable');
  const out = path.join(__dirname, 'out_cura_patched.cjs');
  fs.writeFileSync(out, src.replace(old, neu));
  return require(out).CuraWASM;
}

function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const out = [];
  for (const t of f) for (const i of t) out.push(...v[i]);
  return out;
}

(async () => {
  const { parseModel, toBinarySTL } = await import('../src/model3d/mesh.js');
  const { autoOrient, m3mul, arrange } = await import('../src/model3d/orient.js');
  const { makeObject, prepareSlice, objectSize } = await import('../src/model3d/job.js');
  const { postProcess, parsePreview } = await import('../src/model3d/post.js');
  const { defaultJob } = await import('../src/model3d/settings.js');
  const { makeSliceCura } = await import('../src/model3d/engine-core.js');
  const sliceCura = makeSliceCura(patchedCura());
  const { materialProfile } = await import('../src/core/materials.js');
  const { PRINTERS } = await import('../src/core/profiles.js');
  let ok = true;
  const check = (cond, msg) => { console.log(`${cond ? 'OK ' : 'ÉCHEC'} ${msg}`); if (!cond) ok = false; };

  // Barre longue de 80 × 10 × 10 mm posée DEBOUT (mauvaise orientation pour la solidité)
  // + « T » avec surplomb pour les supports.
  const bar = new Float32Array(box(0, 0, 0, 10, 10, 80));
  const tee = new Float32Array([...box(-4, -4, 0, 4, 4, 15), ...box(-15, -15, 15, 15, 15, 19)]);
  const m1 = parseModel(toBinarySTL(bar), 'barre.stl').objects[0];
  const m2 = parseModel(toBinarySTL(tee), 'te.stl').objects[0];
  const o1 = makeObject(m1), o2 = makeObject(m2);
  check(Math.abs(objectSize(o1).h - 80) < 0.01, 'barre chargée debout (80 mm de haut)');

  // Orientation « solidité » : la barre doit être couchée
  const r1 = autoOrient(o1.parts.map((p) => p.positions), { mode: 'strength', bedZ: 256 });
  o1.rot = m3mul(r1.matrix, o1.rot);
  const s1 = objectSize(o1);
  check(s1.h < 11 && Math.max(s1.w, s1.d) > 79, `barre couchée par l'orientation solidité (h=${s1.h.toFixed(1)} mm)`);
  // Orientation « supports » sur le T : il doit être retourné (plateau en bas)
  const r2 = autoOrient(o2.parts.map((p) => p.positions), { mode: 'supports', bedZ: 256 });
  o2.rot = m3mul(r2.matrix, o2.rot);
  check(r2.info.overhangPct < 5, `T retourné : surplombs ${r2.info.overhangPct} %`);
  // Remettre le T debout (avec surplomb) pour tester les supports
  o2.rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const objs = [o1, o2];
  for (const printerId of ['cc', 'k1']) {
    const P = PRINTERS[printerId];
    const placed = arrange(objs.map(objectSize), P.bed, 8, printerId === 'cc' ? { w: 25 } : null);
    check(placed.fits, `${printerId} : placement automatique sur le plateau`);
    objs.forEach((o, i) => { o.x = placed.positions[i].x; o.y = placed.positions[i].y; });

    const canvas = printerId === 'cc';
    o2.parts[0].tool = canvas ? 2 : 0; // le T dans l'emplacement 3 du CANVAS
    const slots = [
      { fil: materialProfile('pla_hs', printerId), color: '#FFFFFF' },
      { fil: materialProfile('pla_hs', printerId), color: '#000000' },
      { fil: materialProfile('petg_hs', printerId), color: '#D02020' },
      { fil: materialProfile('pla_hs', printerId), color: '#2050D0' },
    ];
    const job = { ...defaultJob(printerId), support: 'tree' };
    const prep = prepareSlice(objs, job, slots, canvas);
    check(prep.tools.length === (canvas ? 2 : 1), `${printerId} : ${prep.tools.length} filament(s) utilisé(s)`);
    const t0 = Date.now();
    const res = await sliceCura({ definition: prep.definition, command: prep.command, files: prep.files });
    const post = postProcess(res.gcode, { printerId, tools: prep.tools, metadata: res.metadata, flushMultiplier: 1 });
    const g = post.gcode;
    fs.writeFileSync(path.join(__dirname, `out_3d_${printerId}.gcode`), g);
    console.log(`   tranché en ${Date.now() - t0} ms · ${post.stats.layers} couches · ${(post.stats.timeSec / 60).toFixed(0)} min · ${post.stats.grams.toFixed(1)} g`);
    check(!/^M10[49] T\d/m.test(g), `${printerId} : aucune préchauffe « M104 Tn »`);
    check(!g.includes('@@'), `${printerId} : marqueurs remplacés`);
    check(/;TYPE:SUPPORT/.test(g), `${printerId} : supports générés`);
    check(post.stats.bounds.maxX <= P.bed.x && post.stats.bounds.minX >= 0 && post.stats.bounds.maxY <= P.bed.y && post.stats.bounds.minY >= -2, `${printerId} : extrusions dans le plateau (X ${post.stats.bounds.minX.toFixed(0)}–${post.stats.bounds.maxX.toFixed(0)}, Y ${post.stats.bounds.minY.toFixed(0)}–${post.stats.bounds.maxY.toFixed(0)})`);
    if (canvas) {
      const changes = (g.match(/^M6211 T\d/gm) || []);
      check(changes.length >= 2 && changes.every((c) => /T[02]$/.test(c.split(' ')[1]) || /^M6211 T[02]/.test(c)), `cc : ${changes.length} changements CANVAS vers les emplacements 1 et 3`);
      check(/^T2$/m.test(g) && !/^T1$/m.test(g), 'cc : outils T0/T2 (numéros d’emplacement réels)');
      check(/SET_PRINT_STATS_INFO TOTAL_LAYER=\d+ CURRENT_LAYER=1/.test(g), 'cc : progression par couche');
      check(/;TYPE:PRIME-TOWER/.test(g), 'cc : tour de purge');
      check(/; filament_colour = #FFFFFF;#D02020/.test(g), 'cc : couleurs dans l’en-tête');
    } else {
      check(!/^T\d/m.test(g.slice(g.indexOf(';LAYER:0'))), 'k1 : aucune commande d’outil pendant l’impression');
      check(/^START_PRINT EXTRUDER_TEMP=225 BED_TEMP=60/m.test(g), 'k1 : START_PRINT avec les températures du PLA');
    }
    const pv = parsePreview(g);
    check(pv.layers.length > 50 && pv.pos.length > 1000, `${printerId} : aperçu ${pv.layers.length} couches, ${pv.kind.length} segments`);
  }
  console.log(ok ? 'RÉSULTAT : OK' : 'RÉSULTAT : ÉCHEC');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
