"""Modifications du maillage : coupe par un plan (avec bouchage), mesures."""
from __future__ import annotations

import numpy as np

from .mesh import Mesh, from_triangles


def cut(mesh: Mesh, point, normal, keep: str = "below", cap: bool = True) -> Mesh:
    """Coupe le maillage par le plan (point, normale).

    keep="below" garde le côté opposé à la normale, "above" le côté de la normale.
    Avec cap=True, la section est rebouchée pour garder un solide fermé.
    """
    n = np.asarray(normal, float)
    n = n / np.linalg.norm(n)
    p0 = np.asarray(point, float)
    if keep == "above":
        n = -n
    V = mesh.vertices
    F = mesh.faces
    d = (V - p0) @ n
    eps = max(mesh.diagonal * 1e-9, 1e-12)
    d = np.where(np.abs(d) < eps, -eps, d)    # sommet sur le plan : gardé
    out = []
    for a, b, c in F.tolist():
        tri = [a, b, c]
        inside = [d[x] < 0 for x in tri]
        k = sum(inside)
        if k == 3:
            out.append(V[tri])
        elif k == 0:
            continue
        else:
            poly = []
            for i in range(3):
                u, v = tri[i], tri[(i + 1) % 3]
                if inside[i]:
                    poly.append(V[u])
                if inside[i] != inside[(i + 1) % 3]:
                    t = d[u] / (d[u] - d[v])
                    poly.append(V[u] + t * (V[v] - V[u]))
            for j in range(1, len(poly) - 1):
                out.append(np.array([poly[0], poly[j], poly[j + 1]]))
    res = from_triangles(np.array(out)) if out else Mesh(np.zeros((0, 3)), np.zeros((0, 3), int))
    if cap and len(res.faces):
        caps = cap_triangles(res, p0, n)
        if len(caps):
            res = from_triangles(np.concatenate([res.triangles, caps]))
    return res


def _boundary_loops(mesh: Mesh) -> list[list[int]]:
    F = mesh.faces
    em = mesh.edge_map()
    nxt: dict[int, int] = {}
    for (a, b), lst in em.items():
        if len(lst) == 1:
            t, k = lst[0]
            u, v = F[t, k], F[t, (k + 1) % 3]
            nxt[int(u)] = int(v)
    loops, seen = [], set()
    for s in list(nxt):
        if s in seen:
            continue
        loop, cur = [], s
        while cur not in seen and cur in nxt:
            seen.add(cur)
            loop.append(cur)
            cur = nxt[cur]
        if cur == s and len(loop) >= 3:
            loops.append(loop)
    return loops


def cap_triangles(mesh: Mesh, p0, n) -> np.ndarray:
    """Triangule les contours ouverts situés dans le plan de coupe."""
    V = mesh.vertices
    tol = max(mesh.diagonal * 1e-6, 1e-9)
    t = np.array([1.0, 0, 0]) if abs(n[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(n, t)
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    polys = []
    for lp in _boundary_loops(mesh):
        P = V[lp]
        if np.max(np.abs((P - p0) @ n)) > tol * 100:
            continue
        # Bouchon : boucle inversée (normale du bouchon = +n)
        lp = lp[::-1]
        P = V[lp]
        q = np.column_stack([(P - p0) @ u, (P - p0) @ v])
        polys.append((q, P))
    if not polys:
        return np.zeros((0, 3, 3))
    areas = [_area(q) for q, _ in polys]
    outers = [i for i, a in enumerate(areas) if a > 0]
    holes = [i for i, a in enumerate(areas) if a < 0]
    groups = {i: [] for i in outers}
    for h in holes:
        best = None
        for o in outers:
            if _inside(polys[h][0][0], polys[o][0]):
                if best is None or areas[o] < areas[best]:
                    best = o
        if best is not None:
            groups[best].append(h)
    tris = []
    for o, hs in groups.items():
        q, P = polys[o]
        q = list(map(tuple, q))
        P = list(P)
        for h in sorted(hs, key=lambda i: -max(polys[i][0][:, 0])):
            q, P = _bridge(q, P, [tuple(x) for x in polys[h][0]], list(polys[h][1]))
        for a, b, c in _earclip(q):
            tris.append([P[a], P[b], P[c]])
    return np.array(tris) if tris else np.zeros((0, 3, 3))


def _area(q) -> float:
    q = np.asarray(q)
    return 0.5 * float(np.sum(q[:, 0] * np.roll(q[:, 1], -1) - np.roll(q[:, 0], -1) * q[:, 1]))


def _inside(pt, poly) -> bool:
    x, y = pt
    c = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def _bridge(outer, P, hole, H):
    """Relie un trou au contour extérieur (méthode d'Eberly)."""
    m = max(range(len(hole)), key=lambda i: hole[i][0])
    mx, my = hole[m]
    best_x, best_i = None, None
    n = len(outer)
    for i in range(n):
        (x1, y1), (x2, y2) = outer[i], outer[(i + 1) % n]
        if (y1 - my) * (y2 - my) > 0 or y1 == y2:
            continue
        x = x1 + (my - y1) * (x2 - x1) / (y2 - y1)
        if x >= mx and (best_x is None or x < best_x):
            best_x = x
            best_i = i if x1 > x2 else (i + 1) % n
    if best_i is None:
        best_i = min(range(n), key=lambda i: (outer[i][0] - mx) ** 2 + (outer[i][1] - my) ** 2)
    else:
        # sommet réflexe plus proche à l'intérieur du triangle (M, I, P)
        I = (best_x, my)
        Pp = outer[best_i]
        cand = []
        for i in range(n):
            if i != best_i and _in_tri(outer[i], (mx, my), I, Pp) and outer[i][0] >= mx:
                cand.append(i)
        if cand:
            best_i = min(cand, key=lambda i: (abs(np.arctan2(outer[i][1] - my, outer[i][0] - mx)),
                                              (outer[i][0] - mx) ** 2))
    hq = hole[m:] + hole[:m]
    hP = H[m:] + H[:m]
    q = outer[:best_i + 1] + hq + [hole[m]] + outer[best_i:]
    PP = P[:best_i + 1] + hP + [H[m]] + P[best_i:]
    return q, PP


def _in_tri(p, a, b, c) -> bool:
    def s(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def _earclip(q):
    idx = list(range(len(q)))
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10 * len(q) * len(q):
        guard += 1
        n = len(idx)
        found = False
        for k in range(n):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % n]
            a, b, c = q[i0], q[i1], q[i2]
            cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cr <= 0:
                continue
            ok = True
            for j in idx:
                if j in (i0, i1, i2) or q[j] in (a, b, c):
                    continue
                if _in_tri(q[j], a, b, c):
                    ok = False
                    break
            if ok:
                tris.append((i0, i1, i2))
                idx.pop(k)
                found = True
                break
        if not found:            # polygone dégénéré : on force
            tris.append((idx[-1], idx[0], idx[1]))
            idx.pop(0)
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris


def distance(a, b) -> float:
    return float(np.linalg.norm(np.asarray(a, float) - np.asarray(b, float)))
