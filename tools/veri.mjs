// Gunluk veri hatti (GitHub Actions'ta calisir, ucretsiz).
// Basketbol liglerinin ve milli futbol maclarinin sonuc/fikstur verisini ucretsiz, anahtarsiz kaynaklardan toplar ve
// telefon uygulamasinin indirecegi kucuk JSON dosyalari olarak "veri" dalina yazar.
// Kaynaklar: ESPN herkese acik site API'si, EuroLeague resmi API'si, Turkiye Basketbol Federasyonu (TBF) API'si,
// martj42/international_results (CC0). Onceki calismanin dosyalari okunur; yalnizca eksik/yeni gunler indirilir.
import fs from 'node:fs';
import path from 'node:path';
import { gunlukBasket } from './gunlukb.mjs';
import { paraAkisi } from './para.mjs';
import { tune, prepare, walk, minSeenFor, phi } from '../web/src/rating.js';
import { isotonic, basketLegs, couponTest } from '../web/src/kombine.js';
const kbRows = [];   // basketbol kombine: ileriye donuk test tahminleri (butun ligler)
import { futbol } from './futbol.mjs';

const OUT = process.argv[2] || 'out';
const NOW = new Date();
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const AHEAD = 21;                                   // kac gun ilerideki fikstur yazilir (milli mac aralarinda kupalar 2-3 hafta durur)
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const today = ymd(NOW);
let requests = 0, failures = 0;

async function get(url, { json = true, tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      requests++;
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*' }, signal: AbortSignal.timeout(40000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return json ? await r.json() : await r.text();
    } catch (e) {
      if (i === tries - 1) { failures++; console.warn('  hata', url, e.message); return undefined; }
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i], i); } }));
  return out;
}
const V = 2;                                        // dosya bicimi surumu: degisirse eski veri yok sayilir ve bastan toplanir
const readJson = (f, d) => { try { const j = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); return j && j.v === V ? j : d; } catch { return d; } };
const writeJson = (f, v) => { const p = path.join(OUT, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v)); };
const trTitle = (s) => String(s || '').trim().toLocaleLowerCase('tr-TR').replace(/(^|[\s.\-/(])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'));

/**
 * Lig dosyasi: { id, name, country, sport, updated, seasons: { "2026": [[tarih, ev, dep, evSayi, depSayi, tarafsiz]] }, upcoming: [[utc, ev, dep, tarafsiz]], done }
 * Tarih UTC gunudur (YYYY-MM-DD). Sezon, basladigi yildir (2026 = 2026-27).
 */
function finish(meta, seasons, upcoming, extra = {}) {
  if (extra.done === undefined) extra.done = {};
  const clean = {};
  for (const [y, list] of Object.entries(seasons)) {
    // ayni mac iki kez gelmesin; sezonda 3'ten az maci olan takimlarin maclari (gosteri maclari, alt lig konuklari) cikarilir
    const seen = new Set(), uniq = list.filter((g) => { const k = g[0] + g[1] + g[2]; if (seen.has(k)) return false; seen.add(k); return true; });
    const cnt = new Map(); for (const g of uniq) for (const t of [g[1], g[2]]) cnt.set(t, (cnt.get(t) || 0) + 1);
    const min = uniq.length > 60 ? 3 : 1;
    clean[y] = uniq.filter((g) => cnt.get(g[1]) >= min && cnt.get(g[2]) >= min).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  const up = upcoming.filter((u) => u[0] >= new Date(NOW.getTime() - 3 * 3600e3).toISOString() && u[0] <= addDays(NOW, meta.ahead || AHEAD).toISOString()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // model ayarlari bu ligin kendi gecmisiyle secilir (ileriye donuk test, log kayip); telefon bunlari hazir kullanir
  let params = null;
  try { const all = Object.keys(clean).sort().flatMap((y) => clean[y]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); const t = tune(all);
    params = { o: { half: t.o.half, lam: t.o.lam, prevW: t.o.prevW }, sigma: Math.round(t.sigma * 100) / 100, ll: t.sc ? Math.round(t.sc.logloss * 1e4) / 1e4 : null, acc: t.sc ? Math.round(t.sc.acc * 1e3) / 1e3 : null, n: t.sc?.n || 0 };
    if (!t.small && !/ncaa/.test(meta.id)) {          // kombine icin: test yarisindaki mac oncesi tahminler
      const P = prepare(all), log = walk(P, t.o), ms = minSeenFor(P);
      for (let i = Math.floor(P.n * 0.45); i < P.n; i++) { const l = log[i]; if (!l || l.seen < ms || P.M[i] === 0) continue; const g = P.games[i];
        kbRows.push({ sport: 'b', id: meta.id + i, lg: meta.id, t: g[0], day: g[0], wk: Math.floor(Date.parse(g[0]) / 864e5 / 7), h: g[1], a: g[2], hp: g[3], ap: g[4], pHome: phi(l.pm / t.sigma) }); }
    } }
  catch (e) { console.warn(meta.id, 'ayar secilemedi', e.message); }
  const file = { v: V, id: meta.id, name: meta.name, country: meta.country, updated: NOW.toISOString(), seasons: clean, upcoming: up, params, ...extra };
  writeJson(`b/${meta.id}.json`, file);
  const n = Object.values(clean).reduce((s, l) => s + l.length, 0);
  console.log(`${meta.id}: ${n} mac (${Object.entries(clean).map(([y, l]) => y + ':' + l.length).join(' ')}), ${up.length} yaklasan, ayar ${JSON.stringify(params)}`);
  return { id: meta.id, name: meta.name, country: meta.country, sport: 'basket', n, seasons: Object.keys(clean).map(Number), upcoming: up.length,
    last: Object.values(clean).flat().reduce((m, g) => (g[0] > m ? g[0] : m), '') };
}

/* ---------------- ESPN (NBA, WNBA, G League, NCAA, NBL) ---------------- */
const ESPN_LEAGUES = [
  { id: 'nba', name: 'NBA', country: 'ABD', slug: 'nba', past: 2 },
  { id: 'wnba', name: 'WNBA (kadınlar)', country: 'ABD', slug: 'wnba', past: 2 },
  { id: 'gleague', name: 'NBA G League', country: 'ABD', slug: 'nba-development', past: 1 },
  { id: 'ncaam', name: 'NCAA erkekler (üniversite)', country: 'ABD', slug: 'mens-college-basketball', q: '&groups=50&limit=500', past: 1 },
  { id: 'ncaaw', name: 'NCAA kadınlar (üniversite)', country: 'ABD', slug: 'womens-college-basketball', q: '&groups=50&limit=500', past: 1 },
  { id: 'nbl', name: 'NBL', country: 'Avustralya', slug: 'nbl', past: 2 },
];
const SB = (l, d) => `https://site.api.espn.com/apis/site/v2/sports/basketball/${l.slug}/scoreboard?dates=${d.replace(/-/g, '')}${l.q || ''}`;
const seasonLabel = (s) => Number(String(s.startDate).slice(0, 4));          // sezon, basladigi yil (2026-27 -> 2026)
function espnEvents(j, label) {
  const games = [], upcoming = [];
  for (const e of j?.events || []) {
    const st = e.season?.type ?? e.seasonType?.type; if (st === 1 || st === 4) continue;      // hazirlik ve All-Star haric
    const c = e.competitions?.[0]; if (!c || c.competitors?.length !== 2) continue;
    const h = c.competitors.find((x) => x.homeAway === 'home'), a = c.competitors.find((x) => x.homeAway === 'away'); if (!h || !a) continue;
    const hn = h.team?.displayName, an = a.team?.displayName; if (!hn || !an || /TBD|To Be Determined/i.test(hn + an)) continue;
    const neutral = c.neutralSite ? 1 : 0, t = e.status?.type || c.status?.type || {};
    const hs = Number(h.score?.value ?? h.score), as = Number(a.score?.value ?? a.score);
    if (t.completed && Number.isFinite(hs) && Number.isFinite(as) && hs + as > 0) games.push([String(e.date).slice(0, 10), hn, an, hs, as, label, neutral]);
    else if (t.state === 'pre') upcoming.push([new Date(e.date).toISOString(), hn, an, neutral]);
  }
  return { games, upcoming };
}
async function espnLeague(l) {
  const prev = readJson(`b/${l.id}.json`, null), seasons = { ...(prev?.seasons || {}) }, done = { ...(prev?.done || {}) };
  const head = await get(SB(l, today)); const cal0 = head?.leagues?.[0];
  if (!cal0?.season) { console.warn(l.id, 'sezon bilgisi yok'); return prev ? finish(l, seasons, prev.upcoming || [], { done }) : null; }
  const cur = seasonLabel(cal0.season), want = [];
  // gecmis sezonlar: o sezonun icinden bir gunun skor tablosu, o sezonun takvimini verir
  const calendars = { [cur]: cal0 };
  for (let k = 1; k <= l.past; k++) {
    const y = cur - k; if ((seasons[y] || []).length > 50 && done[y] === 'full') continue;
    const probe = new Date(Date.parse(cal0.season.startDate) - k * 365 * 864e5 + 45 * 864e5);
    const j = await get(SB(l, ymd(probe))); const L = j?.leagues?.[0];
    if (L?.season && seasonLabel(L.season) === y) calendars[y] = L; else console.warn(l.id, y, 'takvim alinamadi');
  }
  const upcoming = [];
  for (const [y, L] of Object.entries(calendars)) {
    const days = (L.calendar || []).map((c) => String(typeof c === 'string' ? c : c.startDate || c.value || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const isDone = new Set(done[y + 'd'] || []);
    for (const d of days) if (d <= ymd(addDays(NOW, AHEAD)) && !isDone.has(d)) want.push([Number(y), d]);
  }
  const got = await pool(want, 6, async ([y, d]) => ({ y, d, j: await get(SB(l, d)) }));
  for (const { y, d, j } of got) {
    if (!j) continue;
    // ayni mac (tarih + takimlar) yenisiyle degistirilir; baska gunlerin maclarina dokunulmaz
    const r = espnEvents(j, y), key = String(y), k = (g) => g[0] + '|' + g[1] + '|' + g[2], fresh = new Set(r.games.map(k));
    seasons[key] = (seasons[key] || []).filter((g) => !fresh.has(k(g))).concat(r.games);
    upcoming.push(...r.upcoming);
    const allDone = (j.events || []).every((e) => e.status?.type?.completed || e.status?.type?.state === 'post' || /postponed|canceled/i.test(e.status?.type?.name || ''));
    if (allDone && d < ymd(addDays(NOW, -1))) done[key + 'd'] = [...new Set([...(done[key + 'd'] || []), d])];
  }
  for (const y of Object.keys(calendars)) if (Number(y) < cur) done[y] = 'full';
  // yalnizca son 3 sezon tutulur
  for (const y of Object.keys(seasons)) if (Number(y) < cur - Math.max(2, l.past)) { delete seasons[y]; delete done[y]; delete done[y + 'd']; }
  return finish(l, seasons, upcoming, { done });
}

/* ---------------- EuroLeague / EuroCup ---------------- */
const EL_LEAGUES = [{ id: 'euroleague', name: 'EuroLeague', country: 'Avrupa', code: 'E', ahead: 45 }, { id: 'eurocup', name: 'EuroCup', country: 'Avrupa', code: 'U', ahead: 45 }];
async function euroLeague(l) {
  const prev = readJson(`b/${l.id}.json`, null), seasons = { ...(prev?.seasons || {}) }, cur = NOW.getUTCMonth() >= 6 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1, upcoming = [];
  for (const y of [cur - 2, cur - 1, cur]) {
    if (y < cur && (seasons[y] || []).length > 150) continue;
    const j = await get(`https://api-live.euroleague.net/v2/competitions/${l.code}/seasons/${l.code}${y}/games`); if (!j?.data) continue;
    const list = [];
    for (const g of j.data) {
      const h = g.local?.club?.name, a = g.road?.club?.name, when = g.utcDate || g.date; if (!h || !a || !when) continue;
      const neutral = g.isNeutralVenue ? 1 : 0, hs = Number(g.local.score), as = Number(g.road.score);
      if (g.played && hs + as > 0) list.push([String(when).slice(0, 10), h, a, hs, as, y, neutral]);
      else if (!g.played && !/postpon|cancel/i.test(g.gameStatus || '')) upcoming.push([new Date(when).toISOString(), h, a, neutral]);
    }
    seasons[y] = list;
  }
  for (const y of Object.keys(seasons)) if (Number(y) < cur - 2) delete seasons[y];
  return finish(l, seasons, upcoming);
}

/* ---------------- FIBA kupalari (Sampiyonlar Ligi, FIBA Europe Cup) ---------------- */
// Resmi FIBA veri API'si uyelik istiyor; ayni mac listesi herkese acik takvim sayfalarinin icindeki veride duruyor (Next.js).
const FIBA_LEAGUES = [
  { id: 'bcl', name: 'FIBA Şampiyonlar Ligi (BCL)', country: 'Avrupa', ahead: 45, neutralRounds: ['SF', '3PG', 'F'], pages: {
    2024: 'https://www.fiba.basketball/en/history/112-fiba-mens-european-club-competitions-tier-1/208850/games',
    2025: 'https://www.fiba.basketball/en/history/112-fiba-mens-european-club-competitions-tier-1/208962/games',
    2026: 'https://www.championsleague.basketball/en/games' } },
  { id: 'fec', name: 'FIBA Europe Cup', country: 'Avrupa', ahead: 45, neutralRounds: [], pages: {
    2024: 'https://www.fiba.basketball/en/events/fiba-europe-cup-24-25/games',
    2025: 'https://www.fiba.basketball/en/events/fiba-europe-cup-25-26/games',
    2026: 'https://www.fiba.basketball/en/events/fiba-europe-cup-26-27/games' } },
];
export function fibaGames(html) {
  let text = ''; for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/gs)) { try { text += JSON.parse('"' + m[1] + '"'); } catch {} }
  if (!text) text = html.replace(/\\"/g, '"');
  const seen = new Map(), re = /\{"gameId":/g; let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index, inS = false, esc = false;
    for (; i < text.length; i++) { const ch = text[i]; if (inS) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inS = false; continue; } if (ch === '"') inS = true; else if (ch === '{') depth++; else if (ch === '}') { depth--; if (!depth) break; } }
    try { const o = JSON.parse(text.slice(m.index, i + 1)); if (o.teamA && o.teamB && !seen.has(o.gameId)) seen.set(o.gameId, o); } catch {}
  }
  return [...seen.values()];
}
async function fibaLeague(l) {
  const prev = readJson(`b/${l.id}.json`, null), seasons = { ...(prev?.seasons || {}) }, upcoming = [], cur = Math.max(...Object.keys(l.pages).map(Number));
  for (const [y, url] of Object.entries(l.pages)) {
    if (Number(y) < cur && (seasons[y] || []).length > 100) continue;            // biten sezon bir kez alinir
    const html = await get(url, { json: false }); if (!html) continue;
    const list = [];
    for (const g of fibaGames(html)) {
      const h = g.teamA.shortName || g.teamA.officialName, a = g.teamB.shortName || g.teamB.officialName, utc = g.gameDateTimeUTC || g.gameDateTime;
      if (!h || !a || !utc || /CANC|DEL|VOID/i.test(g.statusCode || '')) continue;      // VALID: oynandi, INIT: oynanacak
      const neutral = l.neutralRounds.includes(String(g.round?.roundCode || '').toUpperCase()) ? 1 : 0, hs = Number(g.teamAScore), as = Number(g.teamBScore);
      if (!g.isLive && hs + as > 0) list.push([String(utc).slice(0, 10), h, a, hs, as, Number(y), neutral]);
      else if (!g.isPostponed && !g.isLive) upcoming.push([new Date(String(utc).replace(/Z?$/, 'Z')).toISOString(), h, a, neutral]);
    }
    if (list.length || !seasons[y]) seasons[y] = list;
  }
  return finish(l, seasons, upcoming);
}

/* ---------------- Turkiye (TBF) ---------------- */
const TBF = 'https://miniappapi.tbf.org.tr/webapi-service/api/';
const TBF_LEAGUES = [
  { id: 'bsl', name: 'Basketbol Süper Ligi', country: 'Türkiye', prefix: 'bsl' },
  { id: 'tbl', name: 'Türkiye Basketbol Ligi', country: 'Türkiye', prefix: 'tbl' },
  { id: 'kbsl', name: 'Kadınlar Basketbol Süper Ligi', country: 'Türkiye', prefix: 'kbsl' },
  { id: 'tkbl', name: 'Türkiye Kadınlar Basketbol Ligi', country: 'Türkiye', prefix: 'tkbl' },
];
const istToUtc = (s) => new Date(Date.parse(String(s).replace(' ', 'T') + 'Z') - 3 * 3600e3).toISOString();
async function tbfLeague(l, featured) {
  const prev = readJson(`b/${l.id}.json`, null), seasons = { ...(prev?.seasons || {}) }, upcoming = [];
  const f = featured.find((x) => x.prefixUrl === l.prefix); if (!f) { console.warn(l.id, 'TBF listesinde yok'); return prev ? finish(l, seasons, prev.upcoming || []) : null; }
  const y = Number(String(f.season).slice(0, 4));
  const w = await get(`${TBF}League/get-league-weeks?leagueId=${f.activityId}&seasonId=${f.seasonId}`); const weeks = (w?.data || []).map((x) => String(x.sezon_Hafta));
  const pages = await pool(weeks, 4, (wk) => get(`${TBF}Match/get-all-matches-for-filter?ActivityId=${f.activityId}&WeekFilter=${encodeURIComponent(wk)}&Page=1&PageSize=-1`));
  if (pages.some((p) => p === undefined)) { console.warn(l.id, 'bazi haftalar alinamadi; eski veri korunuyor'); if (prev) return finish(l, seasons, prev.upcoming || []); }
  const list = [];
  for (const p of pages) for (const m of p?.data || []) {
    const h = trTitle(m.homeTeam?.name), a = trTitle(m.awayTeam?.name), hs = Number(m.homeTeam?.score), as = Number(m.awayTeam?.score); if (!h || !a) continue;
    if (Number(m.matchStatusId) === 1 && Number.isFinite(hs) && Number.isFinite(as) && hs + as > 0) list.push([String(m.matchDateOnly || m.matchDate).slice(0, 10), h, a, hs, as, y, 0]);
    else if (Number(m.matchStatusId) !== 3 && m.matchDate) upcoming.push([istToUtc(m.matchDate), h, a, 0]);
  }
  if (list.length || !seasons[y]) seasons[y] = list;
  for (const k of Object.keys(seasons)) if (Number(k) < y - 2) delete seasons[k];
  return finish(l, seasons, upcoming);
}

/* ---------------- Milli takimlar (futbol) ---------------- */
const INTL_SLUGS = ['fifa.friendly', 'uefa.nations', 'uefa.euroq', 'uefa.euro', 'fifa.world', 'fifa.worldq.uefa', 'fifa.worldq.conmebol', 'fifa.worldq.concacaf', 'fifa.worldq.afc',
  'fifa.worldq.caf', 'concacaf.nations.league', 'concacaf.gold', 'conmebol.america', 'caf.nations', 'caf.nations_qual', 'afc.asian.cup', 'afc.cupq'];
// ESPN adi -> veri setindeki ad
const ALIAS = { 'Türkiye': 'Turkey', 'USA': 'United States', 'Czechia': 'Czech Republic', 'Korea Republic': 'South Korea', 'IR Iran': 'Iran', "Côte d'Ivoire": 'Ivory Coast', 'Cabo Verde': 'Cape Verde',
  'Republic of Ireland': 'Republic of Ireland', 'North Macedonia': 'North Macedonia', 'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'Congo DR': 'DR Congo', 'China PR': 'China', 'Korea DPR': 'North Korea',
  'Kyrgyz Republic': 'Kyrgyzstan', 'Curacao': 'Curaçao', 'Chinese Taipei': 'Taiwan', 'St. Kitts and Nevis': 'Saint Kitts and Nevis', 'St. Lucia': 'Saint Lucia', 'St. Vincent and the Grenadines': 'Saint Vincent and the Grenadines',
  'Eswatini': 'Eswatini', 'The Gambia': 'Gambia', 'Gambia': 'Gambia', 'Sao Tome and Principe': 'São Tomé and Príncipe', 'United States Virgin Islands': 'United States Virgin Islands' };
async function intl() {
  const t = await get('https://raw.githubusercontent.com/martj42/international_results/master/results.csv', { json: false });
  if (!t) { console.warn('milli: alinamadi'); return null; }
  const lines = t.split(/\r?\n/), from = String(NOW.getUTCFullYear() - 8), games = [], upcoming = [];
  for (const line of lines.slice(1)) {
    const c = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { c.push(cur); cur = ''; } else cur += ch; } c.push(cur);
    if (c.length < 9 || c[0] < from) continue;
    const neutral = /TRUE/i.test(c[8]) ? 1 : 0, hs = Number(c[3]), as = Number(c[4]);
    if (c[3] === 'NA' || c[3] === '') { if (c[0] >= today && c[0] <= ymd(addDays(NOW, 40))) upcoming.push([c[0], c[1], c[2], c[5], neutral]); }
    else if (Number.isFinite(hs) && Number.isFinite(as)) games.push([c[0], c[1], c[2], hs, as, c[5], neutral]);
  }
  // CC0 veri setinde gelecek maclar yok: yaklasan milli maclar ESPN'in turnuva fiksturlerinden alinir (isimler veri setine cevrilir)
  const names = new Set(games.flatMap((g) => [g[1], g[2]])), fix = (n) => ALIAS[n] || n;
  const days = Array.from({ length: 21 }, (_, i) => ymd(addDays(NOW, i)).replace(/-/g, ''));
  const jobs = INTL_SLUGS.flatMap((s) => days.map((d) => [s, d]));
  const res = await pool(jobs, 6, async ([s, d]) => ({ s, j: await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${s}/scoreboard?dates=${d}`) }));
  const seen = new Set();
  for (const { s, j } of res) for (const e of j?.events || []) {
    const c = e.competitions?.[0], h = c?.competitors?.find((x) => x.homeAway === 'home'), a = c?.competitors?.find((x) => x.homeAway === 'away');
    if (!h || !a || e.status?.type?.state !== 'pre') continue;
    const hn = fix(h.team?.displayName), an = fix(a.team?.displayName), key = e.id; if (seen.has(key) || !names.has(hn) || !names.has(an)) continue; seen.add(key);
    upcoming.push([new Date(e.date).toISOString(), hn, an, j.leagues?.[0]?.name || s, c.neutralSite ? 1 : 0]);
  }
  upcoming.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  writeJson('milli.json', { v: V, updated: NOW.toISOString(), source: 'martj42/international_results (CC0) + ESPN fikstür', games, upcoming });
  console.log(`milli: ${games.length} mac, ${upcoming.length} yaklasan`);
  return { n: games.length, upcoming: upcoming.length, last: games.reduce((m, g) => (g[0] > m ? g[0] : m), '') };
}

/* ---------------- calistir ---------------- */
const index = { updated: NOW.toISOString(), basket: [], milli: null };
for (const l of ESPN_LEAGUES) { try { const r = await espnLeague(l); if (r) index.basket.push(r); } catch (e) { console.warn(l.id, e); } }
for (const l of EL_LEAGUES) { try { const r = await euroLeague(l); if (r) index.basket.push(r); } catch (e) { console.warn(l.id, e); } }
for (const l of FIBA_LEAGUES) { try { const r = await fibaLeague(l); if (r) index.basket.push(r); } catch (e) { console.warn(l.id, e); } }
const feat = await get(`${TBF}League/get-featured-9-leagues`);
for (const l of TBF_LEAGUES) { try { const r = await tbfLeague(l, feat?.data || []); if (r) index.basket.push(r); } catch (e) { console.warn(l.id, e); } }
try { index.milli = await intl(); } catch (e) { console.warn('milli', e); }
try { const mg = readJson('milli.json', null); index.futbol = await futbol({ get, pool, readJson, writeJson, NOW, milliGames: mg?.games || [], alias: (n) => ALIAS[n] || n }); } catch (e) { console.warn('futbol', e); }
try {
  const fitCal = (list) => isotonic(list.map((r) => [r.pHome, r.hp > r.ap ? 1 : 0]), 60);
  index.kb = { cal: fitCal(kbRows), bt: couponTest(kbRows, fitCal, basketLegs, (r) => [r.hp, r.ap], ['banko', 'surpriz'], [2, 3, 4]), n: kbRows.length };
  console.log('kombine basketbol:', kbRows.length, 'mac', JSON.stringify(index.kb.bt));
} catch (e) { console.warn('kombine basketbol', e); }
try { await paraAkisi({ get, readJson, writeJson, NOW }); } catch (e) { console.warn('para akisi', e); }   // halka acik bahis / para yuzdeleri
try { await gunlukBasket({ get, readJson, writeJson, NOW, index }); } catch (e) { console.warn('gunluk basket', e); }   // basketbol gunluk banko kombine
writeJson('index.json', index);
console.log(`bitti: ${requests} istek, ${failures} basarisiz`);
