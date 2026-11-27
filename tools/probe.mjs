// Arastirma: (A) ayni oran -> ayni skor iddiasi, (B) acilis vs kapanis, (C) oran dususu sinyali, (D) Pinnacle vs B365, (E) oran dilimine gore kayip
import fs from 'fs';
const LG = ['E0','E1','E2','E3','EC','SC0','SC1','SC2','SC3','D1','D2','I1','I2','SP1','SP2','F1','F2','N1','B1','P1','T1','G1'];
const SS = ['1718','1819','1920','2021','2122','2223','2324','2425','2526'];
const csv = (t) => { const L = t.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean), H = L[0].split(','); return L.slice(1).map((l) => { const v = l.split(','), o = {}; H.forEach((h, i) => (o[h] = v[i])); return o; }); };
const solve = (f, lo, hi) => { for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; };
const power = (o) => { const r = o.map((x) => 1 / x), k = solve((k) => r.reduce((a, x) => a + x ** k, 0) - 1, 1, 3); return r.map((x) => x ** k); };
const LOW = new Set(['E3','EC','SC2','SC3','I2','SP2','F2','D2','T1','G1']);
const ms = [];
for (const lg of LG) for (const s of SS) {
  try { const r = await fetch(`https://www.football-data.co.uk/mmz4281/${s}/${lg}.csv`); if (!r.ok) continue;
    for (const m of csv(await r.text())) { const hg = +m.FTHG, ag = +m.FTAG; if (m.FTHG === '' || m.FTHG == null || isNaN(hg)) continue;
      const g = (k) => k.map((x) => +m[x]), ok = (a) => a.every((x) => x > 1);
      ms.push({ lg, s, d: m.Date, hg, ag, y: hg > ag ? 0 : hg === ag ? 1 : 2, bo: g(['B365H','B365D','B365A']), bc: g(['B365CH','B365CD','B365CA']), pc: g(['PSCH','PSCD','PSCA']), po: g(['PSH','PSD','PSA']), mx: g(['MaxCH','MaxCD','MaxCA']), ok }); } } catch (e) {}
}
const out = { n: ms.length }; const log = (...a) => { console.log(...a); (out.lines ||= []).push(a.join(' ')); };
log('mac', ms.length);
// (A) ayni oran
const groups = new Map();
for (const m of ms) if (m.ok(m.bc)) { const k = m.bc.map((x) => x.toFixed(2)).join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
let pairs = 0, sameSc = 0, sameRes = 0, expRes = 0, expSc = 0;
const scoreP = new Map();   // benzer olasilik dilimindeki skor dagilimi (ayni oran OLMAYAN maclar icin beklenen)
const bucket = (m) => { const p = power(m.bc); return Math.round(p[0] * 50) + '|' + Math.round(p[2] * 50); };
for (const m of ms) if (m.ok(m.bc)) { const b = bucket(m), sc = m.hg + '-' + m.ag; if (!scoreP.has(b)) scoreP.set(b, new Map()); const M = scoreP.get(b); M.set(sc, (M.get(sc) || 0) + 1); M.set('_n', (M.get('_n') || 0) + 1); }
for (const [, G] of groups) { if (G.length < 2) continue;
  const M = scoreP.get(bucket(G[0])), n = M.get('_n'); let q2 = 0; for (const [k, v] of M) if (k !== '_n') q2 += (v / n) ** 2;
  const p = power(G[0].bc), r2 = p.reduce((a, x) => a + x * x, 0);
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) { pairs++; if (G[i].hg === G[j].hg && G[i].ag === G[j].ag) sameSc++; if (G[i].y === G[j].y) sameRes++; expRes += r2; expSc += q2; } }
log(`(A) ayni kapanis orani (B365, 3 oran birebir ayni): ${[...groups.values()].filter((g) => g.length > 1).length} grup, ${pairs} mac cifti`);
log(`    ayni SKOR: gercek %${(100 * sameSc / pairs).toFixed(2)} | sadece olasiliktan beklenen %${(100 * expSc / pairs).toFixed(2)}`);
log(`    ayni SONUC (1/X/2): gercek %${(100 * sameRes / pairs).toFixed(2)} | beklenen %${(100 * expRes / pairs).toFixed(2)}`);
// tahmin olarak: onceki ikizin skoru -> sonraki macin skoru
let tw = 0, twHit = 0, bkHit = 0;
for (const [, G] of groups) { if (G.length < 2) continue; for (let i = 1; i < G.length; i++) { const prev = G[i - 1], m = G[i]; tw++; if (prev.hg === m.hg && prev.ag === m.ag) twHit++;
  const M = scoreP.get(bucket(m)); let best = null, bv = -1; for (const [k, v] of M) if (k !== '_n' && v > bv) { bv = v; best = k; } if (best === m.hg + '-' + m.ag) bkHit++; } }
log(`    skor tahmini: "ayni oranli onceki macin skoru" %${(100 * twHit / tw).toFixed(2)} tuttu | "bu olasilikta en sik skor" %${(100 * bkHit / tw).toFixed(2)} tuttu (n=${tw})`);
// (B) acilis vs kapanis, (D) Pinnacle vs B365 - ayni maclarda
const LL = (p, y) => -Math.log(Math.max(1e-9, p[y]));
const S = ms.filter((m) => m.ok(m.bo) && m.ok(m.bc) && m.ok(m.pc) && m.ok(m.po));
const avg = (f) => S.reduce((a, m) => a + f(m), 0) / S.length;
log(`(B/D) ayni ${S.length} macta log kayip (dusuk = daha isabetli):`);
for (const [nm, k] of [['B365 acilis', 'bo'], ['B365 kapanis', 'bc'], ['Pinnacle acilis', 'po'], ['Pinnacle kapanis', 'pc']]) log(`    ${nm.padEnd(17)} ${avg((m) => LL(power(m[k]), m.y)).toFixed(5)}  marj %${(100 * avg((m) => m[k].reduce((a, x) => a + 1 / x, 0) - 1)).toFixed(1)}`);
// (C) oran dususu: B365 acilis->kapanis %10+ dusen taraf; kapanis olasiligina gore gercek
const drift = (sub, nm) => { let n = 0, w = 0, ec = 0, eo = 0, roi = 0; for (const m of sub) for (let i = 0; i < 3; i++) { if (!(m.bc[i] <= m.bo[i] * 0.9)) continue; n++; const pc = power(m.bc)[i], po = power(m.bo)[i]; ec += pc; eo += po; if (m.y === i) { w++; roi += m.bc[i] - 1; } else roi -= 1; }
  log(`    ${nm}: ${n} secim, tuttu %${(100 * w / n).toFixed(1)} | kapanis oranina gore beklenen %${(100 * ec / n).toFixed(1)} | acilisa gore %${(100 * eo / n).toFixed(1)} | kapanistan oynasan kar %${(100 * roi / n).toFixed(1)}`); };
const D = ms.filter((m) => m.ok(m.bo) && m.ok(m.bc));
log('(C) oran %10+ dustu (B365 acilis -> kapanis):'); drift(D.filter((m) => !LOW.has(m.lg)), 'ust ligler'); drift(D.filter((m) => LOW.has(m.lg)), 'alt ligler');
// (D2) Kaunitz: en iyi orana (Max) Pinnacle kapanis adil olasiligiyla bakmak
let kn = 0, kr = 0; for (const m of ms) { if (!m.ok(m.mx) || !m.ok(m.pc)) continue; const p = power(m.pc); for (let i = 0; i < 3; i++) if (m.mx[i] * p[i] > 1.03) { kn++; kr += m.y === i ? m.mx[i] - 1 : -1; } }
log(`(D2) piyasadaki en yuksek oran, Pinnacle adil oranindan %3+ yuksekse: ${kn} secim, kar %${(100 * kr / kn).toFixed(1)}`);
// (E) oran dilimine gore B365 kapanis getirisi
log('(E) B365 kapanis oranina gore tek mac getirisi:');
for (const [lo, hi] of [[1, 1.3], [1.3, 1.5], [1.5, 1.8], [1.8, 2.2], [2.2, 3], [3, 4.5], [4.5, 8], [8, 99]]) { let n = 0, r = 0; for (const m of ms) if (m.ok(m.bc)) for (let i = 0; i < 3; i++) if (m.bc[i] >= lo && m.bc[i] < hi) { n++; r += m.y === i ? m.bc[i] - 1 : -1; } log(`    ${lo}-${hi}: ${n} secim, getiri %${(100 * r / n).toFixed(1)}`); }
fs.mkdirSync('probe-out', { recursive: true }); fs.writeFileSync('probe-out/arastirma.json', JSON.stringify(out, null, 1));
