# Advanced Analytics — Android (telefon sürümü) v0.3

> **Yalnızca eğlence ve eğitim amaçlıdır.** Bu uygulama kişisel bir istatistik ve hobi projesidir. Bahis ya da yatırım tavsiyesi
> vermez, kazanç garantisi vermez, bahis oynamaz ve hiçbir siteye bağlanmaz. Rulette her tur bağımsızdır; uygulama sıradaki
> sayıyı bilemez, yalnızca geçmişte gelen sayıları sayar. Kullanan kişi, bulunduğu ülkenin yasalarına ve kullandığı sitelerin
> kurallarına uymaktan kendisi sorumludur. Para kaybetme riski olan oyunlar bağımlılık yapabilir.

Bilgisayardan bağımsız çalışan telefon uygulaması. Bu sürümde **rulet**, **basketbol (NBA)** ve **futbol** bölümleri vardır.

## Bu sürümde olanlar

| Özellik | Durum |
| --- | --- |
| Rulet: sayı girişi, bot tahmini, altın yıldız, sıcak komşu bölgeleri, karne | Hazır; telefon boyutunda tarayıcıda denendi |
| Ekrandaki “Sonuçlar” tablosunu okuma (rakam tanıma) | Hazır; gerçek oyun ekran görüntüsünde 90/90 doğru |
| Yüzen pencere, bölge seçimi, canlı takip | Yazıldı; tarayıcıda taklit ekranla denendi, **gerçek telefonda henüz denenmedi** |
| Android tarafı (ekran kaydı izni, yüzen pencere servisi) | Yazıldı; **henüz derlenmedi ve telefonda denenmedi** |
| Basketbol (NBA): veri indirme, Elo modeli, yaklaşan maçlar, maç analizi, karne, sıralama | Yazıldı; NBA’in veri biçimiyle üretilmiş yapay veriyle denendi, **gerçek NBA adresleriyle henüz denenmedi** |
| Futbol: 18 lig, veri indirme, gol modeli + Elo, haftanın maçları, maç analizi, karne, puan durumu | Yazıldı; kaynağın dosya biçimiyle üretilmiş yapay veriyle denendi, **gerçek adresle henüz denenmedi** |
| EuroLeague, yapay zekâ tartışması, blackjack | Bu sürümde yok |

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

## Basketbol (NBA)

- **Veri:** bu sezonun sonuçları ve fikstürü `cdn.nba.com` üzerindeki fikstür dosyasından; önceki iki sezon `stats.nba.com`
  üzerinden indirilir. Önceki sezonlar alınamazsa uygulama yalnızca bu sezonla çalışır ve bunu ekranda söyler.
- **Model:** yalnızca maç skorlarını kullanan Elo (ev sahibi avantajı, sayı farkı çarpanı, sezonlar arası ortalamaya çekme).
  Kazanma olasılığı ve beklenen sayı farkı Elo’dan; beklenen toplam sayı takımların hücum/savunma ortalamalarından hesaplanır.
  Masaüstü sürümündeki lojistik regresyon ve gradyan artırma modelleri telefonda yoktur (maç istatistikleri indirilmiyor).
- **Güven eşiği:** “Maçlar” ve “Sonuçlar” sekmelerinde Hepsi / %60+ / %70+ / %80+ seçilir; her eşiğin geçmiş testteki isabeti yanında yazar.
- **Sonuçlar:** son 4 maç gününde modelin maç öncesi tahmini ve gerçek skor; tutanlar yeşil ✓, tutmayanlar kırmızı ✗.
  Tahminler ileriye dönük kayıttan gelir (yalnızca o maçtan önceki maçlarla hesaplanmıştır).
- **Karne:** her tahmin o maçtan önceki bilgiyle yapılır (ileriye dönük test); isabet “hep ev sahibi” ile, toplam sayı hatası
  “hep lig ortalaması” ile karşılaştırılır. Sakatlık, kadro ve dinlenme bilgisi yoktur.

## Futbol

- **Veri:** football-data.co.uk (ücretsiz CSV). Seçilen ligin son 4 sezonu ve yaklaşan haftanın fikstürü indirilir.
  Ligler: Süper Lig, Premier League, Championship, League One, League Two, La Liga, La Liga 2, Bundesliga, 2. Bundesliga,
  Serie A, Serie B, Ligue 1, Ligue 2, Eredivisie, Belçika, Portekiz, İskoçya, Yunanistan. (Kaynakta Hollanda Eerste Divisie
  ve milli takım maçları yoktur.)
- **Modeller:** zaman ağırlıklı Poisson gol modeli + Dixon-Coles düşük skor düzeltmesi, ve Elo + sıralı lojistik. Olasılık
  ikisinin ortalamasıdır; 1X2, beklenen gol, 2,5 alt/üst, karşılıklı gol ve en olası skorlar gösterilir.
- **Karne:** son sezonun her 40 maçlık bloğu yalnızca öncesindeki maçlarla kurulan modelle tahmin edilir; lig ortalaması ve
  bahis oranlarından çıkan olasılıkla karşılaştırılır; güven aralıklarına göre isabet ve oranlara karşı getiri gösterilir.
- Masaüstü sürümündeki Bayes ve makine öğrenmesi modelleri telefonda yoktur. Sakatlık, ceza, kadro ve xG bilgisi yoktur.

## Sınırlar

- Program geçmişi sayar; sıradaki sayıyı bilemez. Hangi sayı gösterilirse gösterilsin tutma şansı 37’de 1’dir (üç komşu
  bölgesi için 37’de 15). Karne bunu “şansla beklenen” ile yan yana gösterir.
- Yalnızca Avrupa ruleti (0-36).
- Brave ve Chrome’da ek ayar gerekmez. Tor Browser ekran kaydını varsayılan olarak engeller (görüntü siyah gelir); okuma için
  Tor Browser’da Ayarlar → Gelişmiş → “Ekran görüntülerine izin ver” açılmalıdır. Uygulama bu engeli kendisi aşmaz.
- Yüzen pencere okunan tablonun üstünü kapatmamalı. Telefon döndürülürse bölge yeniden seçilir.
- Uygulama hiçbir siteye bağlanmaz, oyuna dokunmaz, bahis yapmaz; veriler yalnızca telefonda durur.

## Proje yapısı

- `web/src` — arayüz ve mantık (JavaScript): `roulette.js` (tahmin, bölgeler, karne), `digits.js` + `resample.js` + `model.js`
  (rakam tanıma; masaüstü sürümündeki `digits.py` ile aynı model), `tracker.js` (kayma takibi), `app.js`, `overlay.js`.
- `web/test` — `node --test test/*.test.mjs` (8 test) ve `python3 test/e2e.py` (telefon boyutunda uçtan uca deneme).
- `web/build.mjs` — paketleri `app/src/main/assets/www` klasörüne üretir (`node build.mjs`). Üretilmiş dosyalar depoda durur.
- `app/src/main/java/com/aad/mobile` — `MainActivity` (ana pencere), `CaptureService` (ekran kaydı + yüzen pencere), `Store` (veri).

## Veri kaynakları

- **Futbol:** [football-data.co.uk](https://www.football-data.co.uk/) (42 lig, son 4 sezon, oranlar), [open-matchday](https://github.com/oladeeayo/open-matchday) (diğer ligler ve kupalar, her gün güncellenir), [martj42/international_results](https://github.com/martj42/international_results) (milli maçlar, CC0).
- **Basketbol:** ESPN (NBA, WNBA, G League, NCAA, NBL), EuroLeague resmi API'si (EuroLeague, EuroCup), Türkiye Basketbol Federasyonu (BSL, TBL, KBSL, TKBL).
- Basketbol ve milli maç verisi `tools/veri.mjs` ile her gün GitHub Actions'ta toplanır ve `veri` dalına yazılır; uygulama yalnızca bu küçük dosyaları indirir. Ücretsizdir, sunucu gerektirmez.
