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
const LINE = new Set(['ou', 'iou', 'hou', 'aou', 'hiou', 'aiou']);
/** Bulten olayini sade bicime cevirir (olay listesi ya da tek mac detayi): { io, d (ISO), h, a, lg, mbs, od: { ms:[..], ou:{ '2.5': [alt, ust] }, ... }, mb: { pazar: mbs } } */
export function parseIddaa(ev, comps = new Map()) {
  const od = {}, mb = {};
  for (const m of ev.m || []) {
    const def = MK[`${m.t}_${m.st}`]; if (!def || m.s === 0) continue;
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
/**
 * Oranlardan pazar olasiliklari (marji temizlenmis): 1X2, cifte sans, KG, toplam gol araligi, 6+ gol,
 * iki yarida da karsilikli gol (dogrudan pazar yoksa takim ve ilk yari gol cizgilerinden).
 */
export function marketProbs(od) {
  const P = {};
  if (od.ms) { const f = fair(od.ms); P['1'] = f[0]; P.X = f[1]; P['2'] = f[2]; P['1X'] = f[0] + f[1]; P['12'] = f[0] + f[2]; P.X2 = f[1] + f[2]; }
  if (od.kg) { const f = fair(od.kg); P.KGV = f[0]; P.KGY = f[1]; }
  if (od.ou) for (const [ln, v] of Object.entries(od.ou)) { const f = fair(v); P[`A${ln}`] = f[0]; P[`U${ln}`] = f[1]; }
  if (od.iou) for (const [ln, v] of Object.entries(od.iou)) { const f = fair(v); P[`IA${ln}`] = f[0]; P[`IU${ln}`] = f[1]; }
  if (od.tg) { const f = fair(od.tg); P.G6 = f[3]; P.tg = f; }
  const lh = lambdaOf(od.hou), la = lambdaOf(od.aou), lh1 = lambdaOf(od.hiou), la1 = lambdaOf(od.aiou), sc = (l) => 1 - Math.exp(-Math.max(0.02, l));
  if (lh != null && la != null) P.xg = [lh, la];
  let p1 = od.iykg ? fair(od.iykg)[0] : lh1 != null && la1 != null ? sc(lh1) * sc(la1) : null, p2 = od.y2kg ? fair(od.y2kg)[0] : null;
  if (p2 == null && lh != null && la != null && lh1 != null && la1 != null) p2 = sc(lh - lh1) * sc(la - la1);
  if (od.kk2) P.KK2 = fair(od.kk2)[0]; else if (p1 != null && p2 != null) P.KK2 = p1 * p2;
  if (P.G6 == null) { const lt = lambdaOf(od.ou); if (lt != null) P.G6 = 1 - pLE(lt, 5); }
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
