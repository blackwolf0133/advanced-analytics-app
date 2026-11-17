import fs from 'node:fs'; import assert from 'node:assert'; import { test } from 'node:test'; import { PNG } from 'pngjs';
import { fromRGBA, sub } from '../src/digits.js'; import { cellRects, newestRects, readRects } from '../src/geom.js';
const p = PNG.sync.read(fs.readFileSync(new URL('./fixtures/lightning_telefon.png', import.meta.url))), img = fromRGBA(p.data, p.width, p.height);
const WANT = [23, 30, 2, 23, 28, 10, 14, 35, 27, 4, 7, 34, 20, 1];
const read = (c, n) => { const b = newestRects(c, n); return readRects(sub(img, c.l + b.x0, c.t + b.y0, c.l + b.x1, c.t + b.y1), b); };
test('hucre duzeni: genis ilk hucre, esit tablo, en yeni sonda', () => {
  assert.deepStrictEqual(cellRects({ w: 100, h: 10, rows: 1, cols: 4, first: 2, newest: 'first' }).map((r) => [r.x0, r.x1]), [[0, 40], [40, 60], [60, 80], [80, 100]]);
  assert.deepStrictEqual(cellRects({ w: 100, h: 10, rows: 1, cols: 4, first: 2, newest: 'last' }).map((r) => [r.x0, r.x1]), [[0, 20], [20, 40], [40, 60], [60, 100]]);
  assert.deepStrictEqual(cellRects({ w: 100, h: 20, rows: 2, cols: 2, first: 2, newest: 'first' }).map((r) => [r.x0, r.x1, r.y0, r.y1]), [[0, 50, 0, 10], [50, 100, 0, 10], [0, 50, 10, 20], [50, 100, 10, 20]]);
});
test('gercek telefon ekrani (Lightning Rulet): ustteki tek sira, genis ilk kutu ve carpanli kutular okunur', () => {
  const got = read({ l: 0, t: 276, w: 1080, h: 50, rows: 1, cols: 14, first: 1.6, newest: 'first' }, 14);
  console.log('  ', got.join(' ')); assert.deepStrictEqual(got.slice(0, 13), WANT.slice(0, 13));     // son hucre ekran kenarinda yarim
  assert.deepStrictEqual(read({ l: 0, t: 276, w: 1080, h: 50, rows: 1, cols: 14, first: 1.6, newest: 'first' }, 5), WANT.slice(0, 5));
});
test('parmakla cizilen kutu biraz kaysa da yanlis okuma olmaz', () => {
  let s = 5, ok = 0, wrong = 0, none = 0; const rnd = (k) => { s = (s * 1103515245 + 12345) % 2147483648; return Math.round((s / 2147483648 - 0.5) * 2 * k); };
  for (let i = 0; i < 40; i++) { const c = { l: Math.max(0, rnd(3)), t: 276 + rnd(5), w: 1080 - Math.abs(rnd(4)), h: 50 + rnd(6), rows: 1, cols: 14, first: 1.6 + rnd(1) * 0.1, newest: 'first' }; c.w = Math.min(c.w, 1080 - c.l);
    read(c, 6).forEach((v, k) => { if (v === WANT[k]) ok++; else if (v === null) none++; else wrong++; }); }
  console.log('  dogru', ok, 'yanlis', wrong, 'okunamadi', none); assert.ok(wrong === 0 && ok / 240 > 0.9);
});
import { alignStrip } from '../src/geom.js';
test('otomatik hizalama: seride kabaca dokunmak yeter (iki gercek telefon ekrani)', () => {
  const p2 = PNG.sync.read(fs.readFileSync(new URL('./fixtures/lightning_gri.png', import.meta.url))), img2 = fromRGBA(p2.data, p2.width, p2.height);
  for (const [im, center, want, first] of [[img, 301, WANT, 1.6], [img2, 85, [4, 31, 27, 6, 22, 17, 13, 21, 21, 27, 29, 35, 19, 13], 1.6]]) for (const off of [-22, -8, 0, 12, 24]) {
    const tap = center + off, y0 = Math.max(0, tap - 65), band = sub(im, 0, y0, im.w, Math.min(im.h, tap + 65)), c = { l: 0, w: im.w, t: tap - 25, h: 50, rows: 1, cols: 14, first, newest: 'first' };
    const t0 = Date.now(), a = alignStrip(band, y0, c); assert.ok(a && a.score === 4.5, `dokunma ${tap}: ${JSON.stringify(a)}`);
    const cc = { ...c, t: a.t, h: a.h }, b = newestRects(cc, 13), got = readRects(sub(im, b.x0, cc.t + b.y0, b.x1, cc.t + b.y1), b);
    assert.deepStrictEqual(got, want.slice(0, 13), `dokunma ${tap} -> t=${a.t} h=${a.h}`); if (off === 0) console.log('  hizalama', Date.now() - t0, 'ms, t =', a.t, 'h =', a.h);
  }
});
import { fitStrip } from '../src/geom.js';
import { shift, Tracker } from '../src/tracker.js';
test('kutu duzeni goruntuden olculur: ust serit (14 sayi, kenar bosluksuz) ve istatistik paneli (12 sayi, kenar boslukli)', () => {
  const cases = [['rulet_panel_a', [21, 16, 35, 2, 1, 26, 31, 12, 36, 3, 3, 11, 23, 29]], ['rulet_panel_b', [35, 2, 1, 26, 31, 12, 36, 3, 3, 11, 23, 29, 33, 26]]];
  for (const [f, seq] of cases) {
    const p = PNG.sync.read(fs.readFileSync(new URL(`./fixtures/${f}.png`, import.meta.url))), im = fromRGBA(p.data, p.width, p.height);
    for (const [t, cols] of [[257, 14], [725, 12]]) {
      const c = fitStrip(sub(im, 0, t, im.w, t + 50)); assert.ok(c, `${f} ${t}`); assert.strictEqual(c.cols, cols, `${f} ${t}: ${JSON.stringify(c)}`);
      const cc = { ...c, t, h: 50, rows: 1, newest: 'first' }, b = newestRects(cc, c.cols);
      assert.deepStrictEqual(readRects(sub(im, cc.l + b.x0, t + b.y0, cc.l + b.x1, t + b.y1), b), seq.slice(0, cols), `${f} ${t}`);
    }
  }
});
test('takip: tek hucre yanlis okununca yeni sayi kacmaz, iki uyumsuzlukta kaydirma yapilmaz', () => {
  // gercek ekrandaki olay: 35 geldi ama 5. hucre 31 yerine 12 okundu
  assert.strictEqual(shift([2, 1, 26, 31, 12], [35, 2, 1, 26, 12]), 1);
  assert.strictEqual(shift([2, 1, 26, 31, 12], [35, 2, 1, null, 12]), null);   // 2 eslesme + 1 hata: emin degil, sonraki okumayi bekler
  assert.strictEqual(shift([2, 1, 26, 31, 12], [35, 2, 9, 26, 31]), 1);
  assert.strictEqual(shift([2, 1, 26, 31, 12], [35, 7, 9, 26, 31]), null);
  assert.strictEqual(shift([3, 3, 11, 23, 29], [3, 3, 11, 23, 29]), 0);
  assert.strictEqual(shift([3, 11, 23, 29, 33], [3, 3, 11, 23, 29]), 1);
  const tr = new Tracker([2, 1, 26, 31, 12]); tr.feed([35, 2, 1, 26, 12]); const r = tr.feed([35, 2, 1, 26, 12]);
  assert.deepStrictEqual(r.fresh, [35]);
});
