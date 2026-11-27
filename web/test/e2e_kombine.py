"""Kombine sekmesi: futbol banko / maç sonucu / sürpriz kuponlari (kalibre), kaydetme ve sonuc isleme."""
import json, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent; WWW = HERE.resolve().parents[1] / "app/src/main/assets/www"
G = json.loads((HERE / "fixtures/veri_gun.json").read_text()); now = dt.datetime.now(dt.timezone.utc); up = dt.datetime.fromisoformat(G["updated"].replace("Z", "+00:00"))
for m in G["matches"]: m["t"] = (now + (dt.datetime.fromisoformat(m["t"].replace("Z", "+00:00")) - up)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
G["updated"] = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
_D = json.loads((HERE / "fixtures/veri_gunluk.json").read_text()); _ist = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=3)
_ks = sorted(_D["days"]); _D["days"] = {(_ist - dt.timedelta(days=len(_ks) - 1 - i)).strftime("%Y-%m-%d"): _D["days"][k] for i, k in enumerate(_ks)}   # dun / bugun
D = json.dumps(_D)
_leg = lambda h, a, lab, o, p: {"id": h, "lg": "nba", "ln": "NBA", "t": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8)).strftime("%Y-%m-%dT%H:%M:00.000Z"), "h": h, "a": a, "mk": "1", "label": lab, "odd": o, "mbs": 1, "p": p, "pm": p, "q": p, "res": None}
_t = _ist.strftime("%Y-%m-%d")
BB = json.dumps({"v": 2, "updated": dt.datetime.now(dt.timezone.utc).isoformat(), "days": {_t: {"d": _t, "combo": {"built": dt.datetime.now(dt.timezone.utc).isoformat(), "odds": 1.36, "p": 0.64, "legs": [_leg("New York Knicks", "Miami Heat", "MS 1", 1.36, 0.64)]},
  "orta": {"built": dt.datetime.now(dt.timezone.utc).isoformat(), "odds": 2.41, "p": 0.38, "legs": [_leg("Denver Nuggets", "Utah Jazz", "MS 1", 1.29, 0.74), _leg("Lakers", "Spurs", "İY 112,5 Üst", 1.87, 0.55)]}}},
  "sum": {"combo": {"days": 0, "won": 0, "exp": 0, "streak": 0, "best": 0}}})
MOCK = "window.__b = %s; window.__g = %s; window.__d = %s; window.Native = { httpGet: (id, url) => setTimeout(() => { if (url.endsWith('f/gun.json')) return AAD.onHttp(id, 200, window.__g); if (url.endsWith('f/gunluk.json')) return AAD.onHttp(id, 200, window.__d); if (url.endsWith('b/gunluk.json')) return AAD.onHttp(id, 200, window.__b); AAD.onHttp(id, 404, ''); }, 20) };" % (json.dumps(BB), json.dumps(json.dumps(G)), json.dumps(D))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8820", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8820/index.html")
        sec = lambda k: (pg.click(f'#ksec [data-sec="{k}"]'), pg.wait_for_timeout(150))
        pg.click('#nav [data-v="kombine"]'); pg.wait_for_selector("#ksec", timeout=15000)
        assert pg.locator("#ksec button").count() == 12
        pg.wait_for_function("document.querySelector('#main').innerText.includes('Günlük banko kombinen')", timeout=15000)
        txt = pg.inner_text("#main"); print(txt[:900])
        assert "15 günlük deneme" in txt and "Dünün kombinesi" in txt and "TUTTU" in txt and "6+ gol listesi" not in txt
        pg.screenshot(path="/tmp/kombine_banko.png", full_page=True)
        sec("g6"); txt = pg.inner_text("#main"); assert pg.locator(".kcard.gol6").count() == 2 and "2 / 7 tuttu" in txt and "Günlük banko kombinen" not in txt and "Neden 7 maçta" in txt
        sec("kk2"); assert pg.locator(".kcard.kk2").count() == 2
        sec("iykg"); assert "İlk yarı KG Var" in pg.inner_text("#main")
        sec("iyu"); assert "İlk yarı 0,5 Üst" in pg.inner_text("#main"); pg.click('#k-iyu [data-iyu="iu15"]'); pg.wait_for_timeout(150); assert "İlk yarı 1,5 Üst ·" in pg.inner_text("#main")
        sec("u35"); sec("kgv"); sec("karne"); txt = pg.inner_text("#main"); assert "Son günler" in txt or "Sanal kasa" in txt, txt
        sec("basket"); txt = pg.inner_text("#main")
        assert "Basketbol banko" in txt and "Basketbol orta" in txt and "Basketbol sürpriz" in txt and "İY 112,5 Üst" in txt, txt
        pg.screenshot(path="/tmp/kombine_basket.png", full_page=True)
        sec("model"); pg.click("#k-dl"); pg.wait_for_selector("#k-up:not([disabled])", timeout=15000)
        pg.click('#k-when [data-w="72"]'); pg.wait_for_selector(".kcard", timeout=15000)
        cards = pg.locator(".kcard.banko, .kcard.ms, .kcard.surpriz").filter(has=pg.locator(".ksave")); print("kupon:", cards.count())
        assert pg.locator(".ksave").count() == 3
        txt = pg.inner_text("#main"); assert "Geçmiş test" in txt and "Adil oran" in txt
        pg.screenshot(path="/tmp/kombine.png", full_page=True)
        pg.locator('.ksave[data-mode="banko"]').click(); pg.wait_for_timeout(300)
        sv = json.loads(pg.evaluate("localStorage.getItem('aad.kb_saved')")); assert len(sv) == 1 and len(sv[0]["legs"]) == 3
        ids = [l["id"] for l in sv[0]["legs"]]
        pg.evaluate("(ids) => { const g = JSON.parse(localStorage.getItem('aad.fg_gun')); for (const m of g.matches) if (ids.includes(m.id)) { m.st = 'post'; m.r = [3, 0]; } localStorage.setItem('aad.fg_gun', JSON.stringify(g)); }", ids)
        sec("mine"); pg.wait_for_selector(".ksaved")
        s = pg.inner_text(".ksaved"); print("kayitli:", s.replace("\n", " | ")); assert "✓" in s or "✗" in s
        assert "1 kupon" in pg.inner_text('#ksec [data-sec="mine"]')
        sec("para"); pg.wait_for_selector("#k-para", timeout=5000)
        b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
