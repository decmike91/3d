// Profils imprimantes + réglages filament eSUN PETG+HS optimisés par défaut.
// Sources : profils machine OrcaSlicer (Elegoo Centauri Carbon 0.4, Creality K1 0.4),
// fiche eSUN PETG+HS (buse 230–260 °C, plateau 70–90 °C, ventilateur, 40–300 mm/s).

export const PRINTERS = {
  cc: {
    id: 'cc',
    name: 'Elegoo Centauri Carbon',
    bed: { x: 256, y: 256, z: 256 },
    protocol: 'sdcp', // WebSocket :3030 + upload HTTP :80
    defaultPorts: { ws: 3030, upload: 80 },
    thumbnails: [[144, 144]],
    layerStats: true,
    retract: { length: 0.8, speed: 30, zhop: 0.4 },
    startGcode: (s) => `;===== CC_START_GCODE (adapté du profil OrcaSlicer) =====
;printer_model:Elegoo Centauri Carbon
;initial_filament:PETG
;bed_level_temp:${s.bedFirst}
M400 ; vide le tampon
M220 S100 ; vitesse 100 %
M221 S100 ; débit 100 %
M104 S140
M140 S${s.bedFirst}
G90
M83
G28 ; origine
M729 ; nettoyage buse
M190 S${s.bedFirst}
M109 S${s.nozzleFirst}
M6211 A1 L200 T0 Q${s.nozzleFirst} R${s.nozzleFirst} S${s.nozzleFirst}
T0
${s.pressureAdvance > 0 ? `SET_PRESSURE_ADVANCE ADVANCE=${s.pressureAdvance}\nM400` : '; avance de pression : réglage imprimante'}
M204 S${Math.min(20000, Math.max(1000, s.accelFirst))}
G1 X128 Y-1.2 F20000
G1 Z0.3 F900
G90
M83
G92 E0
G1 F${s.purgeF}
G1 X0 E10.156 ; ligne de purge
G1 Y98.8 E7.934
G1 X0.9 Y100 E0.1
G1 Y-0.3 E7.934
G1 X78 E6.284
G1 X98 E2
G1 X118 E2
G1 X138 E2
G1 X158 E2
G1 X178 E2
G3 I-1 J0 Z0.6 F1200.0
G1 F20000
G92 E0
SET_PRINT_STATS_INFO TOTAL_LAYER=${s.totalLayers} CURRENT_LAYER=0
;LAYER_COUNT:${s.totalLayers}`,
    endGcode: (s) => `;===== CC_END_GCODE =====
M400
M140 S0
M106 S255
M83
G92 E0
G1 E-0.8 F1800
G2 I1 J0 Z${(s.maxZ + 0.5).toFixed(2)} F3000
G90
G1 Z100 F20000
M204 S5000
M749
M400
M83
G1 X202 F20000
M400
G1 Y250 F20000
G1 Y264.5 F1200
M400
G92 E0
M104 S0
M140 S0
M106 S0
M106 P2 S0
M106 P3 S0
M84`,
    speeds: { firstLayer: 50, outerWall: 150, innerWall: 200, infill: 220, travel: 500, accel: 6000, accelFirst: 1000, accelTravel: 10000 },
  },
  k1: {
    id: 'k1',
    name: 'Creality K1 / K1C',
    bed: { x: 220, y: 220, z: 250 },
    protocol: 'moonraker', // API Moonraker (7125 ; 4408/4409 si mod)
    defaultPorts: { http: 7125 },
    thumbnails: [[96, 96], [300, 300]],
    layerStats: false,
    retract: { length: 0.8, speed: 40, zhop: 0.4 },
    startGcode: (s) => `;===== K1_START_GCODE (profil OrcaSlicer) =====
START_PRINT EXTRUDER_TEMP=${s.nozzleFirst} BED_TEMP=${s.bedFirst}
T0
M204 S2000
M109 S${s.nozzleFirst}
${s.pressureAdvance > 0 ? `SET_PRESSURE_ADVANCE ADVANCE=${s.pressureAdvance}` : '; avance de pression : réglage imprimante'}
G1 Z3 F600
M83
G92 E0
G1 Z1 F600
;LAYER_COUNT:${s.totalLayers}`,
    endGcode: () => `END_PRINT`,
    speeds: { firstLayer: 40, outerWall: 120, innerWall: 180, infill: 200, travel: 400, accel: 5000, accelFirst: 1000, accelTravel: 8000 },
  },
};

// Réglages filament par défaut (eSUN PETG+HS 1,75 mm) — ajustés par imprimante
export function defaultFilament(printerId) {
  const base = {
    name: 'eSUN PETG+HS',
    diameter: 1.75,
    density: 1.27,
    nozzle: 240,
    nozzleFirst: 245,
    bed: 75,
    bedFirst: 75,
    fan: 40, // % après les premières couches (PETG : ventilation modérée = bonne adhérence entre couches)
    fanFirstLayers: 2, // couches sans ventilation
    flow: 0.95,
    maxVolumetric: 16, // mm³/s
    pressureAdvance: 0.04,
    retractLength: PRINTERS[printerId].retract.length,
    retractSpeed: PRINTERS[printerId].retract.speed,
    zHop: PRINTERS[printerId].retract.zhop,
  };
  if (printerId === 'k1') {
    // K1 : enceinte plus fermée, hotend céramique -> un peu moins chaud, débit max un peu plus bas
    return { ...base, nozzle: 240, nozzleFirst: 245, maxVolumetric: 15, pressureAdvance: 0.04 };
  }
  // Centauri Carbon
  return { ...base, nozzle: 240, nozzleFirst: 245, maxVolumetric: 16, pressureAdvance: 0.04 };
}

export function defaultPrint(printerId) {
  const sp = PRINTERS[printerId].speeds;
  return {
    layerHeight: 0.2,
    firstLayerHeight: 0.2,
    lineWidth: 0.45,
    walls: 2,
    infillOverlap: 15, // %
    infillAngle: 0,
    plateThickness: 1.0, // mm (0 = motif seul / pochoir en négatif)
    reliefHeight: 1.0, // mm : hauteur du motif
    plateMargin: 5,
    plateRadius: 3,
    plateShape: 'rect', // rect | contour | ellipse
    polarity: 'positive', // positive | negative
    ...sp,
  };
}
