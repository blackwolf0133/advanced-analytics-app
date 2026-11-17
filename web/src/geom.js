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

/* ---------- cok satirli tablo: satir/sutun duzeni goruntuden ---------- */
/** Her satirin yazi olcusu (satir boyunca parlaklik degisimi). */
export function rowProfile(img) {
  const out = new Float32Array(img.h);
  for (let y = 0; y < img.h; y++) {
    let s = 0, s2 = 0;
    for (let x = 0; x < img.w; x++) { const i = (y * img.w + x) * 3, v = Math.max(img.d[i], img.d[i + 1], img.d[i + 2]); s += v; s2 += v * v; }
    const m = s / img.w; out[y] = Math.sqrt(Math.max(0, s2 / img.w - m * m));
  }
  return out;
}
/** Bir eksende tekrarlayan hucre duzeni: adim (P) ve sinir kaymasi (phi). Sinirlar yazinin olmadigi yerlere duser. */
export function fitAxis(prof, lo, hi) {
  const N = prof.length; lo = Math.max(6, lo); hi = Math.min(hi, N / 2); if (hi <= lo) return null;
  const cs = new Float64Array(N + 1); for (let i = 0; i < N; i++) cs[i + 1] = cs[i] + prof[i];
  const sm = (x, r) => { x = Math.round(x); const a = Math.max(0, x - r), b = Math.min(N - 1, x + r); return a > b ? 0 : (cs[b + 1] - cs[a]) / (b - a + 1); };
  // dogru adimda hucre ortalari yazinin, sinirlar bosluklarin ustune duser: (orta - sinir) farki en buyuk olan adim ve kayma.
  // Iki kati adimda "ortalar" bosluga, yarisinda "sinirlar" yaziya denk gelir; ikisi de dusuk puan alir.
  // bos kenarlar (yazi yok) puanlamaya katilmaz
  const m0 = cs[N] / N; let A = 0, Z = N - 1; while (A < N && prof[A] < 0.3 * m0) A++; while (Z > A && prof[Z] < 0.3 * m0) Z--;
  const all = [];
  for (let p = lo; p <= hi; p += 0.5) {
    const r = Math.max(1, Math.round(p * 0.08)); let pb = null;
    for (let f = 0; f < p; f += 1) {
      let B = 0, C = 0, n = 0, nb = 0;
      for (let x = f; x < N; x += p) { if (x >= A - r && x <= Z + r) { B += sm(x, r); nb++; } if (x + p / 2 >= A && x + p / 2 <= Z) { C += sm(x + p / 2, r); n++; } }
      if (!n || !nb) continue; const v = C / n - B / nb;
      if (!pb || v > pb.v) pb = { P: p, phi: f, v };
    }
    if (pb) all.push(pb);
  }
  if (!all.length) return null;
  const top = Math.max(...all.map((c) => c.v)); if (top < 0.25 * m0) return null;
  // neredeyse esit puanlilardan en kucuk adim (iki-uc kati adim da benzer puan alabilir)
  // iki-uc kati adimda da sinirlar bosluklara, ortalar yaziya denk gelebilir: kati bulunduysa gercek adim onun yarisi/ucte biridir
  // iki-uc kati adimda da sinirlar bosluklara, ortalar yaziya denk gelebilir: yarisi/ucte biri de aday olur (okumayla secilir)
  const best = all.find((c) => c.v === top), out = [best];
  for (const d of [2, 3]) {
    const near = all.filter((c) => Math.abs(c.P - best.P / d) <= 2.5).sort((a, b) => b.v - a.v)[0];
    if (near && near.v >= 0.7 * top) out.push(near);
  }
  return all ? Object.assign(best, { alts: out }) : null;
}
/** Adim ve kaymaya gore tam gorunen hucre araliklari [bas, son]. */
export function axisCells(N, P, phi, prof = null) {
  // kenarda kesilen hucre: bolge kenari yazinin ustunden geciyorsa (yari gorunen satir) alinmaz
  const mean = prof ? prof.reduce((s, v) => s + v, 0) / N : 0, edge = (i) => !prof || (prof[i] + prof[Math.min(N - 1, i + 1)] + prof[Math.max(0, i - 1)]) / 3 <= 0.5 * mean;
  const out = [];
  for (let b = phi - P; b < N; b += P) {
    if (b + P <= 0.3 * P || b >= N - 0.3 * P) continue;
    if (b < -0.18 * P && (b < -0.45 * P || !edge(0))) continue;
    if (b + P > N + 0.18 * P && (b + P > N + 0.45 * P || !edge(N - 1))) continue;
    out.push([Math.max(0, Math.round(b)), Math.min(N, Math.round(b + P))]);
  }
  return out;
}
/** Tablo goruntusunun hucreleri: { xs, ys } ya da null. Satir/sutun sayisi verilmez; olculur. */
export function fitGrid(img) {
  const px = stripProfile(img), cx = fitAxis(px, img.w * 0.03, img.w / 3); if (!cx) return null;
  const py = rowProfile(img), opts = [];
  for (const ax of cx.alts) {
    const xs = axisCells(img.w, ax.P, ax.phi, px); if (xs.length < 2) continue;
    if (img.h < ax.P * 0.4 * 2.2) { opts.push({ xs, ys: [[0, img.h]] }); continue; }
    const cy = fitAxis(py, ax.P * 0.35, ax.P * 1.6);
    for (const ay of cy ? cy.alts : [null]) { const ys = ay ? axisCells(img.h, ay.P, ay.phi, py) : [[0, img.h]]; if (ys.length) opts.push({ xs, ys }); }
  }
  if (opts.length <= 1) return opts[0] || null;
  // adaylar arasinda okumayla secim: ornek hucrelerin okunabilen orani en yuksek olan duzen
  let best = null;
  for (const o of opts) {
    let ok = 0, n = 0; const r0 = Math.max(0, Math.floor(o.ys.length / 2) - 2);   // ortadan art arda satirlar (atlamali ornek yaniltir)
    for (let r = r0; r < Math.min(o.ys.length, r0 + 4); r++) for (const [x0, x1] of o.xs) { n++; if (readCell(sub(img, x0, o.ys[r][0], x1, o.ys[r][1]))[0] !== null) ok++; }
    const sc = ok / n + 0.0001 * o.xs.length * o.ys.length; if (!best || sc > best.sc) best = { ...o, sc };
  }
  return { xs: best.xs, ys: best.ys };
}
/** Tablodaki sayilar satir satir (soldan saga, yukaridan asagi); okunamayan null. */
export function readGrid(img, g) {
  const out = [];
  for (const [y0, y1] of g.ys) for (const [x0, x1] of g.xs) { const v = readCell(sub(img, x0, y0, x1, y1))[0]; out.push(v === null ? null : Number(v)); }
  return out;
}
