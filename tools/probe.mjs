// Futbol: ESPN tum ligler gunluk skor tablosu, lig listesi, devre skorlari, canli alanlar
import fs from 'node:fs';
const out = 'probe-out'; fs.mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const rep = {};
async function get(name, url) {
  try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(40000) }); const t = await r.text(); rep[name] = { status: r.status, size: t.length }; if (r.ok) fs.writeFileSync(`${out}/${name}`, t); return r.ok ? t : null; }
  catch (e) { rep[name] = { error: String(e) }; return null; }
}
const S = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
await get('all_today.json', S + `all/scoreboard?dates=${today}`);
await get('all_today_lim.json', S + `all/scoreboard?dates=${today}&limit=1000`);
await get('all_past.json', S + 'all/scoreboard?dates=20261108');
await get('dropdown.json', 'https://site.api.espn.com/apis/site/v2/leagues/dropdown?sport=soccer&limit=1000');
await get('core_leagues.json', 'https://sports.core.api.espn.com/v2/sports/soccer/leagues?limit=1000');
await get('eng5.json', S + 'eng.5/scoreboard?dates=20261108');
await get('eng1_past.json', S + 'eng.1/scoreboard?dates=20261108');
await get('cdn_all.json', `https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=all&date=${today}`);
await get('concacaf_nl.json', S + `concacaf.nations.league/scoreboard?dates=${today}`);
await get('caf_q.json', S + `caf.nations_qual/scoreboard?dates=${today}`);
await get('friendly.json', S + `fifa.friendly/scoreboard?dates=${today}`);
const summ = {};
for (const f of ['all_today.json', 'all_today_lim.json', 'all_past.json', 'eng5.json', 'eng1_past.json']) {
  try { const j = JSON.parse(fs.readFileSync(`${out}/${f}`)); const ev = j.events || []; const lg = {};
    for (const e of ev) { const s = e.season?.slug || ''; const l = (e.competitions?.[0]?.league?.slug) || e.league?.slug || (e.uid || '').split('~')[1]; lg[l] = (lg[l] || 0) + 1; }
    const c = ev[0]?.competitions?.[0]; summ[f] = { events: ev.length, leaguesTop: Object.entries(lg).slice(0, 60), leaguesObj: (j.leagues || []).length, sampleComp: c ? { status: c.status, comp0: { ...c.competitors[0], team: c.competitors[0].team?.displayName }, keys: Object.keys(c), evKeys: Object.keys(ev[0]) } : null };
  } catch (e) { summ[f] = String(e); }
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify({ rep, summ }, null, 1)); console.log(JSON.stringify(rep));
