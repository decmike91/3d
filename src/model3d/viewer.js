// Vue 3D (three.js) : plateau, objets (couleur du filament, surplombs en rouge), déplacement au doigt/souris,
// aperçu du G-code couche par couche, vignettes pour l'écran de l'imprimante.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const KIND_COLORS = { 0: 0x9aa5ad, 1: 0xf2a33a, 2: 0xf6d36b, 3: 0xd8553a, 4: 0x4a7fd0, 5: 0x2fb36d, 6: 0x7fd89c, 7: 0x2fb3b8, 8: 0xb07ad8 };

export function createViewer(canvas, { onSelect, onMove } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-200, -300, 500);
  scene.add(sun);

  const bedGroup = new THREE.Group();
  const objGroup = new THREE.Group();
  const pathGroup = new THREE.Group();
  const adhGroup = new THREE.Group(); // aperçu jupe / bordure autour des pièces
  scene.add(bedGroup, adhGroup, objGroup, pathGroup);
  let bed = { x: 256, y: 256, z: 256 };
  let meshes = new Map(); // id -> THREE.Mesh
  let selected = null;
  let toolpaths = null;
  let dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  function setBed(b, tower) {
    bed = b;
    bedGroup.clear();
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(b.x, b.y), new THREE.MeshStandardMaterial({ color: 0xb8924a, roughness: 0.85, metalness: 0.1 }));
    plate.position.set(b.x / 2, b.y / 2, -0.05);
    bedGroup.add(plate);
    const grid = [];
    for (let x = 0; x <= b.x + 0.01; x += 10) grid.push(x, 0, 0, x, b.y, 0);
    for (let y = 0; y <= b.y + 0.01; y += 10) grid.push(0, y, 0, b.x, y, 0);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    bedGroup.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x8d6c2f, transparent: true, opacity: 0.45 })));
    const box = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(b.x, b.y, b.z)), 0x7f8c97);
    box.material.transparent = true; box.material.opacity = 0.35;
    bedGroup.add(box);
    if (tower) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(tower.size, tower.size, 1), new THREE.MeshBasicMaterial({ color: 0xb07ad8, transparent: true, opacity: 0.45 }));
      t.position.set(tower.x, tower.y, 0.5);
      bedGroup.add(t);
    }
  }
  function resetCamera() {
    const c = new THREE.Vector3(bed.x / 2, bed.y / 2, 0);
    camera.position.set(bed.x / 2, -bed.y * 0.95, bed.z * 1.05);
    controls.target.copy(c);
    controls.update();
  }

  /**
   * list : [{ id, parts: [{ positions (repère plateau), color }], overhangAngle }]
   */
  function setObjects(list, opts = {}) {
    for (const m of meshes.values()) { m.geometry.dispose(); objGroup.remove(m); }
    meshes = new Map();
    const over = opts.overhangAngle != null ? Math.sin((opts.overhangAngle * Math.PI) / 180) : null;
    for (const o of list) {
      let n = 0;
      for (const p of o.parts) n += p.positions.length;
      const pos = new Float32Array(n);
      const col = new Float32Array(n);
      let k = 0;
      for (const p of o.parts) {
        const base = new THREE.Color(p.color || '#cccccc');
        const a = p.positions;
        pos.set(a, k);
        for (let i = 0; i < a.length; i += 9) {
          let c = base;
          if (over != null) {
            const ax = a[i + 3] - a[i], ay = a[i + 4] - a[i + 1], az = a[i + 5] - a[i + 2];
            const bx = a[i + 6] - a[i], by = a[i + 7] - a[i + 1], bz = a[i + 8] - a[i + 2];
            const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
            const l = Math.hypot(nx, ny, nz) || 1;
            const zmin = Math.min(a[i + 2], a[i + 5], a[i + 8]);
            if (nz / l < -over && zmin > 0.3) c = OVER;
          }
          for (let v = 0; v < 3; v++) { col[k + i + v * 3] = c.r; col[k + i + v * 3 + 1] = c.g; col[k + i + v * 3 + 2] = c.b; }
        }
        k += a.length;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.id = o.id;
      if (o.id === selected) mat.emissive = new THREE.Color(0x1d4f55);
      objGroup.add(mesh);
      meshes.set(o.id, mesh);
    }
    render();
  }
  const OVER = new THREE.Color('#e0473a');

  // Enveloppe convexe 2D (chaîne monotone)
  function hull2(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // Décalage vers l'extérieur d'un polygone convexe (somme de Minkowski avec un disque)
  function offset(poly, d) {
    if (d <= 0) return poly;
    const pts = [];
    for (const [x, y] of poly) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push([x + d * Math.cos(a), y + d * Math.sin(a)]); }
    return hull2(pts);
  }
  function ring(outer, inner, color, z) {
    const sh = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    sh.holes.push(new THREE.Path(inner.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    m.position.z = z;
    adhGroup.add(m);
  }
  /**
   * Aperçu de l'adhérence : spec = { type: 'skirt'|'brim'|'none', brimWidth, skirtGap, footprints: [[x,y]…] par objet }.
   * Bordure : bande autour de chaque pièce ; jupe : une ligne autour de l'ensemble, à distance.
   */
  function setAdhesion(spec) {
    for (const c of adhGroup.children) c.geometry.dispose();
    adhGroup.clear();
    if (!spec || spec.type === 'none') { render(); return; }
    const hulls = spec.footprints.filter((f) => f.length >= 3).map(hull2);
    if (!hulls.length) { render(); return; }
    if (spec.type === 'brim') {
      for (const h of hulls) ring(offset(h, spec.brimWidth), h, 0x2fb3b8, 0.08);
    } else if (spec.type === 'skirt') {
      const all = hull2(hulls.flat());
      ring(offset(all, spec.skirtGap + 1), offset(all, spec.skirtGap), 0x2fb3b8, 0.08);
    }
    render();
  }

  function select(id) {
    selected = id;
    for (const [mid, m] of meshes) m.material.emissive = new THREE.Color(mid === id ? 0x1d4f55 : 0x000000);
    render();
  }

  // ----- Aperçu du G-code -----
  function setToolpaths(pv, opts = {}) {
    pathGroup.clear();
    if (toolpaths) { toolpaths.geometry.dispose(); toolpaths = null; }
    adhGroup.visible = !pv; // les couches montrent la vraie jupe / bordure
    if (!pv) { objGroup.visible = true; render(); return; }
    const n = pv.kind.length;
    const col = new Float32Array(n * 6);
    const tmp = new THREE.Color();
    const toolCol = (opts.toolColors || []).map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      if (opts.colorBy === 'tool' && toolCol.length && pv.kind[i] !== 8 && pv.kind[i] !== 7) tmp.copy(toolCol[pv.tool[i]] || toolCol[0]);
      else tmp.setHex(KIND_COLORS[pv.kind[i]] ?? 0x999999);
      col.set([tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pv.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    toolpaths = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    toolpaths.userData.layers = pv.layers;
    pathGroup.add(toolpaths);
    objGroup.visible = false;
    setLayer(pv.layers.length - 1);
  }
  function setLayer(idx) {
    if (!toolpaths) return;
    const L = toolpaths.userData.layers;
    const l = L[Math.max(0, Math.min(L.length - 1, idx))];
    if (l) toolpaths.geometry.setDrawRange(0, (l.start + l.count) * 2);
    render();
  }

  // ----- Interaction : sélection et déplacement -----
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let drag = null;
  const hit = (ev) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
  };
  canvas.addEventListener('pointerdown', (ev) => {
    if (!objGroup.visible || ev.button > 0) return;
    hit(ev);
    const h = ray.intersectObjects([...meshes.values()], false)[0];
    if (!h) return;
    const id = h.object.userData.id;
    if (onSelect) onSelect(id);
    const p = new THREE.Vector3();
    ray.ray.intersectPlane(planeZ, p);
    drag = { id, mesh: h.object, start: p.clone(), moved: false, pointer: ev.pointerId };
    controls.enabled = false;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.pointer) return;
    hit(ev);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(planeZ, p)) return;
    drag.mesh.position.set(p.x - drag.start.x, p.y - drag.start.y, 0);
    drag.moved = true;
    render();
  });
  const endDrag = (ev) => {
    if (!drag || (ev && ev.pointerId !== drag.pointer)) return;
    const d = drag;
    drag = null;
    controls.enabled = true;
    if (d.moved && onMove) onMove(d.id, d.mesh.position.x, d.mesh.position.y);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ----- Rendu -----
  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }
  let raf = 0;
  function render() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      scene.background = new THREE.Color(dark ? 0x161c22 : 0xe4e8eb);
      renderer.render(scene, camera);
    });
  }
  controls.addEventListener('change', render);
  new ResizeObserver(resize).observe(canvas);

  // Vignette PNG (base64) vue de 3/4, plateau masqué
  function thumbnail(w, h) {
    const box = new THREE.Box3().setFromObject(objGroup);
    if (box.isEmpty()) return null;
    const cam = new THREE.PerspectiveCamera(30, w / h, 1, 5000);
    cam.up.set(0, 0, 1);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin((15 * Math.PI) / 180);
    cam.position.set(c.x + dist * 0.45, c.y - dist * 0.75, c.z + dist * 0.5);
    cam.lookAt(c);
    const rt = new THREE.WebGLRenderTarget(w, h);
    const vis = [bedGroup.visible, pathGroup.visible, objGroup.visible, scene.background, adhGroup.visible];
    adhGroup.visible = false;
    bedGroup.visible = false; pathGroup.visible = false; objGroup.visible = true;
    scene.background = new THREE.Color(0x2b3640);
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    renderer.setRenderTarget(null);
    [bedGroup.visible, pathGroup.visible, objGroup.visible, scene.background, adhGroup.visible] = vis;
    rt.dispose();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    render();
    return cv.toDataURL('image/png').split(',')[1];
  }

  setBed(bed);
  resetCamera();
  resize();
  return { setBed, setObjects, setAdhesion, select, setToolpaths, setLayer, resetCamera, resize, render, thumbnail, get showingPaths() { return !!toolpaths; } };
}
