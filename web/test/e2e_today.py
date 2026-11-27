"""Futbol 'Gunun maclari': gercek veri dalindaki gun.json (saatler bugune kaydirilir), coklu lig secimi, siralama, tahminler, canli skor (taklit ESPN) ve renkli sonuc."""
import json, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent; WWW = HERE.resolve().parents[1] / "app/src/main/assets/www"
G = json.loads((HERE / "fixtures/veri_gun.json").read_text()); now = dt.datetime.now(dt.timezone.utc); up = dt.datetime.fromisoformat(G["updated"].replace("Z", "+00:00"))
for m in G["matches"]: m["t"] = (now + (dt.datetime.fromisoformat(m["t"].replace("Z", "+00:00")) - up)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
G["updated"] = now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
# canli mac: tahmini olan, baslamamis bir mac 50 dakika once baslamis sayilir; ESPN taklidi 1-0 ve 67. dakika dondurur
live = next(m for m in G["matches"] if m["st"] == "pre" and m["pr"] and m["lg"] == "uefa.nations")
live["t"] = (now - dt.timedelta(minutes=50)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
ESPN = {"events": [{"id": live["id"], "date": live["t"], "status": {"type": {"name": "STATUS_SECOND_HALF", "state": "in", "shortDetail": "67'"}},
  "competitions": [{"status": {"displayClock": "67'"}, "competitors": [{"homeAway": "home", "team": {"id": "1", "displayName": live["h"]}, "score": "1"}, {"homeAway": "away", "team": {"id": "2", "displayName": live["a"]}, "score": "0"}],
  "details": [{"scoringPlay": True, "team": {"id": "1"}, "clock": {"displayValue": "23'"}}]}]}]}
pk = live["pr"]["p"].index(max(live["pr"]["p"])); want = "live-ok" if pk == 0 else "live-no"
MOCK = "window.__g = %s; window.__e = %s; window.__calls = []; window.__posts = []; window.Native = { httpPost: (id, url, h, body) => setTimeout(() => { const b = JSON.parse(body); window.__posts.push(b.model); const r2 = b.messages[1].content.includes('Diğer analistlerin'); const p = b.model.startsWith('gpt') ? [52, 26, 22] : b.model.startsWith('Qwen') ? [45, 30, 25] : [38, 32, 30]; AAD.onHttp(id, 200, JSON.stringify({ choices: [{ message: { content: JSON.stringify({ p1: r2 ? 48 : p[0], px: p[1], p2: p[2], iy_skor: '0-0', ms_skor: b.model.startsWith('kilo') ? '1-1' : '1-0', ust25: 52, kg: 50, guven: 'orta', gerekce: r2 ? 'Diğer analistlerle büyük ölçüde aynı fikirdeyim.' : 'Ev sahibi biraz önde.' }) } }] })); }, 120), httpGet: (id, url, h) => setTimeout(() => { window.__calls.push(url); if (url.endsWith('f/gun.json')) return AAD.onHttp(id, 200, window.__g); if (url.includes('/soccer/%s/scoreboard')) return AAD.onHttp(id, 200, window.__e); AAD.onHttp(id, 200, JSON.stringify({ events: [] })); }, 30) };" % (json.dumps(json.dumps(G)), json.dumps(json.dumps(ESPN)), live["lg"])
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8818", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = b.new_context(viewport={"width": 390, "height": 860}, device_scale_factor=2, has_touch=True).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8818/index.html"); pg.click('#nav [data-v="football"]')
        assert pg.locator('[data-mode="today"].primary').count() == 1; pg.click("#fg-dl"); pg.wait_for_selector("#fg-list", timeout=20000)
        print("ust:", pg.inner_text("#fg-body .card >> nth=0")[:120].replace("\n", " "))
        pg.click("#fg-lgh"); n_lg = pg.locator("#fg-ch input").count(); pg.click('#fg-ch [data-a="none"]'); assert pg.locator("#fg-list .fm").count() == 0
        pg.check('#fg-ch input[data-l="%s"]' % live["lg"]); cards = pg.locator("#fg-list .fm").count(); print("lig sayisi:", n_lg, "| yalniz Uluslar Ligi:", cards, "mac"); assert cards >= 1
        pg.click('#fg-ch [data-a="all"]'); total = pg.locator("#fg-list .fm").count(); print("hepsi:", total); assert total > cards
        assert "tahmin yok" not in pg.inner_text("#fg-list") and pg.locator("#fg-list .fm .tiles").count() == total and "gizlendi" in pg.inner_text("#fg-body")
        pg.click("#fg-lgh"); pg.click('[data-s="conf"]'); confs = pg.eval_on_selector_all("#fg-list .fm .tile.gold b", "b => b.map(x => parseInt(x.textContent.replace(/[^0-9]/g, '')))"); assert confs == sorted(confs, reverse=True) and len(confs) > 5
        pg.click('[data-s="time"]'); c = pg.locator('#fg-list .fm[data-id="%s"]' % live["id"]); t = c.inner_text(); print("kart:", t.replace("\n", " | ")[:260])
        assert "İY skor tahmini" in t and "Maç sonucu skor tahmini" in t and "İkinci yarı sonucu" in t and "YZ ortak analiz" in t
        for _ in range(30):
            if "67" in c.locator(".lb").inner_text(): break
            time.sleep(0.5)
        cls = c.locator(".lb").get_attribute("class"); print("canli kutu:", c.locator(".lb").inner_text().replace("\n", " "), cls); assert want in cls and "67" in c.locator(".lb").inner_text() and "✗ (1-0)" in c.inner_text()
        c.scroll_into_view_if_needed(); pg.evaluate("window.scrollBy(0, -60)"); pg.screenshot(path="/tmp/phone_today.png")
        c.locator("[data-ai]").click(); pg.wait_for_selector('#ai-%s .aicard h3' % live["id"], timeout=60000); at = pg.inner_text('#ai-%s' % live["id"]); print("YZ:", at.replace("\n", " | ")[:330])
        assert "4 yapay zekâ, 2 tur" in at and "Analist D" in at, at[:600]; assert "Maç sonucu skor tahmini" in at and "1-0" in at and "Analist D" in at; assert pg.evaluate("window.__posts.length") == 8
        c.scroll_into_view_if_needed(); pg.screenshot(path="/tmp/phone_ai.png")
        pg.click('#nav [data-v="settings"]'); assert pg.locator("#ai-set [data-aion]").count() == 7; pg.fill('#ai-set [data-aikey="groq"]', 'deneme-anahtari'); pg.click("#ai-save")
        assert json.loads(pg.evaluate("localStorage.getItem('aad.ai_cfg')"))["keys"]["groq"] == "deneme-anahtari"; pg.click('#nav [data-v="football"]')
        pg.click('[data-d="-1"]'); fin = pg.locator("#fg-list .lb.win, #fg-list .lb.lose").count(); sad = pg.locator("#fg-list .lb.lose").count(); print("dun: renkli sonuc", fin, "kirmizi", sad); assert fin > 3
        assert "😞" in pg.inner_text("#fg-list") if sad else True; pg.screenshot(path="/tmp/phone_yesterday.png")
        calls = pg.evaluate("window.__calls.filter(u => u.includes('espn')).length"); print("ESPN cagrisi:", calls)
        print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
