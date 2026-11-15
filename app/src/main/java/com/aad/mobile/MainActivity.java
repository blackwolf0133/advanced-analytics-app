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

/** Ana pencere: arayuz bir WebView icinde calisir (assets/www). Ekran kaydi iznini ister ve yuzen pencere servisini baslatir. */
public class MainActivity extends Activity {
    private static final int REQ_CAPTURE = 41;
    private static final int REQ_NOTIFY = 42;
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
