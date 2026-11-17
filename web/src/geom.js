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
      const box = newestRects({ ...c, t, h }, n), L = c.l || 0, vals = readRects(sub(band, L + box.x0, t - y0 + box.y0, L + box.x1, t - y0 + box.y1), box);
      all.push({ t, h, n, score: vals.filter((v) => v !== null).length + (vals[0] !== null ? 0.5 : 0) });
    }
    if (!all.length) continue;
    const top = Math.max(...all.map((x) => x.score)), ok = all.filter((x) => x.score === top), mid = ok[Math.floor(ok.length / 2)];
    if (!best || top > best.score) best = mid;
    if (top === full) break;                       // bu yukseklikte hepsi okundu: digerlerini denemeye gerek yok
  }
  return best && best.score >= 1.5 ? best : null;
}

/* ---------- tek siralik seridin yatay olcusu ---------- */
/** Her sutunun "yazi" olcusu: o sutundaki parlaklik (en parlak kanal) degisimi. Duz arka planda dusuk, rakamlarda yuksek. */
export function stripProfile(img) {
  const out = new Float32Array(img.w);
  for (let x = 0; x < img.w; x++) {
    let s = 0, s2 = 0;
    for (let y = 0; y < img.h; y++) { const i = (y * img.w + x) * 3, v = Math.max(img.d[i], img.d[i + 1], img.d[i + 2]); s += v; s2 += v * v; }
    const m = s / img.h; out[x] = Math.sqrt(Math.max(0, s2 / img.h - m * m));
  }
  return out;
}
/** Sayilar arasi adim (piksel): seridin sag tarafindaki profilin ozilisimi (autocorrelation) en yuksek gecikme. */
export function stripPitch(prof) {
  const W = prof.length, a = Math.round(W * 0.2), seg = Array.from(prof.slice(a)), m = seg.reduce((s, v) => s + v, 0) / seg.length, z = seg.map((v) => v - m);
  let best = null, bv = -Infinity;
  const ac = (L) => { let s = 0; for (let i = 0; i + L < z.length; i++) s += z[i] * z[i + L]; return s / (z.length - L); };
  for (let L = Math.round(W * 0.035); L <= Math.round(W * 0.13); L++) { const v = ac(L); if (v > bv) { bv = v; best = L; } }
  // alt katlari da yokla: gercek adimin iki katinda da tepe olur
  for (const d of [3, 2]) { const L = Math.round(best / d); if (L >= W * 0.035 && ac(L) > 0.6 * bv) { best = L; break; } }
  // ince ayar: kesirli adim (rakam kutulari tam piksel degil)
  let fine = best, fv = -Infinity;
  for (let p = best - 1.5; p <= best + 1.5; p += 0.25) { let s = 0, n = 0; for (let i = 0; i + p * 4 < z.length; i++) { const j = i + p * 4, k = Math.floor(j), f = j - k; s += z[i] * (z[k] * (1 - f) + (z[k + 1] ?? 0) * f); n++; } s /= n; if (s > fv) { fv = s; fine = p; } }
  return fine;
}
/**
 * Seridin kutu duzenini goruntuden bulur. row: seridin satirlari, tam ekran genisliginde (x = 0..W).
 * Donus: { l, w, cols, first } (en yeni solda) ya da null. Ekranin kenarinda bosluk olsa da, kac sayi sigdigi bilinmese de calisir.
 */
export function fitStrip(row) {
  const W = row.w, prof = stripProfile(row); let P = stripPitch(prof);
  // sayilar arasi bosluklar: P adimli sinirlarin profilde en dusuk kaldigi kayma
  const sm = new Float32Array(W), r = Math.max(1, Math.round(P * 0.06));
  for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let d = -r; d <= r; d++) if (x + d >= 0 && x + d < W) { s += prof[x + d]; n++; } sm[x] = s / n; }
  // adim ve kayma birlikte: tum sinirlar rakamlarin arasindaki bosluga dussun (adimdaki kucuk hata saga dogru birikir)
  let phi = 0, pv = Infinity, P0 = P;
  for (let p = P0 - 3; p <= P0 + 3; p += 0.25) for (let f = 0; f < p; f += 0.5) {
    let s = 0, n = 0; for (let b = f; b < W; b += p) if (b >= W * 0.2) { s += sm[Math.round(b)] ?? 0; n++; } s /= n;
    if (s < pv - 1e-6) { pv = s; phi = f; P = p; }
  }
  const bounds = []; for (let b = phi; b < W; b += P) bounds.push(b);
  const reads = (x0, x1) => readCell(sub(row, Math.round(x0), 0, Math.round(x1), row.h))[0];
  let best = null;
  for (let l = 0; l <= W * 0.15; l += Math.max(2, Math.round(W * 0.006))) {
    const b1 = bounds.find((b) => b - l >= 1.05 * P); if (b1 === undefined || b1 - l > 2.4 * P) continue;
    const cols = 1 + Math.floor((W - b1 + 1) / P); if (cols < 6) continue;
    const v0 = reads(l, b1); if (v0 === null) continue;
    const c = { l, w: Math.round(b1 - l + (cols - 1) * P), cols, first: (b1 - l) / P, b1, v0 };
    if (!best || best.b1 !== b1) { if (best && best.ok) continue; best = { ...c, ls: [l] }; } else best.ls.push(l);
    best.ok = true;
  }
  if (!best) return null;
  const l = best.ls[Math.floor(best.ls.length / 2)], F = best.b1 - l;   // kutunun okunabildigi sol kenarlarin ortasi
  return { l, w: Math.round(F + (best.cols - 1) * P), cols: best.cols, first: Math.round(F / P * 100) / 100, pitch: P };
}
