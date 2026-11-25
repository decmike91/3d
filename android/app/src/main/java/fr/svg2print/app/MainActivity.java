package fr.svg2print.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterNetPlugin.class);
        super.onCreate(savedInstanceState);
        // Android 13+ : sans cette autorisation, aucune alerte (fin d'impression, erreur, prise coupée)
        // ne s'affiche. Demandée dès l'écran principal, d'où partent les impressions.
        if (savedInstanceState == null && Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 1001);
        }
        // Android peut libérer la page web (gros G-code, aperçu 3D) pendant que l'écran Surveiller
        // est affiché. Sans ce traitement, toute l'application s'arrête : on recharge la page à la place.
        if (bridge != null) {
            bridge.addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    Log.w("SVG2Print", "Page web libérée par Android (crash=" + (detail != null && detail.didCrash()) + ") : rechargement");
                    runOnUiThread(MainActivity.this::recreate);
                    return true;
                }
            });
        }
    }

    // L'application affiche l'état des imprimantes (libre / en impression) : connexions seulement
    // tant qu'elle est à l'écran. Quittée, plus rien ne tourne, sauf pendant une impression.
    @Override
    public void onStart() {
        super.onStart();
        fr.printmonitor.MonitorHub.INSTANCE.acquire("app");
    }

    @Override
    public void onStop() {
        fr.printmonitor.MonitorHub.INSTANCE.release("app");
        super.onStop();
    }
}
