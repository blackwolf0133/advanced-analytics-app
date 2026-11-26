"""Kombine sekmesi: futbol banko / maç sonucu / sürpriz kuponlari (kalibre), kaydetme ve sonuc isleme."""
import json, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent; WWW = HERE.resolve().parents[1] / "app/src/main/assets/www"
G = json.loads((HERE / "fixtures/veri_gun.json").read_text()); now = dt.datetime.now(dt.timezone.utc); up = dt.datetime.fromisoformat(G["updated"].replace("Z", "+00:00"))
for m in G["matches"]: m["t"] = (now + (dt.datetime.fromisoformat(m["t"].replace("Z", "+00:00")) - up)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
G["updated"] = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
_D = json.loads((HERE / "fixtures/veri_gunluk.json").read_text()); _ist = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=3)
_ks = sorted(_D["days"]); _D["days"] = {(_ist - dt.timedelta(days=len(_ks) - 1 - i)).strftime("%Y-%m-%d"): _D["days"][k] for i, k in enumerate(_ks)}   # dun / bugun
D = json.dumps(_D)
MOCK = "window.__g = %s; window.__d = %s; window.Native = { httpGet: (id, url) => setTimeout(() => { if (url.endsWith('f/gun.json')) return AAD.onHttp(id, 200, window.__g); if (url.endsWith('f/gunluk.json')) return AAD.onHttp(id, 200, window.__d); AAD.onHttp(id, 404, ''); }, 20) };" % (json.dumps(json.dumps(G)), json.dumps(D))
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8820", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); ctx = b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2)
        pg = ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8820/index.html")
        pg.click('#nav [data-v="kombine"]'); pg.click("#k-dl"); pg.wait_for_selector("#k-up:not([disabled])", timeout=15000)
        pg.click('#k-when [data-w="72"]'); pg.wait_for_selector(".kcard", timeout=15000)
        cards = pg.locator(".kcard.banko, .kcard.ms, .kcard.surpriz").filter(has=pg.locator(".ksave")); print("kupon:", cards.count())
        for i in range(cards.count()): print("---", cards.nth(i).inner_text().replace("\n", " | ")[:400])
        txt = pg.inner_text("#main"); print(txt[:1500])
        assert "Günlük banko kombinen" in txt and "15 günlük deneme" in txt and "Dünün sonuçları" in txt and "TUTTU" in txt
        assert pg.locator(".kcard.gol6").count() == 2 and pg.locator(".kcard.kk2").count() == 2 and "2 / 7 tuttu" in txt
        assert pg.locator(".ksave").count() == 3
        txt = pg.inner_text("#main"); assert "Geçmiş test" in txt and "Adil oran" in txt
        pg.screenshot(path="/tmp/kombine.png", full_page=True)
        leg = pg.locator(".kcard.banko .kleg").first.inner_text(); print("ilk banko secim:", leg.replace("\n", " | "))
        pg.locator('.ksave[data-mode="banko"]').click(); pg.wait_for_selector(".ksaved")
        sv = json.loads(pg.evaluate("localStorage.getItem('aad.kb_saved')")); assert len(sv) == 1 and len(sv[0]["legs"]) == 3
        # sonuc: kayitli kuponun maclari bitti -> islenir
        ids = [l["id"] for l in sv[0]["legs"]]
        pg.evaluate("(ids) => { const g = JSON.parse(localStorage.getItem('aad.fg_gun')); for (const m of g.matches) if (ids.includes(m.id)) { m.st = 'post'; m.r = [3, 0]; } localStorage.setItem('aad.fg_gun', JSON.stringify(g)); }", ids)
        pg.click('#nav [data-v="football"]'); pg.click('#nav [data-v="kombine"]'); pg.wait_for_selector(".ksaved"); pg.wait_for_timeout(300)
        pg.click('#nav [data-v="football"]'); pg.click('#nav [data-v="kombine"]'); pg.wait_for_selector(".ksaved")
        s = pg.inner_text(".ksaved"); print("kayitli:", s.replace("\n", " | ")); assert "✓" in s or "✗" in s
        b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
