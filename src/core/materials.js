// Filaments proposés (1,75 mm) avec réglages optimisés par imprimante.
// Sources : fiches eSUN (ePLA-HS 210–230 °C / plateau 55–70 °C ; PETG+HS 230–260 °C ;
// eTPU-95A 210–240 °C ; ePA 230–260 °C / plateau 80–90 °C) et profils machine ElegooSlicer/OrcaSlicer.
//
// canvas : true = accepté par le CANVAS Elegoo ; 'warn' = possible mais déconseillé ; false = refusé.

export const MATERIALS = {
  pla_hs: {
    id: 'pla_hs', label: 'PLA HS (eSUN ePLA-HS)', name: 'eSUN ePLA-HS', type: 'PLA',
    density: 1.24, nozzle: 220, nozzleFirst: 225, bed: 60, bedFirst: 60, tempHigh: 230,
    fan: 100, fanFirstLayers: 1, flow: 0.98, maxVolumetric: { cc: 21, k1: 20 }, pressureAdvance: 0.03,
    retractLength: 0.8, retractSpeed: { cc: 30, k1: 40 }, zHop: 0.4,
    speedCap: null, accelCap: null, canvas: true, color: '#e8e4da',
    notes: [],
  },
  petg_hs: {
    id: 'petg_hs', label: 'PETG HS (eSUN PETG+HS)', name: 'eSUN PETG+HS', type: 'PETG',
    density: 1.27, nozzle: 240, nozzleFirst: 245, bed: 75, bedFirst: 75, tempHigh: 260,
    fan: 40, fanFirstLayers: 2, flow: 0.95, maxVolumetric: { cc: 16, k1: 15 }, pressureAdvance: 0.04,
    retractLength: 0.8, retractSpeed: { cc: 30, k1: 40 }, zHop: 0.4,
    speedCap: null, accelCap: null, canvas: true, color: '#3f8fa8',
    notes: [],
  },
  tpu: {
    id: 'tpu', label: 'TPU 95A (eSUN eTPU-95A)', name: 'eSUN eTPU-95A', type: 'TPU',
    density: 1.21, nozzle: 225, nozzleFirst: 230, bed: 45, bedFirst: 45, tempHigh: 240,
    fan: 60, fanFirstLayers: 1, flow: 1.0, maxVolumetric: { cc: 3.6, k1: 3.6 }, pressureAdvance: 0,
    retractLength: 0.4, retractSpeed: { cc: 20, k1: 20 }, zHop: 0,
    speedCap: 30, accelCap: 2000, canvas: false, color: '#2b2b2b',
    notes: ['TPU : impression lente (30 mm/s max), bobine montée en direct, pas via le CANVAS.'],
  },
  nylon: {
    id: 'nylon', label: 'Nylon PA (eSUN ePA)', name: 'eSUN ePA', type: 'PA',
    density: 1.12, nozzle: 255, nozzleFirst: 260, bed: 85, bedFirst: 90, tempHigh: 270,
    fan: 10, fanFirstLayers: 3, flow: 0.97, maxVolumetric: { cc: 8, k1: 8 }, pressureAdvance: 0.04,
    retractLength: 0.8, retractSpeed: { cc: 30, k1: 30 }, zHop: 0.4,
    speedCap: 120, accelCap: 5000, canvas: 'warn', color: '#efe9d6', brim: 5,
    notes: [
      'Nylon : séchez la bobine (70 °C, 8 h) juste avant, imprimez capot fermé et mettez un film de colle sur le plateau PEI.',
    ],
  },
};
export const MATERIAL_IDS = Object.keys(MATERIALS);

// Réglages filament complets (forme attendue par le trancheur SVG et le trancheur 3D)
export function materialProfile(matId, printerId, retractDefaults) {
  const m = MATERIALS[matId] || MATERIALS.petg_hs;
  const pick = (v) => (v && typeof v === 'object' ? v[printerId] ?? v.cc : v);
  return {
    material: m.id,
    type: m.type,
    name: m.name,
    diameter: 1.75,
    density: m.density,
    nozzle: m.nozzle,
    nozzleFirst: m.nozzleFirst,
    bed: m.bed,
    bedFirst: m.bedFirst,
    tempHigh: m.tempHigh,
    fan: m.fan,
    fanFirstLayers: m.fanFirstLayers,
    flow: m.flow,
    maxVolumetric: pick(m.maxVolumetric),
    pressureAdvance: m.pressureAdvance,
    retractLength: m.retractLength ?? retractDefaults?.length,
    retractSpeed: pick(m.retractSpeed) ?? retractDefaults?.speed,
    zHop: m.zHop ?? retractDefaults?.zhop,
    speedCap: m.speedCap,
    accelCap: m.accelCap,
  };
}

// Débit de filament en mm/min correspondant au débit volumique max (paramètres M/N de M6211)
export const filamentFeed = (maxVol) => Math.max(100, Math.round((60 * maxVol) / (Math.PI * 0.875 * 0.875)));

// Volume de purge (mm³) entre deux couleurs : plus de purge pour passer du foncé au clair.
export function flushVolume(fromHex, toHex, multiplier = 1) {
  const rgb = (h) => {
    const m = /^#?([0-9a-f]{6})/i.exec(h || '');
    const n = m ? parseInt(m[1], 16) : 0x808080;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const a = rgb(fromHex), b = rgb(toHex);
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.7;
  const darkToLight = Math.max(0, lum(b) - lum(a));
  const v = 140 + 300 * dist + 320 * darkToLight;
  return Math.round(Math.min(900, v * multiplier));
}
export const flushLength = (volume) => +(volume / (Math.PI * 0.875 * 0.875)).toFixed(3);

// Bloc de changement de filament CANVAS (repris de change_filament_gcode d'ElegooSlicer pour la Centauri Carbon)
export function canvasChangeBlock({ next, flushVol, oldFil, newFil, z, maxZ = 256 }) {
  const zUp = Math.min(z + 3, maxZ + 0.5);
  return [
    ';==========CC_CHANGE_FILAMENT_GCODE_CCB==========',
    'M106 S0',
    'M106 P2 S0',
    `G1 Z${zUp.toFixed(2)} F1200`,
    `M6211 T${next} L${flushLength(flushVol)} M${filamentFeed(oldFil.maxVolumetric)} N${filamentFeed(newFil.maxVolumetric)} Q${oldFil.nozzle} R${newFil.tempHigh} S${newFil.nozzle}`,
    `T${next}`,
    `M109 S${newFil.nozzle}`,
    ';==========CC_CHANGE_FILAMENT_GCODE_CCE==========',
  ].join('\n');
}
