package fr.stl2step.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Coupe d'un maillage par un plan, avec rebouchage de la section. */
public final class Cutter {
    private Cutter() {}

    /** keepAbove=false : garde le côté opposé à la normale. */
    public static Mesh cut(Mesh mesh, double[] p0, double[] normal, boolean keepAbove, boolean cap) {
        double[] n = V3.unit(normal);
        if (keepAbove) n = V3.mul(n, -1);
        int nv = mesh.nv();
        double eps = Math.max(mesh.diagonal() * 1e-9, 1e-12);
        double[] d = new double[nv];
        for (int i = 0; i < nv; i++) {
            d[i] = V3.dot(V3.sub(mesh.vertex(i), p0), n);
            if (Math.abs(d[i]) < eps) d[i] = -eps;
        }
        DoubleList out = new DoubleList();
        int[] F = mesh.f;
        for (int t = 0; t < mesh.nt(); t++) {
            int[] tri = {F[3 * t], F[3 * t + 1], F[3 * t + 2]};
            boolean[] in = {d[tri[0]] < 0, d[tri[1]] < 0, d[tri[2]] < 0};
            int k = (in[0] ? 1 : 0) + (in[1] ? 1 : 0) + (in[2] ? 1 : 0);
            if (k == 3) {
                for (int x : tri) out.add(mesh.vertex(x));
            } else if (k > 0) {
                List<double[]> poly = new ArrayList<>();
                for (int i = 0; i < 3; i++) {
                    int u = tri[i], w = tri[(i + 1) % 3];
                    if (in[i]) poly.add(mesh.vertex(u));
                    if (in[i] != in[(i + 1) % 3]) {
                        double tt = d[u] / (d[u] - d[w]);
                        poly.add(V3.addMul(mesh.vertex(u), V3.sub(mesh.vertex(w), mesh.vertex(u)), tt));
                    }
                }
                for (int j = 1; j < poly.size() - 1; j++) {
                    out.add(poly.get(0));
                    out.add(poly.get(j));
                    out.add(poly.get(j + 1));
                }
            }
        }
        Mesh res = Mesh.fromTriangles(out.toArray());
        if (cap && res.nt() > 0) {
            double[] caps = capTriangles(res, p0, n);
            if (caps.length > 0) {
                double[] all = res.triangles();
                double[] m = new double[all.length + caps.length];
                System.arraycopy(all, 0, m, 0, all.length);
                System.arraycopy(caps, 0, m, all.length, caps.length);
                res = Mesh.fromTriangles(m);
            }
        }
        return res;
    }

    static List<int[]> boundaryLoops(Mesh mesh) {
        Map<Integer, Integer> nxt = new HashMap<>();
        for (int[] r : mesh.edgeMap().values()) {
            if (r[0] != 1) continue;
            int t = r[1], k = r[2];
            nxt.put(mesh.f[3 * t + k], mesh.f[3 * t + (k + 1) % 3]);
        }
        List<int[]> loops = new ArrayList<>();
        Set<Integer> seen = new HashSet<>();
        for (int s : new ArrayList<>(nxt.keySet())) {
            if (seen.contains(s)) continue;
            IntList loop = new IntList();
            Integer cur = s;
            while (cur != null && !seen.contains(cur)) {
                seen.add(cur);
                loop.add(cur);
                cur = nxt.get(cur);
            }
            if (cur != null && cur == s && loop.size() >= 3) loops.add(loop.toArray());
        }
        return loops;
    }

    static double[] capTriangles(Mesh mesh, double[] p0, double[] n) {
        double tol = Math.max(mesh.diagonal() * 1e-6, 1e-9) * 100;
        double[] u = V3.perp(n), v = V3.cross(n, u);
        List<double[][]> q2 = new ArrayList<>();
        List<double[][]> q3 = new ArrayList<>();
        for (int[] lp : boundaryLoops(mesh)) {
            boolean inPlane = true;
            for (int x : lp) if (Math.abs(V3.dot(V3.sub(mesh.vertex(x), p0), n)) > tol) { inPlane = false; break; }
            if (!inPlane) continue;
            int L = lp.length;
            double[][] a = new double[L][], b = new double[L][];
            for (int i = 0; i < L; i++) {
                double[] p = mesh.vertex(lp[L - 1 - i]);     // boucle inversée : normale du bouchon = +n
                double[] r = V3.sub(p, p0);
                a[i] = new double[]{V3.dot(r, u), V3.dot(r, v)};
                b[i] = p;
            }
            q2.add(a);
            q3.add(b);
        }
        DoubleList out = new DoubleList();
        int P = q2.size();
        double[] area = new double[P];
        for (int i = 0; i < P; i++) area[i] = area(q2.get(i));
        Map<Integer, List<Integer>> groups = new HashMap<>();
        for (int i = 0; i < P; i++) if (area[i] > 0) groups.put(i, new ArrayList<>());
        for (int h = 0; h < P; h++) {
            if (area[h] >= 0) continue;
            int best = -1;
            for (int o : groups.keySet())
                if (inside(q2.get(h)[0], q2.get(o)) && (best < 0 || area[o] < area[best])) best = o;
            if (best >= 0) groups.get(best).add(h);
        }
        for (Map.Entry<Integer, List<Integer>> e : groups.entrySet()) {
            List<double[]> outer2 = new ArrayList<>(java.util.Arrays.asList(q2.get(e.getKey())));
            List<double[]> outer3 = new ArrayList<>(java.util.Arrays.asList(q3.get(e.getKey())));
            List<Integer> hs = e.getValue();
            hs.sort((x, y) -> Double.compare(maxX(q2.get(y)), maxX(q2.get(x))));
            for (int h : hs) bridge(outer2, outer3, q2.get(h), q3.get(h));
            for (int[] t : earclip(outer2)) for (int k : t) out.add(outer3.get(k));
        }
        return out.toArray();
    }

    private static double maxX(double[][] q) {
        double m = -Double.MAX_VALUE;
        for (double[] p : q) m = Math.max(m, p[0]);
        return m;
    }

    static double area(double[][] q) {
        double s = 0;
        for (int i = 0; i < q.length; i++) {
            double[] a = q[i], b = q[(i + 1) % q.length];
            s += a[0] * b[1] - b[0] * a[1];
        }
        return 0.5 * s;
    }

    static boolean inside(double[] p, double[][] poly) {
        boolean c = false;
        int n = poly.length;
        for (int i = 0; i < n; i++) {
            double[] a = poly[i], b = poly[(i + 1) % n];
            if ((a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
        }
        return c;
    }

    private static void bridge(List<double[]> outer, List<double[]> outer3, double[][] hole, double[][] hole3) {
        int m = 0;
        for (int i = 1; i < hole.length; i++) if (hole[i][0] > hole[m][0]) m = i;
        double mx = hole[m][0], my = hole[m][1];
        int n = outer.size();
        double bestX = Double.NaN;
        int bestI = -1;
        for (int i = 0; i < n; i++) {
            double[] a = outer.get(i), b = outer.get((i + 1) % n);
            if ((a[1] - my) * (b[1] - my) > 0 || a[1] == b[1]) continue;
            double x = a[0] + (my - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
            if (x >= mx && (Double.isNaN(bestX) || x < bestX)) {
                bestX = x;
                bestI = a[0] > b[0] ? i : (i + 1) % n;
            }
        }
        if (bestI < 0) {
            double bd = Double.MAX_VALUE;
            for (int i = 0; i < n; i++) {
                double dd = sq(outer.get(i)[0] - mx) + sq(outer.get(i)[1] - my);
                if (dd < bd) { bd = dd; bestI = i; }
            }
        } else {
            double[] I = {bestX, my}, Pp = outer.get(bestI), M = {mx, my};
            int cand = -1;
            double ca = 0, cd = 0;
            for (int i = 0; i < n; i++) {
                double[] q = outer.get(i);
                if (i == bestI || q[0] < mx || !inTri(q, M, I, Pp)) continue;
                double ang = Math.abs(Math.atan2(q[1] - my, q[0] - mx)), dd = sq(q[0] - mx);
                if (cand < 0 || ang < ca || (ang == ca && dd < cd)) { cand = i; ca = ang; cd = dd; }
            }
            if (cand >= 0) bestI = cand;
        }
        List<double[]> ins2 = new ArrayList<>(), ins3 = new ArrayList<>();
        for (int k = 0; k <= hole.length; k++) {
            ins2.add(hole[(m + k) % hole.length]);
            ins3.add(hole3[(m + k) % hole.length]);
        }
        ins2.add(outer.get(bestI));
        ins3.add(outer3.get(bestI));
        outer.addAll(bestI + 1, ins2);
        outer3.addAll(bestI + 1, ins3);
    }

    private static double sq(double x) { return x * x; }

    static boolean inTri(double[] p, double[] a, double[] b, double[] c) {
        double d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
        boolean neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(neg && pos);
    }

    private static double s(double[] p1, double[] p2, double[] p3) {
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
    }

    private static boolean same(double[] a, double[] b) { return a[0] == b[0] && a[1] == b[1]; }

    static List<int[]> earclip(List<double[]> q) {
        IntList idx = new IntList();
        for (int i = 0; i < q.size(); i++) idx.add(i);
        List<int[]> tris = new ArrayList<>();
        long guard = 0, limit = 10L * q.size() * q.size();
        while (idx.size() > 3 && guard++ < limit) {
            int n = idx.size();
            boolean found = false;
            for (int k = 0; k < n; k++) {
                int i0 = idx.get((k - 1 + n) % n), i1 = idx.get(k), i2 = idx.get((k + 1) % n);
                double[] a = q.get(i0), b = q.get(i1), c = q.get(i2);
                double cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
                if (cr <= 0) continue;
                boolean ok = true;
                for (int jj = 0; jj < n && ok; jj++) {
                    int j = idx.get(jj);
                    if (j == i0 || j == i1 || j == i2) continue;
                    double[] p = q.get(j);
                    if (same(p, a) || same(p, b) || same(p, c)) continue;
                    if (inTri(p, a, b, c)) ok = false;
                }
                if (ok) {
                    tris.add(new int[]{i0, i1, i2});
                    idx.removeAt(k);
                    found = true;
                    break;
                }
            }
            if (!found) {
                tris.add(new int[]{idx.get(idx.size() - 1), idx.get(0), idx.get(1)});
                idx.removeAt(0);
            }
        }
        if (idx.size() == 3) tris.add(new int[]{idx.get(0), idx.get(1), idx.get(2)});
        return tris;
    }

    /** Liste de doubles extensible. */
    static final class DoubleList {
        double[] a = new double[1024];
        int n;
        void add(double[] p) {
            if (n + p.length > a.length) a = java.util.Arrays.copyOf(a, Math.max(a.length * 2, n + p.length));
            System.arraycopy(p, 0, a, n, p.length);
            n += p.length;
        }
        double[] toArray() { return java.util.Arrays.copyOf(a, n); }
    }
}
