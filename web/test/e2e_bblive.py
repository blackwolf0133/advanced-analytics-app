"""Basketbol canli skorlar: ESPN (NBA) ve EuroLeague taklit cevaplari; canli / baslayacak / biten gruplari, model tahmini."""
import json, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent; WWW = HERE.resolve().parents[1] / "app/src/main/assets/www"
EL = json.loads((HERE / "fixtures/veri_euroleague.json").read_text()); IDX = (HERE / "fixtures/veri_index.json").read_text()
now = dt.datetime.now(dt.timezone.utc); EL["updated"] = now.isoformat()
iso = lambda h: (now + dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:00Z")
teams = sorted({g[1] for y in EL["seasons"].values() for g in y})[:4]
nba = {"events": [
  {"id": "1", "date": iso(-1), "status": {"type": {"state": "in", "shortDetail": "3rd 4:12"}}, "competitions": [{"competitors": [{"homeAway": "home", "score": "71", "team": {"displayName": "Boston Celtics"}}, {"homeAway": "away", "score": "64", "team": {"displayName": "Atlanta Hawks"}}]}]},
  {"id": "2", "date": iso(-4), "status": {"type": {"state": "post", "shortDetail": "Final"}}, "competitions": [{"competitors": [{"homeAway": "home", "score": "101", "team": {"displayName": "Utah Jazz"}}, {"homeAway": "away", "score": "117", "team": {"displayName": "Denver Nuggets"}}]}]},
  {"id": "3", "date": iso(3), "status": {"type": {"state": "pre", "shortDetail": ""}}, "competitions": [{"competitors": [{"homeAway": "home", "score": "0", "team": {"displayName": "New York Knicks"}}, {"homeAway": "away", "score": "0", "team": {"displayName": "Miami Heat"}}]}]}]}
el = {"data": [{"identifier": "E2026_99", "utcDate": iso(-0.5), "played": False, "local": {"club": {"name": teams[0]}, "score": 40, "partials": {"partials1": 20, "partials2": 20}}, "road": {"club": {"name": teams[1]}, "score": 38, "partials": {"partials1": 19, "partials2": 19}}},
               {"identifier": "E2026_98", "utcDate": iso(-30), "played": True, "local": {"club": {"name": teams[2]}, "score": 80}, "road": {"club": {"name": teams[3]}, "score": 70}}]}
DATA = {"/veri/index.json": IDX, "/veri/b/euroleague.json": json.dumps(EL), "basketball/nba/scoreboard": json.dumps(nba), "competitions/E/seasons": json.dumps(el)}
MOCK = "window.__d = %s; window.Native = { httpGet: (id, url, h) => setTimeout(() => { const k = Object.keys(window.__d).find((k) => url.includes(k)); k ? AAD.onHttp(id, 200, window.__d[k]) : AAD.onHttp(id, 404, ''); }, 15) };" % json.dumps(DATA)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8821", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"]); pg = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8821/index.html"); pg.click('#nav [data-v="basket"]')
        pg.click("#b-all"); pg.wait_for_selector("#b-tabs", timeout=60000); pg.wait_for_timeout(500)
        pg.click('[data-t="live"]'); pg.wait_for_function("document.querySelector('#b-body').textContent.includes('Son yenileme')", timeout=20000)
        t = pg.inner_text("#b-body"); print(t[:900])
        assert "Şu an oynanıyor" in t and "Atlanta Hawks 64 – 71 Boston Celtics" in t and "Bugün başlayacak" in t and "Biten" in t and "Denver Nuggets 117 – 101 Utah Jazz" in t
        assert f"{teams[1]} 38 – 40 {teams[0]}" in t and "tahmin:" in t
        pg.screenshot(path="/tmp/bblive.png", full_page=True); b.close()
finally:
    srv.terminate()
print("hatalar:", errs); assert not errs
