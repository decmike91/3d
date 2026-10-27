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
 */
@CapacitorPlugin(name = "PrinterNet")
public class PrinterNetPlugin extends Plugin {

    /** Ouvre l'écran natif de surveillance des imprimantes (PrintMonitor). */
    @PluginMethod
    public void openMonitor(final PluginCall call) {
        android.content.Intent i = new android.content.Intent(getContext(), fr.printmonitor.MonitorActivity.class);
        getActivity().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void request(final PluginCall call) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String url = call.getString("url");
                String method = call.getString("method", "GET");
                int timeout = call.getInt("timeoutMs", 15000);
                String bodyB64 = call.getString("bodyBase64", "");
                JSObject headers = call.getObject("headers", new JSObject());

                conn = (HttpURLConnection) new URL(url).openConnection();
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
                if (conn != null) conn.disconnect();
            }
        }).start();
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
