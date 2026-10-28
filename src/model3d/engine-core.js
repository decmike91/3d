// Trancheur 3D : CuraEngine compilé en WebAssembly (paquet cura-wasm, licence AGPL-3.0).
// Cœur commun au navigateur (engine.js) et aux tests Node.

// Paquet « CWM1 » : en-tête JSON [{name, size}] puis les fichiers bout à bout
function pack(files) {
  const enc = new TextEncoder();
  const idx = enc.encode(JSON.stringify(files.map((f) => ({ name: f.name, size: f.data.length }))));
  const total = 8 + idx.length + files.reduce((a, f) => a + f.data.length, 0);
  const u = new Uint8Array(total);
  u.set([67, 87, 77, 49]);
  new DataView(u.buffer).setUint32(4, idx.length, true);
  u.set(idx, 8);
  let o = 8 + idx.length;
  for (const f of files) { u.set(f.data, o); o += f.data.length; }
  return u.buffer;
}

/**
 * definition : { printer, extruders } ; command : ligne CuraEngine ;
 * files : [{ name, data: Uint8Array }] (le premier doit s'appeler Model.stl)
 */
export const makeSliceCura = (CuraWASM) => async function sliceCura({ definition, command, files, onProgress }) {
  const slicer = new CuraWASM({ definition, command, transfer: true, verbose: false });
  slicer.on('progress', (p) => { try { onProgress && onProgress(p); } catch { /* ignore */ } });
  try {
    const { gcode, metadata } = await slicer.slice(pack(files), 'stl');
    const text = new TextDecoder().decode(gcode);
    if (!text || text.length < 200) throw new Error('Le trancheur n’a produit aucun G-code (modèle hors plateau ou vide ?).');
    return { gcode: text, metadata: metadata || {} };
  } finally {
    slicer.destroy().catch(() => {});
  }
};
