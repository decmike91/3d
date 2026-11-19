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
  pla_std: {
    id: 'pla_std', label: 'PLA standard (eSUN PLA+)', name: 'eSUN PLA+', type: 'PLA',
    density: 1.23, nozzle: 210, nozzleFirst: 215, bed: 60, bedFirst: 60, tempHigh: 225,
    fan: 100, fanFirstLayers: 1, flow: 0.98, maxVolumetric: { cc: 12, k1: 12 }, pressureAdvance: 0.03,
    retractLength: 0.8, retractSpeed: { cc: 30, k1: 40 }, zHop: 0.4,
    speedCap: 50, accelCap: 5000, canvas: true, color: '#e8e4da',
    notes: [],
  },
  petg_std: {
    id: 'petg_std', label: 'PETG standard (eSUN PETG)', name: 'eSUN PETG', type: 'PETG',
    density: 1.27, nozzle: 235, nozzleFirst: 240, bed: 75, bedFirst: 75, tempHigh: 250,
    fan: 40, fanFirstLayers: 2, flow: 0.95, maxVolumetric: { cc: 8, k1: 8 }, pressureAdvance: 0.04,
    retractLength: 0.8, retractSpeed: { cc: 30, k1: 40 }, zHop: 0.4,
    speedCap: 50, accelCap: 5000, canvas: true, color: '#3f8fa8',
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

// Matière + type de filament (haute vitesse ou standard à 50 mm/s)
export const FAMILIES = {
  pla: { label: 'PLA', hs: 'pla_hs', std: 'pla_std' },
  petg: { label: 'PETG', hs: 'petg_hs', std: 'petg_std' },
  tpu: { label: 'TPU 95A (eSUN eTPU-95A)', std: 'tpu' },
  nylon: { label: 'Nylon PA (eSUN ePA)', std: 'nylon' },
};
export const SPEEDS = { hs: 'Haute vitesse (HS)', std: 'Standard (50 mm/s)', custom: 'Personnalisée…' };
export function familyOf(matId) {
  const id = String(matId || '');
  if (id.startsWith('cust:')) return familyOf(CUSTOM.get(id)?.base || 'petg_hs');
  const cm = /^([a-z]+)_custom:/.exec(id);
  if (cm && FAMILIES[cm[1]]) return cm[1];
  return Object.keys(FAMILIES).find((f) => FAMILIES[f].hs === id || FAMILIES[f].std === id) || 'petg';
}
export function speedOf(matId) {
  const id = String(matId || '');
  if (/_custom:/.test(id)) return 'custom';
  const f = FAMILIES[familyOf(id)];
  return f.hs === id ? 'hs' : 'std';
}
export const customSpeedOf = (matId) => { const m = /_custom:(\d+)/.exec(String(matId || '')); return m ? +m[1] : null; };
export function matIdOf(family, speed, customSpeed = 80) {
  const f = FAMILIES[family] || FAMILIES.petg;
  if (speed === 'custom') return `${FAMILIES[family] ? family : 'petg'}_custom:${Math.round(customSpeed) || 80}`;
  return f[speed] || f.std || f.hs;
}
// Filament lu sur le CANVAS : « PLA », « PETG HS », « High Speed PLA »… → matière de l'application
export function matFromTrayType(type, keepSpeed = 'hs') {
  const t = String(type || '');
  const fam = /TPU/i.test(t) ? 'tpu' : /PA|NYLON/i.test(t) ? 'nylon' : /PETG|PET/i.test(t) ? 'petg' : /PLA/i.test(t) ? 'pla' : null;
  if (!fam) return null;
  const speed = /\bHS\b|HIGH.?SPEED|RAPID|FAST/i.test(t) ? 'hs' : keepSpeed;
  return matIdOf(fam, speed);
}

// Réglages filament complets (forme attendue par le trancheur SVG et le trancheur 3D)
export function materialProfile(matId, printerId, retractDefaults) {
  const id = String(matId || '');
  if (id.startsWith('cust:')) return customProfile(id, printerId, retractDefaults);
  const cm = /^([a-z]+)_custom:(\d+(?:\.\d+)?)$/.exec(id);
  if (cm) return speedProfile(cm[1], +cm[2], printerId, retractDefaults);
  return baseProfile(matId, printerId, retractDefaults);
}

function baseProfile(matId, printerId, retractDefaults) {
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
    fanMax: Math.min(100, m.fan + 20),
  };
}

// ---------------- Vitesse personnalisée → débit ----------------
// Section d'une ligne de 0,45 × 0,2 mm (parois internes, remplissage) : le débit nécessaire
// pour une vitesse v est v × section. Au-delà du débit que le filament peut fondre, la vitesse est limitée.
export const LINE_AREA = (0.45 - 0.2) * 0.2 + (Math.PI * 0.2 * 0.2) / 4;
export const flowForSpeed = (v) => Math.round(v * LINE_AREA * 10) / 10;
export const speedForFlow = (q) => Math.floor(q / LINE_AREA);

/**
 * Profil d'un filament (famille pla/petg/tpu/nylon) imprimé à une vitesse choisie :
 * débit nécessaire, température de buse ajustée au débit (plus chaud pour fondre plus vite),
 * vitesse plafonnée si le filament ne peut pas suivre.
 */
export function speedProfile(family, speed, printerId, retractDefaults) {
  const F = FAMILIES[family] || FAMILIES.petg;
  const hsId = F.hs || F.std, stdId = F.std || F.hs;
  const hs = baseProfile(hsId, printerId, retractDefaults);
  const std = baseProfile(stdId, printerId, retractDefaults);
  const v = Math.max(10, Math.min(500, +speed || 50));
  const need = flowForSpeed(v);
  const qMax = hs.maxVolumetric;
  const qLow = Math.min(flowForSpeed(50), qMax);
  const vMax = speedForFlow(qMax);
  const base = need > flowForSpeed(60) && F.hs ? hs : std;
  // Température : celle du filament standard à 50 mm/s, celle du HS à 80 % de son débit max, +5 °C au-delà
  const qHot = Math.max(qLow + 0.1, qMax * 0.8);
  const k = Math.max(0, Math.min(1, (Math.min(need, qMax) - qLow) / (qHot - qLow)));
  let nozzle = Math.round(std.nozzle + (hs.nozzle - std.nozzle) * k);
  if (need > qHot) nozzle = Math.min(nozzle + 5, hs.tempHigh - 5);
  const sp = Math.min(v, vMax);
  return {
    ...base,
    material: `${family}_custom:${v}`,
    name: `${base.name.replace(/\s*\(.*\)$/, '')} · ${sp} mm/s`,
    nozzle, nozzleFirst: nozzle + 5,
    maxVolumetric: Math.min(qMax, Math.max(need * 1.1, qLow)),
    speedCap: sp,
    accelCap: sp <= 60 ? 5000 : base.accelCap,
    flowNeeded: need, flowMax: qMax, speedMax: vMax, limited: v > vMax,
  };
}

// ---------------- Filaments personnalisés (onglet Filaments) ----------------
// { id: 'cust:…', name, color, base: 'pla_hs'…, mode: 'quick' | 'expert', speed, expert: { …profil, speeds: {…} } }
const CUSTOM = new Map();
export function setCustomFilaments(list) {
  CUSTOM.clear();
  for (const c of list || []) if (c && c.id) CUSTOM.set(c.id, c);
}
export const customFilaments = () => [...CUSTOM.values()];
export const getCustomFilament = (id) => CUSTOM.get(id) || null;

// Réglages modifiables en mode expert (à la façon de Cura), avec unités et bornes
export const EXPERT_FIELDS = [
  { group: 'Températures', fields: [
    ['nozzle', 'Buse', '°C', 150, 320], ['nozzleFirst', 'Buse, 1re couche', '°C', 150, 320],
    ['bed', 'Plateau', '°C', 0, 110], ['bedFirst', 'Plateau, 1re couche', '°C', 0, 110],
    ['tempHigh', 'Température max (CANVAS)', '°C', 150, 320]] },
  { group: 'Débit', fields: [
    ['flowPct', 'Débit (multiplicateur)', '%', 50, 150], ['maxVolumetric', 'Débit volumique max', 'mm³/s', 1, 50],
    ['pressureAdvance', 'Avance de pression', 's', 0, 1], ['density', 'Densité', 'g/cm³', 0.5, 3]] },
  { group: 'Vitesses', fields: [
    ['speeds.outerWall', 'Paroi externe', 'mm/s', 5, 600], ['speeds.innerWall', 'Parois internes', 'mm/s', 5, 600],
    ['speeds.infill', 'Remplissage', 'mm/s', 5, 600], ['speeds.topBottom', 'Dessus / dessous', 'mm/s', 5, 600],
    ['speeds.support', 'Supports', 'mm/s', 5, 600], ['speeds.firstLayer', '1re couche', 'mm/s', 5, 300],
    ['speeds.travel', 'Déplacements', 'mm/s', 20, 800], ['accelCap', 'Accélération max', 'mm/s²', 500, 30000]] },
  { group: 'Rétraction', fields: [
    ['retractLength', 'Longueur', 'mm', 0, 10], ['retractSpeed', 'Vitesse', 'mm/s', 5, 100], ['zHop', 'Levée Z', 'mm', 0, 2]] },
  { group: 'Refroidissement', fields: [
    ['fan', 'Ventilateur', '%', 0, 100], ['fanMax', 'Ventilateur max (petites couches)', '%', 0, 100],
    ['fanFirstLayers', 'Couches sans ventilateur', '', 0, 10]] },
];

// Valeurs de départ du mode expert à partir d'un profil (vitesses de la Centauri Carbon par défaut)
export function expertDefaults(baseId, printerSpeeds) {
  const p = materialProfile(baseId, 'cc');
  const sp = printerSpeeds || { outerWall: 200, innerWall: 300, infill: 270, firstLayer: 50, travel: 500 };
  const capV = (v) => Math.min(v, p.speedCap || Infinity, speedForFlow(p.maxVolumetric));
  return {
    nozzle: p.nozzle, nozzleFirst: p.nozzleFirst, bed: p.bed, bedFirst: p.bedFirst, tempHigh: p.tempHigh,
    flowPct: Math.round(p.flow * 100), maxVolumetric: p.maxVolumetric, pressureAdvance: p.pressureAdvance, density: p.density,
    retractLength: p.retractLength, retractSpeed: p.retractSpeed, zHop: p.zHop,
    fan: p.fan, fanMax: p.fanMax, fanFirstLayers: p.fanFirstLayers, accelCap: p.accelCap || 10000,
    speeds: {
      outerWall: capV(sp.outerWall), innerWall: capV(sp.innerWall), infill: capV(sp.infill),
      topBottom: capV(Math.round(sp.outerWall * 0.9)), support: capV(Math.round(sp.infill * 0.7)),
      firstLayer: Math.min(sp.firstLayer, capV(sp.firstLayer)), travel: sp.travel,
    },
  };
}

function customProfile(id, printerId, retractDefaults) {
  const c = CUSTOM.get(id);
  if (!c) return baseProfile('petg_hs', printerId, retractDefaults);
  const fam = familyOf(c.base);
  let p;
  if (c.mode === 'expert' && c.expert) {
    const e = c.expert;
    const b = baseProfile(c.base, printerId, retractDefaults);
    p = {
      ...b,
      nozzle: e.nozzle, nozzleFirst: e.nozzleFirst, bed: e.bed, bedFirst: e.bedFirst, tempHigh: e.tempHigh,
      flow: (e.flowPct ?? 100) / 100, maxVolumetric: e.maxVolumetric, pressureAdvance: e.pressureAdvance, density: e.density,
      retractLength: e.retractLength, retractSpeed: e.retractSpeed, zHop: e.zHop,
      fan: e.fan, fanMax: e.fanMax, fanFirstLayers: e.fanFirstLayers, accelCap: e.accelCap,
      speedCap: null, speeds: { ...e.speeds },
    };
  } else {
    p = speedProfile(fam, c.speed || 50, printerId, retractDefaults);
  }
  return { ...p, material: id, name: c.name || p.name, custom: true };
}

// Informations d'affichage (libellé, remarques, compatibilité CANVAS) pour tout identifiant de filament
export function materialInfo(matId) {
  const id = String(matId || '');
  if (id.startsWith('cust:')) {
    const c = CUSTOM.get(id);
    const b = MATERIALS[c?.base] || MATERIALS.petg_hs;
    return { label: c ? c.name : 'Filament supprimé', type: b.type, notes: b.notes, canvas: b.canvas, custom: true };
  }
  const cm = /^([a-z]+)_custom:(\d+)/.exec(id);
  if (cm) {
    const F = FAMILIES[cm[1]] || FAMILIES.petg;
    const b = MATERIALS[F.hs || F.std];
    return { label: `${F.label} · ${cm[2]} mm/s`, type: b.type, notes: b.notes, canvas: b.canvas };
  }
  const m = MATERIALS[id] || MATERIALS.petg_hs;
  return { label: m.label, type: m.type, notes: m.notes, canvas: m.canvas };
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
