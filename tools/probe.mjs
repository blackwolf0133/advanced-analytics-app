import fs from 'node:fs';
fs.mkdirSync('probe-out', { recursive: true });
const H = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', accept: 'application/json, text/plain, */*' };
const ev = (await (await fetch('https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0', { headers: H })).json()).data.events.filter((e) => e.d * 1000 > Date.now() + 3e5).slice(0, 12);
const det = {};
for (const e of ev) { const r = await fetch(`https://sportsbookv2.iddaa.com/sportsbook/event/${e.i}`, { headers: H }); det[e.i] = r.ok ? (await r.json()).data : r.status; }
fs.writeFileSync('probe-out/detail.json', JSON.stringify(det));
