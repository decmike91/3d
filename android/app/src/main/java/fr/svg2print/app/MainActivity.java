package fr.svg2print.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterNetPlugin.class);
        super.onCreate(savedInstanceState);
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
}
