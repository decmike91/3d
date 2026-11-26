"""Découpe d'un STL en deux pièces avec plots de jonction.

Modes :
  « male »  : plots sur la pièce basse (côté −), trous ajustés dans la pièce haute ;
  « pins »  : trous dans les deux pièces + goupilles à imprimer à part ;
  « none »  : découpe simple, faces de coupe rebouchées.

Les plots sont placés automatiquement (loin les uns des autres, à distance des bords,
là où la matière est assez épaisse pour le trou) ou aux positions données.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .edit import _area, _boundary_loops, _bridge, _earclip, _inside, cut
from .mesh import Mesh, from_triangles

AX_BASIS = [(1, 2), (2, 0), (0, 1)]   # (u, v) pour un plan normal à x, y, z : (u, v, n) direct


@dataclass
class PegSettings:
    mode: str = "male"            # "male" | "pins" | "none"
    diameter: float = 5.0         # diamètre du plot / de la goupille (mm)
    length: float = 6.0           # male : hauteur du plot ; pins : longueur totale de la goupille
    clearance: float = 0.15       # jeu radial du trou (mm)
    extra_depth: float = 0.5      # profondeur de trou en plus de la longueur engagée (mm)
    chamfer: float = 0.5          # chanfrein en bout de plot (mm)
    wall: float = 1.2             # épaisseur de matière minimale autour et au fond du trou (mm)
    per_island: int = 2           # plots par zone de coupe
    segments: int = 32            # finesse des cercles
    positions: list | None = None # positions imposées (u, v) dans le plan de coupe


@dataclass
class SplitResult:
    low: Mesh
    high: Mesh
    pins: Mesh | None
    centers: list = field(default_factory=list)   # (u, v) des plots
    warnings: list = field(default_factory=list)
    axis: int = 2
    h: float = 0.0


# ------------------------------------------------------------------ géométrie
def ray_first_hit(mesh: Mesh, o: np.ndarray, d: np.ndarray) -> float:
    """Distance du premier triangle touché par le rayon (o, d unitaire), inf sinon."""
    t = mesh.triangles
    e1 = t[:, 1] - t[:, 0]
    e2 = t[:, 2] - t[:, 0]
    p = np.cross(d, e2)
    det = np.einsum("ij,ij->i", e1, p)
    ok = np.abs(det) > 1e-15
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = o - t[:, 0]
    u = np.einsum("ij,ij->i", s, p) * inv
    q = np.cross(s, e1)
    v = (q @ d) * inv
    tt = np.einsum("ij,ij->i", e2, q) * inv
    hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (tt > 1e-7)
    return float(tt[hit].min()) if hit.any() else math.inf


def _seg_dist(pts: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Distance de chaque point (P,2) au plus proche des segments (S,2)-(S,2)."""
    ab = b - a
    L2 = np.maximum(np.einsum("ij,ij->i", ab, ab), 1e-300)
    ap = pts[:, None, :] - a[None, :, :]
    t = np.clip(np.einsum("psk,sk->ps", ap, ab) / L2, 0, 1)
    proj = a[None] + t[..., None] * ab[None]
    return np.sqrt(((pts[:, None, :] - proj) ** 2).sum(-1)).min(axis=1)


def _islands(loops2d: list[np.ndarray]):
    """Regroupe les contours (orientés : extérieur > 0, trou < 0) en zones (extérieur, [trous])."""
    areas = [_area(q) for q in loops2d]
    outers = [i for i, a in enumerate(areas) if a > 0]
    groups = {i: [] for i in outers}
    for h, a in enumerate(areas):
        if a >= 0:
            continue
        best = None
        for o in outers:
            if _inside(loops2d[h][0], loops2d[o]) and (best is None or areas[o] < areas[best]):
                best = o
        if best is not None:
            groups[best].append(h)
    return groups


def _plane_loops(open_mesh: Mesh, p0, nvec, ub, vb, tol):
    """Contours du bord ouvert situés dans le plan, inversés (bouchon de normale nvec), en 3D et 2D."""
    V = open_mesh.vertices
    out = []
    for lp in _boundary_loops(open_mesh):
        P = V[lp]
        if np.max(np.abs((P - p0) @ nvec)) > tol:
            continue
        P = P[::-1]
        out.append((P, np.column_stack([(P - p0) @ ub, (P - p0) @ vb])))
    return out


def _circle(c3, ub, vb, r, nseg):
    th = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    return c3 + r * (np.cos(th)[:, None] * ub + np.sin(th)[:, None] * vb)


def _cap(loops, circles3d, p0, ub, vb):
    """Triangule le bouchon (contours + trous circulaires). Renvoie (triangles, cercles orientés 3D)."""
    polys = [(q, P) for P, q in loops]
    oriented = []
    for C in circles3d:
        q = np.column_stack([(C - p0) @ ub, (C - p0) @ vb])
        if _area(q) > 0:            # un trou doit tourner dans le sens indirect
            C, q = C[::-1], q[::-1]
        oriented.append(C)
        polys.append((q, C))
    groups = _islands([q for q, _ in polys])
    tris = []
    for o, hs in groups.items():
        q, P = polys[o]
        q = list(map(tuple, q))
        P = list(P)
        for h in sorted(hs, key=lambda i: -polys[i][0][:, 0].max()):
            q, P = _bridge(q, P, [tuple(x) for x in polys[h][0]], list(polys[h][1]))
        for a, b, c in _earclip(q):
            tris.append([P[a], P[b], P[c]])
    return tris, oriented


def _walls(R, c, dvec, rings):
    """Paroi d'un plot ou d'un trou partant du cercle orienté R (centre c) dans la direction dvec.

    rings : [(distance, rayon), ...] après l'anneau de départ. Ferme par un disque.
    """
    dirs = R - c
    dirs = dirs / np.linalg.norm(dirs, axis=1)[:, None]
    tris = []
    A = R
    n = len(R)
    for dist, rad in rings:
        B = c + dist * dvec + rad * dirs
        for i in range(n):
            j = (i + 1) % n
            tris.append([A[j], A[i], B[i]])
            tris.append([A[j], B[i], B[j]])
        A = B
    ce = c + rings[-1][0] * dvec
    for i in range(n):
        j = (i + 1) % n
        tris.append([ce, A[j], A[i]])
    return tris


def pin_mesh(diameter, length, chamfer, nseg=32) -> Mesh:
    """Goupille cylindrique debout (axe z, base en z=0), chanfreinée aux deux bouts."""
    r = diameter / 2
    ch = min(chamfer, r * 0.4, length * 0.2)
    rings = [(0.0, r - ch), (ch, r), (length - ch, r), (length, r - ch)]
    th = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    cs, sn = np.cos(th), np.sin(th)
    R = [np.column_stack([rad * cs, rad * sn, np.full(nseg, z)]) for z, rad in rings]
    tris = []
    for k in range(len(R) - 1):
        a, b = R[k], R[k + 1]
        for i in range(nseg):
            j = (i + 1) % nseg
            tris += [[a[i], a[j], b[j]], [a[i], b[j], b[i]]]
    c0, c1 = np.array([0, 0, 0.0]), np.array([0, 0, length])
    for i in range(nseg):
        j = (i + 1) % nseg
        tris += [[c0, R[0][j], R[0][i]], [c1, R[-1][i], R[-1][j]]]
    return from_triangles(np.array(tris))


# --------------------------------------------------------------- placement
def _choose_centers(islands2d, s: PegSettings, ok_thick, R):
    """Plots par zone : premier au plus loin du centre, suivants au plus loin des précédents."""
    need = R + s.wall
    chosen_all = []
    for outer, holes in islands2d:
        segs_a = np.concatenate([q for q in [outer] + holes])
        segs_b = np.concatenate([np.roll(q, -1, axis=0) for q in [outer] + holes])
        lo, hi = outer.min(0), outer.max(0)
        span = hi - lo
        step = max(min(span) / 30, max(span) / 60, need / 3, 1e-3)
        gu = np.arange(lo[0] + step / 2, hi[0], step)
        gv = np.arange(lo[1] + step / 2, hi[1], step)
        if len(gu) == 0 or len(gv) == 0:
            continue
        G = np.array(np.meshgrid(gu, gv)).reshape(2, -1).T
        inside = np.array([_inside(p, outer) and not any(_inside(p, h) for h in holes) for p in G])
        G = G[inside]
        if len(G) == 0:
            continue
        ed = _seg_dist(G, segs_a, segs_b)
        G, ed = G[ed >= need], ed[ed >= need]
        if len(G) == 0:
            continue
        # un peu en retrait des bords quand la place le permet (plots plus solides)
        keep = ed >= need + 0.35 * (ed.max() - need)
        G, ed = G[keep], ed[keep]
        cache = {}

        def good(i):
            if i not in cache:
                cache[i] = ok_thick(G[i])
            return cache[i]

        chosen = []
        for k in range(max(1, s.per_island)):
            if k == 0:
                score = ed if s.per_island == 1 else np.linalg.norm(G - G.mean(0), axis=1) + 1e-3 * ed
            else:
                dmin = np.min(np.linalg.norm(G[:, None] - np.array(chosen)[None], axis=2), axis=1)
                score = np.where(dmin >= 2 * R + s.wall, dmin, -1)
            pick = None
            for i in np.argsort(-score):
                if score[i] < 0:
                    break
                if good(int(i)):
                    pick = int(i)
                    break
            if pick is None:
                break
            chosen.append(G[pick])
        chosen_all.extend(chosen)
    return chosen_all


# ------------------------------------------------------------------ découpe
def split(mesh: Mesh, axis: int, h: float, s: PegSettings | None = None) -> SplitResult:
    s = s or PegSettings()
    iu, iv = AX_BASIS[axis]
    n = np.eye(3)[axis]
    u, v = np.eye(3)[iu], np.eye(3)[iv]
    p0 = n * h
    tol = max(mesh.diagonal * 1e-6, 1e-9) * 100
    low = cut(mesh, p0, n, "below", cap=False)
    high = cut(mesh, p0, n, "above", cap=False)
    res = SplitResult(low, high, None, axis=axis, h=h)
    if len(low.faces) == 0 or len(high.faces) == 0:
        raise ValueError("Le plan ne coupe pas la pièce : choisissez une position entre les deux extrémités.")
    loopsA = _plane_loops(low, p0, n, u, v, tol)          # bouchon de la pièce basse : normale +n
    loopsB = _plane_loops(high, p0, -n, v, u, tol)        # pièce haute : normale -n, repère (v, u)

    r = s.diameter / 2
    R = r + s.clearance
    nseg = max(8, int(s.segments))
    if s.mode == "male":
        need_hi, need_lo = s.length + s.extra_depth + s.wall, 0.0
    elif s.mode == "pins":
        half = s.length / 2 + s.extra_depth
        need_hi = need_lo = half + s.wall
    else:
        need_hi = need_lo = 0.0

    def thick_ok(c2):
        c3 = p0 + c2[0] * u + c2[1] * v
        pts = [c3] + list(_circle(c3, u, v, R, 6))
        for q in pts:
            if need_hi and ray_first_hit(mesh, q, n) < need_hi:
                return False
            if need_lo and ray_first_hit(mesh, q, -n) < need_lo:
                return False
        return True

    centers = []
    if s.mode in ("male", "pins"):
        islands = _islands([q for _, q in loopsA])
        islands2d = [(loopsA[o][1], [loopsA[i][1] for i in hs]) for o, hs in islands.items()]
        if s.positions:
            for c in s.positions:
                c = np.asarray(c, float)
                zone = next(((o, hs) for o, hs in islands2d
                             if _inside(c, o) and not any(_inside(c, x) for x in hs)), None)
                if zone is None:
                    res.warnings.append(f"Plot ({c[0]:.2f} ; {c[1]:.2f}) hors de la section : ignoré.")
                    continue
                o, hs = zone
                segs_a = np.concatenate([o] + hs)
                segs_b = np.concatenate([np.roll(x, -1, axis=0) for x in [o] + hs])
                if _seg_dist(c[None], segs_a, segs_b)[0] < R + s.wall:
                    res.warnings.append(f"Plot ({c[0]:.2f} ; {c[1]:.2f}) trop près d'un bord.")
                if not thick_ok(c):
                    res.warnings.append(f"Plot ({c[0]:.2f} ; {c[1]:.2f}) : matière trop fine pour le trou.")
                centers.append(c)
        else:
            centers = _choose_centers(islands2d, s, thick_ok, R)
            if not centers:
                res.warnings.append("Aucun plot ne tient dans cette section : réduisez le diamètre, la longueur "
                                    "ou l'épaisseur de paroi, ou déplacez le plan de coupe.")
    res.centers = [tuple(map(float, c)) for c in centers]
    c3s = [p0 + c[0] * u + c[1] * v for c in centers]

    # Pièce basse
    ra = r if s.mode == "male" else R
    circlesA = [_circle(c3, u, v, ra, nseg) for c3 in c3s]
    trisA, orA = _cap(loopsA, circlesA, p0, u, v)
    for C, c3 in zip(orA, c3s):
        if s.mode == "male":
            ch = min(s.chamfer, r * 0.4, s.length * 0.3)
            trisA += _walls(C, c3, n, [(s.length - ch, r), (s.length, r - ch)])
        else:
            trisA += _walls(C, c3, -n, [(s.length / 2 + s.extra_depth, R)])
    # Pièce haute
    circlesB = [_circle(c3, v, u, R, nseg) for c3 in c3s]
    trisB, orB = _cap(loopsB, circlesB, p0, v, u)
    depth = s.length + s.extra_depth if s.mode == "male" else s.length / 2 + s.extra_depth
    for C, c3 in zip(orB, c3s):
        trisB += _walls(C, c3, n, [(depth, R)])

    res.low = from_triangles(np.concatenate([low.triangles, np.array(trisA).reshape(-1, 3, 3)]))
    res.high = from_triangles(np.concatenate([high.triangles, np.array(trisB).reshape(-1, 3, 3)]))
    if s.mode == "pins" and centers:
        one = pin_mesh(s.diameter, s.length, s.chamfer, nseg)
        lo, hi = mesh.bounds
        parts = []
        for k in range(len(centers)):
            off = np.array([hi[0] + 5 + r + k * (s.diameter + 4), lo[1] + r, lo[2]])
            parts.append(one.triangles + off)
        res.pins = from_triangles(np.concatenate(parts))
    for name, m in (("basse", res.low), ("haute", res.high)):
        if m.open_edge_count():
            res.warnings.append(f"Pièce {name} : {m.open_edge_count()} arête(s) ouverte(s) "
                                "(le STL d'origine n'est peut-être pas fermé).")
    return res


def exploded(res: SplitResult, gap: float | None = None):
    """Pièces écartées pour l'aperçu : [(maillage, rôle)]."""
    n = np.eye(3)[res.axis]
    if gap is None:
        gap = max(res.low.diagonal, res.high.diagonal) * 0.15
    out = [(Mesh(res.low.vertices - n * gap / 2, res.low.faces), "basse"),
           (Mesh(res.high.vertices + n * gap / 2, res.high.faces), "haute")]
    if res.pins is not None:
        out.append((res.pins, "goupilles"))
    return out
