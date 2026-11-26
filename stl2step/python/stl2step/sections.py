"""Sections planes d'un STL et export DXF (R12, lisible par Fusion 360, FreeCAD, LibreCAD...)."""
from __future__ import annotations

import numpy as np

from .mesh import Mesh

AXES = {"x": 0, "y": 1, "z": 2}


def plane_basis(axis: str):
    """Repère (u, v) du plan de coupe, direct par rapport à l'axe normal."""
    i = AXES[axis]
    return [(1, 2), (2, 0), (0, 1)][i]


def slice_mesh(mesh: Mesh, axis: str, h: float) -> list[np.ndarray]:
    """Polylignes 3D (fermées quand c'est possible) de l'intersection avec le plan axe = h."""
    i = AXES[axis]
    V = mesh.vertices
    F = mesh.faces
    d = V[:, i] - h
    eps = max(mesh.diagonal * 1e-9, 1e-12)
    d = np.where(np.abs(d) < eps, eps, d)     # sommet sur le plan : décalé d'un epsilon
    s = d[F] > 0
    cnt = s.sum(axis=1)
    cut = np.nonzero((cnt == 1) | (cnt == 2))[0]
    point_of_edge: dict[tuple[int, int], int] = {}
    pts: list[np.ndarray] = []
    nxt: dict[int, int] = {}

    def ep(a: int, b: int) -> int:
        k = (a, b) if a < b else (b, a)
        if k not in point_of_edge:
            t = d[a] / (d[a] - d[b])
            point_of_edge[k] = len(pts)
            pts.append(V[a] + t * (V[b] - V[a]))
        return point_of_edge[k]

    for t in cut.tolist():
        a, b, c = F[t]
        tri = [a, b, c]
        # segment orienté : de l'arête qui « monte » à celle qui « descend »
        up = dn = None
        for k in range(3):
            u, v = tri[k], tri[(k + 1) % 3]
            if d[u] < 0 < d[v]:
                up = ep(u, v)
            elif d[u] > 0 > d[v]:
                dn = ep(u, v)
        if up is not None and dn is not None:
            nxt[dn] = up
    # chaînage
    out = []
    seen = set()
    prev = {v: k for k, v in nxt.items()}
    starts = [k for k in nxt if k not in prev] + list(nxt.keys())
    for s0 in starts:
        if s0 in seen:
            continue
        chain = [s0]
        seen.add(s0)
        cur = s0
        while cur in nxt and nxt[cur] not in seen:
            cur = nxt[cur]
            chain.append(cur)
            seen.add(cur)
        closed = cur in nxt and nxt[cur] == s0
        poly = np.array([pts[k] for k in chain] + ([pts[s0]] if closed else []))
        if len(poly) >= 2:
            out.append(simplify(poly, closed, eps * 1e3))
    return out


def simplify(poly: np.ndarray, closed: bool, tol: float) -> np.ndarray:
    """Supprime les points alignés (les côtés droits deviennent un seul segment)."""
    pts = list(poly[:-1]) if closed else list(poly)
    changed = True
    while changed and len(pts) > (3 if closed else 2):
        changed = False
        n = len(pts)
        rng = range(n) if closed else range(1, n - 1)
        for i in rng:
            a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
            ac = c - a
            L = np.linalg.norm(ac)
            if L == 0 or np.linalg.norm(np.cross(b - a, ac)) / L <= tol:
                if 0 <= (b - a) @ ac <= L * L:
                    pts.pop(i)
                    changed = True
                    break
    arr = np.array(pts)
    return np.vstack([arr, arr[:1]]) if closed else arr


def positions(mesh: Mesh, axis: str, count: int) -> list[float]:
    lo, hi = mesh.bounds
    i = AXES[axis]
    step = (hi[i] - lo[i]) / (count + 1)
    return [float(lo[i] + step * (k + 1)) for k in range(count)]


def sections(mesh: Mesh, axis: str, at: list[float]):
    return [(h, slice_mesh(mesh, axis, h)) for h in at]


def dxf_text(secs, axis: str, flat: bool = True) -> str:
    """Un calque par section. flat=True : coordonnées 2D dans le plan de coupe."""
    iu, iv = plane_basis(axis)
    i = AXES[axis]
    layers = ["SECTION_%s_%s" % (axis.upper(), ("%.3f" % h).replace(".", "_").replace("-", "M"))
              for h, _ in secs]
    L = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009",
         "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
         "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", str(len(layers))]
    for k, name in enumerate(layers):
        L += ["0", "LAYER", "2", name, "70", "0", "62", str(1 + k % 7), "6", "CONTINUOUS"]
    L += ["0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"]
    for (h, polys), name in zip(secs, layers):
        for p in polys:
            closed = len(p) > 2 and np.allclose(p[0], p[-1])
            q = p[:-1] if closed else p
            L += ["0", "POLYLINE", "8", name, "66", "1", "70", str((1 if closed else 0) | (0 if flat else 8))]
            L += ["10", "0.0", "20", "0.0", "30", ("0.0" if flat else "%.6f" % h)]
            for pt in q:
                if flat:
                    x, y, z = pt[iu], pt[iv], 0.0
                else:
                    x, y, z = pt
                L += ["0", "VERTEX", "8", name, "10", "%.6f" % x, "20", "%.6f" % y, "30", "%.6f" % z,
                      "70", "0" if flat else "32"]
            L += ["0", "SEQEND", "8", name]
    L += ["0", "ENDSEC", "0", "EOF"]
    return "\n".join(L) + "\n"
