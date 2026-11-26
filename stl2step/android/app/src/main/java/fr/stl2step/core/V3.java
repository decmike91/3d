package fr.stl2step.core;

/** Petites opérations sur des vecteurs 3D (double[3]). */
public final class V3 {
    private V3() {}

    public static double[] of(double x, double y, double z) { return new double[]{x, y, z}; }
    public static double[] sub(double[] a, double[] b) { return new double[]{a[0] - b[0], a[1] - b[1], a[2] - b[2]}; }
    public static double[] add(double[] a, double[] b) { return new double[]{a[0] + b[0], a[1] + b[1], a[2] + b[2]}; }
    public static double[] mul(double[] a, double s) { return new double[]{a[0] * s, a[1] * s, a[2] * s}; }
    public static double[] addMul(double[] a, double[] b, double s) { return new double[]{a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s}; }
    public static double dot(double[] a, double[] b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    public static double[] cross(double[] a, double[] b) {
        return new double[]{a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]};
    }
    public static double norm(double[] a) { return Math.sqrt(dot(a, a)); }
    public static double[] unit(double[] a) {
        double n = norm(a);
        return n == 0 ? new double[]{0, 0, 0} : mul(a, 1.0 / n);
    }
    public static double dist(double[] a, double[] b) { return norm(sub(a, b)); }

    /** Vecteur unitaire perpendiculaire à a. */
    public static double[] perp(double[] a) {
        double[] t = Math.abs(a[0]) < 0.9 ? of(1, 0, 0) : of(0, 1, 0);
        return unit(cross(a, t));
    }

    /** Vecteur propre de la plus petite valeur propre d'une matrice 3x3 symétrique (Jacobi). */
    public static double[] smallestEigenvector(double[][] m) {
        double[][] a = {m[0].clone(), m[1].clone(), m[2].clone()};
        double[][] v = {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}};
        for (int sweep = 0; sweep < 50; sweep++) {
            double off = a[0][1] * a[0][1] + a[0][2] * a[0][2] + a[1][2] * a[1][2];
            if (off < 1e-30) break;
            for (int p = 0; p < 2; p++) {
                for (int q = p + 1; q < 3; q++) {
                    if (Math.abs(a[p][q]) < 1e-300) continue;
                    double theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                    double t = Math.signum(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                    if (theta == 0) t = 1;
                    double c = 1 / Math.sqrt(t * t + 1), s = t * c;
                    for (int k = 0; k < 3; k++) {
                        double akp = a[k][p], akq = a[k][q];
                        a[k][p] = c * akp - s * akq;
                        a[k][q] = s * akp + c * akq;
                    }
                    for (int k = 0; k < 3; k++) {
                        double apk = a[p][k], aqk = a[q][k];
                        a[p][k] = c * apk - s * aqk;
                        a[q][k] = s * apk + c * aqk;
                    }
                    for (int k = 0; k < 3; k++) {
                        double vkp = v[k][p], vkq = v[k][q];
                        v[k][p] = c * vkp - s * vkq;
                        v[k][q] = s * vkp + c * vkq;
                    }
                }
            }
        }
        int best = 0;
        for (int i = 1; i < 3; i++) if (a[i][i] < a[best][best]) best = i;
        return unit(new double[]{v[0][best], v[1][best], v[2][best]});
    }

    /** Résout un système 3x3 (Cramer). Renvoie null s'il est singulier. */
    public static double[] solve3(double[][] A, double[] b) {
        double det = det3(A);
        if (Math.abs(det) < 1e-300) return null;
        double[] x = new double[3];
        for (int i = 0; i < 3; i++) {
            double[][] M = {A[0].clone(), A[1].clone(), A[2].clone()};
            for (int r = 0; r < 3; r++) M[r][i] = b[r];
            x[i] = det3(M) / det;
        }
        return x;
    }

    static double det3(double[][] m) {
        return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    }
}
