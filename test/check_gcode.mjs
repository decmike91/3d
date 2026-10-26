// Contrôle de cohérence des G-code générés
import fs from 'fs';
import { PRINTERS } from '../src/core/profiles.js';
let fail = 0;
for (const [f, pid] of [['test/out_cc_positive.gcode', 'cc'], ['test/out_k1_negative.gcode', 'k1']]) {
  const g = fs.readFileSync(f, 'utf8');
  const bed = PRINTERS[pid].bed;
  let inBody = false, lastZ = 0, maxX = -1e9, minX = 1e9, maxY = -1e9, minY = 1e9, eSum = 0, n = 0, zDown = 0;
  for (const line of g.split('\n')) {
    if (line.startsWith(';LAYER_CHANGE')) inBody = true;
    if (/NaN|undefined|Infinity/.test(line)) { console.error('valeur invalide :', line); fail++; }
    if (inBody && (line.startsWith(';===== CC_END') || line.startsWith('END_PRINT'))) break;
    if (!inBody || !line.startsWith('G1')) continue;
    const x = /X(-?[\d.]+)/.exec(line), y = /Y(-?[\d.]+)/.exec(line), z = /Z(-?[\d.]+)/.exec(line), e = /E(-?[\d.]+)/.exec(line);
    if (x) { maxX = Math.max(maxX, +x[1]); minX = Math.min(minX, +x[1]); }
    if (y) { maxY = Math.max(maxY, +y[1]); minY = Math.min(minY, +y[1]); }
    if (e) eSum += +e[1];
    if (z && /^;?LAYER/.test(line) === false && !line.includes(' E')) { const zz = +z[1]; if (zz < lastZ - 0.5) zDown++; lastZ = Math.max(lastZ, zz); }
    n++;
  }
  const ok = minX >= 0 && minY >= 0 && maxX <= bed.x && maxY <= bed.y && eSum > 0;
  console.log(`${f}: ${n} mouvements, X ${minX}..${maxX}, Y ${minY}..${maxY}, E total ${eSum.toFixed(1)} mm`, ok ? 'OK' : 'ÉCHEC');
  if (!ok) fail++;
  if (!g.includes(pid === 'cc' ? 'M6211' : 'START_PRINT EXTRUDER_TEMP')) { console.error('start gcode manquant'); fail++; }
}
process.exit(fail ? 1 : 0);
