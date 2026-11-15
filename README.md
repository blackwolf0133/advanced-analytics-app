# Advanced Analytics — Android (telefon sürümü) v0.1

Bilgisayardan bağımsız çalışan telefon uygulaması. Bu sürümde **rulet** bölümü vardır; futbol ve basketbol sonraki sürümlerde eklenecek.

## Bu sürümde olanlar

| Özellik | Durum |
| --- | --- |
| Rulet: sayı girişi, bot tahmini, altın yıldız, sıcak komşu bölgeleri, karne | Hazır; telefon boyutunda tarayıcıda denendi |
| Ekrandaki “Sonuçlar” tablosunu okuma (rakam tanıma) | Hazır; gerçek oyun ekran görüntüsünde 90/90 doğru |
| Yüzen pencere, bölge seçimi, canlı takip | Yazıldı; tarayıcıda taklit ekranla denendi, **gerçek telefonda henüz denenmedi** |
| Android tarafı (ekran kaydı izni, yüzen pencere servisi) | Yazıldı; **henüz derlenmedi ve telefonda denenmedi** |
| Futbol, basketbol, yapay zekâ tartışması, blackjack | Bu sürümde yok |

Geliştirme ortamında Android derleme araçlarına erişim olmadığı için kurulum dosyası (APK) GitHub Actions ile üretilir.

## Kurulum dosyası nasıl üretilir

Kod GitHub deposunun `main` dalına gönderildiğinde “APK” iş akışı çalışır (yaklaşık 3-5 dakika) ve dosyayı deponun
**Releases** bölümüne `AdvancedAnalytics.apk` adıyla koyar. Telefonda o dosyayı indirip açın; Android “bilinmeyen kaynak”
izni ister, izin verip kurun. Yeni sürümler aynı imzayla üretilir, eskisinin üstüne kurulur ve veriler silinmez.

## Kullanım

1. Uygulamayı açın, **Rulet → Yeni oturum**.
2. **Yüzen pencereyi aç**: telefon iki izin ister: “diğer uygulamaların üzerinde göster” ve “ekranı kaydet” (**tüm ekran**ı seçin).
3. Rulet oyununa geçin, “Sonuçlar” tablosunu açın.
4. Yüzen pencerede **Bölge** → tabloyu parmakla çerçeveleyin → satır/sütun sayısını ayarlayın → **Dene** → **Kaydet**.
5. **Başlat**. Oturum boşsa tablodaki sayılar geçmiş olarak aktarılır; sonra her yeni sayı kendiliğinden kaydedilir.
   Tahmin, komşu bölgeleri ve ★ sayacı yüzen pencerede görünür. Topa dokununca pencere küçülür.

## Sınırlar

- Program geçmişi sayar; sıradaki sayıyı bilemez. Hangi sayı gösterilirse gösterilsin tutma şansı 37’de 1’dir (üç komşu
  bölgesi için 37’de 15). Karne bunu “şansla beklenen” ile yan yana gösterir.
- Yalnızca Avrupa ruleti (0-36). Bazı uygulamalar ekran kaydını engeller; görüntü siyah gelirse okuma yapılamaz.
- Yüzen pencere okunan tablonun üstünü kapatmamalı. Telefon döndürülürse bölge yeniden seçilir.
- Uygulama hiçbir siteye bağlanmaz, oyuna dokunmaz, bahis yapmaz; veriler yalnızca telefonda durur.

## Proje yapısı

- `web/src` — arayüz ve mantık (JavaScript): `roulette.js` (tahmin, bölgeler, karne), `digits.js` + `resample.js` + `model.js`
  (rakam tanıma; masaüstü sürümündeki `digits.py` ile aynı model), `tracker.js` (kayma takibi), `app.js`, `overlay.js`.
- `web/test` — `node --test test/*.test.mjs` (8 test) ve `python3 test/e2e.py` (telefon boyutunda uçtan uca deneme).
- `web/build.mjs` — paketleri `app/src/main/assets/www` klasörüne üretir (`node build.mjs`). Üretilmiş dosyalar depoda durur.
- `app/src/main/java/com/aad/mobile` — `MainActivity` (ana pencere), `CaptureService` (ekran kaydı + yüzen pencere), `Store` (veri).
