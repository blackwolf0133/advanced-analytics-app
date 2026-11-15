import assert from 'node:assert'; import { test } from 'node:test';
import * as F from '../src/football.js';
let s = 11; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }, pois = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
// Bilinen hucum/savunma guclerinden gol ureten yapay lig (yalnizca test icin). Oranlar gercek olasiliktan + %5 marjla uretilir.
function league(years, nt = 18) {
  const T = Array.from({ length: nt }, (_, i) => 'Takım' + i), att = T.map(() => 0.6 + rnd() * 0.9), def = T.map(() => 0.7 + rnd() * 0.7), out = [];
  for (const y of years) { let d = 0; for (let i = 0; i < nt; i++) for (let j = 0; j < nt; j++) { if (i === j) continue; const l = 1.35 * att[i] * def[j], m = att[j] * def[i], hg = pois(l), ag = pois(m);
    let pH = 0, pD = 0, pA = 0; for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) { const q = Math.exp(-l - m) * l ** a * m ** b / (fact(a) * fact(b)); if (a > b) pH += q; else if (a === b) pD += q; else pA += q; }
    const date = new Date(Date.UTC(y, 7, 10 + Math.floor(d++ / 9) * 7 % 280)).toISOString().slice(0, 10); out.push([date, T[i], T[j], hg, ag, +(1 / (pH * 1.05)).toFixed(2), +(1 / (pD * 1.05)).toFixed(2), +(1 / (pA * 1.05)).toFixed(2), y]); }
  }
  return { ms: out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[8] - b[8])), T, att, def };
}
function fact(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }
const CSV = 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,B365H,B365D,B365A,AvgH,AvgD,AvgA,AvgCH,AvgCD,AvgCA\r\nSP1,17/08/2025,20:30,Barcelona,"Ath Bilbao",2,1,H,1.5,4.2,6.5,1.52,4.3,6.4,1.55,4.2,6.2\r\nSP1,16/08/25,18:00,Girona,Betis,0,0,D,2.4,3.3,3,,,,,,\r\nSP1,24/08/2025,18:00,Sevilla,Getafe,,,,2.1,3.1,3.9,,,,,,\r\n\r\n';
test('sonuc dosyasi: tarih bicimleri, tirnak, oynanmamis mac, oran onceligi', () => {
  assert.deepStrictEqual(F.parseResults('﻿' + CSV), [['2025-08-16', 'Girona', 'Betis', 0, 0, 2.4, 3.3, 3], ['2025-08-17', 'Barcelona', 'Ath Bilbao', 2, 1, 1.55, 4.2, 6.2]]);
  assert.throws(() => F.parseResults('<html>engellendi</html>'));
  assert.strictEqual(F.seasonCode(2026), '2627'); assert.strictEqual(F.currentSeason(new Date('2026-11-16')), 2026); assert.strictEqual(F.currentSeason(new Date('2027-03-01')), 2026);
});
test('fikstur ve saat cevirimi (Ingiltere saati -> UTC)', () => {
  const f = F.parseFixtures('Div,Date,Time,HomeTeam,AwayTeam,AvgH,AvgD,AvgA\nSP1,21/11/2026,20:00,Sevilla,Getafe,2.1,3.1,3.9\nE0,22/11/2026,,Arsenal,Spurs,,,\n');
  assert.deepStrictEqual(f[0], { div: 'SP1', date: '2026-11-21', time: '20:00', home: 'Sevilla', away: 'Getafe', odds: [2.1, 3.1, 3.9] }); assert.strictEqual(f.length, 2);
  assert.strictEqual(new Date(F.ukToUtc('2026-11-21', '20:00')).toISOString(), '2026-11-21T20:00:00.000Z'); assert.strictEqual(new Date(F.ukToUtc('2026-08-21', '20:00')).toISOString(), '2026-08-21T19:00:00.000Z');
});
test('model: gercek gucleri bulur, olasiliklar tutarli', () => {
  const L = league([2022, 2023, 2024, 2025]), f = F.fit(L.ms);
  assert.ok(f.gamma > 1.15 && f.gamma < 1.6, 'ev avantaji ' + f.gamma);
  const est = L.T.map((t) => f.att[f.ix.get(t)]), mx = L.att.reduce((a, b) => a + b) / L.att.length, corr = (() => { const my = est.reduce((a, b) => a + b) / est.length; let n = 0, dx = 0, dy = 0; est.forEach((v, i) => { n += (v - my) * (L.att[i] - mx); dy += (v - my) ** 2; dx += (L.att[i] - mx) ** 2; }); return n / Math.sqrt(dx * dy); })();
  assert.ok(corr > 0.9, 'hucum gucu korelasyonu ' + corr);
  const M = F.model(L.ms), p = F.forecast(M, L.T[0], L.T[1]);
  assert.ok(Math.abs(p.p[0] + p.p[1] + p.p[2] - 1) < 1e-9 && Math.abs(p.dc[0] + p.dc[1] + p.dc[2] - 1) < 1e-9 && p.over25 > 0 && p.over25 < 1 && p.scores.length === 4 && p.known);
  assert.ok(!F.forecast(M, 'Yeni Takım', L.T[1]).known);
  const im = F.implied([2, 3.5, 4]); assert.ok(Math.abs(im[0] + im[1] + im[2] - 1) < 1e-12 && F.implied([2, null, 4]) === null);
});
test('karne: ileriye donuk testte lig ortalamasindan iyi, piyasadan (gercek olasilik) iyi degil', () => {
  const L = league([2022, 2023, 2024, 2025]), t0 = Date.now(), e = F.evaluate(L.ms);
  console.log('  n', e.n, 'model ll', e.model.logloss.toFixed(4), 'temel', e.base.logloss.toFixed(4), 'piyasa', e.market.logloss.toFixed(4), 'isabet', e.model.acc.toFixed(3), Date.now() - t0, 'ms');
  assert.ok(e.model.logloss < e.base.logloss - 0.01 && e.market.logloss <= e.model.logloss + 0.002 && e.model.rps < e.base.rps && e.n === 306);
  const hi = e.buckets[3]; assert.ok(e.buckets.reduce((a, b) => a + b.n, 0) <= e.n && (hi.n < 15 || hi.rate > 0.6));
  assert.ok(e.buckets.filter((b) => b.bets > 60).every((b) => b.roi < 0.12));                // %5 marjli oranlara karsi buyuk kar cikmamali
  assert.strictEqual(F.evaluate(L.ms.filter((m) => m[8] === 2025)), null);
});
test('indirme: sezonlar, kayitli sezon yeniden indirilmez, fikstur', async () => {
  const L = league([2023, 2024, 2025, 2026]), csv = (y, n) => 'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,AvgH,AvgD,AvgA\n' + L.ms.filter((m) => m[8] === y).slice(0, n).map((m) => { const [yy, mm, dd] = m[0].split('-'); return `T1,${dd}/${mm}/${yy},${m[1]},${m[2]},${m[3]},${m[4]},${m[5]},${m[6]},${m[7]}`; }).join('\n');
  const calls = [], get = async (u) => { calls.push(u); if (u.endsWith('fixtures.csv')) return 'Div,Date,Time,HomeTeam,AwayTeam\nT1,21/11/2026,17:00,Takım0,Takım1\n'; const y = 2000 + Number(u.split('/')[4].slice(0, 2)); if (y === 2023) throw new Error('sunucu 404 yanıtı verdi'); return csv(y, y === 2026 ? 99 : 306); };
  const r = await F.download(get, 'T1', 4, new Date('2026-11-16'));
  assert.deepStrictEqual(r.map((x) => [x.season, x.ok, x.n]), [[2023, false, undefined], [2024, true, 306], [2025, true, 306], [2026, true, 99]]); assert.ok(r.fixtures && calls[0].endsWith('mmz4281/2324/T1.csv'));
  const n0 = calls.length; const r2 = await F.download(get, 'T1', 4, new Date('2026-11-16')); assert.ok(r2[1].cached && r2[2].cached && !r2[3].cached && calls.length === n0 + 3);
  assert.strictEqual(F.matches(F.loadLeague('T1')).length, 711); assert.strictEqual(F.table(F.loadLeague('T1')).length, 18); assert.strictEqual(F.loadFixtures().list.length, 1);
  await assert.rejects(() => F.download(async () => { throw new Error('bağlantı kurulamadı'); }, 'E0', 2));
});
