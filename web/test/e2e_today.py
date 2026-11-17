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
MOCK = "window.__g = %s; window.__e = %s; window.__calls = []; window.Native = { httpGet: (id, url, h) => setTimeout(() => { window.__calls.push(url); if (url.endsWith('f/gun.json')) return AAD.onHttp(id, 200, window.__g); if (url.includes('/soccer/%s/scoreboard')) return AAD.onHttp(id, 200, window.__e); AAD.onHttp(id, 200, JSON.stringify({ events: [] })); }, 30) };" % (json.dumps(json.dumps(G)), json.dumps(json.dumps(ESPN)), live["lg"])
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
        pg.click("#fg-lgh"); pg.click('[data-s="conf"]'); confs = pg.eval_on_selector_all("#fg-list .fm .tile.gold b", "b => b.map(x => parseInt(x.textContent.replace(/[^0-9]/g, '')))"); assert confs == sorted(confs, reverse=True) and len(confs) > 5
        pg.click('[data-s="time"]'); c = pg.locator('#fg-list .fm[data-id="%s"]' % live["id"]); t = c.inner_text(); print("kart:", t.replace("\n", " | ")[:260])
        assert "Skor tahmini" in t and "İlk yarı" in t and "İkinci yarı" in t
        for _ in range(30):
            if "67" in c.locator(".lb").inner_text(): break
            time.sleep(0.5)
        cls = c.locator(".lb").get_attribute("class"); print("canli kutu:", c.locator(".lb").inner_text().replace("\n", " "), cls); assert want in cls and "67" in c.locator(".lb").inner_text() and "İY 1-0" in c.inner_text()
        c.scroll_into_view_if_needed(); pg.evaluate("window.scrollBy(0, -60)"); pg.screenshot(path="/tmp/phone_today.png")
        pg.click('[data-d="-1"]'); fin = pg.locator("#fg-list .lb.win, #fg-list .lb.lose").count(); sad = pg.locator("#fg-list .lb.lose").count(); print("dun: renkli sonuc", fin, "kirmizi", sad); assert fin > 3
        assert "😞" in pg.inner_text("#fg-list") if sad else True; pg.screenshot(path="/tmp/phone_yesterday.png")
        calls = pg.evaluate("window.__calls.filter(u => u.includes('espn')).length"); print("ESPN cagrisi:", calls)
        print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
