// Iddaa bulteni (Turkiye'de yasal butun bahis sitelerinde ayni olan resmi oranlar): ayristirma, marj temizleme,
// oranlardan gol beklentisi cikarma ve ESPN maclariyla eslestirme. Veri hatti ve telefon ortak kullanir.
export const IDDAA = 'https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0';
export const IDDAA_COMP = 'https://sportsbookv2.iddaa.com/sportsbook/competitions';
export const IDDAA_EVENT = (id) => `https://sportsbookv2.iddaa.com/sportsbook/event/${id}`;   // tek macin butun pazarlari (or. iki yarida KG)

const MK = {   // tip_alttip -> kisa ad ; secenek adlari sirasiyla
  '1_1': ['ms', ['1', '0', '2']], '2_92': ['cs', ['1 ve 0', '1 ve 2', '0 ve 2']], '2_89': ['kg', ['Var', 'Yok']], '2_4': ['tg', ['0-1 gol', '2-3 gol', '4-5 gol', '6+ gol']],
  '2_720': ['iykg', ['Var', 'Yok']], '2_821': ['y2kg', ['Var', 'Yok']], '2_866': ['kk2', ['Evet / Evet', 'Evet / Hayır', 'Hayır / Evet', 'Hayır / Hayır']], '2_88': ['iy', ['1', '0', '2']],
  '2_101': ['ou', ['Alt', 'Üst']], '2_60': ['iou', ['Alt', 'Üst']], '2_603': ['hou', ['Alt', 'Üst']], '2_604': ['aou', ['Alt', 'Üst']], '2_722': ['hiou', ['Alt', 'Üst']], '2_723': ['aiou', ['Alt', 'Üst']],
};
const LINE = new Set(['ou', 'iou', 'hou', 'aou', 'hiou', 'aiou', 'hcp', 'tot', 'h1t', 'h1h', 'qt']);
// basketbol (uzatmalar dahil): mac sonucu, ev sahibine gore handikap, toplam sayi
export const MK_BASKET = { '1_2': ['ms', ['1', '2']], '2_113': ['hcp', ['1', '2']], '2_114': ['tot', ['Alt', 'Üst']],
  '2_116': ['h1t', ['Alt', 'Üst']], '2_115': ['h1h', ['1', '2']], '2_777': ['qt', ['Alt', 'Üst']] };   // ilk yari toplam, ilk yari handikap, ceyrek toplam ('ceyrek|cizgi')
export const IDDAA_BASKET = 'https://sportsbookv2.iddaa.com/sportsbook/events?st=2&type=0&version=0';
/** Bulten olayini sade bicime cevirir (olay listesi ya da tek mac detayi): { io, d (ISO), h, a, lg, mbs, od: { ms:[..], ou:{ '2.5': [alt, ust] }, ... }, mb: { pazar: mbs } } */
export function parseIddaa(ev, comps = new Map(), map = MK) {
  const od = {}, mb = {};
  for (const m of ev.m || []) {
    const def = map[`${m.t}_${m.st}`]; if (!def || m.s === 0) continue;
    const [k, names] = def, by = new Map((m.o || []).map((o) => [String(o.n).trim(), o.odd]));
    const vals = names.map((n) => by.get(n));
    if (vals.some((v) => !(v > 1))) continue;
    if (LINE.has(k)) { (od[k] ||= {})[String(m.sov)] = vals; mb[`${k}${m.sov}`] = m.mbc ?? ev.mbc; }
    else { od[k] = vals; mb[k] = m.mbc ?? ev.mbc; }
  }
  return { io: ev.i, d: new Date(ev.d * 1000).toISOString(), h: ev.hn, a: ev.an, lg: comps.get(ev.ci) || '', mbs: ev.mbc ?? 3, od, mb };
}

/* ---------------- marj temizleme ---------------- */
/**
 * Marji temizlenmis olasiliklar. Us yontemi (sum (1/o)^k = 1) uzak ihtimallerin (or. 6+ gol) fazla fiyatlanmasini duzeltir;
 * iki secenekli pazarlarda us ve oransal yontemin ortalamasi alinir (bultende 1. yari KG gibi pazarlarda marj %20'yi bulabiliyor;
 * Kasim 2026 bulteninde 223 macin ortalamasi gercek orana en yakin bu karisimla cikti). Gercek sonuclar biriktikce ayrica kalibre edilir.
 */
export function fair(odds) {
  const q = odds.map((o) => 1 / o), s = q.reduce((a, b) => a + b, 0); if (!(s > 0)) return null;
  if (s <= 1) return q.map((x) => x / s);
  if (odds.length === 2) { const pw = power(q), pr = q.map((x) => x / s); return pw.map((x, i) => (x + pr[i]) / 2); }
  return power(q);
}
function power(q) {
  let lo = 1, hi = 4;
  for (let i = 0; i < 50; i++) { const k = (lo + hi) / 2, t = q.reduce((a, b) => a + b ** k, 0); if (t > 1) lo = k; else hi = k; }
  const k = (lo + hi) / 2, p = q.map((x) => x ** k), t = p.reduce((a, b) => a + b, 0); return p.map((x) => x / t);
}
export const margin = (odds) => odds.reduce((a, o) => a + 1 / o, 0) - 1;
const pLE = (l, k) => { let t = Math.exp(-l), s = 0; for (let i = 0; i <= k; i++) { s += t; t *= l / (i + 1); } return s; };
/** Alt/Ust cizgisinden (or. 2.5 alt olasiligi) Poisson ortalamasi. */
export function lambdaFromLine(line, pUnder) {
  const k = Math.floor(Number(line)); if (!(pUnder > 0 && pUnder < 1)) return null;
  let lo = 0.001, hi = 12; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (pLE(m, k) > pUnder) lo = m; else hi = m; } return (lo + hi) / 2;
}
/** Birden fazla cizgi varsa dengeli olana (alt/ust ~%50) en cok agirlik verilerek ortalama. */
function lambdaOf(lines) {
  if (!lines) return null; let s = 0, w = 0;
  for (const [ln, v] of Object.entries(lines)) { const f = fair(v); if (!f) continue; const l = lambdaFromLine(ln, f[0]); if (l == null) continue; const wt = 0.05 + f[0] * f[1]; s += l * wt; w += wt; }
  return w ? s / w : null;
}
const pois = (l) => { const a = [Math.exp(-l)]; for (let k = 1; k < 13; k++) a.push((a[k - 1] * l) / k); return a; };
/** Toplam gol ortalamasini 1X2 olasiliklarina gore ev/deplasman diye boler (goalmodel / penaltyblog yontemi, Poisson). */
export function splitLambda(lt, ph, pa) {
  let lo = 0.02, hi = 0.98;
  for (let it = 0; it < 40; it++) {
    const r = (lo + hi) / 2, A = pois(lt * r), B = pois(lt * (1 - r)); let d = 0;
    for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) if (i !== j) d += (i > j ? 1 : -1) * A[i] * B[j];
    if (d < ph - pa) lo = r; else hi = r;
  }
  const r = (lo + hi) / 2; return [lt * r, lt * (1 - r)];
}
const logit = (p) => Math.log(Math.min(0.999, Math.max(0.001, p)) / (1 - Math.min(0.999, Math.max(0.001, p))));
const expit = (z) => 1 / (1 + Math.exp(-z));
/**
 * Oranlardan pazar olasiliklari (marji temizlenmis): 1X2, cifte sans, KG, alt/ust, 6+ gol, iki yarida KG.
 * 6+ gol ve iki yarida KG iki yoldan hesaplanip birlestirilir:
 *  - dogrudan: bultendeki "Toplam Gol 6+" ve "1. ve 2. Yarida KG" oranlari
 *  - cizgilerden: alt/ust cizgilerinden toplam gol ortalamasi, 1X2'den takimlara bolunur, ligin ilk yari gol payiyla yarilara (Poisson).
 *    Bu yol 41.373 maclik arsivde (football-data, Pinnacle kapanis oranlari, 22 lig, 2021-2026) olculdu ve kalibre cikti.
 * f: ligin ilk yari gol payi (yoksa 0,443).
 */
export function marketProbs(od, f = 0.443) {
  const P = {};
  if (od.ms) { const g = fair(od.ms); P['1'] = g[0]; P.X = g[1]; P['2'] = g[2]; P['1X'] = g[0] + g[1]; P['12'] = g[0] + g[2]; P.X2 = g[1] + g[2]; }
  if (od.kg) { const g = fair(od.kg); P.KGV = g[0]; P.KGY = g[1]; }
  if (od.ou) for (const [ln, v] of Object.entries(od.ou)) { const g = fair(v); P[`A${ln}`] = g[0]; P[`U${ln}`] = g[1]; }
  if (od.iou) for (const [ln, v] of Object.entries(od.iou)) { const g = fair(v); P[`IA${ln}`] = g[0]; P[`IU${ln}`] = g[1]; }
  const sc = (l) => 1 - Math.exp(-Math.max(0.02, l));
  // cizgilerden turetilen
  const lt = lambdaOf(od.ou);
  if (lt != null) {
    P.lt = lt; const G = pois(lt); P.G6d = 1 - G.slice(0, 6).reduce((a, b) => a + b, 0); P.U35d = 1 - G.slice(0, 4).reduce((a, b) => a + b, 0);
    if (od.ms) {
      const [lh, la] = splitLambda(lt, P['1'], P['2']); P.xg = [lh, la];
      P.KK2d = sc(lh * f) * sc(la * f) * sc(lh * (1 - f)) * sc(la * (1 - f)); P.KGVd = sc(lh) * sc(la);
    }
  }
  // dogrudan pazarlar
  if (od.tg) { const g = fair(od.tg); P.G6m = g[3]; P.tg = g; }
  if (od.kk2) P.KK2m = fair(od.kk2)[0];
  else {
    const lh = lambdaOf(od.hou), la = lambdaOf(od.aou), lh1 = lambdaOf(od.hiou), la1 = lambdaOf(od.aiou);
    const p1 = od.iykg ? fair(od.iykg)[0] : lh1 != null && la1 != null ? sc(lh1) * sc(la1) : null;
    let p2 = od.y2kg ? fair(od.y2kg)[0] : null;
    if (p2 == null && lh != null && la != null && lh1 != null && la1 != null) p2 = sc(lh - lh1) * sc(la - la1);
    if (p1 != null && p2 != null) P.KK2m = p1 * p2;
  }
  const mix = (a, b) => (a != null && b != null ? expit((logit(a) + logit(b)) / 2) : a ?? b ?? null);
  P.G6 = mix(P.G6m, P.G6d); P.KK2 = mix(P.KK2m, P.KK2d);
  if (P['U3.5'] == null && P.U35d != null) P['U3.5'] = P.U35d;
  if (P.KGV == null && P.KGVd != null) P.KGV = P.KGVd;
  return P;
}

/* ---------------- ESPN ile eslestirme ---------------- */
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', é: 'e', è: 'e', á: 'a', à: 'a', ã: 'a', â: 'a', í: 'i', ó: 'o', õ: 'o', ú: 'u', ñ: 'n', ø: 'o', å: 'a', ä: 'a', ë: 'e', ï: 'i', ć: 'c', č: 'c', ž: 'z', š: 's', ł: 'l', ș: 's', ț: 't', ý: 'y', ř: 'r' };
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'fk', 'sk', 'cd', 'club', 'de', 'the', 'and', 'ca', 'cs', 'as', 'ss', 'us', 'sv', 'if', 'bk', 'ik', 'fs', 'kv', 'rc', 'cr', 'se', 'ec', 'sd', 'ud', 'rcd', 'real', 'city', 'united', 'utd', 'town', 'spor', 'kulubu', 'jk', 'nk', 'hnk', 'gnk', 'pfc', 'fsv', 'vfl', 'vfb', 'tsv', 'bv', 'al', 'el', 'la', 'le', 'calcio', 'football', 'futbol', 'atletico', 'sporting', 'deportivo', 'club', 'cp']);
export function normName(s) {
  return String(s || '').toLowerCase().replace(/[çğıöşüéèáàãâíóõúñøåäëïćčžšłșțýř]/g, (c) => TR[c] || c).replace(/&/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const toks = (s) => normName(s).split(' ').filter((t) => t && !STOP.has(t));
const bigr = (s) => { const t = normName(s).replace(/ /g, ''), b = new Set(); for (let i = 0; i < t.length - 1; i++) b.add(t.slice(i, i + 2)); return b; };
/** Iki takim adi benzerligi 0..1 (kelime ortakligi, kisaltma/on ek ve harf ikilileri). */
export function nameSim(a, b) {
  const na = normName(a), nb = normName(b); if (!na || !nb) return 0; if (na === nb) return 1;
  const ta = toks(a), tb = toks(b);
  let tok = 0;
  if (ta.length && tb.length) {
    let hit = 0; for (const x of ta) if (tb.some((y) => y === x || (x.length >= 4 && y.length >= 4 && (y.startsWith(x) || x.startsWith(y))))) hit++;
    tok = hit / Math.min(ta.length, tb.length) * (0.7 + 0.3 * hit / Math.max(ta.length, tb.length));
  }
  const A = bigr(a), B = bigr(b); let c = 0; for (const x of A) if (B.has(x)) c++; const dice = A.size + B.size ? (2 * c) / (A.size + B.size) : 0;
  const youth = (s) => (/\bu(17|18|19|20|21|23)\b|\bii\b|\bb\b|reserves?|women|kadin|\bw\b/.test(normName(s)) ? 1 : 0);
  const pen = youth(a) !== youth(b) ? 0.5 : 1;
  return Math.max(tok, dice) * pen;
}
/** Iddaa olaylarini ESPN maclarina baglar (baslama saati +-20 dk ve iki takim adi). Donus: Map(espnId -> iddaa olayi). */
export function matchEvents(espn, iddaa) {
  const out = new Map(), used = new Set(), byT = new Map();
  for (const e of iddaa) { const k = Math.round(Date.parse(e.d) / 6e5); for (let j = -2; j <= 2; j++) { (byT.get(k + j) || byT.set(k + j, []).get(k + j)).push(e); } }
  const cands = [];
  for (const m of espn) {
    const k = Math.round(Date.parse(m.t) / 6e5);
    for (const e of byT.get(k) || []) {
      const sh = nameSim(m.h, e.h), sa = nameSim(m.a, e.a), s = sh + sa;
      if ((sh >= 0.5 && sa >= 0.5) || (Math.max(sh, sa) >= 0.85 && Math.min(sh, sa) >= 0.3)) cands.push([s, m.id, e]);
    }
  }
  cands.sort((x, y) => y[0] - x[0]);
  for (const [, id, e] of cands) { if (out.has(id) || used.has(e.io)) continue; out.set(id, e); used.add(e.io); }
  return out;
}
