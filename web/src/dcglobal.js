// Kuresel futbol gol modeli (veri hattinda calisir; testleri telefon kodu ile ayni dilde).
// Butun liglerin ve kupalarin maclari tek modelde: takimlar ESPN kimligiyle eslenir, boylece Sampiyonlar Ligi gibi
// kupalardaki maclar ligleri birbirine baglar. Her yarismanin kendi gol ortalamasi ve ev avantaji vardir.
//   log(ev gol beklentisi)  = mu[yarisma] + hucum[ev] - savunma[dep] + ev_avantaji[yarisma] (tarafsiz sahada 0)
//   log(dep gol beklentisi) = mu[yarisma] + hucum[dep] - savunma[ev]
// Poisson olabilirligi + takim degerlerine ceza (az maci olan takim ortalamaya cekilir) + zaman agirligi (yeni mac daha agir).
// Dusuk skorlar icin Dixon-Coles duzeltmesi (rho). Devre tahmini: yarismanin ilk yari gol payi (veriden) ile ayri Poisson.

const lg = (x) => Math.log(Math.max(x, 1e-12));
export function tau(x, y, l, m, r) { return x === 0 && y === 0 ? 1 - l * m * r : x === 0 && y === 1 ? 1 + l * r : x === 1 && y === 0 ? 1 + m * r : x === 1 && y === 1 ? 1 - r : 1; }

/**
 * ms: [{ day (gun sayisi), c (yarisma), h, a (takim), hg, ag, n (tarafsiz 0/1) }]
 * Donus: { att, def, mu, g, rho, comps, teams, games (takim basina agirlikli mac) }
 */
export function fitGlobal(ms, { ref = Math.max(...ms.map((m) => m.day)), xi = 0.003, lamT = 3, lamC = 20, iters = 60 } = {}) {
  const T = new Map(), C = new Map(), tid = (t) => { if (!T.has(t)) T.set(t, T.size); return T.get(t); }, cid = (c) => { if (!C.has(c)) C.set(c, C.size); return C.get(c); };
  const n = ms.length, H = new Int32Array(n), A = new Int32Array(n), K = new Int32Array(n), HG = new Float64Array(n), AG = new Float64Array(n), N = new Uint8Array(n), W = new Float64Array(n);
  ms.forEach((m, i) => { H[i] = tid(m.h); A[i] = tid(m.a); K[i] = cid(m.c); HG[i] = m.hg; AG[i] = m.ag; N[i] = m.n ? 1 : 0; W[i] = Math.exp(-xi * Math.max(0, ref - m.day)); });
  const nt = T.size, nc = C.size, att = new Float64Array(nt), def = new Float64Array(nt), mu = new Float64Array(nc), g = new Float64Array(nc), games = new Float64Array(nt);
  let sg = 0, sw = 0, hs = 0, as = 0; for (let i = 0; i < n; i++) { sg += W[i] * (HG[i] + AG[i]); sw += W[i]; games[H[i]] += W[i]; games[A[i]] += W[i]; if (!N[i]) { hs += W[i] * HG[i]; as += W[i] * AG[i]; } }
  const mu0 = lg(sg / (2 * sw)), g0 = lg((hs + 0.5) / (as + 0.5)); mu.fill(mu0); g.fill(g0);
  const L = new Float64Array(n), M = new Float64Array(n);
  const rates = () => { for (let i = 0; i < n; i++) { L[i] = Math.exp(mu[K[i]] + att[H[i]] - def[A[i]] + (N[i] ? 0 : g[K[i]])); M[i] = Math.exp(mu[K[i]] + att[A[i]] - def[H[i]]); } };
  for (let it = 0; it < iters; it++) {
    // hucum
    rates(); let gr = new Float64Array(nt), he = new Float64Array(nt);
    for (let i = 0; i < n; i++) { const w = W[i]; gr[H[i]] += w * (HG[i] - L[i]); he[H[i]] += w * L[i]; gr[A[i]] += w * (AG[i] - M[i]); he[A[i]] += w * M[i]; }
    for (let t = 0; t < nt; t++) att[t] += (gr[t] - lamT * att[t]) / (he[t] + lamT);
    // savunma
    rates(); gr = new Float64Array(nt); he = new Float64Array(nt);
    for (let i = 0; i < n; i++) { const w = W[i]; gr[H[i]] -= w * (AG[i] - M[i]); he[H[i]] += w * M[i]; gr[A[i]] -= w * (HG[i] - L[i]); he[A[i]] += w * L[i]; }
    for (let t = 0; t < nt; t++) def[t] += (gr[t] - lamT * def[t]) / (he[t] + lamT);
    // yarisma gol ortalamasi ve ev avantaji (az macli yarismalar genel degere cekilir)
    rates(); const gm = new Float64Array(nc), hm = new Float64Array(nc), gh = new Float64Array(nc), hh = new Float64Array(nc);
    for (let i = 0; i < n; i++) { const w = W[i], k = K[i]; gm[k] += w * (HG[i] - L[i] + AG[i] - M[i]); hm[k] += w * (L[i] + M[i]); if (!N[i]) { gh[k] += w * (HG[i] - L[i]); hh[k] += w * L[i]; } }
    for (let k = 0; k < nc; k++) { mu[k] += (gm[k] - 2 * (mu[k] - mu0)) / (hm[k] + 2); g[k] += (gh[k] - lamC * (g[k] - g0)) / (hh[k] + lamC); }
  }
  rates();
  // Dixon-Coles rho (kucuk izgara)
  let rho = 0, best = -Infinity;
  for (let r = -0.2; r <= 0.06; r += 0.02) { let s = 0; for (let i = 0; i < n; i++) if (HG[i] < 2 && AG[i] < 2) s += W[i] * lg(tau(HG[i], AG[i], L[i], M[i], r)); if (s > best) { best = s; rho = Math.round(r * 100) / 100; } }
  return { att, def, mu, g, rho, comps: C, teams: T, games, mu0, g0 };
}

/** Ilk yari gol payi (yarisma basina; az golde genel paya cekilir). ms: [{ c, h1, a1, hg, ag }] (devre skoru bilinenler) */
export function halfShare(ms, prior = 0.45, k = 150) {
  const by = new Map(); let G1 = 0, G = 0;
  for (const m of ms) { if (m.h1 == null) continue; const s = by.get(m.c) || [0, 0]; s[0] += m.h1 + m.a1; s[1] += m.hg + m.ag; by.set(m.c, s); G1 += m.h1 + m.a1; G += m.hg + m.ag; }
  const all = G > 300 ? G1 / G : prior, out = new Map([['*', all]]);
  for (const [c, [g1, g]] of by) out.set(c, (g1 + k * all) / (g + k));
  return out;
}

const pois = (l, max) => { const p = [Math.exp(-l)]; for (let k = 1; k <= max; k++) p.push(p[k - 1] * l / k); return p; };
function summary(mat) {
  let p1 = 0, px = 0, p2 = 0, o25 = 0, o15 = 0, btts = 0; const cells = [];
  mat.forEach((row, x) => row.forEach((v, y) => { if (x > y) p1 += v; else if (x === y) px += v; else p2 += v; if (x + y > 2) o25 += v; if (x + y > 1) o15 += v; if (x > 0 && y > 0) btts += v; cells.push([x, y, v]); }));
  const s = p1 + px + p2; cells.sort((a, b) => b[2] - a[2]);
  const by = [0, 1, 2].map((o) => { const c = cells.find(([x, y]) => (x > y ? 0 : x === y ? 1 : 2) === o); return c ? [c[0], c[1], c[2] / s] : null; });   // her sonuc icin en olasi skor
  return { p: [p1 / s, px / s, p2 / s], o25: o25 / s, o15: o15 / s, btts: btts / s, top: cells.slice(0, 3).map(([x, y, v]) => [x, y, v / s]), by };
}
/** Mac tahmini: tam mac (Dixon-Coles), ilk yari ve ikinci yari (ayri Poisson). */
export function predictMatch(l, m, rho, f = 0.45, max = 8) {
  const ph = pois(l, max), pa = pois(m, max), ft = ph.map((a, x) => pa.map((b, y) => a * b * tau(x, y, l, m, rho)));
  const half = (s) => { const qh = pois(l * s, max), qa = pois(m * s, max); return qh.map((a) => qa.map((b) => a * b)); };
  const F = summary(ft), H1 = summary(half(f)), H2 = summary(half(1 - f));
  return { xg: [l, m], ...F, ht: H1.p, htTop: H1.top, htBy: H1.by, h2: H2.p, h2Top: H2.top, f };
}
/** Bir mac icin gol beklentileri (bilinmeyen takim: yarisma ortalamasi). */
export function rates(model, c, h, a, neutral = 0) {
  const k = model.comps.get(c), th = model.teams.get(h), ta = model.teams.get(a), mu = k === undefined ? model.mu0 : model.mu[k], g = neutral ? 0 : k === undefined ? model.g0 : model.g[k];
  const ah = th === undefined ? 0 : model.att[th], dh = th === undefined ? 0 : model.def[th], aa = ta === undefined ? 0 : model.att[ta], da = ta === undefined ? 0 : model.def[ta];
  return { l: Math.exp(mu + ah - da + g), m: Math.exp(mu + aa - dh), nh: th === undefined ? 0 : model.games[th], na: ta === undefined ? 0 : model.games[ta] };
}
