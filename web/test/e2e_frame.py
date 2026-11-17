"""Cerceve: eski surumde elle verilen tablo (gercek telefon goruntusu, Mega Rulet SON 500, ustunde yuzen pencere) kendiliginden
cerceveye doner; en yeni sayi (sol ustteki 29) bulunur. Tablo kayinca en yeni sayi yeniden bulunur, yanlis sayi eklenmez."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_helpers as H
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"; FIX = pathlib.Path(__file__).parent / "fixtures/mega_son500.png"
WIN = "window.__win = [252, 1500, 498, 672]; window.__moves = []; window.Native.winRect = () => window.__win.join(','); window.Native.moveBy = (dx, dy) => { window.__moves.push(dy); window.__win[1] += dy; };"
ROW1 = [29, 4, 27, 21, 13, 14, 1, 8]   # 34 (100x rozetli) okunamayabilir
SHIFT = """(dy) => { const c = window.__f, g = c.getContext('2d'), t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0);
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, c.width, c.height); g.drawImage(t, 0, 0, c.width, 700, 0, 0, c.width, 700); g.drawImage(t, 0, 700, c.width, 1500 - dy, 0, 700 + dy, c.width, 1500 - dy); }"""
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8818", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
spins = lambda ov: [x["v"] for x in json.loads(ov.evaluate("localStorage.getItem('aad.roulette')"))["sessions"][0]["spins"]]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 360, "height": 800}, device_scale_factor=3, has_touch=True)
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8818/index.html"); pg.click("#new")
        ov = ctx.new_page(); ov.on("pageerror", lambda e: errs.append(str(e))); ov.add_init_script(H.MOCK + WIN)
        ov.add_init_script("if (!localStorage.getItem('aad.screen')) localStorage.setItem('aad.screen', JSON.stringify({ l: 20, t: 690, w: 1040, h: 1420, rows: 9, cols: 10, first: 1, newest: 'first', sw: 1080, sh: 2400 }))")
        ov.goto("http://127.0.0.1:8818/overlay.html"); ov.evaluate(H.LOAD, base64.b64encode(FIX.read_bytes()).decode())
        assert json.loads(ov.evaluate("localStorage.getItem('aad.screen')"))["kind"] == "frame"
        t0 = time.time(); ov.click("#run"); ov.wait_for_function("document.querySelector('#status').textContent.includes('aktarıldı')", timeout=60000)
        print("durum:", ov.inner_text("#status"), f"({time.time() - t0:.1f} sn)"); sp = spins(ov); print("en yeniler:", sp[::-1][:12])
        assert sp[::-1][:8] == ROW1, sp[::-1][:12]; assert ov.evaluate("window.__moves.length") == 0
        n0 = len(sp)
        # oyunda panel bir satir asagi kaydi: eski yerde okunan satir artik en yeni satir degil -> yeniden aranir
        ov.evaluate(SHIFT, 84); ov.wait_for_function("document.querySelector('#status').textContent.includes('aranıyor')", timeout=20000); print("durum:", ov.inner_text("#status"))
        ov.wait_for_function("document.querySelector('#status').textContent.includes('başladı')", timeout=60000); print("durum:", ov.inner_text("#status"))
        ov.wait_for_timeout(3000); assert len(spins(ov)) == n0, spins(ov)[::-1][:10]
        ov.evaluate("document.querySelector('#region').click()"); ov.wait_for_function("document.querySelector('#hint').textContent.includes('Tablo bulundu')", timeout=30000)
        print("bolge:", ov.inner_text("#hint")[:70]); assert "(29)" in ov.inner_text("#hint"); ov.screenshot(path="/tmp/frame_pick.png")
        b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
