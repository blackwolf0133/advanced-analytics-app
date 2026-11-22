// Kombine (kupon) kurucu: banko ve surpriz kuponlar. Telefon ve veri hatti ortak kullanir.
// Olasiliklar once kalibre edilir: model ileriye donuk testte hangi olasilikta gercekte ne siklikla tuttuysa o kullanilir
// (or. futbolda model "%75 ust" dediginde gercekte ~%61 tutuyordu). Kalibrasyon veri hattinda olculur ve dosyaya yazilir.

/** Izotonik regresyon (PAV): (p, y) ciftlerinden artan p -> gercek oran egrisi. Donus: [[p, q], ...] dugumleri. */
export function isotonic(pairs, minN = 40) {
  const s = pairs.filter(([p, y]) => Number.isFinite(p) && (y === 0 || y === 1)).sort((a, b) => a[0] - b[0]);
  if (s.length < 2 * minN) return null;
  const bl = [];                                            // { n, y, p } bloklari
  for (let i = 0; i < s.length; i += minN) { const ch = s.slice(i, i + minN); bl.push({ n: ch.length, y: ch.reduce((a, c) => a + c[1], 0), p: ch.reduce((a, c) => a + c[0], 0) }); }
  const st = [];
  for (const b of bl) { st.push({ ...b }); while (st.length > 1 && st[st.length - 2].y / st[st.length - 2].n >= st[st.length - 1].y / st[st.length - 1].n) { const b2 = st.pop(), a = st[st.length - 1]; a.n += b2.n; a.y += b2.y; a.p += b2.p; } }
  return st.map((b) => [Math.round((b.p / b.n) * 1000) / 1000, Math.round(((b.y + 0.5) / (b.n + 1)) * 1000) / 1000]);
}
/** Kalibre olasilik: dugumler arasinda dogrusal; uclarda son dugum (asiri guven kirpilir). Dugum yoksa ham olasilik. */
export function calib(knots, p) {
  if (!knots || !knots.length || !Number.isFinite(p)) return p;
  if (p <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) { const [x0, y0] = knots[i - 1], [x1, y1] = knots[i]; if (p <= x1) return y0 + ((y1 - y0) * (p - x0)) / Math.max(1e-9, x1 - x0); }
  return knots[knots.length - 1][1];
}

/* ---------------- futbol pazarlari ---------------- */
const poisLE = (l, k) => { let t = Math.exp(-l), s = 0; for (let i = 0; i <= k; i++) { s += t; t *= l / (i + 1); } return s; };
const sc = (l) => 1 - Math.exp(-l);                     // en az bir gol
// gol beklentisi (xg) ve ligin ilk yari gol payi (f) ile: 6+ gol, iki yarida da karsilikli gol (ham; kalibrasyonla duzeltilir)
const g6 = (p) => (p.xg ? 1 - poisLE(p.xg[0] + p.xg[1], 5) : NaN);
const kk2 = (p) => { if (!p.xg) return NaN; const [a, b] = p.xg, f = p.f ?? 0.443; return sc(a * f) * sc(b * f) * sc(a * (1 - f)) * sc(b * (1 - f)); };
export const FMK = {
  '1': { label: 'MS 1', raw: (p) => p.p[0], hit: (h, a) => h > a, fav: true },
  X: { label: 'MS X', raw: (p) => p.p[1], hit: (h, a) => h === a },
  '2': { label: 'MS 2', raw: (p) => p.p[2], hit: (h, a) => h < a, fav: true },
  '1X': { label: 'ÇŞ 1-X', raw: (p) => p.p[0] + p.p[1], hit: (h, a) => h >= a, dc: true },
  X2: { label: 'ÇŞ X-2', raw: (p) => p.p[1] + p.p[2], hit: (h, a) => h <= a, dc: true },
  U: { label: '2,5 Üst', raw: (p) => p.o25, hit: (h, a) => h + a > 2, goal: true },
  A: { label: '2,5 Alt', raw: (p) => 1 - p.o25, hit: (h, a) => h + a < 3, goal: true },
  KGV: { label: 'KG Var', raw: (p) => p.btts, hit: (h, a) => h > 0 && a > 0, goal: true },
  KGY: { label: 'KG Yok', raw: (p) => 1 - p.btts, hit: (h, a) => !(h > 0 && a > 0), goal: true },
  G6: { label: '6+ gol', raw: g6, hit: (h, a) => h + a >= 6, goal: true, special: true },
  KK2: { label: 'İY KG + 2Y KG', raw: kk2, hit: (h, a, h1, a1) => (h1 == null ? null : h1 > 0 && a1 > 0 && h - h1 > 0 && a - a1 > 0), goal: true, special: true, half: true },
};
/** Bir futbol macinin secenekleri (kalibre). m: { id, h, a, t, lg, pr } ; cal: { pazar: dugumler }. */
export function footLegs(m, cal) {
  if (!m.pr || !m.pr.p) return [];
  if (m.f != null && m.pr.f == null) m = { ...m, pr: { ...m.pr, f: m.f } };
  const top = m.pr.p.indexOf(Math.max(...m.pr.p));
  return Object.entries(FMK).filter(([, d]) => Number.isFinite(d.raw(m.pr))).map(([k, d]) => ({ sport: 'f', id: m.id, t: m.t, lg: m.lg, h: m.h, a: m.a, mk: k, label: d.label, raw: d.raw(m.pr), q: calib(cal?.[k], d.raw(m.pr)), under: (k === '1' && top !== 0) || (k === '2' && top !== 2) || k === 'X' }));
}
/** Basketbol: ev sahibi kazanir olasiligi (kalibre) -> iki secenek. */
export function basketLegs(g, cal) {
  const q = calib(cal, g.pHome);
  return [{ sport: 'b', id: g.id, t: g.t, lg: g.lg, h: g.h, a: g.a, mk: '1', label: `MS 1 (${g.h})`, raw: g.pHome, q, under: g.pHome < 0.5 },
    { sport: 'b', id: g.id, t: g.t, lg: g.lg, h: g.h, a: g.a, mk: '2', label: `MS 2 (${g.a})`, raw: 1 - g.pHome, q: 1 - q, under: g.pHome >= 0.5 }];
}

/**
 * Kupon turleri:
 *  banko   - en yuksek olasilikli secimler (cifte sans, alt/ust dahil); her secim en az %72
 *  ms      - yalnizca mac sonucu (favori kazanir); her secim en az %62
 *  surpriz - favori olmayan sonuc (beraberlik / zayif taraf kazanir) ama modelin ciddi sans verdigi maclar (%30-%48)
 * Her mactan en fazla bir secim; secimler bagimsiz sayilir (kupon olasiligi = carpim).
 */
export const MODES = {
  banko: { name: 'Banko kupon', ok: (l) => l.q >= 0.72 && l.mk !== 'X', score: (l) => Math.log(l.q) },
  ms: { name: 'Banko maç sonucu', ok: (l) => (l.mk === '1' || l.mk === '2') && !l.under && l.q >= 0.62, score: (l) => Math.log(l.q) },
  surpriz: { name: 'Sürpriz kupon', ok: (l) => l.under && l.q >= 0.3 && l.q <= 0.48, score: (l) => Math.log(l.q) },
  // gol avi listeleri (en az 7 mac): modelin en yuksek ihtimal verdigi maclar
  gol6: { name: '6+ gol kombinesi', ok: (l) => l.mk === 'G6', score: (l) => l.q, list: true },
  kk2: { name: 'İki yarıda karşılıklı gol', ok: (l) => l.mk === 'KK2', score: (l) => l.q, list: true },
};
export function coupon(legs, mode, n = 3) {
  const M = MODES[mode], best = new Map();
  for (const l of legs) { if (!M.ok(l)) continue; const k = l.sport + l.id, b = best.get(k); if (!b || M.score(l) > M.score(b)) best.set(k, l); }
  const pick = [...best.values()].sort((a, b) => M.score(b) - M.score(a) || (a.t < b.t ? -1 : 1)).slice(0, n);
  if (pick.length < n) return null;
  pick.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  const q = pick.reduce((s, l) => s * l.q, 1);
  return { mode, legs: pick, q, odds: 1 / q };
}
/** Bir secim tuttu mu? r: [ev, dep] gercek skor. */
export const legHit = (l, r) => (l.sport === 'f' ? FMK[l.mk].hit(r[0], r[1], r[2], r[3]) : l.mk === '1' ? r[0] > r[1] : r[0] < r[1]);

/**
 * Kupon kuralinin gecmis testi. items: { wk, day, ... } ; her hafta, o hafta HARIC verilerle kalibre edilir (sizinti yok),
 * o haftanin her gunu kurallarla kupon kurulur ve sonucu sayilir. fitCal(items) -> cal ; legsOf(item, cal) -> secimler ; resOf(item) -> [ev, dep].
 */
export function couponTest(items, fitCal, legsOf, resOf, modes = ['banko', 'ms', 'surpriz'], ns = [2, 3, 4]) {
  const out = {}, weeks = [...new Set(items.map((m) => m.wk))];
  for (const w of weeks) {
    const cal = fitCal(items.filter((m) => m.wk !== w)), inW = items.filter((m) => m.wk === w);
    for (const day of [...new Set(inW.map((m) => m.day))]) {
      const ms = inW.filter((m) => m.day === day), by = new Map(ms.map((m) => [m.sport + m.id, m])), legs = ms.flatMap((m) => legsOf(m, cal));
      for (const mode of modes) for (const n of ns) {
        const c = coupon(legs, mode, n); if (!c) continue;
        const hits = c.legs.map((l) => legHit(l, resOf(by.get(l.sport + l.id)))); if (hits.some((h) => h == null)) continue;
        const o = ((out[mode] ||= {})[n] ||= { k: 0, hit: 0, q: 0, legs: 0, lhit: 0, lq: 0, dist: Array(n + 1).fill(0) });
        const h = hits.filter(Boolean).length;
        o.k++; o.hit += h === n ? 1 : 0; o.q += c.q; o.legs += n; o.lhit += h; o.lq += c.legs.reduce((s2, l) => s2 + l.q, 0); o.dist[h]++;
      }
    }
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  for (const m of Object.values(out)) for (const [n, o] of Object.entries(m)) m[n] = { k: o.k, hit: o.hit, rate: r3(o.hit / o.k), exp: Number((o.q / o.k).toPrecision(3)), leg: r3(o.lhit / o.legs), legExp: r3(o.lq / o.legs), dist: o.dist };
  return out;
}
