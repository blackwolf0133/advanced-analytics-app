import fs from 'node:fs';
fs.mkdirSync('probe-out', { recursive: true });
const H = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', accept: 'application/json, text/plain, */*' };
const urls = {
  iddaa_events: 'https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0',
  iddaa_events_bb: 'https://sportsbookv2.iddaa.com/sportsbook/events?st=2&type=0&version=0',
  iddaa_market: 'https://sportsbookv2.iddaa.com/sportsbook/get_market_config',
  iddaa_comp: 'https://sportsbookv2.iddaa.com/sportsbook/competitions',
  nesine: 'https://cdnbulten.nesine.com/api/bulten/getprebultenfull',
  mackolik: 'https://www.mackolik.com/iddaa',
  sahadan: 'https://www.sahadan.com/iddaa/',
};
for (const [k, u] of Object.entries(urls)) {
  try { const r = await fetch(u, { headers: H }); const t = await r.text(); fs.writeFileSync(`probe-out/${k}.txt`, t); console.log(k, r.status, t.length, t.slice(0, 200).replace(/\s+/g, ' ')); }
  catch (e) { console.log(k, 'ERR', e.message); fs.writeFileSync(`probe-out/${k}.txt`, 'ERR ' + e.message); }
}
