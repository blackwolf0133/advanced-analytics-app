// FIBA kupalari (BCL, FIBA Europe Cup): herkese acik mac takvimi sayfalarindaki mac nesneleri
import fs from 'node:fs';
const out = 'probe-out'; fs.mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const PUSH = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/gs;
function games(html) {
  let text = ''; for (const m of html.matchAll(PUSH)) { try { text += JSON.parse('"' + m[1] + '"'); } catch {} }
  if (!text) text = html.replace(/\\"/g, '"');
  const seen = new Map(), re = /\{"gameId":/g; let m;
  while ((m = re.exec(text))) { let depth = 0, i = m.index, inS = false, esc = false;
    for (; i < text.length; i++) { const ch = text[i]; if (inS) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inS = false; continue; } if (ch === '"') inS = true; else if (ch === '{') depth++; else if (ch === '}') { depth--; if (!depth) break; } }
    try { const o = JSON.parse(text.slice(m.index, i + 1)); if (o.teamA && !seen.has(o.gameId)) seen.set(o.gameId, o); } catch {} }
  return [...seen.values()];
}
const pages = { bcl_2627: 'https://www.championsleague.basketball/en/games', bcl_2526: 'https://www.fiba.basketball/en/history/112-fiba-mens-european-club-competitions-tier-1/208962/games',
  fec_2627: 'https://www.fiba.basketball/en/events/fiba-europe-cup-26-27/games', fec_2526: 'https://www.fiba.basketball/en/events/fiba-europe-cup-25-26/games' };
const rep = {};
for (const [k, u] of Object.entries(pages)) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(40000) }); const h = await r.text(); const g = games(h);
    rep[k] = { status: r.status, size: h.length, games: g.length, played: g.filter((x) => (x.teamAScore || 0) + (x.teamBScore || 0) > 0).length, keys: g[0] ? Object.keys(g[0]) : [], sample: g.slice(0, 2), rounds: [...new Set(g.map((x) => x.round?.roundCode))], dates: [g.map((x) => x.gameDateTime).sort()[0], g.map((x) => x.gameDateTime).sort().at(-1)] };
    fs.writeFileSync(`${out}/${k}.json`, JSON.stringify(g)); } catch (e) { rep[k] = { error: String(e) }; }
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(rep, null, 1)); console.log(JSON.stringify(Object.fromEntries(Object.entries(rep).map(([k, v]) => [k, { status: v.status, games: v.games, played: v.played, rounds: v.rounds, dates: v.dates, error: v.error }]))));
