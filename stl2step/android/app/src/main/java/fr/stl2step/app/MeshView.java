package fr.stl2step.app;

import android.content.Context;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.opengl.Matrix;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/** Visualiseur 3D : ombré + arêtes, ombré, filaire, carte de conversion. */
public class MeshView extends GLSurfaceView {
    public static final int SHADED_EDGES = 0, SHADED = 1, WIRE = 2, MAP = 3;
    public static final String[] MODE_NAMES = {"Ombré + arêtes", "Ombré", "Filaire", "Carte de conversion"};

    public interface TapListener { void onTap(float[] rayOrigin, float[] rayDir); }

    /** Données préparées hors du fil OpenGL. */
    public static final class Scene {
        public float[] tris;       // par sommet : pos(3) normale(3) couleur(3) couleurCarte(3)
        public float[] edges;      // segments : arêtes vives ou arêtes B-rep
        public float[] allEdges;   // toutes les arêtes de triangles
        public float[] center = new float[3];
        public float radius = 1;
        public boolean hasMap;
    }

    private final Rend rend = new Rend();
    private final ScaleGestureDetector scale;
    private final GestureDetector gestures;
    private TapListener tapListener;
    private float lastX, lastY, lastMidX, lastMidY;
    private int lastCount;

    public MeshView(Context c) {
        super(c);
        setEGLContextClientVersion(2);
        setEGLConfigChooser(8, 8, 8, 8, 16, 0);
        setPreserveEGLContextOnPause(true);
        setRenderer(rend);
        setRenderMode(RENDERMODE_WHEN_DIRTY);
        scale = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector d) {
                synchronized (rend) { rend.zoom = Math.max(0.05f, Math.min(20f, rend.zoom / d.getScaleFactor())); }
                requestRender();
                return true;
            }
        });
        gestures = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                if (tapListener != null) {
                    float[][] ray = rend.ray(e.getX(), e.getY(), getWidth(), getHeight());
                    if (ray != null) tapListener.onTap(ray[0], ray[1]);
                }
                return true;
            }
            @Override public boolean onDoubleTap(MotionEvent e) {
                resetView();
                return true;
            }
        });
    }

    public void setTapListener(TapListener l) { tapListener = l; }

    public void setScene(final Scene s, final boolean resetCamera) {
        queueEvent(() -> rend.upload(s, resetCamera));
        requestRender();
    }

    public void setMode(int m) {
        synchronized (rend) { rend.mode = m; }
        requestRender();
    }

    public int getMode() { return rend.mode; }

    /** Points de mesure (coordonnées pièce), 0 à 2 points. */
    public void setMarkers(float[] pts) {
        synchronized (rend) { rend.markers = pts; }
        requestRender();
    }

    public void resetView() {
        synchronized (rend) { rend.resetCamera(); }
        requestRender();
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        scale.onTouchEvent(e);
        gestures.onTouchEvent(e);
        int n = e.getPointerCount();
        float mx = 0, my = 0;
        for (int i = 0; i < n; i++) { mx += e.getX(i); my += e.getY(i); }
        mx /= n; my /= n;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                lastX = e.getX(); lastY = e.getY(); lastCount = 1;
                break;
            case MotionEvent.ACTION_POINTER_DOWN:
            case MotionEvent.ACTION_POINTER_UP:
                lastMidX = mx; lastMidY = my; lastCount = -1;   // évite un saut
                break;
            case MotionEvent.ACTION_MOVE:
                if (n == 1 && lastCount == 1) {
                    float dx = e.getX() - lastX, dy = e.getY() - lastY;
                    synchronized (rend) { rend.rotate(dx * 0.35f, dy * 0.35f); }
                    requestRender();
                } else if (n >= 2 && lastCount == n) {
                    synchronized (rend) { rend.pan(mx - lastMidX, my - lastMidY, getHeight()); }
                    requestRender();
                }
                lastX = e.getX(); lastY = e.getY(); lastMidX = mx; lastMidY = my; lastCount = n;
                break;
        }
        return true;
    }

    // ===================================================================
    private static final class Rend implements GLSurfaceView.Renderer {
        int mode = SHADED_EDGES;
        float zoom = 1, panX, panY;
        final float[] rot = new float[16];
        float[] center = {0, 0, 0};
        float radius = 1;
        float[] markers;
        boolean hasMap;

        private int prog, aPos, aNor, aCol, uMVP, uMV, uLit, uAlpha;
        private final int[] vbo = new int[3];
        private int nTri, nEdge, nAll;
        private final float[] proj = new float[16], view = new float[16], mvp = new float[16];
        private int w = 1, h = 1;

        Rend() { resetCamera(); }

        void resetCamera() {
            zoom = 1; panX = 0; panY = 0;
            Matrix.setIdentityM(rot, 0);
            Matrix.rotateM(rot, 0, -60, 1, 0, 0);   // Z vers le haut, vue isométrique
            Matrix.rotateM(rot, 0, -35, 0, 0, 1);
        }

        void rotate(float ax, float ay) {
            float[] r = new float[16], t = new float[16];
            Matrix.setRotateM(r, 0, ax, 0, 1, 0);
            Matrix.multiplyMM(t, 0, r, 0, rot, 0);
            Matrix.setRotateM(r, 0, ay, 1, 0, 0);
            Matrix.multiplyMM(rot, 0, r, 0, t, 0);
        }

        void pan(float dx, float dy, int height) {
            float k = 2f * radius * zoom * 1.2f / Math.max(height, 1);
            panX += dx * k;
            panY -= dy * k;
        }

        private Scene last;

        void upload(Scene s, boolean resetCam) {
            last = s;
            if (vbo[0] == 0) GLES20.glGenBuffers(3, vbo, 0);
            nTri = put(vbo[0], s.tris) / 12;
            nEdge = put(vbo[1], s.edges) / 3;
            nAll = put(vbo[2], s.allEdges) / 3;
            synchronized (this) {
                center = s.center;
                radius = Math.max(s.radius, 1e-6f);
                hasMap = s.hasMap;
                markers = null;
                if (resetCam) resetCamera();
            }
        }

        private static int put(int buf, float[] data) {
            GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, buf);
            int n = data == null ? 0 : data.length;
            if (n > 0) {
                FloatBuffer fb = ByteBuffer.allocateDirect(n * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
                fb.put(data).position(0);
                GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, n * 4, fb, GLES20.GL_STATIC_DRAW);
            }
            return n;
        }

        @Override public void onSurfaceCreated(GL10 gl, EGLConfig cfg) {
            vbo[0] = 0;
            String vs = "uniform mat4 uMVP; uniform mat4 uMV; uniform float uLit;"
                    + "attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; varying vec3 vCol;"
                    + "void main(){ gl_Position = uMVP*vec4(aPos,1.0);"
                    + " vec3 n = normalize((uMV*vec4(aNor,0.0)).xyz);"
                    + " float l = 0.28 + 0.55*abs(n.z) + 0.30*max(dot(n, normalize(vec3(-0.45,0.6,0.65))),0.0);"
                    + " vCol = mix(aCol, aCol*l, uLit); gl_PointSize = 18.0; }";
            String fs = "precision mediump float; varying vec3 vCol; uniform float uAlpha;"
                    + "void main(){ gl_FragColor = vec4(vCol, uAlpha); }";
            prog = GLES20.glCreateProgram();
            GLES20.glAttachShader(prog, shader(GLES20.GL_VERTEX_SHADER, vs));
            GLES20.glAttachShader(prog, shader(GLES20.GL_FRAGMENT_SHADER, fs));
            GLES20.glLinkProgram(prog);
            aPos = GLES20.glGetAttribLocation(prog, "aPos");
            aNor = GLES20.glGetAttribLocation(prog, "aNor");
            aCol = GLES20.glGetAttribLocation(prog, "aCol");
            uMVP = GLES20.glGetUniformLocation(prog, "uMVP");
            uMV = GLES20.glGetUniformLocation(prog, "uMV");
            uLit = GLES20.glGetUniformLocation(prog, "uLit");
            uAlpha = GLES20.glGetUniformLocation(prog, "uAlpha");
            GLES20.glClearColor(0.106f, 0.133f, 0.173f, 1f);
            GLES20.glEnable(GLES20.GL_DEPTH_TEST);
            GLES20.glEnable(GLES20.GL_BLEND);
            GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);
            if (last != null) upload(last, false);   // contexte OpenGL recréé
        }

        private static int shader(int type, String src) {
            int s = GLES20.glCreateShader(type);
            GLES20.glShaderSource(s, src);
            GLES20.glCompileShader(s);
            return s;
        }

        @Override public void onSurfaceChanged(GL10 gl, int width, int height) {
            w = Math.max(width, 1);
            h = Math.max(height, 1);
            GLES20.glViewport(0, 0, w, h);
        }

        private synchronized void matrices() {
            float fov = 35f;
            float dist = (float) (radius / Math.sin(Math.toRadians(fov / 2))) * zoom;
            Matrix.perspectiveM(proj, 0, fov, (float) w / h, Math.max(dist - radius * 4, dist * 0.01f), dist + radius * 4);
            float[] t = new float[16], m = new float[16];
            Matrix.setIdentityM(t, 0);
            Matrix.translateM(t, 0, panX, panY, -dist);
            Matrix.multiplyMM(m, 0, t, 0, rot, 0);
            Matrix.translateM(m, 0, -center[0], -center[1], -center[2]);
            System.arraycopy(m, 0, view, 0, 16);
            Matrix.multiplyMM(mvp, 0, proj, 0, view, 0);
        }

        /** Rayon (origine, direction) en coordonnées pièce pour un point de l'écran. */
        float[][] ray(float x, float y, int vw, int vh) {
            float[] inv = new float[16];
            synchronized (this) {
                if (!Matrix.invertM(inv, 0, mvp, 0)) return null;
            }
            float nx = 2f * x / vw - 1f, ny = 1f - 2f * y / vh;
            float[] a = new float[4], b = new float[4];
            Matrix.multiplyMV(a, 0, inv, 0, new float[]{nx, ny, -1, 1}, 0);
            Matrix.multiplyMV(b, 0, inv, 0, new float[]{nx, ny, 1, 1}, 0);
            float[] o = {a[0] / a[3], a[1] / a[3], a[2] / a[3]};
            float[] d = {b[0] / b[3] - o[0], b[1] / b[3] - o[1], b[2] / b[3] - o[2]};
            return new float[][]{o, d};
        }

        @Override public void onDrawFrame(GL10 gl) {
            GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
            if (prog == 0 || vbo[0] == 0) return;
            matrices();
            int md;
            float[] mk;
            boolean map;
            synchronized (this) { md = mode; mk = markers; map = hasMap; }
            GLES20.glUseProgram(prog);
            GLES20.glUniformMatrix4fv(uMVP, 1, false, mvp, 0);
            GLES20.glUniformMatrix4fv(uMV, 1, false, view, 0);
            if (md != WIRE && nTri > 0) {
                GLES20.glEnable(GLES20.GL_POLYGON_OFFSET_FILL);
                GLES20.glPolygonOffset(1f, 1f);
                GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, vbo[0]);
                GLES20.glEnableVertexAttribArray(aPos);
                GLES20.glEnableVertexAttribArray(aNor);
                GLES20.glEnableVertexAttribArray(aCol);
                GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, 48, 0);
                GLES20.glVertexAttribPointer(aNor, 3, GLES20.GL_FLOAT, false, 48, 12);
                GLES20.glVertexAttribPointer(aCol, 3, GLES20.GL_FLOAT, false, 48, (md == MAP && map) ? 36 : 24);
                GLES20.glUniform1f(uLit, 1f);
                GLES20.glUniform1f(uAlpha, 1f);
                GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, nTri);
                GLES20.glDisableVertexAttribArray(aNor);
                GLES20.glDisableVertexAttribArray(aCol);
                GLES20.glDisable(GLES20.GL_POLYGON_OFFSET_FILL);
            }
            GLES20.glUniform1f(uLit, 0f);
            GLES20.glVertexAttrib3f(aNor, 0, 0, 1);
            if (md == WIRE) lines(vbo[2], nAll, 0.75f, 0.82f, 0.92f, 0.8f, 1f);
            if (md == MAP) lines(vbo[2], nAll, 0f, 0f, 0f, 0.18f, 1f);
            if (md == SHADED_EDGES || md == MAP) lines(vbo[1], nEdge, 0.05f, 0.06f, 0.08f, 1f, 2f);
            if (mk != null && mk.length >= 3) {
                GLES20.glDisable(GLES20.GL_DEPTH_TEST);
                GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);
                FloatBuffer fb = ByteBuffer.allocateDirect(mk.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
                fb.put(mk).position(0);
                GLES20.glEnableVertexAttribArray(aPos);
                GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, 12, fb);
                GLES20.glVertexAttrib3f(aCol, 1f, 0.85f, 0.1f);
                GLES20.glUniform1f(uAlpha, 1f);
                GLES20.glLineWidth(3f);
                if (mk.length >= 6) GLES20.glDrawArrays(GLES20.GL_LINES, 0, 2);
                GLES20.glDrawArrays(GLES20.GL_POINTS, 0, mk.length / 3);
                GLES20.glEnable(GLES20.GL_DEPTH_TEST);
            }
            GLES20.glDisableVertexAttribArray(aPos);
        }

        private void lines(int buf, int n, float r, float g, float b, float a, float width) {
            if (n == 0) return;
            GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, buf);
            GLES20.glEnableVertexAttribArray(aPos);
            GLES20.glVertexAttribPointer(aPos, 3, GLES20.GL_FLOAT, false, 12, 0);
            GLES20.glVertexAttrib3f(aCol, r, g, b);
            GLES20.glUniform1f(uAlpha, a);
            GLES20.glLineWidth(width);
            GLES20.glDrawArrays(GLES20.GL_LINES, 0, n);
        }
    }
}
