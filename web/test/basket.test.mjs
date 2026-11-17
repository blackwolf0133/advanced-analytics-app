import assert from 'node:assert'; import { test } from 'node:test'; import fs from 'node:fs';
import * as B from '../src/basket.js';
import * as R from '../src/rating.js';
const fx = (f) => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
// Bilinen gucler ve bilinen ev avantajiyla uretilmis yapay lig (yalnizca test icin)
function league(years, hfa = 2.5, seed = 3, neutralShare = 0) {
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }, gauss = () => { let t = 0; for (let i = 0; i < 12; i++) t += rnd(); return t - 6; };
  const teams = Array.from({ length: 30 }, (_, i) => 'Takım ' + String(i).padStart(2, '0')), str = Object.fromEntries(teams.map((t) => [t, gauss() * 4])), pace = Object.fromEntries(teams.map((t) => [t, gauss() * 3])), out = [];
  for (const y of years) { let day = 0; for (let r = 0; r < 41; r++) for (let i = 0; i < 30; i++) { const h = teams[i], a = teams[(i + 1 + (r * 7) % 29) % 30]; if (h === a) continue;
    const n = rnd() < neutralShare ? 1 : 0, m = str[h] - str[a] + (n ? 0 : hfa) + gauss() * 11, t = 226 + pace[h] + pace[a] + gauss() * 14; let hp = Math.round((t + m) / 2), ap = Math.round((t - m) / 2); if (hp === ap) hp++;
    const d = new Date(Date.UTC(y, 9, 22 + Math.floor(day++ / 8))); out.push([d.toISOString().slice(0, 10), h, a, hp, ap, y, n]); } }
  return { games: out, str };
}
const dbOf = (games, extra = {}) => { const seasons = {}; for (const g of games) (seasons[g[5]] ||= []).push(g); return { seasons, upcoming: [], updated: new Date().toISOString(), ...extra }; };

test('model: ev avantaji veriden olculur (sabit degil); tarafsiz sahada ev avantaji yok', () => {
  const got = {};
  for (const hfa of [0, 4.5]) {
    const L = league([2023, 2024, 2025], hfa, 7, 0.15), M = B.build(dbOf(L.games)); got[hfa] = M.s.hfa;
    console.log(`  gercek ev avantaji ${hfa} -> olculen ${M.s.hfa.toFixed(2)}, sigma ${M.sigma.toFixed(1)}`);
    const t = Object.keys(L.str)[0], eq = B.predict(M, t, t, 0), eqN = B.predict(M, t, t, 1);
    assert.ok(Math.abs(eqN.pHome - 0.5) < 1e-9 && eq.pHome < 0.5 + Math.max(0.03, hfa * 0.04));      // esit guc: tarafsizda tam %50
  }
  assert.ok(got[4.5] > 3 && got[0] < 1.5 && got[4.5] - got[0] > 2.5);
});
test('model: ileriye donuk test "hep ev sahibi"nden ve lig ortalamasindan iyi; guclu deplasman takimi favori olabilir', () => {
  const L = league([2023, 2024, 2025]), M = B.build(dbOf(L.games)), e = B.evaluate(M);
  console.log('  n', e.n, 'isabet', e.acc.toFixed(3), 'ev', e.homeRate.toFixed(3), 'ev secimi', e.homePick.toFixed(3), 'll', e.logloss.toFixed(3), 'toplam MAE', e.totalMae.toFixed(1), 'temel', e.totalBaseMae.toFixed(1));
  assert.ok(e.acc > Math.max(e.homeRate, 1 - e.homeRate) + 0.03 && e.totalMae < e.totalBaseMae && e.homePick < 0.75);
  const lo = e.buckets[0], hi = e.buckets[3]; assert.ok(lo.rate < 0.62 && (hi.n < 30 || hi.rate > 0.72));
  const order = Object.entries(L.str).sort((a, b) => b[1] - a[1]), best = order[0][0], worst = order[29][0];
  const away = B.predict(M, worst, best); assert.ok(away.pHome < 0.2 && away.margin < -6 && away.known && !B.predict(M, 'Yok', best).known);
  assert.deepStrictEqual(e.atLeast.map((x) => x.t), [0.5, 0.6, 0.7, 0.8]); assert.ok(e.atLeast[2].rate > e.atLeast[0].rate && e.atLeast[1].n < e.atLeast[0].n);
  const days = B.recent(M, 3), g = days[0].games[0]; assert.ok(days.length === 3 && days[0].date > days[1].date && g.hit === ((g.pick === g.home) === (g.hp > g.ap)) && g.actualTotal === g.hp + g.ap);
  assert.strictEqual(B.standings(dbOf(L.games)).length, 30);
});
test('gercek veri (EuroLeague, 3 sezon): model sabit "ev sahibi" tahmininden iyi, ev sahibini gercekten daha sik secmiyor', () => {
  const db = JSON.parse(fx('veri_euroleague.json')), M = B.build(db), e = B.evaluate(M), h = e.homeRate, base = -(h * Math.log(h) + (1 - h) * Math.log(1 - h));
  console.log(`  ${e.n} mac, isabet ${(e.acc * 100).toFixed(1)}%, log kayip ${e.logloss.toFixed(3)} (sabit ${base.toFixed(3)}), ev avantaji ${e.hfa.toFixed(2)}, ev secimi ${(e.homePick * 100).toFixed(0)}% / gercek ${(h * 100).toFixed(0)}%`);
  assert.ok(e.logloss < base - 0.02 && e.hfa > 1 && e.hfa < 6 && e.homePick < h + 0.2 && M.sigma > 8);
});
test('kucuk lig (sezon basi): model kurulur, karne yoksa null', () => {
  const L = league([2026]).games.slice(0, 40), M = B.build(dbOf(L));
  assert.ok(M && Number.isFinite(B.predict(M, L[0][1], L[0][2]).pHome)); assert.strictEqual(R.minSeenFor(M.P), 2);
  assert.ok(R.tune(L).small);
});
test('indirme: lig listesi ve lig dosyasi; ilk adres calismazsa ikincisi', async () => {
  const calls = [], get = async (u) => { calls.push(u); if (u.includes('raw.githubusercontent')) throw new Error('bağlantı kurulamadı'); if (u.endsWith('index.json')) return fx('veri_index.json'); if (u.endsWith('b/euroleague.json')) return fx('veri_euroleague.json'); throw new Error('404'); };
  const r = await B.download(get, 'euroleague');
  assert.strictEqual(r.n, 842); assert.deepStrictEqual(r.seasons, [2024, 2025, 2026]); assert.ok(calls.some((u) => u.includes('cdn.jsdelivr.net')));
  assert.strictEqual(B.leagues().length, 12); assert.ok(B.loadLeague('euroleague').fetched > 0);
  await assert.rejects(B.download(get, 'yok'));
});
