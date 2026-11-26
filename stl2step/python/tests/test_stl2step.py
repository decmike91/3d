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


# ------------------------------------------------------------ découpe + plots
from stl2step.split import PegSettings, pin_mesh, split  # noqa: E402


@pytest.mark.parametrize("mode", ["male", "pins", "none"])
def test_split_closed_parts(mode):
    m = load("box")
    r = split(m, 0, 30, PegSettings(mode=mode, length=10 if mode == "pins" else 6))
    assert r.low.open_edge_count() == 0 and r.high.open_edge_count() == 0
    assert r.low.volume > 0 and r.high.volume > 0
    if mode == "none":
        assert not r.centers and abs(r.low.volume - 24000) < 1e-6
    else:
        assert len(r.centers) == 2 and not r.warnings
    if mode == "male":
        # plots en plus d'un côté, trous (plus larges et plus profonds) de l'autre
        assert 24000 < r.low.volume < 24000 + 2 * np.pi * 2.5 ** 2 * 6
        assert r.high.volume < 24000 - 2 * np.pi * 2.5 ** 2 * 6
    if mode == "pins":
        assert r.pins is not None and r.pins.open_edge_count() == 0
        assert abs(r.low.volume - r.high.volume) < 1e-6


def test_split_respects_wall_thickness():
    # 7,5 mm de matière au-dessus : un plot de 6 mm + 0,5 + paroi 1,2 ne tient pas
    r = split(load("fillet_vert"), 2, 7.5, PegSettings(mode="male"))
    assert not r.centers and r.warnings
    r = split(load("fillet_vert"), 2, 7.5, PegSettings(mode="male", length=4))
    assert r.centers and r.high.open_edge_count() == 0


def test_split_two_zones_and_positions():
    r = split(load("plate_hole"), 0, 30, PegSettings(mode="male"))
    assert len(r.centers) == 4                         # le trou partage la section en 2 zones
    r = split(load("box"), 2, 10, PegSettings(mode="male", positions=[(15, 20), (45, 20)]))
    assert r.centers == [(15.0, 20.0), (45.0, 20.0)] and not r.warnings


def test_split_parts_convert_to_step():
    r = split(load("box"), 0, 30, PegSettings(mode="male"))
    assert convert_mesh(r.high).report()["cylinders"] == 2


def test_pin_mesh():
    p = pin_mesh(5, 10, 0.5)
    assert p.open_edge_count() == 0 and 0.9 * np.pi * 2.5 ** 2 * 10 < p.volume < np.pi * 2.5 ** 2 * 10


def test_qt_ui_loads_and_survives_edits(tmp_path):
    pytest.importorskip("PyQt6")
    pytest.importorskip("pyqtgraph")
    import os as _os
    _os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    from PyQt6 import QtWidgets
    from stl2step.qt import app as qtapp
    a = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])
    ui = _os.path.join(_os.path.dirname(qtapp.__file__), "main_window.ui")
    w = qtapp.MainWindow(ui, _os.path.join(_os.path.dirname(ui), "style.qss"))
    for name in ("actionOuvrir", "actionConvertir", "dockDecoupe", "btnApercuDecoupe", "spinDiametrePlot",
                 "dockCoupe", "dockSections", "dockMesure", "dockParametres", "textInfos", "viewerHost"):
        assert w.w(name) is not None, name
    st = w.peg_settings()
    assert st.mode == "male" and st.diameter == 5
    w.close()
    # Interface modifiée dans Qt Designer : panneaux et boutons supprimés -> pas d'erreur
    import re
    txt = open(ui, encoding="utf-8").read()
    for dock in ("dockDecoupe", "dockMesure", "dockSections"):
        txt = re.sub(r'<widget class="QDockWidget" name="%s">.*?</widget>\s*</widget>' % dock, "", txt, flags=re.S)
    p = tmp_path / "edited.ui"
    p.write_text(txt, encoding="utf-8")
    w2 = qtapp.MainWindow(str(p), "")
    assert w2.w("dockDecoupe") is None and w2.w("btnApercuDecoupe") is None
    st = w2.peg_settings()           # valeurs par défaut quand les champs n'existent plus
    assert st.diameter == 5 and st.per_island == 2
    w2.preview_split()               # sans pièce : ne fait rien
    w2.close()
