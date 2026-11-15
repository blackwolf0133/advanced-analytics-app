// Ekrandaki rulet sayilarini (0-36) okuyan tanima motoru. Masaustu surumundeki backend/digits.py'nin birebir karsiligidir.
// Goruntuler { w, h, d } bicimindedir; d: Uint8Array, piksel basina 3 bayt (RGB).
import { SHAPES, B64 } from './model.js';
import { resize, LANCZOS, BILINEAR } from './resample.js';

const SIDE = 28, BOX = 22, CELL_H = 64, JUNK = 10;
export const MIN_CONF = 0.8;
const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };

let layers = null;
function weights() {
  if (layers) return layers;
  const bin = typeof atob === 'function' ? Uint8Array.from(atob(B64), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(B64, 'base64'));
  const f = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
  let o = 0; layers = [];
  for (const [i, j] of SHAPES) { layers.push({ i, j, w: f.subarray(o, o + i * j), b: f.subarray(o + i * j, o + i * j + j) }); o += i * j + j; }
  return layers;
}
/** x: Float32Array(784) -> Float64Array(11) olasilik */
export function classify(x) {
  const L = weights();
  for (let n = 0; n < L.length; n++) {
    const { i, j, w, b } = L[n], y = new Float64Array(j);
    for (let c = 0; c < j; c++) y[c] = b[c];
    for (let r = 0; r < i; r++) { const v = x[r]; if (v === 0) continue; const row = r * j; for (let c = 0; c < j; c++) y[c] += v * w[row + c]; }
    if (n < L.length - 1) for (let c = 0; c < j; c++) if (y[c] < 0) y[c] = 0;
    x = y;
  }
  let m = -Infinity; for (const v of x) if (v > m) m = v;
  let s = 0; const e = x.map((v) => { const t = Math.exp(v - m); s += t; return t; });
  return e.map((v) => v / s);
}
/** Ikili parcayi (m: Uint8Array 0/1) en-boy orani korunarak 28x28 kareye ortalar. */
export function normalize(g) {
  const s = BOX / Math.max(g.h, g.w), nh = Math.max(1, pyRound(g.h * s)), nw = Math.max(1, pyRound(g.w * s));
  const src = new Uint8Array(g.w * g.h); for (let i = 0; i < src.length; i++) src[i] = g.m[i] ? 255 : 0;
  const im = resize(src, g.w, g.h, 1, nw, nh, BILINEAR), out = new Float32Array(SIDE * SIDE);
  const y0 = Math.floor((SIDE - nh) / 2), x0 = Math.floor((SIDE - nw) / 2);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) out[(y0 + y) * SIDE + x0 + x] = im[y * nw + x] / 255;
  return out;
}
function kmeans(px, n, k, iters = 8) {
  const cent = new Float64Array(k * 3), d = new Float64Array(n), ch = [[], [], []];
  for (let c = 0; c < 3; c++) {
    const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = px[i * 3 + c]; a.sort();
    cent[c] = n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  const dist = (i, c) => { const a = px[i * 3] - cent[c * 3], b = px[i * 3 + 1] - cent[c * 3 + 1], e = px[i * 3 + 2] - cent[c * 3 + 2]; return a * a + b * b + e * e; };
  for (let i = 0; i < n; i++) d[i] = dist(i, 0);
  for (let c = 1; c < k; c++) {
    let best = 0; for (let i = 1; i < n; i++) if (d[i] > d[best]) best = i;
    cent.set([px[best * 3], px[best * 3 + 1], px[best * 3 + 2]], c * 3);
    for (let i = 0; i < n; i++) { const v = dist(i, c); if (v < d[i]) d[i] = v; }
  }
  const lab = new Uint8Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = new Float64Array(k * 3), cnt = new Uint32Array(k);
    for (let i = 0; i < n; i++) {
      let b = 0, bv = dist(i, 0);
      for (let c = 1; c < k; c++) { const v = dist(i, c); if (v < bv) { bv = v; b = c; } }
      lab[i] = b; cnt[b]++; sum[b * 3] += px[i * 3]; sum[b * 3 + 1] += px[i * 3 + 1]; sum[b * 3 + 2] += px[i * 3 + 2];
    }
    for (let c = 0; c < k; c++) if (cnt[c]) for (let j = 0; j < 3; j++) cent[c * 3 + j] = sum[c * 3 + j] / cnt[c];
  }
  return lab;
}
function candidates(cell) {
  const n = cell.w * cell.h, masks = [], seen = new Set();
  for (const k of [2, 3, 4]) {
    const lab = kmeans(cell.d, n, k);
    for (let i = 0; i < k; i++) for (const inv of (k === 3 ? [false, true] : [false])) {
      const m = new Uint8Array(n); let cnt = 0;
      for (let p = 0; p < n; p++) if ((lab[p] === i) !== inv) { m[p] = 1; cnt++; }
      const frac = cnt / n; if (frac < 0.02 || frac > 0.6) continue;
      const key = String.fromCharCode.apply(null, packBits(m)); if (seen.has(key)) continue;
      seen.add(key); masks.push(m);
    }
  }
  return masks;
}
function packBits(m) { const o = new Uint8Array(Math.ceil(m.length / 8)); for (let i = 0; i < m.length; i++) if (m[i]) o[i >> 3] |= 1 << (i & 7); return o; }

/** 8 komsuluklu bilesenler; satir satir tarama sirasinda numaralanir. Donus: [{y0,y1,x0,x1,pix:[indeks]}] */
export function components(m, w, h) {
  const lab = new Int32Array(w * h), out = [], stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    const id = out.length + 1, c = { y0: h, y1: 0, x0: w, x1: 0, pix: [] };
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop(), y = (p / w) | 0, x = p - y * w;
      c.pix.push(p); if (y < c.y0) c.y0 = y; if (y + 1 > c.y1) c.y1 = y + 1; if (x < c.x0) c.x0 = x; if (x + 1 > c.x1) c.x1 = x + 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
        const q = yy * w + xx; if (m[q] && !lab[q]) { lab[q] = id; stack.push(q); }
      }
    }
    out.push(c);
  }
  return out;
}
const crop = (c, w) => { const gw = c.x1 - c.x0, gh = c.y1 - c.y0, m = new Uint8Array(gw * gh); for (const p of c.pix) { const y = (p / w) | 0; m[(y - c.y0) * gw + (p - y * w - c.x0)] = 1; } return { w: gw, h: gh, m }; };
function trim(g, xa, xb) {   // g'nin [xa, xb) sutunlarindan dolu kismi keser
  let y0 = g.h, y1 = -1, x0 = g.w, x1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = xa; x < xb; x++) if (g.m[y * g.w + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = g.m[(y + y0) * g.w + x + x0];
  return { w, h, m };
}
/** Kenara degmeyen, yeterince buyuk parcalar (soldan saga); 1-2 rakam degilse null. */
export function glyphs(mask, w, h) {
  const comps = components(mask, w, h);
  if (!comps.length || comps.length > 40) return null;
  let parts = []; const edge = [], small = [];
  for (const c of comps) {
    const gh = c.y1 - c.y0, gw = c.x1 - c.x0;
    if (c.y0 === 0 || c.x0 === 0 || c.y1 === h || c.x1 === w) { edge.push([c.y0, c.y1, gh, gw]); continue; }
    if (gh < 0.22 * h || gh * gw < 20) { small.push([c.y0, c.y1, c.x0, c.x1]); continue; }
    parts.push({ x0: c.x0, y0: c.y0, gh, gw, c });
  }
  if (!parts.length) return null;
  const top = Math.max(...parts.map((p) => p.gh));
  for (const p of parts) if (p.gh < 0.7 * top) small.push([p.y0, p.y0 + p.gh, p.x0, p.x0 + p.gw]);
  const kept = parts.filter((p) => p.gh >= 0.7 * top);
  const kx0 = Math.min(...kept.map((p) => p.x0)), kx1 = Math.max(...kept.map((p) => p.x0 + p.gw));
  const ky0 = Math.min(...kept.map((p) => p.y0)), ky1 = Math.max(...kept.map((p) => p.y0 + p.gh));
  for (const [a, b, x0, x1] of small)   // rakamlarin yaninda ayni hizada kucuk parca: parcalanmis ikinci rakam olabilir
    if ((x1 <= kx0 + 1 || x0 >= kx1 - 1) && Math.min(b, ky1) - Math.max(a, ky0) >= 0.5 * (b - a) && (b - a) * (x1 - x0) >= 0.06 * top * top) return null;
  const y0 = Math.min(...parts.map((p) => p.y0)), y1 = Math.max(...parts.map((p) => p.y0 + p.gh));
  for (const [a, b, gh, gw] of edge)    // kenara degen rakam boyunda parca: sayinin bir rakami kutu disinda kalmis (19 yerine 9 okunmasin)
    if (0.6 * top <= gh && gh <= 1.4 * top && gw <= 1.3 * gh && Math.min(b, y1) - Math.max(a, y0) >= 0.6 * Math.min(gh, top)) return null;
  kept.sort((p, q) => p.x0 - q.x0);
  const out = [];
  for (const p of kept) {
    const g = crop(p.c, w);
    if (p.gw > 1.15 * p.gh) {           // birbirine degen iki rakam: ortaya yakin en bos sutundan bol
      const a = Math.floor(p.gw * 0.3), b = Math.floor(p.gw * 0.7); let cut = a, bv = Infinity;
      for (let x = a; x < b; x++) { let s = 0; for (let y = 0; y < g.h; y++) s += g.m[y * g.w + x]; if (s < bv) { bv = s; cut = x; } }
      const l = trim(g, 0, cut), r = trim(g, cut, g.w); if (!l || !r) return null;
      out.push(l, r);
    } else out.push(g);
  }
  return out.length >= 1 && out.length <= 2 ? out : null;
}
/** Tek hucredeki sayiyi okur. Donus: [sayi (string) ya da null, guven 0..1] */
export function readCell(cell) {
  if (cell.h < 6 || cell.w < 6) return [null, 0];
  const w = Math.max(8, pyRound(cell.w * CELL_H / cell.h));
  const big = { w, h: CELL_H, d: resize(cell.d, cell.w, cell.h, 3, w, CELL_H, LANCZOS) };
  const found = new Map();
  for (const m of candidates(big)) {
    const gl = glyphs(m, big.w, big.h); if (!gl) continue;
    let txt = '', conf = 1, junk = false;
    for (const g of gl) {
      const p = classify(normalize(g)); let d = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[d]) d = i;
      if (d === JUNK) { junk = true; break; }
      txt += d; if (p[d] < conf) conf = p[d];
    }
    if (junk || (txt.length === 2 && txt[0] === '0') || Number(txt) > 36) continue;
    if (conf > (found.get(txt) ?? 0)) found.set(txt, conf); else if (!found.has(txt)) found.set(txt, conf);
  }
  if (!found.size) return [null, 0];
  let best = null; for (const [t, c] of found) if (best === null || c > found.get(best)) best = t;
  if (best.length === 1) {              // tek rakam, guvenilir bir iki basamaklinin parcasiysa iki basamakli gecerlidir
    let two = null; for (const [t, c] of found) if (t.length === 2 && t.includes(best) && c >= MIN_CONF && (two === null || c > found.get(two))) two = t;
    if (two) best = two;
  }
  const c = found.get(best);
  return c >= MIN_CONF ? [best, c] : [null, c];
}
export function sub(img, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, d = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) d.set(img.d.subarray(((y + y0) * img.w + x0) * 3, ((y + y0) * img.w + x1) * 3), y * w * 3);
  return { w, h, d };
}
/** Bolgeyi satir satir (soldan saga, yukaridan asagi) hucrelere boler. */
export function cells(img, rows, cols) {
  const ys = [], xs = [], out = [];
  for (let i = 0; i <= rows; i++) ys.push(pyRound(i * img.h / rows));
  for (let i = 0; i <= cols; i++) xs.push(pyRound(i * img.w / cols));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(sub(img, xs[c], ys[r], xs[c + 1], ys[r + 1]));
  return out;
}
/** RGBA bayt dizisinden RGB goruntu. */
export function fromRGBA(buf, w, h) { const d = new Uint8Array(w * h * 3); for (let i = 0, j = 0; i < w * h; i++, j += 4) { d[i * 3] = buf[j]; d[i * 3 + 1] = buf[j + 1]; d[i * 3 + 2] = buf[j + 2]; } return { w, h, d }; }
