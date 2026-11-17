// Canli veri kaynaklarini yoklar: durum kodu, boyut, ornek govde. GitHub Actions'ta calisir; cikti artifact olarak saklanir.
import fs from 'node:fs';
const out = 'probe-out'; fs.mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const report = [];
async function get(name, url, headers = {}) {
  for (const ua of [null, UA]) {
    try {
      const r = await fetch(url, { headers: { ...(ua ? { 'User-Agent': ua } : {}), Accept: 'application/json,text/csv,*/*', ...headers }, signal: AbortSignal.timeout(30000) });
      const body = await r.text();
      report.push({ name, url, ua: !!ua, status: r.status, type: r.headers.get('content-type'), size: body.length, head: body.slice(0, 300) });
      if (r.ok) { fs.writeFileSync(`${out}/${name}`, body.slice(0, 12e6)); return body; }
    } catch (e) { report.push({ name, url, ua: !!ua, error: String(e) }); }
  }
  return null;
}
const E = 'https://site.api.espn.com/apis/site/v2/sports/';
await get('nba_cdn_schedule.json', 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json', { Referer: 'https://www.nba.com/' });
await get('espn_nba_teams.json', E + 'basketball/nba/teams');
await get('espn_nba_sched_t1_2026.json', E + 'basketball/nba/teams/1/schedule?season=2026');
await get('espn_nba_sched_t1_2027.json', E + 'basketball/nba/teams/1/schedule?season=2027');
await get('espn_nba_sb.json', E + 'basketball/nba/scoreboard?dates=20261115');
await get('espn_nba_sb_range.json', E + 'basketball/nba/scoreboard?dates=20261110-20261115');
await get('espn_ncaam_sb.json', E + 'basketball/mens-college-basketball/scoreboard?dates=20261115&groups=50&limit=500');
await get('espn_nbl_sb.json', E + 'basketball/nbl/scoreboard?dates=20261115');
await get('espn_nbl_teams.json', E + 'basketball/nbl/teams');
await get('espn_nbl_sched.json', E + 'basketball/nbl/teams/' + '1' + '/schedule');
await get('espn_gl_sb.json', E + 'basketball/nba-development/scoreboard?dates=20261115');
await get('espn_wnba_sched.json', E + 'basketball/wnba/teams/3/schedule?season=2026');
await get('espn_fiba_sb.json', E + 'basketball/fiba/scoreboard');
await get('espn_soccer_nations_sb.json', E + 'soccer/uefa.nations/scoreboard?dates=20261115');
await get('espn_soccer_cdn.json', 'https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=uefa.nations&date=20261115');
const EL = 'https://api-live.euroleague.net/v2/competitions/';
await get('el_E2026_games.json', EL + 'E/seasons/E2026/games');
await get('el_E2025_games.json', EL + 'E/seasons/E2025/games');
await get('el_U2026_games.json', EL + 'U/seasons/U2026/games');
const T = 'https://miniappapi.tbf.org.tr/webapi-service/api/';
const feat = await get('tbf_featured.json', T + 'League/get-featured-9-leagues');
try {
  const bsl = JSON.parse(feat).data.find((l) => l.prefixUrl === 'bsl');
  const weeks = await get('tbf_bsl_weeks.json', T + `League/get-league-weeks?leagueId=${bsl.activityId}&seasonId=${bsl.seasonId}`);
  await get('tbf_bsl_all.json', T + `Match/get-all-matches-for-filter?ActivityId=${bsl.activityId}&Page=1&PageSize=-1`);
  const w = JSON.parse(weeks); const first = (w.data || [])[0];
  await get('tbf_bsl_week1.json', T + `Match/get-all-matches-for-filter?ActivityId=${bsl.activityId}&WeekFilter=${encodeURIComponent(first?.id ?? first?.week ?? first?.value ?? '1')}&Page=1&PageSize=-1`);
  await get('tbf_bsl_team.json', T + `Team/get-teams-by-leauge?leaugeId=${bsl.activityId}`);
} catch (e) { report.push({ name: 'tbf-chain', error: String(e) }); }
await get('om_tur1.csv', 'https://cdn.jsdelivr.net/gh/oladeeayo/open-matchday@master/data/TUR_1_super-lig/results_2627.csv');
await get('intl_results.csv', 'https://cdn.jsdelivr.net/gh/martj42/international_results@master/results.csv');
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(report.map((r) => `${r.status ?? 'ERR'} ua=${r.ua} ${r.size ?? ''} ${r.name} ${r.error ?? ''}`).join('\n'));
