package fr.svg2print.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterNetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
