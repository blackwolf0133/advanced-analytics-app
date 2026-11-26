// Basketbol gunluk banko kombine: iddaa bulteninin gercek oranlari (mac sonucu, handikap, toplam sayi; uzatmalar dahil),
// toplam oran en az 1,35. Her sabah bir kez kurulur, sonra degismez; sonuclar lig dosyalarindan islenir.
import { IDDAA_BASKET, IDDAA_COMP, MK_BASKET, parseIddaa, matchEvents, fair } from '../web/src/oran.js';
import * as R from '../web/src/rating.js';
import { bestCombo } from './gunluk.mjs';
import { summarize } from './ozet.mjs';

const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const istDay = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
const ln = (x) => String(x).replace('.', ',');
const LO = 1.35, HI = 1.5;   // kullanici: en az 1,35

/** Lig modeli: guncel guc puanlari, fark ve toplam icin sapmalar (ileriye donuk testten). */
function model(db) {
  const games = Object.keys(db.seasons).sort().flatMap((y) => db.seasons[y]).sort((a, b) => (a[0] < b[0] ? -1 : 1)); if (games.length < 60) return null;
  const P = R.prepare(games), o = { ...R.DEFAULTS, ...(db.params?.o || {}) }, log = R.walk(P, o), ms = R.minSeenFor(P), s = R.fit(P, P.n, o);
  let se = 0, n = 0; for (let i = Math.floor(P.n * 0.45); i < P.n; i++) { const l = log[i]; if (l && l.seen >= ms && l.pt != null) { se += (l.pt - P.T[i]) ** 2; n++; } }
  return { P, s, sigma: db.params?.sigma || R.sigmaOf(P, log, 0, ms), tsig: n > 30 ? Math.sqrt(se / n) : 18 };
}
function legsOf(e, g, M) {
  const out = [], pr = M ? R.predictWith(M.P, M.s, M.sigma, g.h, g.a, g.neu) : null, known = pr?.known;
  const add = (mk, label, odd, pm, q, hit, mbKey) => { if (odd > 1 && pm > 0) out.push({ mk, label, odd, pm, q: known ? q : null, hit, mbs: e.mb[mbKey] ?? e.mbs ?? 3 }); };
  if (e.od.ms) { const f = fair(e.od.ms); add('1', `MS 1`, e.od.ms[0], f[0], pr?.pHome, (h, a) => h > a, 'ms'); add('2', `MS 2`, e.od.ms[1], f[1], pr ? 1 - pr.pHome : null, (h, a) => h < a, 'ms'); }
  for (const [line, v] of Object.entries(e.od.hcp || {})) { const L = Number(line), f = fair(v), q = pr ? R.phi((pr.margin + L) / M.sigma) : null;
    add(`H1${line}`, `Hnd. 1 (${L > 0 ? '+' : ''}${ln(line)})`, v[0], f[0], q, (h, a) => h - a + L > 0, `hcp${line}`); add(`H2${line}`, `Hnd. 2 (${-L > 0 ? '+' : ''}${ln(-L)})`, v[1], f[1], q == null ? null : 1 - q, (h, a) => h - a + L < 0, `hcp${line}`); }
  for (const [line, v] of Object.entries(e.od.tot || {})) { const L = Number(line), f = fair(v), qu = pr ? R.phi((L - pr.total) / M.tsig) : null;
    add(`A${line}`, `${ln(line)} Alt`, v[0], f[0], qu, (h, a) => h + a < L, `tot${line}`); add(`U${line}`, `${ln(line)} Üst`, v[1], f[1], qu == null ? null : 1 - qu, (h, a) => h + a > L, `tot${line}`); }
  return out;
}
const HIT = (mk) => { if (mk === '1') return (h, a) => h > a; if (mk === '2') return (h, a) => h < a;
  const L = Number(mk.slice(2)); if (mk.startsWith('H1')) return (h, a) => h - a + L > 0; if (mk.startsWith('H2')) return (h, a) => h - a + L < 0;
  const T = Number(mk.slice(1)); return mk[0] === 'A' ? (h, a) => h + a < T : (h, a) => h + a > T; };

export async function gunlukBasket({ get, readJson, writeJson, NOW, index }) {
  const V = 2, now = NOW.getTime(), today = istDay(now);
  const G = readJson('b/gunluk.json', null), store = G && G.v === V ? G : { v: V, days: {} };
  const leagues = index.basket.filter((l) => !/^ncaaw/.test(l.id)), dbs = new Map();
  for (const l of leagues) { const db = readJson(`b/${l.id}.json`, null); if (db) dbs.set(l.id, db); }
  const day = (store.days[today] ||= { d: today }), early = new Date(now + 3 * 36e5).getUTCHours() < 7;
  const pending = Object.values(store.days).some((d) => d.combo?.legs.some((l) => Date.parse(l.t) > now));
  let iddaa = [];
  if ((!day.combo && !early) || pending) {
    try { const [j, c] = await Promise.all([get(IDDAA_BASKET), get(IDDAA_COMP)]); const comps = new Map((c?.data || []).map((x) => [x.i, x.n]));
      iddaa = (j?.data?.events || []).filter((e) => e.d * 1000 > now + 5 * 6e4).map((e) => parseIddaa(e, comps, MK_BASKET)).filter((e) => e.od.ms); } catch (e) { console.warn('gunluk basket: iddaa', e.message); }
  }
  // kapanis orani: baslamamis secimlerin guncel orani
  const byIo = new Map(iddaa.map((e) => [e.io, e]));
  for (const d of Object.values(store.days)) for (const l of d.combo?.legs || []) {
    if (Date.parse(l.t) <= now) continue; const e = byIo.get(l.io); if (!e) continue;
    const o = legsOf(e, { h: l.h, a: l.a, neu: 0 }, null).find((x) => x.mk === l.mk)?.odd; if (o > 1) { l.close = o; l.closeAt = NOW.toISOString().slice(0, 16); }
  }
  if (!day.combo && !early) {
    // aday maclar: bugun (Turkiye saati) baslayip yarin sabah 10:00'a kadar
    const until = Date.parse(today + 'T07:00:00Z') + 864e5, games = [];
    for (const [id, db] of dbs) for (const [utc, h, a, neu] of db.upcoming || []) { const t = Date.parse(utc); if (t > now + 20 * 6e4 && t <= until) games.push({ id: `${id}|${utc}|${h}`, lg: id, ln: leagues.find((l) => l.id === id)?.name, t: utc, h, a, neu }); }
    const pairs = matchEvents(games, iddaa), legs = [], models = new Map();
    for (const g of games) {
      const e = pairs.get(g.id); if (!e) continue;
      if (!models.has(g.lg)) models.set(g.lg, model(dbs.get(g.lg)));
      for (const l of legsOf(e, g, models.get(g.lg))) {
        if (l.q != null && l.q < l.pm - 0.08) continue;                 // model acikca karsi
        const p = l.q != null ? 0.75 * l.pm + 0.25 * l.q : l.pm;
        legs.push({ id: g.id, lg: g.lg, ln: g.ln, t: g.t, h: g.h, a: g.a, io: e.io, mk: l.mk, label: l.label, odd: l.odd, mbs: l.mbs, pm: r3(l.pm), q: r3(l.q), p: r3(p) });
      }
    }
    console.log(`gunluk basket: iddaa ${iddaa.length} mac, bizim maclarla eslesen ${pairs.size}, secenek ${legs.length}`);
    if (process.env.DBG) for (const l of legs) console.log(l.h, '-', l.a, l.label, l.odd, 'p', l.p, 'q', l.q, 'mbs', l.mbs);
    const b = bestCombo(legs, LO, HI, 1) || bestCombo(legs, LO, 1.65, 1);   // tek mac (MBS 1) ya da 2-3'lu; once 1,35-1,50, olmazsa 1,65'e kadar
    if (b) { day.combo = { built: NOW.toISOString(), odds: r3(b.odds), p: r3(b.p), legs: b.legs.map((l) => ({ ...l, res: null })) }; console.log('gunluk basket kombine:', JSON.stringify(day.combo)); }
  }
  // sonuclar
  for (const d of Object.values(store.days)) {
    if (!d.combo) continue;
    for (const l of d.combo.legs) {
      if (l.res) continue; const db = dbs.get(l.lg), t = Date.parse(l.t); let sc = null;
      if (db) for (const list of Object.values(db.seasons || {})) { const x = list.find((x) => x[1] === l.h && x[2] === l.a && Math.abs(Date.parse(x[0]) - t) < 1.6 * 864e5); if (x) { sc = [x[3], x[4]]; break; } }
      if (sc) { l.sc = sc; l.res = HIT(l.mk)(sc[0], sc[1]) ? 'W' : 'L'; } else if (t < now - 3 * 864e5) l.res = 'V';
    }
    const rs = d.combo.legs.map((l) => l.res); d.combo.res = rs.includes('L') ? 'L' : rs.every((r) => r === 'W' || r === 'V') ? (rs.every((r) => r === 'V') ? 'V' : 'W') : null;
  }
  for (const d of Object.keys(store.days)) if (d < istDay(now - 45 * 864e5)) delete store.days[d];
  const done = Object.keys(store.days).sort().map((d) => store.days[d].combo).filter((c) => c && c.res && c.res !== 'V');
  let streak = 0; for (let i = done.length - 1; i >= 0 && done[i].res === 'W'; i--) streak++;
  let best = 0, run = 0; for (const c of done) { run = c.res === 'W' ? run + 1 : 0; best = Math.max(best, run); }
  store.ozet = summarize(store.days, []);
  store.sum = { combo: { days: done.length, won: done.filter((c) => c.res === 'W').length, exp: r3(done.reduce((s, c) => s + c.p, 0)), streak, best } };
  store.updated = NOW.toISOString();
  writeJson('b/gunluk.json', store);
}
