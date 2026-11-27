// Gunluk: iddaa bulteninin gercek oranlariyla gunluk banko kombine (toplam oran 1,35-1,45), 6+ gol ve
// iki yarida karsilikli gol listeleri. Her gun bir kez, maclar baslamadan dondurulur; ertesi gun sonuclari islenir.
// Ayrica her macin mac oncesi son oranlari saklanir (f/oran.json): sonuc biriktikce oran olasiliklari kalibre edilir.
import { IDDAA, IDDAA_COMP, IDDAA_EVENT, parseIddaa, matchEvents, fair, marketProbs } from '../web/src/oran.js';
import { isotonic, calib, footLegs } from '../web/src/kombine.js';
import { summarize } from './ozet.mjs';
import { consensus } from './konsensus.mjs';

const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const istDay = (t) => new Date(Date.parse(t) + 3 * 36e5).toISOString().slice(0, 10);   // Turkiye saati (UTC+3, yaz saati yok)
const ln = (x) => String(x).replace('.', ',');

/** Banko icin secenekler: oran, marji temizlenmis olasilik, sonuc kurali. */
function marketLegs(od) {
  const out = [], P = marketProbs(od), add = (mk, label, odd, pm, hit, fam, mbKey, ht = false) => { if (odd > 1 && pm > 0) out.push({ mk, label, odd, pm, hit, fam, mbKey, ht }); };
  if (od.ms) { add('1', 'MS 1', od.ms[0], P['1'], (h, a) => h > a, 'MS', 'ms'); add('2', 'MS 2', od.ms[2], P['2'], (h, a) => h < a, 'MS', 'ms'); }
  if (od.cs) { add('1X', 'ÇŞ 1-X', od.cs[0], P['1X'], (h, a) => h >= a, 'CS', 'cs'); add('12', 'ÇŞ 1-2', od.cs[1], P['12'], (h, a) => h !== a, 'CS', 'cs'); add('X2', 'ÇŞ X-2', od.cs[2], P.X2, (h, a) => h <= a, 'CS', 'cs'); }
  if (od.kg) { add('KGV', 'KG Var', od.kg[0], P.KGV, (h, a) => h > 0 && a > 0, 'KG', 'kg'); add('KGY', 'KG Yok', od.kg[1], P.KGY, (h, a) => !(h > 0 && a > 0), 'KG', 'kg'); }
  for (const [l, v] of Object.entries(od.ou || {})) { const n = Number(l); add(`A${l}`, `${ln(l)} Alt`, v[0], P[`A${l}`], (h, a) => h + a < n, 'OU', `ou${l}`); add(`U${l}`, `${ln(l)} Üst`, v[1], P[`U${l}`], (h, a) => h + a > n, 'OU', `ou${l}`); }
  for (const [l, v] of Object.entries(od.iou || {})) { const n = Number(l); add(`IA${l}`, `İY ${ln(l)} Alt`, v[0], P[`IA${l}`], (h, a, h1, a1) => h1 + a1 < n, 'IOU', `iou${l}`, true); add(`IU${l}`, `İY ${ln(l)} Üst`, v[1], P[`IU${l}`], (h, a, h1, a1) => h1 + a1 > n, 'IOU', `iou${l}`, true); }
  return out;
}
const MODEL_KEY = { '1': '1', '2': '2', '1X': '1X', X2: 'X2', 'A2.5': 'A', 'U2.5': 'U', KGV: 'KGV', KGY: 'KGY' };
const legRule = (mk) => {
  const L = marketLegs({ ms: [2, 3, 4], cs: [1.2, 1.3, 1.4], kg: [1.8, 1.9], ou: { [mk.replace(/^I?[AU]/, '')]: [1.9, 1.9] }, iou: { [mk.replace(/^I?[AU]/, '')]: [1.9, 1.9] } });
  return L.find((l) => l.mk === mk);
};
const SPECIAL = {
  G6: { key: 'g6', hit: (h, a) => h + a >= 6, ht: false, odd: (od) => od.tg?.[3] },
  KK2: { key: 'kk2', hit: (h, a, h1, a1) => h1 > 0 && a1 > 0 && h - h1 > 0 && a - a1 > 0, ht: true, odd: (od) => od.kk2?.[0] },
  'U3.5': { key: 'u35', hit: (h, a) => h + a >= 4, ht: false, odd: (od) => od.ou?.['3.5']?.[1] },
  KGV: { key: 'kgv', hit: (h, a) => h > 0 && a > 0, ht: false, odd: (od) => od.kg?.[0] },
  IYKG: { key: 'iykg', hit: (h, a, h1, a1) => h1 > 0 && a1 > 0, ht: true, odd: (od) => od.iykg?.[0] },
  IU05: { key: 'iu05', hit: (h, a, h1, a1) => h1 + a1 >= 1, ht: true, odd: (od) => od.iou?.['0.5']?.[1] },
  IU15: { key: 'iu15', hit: (h, a, h1, a1) => h1 + a1 >= 2, ht: true, odd: (od) => od.iou?.['1.5']?.[1] },
};
export const LIST_KEYS = Object.values(SPECIAL).map((S) => S.key);

/** Kombine: 2-3 secim, farkli maclar, toplam oran [lo, hi], MBS kurali; tutma olasiligi en yuksek olan. */
export function bestCombo(legs, lo = 1.35, hi = 1.45, minLegs = 2) {
  const C = legs.filter((l) => l.odd >= 1.08 && l.odd <= hi && l.p >= 0.62).sort((a, b) => b.p - a.p).slice(0, 90);
  let best = null;
  const consider = (ls) => {
    const odds = ls.reduce((s, l) => s * l.odd, 1); if (odds < lo || odds > hi) return;
    if (Math.max(...ls.map((l) => l.mbs)) > ls.length) return;
    const p = ls.reduce((s, l) => s * l.p, 1), ev = p * odds;
    if (!best || p > best.p + 1e-9 || (Math.abs(p - best.p) < 1e-9 && ev > best.ev)) best = { legs: ls, odds, p, ev };
  };
  if (minLegs <= 1) for (const l of C) consider([l]);
  for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
    if (C[i].id === C[j].id) continue; consider([C[i], C[j]]);
    for (let k = j + 1; k < C.length; k++) { if (C[k].id === C[i].id || C[k].id === C[j].id) continue; consider([C[i], C[j], C[k]]); }
  }
  return best;
}

export async function gunluk({ get, pool, readJson, writeJson, NOW, matches, cal, ev, leagues }) {
  const V = 2, now = NOW.getTime(), today = istDay(NOW.toISOString());
  const G = readJson('f/gunluk.json', null), store = G && G.v === V ? G : { v: V, days: {}, start: today };
  const hist = readJson('f/oran.json', { v: 2, ev: {} });
  // 1) bulten
  let iddaa = [];
  try {
    const [j, c] = await Promise.all([get(IDDAA), get(IDDAA_COMP)]);
    const comps = new Map((c?.data || []).map((x) => [x.i, x.n]));
    iddaa = (j?.data?.events || []).filter((e) => e.d * 1000 > now + 5 * 6e4).map((e) => parseIddaa(e, comps)).filter((e) => Object.keys(e.od).length);   // yalnizca baslamamis maclar (canli oranlar alinmaz)
  } catch (e) { console.warn('gunluk: iddaa', e.message); }
  const pairs = matchEvents(matches, iddaa);
  console.log(`gunluk: iddaa ${iddaa.length} mac, ESPN ile eslesen ${pairs.size}`);
  // 2) maclara oran ekle (telefonda gosterilir) ve mac oncesi son oranlari sakla
  const snap = (od) => [od.ms?.[0], od.ms?.[1], od.ms?.[2], od.ou?.['2.5']?.[1], od.ou?.['2.5']?.[0], od.kg?.[0], od.kg?.[1]].map((x) => x ?? null);
  let cons = new Map(); try { cons = await consensus(get, matches.filter((m) => m.st === 'pre' && pairs.has(m.id))); } catch (e) { console.warn('konsensus', e.message); }
  for (const m of matches) {
    const e = pairs.get(m.id); if (!e) continue;
    m.od = e.od; m.io = e.io; const c = cons.get(m.id); if (c) m.pc = c;
    if (m.st !== 'pre') continue;
    const h0 = hist.ev[m.id], v = snap(e.od), s = h0?.s ? h0.s.slice() : h0?.od0 ? [[(h0.t0 || NOW.toISOString()).slice(0, 16), ...snap(h0.od0)]] : [];   // eski kayitlarda acilis od0'dan
    if (!s.length || JSON.stringify(s[s.length - 1].slice(1)) !== JSON.stringify(v)) s.push([NOW.toISOString().slice(0, 16), ...v]);
    while (s.length > 30) s.splice(1, 1);                                     // ilk (acilis) kalir, aradakiler seyrelir
    const q = m.pr ? Object.fromEntries(footLegs({ ...m, f: leagues[m.lg]?.f }, cal).map((l) => [l.mk, r3(l.q)])) : h0?.q || null;
    hist.ev[m.id] = { t: m.t, lg: m.lg, h: m.h, a: m.a, io: e.io, od: e.od, od0: h0?.od0 || e.od, t0: h0?.t0 || NOW.toISOString(), s, q, pc: c || h0?.pc || null };   // od0: ilk gorulen oranlar
  }
  for (const [id, h] of Object.entries(hist.ev)) if (Date.parse(h.t) < now - 120 * 864e5) delete hist.ev[id];
  writeJson('f/oran.json', hist);

  // 3) oran olasiliklarinin kalibrasyonu (sonucu belli, mac oncesi orani saklanan maclar)
  const res = (id) => { const r = ev[id]; if (!r) return null; const aet = r[10]; return [aet ? r[11] : r[5], aet ? r[12] : r[6], r[7], r[8]]; };
  const samples = {};
  for (const [id, h] of Object.entries(hist.ev)) {
    const sc = res(id); if (!sc) continue;
    for (const l of marketLegs(h.od)) { if (l.ht && sc[2] == null) continue; (samples[l.fam] ||= []).push([l.pm, l.hit(...sc) ? 1 : 0]); }
    const P = marketProbs(h.od, leagues[h.lg]?.f);
    for (const [k, S] of Object.entries(SPECIAL)) if (P[k] != null && !(S.ht && sc[2] == null)) (samples[k] ||= []).push([P[k], S.hit(...sc) ? 1 : 0]);
  }
  const mcal = {}; for (const [k, s] of Object.entries(samples)) mcal[k] = { n: s.length, knots: s.length >= 400 ? isotonic(s, 50) : null };
  const P = (fam, p) => (mcal[fam]?.knots ? calib(mcal[fam].knots, p) : p);

  // 4) bugunun kombinesi ve listeleri (bir kez kurulur, sonra degismez)
  const htLeague = new Map(); { const c = {}; for (const r of Object.values(ev)) { const o = (c[r[1]] ||= [0, 0]); o[0]++; if (r[7] != null) o[1]++; } for (const [k, [n, h]] of Object.entries(c)) htLeague.set(k, n >= 10 && h / n >= 0.8); }
  const day = (store.days[today] ||= { d: today }), early = new Date(now + 3 * 36e5).getUTCHours() < 7;   // 07:00'den once kurulmaz (oranlar gun icinde oturur)
  const upcoming = matches.filter((m) => m.od && m.st === 'pre' && istDay(m.t) === today && Date.parse(m.t) > now + 20 * 6e4 && !leagues[m.lg]?.nat);
  // listeler kurulacaksa: aday maclarin butun pazarlari (iki yarida KG ve 2. yari KG yalnizca mac detayinda var)
  if ((!day.g6 || !day.kk2 || !day.iykg) && upcoming.length && pool && !early) {
    const score = (m) => { const P0 = marketProbs(m.od, leagues[m.lg]?.f); return Math.max(P0.G6 || 0, (P0.KK2 || 0) * 1.5, (P0['U2.5'] || 0) * 0.2, (P0.IYKGd || 0) * 0.6); };
    const cand = upcoming.slice().sort((x, y) => score(y) - score(x)).slice(0, 60);
    const det = await pool(cand, 4, async (m) => { try { const j = await get(IDDAA_EVENT(m.io)); return j?.data ? [m, parseIddaa(j.data)] : null; } catch { return null; } });
    let n = 0; for (const x of det) { if (!x) continue; const [m, d] = x; m.od = { ...m.od, ...d.od }; if (hist.ev[m.id]) hist.ev[m.id].od = m.od; n++; }
    writeJson('f/oran.json', hist); console.log(`gunluk: ${n} mac detayi alindi`);
  }
  if (!day.combo && upcoming.length && !early) {
    const legs = [];
    for (const m of upcoming) {
      const model = m.pr ? Object.fromEntries(footLegs({ ...m, f: leagues[m.lg]?.f }, cal).map((l) => [l.mk, l.q])) : {};
      const L0 = hist.ev[m.id]?.od0 ? marketLegs(hist.ev[m.id].od0) : [];
      for (const l of marketLegs(m.od)) {
        const l0 = L0.find((x) => x.mk === l.mk);
        const pc = m.pc?.p?.[l.mk] ?? null, pm = pc != null ? (P(l.fam, l.pm) + pc) / 2 : P(l.fam, l.pm), q = model[MODEL_KEY[l.mk]] ?? null;   // Pinnacle/ortalama varsa iddaa ile ortalanir
        if (l.ht && !htLeague.get(m.lg)) continue;
        if (q != null && q < pm - 0.08) continue;                       // model acikca karsi cikiyorsa alinmaz
        const p = q != null ? 0.75 * pm + 0.25 * q : pm;
        legs.push({ id: m.id, io: m.io, t: m.t, lg: m.lg, ln: leagues[m.lg]?.name, h: m.h, a: m.a, mk: l.mk, label: l.label, odd: l.odd, mbs: m.od && (iddaa.find((e) => e.io === m.io)?.mb?.[l.mbKey] ?? 3), pm: r3(pm), q: r3(q), p: r3(p), pc: r3(pc), ev: r3(p * l.odd - 1), mv: l0 ? r3(l.odd / l0.odd - 1) : null });
      }
    }
    const b = bestCombo(legs);
    if (b) { day.combo = { built: NOW.toISOString(), odds: r3(b.odds), p: r3(b.p), legs: b.legs.map((l) => ({ ...l, res: null })) }; console.log('gunluk kombine:', JSON.stringify(day.combo)); }
  }
  const move = (m) => { const a = hist.ev[m.id]?.od0?.ou?.['2.5']?.[1], b = m.od?.ou?.['2.5']?.[1]; return a && b ? r3(b / a - 1) : null; };   // 2,5 ust oraninin ilk gorulenden degisimi
  for (const [k, S] of Object.entries(SPECIAL)) {
    const key = S.key; if (day[key] || !upcoming.length || early) continue;
    const L = upcoming.filter((m) => !(S.ht && !htLeague.get(m.lg))).map((m) => { const pr = marketProbs(m.od, leagues[m.lg]?.f); if (pr[k] == null) return null;
      return { id: m.id, io: m.io, mk: k, t: m.t, lg: m.lg, ln: leagues[m.lg]?.name, h: m.h, a: m.a, p: r3(P(k, pr[k])), pm: r3(pr[k + 'm'] ?? null), pd: r3(pr[k + 'd'] ?? null), odd: S.odd(m.od) ?? null, mv: move(m), res: null }; })
      .filter(Boolean).sort((x, y) => y.p - x.p).slice(0, 10);
    if (L.length >= 7) day[key] = { built: NOW.toISOString(), legs: L };
  }

  // 4b) kapanis orani: baslamamis secimlerin guncel oranı her calismada yazilir; mac baslayinca son deger kapanis olur
  const byIo = new Map(iddaa.map((e) => [e.io, e]));
  for (const d of Object.values(store.days)) {
    const upd = (l, oddOf) => { if (Date.parse(l.t) <= now || !l.io) return; const e = byIo.get(l.io); if (!e) return; const o = oddOf(e.od); if (o > 1) { l.close = o; l.closeAt = NOW.toISOString().slice(0, 16); } };
    if (d.combo) for (const l of d.combo.legs) upd(l, (od) => marketLegs(od).find((x) => x.mk === l.mk)?.odd);
    for (const S of Object.values(SPECIAL)) if (d[S.key]) for (const l of d[S.key].legs) upd(l, S.odd);
  }
  // 4c) oran hareketi dosyasi (telefondaki "Oran hareketi" sekmesi): son 30 saat ve onumuzdeki 48 saat
  const mv = [];
  for (const [id, h] of Object.entries(hist.ev)) {
    const t = Date.parse(h.t); if (t < now - 30 * 36e5 || t > now + 48 * 36e5 || !h.s?.length) continue;
    mv.push({ id, io: h.io, t: h.t, lg: h.lg, ln: leagues[h.lg]?.name || h.lg, h: h.h, a: h.a, s: h.s, q: h.q, pc: h.pc?.p ? Object.fromEntries(Object.entries(h.pc.p).map(([k, v]) => [k, r3(v)])) : null, src: h.pc?.src || null, sc: res(id) });
  }
  writeJson('f/hareket.json', { v: 2, updated: NOW.toISOString(), list: mv.sort((x, y) => (x.t < y.t ? -1 : 1)) });
  writeJson('f/oran.json', hist);

  // 5) sonuclari isle
  const gunM = new Map(matches.map((m) => [m.id, m]));
  for (const d of Object.values(store.days)) {
    const settle = (l, hitF, needHt) => {
      if (l.res) return;
      const sc = res(l.id), gm = gunM.get(l.id);
      if (gm && /POSTP|CANC|ABAND|SUSP/i.test(gm.sn || '')) { l.res = 'V'; return; }
      if (!sc) { if (Date.parse(l.t) < now - 3 * 864e5) l.res = 'V'; return; }
      if (needHt && sc[2] == null) { l.res = 'V'; return; }
      l.sc = sc; l.res = hitF(...sc) ? 'W' : 'L';
    };
    if (d.combo) { for (const l of d.combo.legs) { const R = legRule(l.mk); settle(l, R.hit, R.ht); }
      const rs = d.combo.legs.map((l) => l.res); d.combo.res = rs.includes('L') ? 'L' : rs.every((r) => r === 'W' || r === 'V') ? (rs.every((r) => r === 'V') ? 'V' : 'W') : null; }
    for (const [k, S] of Object.entries(SPECIAL)) { const key = S.key; if (!d[key]) continue; for (const l of d[key].legs) settle(l, S.hit, S.ht);
      const top = d[key].legs.slice(0, 7); d[key].hits = top.filter((l) => l.res === 'W').length; d[key].done = top.every((l) => l.res); d[key].exp = r3(top.reduce((s, l) => s + l.p, 0)); }
  }
  for (const d of Object.keys(store.days)) if (d < istDay(new Date(now - 45 * 864e5).toISOString())) delete store.days[d];
  // 6) ozet: deneme (ilk kombineden bugune), seri
  const ds = Object.keys(store.days).sort(), done = ds.map((d) => store.days[d].combo).filter((c) => c && c.res && c.res !== 'V');
  let streak = 0; for (let i = done.length - 1; i >= 0 && done[i].res === 'W'; i--) streak++;
  let best = 0, run = 0; for (const c of done) { run = c.res === 'W' ? run + 1 : 0; best = Math.max(best, run); }
  const lists = (key) => { const L = ds.map((d) => store.days[d][key]).filter((x) => x && x.done); return { days: L.length, hits: L.reduce((s, x) => s + x.hits, 0), exp: r3(L.reduce((s, x) => s + x.exp, 0)) }; };
  store.sum = { combo: { days: done.length, won: done.filter((c) => c.res === 'W').length, exp: r3(done.reduce((s, c) => s + c.p, 0)), streak, best }, ...Object.fromEntries(LIST_KEYS.map((k) => [k, lists(k)])) };
  store.ozet = summarize(store.days, LIST_KEYS);
  store.cal = Object.fromEntries(Object.entries(mcal).map(([k, o]) => [k, { n: o.n, on: !!o.knots }]));
  store.updated = NOW.toISOString();
  writeJson('f/gunluk.json', store);
  console.log('gunluk ozet:', JSON.stringify(store.sum), 'kalibrasyon:', JSON.stringify(store.cal));
}
