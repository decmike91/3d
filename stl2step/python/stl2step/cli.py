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

    sub.add_parser("gui", help="interface graphique")

    a = ap.parse_args(argv)
    if a.cmd is None or a.cmd == "gui":
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
