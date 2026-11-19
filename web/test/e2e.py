"""Arayuz uctan uca denemesi (telefon boyutunda Chrome). Yuzen pencere icin Native koprusu taklit edilir:
ekran goruntusu olarak gercek oyun ekrani verilir, sonra tabloya yeni bir sayi 'gelir'."""
import base64, json, subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"
FIX = pathlib.Path(__file__).parent / "fixtures/oyun_ekrani.png"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8811", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
MOCK = """
window.__modes = [];
window.Native = {
  setMode: (m) => window.__modes.push(m), stopCapture: () => { window.__stopped = true; }, screenSize: () => window.__f ? window.__f.width + ',' + window.__f.height : '0,0',
  _raw: (l, t, w, h) => { if (!window.__f) return ''; const d = window.__f.getContext('2d').getImageData(l, t, w, h).data; let s = ''; for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode.apply(null, d.subarray(i, i + 8192)); return w + ',' + h + ',' + btoa(s); },
  grabRaw: (l, t, w, h) => window.Native._raw(l, t, w, h), grabFrozen: (l, t, w, h) => window.Native._raw(l, t, w, h),
  screenshot: () => window.__f ? window.__f.width + ',' + window.__f.height + ',' + window.__f.toDataURL('image/png') : '',
};
"""
LOAD = """async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0); window.__f = c; }"""
# yeni tur: tablonun ilk satiri bir hucre saga kayar, basa 8 gelir (7. sutundaki 8 kopyalanir)
SHIFT = """() => { const g = window.__f.getContext('2d'), L = 1270, T = 200, W = 320, H = 322, cw = W / 10, ch = Math.round(H / 9); const row = g.getImageData(L, T, W, ch), eight = g.getImageData(L + 7 * cw, T, cw, ch); g.putImageData(row, L + cw, T, 0, 0, W - cw, ch); g.putImageData(eight, L, T); }"""
errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, has_touch=True)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append("app: " + str(e))); pg.on("console", lambda m: errs.append("app: " + m.text) if m.type == "error" else None)
        pg.goto("http://127.0.0.1:8811/index.html"); pg.click("#new")
        for v in (10, 17, 3, 10, 17, 10): pg.click(f'#pad [data-n="{v}"]')
        assert pg.inner_text(".big") == "17", pg.inner_text(".big")
        pg.click('#pad [data-n="17"]')
        assert pg.locator(".hist .ball.star").count() == 2 and "Son tahmin tuttu" in pg.inner_text(".pred")
        assert pg.locator(".zone").count() == 3 and pg.locator(".zone .ball").count() == 15
        pg.click("#undo"); assert pg.locator(".hist .ball.star").count() == 1
        assert pg.locator(".trow").count() == 2 and "şansla beklenen" in pg.inner_text(".trow >> nth=0"), pg.inner_text("#main")
        pg.select_option("#tpay", "29"); pg.wait_for_timeout(200); assert json.loads(pg.evaluate("localStorage.getItem('aad.trial')"))["pay"] == 29
        pg.screenshot(path="/tmp/phone_roulette.png", full_page=False)
        for v in ("football", "basket", "settings", "roulette"): pg.click(f'#nav [data-v="{v}"]')
        pg.click("#new")                                            # ekran okuma icin bos oturum
        print("uygulama: tamam")

        ov = ctx.new_page(); ov.set_viewport_size({"width": 829, "height": 290})
        ov.on("pageerror", lambda e: errs.append("ov: " + str(e))); ov.on("console", lambda m: errs.append("ov: " + m.text) if m.type == "error" else None)
        ov.add_init_script(MOCK); ov.goto("http://127.0.0.1:8811/overlay.html"); ov.evaluate(LOAD, base64.b64encode(FIX.read_bytes()).decode())
        ov.click("#region"); ov.wait_for_function("document.querySelector('#shot').naturalWidth > 0")
        ov.click('[data-a="flip"]')                                 # cubuk tablonun ustunu kapatmasin
        sc = ov.evaluate("Math.min(innerWidth / 1657, innerHeight / 580)"); ox = ov.evaluate("(innerWidth - 1657 * Math.min(innerWidth / 1657, innerHeight / 580)) / 2"); oy = ov.evaluate("(innerHeight - 580 * Math.min(innerWidth / 1657, innerHeight / 580)) / 2")
        ov.mouse.move(ox + 1270 * sc, oy + 200 * sc); ov.mouse.down(); ov.mouse.move(ox + 1590 * sc, oy + 522 * sc, steps=6); ov.mouse.up()
        ov.wait_for_function("document.querySelector('#hint').textContent.includes('Tablo bulundu')", timeout=20000)   # cizince kendisi okur
        hint = ov.inner_text("#hint"); print("dene:", hint[:90]); ov.screenshot(path="/tmp/phone_picker.png")
        ok = int(hint.split("Tablo bulundu: ")[1].split(" ")[0]); assert ok >= 86, hint       # cerceve: duzen ve en yeni sayi kendiliginden
        ov.click('[data-a="save"]'); cfg = json.loads(ov.evaluate("localStorage.getItem('aad.screen')")); print("bolge:", cfg)
        ov.click("#run"); ov.wait_for_function("document.querySelector('#status').textContent.includes('aktarıldı')", timeout=30000)
        print("durum:", ov.inner_text("#status"))
        ov.evaluate(SHIFT); ov.wait_for_function("document.querySelector('#status').textContent.startsWith('Yeni sayı')", timeout=15000)
        print("durum:", ov.inner_text("#status")); ov.set_viewport_size({"width": 190, "height": 230}); ov.wait_for_timeout(500); ov.screenshot(path="/tmp/phone_overlay.png")
        s = json.loads(ov.evaluate("localStorage.getItem('aad.roulette')")); sp = [x for x in s["sessions"] if x["id"] == s["active"]][0]["spins"]
        assert sp[-1]["v"] == 8 and "imp" not in sp[-1] and "p" in sp[-1] and sp[-2] == {"v": 22, "imp": 1} and len(sp) >= 87, sp[-3:]
        ov.click("#top"); assert ov.evaluate("document.body.className") == "ball" and ov.evaluate("window.__modes.slice(-1)[0]") == "ball"
        pg.bring_to_front(); pg.wait_for_timeout(1800); assert pg.inner_text(".tiles .tile:nth-child(6) b") == str(len(sp))   # ana uygulama diskten yeniler
        print("yuzen pencere: tamam,", len(sp), "sayi; son:", sp[-1]); print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
