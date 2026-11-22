// Futbol: ESPN'in 220 lig/kupasindan sonuclar (devre skoruyla), fikstur ve tahminler. veri.mjs tarafindan cagrilir.
// Cikti: f/gun.json (dun, bugun, yarin ve sonraki gun maclari + tahminler), f/karne.json (tahminlerin gercek isabeti).
// Ara depo: f/sezon.json (bitmis maclar), f/tahmin.json (mac oncesi kaydedilen tahminler; isabet olcumu icin).
import { fitGlobal, predictMatch, rates, halfShare } from '../web/src/dcglobal.js';
import * as F from '../web/src/football.js';
import { parseEvents } from '../web/src/espn.js';
import { isotonic, footLegs, couponTest, FMK } from '../web/src/kombine.js';
export { parseEvents };

const S = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const NATIONAL = /^(fifa\.(world|worldq|wcq|friendly$|concacaf|conmebol)|uefa\.(nations|euroq|euro$)|caf\.nations|concacaf\.(nations|gold|confed)|conmebol\.america$|afc\.(asian\.cup$|cupq)|global\.(finalissima|gulf_cup|arnold))/;
const NO_MODEL = /(\.w\.|\.w$|wworld|wwc|womens|femenina|weuro|wchampions|shebelieves|pinatar|u17|u19|u20|u21|u23|olympic|ncaa|club\.friendly|friendly\.|nonfifa|joan_gamper|charity|super_cup|supercup|campeon|trofeo)/;
const MODEL_SKIP = /(club\.friendly|friendly\.|nonfifa|joan_gamper|charity|emirates|global\.)/;
const COUNTRY = { eng: 'İngiltere', esp: 'İspanya', ger: 'Almanya', ita: 'İtalya', fra: 'Fransa', ned: 'Hollanda', por: 'Portekiz', tur: 'Türkiye', sco: 'İskoçya', bel: 'Belçika', aut: 'Avusturya',
  den: 'Danimarka', swe: 'İsveç', nor: 'Norveç', gre: 'Yunanistan', rus: 'Rusya', uefa: 'Avrupa (UEFA)', fifa: 'Dünya (FIFA)', caf: 'Afrika', concacaf: 'Kuzey/Orta Amerika', conmebol: 'Güney Amerika', afc: 'Asya',
  aff: 'Asya', usa: 'ABD', mex: 'Meksika', bra: 'Brezilya', arg: 'Arjantin', chi: 'Şili', col: 'Kolombiya', uru: 'Uruguay', par: 'Paraguay', per: 'Peru', ecu: 'Ekvador', bol: 'Bolivya', ven: 'Venezuela',
  jpn: 'Japonya', chn: 'Çin', ksa: 'Suudi Arabistan', ind: 'Hindistan', aus: 'Avustralya', rsa: 'Güney Afrika', can: 'Kanada', crc: 'Kosta Rika', gua: 'Guatemala', hon: 'Honduras', slv: 'El Salvador', global: 'Dünya', club: 'Dünya' };
const TR_NAMES = { 'tur.1': 'Süper Lig', 'eng.1': 'Premier League', 'eng.2': 'Championship', 'eng.3': 'League One', 'eng.4': 'League Two', 'eng.5': 'National League', 'eng.fa': 'FA Cup', 'eng.league_cup': 'Lig Kupası',
  'esp.1': 'La Liga', 'esp.2': 'La Liga 2', 'esp.copa_del_rey': 'Kral Kupası', 'ger.1': 'Bundesliga', 'ger.2': '2. Bundesliga', 'ger.dfb_pokal': 'DFB Kupası', 'ita.1': 'Serie A', 'ita.2': 'Serie B', 'ita.coppa_italia': 'İtalya Kupası',
  'fra.1': 'Ligue 1', 'fra.2': 'Ligue 2', 'ned.1': 'Eredivisie', 'ned.2': 'Eerste Divisie', 'por.1': 'Primeira Liga', 'sco.1': 'Premiership', 'uefa.champions': 'Şampiyonlar Ligi', 'uefa.europa': 'Avrupa Ligi',
  'uefa.europa.conf': 'Konferans Ligi', 'uefa.nations': 'UEFA Uluslar Ligi', 'uefa.euroq': 'EURO Elemeleri', 'uefa.euro_u21_qual': 'U21 EURO Elemeleri', 'uefa.euro.u19': 'U19 EURO', 'fifa.friendly': 'Hazırlık Maçları (milli)',
  'fifa.worldq.uefa': 'Dünya Kupası Elemeleri (Avrupa)', 'caf.nations_qual': 'Afrika Uluslar Kupası Elemeleri', 'concacaf.nations.league': 'CONCACAF Uluslar Ligi', 'conmebol.libertadores': 'Copa Libertadores',
  'conmebol.sudamericana': 'Copa Sudamericana', 'usa.1': 'MLS', 'mex.1': 'Liga MX', 'bra.1': 'Brasileirão', 'arg.1': 'Liga Profesional', 'jpn.1': 'J1 League', 'ksa.1': 'Suudi Pro Lig', 'club.friendly': 'Kulüp Hazırlık Maçları' };
const PRIORITY = ['tur.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'uefa.nations', 'fifa.worldq.uefa', 'uefa.euroq', 'eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'ned.1', 'por.1', 'fifa.friendly'];

const ymd = (d) => d.toISOString().slice(0, 10);
const key = (d) => ymd(d).replace(/-/g, '');
const r3 = (x) => Math.round(x * 1000) / 1000;
export async function futbol({ get, pool, readJson, writeJson, NOW, milliGames, alias }) {
  const V = 2, today = new Date(NOW), D = (n) => new Date(today.getTime() + n * 864e5);
  const prev = readJson('f/sezon.json', null), db = prev && prev.v === V ? prev : { v: V, leagues: {}, done: {}, ev: {} };
  const preds = readJson('f/tahmin.json', { v: V, p: {} }); if (preds.v !== V) preds.p = {};
  const dd = await get('https://site.api.espn.com/apis/site/v2/leagues/dropdown?sport=soccer&limit=1000');
  const leagues = (dd?.leagues || []).map((l) => ({ slug: l.slug, name: l.name || l.shortName || l.slug })).filter((l) => l.slug);
  if (!leagues.length) { console.warn('futbol: lig listesi alinamadi'); return null; }
  // 1) her ligin takvimi
  const heads = await pool(leagues, 8, async (l) => ({ l, j: await get(S + l.slug + '/scoreboard') }));
  const win = []; for (let i = -2; i <= 3; i++) win.push(key(D(i)));
  const jobs = [], from = key(D(-400)), histTo = key(D(-2));
  for (const { l, j } of heads) {
    const L = j?.leagues?.[0]; if (!L) continue;
    const nat = NATIONAL.test(l.slug); db.leagues[l.slug] = { name: TR_NAMES[l.slug] || l.name, en: l.name, nat: nat ? 1 : 0 };
    const done = new Set(db.done[l.slug] || []), cal = L.calendarType === 'day' ? (L.calendar || []).map((c) => String(c).slice(0, 10).replace(/-/g, '')) : null;
    const want = new Set();
    if (cal) { for (const k of cal) if ((win.includes(k)) || (k >= from && k <= histTo && !done.has(k))) want.add(k); }
    else {
      for (const k of win) want.add(k);
      if (!nat) { const st = Date.parse(L.season?.startDate || ''), start = Math.max(Number.isFinite(st) ? st : 0, D(-150).getTime());
        for (let t = start; t <= D(-2).getTime(); t += 864e5) { const k = key(new Date(t)); if (!done.has(k)) want.add(k); } }
    }
    for (const k of want) jobs.push([l.slug, k]);
  }
  console.log(`futbol: ${leagues.length} lig, ${jobs.length} gun istegi`);
  // 2) gunler
  const res = await pool(jobs, 8, async ([slug, k]) => ({ slug, k, j: await get(`${S}${slug}/scoreboard?dates=${k}`) }));
  const window = [];
  for (const { slug, k, j } of res) {
    if (!j) continue;
    const evs = parseEvents(j, slug, k);
    for (const e of evs) { if (e.st === 'post' && e.sc && !/POSTP|CANCEL|ABANDON|FORFEIT|DELAY/i.test(e.sn)) db.ev[e.id] = [e.k, e.lg, e.t, e.hid, e.aid, e.sc[0], e.sc[1], e.ht ? e.ht[0] : null, e.ht ? e.ht[1] : null, e.n, e.aet ? 1 : 0, e.ft90 ? e.ft90[0] : null, e.ft90 ? e.ft90[1] : null, e.h, e.a]; }
    if (win.includes(k)) window.push(...evs);
    const fin = evs.every((e) => e.st === 'post' || /POSTP|CANCEL/i.test(e.sn));
    if (fin && k <= histTo) db.done[slug] = [...new Set([...(db.done[slug] || []), k])];
  }
  // eski maclari at (400 gun)
  for (const [id, r] of Object.entries(db.ev)) if (r[0] < from) delete db.ev[id];
  writeJson('f/sezon.json', db);

  // 3) model: kulup maclari (kuresel), milli maclar (8 yillik acik veri)
  const dayOf = (iso) => Date.parse(iso) / 864e5, rows = Object.entries(db.ev).map(([id, r]) => ({ id, k: r[0], c: r[1], day: dayOf(r[2]), h: r[3], a: r[4], hg: r[10] ? r[11] : r[5], ag: r[10] ? r[12] : r[6], h1: r[7], a1: r[8], n: r[9] }));
  const clubRows = rows.filter((m) => !(NATIONAL.test(m.c) && !NO_MODEL.test(m.c)) && !MODEL_SKIP.test(m.c) && m.hg != null && m.ag != null);
  const fit = (upto) => fitGlobal(clubRows.filter((m) => m.day < upto), { ref: upto });
  const nowDay = today.getTime() / 864e5, M = fit(nowDay + 1), share = halfShare(rows);
  let MM = null;
  if (milliGames?.length) { const ms = milliGames.map(([d, h, a, hg, ag, tour, n]) => [d, h, a, hg, ag, null, null, null, Number(d.slice(0, 4)), n, /friendly/i.test(tour) ? 0.6 : 1]); MM = F.fit(ms); }
  const predictOne = (e, model) => {
    if (MODEL_SKIP.test(e.lg)) return null;
    const f = share.get(e.lg) ?? share.get('*');
    if (NATIONAL.test(e.lg) && !NO_MODEL.test(e.lg)) {   // A milli takimlar: 8 yillik acik veriyle kurulan model (takim adlari ESPN'den cevrilir)
      if (!MM) return null;
      const pr = F.predict(MM, alias(e.h), alias(e.a), 10, e.n); if (!pr.known) return null;
      return pack(predictMatch(pr.lambda, pr.mu, MM.rho ?? -0.05, f), 9, 9);
    }
    if (!model) return null;                       // kulupler, kadin ve genc takimlar: ESPN kimlikleriyle kuresel model
    const r = rates(model, e.lg, e.hid, e.aid, e.n); if (r.nh < 2 || r.na < 2) return null;     // takimlardan biri icin yeterli mac yok
    return pack(predictMatch(r.l, r.m, model.rho, f), r.nh, r.na);
  };
  const pack = (p, nh, na) => ({ p: p.p.map(r3), ht: p.ht.map(r3), h2: p.h2.map(r3), sc: p.top.map(([x, y, v]) => [x, y, r3(v)]), hsc: p.htTop.map(([x, y, v]) => [x, y, r3(v)]), scb: p.by.map(([x, y, v]) => [x, y, r3(v)]), hscb: p.htBy.map(([x, y, v]) => [x, y, r3(v)]),
    o25: r3(p.o25), btts: r3(p.btts), xg: p.xg.map((x) => Math.round(x * 100) / 100), nh: Math.round(nh), na: Math.round(na) });

  // takim formu (son 6 mac, her yarisma) ve iki takimin aralarindaki son maclar: yapay zeka analizine verilir
  const byTeam = new Map(), names = new Map();
  for (const [id, r] of Object.entries(db.ev)) { const m = { id, t: r[2], c: r[1], h: r[3], a: r[4], hg: r[5], ag: r[6] }; names.set(r[3], r[13]); names.set(r[4], r[14]);
    for (const tm of [r[3], r[4]]) { if (!byTeam.has(tm)) byTeam.set(tm, []); byTeam.get(tm).push(m); } }
  for (const l of byTeam.values()) l.sort((x, y) => (x.t < y.t ? 1 : -1));
  const form = (tm, before, n = 6) => (byTeam.get(tm) || []).filter((m) => m.t < before).slice(0, n).map((m) => { const home = m.h === tm, gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg;
    return [m.t.slice(5, 10), names.get(home ? m.a : m.h) || '?', home ? 'E' : 'D', gf, ga, m.c]; });
  const h2h = (a, b, before) => (byTeam.get(a) || []).filter((m) => m.t < before && ((m.h === a && m.a === b) || (m.h === b && m.a === a))).slice(0, 3).map((m) => [m.t.slice(0, 10), names.get(m.h), m.hg, m.ag, names.get(m.a)]);

  // 4) gun penceresi: mac oncesi tahmin kaydedilir; baslamis/bitmis maclarda kayitli tahmin kullanilir (yoksa geriye donuk: o gunden onceki veriyle)
  const seen = new Set(), out = [];
  const back = new Map(); const backModel = (dayStart) => { if (!back.has(dayStart)) back.set(dayStart, fit(dayStart)); return back.get(dayStart); };
  window.sort((x, y) => (x.t < y.t ? -1 : 1));
  for (const e of window) {
    if (seen.has(e.id)) continue; seen.add(e.id);
    let pr = preds.p[e.id]?.pr || null, bt = 0;
    if (e.st === 'pre') { pr = predictOne(e, M); if (pr) preds.p[e.id] = { pr, t: e.t, lg: e.lg, made: NOW.toISOString() }; }
    else if (!pr) { pr = predictOne(e, backModel(Math.floor(dayOf(e.t)))); bt = pr ? 1 : 0; if (pr) preds.p[e.id] = { pr, t: e.t, lg: e.lg, made: 'geriye-donuk' }; }
    out.push({ id: e.id, lg: e.lg, k: e.k, t: e.t, h: e.h, a: e.a, n: e.n, st: e.st, sn: e.sn, clock: e.clock, det: e.det, r: e.sc || null, r1: e.ht || null, pr, bt,
      fh: form(e.hid, e.t), fa: form(e.aid, e.t), hh: h2h(e.hid, e.aid, e.t) });
  }
  // 5) karne: kaydedilen tahminler + sonuclar (son 60 gun)
  const res60 = new Map(rows.map((m) => [m.id, m])), stat = {}, add = (k, s) => { const o = stat[k] || (stat[k] = { n: 0, hit: 0, sc: 0, nht: 0, ht: 0, ll: 0 }); o.n++; o.hit += s.hit; o.sc += s.sc; o.ll += s.ll; if (s.ht != null) { o.nht++; o.ht += s.ht; } };
  for (const [id, rec] of Object.entries(preds.p)) {
    if (Date.parse(rec.t) < D(-60).getTime()) { delete preds.p[id]; continue; }
    const m = res60.get(id); if (!m || !rec.pr) continue;
    const y = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, pick = rec.pr.p.indexOf(Math.max(...rec.pr.p)), top = rec.pr.scb?.[pick] || rec.pr.sc[0];   // ekranda gosterilen skor
    const s = { hit: pick === y ? 1 : 0, sc: top[0] === m.hg && top[1] === m.ag ? 1 : 0, ll: -Math.log(Math.max(0.005, rec.pr.p[y])), ht: null };
    if (m.h1 != null) { const yh = m.h1 > m.a1 ? 0 : m.h1 === m.a1 ? 1 : 2; s.ht = rec.pr.ht.indexOf(Math.max(...rec.pr.ht)) === yh ? 1 : 0; }
    add('*', s); add(rec.lg, s);
  }
  writeJson('f/tahmin.json', preds);
  // geriye donuk test: model her hafta yalnizca o haftadan onceki maclarla kurulur, sonraki 7 gunun kulup maclarini tahmin eder (son 3 hafta)
  const test = {}, addT = (k, s) => { const o = test[k] || (test[k] = { n: 0, hit: 0, sc: 0, nht: 0, ht: 0, ll: 0, base: 0 }); o.n++; o.hit += s.hit; o.sc += s.sc; o.ll += s.ll; o.base += s.base; if (s.ht != null) { o.nht++; o.ht += s.ht; } };
  for (const w of [21, 14, 7]) {
    const cut = Math.floor(nowDay) - w, Mw = fit(cut), shareW = halfShare(rows.filter((m) => m.day < cut));
    const freq = [0, 0, 0]; for (const m of clubRows) if (m.day < cut && m.day >= cut - 60) freq[m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2]++;
    const fs = freq.map((x) => (x + 1) / (freq[0] + freq[1] + freq[2] + 3));
    for (const m of clubRows) {
      if (m.day < cut || m.day >= cut + 7) continue;
      const r = rates(Mw, m.c, m.h, m.a, m.n); if (r.nh < 4 || r.na < 4) continue;
      const pr = predictMatch(r.l, r.m, Mw.rho, shareW.get(m.c) ?? shareW.get('*')), y = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, pk = pr.p.indexOf(Math.max(...pr.p));
      const sb = pr.by[pk], s = { hit: pk === y ? 1 : 0, sc: sb[0] === m.hg && sb[1] === m.ag ? 1 : 0, ll: -Math.log(Math.max(0.005, pr.p[y])), base: -Math.log(fs[y]), ht: null };
      if (m.h1 != null) { const yh = m.h1 > m.a1 ? 0 : m.h1 === m.a1 ? 1 : 2; s.ht = pr.ht.indexOf(Math.max(...pr.ht)) === yh ? 1 : 0; }
      addT('*', s); addT(m.c, s);
    }
  }
  // kombine: 26 haftalik ileriye donuk test -> pazar basina kalibrasyon (model olasiligi -> gercek oran) ve kupon kurallarinin gecmis basarisi
  let kb = null;
  try {
    const items = [];
    for (let w = 26; w >= 1; w--) {
      const cut = Math.floor(nowDay) - 7 * w, Mw = fit(cut), shareW = halfShare(rows.filter((m) => m.day < cut));
      for (const m of clubRows) {
        if (m.day < cut || m.day >= cut + 7) continue;
        const r = rates(Mw, m.c, m.h, m.a, m.n); if (r.nh < 4 || r.na < 4) continue;
        const pr = predictMatch(r.l, r.m, Mw.rho, shareW.get(m.c) ?? shareW.get('*'));
        items.push({ sport: 'f', id: m.id, t: String(m.day), lg: m.c, wk: w, day: Math.floor(m.day + 0.125), nh: r.nh, na: r.na, hg: m.hg, ag: m.ag, pr: { p: pr.p, o25: pr.o25, btts: pr.btts } });
      }
    }
    const fitCal = (list) => Object.fromEntries(Object.entries(FMK).map(([k, f]) => [k, isotonic(list.map((m) => [f.raw(m.pr), f.hit(m.hg, m.ag) ? 1 : 0]))]));
    const strong = items.filter((m) => m.nh >= 8 && m.na >= 8);
    kb = { cal: fitCal(items), bt: couponTest(strong, fitCal, footLegs, (m) => [m.hg, m.ag]), n: items.length, weeks: 26 };
    console.log('kombine futbol:', items.length, 'mac', JSON.stringify(kb.bt));
  } catch (e) { console.warn('kombine', e); }
  const lgOut = {}; for (const [slug, L] of Object.entries(db.leagues)) { const pre = slug.split('.')[0];
    lgOut[slug] = { name: L.name, en: L.en, ulke: COUNTRY[pre] || 'Diğer', nat: L.nat, f: r3(share.get(slug) ?? share.get('*')), pri: PRIORITY.includes(slug) ? PRIORITY.indexOf(slug) : 99 }; }
  const sum = (o) => ({ n: o.n, hit: r3(o.hit / o.n), sc: r3(o.sc / o.n), ht: o.nht ? r3(o.ht / o.nht) : null, nht: o.nht, ll: r3(o.ll / o.n), ...(o.base != null ? { base: r3(o.base / o.n) } : {}) });
  const karne = { live: Object.fromEntries(Object.entries(stat).map(([k, o]) => [k, sum(o)])), test: Object.fromEntries(Object.entries(test).map(([k, o]) => [k, sum(o)])) };
  writeJson('f/gun.json', { v: V, updated: NOW.toISOString(), leagues: lgOut, matches: out, karne, rho: M.rho, f: r3(share.get('*')), kb });
  const np = out.filter((m) => m.pr).length;
  console.log(`futbol: ${Object.keys(db.ev).length} bitmis mac (${clubRows.length} kulup), pencere ${out.length} mac (${np} tahminli), ilk yari payi ${r3(share.get('*'))}, rho ${M.rho}, gercek ${JSON.stringify(karne.live['*'] || null)}, test ${JSON.stringify(karne.test['*'] || null)}`);
  return { n: Object.keys(db.ev).length, window: out.length, predicted: np };
}
