package com.aad.mobile;

import android.annotation.SuppressLint;
import android.content.Context;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Kalici veri: uygulamanin ozel klasorundeki kucuk JSON dosyalari. Ana pencere ve yuzen pencere ayni dosyalari kullanir. */
final class Store {
    private static final Object LOCK = new Object();

    private Store() { }

    private static File file(Context c, String key) {
        return new File(c.getApplicationContext().getFilesDir(), "db_" + key.replaceAll("[^A-Za-z0-9_]", "_") + ".json");
    }

    static String read(Context c, String key) {
        synchronized (LOCK) {
            File f = file(c, key);
            if (!f.exists()) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return "";
            }
        }
    }

    /** Once gecici dosyaya yazar, sonra adini degistirir; yazma yarida kesilirse eski veri bozulmaz. */
    static void write(Context c, String key, String value) {
        synchronized (LOCK) {
            File f = file(c, key);
            File tmp = new File(f.getPath() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(value.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (IOException e) {
                return;
            }
            if (!tmp.renameTo(f)) tmp.delete();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    static void setup(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setWebViewClient(new WebViewClient());
    }
}
