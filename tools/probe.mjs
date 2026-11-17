// Ucretsiz yapay zeka servisleri: anahtarsiz (OVHcloud, Kilo) model listesi ve kisa bir sohbet istegi
import fs from 'node:fs';
const out = 'probe-out'; fs.mkdirSync(out, { recursive: true }); const rep = {};
async function call(name, url, body) {
  const t0 = Date.now();
  try { const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000) });
    const t = await r.text(); rep[name] = { status: r.status, ms: Date.now() - t0, head: t.slice(0, 700) }; fs.writeFileSync(`${out}/${name}.txt`, t.slice(0, 200000)); }
  catch (e) { rep[name] = { error: String(e), ms: Date.now() - t0 }; }
}
const OVH = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', KILO = 'https://api.kilo.ai/api/gateway';
const msg = [{ role: 'system', content: 'Sadece JSON yaz.' }, { role: 'user', content: 'Galatasaray-Fenerbahce macı icin {"p1":..,"px":..,"p2":..,"skor":"x-y"} ver. Kisa.' }];
await call('ovh_models', OVH + '/models');
for (const m of ['gpt-oss-120b', 'Qwen3.5-397B-A17B', 'Meta-Llama-3_3-70B-Instruct', 'Mistral-Small-3.2-24B-Instruct']) await call('ovh_' + m, OVH + '/chat/completions', { model: m, messages: msg, max_tokens: 300, temperature: 0.3 });
await call('kilo_models', KILO + '/models');
await call('kilo_auto', KILO + '/chat/completions', { model: 'kilo-auto/free', messages: msg, max_tokens: 300 });
fs.writeFileSync(`${out}/report.json`, JSON.stringify(rep, null, 1));
console.log(Object.entries(rep).map(([k, v]) => `${k}: ${v.status ?? 'ERR'} ${v.ms}ms ${(v.head || v.error || '').slice(0, 160).replace(/\n/g, ' ')}`).join('\n'));
