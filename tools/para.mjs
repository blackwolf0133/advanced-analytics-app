// Para akisi: ABD'de yasal bahis sirketlerinin halka acik bahis yuzdeleri (Action Network konsensusu).
// Her maçta, her pazar ve taraf icin: bahislerin (kupon sayisinin) yuzdesi ve paranin yuzdesi.
// Para yuzdesi bahis yuzdesinden belirgin buyukse az sayida ama buyuk bahis o tarafta demektir ("buyuk para" sinyali).
// Kapsam: NBA, NCAA erkek basketbolu, futbolda Premier Lig, La Liga, Serie A, Bundesliga, Ligue 1, MLS.
// Yasadisi siteler ve gizli forumlar kullanilmaz.
import { matchEvents } from '../web/src/oran.js';

const AN = (sp, d) => `https://api.actionnetwork.com/web/v2/scoreboard/${sp}?bookIds=15&date=${d}&periods=event${sp === 'ncaab' ? '&division=D1' : ''}`;
const SPORTS = [['nba', 'NBA', 'nba'], ['ncaab', 'NCAA', 'ncaam'], ['soccer', null, null]];
const SOCCER = { epl: ['Premier Lig', 'eng.1'], laliga: ['La Liga', 'esp.1'], seriea: ['Serie A', 'ita.1'], bundesliga: ['Bundesliga', 'ger.1'], ligue1: ['Ligue 1', 'fra.1'], mls: ['MLS', 'usa.1'] };
const dec = (am) => (am > 0 ? 1 + am / 100 : am < 0 ? 1 + 100 / -am : null);
const r2 = (x) => Math.round(x * 100) / 100;
const GAP = 10;   // para% - bahis% en az 10 puan: buyuk para sinyali

function parseGame(g, sp) {
  const T = new Map((g.teams || []).map((t) => [t.id, t.full_name])), ev = g.markets?.['15']?.event; if (!ev) return null;
  const side = (o) => ({ t: o.bet_info?.tickets?.percent || 0, m: o.bet_info?.money?.percent || 0, o: r2(dec(o.odds) || 0), v: o.value ?? null });
  const pick = (arr) => Object.fromEntries((arr || []).map((o) => [o.side, side(o)]));
  const ml = pick(ev.moneyline), spr = pick(ev.spread), tot = pick(ev.total);
  if (![ml, spr, tot].some((x) => Object.values(x).some((s) => s.t > 0))) return null;
  const lg = sp === 'soccer' ? SOCCER[g.league_name] : null;
  return { key: `${sp}:${g.id}`, sp, lg: lg ? lg[1] : sp === 'nba' ? 'nba' : 'ncaam', ln: lg ? lg[0] : sp === 'nba' ? 'NBA' : 'NCAA', t: g.start_time, h: T.get(g.home_team_id), a: T.get(g.away_team_id), nb: g.num_bets || 0, ml, spr, tot, st: g.status };
}
/** Bir pazardaki "buyuk para" tarafi: para% - bahis% en buyuk olan taraf (en az GAP puan). */
export function bigMoney(mk) {
  let best = null; for (const [side, s] of Object.entries(mk || {})) { const gap = s.m - s.t; if (gap >= GAP && (!best || gap > best.gap)) best = { side, gap, ...s }; }
  return best;
}
const hitOf = (mkt, side, v, h, a) => {
  if (mkt === 'ml') return side === 'home' ? h > a : side === 'away' ? a > h : h === a;
  if (mkt === 'spr') { const d = (side === 'home' ? h - a : a - h) + Number(v); return d === 0 ? null : d > 0; }
  const tt = h + a; return tt === Number(v) ? null : side === 'over' ? tt > v : tt < v;
};

export async function paraAkisi({ get, readJson, writeJson, NOW }) {
  const now = NOW.getTime(), et = (ms) => new Date(ms - 5 * 36e5).toISOString().slice(0, 10).replace(/-/g, '');
  const prev = readJson('f/para.json', null), store = prev?.v === 2 ? prev : { v: 2, games: [], log: [] };
  const games = [];
  for (const [sp] of SPORTS) for (const d of [...new Set([et(now), et(now + 864e5)])]) {
    const j = await get(AN(sp, d)); for (const g of j?.games || []) { const x = parseGame(g, sp); if (x && x.h && x.a) games.push(x); }
  }
  // bizim maclarla eslestirme (iddaa orani, model ve sonuc icin)
  const gun = readJson('f/gun.json', null), ours = [];
  for (const m of gun?.matches || []) if (Object.values(SOCCER).some(([, l]) => l === m.lg)) ours.push({ id: m.id, t: m.t, h: m.h, a: m.a, lg: m.lg, od: m.od, pr: m.pr });
  const dbs = {}; for (const id of ['nba', 'ncaam']) dbs[id] = readJson(`b/${id}.json`, null);
  for (const id of ['nba', 'ncaam']) for (const [utc, h, a] of dbs[id]?.upcoming || []) ours.push({ id: `${id}|${utc}|${h}`, t: utc, h, a, lg: id });
  const pairs = matchEvents(games.map((g) => ({ id: g.key, t: g.t, h: g.h, a: g.a })), ours.map((o) => ({ io: o.id, d: o.t, h: o.h, a: o.a, o })));
  for (const g of games) { const m = pairs.get(g.key); if (m) { g.our = m.io; if (m.o.od?.ms) g.iddaa = { ms: m.o.od.ms, ou: m.o.od.ou?.['2.5'] || null }; if (m.o.pr?.p) g.model = m.o.pr.p.map((x) => Math.round(x * 100) / 100); } }
  // sinyal kaydi: mac baslayana kadar her calismada guncellenir, sonra donar; sonuc gelince islenir
  const log = new Map(store.log.map((x) => [x.key + x.mkt, x]));
  for (const g of games) {
    if (Date.parse(g.t) <= now) continue;
    for (const [mkt, mk] of [['ml', g.ml], ['spr', g.spr], ['tot', g.tot]]) {
      const b = bigMoney(mk), k = g.key + mkt;
      if (b) log.set(k, { key: g.key, mkt, sp: g.sp, ln: g.ln, t: g.t, h: g.h, a: g.a, our: g.our || null, side: b.side, v: b.v, gap: b.gap, tix: b.t, mon: b.m, o: b.o, res: null });
      else if (log.get(k)?.res == null) log.delete(k);
    }
  }
  const sez = readJson('f/sezon.json', null);
  for (const x of log.values()) {
    if (x.res != null || Date.parse(x.t) > now - 3 * 36e5 || !x.our) continue;
    let sc = null;
    if (x.sp === 'soccer') { const r = sez?.ev?.[x.our]; if (r) sc = r[10] ? [r[11], r[12]] : [r[5], r[6]]; }
    else { const [lg, utc, h] = x.our.split('|'), db = dbs[lg], t0 = Date.parse(utc);
      for (const list of Object.values(db?.seasons || {})) { const r = list.find((r) => r[1] === h && Math.abs(Date.parse(r[0]) - t0) < 1.6 * 864e5); if (r) { sc = [r[3], r[4]]; break; } } }
    if (sc) { const hit = hitOf(x.mkt, x.side, x.v, sc[0], sc[1]); x.sc = sc; x.res = hit == null ? 'P' : hit ? 'W' : 'L'; }
    else if (Date.parse(x.t) < now - 4 * 864e5) x.res = 'V';
  }
  const L = [...log.values()].filter((x) => Date.parse(x.t) > now - 60 * 864e5).sort((a, b) => (a.t < b.t ? -1 : 1));
  const done = L.filter((x) => x.res === 'W' || x.res === 'L'), k = (f) => { const a = done.filter(f); return { n: a.length, w: a.filter((x) => x.res === 'W').length, pl: r2(a.reduce((s, x) => s + (x.res === 'W' ? x.o - 1 : -1), 0)) }; };
  const sum = { all: k(() => true), ml: k((x) => x.mkt === 'ml'), spr: k((x) => x.mkt === 'spr'), tot: k((x) => x.mkt === 'tot'), big: k((x) => x.gap >= 20) };
  writeJson('f/para.json', { v: 2, updated: NOW.toISOString(), games: games.sort((a, b) => (a.t < b.t ? -1 : 1)), log: L, sum });
  console.log(`para akisi: ${games.length} mac, eslesen ${pairs.size}, sinyal ${L.length}, biten ${done.length}`, JSON.stringify(sum));
}
