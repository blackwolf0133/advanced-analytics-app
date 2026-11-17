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
const FD = 'https://www.football-data.co.uk/';
await get('fd_new_ARG.csv', FD + 'new/ARG.csv');
await get('fd_new_fix.csv', FD + 'new_league_fixtures.csv');
await get('fd_fix.csv', FD + 'fixtures.csv');
await get('fd_EC.csv', FD + 'mmz4281/2627/EC.csv');
await get('fd_SC1.csv', FD + 'mmz4281/2627/SC1.csv');
await get('fd_T1.csv', FD + 'mmz4281/2627/T1.csv');
await get('espn_nba_sb_cal.json', 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20251105');
await get('espn_ncaaw_sb.json', 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?dates=20261115&groups=50&limit=500');
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
console.log(report.map((r) => `${r.status ?? 'ERR'} ua=${r.ua} ${r.size ?? ''} ${r.name} ${r.error ?? ''}`).join('\n'));
