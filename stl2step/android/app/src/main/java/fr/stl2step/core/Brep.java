package fr.stl2step.core;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import fr.stl2step.core.Segmenter.Face;
import fr.stl2step.core.Segmenter.Segmentation;

/** Topologie B-rep (sommets, arêtes, boucles) à partir des faces reconnues. */
public final class Brep {
    public static final class Edge {
        public int v0, v1;
        public boolean circle;
        public int[] pts;               // sommets du maillage, de v0 à v1
        public double[] center, axis;   // cercle : parcours direct autour de axis
        public double radius;
    }

    public static final class BFace {
        public int face;
        public List<int[]> loops = new ArrayList<>();   // chaque boucle : [arête, sens(1/0)] * n à plat
        public int outer;
    }

    public Segmentation seg;
    public List<double[]> points = new ArrayList<>();
    public List<Edge> edges = new ArrayList<>();
    public List<BFace> faces = new ArrayList<>();
    public boolean closed = true;
    public int demoted;

    static final class Demote extends RuntimeException {
        final Set<Integer> ids;
        Demote(Set<Integer> ids) { super(null, null, false, false); this.ids = ids; }
    }

    public static Brep build(Segmentation seg) {
        int demoted = 0;
        for (int it = 0; it < 50; it++) {
            try {
                Brep b = buildOnce(seg);
                b.demoted = demoted;
                return b;
            } catch (Demote d) {
                demoted += d.ids.size();
                Segmenter.demote(seg, d.ids);
            }
        }
        Set<Integer> cyl = new HashSet<>();
        for (int i = 0; i < seg.faces.size(); i++) if (seg.faces.get(i).cylinder) cyl.add(i);
        if (!cyl.isEmpty()) { demoted += cyl.size(); Segmenter.demote(seg, cyl); }
        Brep b = buildOnce(seg);
        b.demoted = demoted;
        return b;
    }

    private static final class Chain {
        int face, other;
        int[] h;
        int[] pts;
    }

    private static Brep buildOnce(Segmentation seg) {
        Mesh mesh = seg.mesh;
        int[] F = mesh.f;
        int M = mesh.nt();
        int NV = mesh.nv();
        int[] fot = seg.faceOfTri;
        int[] nb = seg.nb;
        double tol = seg.tol;
        int H = 3 * M;
        int[] hs = new int[H], he = new int[H], twin = new int[H], faceH = new int[H], other = new int[H];
        for (int t = 0; t < M; t++) for (int k = 0; k < 3; k++) {
            hs[3 * t + k] = F[3 * t + k];
            he[3 * t + k] = F[3 * t + (k + 1) % 3];
            faceH[3 * t + k] = fot[t];
        }
        Arrays.fill(twin, -1);
        for (int t = 0; t < M; t++) for (int k = 0; k < 3; k++) {
            int o = nb[3 * t + k];
            if (o < 0) continue;
            int a = F[3 * t + k], b = F[3 * t + (k + 1) % 3];
            for (int kk = 0; kk < 3; kk++)
                if (F[3 * o + kk] == b && F[3 * o + (kk + 1) % 3] == a) { twin[3 * t + k] = 3 * o + kk; break; }
        }
        boolean closed = true;
        boolean[] isB = new boolean[H];
        for (int h = 0; h < H; h++) {
            if (twin[h] < 0) closed = false;
            other[h] = twin[h] >= 0 ? faceH[twin[h]] : -1;
            isB[h] = twin[h] < 0 || other[h] != faceH[h];
        }

        // coins : au moins 3 faces autour du sommet (bord libre = une face)
        boolean[] corner = new boolean[NV];
        {
            HashSet<Long> pairs = new HashSet<>();
            int[] cnt = new int[NV];
            for (int t = 0; t < M; t++) for (int k = 0; k < 3; k++) {
                int v = F[3 * t + k];
                if (pairs.add(((long) v << 32) | (fot[t] & 0xffffffffL))) cnt[v]++;
            }
            boolean[] open = new boolean[NV];
            for (int h = 0; h < H; h++) if (twin[h] < 0) { open[hs[h]] = true; open[he[h]] = true; }
            for (int v = 0; v < NV; v++) corner[v] = cnt[v] + (open[v] ? 1 : 0) >= 3;
        }
        Map<Long, IntList> outBy = new HashMap<>();
        IntList bidx = new IntList();
        for (int h = 0; h < H; h++) {
            if (!isB[h]) continue;
            bidx.add(h);
            outBy.computeIfAbsent(key(faceH[h], hs[h]), x -> new IntList()).add(h);
        }
        for (Map.Entry<Long, IntList> e : outBy.entrySet())
            if (e.getValue().size() > 1) corner[(int) (e.getKey() & 0xffffffffL)] = true;

        // boucles de bord de chaque face
        boolean[] used = new boolean[H];
        Map<Integer, List<int[]>> faceLoops = new HashMap<>();
        for (int bi = 0; bi < bidx.size(); bi++) {
            int h0 = bidx.get(bi);
            if (used[h0]) continue;
            int f = faceH[h0];
            IntList seq = new IntList();
            int h = h0;
            while (true) {
                used[h] = true;
                seq.add(h);
                int nxt = -1;
                IntList outs = outBy.get(key(f, he[h]));
                if (outs != null) for (int i = 0; i < outs.size(); i++) if (!used[outs.get(i)]) { nxt = outs.get(i); break; }
                if (nxt < 0) break;
                h = nxt;
            }
            if (he[seq.last()] != hs[seq.get(0)]) throw new IllegalStateException("boucle de bord non fermée");
            faceLoops.computeIfAbsent(f, x -> new ArrayList<>()).add(seq.toArray());
        }
        // courbes fermées sans coin
        for (List<int[]> loops : faceLoops.values()) for (int[] seq : loops) {
            int n = seq.length;
            boolean brk = false;
            for (int i = 0; i < n && !brk; i++)
                brk = corner[hs[seq[i]]] || other[seq[i]] != other[seq[(i - 1 + n) % n]];
            if (!brk) {
                double[][] P = new double[n][];
                for (int i = 0; i < n; i++) P[i] = mesh.vertex(hs[seq[i]]);
                IntList kept = Segmenter.dropCollinear(P, true, tol);
                int best = Integer.MAX_VALUE;
                for (int i = 0; i < kept.size(); i++) best = Math.min(best, hs[seq[kept.get(i)]]);
                corner[best] = true;
            }
        }
        // chaînes
        List<Chain> chains = new ArrayList<>();
        int[] chainOfH = new int[H];
        Map<Integer, List<int[]>> faceChainLoops = new HashMap<>();
        for (Map.Entry<Integer, List<int[]>> e : faceLoops.entrySet()) {
            int f = e.getKey();
            for (int[] seq : e.getValue()) {
                int n = seq.length;
                IntList starts = new IntList();
                for (int i = 0; i < n; i++)
                    if (corner[hs[seq[i]]] || other[seq[i]] != other[seq[(i - 1 + n) % n]]) starts.add(i);
                IntList cl = new IntList();
                for (int j = 0; j < starts.size(); j++) {
                    int s = starts.get(j);
                    int en = j + 1 < starts.size() ? starts.get(j + 1) : starts.get(0) + n;
                    Chain c = new Chain();
                    c.face = f;
                    c.h = new int[en - s];
                    for (int i = s; i < en; i++) c.h[i - s] = seq[i % n];
                    c.other = other[c.h[0]];
                    c.pts = new int[c.h.length + 1];
                    for (int i = 0; i < c.h.length; i++) c.pts[i] = hs[c.h[i]];
                    c.pts[c.h.length] = he[c.h[c.h.length - 1]];
                    for (int x : c.h) chainOfH[x] = chains.size();
                    cl.add(chains.size());
                    chains.add(c);
                }
                faceChainLoops.computeIfAbsent(f, x -> new ArrayList<>()).add(cl.toArray());
            }
        }

        Brep b = new Brep();
        b.seg = seg;
        b.closed = closed;
        Map<Integer, Integer> vmap = new HashMap<>();
        Map<Integer, int[]> chainEdges = new HashMap<>();
        Set<Integer> failed = new HashSet<>();
        for (int cid = 0; cid < chains.size(); cid++) {
            Chain ch = chains.get(cid);
            int f = ch.face, g = ch.other;
            if (g >= 0 && g < f) continue;
            List<Object[]> subs;
            try {
                subs = fitChain(seg, ch.pts, g >= 0 ? new int[]{f, g} : new int[]{f}, tol);
            } catch (Demote d) {
                failed.addAll(d.ids);
                continue;
            }
            int[] lst = new int[2 * subs.size()];
            for (int i = 0; i < subs.size(); i++) {
                Object[] s = subs.get(i);
                int[] p = (int[]) s[1];
                Edge e = new Edge();
                e.pts = p;
                e.v0 = vid(b, vmap, mesh, p[0]);
                e.v1 = vid(b, vmap, mesh, p[p.length - 1]);
                if (s[0] != null) {
                    double[][] geo = (double[][]) s[0];
                    e.circle = true;
                    e.center = geo[0];
                    e.axis = geo[1];
                    e.radius = geo[2][0];
                }
                lst[2 * i] = b.edges.size();
                lst[2 * i + 1] = 1;
                b.edges.add(e);
            }
            chainEdges.put(cid, lst);
            if (g >= 0) {
                int tw = chainOfH[twin[ch.h[0]]];
                int k = lst.length / 2;
                int[] rev = new int[lst.length];
                for (int i = 0; i < k; i++) {
                    rev[2 * i] = lst[2 * (k - 1 - i)];
                    rev[2 * i + 1] = 1 - lst[2 * (k - 1 - i) + 1];
                }
                chainEdges.put(tw, rev);
            }
        }
        if (!failed.isEmpty()) throw new Demote(failed);

        // recalage des sommets sur les cercles
        for (Edge e : b.edges) {
            if (!e.circle) continue;
            for (int m : new int[]{e.pts[0], e.pts[e.pts.length - 1]}) {
                int id = vmap.get(m);
                double[] d = V3.sub(b.points.get(id), e.center);
                d = V3.addMul(d, e.axis, -V3.dot(d, e.axis));
                double l = V3.norm(d);
                if (l > 0) b.points.set(id, V3.addMul(e.center, d, e.radius / l));
            }
        }

        for (int f = 0; f < seg.faces.size(); f++) {
            BFace bf = new BFace();
            bf.face = f;
            Face face = seg.faces.get(f);
            double bestA = -Double.MAX_VALUE;
            List<int[]> cls = faceChainLoops.getOrDefault(f, new ArrayList<>());
            for (int li = 0; li < cls.size(); li++) {
                IntList loop = new IntList();
                IntList poly = new IntList();
                for (int cid : cls.get(li)) {
                    int[] oe = chainEdges.get(cid);
                    for (int x : oe) loop.add(x);
                    int[] p = chains.get(cid).pts;
                    for (int i = 0; i < p.length - 1; i++) poly.add(p[i]);
                }
                bf.loops.add(loop.toArray());
                if (!face.cylinder) {
                    double a = loopArea(mesh, poly, face.normal);
                    if (a > bestA) { bestA = a; bf.outer = li; }
                }
            }
            b.faces.add(bf);
        }
        return b;
    }

    private static long key(int f, int v) { return ((long) f << 32) | (v & 0xffffffffL); }

    private static int vid(Brep b, Map<Integer, Integer> vmap, Mesh mesh, int m) {
        Integer id = vmap.get(m);
        if (id == null) {
            id = b.points.size();
            vmap.put(m, id);
            b.points.add(mesh.vertex(m));
        }
        return id;
    }

    private static double loopArea(Mesh mesh, IntList poly, double[] n) {
        int k = poly.size();
        double[] c = new double[3];
        for (int i = 0; i < k; i++) c = V3.add(c, mesh.vertex(poly.get(i)));
        c = V3.mul(c, 1.0 / k);
        double[] s = new double[3];
        for (int i = 0; i < k; i++) {
            double[] a = V3.sub(mesh.vertex(poly.get(i)), c), bb = V3.sub(mesh.vertex(poly.get((i + 1) % k)), c);
            s = V3.add(s, V3.cross(a, bb));
        }
        return 0.5 * V3.dot(s, n);
    }

    /** Liste de {géométrie (null = droite, sinon {centre, axe, {rayon}}), int[] points}. */
    private static List<Object[]> fitChain(Segmentation seg, int[] ptsIn, int[] fids, double tol) {
        Mesh mesh = seg.mesh;
        List<Integer> cyls = new ArrayList<>();
        for (int i : fids) if (seg.faces.get(i).cylinder) cyls.add(i);
        if (cyls.isEmpty()) return splitLines(mesh, ptsIn, tol);
        int[] pts = ptsIn;
        if (pts.length > 2) {
            double[][] P = new double[pts.length][];
            for (int i = 0; i < pts.length; i++) P[i] = mesh.vertex(pts[i]);
            IntList keep = Segmenter.dropCollinear(P, false, tol);
            int[] q = new int[keep.size()];
            for (int i = 0; i < q.length; i++) q[i] = pts[keep.get(i)];
            pts = q;
        }
        int n = pts.length - 1;
        double[][] P = new double[pts.length][];
        for (int i = 0; i < pts.length; i++) P[i] = mesh.vertex(pts[i]);
        char[] cls = new char[n];
        for (int i = 0; i < n; i++) {
            char c = 0;
            for (int ci : cyls) {
                Face cy = seg.faces.get(ci);
                double[] d = V3.sub(P[i + 1], P[i]);
                double[] perp = V3.addMul(d, cy.axis, -V3.dot(d, cy.axis));
                char k;
                if (V3.norm(perp) <= tol) k = 'L';
                else {
                    double[] pa = V3.sub(P[i], cy.point), pb = V3.sub(P[i + 1], cy.point);
                    double ha = V3.dot(pa, cy.axis), hb = V3.dot(pb, cy.axis);
                    double ra = V3.norm(V3.addMul(pa, cy.axis, -ha)), rb = V3.norm(V3.addMul(pb, cy.axis, -hb));
                    if (Math.abs(ha - hb) <= tol && Math.abs(ra - cy.radius) <= tol
                            && Math.abs(rb - cy.radius) <= tol && cyls.size() == 1) k = 'A';
                    else { c = 0; k = 0; }
                }
                if (k == 0 || (c != 0 && c != k)) { c = 0; break; }
                c = k;
            }
            if (c == 0) {
                int worst = cyls.get(0);
                for (int ci : cyls) if (seg.faces.get(ci).tris.length < seg.faces.get(worst).tris.length) worst = ci;
                Set<Integer> s = new HashSet<>();
                s.add(worst);
                throw new Demote(s);
            }
            cls[i] = c;
        }
        List<Object[]> out = new ArrayList<>();
        int i = 0;
        while (i < n) {
            int j = i;
            if (cls[i] == 'L') {
                while (j + 1 < n && cls[j + 1] == 'L') j++;
                out.addAll(splitLines(mesh, Arrays.copyOfRange(pts, i, j + 2), tol));
            } else {
                Face c = seg.faces.get(cyls.get(0));
                double sgn = turn(P[i], P[i + 1], c);
                while (j + 1 < n && cls[j + 1] == 'A' && turn(P[j + 1], P[j + 2], c) * sgn > 0
                        && Math.abs(V3.dot(V3.sub(P[j + 2], P[i]), c.axis)) <= tol) j++;
                double hm = 0;
                for (int k = i; k <= j + 1; k++) hm += V3.dot(V3.sub(P[k], c.point), c.axis);
                hm /= (j + 2 - i);
                double[] center = V3.addMul(c.point, c.axis, hm);
                double[] ax = sgn > 0 ? c.axis : V3.mul(c.axis, -1);
                out.add(new Object[]{new double[][]{center, ax, {c.radius}}, Arrays.copyOfRange(pts, i, j + 2)});
            }
            i = j + 1;
        }
        return out;
    }

    private static double turn(double[] a, double[] b, Face c) {
        return V3.dot(V3.cross(V3.sub(a, c.point), V3.sub(b, c.point)), c.axis);
    }

    private static List<Object[]> splitLines(Mesh mesh, int[] pts, double tol) {
        List<Object[]> out = new ArrayList<>();
        int n = pts.length - 1;
        int i = 0;
        while (i < n) {
            int j = i + 1;
            while (j + 1 <= n) {
                double[] a = mesh.vertex(pts[i]), d = V3.sub(mesh.vertex(pts[j + 1]), a);
                double L = V3.norm(d);
                if (L == 0) break;
                double[] du = V3.mul(d, 1 / L);
                boolean ok = true;
                for (int k = i + 1; k <= j && ok; k++) {
                    double[] m = V3.sub(mesh.vertex(pts[k]), a);
                    double along = V3.dot(m, du);
                    if (V3.norm(V3.cross(m, du)) > tol || along <= 0 || along >= L) ok = false;
                }
                if (ok) j++;
                else break;
            }
            out.add(new Object[]{null, Arrays.copyOfRange(pts, i, j + 1)});
            i = j;
        }
        return out;
    }
}
