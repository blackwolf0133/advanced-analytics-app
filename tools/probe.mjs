// YZ ortak analiz: gercek bir mac uzerinde anahtarsiz uc servisle tartisma
import fs from 'node:fs';
import { PROVIDERS, DEFAULT_ON, matchBrief, debate } from '../web/src/aicore.js';
const out = 'probe-out'; fs.mkdirSync(out, { recursive: true });
const g = await (await fetch('https://raw.githubusercontent.com/blackwolf0133/advanced-analytics-app/veri/f/gun.json')).json();
const m = g.matches.find((x) => x.pr && x.st === 'pre' && x.lg === 'uefa.nations') || g.matches.find((x) => x.pr && x.st === 'pre');
const brief = matchBrief(m, g.leagues[m.lg].name, m.t);
const post = async (url, headers, body) => { const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(120000) }); const t = await r.text(); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200)); return t; };
const t0 = Date.now();
const res = await debate(post, PROVIDERS.filter((p) => DEFAULT_ON.includes(p.id)), {}, brief, (s) => console.log(s));
console.log(brief); console.log('sure', Date.now() - t0, 'ms');
for (const a of res.agents) console.log(a.letter, a.prov.name, a.error || '', a.error2 || '', JSON.stringify(a.first), '=>', JSON.stringify(a.final));
console.log('ORTAK', JSON.stringify(res.cons));
fs.writeFileSync(`${out}/ai.json`, JSON.stringify({ brief, res }, null, 1));
