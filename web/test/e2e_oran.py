"""Futbol -> Oran hareketi: acilis/simdi, dusen kirmizi / yukselen yesil, degerli oran, analiz; telefon iddaa'dan canli yeniler.
Ayrica gunluk ekraninda sanal kasa, kapanis orani ve haftalik rapor; ayarlarda yedekleme."""
import json, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent; WWW = HERE.resolve().parents[1] / "app/src/main/assets/www"
now = dt.datetime.now(dt.timezone.utc); iso = lambda h: (now + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:00.000Z")
ist = lambda h: (now + dt.timedelta(hours=3 + h)).strftime("%Y-%m-%d")
H = {"v": 2, "updated": now.isoformat(), "list": [
  {"id": "1", "io": 11, "t": iso(4), "lg": "eng.1", "ln": "Premier Lig", "h": "Arsenal", "a": "Chelsea", "s": [[iso(-20)[:16], 1.9, 3.6, 4.1, 1.8, 2.0, 1.7, 2.1], [iso(-2)[:16], 1.75, 3.8, 4.6, 1.6, 2.3, 1.62, 2.2]],
   "q": {"1": 0.6, "X": 0.22, "2": 0.18, "U": 0.75, "A": 0.25, "KGV": 0.6, "KGY": 0.4}, "pc": {"1": 0.6, "X": 0.24, "2": 0.16, "U2.5": 0.7, "A2.5": 0.3}, "src": "Pinnacle", "sc": None},
  {"id": "2", "io": 22, "t": iso(-3), "lg": "esp.1", "ln": "La Liga", "h": "Sevilla", "a": "Betis", "s": [[iso(-30)[:16], 2.4, 3.2, 3.0, 2.0, 1.8, 1.8, 1.95], [iso(-4)[:16], 2.6, 3.2, 2.7, 2.2, 1.65, 1.9, 1.85]],
   "q": {"1": 0.35, "X": 0.3, "2": 0.35, "U": 0.4, "A": 0.6}, "pc": None, "src": None, "sc": [0, 1, 0, 0]}]}
LIVE = {"data": {"events": [{"i": 11, "d": int((now + dt.timedelta(hours=4)).timestamp()), "hn": "Arsenal", "an": "Chelsea", "m": [{"t": 1, "st": 1, "s": 1, "o": [{"n": "1", "odd": 1.7}, {"n": "0", "odd": 3.9}, {"n": "2", "odd": 4.8}]}, {"t": 2, "st": 101, "s": 1, "sov": "2.5", "o": [{"n": "Alt", "odd": 2.4}, {"n": "Üst", "odd": 1.55}]}]}]}}
G = json.loads((HERE / "fixtures/veri_gunluk.json").read_text()); ks = sorted(G["days"]); G["days"] = {ist(-(len(ks) - 1 - i)): G["days"][k] for i, k in enumerate(ks)}
G["ozet"] = {"kasa": {"combo": [[ist(-1), 35.6], [ist(0), -64.4]], "lists": {"g6": [[ist(-1), -43.6]]}, "stake": {"combo": 100, "list": 10}}, "clv": {"combo": {"n": 4, "avg": 0.021, "pos": 0.75}, "lists": {}},
  "weeks": [{"w": ist(-1), "combo": {"n": 2, "won": 1, "exp": 1.24, "pl": -64.4}, "lists": {"g6": {"days": 1, "hits": 1, "exp": 1.6, "pl": -43.6}}, "clv": 0.021, "clvN": 4}]}
DATA = {"/veri/f/hareket.json": json.dumps(H), "sportsbookv2.iddaa.com/sportsbook/events": json.dumps(LIVE), "/veri/f/gunluk.json": json.dumps(G)}
MOCK = "window.__d = %s; window.Native = { httpGet: (id, url, h) => setTimeout(() => { const k = Object.keys(window.__d).find((k) => url.includes(k)); k ? AAD.onHttp(id, 200, window.__d[k]) : AAD.onHttp(id, 404, ''); }, 15) };" % json.dumps(DATA)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8822", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2, accept_downloads=True); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8822/index.html")
        pg.click('#nav [data-v="football"]'); pg.click('#f-mode [data-mode="odds"]'); pg.wait_for_selector(".om", timeout=15000)
        t = pg.inner_text("#f-odds"); print(t[:500]); assert "Arsenal – Chelsea" in t and "1,80 → 1,60" in t and "▼ %11" in t and "değerli oran" in t
        assert pg.locator(".om .odrop").count() >= 1 and pg.locator(".om .orise").count() >= 1
        pg.click(".om >> nth=0"); pg.wait_for_selector(".omdet"); a = pg.inner_text(".omdet"); print("ANALIZ:", a[:900])
        assert "2,5 Üst oranı 1,80 → 1,60 düştü" in a and "piyasa modelimizin yönüne geliyor" in a and "Değerli oran" in a
        pg.click('#om-when [data-w="all"]'); pg.wait_for_timeout(200); pg.click('.om[data-id="2"]'); a2 = pg.inner_text('.om[data-id="2"]'); print("BITEN:", a2[-300:]); assert "Sonuç 0-1" in a2 and "tuttu ✓" in a2
        pg.click("#om-up"); pg.wait_for_function("!document.querySelector('#om-up').disabled", timeout=15000); pg.click('#om-when [data-w="today"]'); pg.wait_for_timeout(200)
        t2 = pg.inner_text(".om >> nth=0"); print("CANLI:", t2[:200]); assert "1,80 → 1,55" in t2 and "telefon" in pg.inner_text("#f-odds")
        pg.click('#nav [data-v="kombine"]'); pg.wait_for_selector(".kasa", timeout=15000); k = pg.inner_text("#main")
        assert "Sanal kasa · futbol" in k and "Kapanış oranı (CLV)" in k and "+%2,1" in k and "Haftalık rapor" in k, k[:1500]
        pg.click('#nav [data-v="settings"]'); pg.check("#ntf"); assert json.loads(pg.evaluate("localStorage.getItem('aad.notify_daily')")) is True
        with pg.expect_download() as d: pg.click("#bk-save")
        bk = json.loads(open(d.value.path()).read()); print("yedek anahtarlari:", sorted(bk["data"])[:12]); assert bk["app"] == "advanced-analytics" and "notify_daily" in bk["data"] and "fg_move" not in bk["data"]
        pg.evaluate("localStorage.removeItem('aad.notify_daily')"); pg.evaluate("t => AAD.onBackup(t)", json.dumps(bk)); assert json.loads(pg.evaluate("localStorage.getItem('aad.notify_daily')")) is True
        pg.screenshot(path="/tmp/oran.png", full_page=True); b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
