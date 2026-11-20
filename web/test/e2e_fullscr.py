"""Gercek telefon goruntusu (tarayici tam ekran oldu, cerceve tablonun 3. satirina denk geliyor): cerceve yukari genisler,
en yeni satir (2 30 6 20 10 ...) bulunur; yanlis satirdan sayi eklenmez."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_helpers as H
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"; FIX = pathlib.Path(__file__).parent / "fixtures/mega_tam_ekran.png"
WIN = "window.__win = [35, 1068, 533, 720]; window.Native.winRect = () => window.__win.join(','); window.Native.moveBy = (dx, dy) => { window.__win[1] += dy; };"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8819", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
spins = lambda ov: [x["v"] for x in json.loads(ov.evaluate("localStorage.getItem('aad.roulette')"))["sessions"][0]["spins"]]
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 360, "height": 800}, device_scale_factor=3, has_touch=True)
        pg = ctx.new_page(); pg.goto("http://127.0.0.1:8819/index.html"); pg.click("#new")
        ov = ctx.new_page(); ov.on("pageerror", lambda e: errs.append(str(e))); ov.add_init_script(H.MOCK + WIN)
        ov.add_init_script("if (!localStorage.getItem('aad.screen')) localStorage.setItem('aad.screen', JSON.stringify({ l: 20, t: 690, w: 1040, h: 1400, kind: 'frame', rows: 14, cols: 9, newest: 'first', sw: 1080, sh: 2396 }))")
        ov.goto("http://127.0.0.1:8819/overlay.html"); ov.evaluate(H.LOAD, base64.b64encode(FIX.read_bytes()).decode())
        ov.click("#run"); ov.wait_for_function("document.querySelector('#status').textContent.includes('aktarıldı')", timeout=90000); print("durum:", ov.inner_text("#status"))
        t = json.loads(ov.evaluate("localStorage.getItem('aad.screen')"))["t"]; print("cerceve ust:", t); assert t < 600, t     # 690'dan yukari genisledi
        sp = spins(ov)[::-1]; print("en yeniler:", sp[:12]); assert sp[:9] == [2, 30, 6, 20, 10, 23, 30, 26, 9], sp[:12]
        b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
