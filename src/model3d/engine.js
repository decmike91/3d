// Trancheur 3D : CuraEngine compilé en WebAssembly (paquet cura-wasm, licence AGPL-3.0).
// Ce module est empaqueté à part (www/engine3d.js) et chargé seulement à l'ouverture de l'onglet Modèle 3D.
// build.mjs corrige le worker de cura-wasm pour accepter plusieurs maillages (un par filament).
import { CuraWASM } from 'cura-wasm';
import { makeSliceCura } from './engine-core.js';

globalThis.Engine3D = { sliceCura: makeSliceCura(CuraWASM) };
