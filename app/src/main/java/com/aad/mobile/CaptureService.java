package com.aad.mobile;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Ekran okuma servisi. Kullanicinin verdigi ekran kaydi izniyle ekrani bir ImageReader'a yansitir ve oyunun ustunde
 * duran kucuk bir pencere (WebView, assets/www/overlay.html) gosterir. Sayi tanima ve takip o pencerenin JavaScript'inde
 * yapilir; bu sinif yalnizca istenen ekran bolgesinin piksellerini verir.
 *
 * Yalnizca ekrandaki goruntu okunur: hicbir siteye baglanilmaz, oyuna dokunulmaz, bahis yapilmaz.
 */
public class CaptureService extends Service {
    static final String ACTION_STOP = "com.aad.mobile.STOP";
    static volatile boolean running;

    private static final String CHANNEL = "capture";
    private static final int NOTIFICATION_ID = 7;

    private final Object lock = new Object();
    private final Handler main = new Handler(Looper.getMainLooper());
    private HandlerThread thread;
    private Handler background;

    private MediaProjection projection;
    private VirtualDisplay display;
    private ImageReader reader;   // lock ile korunur
    private Image held;           // en son kare; lock ile korunur
    private byte[] frozen;        // bolge secimi icin dondurulmus kare (RGBA); lock ile korunur
    private int frozenW, frozenH;
    private volatile int screenW, screenH;
    private int dpi;

    private WindowManager windows;
    private WindowManager.LayoutParams params;
    private LinearLayout root;
    private TextView handle;
    /** WebView icinde bu y'nin (piksel) altindaki dokunuslar surukleme baslatmaz (dugmeler); -1: her yer. */
    private volatile float dragLimit = -1;
    private WebView web;
    private String mode = "mini";
    private int miniX, miniY;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (projection != null) return START_NOT_STICKY;   // zaten calisiyor
        goForeground();
        Intent data = intent.getParcelableExtra("data");
        MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        try {
            projection = data == null ? null : mpm.getMediaProjection(intent.getIntExtra("code", 0), data);
        } catch (RuntimeException e) {
            projection = null;
        }
        if (projection == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        thread = new HandlerThread("aad-capture");
        thread.start();
        background = new Handler(thread.getLooper());
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                main.post(CaptureService.this::stopSelf);
            }
        }, main);
        windows = (WindowManager) getSystemService(WINDOW_SERVICE);
        measure();
        try {
            synchronized (lock) {
                reader = newReader();
                display = projection.createVirtualDisplay("aad-screen", screenW, screenH, dpi,
                        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, null);
            }
            showOverlay();
        } catch (RuntimeException e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        return START_NOT_STICKY;
    }

    private void goForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Ekran okuma", NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, CaptureService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Advanced Analytics")
                .setContentText("Ekran okuma açık. Kapatmak için dokunun.")
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Kapat", stop).build())
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    /** Ekranin o anki gercek boyutu (telefon dondurulunce genislik ve yukseklik yer degistirir). */
    @SuppressWarnings("deprecation")
    private boolean measure() {
        DisplayMetrics m = new DisplayMetrics();
        Display d = ((DisplayManager) getSystemService(DISPLAY_SERVICE)).getDisplay(Display.DEFAULT_DISPLAY);
        d.getRealMetrics(m);
        boolean changed = m.widthPixels != screenW || m.heightPixels != screenH;
        screenW = m.widthPixels;
        screenH = m.heightPixels;
        dpi = m.densityDpi;
        return changed;
    }

    /** lock tutulurken cagrilir. */
    private ImageReader newReader() {
        final ImageReader r = ImageReader.newInstance(screenW, screenH, PixelFormat.RGBA_8888, 3);
        r.setOnImageAvailableListener(source -> {
            synchronized (lock) {
                if (source != reader) return;
                Image img;
                try {
                    img = source.acquireLatestImage();
                } catch (RuntimeException e) {
                    return;
                }
                if (img == null) return;
                if (held != null) held.close();
                held = img;
            }
        }, background);
        return r;
    }

    /** Telefon dondurulduyse yansitmayi yeni boyuta gore yeniden kurar. Ana is parcaciginda calisir. */
    private void resizeIfNeeded() {
        if (display == null || !measure()) return;
        ImageReader old;
        synchronized (lock) {
            old = reader;
            if (held != null) held.close();
            held = null;
            frozen = null;
            reader = newReader();
            display.resize(screenW, screenH, dpi);
            display.setSurface(reader.getSurface());
        }
        if (old != null) old.close();
        if (web != null) web.evaluateJavascript("window.AADO&&AADO.onScreen()", null);
    }

    @Override
    public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        main.post(this::resizeIfNeeded);
    }

    /** En son karenin istenen bolgesi, RGBA bayt dizisi. Bolge ekranin disina tasiyorsa ya da kare yoksa null. */
    private byte[] crop(int left, int top, int w, int h) {
        synchronized (lock) {
            if (held == null || w <= 0 || h <= 0 || left < 0 || top < 0 || left + w > held.getWidth() || top + h > held.getHeight()) return null;
            Image.Plane plane = held.getPlanes()[0];
            if (plane.getPixelStride() != 4) return null;
            ByteBuffer buf = plane.getBuffer();
            int stride = plane.getRowStride();
            byte[] out = new byte[w * h * 4];
            try {
                for (int y = 0; y < h; y++) {
                    buf.position((top + y) * stride + left * 4);
                    buf.get(out, y * w * 4, w * 4);
                }
            } catch (RuntimeException e) {
                return null;
            }
            return out;
        }
    }

    private static String pack(byte[] rgba, int w, int h) {
        return rgba == null ? "" : w + "," + h + "," + Base64.encodeToString(rgba, Base64.NO_WRAP);
    }

    /* ------------------------------------------------------------ yuzen pencere */

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @SuppressLint("ClickableViewAccessibility")
    private void showOverlay() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        handle = new TextView(this);
        handle.setText("≡  Tahmin  ·  istediğin yerinden sürükle");
        handle.setTextColor(0xFF8C9AAB);
        handle.setTextSize(11);
        handle.setGravity(Gravity.CENTER);
        handle.setBackgroundColor(0xF2202B38);
        root.addView(handle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(26)));

        web = new WebView(this);
        Store.setup(web);
        web.setBackgroundColor(Color.TRANSPARENT);
        web.addJavascriptInterface(new Bridge(), "Native");
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        params = new WindowManager.LayoutParams(dp(190), dp(256), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(12);
        params.y = dp(90);
        if (Build.VERSION.SDK_INT >= 28) {
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        handle.setOnTouchListener(new View.OnTouchListener() {
            private int startX, startY;
            private float touchX, touchY;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
                    startX = params.x;
                    startY = params.y;
                    touchX = e.getRawX();
                    touchY = e.getRawY();
                } else if (e.getActionMasked() == MotionEvent.ACTION_MOVE) {
                    params.x = startX + Math.round(e.getRawX() - touchX);
                    params.y = startY + Math.round(e.getRawY() - touchY);
                    windows.updateViewLayout(root, params);
                }
                return true;
            }
        });

        // pencerenin her yerinden surukleme (alttaki dugme satiri haric); kisa dokunus WebView'a gider
        web.setOnTouchListener(new View.OnTouchListener() {
            private int startX, startY;
            private float touchX, touchY;
            private boolean armed, dragging;
            private final int slop = android.view.ViewConfiguration.get(CaptureService.this).getScaledTouchSlop();

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                if ("full".equals(mode)) return false;
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        armed = dragLimit < 0 || e.getY() < dragLimit;
                        dragging = false;
                        startX = params.x;
                        startY = params.y;
                        touchX = e.getRawX();
                        touchY = e.getRawY();
                        return false;
                    case MotionEvent.ACTION_MOVE:
                        if (!armed) return false;
                        float dx = e.getRawX() - touchX, dy = e.getRawY() - touchY;
                        if (!dragging && Math.abs(dx) + Math.abs(dy) > slop) {
                            dragging = true;
                            MotionEvent c = MotionEvent.obtain(e);
                            c.setAction(MotionEvent.ACTION_CANCEL);
                            web.onTouchEvent(c);
                            c.recycle();
                        }
                        if (dragging) {
                            params.x = startX + Math.round(dx);
                            params.y = startY + Math.round(dy);
                            windows.updateViewLayout(root, params);
                            return true;
                        }
                        return false;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        boolean was = dragging;
                        dragging = false;
                        armed = false;
                        return was;
                    default:
                        return dragging;
                }
            }
        });

        windows.addView(root, params);
        web.loadUrl("file:///android_asset/www/overlay.html");
    }

    /** mini: tahmin + dugmeler; ball: yalnizca tahmin topu; full: bolge secimi icin tam ekran. Ana is parcaciginda calisir. */
    private void applyMode(String next) {
        if (root == null) return;
        if (!"full".equals(mode)) {
            miniX = params.x;
            miniY = params.y;
        }
        mode = next;
        if ("full".equals(next)) {
            handle.setVisibility(View.GONE);
            params.width = ViewGroup.LayoutParams.MATCH_PARENT;
            params.height = ViewGroup.LayoutParams.MATCH_PARENT;
            params.x = 0;
            params.y = 0;
        } else {
            boolean ball = "ball".equals(next);
            handle.setVisibility(View.VISIBLE);
            params.width = dp(ball ? 150 : 190);
            params.height = dp(ball ? 104 : 256);
            params.x = miniX;
            params.y = miniY;
        }
        windows.updateViewLayout(root, params);
    }

    /** Yuzen pencerenin JavaScript koprusu (window.Native). Yontemler arka plan is parcaciginda calisir. */
    private final class Bridge {
        @JavascriptInterface
        public String dbRead(String key) {
            return Store.read(CaptureService.this, key);
        }

        @JavascriptInterface
        public void dbWrite(String key, String value) {
            Store.write(CaptureService.this, key, value);
        }

        @JavascriptInterface
        public String screenSize() {
            main.post(CaptureService.this::resizeIfNeeded);   // donme bildirimi kacirildiysa burada yakalanir
            return screenW + "," + screenH;
        }

        @JavascriptInterface
        public void setMode(String next) {
            main.post(() -> applyMode(next));
        }

        /** Canli ekrandan bir bolge: "genislik,yukseklik,base64(RGBA)"; alinamazsa bos metin. */
        @JavascriptInterface
        public String grabRaw(int left, int top, int w, int h) {
            return pack(crop(left, top, w, h), w, h);
        }

        /** Kucultulmus bolge (her 'step'inci piksel): ekranin kayip kaymadigini ucuzca anlamak icin. Bicim grabRaw ile ayni. */
        @JavascriptInterface
        public String grabSmall(int left, int top, int w, int h, int step) {
            if (step < 1) step = 1;
            byte[] px = crop(left, top, w, h);
            if (px == null) return "";
            int ow = w / step, oh = h / step;
            byte[] out = new byte[ow * oh * 4];
            for (int y = 0; y < oh; y++) {
                for (int x = 0; x < ow; x++) {
                    System.arraycopy(px, ((y * step) * w + x * step) * 4, out, (y * ow + x) * 4, 4);
                }
            }
            return pack(out, ow, oh);
        }

        /**
         * Bolge secimi icin ekran goruntusu: yuzen pencere kisa sure gizlenir, kare dondurulur ve JPEG olarak verilir
         * ("genislik,yukseklik,data:image/jpeg;base64,..."). Dondurulan kare grabFrozen ile okunur.
         */
        @JavascriptInterface
        public String screenshot() {
            main.post(() -> { if (root != null) root.setVisibility(View.INVISIBLE); });
            SystemClock.sleep(400);
            int w, h;
            byte[] px;
            synchronized (lock) {
                w = held == null ? 0 : held.getWidth();
                h = held == null ? 0 : held.getHeight();
            }
            px = crop(0, 0, w, h);
            main.post(() -> { if (root != null) root.setVisibility(View.VISIBLE); });
            if (px == null) return "";
            synchronized (lock) {
                frozen = px;
                frozenW = w;
                frozenH = h;
            }
            Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            bmp.copyPixelsFromBuffer(ByteBuffer.wrap(px));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 88, out);
            bmp.recycle();
            return w + "," + h + ",data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        }

        /** Dondurulmus kareden bir bolge (grabRaw ile ayni bicim). */
        @JavascriptInterface
        public String grabFrozen(int left, int top, int w, int h) {
            byte[] out;
            synchronized (lock) {
                if (frozen == null || w <= 0 || h <= 0 || left < 0 || top < 0 || left + w > frozenW || top + h > frozenH) return "";
                out = new byte[w * h * 4];
                for (int y = 0; y < h; y++) {
                    System.arraycopy(frozen, ((top + y) * frozenW + left) * 4, out, y * w * 4, w * 4);
                }
            }
            return pack(out, w, h);
        }

        /** Yuzen pencerenin ekrandaki yeri: "x,y,genislik,yukseklik" (okunan seridi kapatip kapatmadigini bilmek icin). */
        @JavascriptInterface
        public String winRect() {
            final int[] r = new int[4];
            final CountDownLatch done = new CountDownLatch(1);
            main.post(() -> {
                if (root != null && !"full".equals(mode)) {
                    int[] p = new int[2];
                    root.getLocationOnScreen(p);
                    r[0] = p[0];
                    r[1] = p[1];
                    r[2] = root.getWidth();
                    r[3] = root.getHeight();
                }
                done.countDown();
            });
            try {
                done.await(300, TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            return r[0] + "," + r[1] + "," + r[2] + "," + r[3];
        }

        /** Pencereyi dikeyde kaydirir (okunan seridin ustunden cekmek icin). */
        @JavascriptInterface
        public void moveBy(int dx, int dy) {
            main.post(() -> {
                if (root == null || "full".equals(mode)) return;
                params.x += dx;
                params.y += dy;
                miniX = params.x;
                miniY = params.y;
                windows.updateViewLayout(root, params);
            });
        }

        @JavascriptInterface
        public void setDragLimit(float cssY) {
            dragLimit = cssY < 0 ? -1 : cssY * getResources().getDisplayMetrics().density;
        }

        @JavascriptInterface
        public void stopCapture() {
            main.post(CaptureService.this::stopSelf);
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (root != null) {
            try {
                windows.removeView(root);
            } catch (RuntimeException ignored) {
                // pencere zaten kaldirilmis
            }
            root = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        if (display != null) {
            display.release();
            display = null;
        }
        if (projection != null) {
            try {
                projection.stop();
            } catch (RuntimeException ignored) {
                // izin zaten geri alinmis
            }
            projection = null;
        }
        synchronized (lock) {
            if (held != null) held.close();
            held = null;
            if (reader != null) reader.close();
            reader = null;
            frozen = null;
        }
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }
}
