// Génération du G-code (Klipper, extrusion relative) pour K1 et Centauri Carbon.
import { PRINTERS } from './profiles.js';
import { buildLayers, layerToolpaths } from './slicer.js';
import { canvasChangeBlock } from './materials.js';

const f3 = (v) => (Math.round(v * 1000) / 1000).toString();
const f5 = (v) => (Math.round(v * 100000) / 100000).toString();

export function fmtTime(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h ? h + 'h ' : ''}${m}m ${s}s`;
}

/**
 * pattern : Clipper Paths déjà positionnés sur le plateau (µm)
 * printerId : 'cc' | 'k1'
 * print, fil : réglages (voir profiles.js)
 * opts : { thumbnails: [{w,h,base64}], name, onProgress(fraction) }
 */
export function slice(pattern, printerId, print, fil0, opts = {}) {
  const P = PRINTERS[printerId];
  const { layers } = buildLayers(pattern, print);
  // CANVAS (Centauri Carbon) : plaque et motif dans deux filaments différents
  const cv = opts.canvas && printerId === 'cc' && opts.canvas.reliefFil ? opts.canvas : null;
  const firstKind = layers.length ? layers[0].kind : 'plate';
  const startsWithRelief = firstKind === 'relief';
  const toolPlate = cv ? cv.plateTool : 0, toolRelief = cv ? cv.reliefTool : 0;
  const multi = !!cv && toolPlate !== toolRelief && !startsWithRelief && layers.some((l) => l.kind === 'relief');
  let fil = cv && startsWithRelief ? cv.reliefFil : fil0;
  const usedE = {};
  const filArea = Math.PI * (fil.diameter / 2) ** 2;
  const body = [];
  const preview = [];
  let e = 0, totalE = 0, time = 0;
  let pos = [0, 0], z = 0;
  let lostIslands = 0;
  const travelF = print.travel * 60;

  let curTool = cv ? (startsWithRelief ? toolRelief : toolPlate) : 0;
  const emit = (s) => body.push(s);
  const travel = (x, y, retract) => {
    const d = Math.hypot(x - pos[0], y - pos[1]);
    if (d < 0.001) return;
    if (retract) {
      emit(`G1 E-${f3(fil.retractLength)} F${fil.retractSpeed * 60}`);
      if (fil.zHop > 0) emit(`G1 Z${f3(z + fil.zHop)} F3000`);
    }
    emit(`G1 X${f3(x)} Y${f3(y)} F${travelF}`);
    if (retract) {
      if (fil.zHop > 0) emit(`G1 Z${f3(z)} F3000`);
      emit(`G1 E${f3(fil.retractLength)} F${fil.retractSpeed * 60}`);
      time += (2 * fil.retractLength) / fil.retractSpeed + (fil.zHop > 0 ? (2 * fil.zHop) / 15 : 0);
    }
    time += d / print.travel + 0.02;
    pos = [x, y];
  };
  const extrudeTo = (x, y, h, speed) => {
    const d = Math.hypot(x - pos[0], y - pos[1]);
    if (d < 0.0005) return;
    const area = (print.lineWidth - h) * h + (Math.PI * h * h) / 4;
    const de = (d * area * fil.flow) / filArea;
    emit(`G1 X${f3(x)} Y${f3(y)} E${f5(de)}`);
    totalE += de;
    usedE[curTool] = (usedE[curTool] || 0) + de;
    time += d / speed;
    pos = [x, y];
  };

  const speedFor = (type, layer) => {
    const area = (print.lineWidth - layer.height) * layer.height + (Math.PI * layer.height ** 2) / 4;
    const cap = Math.min(fil.maxVolumetric / area, fil.speedCap || Infinity);
    let v = layer.index === 0 ? print.firstLayer : type === 'outer' ? print.outerWall : type === 'inner' ? print.innerWall : print.infill;
    return Math.max(5, Math.min(v, cap));
  };
  const TYPE = { outer: 'Outer wall', inner: 'Inner wall', infill: 'Solid infill' };

  let fanOn = null;
  for (const layer of layers) {
    if (multi && layer.kind === 'relief' && curTool !== toolRelief) {
      // Changement de filament CANVAS au début du motif
      emit(canvasChangeBlock({ next: toolRelief, flushVol: cv.flushVol, oldFil: fil, newFil: cv.reliefFil, z, maxZ: P.bed.z }));
      time += 70 + cv.flushVol / 8;
      fil = cv.reliefFil; curTool = toolRelief; fanOn = null;
      pos = [NaN, NaN];
    }
    z = layer.z;
    emit(`;LAYER_CHANGE`);
    emit(`;Z:${f3(z)}`);
    emit(`;HEIGHT:${f3(layer.height)}`);
    if (P.layerStats) emit(`SET_PRINT_STATS_INFO TOTAL_LAYER=${layers.length} CURRENT_LAYER=${layer.index + 1}`);
    emit(`;LAYER:${layer.index}`);
    emit(`G92 E0`);
    emit(`M73 P${Math.floor((layer.index / layers.length) * 100)}`);
    // Température / ventilateur après la 1re couche
    if (layer.index === 1) {
      if (fil.nozzle !== fil.nozzleFirst) emit(`M104 S${fil.nozzle}`);
      if (fil.bed !== fil.bedFirst) emit(`M140 S${fil.bed}`);
    }
    const fanWanted = layer.index >= fil.fanFirstLayers ? Math.round((fil.fan / 100) * 255) : 0;
    if (fanWanted !== fanOn) { emit(`M106 S${fanWanted}`); fanOn = fanWanted; }
    emit(`M204 S${Math.min(layer.index === 0 ? print.accelFirst : print.accel, fil.accelCap || Infinity)}`);
    emit(`G1 Z${f3(z)} F1200`);
    time += 0.3;

    const { moves, end, lost } = layerToolpaths(layer, print, pos);
    lostIslands += lost;
    const prevLayer = [];
    let lastType = null;
    for (const m of moves) {
      const v = speedFor(m.type, layer);
      if (m.type !== lastType) { emit(`;TYPE:${TYPE[m.type]}`); lastType = m.type; }
      const [sx, sy] = m.pts[0];
      if (m.link) {
        emit(`G1 F${Math.round(v * 60)}`);
        extrudeTo(sx, sy, layer.height, v);
      } else {
        const dist = Math.hypot(sx - pos[0], sy - pos[1]);
        travel(sx, sy, dist > 1.5);
        emit(`G1 F${Math.round(v * 60)}`);
      }
      for (let i = 1; i < m.pts.length; i++) extrudeTo(m.pts[i][0], m.pts[i][1], layer.height, v);
      prevLayer.push({ t: m.type, pts: m.pts });
    }
    preview.push({ z, kind: layer.kind, moves: prevLayer });
    if (opts.onProgress) opts.onProgress((layer.index + 1) / layers.length);
  }

  const maxZ = layers.length ? layers[layers.length - 1].z : 0;
  const lenMM = totalE;
  const filOf = (t) => (cv && t === toolRelief && multi ? cv.reliefFil : cv && startsWithRelief ? cv.reliefFil : fil0);
  const grams = Object.entries(usedE).reduce((g, [t, e]) => g + (e * filArea * filOf(+t).density) / 1000, 0);
  time = time * 1.08 + 120; // accélérations + chauffe approximative
  const fs = cv && startsWithRelief ? cv.reliefFil : fil0; // filament de la 1re couche
  const s = {
    tool: cv ? (startsWithRelief ? toolRelief : toolPlate) : 0, type: fs.type,
    nozzleFirst: fs.nozzleFirst, bedFirst: fs.bedFirst, totalLayers: layers.length,
    pressureAdvance: fs.pressureAdvance, accelFirst: Math.min(print.accelFirst, fs.accelCap || Infinity), maxZ,
    purgeF: Math.round(Math.min(6000, Math.max(900, (fs.maxVolumetric / 0.5 / 0.3) * 60))),
  };

  const head = [];
  head.push('; HEADER_BLOCK_START');
  head.push('; generated by SVG2Print 1.0');
  head.push(`; model printing time: ${fmtTime(time)}; total estimated time: ${fmtTime(time)}`);
  head.push(`; total layer number: ${layers.length}`);
  head.push(`; total filament length [mm] : ${lenMM.toFixed(2)}`);
  head.push(`; total filament weight [g] : ${grams.toFixed(2)}`);
  head.push(`; max_z_height: ${maxZ.toFixed(2)}`);
  head.push('; HEADER_BLOCK_END');
  head.push('');
  if (opts.thumbnails && opts.thumbnails.length) {
    head.push('; THUMBNAIL_BLOCK_START');
    for (const t of opts.thumbnails) {
      head.push(';');
      head.push(`; thumbnail begin ${t.w}x${t.h} ${t.base64.length}`);
      for (let i = 0; i < t.base64.length; i += 78) head.push('; ' + t.base64.slice(i, i + 78));
      head.push('; thumbnail end');
    }
    head.push('; THUMBNAIL_BLOCK_END');
    head.push('');
  }
  head.push(`;TIME:${Math.round(time)}`);
  head.push(`;Filament used: ${(lenMM / 1000).toFixed(4)}m`);
  head.push(`;Layer height: ${print.layerHeight}`);
  head.push(`;MINX:0\n;MAXZ:${maxZ.toFixed(2)}`);
  head.push('M73 P0');
  head.push('; EXECUTABLE_BLOCK_START');
  head.push(P.startGcode(s));
  head.push('M83');
  head.push('G90');

  const tail = [];
  tail.push(`M106 S0`);
  tail.push(P.endGcode(s));
  tail.push('M73 P100');
  tail.push('; EXECUTABLE_BLOCK_END');
  tail.push('');
  tail.push(`; filament used [mm] = ${lenMM.toFixed(2)}`);
  tail.push(`; filament used [g] = ${grams.toFixed(2)}`);
  tail.push(`; estimated printing time (normal mode) = ${fmtTime(time)}`);
  tail.push('; CONFIG_BLOCK_START');
  tail.push(`; printer_model = ${P.name}`);
  const fils = multi ? [[toolPlate, fil0], [toolRelief, cv.reliefFil]] : [[cv ? curTool : 0, fs]];
  tail.push(`; filament_type = ${fils.map(([, f]) => f.type || 'PETG').join(';')}`);
  tail.push(`; filament_settings_id = ${fils.map(([, f]) => `"${f.name}"`).join(';')}`);
  if (cv) tail.push(`; filament_colour = ${fils.map(([t]) => cv.colors?.[t] || '#FFFFFF').join(';')}`);
  if (cv) tail.push(`; filament_ids = ${fils.map(([t]) => t).join(';')}`);
  tail.push(`; layer_height = ${print.layerHeight}`);
  tail.push(`; nozzle_diameter = 0.4`);
  tail.push(`; nozzle_temperature = ${fils.map(([, f]) => f.nozzle).join(',')}`);
  tail.push(`; bed_temperature = ${fs.bed}`);
  tail.push(`; sparse_infill_density = 100%`);
  tail.push(`; wall_loops = ${print.walls}`);
  tail.push('; CONFIG_BLOCK_END');

  const gcode = head.join('\n') + '\n' + body.join('\n') + '\n' + tail.join('\n') + '\n';
  return {
    gcode,
    preview,
    stats: { layers: layers.length, timeSec: time, filamentMM: lenMM, grams, maxZ, lostIslands, tools: fils.map(([t]) => t) },
  };
}
