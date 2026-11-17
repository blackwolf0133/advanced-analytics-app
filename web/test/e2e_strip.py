"""Tek siralik serit (Lightning Rulet, gercek telefon ekran goruntusu): bolge secimi, deneme ve gecmisin aktarilmasi."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_helpers as H
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"; FIX = pathlib.Path(__file__).parent / "fixtures/lightning_telefon.png"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8814", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 360, "height": 800}, device_scale_factor=3, has_touch=True)
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8814/index.html"); pg.click("#new")
        ov = ctx.new_page(); ov.on("pageerror", lambda e: errs.append(str(e))); ov.add_init_script(H.MOCK); ov.goto("http://127.0.0.1:8814/overlay.html"); ov.evaluate(H.LOAD, base64.b64encode(FIX.read_bytes()).decode())
        ov.click("#region"); ov.wait_for_function("document.querySelector('#shot').naturalWidth > 0"); ov.click('[data-a="preset"]')
        sc = 360 / 1080; ov.mouse.move(1, 277 * sc); ov.mouse.down(); ov.mouse.move(359.5, 326 * sc, steps=5); ov.mouse.up()
        ov.wait_for_function("document.querySelector('#hint').textContent.includes('Tablo bulundu')", timeout=20000)   # cizince kendisi okur
        hint = ov.inner_text("#hint"); print("dene:", hint[:90]); ov.screenshot(path="/tmp/phone_strip.png", clip={"x": 0, "y": 60, "width": 360, "height": 80})
        assert int(hint.split("Tablo bulundu: ")[1].split(" ")[0]) >= 13 and "(23)" in hint, hint
        ov.click('[data-a="save"]'); cfg = json.loads(ov.evaluate("localStorage.getItem('aad.screen')")); assert cfg["kind"] == "frame" and cfg["rows"] == 1, cfg
        ov.click("#run"); ov.wait_for_function("document.querySelector('#status').textContent.includes('aktarıldı')", timeout=30000); print("durum:", ov.inner_text("#status"))
        s = json.loads(ov.evaluate("localStorage.getItem('aad.roulette')")); sp = [x["v"] for x in s["sessions"][0]["spins"]]
        assert sp[-6:] == [23, 2, 30, 23][0:0] + [14, 10, 28, 23, 2, 30, 23][-6:], sp; print("aktarilan (eskiden yeniye):", sp, "hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
