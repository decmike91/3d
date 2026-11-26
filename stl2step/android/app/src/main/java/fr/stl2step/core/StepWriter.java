package fr.stl2step.core;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import fr.stl2step.core.Segmenter.Face;

/** Écriture STEP AP214 (solide B-rep, unité : millimètre). */
public final class StepWriter {
    private final List<String> lines = new ArrayList<>();
    private final Map<String, Integer> ptCache = new HashMap<>(), dirCache = new HashMap<>();

    private int add(String s) {
        lines.add(s);
        return lines.size();
    }

    static String f(double x) {
        if (x == 0 || Double.isNaN(x)) return "0.";
        String s = Double.toString(x);
        if (s.contains("E")) {
            String[] p = s.split("E");
            String m = p[0].contains(".") ? p[0] : p[0] + ".";
            return m + "E" + p[1];
        }
        return s.contains(".") ? s : s + ".";
    }

    private int point(double[] p) {
        String k = String.format(Locale.ROOT, "%.9f,%.9f,%.9f", p[0], p[1], p[2]);
        Integer id = ptCache.get(k);
        if (id == null) {
            id = add("CARTESIAN_POINT('',(" + f(p[0]) + "," + f(p[1]) + "," + f(p[2]) + "));");
            ptCache.put(k, id);
        }
        return id;
    }

    private int dir(double[] d) {
        d = V3.unit(d);
        String k = String.format(Locale.ROOT, "%.12f,%.12f,%.12f", d[0], d[1], d[2]);
        Integer id = dirCache.get(k);
        if (id == null) {
            id = add("DIRECTION('',(" + f(d[0]) + "," + f(d[1]) + "," + f(d[2]) + "));");
            dirCache.put(k, id);
        }
        return id;
    }

    private int axis2(double[] p, double[] z, double[] x) {
        return add("AXIS2_PLACEMENT_3D('',#" + point(p) + ",#" + dir(z) + ",#" + dir(x) + ");");
    }

    public static String safeName(String name) {
        String s = name.replaceAll("[^A-Za-z0-9_.-]+", "_");
        if (s.length() > 60) s = s.substring(0, 60);
        return s.isEmpty() ? "piece" : s;
    }

    public static String write(Brep brep, String name) {
        return new StepWriter().text(brep, safeName(name));
    }

    private String text(Brep brep, String name) {
        Segmenter.Segmentation seg = brep.seg;
        int[] vtx = new int[brep.points.size()];
        for (int i = 0; i < vtx.length; i++) vtx[i] = add("VERTEX_POINT('',#" + point(brep.points.get(i)) + ");");
        int[] edgeIds = new int[brep.edges.size()];
        for (int i = 0; i < edgeIds.length; i++) {
            Brep.Edge e = brep.edges.get(i);
            double[] a = brep.points.get(e.v0);
            int curve;
            if (!e.circle) {
                double[] d = V3.sub(brep.points.get(e.v1), a);
                int vec = add("VECTOR('',#" + dir(d) + "," + f(V3.norm(d)) + ");");
                curve = add("LINE('',#" + point(a) + ",#" + vec + ");");
            } else {
                double[] ref = V3.sub(a, e.center);
                ref = V3.addMul(ref, e.axis, -V3.dot(ref, e.axis));
                if (V3.norm(ref) < 1e-12) ref = V3.perp(e.axis);
                curve = add("CIRCLE('',#" + axis2(e.center, e.axis, ref) + "," + f(e.radius) + ");");
            }
            edgeIds[i] = add("EDGE_CURVE('',#" + vtx[e.v0] + ",#" + vtx[e.v1] + ",#" + curve + ",.T.);");
        }
        StringBuilder faceList = new StringBuilder();
        for (Brep.BFace bf : brep.faces) {
            if (bf.loops.isEmpty()) continue;
            Face fc = seg.faces.get(bf.face);
            int surf;
            String sense;
            if (!fc.cylinder) {
                surf = add("PLANE('',#" + axis2(fc.point, fc.normal, V3.perp(fc.normal)) + ");");
                sense = ".T.";
            } else {
                surf = add("CYLINDRICAL_SURFACE('',#" + axis2(fc.point, fc.axis, V3.perp(fc.axis)) + "," + f(fc.radius) + ");");
                sense = fc.outward ? ".T." : ".F.";
            }
            StringBuilder bounds = new StringBuilder();
            for (int li = 0; li < bf.loops.size(); li++) {
                int[] loop = bf.loops.get(li);
                StringBuilder oes = new StringBuilder();
                for (int k = 0; k < loop.length; k += 2) {
                    int oe = add("ORIENTED_EDGE('',*,*,#" + edgeIds[loop[k]] + "," + (loop[k + 1] == 1 ? ".T." : ".F.") + ");");
                    if (oes.length() > 0) oes.append(',');
                    oes.append('#').append(oe);
                }
                int lp = add("EDGE_LOOP('',(" + oes + "));");
                String kind = (!fc.cylinder && li == bf.outer) ? "FACE_OUTER_BOUND" : "FACE_BOUND";
                int bd = add(kind + "('',#" + lp + ",.T.);");
                if (bounds.length() > 0) bounds.append(',');
                bounds.append('#').append(bd);
            }
            int face = add("ADVANCED_FACE('',(" + bounds + "),#" + surf + "," + sense + ");");
            if (faceList.length() > 0) faceList.append(',');
            faceList.append('#').append(face);
        }
        int origin = axis2(new double[]{0, 0, 0}, new double[]{0, 0, 1}, new double[]{1, 0, 0});
        int lu = add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));");
        int au = add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));");
        int su = add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());");
        int unc = add("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(" + f(Math.max(seg.tol, 1e-7)) + "),#" + lu
                + ",'distance_accuracy_value','');");
        int ctx = add("(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#" + unc + "))"
                + "GLOBAL_UNIT_ASSIGNED_CONTEXT((#" + lu + ",#" + au + ",#" + su + "))REPRESENTATION_CONTEXT('',''));");
        int rep;
        if (brep.closed) {
            int shell = add("CLOSED_SHELL('',(" + faceList + "));");
            int body = add("MANIFOLD_SOLID_BREP('" + name + "',#" + shell + ");");
            rep = add("ADVANCED_BREP_SHAPE_REPRESENTATION('',(#" + body + ",#" + origin + "),#" + ctx + ");");
        } else {
            int shell = add("OPEN_SHELL('',(" + faceList + "));");
            int body = add("SHELL_BASED_SURFACE_MODEL('" + name + "',(#" + shell + "));");
            rep = add("MANIFOLD_SURFACE_SHAPE_REPRESENTATION('',(#" + body + ",#" + origin + "),#" + ctx + ");");
        }
        int app = add("APPLICATION_CONTEXT('core data for automotive mechanical design processes');");
        add("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#" + app + ");");
        int pc = add("PRODUCT_CONTEXT('',#" + app + ",'mechanical');");
        int prod = add("PRODUCT('" + name + "','" + name + "','',(#" + pc + "));");
        add("PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(#" + prod + "));");
        int pdf = add("PRODUCT_DEFINITION_FORMATION('','',#" + prod + ");");
        int pdc = add("PRODUCT_DEFINITION_CONTEXT('part definition',#" + app + ",'design');");
        int pd = add("PRODUCT_DEFINITION('design','',#" + pdf + ",#" + pdc + ");");
        int pds = add("PRODUCT_DEFINITION_SHAPE('','',#" + pd + ");");
        add("SHAPE_DEFINITION_REPRESENTATION(#" + pds + ",#" + rep + ");");

        String now = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT).format(new Date());
        StringBuilder sb = new StringBuilder(lines.size() * 48 + 512);
        sb.append("ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('STL converti en solide CAO'),'2;1');\n");
        sb.append("FILE_NAME('").append(name).append(".step','").append(now).append("',(''),(''),'stl2step','stl2step','');\n");
        sb.append("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n");
        for (int i = 0; i < lines.size(); i++) sb.append('#').append(i + 1).append('=').append(lines.get(i)).append('\n');
        sb.append("ENDSEC;\nEND-ISO-10303-21;\n");
        return sb.toString();
    }
}
