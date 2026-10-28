// Réglages d'impression 3D → définitions et ligne de commande CuraEngine.
import { PRINTERS } from '../core/profiles.js';

// Préréglages proposés dans l'onglet Modèle 3D
export const QUALITY = {
  fast: { label: 'Rapide', layerHeight: 0.28, walls: 2, topLayers: 3, bottomLayers: 3, infill: 15, pattern: 'grid' },
  standard: { label: 'Standard', layerHeight: 0.2, walls: 3, topLayers: 4, bottomLayers: 4, infill: 20, pattern: 'gyroid' },
  strong: { label: 'Solide', layerHeight: 0.2, walls: 4, topLayers: 5, bottomLayers: 5, infill: 40, pattern: 'gyroid' },
  max: { label: 'Résistance max', layerHeight: 0.2, walls: 6, topLayers: 6, bottomLayers: 6, infill: 60, pattern: 'gyroid' },
};
export const INFILL_PATTERNS = { gyroid: 'Gyroïde (solide dans tous les sens)', cubic: 'Cubique', grid: 'Grille', lines: 'Lignes', triangles: 'Triangles' };

export function defaultJob(printerId) {
  return {
    quality: 'strong',
    layerHeight: 0.2, walls: 4, topLayers: 5, bottomLayers: 5, infill: 40, pattern: 'gyroid',
    support: 'tree', // tree | normal | none
    supportAngle: 50,
    supportBuildplateOnly: false,
    adhesion: 'auto', // auto | skirt | brim | none
    orientMode: 'strength', // strength | supports
    primeTower: true,
    flushMultiplier: 1,
    printer: printerId,
  };
}

const LW = 0.42; // largeur d'extrusion (buse 0,4)

// Vitesse limitée par le débit volumique max du filament et par son plafond éventuel (TPU, nylon)
function cap(v, fil, h, w = LW) {
  const area = (w - h) * h + (Math.PI * h * h) / 4;
  return Math.max(5, Math.round(Math.min(v, fil.maxVolumetric / area, fil.speedCap || Infinity)));
}

/**
 * Construit l'appel CuraEngine.
 * job : réglages de l'onglet ; tools : [{ fil, color, slot }] (index = extrudeur Cura) ;
 * meshes : [{ file, tool }] ; extra : { startGcode, endGcode, primeTowerPos }
 */
export function buildCura(job, tools, meshes, extra) {
  const P = PRINTERS[job.printer];
  const sp = P.speeds;
  const h = job.layerHeight;
  const h0 = Math.min(0.3, Math.max(0.2, h));
  const fil0 = tools[0].fil;
  const multi = tools.length > 1;
  const anyType = (t) => tools.some((x) => x.fil.type === t);
  let adhesion = job.adhesion;
  if (adhesion === 'auto') adhesion = anyType('PA') || anyType('TPU') ? 'brim' : 'skirt';
  const brimWidth = Math.max(4, ...tools.map((t) => (t.fil.type === 'PA' ? 6 : 4)));

  const g = { // réglages communs
    machine_width: P.bed.x, machine_depth: P.bed.y, machine_height: P.bed.z,
    machine_heated_bed: true, machine_center_is_zero: false, machine_nozzle_size: 0.4,
    relative_extrusion: true,
    machine_extruder_count: tools.length,
    layer_height: h, layer_height_0: h0,
    line_width: LW, wall_line_width_0: LW, wall_line_width_x: 0.45, infill_line_width: 0.45, skin_line_width: 0.42,
    wall_line_count: job.walls, top_layers: job.topLayers, bottom_layers: job.bottomLayers,
    infill_sparse_density: job.infill, infill_pattern: job.pattern,
    infill_overlap: 15, skin_overlap: 10, infill_wipe_dist: 0,
    z_seam_type: 'sharpest_corner', z_seam_corner: 'z_seam_corner_weighted',
    optimize_wall_printing_order: true, outer_inset_first: false,
    travel_avoid_other_parts: true, travel_avoid_supports: true, retraction_combing: 'noskin', retraction_min_travel: 1.5,
    material_bed_temperature: fil0.bed, material_bed_temperature_layer_0: fil0.bedFirst,
    acceleration_enabled: true, jerk_enabled: false,
    acceleration_print: Math.min(sp.accel, fil0.accelCap || Infinity),
    acceleration_travel: Math.min(sp.accelTravel, fil0.accelCap ? fil0.accelCap * 2 : Infinity),
    acceleration_layer_0: Math.min(sp.accelFirst, fil0.accelCap || Infinity),
    acceleration_wall_0: Math.min(Math.round(sp.accel * 0.7), fil0.accelCap || Infinity),
    support_enable: job.support !== 'none',
    support_structure: job.support === 'normal' ? 'normal' : 'tree',
    support_type: job.supportBuildplateOnly ? 'buildplate' : 'everywhere',
    support_angle: job.supportAngle,
    support_z_distance: h, support_top_distance: h, support_bottom_distance: h,
    support_xy_distance: 0.8, support_xy_overrides_z: 'z_overrides_xy',
    support_infill_rate: 15, support_pattern: 'zigzag', support_line_width: 0.42,
    support_interface_enable: true, support_roof_enable: true, support_bottom_enable: false,
    support_interface_height: Math.max(0.6, 3 * h), support_interface_density: 80, support_interface_pattern: 'lines',
    support_tree_angle: 45, support_tree_branch_diameter: 3, support_tree_branch_distance: 1,
    support_extruder_nr: 0,
    adhesion_type: adhesion, skirt_line_count: 1, skirt_gap: 3, brim_width: brimWidth, brim_outside_only: true,
    prime_tower_enable: multi && job.primeTower, prime_tower_size: 25, prime_tower_min_volume: 15,
    prime_tower_position_x: extra.primeTowerPos ? extra.primeTowerPos.x : P.bed.x - 20,
    prime_tower_position_y: extra.primeTowerPos ? extra.primeTowerPos.y : P.bed.y - 20,
    prime_tower_brim_enable: true, prime_tower_wipe_enabled: true,
    prime_blob_enable: false, ooze_shield_enabled: false,
    cool_fan_enabled: true, cool_min_layer_time: anyType('PLA') ? 6 : 4, cool_min_speed: 10, cool_lift_head: false,
    magic_spiralize: false, ironing_enabled: false,
    bridge_settings_enabled: true,
    meshfix_union_all: true, meshfix_union_all_remove_holes: false,
    small_feature_speed_factor: 50,
  };

  const perTool = tools.map((t, i) => {
    const f = t.fil;
    const fullFanLayer = (f.fanFirstLayers || 0) + 1;
    return {
      extruder_nr: i,
      material_diameter: 1.75,
      material_print_temperature: f.nozzle,
      material_print_temperature_layer_0: f.nozzleFirst,
      material_initial_print_temperature: f.nozzle,
      material_final_print_temperature: f.nozzle,
      material_standby_temperature: f.nozzle,
      material_flow: Math.round(f.flow * 100),
      retraction_enable: true,
      retraction_amount: f.retractLength,
      retraction_speed: f.retractSpeed, retraction_retract_speed: f.retractSpeed, retraction_prime_speed: f.retractSpeed,
      retraction_hop_enabled: f.zHop > 0, retraction_hop: f.zHop || 0.2, retraction_hop_only_when_collides: true,
      switch_extruder_retraction_amount: 0, switch_extruder_extra_prime_amount: 0,
      cool_fan_speed: f.fan, cool_fan_speed_min: f.fan, cool_fan_speed_max: Math.max(f.fan, Math.min(100, f.fan + 20)),
      cool_fan_full_layer: fullFanLayer, cool_fan_speed_0: 0,
      speed_print: cap(sp.infill, f, h, 0.45),
      speed_infill: cap(sp.infill, f, h, 0.45),
      speed_wall_0: cap(sp.outerWall, f, h),
      speed_wall_x: cap(sp.innerWall, f, h, 0.45),
      speed_topbottom: cap(Math.round(sp.outerWall * 0.9), f, h),
      speed_support: cap(Math.round(sp.infill * 0.7), f, h),
      speed_support_interface: cap(Math.round(sp.outerWall * 0.5), f, h),
      speed_prime_tower: cap(Math.round(sp.outerWall * 0.6), f, h),
      speed_layer_0: cap(sp.firstLayer, f, h0), speed_print_layer_0: cap(sp.firstLayer, f, h0),
      speed_travel: f.speedCap ? Math.min(sp.travel, 250) : sp.travel,
      speed_travel_layer_0: 150,
      skirt_brim_speed: cap(sp.firstLayer, f, h0),
      machine_extruder_start_code: '', machine_extruder_end_code: '',
      machine_nozzle_offset_x: 0, machine_nozzle_offset_y: 0,
    };
  });

  const printer = {
    version: 2, name: `SVG2Print ${P.name}`, inherits: 'fdmprinter',
    metadata: { visible: false, machine_extruder_trains: Object.fromEntries(tools.map((_, i) => [String(i), `extruder-${i}`])) },
    overrides: {
      machine_name: { default_value: P.name },
      machine_gcode_flavor: { default_value: 'RepRap (Marlin/Sprinter)' },
      machine_start_gcode: { default_value: extra.startGcode },
      machine_end_gcode: { default_value: extra.endGcode },
      machine_extruder_count: { default_value: tools.length },
      machine_width: { default_value: P.bed.x }, machine_depth: { default_value: P.bed.y }, machine_height: { default_value: P.bed.z },
    },
  };
  const extruders = tools.map((_, i) => ({
    version: 2, name: `Extrudeur ${i + 1}`, inherits: 'fdmextruder',
    metadata: { machine: 'svg2print', position: String(i) },
    overrides: { extruder_nr: { default_value: i, maximum_value: String(tools.length - 1) }, machine_nozzle_size: { default_value: 0.4 }, material_diameter: { default_value: 1.75 } },
  }));

  const val = (v) => (typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
  const args = ['slice', '-j', 'definitions/printer.def.json', '-o', 'Model.gcode'];
  for (const [k, v] of Object.entries(g)) args.push('-s', `${k}=${val(v)}`);
  perTool.forEach((s, i) => {
    args.push(`-e${i}`);
    for (const [k, v] of Object.entries(s)) args.push('-s', `${k}=${val(v)}`);
  });
  meshes.forEach((m) => { args.push(`-e${m.tool}`, '-l', m.file); });
  const bad = args.find((a) => /\s/.test(a));
  if (bad) throw new Error(`Réglage invalide (espace dans « ${bad} »).`);
  return { definition: { printer, extruders }, command: args.join(' '), adhesion };
}
