"""Reconnaissance des faces : régions planes puis cylindres.

1. Croissance de régions planes : triangles voisins dont la normale et les
   sommets restent dans la tolérance du plan de la graine.
2. Cylindres : regroupement de régions planes voisines (facettes) reliées par
   des arêtes « lisses » dont les normales sont perpendiculaires à un axe commun
   et dont les sommets sont sur un même cercle (dans la tolérance).
Ce qui n'est pas reconnu reste en facettes planes.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from .mesh import Mesh

PLANE_ANGLE_DEG = 0.3      # écart angulaire max entre triangles d'un même plan
SMOOTH_ANGLE_DEG = 45.0    # au-delà : arête vive (pas de cylindre à travers)
AXIS_SIN = math.sin(math.radians(1.0))
RADIAL_COS = math.cos(math.radians(15.0))
GENERATOR_COS = math.cos(math.radians(0.5))


def default_tolerance(mesh: Mesh) -> float:
    """Tolérance d'ajustement adaptée à la taille de la pièce."""
    return max(mesh.diagonal * 1e-4, 1e-6)


@dataclass
class Face:
    kind: str                      # "plane" | "cylinder"
    regions: list[int]             # régions planes d'origine
    tris: np.ndarray
    normal: np.ndarray | None = None   # plan : normale extérieure
    point: np.ndarray | None = None    # plan : point ; cylindre : point de l'axe
    axis: np.ndarray | None = None     # cylindre
    radius: float = 0.0
    outward: bool = True               # cylindre : normales vers l'extérieur de l'axe
    faceted: bool = False              # plan issu d'une facette isolée non reconnue


@dataclass
class Segmentation:
    mesh: Mesh
    tol: float
    neighbors: np.ndarray            # (M,3) triangle voisin par arête (-1 = aucun)
    region_of_tri: np.ndarray
    regions: list[np.ndarray]
    region_normal: np.ndarray
    faces: list[Face] = field(default_factory=list)
    face_of_tri: np.ndarray | None = None

    def summary(self) -> dict:
        planes = sum(1 for f in self.faces if f.kind == "plane" and not f.faceted)
        facets = sum(1 for f in self.faces if f.faceted)
        cyl = sum(1 for f in self.faces if f.kind == "cylinder")
        return {"faces": len(self.faces), "planes": planes, "cylinders": cyl, "facets": facets}


# --------------------------------------------------------------------- utils
def triangle_neighbors(mesh: Mesh) -> np.ndarray:
    F = mesh.faces
    nb = -np.ones((len(F), 3), dtype=np.int64)
    for (a, b), lst in mesh.edge_map().items():
        if len(lst) != 2:
            continue
        (t1, k1), (t2, k2) = lst
        u1 = F[t1, k1]
        u2 = F[t2, k2]
        if u1 == u2:           # même sens : orientation incohérente
            continue
        nb[t1, k1] = t2
        nb[t2, k2] = t1
    return nb


def _basis(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    t = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(a, t)
    u /= np.linalg.norm(u)
    return u, np.cross(a, u)


def fit_circle_2d(p: np.ndarray):
    m = p.mean(axis=0)
    q = p - m
    A = np.column_stack([q[:, 0], q[:, 1], np.ones(len(q))])
    b = -(q[:, 0] ** 2 + q[:, 1] ** 2)
    sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    cx, cy = -sol[0] / 2, -sol[1] / 2
    r2 = cx * cx + cy * cy - sol[2]
    if not np.isfinite(r2) or r2 <= 0:
        return None
    return np.array([cx, cy]) + m, math.sqrt(r2)


def has_generator(dirs: np.ndarray, a: np.ndarray) -> bool:
    """La facette a-t-elle une arête parallèle à l'axe (génératrice du cylindre) ?"""
    return len(dirs) > 0 and float(np.max(np.abs(dirs @ a))) >= GENERATOR_COS


def fit_cylinder(normals: np.ndarray, centroids: np.ndarray, pts: np.ndarray,
                 tol: float, max_r: float, dirs: list | None = None):
    """Renvoie (axe, point_axe, rayon, outward) ou None."""
    if len(normals) < 2:
        return None
    if len(normals) == 2:
        a = np.cross(normals[0], normals[1])
        if np.linalg.norm(a) < 1e-3:
            return None
    else:
        w, vec = np.linalg.eigh(normals.T @ normals)
        a = vec[:, 0]
    a = a / np.linalg.norm(a)
    if np.max(np.abs(normals @ a)) > AXIS_SIN:
        return None
    if dirs is not None and not all(has_generator(d, a) for d in dirs):
        return None
    u, v = _basis(a)
    p2 = np.column_stack([pts @ u, pts @ v])
    fit = fit_circle_2d(p2)
    if fit is None:
        return None
    c2, r = fit
    if r > max_r or r < tol:
        return None
    if np.max(np.abs(np.linalg.norm(p2 - c2, axis=1) - r)) > tol:
        return None
    # normales radiales, toutes du même côté
    q2 = np.column_stack([centroids @ u, centroids @ v]) - c2
    qn = np.linalg.norm(q2, axis=1)
    if np.any(qn < 1e-12):
        return None
    n2 = np.column_stack([normals @ u, normals @ v])
    s = np.einsum("ij,ij->i", n2, q2) / qn
    if np.all(s > RADIAL_COS):
        outward = True
    elif np.all(s < -RADIAL_COS):
        outward = False
    else:
        return None
    h = float((pts @ a).min())
    point = c2[0] * u + c2[1] * v + h * a
    return a, point, float(r), outward


# ----------------------------------------------------------------- segmenter
def plane_regions(mesh: Mesh, tol: float, nb: np.ndarray):
    n = mesh.face_normals
    F = mesh.faces
    V = mesh.vertices
    cos_a = math.cos(math.radians(PLANE_ANGLE_DEG))
    label = -np.ones(len(F), dtype=np.int64)
    regions: list[np.ndarray] = []
    order = np.argsort(-mesh.face_areas, kind="stable")
    nb_l = nb.tolist()
    for s in order.tolist():
        if label[s] >= 0:
            continue
        rid = len(regions)
        n0 = n[s]
        d0 = float(V[F[s, 0]] @ n0)
        label[s] = rid
        stack = [s]
        tris = [s]
        while stack:
            t = stack.pop()
            for u in nb_l[t]:
                if u < 0 or label[u] >= 0:
                    continue
                if float(n[u] @ n0) < cos_a:
                    continue
                if np.max(np.abs(V[F[u]] @ n0 - d0)) > tol:
                    continue
                label[u] = rid
                stack.append(u)
                tris.append(u)
        regions.append(np.array(tris, dtype=np.int64))
    return label, regions


def segment(mesh: Mesh, tol: float | None = None, cylinders: bool = True) -> Segmentation:
    if tol is None:
        tol = default_tolerance(mesh)
    nb = triangle_neighbors(mesh)
    label, regions = plane_regions(mesh, tol, nb)
    n = mesh.face_normals
    ar = mesh.face_areas
    F = mesh.faces
    V = mesh.vertices
    rn = np.zeros((len(regions), 3))
    for i, r in enumerate(regions):
        s = (n[r] * ar[r, None]).sum(axis=0)
        rn[i] = s / (np.linalg.norm(s) or 1.0)
    seg = Segmentation(mesh, tol, nb, label, regions, rn)

    # Adjacence lisse entre régions
    cos_s = math.cos(math.radians(SMOOTH_ANGLE_DEG))
    t_idx = np.repeat(np.arange(len(F)), 3)
    o_idx = nb.reshape(-1)
    m = o_idx >= 0
    a_r = label[t_idx[m]]
    b_r = label[o_idx[m]]
    dif = a_r != b_r
    a_r, b_r = a_r[dif], b_r[dif]
    smooth = np.einsum("ij,ij->i", rn[a_r], rn[b_r]) > cos_s
    adj: dict[int, set[int]] = {}
    for x, y in zip(a_r[smooth].tolist(), b_r[smooth].tolist()):
        adj.setdefault(x, set()).add(y)

    rpts = [_corner_points(mesh, r, nb, label, i, tol) for i, r in enumerate(regions)]
    rcent = np.array([V[p].mean(axis=0) for p in rpts])
    rarea = np.array([ar[r].sum() for r in regions])
    rdirs = []
    for r in regions:
        if len(r) > 64:        # grande face plane : ne sera pas une facette de cylindre
            rdirs.append(np.zeros((0, 3)))
            continue
        t = F[r]
        e = np.concatenate([V[t[:, 1]] - V[t[:, 0]], V[t[:, 2]] - V[t[:, 1]], V[t[:, 0]] - V[t[:, 2]]])
        ln = np.linalg.norm(e, axis=1)
        e = e[ln > tol] / ln[ln > tol, None]
        rdirs.append(e)
    max_r = mesh.diagonal

    owner = -np.ones(len(regions), dtype=np.int64)
    cyl_groups: list[tuple[list[int], tuple]] = []
    if cylinders:
        for seed in np.argsort(rarea, kind="stable").tolist():
            if owner[seed] >= 0 or seed not in adj:
                continue
            group = [seed]
            in_group = {seed}
            pts_ids = set(rpts[seed].tolist())
            fit = None
            fixed = None   # ajustement figé pour les grands groupes
            refit_at = 6
            frontier = list(adj[seed])
            while frontier:
                c = frontier.pop(0)
                if c in in_group or owner[c] >= 0:
                    continue
                ok = None
                if fixed is not None:
                    a, p0, r, outw = fixed
                    nc = rn[c]
                    if abs(nc @ a) <= AXIS_SIN and has_generator(rdirs[c], a):
                        u, v = _basis(a)
                        c2 = np.array([p0 @ u, p0 @ v])
                        q = V[rpts[c]]
                        d = np.linalg.norm(np.column_stack([q @ u, q @ v]) - c2, axis=1)
                        qc = np.array([rcent[c] @ u, rcent[c] @ v]) - c2
                        s = float(np.array([nc @ u, nc @ v]) @ qc) / (np.linalg.norm(qc) or 1)
                        if np.max(np.abs(d - r)) <= tol and (s > RADIAL_COS if outw else s < -RADIAL_COS):
                            ok = fixed
                else:
                    ids = list(group) + [c]
                    allp = np.array(sorted(pts_ids | set(rpts[c].tolist())))
                    ok = fit_cylinder(rn[ids], rcent[ids], V[allp], tol, max_r, [rdirs[i] for i in ids])
                if ok is None:
                    continue
                group.append(c)
                in_group.add(c)
                pts_ids |= set(rpts[c].tolist())
                fit = ok
                if len(group) >= refit_at:
                    allp = np.array(sorted(pts_ids))
                    fixed = fit_cylinder(rn[group], rcent[group], V[allp], tol, max_r,
                                         [rdirs[i] for i in group])
                    if fixed is None:     # ne devrait pas arriver
                        fixed = fit
                    fit = fixed
                    refit_at *= 2
                frontier.extend(x for x in adj.get(c, ()) if x not in in_group)
            if len(group) >= 3 and fit is not None:
                allp = np.array(sorted(pts_ids))
                final = fit_cylinder(rn[group], rcent[group], V[allp], tol, max_r,
                                     [rdirs[i] for i in group]) or fit
                for g in group:
                    owner[g] = len(cyl_groups)
                cyl_groups.append((group, final))

    faces: list[Face] = []
    for group, (a, p, r, outw) in cyl_groups:
        tris = np.concatenate([regions[g] for g in group])
        faces.append(Face("cylinder", group, tris, point=p, axis=a, radius=r, outward=outw))
    for i, r in enumerate(regions):
        if owner[i] < 0:
            faces.append(_plane_face(seg, i))
    seg.faces = faces
    _assign(seg)
    return seg


def drop_collinear(P: np.ndarray, closed: bool, tol: float) -> list[int]:
    """Indices des points à garder (les points alignés entre leurs voisins sont retirés)."""
    pts = P.tolist()
    keep = list(range(len(pts)))
    tol2 = tol * tol
    i = 0 if closed else 1
    while len(keep) > (3 if closed else 2) and i < len(keep) - (0 if closed else 1):
        a, b, c = pts[keep[i - 1]], pts[keep[i]], pts[keep[(i + 1) % len(keep)]]
        acx, acy, acz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        abx, aby, abz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        L2 = acx * acx + acy * acy + acz * acz
        t = abx * acx + aby * acy + abz * acz
        cx, cy, cz = aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx
        if L2 > 0 and 0 < t < L2 and (cx * cx + cy * cy + cz * cz) <= tol2 * L2:
            keep.pop(i)
            i = max(i - 1, 0 if closed else 1)
        else:
            i += 1
    return keep


def _corner_points(mesh: Mesh, r: np.ndarray, nb: np.ndarray, label: np.ndarray, rid: int,
                   tol: float) -> np.ndarray:
    """Sommets « vrais » d'une facette : bord de la région sans les points alignés."""
    F = mesh.faces
    if len(r) > 64:
        return np.unique(F[r])
    nxt = {}
    for t in r.tolist():
        for k in range(3):
            o = nb[t, k]
            if o < 0 or label[o] != rid:
                nxt[int(F[t, k])] = int(F[t, (k + 1) % 3])
    out, seen = [], set()
    for s0 in list(nxt):
        if s0 in seen:
            continue
        loop, cur = [], s0
        while cur in nxt and cur not in seen:
            seen.add(cur)
            loop.append(cur)
            cur = nxt[cur]
        if len(loop) >= 3:
            out.extend(loop[i] for i in drop_collinear(mesh.vertices[loop], True, tol))
        else:
            out.extend(loop)
    return np.array(sorted(set(out)), dtype=np.int64) if out else np.unique(F[r])


def _plane_face(seg: Segmentation, rid: int) -> Face:
    r = seg.regions[rid]
    V = seg.mesh.vertices
    pts = V[np.unique(seg.mesh.faces[r])]
    nrm = seg.region_normal[rid]
    faceted = len(r) == 1 and len(seg.regions) > 1
    return Face("plane", [rid], r, normal=nrm, point=pts.mean(axis=0), faceted=faceted)


def _assign(seg: Segmentation) -> None:
    fot = -np.ones(len(seg.mesh.faces), dtype=np.int64)
    for i, f in enumerate(seg.faces):
        fot[f.tris] = i
    seg.face_of_tri = fot


def demote(seg: Segmentation, face_ids: set[int]) -> None:
    """Remplace des cylindres non représentables par leurs facettes planes."""
    keep = [f for i, f in enumerate(seg.faces) if i not in face_ids]
    for i in sorted(face_ids):
        for rid in seg.faces[i].regions:
            keep.append(_plane_face(seg, rid))
    seg.faces = keep
    _assign(seg)
