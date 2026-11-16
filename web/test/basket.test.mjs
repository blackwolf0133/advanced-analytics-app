import assert from 'node:assert'; import { test } from 'node:test';
import * as B from '../src/basket.js';
// Gercek takim guclerinden mac ureten yapay lig (yalnizca test icin).
function league(years, seed = 3) {
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }, gauss = () => { let t = 0; for (let i = 0; i < 12; i++) t += rnd(); return t - 6; };
  const teams = Array.from({ length: 30 }, (_, i) => 'T' + String(i).padStart(2, '0')), str = Object.fromEntries(teams.map((t) => [t, gauss() * 4])), pace = Object.fromEntries(teams.map((t) => [t, gauss() * 3])), out = [];
  for (const y of years) { let day = 0; for (let r = 0; r < 41; r++) for (let i = 0; i < 30; i++) { const h = teams[i], a = teams[(i + 1 + (r * 7) % 29) % 30]; if (h === a) continue;
    const m = str[h] - str[a] + 2.8 + gauss() * 11, t = 226 + pace[h] + pace[a] + gauss() * 14; let hp = Math.round((t + m) / 2), ap = Math.round((t - m) / 2); if (hp === ap) hp++;
    const d = new Date(Date.UTC(y, 9, 22 + Math.floor(day++ / 8))); out.push([d.toISOString().slice(0, 10), h, a, hp, ap, y]); } }
  return out;
}
const sched = (season, games) => JSON.stringify({ meta: {}, leagueSchedule: { seasonYear: B.seasonLabel(season), leagueId: '00', gameDates: [{ gameDate: '10/21/2026 00:00:00', games }] } });
const G = (id, st, h, a, hs, as, utc = '2026-11-16T00:30:00Z') => ({ gameId: id, gameStatus: st, gameStatusText: st === 3 ? 'Final' : '7:30 pm ET', gameDateEst: utc.slice(0, 10) + 'T00:00:00Z', gameDateTimeUTC: utc,
  homeTeam: { teamId: 1, teamName: h + 'ler', teamCity: 'Şehir', teamTricode: h, wins: 1, losses: 0, score: hs }, awayTeam: { teamId: 2, teamName: a + 'ler', teamCity: 'Kent', teamTricode: a, wins: 0, losses: 1, score: as } });
test('fikstur dosyasi: yalnizca normal sezon, biten ve yaklasan maclar ayrilir', () => {
  const p = B.parseSchedule(sched(2026, [G('0012600001', 3, 'AAA', 'BBB', 99, 90), G('0022600001', 3, 'AAA', 'BBB', 110, 101, '2026-10-21T23:30:00Z'), G('0022600002', 1, 'CCC', 'AAA', 0, 0), G('0022600003', 3, 'BBB', 'CCC', 0, 0)]));
  assert.deepStrictEqual(p.games, [['2026-10-21', 'AAA', 'BBB', 110, 101]]); assert.strictEqual(p.season, 2026);
  assert.deepStrictEqual(p.upcoming, [{ id: '0022600002', utc: '2026-11-16T00:30:00Z', home: 'CCC', away: 'AAA', status: 1 }]); assert.ok(p.teams.AAA.endsWith('AAAler'));
  assert.throws(() => B.parseSchedule('{"x":1}'));
});
test('mac kaydi: iki satir bir mac', () => {
  const H = ['SEASON_ID', 'TEAM_ID', 'TEAM_ABBREVIATION', 'TEAM_NAME', 'GAME_ID', 'GAME_DATE', 'MATCHUP', 'WL', 'PTS'];
  const p = B.parseGameLog(JSON.stringify({ resultSets: [{ name: 'LeagueGameLog', headers: H, rowSet: [['22025', 1, 'BOS', 'Boston Celtics', '0022500001', '2025-10-21', 'BOS vs. NYK', 'W', 120], ['22025', 2, 'NYK', 'New York Knicks', '0022500001', '2025-10-21', 'NYK @ BOS', 'L', 111], ['22025', 3, 'LAL', 'Los Angeles Lakers', '0022500002', '2025-10-21', 'LAL @ GSW', 'L', 100]] }] }));
  assert.deepStrictEqual(p.games, [['2025-10-21', 'BOS', 'NYK', 120, 111]]); assert.strictEqual(p.teams.NYK, 'New York Knicks');
});
test('model: ileriye donuk testte "hep ev sahibi"nden iyi, toplam tahmini lig ortalamasindan iyi', () => {
  const m = B.build(league([2023, 2024, 2025])), e = B.evaluate(m);
  console.log('  n', e.n, 'isabet', e.acc.toFixed(3), 'ev sahibi', e.homeRate.toFixed(3), 'fark MAE', e.marginMae.toFixed(1), 'toplam MAE', e.totalMae.toFixed(1), 'temel', e.totalBaseMae.toFixed(1));
  assert.ok(e.acc > Math.max(e.homeRate, 1 - e.homeRate) + 0.02 && e.totalMae < e.totalBaseMae && e.multi && e.n > 2000);
  const hi = e.buckets[3], lo = e.buckets[0]; assert.ok(lo.rate < 0.62 && (hi.n < 30 || hi.rate > 0.72));   // guven arttikca isabet artar
  const best = [...m.elo].sort((a, b) => b[1] - a[1])[0][0], worst = [...m.elo].sort((a, b) => a[1] - b[1])[0][0], p = B.predict(m, best, worst);
  assert.ok(p.pHome > 0.8 && p.margin > 6 && p.total > 180 && p.total < 270 && p.known && !B.predict(m, 'XXX', best).known);
  assert.deepStrictEqual(e.atLeast.map((x) => x.t), [0.5, 0.6, 0.7, 0.8]); assert.strictEqual(e.atLeast[0].n, e.n); assert.ok(e.atLeast[1].n < e.atLeast[0].n && e.atLeast[2].rate > e.atLeast[0].rate);
  const days = B.recent(m, 3), g = days[0].games[0]; assert.strictEqual(days.length, 3); assert.ok(days[0].date > days[1].date && days[0].games.length > 0);
  assert.strictEqual(g.hit, (g.pick === g.home) === (g.hp > g.ap)); assert.ok(g.conf >= 0.5 && g.actualTotal === g.hp + g.ap);
  assert.strictEqual(B.evaluate(B.build(league([2025]).slice(0, 120))), null);
  assert.ok(B.evaluate(B.build(league([2025]))).n > 500);
});
test('indirme: bu sezon fiksturden, onceki sezonlar stats adresinden; biri basarisiz olsa da devam eder', async () => {
  const L = league([2024, 2025, 2026]), mk = (y, n) => sched(y, L.filter((g) => g[5] === y).slice(0, n).map((g, i) => G('002' + i, 3, g[1], g[2], g[3], g[4], g[0] + 'T23:00:00Z')).concat(y === 2026 ? [G('0029', 1, 'T01', 'T02', 0, 0)] : []));
  const calls = [], get = async (url, h) => { calls.push(url);
    if (url.includes('cdn.nba.com')) return mk(2026, 150);
    if (url.includes('scheduleleaguev2') && url.includes('2025-26')) { assert.strictEqual(h['x-nba-stats-token'], 'true'); return mk(2025, 1230); }
    throw new Error('bağlantı kurulamadı'); };
  const r = await B.download(get);
  assert.deepStrictEqual(r.map((x) => [x.season, x.ok, x.n]), [[2026, true, 150], [2025, true, 1230], [2024, false, undefined]]); assert.strictEqual(calls.length, 4);
  const db = B.loadDb(); assert.strictEqual(B.allGames(db).length, 1380); assert.strictEqual(db.upcoming.length, 1); assert.strictEqual(B.standings(db).length, 30);
  const r2 = await B.download(get); assert.ok(r2[1].cached);
});
