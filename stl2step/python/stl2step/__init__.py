"""stl2step : maillage STL -> solide CAO STEP (plans, cylindres), sections DXF, coupe."""
from .mesh import Mesh, read_stl, write_stl, parse_stl, stl_bytes
from .convert import convert_file, convert_mesh, Result

__version__ = "1.0.0"
__all__ = ["Mesh", "read_stl", "write_stl", "parse_stl", "stl_bytes",
           "convert_file", "convert_mesh", "Result"]
