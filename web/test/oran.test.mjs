import test from 'node:test'; import assert from 'node:assert';
import { fair, lambdaFromLine, nameSim, matchEvents, marketProbs, parseIddaa } from '../src/oran.js';
import { bestCombo } from '../../tools/gunluk.mjs';
test('marj temizleme: toplam 1, uzak ihtimal kucultulur', () => {
  const f = fair([4.45, 1.9, 2.8, 7.76]); assert.ok(Math.abs(f.reduce((a, b) => a + b) - 1) < 1e-9); assert.ok(f[3] < (1 / 7.76) / (1 / 4.45 + 1 / 1.9 + 1 / 2.8 + 1 / 7.76));
  const g = fair([1.9, 1.9]); assert.ok(Math.abs(g[0] - 0.5) < 1e-9);
});
test('alt/ust cizgisinden gol ortalamasi', () => { const l = lambdaFromLine('2.5', 0.5); assert.ok(l > 2.6 && l < 2.7, l); });
test('takim adi eslestirme', () => {
  assert.ok(nameSim('Orlando Pirates', 'Orlando Pirates') === 1 && nameSim('Golden Arrows', 'Gold. Arrow') >= 0.5 && nameSim('Atlético Bucaramanga', 'CA Bucaramanga') >= 0.5);
  assert.ok(nameSim('Real Madrid', 'Real Madrid U19') < 0.6 && nameSim('Arsenal', 'Chelsea') < 0.3);
  const m = matchEvents([{ id: 'a', t: '2026-11-24T20:00:00Z', h: 'Portsmouth', a: 'West Ham United' }, { id: 'b', t: '2026-11-24T20:00:00Z', h: 'Norwich City', a: 'Queens Park Rangers' }],
    [{ io: 1, d: '2026-11-24T20:00:00.000Z', h: 'Norwich City', a: 'Queens Park Rangers' }, { io: 2, d: '2026-11-24T20:00:00.000Z', h: 'Portsmouth', a: 'West Ham' }]);
  assert.strictEqual(m.get('a').io, 2); assert.strictEqual(m.get('b').io, 1);
});
test('bulten ayristirma ve pazar olasiliklari; sunulmayan secenek (1.00) atlanir', () => {
  const e = parseIddaa({ i: 9, d: 1795550400, hn: 'A', an: 'B', mbc: 2, m: [{ t: 1, st: 1, s: 1, o: [{ n: '1', odd: 1.0 }, { n: '0', odd: 9 }, { n: '2', odd: 14 }] }, { t: 2, st: 4, s: 1, mbc: 1, o: [{ n: '0-1 gol', odd: 4.45 }, { n: '2-3 gol', odd: 1.9 }, { n: '4-5 gol', odd: 2.8 }, { n: '6+ gol', odd: 7.76 }] }, { t: 2, st: 101, s: 1, sov: '2.5', o: [{ n: 'Alt', odd: 2.09 }, { n: 'Üst', odd: 1.38 }] }] });
  assert.ok(!e.od.ms && e.od.tg && e.od.ou['2.5'] && e.mb.tg === 1 && e.mb['ou2.5'] === 2);
  const P = marketProbs(e.od); assert.ok(P.G6 > 0.07 && P.G6 < 0.1 && P['U2.5'] > 0.6);
});
test('gunluk kombine: toplam oran 1,35-1,45, MBS kurali, farkli maclar', () => {
  const L = [{ id: 'a', odd: 1.2, p: 0.8, mbs: 1 }, { id: 'a', odd: 1.18, p: 0.83, mbs: 1 }, { id: 'b', odd: 1.17, p: 0.82, mbs: 3 }, { id: 'c', odd: 1.19, p: 0.81, mbs: 2 }, { id: 'd', odd: 1.12, p: 0.86, mbs: 3 }];
  const b = bestCombo(L); assert.ok(b && b.odds >= 1.35 && b.odds <= 1.45 && new Set(b.legs.map((l) => l.id)).size === b.legs.length && Math.max(...b.legs.map((l) => l.mbs)) <= b.legs.length, JSON.stringify(b));
});
