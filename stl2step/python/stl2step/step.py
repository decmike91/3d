"""Écriture STEP AP214 (solide B-rep, unité : millimètre)."""
from __future__ import annotations

import datetime as _dt

import numpy as np

from .brep import Brep


class _W:
    def __init__(self):
        self.lines: list[str] = []
        self._pt: dict = {}
        self._dir: dict = {}

    def add(self, s: str) -> int:
        self.lines.append(s)
        return len(self.lines)

    def point(self, p) -> int:
        key = tuple(round(float(x), 9) for x in p)
        if key not in self._pt:
            self._pt[key] = self.add("CARTESIAN_POINT('',(%s));" % ",".join(_f(x) for x in key))
        return self._pt[key]

    def direction(self, d) -> int:
        d = np.asarray(d, dtype=float)
        d = d / np.linalg.norm(d)
        key = tuple(round(float(x), 12) for x in d)
        if key not in self._dir:
            self._dir[key] = self.add("DIRECTION('',(%s));" % ",".join(_f(x) for x in key))
        return self._dir[key]

    def axis2(self, p, z, x) -> int:
        return self.add("AXIS2_PLACEMENT_3D('',#%d,#%d,#%d);" % (self.point(p), self.direction(z), self.direction(x)))


def _f(x: float) -> str:
    if x == 0:
        return "0."
    s = repr(float(x))
    if "e" in s or "E" in s:
        m, e = s.lower().split("e")
        if "." not in m:
            m += "."
        return m.upper() + "E" + e
    if "." not in s:
        s += "."
    return s


def _perp(a: np.ndarray) -> np.ndarray:
    t = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(a, t)
    return u / np.linalg.norm(u)


def step_text(brep: Brep, name: str = "piece") -> str:
    seg = brep.seg
    w = _W()
    P = brep.points
    vtx = [w.add("VERTEX_POINT('',#%d);" % w.point(p)) for p in P]

    edge_ids = []
    for e in brep.edges:
        a = P[e.v0]
        if e.kind == "line":
            b = P[e.v1]
            d = b - a
            L = float(np.linalg.norm(d))
            vec = w.add("VECTOR('',#%d,%s);" % (w.direction(d), _f(L)))
            curve = w.add("LINE('',#%d,#%d);" % (w.point(a), vec))
        else:
            ref = a - e.center
            ref = ref - (ref @ e.axis) * e.axis
            if np.linalg.norm(ref) < 1e-12:
                ref = _perp(e.axis)
            curve = w.add("CIRCLE('',#%d,%s);" % (w.axis2(e.center, e.axis, ref), _f(e.radius)))
        edge_ids.append(w.add("EDGE_CURVE('',#%d,#%d,#%d,.T.);" % (vtx[e.v0], vtx[e.v1], curve)))

    face_ids = []
    for bf in brep.faces:
        f = seg.faces[bf.face]
        if not bf.loops:
            continue
        if f.kind == "plane":
            n = f.normal
            surf = w.add("PLANE('',#%d);" % w.axis2(f.point, n, _perp(n)))
            sense = ".T."
        else:
            surf = w.add("CYLINDRICAL_SURFACE('',#%d,%s);" % (
                w.axis2(f.point, f.axis, _perp(f.axis)), _f(f.radius)))
            sense = ".T." if f.outward else ".F."
        bounds = []
        for li, loop in enumerate(bf.loops):
            oes = [w.add("ORIENTED_EDGE('',*,*,#%d,%s);" % (edge_ids[e], ".T." if s else ".F."))
                   for e, s in loop]
            lp = w.add("EDGE_LOOP('',(%s));" % ",".join("#%d" % x for x in oes))
            kind = "FACE_OUTER_BOUND" if (f.kind == "plane" and li == bf.outer) else "FACE_BOUND"
            bounds.append(w.add("%s('',#%d,.T.);" % (kind, lp)))
        face_ids.append(w.add("ADVANCED_FACE('',(%s),#%d,%s);" % (
            ",".join("#%d" % x for x in bounds), surf, sense)))

    flist = ",".join("#%d" % x for x in face_ids)
    origin = w.axis2((0, 0, 0), (0, 0, 1), (1, 0, 0))
    # Contexte géométrique et unités (mm)
    lu = w.add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));")
    au = w.add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));")
    su = w.add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());")
    unc = w.add("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(%s),#%d,'distance_accuracy_value','');"
                % (_f(max(seg.tol, 1e-7)), lu))
    ctx = w.add("(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#%d))"
                "GLOBAL_UNIT_ASSIGNED_CONTEXT((#%d,#%d,#%d))REPRESENTATION_CONTEXT('',''));"
                % (unc, lu, au, su))
    if brep.closed:
        shell = w.add("CLOSED_SHELL('',(%s));" % flist)
        body = w.add("MANIFOLD_SOLID_BREP('%s',#%d);" % (name, shell))
        rep = w.add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(#%d,#%d),#%d);" % (body, origin, ctx))
    else:
        shell = w.add("OPEN_SHELL('',(%s));" % flist)
        body = w.add("SHELL_BASED_SURFACE_MODEL('%s',(#%d));" % (name, shell))
        rep = w.add("MANIFOLD_SURFACE_SHAPE_REPRESENTATION('',(#%d,#%d),#%d);" % (body, origin, ctx))

    app = w.add("APPLICATION_CONTEXT('core data for automotive mechanical design processes');")
    w.add("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#%d);" % app)
    pc = w.add("PRODUCT_CONTEXT('',#%d,'mechanical');" % app)
    prod = w.add("PRODUCT('%s','%s','',(#%d));" % (name, name, pc))
    w.add("PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#%d));" % prod)
    pdf = w.add("PRODUCT_DEFINITION_FORMATION('','',#%d);" % prod)
    pdc = w.add("PRODUCT_DEFINITION_CONTEXT('part definition',#%d,'design');" % app)
    pd = w.add("PRODUCT_DEFINITION('design','',#%d,#%d);" % (pdf, pdc))
    pds = w.add("PRODUCT_DEFINITION_SHAPE('','',#%d);" % pd)
    w.add("SHAPE_DEFINITION_REPRESENTATION(#%d,#%d);" % (pds, rep))

    now = _dt.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    head = [
        "ISO-10303-21;",
        "HEADER;",
        "FILE_DESCRIPTION(('STL converti en solide CAO'),'2;1');",
        "FILE_NAME('%s.step','%s',(''),(''),'stl2step','stl2step','');" % (name, now),
        "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
        "ENDSEC;",
        "DATA;",
    ]
    body_lines = ["#%d=%s" % (i + 1, s) for i, s in enumerate(w.lines)]
    return "\n".join(head + body_lines + ["ENDSEC;", "END-ISO-10303-21;", ""])
