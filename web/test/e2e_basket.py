"""Basketbol ekrani uctan uca: gercek EuroLeague verisi (veri dalindaki dosya) taklit koprusuyle indirilir; lig secimi, maclar, sonuclar, karne, siralama."""
import json, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent; WWW = HERE.resolve().parents[1] / "app/src/main/assets/www"
EL = json.loads((HERE / "fixtures/veri_euroleague.json").read_text()); IDX = (HERE / "fixtures/veri_index.json").read_text()
now = dt.datetime.now(dt.timezone.utc)
EL["upcoming"] = [[(now + dt.timedelta(hours=5 + 3 * i)).strftime("%Y-%m-%dT%H:%M:00.000Z"), u[1], u[2], u[3]] for i, u in enumerate(EL["upcoming"][:6])]
EL["updated"] = now.isoformat()
DATA = {"index.json": IDX, "b/euroleague.json": json.dumps(EL)}
MOCK = "window.__d = %s; window.Native = { httpGet: (id, url, h) => setTimeout(() => { const k = Object.keys(window.__d).find((k) => url.endsWith('/veri/' + k) || url.endsWith('@veri/' + k)); k ? AAD.onHttp(id, 200, window.__d[k]) : AAD.onHttp(id, 404, 'Not Found'); }, 50) };" % json.dumps(DATA)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8812", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, has_touch=True).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "404" not in m.text else None)
        pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8812/index.html"); pg.click('#nav [data-v="basket"]')
        assert "veri yok" in pg.inner_text("#main"); pg.click("#b-dl"); pg.wait_for_function("document.querySelector('#toast').textContent.includes('İndirilemedi')", timeout=15000)   # NBA taklitte yok
        opts = pg.eval_on_selector_all("#b-lg option", "o => o.map(x => x.textContent)"); print("ligler:", len(opts), opts[:4]); assert len(opts) == 12 and pg.eval_on_selector_all("#b-lg optgroup", "g => g.map(x => x.label)")[0] == "Türkiye"
        pg.select_option("#b-lg", "euroleague"); pg.click("#b-dl"); pg.wait_for_selector("#b-tabs", timeout=30000)
        txt = pg.inner_text("#main"); assert "842 maç" in txt and "2024-25, 2025-26, 2026-27" in txt, txt[:300]
        n = pg.locator("#b-body .tiles").count(); print("yaklasan kart:", n, "|", pg.inner_text("#b-body .card >> nth=1").replace("\n", " | ")[:200]); assert n >= 4; pg.screenshot(path="/tmp/phone_bb.png")
        pg.click('[data-t="results"]'); marks = pg.locator("#b-body .mark").count(); oks = pg.locator("#b-body .mark.ok").count(); print("sonuclar:", marks, "satir,", oks, "tutan"); assert marks > 5 and 0 < oks < marks
        pg.click('[data-t="match"]'); pg.select_option("#b-a", index=3); pg.check("#b-n"); t = pg.inner_text("#b-body"); assert "Tarafsız saha" in t and "ev avantajı" not in t
        pg.click('[data-t="eval"]'); print("karne:", pg.inner_text("#b-body .tiles").replace("\n", " ")[:300]); assert "Ev avantajı (veriden)" in pg.inner_text("#b-body"); pg.screenshot(path="/tmp/phone_bb_eval.png")
        pg.click('[data-t="table"]'); assert pg.locator("#b-body tbody tr").count() == 20
        pg.click('#nav [data-v="roulette"]'); pg.click('#nav [data-v="basket"]'); assert pg.input_value("#b-lg") == "euroleague" and pg.locator("#b-tabs").count() == 1
        print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
