"""Tek siralik serit: tek dokunusla secim, otomatik hizalama, canli onizleme ve sayfa kayinca kendiliginden yeniden bulma."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_helpers as H
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"; FIX = pathlib.Path(__file__).parent / "fixtures/lightning_gri.png"
WANT = [4, 31, 27, 6, 22, 17, 13, 21, 21, 27, 29, 35, 19, 13]
SHIFT = """(dy) => { const o = window.__f, c = document.createElement('canvas'); c.width = o.width; c.height = o.height; const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height); g.drawImage(o, 0, dy); window.__f = c; }"""
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8815", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 356, "height": 628}, device_scale_factor=3, has_touch=True)
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8815/index.html"); pg.click("#new")
        ov = ctx.new_page(); ov.on("pageerror", lambda e: errs.append(str(e))); ov.add_init_script(H.MOCK); ov.goto("http://127.0.0.1:8815/overlay.html"); ov.evaluate(H.LOAD, base64.b64encode(FIX.read_bytes()).decode())
        ov.click("#region"); ov.wait_for_function("document.querySelector('#shot').naturalWidth > 0"); ov.click('[data-a="preset"]')
        assert "DOKUNUN" in ov.inner_text("#hint"), ov.inner_text("#hint")
        sc = 356 / 1068
        for y in (70, 100, 88):                                    # seridin ustune, altina, ortasina kabaca dokunma
            ov.mouse.click(180, y * sc); ov.wait_for_function("document.querySelector('#hint').textContent.includes('hücreden')", timeout=20000)
            hint = ov.inner_text("#hint"); print(f"dokunma y={y}:", hint[:40]); assert hint.startswith("14 hücreden 14"), hint
        ov.screenshot(path="/tmp/tap_picker.png")
        ov.click('[data-a="down"]'); ov.click('[data-a="thick"]'); ov.click('[data-a="align"]'); ov.wait_for_function("document.querySelector('#hint').textContent.includes('hücreden')", timeout=20000)
        ov.click('[data-a="save"]'); cfg = json.loads(ov.evaluate("localStorage.getItem('aad.screen')")); print("kayit:", cfg); assert cfg["rows"] == 1 and cfg["l"] == 0 and cfg["w"] == 1068, cfg
        ov.click("#run"); ov.wait_for_function("document.querySelector('#status').textContent.includes('aktarıldı')", timeout=30000); print("durum:", ov.inner_text("#status"))
        sp = [x["v"] for x in json.loads(ov.evaluate("localStorage.getItem('aad.roulette')"))["sessions"][0]["spins"]]; assert sp == WANT[::-1], sp
        assert ov.evaluate("getComputedStyle(document.querySelector('#peek')).display") != "none"; ov.screenshot(path="/tmp/tap_mini.png")
        ov.evaluate(SHIFT, 34)                                      # adres cubugu acildi: sayfa 34 piksel asagi kaydi
        ov.wait_for_function("document.querySelector('#status').textContent.includes('yeniden bulundu')", timeout=30000)
        cfg2 = json.loads(ov.evaluate("localStorage.getItem('aad.screen')")); print("kayma sonrasi:", cfg["t"], "->", cfg2["t"]); assert abs(cfg2["t"] - cfg["t"] - 34) <= 8, cfg2
        ov.wait_for_function("document.querySelector('#status').textContent.includes('Okunuyor') || document.querySelector('#status').textContent.includes('başladı')", timeout=30000)
        sp2 = [x["v"] for x in json.loads(ov.evaluate("localStorage.getItem('aad.roulette')"))["sessions"][0]["spins"]]; assert sp2 == sp, sp2   # kayma yeni sayi uretmemeli
        print("durum:", ov.inner_text("#status"), "| hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
