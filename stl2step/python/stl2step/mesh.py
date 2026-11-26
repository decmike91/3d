"""Lecture/écriture STL et maillage indexé (sommets soudés)."""
from __future__ import annotations

import struct
from dataclasses import dataclass, field

import numpy as np

MAX_TRIANGLES = 120_000


@dataclass
class Mesh:
    vertices: np.ndarray  # (N, 3) float64
    faces: np.ndarray     # (M, 3) int64
    _cache: dict = field(default_factory=dict, repr=False, compare=False)

    # ------------------------------------------------------------------ props
    @property
    def triangles(self) -> np.ndarray:
        return self.vertices[self.faces]

    @property
    def face_normals(self) -> np.ndarray:
        if "n" not in self._cache:
            t = self.triangles
            n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
            ln = np.linalg.norm(n, axis=1)
            ln[ln == 0] = 1.0
            self._cache["n"] = n / ln[:, None]
            self._cache["a"] = 0.5 * np.linalg.norm(
                np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1)
        return self._cache["n"]

    @property
    def face_areas(self) -> np.ndarray:
        self.face_normals
        return self._cache["a"]

    @property
    def bounds(self) -> tuple[np.ndarray, np.ndarray]:
        return self.vertices.min(axis=0), self.vertices.max(axis=0)

    @property
    def diagonal(self) -> float:
        lo, hi = self.bounds
        return float(np.linalg.norm(hi - lo))

    @property
    def area(self) -> float:
        return float(self.face_areas.sum())

    @property
    def volume(self) -> float:
        t = self.triangles
        return float(np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])).sum() / 6.0)

    def edge_map(self) -> dict[tuple[int, int], list[tuple[int, int]]]:
        """Arête non orientée (a<b) -> liste de (triangle, indice local de l'arête)."""
        if "em" not in self._cache:
            em: dict[tuple[int, int], list[tuple[int, int]]] = {}
            for t, (a, b, c) in enumerate(self.faces.tolist()):
                for k, (u, v) in enumerate(((a, b), (b, c), (c, a))):
                    key = (u, v) if u < v else (v, u)
                    em.setdefault(key, []).append((t, k))
            self._cache["em"] = em
        return self._cache["em"]

    def open_edge_count(self) -> int:
        return sum(1 for v in self.edge_map().values() if len(v) != 2)

    def info(self) -> dict:
        lo, hi = self.bounds
        return {
            "triangles": int(len(self.faces)),
            "vertices": int(len(self.vertices)),
            "size": (hi - lo).tolist(),
            "min": lo.tolist(),
            "max": hi.tolist(),
            "area": self.area,
            "volume": abs(self.volume),
            "open_edges": self.open_edge_count(),
        }


# ---------------------------------------------------------------------- build
def from_triangles(tris: np.ndarray) -> Mesh:
    """Soude les sommets identiques et supprime les triangles dégénérés."""
    tris = np.asarray(tris, dtype=np.float64).reshape(-1, 3, 3)
    pts = tris.reshape(-1, 3)
    if len(pts) == 0:
        return Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64))
    span = float(np.linalg.norm(pts.max(0) - pts.min(0))) or 1.0
    q = span * 1e-9
    keys = np.round(pts / q).astype(np.int64)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    verts = pts[first]
    faces = inverse.reshape(-1, 3)
    ok = (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])
    faces = faces[ok]
    # Triangles d'aire nulle (sommets alignés)
    t = verts[faces]
    ar = np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1)
    faces = faces[ar > ar.max(initial=0.0) * 1e-12]
    used = np.unique(faces)
    remap = -np.ones(len(verts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    return Mesh(verts[used], remap[faces])


def read_stl(path: str) -> Mesh:
    with open(path, "rb") as f:
        data = f.read()
    return parse_stl(data)


def parse_stl(data: bytes) -> Mesh:
    if len(data) >= 84:
        n = struct.unpack_from("<I", data, 80)[0]
        if 84 + 50 * n == len(data):
            rec = np.frombuffer(data, dtype=np.dtype([
                ("n", "<f4", 3), ("v", "<f4", (3, 3)), ("attr", "<u2")]), count=n, offset=84)
            return from_triangles(rec["v"].astype(np.float64))
    text = data.decode("latin-1")
    if "facet" not in text and "vertex" not in text:
        raise ValueError("Fichier STL illisible")
    vals = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("vertex"):
            p = s.split()
            vals.append((float(p[1]), float(p[2]), float(p[3])))
    if len(vals) % 3:
        raise ValueError("STL texte incomplet")
    return from_triangles(np.array(vals, dtype=np.float64))


def stl_bytes(mesh: Mesh) -> bytes:
    n = len(mesh.faces)
    rec = np.zeros(n, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("attr", "<u2")]))
    rec["n"] = mesh.face_normals
    rec["v"] = mesh.triangles
    header = b"stl2step binary STL".ljust(80, b" ")
    return header + struct.pack("<I", n) + rec.tobytes()


def write_stl(path: str, mesh: Mesh) -> None:
    with open(path, "wb") as f:
        f.write(stl_bytes(mesh))
