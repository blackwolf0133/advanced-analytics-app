import fs from 'node:fs'; import assert from 'node:assert'; import { test } from 'node:test'; import { PNG } from 'pngjs';
import { readCell, cells, sub, fromRGBA } from '../src/digits.js';
const load = (f) => { const p = PNG.sync.read(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url))); return fromRGBA(p.data, p.width, p.height); };
export const GRID = [[22, 1, 27, 15, 6, 1, 0, 8, 17, 12], [19, 36, 24, 28, 1, 2, 28, 8, 20, 4], [6, 20, 26, 2, 13, 9, 21, 20, 10, 14], [1, 13, 3, 35, 32, 22, 33, 33, 10, 23], [27, 14, 36, 32, 6, 18, 18, 17, 36, 28],
  [22, 31, 26, 19, 27, 5, 19, 14, 7, 7], [26, 21, 31, 32, 14, 14, 29, 26, 16, 29], [29, 20, 4, 27, 34, 24, 4, 11, 17, 20], [23, 2, 6, 7, 21, 10, 26, 30, 29, 11]].flat().map(String);
test('gercek oyun ekranindaki Sonuclar tablosu eksiksiz okunur (9x10)', () => {
  const t0 = Date.now(), got = cells(load('sonuclar_tablosu.png'), 9, 10).map((c) => readCell(c)[0]);
  assert.deepStrictEqual(got, GRID); console.log('  90 hucre', Date.now() - t0, 'ms');
});
test('kutu birkac piksel kaydirilsa da yanlis okuma olmaz', () => {
  const img = load('oyun_ekrani.png'); let ok = 0, wrong = 0, none = 0, s = 7;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s / 2147483648) * 15 - 7 | 0; };
  for (let k = 0; k < 12; k++) {
    const g = sub(img, 1270 + rnd(), 200 + rnd(), 1590 + rnd(), 522 + rnd());
    cells(g, 9, 10).forEach((c, i) => { const v = readCell(c)[0]; if (v === GRID[i]) ok++; else if (v === null) none++; else wrong++; });
  }
  console.log('  dogru', ok, 'yanlis', wrong, 'okunamadi', none);
  assert.ok(wrong <= 2 && ok / (ok + wrong + none) > 0.93);
});
