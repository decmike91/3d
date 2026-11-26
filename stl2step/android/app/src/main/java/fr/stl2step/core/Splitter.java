package fr.stl2step.core;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Découpe d'un maillage en deux pièces avec plots de jonction
 * (même algorithme que stl2step/split.py).
 * Modes : MALE (plots sur la pièce basse, trous dans la haute), PINS (trous des deux côtés
 * + goupilles séparées), NONE (découpe simple rebouchée).
 */
public final class Splitter {
    private Splitter() {}

    public static final int MALE = 0, PINS = 1, NONE = 2;
    static final int[][] AX_BASIS = {{1, 2}, {2, 0}, {0, 1}};

    public static final class Settings {
        public int mode = MALE;
        public double diameter = 5, length = 6, clearance = 0.15, extraDepth = 0.5, chamfer = 0.5, wall = 1.2;
        public int perIsland = 2, segments = 32;
        public List<double[]> positions;      // centres imposés (u, v), ou null
    }

    public static final class Result {
        public Mesh low, high, pins;
        public List<double[]> centers = new ArrayList<>();
        public List<String> warnings = new ArrayList<>();
        public int axis;
        public double h;
    }

    // ------------------------------------------------------------- géométrie
    static double rayFirstHit(Mesh m, double[] o, double[] d) {
        double best = Double.POSITIVE_INFINITY;
        for (int t = 0; t < m.nt(); t++) {
            double[] a = m.vertex(m.f[3 * t]), b = m.vertex(m.f[3 * t + 1]), c = m.vertex(m.f[3 * t + 2]);
            double[] e1 = V3.sub(b, a), e2 = V3.sub(c, a), p = V3.cross(d, e2);
            double det = V3.dot(e1, p);
            if (Math.abs(det) < 1e-15) continue;
            double inv = 1 / det;
            double[] s = V3.sub(o, a);
            double u = V3.dot(s, p) * inv;
            if (u < -1e-9 || u > 1 + 1e-9) continue;
            double[] q = V3.cross(s, e1);
            double v = V3.dot(d, q) * inv;
            if (v < -1e-9 || u + v > 1 + 1e-9) continue;
            double tt = V3.dot(e2, q) * inv;
            if (tt > 1e-7 && tt < best) best = tt;
        }
        return best;
    }

    static double edgeDist(double[] p, List<double[][]> loops) {
        double best = Double.MAX_VALUE;
        for (double[][] q : loops) {
            for (int i = 0; i < q.length; i++) {
                double[] a = q[i], b = q[(i + 1) % q.length];
                double abx = b[0] - a[0], aby = b[1] - a[1];
                double L2 = Math.max(abx * abx + aby * aby, 1e-300);
                double t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / L2));
                best = Math.min(best, Math.hypot(p[0] - a[0] - t * abx, p[1] - a[1] - t * aby));
            }
        }
        return best;
    }

    /** Zones : extérieur (aire > 0) -> trous (aire < 0) qu'il contient. */
    static Map<Integer, List<Integer>> islands(List<double[][]> loops) {
        int n = loops.size();
        double[] ar = new double[n];
        for (int i = 0; i < n; i++) ar[i] = Cutter.area(loops.get(i));
        Map<Integer, List<Integer>> g = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) if (ar[i] > 0) g.put(i, new ArrayList<>());
        for (int h = 0; h < n; h++) {
            if (ar[h] >= 0) continue;
            int best = -1;
            for (int o : g.keySet())
                if (Cutter.inside(loops.get(h)[0], loops.get(o)) && (best < 0 || ar[o] < ar[best])) best = o;
            if (best >= 0) g.get(best).add(h);
        }
        return g;
    }

    /** Contours du bord ouvert dans le plan, inversés : {3D, 2D}. */
    static List<double[][][]> planeLoops(Mesh open, double[] p0, double[] n, double[] ub, double[] vb, double tol) {
        List<double[][][]> out = new ArrayList<>();
        for (int[] lp : Cutter.boundaryLoops(open)) {
            boolean ok = true;
            for (int x : lp) if (Math.abs(V3.dot(V3.sub(open.vertex(x), p0), n)) > tol) { ok = false; break; }
            if (!ok) continue;
            int L = lp.length;
            double[][] P = new double[L][], q = new double[L][];
            for (int i = 0; i < L; i++) {
                P[i] = open.vertex(lp[L - 1 - i]);
                double[] r = V3.sub(P[i], p0);
                q[i] = new double[]{V3.dot(r, ub), V3.dot(r, vb)};
            }
            out.add(new double[][][]{P, q});
        }
        return out;
    }

    static double[][] circle(double[] c, double[] ub, double[] vb, double r, int nseg) {
        double[][] out = new double[nseg][];
        for (int i = 0; i < nseg; i++) {
            double th = 2 * Math.PI * i / nseg;
            out[i] = V3.addMul(V3.addMul(c, ub, r * Math.cos(th)), vb, r * Math.sin(th));
        }
        return out;
    }

    private static double[][] reverse(double[][] a) {
        double[][] b = new double[a.length][];
        for (int i = 0; i < a.length; i++) b[i] = a[a.length - 1 - i];
        return b;
    }

    /** Bouchon : triangles ajoutés à tris ; renvoie les cercles orientés tels qu'utilisés. */
    static List<double[][]> cap(List<double[][][]> loops, List<double[][]> circles, double[] p0, double[] ub,
                                double[] vb, Cutter.DoubleList tris) {
        List<double[][]> q2 = new ArrayList<>(), q3 = new ArrayList<>(), oriented = new ArrayList<>();
        for (double[][][] l : loops) { q3.add(l[0]); q2.add(l[1]); }
        for (double[][] C : circles) {
            double[][] q = new double[C.length][];
            for (int i = 0; i < C.length; i++) {
                double[] r = V3.sub(C[i], p0);
                q[i] = new double[]{V3.dot(r, ub), V3.dot(r, vb)};
            }
            if (Cutter.area(q) > 0) { C = reverse(C); q = reverse(q); }
            oriented.add(C);
            q3.add(C);
            q2.add(q);
        }
        for (Map.Entry<Integer, List<Integer>> e : islands(q2).entrySet()) {
            List<double[]> outer2 = new ArrayList<>(Arrays.asList(q2.get(e.getKey())));
            List<double[]> outer3 = new ArrayList<>(Arrays.asList(q3.get(e.getKey())));
            List<Integer> hs = new ArrayList<>(e.getValue());
            hs.sort((x, y) -> Double.compare(maxX(q2.get(y)), maxX(q2.get(x))));
            for (int h : hs) Cutter.bridge(outer2, outer3, q2.get(h), q3.get(h));
            for (int[] t : Cutter.earclip(outer2)) for (int k : t) tris.add(outer3.get(k));
        }
        return oriented;
    }

    private static double maxX(double[][] q) {
        double m = -Double.MAX_VALUE;
        for (double[] p : q) m = Math.max(m, p[0]);
        return m;
    }

    /** Paroi d'un plot ou d'un trou depuis le cercle orienté R, fermée par un disque. rings : {distance, rayon}. */
    static void walls(double[][] R, double[] c, double[] dvec, double[][] rings, Cutter.DoubleList tris) {
        int n = R.length;
        double[][] dirs = new double[n][];
        for (int i = 0; i < n; i++) dirs[i] = V3.unit(V3.sub(R[i], c));
        double[][] A = R;
        for (double[] ring : rings) {
            double[][] B = new double[n][];
            for (int i = 0; i < n; i++) B[i] = V3.addMul(V3.addMul(c, dvec, ring[0]), dirs[i], ring[1]);
            for (int i = 0; i < n; i++) {
                int j = (i + 1) % n;
                tris.add(A[j]); tris.add(A[i]); tris.add(B[i]);
                tris.add(A[j]); tris.add(B[i]); tris.add(B[j]);
            }
            A = B;
        }
        double[] ce = V3.addMul(c, dvec, rings[rings.length - 1][0]);
        for (int i = 0; i < n; i++) {
            int j = (i + 1) % n;
            tris.add(ce); tris.add(A[j]); tris.add(A[i]);
        }
    }

    /** Goupille debout (axe z, base en z = 0), chanfreinée aux deux bouts. */
    public static Mesh pin(double diameter, double length, double chamfer, int nseg) {
        double r = diameter / 2, ch = Math.min(chamfer, Math.min(r * 0.4, length * 0.2));
        double[][] rings = {{0, r - ch}, {ch, r}, {length - ch, r}, {length, r - ch}};
        double[][][] R = new double[rings.length][nseg][];
        for (int k = 0; k < rings.length; k++)
            for (int i = 0; i < nseg; i++) {
                double th = 2 * Math.PI * i / nseg;
                R[k][i] = new double[]{rings[k][1] * Math.cos(th), rings[k][1] * Math.sin(th), rings[k][0]};
            }
        Cutter.DoubleList t = new Cutter.DoubleList();
        for (int k = 0; k + 1 < rings.length; k++)
            for (int i = 0; i < nseg; i++) {
                int j = (i + 1) % nseg;
                double[][] a = R[k], b = R[k + 1];
                t.add(a[i]); t.add(a[j]); t.add(b[j]);
                t.add(a[i]); t.add(b[j]); t.add(b[i]);
            }
        double[] c0 = {0, 0, 0}, c1 = {0, 0, length};
        for (int i = 0; i < nseg; i++) {
            int j = (i + 1) % nseg;
            t.add(c0); t.add(R[0][j]); t.add(R[0][i]);
            t.add(c1); t.add(R[rings.length - 1][i]); t.add(R[rings.length - 1][j]);
        }
        return Mesh.fromTriangles(t.toArray());
    }

    private interface Check { boolean ok(double[] c2); }

    static List<double[]> chooseCenters(List<double[][]> outerHoles0, List<List<double[][]>> zones, Settings s,
                                        Check thick, double R) {
        double need = R + s.wall;
        List<double[]> all = new ArrayList<>();
        for (List<double[][]> zone : zones) {
            double[][] outer = zone.get(0);
            double[] lo = {Double.MAX_VALUE, Double.MAX_VALUE}, hi = {-Double.MAX_VALUE, -Double.MAX_VALUE};
            for (double[] p : outer) for (int k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
            double sx = hi[0] - lo[0], sy = hi[1] - lo[1];
            double step = Math.max(Math.max(Math.min(sx, sy) / 30, Math.max(sx, sy) / 60), Math.max(need / 3, 1e-3));
            List<double[]> G = new ArrayList<>();
            List<Double> ED = new ArrayList<>();
            for (double x = lo[0] + step / 2; x < hi[0]; x += step)
                for (double y = lo[1] + step / 2; y < hi[1]; y += step) {
                    double[] p = {x, y};
                    if (!Cutter.inside(p, outer)) continue;
                    boolean inHole = false;
                    for (int i = 1; i < zone.size() && !inHole; i++) inHole = Cutter.inside(p, zone.get(i));
                    if (inHole) continue;
                    double ed = edgeDist(p, zone);
                    if (ed >= need) { G.add(p); ED.add(ed); }
                }
            if (G.isEmpty()) continue;
            double maxEd = 0;
            for (double e : ED) maxEd = Math.max(maxEd, e);
            double lim = need + 0.35 * (maxEd - need);
            List<double[]> G2 = new ArrayList<>();
            List<Double> E2 = new ArrayList<>();
            for (int i = 0; i < G.size(); i++) if (ED.get(i) >= lim) { G2.add(G.get(i)); E2.add(ED.get(i)); }
            G = G2;
            ED = E2;
            double mx = 0, my = 0;
            for (double[] p : G) { mx += p[0]; my += p[1]; }
            mx /= G.size(); my /= G.size();
            Map<Integer, Boolean> cache = new HashMap<>();
            List<double[]> chosen = new ArrayList<>();
            for (int k = 0; k < Math.max(1, s.perIsland); k++) {
                double[] score = new double[G.size()];
                for (int i = 0; i < G.size(); i++) {
                    double[] p = G.get(i);
                    if (k == 0) score[i] = s.perIsland == 1 ? ED.get(i) : Math.hypot(p[0] - mx, p[1] - my) + 1e-3 * ED.get(i);
                    else {
                        double dmin = Double.MAX_VALUE;
                        for (double[] c : chosen) dmin = Math.min(dmin, Math.hypot(p[0] - c[0], p[1] - c[1]));
                        score[i] = dmin >= 2 * R + s.wall ? dmin : -1;
                    }
                }
                Integer[] ord = new Integer[G.size()];
                for (int i = 0; i < ord.length; i++) ord[i] = i;
                final double[] sc = score;
                Arrays.sort(ord, (a, b) -> Double.compare(sc[b], sc[a]));
                int pick = -1;
                for (int i : ord) {
                    if (sc[i] < 0) break;
                    final List<double[]> GG = G;
                    if (cache.computeIfAbsent(i, x -> thick.ok(GG.get(x)))) { pick = i; break; }
                }
                if (pick < 0) break;
                chosen.add(G.get(pick));
            }
            all.addAll(chosen);
        }
        return all;
    }

    // --------------------------------------------------------------- découpe
    public static Result split(Mesh mesh, int axis, double h, Settings s) {
        int iu = AX_BASIS[axis][0], iv = AX_BASIS[axis][1];
        double[] n = new double[3], u = new double[3], v = new double[3];
        n[axis] = 1; u[iu] = 1; v[iv] = 1;
        double[] p0 = V3.mul(n, h);
        double tol = Math.max(mesh.diagonal() * 1e-6, 1e-9) * 100;
        Mesh low = Cutter.cut(mesh, p0, n, false, false);
        Mesh high = Cutter.cut(mesh, p0, n, true, false);
        if (low.nt() == 0 || high.nt() == 0)
            throw new IllegalArgumentException("Le plan ne coupe pas la pièce : choisissez une position entre les deux extrémités.");
        Result res = new Result();
        res.axis = axis;
        res.h = h;
        double[] mn = V3.mul(n, -1);
        List<double[][][]> loopsA = planeLoops(low, p0, n, u, v, tol);
        List<double[][][]> loopsB = planeLoops(high, p0, mn, v, u, tol);

        double r = s.diameter / 2, R = r + s.clearance;
        int nseg = Math.max(8, s.segments);
        final double needHi, needLo;
        if (s.mode == MALE) { needHi = s.length + s.extraDepth + s.wall; needLo = 0; }
        else if (s.mode == PINS) { needHi = needLo = s.length / 2 + s.extraDepth + s.wall; }
        else { needHi = needLo = 0; }
        Check thick = c2 -> {
            double[] c3 = V3.addMul(V3.addMul(p0, u, c2[0]), v, c2[1]);
            List<double[]> pts = new ArrayList<>();
            pts.add(c3);
            pts.addAll(Arrays.asList(circle(c3, u, v, R, 6)));
            for (double[] q : pts) {
                if (needHi > 0 && rayFirstHit(mesh, q, n) < needHi) return false;
                if (needLo > 0 && rayFirstHit(mesh, q, mn) < needLo) return false;
            }
            return true;
        };

        List<double[]> centers = new ArrayList<>();
        if (s.mode != NONE) {
            List<double[][]> l2 = new ArrayList<>();
            for (double[][][] l : loopsA) l2.add(l[1]);
            List<List<double[][]>> zones = new ArrayList<>();
            for (Map.Entry<Integer, List<Integer>> e : islands(l2).entrySet()) {
                List<double[][]> z = new ArrayList<>();
                z.add(l2.get(e.getKey()));
                for (int hh : e.getValue()) z.add(l2.get(hh));
                zones.add(z);
            }
            if (s.positions != null && !s.positions.isEmpty()) {
                for (double[] c : s.positions) {
                    List<double[][]> zone = null;
                    for (List<double[][]> z : zones) {
                        if (!Cutter.inside(c, z.get(0))) continue;
                        boolean inHole = false;
                        for (int i = 1; i < z.size(); i++) inHole |= Cutter.inside(c, z.get(i));
                        if (!inHole) { zone = z; break; }
                    }
                    String at = String.format(Locale.FRANCE, "(%.2f ; %.2f)", c[0], c[1]);
                    if (zone == null) { res.warnings.add("Plot " + at + " hors de la section : ignoré."); continue; }
                    if (edgeDist(c, zone) < R + s.wall) res.warnings.add("Plot " + at + " trop près d'un bord.");
                    if (!thick.ok(c)) res.warnings.add("Plot " + at + " : matière trop fine pour le trou.");
                    centers.add(c);
                }
            } else {
                centers = chooseCenters(l2, zones, s, thick, R);
                if (centers.isEmpty())
                    res.warnings.add("Aucun plot ne tient dans cette section : réduisez le diamètre, la longueur "
                            + "ou l'épaisseur de paroi, ou déplacez le plan de coupe.");
            }
        }
        res.centers = centers;
        List<double[]> c3s = new ArrayList<>();
        for (double[] c : centers) c3s.add(V3.addMul(V3.addMul(p0, u, c[0]), v, c[1]));

        // pièce basse
        Cutter.DoubleList ta = new Cutter.DoubleList();
        ta.add(low.triangles());
        double ra = s.mode == MALE ? r : R;
        List<double[][]> circA = new ArrayList<>();
        for (double[] c3 : c3s) circA.add(circle(c3, u, v, ra, nseg));
        List<double[][]> orA = cap(loopsA, circA, p0, u, v, ta);
        for (int i = 0; i < orA.size(); i++) {
            if (s.mode == MALE) {
                double ch = Math.min(s.chamfer, Math.min(r * 0.4, s.length * 0.3));
                walls(orA.get(i), c3s.get(i), n, new double[][]{{s.length - ch, r}, {s.length, r - ch}}, ta);
            } else {
                walls(orA.get(i), c3s.get(i), mn, new double[][]{{s.length / 2 + s.extraDepth, R}}, ta);
            }
        }
        // pièce haute
        Cutter.DoubleList tb = new Cutter.DoubleList();
        tb.add(high.triangles());
        List<double[][]> circB = new ArrayList<>();
        for (double[] c3 : c3s) circB.add(circle(c3, v, u, R, nseg));
        List<double[][]> orB = cap(loopsB, circB, p0, v, u, tb);
        double depth = s.mode == MALE ? s.length + s.extraDepth : s.length / 2 + s.extraDepth;
        for (int i = 0; i < orB.size(); i++) walls(orB.get(i), c3s.get(i), n, new double[][]{{depth, R}}, tb);

        res.low = Mesh.fromTriangles(ta.toArray());
        res.high = Mesh.fromTriangles(tb.toArray());
        if (s.mode == PINS && !centers.isEmpty()) {
            Mesh one = pin(s.diameter, s.length, s.chamfer, nseg);
            double[] lo = mesh.min(), hi = mesh.max();
            double[] tri = one.triangles();
            Cutter.DoubleList tp = new Cutter.DoubleList();
            for (int k = 0; k < centers.size(); k++) {
                double[] off = {hi[0] + 5 + r + k * (s.diameter + 4), lo[1] + r, lo[2]};
                double[] t2 = tri.clone();
                for (int i = 0; i < t2.length; i++) t2[i] += off[i % 3];
                tp.add(t2);
            }
            res.pins = Mesh.fromTriangles(tp.toArray());
        }
        if (res.low.openEdgeCount() > 0)
            res.warnings.add("Pièce basse : " + res.low.openEdgeCount() + " arête(s) ouverte(s) (STL d'origine non fermé ?).");
        if (res.high.openEdgeCount() > 0)
            res.warnings.add("Pièce haute : " + res.high.openEdgeCount() + " arête(s) ouverte(s) (STL d'origine non fermé ?).");
        return res;
    }

    /** Pièces écartées pour l'aperçu : {basse, haute, goupilles?} déplacées le long de l'axe. */
    public static Mesh[] exploded(Result r) {
        double gap = Math.max(r.low.diagonal(), r.high.diagonal()) * 0.15;
        Mesh a = shifted(r.low, r.axis, -gap / 2), b = shifted(r.high, r.axis, gap / 2);
        return r.pins == null ? new Mesh[]{a, b} : new Mesh[]{a, b, r.pins};
    }

    static Mesh shifted(Mesh m, int axis, double d) {
        double[] v = m.v.clone();
        for (int i = axis; i < v.length; i += 3) v[i] += d;
        return new Mesh(v, m.f);
    }

    /** Assemble plusieurs maillages (sans soudure) ; part[t] = indice du maillage d'origine du triangle t. */
    public static Mesh concat(Mesh[] ms, int[][] partOut) {
        int nv = 0, nf = 0;
        for (Mesh m : ms) { nv += m.v.length; nf += m.f.length; }
        double[] v = new double[nv];
        int[] f = new int[nf];
        int[] part = new int[nf / 3];
        int ov = 0, of = 0;
        for (int k = 0; k < ms.length; k++) {
            Mesh m = ms[k];
            System.arraycopy(m.v, 0, v, ov, m.v.length);
            for (int i = 0; i < m.f.length; i++) f[of + i] = m.f[i] + ov / 3;
            for (int t = 0; t < m.nt(); t++) part[of / 3 + t] = k;
            ov += m.v.length;
            of += m.f.length;
        }
        if (partOut != null) partOut[0] = part;
        return new Mesh(v, f);
    }
}
