package fr.svg2print.app;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Accès réseau natif vers les imprimantes du réseau local :
 * - request : requête HTTP (sans restriction CORS du WebView)
 * - discover : découverte SDCP des Elegoo Centauri Carbon (UDP "M99999" port 3000)
 * - openMonitor : écran natif de surveillance (PrintMonitor)
 * - monitorPrinters : imprimantes saisies dans la surveillance (nom, modèle, IP)
 */
@CapacitorPlugin(name = "PrinterNet")
public class PrinterNetPlugin extends Plugin {

    /** Ouvre l'écran natif de surveillance des imprimantes (PrintMonitor). */
    @PluginMethod
    public void openMonitor(final PluginCall call) {
        android.content.Intent i = new android.content.Intent(getContext(), fr.printmonitor.MonitorActivity.class);
        // Ouverture directe sur les caméras Tapo
        i.putExtra(fr.printmonitor.MonitorActivity.EXTRA_CAMERAS, Boolean.TRUE.equals(call.getBoolean("cameras", false)));
        getActivity().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void request(final PluginCall call) {
        final String reqId = call.getString("id", "");
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                // Retire espaces, espaces insécables et caractères invisibles (zéro largeur…) collés par le clavier
                String url = call.getString("url", "").replaceAll("[\\s\\p{Z}\\p{Cf}]", "");
                String method = call.getString("method", "GET");
                int timeout = call.getInt("timeoutMs", 15000);
                String bodyB64 = call.getString("bodyBase64", "");
                JSObject headers = call.getObject("headers", new JSObject());

                conn = (HttpURLConnection) new URL(url).openConnection();
                if (!reqId.isEmpty()) INFLIGHT.put(reqId, conn);
                conn.setRequestMethod(method);
                conn.setConnectTimeout(Math.min(timeout, 8000));
                conn.setReadTimeout(timeout);
                conn.setUseCaches(false);
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    conn.setRequestProperty(k, headers.getString(k));
                }
                if (bodyB64 != null && !bodyB64.isEmpty()) {
                    byte[] body = Base64.decode(bodyB64, Base64.DEFAULT);
                    conn.setDoOutput(true);
                    conn.setFixedLengthStreamingMode(body.length);
                    OutputStream os = conn.getOutputStream();
                    int off = 0;
                    while (off < body.length) {
                        if (!reqId.isEmpty() && CANCELLED.remove(reqId)) throw new java.io.IOException("annulé");
                        int n = Math.min(64 * 1024, body.length - off);
                        os.write(body, off, n);
                        off += n;
                    }
                    os.flush();
                    os.close();
                }
                int status = conn.getResponseCode();
                InputStream is = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                String text = "";
                if (is != null) {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int r;
                    while ((r = is.read(buf)) != -1) bos.write(buf, 0, r);
                    is.close();
                    text = new String(bos.toByteArray(), StandardCharsets.UTF_8);
                }
                JSObject ret = new JSObject();
                ret.put("status", status);
                ret.put("text", text);
                call.resolve(ret);
            } catch (SocketTimeoutException e) {
                call.reject("délai dépassé");
            } catch (Exception e) {
                call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
            } finally {
                if (!reqId.isEmpty()) { INFLIGHT.remove(reqId); CANCELLED.remove(reqId); }
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private static final java.util.concurrent.ConcurrentHashMap<String, HttpURLConnection> INFLIGHT = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.Set<String> CANCELLED = java.util.concurrent.ConcurrentHashMap.newKeySet();

    /** Annule une requête en cours (envoi vers l'imprimante interrompu par l'utilisateur). */
    @PluginMethod
    public void cancelRequest(final PluginCall call) {
        final String id = call.getString("id", "");
        CANCELLED.add(id);
        final HttpURLConnection c = INFLIGHT.get(id);
        if (c != null) new Thread(() -> { try { c.disconnect(); } catch (Exception ignored) { } }).start();
        call.resolve();
    }

    /** Mémorise le nombre de couches et la durée du fichier envoyé, pour l'écran Surveiller. */
    @PluginMethod
    public void noteJob(final PluginCall call) {
        String ip = call.getString("ip", "").replaceAll("[\\s\\p{Z}\\p{Cf}]", "");
        fr.printmonitor.MonitorHub.INSTANCE.noteSentJob(getContext(), ip, call.getString("file", ""),
            call.getInt("layers", 0), (long) Math.round(call.getDouble("seconds", 0.0)));
        // Impression lancée depuis l'appli : surveillance en arrière-plan jusqu'à la fin, puis arrêt
        fr.printmonitor.MonitorHub.INSTANCE.printLaunched();
        call.resolve();
    }

    /** Coupe la prise Tapo de l'imprimante (adresse IP) à la fin de l'impression en cours. */
    @PluginMethod
    public void armPowerOff(final PluginCall call) {
        String ip = call.getString("ip", "").replaceAll("[\\s\\p{Z}\\p{Cf}]", "");
        boolean on = call.getBoolean("on", true);
        fr.printmonitor.data.PrinterId id = fr.printmonitor.MonitorHub.INSTANCE.findByIp(ip);
        if (id == null) { call.reject("Cette imprimante (" + ip + ") n'est pas dans Surveiller › Réglages."); return; }
        if (on && !fr.printmonitor.MonitorHub.INSTANCE.hasPlug(id)) {
            call.reject("Aucune prise Tapo associée à cette imprimante : renseignez son adresse et vos identifiants Tapo dans Surveiller › Réglages.");
            return;
        }
        fr.printmonitor.MonitorHub.INSTANCE.armPowerOff(id, on);
        JSObject ret = new JSObject();
        ret.put("name", fr.printmonitor.MonitorHub.INSTANCE.getConfig().getValue().displayName(id));
        call.resolve(ret);
    }

    /** État en direct des imprimantes de Surveiller (libre, en impression…), pour choisir l'imprimante d'envoi. */
    @PluginMethod
    public void monitorStatus(final PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("printers", new JSArray(fr.printmonitor.MonitorBridge.status().toString()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /** Ajoute l'imprimante (adresse IP) à Surveiller si elle n'y est pas, pour la suivre avec les autres. */
    @PluginMethod
    public void addMonitorPrinter(final PluginCall call) {
        String ip = call.getString("ip", "").replaceAll("[\\s\\p{Z}\\p{Cf}]", "");
        String name = fr.printmonitor.MonitorBridge.ensurePrinter(getContext(), ip, call.getString("model", "cc"), call.getString("name", ""));
        if (name == null) { call.reject("Plus d'emplacement libre dans Surveiller pour ce modèle."); return; }
        JSObject ret = new JSObject();
        ret.put("name", name);
        call.resolve(ret);
    }

    /** Imprimantes saisies dans l'écran Surveiller (nom, modèle, adresse IP). */
    @PluginMethod
    public void monitorPrinters(final PluginCall call) {
        try {
            fr.printmonitor.data.AppConfig cfg = fr.printmonitor.data.ConfigStore.INSTANCE.load(getContext());
            JSArray arr = new JSArray();
            for (fr.printmonitor.data.PrinterId id : fr.printmonitor.data.PrinterId.values()) {
                fr.printmonitor.data.PrinterConfig pc = cfg.printer(id);
                if (pc.getIp() == null || pc.getIp().trim().isEmpty()) continue;
                JSObject o = new JSObject();
                o.put("key", id.getKey());
                o.put("name", cfg.displayName(id));
                o.put("model", id.getType() == fr.printmonitor.data.PrinterType.CREALITY_K1 ? "k1" : "cc");
                o.put("ip", pc.getIp().trim());
                arr.put(o);
            }
            JSObject ret = new JSObject();
            ret.put("printers", arr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    @PluginMethod
    public void discover(final PluginCall call) {
        new Thread(() -> {
            WifiManager.MulticastLock lock = null;
            DatagramSocket sock = null;
            Map<String, JSObject> found = new LinkedHashMap<>();
            try {
                WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifi != null) {
                    lock = wifi.createMulticastLock("svg2print");
                    lock.acquire();
                }
                sock = new DatagramSocket();
                sock.setBroadcast(true);
                sock.setSoTimeout(400);
                byte[] msg = "M99999".getBytes(StandardCharsets.US_ASCII);
                InetAddress bc = InetAddress.getByName("255.255.255.255");
                long end = System.currentTimeMillis() + 2500;
                int sent = 0;
                byte[] buf = new byte[4096];
                while (System.currentTimeMillis() < end) {
                    if (sent < 3) { sock.send(new DatagramPacket(msg, msg.length, bc, 3000)); sent++; }
                    try {
                        DatagramPacket p = new DatagramPacket(buf, buf.length);
                        sock.receive(p);
                        String s = new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8);
                        JSONObject j = new JSONObject(s);
                        JSONObject d = j.optJSONObject("Data");
                        if (d == null) d = j;
                        JSObject o = new JSObject();
                        String ip = p.getAddress().getHostAddress();
                        o.put("ip", d.optString("MainboardIP", ip));
                        o.put("name", d.optString("Name", d.optString("MachineName", "")));
                        o.put("mainboardId", d.optString("MainboardID", j.optString("Id", "")));
                        found.put(ip, o);
                    } catch (SocketTimeoutException ignored) {
                    } catch (Exception ignored) {
                    }
                }
                JSArray arr = new JSArray();
                for (JSObject o : found.values()) arr.put(o);
                JSObject ret = new JSObject();
                ret.put("printers", arr);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage());
            } finally {
                if (sock != null) sock.close();
                if (lock != null && lock.isHeld()) lock.release();
            }
        }).start();
    }
}
