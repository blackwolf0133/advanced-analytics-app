// Futbol ligleri katalogu ve ek veri kaynaklari.
// fd  : football-data.co.uk ana ligler (her sezon ayri dosya, oranlarla)
// fdn : football-data.co.uk ek ligler (tek dosyada butun sezonlar, oranlarla)
// om  : open-matchday (GitHub, her gun guncellenen ucretsiz CSV; yalnizca bu sezon, oran yok)
// milli: milli takimlar (martj42/international_results, CC0; uygulamanin kendi gunluk veri dalindan)
import { read, write } from './store.js';
import { ukToUtc, currentSeason } from './football.js';

const FD = 'https://www.football-data.co.uk/';
export const VERI = ['https://raw.githubusercontent.com/blackwolf0133/advanced-analytics-app/veri/', 'https://cdn.jsdelivr.net/gh/blackwolf0133/advanced-analytics-app@veri/'];
const OM = ['https://cdn.jsdelivr.net/gh/oladeeayo/open-matchday@master/data/', 'https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/'];

const FD_MAIN = [['T1', 'Türkiye', 'Süper Lig'], ['E0', 'İngiltere', 'Premier League'], ['E1', 'İngiltere', 'Championship'], ['E2', 'İngiltere', 'League One'], ['E3', 'İngiltere', 'League Two'],
  ['EC', 'İngiltere', 'National League'], ['SP1', 'İspanya', 'La Liga'], ['SP2', 'İspanya', 'La Liga 2'], ['D1', 'Almanya', 'Bundesliga'], ['D2', 'Almanya', '2. Bundesliga'],
  ['I1', 'İtalya', 'Serie A'], ['I2', 'İtalya', 'Serie B'], ['F1', 'Fransa', 'Ligue 1'], ['F2', 'Fransa', 'Ligue 2'], ['N1', 'Hollanda', 'Eredivisie'], ['B1', 'Belçika', 'Pro League'],
  ['P1', 'Portekiz', 'Primeira Liga'], ['SC0', 'İskoçya', 'Premiership'], ['SC1', 'İskoçya', 'Championship'], ['SC2', 'İskoçya', 'League One'], ['SC3', 'İskoçya', 'League Two'], ['G1', 'Yunanistan', 'Super League']];
const FD_NEW = [['ARG', 'Arjantin', 'Liga Profesional', 'Argentina'], ['AUT', 'Avusturya', 'Bundesliga', 'Austria'], ['BRA', 'Brezilya', 'Série A', 'Brazil'], ['CHN', 'Çin', 'Super League', 'China'],
  ['DNK', 'Danimarka', 'Superliga', 'Denmark'], ['FIN', 'Finlandiya', 'Veikkausliiga', 'Finland'], ['IRL', 'İrlanda', 'Premier Division', 'Ireland'], ['JPN', 'Japonya', 'J1 League', 'Japan'],
  ['MEX', 'Meksika', 'Liga MX', 'Mexico'], ['NOR', 'Norveç', 'Eliteserien', 'Norway'], ['POL', 'Polonya', 'Ekstraklasa', 'Poland'], ['ROU', 'Romanya', 'Liga I', 'Romania'],
  ['RUS', 'Rusya', 'Premier Liga', 'Russia'], ['SWE', 'İsveç', 'Allsvenskan', 'Sweden'], ['SWZ', 'İsviçre', 'Super League', 'Switzerland'], ['USA', 'ABD', 'MLS', 'USA']];
// open-matchday: yalnizca football-data.co.uk'de olmayan ligler ve kupalar
const OM_LIST = [['UEFA_1_champions-league', 'Avrupa kupaları', 'Şampiyonlar Ligi'], ['UEFA_1_europa-league', 'Avrupa kupaları', 'Avrupa Ligi'], ['UEFA_1_conference-league', 'Avrupa kupaları', 'Konferans Ligi'],
  ['ENG_6_national-league-north', 'İngiltere', 'National League North'], ['ENG_6_national-league-south', 'İngiltere', 'National League South'], ['ENG_7_northern-premier-league', 'İngiltere', 'Northern Premier League'],
  ['ENG_CUP_fa-cup', 'İngiltere', 'FA Cup (kupa)'], ['ENG_CUP_efl-cup', 'İngiltere', 'Carabao Cup (kupa)'], ['ESP_CUP_copa-del-rey', 'İspanya', 'Kral Kupası'], ['GER_3_3-liga', 'Almanya', '3. Liga'],
  ['GER_CUP_dfb-pokal', 'Almanya', 'DFB-Pokal (kupa)'], ['ITA_CUP_coppa-italia', 'İtalya', 'İtalya Kupası'], ['NED_2_eerste-divisie', 'Hollanda', 'Eerste Divisie'], ['NED_CUP_knvb-beker', 'Hollanda', 'KNVB Beker (kupa)'],
  ['POR_CUP_taca-de-portugal', 'Portekiz', 'Portekiz Kupası'], ['SCO_CUP_scottish-cup', 'İskoçya', 'İskoçya Kupası'], ['SCO_CUP_league-cup', 'İskoçya', 'Lig Kupası'], ['AUT_CUP_ofb-cup', 'Avusturya', 'ÖFB Kupası'],
  ['SUI_CUP_swiss-cup', 'İsviçre', 'İsviçre Kupası'], ['IRE_2_first-division', 'İrlanda', 'First Division'], ['IRE_3_national-league', 'İrlanda', 'National League'], ['POL_2_division-1', 'Polonya', 'I Liga'],
  ['POL_3_division-2', 'Polonya', 'II Liga'], ['WAL_1_cymru-premier', 'Galler', 'Cymru Premier'], ['WAL_2_cymru-north', 'Galler', 'Cymru North'], ['WAL_3_cymru-south', 'Galler', 'Cymru South'],
  ['CRO_1_hnl', 'Hırvatistan', 'HNL'], ['CZE_1_chance-liga', 'Çekya', 'Chance Liga'], ['UKR_1_premier-league', 'Ukrayna', 'Premier Lig'], ['CYP_1_first-division', 'Kıbrıs', 'Birinci Lig'],
  ['SVK_1_nike-liga', 'Slovakya', 'Nike Liga'], ['SVN_1_prva-liga', 'Slovenya', 'Prva Liga'], ['KAZ_1_premier-league', 'Kazakistan', 'Premier Lig'], ['BRA_2_serie-b', 'Brezilya', 'Série B'],
  ['ARG_2_primera-nacional', 'Arjantin', 'Primera Nacional'], ['MEX_2_liga-expansion', 'Meksika', 'Liga de Expansión'], ['AUS_1_a-league', 'Avustralya', 'A-League'], ['BEL_U21_pro-league', 'Belçika', 'Pro League U21']];

export const CATALOG = [
  ...FD_MAIN.map(([code, group, name]) => ({ key: code, src: 'fd', code, group, name })),
  ...FD_NEW.map(([code, group, name, country]) => ({ key: 'n:' + code, src: 'fdn', code, group, name, country })),
  ...OM_LIST.map(([code, group, name]) => ({ key: 'om:' + code, src: 'om', code, group, name })),
  { key: 'milli', src: 'milli', code: 'milli', group: 'Milli takımlar', name: 'Milli maçlar (Uluslar Ligi, elemeler, turnuvalar, hazırlık)' },
];
export const byKey = (k) => CATALOG.find((c) => c.key === k) || CATALOG[0];
export const label = (c) => (c.group === 'Avrupa kupaları' || c.group === 'Milli takımlar' ? c.name : `${c.group} · ${c.name}`);
export const GROUP_ORDER = ['Türkiye', 'Avrupa kupaları', 'Milli takımlar', 'İngiltere', 'İspanya', 'Almanya', 'İtalya', 'Fransa', 'Hollanda', 'Portekiz', 'Belçika', 'İskoçya'];
export function groups() {
  const g = new Map(); for (const c of CATALOG) { if (!g.has(c.group)) g.set(c.group, []); g.get(c.group).push(c); }
  const rank = (x) => { const i = GROUP_ORDER.indexOf(x); return i < 0 ? 100 : i; };
  return [...g.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], 'tr'));
}

/* ---------------- CSV ---------------- */
function rows(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()); if (!lines.length) return [];
  const cut = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
  const head = cut(lines[0]); return lines.slice(1).map((l) => { const c = cut(l), o = {}; head.forEach((h, i) => { o[h] = c[i] ?? ''; }); return o; });
}
const dmy = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s || ''); if (!m) return null; const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
const odd = (v) => { const n = Number(v); return Number.isFinite(n) && n > 1 ? n : null; };
const oddsOf = (r, pre) => { for (const p of pre) { const h = odd(r[p + 'H']), d = odd(r[p + 'D']), a = odd(r[p + 'A']); if (h && d && a) return [h, d, a]; } return [null, null, null]; };
const intOr = (v) => (v === '' || v == null ? NaN : Number(v));
const byDate = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** football-data ek lig dosyasi -> { sezon: [[tarih, ev, dep, evGol, depGol, o1, oX, o2]] } (son 'keep' sezon) */
export function parseFdNew(text, keep = 4) {
  const out = {};
  for (const r of rows(text)) {
    const date = dmy(r.Date), hg = intOr(r.HG), ag = intOr(r.AG); if (!date || !r.Home || !r.Away || !Number.isInteger(hg) || !Number.isInteger(ag)) continue;
    const y = Number(String(r.Season).slice(0, 4)); if (!y) continue;
    (out[y] ||= []).push([date, r.Home, r.Away, hg, ag, ...oddsOf(r, ['AvgC', 'PSC', 'B365C', 'MaxC'])]);
  }
  const ys = Object.keys(out).map(Number).sort((a, b) => b - a).slice(0, keep), res = {};
  for (const y of ys) res[y] = out[y].sort(byDate);
  return res;
}
/** open-matchday sonuc dosyasi -> [[tarih, ev, dep, evGol, depGol, null, null, null]] */
export function parseOm(text) {
  return rows(text).map((r) => [r.date, r.home, r.away, intOr(r.ft_home), intOr(r.ft_away), null, null, null]).filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m[0]) && m[1] && m[2] && Number.isInteger(m[3]) && Number.isInteger(m[4])).sort(byDate);
}
export function parseOmFixtures(text) {
  return rows(text).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.home && r.away).map((r) => ({ t: ukToUtc(r.date, r.time || '15:00'), home: r.home, away: r.away, odds: null, neutral: 0 }));
}

/** Bir kaynagi sirayla dener (ilk calisan adres). */
async function first(get, urls) { let err; for (const u of urls) { try { return await get(u); } catch (e) { err = e; } } throw err; }
const seasonCodeOm = (y) => String(y % 100).padStart(2, '0') + String((y + 1) % 100).padStart(2, '0');

/** fdn / om / milli indirme. Donus: rapor [{season, ok, n, error}] */
export async function downloadExtra(get, c, now = new Date()) {
  const key = 'fb_' + c.key, db = read(key, { seasons: {}, fetched: 0 }), report = [];
  if (c.src === 'fdn') {
    const text = await get(FD + 'new/' + c.code + '.csv');
    db.calendar = !/\d{4}\/\d{4}/.test(text.slice(-3000));                   // takvim yili ligi (Brezilya, ABD, Japonya...)
    db.seasons = parseFdNew(text); if (!Object.keys(db.seasons).length) throw new Error('dosya boş'); for (const [y, l] of Object.entries(db.seasons)) report.push({ season: Number(y), ok: true, n: l.length });
    try {
      const fx = rows(await get(FD + 'new_league_fixtures.csv')).filter((r) => r.Country === c.country);
      db.upcoming = fx.filter((r) => dmy(r.Date) && r.Home && r.Away).map((r) => ({ t: ukToUtc(dmy(r.Date), r.Time), home: r.Home, away: r.Away, odds: oddsOf(r, ['Avg', 'PS', 'B365', 'Max']), neutral: 0 })).filter((f) => f.t);
    } catch (e) { report.fixError = e.message; }
  } else if (c.src === 'om') {
    const y = currentSeason(now), code = seasonCodeOm(y), path = `${c.code}/results_${code}.csv`;
    const ms = parseOm(await first(get, OM.map((b) => b + path))); db.seasons = { [y]: ms }; report.push({ season: y, ok: true, n: ms.length });
    try { db.upcoming = parseOmFixtures(await first(get, OM.map((b) => `${b}${c.code}/fixtures_${code}.csv`))); } catch (e) { report.fixError = e.message; }
  } else if (c.src === 'milli') {
    const j = JSON.parse(await first(get, VERI.map((b) => b + 'milli.json')));
    const seasons = {};
    for (const [date, h, a, hg, ag, tour, neutral] of j.games) {
      const w = /friendly/i.test(tour) ? 0.6 : 1;            // hazirlik maclarinda kadrolar degisir: daha az agirlik
      (seasons[date.slice(0, 4)] ||= []).push([date, h, a, hg, ag, null, null, null, neutral, w, tour]);
    }
    db.seasons = seasons; db.upcoming = (j.upcoming || []).map(([t, h, a, tour, neutral]) => ({ t: Date.parse(t), home: h, away: a, odds: null, neutral, tour }));
    for (const [y, l] of Object.entries(seasons)) report.push({ season: Number(y), ok: true, n: l.length });
    db.source = j.updated;
  }
  db.fetched = Date.now(); write(key, db);
  return report;
}
