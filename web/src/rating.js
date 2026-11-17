// Basketbol takim gucu modeli (her lig icin ayni): zaman agirlikli, cezali en kucuk kareler (ridge / Massey).
// sayi farki = ev avantaji (tarafsiz sahada 0) + guc(ev) - guc(dep) + hata
// Ev avantaji sabit DEGILDIR: her ligin kendi verisinden olculur (az veride ~3 sayiya dogru cekilir).
// Kazanma olasiligi = Phi(beklenen fark / sigma); sigma, modelin ileriye donuk testteki hatalarindan olculur.
// Toplam sayi ayri bir ridge modeliyle (takimlarin skor egilimi) tahmin edilir.
// Mac: [tarih 'YYYY-MM-DD', ev, dep, evSayi, depSayi, sezon, tarafsiz(0/1)]

export const DEFAULTS = { half: 80, lam: 3, prevW: 0.6, cap: 30, hfaPrior: 3, hfaLam: 40 };
const day = (s) => Date.parse(s) / 864e5;
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
export const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Takim -> indeks; maclar sayisal dizilere cevrilir (hizli tekrar icin). */
export function prepare(games) {
  const ix = new Map(), teams = [];
  const id = (t) => { if (!ix.has(t)) { ix.set(t, teams.length); teams.push(t); } return ix.get(t); };
  const n = games.length, H = new Int32Array(n), A = new Int32Array(n), M = new Float64Array(n), T = new Float64Array(n), D = new Float64Array(n), N = new Uint8Array(n), Y = new Int32Array(n);
  games.forEach((g, i) => { H[i] = id(g[1]); A[i] = id(g[2]); M[i] = g[3] - g[4]; T[i] = g[3] + g[4]; D[i] = day(g[0]); N[i] = g[6] ? 1 : 0; Y[i] = g[5]; });
  return { games, teams, ix, n, H, A, M, T, D, N, Y };
}

/**
 * P maclarindan ilk 'upto' tanesiyle (tarih sirali) modeli kurar. state verilirse oradan baslar (hizli).
 * Donus: { r (guc), p (skor egilimi), hfa, mu, ... }
 */
export function fit(P, upto, o = DEFAULTS, state = null, iters = 25) {
  const nt = P.teams.length, ref = upto ? P.D[upto - 1] : 0, curY = upto ? P.Y[upto - 1] : 0;
  const r = new Float64Array(nt), p = new Float64Array(nt); let hfa = o.hfaPrior, mu = 0;
  if (state) { r.set(state.r.subarray(0, Math.min(nt, state.r.length))); p.set(state.p.subarray(0, Math.min(nt, state.p.length))); hfa = state.hfa; mu = state.mu; }
  if (!upto) return { r, p, hfa, mu: 0, n: 0 };
  const w = new Float64Array(upto), cap = o.cap;
  let sw = 0, st = 0;
  for (let i = 0; i < upto; i++) { w[i] = Math.pow(0.5, (ref - P.D[i]) / o.half) * (P.Y[i] === curY ? 1 : o.prevW); sw += w[i]; st += w[i] * P.T[i]; }
  if (!state) mu = st / sw / 2;
  const m = (i) => Math.max(-cap, Math.min(cap, P.M[i]));
  for (let it = 0; it < iters; it++) {
    // takim guclari (Gauss-Seidel)
    const num = new Float64Array(nt), den = new Float64Array(nt).fill(o.lam), pn = new Float64Array(nt), pd = new Float64Array(nt).fill(o.lam);
    for (let i = 0; i < upto; i++) {
      const h = P.H[i], a = P.A[i], e = P.N[i] ? 0 : hfa, wi = w[i], mi = m(i);
      num[h] += wi * (mi - e + r[a]); den[h] += wi; num[a] += wi * (-mi + e + r[h]); den[a] += wi;
      const ti = P.T[i] - 2 * mu; pn[h] += wi * (ti - p[a]); pd[h] += wi; pn[a] += wi * (ti - p[h]); pd[a] += wi;
    }
    for (let t = 0; t < nt; t++) { r[t] = num[t] / den[t]; p[t] = pn[t] / pd[t]; }
    // ev avantaji ve ortalama skor
    let hn = o.hfaLam * o.hfaPrior, hd = o.hfaLam, mn = 0;
    for (let i = 0; i < upto; i++) { const wi = w[i]; if (!P.N[i]) { hn += wi * (m(i) - r[P.H[i]] + r[P.A[i]]); hd += wi; } mn += wi * (P.T[i] - p[P.H[i]] - p[P.A[i]]); }
    hfa = hn / hd; mu = mn / sw / 2;
  }
  return { r, p, hfa, mu, n: upto };
}

export function predictWith(P, s, sigma, home, away, neutral = 0) {
  const h = P.ix.get(home), a = P.ix.get(away), rh = h === undefined ? 0 : s.r[h], ra = a === undefined ? 0 : s.r[a];
  const margin = (neutral ? 0 : s.hfa) + rh - ra, total = 2 * s.mu + (h === undefined ? 0 : s.p[h]) + (a === undefined ? 0 : s.p[a]);
  return { pHome: phi(margin / sigma), margin, total, known: h !== undefined && a !== undefined, hfa: s.hfa };
}

/**
 * Ileriye donuk test: her mac gunu, yalnizca o gunden ONCEKI maclarla kurulan modelle tahmin edilir.
 * log: her mac icin { i, pm (beklenen fark), pt (beklenen toplam), seen } ; sigma bu hatalardan olculur.
 */
export function walk(P, o = DEFAULTS) {
  const log = new Array(P.n), seen = new Int32Array(P.teams.length);
  let s = null, i = 0;
  while (i < P.n) {
    let j = i; while (j < P.n && P.D[j] === P.D[i]) j++;
    s = fit(P, i, o, s, s ? 4 : 25);
    for (let k = i; k < j; k++) {
      const h = P.H[k], a = P.A[k];
      log[k] = { pm: (P.N[k] ? 0 : s.hfa) + s.r[h] - s.r[a], pt: i ? 2 * s.mu + s.p[h] + s.p[a] : null, seen: Math.min(seen[h], seen[a]), hfa: s.hfa };
    }
    for (let k = i; k < j; k++) { seen[P.H[k]]++; seen[P.A[k]]++; }
    i = j;
  }
  return log;
}
/** Testte kullanilan maclar: takimlarin ikisi de en az 'minSeen' mac oynamis olmali (sezon basi isinma haric). */
export function sigmaOf(P, log, from = 0, minSeen = 8) {
  let s = 0, k = 0;
  for (let i = from; i < P.n; i++) if (log[i] && log[i].seen >= minSeen) { const e = P.M[i] - log[i].pm; s += e * e; k++; }
  return k >= 30 ? Math.sqrt(s / k) : 12;   // az veride tipik basketbol degeri
}
export function scoreLog(P, log, sigma, from = 0, minSeen = 8) {
  let n = 0, ll = 0, acc = 0, br = 0;
  for (let i = from; i < P.n; i++) {
    const l = log[i]; if (!l || l.seen < minSeen || P.M[i] === 0) continue;
    const p = Math.min(0.995, Math.max(0.005, phi(l.pm / sigma))), y = P.M[i] > 0 ? 1 : 0;
    n++; ll -= Math.log(y ? p : 1 - p); acc += (p >= 0.5) === (y === 1) ? 1 : 0; br += (p - y) ** 2;
  }
  return n ? { n, logloss: ll / n, acc: acc / n, brier: br / n } : null;
}

/** Ayarlarin secimi (veri hattinda yapilir): ilk yarida sigma olculur, ikinci yarida log kayba bakilir. */
/** Az maci olan liglerde (sezon basi, kucuk ligler) testte en az kac mac oynamis takimlara bakilir. */
export const minSeenFor = (P) => (P.n >= 600 ? 8 : P.n >= 150 ? 5 : 2);
export function tune(games, grid = { half: [40, 80, 160], lam: [1.5, 4], prevW: [0.4, 0.8] }) {
  const P = prepare(games), cut = Math.floor(P.n * 0.45), ms = minSeenFor(P); let best = null;
  if (P.n < 80) return { o: { ...DEFAULTS }, sc: null, sigma: 12, small: true };          // cok az mac: varsayilan ayarlar
  for (const half of grid.half) for (const lam of grid.lam) for (const prevW of grid.prevW) {
    const o = { ...DEFAULTS, half, lam, prevW }, log = walk(P, o), sigma = sigmaOf(P, log, 0, ms), sc = scoreLog(P, log, sigma, cut, ms);
    if (sc && (!best || sc.logloss < best.sc.logloss)) best = { o, sc, sigma };
  }
  return best || { o: { ...DEFAULTS }, sc: null, sigma: 12, small: true };
}
