package com.aad.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

/** Ana pencere: arayuz bir WebView icinde calisir (assets/www). Ekran kaydi iznini ister ve yuzen pencere servisini baslatir. */
public class MainActivity extends Activity {
    private static final int REQ_CAPTURE = 41;
    private static final int REQ_NOTIFY = 42;
    /** Uygulamanin veri indirebilecegi adresler. Baska hicbir yere baglanilmaz. */
    private static final List<String> HOSTS = Arrays.asList("www.football-data.co.uk", "raw.githubusercontent.com", "cdn.jsdelivr.net");
    private static final int MAX_BODY = 12 * 1024 * 1024;
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF0E1319);
        getWindow().setNavigationBarColor(0xFF161D26);
        web = new WebView(this);
        Store.setup(web);
        web.setBackgroundColor(0xFF0E1319);
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.evaluateJavascript("window.AAD&&AAD.onResume()", null);
    }

    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    private void askCapture() {
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == REQ_NOTIFY) askCapture();   // bildirim izni verilmese de okuma calisir
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != REQ_CAPTURE) return;
        if (result != RESULT_OK || data == null) {
            Toast.makeText(this, "Ekran kaydı izni verilmedi.", Toast.LENGTH_LONG).show();
            return;
        }
        Intent svc = new Intent(this, CaptureService.class).putExtra("code", result).putExtra("data", data);
        startForegroundService(svc);
        Toast.makeText(this, "Yüzen pencere açıldı. Şimdi rulet oyununa geçin.", Toast.LENGTH_LONG).show();
    }

    /** Izinli bir adresten metin indirir; sonucu AAD.onHttp(id, durum, govde) ile arayuze bildirir. Arka planda calisir. */
    private void fetch(String id, String address, String headersJson) {
        int status = 0;
        String body;
        HttpURLConnection con = null;
        try {
            URL url = new URL(address);
            if (!"https".equals(url.getProtocol()) || !HOSTS.contains(url.getHost())) throw new SecurityException("bu adrese izin verilmiyor");
            con = (HttpURLConnection) url.openConnection();
            con.setConnectTimeout(20000);
            con.setReadTimeout(45000);
            con.setInstanceFollowRedirects(false);
            JSONObject headers = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
            for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
                String k = it.next();
                con.setRequestProperty(k, headers.getString(k));
            }
            status = con.getResponseCode();
            InputStream in = status >= 400 ? con.getErrorStream() : con.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_BODY) throw new IllegalStateException("yanıt çok büyük");
                }
                in.close();
            }
            body = new String(out.toByteArray(), StandardCharsets.UTF_8);
            if (status != 200) body = body.length() > 200 ? body.substring(0, 200) : body;
        } catch (Exception e) {
            status = 0;
            body = "bağlantı kurulamadı (" + e.getClass().getSimpleName() + ")";
        } finally {
            if (con != null) con.disconnect();
        }
        final String js = "window.AAD&&AAD.onHttp(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")";
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    /** JavaScript'ten cagrilan kopru (window.Native). Yontemler arka plan is parcaciginda calisir. */
    private final class Bridge {
        @JavascriptInterface
        public String dbRead(String key) {
            return Store.read(MainActivity.this, key);
        }

        @JavascriptInterface
        public void dbWrite(String key, String value) {
            Store.write(MainActivity.this, key, value);
        }

        @JavascriptInterface
        public void httpGet(String id, String url, String headersJson) {
            new Thread(() -> fetch(id, url, headersJson), "aad-http").start();
        }

        @JavascriptInterface
        public String captureState() {
            return CaptureService.running ? "on" : "off";
        }

        @JavascriptInterface
        public String startCapture() {
            if (!Settings.canDrawOverlays(MainActivity.this)) {
                runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))));
                return "overlay";
            }
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                } else {
                    askCapture();
                }
            });
            return "ok";
        }

        @JavascriptInterface
        public void stopCapture() {
            if (CaptureService.running) {
                startService(new Intent(MainActivity.this, CaptureService.class).setAction(CaptureService.ACTION_STOP));
            }
        }
    }
}
