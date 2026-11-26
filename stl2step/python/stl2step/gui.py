"""Interface graphique (Tkinter + Matplotlib)."""
from __future__ import annotations

import os
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk

import numpy as np

from .convert import convert_mesh
from .edit import cut
from .mesh import read_stl, write_stl
from .sections import AXES, dxf_text, positions, sections

VIEWS = ["Ombré + arêtes", "Ombré", "Filaire", "Carte de conversion"]
LIGHT = np.array([0.4, -0.5, 0.75])
LIGHT /= np.linalg.norm(LIGHT)


def _face_colors(mesh, base=(0.55, 0.62, 0.72)):
    s = 0.35 + 0.65 * np.clip(mesh.face_normals @ LIGHT, 0, 1)
    return np.clip(np.outer(s, base), 0, 1)


def _map_colors(res):
    seg = res.seg
    rng = np.random.default_rng(7)
    cols = np.zeros((len(res.mesh.faces), 3))
    for f in seg.faces:
        if f.kind == "cylinder":
            c = np.array([0.95, 0.55, 0.15]) * rng.uniform(0.8, 1.0)
        elif f.faceted:
            c = np.array([0.6, 0.6, 0.6])
        else:
            c = np.array([0.25, 0.5, 0.9]) * rng.uniform(0.7, 1.0)
        cols[f.tris] = c
    s = 0.45 + 0.55 * np.clip(res.mesh.face_normals @ LIGHT, 0, 1)
    return np.clip(cols * s[:, None], 0, 1)


def _sharp_edges(mesh, angle=30.0):
    n = mesh.face_normals
    c = np.cos(np.radians(angle))
    segs = []
    for (a, b), lst in mesh.edge_map().items():
        if len(lst) != 2 or n[lst[0][0]] @ n[lst[1][0]] < c:
            segs.append(mesh.vertices[[a, b]])
    return np.array(segs) if segs else np.zeros((0, 2, 3))


def _brep_edges(res):
    V = res.mesh.vertices
    segs = []
    for e in res.brep.edges:
        p = V[e.pts]
        segs.extend(np.stack([p[:-1], p[1:]], axis=1))
    return np.array(segs) if segs else np.zeros((0, 2, 3))


class App:
    def __init__(self, root: tk.Tk):
        import matplotlib
        matplotlib.use("TkAgg")
        from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
        from matplotlib.figure import Figure

        self.root = root
        root.title("STL2STEP — STL vers CAO")
        root.geometry("1200x780")
        self.mesh = None
        self.res = None
        self.path = None
        self.view = tk.StringVar(value=VIEWS[0])

        bar = ttk.Frame(root, padding=4)
        bar.pack(side=tk.TOP, fill=tk.X)
        for txt, cmd in [("Ouvrir STL…", self.open), ("Convertir", self.convert),
                         ("Enregistrer STEP…", self.save_step), ("Sections DXF…", self.sections),
                         ("Couper…", self.cut), ("Enregistrer STL…", self.save_stl),
                         ("Mesurer", self.measure)]:
            ttk.Button(bar, text=txt, command=cmd).pack(side=tk.LEFT, padx=2)
        ttk.Label(bar, text="  Vue :").pack(side=tk.LEFT)
        cb = ttk.Combobox(bar, textvariable=self.view, values=VIEWS, state="readonly", width=22)
        cb.pack(side=tk.LEFT)
        cb.bind("<<ComboboxSelected>>", lambda e: self.draw())

        body = ttk.Frame(root)
        body.pack(fill=tk.BOTH, expand=True)
        self.info = tk.Text(body, width=38, wrap="word", font=("TkDefaultFont", 10))
        self.info.pack(side=tk.RIGHT, fill=tk.Y)
        self.fig = Figure(figsize=(8, 6))
        self.ax = self.fig.add_subplot(111, projection="3d")
        self.canvas = FigureCanvasTkAgg(self.fig, master=body)
        self.canvas.get_tk_widget().pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.status = tk.StringVar(value="Ouvrez un fichier STL (binaire ou texte).")
        ttk.Label(root, textvariable=self.status, anchor="w", padding=4).pack(side=tk.BOTTOM, fill=tk.X)
        self.say("STL2STEP\n\nConvertit un maillage STL en solide STEP fait de vraies faces "
                 "(plans, cylindres) qui s'ouvre dans Fusion 360, SolidWorks ou FreeCAD.\n\n"
                 "Les zones non reconnues restent en facettes planes. L'échelle est conservée, "
                 "l'unité du STEP est le millimètre.")

    # ---------------------------------------------------------------- helpers
    def say(self, text):
        self.info.delete("1.0", tk.END)
        self.info.insert(tk.END, text)

    def _need(self):
        if self.mesh is None:
            messagebox.showinfo("STL2STEP", "Ouvrez d'abord un fichier STL.")
            return False
        return True

    def set_mesh(self, mesh, label):
        self.mesh = mesh
        self.res = None
        i = mesh.info()
        self.say(f"{label}\n\n{i['triangles']} triangles\n"
                 f"Dimensions : {i['size'][0]:.3f} × {i['size'][1]:.3f} × {i['size'][2]:.3f} mm\n"
                 f"Surface : {i['area']:.2f} mm²\nVolume : {i['volume']:.2f} mm³\n"
                 f"Arêtes ouvertes : {i['open_edges']}")
        self.draw()

    def draw(self):
        from mpl_toolkits.mplot3d.art3d import Line3DCollection, Poly3DCollection
        ax = self.ax
        el, az = ax.elev, ax.azim
        ax.clear()
        ax.set_axis_off()
        if self.mesh is None:
            self.canvas.draw_idle()
            return
        m = self.mesh
        tri = m.triangles
        mode = self.view.get()
        if mode == "Filaire":
            e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
            ax.add_collection3d(Line3DCollection(e, colors="#333", linewidths=0.3))
        else:
            cols = _map_colors(self.res) if (mode == "Carte de conversion" and self.res) else _face_colors(m)
            pc = Poly3DCollection(tri, facecolors=cols, edgecolors="none")
            ax.add_collection3d(pc)
            if mode == "Carte de conversion":
                e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
                ax.add_collection3d(Line3DCollection(e, colors=(0, 0, 0, 0.15), linewidths=0.2))
            if mode in ("Ombré + arêtes", "Carte de conversion"):
                e = _brep_edges(self.res) if self.res else _sharp_edges(m)
                if len(e):
                    ax.add_collection3d(Line3DCollection(e, colors="#111", linewidths=0.9))
        lo, hi = m.bounds
        c, r = (lo + hi) / 2, (hi - lo).max() / 2
        ax.set_xlim(c[0] - r, c[0] + r)
        ax.set_ylim(c[1] - r, c[1] + r)
        ax.set_zlim(c[2] - r, c[2] + r)
        ax.set_box_aspect((1, 1, 1))
        ax.view_init(el, az)
        self.canvas.draw_idle()

    # ---------------------------------------------------------------- actions
    def open(self):
        p = filedialog.askopenfilename(filetypes=[("STL", "*.stl *.STL"), ("Tous", "*.*")])
        if not p:
            return
        try:
            m = read_stl(p)
        except Exception as e:
            messagebox.showerror("STL2STEP", str(e))
            return
        self.path = p
        self.set_mesh(m, os.path.basename(p))
        self.status.set(f"{os.path.basename(p)} chargé.")

    def convert(self):
        if not self._need():
            return
        self.status.set("Conversion en cours…")
        name = os.path.splitext(os.path.basename(self.path or "piece"))[0]

        def work():
            try:
                res = convert_mesh(self.mesh, name=name)
                self.root.after(0, lambda: self._converted(res))
            except Exception as e:
                msg = str(e)
                self.root.after(0, lambda: (messagebox.showerror("STL2STEP", msg),
                                            self.status.set("Échec de la conversion.")))
        threading.Thread(target=work, daemon=True).start()

    def _converted(self, res):
        self.res = res
        r = res.report()
        self.say(f"Conversion terminée\n\nFaces : {r['faces']}\n  plans : {r['planes']}\n"
                 f"  cylindres : {r['cylinders']}\n  facettes : {r['facets']}\n"
                 f"Arêtes : {r['edges']}\nSommets : {r['vertices']}\n"
                 f"Solide fermé : {'oui' if r['closed_solid'] else 'non (surface ouverte)'}\n"
                 f"Tolérance : {r['tolerance_mm']:.4f} mm\n"
                 f"Cylindres laissés en facettes : {r['cylinders_kept_faceted']}\n\n"
                 "Carte de conversion : bleu = plan, orange = cylindre, gris = facette.")
        self.view.set("Carte de conversion")
        self.draw()
        self.status.set("Conversion terminée : enregistrez le STEP.")

    def save_step(self):
        if not self._need():
            return
        if self.res is None:
            self.convert()
            messagebox.showinfo("STL2STEP", "Conversion lancée : enregistrez quand elle est terminée.")
            return
        base = os.path.splitext(os.path.basename(self.path or "piece"))[0]
        p = filedialog.asksaveasfilename(defaultextension=".step", initialfile=base + ".step",
                                         filetypes=[("STEP", "*.step *.stp")])
        if p:
            with open(p, "w", encoding="ascii", errors="replace") as f:
                f.write(self.res.step)
            self.status.set(f"STEP enregistré : {p}")

    def sections(self):
        if not self._need():
            return
        axis = simpledialog.askstring("Sections", "Axe normal aux sections (x, y ou z) :", initialvalue="z")
        if not axis or axis.lower() not in AXES:
            return
        n = simpledialog.askinteger("Sections", "Nombre de sections régulières :", initialvalue=5,
                                    minvalue=1, maxvalue=500)
        if not n:
            return
        secs = sections(self.mesh, axis.lower(), positions(self.mesh, axis.lower(), n))
        base = os.path.splitext(os.path.basename(self.path or "piece"))[0]
        p = filedialog.asksaveasfilename(defaultextension=".dxf", initialfile=f"{base}_sections_{axis}.dxf",
                                         filetypes=[("DXF", "*.dxf")])
        if p:
            with open(p, "w") as f:
                f.write(dxf_text(secs, axis.lower()))
            self.status.set(f"{sum(len(x) for _, x in secs)} contour(s) dans {p} (un calque par section)")

    def cut(self):
        if not self._need():
            return
        spec = simpledialog.askstring("Couper", "Plan de coupe (ex. z=10) :", initialvalue="z=%.3f" % (
            (self.mesh.bounds[0][2] + self.mesh.bounds[1][2]) / 2))
        if not spec or "=" not in spec:
            return
        ax, val = spec.split("=")
        if ax.strip().lower() not in AXES:
            return
        keep = "below" if messagebox.askyesno("Couper", "Garder la partie inférieure ?\n(Non = partie supérieure)") else "above"
        n = np.zeros(3)
        n[AXES[ax.strip().lower()]] = 1
        p = n * float(val)
        m = cut(self.mesh, p, n, keep)
        if len(m.faces) == 0:
            messagebox.showinfo("Couper", "Rien ne reste de ce côté du plan.")
            return
        self.set_mesh(m, f"Pièce coupée ({spec}, {'dessous' if keep == 'below' else 'dessus'})")
        self.status.set("Coupe appliquée : convertissez ou enregistrez le STL modifié.")

    def save_stl(self):
        if not self._need():
            return
        base = os.path.splitext(os.path.basename(self.path or "piece"))[0]
        p = filedialog.asksaveasfilename(defaultextension=".stl", initialfile=base + "_modifie.stl",
                                         filetypes=[("STL", "*.stl")])
        if p:
            write_stl(p, self.mesh)
            self.status.set(f"STL enregistré : {p}")

    def measure(self):
        if not self._need():
            return
        i = self.mesh.info()
        messagebox.showinfo("Mesures", f"X : {i['min'][0]:.3f} → {i['max'][0]:.3f}  ({i['size'][0]:.3f} mm)\n"
                                       f"Y : {i['min'][1]:.3f} → {i['max'][1]:.3f}  ({i['size'][1]:.3f} mm)\n"
                                       f"Z : {i['min'][2]:.3f} → {i['max'][2]:.3f}  ({i['size'][2]:.3f} mm)\n"
                                       f"Surface : {i['area']:.2f} mm²\nVolume : {i['volume']:.2f} mm³")


def run():
    root = tk.Tk()
    App(root)
    root.mainloop()
