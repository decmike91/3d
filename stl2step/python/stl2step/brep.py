"""Topologie B-rep (sommets, arêtes, boucles) à partir des faces reconnues."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .segment import Segmentation, demote, drop_collinear


@dataclass
class Edge:
    v0: int
    v1: int
    kind: str                        # "line" | "circle"
    pts: list[int]                   # sommets du maillage (v0 ... v1)
    center: np.ndarray | None = None
    axis: np.ndarray | None = None   # sens de parcours (v0 -> v1 tourne dans le sens direct)
    radius: float = 0.0


@dataclass
class BFace:
    face: int
    loops: list[list[tuple[int, bool]]]   # (arête, même sens)
    outer: int = 0


@dataclass
class Brep:
    seg: Segmentation
    points: np.ndarray
    vmap: dict[int, int]
    edges: list[Edge] = field(default_factory=list)
    faces: list[BFace] = field(default_factory=list)
    closed: bool = True
    demoted: int = 0


class _Demote(Exception):
    def __init__(self, ids):
        self.ids = set(ids)


def build_brep(seg: Segmentation, max_iter: int = 50) -> Brep:
    demoted = 0
    for _ in range(max_iter):
        try:
            b = _build(seg)
            b.demoted = demoted
            return b
        except _Demote as d:
            demoted += len(d.ids)
            demote(seg, d.ids)
    # Dernier recours : tout en plans
    cyl = {i for i, f in enumerate(seg.faces) if f.kind == "cylinder"}
    if cyl:
        demoted += len(cyl)
        demote(seg, cyl)
    b = _build(seg)
    b.demoted = demoted
    return b


# --------------------------------------------------------------------------
def _build(seg: Segmentation) -> Brep:
    mesh = seg.mesh
    F = mesh.faces
    V = mesh.vertices
    fot = seg.face_of_tri
    nb = seg.neighbors
    tol = seg.tol
    M = len(F)

    # Demi-arêtes : h = 3t+k, de F[t,k] vers F[t,(k+1)%3]
    hs = F.reshape(-1)
    he = F[:, [1, 2, 0]].reshape(-1)
    twin = -np.ones(3 * M, dtype=np.int64)
    for t in range(M):
        for k in range(3):
            o = nb[t, k]
            if o < 0:
                continue
            a = F[t, k]
            for kk in range(3):
                if F[o, kk] == F[t, (k + 1) % 3] and F[o, (kk + 1) % 3] == a:
                    twin[3 * t + k] = 3 * o + kk
                    break
    face_h = np.repeat(fot, 3)
    other = np.where(twin >= 0, face_h[np.maximum(twin, 0)], -1)
    is_b = (twin < 0) | (other != face_h)
    closed = bool(np.all(twin >= 0))

    # Sommets « coins » : au moins 3 faces (le bord libre compte pour une face)
    pairs = np.unique(np.column_stack([F.reshape(-1), np.repeat(fot, 3)]), axis=0)
    cnt = np.bincount(pairs[:, 0], minlength=len(V))
    open_v = np.zeros(len(V), dtype=bool)
    open_v[hs[twin < 0]] = True
    open_v[he[twin < 0]] = True
    cnt = cnt + open_v
    corner = cnt >= 3

    bidx = np.nonzero(is_b)[0]
    out_by_face: dict[tuple[int, int], list[int]] = {}
    for h in bidx.tolist():
        out_by_face.setdefault((int(face_h[h]), int(hs[h])), []).append(h)
    for (f, v), lst in out_by_face.items():
        if len(lst) > 1:
            corner[v] = True        # bord qui se touche lui-même

    # Boucles par face (suite de demi-arêtes)
    used = np.zeros(3 * M, dtype=bool)
    face_loops: dict[int, list[list[int]]] = {}
    for h0 in bidx.tolist():
        if used[h0]:
            continue
        f = int(face_h[h0])
        seq = []
        h = h0
        while True:
            used[h] = True
            seq.append(h)
            nxt = None
            for c in out_by_face.get((f, int(he[h])), ()):
                if not used[c]:
                    nxt = c
                    break
            if nxt is None:
                break
            h = nxt
        if he[seq[-1]] != hs[seq[0]]:
            raise RuntimeError("boucle de bord non fermée")
        face_loops.setdefault(f, []).append(seq)

    # Courbes fermées sans coin : coin au plus petit sommet (choix identique des deux côtés)
    for loops in face_loops.values():
        for seq in loops:
            n = len(seq)
            brk = any(corner[hs[seq[i]]] or other[seq[i]] != other[seq[i - 1]] for i in range(n))
            if not brk:
                # coin : plus petit sommet « vrai » (pas un point au milieu d'une corde)
                vs = [int(hs[h]) for h in seq]
                kept = drop_collinear(V[vs], True, tol)
                corner[min(vs[i] for i in kept)] = True

    # Découpage des boucles en chaînes
    chains: list[dict] = []
    chain_of_h: dict[int, int] = {}
    face_chain_loops: dict[int, list[list[int]]] = {}
    for f, loops in face_loops.items():
        for seq in loops:
            n = len(seq)
            starts = [i for i in range(n)
                      if corner[hs[seq[i]]] or other[seq[i]] != other[seq[i - 1]]]
            cl = []
            for j, s in enumerate(starts):
                e = starts[j + 1] if j + 1 < len(starts) else starts[0] + n
                hh = [seq[i % n] for i in range(s, e)]
                cid = len(chains)
                chains.append({"face": f, "other": int(other[hh[0]]), "h": hh,
                               "pts": [int(hs[x]) for x in hh] + [int(he[hh[-1]])]})
                for x in hh:
                    chain_of_h[x] = cid
                cl.append(cid)
            face_chain_loops.setdefault(f, []).append(cl)

    # Géométrie des arêtes sur les chaînes canoniques
    vmap: dict[int, int] = {}
    pts_out: list[np.ndarray] = []

    def vid(m: int) -> int:
        if m not in vmap:
            vmap[m] = len(pts_out)
            pts_out.append(V[m].copy())
        return vmap[m]

    edges: list[Edge] = []
    chain_edges: dict[int, list[tuple[int, bool]]] = {}
    failed: set[int] = set()
    for cid, ch in enumerate(chains):
        f, g = ch["face"], ch["other"]
        if g >= 0 and g < f:
            continue
        try:
            subs = _fit_chain(seg, ch["pts"], [x for x in (f, g) if x >= 0], tol)
        except _Demote as d:
            failed |= d.ids
            continue
        lst = []
        for kind, p, geo in subs:
            e = Edge(vid(p[0]), vid(p[-1]), kind, p)
            if kind == "circle":
                e.center, e.axis, e.radius = geo
            lst.append((len(edges), True))
            edges.append(e)
        chain_edges[cid] = lst
        if g >= 0:
            tw = chain_of_h[int(twin[ch["h"][0]])]
            chain_edges[tw] = [(i, not s) for i, s in reversed(lst)]
    if failed:
        raise _Demote(failed)

    # Recalage des sommets sur les cercles
    for e in edges:
        if e.kind == "circle":
            for m in (e.pts[0], e.pts[-1]):
                q = pts_out[vmap[m]]
                d = q - e.center
                d -= (d @ e.axis) * e.axis
                ln = np.linalg.norm(d)
                if ln > 0:
                    pts_out[vmap[m]] = e.center + d / ln * e.radius

    bfaces = []
    for f in range(len(seg.faces)):
        loops = []
        areas = []
        for cl in face_chain_loops.get(f, []):
            loop = [oe for cid in cl for oe in chain_edges[cid]]
            loops.append(loop)
            poly = V[[p for cid in cl for p in chains[cid]["pts"][:-1]]]
            areas.append(_loop_area(poly, seg.faces[f].normal) if seg.faces[f].kind == "plane" else 0.0)
        outer = int(np.argmax(areas)) if areas else 0
        bfaces.append(BFace(f, loops, outer))
    return Brep(seg, np.array(pts_out), vmap, edges, bfaces, closed)


def _loop_area(poly: np.ndarray, n: np.ndarray) -> float:
    c = poly - poly.mean(axis=0)
    return float(0.5 * np.cross(c, np.roll(c, -1, axis=0)).sum(axis=0) @ n)


def _fit_chain(seg: Segmentation, pts: list[int], fids: list[int], tol: float):
    V = seg.mesh.vertices
    cyls = [i for i in fids if seg.faces[i].kind == "cylinder"]
    if not cyls:
        return _split_lines(pts, V[pts], tol)
    if len(pts) > 2:          # points au milieu des cordes (coupe) : ignorés
        keep = drop_collinear(V[pts], False, tol)
        pts = [pts[i] for i in keep]
    P = V[pts]
    n = len(pts) - 1

    def seg_class(i: int) -> str | None:
        a, b = P[i], P[i + 1]
        cls = None
        for ci in cyls:
            c = seg.faces[ci]
            d = b - a
            perp = d - (d @ c.axis) * c.axis
            if np.linalg.norm(perp) <= tol:
                k = "L"
            else:
                ha, hb = (a - c.point) @ c.axis, (b - c.point) @ c.axis
                ra = np.linalg.norm((a - c.point) - ha * c.axis)
                rb = np.linalg.norm((b - c.point) - hb * c.axis)
                if abs(ha - hb) <= tol and abs(ra - c.radius) <= tol and abs(rb - c.radius) <= tol \
                        and len(cyls) == 1:
                    k = "A"
                else:
                    return None
            if cls is not None and cls != k:
                return None
            cls = k
        return cls

    classes = []
    for i in range(n):
        k = seg_class(i)
        if k is None:
            worst = min(cyls, key=lambda ci: len(seg.faces[ci].tris))
            raise _Demote([worst])
        classes.append(k)

    out = []
    i = 0
    while i < n:
        j = i
        if classes[i] == "L":
            while j + 1 < n and classes[j + 1] == "L":
                j += 1
            out.extend(_split_lines(pts[i:j + 2], P[i:j + 2], tol))
        else:
            c = seg.faces[cyls[0]]
            sgn = _turn(P[i], P[i + 1], c)
            while j + 1 < n and classes[j + 1] == "A" and _turn(P[j + 1], P[j + 2], c) * sgn > 0 \
                    and abs((P[j + 2] - P[i]) @ c.axis) <= tol:
                j += 1
            h = (P[i:j + 2] - c.point) @ c.axis
            center = c.point + float(h.mean()) * c.axis
            ax = c.axis if sgn > 0 else -c.axis
            out.append(("circle", pts[i:j + 2], (center, ax, c.radius)))
        i = j + 1
    return out


def _turn(a, b, c) -> float:
    return float(np.cross(a - c.point, b - c.point) @ c.axis)


def _split_lines(pts: list[int], P: np.ndarray, tol: float):
    out = []
    n = len(pts) - 1
    i = 0
    while i < n:
        j = i + 1
        while j + 1 <= n:
            a, b = P[i], P[j + 1]
            d = b - a
            L = np.linalg.norm(d)
            if L == 0:
                break
            mid = P[i + 1:j + 1] - a
            dist = np.linalg.norm(np.cross(mid, d / L), axis=1)
            along = mid @ (d / L)
            if np.all(dist <= tol) and np.all(along > 0) and np.all(along < L):
                j += 1
            else:
                break
        out.append(("line", pts[i:j + 1], None))
        i = j
    return out
