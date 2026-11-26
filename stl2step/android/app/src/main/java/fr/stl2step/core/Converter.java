package fr.stl2step.core;

import java.util.Locale;

/** STL -> STEP : reconnaissance des faces, topologie, écriture. */
public final class Converter {
    public final Mesh mesh;
    public final Segmenter.Segmentation seg;
    public final Brep brep;
    public final String step;

    private Converter(Mesh mesh, Segmenter.Segmentation seg, Brep brep, String step) {
        this.mesh = mesh;
        this.seg = seg;
        this.brep = brep;
        this.step = step;
    }

    public static Converter convert(Mesh mesh, double tol, String name, boolean cylinders, boolean limit) {
        if (mesh.nt() == 0) throw new IllegalArgumentException("Maillage vide");
        if (limit && mesh.nt() > Mesh.MAX_TRIANGLES)
            throw new IllegalArgumentException(mesh.nt() + " triangles : la limite est " + Mesh.MAX_TRIANGLES);
        Segmenter.Segmentation seg = Segmenter.segment(mesh, tol, cylinders);
        Brep brep = Brep.build(seg);
        return new Converter(mesh, seg, brep, StepWriter.write(brep, name));
    }

    public String report() {
        return String.format(Locale.FRANCE,
                "Faces : %d\n  plans : %d\n  cylindres : %d\n  facettes : %d\nArêtes : %d\nSommets : %d\n"
                        + "Solide fermé : %s\nTolérance : %.4f mm\nCylindres laissés en facettes : %d",
                seg.faces.size(), seg.planes(), seg.cylinders(), seg.facets(), brep.edges.size(),
                brep.points.size(), brep.closed ? "oui" : "non (surface ouverte)", seg.tol, brep.demoted);
    }
}
