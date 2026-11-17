"""Gercek oyun ekrani (ust serit + istatistik paneli): Tablo modundayken bile tek dokunus seridi ve kutu duzenini bulur."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_helpers as H
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"; FIX = pathlib.Path(__file__).parent / "fixtures/rulet_panel_a.png"
SEQ = [21, 16, 35, 2, 1, 26, 31, 12, 36, 3, 3, 11, 23, 29]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8816", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 360, "height": 800}, device_scale_factor=3, has_touch=True)
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8816/index.html"); pg.click("#new")
        ov = ctx.new_page(); ov.on("pageerror", lambda e: errs.append(str(e))); ov.add_init_script(H.MOCK); ov.goto("http://127.0.0.1:8816/overlay.html"); ov.evaluate(H.LOAD, base64.b64encode(FIX.read_bytes()).decode())
        ov.click("#region"); ov.wait_for_function("document.querySelector('#shot').naturalWidth > 0")
        oy, sc = ov.evaluate("[parseFloat(document.querySelector('#shot').style.top), parseFloat(document.querySelector('#shot').style.width) / 1080]")
        for y, n in ((752, 12), (280, 14)):                         # once istatistik panelindeki serit, sonra ustteki serit
            ov.evaluate("document.querySelector('#hint').textContent = ''")
            ov.mouse.click(180, oy + y * sc); ov.wait_for_function("document.querySelector('#hint').textContent.includes('hücreden')", timeout=30000)
            hint = ov.inner_text("#hint"); print(f"dokunma y={y}:", hint[:42]); assert hint.startswith(f"{n} hücreden {n}"), hint
            res = ov.evaluate("JSON.stringify([...document.querySelectorAll('#cols')].map(e => e.textContent))"); print("   sütun:", res)
        ov.screenshot(path="/tmp/panel_picker.png")
        ov.click('[data-a="save"]'); cfg = json.loads(ov.evaluate("localStorage.getItem('aad.screen')")); print("kayit:", cfg)
        ov.click("#run"); ov.wait_for_function("document.querySelector('#status').textContent.includes('aktarıldı')", timeout=30000); print("durum:", ov.inner_text("#status"))
        sp = [x["v"] for x in json.loads(ov.evaluate("localStorage.getItem('aad.roulette')"))["sessions"][0]["spins"]]; assert sp == SEQ[::-1], sp
        print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
