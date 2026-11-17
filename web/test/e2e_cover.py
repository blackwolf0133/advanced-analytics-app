"""Yuzen pencere okunan seridin ustundeyse (gercek telefon goruntusu: pencere ust seridi kapatiyor) kenara cekilir."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_helpers as H
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"; FIX = pathlib.Path(__file__).parent / "fixtures/rulet_ortu.png"
WIN = "window.__win = [390, 45, 500, 670]; window.__moves = []; window.Native.winRect = () => window.__win.join(','); window.Native.moveBy = (dx, dy) => { window.__moves.push(dy); window.__win[1] += dy; };"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8817", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 360, "height": 800}, device_scale_factor=3, has_touch=True)
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8817/index.html"); pg.click("#new")
        ov = ctx.new_page(); ov.on("pageerror", lambda e: errs.append(str(e))); ov.add_init_script(H.MOCK + WIN)
        ov.add_init_script("localStorage.setItem('aad.screen', JSON.stringify({ l: 0, t: 256, w: 1080, h: 50, rows: 1, cols: 14, first: 1.6, newest: 'first', sw: 1080, sh: 2400 }))")
        ov.goto("http://127.0.0.1:8817/overlay.html"); ov.evaluate(H.LOAD, base64.b64encode(FIX.read_bytes()).decode())
        ov.click("#run"); ov.wait_for_function("window.__moves.length > 0", timeout=15000); mv = ov.evaluate("window.__moves"); print("kaydirma:", mv, ov.inner_text("#status"))
        assert mv[0] > 250 and ov.evaluate("window.__win[1]") >= 306 + 40, mv
        ov.wait_for_function("document.querySelector('#status').textContent.includes('aktarıldı')", timeout=30000); print("durum:", ov.inner_text("#status"))
        assert ov.evaluate("window.__moves.length") == 1
        # pencere yeniden seridin ustune surüklenirse yine cekilir; ust tarafta yer varsa yukari
        ov.evaluate("window.__win = [300, 300, 500, 200]"); ov.wait_for_function("window.__moves.length > 1", timeout=8000); print("ikinci:", ov.evaluate("window.__moves"), ov.evaluate("window.__win"))
        assert ov.evaluate("window.__win[1]") >= 306 + 40; b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
