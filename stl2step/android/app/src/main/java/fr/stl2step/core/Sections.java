package fr.stl2step.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Sections planes d'un maillage et export DXF R12 (un calque par section). */
public final class Sections {
    private Sections() {}

    public static final class Section {
        public final int axis;
        public final double h;
        public final List<double[][]> polylines;   // points 3D ; fermée si premier == dernier
        Section(int axis, double h, List<double[][]> p) { this.axis = axis; this.h = h; this.polylines = p; }
    }

    public static double[] positions(Mesh m, int axis, int count) {
        double lo = m.min()[axis], hi = m.max()[axis];
        double step = (hi - lo) / (count + 1);
        double[] out = new double[count];
        for (int k = 0; k < count; k++) out[k] = lo + step * (k + 1);
        return out;
    }

    public static Section slice(Mesh mesh, int axis, double h) {
        double[] V = mesh.v;
        int[] F = mesh.f;
        int nv = mesh.nv();
        double eps = Math.max(mesh.diagonal() * 1e-9, 1e-12);
        double[] d = new double[nv];
        for (int i = 0; i < nv; i++) {
            d[i] = V[3 * i + axis] - h;
            if (Math.abs(d[i]) < eps) d[i] = eps;
        }
        Map<Long, Integer> pointOfEdge = new HashMap<>();
        List<double[]> pts = new ArrayList<>();
        Map<Integer, Integer> nxt = new LinkedHashMap<>();
        for (int t = 0; t < mesh.nt(); t++) {
            int up = -1, dn = -1;
            for (int k = 0; k < 3; k++) {
                int u = F[3 * t + k], w = F[3 * t + (k + 1) % 3];
                if (d[u] < 0 && d[w] > 0) up = edgePoint(u, w, d, V, pointOfEdge, pts);
                else if (d[u] > 0 && d[w] < 0) dn = edgePoint(u, w, d, V, pointOfEdge, pts);
            }
            if (up >= 0 && dn >= 0) nxt.put(dn, up);
        }
        Set<Integer> prev = new HashSet<>(nxt.values());
        List<Integer> starts = new ArrayList<>();
        for (int k : nxt.keySet()) if (!prev.contains(k)) starts.add(k);
        starts.addAll(nxt.keySet());
        Set<Integer> seen = new HashSet<>();
        List<double[][]> out = new ArrayList<>();
        double tol = eps * 1e3;
        for (int s0 : starts) {
            if (seen.contains(s0)) continue;
            IntList chain = new IntList();
            chain.add(s0);
            seen.add(s0);
            int cur = s0;
            while (nxt.containsKey(cur) && !seen.contains(nxt.get(cur))) {
                cur = nxt.get(cur);
                chain.add(cur);
                seen.add(cur);
            }
            boolean closed = nxt.containsKey(cur) && nxt.get(cur) == s0;
            double[][] P = new double[chain.size()][];
            for (int i = 0; i < P.length; i++) P[i] = pts.get(chain.get(i));
            if (P.length < 2) continue;
            IntList keep = Segmenter.dropCollinear(P, closed, tol);
            int n = keep.size() + (closed ? 1 : 0);
            double[][] Q = new double[n][];
            for (int i = 0; i < keep.size(); i++) Q[i] = P[keep.get(i)];
            if (closed) Q[n - 1] = Q[0];
            out.add(Q);
        }
        return new Section(axis, h, out);
    }

    private static int edgePoint(int a, int b, double[] d, double[] V, Map<Long, Integer> cache, List<double[]> pts) {
        long k = Mesh.edgeKey(a, b);
        Integer id = cache.get(k);
        if (id == null) {
            double t = d[a] / (d[a] - d[b]);
            double[] p = new double[3];
            for (int i = 0; i < 3; i++) p[i] = V[3 * a + i] + t * (V[3 * b + i] - V[3 * a + i]);
            id = pts.size();
            pts.add(p);
            cache.put(k, id);
        }
        return id;
    }

    public static List<Section> sections(Mesh m, int axis, double[] at) {
        List<Section> out = new ArrayList<>();
        for (double h : at) out.add(slice(m, axis, h));
        return out;
    }

    static final int[][] BASIS = {{1, 2}, {2, 0}, {0, 1}};
    static final String AXES = "XYZ";

    public static String dxf(List<Section> secs, boolean flat) {
        StringBuilder sb = new StringBuilder();
        List<String> layers = new ArrayList<>();
        for (Section s : secs)
            layers.add(("SECTION_" + AXES.charAt(s.axis) + "_" + String.format(Locale.ROOT, "%.3f", s.h))
                    .replace('.', '_').replace("-", "M"));
        line(sb, "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC");
        line(sb, "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String.valueOf(layers.size()));
        for (int k = 0; k < layers.size(); k++)
            line(sb, "0", "LAYER", "2", layers.get(k), "70", "0", "62", String.valueOf(1 + k % 7), "6", "CONTINUOUS");
        line(sb, "0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
        for (int si = 0; si < secs.size(); si++) {
            Section s = secs.get(si);
            String name = layers.get(si);
            int iu = BASIS[s.axis][0], iv = BASIS[s.axis][1];
            for (double[][] p : s.polylines) {
                boolean closed = p.length > 2 && V3.dist(p[0], p[p.length - 1]) < 1e-12;
                int n = closed ? p.length - 1 : p.length;
                line(sb, "0", "POLYLINE", "8", name, "66", "1", "70", String.valueOf((closed ? 1 : 0) | (flat ? 0 : 8)));
                line(sb, "10", "0.0", "20", "0.0", "30", flat ? "0.0" : num(s.h));
                for (int i = 0; i < n; i++) {
                    double[] q = p[i];
                    if (flat) line(sb, "0", "VERTEX", "8", name, "10", num(q[iu]), "20", num(q[iv]), "30", "0.0", "70", "0");
                    else line(sb, "0", "VERTEX", "8", name, "10", num(q[0]), "20", num(q[1]), "30", num(q[2]), "70", "32");
                }
                line(sb, "0", "SEQEND", "8", name);
            }
        }
        line(sb, "0", "ENDSEC", "0", "EOF");
        return sb.toString();
    }

    private static String num(double x) { return String.format(Locale.ROOT, "%.6f", x); }

    private static void line(StringBuilder sb, String... s) { for (String x : s) sb.append(x).append('\n'); }
}
