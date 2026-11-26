package com.aad.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Sabah 07:30 (Turkiye saati) gunluk banko bildirimi. Veri dalindan futbol ve basketbol gunluk dosyalarini okur,
 * kupon varsa ozetini bildirim olarak gosterir. Ayarlardan acilir/kapanir; telefon yeniden basladiginda yeniden kurulur.
 */
public class DailyNotify extends BroadcastReceiver {
    static final String KEY = "notify_daily";
    private static final String CH = "gunluk";
    private static final String[] BASES = {
        "https://raw.githubusercontent.com/blackwolf0133/advanced-analytics-app/veri/",
        "https://cdn.jsdelivr.net/gh/blackwolf0133/advanced-analytics-app@veri/"};

    static boolean enabled(Context c) { return "true".equals(Store.read(c, KEY).trim()); }

    /** Bir sonraki 07:30'a alarm kurar (yaklasik; pil tasarrufu icin birkac dakika kayabilir). */
    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 7, new Intent(c, DailyNotify.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        am.cancel(pi);
        if (!enabled(c)) return;
        Calendar k = Calendar.getInstance(TimeZone.getTimeZone("Europe/Istanbul"));
        k.set(Calendar.HOUR_OF_DAY, 7); k.set(Calendar.MINUTE, 30); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0);
        if (k.getTimeInMillis() <= System.currentTimeMillis() + 60000) k.add(Calendar.DAY_OF_MONTH, 1);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, k.getTimeInMillis(), pi);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) { schedule(c); return; }
        final PendingResult pr = goAsync();
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            try { show(app); } catch (Exception ignored) { } finally { schedule(app); pr.finish(); }
        }, "aad-notify").start();
    }

    private static String get(String path) {
        for (String b : BASES) {
            HttpURLConnection con = null;
            try {
                con = (HttpURLConnection) new URL(b + path + "?t=" + System.currentTimeMillis() / 60000).openConnection();
                con.setConnectTimeout(15000); con.setReadTimeout(30000);
                if (con.getResponseCode() != 200) continue;
                try (InputStream in = con.getInputStream()) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    return new String(out.toByteArray(), StandardCharsets.UTF_8);
                }
            } catch (Exception ignored) {
            } finally { if (con != null) con.disconnect(); }
        }
        return null;
    }

    private static String combo(String json, String today) {
        try {
            JSONObject d = new JSONObject(json).getJSONObject("days").optJSONObject(today);
            JSONObject c = d == null ? null : d.optJSONObject("combo");
            if (c == null) return null;
            JSONArray legs = c.getJSONArray("legs"); StringBuilder s = new StringBuilder();
            for (int i = 0; i < legs.length(); i++) {
                JSONObject l = legs.getJSONObject(i);
                if (i > 0) s.append(" + ");
                s.append(l.optString("h")).append("–").append(l.optString("a")).append(": ").append(l.optString("label")).append(String.format(Locale.US, " @%.2f", l.optDouble("odd")));
            }
            return String.format(Locale.US, "(oran %.2f, ~%%%d) ", c.optDouble("odds"), Math.round(c.optDouble("p") * 100)) + s;
        } catch (Exception e) { return null; }
    }

    private static void show(Context c) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US); f.setTimeZone(TimeZone.getTimeZone("Europe/Istanbul"));
        String today = f.format(new java.util.Date());
        String fb = get("f/gunluk.json"), bb = get("b/gunluk.json");
        String a = fb == null ? null : combo(fb, today), b = bb == null ? null : combo(bb, today);
        if (a == null && b == null) return;
        String text = (a != null ? "⚽ " + a : "") + (a != null && b != null ? "\n" : "") + (b != null ? "🏀 " + b : "");
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH, "Günlük banko", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(c, 8, new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CH).setSmallIcon(R.drawable.ic_launcher).setContentTitle("Günlük banko kombinen hazır")
            .setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text + "\nEğlence içindir; oynarken güncel orana bakın."))
            .setContentIntent(open).setAutoCancel(true).build();
        nm.notify(730, n);
    }
}
