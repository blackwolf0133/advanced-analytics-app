"""Basketbol ekrani uctan uca denemesi: indirme koprusu taklit edilir (NBA fikstur bicimiyle uretilmis yapay lig)."""
import json, random, subprocess, sys, time, pathlib, datetime as dt
from playwright.sync_api import sync_playwright
WWW = pathlib.Path(__file__).resolve().parents[2] / "app/src/main/assets/www"
rnd = random.Random(4); T = [f"T{i:02d}" for i in range(30)]; S = {t: rnd.gauss(0, 4) for t in T}; P = {t: rnd.gauss(0, 4) for t in T}
def team(t, score): return {"teamId": 1, "teamName": "Takım", "teamCity": t, "teamTricode": t, "wins": 0, "losses": 0, "score": score}
def season(y, n, upcoming=0):
    games, day = [], dt.date(y, 10, 22)
    for i in range(n):
        h, a = rnd.sample(T, 2); m = S[h] - S[a] + 2.8 + rnd.gauss(0, 11); t = 226 + P[h] + P[a] + rnd.gauss(0, 13); hp, ap = round((t + m) / 2), round((t - m) / 2); hp += hp == ap
        d = day + dt.timedelta(days=i // 8)
        games.append({"gameId": f"002{y % 100}{i:05d}", "gameStatus": 3, "gameDateEst": f"{d}T00:00:00Z", "gameDateTimeUTC": f"{d}T23:30:00Z", "homeTeam": team(h, hp), "awayTeam": team(a, ap)})
    now = dt.datetime.now(dt.timezone.utc)
    for i in range(upcoming):
        u = (now + dt.timedelta(hours=3 + i)).strftime("%Y-%m-%dT%H:%M:00Z")
        games.append({"gameId": f"002{y % 100}9{i:04d}", "gameStatus": 1, "gameDateEst": u[:10] + "T00:00:00Z", "gameDateTimeUTC": u, "homeTeam": team(T[i], 0), "awayTeam": team(T[i + 10], 0)})
    return json.dumps({"leagueSchedule": {"seasonYear": f"{y}-{(y + 1) % 100:02d}", "leagueId": "00", "gameDates": [{"gameDate": "x", "games": games}]}})
DATA = {"cur": season(2026, 190, 4), "prev": season(2025, 1230)}
MOCK = "window.__nba = %s; window.Native = { httpGet: (id, url, h) => setTimeout(() => { const k = url.includes('cdn.nba.com') ? 'cur' : url.includes('2025-26') && url.includes('scheduleleaguev2') ? 'prev' : null; k ? AAD.onHttp(id, 200, window.__nba[k]) : AAD.onHttp(id, 0, 'bağlantı kurulamadı (UnknownHostException)'); }, 60) };" % json.dumps(DATA)
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8812", "--bind", "127.0.0.1"], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1); errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, has_touch=True).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.add_init_script(MOCK); pg.goto("http://127.0.0.1:8812/index.html"); pg.click('#nav [data-v="basket"]')
        assert "veri yok" in pg.inner_text("#main"); pg.click("#b-dl"); pg.wait_for_selector("#b-tabs", timeout=20000)
        txt = pg.inner_text("#main"); assert "1420 maç" in txt and "2024-25: alınamadı" in txt and "2025-26: 1230 maç" in txt, txt[:300]
        assert pg.locator("#b-body .tiles").count() == 4; print("yaklasan:", pg.inner_text("#b-body .card >> nth=0").replace("\n", " | ")[:230]); pg.screenshot(path="/tmp/phone_nba.png")
        pg.click('#b-min [data-m="0.8"]'); n80 = pg.locator("#b-body .tiles").count(); pg.click('#b-min [data-m="0.6"]'); n60 = pg.locator("#b-body .tiles").count(); assert n80 <= n60 <= 4 and "tahminin" in pg.inner_text("#b-body .card >> nth=0")
        pg.click('[data-t="results"]'); marks = pg.locator("#b-body .mark").count(); oks = pg.locator("#b-body .mark.ok").count(); print("sonuclar:", marks, "satir,", oks, "tutan |", pg.inner_text("#b-body .card >> nth=1").replace("\n", " ")[:80])
        assert marks > 5 and 0 < oks < marks; pg.screenshot(path="/tmp/phone_nba_res.png"); pg.click('#b-min [data-m="0.5"]'); assert pg.locator("#b-body .mark").count() > marks
        pg.click('[data-t="match"]'); pg.select_option("#b-a", "T05"); assert "Beklenen toplam" in pg.inner_text("#b-body")
        pg.click('[data-t="eval"]'); print("karne:", pg.inner_text("#b-body .tiles").replace("\n", " ")); pg.screenshot(path="/tmp/phone_nba_eval.png")
        pg.click('[data-t="table"]'); assert pg.locator("#b-body tbody tr").count() == 30
        pg.click('#nav [data-v="roulette"]'); pg.click('#nav [data-v="basket"]'); assert pg.locator("#b-tabs").count() == 1      # veri kalici
        print("hatalar:", errs); b.close()
finally:
    srv.terminate()
assert not errs
