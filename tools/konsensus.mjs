// Degerli oran avciligi: football-data.co.uk'nin yaklasan mac dosyalari (Pinnacle ve piyasa ortalamasi oranlari) ile
// iddaa'yi karsilastirma. Pinnacle (en keskin piyasa) marji temizlenince gercek olasiligin en iyi tahminidir
// (Kaunitz vd. 2017: piyasa ortalamasi; burada Pinnacle varsa o, yoksa ortalama).
import { fair, matchEvents } from '../web/src/oran.js';
const FILES = ['https://www.football-data.co.uk/fixtures.csv', 'https://www.football-data.co.uk/new_league_fixtures.csv'];
const ALIAS = { 'man united': 'Manchester United', 'man city': 'Manchester City', "nott'm forest": 'Nottingham Forest', wolves: 'Wolverhampton Wanderers', 'sheffield weds': 'Sheffield Wednesday', 'sheffield united': 'Sheffield United', qpr: 'Queens Park Rangers', 'west brom': 'West Bromwich Albion',
  'ath bilbao': 'Athletic Club', 'ath madrid': 'Atletico Madrid', sociedad: 'Real Sociedad', betis: 'Real Betis', celta: 'Celta Vigo', espanol: 'Espanyol', "m'gladbach": 'Borussia Monchengladbach', 'ein frankfurt': 'Eintracht Frankfurt', dortmund: 'Borussia Dortmund',
  leverkusen: 'Bayer Leverkusen', 'fc koln': 'Koln', 'paris sg': 'Paris Saint-Germain', inter: 'Internazionale', milan: 'AC Milan', 'st etienne': 'Saint-Etienne', psv: 'PSV Eindhoven', 'sp lisbon': 'Sporting CP', 'sp braga': 'Braga', 'vitoria': 'Vitoria Guimaraes' };
function csv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const H = lines[0].split(','); return lines.slice(1).map((l) => { const v = l.split(','); return Object.fromEntries(H.map((h, i) => [h, v[i]])); });
}
const bst = (d) => { const y = d.getUTCFullYear(), last = (m) => { const t = new Date(Date.UTC(y, m + 1, 0)); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t; }; return d >= last(2) && d < last(9); };   // Ingiltere yaz saati
function utc(date, time) {
  const [dd, mm, yy] = String(date).split('/').map(Number), [hh, mi] = String(time || '15:00').split(':').map(Number); if (!dd) return null;
  const t = new Date(Date.UTC(yy < 100 ? 2000 + yy : yy, mm - 1, dd, hh, mi)); return new Date(t.getTime() - (bst(t) ? 36e5 : 0)).toISOString();
}
const num = (x) => { const v = Number(x); return v > 1 ? v : null; };
/** Donus: Map(espnId -> { src, p: { '1','X','2','U2.5','A2.5' } }) */
export async function consensus(get, matches) {
  const ev = [];
  for (const u of FILES) {
    let t; try { t = await get(u, { json: false }); } catch { t = null; } if (!t) continue;
    for (const r of csv(t)) {
      const d = utc(r.Date, r.Time); if (!d) continue;
      const pin = [num(r.PSH), num(r.PSD), num(r.PSA)], avg = [num(r.AvgH), num(r.AvgD), num(r.AvgA)];
      const ms = pin.every(Boolean) ? pin : avg.every(Boolean) ? avg : null, src = pin.every(Boolean) ? 'Pinnacle' : 'ortalama';
      const ou = [num(r['P<2.5']) && num(r['P>2.5']) ? [num(r['P<2.5']), num(r['P>2.5'])] : null, num(r['Avg<2.5']) && num(r['Avg>2.5']) ? [num(r['Avg<2.5']), num(r['Avg>2.5'])] : null].find(Boolean);
      if (!ms && !ou) continue;
      const nm = (x) => ALIAS[String(x || '').toLowerCase()] || x;
      ev.push({ io: `${r.Div}|${r.Date}|${r.HomeTeam}`, d, h: nm(r.HomeTeam || r.Home), a: nm(r.AwayTeam || r.Away), ms, ou, src });
    }
  }
  const out = new Map(); if (!ev.length) return out;
  for (const [id, e] of matchEvents(matches, ev)) {
    const p = {}; if (e.ms) { const f = fair(e.ms); p['1'] = f[0]; p.X = f[1]; p['2'] = f[2]; p['1X'] = f[0] + f[1]; p.X2 = f[1] + f[2]; p['12'] = f[0] + f[2]; }
    if (e.ou) { const f = fair(e.ou); p['A2.5'] = f[0]; p['U2.5'] = f[1]; }
    out.set(id, { src: e.src, p });
  }
  console.log(`konsensus: football-data ${ev.length} mac, eslesen ${out.size}`);
  return out;
}
