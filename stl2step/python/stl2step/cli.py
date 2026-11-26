"""Ligne de commande : stl2step <commande> ..."""
from __future__ import annotations

import argparse
import json
import os
import sys

from .convert import convert_file
from .edit import cut
from .mesh import read_stl, write_stl
from .sections import AXES, dxf_text, positions, sections


def _plane(spec: str):
    """« z=12.5 » -> (point, normale)."""
    ax, val = spec.split("=")
    ax = ax.strip().lower()
    if ax not in AXES:
        raise argparse.ArgumentTypeError("plan attendu sous la forme x=…, y=… ou z=…")
    n = [0.0, 0.0, 0.0]
    n[AXES[ax]] = 1.0
    p = [0.0, 0.0, 0.0]
    p[AXES[ax]] = float(val)
    return p, n


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="stl2step", description="STL -> STEP (faces planes et cylindriques), sections DXF, coupe.")
    sub = ap.add_subparsers(dest="cmd")

    c = sub.add_parser("convert", help="convertir un STL en STEP")
    c.add_argument("stl")
    c.add_argument("-o", "--output")
    c.add_argument("--tol", type=float, help="tolérance d'ajustement en mm (auto par défaut)")
    c.add_argument("--no-cylinders", action="store_true", help="plans seulement")
    c.add_argument("--no-limit", action="store_true", help="ignorer la limite de 120 000 triangles")

    i = sub.add_parser("info", help="dimensions, surface, volume")
    i.add_argument("stl")

    s = sub.add_parser("sections", help="sections DXF à tracer en CAO")
    s.add_argument("stl")
    s.add_argument("--axis", choices=list(AXES), default="z")
    g = s.add_mutually_exclusive_group()
    g.add_argument("--count", type=int, default=5, help="nombre de sections régulières")
    g.add_argument("--at", help="positions en mm, séparées par des virgules")
    s.add_argument("-o", "--output")
    s.add_argument("--split", action="store_true", help="un fichier DXF par section")
    s.add_argument("--3d", dest="three_d", action="store_true", help="coordonnées 3D réelles")

    k = sub.add_parser("cut", help="couper par un plan et enregistrer le STL")
    k.add_argument("stl")
    k.add_argument("--plane", required=True, help="ex. z=10")
    k.add_argument("--keep", choices=["below", "above"], default="below")
    k.add_argument("--no-cap", action="store_true")
    k.add_argument("-o", "--output")

    d = sub.add_parser("split", help="découper en 2 pièces assemblables par plots de jonction")
    d.add_argument("stl")
    d.add_argument("--plane", required=True, help="plan de coupe, ex. z=10")
    d.add_argument("--mode", choices=["male", "pins", "none"], default="male",
                   help="male : plots/trous ; pins : trous des deux côtés + goupilles ; none : sans plots")
    d.add_argument("--diameter", type=float, default=5.0, help="diamètre du plot ou de la goupille (mm)")
    d.add_argument("--length", type=float, help="hauteur du plot (défaut 6) ou longueur de goupille (défaut 10)")
    d.add_argument("--clearance", type=float, default=0.15, help="jeu radial du trou (mm)")
    d.add_argument("--extra-depth", type=float, default=0.5, help="profondeur de trou en plus (mm)")
    d.add_argument("--chamfer", type=float, default=0.5, help="chanfrein en bout de plot (mm)")
    d.add_argument("--wall", type=float, default=1.2, help="matière minimale autour et au fond des trous (mm)")
    d.add_argument("--per-zone", type=int, default=2, help="plots par zone de coupe")
    d.add_argument("--at", help="centres imposés « u,v;u,v » (u, v : les deux autres axes)")
    d.add_argument("-o", "--output", help="préfixe des fichiers (défaut : nom du STL)")

    sub.add_parser("gui", help="interface graphique (PyQt6 si installé, sinon Tkinter)")
    sub.add_parser("gui-tk", help="interface graphique simple (Tkinter + Matplotlib)")

    a = ap.parse_args(argv)
    if a.cmd is None or a.cmd == "gui":
        try:
            from .qt.app import main as qt_main
        except ImportError:
            print("PyQt6/pyqtgraph absents (pip install PyQt6 pyqtgraph PyOpenGL) : interface Tkinter.")
        else:
            return qt_main([])
    if a.cmd in (None, "gui", "gui-tk"):
        from .gui import run
        run()
        return 0
    base = os.path.splitext(a.stl)[0]
    if a.cmd == "convert":
        out = a.output or base + ".step"
        r = convert_file(a.stl, out, a.tol, not a.no_cylinders, not a.no_limit)
        print(json.dumps(r.report(), indent=2, ensure_ascii=False))
        print("->", out)
    elif a.cmd == "info":
        print(json.dumps(read_stl(a.stl).info(), indent=2))
    elif a.cmd == "sections":
        m = read_stl(a.stl)
        at = [float(x) for x in a.at.split(",")] if a.at else positions(m, a.axis, a.count)
        secs = sections(m, a.axis, at)
        if a.split:
            for h, polys in secs:
                path = f"{base}_{a.axis}{h:.3f}.dxf"
                with open(path, "w") as f:
                    f.write(dxf_text([(h, polys)], a.axis, not a.three_d))
                print("->", path, len(polys), "contour(s)")
        else:
            path = a.output or f"{base}_sections_{a.axis}.dxf"
            with open(path, "w") as f:
                f.write(dxf_text(secs, a.axis, not a.three_d))
            print("->", path, sum(len(p) for _, p in secs), "contour(s)")
    elif a.cmd == "split":
        from .split import PegSettings, split
        p, _ = _plane(a.plane)
        axis = AXES[a.plane.split("=")[0].strip().lower()]
        at = [tuple(float(x) for x in c.split(",")) for c in a.at.split(";") if c.strip()] if a.at else None
        st = PegSettings(mode=a.mode, diameter=a.diameter,
                         length=a.length if a.length else (10.0 if a.mode == "pins" else 6.0),
                         clearance=a.clearance, extra_depth=a.extra_depth, chamfer=a.chamfer, wall=a.wall,
                         per_island=a.per_zone, positions=at)
        r = split(read_stl(a.stl), axis, p[axis], st)
        prefix = a.output or base
        out = [(prefix + "_basse.stl", r.low), (prefix + "_haute.stl", r.high)]
        if r.pins is not None:
            out.append((prefix + "_goupilles.stl", r.pins))
        for path, m in out:
            write_stl(path, m)
            print("->", path, len(m.faces), "triangles")
        print(len(r.centers), "plot(s) :", "; ".join(f"{u:.2f},{v:.2f}" for u, v in r.centers))
        for w in r.warnings:
            print("Attention :", w)
    elif a.cmd == "cut":
        p, n = _plane(a.plane)
        m = cut(read_stl(a.stl), p, n, a.keep, not a.no_cap)
        out = a.output or base + "_coupe.stl"
        write_stl(out, m)
        print(json.dumps(m.info(), indent=2))
        print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
