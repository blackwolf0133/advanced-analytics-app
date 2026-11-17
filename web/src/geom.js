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
  const px = stripProfile(img), cx = fitAxis(px, img.w * 0.03, img.w / 4.5); if (!cx) return null;
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

/* ---------- cerceve: kullanici yalnizca tablonun cevresini cizer; duzen ve en yeni sayi her okumada goruntuden bulunur ---------- */
/** Goruntunun kopyasinda verilen dikdortgenleri karartir (ekran kaydinda gorunen kendi penceremiz okunmasin). */
export function blackout(img, rects) {
  if (!rects || !rects.length) return img;   // (ic cagrida rects { inner } nesnesidir; uzunlugu 0)
  const d = new Uint8Array(img.d);
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x0)), x1 = Math.min(img.w, Math.ceil(r.x1)), y0 = Math.max(0, Math.floor(r.y0)), y1 = Math.min(img.h, Math.ceil(r.y1));
    for (let y = y0; y < y1; y++) d.fill(0, (y * img.w + x0) * 3, (y * img.w + x1) * 3);
  }
  return { w: img.w, h: img.h, d };
}
/**
 * Cerceve icindeki sayi tablosu. Cercevede baska seyler de olabilir (sekme yazilari, ust serit, kenar bosluklari):
 * duzen farkli yerlerden baslanarak olculur, sayi olmayan bas/son satir ve sutunlar atilir, kesilen satirlar ayni duzenle
 * yukari/asagi tamamlanir. Hiz icin yalnizca kenar satirlari ve birkac ornek satir okunur.
 * Donus: { cells (en yeni basta), rows, cols, strip } ya da null. Hucreler cerceveye gore.
 */
export function frameCells(img, newest = 'first', mask = null, scale = img.w / 1080) {
  img = blackout(img, mask);
  const hidden = Array.isArray(mask) ? mask : [], hid = (x0, y0, x1, y1) => hidden.some((m) => x0 < m.x1 && x1 > m.x0 && y0 < m.y1 && y1 > m.y0);
  const memo = new Map(), ok = (x0, y0, x1, y1) => {
    if (y0 < 0 || y1 > img.h || x0 < 0 || x1 > img.w) return false;
    if (hid(x0, y0, x1, y1)) return false;   // kendi penceremizin altinda kalan
    const k = `${x0},${y0},${x1},${y1}`; let v = memo.get(k);
    if (v === undefined) { v = readCell(sub(img, x0, y0, x1, y1))[0] !== null; memo.set(k, v); }
    return v;
  };
  // tek sira [top, bot): serit olcusu (genis ilk kutu) goruntuden; ayrica ust serit icin varsayilan duzen (14 sayi, ilk kutu 1,6)
  const strip = (top, bot) => {
    const lays = [], fs = fitStrip(sub(img, 0, top, img.w, bot));
    if (fs) lays.push({ l: fs.l, w: fs.w, cols: fs.cols, first: fs.first });
    lays.push({ l: 0, w: img.w, cols: 14, first: 1.6 });
    let res = null;
    for (const L of lays) {
      const cells = newestRects({ l: 0, t: 0, w: L.w, h: bot - top, rows: 1, cols: L.cols, first: L.first, newest }, L.cols).rects.map((c) => ({ x0: c.x0 + L.l, x1: c.x1 + L.l, y0: top, y1: bot }));
      if (!ok(cells[0].x0, top, cells[0].x1, bot)) continue;
      // en yeni kutu olcuye girmemis olabilir (renkli zeminli ilk kutu kenar boslugu sanilir): solunda sayi varsa o da alinir
      if (newest === 'first') { const c0 = cells[0], W = c0.x1 - c0.x0;
        for (const k of [1, 1.3, 1.6]) { const x0 = Math.round(c0.x0 - W * k); if (x0 >= 0 && ok(x0, top, c0.x0, bot)) { cells.unshift({ x0, x1: c0.x0, y0: top, y1: bot }); break; } } }
      const n = cells.filter((c) => ok(c.x0, c.y0, c.x1, c.y1)).length, sc = n / cells.length + n * 0.001;
      if (n >= 2 && n >= 0.35 * cells.length && (!res || sc > res.score)) res = { score: sc, n, cells, rows: 1, cols: L.cols, strip: true };
    }
    return res;
  };
  // [lo, hi) araligindaki tek sira: yazi satirlari (parlaklik degisimi) ve okuyarak dikey hizalama denenir
  const line = (lo, hi, nearest) => {
    if (hi - lo < 24 * scale) return null;
    const part = sub(img, 0, lo, img.w, hi), pr = rowProfile(part), mx = Math.max(...pr), runs = [];
    for (let y = 0; y < pr.length;) { if (pr[y] < 0.45 * mx) { y++; continue; } let e = y; while (e < pr.length && pr[e] >= 0.45 * mx) e++; if (e - y >= 14 * scale && e - y <= 90 * scale) runs.push((y + e) / 2); y = e; }
    if (nearest) runs.reverse();
    const al = nearest && runs.length ? null : alignStrip(part, 0, { l: 0, w: img.w, rows: 1, cols: 14, first: 1.6, newest: 'first' }, scale);
    const groups = runs.map((c) => [c]); if (al) { if (nearest) groups.push([al.t + al.h / 2]); else groups.unshift([al.t + al.h / 2]); }
    let res = null;
    for (const [c] of groups) {
      for (const h of [50, 60, 42]) {
        const H = Math.round(h * scale); if (H > pr.length) continue;
        const t = Math.max(0, Math.min(pr.length - H, Math.round(c - H / 2))), r = strip(lo + t, lo + t + H);
        if (r && (!res || r.score > res.score)) res = r;
      }
      if (!nearest && res && res.score >= 0.9) return res;
      if (nearest && res && res.score >= 0.7) return res;      // tablonun ustu: en yakin uygun sira
    }
    return res && res.score >= (nearest ? 0.7 : 0.35) ? res : null;
  };
  let best = img.h <= 170 * scale ? line(0, img.h, false) : null;     // alcak cerceve: tek sira
  if (best) return { cells: best.cells, rows: 1, cols: best.cols, strip: true, py: 0 };
  for (const f of [0, 0.12, 0.25, 0.4]) {
    const y0 = Math.round(img.h * f); if (img.h - y0 < 24) continue;
    const g = fitGrid(y0 ? sub(img, 0, y0, img.w, img.h) : img); if (!g) continue;
    if (g.ys.length === 1) continue;
    const xs = g.xs; let ys = g.ys.map(([a, b]) => [a + y0, b + y0]);
    const Py = Math.round((ys[ys.length - 1][0] - ys[0][0]) / Math.max(1, ys.length - 1)) || (ys[0][1] - ys[0][0]);
    const rate = ([a, b]) => { const vis = xs.filter(([x0, x1]) => !hid(x0, a, x1, b)); return vis.length ? vis.filter(([x0, x1]) => ok(x0, a, x1, b)).length / vis.length : 0.5; };
    let a = 0, b = ys.length; while (a < b && rate(ys[a]) < 0.4) a++; while (b > a && rate(ys[b - 1]) < 0.4) b--;
    ys = ys.slice(a, b); if (!ys.length) continue;
    // kesilen ya da olcuye girmeyen satirlar: ayni duzenle yukari/asagi devam
    while (ys[0][0] - Py >= 0 && rate([ys[0][0] - Py, ys[0][0]]) >= 0.5) ys.unshift([ys[0][0] - Py, ys[0][0]]);
    while (ys[ys.length - 1][1] + Py <= img.h && rate([ys[ys.length - 1][1], ys[ys.length - 1][1] + Py]) >= 0.5) ys.push([ys[ys.length - 1][1], ys[ys.length - 1][1] + Py]);
    // cerceve kenarinin kestigi satir: yazi icerideyse (yuksekligin %60'i) o da alinir
    if (ys[0][0] >= 0.6 * Py && ys[0][0] < Py && rate([0, ys[0][0]]) >= 0.5) ys.unshift([0, ys[0][0]]);
    { const e = ys[ys.length - 1][1]; if (img.h - e >= 0.6 * Py && img.h - e < Py && rate([e, img.h]) >= 0.5) ys.push([e, img.h]); }
    // sutunlar: ilk ve son satirlarla birkac ornek satirda sayi olmayan bas/son sutunlar atilir
    const sample = [...new Set([0, 1, 2, ys.length - 2, ys.length - 1].filter((i) => i >= 0 && i < ys.length))].map((i) => ys[i]);
    const crate = xs.map(([x0, x1]) => { const vis = sample.filter(([p, q]) => !hid(x0, p, x1, q)); return vis.length ? vis.filter(([p, q]) => ok(x0, p, x1, q)).length / vis.length : 0.5; });
    let c0 = 0, c1 = xs.length; while (c0 < c1 && crate[c0] < 0.3) c0++; while (c1 > c0 && crate[c1 - 1] < 0.3) c1--;
    const X = xs.slice(c0, c1); if (X.length < 2) continue;
    const fr = crate.slice(c0, c1).reduce((s, v) => s + v, 0) / X.length; if (fr < 0.6) continue;
    const score = fr * ys.length * X.length;
    if (!best || score > best.score) {
      let cells = []; for (const [p, q] of ys) for (const [x0, x1] of X) cells.push({ x0, y0: p, x1, y1: q });
      // tablonun hemen ustunde farkli duzende tek sira (or. istatistik panelinde buyuk yazili son sayilar) varsa en yeniler odur
      const top = line(Math.max(0, Math.round(ys[0][0] - 2.2 * Py)), ys[0][0], true); if (top) cells = top.cells.concat(cells);
      if (newest === 'last') cells.reverse();
      best = { score, cells, rows: ys.length + (top ? 1 : 0), cols: X.length, strip: !!top, py: Py, xs: X };
    }
    if (fr >= 0.85 && ys.length >= 2) break;   // temiz bir olcu bulunduysa digerleri denenmez
  }
  if (!best && !mask?.inner) {                    // kenarlardaki baska seyler (kaydirma cubugu, oyun goruntusu) olcuyu bozabilir
    for (const k of [0.05, 0.09]) {
      const dx = Math.round(img.w * k), r = frameCells(sub(img, dx, 0, img.w - dx, img.h), newest, { inner: true, length: 0 }, scale);
      if (r) return { ...r, cells: r.cells.map((c) => ({ ...c, x0: c.x0 + dx, x1: c.x1 + dx })), xs: r.xs && r.xs.map(([a, b]) => [a + dx, b + dx]) };
    }
  }
  return best && { cells: best.cells, rows: best.rows, cols: best.cols, strip: best.strip, py: best.py || 0, xs: best.xs || null };
}
