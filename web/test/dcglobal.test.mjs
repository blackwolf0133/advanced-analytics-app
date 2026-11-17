import assert from 'node:assert'; import { test } from 'node:test';
import { fitGlobal, predictMatch, rates, halfShare } from '../src/dcglobal.js';
// Iki lig (farkli seviye) + ikisini baglayan bir kupa; bilinen guclerle uretilmis maclar (yalnizca test icin)
function world(seed = 5) {
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
  const pois = (l) => { let k = 0, p = Math.exp(-l), c = p, u = rnd(); while (u > c && k < 15) { k++; p *= l / k; c += p; } return k; };
  const T = {}; for (const L of ['A', 'B']) for (let i = 0; i < 16; i++) T[L + i] = { a: (L === 'A' ? 0.25 : -0.25) + (rnd() - 0.5) * 0.6, d: (L === 'A' ? 0.25 : -0.25) + (rnd() - 0.5) * 0.6 };
  const ms = []; let day = 0;
  const play = (c, h, a, n = 0) => { const l = Math.exp(0.3 + T[h].a - T[a].d + (n ? 0 : 0.25)), m = Math.exp(0.3 + T[a].a - T[h].d), hg = pois(l), ag = pois(m);
    let h1 = 0, a1 = 0; for (let k = 0; k < hg; k++) h1 += rnd() < 0.45 ? 1 : 0; for (let k = 0; k < ag; k++) a1 += rnd() < 0.45 ? 1 : 0; ms.push({ day: day, c, h, a, hg, ag, h1, a1, n }); };
  for (let r = 0; r < 30; r++) { day += 3; for (const L of ['A', 'B']) for (let i = 0; i < 16; i += 2) { const x = (i + r) % 16, y = (i + 1 + r * 3) % 16; if (x !== y) play('lig' + L, L + x, L + y); } if (r % 3 === 0) for (let i = 0; i < 4; i++) play('kupa', 'A' + i, 'B' + i, r % 6 === 0 ? 1 : 0); }
  return { ms, T };
}
test('kuresel model: kupa maclari ligleri baglar, guclu ligin ortalama takimi zayif ligin ortalama takimindan iyi', () => {
  const { ms, T } = world(), M = fitGlobal(ms);
  const avg = (L) => { let s = 0; for (let i = 0; i < 16; i++) { const k = M.teams.get(L + i); s += M.att[k] + M.def[k]; } return s / 16; };
  console.log(`  ${ms.length} mac, guc A ${avg('A').toFixed(2)} B ${avg('B').toFixed(2)}, ev avantaji lig A ${M.g[M.comps.get('ligA')].toFixed(2)}, rho ${M.rho}`);
  assert.ok(avg('A') - avg('B') > 0.3);
  const r = rates(M, 'kupa', 'A0', 'B0', 1), r2 = rates(M, 'kupa', 'B0', 'A0', 1), rn = rates(M, 'ligA', 'A0', 'A1'), rh = rates(M, 'ligA', 'A0', 'A1', 1);
  assert.ok(Math.abs(r.l - r2.m) < 1e-9 && rn.l > rh.l && rn.m === rh.m);                                 // tarafsizda simetrik, evde ev avantaji
  const u = rates(M, 'ligA', 'Yok', 'A1'); assert.strictEqual(u.nh, 0);
  const true1 = Object.entries(T).sort((a, b) => b[1].a + b[1].d - a[1].a - a[1].d)[0][0], est1 = [...M.teams.keys()].sort((a, b) => M.att[M.teams.get(b)] + M.def[M.teams.get(b)] - M.att[M.teams.get(a)] - M.def[M.teams.get(a)])[0];
  assert.ok(T[est1].a + T[est1].d > 0.6, `en guclu: gercek ${true1}, model ${est1}`);
});
test('tahmin: olasiliklar toplami 1; ilk yari daha az gollu; skor tahmini en olasi skor; ilk yari payi veriden', () => {
  const p = predictMatch(1.8, 0.9, -0.05, 0.45);
  for (const v of [p.p, p.ht, p.h2]) assert.ok(Math.abs(v[0] + v[1] + v[2] - 1) < 1e-9);
  assert.ok(p.p[0] > p.p[2] && p.ht[1] > p.p[1] && p.h2[1] > p.p[1] && p.ht[1] > p.h2[1]);           // devrelerde beraberlik daha sik
  assert.ok(p.top[0][2] >= p.top[1][2] && p.htTop[0][0] + p.htTop[0][1] <= 1 && Math.abs(p.xg[0] - 1.8) < 1e-9);
  const { ms } = world(9), f = halfShare(ms); console.log('  ilk yari payi (genel)', f.get('*').toFixed(3)); assert.ok(Math.abs(f.get('*') - 0.45) < 0.03 && f.has('ligA'));
});
