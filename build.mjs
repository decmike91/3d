import * as esbuild from 'esbuild';
import fs from 'fs';
fs.rmSync('www', { recursive: true, force: true });
fs.mkdirSync('www', { recursive: true });
const common = { bundle: true, minify: true, target: ['chrome100'], logLevel: 'warning' };
await esbuild.build({ ...common, entryPoints: ['src/app.js'], outfile: 'www/app.js', format: 'iife' });
await esbuild.build({ ...common, entryPoints: ['src/worker.js'], outfile: 'www/worker.js', format: 'iife' });
// Trancheur 3D (CuraEngine WASM) : worker corrigé pour accepter plusieurs maillages (« paquet CWM1 »)
const curaPatch = {
  name: 'cura-multi-mesh',
  setup(b) {
    b.onLoad({ filter: /cura-wasm[\\/]dist[\\/]es\.js$/ }, (args) => {
      let src = fs.readFileSync(args.path, 'utf8');
      const old = "engine.FS.writeFile(\\'Model.stl\\', stl);";
      if (!src.includes(old)) throw new Error('cura-wasm : point de correction introuvable');
      const neu = '{ const __u = stl instanceof Uint8Array ? stl : new Uint8Array(stl);'
        + ' if (__u.length > 8 && __u[0] === 67 && __u[1] === 87 && __u[2] === 77 && __u[3] === 49) {'
        + ' const __h = __u[4] | (__u[5] << 8) | (__u[6] << 16) | (__u[7] << 24);'
        + ' const __idx = JSON.parse(new TextDecoder().decode(__u.subarray(8, 8 + __h))); let __o = 8 + __h;'
        + ' for (const __f of __idx) { engine.FS.writeFile(__f.name, __u.subarray(__o, __o + __f.size)); __o += __f.size; }'
        + ' } else engine.FS.writeFile("Model.stl", stl); }';
      src = src.replace(old, neu);
      return { contents: src, loader: 'js' };
    });
  },
};
await esbuild.build({ ...common, entryPoints: ['src/model3d/engine.js'], outfile: 'www/engine3d.js', format: 'iife', plugins: [curaPatch] });
await esbuild.build({ ...common, entryPoints: ['src/app.css'], outfile: 'www/app.css', loader: { '.woff2': 'file', '.woff': 'file' }, assetNames: 'fonts/[name]' });
const version = `1.0.${process.env.GITHUB_RUN_NUMBER || 'dev'}`;
fs.writeFileSync('www/index.html', fs.readFileSync('src/index.html', 'utf8').replaceAll('__VERSION__', version));
fs.copyFileSync('src/vector/vector.html', 'www/vector.html');
fs.cpSync('src/help/img', 'www/help/img', { recursive: true });
if (fs.existsSync('src/icon.svg')) fs.copyFileSync('src/icon.svg', 'www/icon.svg');
console.log('www/ construit');
