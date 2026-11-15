// Futbol: veri ayristirma ve modeller. Her sey telefonda calisir.
// Veri: football-data.co.uk (ucretsiz CSV; mac sonuclari ve bahis oranlari). Sakatlik, kadro ve xG bilgisi yoktur.
import { read, write } from './store.js';

export const LEAGUES = { T1: 'Türkiye · Süper Lig', E0: 'İngiltere · Premier League', E1: 'İngiltere · Championship', E2: 'İngiltere · League One', E3: 'İngiltere · League Two',
  SP1: 'İspanya · La Liga', SP2: 'İspanya · La Liga 2', D1: 'Almanya · Bundesliga', D2: 'Almanya · 2. Bundesliga', I1: 'İtalya · Serie A', I2: 'İtalya · Serie B',
  F1: 'Fransa · Ligue 1', F2: 'Fransa · Ligue 2', N1: 'Hollanda · Eredivisie', B1: 'Belçika · Pro League', P1: 'Portekiz · Primeira Liga', SC0: 'İskoçya · Premiership', G1: 'Yunanistan · Super League' };
const BASE = 'https://www.football-data.co.uk/';
export const seasonCode = (y) => String(y % 100).padStart(2, '0') + String((y + 1) % 100).padStart(2, '0');
export const seasonLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
export const currentSeason = (now = new Date()) => (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);

/* ---------------- CSV ---------------- */
function rows(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()); if (!lines.length) return [];
  const cut = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = cut(lines[0]); return lines.slice(1).map((l) => { const c = cut(l), o = {}; head.forEach((h, i) => { o[h] = c[i] ?? ''; }); return o; });
}
function isoDate(s) { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s || ''); if (!m) return null; const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
const odd = (v) => { const n = Number(v); return Number.isFinite(n) && n > 1 ? n : null; };
function odds(r) { for (const p of ['AvgC', 'Avg', 'B365C', 'B365', 'PSC', 'PS', 'BbAv']) { const h = odd(r[p + 'H']), d = odd(r[p + 'D']), a = odd(r[p + 'A']); if (h && d && a) return [h, d, a]; } return [null, null, null]; }
/** Sonuc dosyasi -> [tarih, ev, deplasman, evGol, depGol, oranEv, oranBer, oranDep] (tarih sirali) */
export function parseResults(text) {
  const out = [];
  for (const r of rows(text)) {
    const date = isoDate(r.Date), hg = r.FTHG === '' ? NaN : Number(r.FTHG), ag = r.FTAG === '' ? NaN : Number(r.FTAG);
    if (!date || !r.HomeTeam || !r.AwayTeam || !Number.isInteger(hg) || !Number.isInteger(ag)) continue;
    out.push([date, r.HomeTeam, r.AwayTeam, hg, ag, ...odds(r)]);
  }
  if (!out.length && !/HomeTeam/.test(text.slice(0, 2000))) throw new Error('dosya beklenen biçimde değil');
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
/** Fikstur dosyasi (butun ligler) -> [{div, date, time, home, away, odds}] */
export function parseFixtures(text) {
  return rows(text).map((r) => ({ div: r.Div, date: isoDate(r.Date), time: r.Time || '', home: r.HomeTeam, away: r.AwayTeam, odds: odds(r) })).filter((f) => f.div && f.date && f.home && f.away);
}
/** Dosyadaki saat Ingiltere saatidir; UTC anina cevrilir. */
export function ukToUtc(date, time) {
  const [h, m] = (time || '12:00').split(':').map(Number), guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h || 0, m || 0);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return guess - (shown - guess);
}
export const loadLeague = (div) => read('fb_' + div, { seasons: {}, fetched: 0 });
export const loadFixtures = () => read('fb_fix', { list: [], fetched: 0 });
export const matches = (db) => Object.keys(db.seasons).map(Number).sort((a, b) => a - b).flatMap((y) => db.seasons[y].map((m) => [...m, y]));
export async function download(get, div, seasons = 4, now = new Date()) {
  const db = loadLeague(div), cur = currentSeason(now), report = [];
  for (let y = cur - seasons + 1; y <= cur; y++) {
    if (y < cur && (db.seasons[y] || []).length >= 100) { report.push({ season: y, ok: true, n: db.seasons[y].length, cached: true }); continue; }
    try { const g = parseResults(await get(`${BASE}mmz4281/${seasonCode(y)}/${div}.csv`)); db.seasons[y] = g; report.push({ season: y, ok: true, n: g.length }); }
    catch (e) { report.push({ season: y, ok: false, error: e.message }); }
  }
  if (!report.some((r) => r.ok && !r.cached)) throw new Error(report[report.length - 1].error || 'veri alınamadı');
  db.fetched = Date.now(); write('fb_' + div, db);
  try { write('fb_fix', { list: parseFixtures(await get(BASE + 'fixtures.csv')), fetched: Date.now() }); report.fixtures = true; } catch (e) { report.fixtures = false; report.fixError = e.message; }
  return report;
}

/* ---------------- Poisson / Dixon-Coles ---------------- */
const XI = 0.0019, SHRINK = 2;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
const tau = (h, a, l, m, r) => (h === 0 && a === 0 ? 1 - l * m * r : h === 0 && a === 1 ? 1 + l * r : h === 1 && a === 0 ? 1 + m * r : h === 1 && a === 1 ? 1 - r : 1);
/**
 * Zaman agirlikli en cok olabilirlik: ev golu ~ Poisson(g * hucum_ev * savunma_dep), dep golu ~ Poisson(hucum_dep * savunma_ev).
 * Yeni maclar daha agir sayilir. Az maci olan takimlar lig ortalamasina dogru cekilir. Sonra dusuk skor duzeltmesi (rho) bulunur.
 */
export function fit(ms, ref) {
  ref = ref || ms[ms.length - 1][0];
  const w = ms.map((m) => Math.exp(-XI * Math.max(0, days(m[0], ref)))), teams = [...new Set(ms.flatMap((m) => [m[1], m[2]]))], ix = new Map(teams.map((t, i) => [t, i])), n = teams.length;
  const H = ms.map((m) => ix.get(m[1])), A = ms.map((m) => ix.get(m[2]));
  let sw = 0, sg = 0; ms.forEach((m, i) => { sw += w[i]; sg += w[i] * (m[3] + m[4]); });
  const mean = sg / (2 * sw); let gamma = 1.3; const att = new Float64Array(n).fill(1), def = new Float64Array(n).fill(mean);
  for (let it = 0; it < 80; it++) {
    const an = new Float64Array(n).fill(SHRINK * mean), ad = new Float64Array(n).fill(SHRINK * mean);
    ms.forEach((m, i) => { an[H[i]] += w[i] * m[3]; ad[H[i]] += w[i] * gamma * def[A[i]]; an[A[i]] += w[i] * m[4]; ad[A[i]] += w[i] * def[H[i]]; });
    let s = 0; for (let t = 0; t < n; t++) { att[t] = an[t] / ad[t]; s += att[t]; } s /= n; for (let t = 0; t < n; t++) att[t] /= s;
    const dn = new Float64Array(n).fill(SHRINK * mean), dd = new Float64Array(n).fill(SHRINK);
    ms.forEach((m, i) => { dn[H[i]] += w[i] * m[4]; dd[H[i]] += w[i] * att[A[i]]; dn[A[i]] += w[i] * m[3]; dd[A[i]] += w[i] * gamma * att[H[i]]; });
    for (let t = 0; t < n; t++) def[t] = dn[t] / dd[t];
    let gn = 0, gd = 0; ms.forEach((m, i) => { gn += w[i] * m[3]; gd += w[i] * att[H[i]] * def[A[i]]; }); gamma = gn / gd;
  }
  let rho = 0, best = -Infinity;
  for (let r = -0.2; r <= 0.2001; r += 0.01) {
    let ll = 0, ok = true;
    for (let i = 0; i < ms.length && ok; i++) { const m = ms[i]; if (m[3] > 1 || m[4] > 1) continue; const t = tau(m[3], m[4], gamma * att[H[i]] * def[A[i]], att[A[i]] * def[H[i]], r); if (t <= 0) ok = false; else ll += w[i] * Math.log(t); }
    if (ok && ll > best) { best = ll; rho = r; }
  }
  return { teams, ix, att, def, gamma, rho: Math.round(rho * 100) / 100, mean };
}
const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
/** Skor olasiliklari tablosundan 1X2, alt/ust, KG ve en olasi skorlar. Takim modelde yoksa lig ortalamasi kullanilir. */
export function predict(f, home, away, max = 10) {
  const h = f.ix.get(home), a = f.ix.get(away), ah = h === undefined ? 1 : f.att[h], dh = h === undefined ? f.mean : f.def[h], aa = a === undefined ? 1 : f.att[a], da = a === undefined ? f.mean : f.def[a];
  const l = f.gamma * ah * da, m = aa * dh; let pH = 0, pD = 0, pA = 0, over = 0, btts = 0, sum = 0; const scores = [];
  for (let i = 0; i <= max; i++) for (let j = 0; j <= max; j++) {
    const p = Math.max(0, pois(l, i) * pois(m, j) * tau(i, j, l, m, f.rho)); sum += p;
    if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
    if (i + j > 2) over += p; if (i && j) btts += p; scores.push([p, i, j]);
  }
  scores.sort((x, y) => y[0] - x[0]);
  return { p: [pH / sum, pD / sum, pA / sum], lambda: l, mu: m, over25: over / sum, btts: btts / sum, scores: scores.slice(0, 4).map(([p, i, j]) => ({ score: `${i}-${j}`, p: p / sum })), known: h !== undefined && a !== undefined };
}

/* ---------------- Elo + sirali lojistik ---------------- */
const KF = 20, HF = 60, sig = (x) => 1 / (1 + Math.exp(-x));
/** Her mactan onceki Elo farkini (ev avantaji dahil) dondurur ve son puanlari verir. */
export function eloRun(ms) {
  const elo = new Map(), pre = [], seen = new Set(); let first = null;
  for (const m of ms) {
    if (first === null) first = m[8];
    for (const t of [m[1], m[2]]) if (!seen.has(t)) { seen.add(t); elo.set(t, m[8] === first ? 1500 : 1420); }   // sonradan gelen (alt ligden cikan) takim dusuk baslar
    const eh = elo.get(m[1]), ea = elo.get(m[2]), d = eh - ea + HF, e = 1 / (1 + Math.pow(10, -d / 400)), gd = Math.abs(m[3] - m[4]);
    pre.push(d);
    const s = m[3] > m[4] ? 1 : m[3] === m[4] ? 0.5 : 0, g = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8, sh = KF * g * (s - e);
    elo.set(m[1], eh + sh); elo.set(m[2], ea - sh);
  }
  return { elo, pre };
}
export const eloProbs = (d, b, c) => { const x = b * d / 100, pH = sig(x - c), pA = sig(-x - c); return [pH, 1 - pH - pA, pA]; };
/** Elo farkini 1X2 olasiligina ceviren iki katsayi (egim, beraberlik genisligi), izgara aramasiyla. */
export function fitOrdered(pre, ms) {
  let best = [0.5, 0.6], bl = Infinity;
  const ll = (b, c) => { let s = 0; for (let i = 0; i < ms.length; i++) { const p = eloProbs(pre[i], b, c), o = ms[i][3] > ms[i][4] ? 0 : ms[i][3] === ms[i][4] ? 1 : 2; s -= Math.log(Math.max(1e-9, p[o])); } return s; };
  for (let b = 0.2; b <= 1.2001; b += 0.05) for (let c = 0.3; c <= 1.2001; c += 0.05) { const v = ll(b, c); if (v < bl) { bl = v; best = [b, c]; } }
  return best;
}

/* ---------------- birlesik model ve karne ---------------- */
const avg = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
export const implied = (o) => { if (!o || !o[0] || !o[1] || !o[2]) return null; const r = o.map((x) => 1 / x), s = r[0] + r[1] + r[2]; return r.map((x) => x / s); };
export function model(ms) {
  const f = fit(ms), e = eloRun(ms), bc = fitOrdered(e.pre, ms);
  return { f, elo: e.elo, bc, n: ms.length, teams: f.teams };
}
export function forecast(M, home, away) {
  const dc = predict(M.f, home, away), g = (t) => (M.elo.has(t) ? M.elo.get(t) : 1420), d = g(home) - g(away) + HF, el = eloProbs(d, M.bc[0], M.bc[1]);
  return { ...dc, dc: dc.p, elo: el, p: avg(dc.p, el), eloHome: g(home), eloAway: g(away) };
}
export function wilson(k, n, z = 1.96) { if (!n) return [0, 1]; const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - m), Math.min(1, c + m)]; }
function score(rows, key) {
  let acc = 0, brier = 0, ll = 0, rps = 0;
  for (const r of rows) { const p = r[key], o = r.o, y = [0, 0, 0]; y[o] = 1; const top = p.indexOf(Math.max(...p));
    acc += top === o ? 1 : 0; brier += (p[0] - y[0]) ** 2 + (p[1] - y[1]) ** 2 + (p[2] - y[2]) ** 2; ll -= Math.log(Math.max(1e-9, p[o])); rps += ((p[0] - y[0]) ** 2 + (p[0] + p[1] - y[0] - y[1]) ** 2) / 2; }
  const n = rows.length; return { acc: acc / n, brier: brier / n, logloss: ll / n, rps: rps / n };
}
/**
 * Ileriye donuk test: son sezonun (az maci varsa son iki sezonun) her 40 maclik blogu, yalnizca o bloktan ONCEKI maclarla
 * kurulan modelle tahmin edilir. Piyasa (oranlardan cikan olasilik) ve "lig ortalamasi" ile karsilastirilir.
 */
export function evaluate(ms, block = 40) {
  const ys = [...new Set(ms.map((m) => m[8]))].sort((a, b) => a - b); if (ys.length < 2) return null;
  let from = ys[ys.length - 1]; if (ms.filter((m) => m[8] === from).length < 150 && ys.length >= 3) from = ys[ys.length - 2];
  const start = ms.findIndex((m) => m[8] >= from); if (start < 300 || ms.length - start < 60) return null;
  const e = eloRun(ms), rows = [];
  for (let s = start; s < ms.length; s += block) {
    const train = ms.slice(0, s), f = fit(train), bc = fitOrdered(e.pre.slice(0, s), train), base = [0, 0, 0];
    for (const m of train) base[m[3] > m[4] ? 0 : m[3] === m[4] ? 1 : 2] += 1 / train.length;
    for (let i = s; i < Math.min(ms.length, s + block); i++) { const m = ms[i], dc = predict(f, m[1], m[2]).p, el = eloProbs(e.pre[i], bc[0], bc[1]);
      rows.push({ o: m[3] > m[4] ? 0 : m[3] === m[4] ? 1 : 2, model: avg(dc, el), dc, elo: el, base, market: implied([m[5], m[6], m[7]]), odds: [m[5], m[6], m[7]], total: m[3] + m[4], over: predict(f, m[1], m[2]).over25 }); }
  }
  const withOdds = rows.filter((r) => r.market), out = { n: rows.length, from, model: score(rows, 'model'), dc: score(rows, 'dc'), elo: score(rows, 'elo'), base: score(rows, 'base'),
    nOdds: withOdds.length, market: withOdds.length >= 50 ? score(withOdds, 'market') : null, modelOnOdds: withOdds.length >= 50 ? score(withOdds, 'model') : null };
  out.buckets = [[0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 1.01]].map(([lo, hi]) => {
    let n = 0, k = 0, bets = 0, ret = 0;
    for (const r of rows) { const top = r.model.indexOf(Math.max(...r.model)), c = r.model[top]; if (c < lo || c >= hi) continue; n++; const ok = top === r.o; k += ok ? 1 : 0; if (r.odds[top]) { bets++; ret += ok ? r.odds[top] - 1 : -1; } }
    return { lo, hi, n, k, rate: n ? k / n : null, ci: wilson(k, n), bets, roi: bets ? ret / bets : null };
  });
  let ok = 0; for (const r of rows) ok += (r.over >= 0.5) === (r.total > 2) ? 1 : 0; out.overAcc = ok / rows.length; out.overRate = rows.filter((r) => r.total > 2).length / rows.length;
  return out;
}
export function table(db) {
  const ys = Object.keys(db.seasons).map(Number); if (!ys.length) return [];
  const t = new Map(), g = (k) => { if (!t.has(k)) t.set(k, { team: k, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }); return t.get(k); };
  for (const [, h, a, hg, ag] of db.seasons[Math.max(...ys)]) { const H = g(h), A = g(a); H.p++; A.p++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
    if (hg > ag) { H.w++; A.l++; H.pts += 3; } else if (hg < ag) { A.w++; H.l++; A.pts += 3; } else { H.d++; A.d++; H.pts++; A.pts++; } }
  return [...t.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}
