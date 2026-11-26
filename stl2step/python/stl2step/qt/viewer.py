"""Vue 3D OpenGL (pyqtgraph) : ombré + arêtes, ombré, filaire, carte de conversion, mesure."""
from __future__ import annotations

import numpy as np
import pyqtgraph.opengl as gl
from OpenGL import GL
from pyqtgraph.opengl import shaders
from PyQt6 import QtCore, QtGui

SHADED_EDGES, SHADED, WIRE, MAP = range(4)
MODE_NAMES = ["Ombré + arêtes", "Ombré", "Filaire", "Carte de conversion"]

# Couleurs modifiables (RVBA, 0 à 1)
COLORS = {
    "fond": (0.106, 0.133, 0.173, 1.0),
    "piece": (0.66, 0.72, 0.82, 1.0),
    "plan": (0.25, 0.50, 0.92, 1.0),
    "cylindre": (0.96, 0.56, 0.16, 1.0),
    "facette": (0.62, 0.62, 0.62, 1.0),
    "arete": (0.04, 0.05, 0.07, 1.0),
    "filaire": (0.78, 0.84, 0.94, 0.85),
    "maillage_carte": (0.0, 0.0, 0.0, 0.18),
    "mesure": (1.0, 0.85, 0.1, 1.0),
    "plan_coupe": (0.95, 0.3, 0.3, 0.28),
    "sections": (1.0, 0.85, 0.1, 1.0),
    "piece_basse": (0.30, 0.58, 0.95, 1.0),
    "piece_haute": (0.96, 0.60, 0.22, 1.0),
    "goupilles": (0.55, 0.85, 0.45, 1.0),
}

# Éclairage « atelier » : lumière frontale + lumière d'appoint, liées à la caméra, faces vues des deux côtés.
SHADER = "stl2step"
if not any(getattr(p, "name", None) == SHADER for p in shaders.Shaders):
    shaders.Shaders.append(shaders.ShaderProgram(SHADER, [
        shaders.VertexShader("""
            uniform mat4 u_mvp;
            uniform mat3 u_normal;
            attribute vec4 a_position;
            attribute vec3 a_normal;
            attribute vec4 a_color;
            varying vec4 v_color;
            varying vec3 v_normal;
            void main() {
                v_normal = normalize(u_normal * a_normal);
                v_color = a_color;
                gl_Position = u_mvp * a_position;
            }
        """),
        shaders.FragmentShader("""
            #ifdef GL_ES
            precision mediump float;
            #endif
            varying vec4 v_color;
            varying vec3 v_normal;
            void main() {
                vec3 n = normalize(v_normal);
                float l = 0.30 + 0.50 * abs(n.z) + 0.30 * max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0);
                gl_FragColor = vec4(min(v_color.rgb * l, vec3(1.0)), v_color.a);
            }
        """),
    ]))

_FACES_GL = {GL.GL_DEPTH_TEST: True, GL.GL_BLEND: False, GL.GL_CULL_FACE: False,
             GL.GL_POLYGON_OFFSET_FILL: True, "glPolygonOffset": (1.0, 1.0)}


def _segments_all(mesh) -> np.ndarray:
    keys = np.array(list(mesh.edge_map().keys()), dtype=np.int64)
    return mesh.vertices[keys].reshape(-1, 3) if len(keys) else np.zeros((0, 3))


def _segments_sharp(mesh, angle=30.0) -> np.ndarray:
    n = mesh.face_normals
    c = np.cos(np.radians(angle))
    out = []
    for (a, b), lst in mesh.edge_map().items():
        if len(lst) != 2 or n[lst[0][0]] @ n[lst[1][0]] < c:
            out.append((a, b))
    return mesh.vertices[np.array(out)].reshape(-1, 3) if out else np.zeros((0, 3))


def _segments_brep(res) -> np.ndarray:
    V = res.mesh.vertices
    segs = [np.stack([V[e.pts[:-1]], V[e.pts[1:]]], axis=1) for e in res.brep.edges if len(e.pts) > 1]
    return np.concatenate(segs).reshape(-1, 3) if segs else np.zeros((0, 3))


def map_colors(res) -> np.ndarray:
    cols = np.tile(np.array(COLORS["facette"]), (len(res.mesh.faces), 1))
    rng = np.random.default_rng(7)
    for f in res.seg.faces:
        base = COLORS["cylindre"] if f.kind == "cylinder" else (COLORS["facette"] if f.faceted else COLORS["plan"])
        k = 1.0 if f.faceted else rng.uniform(0.72, 1.0)
        c = np.array(base, dtype=float)
        c[:3] *= k
        cols[f.tris] = c
    return cols


class Viewer(gl.GLViewWidget):
    """Vue 3D. Signal picked(np.ndarray) : point de la pièce cliqué en mode mesure."""

    picked = QtCore.pyqtSignal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setBackgroundColor(QtGui.QColor.fromRgbF(*COLORS["fond"]))
        self.mesh = None
        self.res = None
        self.colors = None       # couleurs imposées par triangle (aperçu de découpe)
        self.mode = SHADED_EDGES
        self.measuring = False
        self._press = None
        self._items: dict[str, object] = {}
        self.setCameraPosition(distance=100, elevation=28, azimuth=-55)

    # ------------------------------------------------------------- contenu
    def _set(self, key, item):
        old = self._items.pop(key, None)
        if old is not None:
            self.removeItem(old)
        if item is not None:
            self._items[key] = item
            self.addItem(item)

    def set_mesh(self, mesh, res=None, fit=False, colors=None):
        self.mesh = mesh
        self.res = res
        self.colors = colors
        self._cache = {}
        self._set("markers", None)
        self._set("mline", None)
        self.redraw()
        if fit:
            self.fit()

    def set_mode(self, mode: int):
        self.mode = mode
        self.redraw()

    def redraw(self):
        for k in ("faces", "edges", "wire"):
            self._set(k, None)
        m = self.mesh
        if m is None:
            return
        mode = self.mode
        if mode != WIRE:
            if self.colors is not None:
                cols = np.asarray(self.colors, dtype=float)
            elif mode == MAP and self.res is not None:
                cols = map_colors(self.res)
            else:
                cols = np.tile(np.array(COLORS["piece"]), (len(m.faces), 1))
            vcols = np.repeat(cols[:, None, :], 3, axis=1).astype(np.float32)   # (M, 3, 4)
            md = gl.MeshData(vertexes=m.triangles.astype(np.float32), vertexColors=vcols)
            self._set("faces", gl.GLMeshItem(meshdata=md, smooth=False, shader=SHADER, glOptions=_FACES_GL))
        if mode in (WIRE, MAP):
            if "all" not in self._cache:
                self._cache["all"] = _segments_all(m)
            c = COLORS["filaire"] if mode == WIRE else COLORS["maillage_carte"]
            self._set("wire", gl.GLLinePlotItem(pos=self._cache["all"], mode="lines", color=c, width=1,
                                                antialias=True, glOptions="translucent"))
        if mode in (SHADED_EDGES, MAP):
            key = "brep" if self.res is not None else "sharp"
            if key not in self._cache:
                self._cache[key] = _segments_brep(self.res) if self.res is not None else _segments_sharp(m)
            if len(self._cache[key]):
                self._set("edges", gl.GLLinePlotItem(pos=self._cache[key], mode="lines", color=COLORS["arete"],
                                                     width=2, antialias=True, glOptions="opaque"))

    # ------------------------------------------------------------- aperçus
    def show_cut_plane(self, axis: int | None, h: float = 0.0):
        if axis is None or self.mesh is None:
            self._set("cutplane", None)
            return
        lo, hi = self.mesh.bounds
        pad = (hi - lo).max() * 0.08
        a, b = [i for i in range(3) if i != axis]
        quad = np.zeros((4, 3))
        quad[:, axis] = h
        quad[:, a] = [lo[a] - pad, hi[a] + pad, hi[a] + pad, lo[a] - pad]
        quad[:, b] = [lo[b] - pad, lo[b] - pad, hi[b] + pad, hi[b] + pad]
        md = gl.MeshData(vertexes=quad, faces=np.array([[0, 1, 2], [0, 2, 3]]))
        # décalé en profondeur : ne scintille pas avec une face confondue (après une coupe)
        opts = {GL.GL_DEPTH_TEST: True, GL.GL_BLEND: True, GL.GL_CULL_FACE: False,
                "glBlendFunc": (GL.GL_SRC_ALPHA, GL.GL_ONE_MINUS_SRC_ALPHA),
                GL.GL_POLYGON_OFFSET_FILL: True, "glPolygonOffset": (4.0, 4.0)}
        self._set("cutplane", gl.GLMeshItem(meshdata=md, color=COLORS["plan_coupe"], smooth=False, glOptions=opts))

    def show_sections(self, polylines: list | None):
        if not polylines:
            self._set("sections", None)
            return
        segs = [np.stack([p[:-1], p[1:]], axis=1) for p in polylines if len(p) > 1]
        pos = np.concatenate(segs).reshape(-1, 3)
        self._set("sections", gl.GLLinePlotItem(pos=pos, mode="lines", color=COLORS["sections"], width=2.5,
                                                antialias=True, glOptions="translucent"))

    def show_markers(self, pts: list):
        if not pts:
            self._set("markers", None)
            self._set("mline", None)
            return
        p = np.array(pts)
        self._set("markers", gl.GLScatterPlotItem(pos=p, color=COLORS["mesure"], size=12, pxMode=True,
                                                  glOptions="additive"))
        self._set("mline", gl.GLLinePlotItem(pos=p, mode="line_strip", color=COLORS["mesure"], width=3,
                                             glOptions="additive") if len(p) > 1 else None)

    # ------------------------------------------------------------- caméra
    def fit(self):
        if self.mesh is None:
            return
        lo, hi = self.mesh.bounds
        c = (lo + hi) / 2
        self.opts["center"] = QtGui.QVector3D(*map(float, c))
        r = max(float(np.linalg.norm(hi - lo)) / 2, 1e-6)
        self.setCameraPosition(distance=r / np.tan(np.radians(self.opts["fov"]) / 2) * 1.15)

    def view(self, elevation, azimuth):
        self.setCameraPosition(elevation=elevation, azimuth=azimuth)
        self.fit()

    # ------------------------------------------------------------- mesure
    def mousePressEvent(self, ev):
        self._press = ev.position()
        super().mousePressEvent(ev)

    def mouseReleaseEvent(self, ev):
        super().mouseReleaseEvent(ev)
        if (self.measuring and self._press is not None and ev.button() == QtCore.Qt.MouseButton.LeftButton
                and (ev.position() - self._press).manhattanLength() < 5 and self.mesh is not None):
            hit = self.pick(ev.position().x(), ev.position().y())
            if hit is not None:
                self.picked.emit(hit)
        self._press = None

    def ray(self, x: float, y: float):
        vp = self.getViewport()
        m = self.projectionMatrix(vp, vp) * self.viewMatrix()
        inv, ok = m.inverted()
        if not ok:
            return None
        nx, ny = 2 * x / vp[2] - 1, 1 - 2 * y / vp[3]
        a = inv.map(QtGui.QVector4D(nx, ny, -1, 1))
        b = inv.map(QtGui.QVector4D(nx, ny, 1, 1))
        o = np.array([a.x(), a.y(), a.z()]) / a.w()
        e = np.array([b.x(), b.y(), b.z()]) / b.w()
        return o, e - o

    def pick(self, x: float, y: float):
        r = self.ray(x, y)
        if r is None:
            return None
        return pick_mesh(self.mesh, *r)


def pick_mesh(mesh, o, d):
    """Intersection rayon / triangles (Möller–Trumbore, vectorisé) : point le plus proche."""
    t = mesh.triangles
    e1 = t[:, 1] - t[:, 0]
    e2 = t[:, 2] - t[:, 0]
    p = np.cross(d, e2)
    det = np.einsum("ij,ij->i", e1, p)
    ok = np.abs(det) > 1e-18
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - t[:, 0]
    u = np.einsum("ij,ij->i", s, p) * inv
    q = np.cross(s, e1)
    v = (q @ d) * inv
    tt = np.einsum("ij,ij->i", e2, q) * inv
    hit = ok & (u >= 0) & (u <= 1) & (v >= 0) & (u + v <= 1) & (tt > 0)
    if not hit.any():
        return None
    i = np.argmin(np.where(hit, tt, np.inf))
    return o + d * tt[i]
