"""Futbol ekrani uctan uca denemesi: indirme koprusu taklit edilir (football-data.co.uk bicimiyle uretilmis yapay lig)."""
import json, math, random, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"
rnd = random.Random(8); T = [f"Takım {i}" for i in range(18)]; ATT = {t: rnd.uniform(0.6, 1.5) for t in T}; DEF = {t: rnd.uniform(0.7, 1.4) for t in T}
def pois(l):
    L, k, p = math.exp(-l), 0, 1.0
    while True:
        k += 1; p *= rnd.random()
        if p <= L: return k - 1
def csv(y, n):
    rows, i = ["Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgH,AvgD,AvgA"], 0
    for h in T:
        for a in T:
            if h == a or i >= n: continue
            d = dt.date(y, 8, 10) + dt.timedelta(days=(i // 9) * 7); i += 1
            rows.append(f"SP1,{d:%d/%m/%Y},20:00,{h},{a},{pois(1.35 * ATT[h] * DEF[a])},{pois(ATT[a] * DEF[h])},H,2.10,3.30,3.60")
    return "\r\n".join(rows)
now = dt.datetime.now(dt.timezone.utc)
FIX = "Div,Date,Time,HomeTeam,AwayTeam,AvgH,AvgD,AvgA\n" + "\n".join(f"SP1,{now + dt.timedelta(days=1 + i):%d/%m/%Y},{17 + i}:00,{T[i]},{T[i + 5]},1.90,3.40,4.20" for i in range(3)) + f"\nE0,{now + dt.timedelta(days=1):%d/%m/%Y},15:00,Arsenal,Spurs,,,\n"
cur = now.year if now.month >= 7 else now.year - 1
DATA = {f"{y % 100:02d}{(y + 1) % 100:02d}": csv(y, 110 if y == cur else 306) for y in range(cur - 3, cur + 1)}
OMR = (pathlib.Path(__file__).parent / "fixtures/om_tur1_results.csv").read_text(); OMF = "gw,date,time,home,away\n" + "\n".join(f"13,{(now + dt.timedelta(days=2)):%Y-%m-%d},17:00,{h},{a}" for h, a in [("Galatasaray", "Fenerbahçe"), ("Beşiktaş", "Trabzonspor")])
MI = json.loads((pathlib.Path(__file__).parent / "fixtures/veri_milli.json").read_text()); MI["upcoming"] = [[(now + dt.timedelta(days=3)).strftime("%Y-%m-%dT19:45:00.000Z"), "Turkey", "Spain", "UEFA Nations League", 0], [(now + dt.timedelta(days=4)).strftime("%Y-%m-%dT19:45:00.000Z"), "France", "Germany", "International Friendly", 1]]
EXTRA = {"NED_2_eerste-divisie/results_2627.csv": OMR, "NED_2_eerste-divisie/fixtures_2627.csv": OMF, "veri/milli.json": json.dumps(MI)}
MOCK = "window.__ex = %s; " % json.dumps(EXTRA) + "window.__fb = %s; window.__fix = %s; window.Native = { httpGet: (id, url, h) => setTimeout(() => { const ex = Object.keys(window.__ex).find((k) => url.endsWith(k) || url.endsWith(k.replace('veri/', '@veri/'))); if (ex) return AAD.onHttp(id, 200, window.__ex[ex]); if (url.endsWith('fixtures.csv')) return AAD.onHttp(id, 200, window.__fix); const m = /mmz4281\\/(\\d{4})\\/SP1\\.csv$/.exec(url); m && window.__fb[m[1]] ? AAD.onHttp(id, 200, window.__fb[m[1]]) : AAD.onHttp(id, 404, 'Not Found'); }, 40) };" % (json.dumps(DATA), json.dumps(FIX))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8813", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, has_touch=True).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "404" not in m.text else None)
        pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8813/index.html"); pg.click('#nav [data-v="football"]')
        pg.click("#f-dl"); pg.wait_for_function("document.querySelector('#toast').textContent.includes('İndirilemedi')", timeout=15000)      # Süper Lig taklitte yok: hata mesaji
        pg.select_option("#f-div", "SP1"); pg.click("#f-dl"); pg.wait_for_selector("#f-tabs", timeout=20000)
        assert "1028 maç · 4 sezon" in pg.inner_text("#main"), pg.inner_text("#main")[:200]
        assert pg.locator("#f-body .card").count() == 3; print("hafta:", pg.inner_text("#f-body .card >> nth=0").replace("\n", " | ")[:330]); pg.screenshot(path="/tmp/phone_fb.png")
        pg.click('[data-t="match"]'); pg.select_option("#f-a", "Takım 7"); assert "En olası skorlar" in pg.inner_text("#f-body")
        pg.click('[data-t="eval"]'); pg.click("#f-ev"); pg.wait_for_selector("#f-body table", timeout=30000); print("karne:", pg.inner_text("#f-body table >> nth=0").replace("\n", " | ").replace("\t", " ")[:260]); pg.screenshot(path="/tmp/phone_fb_eval.png", full_page=False)
        pg.click('[data-t="table"]'); assert pg.locator("#f-body tbody tr").count() == 18
        pg.click('#nav [data-v="basket"]'); pg.click('#nav [data-v="football"]'); assert pg.input_value("#f-div") == "SP1" and pg.locator("#f-tabs").count() == 1
        groups = pg.eval_on_selector_all("#f-div optgroup", "g => g.map(x => x.label)"); n_opt = pg.locator("#f-div option").count(); print("lig sayisi:", n_opt, "gruplar:", groups[:5]); assert n_opt >= 76 and groups[0] == "Türkiye"
        # football-data'da olmayan bir lig gibi: open-matchday dosyasi (Super Lig verisiyle) - tek sezon, oran yok
        pg.select_option("#f-div", "om:NED_2_eerste-divisie"); pg.click("#f-dl"); pg.wait_for_selector("#f-tabs", timeout=20000); t = pg.inner_text("#main"); print("open-matchday:", t[:60].replace("\n", " ")); assert "99 maç" in t and "az maçla" in t, t[-900:]
        pg.click('[data-t="week"]'); nc = pg.locator("#f-body .card").count(); assert nc == 2, (nc, pg.inner_text("#f-body")[:300]); pg.click('[data-t="eval"]'); pg.click("#f-ev"); pg.wait_for_selector("#f-body table", timeout=30000); assert "2026-27 sonrası" in pg.inner_text("#f-body")
        pg.select_option("#f-div", "milli"); pg.click("#f-dl"); pg.wait_for_selector("#f-tabs", timeout=30000); t = pg.inner_text("#main"); print("milli:", t[:80].replace("\n", " ")); assert "4098 maç · 2023–2026" in t
        pg.click('[data-t="week"]'); cards = pg.inner_text("#f-body"); assert "UEFA Nations League" in cards and "tarafsız saha" in cards, cards[:400]; pg.screenshot(path="/tmp/phone_milli.png")
        pg.click('[data-t="table"]'); assert pg.locator("#f-body tbody tr").count() == 80 and "Güç sıralaması" in pg.inner_text("#f-body")
        print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
