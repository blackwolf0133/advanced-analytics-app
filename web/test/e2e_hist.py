"""Gecmis: tek siralik serit ve SON 500 tablosu ayri ayri okunup oturuma dogru sirayla eklenir."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_helpers as H
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"; FIX = pathlib.Path(__file__).parent / "fixtures/rulet_son500.png"
STRIP = [21, 16, 35, 2, 1, 26, 31, 12, 36, 3, 3, 11, 23, 29]
GRID = [23, 29, 33, 26, 5, 26, 35, 10, 18, 18, 10, 19, 25, 21, 29, 33, 35, 5, 34, 24, 35, 10, 12, 20, 3, 14, 16, 15, 34, 36, 21, 4, 7, 11, 12, 33, 33, 9, 15,
        9, 22, 6, 16, 18, 1, 28, 10, 4, 20, 18, 4, 23, 22, 16, 9, 35, 5, 21, 30, 10, 6, 19, 25, 16, 29]
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8817", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
spins = lambda ov: [x["v"] for x in json.loads(ov.evaluate("localStorage.getItem('aad.roulette')"))["sessions"][0]["spins"]]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 360, "height": 800}, device_scale_factor=3, has_touch=True)
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8817/index.html"); pg.click("#new")
        ov = ctx.new_page(); ov.on("pageerror", lambda e: errs.append(str(e))); ov.add_init_script(H.MOCK); ov.goto("http://127.0.0.1:8817/overlay.html"); ov.evaluate(H.LOAD, base64.b64encode(FIX.read_bytes()).decode())
        ov.screenshot(path="/tmp/hist_mini.png")
        def open_hist():
            ov.click("#hist"); ov.wait_for_function("document.body.classList.contains('hist') && !document.querySelector('#hint').textContent.includes('alınıyor')")
            return ov.evaluate("[parseFloat(document.querySelector('#shot').style.top), parseFloat(document.querySelector('#shot').style.width) / 1080]")
        wait = lambda: ov.wait_for_function("document.querySelector('#hint').textContent.includes('okundu')", timeout=30000)
        oy, sc = open_hist(); assert ov.inner_text("#testb") == "Oku" and ov.inner_text("#saveb") == "Ekle"
        ov.mouse.click(180, oy + 282 * sc); wait(); print("serit:", ov.inner_text("#hint")[:30])
        ov.click("#saveb"); print("durum:", ov.inner_text("#status")); assert spins(ov) == STRIP[::-1], spins(ov)
        open_hist(); wait(); ov.click("#saveb"); print("durum:", ov.inner_text("#status")); assert "zaten" in ov.inner_text("#status")
        oy, sc = open_hist(); wait(); ov.evaluate("document.querySelector('#hint').textContent = ''")   # once son serit yeniden okunur
        ov.mouse.move(180 + (55 - 540) * sc, oy + 812 * sc); ov.mouse.down(); ov.mouse.move(180 + (990 - 540) * sc, oy + 1160 * sc, steps=6); ov.mouse.up()
        wait(); print("tablo:", ov.inner_text("#hint")[:40]); ov.screenshot(path="/tmp/hist_grid.png"); assert ov.inner_text("#hint").startswith("65 sayı okundu"), ov.inner_text("#hint")
        ov.click("#saveb"); print("durum:", ov.inner_text("#status"))
        assert spins(ov) == (STRIP + GRID[2:])[::-1], spins(ov)
        ov.click("#run"); ov.wait_for_function("document.body.classList.contains('full')"); ov.wait_for_function("!document.querySelector('#hint').textContent.includes('alınıyor')")   # takip bolgesi yok: secim acilir
        ov.mouse.click(180, oy + 282 * sc); ov.wait_for_function("document.querySelector('#hint').textContent.includes('hücreden')", timeout=30000); ov.click("#saveb")
        ov.click("#run"); ov.wait_for_function("document.querySelector('#status').textContent.includes('başladı')", timeout=30000); print("durum:", ov.inner_text("#status"))
        assert len(spins(ov)) == 77
        print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
