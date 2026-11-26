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
    private static final int REQ_NOTIFY_DAILY = 43;
    private static final int REQ_RESTORE = 44;
    /** Uygulamanin veri indirebilecegi adresler. Baska hicbir yere baglanilmaz. */
    private static final List<String> HOSTS = Arrays.asList("www.football-data.co.uk", "raw.githubusercontent.com", "cdn.jsdelivr.net", "site.api.espn.com", "cdn.espn.com", "api-live.euroleague.net", "sportsbookv2.iddaa.com");
    /** Yapay zeka servisleri: yalnizca bunlara soru (POST) gonderilebilir. Anahtarlar telefonda kalir, baska yere gitmez. */
    private static final List<String> AI_HOSTS = Arrays.asList("oai.endpoints.kepler.ai.cloud.ovh.net", "api.kilo.ai", "api.groq.com", "generativelanguage.googleapis.com", "openrouter.ai");
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
        if (code == REQ_NOTIFY_DAILY) DailyNotify.schedule(this);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_RESTORE) { restore(result == RESULT_OK && data != null ? data.getData() : null); return; }
        if (request != REQ_CAPTURE) return;
        if (result != RESULT_OK || data == null) {
            Toast.makeText(this, "Ekran kaydı izni verilmedi.", Toast.LENGTH_LONG).show();
            return;
        }
        Intent svc = new Intent(this, CaptureService.class).putExtra("code", result).putExtra("data", data);
        startForegroundService(svc);
        Toast.makeText(this, "Yüzen pencere açıldı. Şimdi rulet oyununa geçin.", Toast.LENGTH_LONG).show();
    }

    /** Secilen yedek dosyasini okuyup arayuze verir: AAD.onBackup(metin) ; iptal edilirse bos metin. */
    private void restore(Uri uri) {
        String text = "";
        if (uri != null) {
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n;
                while (in != null && (n = in.read(buf)) > 0) { out.write(buf, 0, n); if (out.size() > 20 * 1024 * 1024) break; }
                text = new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) { text = ""; }
        }
        final String js = "window.AAD&&AAD.onBackup(" + JSONObject.quote(text) + ")";
        web.evaluateJavascript(js, null);
    }

    /** Izinli bir adresten metin indirir; sonucu AAD.onHttp(id, durum, govde) ile arayuze bildirir. Arka planda calisir. */
    private void fetch(String id, String address, String headersJson) { fetch(id, address, headersJson, null); }

    private void fetch(String id, String address, String headersJson, String payload) {
        int status = 0;
        String body;
        HttpURLConnection con = null;
        try {
            URL url = new URL(address);
            boolean post = payload != null;
            if (!"https".equals(url.getProtocol()) || !(post ? AI_HOSTS : HOSTS).contains(url.getHost())) throw new SecurityException("bu adrese izin verilmiyor");
            con = (HttpURLConnection) url.openConnection();
            con.setConnectTimeout(20000);
            con.setReadTimeout(post ? 120000 : 45000);
            con.setInstanceFollowRedirects(false);
            JSONObject headers = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
            for (Iterator<String> it = headers.keys(); it.hasNext(); ) {
                String k = it.next();
                con.setRequestProperty(k, headers.getString(k));
            }
            if (post) {
                byte[] data = payload.getBytes(StandardCharsets.UTF_8);
                con.setRequestMethod("POST");
                con.setDoOutput(true);
                con.setFixedLengthStreamingMode(data.length);
                if (con.getRequestProperty("Content-Type") == null) con.setRequestProperty("Content-Type", "application/json");
                java.io.OutputStream os = con.getOutputStream();
                os.write(data);
                os.close();
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
            if (status != 200) body = body.length() > 400 ? body.substring(0, 400) : body;
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
        public void httpPost(String id, String url, String headersJson, String payload) {
            new Thread(() -> fetch(id, url, headersJson, payload == null ? "" : payload), "aad-http").start();
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

        /** Kayitli anahtarlar (yedekleme icin). */
        @JavascriptInterface
        public String dbKeys() {
            org.json.JSONArray a = new org.json.JSONArray();
            java.io.File[] fs = getFilesDir().listFiles();
            if (fs != null) for (java.io.File f : fs) { String n = f.getName(); if (n.startsWith("db_") && n.endsWith(".json")) a.put(n.substring(3, n.length() - 5)); }
            return a.toString();
        }

        /** Yedegi Indirilenler klasorune yazar. Donus: dosya adi ya da "" (hata). */
        @JavascriptInterface
        public String saveBackup(String name, String text) {
            if (Build.VERSION.SDK_INT < 29) {
                try {
                    java.io.File f = new java.io.File(getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS), name);
                    try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) { out.write(text.getBytes(StandardCharsets.UTF_8)); }
                    return f.getAbsolutePath();
                } catch (Exception e) { return ""; }
            }
            try {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/json");
                Uri uri = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return "";
                try (java.io.OutputStream out = getContentResolver().openOutputStream(uri)) { if (out == null) return ""; out.write(text.getBytes(StandardCharsets.UTF_8)); }
                return "İndirilenler/" + name;
            } catch (Exception e) { return ""; }
        }

        /** Dosya secici acilir; secilen yedek AAD.onBackup ile gelir. */
        @JavascriptInterface
        public void pickBackup() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                startActivityForResult(i, REQ_RESTORE);
            });
        }

        /** Sabah bildirimi: acik/kapali. Acilirken bildirim izni istenir. */
        @JavascriptInterface
        public void setDailyNotify(boolean on) {
            Store.write(MainActivity.this, DailyNotify.KEY, on ? "true" : "false");
            runOnUiThread(() -> {
                if (on && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY_DAILY);
                } else DailyNotify.schedule(MainActivity.this);
            });
        }

        @JavascriptInterface
        public void stopCapture() {
            if (CaptureService.running) {
                startService(new Intent(MainActivity.this, CaptureService.class).setAction(CaptureService.ACTION_STOP));
            }
        }
    }
}
