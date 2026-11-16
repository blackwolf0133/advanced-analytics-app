// Basketbol (NBA) veri ayristirma ve modeller. Her sey telefonda calisir.
// Modeller yalnizca mac skorlarini kullanir: Elo (kazanma olasiligi ve sayi farki) ve hucum/savunma ortalamalari (toplam sayi).
// Sakatlik, kadro ve dinlenme bilgisi yoktur; olasiliklar bunlari icermez.
import { read, write } from './store.js';

/* ---------------- veri ---------------- */
const int = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };
export const seasonLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

/** NBA fikstur dosyasi (cdn.nba.com scheduleLeagueV2.json ya da stats.nba.com scheduleleaguev2). */
export function parseSchedule(text) {
  const ls = JSON.parse(text).leagueSchedule;
  if (!ls || !Array.isArray(ls.gameDates)) throw new Error('fikstür biçimi tanınmadı');
  const season = int(String(ls.seasonYear).slice(0, 4)), games = [], upcoming = [], teams = {};
  for (const d of ls.gameDates) for (const g of d.games || []) {
    if (!String(g.gameId).startsWith('002')) continue;                      // yalnizca normal sezon
    const h = g.homeTeam || {}, a = g.awayTeam || {};
    if (!h.teamTricode || !a.teamTricode) continue;
    teams[h.teamTricode] = `${h.teamCity} ${h.teamName}`.trim(); teams[a.teamTricode] = `${a.teamCity} ${a.teamName}`.trim();
    const date = String(g.gameDateEst || g.gameDateUTC || '').slice(0, 10), utc = g.gameDateTimeUTC || '';
    if (int(g.gameStatus) === 3) {
      const hp = int(h.score), ap = int(a.score);
      if (date && hp !== null && ap !== null && hp !== ap && hp > 0) games.push([date, h.teamTricode, a.teamTricode, hp, ap]);
    } else if (utc) upcoming.push({ id: String(g.gameId), utc, home: h.teamTricode, away: a.teamTricode, status: int(g.gameStatus) });
  }
  games.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return { season, games, upcoming, teams };
}
/** stats.nba.com leaguegamelog (takim basina bir satir; iki satir bir maci olusturur). */
export function parseGameLog(text) {
  const rs = (JSON.parse(text).resultSets || [])[0];
  if (!rs || !rs.headers) throw new Error('maç kaydı biçimi tanınmadı');
  const ix = Object.fromEntries(rs.headers.map((h, i) => [h, i])), by = new Map(), teams = {};
  for (const r of rs.rowSet) {
    const id = r[ix.GAME_ID], home = String(r[ix.MATCHUP]).includes(' vs. '), t = r[ix.TEAM_ABBREVIATION];
    teams[t] = r[ix.TEAM_NAME];
    const g = by.get(id) || { date: String(r[ix.GAME_DATE]).slice(0, 10) }; g[home ? 'h' : 'a'] = t; g[home ? 'hp' : 'ap'] = int(r[ix.PTS]); by.set(id, g);
  }
  const games = [];
  for (const g of by.values()) if (g.h && g.a && g.hp !== null && g.ap !== null && g.hp !== g.ap) games.push([g.date, g.h, g.a, g.hp, g.ap]);
  games.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return { games, teams };
}
const blank = () => ({ seasons: {}, upcoming: [], teams: {}, fetched: 0 });
export const loadDb = () => read('nba', blank());
export const saveDb = (db) => write('nba', db);
export const allGames = (db) => Object.keys(db.seasons).map(Number).sort((a, b) => a - b).flatMap((y) => db.seasons[y].map((g) => [...g, y]));

/* ---------------- modeller ---------------- */
const K = 20, HFA = 100, CARRY = 0.75, MEAN = 1505, PER_POINT = 28, ALPHA = 0.08;
const expected = (d) => 1 / (1 + Math.pow(10, -d / 400));
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
/**
 * Maclari tarih sirasiyla isler. Her mactan ONCEKI tahmin kaydedilir (ileriye donuk test), sonra puanlar guncellenir;
 * boylece hicbir tahmin kendi macinin sonucunu gormez.
 * games: [tarih, ev, deplasman, evSayi, depSayi, sezon]
 */
export function build(games) {
  const elo = new Map(), off = new Map(), def = new Map(), played = new Map(), log = [];
  let lg = 113, season = null, firstSeason = null;
  const get = (m, k, d) => (m.has(k) ? m.get(k) : d);
  for (const [date, h, a, hp, ap, y] of games) {
    if (y !== season) {                                   // yeni sezon: puanlar ortalamaya dogru cekilir
      if (season !== null) { for (const [t, v] of elo) elo.set(t, CARRY * v + (1 - CARRY) * MEAN); for (const m of [off, def]) for (const [t, v] of m) m.set(t, 0.5 * v + 0.5 * lg); }
      season = y; if (firstSeason === null) firstSeason = y;
    }
    const eh = get(elo, h, 1500), ea = get(elo, a, 1500), d = eh - ea + HFA, p = expected(d);
    const total = get(off, h, lg) + get(def, a, lg) + get(off, a, lg) + get(def, h, lg) - 2 * lg;
    log.push({ date, h, a, hp, ap, y, p, margin: d / PER_POINT, total, base: 2 * lg, hw: hp > ap ? 1 : 0, m: hp - ap, t: hp + ap, seen: Math.min(get(played, h, 0), get(played, a, 0)) });
    const s = hp > ap ? 1 : 0, mov = Math.abs(hp - ap), dw = s ? d : -d, mult = Math.pow(mov + 3, 0.8) / (7.5 + 0.006 * dw), shift = K * mult * (s - p);
    elo.set(h, eh + shift); elo.set(a, ea - shift);
    off.set(h, get(off, h, lg) + ALPHA * (hp - get(off, h, lg))); def.set(h, get(def, h, lg) + ALPHA * (ap - get(def, h, lg)));
    off.set(a, get(off, a, lg) + ALPHA * (ap - get(off, a, lg))); def.set(a, get(def, a, lg) + ALPHA * (hp - get(def, a, lg)));
    lg += 0.01 * ((hp + ap) / 2 - lg);
    played.set(h, get(played, h, 0) + 1); played.set(a, get(played, a, 0) + 1);
  }
  return { elo, off, def, lg, played, log, firstSeason, lastSeason: season, n: games.length };
}
export function predict(m, home, away) {
  const g = (mp, k, d) => (mp.has(k) ? mp.get(k) : d), eh = g(m.elo, home, 1500), ea = g(m.elo, away, 1500), d = eh - ea + HFA;
  return { pHome: expected(d), margin: d / PER_POINT, total: g(m.off, home, m.lg) + g(m.def, away, m.lg) + g(m.off, away, m.lg) + g(m.def, home, m.lg) - 2 * m.lg,
    eloHome: eh, eloAway: ea, known: m.elo.has(home) && m.elo.has(away) };
}
/** Karne: ilk sezon isinma sayilir (tek sezon varsa takim basina ilk 10 mac). */
export function evaluate(m) {
  const multi = m.firstSeason !== m.lastSeason, rows = m.log.filter((r) => (multi ? r.y !== m.firstSeason : r.seen >= 10));
  if (rows.length < 50) return null;
  let hit = 0, home = 0, brier = 0, ll = 0, mae = 0, tmae = 0, tbase = 0;
  const edges = [0.5, 0.6, 0.7, 0.8, 1.01], buckets = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], n: 0, k: 0 }));
  for (const r of rows) {
    const pick = r.p >= 0.5 ? 1 : 0, conf = Math.max(r.p, 1 - r.p), ok = pick === r.hw ? 1 : 0;
    hit += ok; home += r.hw; brier += (r.p - r.hw) ** 2; ll -= Math.log(Math.max(1e-9, r.hw ? r.p : 1 - r.p));
    mae += Math.abs(r.margin - r.m); tmae += Math.abs(r.total - r.t); tbase += Math.abs(r.base - r.t);
    const b = buckets.find((x) => conf >= x.lo && conf < x.hi); b.n++; b.k += ok;
  }
  const n = rows.length;
  // "En az su kadar guvenli" tahminlerin gecmis isabeti (esik secimi icin)
  const atLeast = [0.5, 0.6, 0.7, 0.8].map((t) => { let m = 0, k = 0; for (const r of rows) { const c = Math.max(r.p, 1 - r.p); if (c >= t) { m++; k += (r.p >= 0.5 ? 1 : 0) === r.hw ? 1 : 0; } } return { t, n: m, k, rate: m ? k / m : null, ci: wilson(k, m) }; });
  return { n, multi, atLeast, acc: hit / n, accCi: wilson(hit, n), homeRate: home / n, brier: brier / n, logloss: ll / n, marginMae: mae / n, totalMae: tmae / n, totalBaseMae: tbase / n,
    buckets: buckets.map((b) => ({ ...b, rate: b.n ? b.k / b.n : null, ci: wilson(b.k, b.n) })) };
}
export function standings(db) {
  const ys = Object.keys(db.seasons).map(Number); if (!ys.length) return [];
  const y = Math.max(...ys), t = new Map(), g = (k) => { if (!t.has(k)) t.set(k, { team: k, w: 0, l: 0, pf: 0, pa: 0 }); return t.get(k); };
  for (const [, h, a, hp, ap] of db.seasons[y]) { const H = g(h), A = g(a); H.pf += hp; H.pa += ap; A.pf += ap; A.pa += hp; if (hp > ap) { H.w++; A.l++; } else { A.w++; H.l++; } }
  return [...t.values()].sort((x, z) => z.w / (z.w + z.l) - x.w / (x.w + x.l) || (z.pf - z.pa) - (x.pf - x.pa));
}

/* ---------------- indirme ---------------- */
const CDN = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json';
const STATS = 'https://stats.nba.com/stats/';
const STATS_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36', Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.5', Referer: 'https://www.nba.com/', Origin: 'https://www.nba.com', 'x-nba-stats-origin': 'stats', 'x-nba-stats-token': 'true' };
/**
 * get(url, headers) -> Promise<string>. Bu sezon NBA'in fikstur dosyasindan, onceki iki sezon stats.nba.com'dan alinir.
 * Onceki sezonlar alinamazsa uygulama yalnizca bu sezonla calisir (model daha zayif olur) ve bunu acikca soyler.
 */
export async function download(get, past = 2) {
  const db = loadDb(), report = [];
  const cur = parseSchedule(await get(CDN, { Referer: 'https://www.nba.com/' }));
  if (!cur.season) throw new Error('sezon bilgisi okunamadı');
  db.seasons[cur.season] = cur.games; db.upcoming = cur.upcoming; Object.assign(db.teams, cur.teams);
  report.push({ season: cur.season, ok: true, n: cur.games.length });
  for (let y = cur.season - 1; y >= cur.season - past; y--) {
    if ((db.seasons[y] || []).length >= 1100) { report.push({ season: y, ok: true, n: db.seasons[y].length, cached: true }); continue; }
    let got = null, err = '';
    try { const p = parseSchedule(await get(`${STATS}scheduleleaguev2?LeagueID=00&Season=${seasonLabel(y)}`, STATS_HEADERS)); if (p.games.length >= 1100) got = p; else err = `fikstürde ${p.games.length} sonuç`; } catch (e) { err = e.message; }
    if (!got) try { const p = parseGameLog(await get(`${STATS}leaguegamelog?Counter=0&DateFrom=&DateTo=&Direction=ASC&LeagueID=00&PlayerOrTeam=T&Season=${seasonLabel(y)}&SeasonType=Regular%20Season&Sorter=DATE`, STATS_HEADERS)); if (p.games.length >= 1100) got = p; else err += `; kayıtta ${p.games.length} maç`; } catch (e) { err += '; ' + e.message; }
    if (got) { db.seasons[y] = got.games; for (const [k, v] of Object.entries(got.teams)) if (!db.teams[k]) db.teams[k] = v; report.push({ season: y, ok: true, n: got.games.length }); }
    else report.push({ season: y, ok: false, error: err });
  }
  db.fetched = Date.now(); saveDb(db);
  return report;
}

/**
 * Son oynanan maclar icin modelin mac ONCESI tahmini ve gercek sonuc (en yeni gun basta).
 * Tahminler build() icindeki ileriye donuk kayittan gelir: her biri yalnizca o mactan onceki maclarla hesaplanmistir,
 * yani veriler guncelken uygulamanin mactan once gosterdigi tahminle aynidir.
 */
export function recent(m, daysBack = 4) {
  const dates = [...new Set(m.log.filter((r) => r.y === m.lastSeason).map((r) => r.date))].sort().slice(-daysBack).reverse();
  return dates.map((date) => ({ date, games: m.log.filter((r) => r.date === date && r.y === m.lastSeason).map((r) => {
    const pickHome = r.p >= 0.5, conf = Math.max(r.p, 1 - r.p);
    return { home: r.h, away: r.a, hp: r.hp, ap: r.ap, pick: pickHome ? r.h : r.a, conf, hit: pickHome === (r.hp > r.ap), margin: r.margin, total: r.total, actualTotal: r.hp + r.ap };
  }) }));
}
