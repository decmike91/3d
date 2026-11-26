"""Interface PyQt6 de STL2STEP.

La mise en page est dans main_window.ui (Qt Designer) et l'apparence dans style.qss :
les deux se modifient sans toucher au code. Ordre de recherche :
  1. --ui / --style en ligne de commande ;
  2. dossier de configuration de l'utilisateur (menu Aide › Personnaliser l'interface) ;
  3. fichiers fournis avec le paquet.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import traceback

import numpy as np
from PyQt6 import QtCore, QtGui, QtWidgets, uic

from ..convert import convert_mesh
from ..edit import cut
from ..mesh import MAX_TRIANGLES, read_stl, write_stl
from ..mesh import Mesh
from ..sections import dxf_text, positions, sections
from ..split import PegSettings, exploded, split
from .viewer import COLORS, MAP, MODE_NAMES, SHADED_EDGES, Viewer

HERE = os.path.dirname(os.path.abspath(__file__))
AXES = "xyz"


def config_dir() -> str:
    loc = QtCore.QStandardPaths.writableLocation(QtCore.QStandardPaths.StandardLocation.AppConfigLocation)
    return os.path.join(loc or os.path.expanduser("~/.config"), "stl2step")


def find_file(name: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    user = os.path.join(config_dir(), name)
    return user if os.path.exists(user) else os.path.join(HERE, name)


# --------------------------------------------------------------- tâches de fond
class _Signals(QtCore.QObject):
    done = QtCore.pyqtSignal(object)
    failed = QtCore.pyqtSignal(str)


class Job(QtCore.QRunnable):
    def __init__(self, fn):
        super().__init__()
        self.fn = fn
        self.signals = _Signals()

    def run(self):
        try:
            r = self.fn()
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self.signals.failed.emit(str(e) or e.__class__.__name__)
        else:
            self.signals.done.emit(r)


# ------------------------------------------------------------------- fenêtre
class MainWindow(QtWidgets.QMainWindow):
    def __init__(self, ui_path: str, style_path: str):
        super().__init__()
        self.ui_path, self.style_path = ui_path, style_path
        uic.loadUi(ui_path, self)
        self.settings = QtCore.QSettings("stl2step", "STL2STEP")
        self.pool = QtCore.QThreadPool.globalInstance()
        self._jobs: set = set()
        self.path = None
        self.base = "piece"
        self.original = self.mesh = self.res = None
        self.picks: list = []
        self.split_res = None

        host = self.w("viewerHost") or self.centralWidget()
        self.viewer = Viewer(host)
        if host.layout() is None:
            QtWidgets.QVBoxLayout(host).setContentsMargins(0, 0, 0, 0)
        host.layout().addWidget(self.viewer)
        self.viewer.picked.connect(self.on_pick)

        self._wire()
        self.setAcceptDrops(True)
        self.load_style()
        self.restore_settings()
        self.update_state()
        self.info_html("<h3>STL2STEP</h3><p>Ouvrez ou glissez un fichier <b>STL</b> (binaire ou texte) dans la fenêtre.</p>"
                       "<p>Souris : bouton gauche = tourner, milieu ou Ctrl+gauche = déplacer, molette = zoom.</p>")

    # ---------------------------------------------------------------- outils
    def w(self, name):
        """Élément de l'interface par son nom, ou None s'il a été retiré du .ui."""
        return getattr(self, name, None)

    def on(self, name, signal, slot):
        obj = self.w(name)
        if obj is not None:
            getattr(obj, signal).connect(slot)

    def val(self, name, default):
        """Valeur d'un champ (case, nombre, liste) ; défaut si l'élément n'existe pas."""
        o = self.w(name)
        if o is None:
            return default
        if isinstance(o, QtWidgets.QAbstractButton):
            return o.isChecked()
        if isinstance(o, (QtWidgets.QSpinBox, QtWidgets.QDoubleSpinBox, QtWidgets.QSlider)):
            return o.value()
        if isinstance(o, QtWidgets.QComboBox):
            return o.currentIndex()
        if isinstance(o, QtWidgets.QLineEdit):
            return o.text()
        return default

    def status(self, text, ms=0):
        sb = self.statusBar()
        if sb:
            sb.showMessage(text, ms)

    def info_html(self, html):
        t = self.w("textInfos")
        if t is not None:
            t.setHtml(html)

    def run(self, msg, fn, done):
        self.status(msg)
        QtWidgets.QApplication.setOverrideCursor(QtCore.Qt.CursorShape.WaitCursor)
        self.setEnabled(False)
        job = Job(fn)
        self._jobs.add(job)

        def finish():
            self._jobs.discard(job)
            QtWidgets.QApplication.restoreOverrideCursor()
            self.setEnabled(True)

        def ok(r):
            finish()
            done(r)
            self.update_state()

        def ko(err):
            finish()
            self.status("Erreur : " + err)
            QtWidgets.QMessageBox.critical(self, "STL2STEP", err)

        job.signals.done.connect(ok)
        job.signals.failed.connect(ko)
        self.pool.start(job)

    # -------------------------------------------------------------- liaisons
    def _wire(self):
        a = self.on
        a("actionOuvrir", "triggered", self.open_dialog)
        a("actionEnregistrerStep", "triggered", self.save_step)
        a("actionEnregistrerStl", "triggered", self.save_stl)
        a("actionExporterDxf", "triggered", self.export_sections)
        a("actionQuitter", "triggered", self.close)
        a("actionConvertir", "triggered", lambda: self.convert())
        a("actionCouper", "triggered", self.do_cut)
        a("actionAnnulerModifs", "triggered", self.restore_original)
        a("actionDecouper", "triggered", self.show_split_panel)
        a("actionMesurer", "toggled", self.set_measuring)
        a("actionAide", "triggered", self.help)
        a("actionAPropos", "triggered", self.about)
        a("actionRechargerInterface", "triggered", self.load_style)
        a("actionAjuster", "triggered", lambda: self.viewer.fit())
        a("actionVueIso", "triggered", lambda: self.viewer.view(28, -55))
        a("actionVueDessus", "triggered", lambda: self.viewer.view(90, -90))
        a("actionVueFace", "triggered", lambda: self.viewer.view(0, -90))
        a("actionVueDroite", "triggered", lambda: self.viewer.view(0, 0))
        group = QtGui.QActionGroup(self)
        group.setExclusive(True)
        for i, name in enumerate(["actionVueOmbreAretes", "actionVueOmbre", "actionVueFilaire", "actionVueCarte"]):
            act = self.w(name)
            if act is not None:
                act.setCheckable(True)
                group.addAction(act)
                act.triggered.connect(lambda _=False, m=i: self.set_mode(m))
        a("btnConvertir", "clicked", lambda: self.convert())
        a("btnEnregistrerStep", "clicked", self.save_step)
        a("btnCouper", "clicked", self.do_cut)
        a("btnAnnulerModifs", "clicked", self.restore_original)
        a("btnSections", "clicked", self.export_sections)
        a("btnMesurer", "clicked", lambda: self.set_measuring(True))
        a("btnEffacerMesure", "clicked", self.clear_measure)
        a("checkTolAuto", "toggled", lambda on: self.w("spinTolerance") and self.w("spinTolerance").setEnabled(not on))
        # Coupe : curseur <-> position, aperçu du plan
        a("sliderCoupe", "valueChanged", self._slider_to_pos)
        a("spinPosCoupe", "valueChanged", self._pos_changed)
        a("comboAxeCoupe", "currentIndexChanged", lambda _: self._slider_to_pos(self.val("sliderCoupe", 500)))
        a("checkApercuCoupe", "toggled", lambda _: self.preview_cut())
        dock = self.w("dockCoupe")
        if dock is not None:
            dock.visibilityChanged.connect(lambda _: self.preview_cut())
        # Découpe en 2 pièces avec plots
        a("sliderDecoupe", "valueChanged", self._split_slider)
        a("spinPosDecoupe", "valueChanged", self._split_pos_changed)
        a("comboAxeDecoupe", "currentIndexChanged", lambda _: self._split_slider(self.val("sliderDecoupe", 500)))
        a("comboModePlots", "currentIndexChanged", self._split_mode_changed)
        a("btnApercuDecoupe", "clicked", self.preview_split)
        a("btnEnregistrerDecoupe", "clicked", self.save_split)
        a("btnGarderBasse", "clicked", lambda: self.keep_split_part("low"))
        a("btnGarderHaute", "clicked", lambda: self.keep_split_part("high"))
        dock = self.w("dockDecoupe")
        if dock is not None:
            dock.visibilityChanged.connect(lambda _: self._split_plane())
        # Sections : aperçu
        for n, s in [("comboAxeSections", "currentIndexChanged"), ("spinNbSections", "valueChanged"),
                     ("editPositions", "textChanged"), ("checkApercuSections", "toggled")]:
            a(n, s, lambda *_: self.preview_sections())
        dock = self.w("dockSections")
        if dock is not None:
            dock.visibilityChanged.connect(lambda _: self.preview_sections())
        # Menu des panneaux (affichés / masqués) et personnalisation
        mv = self.w("menuAffichage")
        if mv is not None:
            sub = mv.addMenu("Panneaux")
            for d in self.findChildren(QtWidgets.QDockWidget):
                sub.addAction(d.toggleViewAction())
            for t in self.findChildren(QtWidgets.QToolBar):
                sub.addAction(t.toggleViewAction())
        mh = self.w("menuAide")
        if mh is not None:
            act = mh.addAction("Personnaliser l'interface…")
            act.triggered.connect(self.customize)

    # --------------------------------------------------------------- réglages
    def restore_settings(self):
        s = self.settings
        if s.value("geometry"):
            self.restoreGeometry(s.value("geometry"))
        if s.value("state"):
            self.restoreState(s.value("state"))
        else:   # première ouverture : panneaux de gauche empilés en onglets
            docks = [self.w(n) for n in ("dockCoupe", "dockDecoupe", "dockSections", "dockMesure")]
            docks = [d for d in docks if d is not None]
            for d in docks[1:]:
                self.tabifyDockWidget(docks[0], d)
            if docks:
                docks[0].raise_()
        # onglets de panneaux : aperçus à jour quand on change d'onglet
        for bar in self.findChildren(QtWidgets.QTabBar):
            bar.currentChanged.connect(lambda _: (self.preview_cut(), self._split_plane(), self.preview_sections()))
        for name in ("checkTolAuto", "checkCylindres", "checkLimite", "checkBoucher", "checkApercuCoupe",
                     "checkUnFichierParSection", "checkCoord3D", "checkApercuSections"):
            o, v = self.w(name), s.value("p/" + name)
            if o is not None and v is not None:
                o.setChecked(v in (True, "true", "1"))
        for name in ("spinTolerance", "spinAnglePlan", "spinAngleLisse", "spinNbSections", "spinDiametrePlot",
                     "spinLongueurPlot", "spinJeuPlot", "spinProfondeurPlot", "spinChanfreinPlot", "spinParoiPlot",
                     "spinNbPlots"):
            o, v = self.w(name), s.value("p/" + name)
            if o is not None and v is not None:
                o.setValue(type(o.value())(float(v)))
        o = self.w("spinTolerance")
        if o is not None:
            o.setEnabled(not self.val("checkTolAuto", True))

    def closeEvent(self, ev):
        s = self.settings
        s.setValue("geometry", self.saveGeometry())
        s.setValue("state", self.saveState())
        for name in ("checkTolAuto", "checkCylindres", "checkLimite", "checkBoucher", "checkApercuCoupe",
                     "checkUnFichierParSection", "checkCoord3D", "checkApercuSections",
                     "spinTolerance", "spinAnglePlan", "spinAngleLisse", "spinNbSections", "spinDiametrePlot",
                     "spinLongueurPlot", "spinJeuPlot", "spinProfondeurPlot", "spinChanfreinPlot", "spinParoiPlot",
                     "spinNbPlots"):
            if self.w(name) is not None:
                s.setValue("p/" + name, self.val(name, None))
        super().closeEvent(ev)

    def load_style(self):
        try:
            with open(self.style_path, encoding="utf-8") as f:
                self.setStyleSheet(f.read())
            self.status(f"Style chargé : {self.style_path}", 4000)
        except OSError:
            self.setStyleSheet("")

    def customize(self):
        d = config_dir()
        os.makedirs(d, exist_ok=True)
        for n in ("main_window.ui", "style.qss"):
            dst = os.path.join(d, n)
            if not os.path.exists(dst):
                shutil.copy(os.path.join(HERE, n), dst)
        QtWidgets.QMessageBox.information(
            self, "Personnaliser l'interface",
            f"Copies modifiables :\n\n{d}\n\n• main_window.ui : ouvrez-le dans Qt Designer (boutons, panneaux, "
            "textes, raccourcis), puis relancez STL2STEP.\n• style.qss : couleurs et polices (feuille de style Qt), "
            "appliquée par Affichage › Recharger le style (Ctrl+R).\n\nSupprimez ces fichiers pour revenir à "
            "l'interface d'origine.")
        self.style_path = os.path.join(d, "style.qss")
        QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(d))

    def update_state(self):
        has = self.mesh is not None
        for n in ("actionEnregistrerStep", "actionEnregistrerStl", "actionExporterDxf", "actionConvertir",
                  "actionCouper", "actionMesurer", "actionDecouper", "btnConvertir", "btnEnregistrerStep",
                  "btnCouper", "btnSections", "btnMesurer", "btnApercuDecoupe"):
            o = self.w(n)
            if o is not None:
                o.setEnabled(has)
        modified = has and self.mesh is not self.original
        for n in ("actionAnnulerModifs", "btnAnnulerModifs"):
            o = self.w(n)
            if o is not None:
                o.setEnabled(modified)
        act = self.w("actionVueCarte")
        if act is not None:
            act.setEnabled(self.res is not None)
        for n in ("btnEnregistrerDecoupe", "btnGarderBasse", "btnGarderHaute"):
            o = self.w(n)
            if o is not None:
                o.setEnabled(self.split_res is not None)
        title = "STL2STEP — STL vers CAO"
        if has:
            title = f"{self.base}{' (modifié)' if modified else ''} — {title}"
        self.setWindowTitle(title)

    # ---------------------------------------------------------------- fichiers
    def dragEnterEvent(self, ev):
        if ev.mimeData().hasUrls():
            ev.acceptProposedAction()

    def dropEvent(self, ev):
        for u in ev.mimeData().urls():
            if u.isLocalFile():
                self.load(u.toLocalFile())
                break

    def open_dialog(self):
        p, _ = QtWidgets.QFileDialog.getOpenFileName(self, "Ouvrir un STL", self.settings.value("dir", ""),
                                                     "STL (*.stl *.STL);;Tous les fichiers (*)")
        if p:
            self.load(p)

    def load(self, path):
        self.settings.setValue("dir", os.path.dirname(path))
        self.run(f"Lecture de {os.path.basename(path)}…", lambda: read_stl(path), lambda m: self._loaded(path, m))

    def _loaded(self, path, m):
        self.path = path
        self.base = os.path.splitext(os.path.basename(path))[0] or "piece"
        self.original = self.mesh = m
        self.res = None
        self.split_res = None
        self.clear_measure()
        self.viewer.set_mesh(m, None, fit=True)
        self.set_mode(SHADED_EDGES)
        self._setup_cut_range()
        self._split_slider(self.val("sliderDecoupe", 500))
        self.show_mesh_info()
        self.preview_cut()
        self.preview_sections()
        n = len(m.faces)
        self.status(f"{os.path.basename(path)} : {n} triangles" +
                    (f" — plus de {MAX_TRIANGLES}, décochez la limite pour convertir." if n > MAX_TRIANGLES else ""))

    def _save_name(self, title, suffix, filt):
        start = os.path.join(self.settings.value("dir", ""), self.base + suffix)
        p, _ = QtWidgets.QFileDialog.getSaveFileName(self, title, start, filt)
        if p:
            self.settings.setValue("dir", os.path.dirname(p))
        return p

    def save_step(self):
        if self.mesh is None:
            return
        if self.res is None:
            self.convert(then_save=True)
            return
        p = self._save_name("Enregistrer le STEP", ".step", "STEP (*.step *.stp)")
        if p:
            with open(p, "w", encoding="ascii", errors="replace") as f:
                f.write(self.res.step)
            self.status(f"STEP enregistré : {p}")

    def save_stl(self):
        if self.mesh is None:
            return
        suffix = "_modifie.stl" if self.mesh is not self.original else ".stl"
        p = self._save_name("Enregistrer le STL", suffix, "STL (*.stl)")
        if p:
            write_stl(p, self.mesh)
            self.status(f"STL enregistré : {p}")

    # -------------------------------------------------------------- conversion
    def convert(self, then_save=False):
        if self.mesh is None:
            return
        m, name = self.mesh, self.base
        tol = None if self.val("checkTolAuto", True) else float(self.val("spinTolerance", 0.01))
        kw = dict(tol=tol, name=name, cylinders=self.val("checkCylindres", True), limit=self.val("checkLimite", True),
                  plane_angle=float(self.val("spinAnglePlan", 0.3)), smooth_angle=float(self.val("spinAngleLisse", 45)))

        def done(res):
            self.res = res
            self.viewer.set_mesh(self.mesh, res)
            self.set_mode(MAP)
            r = res.report()
            o = self.w("spinTolerance")
            if o is not None and self.val("checkTolAuto", True):
                o.setValue(r["tolerance_mm"])
            self.info_html(
                "<h3>Conversion terminée</h3><table>"
                f"<tr><td>Faces</td><td><b>{r['faces']}</b></td></tr>"
                f"<tr><td>&nbsp;&nbsp;plans</td><td>{r['planes']}</td></tr>"
                f"<tr><td>&nbsp;&nbsp;cylindres</td><td>{r['cylinders']}</td></tr>"
                f"<tr><td>&nbsp;&nbsp;facettes</td><td>{r['facets']}</td></tr>"
                f"<tr><td>Arêtes</td><td>{r['edges']}</td></tr><tr><td>Sommets</td><td>{r['vertices']}</td></tr>"
                f"<tr><td>Solide fermé</td><td>{'oui' if r['closed_solid'] else 'non (surface ouverte)'}</td></tr>"
                f"<tr><td>Tolérance</td><td>{r['tolerance_mm']:.4f} mm</td></tr>"
                f"<tr><td>Cylindres laissés en facettes</td><td>{r['cylinders_kept_faceted']}</td></tr></table>"
                "<p><span style='color:#4a80ea'>■</span> plan &nbsp; <span style='color:#f58f29'>■</span> cylindre "
                "&nbsp; <span style='color:#9e9e9e'>■</span> facette</p>" + self._mesh_table())
            self.status("Conversion terminée : enregistrez le STEP (Ctrl+S).")
            if then_save:
                self.save_step()

        self.run("Conversion en cours…", lambda: convert_mesh(m, **kw), done)

    # ----------------------------------------------------------------- affichage
    def set_mode(self, mode):
        if mode == MAP and self.res is None:
            mode = SHADED_EDGES
        self.viewer.set_mode(mode)
        name = ["actionVueOmbreAretes", "actionVueOmbre", "actionVueFilaire", "actionVueCarte"][mode]
        act = self.w(name)
        if act is not None:
            act.setChecked(True)
        self.status(f"Vue : {MODE_NAMES[mode]}", 3000)

    def _mesh_table(self):
        i = self.mesh.info()
        s = i["size"]
        return ("<h4>Pièce</h4><table>"
                f"<tr><td>Triangles</td><td>{i['triangles']}</td></tr>"
                f"<tr><td>Dimensions</td><td>{s[0]:.3f} × {s[1]:.3f} × {s[2]:.3f} mm</td></tr>"
                f"<tr><td>X</td><td>{i['min'][0]:.3f} → {i['max'][0]:.3f}</td></tr>"
                f"<tr><td>Y</td><td>{i['min'][1]:.3f} → {i['max'][1]:.3f}</td></tr>"
                f"<tr><td>Z</td><td>{i['min'][2]:.3f} → {i['max'][2]:.3f}</td></tr>"
                f"<tr><td>Surface</td><td>{i['area']:.2f} mm²</td></tr>"
                f"<tr><td>Volume</td><td>{i['volume']:.2f} mm³</td></tr>"
                f"<tr><td>Arêtes ouvertes</td><td>{i['open_edges']}</td></tr></table>")

    def show_mesh_info(self):
        modified = " (modifiée)" if self.mesh is not self.original else ""
        self.info_html(f"<h3>{self.base}{modified}</h3>" + self._mesh_table())

    # ------------------------------------------------------------------- mesure
    def set_measuring(self, on):
        self.viewer.measuring = bool(on)
        act = self.w("actionMesurer")
        if act is not None and act.isChecked() != bool(on):
            act.setChecked(bool(on))
        lab = self.w("labelMesure")
        if lab is not None:
            lab.setText("Cliquez deux points de la pièce." if on else "—")
        if on:
            d = self.w("dockMesure")
            if d is not None:
                d.show()
                d.raise_()
        self.picks = []
        self.viewer.show_markers([])

    def clear_measure(self):
        self.picks = []
        self.viewer.show_markers([])
        lab = self.w("labelMesure")
        if lab is not None:
            lab.setText("Cliquez deux points de la pièce." if self.viewer.measuring else "—")

    def on_pick(self, p):
        if len(self.picks) >= 2:
            self.picks = []
        self.picks.append(np.asarray(p))
        self.viewer.show_markers(self.picks)
        lab = self.w("labelMesure")
        if len(self.picks) == 1:
            txt = f"P1 ({p[0]:.3f} ; {p[1]:.3f} ; {p[2]:.3f})\nCliquez un deuxième point."
        else:
            a, b = self.picks
            d = np.abs(b - a)
            txt = (f"Distance : {np.linalg.norm(b - a):.3f} mm\nΔX {d[0]:.3f}   ΔY {d[1]:.3f}   ΔZ {d[2]:.3f}\n"
                   f"P1 ({a[0]:.3f} ; {a[1]:.3f} ; {a[2]:.3f})\nP2 ({b[0]:.3f} ; {b[1]:.3f} ; {b[2]:.3f})")
        if lab is not None:
            lab.setText(txt)
        self.status(txt.replace("\n", "   "))

    # -------------------------------------------------------------------- coupe
    def _axis_range(self, ax):
        lo, hi = self.mesh.bounds
        return float(lo[ax]), float(hi[ax])

    def _setup_cut_range(self):
        sp = self.w("spinPosCoupe")
        if sp is not None and self.mesh is not None:
            lo, hi = self.mesh.bounds
            sp.blockSignals(True)
            sp.setRange(float(lo.min()) - 1e3, float(hi.max()) + 1e3)
            sp.blockSignals(False)
        self._slider_to_pos(self.val("sliderCoupe", 500))

    def _slider_to_pos(self, v):
        if self.mesh is None:
            return
        lo, hi = self._axis_range(self.val("comboAxeCoupe", 2))
        h = lo + (hi - lo) * v / 1000.0
        sp = self.w("spinPosCoupe")
        if sp is not None:
            sp.blockSignals(True)
            sp.setValue(h)
            sp.blockSignals(False)
        self.preview_cut()

    def _pos_changed(self, h):
        if self.mesh is None:
            return
        lo, hi = self._axis_range(self.val("comboAxeCoupe", 2))
        sl = self.w("sliderCoupe")
        if sl is not None and hi > lo:
            sl.blockSignals(True)
            sl.setValue(int(round(1000 * (h - lo) / (hi - lo))))
            sl.blockSignals(False)
        self.preview_cut()

    def _cut_pos(self):
        ax = self.val("comboAxeCoupe", 2)
        if self.w("spinPosCoupe") is not None:
            return ax, float(self.val("spinPosCoupe", 0))
        lo, hi = self._axis_range(ax)
        return ax, lo + (hi - lo) * self.val("sliderCoupe", 500) / 1000.0

    def preview_cut(self):
        dock = self.w("dockCoupe")
        visible = dock is None or dock.isVisible()
        if self.mesh is None or not visible or not self.val("checkApercuCoupe", True):
            self.viewer.show_cut_plane(None)
            return
        self.viewer.show_cut_plane(*self._cut_pos())

    def do_cut(self):
        if self.mesh is None:
            return
        ax, h = self._cut_pos()
        keep = "above" if self.val("comboGarder", 0) == 1 else "below"
        capf = self.val("checkBoucher", True)
        n = np.zeros(3)
        n[ax] = 1
        m = self.mesh

        def done(c):
            if len(c.faces) == 0:
                QtWidgets.QMessageBox.information(self, "Couper", "Rien ne reste de ce côté du plan.")
                return
            self.mesh = c
            self.res = None
            self.split_res = None
            self.clear_measure()
            self.viewer.set_mesh(c, None)
            self.set_mode(SHADED_EDGES)
            self.show_mesh_info()
            self.preview_cut()
            self.preview_sections()
            self.status("Coupe appliquée : convertissez, ou enregistrez le STL modifié.")

        self.run("Coupe…", lambda: cut(m, n * h, n, keep, capf), done)

    def restore_original(self):
        if self.original is None or self.mesh is self.original:
            return
        self.mesh = self.original
        self.res = None
        self.split_res = None
        self.clear_measure()
        self.viewer.set_mesh(self.mesh, None)
        self.set_mode(SHADED_EDGES)
        self.show_mesh_info()
        self.preview_sections()
        self.update_state()
        self.status("Retour à la pièce d'origine.")

    # ------------------------------------------------- découpe en 2 pièces (plots)
    def show_split_panel(self):
        d = self.w("dockDecoupe")
        if d is not None:
            d.show()
            d.raise_()
        self._split_plane()

    def _split_slider(self, v):
        if self.mesh is None:
            return
        lo, hi = self._axis_range(self.val("comboAxeDecoupe", 2))
        sp = self.w("spinPosDecoupe")
        if sp is not None:
            sp.blockSignals(True)
            sp.setRange(lo - 1e3, hi + 1e3)
            sp.setValue(lo + (hi - lo) * v / 1000.0)
            sp.blockSignals(False)
        self._split_changed()

    def _split_pos_changed(self, h):
        if self.mesh is None:
            return
        lo, hi = self._axis_range(self.val("comboAxeDecoupe", 2))
        sl = self.w("sliderDecoupe")
        if sl is not None and hi > lo:
            sl.blockSignals(True)
            sl.setValue(int(round(1000 * (h - lo) / (hi - lo))))
            sl.blockSignals(False)
        self._split_changed()

    def _split_mode_changed(self, i):
        sp = self.w("spinLongueurPlot")      # goupille : longueur totale, plus longue qu'un plot
        if sp is not None:
            if i == 1 and sp.value() < 8:
                sp.setValue(10)
            elif i == 0 and sp.value() == 10:
                sp.setValue(6)
        self._split_changed()

    def _split_changed(self):
        if self.split_res is not None:        # réglage modifié : l'aperçu n'est plus à jour
            self.split_res = None
            self.viewer.set_mesh(self.mesh, self.res)
            self.update_state()
            self.preview_sections()
        self._split_plane()

    def _split_pos(self):
        ax = self.val("comboAxeDecoupe", 2)
        if self.w("spinPosDecoupe") is not None:
            return ax, float(self.val("spinPosDecoupe", 0))
        lo, hi = self._axis_range(ax)
        return ax, lo + (hi - lo) * self.val("sliderDecoupe", 500) / 1000.0

    def _split_plane(self):
        d = self.w("dockDecoupe")
        if self.mesh is None or d is None or not d.isVisible() or self.split_res is not None:
            self.preview_cut()
            return
        self.viewer.show_cut_plane(*self._split_pos())

    def peg_settings(self) -> PegSettings:
        mode = ["male", "pins", "none"][self.val("comboModePlots", 0)]
        pos = None
        txt = str(self.val("editPositionsPlots", "")).strip()
        if txt:
            pos = []
            for part in txt.split(";"):
                if part.strip():
                    a, b = part.replace(" ", "").split(",", 1) if part.count(",") == 1 else part.split()
                    pos.append((float(a.replace(",", ".")), float(b.replace(",", "."))))
        return PegSettings(mode=mode, diameter=float(self.val("spinDiametrePlot", 5)),
                           length=float(self.val("spinLongueurPlot", 6)), clearance=float(self.val("spinJeuPlot", 0.15)),
                           extra_depth=float(self.val("spinProfondeurPlot", 0.5)),
                           chamfer=float(self.val("spinChanfreinPlot", 0.5)), wall=float(self.val("spinParoiPlot", 1.2)),
                           per_island=int(self.val("spinNbPlots", 2)), positions=pos)

    def preview_split(self):
        if self.mesh is None:
            return
        try:
            st = self.peg_settings()
        except ValueError:
            QtWidgets.QMessageBox.warning(self, "Découpe", "Positions illisibles : utilisez « u,v ; u,v » "
                                          "(ex. 10,5 ; 40,20), avec un point comme séparateur décimal.")
            return
        ax, h = self._split_pos()
        m = self.mesh

        def done(r):
            self.split_res = r
            parts = exploded(r)
            V, F, C = [], [], []
            off = 0
            for mesh, role in parts:
                V.append(mesh.vertices)
                F.append(mesh.faces + off)
                off += len(mesh.vertices)
                C.append(np.tile(COLORS[{"basse": "piece_basse", "haute": "piece_haute"}.get(role, "goupilles")],
                                 (len(mesh.faces), 1)))
            self.viewer.show_cut_plane(None)
            self.viewer.show_sections(None)
            self.viewer.set_mesh(Mesh(np.concatenate(V), np.concatenate(F)), None, fit=True,
                                 colors=np.concatenate(C))
            self.viewer.set_mode(SHADED_EDGES)
            iu, iv = [(1, 2), (2, 0), (0, 1)][ax]
            names = "XYZ"
            txt = [f"Coupe {names[ax]} = {h:.3f} mm — {len(r.centers)} plot(s)"]
            for c in r.centers:
                txt.append(f"  • {names[iu]} {c[0]:.2f}  {names[iv]} {c[1]:.2f}")
            txt.append(f"Pièce basse : {len(r.low.faces)} triangles, {abs(r.low.volume):.1f} mm³")
            txt.append(f"Pièce haute : {len(r.high.faces)} triangles, {abs(r.high.volume):.1f} mm³")
            if r.pins is not None:
                txt.append(f"Goupilles : {len(r.centers)} (à imprimer debout)")
            txt += ["⚠ " + w for w in r.warnings]
            lab = self.w("labelDecoupe")
            if lab is not None:
                lab.setText("\n".join(txt))
            self.info_html("<h3>Découpe en 2 pièces</h3><p>" + "<br>".join(txt) +
                           "</p><p><span style='color:#4d94f2'>■</span> pièce basse &nbsp; "
                           "<span style='color:#f59938'>■</span> pièce haute &nbsp; "
                           "<span style='color:#8cd973'>■</span> goupilles</p>")
            self.status("Aperçu de la découpe : enregistrez les pièces ou continuez avec l'une d'elles.")

        self.run("Découpe et placement des plots…", lambda: split(m, ax, h, st), done)

    def save_split(self):
        r = self.split_res
        if r is None:
            return
        d = QtWidgets.QFileDialog.getExistingDirectory(self, "Dossier des pièces", self.settings.value("dir", ""))
        if not d:
            return
        files = [(f"{self.base}_basse.stl", r.low), (f"{self.base}_haute.stl", r.high)]
        if r.pins is not None:
            files.append((f"{self.base}_goupilles.stl", r.pins))
        for name, m in files:
            write_stl(os.path.join(d, name), m)
        self.status(f"{len(files)} fichiers enregistrés dans {d} : " + ", ".join(n for n, _ in files))

    def keep_split_part(self, which):
        r = self.split_res
        if r is None:
            return
        self.mesh = r.low if which == "low" else r.high
        self.res = None
        self.split_res = None
        self.clear_measure()
        self.viewer.set_mesh(self.mesh, None, fit=True)
        self.set_mode(SHADED_EDGES)
        self.show_mesh_info()
        self.update_state()
        self.status("Pièce " + ("basse" if which == "low" else "haute") + " : convertissez-la ou enregistrez-la.")

    # ----------------------------------------------------------------- sections
    def _section_positions(self):
        ax = AXES[self.val("comboAxeSections", 2)]
        spec = str(self.val("editPositions", "")).strip()
        if spec:
            at = [float(x.strip().replace(",", ".")) for x in spec.split(";") if x.strip()]
        else:
            at = positions(self.mesh, ax, int(self.val("spinNbSections", 5)))
        return ax, at

    def preview_sections(self):
        dock = self.w("dockSections")
        visible = dock is None or dock.isVisible()
        if self.mesh is None or not visible or not self.val("checkApercuSections", True) or self.split_res is not None:
            self.viewer.show_sections(None)
            return
        try:
            ax, at = self._section_positions()
        except ValueError:
            self.viewer.show_sections(None)
            return
        polys = [p for _, ps in sections(self.mesh, ax, at[:200]) for p in ps]
        self.viewer.show_sections(polys)

    def export_sections(self):
        if self.mesh is None:
            return
        try:
            ax, at = self._section_positions()
        except ValueError:
            QtWidgets.QMessageBox.warning(self, "Sections", "Cotes illisibles : utilisez par exemple 2,5 ; 10 ; 17,5")
            return
        flat = not self.val("checkCoord3D", False)
        split = self.val("checkUnFichierParSection", False)
        m = self.mesh
        if split:
            d = QtWidgets.QFileDialog.getExistingDirectory(self, "Dossier des sections DXF", self.settings.value("dir", ""))
            if not d:
                return

            def work():
                secs = sections(m, ax, at)
                for h, polys in secs:
                    with open(os.path.join(d, f"{self.base}_{ax}{h:.3f}.dxf"), "w") as f:
                        f.write(dxf_text([(h, polys)], ax, flat))
                return len(secs), sum(len(p) for _, p in secs), d
        else:
            p = self._save_name("Exporter les sections DXF", f"_sections_{ax}.dxf", "DXF (*.dxf)")
            if not p:
                return

            def work():
                secs = sections(m, ax, at)
                with open(p, "w") as f:
                    f.write(dxf_text(secs, ax, flat))
                return len(secs), sum(len(q) for _, q in secs), p
        self.run("Calcul des sections…", work,
                 lambda r: self.status(f"{r[0]} section(s), {r[1]} contour(s) → {r[2]}"))

    # ------------------------------------------------------------------------ aide
    def help(self):
        QtWidgets.QMessageBox.information(
            self, "Aide",
            "1. Ouvrir un STL (Ctrl+O) ou le glisser dans la fenêtre.\n"
            "2. Convertir (F5) : plans et cylindres reconnus, le reste en facettes. Réglages dans le panneau "
            "« Paramètres de conversion ».\n"
            "3. Vues : 1 ombré + arêtes, 2 ombré, 3 filaire, 4 carte de conversion ; 0/7/8/9 vues standard, F tout voir.\n"
            "4. Modifier : mesurer (M, puis cliquer deux points), couper (panneau Coupe), enregistrer le STL modifié.\n"
            "   Découper en 2 pièces (Ctrl+J) : deux pièces assemblables par plots mâles/femelles ou par "
            "goupilles séparées, placés automatiquement ou aux positions données.\n"
            "5. Enregistrer le STEP (Ctrl+S). Sections DXF : panneau Sections.\n\n"
            "Les panneaux se déplacent, s'empilent en onglets ou se détachent ; leur disposition est mémorisée.\n"
            "Aide › Personnaliser l'interface : copie modifiable de la fenêtre (Qt Designer) et du style.")

    def about(self):
        QtWidgets.QMessageBox.about(
            self, "À propos",
            "<b>STL2STEP</b><br>Maillage STL → solide STEP (plans, cylindres), sections DXF, coupe.<br>"
            f"Interface : {self.ui_path}<br>Style : {self.style_path}")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="stl2step-qt", description="Interface PyQt de STL2STEP")
    ap.add_argument("stl", nargs="?", help="fichier STL à ouvrir")
    ap.add_argument("--ui", help="fichier .ui (Qt Designer) à utiliser")
    ap.add_argument("--style", help="feuille de style .qss à utiliser")
    a = ap.parse_args(argv)
    QtWidgets.QApplication.setAttribute(QtCore.Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(sys.argv[:1])
    app.setApplicationName("STL2STEP")
    app.setOrganizationName("stl2step")
    win = MainWindow(find_file("main_window.ui", a.ui), find_file("style.qss", a.style))
    win.show()
    if a.stl:
        win.load(a.stl)
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
