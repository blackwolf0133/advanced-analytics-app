"""Kombine -> Para akisi: bahis % / para %, buyuk para isareti, sinyal karnesi."""
import json, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent; WWW = HERE.resolve().parents[1] / "app/src/main/assets/www"
P = json.loads((HERE / "fixtures/veri_para.json").read_text()); now = dt.datetime.now(dt.timezone.utc)
t0 = min(dt.datetime.fromisoformat(g["t"].replace("Z", "+00:00")) for g in P["games"])
for g in P["games"]: g["t"] = (now + dt.timedelta(hours=2) + (dt.datetime.fromisoformat(g["t"].replace("Z", "+00:00")) - t0)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
DATA = {"/veri/f/para.json": json.dumps(P)}
MOCK = "window.__d = %s; window.Native = { httpGet: (id, url, h) => setTimeout(() => { const k = Object.keys(window.__d).find((k) => url.includes(k)); k ? AAD.onHttp(id, 200, window.__d[k]) : AAD.onHttp(id, 404, ''); }, 15) };" % json.dumps(DATA)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8823", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); pg = b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8823/index.html")
        pg.click('#nav [data-v="kombine"]'); pg.click('#ksec [data-sec="para"]'); pg.wait_for_selector(".pa-g", timeout=15000)
        t = pg.inner_text("#k-para"); print(t[:1600])
        assert "💰" in t and "Büyük para:" in t and "paranın %" in t and "1/1" in t
        first = pg.inner_text("#k-para .pa-g >> nth=0"); assert "Utah Jazz" in first, first      # en buyuk para farki (34 puan) ustte
        assert pg.locator(".pa-leg .on").count() >= 3
        # bos (0/0) handikap pazari gosterilmez; buyuk yuvarlak (rulet .big) sinifi kullanilmaz
        assert pg.locator("#k-para .big").count() == 0
        pg.screenshot(path="/tmp/para.png", full_page=True); pg.locator(".pa-g").nth(0).screenshot(path="/tmp/para_g0.png"); pg.locator(".pa-g").nth(1).screenshot(path="/tmp/para_g1.png")
        pg.click('#pa-v [data-v="all"]'); pg.wait_for_timeout(200); n_all = pg.locator(".pa-g").count()
        pg.click('#pa-sp [data-s="soccer"]'); pg.wait_for_timeout(200); assert "NBA" not in " ".join(pg.locator(".pa-g").all_inner_texts())
        assert pg.locator(".pa-g").count() < n_all
        b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
