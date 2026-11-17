import assert from 'node:assert'; import { test } from 'node:test';
import { mergeHistory, values } from '../src/roulette.js';
let seed = 9; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * 37); };
const seq = (n) => Array.from({ length: n }, rnd);
const sess = (arr) => ({ spins: arr.map((v) => ({ v })) });
test('gecmis: bos oturuma hepsi eklenir (okunamayanlar atlanir)', () => {
  const s = sess([]), r = mergeHistory(s, [5, null, 7, 9]);
  assert.deepStrictEqual(values(s), [9, 7, 5]); assert.strictEqual(r.skipped, 1);
});
test('gecmis: ust serit (14) + SON 500 tablosu (13. sayidan baslar, 2 ortak) dogru birlesir', () => {
  const strip = [21, 16, 35, 2, 1, 26, 31, 12, 36, 3, 3, 11, 23, 29], table = [23, 29, 33, 26, 5, 26, 35, 10, 18, 18, 10, 19, 25, 21, 29, 33];
  const s = sess(strip.slice().reverse()), r = mergeHistory(s, table);
  assert.strictEqual(r.old, 14); assert.strictEqual(r.fresh, 0);
  assert.deepStrictEqual(values(s), [...strip, ...table.slice(2)].reverse());
});
test('gecmis: tablo asagi kaydirilip ikinci sayfa eklenir; tekrar eklemek bir sey degistirmez', () => {
  const all = seq(60), s = sess(all.slice(0, 10).reverse());
  mergeHistory(s, all.slice(5, 30)); mergeHistory(s, all.slice(22, 50)); const r = mergeHistory(s, all.slice(22, 50));
  assert.deepStrictEqual(values(s), all.slice(0, 50).reverse()); assert.strictEqual(r.old + r.fresh, 0);
});
test('gecmis: tek yanlis okunan hucre hizalamayi bozmaz; eslesme yoksa eklenmez, zorlanirsa basa eklenir', () => {
  const all = seq(40), s = sess(all.slice(0, 15).reverse()), page = all.slice(5, 35); page[3] = (page[3] + 1) % 37;
  mergeHistory(s, page); assert.deepStrictEqual(values(s).slice(0, 20), all.slice(15, 35).reverse());
  const t = sess([1, 2, 3]); assert.deepStrictEqual(mergeHistory(t, [30, 31, 32]), { error: 'nomatch' }); assert.deepStrictEqual(values(t), [1, 2, 3]);
  mergeHistory(t, [30, 31, 32], true); assert.deepStrictEqual(values(t), [32, 31, 30, 1, 2, 3]);
});
test('gecmis: yeni gelenler (okuma durmusken) sona eklenir', () => {
  const s = sess([10, 11, 12, 13]); const r = mergeHistory(s, [15, 14, 13, 12, 11]);
  assert.deepStrictEqual(values(s), [10, 11, 12, 13, 14, 15]); assert.strictEqual(r.fresh, 2);
});
