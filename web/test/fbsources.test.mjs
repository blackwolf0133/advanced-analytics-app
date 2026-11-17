import assert from 'node:assert'; import { test } from 'node:test'; import fs from 'node:fs';
import * as S from '../src/fbsources.js';
import * as F from '../src/football.js';
const fx = (f) => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('katalog: anahtarlar tekil, 42 football-data ligi + open-matchday ligleri + milli maclar', () => {
  const keys = S.CATALOG.map((c) => c.key); assert.strictEqual(new Set(keys).size, keys.length);
  assert.strictEqual(S.CATALOG.filter((c) => c.src === 'fd' || c.src === 'fdn').length, 38);
  assert.ok(S.CATALOG.length >= 76 && S.byKey('om:NED_2_eerste-divisie').name === 'Eerste Divisie' && S.byKey('yok').key === 'T1');
  const g = S.groups(); assert.strictEqual(g[0][0], 'Türkiye'); assert.ok(g.some(([n]) => n === 'Milli takımlar') && g.find(([n]) => n === 'İngiltere')[1].length >= 9);
});
test('football-data ek lig dosyasi: sezonlar, kapanis oranlari, takvim yili ligi', () => {
  const s = S.parseFdNew(fx('fd_new_arg_head.csv')), ys = Object.keys(s).map(Number);
  assert.ok(ys.includes(2012) && ys.includes(2026)); const m = s[2012][0];
  assert.deepStrictEqual(m.slice(0, 5), ['2012-08-03', 'Arsenal Sarandi', 'Union de Santa Fe', 1, 0]); assert.ok(m[5] > 1 && m[6] > 1 && m[7] > 1);
  assert.ok(s[2026].every((x) => x[0].startsWith('2026')));
});
test('open-matchday: sonuc ve fikstur dosyasi', () => {
  const ms = S.parseOm(fx('om_tur1_results.csv')), fxs = S.parseOmFixtures(fx('om_tur1_fixtures.csv'));
  assert.strictEqual(ms.length, 99); assert.ok(ms[0][0] <= ms[98][0] && ms.every((m) => Number.isInteger(m[3]) && m[5] === null));
  assert.ok(fxs.length > 50 && fxs[0].home && Number.isFinite(fxs[0].t));
});
test('indirme: ek lig (oranli fikstur), open-matchday (ilk adres calismazsa ikincisi), milli maclar', async () => {
  const calls = [], get = async (u) => { calls.push(u);
    if (u.endsWith('new/ARG.csv')) return fx('fd_new_arg_head.csv'); if (u.endsWith('new_league_fixtures.csv')) return 'Country,League,Date,Time,Home,Away,AvgH,AvgD,AvgA\nArgentina,Liga Profesional,20/11/2026,23:00,Lanus,Instituto,1.8,3.4,4.6\nBrazil,Serie A,20/11/2026,23:00,Vasco,Santos,2,3,4\n';
    if (u.includes('cdn.jsdelivr.net/gh/oladeeayo')) throw new Error('bağlantı kurulamadı'); if (u.endsWith('TUR_1_super-lig/results_2627.csv')) return fx('om_tur1_results.csv'); if (u.endsWith('fixtures_2627.csv')) return fx('om_tur1_fixtures.csv');
    if (u.endsWith('milli.json')) return fx('veri_milli.json'); throw new Error('404 ' + u); };
  await S.downloadExtra(get, S.byKey('n:ARG'), new Date('2026-11-17'));
  const arg = F.loadLeague('n:ARG'); assert.ok(arg.calendar && arg.upcoming.length === 1 && arg.upcoming[0].odds[0] === 1.8);
  await S.downloadExtra(get, { key: 'om:TUR_1_super-lig', src: 'om', code: 'TUR_1_super-lig' }, new Date('2026-11-17'));
  const tr = F.loadLeague('om:TUR_1_super-lig'); assert.strictEqual(tr.seasons[2026].length, 99); assert.ok(tr.upcoming.length > 50 && calls.some((u) => u.includes('raw.githubusercontent.com/oladeeayo')));
  const r = await S.downloadExtra(get, S.byKey('milli')); const mi = F.loadLeague('milli'), ms = F.matches(mi);
  assert.ok(r.length >= 4 && ms.length === 4098 && mi.upcoming.length === 53 && ms.some((m) => m[9] === 1) && ms.some((m) => m[10] < 1));
});
test('milli maclar modeli: tarafsiz sahada ev avantaji yok, guclu takim favori, karne lig ortalamasindan iyi', () => {
  const ms = F.matches(F.loadLeague('milli')), M = F.model(ms);
  const a = F.forecast(M, 'Spain', 'San Marino', 1), n1 = F.forecast(M, 'France', 'Germany', 1), n2 = F.forecast(M, 'Germany', 'France', 1), h = F.forecast(M, 'France', 'Germany', 0);
  assert.ok(a.p[0] > 0.85 && Math.abs(n1.p[0] - n2.p[2]) < 0.02 && h.p[0] > n1.p[0]);
  const t0 = Date.now(), e = F.evaluate(ms); console.log(`  milli karne: ${e.n} mac, isabet ${(e.model.acc * 100).toFixed(1)}%, ll ${e.model.logloss.toFixed(3)} (temel ${e.base.logloss.toFixed(3)}), ${Date.now() - t0} ms`);
  assert.ok(e.model.logloss < e.base.logloss - 0.05);
});
test('open-matchday tek sezon: model ve karne kurulur', () => {
  const ms = F.matches(F.loadLeague('om:TUR_1_super-lig')), M = F.model(ms), e = F.evaluate(ms);
  assert.ok(M.teams.length === 18 && e && e.n >= 40); console.log(`  Süper Lig (bu sezon, ${ms.length} mac): karne ${e.n} mac, isabet ${(e.model.acc * 100).toFixed(0)}%`);
});
