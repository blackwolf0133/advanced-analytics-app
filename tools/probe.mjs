// Oranlardan olasilik: yontem yarisi (penaltyblog'daki yontemler + bizim karisim). football-data.co.uk, 22 lig, 2021-2026.
import fs from 'fs';
const LG = ['E0','E1','E2','E3','SC0','SC1','D1','D2','I1','I2','SP1','SP2','F1','F2','N1','B1','P1','T1','G1'];
const SS = ['2122','2223','2324','2425','2526'];
const csv = (t) => { const L = t.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean), H = L[0].split(','); return L.slice(1).map((l) => { const v = l.split(','), o = {}; H.forEach((h, i) => (o[h] = v[i])); return o; }); };
const solve = (f, lo, hi) => { for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; };
const M = {
  mult: (r) => { const s = r.reduce((a, b) => a + b); return r.map((x) => x / s); },
  add: (r) => { const s = r.reduce((a, b) => a + b); return r.map((x) => Math.max(1e-4, x - (s - 1) / r.length)); },
  power: (r) => { const k = solve((k) => r.reduce((a, x) => a + x ** k, 0) - 1, 1, 3); return r.map((x) => x ** k); },
  shin: (r) => { const S = r.reduce((a, b) => a + b), g = (z) => r.map((x) => (Math.sqrt(z * z + 4 * (1 - z) * x * x / S) - z) / (2 - 2 * z)); const z = solve((z) => g(z).reduce((a, b) => a + b) - 1, 0, 0.4); return g(z); },
  oddsratio: (r) => { const p = (c) => r.map((x) => x / (x + c * (1 - x))); const c = solve((c) => p(c).reduce((a, b) => a + b) - 1, 1, 5); return p(c); },
};
M.bizim = (r) => (r.length === 2 ? M.mult(r).map((x, i) => (x + M.power(r)[i]) / 2) : M.power(r));   // uygulamadaki fair()
const res = {}, add = (key, meth, p, y) => { const o = ((res[key] ||= {})[meth] ||= { n: 0, ll: 0, br: 0, bins: Array.from({ length: 10 }, () => [0, 0, 0]) }); o.n++; o.ll -= Math.log(Math.max(1e-9, p[y])); o.br += p.reduce((a, x, i) => a + (x - (i === y ? 1 : 0)) ** 2, 0); p.forEach((x, i) => { const b = o.bins[Math.min(9, Math.floor(x * 10))]; b[0]++; b[1] += x; b[2] += i === y ? 1 : 0; }); };
let n = 0, miss = 0;
for (const lg of LG) for (const s of SS) {
  let rows; try { const r = await fetch(`https://www.football-data.co.uk/mmz4281/${s}/${lg}.csv`); if (!r.ok) { miss++; continue; } rows = csv(await r.text()); } catch { miss++; continue; }
  for (const m of rows) {
    const hg = +m.FTHG, ag = +m.FTAG; if (!(m.FTHG >= '0') || isNaN(hg)) continue; n++;
    const y3 = hg > ag ? 0 : hg === ag ? 1 : 2, yo = hg + ag > 2.5 ? 0 : 1;
    for (const [bk, k3, ko] of [['B365', ['B365CH', 'B365CD', 'B365CA'], ['B365C>2.5', 'B365C<2.5']], ['Ort', ['AvgCH', 'AvgCD', 'AvgCA'], ['AvgC>2.5', 'AvgC<2.5']], ['Pin', ['PSCH', 'PSCD', 'PSCA'], ['PC>2.5', 'PC<2.5']]]) {
      const o3 = k3.map((k) => +m[k]), oo = ko.map((k) => +m[k]);
      if (o3.every((x) => x > 1)) { const r = o3.map((x) => 1 / x); const mg = r.reduce((a, b) => a + b) - 1; for (const [nm, f] of Object.entries(M)) { add(`${bk} 1X2`, nm, f(r), y3); if (mg > 0.06) add(`${bk} 1X2 marj>%6`, nm, f(r), y3); } }
      if (oo.every((x) => x > 1)) { const r = oo.map((x) => 1 / x); for (const [nm, f] of Object.entries(M)) add(`${bk} 2.5 A/U`, nm, f(r), yo); }
    }
  }
}
// iddaa benzeri yuksek marj: B365 oranlarini %12 marja cek (her olasilik ayni oranda sisirilmeden, favori-longshot egilimiyle: power ile)
const out = { n, miss, res: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([m, o]) => [m, { n: o.n, logloss: +(o.ll / o.n).toFixed(5), brier: +(o.br / o.n).toFixed(5), cal: o.bins.filter((b) => b[0] > 50).map((b) => [+(b[1] / b[0]).toFixed(3), +(b[2] / b[0]).toFixed(3), b[0]]) }]))])) };
fs.mkdirSync('probe-out', { recursive: true }); fs.writeFileSync('probe-out/yontem.json', JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.res)) { console.log(k); for (const [m, o] of Object.entries(v).sort((a, b) => a[1].logloss - b[1].logloss)) console.log(`  ${m.padEnd(10)} n=${o.n} logloss=${o.logloss} brier=${o.brier}`); }
