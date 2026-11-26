package fr.stl2step.core;

import java.util.HashMap;
import java.util.Map;

/** Maillage indexé : sommets soudés, triangles orientés. */
public final class Mesh {
    public static final int MAX_TRIANGLES = 120_000;

    public final double[] v;   // 3 * nv
    public final int[] f;      // 3 * nt
    private double[] normals, areas;
    private Map<Long, int[]> edgeMap;

    public Mesh(double[] v, int[] f) { this.v = v; this.f = f; }

    public int nv() { return v.length / 3; }
    public int nt() { return f.length / 3; }

    public double[] vertex(int i) { return new double[]{v[3 * i], v[3 * i + 1], v[3 * i + 2]}; }

    public double[] normals() {
        if (normals == null) computeNormals();
        return normals;
    }

    public double[] areas() {
        if (areas == null) computeNormals();
        return areas;
    }

    public double[] normal(int t) {
        double[] n = normals();
        return new double[]{n[3 * t], n[3 * t + 1], n[3 * t + 2]};
    }

    private void computeNormals() {
        int nt = nt();
        normals = new double[3 * nt];
        areas = new double[nt];
        for (int t = 0; t < nt; t++) {
            double[] a = vertex(f[3 * t]), b = vertex(f[3 * t + 1]), c = vertex(f[3 * t + 2]);
            double[] n = V3.cross(V3.sub(b, a), V3.sub(c, a));
            double l = V3.norm(n);
            areas[t] = 0.5 * l;
            if (l == 0) l = 1;
            normals[3 * t] = n[0] / l;
            normals[3 * t + 1] = n[1] / l;
            normals[3 * t + 2] = n[2] / l;
        }
    }

    public double[] min() {
        double[] m = {Double.MAX_VALUE, Double.MAX_VALUE, Double.MAX_VALUE};
        for (int i = 0; i < v.length; i++) m[i % 3] = Math.min(m[i % 3], v[i]);
        return m;
    }

    public double[] max() {
        double[] m = {-Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
        for (int i = 0; i < v.length; i++) m[i % 3] = Math.max(m[i % 3], v[i]);
        return m;
    }

    public double diagonal() { return nv() == 0 ? 0 : V3.dist(max(), min()); }

    public double area() {
        double s = 0;
        for (double a : areas()) s += a;
        return s;
    }

    public double volume() {
        double s = 0;
        for (int t = 0; t < nt(); t++) {
            double[] a = vertex(f[3 * t]), b = vertex(f[3 * t + 1]), c = vertex(f[3 * t + 2]);
            s += V3.dot(a, V3.cross(b, c));
        }
        return s / 6.0;
    }

    static long edgeKey(int a, int b) {
        int lo = Math.min(a, b), hi = Math.max(a, b);
        return ((long) lo << 32) | (hi & 0xffffffffL);
    }

    /** Arête non orientée -> [n, t0, k0, t1, k1, ...]. */
    public Map<Long, int[]> edgeMap() {
        if (edgeMap == null) {
            HashMap<Long, int[]> m = new HashMap<>(nt() * 2);
            for (int t = 0; t < nt(); t++) {
                for (int k = 0; k < 3; k++) {
                    long key = edgeKey(f[3 * t + k], f[3 * t + (k + 1) % 3]);
                    int[] r = m.get(key);
                    if (r == null) {
                        r = new int[5];
                        m.put(key, r);
                    } else if (2 * r[0] + 1 >= r.length) {
                        int[] g = new int[r.length * 2 + 1];
                        System.arraycopy(r, 0, g, 0, r.length);
                        r = g;
                        m.put(key, r);
                    }
                    r[1 + 2 * r[0]] = t;
                    r[2 + 2 * r[0]] = k;
                    r[0]++;
                }
            }
            edgeMap = m;
        }
        return edgeMap;
    }

    public int openEdgeCount() {
        int c = 0;
        for (int[] r : edgeMap().values()) if (r[0] != 2) c++;
        return c;
    }

    // ------------------------------------------------------------------ build
    /** Soude les sommets identiques et supprime les triangles dégénérés. */
    public static Mesh fromTriangles(double[] tri) {
        int n = tri.length / 3;
        if (n == 0) return new Mesh(new double[0], new int[0]);
        double[] lo = {Double.MAX_VALUE, Double.MAX_VALUE, Double.MAX_VALUE};
        double[] hi = {-Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
        for (int i = 0; i < tri.length; i++) {
            lo[i % 3] = Math.min(lo[i % 3], tri[i]);
            hi[i % 3] = Math.max(hi[i % 3], tri[i]);
        }
        double span = V3.dist(hi, lo);
        if (span == 0) span = 1;
        double q = span * 1e-9;
        HashMap<Key, Integer> map = new HashMap<>(n);
        double[] verts = new double[tri.length];
        int[] idx = new int[n];
        int nv = 0;
        for (int i = 0; i < n; i++) {
            Key k = new Key(Math.round(tri[3 * i] / q), Math.round(tri[3 * i + 1] / q), Math.round(tri[3 * i + 2] / q));
            Integer id = map.get(k);
            if (id == null) {
                id = nv++;
                map.put(k, id);
                System.arraycopy(tri, 3 * i, verts, 3 * id, 3);
            }
            idx[i] = id;
        }
        int nt = n / 3;
        double maxA = 0;
        double[] ar = new double[nt];
        for (int t = 0; t < nt; t++) {
            int a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
            if (a == b || b == c || a == c) { ar[t] = -1; continue; }
            double[] pa = {verts[3 * a], verts[3 * a + 1], verts[3 * a + 2]};
            double[] pb = {verts[3 * b], verts[3 * b + 1], verts[3 * b + 2]};
            double[] pc = {verts[3 * c], verts[3 * c + 1], verts[3 * c + 2]};
            ar[t] = V3.norm(V3.cross(V3.sub(pb, pa), V3.sub(pc, pa)));
            maxA = Math.max(maxA, ar[t]);
        }
        int[] remap = new int[nv];
        java.util.Arrays.fill(remap, -1);
        int[] faces = new int[3 * nt];
        int m = 0, used = 0;
        double[] outV = new double[3 * nv];
        for (int t = 0; t < nt; t++) {
            if (!(ar[t] > maxA * 1e-12)) continue;
            for (int k = 0; k < 3; k++) {
                int o = idx[3 * t + k];
                if (remap[o] < 0) {
                    remap[o] = used;
                    System.arraycopy(verts, 3 * o, outV, 3 * used, 3);
                    used++;
                }
                faces[3 * m + k] = remap[o];
            }
            m++;
        }
        return new Mesh(java.util.Arrays.copyOf(outV, 3 * used), java.util.Arrays.copyOf(faces, 3 * m));
    }

    private static final class Key {
        final long x, y, z;
        Key(long x, long y, long z) { this.x = x; this.y = y; this.z = z; }
        @Override public boolean equals(Object o) {
            if (!(o instanceof Key)) return false;
            Key k = (Key) o;
            return x == k.x && y == k.y && z == k.z;
        }
        @Override public int hashCode() {
            long h = x * 73856093L ^ y * 19349663L ^ z * 83492791L;
            return (int) (h ^ (h >>> 32));
        }
    }

    /** Triangles à plat (9 doubles par triangle). */
    public double[] triangles() {
        double[] out = new double[9 * nt()];
        for (int i = 0; i < f.length; i++) System.arraycopy(v, 3 * f[i], out, 3 * i, 3);
        return out;
    }

    public String info() {
        double[] lo = min(), hi = max();
        return String.format(java.util.Locale.FRANCE,
                "%d triangles\nDimensions : %.3f × %.3f × %.3f mm\nX %.3f → %.3f\nY %.3f → %.3f\nZ %.3f → %.3f\n"
                        + "Surface : %.2f mm²\nVolume : %.2f mm³\nArêtes ouvertes : %d",
                nt(), hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], lo[0], hi[0], lo[1], hi[1], lo[2], hi[2],
                area(), Math.abs(volume()), openEdgeCount());
    }
}
