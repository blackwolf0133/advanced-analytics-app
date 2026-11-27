// Basketbol: butun ligler (NBA, WNBA, G League, NCAA, NBL, EuroLeague, EuroCup, Turkiye ligleri).
// Veri uygulamanin kendi gunluk veri dalindan gelir (GitHub Actions her gun ESPN, EuroLeague ve TBF'den toplar).
// Model rating.js'tedir: zaman agirlikli guc puani + veriden olculen ev avantaji. Hesaplar telefonda yapilir.
import { read, write } from './store.js';
import * as R from './rating.js';

export const VERI = ['https://raw.githubusercontent.com/blackwolf0133/advanced-analytics-app/veri/', 'https://cdn.jsdelivr.net/gh/blackwolf0133/advanced-analytics-app@veri/'];
export const seasonLabel = (y, cross = true) => (cross ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : String(y));
export const FALLBACK_LEAGUES = [['bsl', 'Basketbol Süper Ligi', 'Türkiye'], ['euroleague', 'EuroLeague', 'Avrupa'], ['eurocup', 'EuroCup', 'Avrupa'], ['bcl', 'FIBA Şampiyonlar Ligi (BCL)', 'Avrupa'], ['fec', 'FIBA Europe Cup', 'Avrupa'], ['nba', 'NBA', 'ABD']];
export const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - m), Math.min(1, c + m)]; };

async function first(get, path) { let err; for (const b of VERI) { try { return JSON.parse(await get(b + path)); } catch (e) { err = e; } } throw err; }
export const loadIndex = () => read('bb_index', null);
export const loadLeague = (id) => read('bb_' + id, null);
export const leagues = () => (loadIndex()?.basket || FALLBACK_LEAGUES.map(([id, name, country]) => ({ id, name, country })));
/** Lig listesi ve secili ligin dosyasi indirilir (birkac yuz KB). */
export async function download(get, id) {
  const idx = await first(get, 'index.json'); write('bb_index', { ...idx, fetched: Date.now() });
  const f = await first(get, `b/${id}.json`); if (!f.seasons) throw new Error('dosya beklenen biçimde değil');
  write('bb_' + id, { ...f, fetched: Date.now() }); await downloadLines(get);
  return { n: Object.values(f.seasons).reduce((s, l) => s + l.length, 0), seasons: Object.keys(f.seasons).map(Number), updated: f.updated };
}
/** Butun ligler: once lig listesi, sonra her ligin dosyasi (toplam ~1,5 MB). Bir lig alinamazsa digerleri yine iner. */
export async function downloadAll(get, onStep = () => {}) {
  const idx = await first(get, 'index.json'); write('bb_index', { ...idx, fetched: Date.now() });
  const ok = [], bad = [];
  for (const l of idx.basket) {
    onStep(l);
    try { const f = await first(get, `b/${l.id}.json`); if (!f.seasons) throw new Error('biçim'); write('bb_' + l.id, { ...f, fetched: Date.now() }); ok.push(l.id); }
    catch (e) { bad.push(`${l.name}: ${e.message}`); }
  }
  await downloadLines(get);
  return { ok, bad };
}
/** iddaa barajlari (veri hattinin saatlik b/oran.json dosyasi): toplam sayi, handikap, mac sonucu. */
export const loadLines = () => read('bb_oran', null);
export async function downloadLines(get) { try { const j = await first(get, 'b/oran.json'); if (j.g) write('bb_oran', { ...j, fetched: Date.now() }); } catch (e) { /* dosya henuz yok */ } }
export const phi = R.phi;
/** Hizli model (yalnizca bugunku guc puanlari; gecmis test yok): butun liglerin yaklasan maclari icin. */
export function buildLite(db) {
  const games = allGames(db); if (!games.length) return null;
  const P = R.prepare(games), o = { ...R.DEFAULTS, ...(db.params?.o || {}) }, s = R.fit(P, P.n, o);
  return { P, o, s, sigma: db.params?.sigma || 12, lastSeason: games[games.length - 1][5], n: P.n, lite: true };
}
export const allGames = (db) => Object.keys(db.seasons).map(Number).sort((a, b) => a - b).flatMap((y) => db.seasons[y]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

/**
 * Modeli kurar: ileriye donuk test (her mac gunu yalnizca oncesindeki maclarla) + bugune kadarki butun maclarla son model.
 * Ayarlar veri hattinda secilip dosyaya yazilir (params); yoksa varsayilanlar kullanilir.
 */
export function build(db) {
  const games = allGames(db); if (!games.length) return null;
  const P = R.prepare(games), o = { ...R.DEFAULTS, ...(db.params?.o || {}) }, ms = R.minSeenFor(P), log = R.walk(P, o);
  const sigma = db.params?.sigma || R.sigmaOf(P, log, 0, ms), s = R.fit(P, P.n, o), lastSeason = games[games.length - 1][5];
  return { P, o, s, log, sigma, ms, lastSeason, n: P.n, firstSeason: games[0][5] };
}
export function predict(M, home, away, neutral = 0) { return R.predictWith(M.P, M.s, M.sigma, home, away, neutral); }

/** Karne: testin ikinci yarisi (ilk kisim modelin isinmasi) ve takimlarin en az birkac mac oynadigi maclar. */
export function evaluate(M) {
  const { P, log, sigma, ms } = M, cut = Math.floor(P.n * 0.45), rows = [];
  let runT = 0, runN = 0;
  for (let i = 0; i < P.n; i++) {
    const l = log[i];
    if (i >= cut && l && l.seen >= ms && P.M[i] !== 0) rows.push({ p: R.phi(l.pm / sigma), hw: P.M[i] > 0 ? 1 : 0, pm: l.pm, m: P.M[i], pt: l.pt, t: P.T[i], base: runN ? runT / runN : null });
    runT += P.T[i]; runN++;
  }
  if (rows.length < 30) return null;
  let hit = 0, home = 0, brier = 0, ll = 0, mae = 0, tmae = 0, tbase = 0, tn = 0, hp = 0;
  const edges = [0.5, 0.6, 0.7, 0.8, 1.01], buckets = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], n: 0, k: 0 }));
  for (const r of rows) {
    const p = Math.min(0.995, Math.max(0.005, r.p)), pick = p >= 0.5 ? 1 : 0, conf = Math.max(p, 1 - p), ok = pick === r.hw ? 1 : 0;
    hit += ok; home += r.hw; hp += pick; brier += (p - r.hw) ** 2; ll -= Math.log(r.hw ? p : 1 - p); mae += Math.abs(r.pm - r.m);
    if (r.pt !== null && r.base !== null) { tmae += Math.abs(r.pt - r.t); tbase += Math.abs(r.base - r.t); tn++; }
    const b = buckets.find((x) => conf >= x.lo && conf < x.hi); b.n++; b.k += ok;
  }
  const n = rows.length;
  const atLeast = [0.5, 0.6, 0.7, 0.8].map((t) => { let m = 0, k = 0; for (const r of rows) { const c = Math.max(r.p, 1 - r.p); if (c >= t) { m++; k += (r.p >= 0.5 ? 1 : 0) === r.hw ? 1 : 0; } } return { t, n: m, k, rate: m ? k / m : null, ci: wilson(k, m) }; });
  return { n, atLeast, acc: hit / n, accCi: wilson(hit, n), homeRate: home / n, homePick: hp / n, brier: brier / n, logloss: ll / n, marginMae: mae / n,
    totalMae: tn ? tmae / tn : null, totalBaseMae: tn ? tbase / tn : null, hfa: M.s.hfa, sigma,
    buckets: buckets.map((b) => ({ ...b, rate: b.n ? b.k / b.n : null, ci: wilson(b.k, b.n) })) };
}
/** Son oynanan gunler: modelin mac ONCESI tahmini (ileriye donuk kayittan) ve gercek sonuc; en yeni gun basta. */
export function recent(M, daysBack = 4) {
  const { P, log, sigma } = M, idx = [];
  for (let i = 0; i < P.n; i++) if (P.Y[i] === M.lastSeason) idx.push(i);
  const dates = [...new Set(idx.map((i) => P.games[i][0]))].sort().slice(-daysBack).reverse();
  return dates.map((date) => ({ date, games: idx.filter((i) => P.games[i][0] === date).map((i) => {
    const g = P.games[i], p = R.phi(log[i].pm / sigma), pickHome = p >= 0.5;
    return { home: g[1], away: g[2], hp: g[3], ap: g[4], pick: pickHome ? g[1] : g[2], conf: Math.max(p, 1 - p), hit: pickHome === (g[3] > g[4]), margin: log[i].pm, total: log[i].pt, actualTotal: g[3] + g[4], early: log[i].seen < M.ms };
  }) }));
}
export function standings(db) {
  const ys = Object.keys(db.seasons).map(Number); if (!ys.length) return [];
  const y = Math.max(...ys), t = new Map(), g = (k) => { if (!t.has(k)) t.set(k, { team: k, w: 0, l: 0, pf: 0, pa: 0 }); return t.get(k); };
  for (const [, h, a, hp, ap] of db.seasons[y]) { const H = g(h), A = g(a); H.pf += hp; H.pa += ap; A.pf += ap; A.pa += hp; if (hp > ap) { H.w++; A.l++; } else { A.w++; H.l++; } }
  return [...t.values()].sort((x, z) => z.w / (z.w + z.l) - x.w / (x.w + x.l) || (z.pf - z.pa) - (x.pf - x.pa));
}
