import fs from 'node:fs';
fs.mkdirSync('probe-out', { recursive: true });
const H = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', accept: 'application/json, text/plain, */*' };
const out = [];
for (const u of ['https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0', 'https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=1&version=0']) {
  try { const r = await fetch(u, { headers: H }); const t = await r.text(); fs.writeFileSync(`probe-out/${u.includes('type=1') ? 'live' : 'pre'}.json`, t); out.push(u + ' ' + r.status + ' ' + t.length); } catch (e) { out.push(u + ' ERR ' + e.message); }
}
// detay: tek mac pazarlari (2_866 gibi) icin olasi uc noktalar
for (const u of ['https://sportsbookv2.iddaa.com/sportsbook/event/3322088', 'https://sportsbookv2.iddaa.com/sportsbook/events/3322088', 'https://sportsbookv2.iddaa.com/sportsbook/event-detail?eventId=3322088']) {
  try { const r = await fetch(u, { headers: H }); const t = await r.text(); out.push(u + ' ' + r.status + ' ' + t.slice(0, 300).replace(/\s+/g, ' ')); } catch (e) { out.push(u + ' ERR ' + e.message); }
}
fs.writeFileSync('probe-out/log.txt', out.join('\n') + '\nzaman ' + new Date().toISOString());
