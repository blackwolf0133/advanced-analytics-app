// Gunluk kayitlarin ozetleri: sanal kasa, kapanis orani (CLV) ve haftalik rapor. Futbol ve basketbol ortak kullanir.
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const r2 = (x) => Math.round(x * 100) / 100;
export const STAKE = { combo: 100, list: 10 };   // sanal kasa: her gunluk kombine 100 TL, listelerdeki her mac 10 TL (tek tek)

/** Iddaa kurali: iptal edilen secim 1,00 sayilir. Donus: kuponun odedigi oran (yattiysa 0) ya da null (bitmedi). */
function comboReturn(c) {
  if (!c || !c.res) return null; if (c.res === 'L') return 0;
  return c.legs.reduce((s, l) => s * (l.res === 'V' ? 1 : l.odd), 1);
}
/** Kapanis orani farki: bizim aldigimiz oran / mac baslamadan onceki son oran - 1 (artiysa piyasadan iyi fiyat almisiz). */
export const clvOf = (l) => (l.close > 1 && l.odd > 1 ? l.odd / l.close - 1 : null);

/**
 * days: { 'YYYY-MM-DD': { combo, g6, kk2, ... } } ; lists: liste anahtarlari.
 * Donus: { kasa: { combo: [[gun, kumulatif]], list: {...} }, clv: {...}, weeks: [...] }
 */
export function summarize(days, lists = []) {
  const ds = Object.keys(days).sort(), kasa = { combo: [], lists: {} }, clv = { combo: [], lists: {} };
  let cum = 0; const lc = Object.fromEntries(lists.map((k) => [k, 0]));
  const weeks = new Map();
  const wk = (d) => { const t = new Date(d + 'T12:00:00Z'), day = (t.getUTCDay() + 6) % 7; return new Date(t - day * 864e5).toISOString().slice(0, 10); };   // haftanin pazartesisi
  for (const d of ds) {
    const x = days[d], W = weeks.get(wk(d)) || { w: wk(d), combo: { n: 0, won: 0, exp: 0, pl: 0 }, lists: {}, clv: [] }; weeks.set(W.w, W);
    const ret = comboReturn(x.combo);
    if (ret != null && x.combo.res !== 'V') {
      const pl = STAKE.combo * (ret - 1); cum += pl; kasa.combo.push([d, r2(cum)]);
      W.combo.n++; W.combo.won += x.combo.res === 'W' ? 1 : 0; W.combo.exp += x.combo.p || 0; W.combo.pl += pl;
    }
    if (x.combo) for (const l of x.combo.legs) { const c = clvOf(l); if (c != null) { clv.combo.push(c); W.clv.push(c); } }
    for (const k of lists) {
      const L = x[k]; if (!L) continue; const top = L.legs.slice(0, 7); let pl = 0, n = 0;
      for (const l of top) { if (!l.res || l.res === 'V' || !(l.odd > 1)) continue; n++; pl += l.res === 'W' ? STAKE.list * (l.odd - 1) : -STAKE.list; const c = clvOf(l); if (c != null) (clv.lists[k] ||= []).push(c); }
      if (n) { lc[k] += pl; (kasa.lists[k] ||= []).push([d, r2(lc[k])]); }
      if (L.done) { const o = (W.lists[k] ||= { days: 0, hits: 0, exp: 0, pl: 0 }); o.days++; o.hits += L.hits || 0; o.exp += L.exp || 0; o.pl += pl; }
    }
  }
  const avg = (a) => (a.length ? r3(a.reduce((s, v) => s + v, 0) / a.length) : null), pos = (a) => (a.length ? r3(a.filter((v) => v > 0).length / a.length) : null);
  return {
    kasa: { combo: kasa.combo, lists: kasa.lists, stake: STAKE },
    clv: { combo: { n: clv.combo.length, avg: avg(clv.combo), pos: pos(clv.combo) }, lists: Object.fromEntries(Object.entries(clv.lists).map(([k, a]) => [k, { n: a.length, avg: avg(a), pos: pos(a) }])) },
    weeks: [...weeks.values()].slice(-8).map((W) => ({ ...W, combo: { ...W.combo, exp: r3(W.combo.exp), pl: r2(W.combo.pl) }, lists: Object.fromEntries(Object.entries(W.lists).map(([k, o]) => [k, { ...o, exp: r3(o.exp), pl: r2(o.pl) }])), clv: avg(W.clv), clvN: W.clv.length })),
  };
}
