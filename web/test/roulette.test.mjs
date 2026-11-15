import assert from 'node:assert'; import { test } from 'node:test';
import * as R from '../src/roulette.js'; import { shift, merge, Tracker } from '../src/tracker.js';
const N = null, eq = assert.deepStrictEqual;
test('cark ve renkler', () => { eq(R.WHEEL.length, 37); eq(new Set(R.WHEEL).size, 37); eq([R.color(0), R.color(32), R.color(15), R.color(26)], ['green', 'red', 'black', 'black']); });
test('bot tahmini (masaustu surumuyle ayni ornekler)', () => {
  eq(R.predictNext([]), null);
  eq(R.predictNext([10, 17, 3, 10, 17, 10, 5, 10]), { basedOn: 10, predicted: 17, basis: 'follower', support: 2, baseN: 3 });
  eq(R.predictNext([10, 17, 10, 5, 10]).predicted, 5);
  const p = R.predictNext([4, 4, 9, 21]); eq([p.basis, p.predicted, p.support, p.baseN], ['frequent', 4, 2, 4]);
});
test('komsu bolgeleri', () => {
  const z = R.predictZones([10, 5, 10, 24, 10, 5, 10]);
  eq(z[0].numbers, [23, 10, 5, 24, 16]); eq(z[0].center, 5); eq(z[0].score, 3);
  const flat = z.flatMap((x) => x.numbers); eq(flat.length, 15); eq(new Set(flat).size, 15);
});
test('oturum: yildiz, bolge, geri alma, ice aktarma', () => {
  const s = { spins: [] };
  for (const v of [10, 17, 10]) R.addSpin(s, v);
  eq(R.pending(s).predicted, 17); eq(R.stats(s).n, 2);
  eq(R.addSpin(s, 17).ph, 1); eq(R.stats(s).hits, 1);
  R.undo(s); eq(R.stats(s).hits, 0); eq(R.pending(s).predicted, 17);
  const t = { spins: [] }; for (const v of [10, 5, 10]) R.addSpin(t, v);
  const x = R.addSpin(t, 24); eq([x.p, x.ph, x.zh], [5, 0, 1]);
  const u = { spins: [] }; for (const v of [1, 2, 3]) R.addSpin(u, v, true);
  eq(R.stats(u).n, 0); eq(R.stats(u).total, 3); eq(R.addSpin(u, 9).p, 3);
});
test('kayma (masaustu surumuyle ayni ornekler)', () => {
  eq(shift([5, 12, 0], [5, 12, 0]), 0); eq(shift([5, 12, 0], [17, 5, 12]), 1); eq(shift([17, 5, 12], [17, 17, 5]), 1);
  eq(shift([5, 12, 0], [8, 17, 5]), 2); eq(shift([5, 12, 0], [1, 2, 3]), null);
  eq(shift([5], [5]), 0); eq(shift([5], [9]), 1); eq(shift([5], [N]), null);
  eq(shift([17, 5, 12, 0], [17, N, 5, 12]), 1); eq(shift([17, 5, 12, 0], [17, 5, N, 0]), 0); eq(shift([17, 5, 12, 0], [N, 17, 5, 12]), null);
  eq(merge([17, 5, 12, 0], [8, N, 5, 12], 1), [8, 17, 5, 12]);
});
test('takip: tekrar eden sayi, okunamayan kare, baslangic sayilari kaydedilmez', () => {
  const tr = new Tracker(), seq = [[5, 12, 0, 33], [17, 5, 12, 0], [17, 17, 5, 12], [8, 17, 17, 5], [26, 8, 17, 17]], got = [];
  for (const f of seq) for (const r of [f, f, f, [N, N, N, N]]) got.push(...tr.feed(r).fresh);
  eq(got, [17, 17, 8, 26]);
  const t2 = new Tracker([22, 1, 27, 15, 6]); t2.feed([8, 22, 1, 27, 15]); eq(t2.feed([8, 22, 1, 27, 15]).fresh, [8]);
});
