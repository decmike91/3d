"""Valide des fichiers STEP avec OpenCascade (pip install cadquery-ocp).

    python tests/check_step.py fichier.step [...]
Code de sortie 1 si un fichier est illisible ou invalide.
"""
import sys

from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS


def check(path):
    r = STEPControl_Reader()
    if r.ReadFile(path) != IFSelect_RetDone:
        return False, "illisible"
    r.TransferRoots()
    s = r.OneShape()
    ok = BRepCheck_Analyzer(s).IsValid()
    g = GProp_GProps()
    BRepGProp.VolumeProperties_s(s, g)
    kinds = {}
    ex = TopExp_Explorer(s, TopAbs_FACE)
    while ex.More():
        k = str(BRepAdaptor_Surface(TopoDS.Face_s(ex.Current()) if hasattr(TopoDS, "Face_s")
                                    else TopoDS.Face(ex.Current())).GetType()).split(".")[-1]
        kinds[k] = kinds.get(k, 0) + 1
        ex.Next()
    return ok, f"volume {g.Mass():.3f} mm3, faces {kinds}"


if __name__ == "__main__":
    bad = 0
    for p in sys.argv[1:]:
        ok, msg = check(p)
        print(("OK    " if ok else "ECHEC ") + p + " : " + msg)
        bad += not ok
    sys.exit(1 if bad else 0)
