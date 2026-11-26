import fs from 'node:fs';
fs.mkdirSync('probe-out/fd', { recursive: true });
const H = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', accept: 'application/json, text/plain, */*' };
const log = [];
const save = async (name, u) => { try { const r = await fetch(u, { headers: H }); const t = await r.text(); fs.writeFileSync('probe-out/' + name, t); log.push(`${name} ${r.status} ${t.length}`); return t; } catch (e) { log.push(`${name} ERR ${e.message}`); } };
const bb = await save('iddaa_bb.json', 'https://sportsbookv2.iddaa.com/sportsbook/events?st=2&type=0&version=0');
await save('iddaa_bb_live.json', 'https://sportsbookv2.iddaa.com/sportsbook/events?st=2&type=1&version=0');
await save('iddaa_fb_live.json', 'https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=1&version=0');
await save('iddaa_market.json', 'https://sportsbookv2.iddaa.com/sportsbook/get_market_config');
await save('iddaa_comp.json', 'https://sportsbookv2.iddaa.com/sportsbook/competitions');
try { const ev = JSON.parse(bb).data.events.slice(0, 3); for (const e of ev) await save(`bb_detail_${e.i}.json`, `https://sportsbookv2.iddaa.com/sportsbook/event/${e.i}`); } catch (e) { log.push('detay ' + e.message); }
await save('el_games.json', 'https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games');
const L = ['E0', 'E1', 'E2', 'E3', 'EC', 'SC0', 'SC1', 'SC2', 'SC3', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1'];
for (const s of ['2122', '2223', '2324', '2425', '2526', '2627']) for (const l of L) await save(`fd/${s}_${l}.csv`, `https://www.football-data.co.uk/mmz4281/${s}/${l}.csv`);
fs.writeFileSync('probe-out/log.txt', log.join('\n') + '\n' + new Date().toISOString());
