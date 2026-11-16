// Okuma bolgesinin hucrelere bolunmesi.
// Tek satirlik seritlerde en yeni sayi cogu oyunda digerlerinden genis bir kutuda durur; "first" bu kutunun
// digerlerine gore genislik oranidir (1 = hepsi esit). Cok satirli tablolarda hucreler esittir.
import { readCell, sub } from './digits.js';
const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };

/** Bolgeye gore hucre dikdortgenleri, satir satir (soldan saga, yukaridan asagi). */
export function cellRects(c) {
  const xs = [0], ys = [], out = [], r = c.rows === 1 && c.cols > 1 ? (c.first || 1) : 1, u = c.w / (c.cols - 1 + r);
  for (let i = 1; i <= c.cols; i++) xs.push(pyRound(c.newest === 'last' ? Math.min(i, c.cols - 1) * u + (i === c.cols ? r * u : 0) : r * u + (i - 1) * u));
  for (let i = 0; i <= c.rows; i++) ys.push(pyRound(i * c.h / c.rows));
  for (let y = 0; y < c.rows; y++) for (let k = 0; k < c.cols; k++) out.push({ x0: xs[k], y0: ys[y], x1: xs[k + 1], y1: ys[y + 1] });
  return out;
}
/** En yeni basta olacak sekilde ilk 'limit' hucrenin dikdortgenleri ve hepsini kapsayan kutu. */
export function newestRects(c, limit) {
  let rects = cellRects(c); if (c.newest === 'last') rects.reverse();
  rects = rects.slice(0, limit);
  return { rects, x0: Math.min(...rects.map((r) => r.x0)), y0: Math.min(...rects.map((r) => r.y0)), x1: Math.max(...rects.map((r) => r.x1)), y1: Math.max(...rects.map((r) => r.y1)) };
}
/** img: newestRects kutusunun goruntusu. Donus: sayilar (okunamayan null), en yeni basta. */
export function readRects(img, box) {
  return box.rects.map((r) => { const v = readCell(sub(img, r.x0 - box.x0, r.y0 - box.y0, r.x1 - box.x0, r.y1 - box.y0))[0]; return v === null ? null : Number(v); });
}

/**
 * Tek siralik seridi dikeyde hizalar. band: ekranin y0 satirindan baslayan, c.l..c.l+c.w sutunlarini kapsayan goruntu.
 * Farkli ust kenar ve yukseklikler denenir; en yeni 'probe' hucrenin en cogunun okundugu konumlarin ortasi secilir.
 * scale: ekran genisligi / 1080 (yukseklik adaylari buna gore olceklenir). Donus: { t, h, score, n } ya da null.
 */
export function alignStrip(band, y0, c, scale = 1, probe = 4) {
  const hs = [50, 60, 42].map((v) => Math.round(v * scale)), step = Math.max(2, Math.round(4 * scale)), n = Math.min(probe, c.cols), full = n + 0.5;
  let best = null;
  for (const h of hs) {
    const all = [];
    for (let t = y0; t + h <= y0 + band.h; t += step) {
      const box = newestRects({ ...c, t, h }, n), vals = readRects(sub(band, box.x0, t - y0 + box.y0, box.x1, t - y0 + box.y1), box);
      all.push({ t, h, n, score: vals.filter((v) => v !== null).length + (vals[0] !== null ? 0.5 : 0) });
    }
    if (!all.length) continue;
    const top = Math.max(...all.map((x) => x.score)), ok = all.filter((x) => x.score === top), mid = ok[Math.floor(ok.length / 2)];
    if (!best || top > best.score) best = mid;
    if (top === full) break;                       // bu yukseklikte hepsi okundu: digerlerini denemeye gerek yok
  }
  return best && best.score >= 1.5 ? best : null;
}
