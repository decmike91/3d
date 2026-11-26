package fr.stl2step.core;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/** Lecture (binaire ou texte) et écriture (binaire) de fichiers STL. */
public final class Stl {
    private Stl() {}

    public static Mesh parse(byte[] data) {
        if (data.length >= 84) {
            ByteBuffer bb = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
            long n = bb.getInt(80) & 0xffffffffL;
            if (84 + 50 * n == data.length) {
                double[] tri = new double[(int) (9 * n)];
                for (int i = 0; i < n; i++) {
                    int off = 84 + 50 * i + 12;
                    for (int k = 0; k < 9; k++) tri[9 * i + k] = bb.getFloat(off + 4 * k);
                }
                return Mesh.fromTriangles(tri);
            }
        }
        String text = new String(data, StandardCharsets.ISO_8859_1);
        if (!text.contains("vertex")) throw new IllegalArgumentException("Fichier STL illisible");
        double[] buf = new double[9 * 1024];
        int n = 0;
        int i = 0, len = text.length();
        while (true) {
            int p = text.indexOf("vertex", i);
            if (p < 0) break;
            i = p + 6;
            for (int k = 0; k < 3; k++) {
                while (i < len && Character.isWhitespace(text.charAt(i))) i++;
                int s = i;
                while (i < len && !Character.isWhitespace(text.charAt(i))) i++;
                if (n >= buf.length) buf = java.util.Arrays.copyOf(buf, buf.length * 2);
                buf[n++] = Double.parseDouble(text.substring(s, i));
            }
        }
        if (n % 9 != 0) throw new IllegalArgumentException("STL texte incomplet");
        return Mesh.fromTriangles(java.util.Arrays.copyOf(buf, n));
    }

    public static byte[] toBytes(Mesh m) {
        int n = m.nt();
        ByteBuffer bb = ByteBuffer.allocate(84 + 50 * n).order(ByteOrder.LITTLE_ENDIAN);
        byte[] head = "stl2step binary STL".getBytes(StandardCharsets.US_ASCII);
        bb.put(head);
        bb.position(80);
        bb.putInt(n);
        double[] nr = m.normals();
        for (int t = 0; t < n; t++) {
            for (int k = 0; k < 3; k++) bb.putFloat((float) nr[3 * t + k]);
            for (int j = 0; j < 3; j++) {
                int vi = m.f[3 * t + j];
                for (int k = 0; k < 3; k++) bb.putFloat((float) m.v[3 * vi + k]);
            }
            bb.putShort((short) 0);
        }
        return bb.array();
    }
}
