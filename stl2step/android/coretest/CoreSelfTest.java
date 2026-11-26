import fr.stl2step.core.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Contrôle du cœur Java sans Android :
 *   javac -d out app/src/main/java/fr/stl2step/core/*.java coretest/CoreSelfTest.java
 *   java -cp out CoreSelfTest ../samples [dossier_sortie]
 */
public class CoreSelfTest {
    static int fails = 0;

    static void check(boolean c, String msg) {
        System.out.println((c ? "OK   " : "ECHEC ") + msg);
        if (!c) fails++;
    }

    static Mesh load(Path dir, String name) throws Exception {
        return Stl.parse(Files.readAllBytes(dir.resolve(name + ".stl")));
    }

    static int count(String s, String sub) {
        int c = 0, i = 0;
        while ((i = s.indexOf(sub, i)) >= 0) { c++; i += sub.length(); }
        return c;
    }

    public static void main(String[] a) throws Exception {
        Path dir = Paths.get(a.length > 0 ? a[0] : "../samples");
        Path out = a.length > 1 ? Paths.get(a[1]) : null;
        Object[][] cases = {{"box", 6, 0}, {"plate_hole", 6, 1}, {"plate_boss", 7, 2}, {"fillet_vert", 6, 4}, {"fillet_all", -1, -1}};
        for (Object[] c : cases) {
            String name = (String) c[0];
            long t0 = System.nanoTime();
            Converter r = Converter.convert(load(dir, name), 0, name, true, true);
            long ms = (System.nanoTime() - t0) / 1_000_000;
            int pl = (Integer) c[1], cy = (Integer) c[2];
            if (pl >= 0) {
                check(r.seg.planes() == pl && r.seg.cylinders() == cy && r.seg.facets() == 0,
                        name + " : " + r.seg.planes() + " plans, " + r.seg.cylinders() + " cylindres (" + ms + " ms)");
                check(count(r.step, "ADVANCED_FACE(") == pl + cy, name + " : faces STEP");
            } else {
                check(r.brep.closed, name + " : solide fermé, " + r.seg.cylinders() + " cylindres, "
                        + r.seg.facets() + " facettes (" + ms + " ms)");
            }
            check(r.brep.closed, name + " : fermé");
            if (out != null) Files.write(out.resolve(name + "_java.step"), r.step.getBytes("US-ASCII"));
        }
        Mesh box = load(dir, "box");
        check(Math.abs(box.volume() - 48000) < 1e-6, "volume du cube");
        Mesh again = Stl.parse(Stl.toBytes(box));
        check(again.nt() == 12, "STL binaire aller-retour");
        StringBuilder txt = new StringBuilder("solid t\n");
        double[] tr = box.triangles();
        for (int t = 0; t < box.nt(); t++) {
            txt.append("facet normal 0 0 0\nouter loop\n");
            for (int k = 0; k < 3; k++) txt.append("vertex ").append(tr[9 * t + 3 * k]).append(' ')
                    .append(tr[9 * t + 3 * k + 1]).append(' ').append(tr[9 * t + 3 * k + 2]).append('\n');
            txt.append("endloop\nendfacet\n");
        }
        check(Stl.parse(txt.toString().getBytes()).nt() == 12, "STL texte");

        Mesh half = Cutter.cut(box, new double[]{30, 0, 0}, new double[]{1, 0, 0}, false, true);
        check(half.openEdgeCount() == 0 && Math.abs(half.volume() - 24000) < 1e-6, "coupe du cube : " + half.volume());
        Mesh ph = load(dir, "plate_hole");
        Mesh top = Cutter.cut(ph, new double[]{0, 0, 10}, new double[]{0, 0, 1}, true, true);
        check(top.openEdgeCount() == 0 && Math.abs(top.volume() - ph.volume() / 2) < 1e-3, "coupe avec trou : " + top.volume());
        Converter rc = Converter.convert(top, 0, "cut", true, true);
        check(rc.seg.cylinders() == 1, "pièce coupée reconvertie : " + rc.seg.cylinders() + " cylindre");
        if (out != null) Files.write(out.resolve("cut_java.step"), rc.step.getBytes("US-ASCII"));

        Sections.Section s = Sections.slice(ph, 2, 10);
        check(s.polylines.size() == 2, "section : 2 contours");
        String dxf = Sections.dxf(Sections.sections(ph, 2, Sections.positions(ph, 2, 3)), true);
        check(count(dxf, "POLYLINE") == 6 && dxf.trim().endsWith("EOF"), "DXF");
        if (out != null) Files.write(out.resolve("sections_java.dxf"), dxf.getBytes("US-ASCII"));

        // découpe en 2 pièces avec plots
        for (int mode = 0; mode < 3; mode++) {
            Splitter.Settings st = new Splitter.Settings();
            st.mode = mode;
            if (mode == Splitter.PINS) st.length = 10;
            Splitter.Result sr = Splitter.split(box, 0, 30, st);
            boolean closedParts = sr.low.openEdgeCount() == 0 && sr.high.openEdgeCount() == 0;
            int expect = mode == Splitter.NONE ? 0 : 2;
            check(closedParts && sr.centers.size() == expect && sr.warnings.isEmpty(),
                    "découpe mode " + mode + " : " + sr.centers.size() + " plots, volumes "
                            + Math.round(sr.low.volume()) + " / " + Math.round(sr.high.volume()));
            if (mode == Splitter.MALE) {
                check(sr.low.volume() > 24000 && sr.high.volume() < 24000 - 2 * Math.PI * 6.25 * 6, "plots et trous");
                Converter cs = Converter.convert(sr.high, 0, "haute", true, true);
                check(cs.seg.cylinders() == 2, "pièce haute convertie : 2 trous cylindriques");
                if (out != null) Files.write(out.resolve("split_high_java.step"), cs.step.getBytes("US-ASCII"));
            }
            if (mode == Splitter.PINS) check(sr.pins != null && sr.pins.openEdgeCount() == 0, "goupilles fermées");
        }
        Splitter.Result s2 = Splitter.split(ph, 0, 30, new Splitter.Settings());
        check(s2.centers.size() == 4, "deux zones de coupe : " + s2.centers.size() + " plots");
        Splitter.Settings thin = new Splitter.Settings();
        Splitter.Result s3 = Splitter.split(load(dir, "fillet_vert"), 2, 7.5, thin);
        check(s3.centers.isEmpty() && !s3.warnings.isEmpty(), "matière trop fine détectée");

        Path big = dir.resolve("big.stl");
        if (Files.exists(big)) {
            long t0 = System.nanoTime();
            Converter rb = Converter.convert(Stl.parse(Files.readAllBytes(big)), 0, "big", true, true);
            System.out.println("big : " + rb.mesh.nt() + " triangles, " + (System.nanoTime() - t0) / 1_000_000 + " ms\n" + rb.report());
            if (out != null) Files.write(out.resolve("big_java.step"), rb.step.getBytes("US-ASCII"));
        }
        System.out.println(fails == 0 ? "\nTous les contrôles sont passés." : "\n" + fails + " échec(s).");
        System.exit(fails == 0 ? 0 : 1);
    }
}
