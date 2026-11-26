// Basketbol gunluk kuponlar: iddaa bulteninin gercek oranlari (mac sonucu, handikap, toplam sayi, ilk yari toplam ve handikap,
// ceyrek toplamlari; mac sonucu/handikap/toplam uzatmalar dahil). Her sabah bir kez kurulur, sonra degismez.
//  banko   : toplam oran en az 1,35 (en fazla 2,00), tutma olasiligi en yuksek kupon -> 15 gunluk seri
//  orta    : toplam oran 2,00-3,50
//  surpriz : toplam oran 3,50-9,00; yuksek oran zayif tarafla degil, olasiligi yuksek ve model onayli cok secimle kurulur
// Her secimin olasiligi: oranlardan kar payi temizlenerek (piyasa) + bizim guc modelimiz (agirlik 0,25).
// Ilk yari ve ceyrek icin model: tahmini toplam x ligin ilk yari/ceyrek payi (ceyrek skorlarindan olculur), sapma da olculur.
import { IDDAA_BASKET, IDDAA_COMP, IDDAA_EVENT, MK_BASKET, parseIddaa, matchEvents, fair } from '../web/src/oran.js';
import * as R from '../web/src/rating.js';
import { summarize } from './ozet.mjs';
import { periodsOf } from './periyot.mjs';

const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const istDay = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
const ln = (x) => String(x).replace('.', ',');
export const TIERS = {
  combo: { name: 'Banko', lo: 1.35, hi: 2.0, minP: 0.62, legs: [1, 3], agree: 0.08 },
  orta: { name: 'Orta', lo: 2.0, hi: 3.5, minP: 0.6, legs: [2, 5], agree: 0.03 },
  surpriz: { name: 'Sürpriz', lo: 3.5, hi: 9.0, minP: 0.57, legs: [3, 7], agree: 0.03 },
};

/** Lig modeli: guc puanlari, fark ve toplam sapmalari (ileriye donuk testten). */
function model(db) {
  const games = Object.keys(db.seasons).sort().flatMap((y) => db.seasons[y]).sort((a, b) => (a[0] < b[0] ? -1 : 1)); if (games.length < 60) return null;
  const P = R.prepare(games), o = { ...R.DEFAULTS, ...(db.params?.o || {}) }, log = R.walk(P, o), ms = R.minSeenFor(P), s = R.fit(P, P.n, o);
  let se = 0, n = 0; for (let i = Math.floor(P.n * 0.45); i < P.n; i++) { const l = log[i]; if (l && l.seen >= ms && l.pt != null) { se += (l.pt - P.T[i]) ** 2; n++; } }
  return { P, s, sigma: db.params?.sigma || R.sigmaOf(P, log, 0, ms), tsig: n > 30 ? Math.sqrt(se / n) : 18 };
}
/** Bir macin butun secenekleri: { mk, label, odd, pm (piyasa), q (model), mbs, kind }. ps: ligin ilk yari/ceyrek istatistigi. */
export function legsOf(e, g, M, ps) {
  const out = [], pr = M ? R.predictWith(M.P, M.s, M.sigma, g.h, g.a, g.neu) : null, ok = pr?.known;
  const add = (mk, label, odd, pm, q, mbKey, kind) => { if (odd > 1 && pm > 0) out.push({ mk, label, odd, pm, q: ok && q != null && Number.isFinite(q) ? q : null, mbs: e.mb[mbKey] ?? e.mbs ?? 3, kind }); };
  const two = (v) => fair(v);
  if (e.od.ms) { const f = two(e.od.ms); add('1', 'MS 1', e.od.ms[0], f[0], pr?.pHome, 'ms', 'ft'); add('2', 'MS 2', e.od.ms[1], f[1], pr ? 1 - pr.pHome : null, 'ms', 'ft'); }
  for (const [line, v] of Object.entries(e.od.hcp || {})) { const L = Number(line), f = two(v), q = pr ? R.phi((pr.margin + L) / M.sigma) : null;
    add(`H1${line}`, `Hnd. 1 (${L > 0 ? '+' : ''}${ln(line)})`, v[0], f[0], q, `hcp${line}`, 'ft'); add(`H2${line}`, `Hnd. 2 (${-L > 0 ? '+' : ''}${ln(-L)})`, v[1], f[1], q == null ? null : 1 - q, `hcp${line}`, 'ft'); }
  for (const [line, v] of Object.entries(e.od.tot || {})) { const L = Number(line), f = two(v), qu = pr ? R.phi((L - pr.total) / M.tsig) : null;
    add(`A${line}`, `${ln(line)} Alt`, v[0], f[0], qu, `tot${line}`, 'ft'); add(`U${line}`, `${ln(line)} Üst`, v[1], f[1], qu == null ? null : 1 - qu, `tot${line}`, 'ft'); }
  if (ps) {
    const T = pr ? pr.total : null, sd1 = M ? Math.hypot(ps.s1 * M.tsig, ps.sd1) : null;
    for (const [line, v] of Object.entries(e.od.h1t || {})) { const L = Number(line), f = two(v), qu = T != null ? R.phi((L - ps.s1 * T) / sd1) : null;
      add(`IA${line}`, `İY ${ln(line)} Alt`, v[0], f[0], qu, `h1t${line}`, 'h1'); add(`IU${line}`, `İY ${ln(line)} Üst`, v[1], f[1], qu == null ? null : 1 - qu, `h1t${line}`, 'h1'); }
    for (const [line, v] of Object.entries(e.od.h1h || {})) { const L = Number(line), f = two(v), q = pr ? R.phi((ps.s1 * pr.margin + L) / Math.hypot(ps.s1 * M.sigma, ps.sd1 * 0.8)) : null;
      add(`IH1${line}`, `İY Hnd. 1 (${L > 0 ? '+' : ''}${ln(line)})`, v[0], f[0], q, `h1h${line}`, 'h1'); add(`IH2${line}`, `İY Hnd. 2 (${-L > 0 ? '+' : ''}${ln(-L)})`, v[1], f[1], q == null ? null : 1 - q, `h1h${line}`, 'h1'); }
    if (ps.sq) for (const [key, v] of Object.entries(e.od.qt || {})) { const [qn, line] = key.split('|'), L = Number(line); if (!(Number(qn) >= 1 && Number(qn) <= 4) || !Number.isFinite(L)) continue;
      const f = two(v), sdq = M ? Math.hypot(ps.sq * M.tsig, ps.sdq) : null, qu = T != null ? R.phi((L - ps.sq * T) / sdq) : null;
      add(`Q${qn}A${line}`, `${qn}. çeyrek ${ln(line)} Alt`, v[0], f[0], qu, `qt${key}`, `q${qn}`); add(`Q${qn}U${line}`, `${qn}. çeyrek ${ln(line)} Üst`, v[1], f[1], qu == null ? null : 1 - qu, `qt${key}`, `q${qn}`); }
  }
  return out;
}
/** Secimin sonucu: sc = [ev, dep] (uzatma dahil), per = ceyrek/devre skorlari [ev..., dep...]. Donus true/false/null (bilinmiyor). */
export function settleLeg(mk, sc, per) {
  const [h, a] = sc; let m;
  if (mk === '1') return h > a; if (mk === '2') return h < a;
  if ((m = mk.match(/^H([12])(-?[\d.]+)$/))) { const L = Number(m[2]); return m[1] === '1' ? h - a + L > 0 : h - a + L < 0; }
  if ((m = mk.match(/^([AU])([\d.]+)$/))) return m[1] === 'A' ? h + a < Number(m[2]) : h + a > Number(m[2]);
  if (!per) return null;
  const n = per.length / 2, H = per.slice(0, n), A = per.slice(n), h1 = n === 2 ? H[0] : H[0] + H[1], a1 = n === 2 ? A[0] : A[0] + A[1];
  if ((m = mk.match(/^I([AU])([\d.]+)$/))) return m[1] === 'A' ? h1 + a1 < Number(m[2]) : h1 + a1 > Number(m[2]);
  if ((m = mk.match(/^IH([12])(-?[\d.]+)$/))) { const L = Number(m[2]); return m[1] === '1' ? h1 - a1 + L > 0 : h1 - a1 + L < 0; }
  if ((m = mk.match(/^Q(\d)([AU])([\d.]+)$/))) { if (n !== 4) return null; const i = Number(m[1]) - 1, t = H[i] + A[i]; return m[2] === 'A' ? t < Number(m[3]) : t > Number(m[3]); }
  return null;
}
/** Isin aramasi: farkli maclardan secimler, toplam oran [lo, hi], MBS kurali; tutma olasiligi en yuksek kupon. */
export function bestTier(legs, T) {
  const C = legs.filter((l) => l.p >= T.minP && l.odd <= T.hi).sort((a, b) => b.p - a.p).slice(0, 80);
  let beam = [{ legs: [], odds: 1, p: 1, ids: new Set() }], best = null;
  for (let depth = 1; depth <= T.legs[1]; depth++) {
    const next = [];
    for (const s of beam) for (const l of C) {
      if (s.ids.has(l.id) || (s.legs.length && C.indexOf(l) <= C.indexOf(s.legs[s.legs.length - 1]))) continue;
      const odds = s.odds * l.odd; if (odds > T.hi) continue;
      const st = { legs: [...s.legs, l], odds, p: s.p * l.p, ids: new Set([...s.ids, l.id]) }; next.push(st);
      if (depth >= T.legs[0] && odds >= T.lo && Math.max(...st.legs.map((x) => x.mbs)) <= depth && (!best || st.p > best.p)) best = st;
    }
    next.sort((x, y) => y.p - x.p); beam = next.slice(0, 300);
    if (!beam.length) break;
  }
  return best && { odds: best.odds, p: best.p, legs: best.legs };
}

export async function gunlukBasket({ get, pool, readJson, writeJson, NOW, index, per }) {
  const V = 2, now = NOW.getTime(), today = istDay(now);
  const G = readJson('b/gunluk.json', null), store = G && G.v === V ? G : { v: V, days: {} };
  const leagues = index.basket.filter((l) => !/^ncaaw/.test(l.id)), dbs = new Map();
  for (const l of leagues) { const db = readJson(`b/${l.id}.json`, null); if (db) dbs.set(l.id, db); }
  const RV = 2, day = (store.days[today] ||= { d: today });
  for (const k of Object.keys(TIERS)) if (day[k] && day[k].rv !== RV && day[k].legs.every((l) => Date.parse(l.t) > now + 20 * 6e4)) delete day[k];   // kural degisti, hicbir mac baslamadi: yeniden kur
  const early = new Date(now + 3 * 36e5).getUTCHours() < 7;
  const need = Object.keys(TIERS).some((k) => !day[k]) && !early;
  const pending = Object.values(store.days).some((d) => Object.keys(TIERS).some((k) => d[k]?.legs.some((l) => Date.parse(l.t) > now)));
  let iddaa = [];
  if (need || pending) {
    try { const [j, c] = await Promise.all([get(IDDAA_BASKET), get(IDDAA_COMP)]); const comps = new Map((c?.data || []).map((x) => [x.i, x.n]));
      iddaa = (j?.data?.events || []).filter((e) => e.d * 1000 > now + 5 * 6e4).map((e) => parseIddaa(e, comps, MK_BASKET)).filter((e) => e.od.ms); } catch (e) { console.warn('gunluk basket: iddaa', e.message); }
  }
  // kapanis orani: baslamamis secimlerin guncel orani
  const byIo = new Map(iddaa.map((e) => [e.io, e]));
  for (const d of Object.values(store.days)) for (const k of Object.keys(TIERS)) for (const l of d[k]?.legs || []) {
    if (Date.parse(l.t) <= now) continue; const e = byIo.get(l.io); if (!e) continue;
    const o = legsOf(e, { h: l.h, a: l.a, neu: 0 }, null, per?.st?.[l.lg]).find((x) => x.mk === l.mk)?.odd; if (o > 1) { l.close = o; l.closeAt = NOW.toISOString().slice(0, 16); }
  }
  if (need) {
    // aday maclar: bugun (Turkiye saati) baslayip yarin sabah 10:00'a kadar
    const until = Date.parse(today + 'T07:00:00Z') + 864e5, games = [];
    for (const [id, db] of dbs) for (const [utc, h, a, neu] of db.upcoming || []) { const t = Date.parse(utc); if (t > now + 20 * 6e4 && t <= until) games.push({ id: `${id}|${utc}|${h}`, lg: id, ln: leagues.find((l) => l.id === id)?.name, t: utc, h, a, neu }); }
    const pairs = matchEvents(games, iddaa), models = new Map(), legs = [];
    // ilk yari ve ceyrek pazarlari yalnizca mac detayinda: ceyrek skoru tutulan liglerde detay alinir
    const withPer = games.filter((g) => pairs.has(g.id) && per?.st?.[g.lg]?.n >= 30).slice(0, 40);
    if (pool) { const det = await pool(withPer, 4, async (g) => { try { const j = await get(IDDAA_EVENT(pairs.get(g.id).io)); return j?.data ? [g, parseIddaa(j.data, new Map(), MK_BASKET)] : null; } catch { return null; } });
      for (const x of det) if (x) { const e = pairs.get(x[0].id); e.od = { ...e.od, ...x[1].od }; e.mb = { ...e.mb, ...x[1].mb }; } }
    for (const g of games) {
      const e = pairs.get(g.id); if (!e) continue;
      if (!models.has(g.lg)) models.set(g.lg, model(dbs.get(g.lg)));
      const ps = per?.st?.[g.lg]?.n >= 30 ? per.st[g.lg] : null;
      for (const l of legsOf(e, g, models.get(g.lg), ps)) {
        // model piyasadan cok farkliysa (or. sezon basi NCAA) bu genelde modelin hatasidir: etkisi sinirlanir
        const p = l.q != null ? l.pm + 0.25 * Math.max(-0.08, Math.min(0.08, l.q - l.pm)) : l.pm;
        legs.push({ id: g.id, lg: g.lg, ln: g.ln, t: g.t, h: g.h, a: g.a, io: e.io, mk: l.mk, label: l.label, kind: l.kind, odd: l.odd, mbs: l.mbs, pm: r3(l.pm), q: r3(l.q), p: r3(p), edge: r3(l.q != null ? l.q - l.pm : null) });
      }
    }
    console.log(`gunluk basket: iddaa ${iddaa.length} mac, eslesen ${pairs.size}, detay ${withPer.length}, secenek ${legs.length}`);
    for (const [k, T] of Object.entries(TIERS)) {
      if (day[k]) continue;
      // secim kurali: model varsa piyasadan belirgin dusuk olmamali (banko 8, digerleri 3 puan); ayni mactan tek secim
      const ok = legs.filter((l) => (l.q == null || l.q >= l.pm - T.agree) && l.pm >= T.minP - 0.02);   // piyasa da inanmali
      const b = bestTier(ok, T);
      if (b) { day[k] = { rv: RV, built: NOW.toISOString(), tier: T.name, odds: r3(b.odds), p: r3(b.p), legs: b.legs.map((l) => ({ ...l, res: null })) }; console.log(`gunluk basket ${T.name}:`, b.legs.length, 'secim, oran', r3(b.odds), 'olasilik', r3(b.p)); }
    }
  }
  // sonuclar
  for (const d of Object.values(store.days)) for (const k of Object.keys(TIERS)) {
    const c = d[k]; if (!c) continue;
    for (const l of c.legs) {
      if (l.res) continue; const db = dbs.get(l.lg), t = Date.parse(l.t); let sc = null;
      if (db) for (const list of Object.values(db.seasons || {})) { const x = list.find((x) => x[1] === l.h && x[2] === l.a && Math.abs(Date.parse(x[0]) - t) < 1.6 * 864e5); if (x) { sc = [x[3], x[4]]; break; } }
      if (sc) {
        const pr = periodsOf(per, l.lg, l.t, l.h), hit = settleLeg(l.mk, sc, pr);
        if (hit != null) { l.sc = sc; if (pr) l.per = pr; l.res = hit ? 'W' : 'L'; } else if (t < now - 2 * 864e5) { l.sc = sc; l.res = 'V'; }
      } else if (t < now - 3 * 864e5) l.res = 'V';
    }
    const rs = c.legs.map((l) => l.res); c.res = rs.includes('L') ? 'L' : rs.every((r) => r === 'W' || r === 'V') ? (rs.every((r) => r === 'V') ? 'V' : 'W') : null;
  }
  for (const d of Object.keys(store.days)) if (d < istDay(now - 45 * 864e5)) delete store.days[d];
  const ds = Object.keys(store.days).sort(), stat = (k) => { const done = ds.map((d) => store.days[d][k]).filter((c) => c && c.res && c.res !== 'V');
    let streak = 0; for (let i = done.length - 1; i >= 0 && done[i].res === 'W'; i--) streak++;
    let best = 0, run = 0; for (const c of done) { run = c.res === 'W' ? run + 1 : 0; best = Math.max(best, run); }
    return { days: done.length, won: done.filter((c) => c.res === 'W').length, exp: r3(done.reduce((s, c) => s + c.p, 0)), streak, best }; };
  store.sum = Object.fromEntries(Object.keys(TIERS).map((k) => [k, stat(k)]));
  store.ozet = summarize(store.days, []);
  store.updated = NOW.toISOString();
  writeJson('b/gunluk.json', store);
}
