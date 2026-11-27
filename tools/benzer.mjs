// "Benzer oranli gecmis maclar" arsivi: football-data.co.uk, 22 lig, 2017-2026, Bet365 kapanis oranlari (~68.000 mac).
// Oranlar marji temizlenip (power yontemi) olasiliga cevrilir ve olasilik dilimlerine gore sonuc / gol / skor sayilir.
// Telefon, iddaa oranlarini ayni sekilde olasiliga cevirip bu tablodan "bu oranlara sahip gecmis maclarda ne oldu"yu gosterir.
// Arastirma notu: birebir ayni oranli maclarin skorlari, sadece olasiliktan beklenenden daha sik ayni cikmiyor
// (487.363 mac ciftinde ayni skor %7,62, beklenen %7,78). Bu yuzden tablo birebir oran degil, olasilik dilimi kullanir.
const LG = ['E0', 'E1', 'E2', 'E3', 'EC', 'SC0', 'SC1', 'SC2', 'SC3', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1'];
const SS = ['1718', '1819', '1920', '2021', '2122', '2223', '2324', '2425', '2526', '2627'];
const STEP = 0.025, OSTEP = 0.025;
const csv = (t) => { const L = t.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean), H = L[0].split(','); return L.slice(1).map((l) => { const v = l.split(','), o = {}; H.forEach((h, i) => (o[h] = v[i])); return o; }); };
const solve = (f, lo, hi) => { for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; };
export const powerFair = (o) => { const r = o.map((x) => 1 / x), k = solve((k) => r.reduce((a, x) => a + x ** k, 0) - 1, 1, 3); return r.map((x) => x ** k); };
export const keyMs = (p) => `${Math.round(p[0] / STEP)}|${Math.round(p[2] / STEP)}`;
export const keyOu = (pu) => String(Math.round(pu / OSTEP));

export async function benzer({ get, readJson, writeJson, NOW }) {
  const old = readJson('f/benzer.json', null);
  if (old && NOW - Date.parse(old.updated) < 6.5 * 864e5) return;   // haftada bir yeterli
  const ms = {}, ou = {}; let n = 0;
  for (const lg of LG) for (const s of SS) {
    let rows; try { rows = csv(await get(`https://www.football-data.co.uk/mmz4281/${s}/${lg}.csv`, { json: false, tries: 1 })); } catch { continue; }
    for (const m of rows) {
      const hg = +m.FTHG, ag = +m.FTAG; if (m.FTHG === '' || m.FTHG == null || isNaN(hg) || isNaN(ag)) continue;
      const o = ['B365CH', 'B365CD', 'B365CA'].map((k) => +m[k]), o2 = ['B365H', 'B365D', 'B365A'].map((k) => +m[k]), od = o.every((x) => x > 1) ? o : o2.every((x) => x > 1) ? o2 : null;
      const sc = `${Math.min(hg, 5)}-${Math.min(ag, 5)}`, y = hg > ag ? 0 : hg === ag ? 1 : 2, T = hg + ag;
      if (od) { const k = keyMs(powerFair(od)), c = (ms[k] ||= { n: 0, r: [0, 0, 0], s: {} }); c.n++; c.r[y]++; c.s[sc] = (c.s[sc] || 0) + 1; n++; }
      const u = [+m['B365C>2.5'], +m['B365C<2.5']], u2 = [+m['B365>2.5'], +m['B365<2.5']], uo = u.every((x) => x > 1) ? u : u2.every((x) => x > 1) ? u2 : null;
      if (uo) { const pu = powerFair(uo)[0], k = keyOu(pu), c = (ou[k] ||= { n: 0, o25: 0, o35: 0, u15: 0, kg: 0, s: {} }); c.n++; if (T > 2) c.o25++; if (T > 3) c.o35++; if (T < 2) c.u15++; if (hg > 0 && ag > 0) c.kg++; c.s[sc] = (c.s[sc] || 0) + 1; }
    }
  }
  if (n < 20000) { console.warn('benzer: az mac', n); return; }
  // skorlarin yalnizca ilk 6'si tutulur (dosya kucuk kalsin)
  const trim = (T) => { for (const c of Object.values(T)) c.s = Object.fromEntries(Object.entries(c.s).sort((a, b) => b[1] - a[1]).slice(0, 6)); return T; };
  writeJson('f/benzer.json', { v: 2, updated: NOW.toISOString(), n, step: STEP, ostep: OSTEP, ms: trim(ms), ou: trim(ou) });
  console.log(`benzer: ${n} mac, ${Object.keys(ms).length} + ${Object.keys(ou).length} dilim`);
}
