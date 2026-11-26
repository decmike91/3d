package fr.stl2step.core;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Reconnaissance des faces : régions planes puis cylindres.
 * Même algorithme que la version Python (stl2step/segment.py).
 */
public final class Segmenter {
    static final double PLANE_COS = Math.cos(Math.toRadians(0.3));
    static final double SMOOTH_COS = Math.cos(Math.toRadians(45));
    static final double AXIS_SIN = Math.sin(Math.toRadians(1.0));
    static final double RADIAL_COS = Math.cos(Math.toRadians(15));
    static final double GENERATOR_COS = Math.cos(Math.toRadians(0.5));

    public static final class Face {
        public boolean cylinder;
        public int[] regions;
        public int[] tris;
        public double[] normal, point, axis;
        public double radius;
        public boolean outward = true;
        public boolean faceted;
    }

    public static final class Segmentation {
        public Mesh mesh;
        public double tol;
        public int[] nb;              // 3 * nt
        public int[] regionOfTri;
        public List<int[]> regions = new ArrayList<>();
        public double[][] regionNormal;
        public List<Face> faces = new ArrayList<>();
        public int[] faceOfTri;

        public int planes() { int c = 0; for (Face f : faces) if (!f.cylinder && !f.faceted) c++; return c; }
        public int cylinders() { int c = 0; for (Face f : faces) if (f.cylinder) c++; return c; }
        public int facets() { int c = 0; for (Face f : faces) if (f.faceted) c++; return c; }
    }

    public static double defaultTolerance(Mesh m) { return Math.max(m.diagonal() * 1e-4, 1e-6); }

    public static int[] neighbors(Mesh m) {
        int[] nb = new int[m.f.length];
        Arrays.fill(nb, -1);
        for (int[] r : m.edgeMap().values()) {
            if (r[0] != 2) continue;
            int t1 = r[1], k1 = r[2], t2 = r[3], k2 = r[4];
            if (m.f[3 * t1 + k1] == m.f[3 * t2 + k2]) continue;   // orientation incohérente
            nb[3 * t1 + k1] = t2;
            nb[3 * t2 + k2] = t1;
        }
        return nb;
    }

    // --------------------------------------------------------------- fitting
    static double[][] basis(double[] a) {
        double[] u = V3.perp(a);
        return new double[][]{u, V3.cross(a, u)};
    }

    /** Cercle 2D (Kasa) : {cx, cy, r} ou null. */
    static double[] fitCircle(double[][] p) {
        int n = p.length;
        double mx = 0, my = 0;
        for (double[] q : p) { mx += q[0]; my += q[1]; }
        mx /= n; my /= n;
        double[][] A = new double[3][3];
        double[] b = new double[3];
        for (double[] q : p) {
            double x = q[0] - mx, y = q[1] - my, z = -(x * x + y * y);
            double[] row = {x, y, 1};
            for (int i = 0; i < 3; i++) {
                for (int j = 0; j < 3; j++) A[i][j] += row[i] * row[j];
                b[i] += row[i] * z;
            }
        }
        double[] s = V3.solve3(A, b);
        if (s == null) return null;
        double cx = -s[0] / 2, cy = -s[1] / 2, r2 = cx * cx + cy * cy - s[2];
        if (!(r2 > 0) || Double.isInfinite(r2)) return null;
        return new double[]{cx + mx, cy + my, Math.sqrt(r2)};
    }

    static boolean hasGenerator(double[][] dirs, double[] a) {
        for (double[] d : dirs) if (Math.abs(V3.dot(d, a)) >= GENERATOR_COS) return true;
        return false;
    }

    /** {axe(3), point(3), rayon, outward(1/0)} ou null. */
    static double[] fitCylinder(List<double[]> normals, List<double[]> cents, List<double[]> pts,
                                double tol, double maxR, List<double[][]> dirs) {
        int k = normals.size();
        if (k < 2) return null;
        double[] a;
        if (k == 2) {
            a = V3.cross(normals.get(0), normals.get(1));
            if (V3.norm(a) < 1e-3) return null;
        } else {
            double[][] M = new double[3][3];
            for (double[] n : normals)
                for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) M[i][j] += n[i] * n[j];
            a = V3.smallestEigenvector(M);
        }
        a = V3.unit(a);
        for (double[] n : normals) if (Math.abs(V3.dot(n, a)) > AXIS_SIN) return null;
        if (dirs != null) for (double[][] d : dirs) if (!hasGenerator(d, a)) return null;
        double[][] uv = basis(a);
        double[][] p2 = new double[pts.size()][];
        for (int i = 0; i < p2.length; i++) p2[i] = new double[]{V3.dot(pts.get(i), uv[0]), V3.dot(pts.get(i), uv[1])};
        double[] c = fitCircle(p2);
        if (c == null) return null;
        double r = c[2];
        if (r > maxR || r < tol) return null;
        for (double[] q : p2) if (Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - r) > tol) return null;
        int pos = 0, neg = 0;
        for (int i = 0; i < k; i++) {
            double[] ce = cents.get(i), n = normals.get(i);
            double qx = V3.dot(ce, uv[0]) - c[0], qy = V3.dot(ce, uv[1]) - c[1];
            double qn = Math.hypot(qx, qy);
            if (qn < 1e-12) return null;
            double s = (V3.dot(n, uv[0]) * qx + V3.dot(n, uv[1]) * qy) / qn;
            if (s > RADIAL_COS) pos++;
            else if (s < -RADIAL_COS) neg++;
        }
        boolean outward;
        if (pos == k) outward = true;
        else if (neg == k) outward = false;
        else return null;
        double h = Double.MAX_VALUE;
        for (double[] p : pts) h = Math.min(h, V3.dot(p, a));
        double[] point = V3.addMul(V3.addMul(V3.mul(uv[0], c[0]), uv[1], c[1]), a, h);
        return new double[]{a[0], a[1], a[2], point[0], point[1], point[2], r, outward ? 1 : 0};
    }

    // ---------------------------------------------------------------- regions
    public static Segmentation segment(Mesh mesh, double tol, boolean cylinders) {
        if (tol <= 0) tol = defaultTolerance(mesh);
        Segmentation seg = new Segmentation();
        seg.mesh = mesh;
        seg.tol = tol;
        int nt = mesh.nt();
        int[] F = mesh.f;
        double[] V = mesh.v;
        double[] n = mesh.normals();
        double[] ar = mesh.areas();
        int[] nb = neighbors(mesh);
        seg.nb = nb;

        // 1. régions planes
        int[] label = new int[nt];
        Arrays.fill(label, -1);
        Integer[] order = new Integer[nt];
        for (int i = 0; i < nt; i++) order[i] = i;
        Arrays.sort(order, (x, y) -> Double.compare(ar[y], ar[x]));
        int[] stack = new int[nt];
        for (int s : order) {
            if (label[s] >= 0) continue;
            int rid = seg.regions.size();
            double n0x = n[3 * s], n0y = n[3 * s + 1], n0z = n[3 * s + 2];
            int v0 = F[3 * s];
            double d0 = V[3 * v0] * n0x + V[3 * v0 + 1] * n0y + V[3 * v0 + 2] * n0z;
            label[s] = rid;
            int sp = 0;
            stack[sp++] = s;
            IntList tris = new IntList();
            tris.add(s);
            while (sp > 0) {
                int t = stack[--sp];
                for (int k = 0; k < 3; k++) {
                    int u = nb[3 * t + k];
                    if (u < 0 || label[u] >= 0) continue;
                    if (n[3 * u] * n0x + n[3 * u + 1] * n0y + n[3 * u + 2] * n0z < PLANE_COS) continue;
                    boolean ok = true;
                    for (int j = 0; j < 3 && ok; j++) {
                        int w = F[3 * u + j];
                        double d = V[3 * w] * n0x + V[3 * w + 1] * n0y + V[3 * w + 2] * n0z - d0;
                        if (Math.abs(d) > tol) ok = false;
                    }
                    if (!ok) continue;
                    label[u] = rid;
                    stack[sp++] = u;
                    tris.add(u);
                }
            }
            seg.regions.add(tris.toArray());
        }
        seg.regionOfTri = label;
        int R = seg.regions.size();
        double[][] rn = new double[R][];
        for (int i = 0; i < R; i++) {
            double[] s = new double[3];
            for (int t : seg.regions.get(i)) for (int k = 0; k < 3; k++) s[k] += n[3 * t + k] * ar[t];
            double l = V3.norm(s);
            rn[i] = l == 0 ? new double[]{0, 0, 1} : V3.mul(s, 1 / l);
        }
        seg.regionNormal = rn;

        // 2. cylindres
        int[] owner = new int[R];
        Arrays.fill(owner, -1);
        List<int[]> cylGroups = new ArrayList<>();
        List<double[]> cylFits = new ArrayList<>();
        if (cylinders) {
            Map<Integer, Set<Integer>> adj = new HashMap<>();
            for (int t = 0; t < nt; t++) {
                for (int k = 0; k < 3; k++) {
                    int o = nb[3 * t + k];
                    if (o < 0) continue;
                    int a = label[t], b = label[o];
                    if (a == b) continue;
                    if (V3.dot(rn[a], rn[b]) > SMOOTH_COS) adj.computeIfAbsent(a, x -> new LinkedHashSet<>()).add(b);
                }
            }
            int[][] rpts = new int[R][];
            double[][] rcent = new double[R][];
            double[][][] rdirs = new double[R][][];
            double[] rarea = new double[R];
            for (int i = 0; i < R; i++) {
                int[] r = seg.regions.get(i);
                rpts[i] = cornerPoints(mesh, r, nb, label, i, tol);
                double[] c = new double[3];
                TreeSet<Integer> all = new TreeSet<>();
                for (int t : r) for (int k = 0; k < 3; k++) all.add(F[3 * t + k]);
                for (int w : all) for (int k = 0; k < 3; k++) c[k] += V[3 * w + k];
                rcent[i] = V3.mul(c, 1.0 / all.size());
                for (int t : r) rarea[i] += ar[t];
                if (r.length > 64) { rdirs[i] = new double[0][]; continue; }
                List<double[]> ds = new ArrayList<>();
                for (int t : r) for (int k = 0; k < 3; k++) {
                    double[] e = V3.sub(mesh.vertex(F[3 * t + (k + 1) % 3]), mesh.vertex(F[3 * t + k]));
                    double l = V3.norm(e);
                    if (l > tol) ds.add(V3.mul(e, 1 / l));
                }
                rdirs[i] = ds.toArray(new double[0][]);
            }
            double maxR = mesh.diagonal();
            Integer[] seeds = new Integer[R];
            for (int i = 0; i < R; i++) seeds[i] = i;
            Arrays.sort(seeds, (x, y) -> Double.compare(rarea[x], rarea[y]));
            for (int seed : seeds) {
                if (owner[seed] >= 0 || !adj.containsKey(seed)) continue;
                List<Integer> group = new ArrayList<>();
                group.add(seed);
                Set<Integer> in = new HashSet<>(group);
                TreeSet<Integer> ptsIds = new TreeSet<>();
                for (int p : rpts[seed]) ptsIds.add(p);
                double[] fit = null, fixed = null;
                int refitAt = 6;
                ArrayDeque<Integer> frontier = new ArrayDeque<>(adj.get(seed));
                while (!frontier.isEmpty()) {
                    int c = frontier.pollFirst();
                    if (in.contains(c) || owner[c] >= 0) continue;
                    double[] ok = null;
                    if (fixed != null) {
                        double[] a = {fixed[0], fixed[1], fixed[2]}, p0 = {fixed[3], fixed[4], fixed[5]};
                        double r = fixed[6];
                        boolean outw = fixed[7] > 0;
                        double[] nc = rn[c];
                        if (Math.abs(V3.dot(nc, a)) <= AXIS_SIN && hasGenerator(rdirs[c], a)) {
                            double[][] uv = basis(a);
                            double cx = V3.dot(p0, uv[0]), cy = V3.dot(p0, uv[1]);
                            boolean good = true;
                            for (int w : rpts[c]) {
                                double[] q = mesh.vertex(w);
                                double d = Math.hypot(V3.dot(q, uv[0]) - cx, V3.dot(q, uv[1]) - cy);
                                if (Math.abs(d - r) > tol) { good = false; break; }
                            }
                            double qx = V3.dot(rcent[c], uv[0]) - cx, qy = V3.dot(rcent[c], uv[1]) - cy;
                            double qn = Math.hypot(qx, qy);
                            if (qn == 0) qn = 1;
                            double s = (V3.dot(nc, uv[0]) * qx + V3.dot(nc, uv[1]) * qy) / qn;
                            if (good && (outw ? s > RADIAL_COS : s < -RADIAL_COS)) ok = fixed;
                        }
                    } else {
                        List<Integer> ids = new ArrayList<>(group);
                        ids.add(c);
                        TreeSet<Integer> allp = new TreeSet<>(ptsIds);
                        for (int p : rpts[c]) allp.add(p);
                        ok = fitGroup(mesh, ids, allp, rn, rcent, rdirs, tol, maxR);
                    }
                    if (ok == null) continue;
                    group.add(c);
                    in.add(c);
                    for (int p : rpts[c]) ptsIds.add(p);
                    fit = ok;
                    if (group.size() >= refitAt) {
                        double[] fx = fitGroup(mesh, group, ptsIds, rn, rcent, rdirs, tol, maxR);
                        fixed = fx != null ? fx : fit;
                        fit = fixed;
                        refitAt *= 2;
                    }
                    for (int x : adj.getOrDefault(c, new HashSet<>())) if (!in.contains(x)) frontier.addLast(x);
                }
                if (group.size() >= 3 && fit != null) {
                    double[] fin = fitGroup(mesh, group, ptsIds, rn, rcent, rdirs, tol, maxR);
                    if (fin == null) fin = fit;
                    int[] g = new int[group.size()];
                    for (int i = 0; i < g.length; i++) { g[i] = group.get(i); owner[g[i]] = cylGroups.size(); }
                    cylGroups.add(g);
                    cylFits.add(fin);
                }
            }
        }
        for (int i = 0; i < cylGroups.size(); i++) {
            int[] g = cylGroups.get(i);
            double[] fit = cylFits.get(i);
            Face f = new Face();
            f.cylinder = true;
            f.regions = g;
            IntList tl = new IntList();
            for (int rg : g) for (int t : seg.regions.get(rg)) tl.add(t);
            f.tris = tl.toArray();
            f.axis = new double[]{fit[0], fit[1], fit[2]};
            f.point = new double[]{fit[3], fit[4], fit[5]};
            f.radius = fit[6];
            f.outward = fit[7] > 0;
            seg.faces.add(f);
        }
        for (int i = 0; i < R; i++) if (owner[i] < 0) seg.faces.add(planeFace(seg, i));
        assign(seg);
        return seg;
    }

    private static double[] fitGroup(Mesh mesh, List<Integer> ids, Set<Integer> pts, double[][] rn,
                                     double[][] rcent, double[][][] rdirs, double tol, double maxR) {
        List<double[]> ns = new ArrayList<>(), cs = new ArrayList<>(), ps = new ArrayList<>();
        List<double[][]> ds = new ArrayList<>();
        for (int i : ids) { ns.add(rn[i]); cs.add(rcent[i]); ds.add(rdirs[i]); }
        for (int p : pts) ps.add(mesh.vertex(p));
        return fitCylinder(ns, cs, ps, tol, maxR, ds);
    }

    /** Indices des points à garder (points alignés entre leurs voisins retirés). */
    public static IntList dropCollinear(double[][] P, boolean closed, double tol) {
        IntList keep = new IntList();
        for (int i = 0; i < P.length; i++) keep.add(i);
        double tol2 = tol * tol;
        int i = closed ? 0 : 1;
        while (keep.size() > (closed ? 3 : 2) && i < keep.size() - (closed ? 0 : 1)) {
            int n = keep.size();
            double[] a = P[keep.get((i - 1 + n) % n)], b = P[keep.get(i)], c = P[keep.get((i + 1) % n)];
            double[] ac = V3.sub(c, a), ab = V3.sub(b, a);
            double L2 = V3.dot(ac, ac), t = V3.dot(ab, ac);
            double[] cr = V3.cross(ab, ac);
            if (L2 > 0 && t > 0 && t < L2 && V3.dot(cr, cr) <= tol2 * L2) {
                keep.removeAt(i);
                i = Math.max(i - 1, closed ? 0 : 1);
            } else {
                i++;
            }
        }
        return keep;
    }

    static int[] cornerPoints(Mesh mesh, int[] r, int[] nb, int[] label, int rid, double tol) {
        int[] F = mesh.f;
        TreeSet<Integer> out = new TreeSet<>();
        if (r.length > 64) {
            for (int t : r) for (int k = 0; k < 3; k++) out.add(F[3 * t + k]);
            return toArr(out);
        }
        Map<Integer, Integer> nxt = new java.util.LinkedHashMap<>();
        for (int t : r) for (int k = 0; k < 3; k++) {
            int o = nb[3 * t + k];
            if (o < 0 || label[o] != rid) nxt.put(F[3 * t + k], F[3 * t + (k + 1) % 3]);
        }
        Set<Integer> seen = new HashSet<>();
        for (int s0 : new ArrayList<>(nxt.keySet())) {
            if (seen.contains(s0)) continue;
            IntList loop = new IntList();
            Integer cur = s0;
            while (cur != null && !seen.contains(cur)) {
                seen.add(cur);
                loop.add(cur);
                cur = nxt.get(cur);
            }
            if (loop.size() >= 3) {
                double[][] P = new double[loop.size()][];
                for (int i = 0; i < P.length; i++) P[i] = mesh.vertex(loop.get(i));
                IntList kept = dropCollinear(P, true, tol);
                for (int i = 0; i < kept.size(); i++) out.add(loop.get(kept.get(i)));
            } else {
                for (int i = 0; i < loop.size(); i++) out.add(loop.get(i));
            }
        }
        if (out.isEmpty()) for (int t : r) for (int k = 0; k < 3; k++) out.add(F[3 * t + k]);
        return toArr(out);
    }

    private static int[] toArr(Set<Integer> s) {
        int[] a = new int[s.size()];
        int i = 0;
        for (int x : s) a[i++] = x;
        return a;
    }

    static Face planeFace(Segmentation seg, int rid) {
        int[] r = seg.regions.get(rid);
        Mesh m = seg.mesh;
        TreeSet<Integer> all = new TreeSet<>();
        for (int t : r) for (int k = 0; k < 3; k++) all.add(m.f[3 * t + k]);
        double[] c = new double[3];
        for (int w : all) for (int k = 0; k < 3; k++) c[k] += m.v[3 * w + k];
        Face f = new Face();
        f.regions = new int[]{rid};
        f.tris = r;
        f.normal = seg.regionNormal[rid];
        f.point = V3.mul(c, 1.0 / all.size());
        f.faceted = r.length == 1 && seg.regions.size() > 1;
        return f;
    }

    static void assign(Segmentation seg) {
        int[] fot = new int[seg.mesh.nt()];
        Arrays.fill(fot, -1);
        for (int i = 0; i < seg.faces.size(); i++) for (int t : seg.faces.get(i).tris) fot[t] = i;
        seg.faceOfTri = fot;
    }

    /** Remplace des cylindres non représentables par leurs facettes planes. */
    static void demote(Segmentation seg, Set<Integer> ids) {
        List<Face> keep = new ArrayList<>();
        for (int i = 0; i < seg.faces.size(); i++) if (!ids.contains(i)) keep.add(seg.faces.get(i));
        for (int i : new TreeSet<>(ids)) for (int rid : seg.faces.get(i).regions) keep.add(planeFace(seg, rid));
        seg.faces = keep;
        assign(seg);
    }
}
