import os
import re

import numpy as np
import pytest

from stl2step import convert_mesh, parse_stl, read_stl, stl_bytes
from stl2step.edit import cut
from stl2step.sections import dxf_text, positions, sections, slice_mesh

S = os.path.join(os.path.dirname(__file__), "..", "..", "samples")


def load(n):
    return read_stl(os.path.join(S, n + ".stl"))


@pytest.mark.parametrize("name,planes,cyl", [
    ("box", 6, 0), ("plate_hole", 6, 1), ("plate_boss", 7, 2), ("fillet_vert", 6, 4)])
def test_recognition(name, planes, cyl):
    r = convert_mesh(load(name), name=name)
    s = r.report()
    assert s["planes"] == planes and s["cylinders"] == cyl and s["facets"] == 0
    assert s["closed_solid"]
    assert r.step.count("ADVANCED_FACE(") == planes + cyl
    assert r.step.count("CYLINDRICAL_SURFACE(") == cyl
    assert "SI_UNIT(.MILLI.,.METRE.)" in r.step


def test_fallback_facets_stays_closed():
    r = convert_mesh(load("fillet_all"))
    assert r.brep.closed and r.report()["facets"] > 0


def test_topology_euler():
    # Pour un solide fermé de genre g : V - E + F = 2 - 2g (+ boucles internes)
    r = convert_mesh(load("box"))
    assert (len(r.brep.points), len(r.brep.edges), len(r.brep.faces)) == (8, 12, 6)


def test_ascii_and_binary_roundtrip():
    m = load("box")
    txt = "solid t\n" + "".join(
        "facet normal 0 0 0\nouter loop\n" + "".join("vertex %r %r %r\n" % tuple(map(float, p)) for p in t)
        + "endloop\nendfacet\n" for t in m.triangles) + "endsolid t\n"
    a = parse_stl(txt.encode())
    b = parse_stl(stl_bytes(m))
    assert len(a.faces) == len(b.faces) == 12
    assert abs(a.volume - 48000) < 1e-6


def test_cut_closed_and_half_volume():
    m = load("box")
    c = cut(m, (30, 0, 0), (1, 0, 0), "below")
    i = c.info()
    assert i["open_edges"] == 0
    assert abs(i["volume"] - 24000) < 1e-6
    h = cut(load("plate_hole"), (0, 0, 10), (0, 0, 1), "above")
    assert h.open_edge_count() == 0
    assert abs(h.volume - load("plate_hole").volume / 2) < 1e-3
    assert convert_mesh(h).report()["cylinders"] == 1


def test_sections_dxf():
    m = load("plate_hole")
    polys = slice_mesh(m, "z", 10)
    assert len(polys) == 2
    assert sorted(len(p) for p in polys)[0] == 5         # rectangle fermé : 4 points + retour
    d = dxf_text(sections(m, "z", positions(m, "z", 3)), "z")
    assert d.count("POLYLINE") == 6 and d.strip().endswith("EOF")


def test_occ_validation(tmp_path):
    occ = pytest.importorskip("OCP")
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    from OCP.STEPControl import STEPControl_Reader
    for name in ("box", "plate_hole", "plate_boss", "fillet_vert", "fillet_all"):
        m = load(name)
        p = tmp_path / (name + ".step")
        p.write_text(convert_mesh(m).step)
        r = STEPControl_Reader()
        r.ReadFile(str(p))
        r.TransferRoots()
        s = r.OneShape()
        assert BRepCheck_Analyzer(s).IsValid(), name
        g = GProp_GProps()
        BRepGProp.VolumeProperties_s(s, g)
        assert abs(g.Mass() - m.volume) / m.volume < 0.01, name
