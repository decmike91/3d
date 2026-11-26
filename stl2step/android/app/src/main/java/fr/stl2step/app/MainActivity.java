package fr.stl2step.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import fr.stl2step.core.Converter;
import fr.stl2step.core.Cutter;
import fr.stl2step.core.Mesh;
import fr.stl2step.core.Sections;
import fr.stl2step.core.Stl;
import fr.stl2step.core.V3;

/**
 * STL2STEP : convertit un maillage STL en solide STEP (plans, cylindres),
 * l'affiche, le mesure, le coupe, et génère des sections DXF.
 */
public class MainActivity extends Activity {
    private static final int REQ_OPEN = 1, REQ_STEP = 2, REQ_STL = 3, REQ_DXF = 4;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());

    private MeshView view;
    private TextView status, info, measureText;
    private ProgressBar progress;
    private Button modeBtn, measureBtn;
    private final List<Button> actions = new ArrayList<>();

    private Mesh original, mesh;
    private Converter result;
    private String baseName = "piece";
    private boolean measuring;
    private final List<double[]> picks = new ArrayList<>();
    private byte[] pendingSave;

    // ------------------------------------------------------------------ UI
    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private Button button(LinearLayout bar, String text, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(14);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF2B3A4E);
        bg.setCornerRadius(dp(8));
        b.setBackground(bg);
        b.setPadding(dp(14), 0, dp(14), 0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(42));
        lp.setMargins(dp(3), dp(4), dp(3), dp(4));
        b.setOnClickListener(l);
        bar.addView(b, lp);
        actions.add(b);
        return b;
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF1B222C);
        root.setFitsSystemWindows(true);

        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        hs.setBackgroundColor(0xFF121A24);
        LinearLayout bar = new LinearLayout(this);
        bar.setPadding(dp(4), 0, dp(4), 0);
        hs.addView(bar);
        button(bar, "Ouvrir STL", v -> openStl());
        button(bar, "Convertir", v -> convert(false));
        button(bar, "Enregistrer STEP", v -> saveStep());
        modeBtn = button(bar, "Vue : " + MeshView.MODE_NAMES[0], v -> cycleMode());
        measureBtn = button(bar, "Mesurer", v -> toggleMeasure());
        button(bar, "Couper", v -> cutDialog());
        button(bar, "Sections DXF", v -> sectionsDialog());
        button(bar, "Enregistrer STL", v -> saveStl());
        button(bar, "Infos", v -> showInfo());
        button(bar, "Annuler les modifs", v -> restore());
        button(bar, "Aide", v -> help());
        root.addView(hs, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout frame = new FrameLayout(this);
        view = new MeshView(this);
        view.setTapListener(this::onTap);
        frame.addView(view);
        info = new TextView(this);
        info.setTextColor(0xFFDDE6F0);
        info.setTextSize(12.5f);
        info.setTypeface(Typeface.MONOSPACE);
        info.setBackgroundColor(0xAA121A24);
        info.setPadding(dp(10), dp(8), dp(10), dp(8));
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        ilp.setMargins(dp(8), dp(8), dp(8), dp(8));
        frame.addView(info, ilp);
        measureText = new TextView(this);
        measureText.setTextColor(0xFFFFD84A);
        measureText.setTextSize(15);
        measureText.setTypeface(Typeface.DEFAULT_BOLD);
        measureText.setBackgroundColor(0xCC121A24);
        measureText.setPadding(dp(10), dp(6), dp(10), dp(6));
        measureText.setVisibility(View.GONE);
        FrameLayout.LayoutParams mlp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        mlp.setMargins(dp(8), dp(8), dp(8), dp(8));
        frame.addView(measureText, mlp);
        progress = new ProgressBar(this);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        frame.addView(progress, new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.CENTER));
        root.addView(frame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        status = new TextView(this);
        status.setTextColor(0xFFB8C4D2);
        status.setTextSize(13);
        status.setPadding(dp(10), dp(6), dp(10), dp(6));
        status.setBackgroundColor(0xFF121A24);
        root.addView(status);
        setContentView(root);

        info.setText("Ouvrez un fichier STL (binaire ou texte).\n"
                + "1 doigt : tourner · 2 doigts : zoom et déplacement\ndouble appui : vue initiale");
        status.setText("STL → STEP : plans et cylindres reconnus, le reste en facettes.");
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent it) {
        if (it == null) return;
        Uri u = null;
        if (Intent.ACTION_VIEW.equals(it.getAction())) u = it.getData();
        else if (Intent.ACTION_SEND.equals(it.getAction())) u = it.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u != null) load(u);
    }

    @Override protected void onPause() { super.onPause(); view.onPause(); }
    @Override protected void onResume() { super.onResume(); view.onResume(); }

    private void busy(boolean b, String msg) {
        progress.setVisibility(b ? View.VISIBLE : View.GONE);
        for (Button x : actions) x.setEnabled(!b);
        if (msg != null) status.setText(msg);
    }

    private interface Job { Object run() throws Exception; }
    private interface Done { void done(Object r); }

    private void runJob(String msg, Job job, Done done) {
        busy(true, msg);
        worker.execute(() -> {
            Object r;
            Exception err = null;
            try {
                r = job.run();
            } catch (Exception | OutOfMemoryError e) {
                r = null;
                err = e instanceof Exception ? (Exception) e : new Exception("Mémoire insuffisante");
            }
            final Object res = r;
            final Exception ex = err;
            ui.post(() -> {
                busy(false, null);
                if (ex != null) {
                    status.setText("Erreur : " + ex.getMessage());
                    new AlertDialog.Builder(this).setTitle("Erreur").setMessage(String.valueOf(ex.getMessage()))
                            .setPositiveButton("OK", null).show();
                } else {
                    done.done(res);
                }
            });
        });
    }

    private boolean need() {
        if (mesh == null) {
            Toast.makeText(this, "Ouvrez d'abord un fichier STL.", Toast.LENGTH_SHORT).show();
            return false;
        }
        return true;
    }

    // -------------------------------------------------------------- fichiers
    private void openStl() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(i, REQ_OPEN);
    }

    private void create(int req, String name, String mime, byte[] data) {
        pendingSave = data;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(i, req);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (res != RESULT_OK || data == null || data.getData() == null) return;
        Uri u = data.getData();
        if (req == REQ_OPEN) {
            load(u);
        } else if (pendingSave != null) {
            final byte[] bytes = pendingSave;
            pendingSave = null;
            runJob("Enregistrement…", () -> {
                try (OutputStream os = getContentResolver().openOutputStream(u, "wt")) {
                    if (os == null) throw new Exception("Impossible d'écrire le fichier");
                    os.write(bytes);
                }
                return null;
            }, r -> status.setText("Fichier enregistré : " + displayName(u)));
        }
    }

    private String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        }
        String p = u.getLastPathSegment();
        return p == null ? "piece.stl" : p.substring(p.lastIndexOf('/') + 1);
    }

    private void load(Uri u) {
        String name = displayName(u);
        runJob("Lecture de " + name + "…", () -> {
            try (InputStream in = getContentResolver().openInputStream(u)) {
                if (in == null) throw new Exception("Fichier illisible");
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                Mesh m = Stl.parse(bo.toByteArray());
                if (m.nt() == 0) throw new Exception("Aucun triangle dans ce fichier");
                return new Object[]{m, SceneBuilder.build(m, null)};
            }
        }, r -> {
            Object[] o = (Object[]) r;
            original = mesh = (Mesh) o[0];
            result = null;
            String b = name.replaceAll("(?i)\\.stl$", "");
            baseName = b.isEmpty() ? "piece" : b;
            clearMeasure();
            view.setScene((MeshView.Scene) o[1], true);
            setMode(MeshView.SHADED_EDGES);
            info.setText(name + "\n" + mesh.info());
            status.setText(mesh.nt() > Mesh.MAX_TRIANGLES
                    ? "Attention : plus de " + Mesh.MAX_TRIANGLES + " triangles, la conversion sera refusée."
                    : "Chargé. Touchez « Convertir ».");
        });
    }

    // ------------------------------------------------------------ conversion
    private void convert(boolean thenSave) {
        if (!need()) return;
        final Mesh m = mesh;
        final String name = baseName;
        runJob("Conversion en cours…", () -> {
            Converter c = Converter.convert(m, 0, name, true, true);
            return new Object[]{c, SceneBuilder.build(m, c)};
        }, r -> {
            Object[] o = (Object[]) r;
            result = (Converter) o[0];
            view.setScene((MeshView.Scene) o[1], false);
            setMode(MeshView.MAP);
            info.setText("Conversion terminée\n" + result.report()
                    + "\n\nBleu : plan · orange : cylindre · gris : facette");
            status.setText("Converti. Enregistrez le STEP.");
            if (thenSave) saveStep();
        });
    }

    private void saveStep() {
        if (!need()) return;
        if (result == null) {
            convert(true);
            return;
        }
        create(REQ_STEP, baseName + ".step", "application/octet-stream", result.step.getBytes(StandardCharsets.US_ASCII));
    }

    private void saveStl() {
        if (!need()) return;
        String suffix = mesh == original ? "" : "_modifie";
        create(REQ_STL, baseName + suffix + ".stl", "application/octet-stream", Stl.toBytes(mesh));
    }

    // -------------------------------------------------------------- affichage
    private void setMode(int m) {
        view.setMode(m);
        modeBtn.setText("Vue : " + MeshView.MODE_NAMES[m]);
    }

    private void cycleMode() {
        int m = (view.getMode() + 1) % 4;
        if (m == MeshView.MAP && result == null) {
            Toast.makeText(this, "La carte de conversion apparaît après « Convertir ».", Toast.LENGTH_SHORT).show();
            m = MeshView.SHADED_EDGES;
        }
        setMode(m);
    }

    // ---------------------------------------------------------------- mesure
    private void toggleMeasure() {
        if (!need()) return;
        measuring = !measuring;
        measureBtn.setText(measuring ? "Mesurer ✓" : "Mesurer");
        clearMeasure();
        if (measuring) {
            measureText.setVisibility(View.VISIBLE);
            measureText.setText("Touchez deux points de la pièce");
        }
    }

    private void clearMeasure() {
        picks.clear();
        view.setMarkers(null);
        if (!measuring) measureText.setVisibility(View.GONE);
    }

    private void onTap(float[] o, float[] d) {
        if (!measuring || mesh == null) return;
        final Mesh m = mesh;
        worker.execute(() -> {
            double[] hit = SceneBuilder.pick(m, o, d);
            ui.post(() -> {
                if (hit == null) return;
                if (picks.size() >= 2) picks.clear();
                picks.add(hit);
                float[] mk = new float[picks.size() * 3];
                for (int i = 0; i < picks.size(); i++)
                    for (int k = 0; k < 3; k++) mk[3 * i + k] = (float) picks.get(i)[k];
                view.setMarkers(mk);
                if (picks.size() == 1) {
                    measureText.setText(String.format(Locale.FRANCE, "P1 (%.3f ; %.3f ; %.3f)\nTouchez un 2e point",
                            hit[0], hit[1], hit[2]));
                } else {
                    double[] a = picks.get(0), b = picks.get(1);
                    measureText.setText(String.format(Locale.FRANCE,
                            "Distance : %.3f mm\nΔX %.3f  ΔY %.3f  ΔZ %.3f", V3.dist(a, b),
                            Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])));
                }
            });
        });
    }

    // ------------------------------------------------------------- dialogues
    private RadioGroup axisGroup(int checked) {
        RadioGroup g = new RadioGroup(this);
        g.setOrientation(RadioGroup.HORIZONTAL);
        for (int i = 0; i < 3; i++) {
            RadioButton r = new RadioButton(this);
            r.setText("XYZ".substring(i, i + 1));
            r.setId(100 + i);
            g.addView(r);
        }
        g.check(100 + checked);
        return g;
    }

    private LinearLayout column() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(20), dp(10), dp(20), 0);
        return l;
    }

    private TextView label(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setPadding(0, dp(10), 0, dp(2));
        return t;
    }

    private void cutDialog() {
        if (!need()) return;
        LinearLayout l = column();
        l.addView(label("Plan de coupe perpendiculaire à l'axe :"));
        RadioGroup axes = axisGroup(2);
        l.addView(axes);
        TextView posText = label("");
        l.addView(posText);
        SeekBar sb = new SeekBar(this);
        sb.setMax(1000);
        sb.setProgress(500);
        l.addView(sb);
        l.addView(label("Garder :"));
        RadioGroup keep = new RadioGroup(this);
        keep.setOrientation(RadioGroup.HORIZONTAL);
        RadioButton below = new RadioButton(this);
        below.setText("dessous / côté −");
        below.setId(200);
        RadioButton above = new RadioButton(this);
        above.setText("dessus / côté +");
        above.setId(201);
        keep.addView(below);
        keep.addView(above);
        keep.check(200);
        l.addView(keep);
        final double[] lo = mesh.min(), hi = mesh.max();
        Runnable upd = () -> {
            int ax = axes.getCheckedRadioButtonId() - 100;
            double h = lo[ax] + (hi[ax] - lo[ax]) * sb.getProgress() / 1000.0;
            posText.setText(String.format(Locale.FRANCE, "Position : %s = %.3f mm", "XYZ".charAt(ax), h));
        };
        upd.run();
        axes.setOnCheckedChangeListener((g, id) -> upd.run());
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean u) { upd.run(); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        new AlertDialog.Builder(this).setTitle("Couper la pièce").setView(l)
                .setPositiveButton("Couper", (d, w) -> {
                    int ax = axes.getCheckedRadioButtonId() - 100;
                    double h = lo[ax] + (hi[ax] - lo[ax]) * sb.getProgress() / 1000.0;
                    boolean keepAbove = keep.getCheckedRadioButtonId() == 201;
                    doCut(ax, h, keepAbove);
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void doCut(int ax, double h, boolean keepAbove) {
        final Mesh m = mesh;
        runJob("Coupe…", () -> {
            double[] n = new double[3];
            n[ax] = 1;
            double[] p = new double[3];
            p[ax] = h;
            Mesh c = Cutter.cut(m, p, n, keepAbove, true);
            if (c.nt() == 0) throw new Exception("Rien ne reste de ce côté du plan.");
            return new Object[]{c, SceneBuilder.build(c, null)};
        }, r -> {
            Object[] o = (Object[]) r;
            mesh = (Mesh) o[0];
            result = null;
            clearMeasure();
            view.setScene((MeshView.Scene) o[1], false);
            setMode(MeshView.SHADED_EDGES);
            info.setText("Pièce coupée\n" + mesh.info());
            status.setText("Coupe appliquée : convertissez, ou enregistrez le STL modifié.");
        });
    }

    private void sectionsDialog() {
        if (!need()) return;
        LinearLayout l = column();
        l.addView(label("Sections perpendiculaires à l'axe :"));
        RadioGroup axes = axisGroup(2);
        l.addView(axes);
        l.addView(label("Nombre de sections régulières :"));
        EditText count = new EditText(this);
        count.setInputType(InputType.TYPE_CLASS_NUMBER);
        count.setText("5");
        l.addView(count);
        l.addView(label("ou positions précises en mm (séparées par ;) :"));
        EditText at = new EditText(this);
        at.setInputType(InputType.TYPE_CLASS_TEXT);
        at.setHint("ex. 2,5 ; 10 ; 17,5");
        l.addView(at);
        new AlertDialog.Builder(this).setTitle("Sections DXF").setView(l)
                .setMessage("Un calque par section, coordonnées dans le plan de coupe, à tracer dans votre logiciel de CAO.")
                .setPositiveButton("Générer", (d, w) -> {
                    int ax = axes.getCheckedRadioButtonId() - 100;
                    String spec = at.getText().toString().trim();
                    int n;
                    try {
                        n = Math.max(1, Math.min(500, Integer.parseInt(count.getText().toString().trim())));
                    } catch (NumberFormatException e) {
                        n = 5;
                    }
                    makeSections(ax, n, spec);
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void makeSections(int ax, int n, String spec) {
        final Mesh m = mesh;
        runJob("Calcul des sections…", () -> {
            double[] pos;
            if (!spec.isEmpty()) {
                String[] parts = spec.split(";");
                List<Double> l = new ArrayList<>();
                for (String p : parts) if (!p.trim().isEmpty()) l.add(Double.parseDouble(p.trim().replace(',', '.')));
                pos = new double[l.size()];
                for (int i = 0; i < pos.length; i++) pos[i] = l.get(i);
            } else {
                pos = Sections.positions(m, ax, n);
            }
            List<Sections.Section> secs = Sections.sections(m, ax, pos);
            int c = 0;
            for (Sections.Section s : secs) c += s.polylines.size();
            return new Object[]{Sections.dxf(secs, true), c};
        }, r -> {
            Object[] o = (Object[]) r;
            status.setText(o[1] + " contour(s) calculé(s).");
            create(REQ_DXF, baseName + "_sections_" + "xyz".charAt(ax) + ".dxf", "application/octet-stream",
                    ((String) o[0]).getBytes(StandardCharsets.US_ASCII));
        });
    }

    private void showInfo() {
        if (!need()) return;
        String s = mesh.info();
        if (result != null) s += "\n\n" + result.report();
        new AlertDialog.Builder(this).setTitle(baseName).setMessage(s).setPositiveButton("OK", null).show();
    }

    private void restore() {
        if (!need() || mesh == original) return;
        mesh = original;
        result = null;
        clearMeasure();
        final Mesh m = mesh;
        runJob("Retour à la pièce d'origine…", () -> SceneBuilder.build(m, null), r -> {
            view.setScene((MeshView.Scene) r, false);
            setMode(MeshView.SHADED_EDGES);
            info.setText(baseName + "\n" + mesh.info());
        });
    }

    private void help() {
        new AlertDialog.Builder(this).setTitle("STL2STEP").setMessage(
                "Convertit un maillage STL de pièce mécanique en solide STEP fait de vraies faces "
                        + "(plans et cylindres) qui s'ouvre dans Fusion 360, SolidWorks ou FreeCAD.\n\n"
                        + "1. Ouvrir STL : binaire ou texte, jusqu'à 120 000 triangles.\n"
                        + "2. Convertir : la tolérance s'adapte à la taille de la pièce. Ce qui n'est pas reconnu "
                        + "reste en facettes planes. L'échelle est conservée, unité du STEP : millimètre.\n"
                        + "3. Vue : ombré + arêtes, ombré, filaire, ou carte de conversion (triangles d'origine et "
                        + "limites des faces CAO).\n"
                        + "4. Modifier (facultatif) : mesurer, couper par un plan, enregistrer le STL modifié.\n"
                        + "5. Enregistrer STEP.\n\n"
                        + "Sections DXF : coupe le STL en sections planes à décalquer dans la CAO.\n\n"
                        + "Tout est calculé sur le téléphone, sans connexion.")
                .setPositiveButton("OK", null).show();
    }
}
