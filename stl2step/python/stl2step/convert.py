"""API de haut niveau : STL -> STEP."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from .brep import Brep, build_brep
from .mesh import MAX_TRIANGLES, Mesh, read_stl
from .segment import Segmentation, segment
from .step import step_text


@dataclass
class Result:
    mesh: Mesh
    seg: Segmentation
    brep: Brep
    step: str

    def report(self) -> dict:
        s = self.seg.summary()
        s.update({
            "tolerance_mm": self.seg.tol,
            "edges": len(self.brep.edges),
            "vertices": len(self.brep.points),
            "closed_solid": self.brep.closed,
            "cylinders_kept_faceted": self.brep.demoted,
        })
        return s


def safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", name)[:60] or "piece"


def convert_mesh(mesh: Mesh, tol: float | None = None, name: str = "piece",
                 cylinders: bool = True, limit: bool = True) -> Result:
    if len(mesh.faces) == 0:
        raise ValueError("Maillage vide")
    if limit and len(mesh.faces) > MAX_TRIANGLES:
        raise ValueError(f"{len(mesh.faces)} triangles : la limite est {MAX_TRIANGLES}")
    seg = segment(mesh, tol, cylinders=cylinders)
    brep = build_brep(seg)
    return Result(mesh, seg, brep, step_text(brep, safe_name(name)))


def convert_file(stl_path: str, step_path: str | None = None, tol: float | None = None,
                 cylinders: bool = True, limit: bool = True) -> Result:
    mesh = read_stl(stl_path)
    base = os.path.splitext(os.path.basename(stl_path))[0]
    res = convert_mesh(mesh, tol, base, cylinders, limit)
    if step_path is None:
        step_path = os.path.splitext(stl_path)[0] + ".step"
    with open(step_path, "w", encoding="ascii", errors="replace") as f:
        f.write(res.step)
    return res
