package fr.stl2step.app;

import java.util.Map;

import fr.stl2step.core.Brep;
import fr.stl2step.core.Converter;
import fr.stl2step.core.Mesh;
import fr.stl2step.core.Segmenter;
import fr.stl2step.core.V3;

/** Prépare les tampons d'affichage (sans OpenGL : utilisable hors du fil d'affichage). */
final class SceneBuilder {
    private SceneBuilder() {}

    static final float[] BASE = {0.62f, 0.68f, 0.78f};
    static final float[] PLANE = {0.25f, 0.50f, 0.92f};
    static final float[] CYL = {0.96f, 0.56f, 0.16f};
    static final float[] FACET = {0.60f, 0.60f, 0.60f};

    static MeshView.Scene build(Mesh m, Converter res) {
        MeshView.Scene s = new MeshView.Scene();
        int nt = m.nt();
        double[] n = m.normals();
        float[][] faceCol = null;
        int[] fot = null;
        if (res != null) {
            fot = res.seg.faceOfTri;
            faceCol = new float[res.seg.faces.size()][];
            for (int i = 0; i < faceCol.length; i++) {
                Segmenter.Face f = res.seg.faces.get(i);
                float k = 0.72f + 0.28f * (float) (((i * 2654435761L) >>> 8) % 1000) / 1000f;
                float[] b = f.cylinder ? CYL : (f.faceted ? FACET : PLANE);
                faceCol[i] = new float[]{b[0] * k, b[1] * k, b[2] * k};
            }
        }
        float[] t = new float[nt * 36];
        int o = 0;
        for (int i = 0; i < nt; i++) {
            float[] mc = faceCol != null && fot[i] >= 0 ? faceCol[fot[i]] : BASE;
            for (int k = 0; k < 3; k++) {
                int v = m.f[3 * i + k];
                t[o++] = (float) m.v[3 * v];
                t[o++] = (float) m.v[3 * v + 1];
                t[o++] = (float) m.v[3 * v + 2];
                t[o++] = (float) n[3 * i];
                t[o++] = (float) n[3 * i + 1];
                t[o++] = (float) n[3 * i + 2];
                t[o++] = BASE[0];
                t[o++] = BASE[1];
                t[o++] = BASE[2];
                t[o++] = mc[0];
                t[o++] = mc[1];
                t[o++] = mc[2];
            }
        }
        s.tris = t;
        s.hasMap = res != null;

        Map<Long, int[]> em = m.edgeMap();
        float[] all = new float[em.size() * 6];
        int a = 0;
        double cosSharp = Math.cos(Math.toRadians(30));
        int sharpCount = 0;
        for (Map.Entry<Long, int[]> e : em.entrySet()) {
            int v0 = (int) (e.getKey() >>> 32), v1 = (int) (e.getKey() & 0xffffffffL);
            all[a++] = (float) m.v[3 * v0]; all[a++] = (float) m.v[3 * v0 + 1]; all[a++] = (float) m.v[3 * v0 + 2];
            all[a++] = (float) m.v[3 * v1]; all[a++] = (float) m.v[3 * v1 + 1]; all[a++] = (float) m.v[3 * v1 + 2];
            int[] r = e.getValue();
            if (r[0] != 2 || V3.dot(m.normal(r[1]), m.normal(r[3])) < cosSharp) sharpCount++;
        }
        s.allEdges = all;

        if (res != null) {
            int cnt = 0;
            for (Brep.Edge e : res.brep.edges) cnt += e.pts.length - 1;
            float[] ed = new float[cnt * 6];
            int q = 0;
            for (Brep.Edge e : res.brep.edges) {
                for (int i = 0; i + 1 < e.pts.length; i++) {
                    for (int j = 0; j < 2; j++) {
                        int v = e.pts[i + j];
                        ed[q++] = (float) m.v[3 * v];
                        ed[q++] = (float) m.v[3 * v + 1];
                        ed[q++] = (float) m.v[3 * v + 2];
                    }
                }
            }
            s.edges = ed;
        } else {
            float[] ed = new float[sharpCount * 6];
            int q = 0;
            for (Map.Entry<Long, int[]> e : em.entrySet()) {
                int[] r = e.getValue();
                if (!(r[0] != 2 || V3.dot(m.normal(r[1]), m.normal(r[3])) < cosSharp)) continue;
                int v0 = (int) (e.getKey() >>> 32), v1 = (int) (e.getKey() & 0xffffffffL);
                ed[q++] = (float) m.v[3 * v0]; ed[q++] = (float) m.v[3 * v0 + 1]; ed[q++] = (float) m.v[3 * v0 + 2];
                ed[q++] = (float) m.v[3 * v1]; ed[q++] = (float) m.v[3 * v1 + 1]; ed[q++] = (float) m.v[3 * v1 + 2];
            }
            s.edges = ed;
        }
        double[] lo = m.min(), hi = m.max();
        for (int k = 0; k < 3; k++) s.center[k] = (float) ((lo[k] + hi[k]) / 2);
        s.radius = (float) (V3.dist(hi, lo) / 2);
        return s;
    }

    /** Intersection rayon / maillage (Möller–Trumbore) : point le plus proche ou null. */
    static double[] pick(Mesh m, float[] o, float[] d) {
        double best = Double.MAX_VALUE;
        double[] hit = null;
        double[] O = {o[0], o[1], o[2]}, D = {d[0], d[1], d[2]};
        for (int t = 0; t < m.nt(); t++) {
            double[] a = m.vertex(m.f[3 * t]), b = m.vertex(m.f[3 * t + 1]), c = m.vertex(m.f[3 * t + 2]);
            double[] e1 = V3.sub(b, a), e2 = V3.sub(c, a);
            double[] p = V3.cross(D, e2);
            double det = V3.dot(e1, p);
            if (Math.abs(det) < 1e-18) continue;
            double inv = 1 / det;
            double[] s = V3.sub(O, a);
            double u = V3.dot(s, p) * inv;
            if (u < 0 || u > 1) continue;
            double[] q = V3.cross(s, e1);
            double v = V3.dot(D, q) * inv;
            if (v < 0 || u + v > 1) continue;
            double tt = V3.dot(e2, q) * inv;
            if (tt > 0 && tt < best) {
                best = tt;
                hit = V3.addMul(O, D, tt);
            }
        }
        return hit;
    }
}
