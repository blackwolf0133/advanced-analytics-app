// "YZ ortak analiz": ucretsiz yapay zeka servisleri bir maci once bagimsiz analiz eder, sonra birbirinin gorusunu gorup
// son kararini verir; ortak karar olasiliklarin ortalamasi ve skorlarda oylama ile cikar.
// (NeurIPS 2025 "Debate or Vote": cok ajanli sistemlerde kazancin cogu oylamadan gelir; uzun tartisma az katki saglar.
//  Bu yuzden tek tartisma turu + oylama kullanilir.)
// Bu dosya saf mantiktir: istek gonderme islevi disaridan verilir (telefonda yerel kopru, testte fetch).

export const PROVIDERS = [
  { id: 'ovh-gpt', name: 'gpt-oss-120b', host: 'OVHcloud', url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', model: 'gpt-oss-120b', key: false, extra: { reasoning_effort: 'low' } },
  { id: 'ovh-qwen', name: 'Qwen 3.5 (397B)', host: 'OVHcloud', url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions', model: 'Qwen3.5-397B-A17B', key: false, extra: { chat_template_kwargs: { enable_thinking: false } } },
  { id: 'kilo', name: 'Kilo ücretsiz model', host: 'Kilo', url: 'https://api.kilo.ai/api/gateway/chat/completions', model: 'kilo-auto/free', key: false },
  { id: 'groq', name: 'gpt-oss-120b', host: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', key: true, keyUrl: 'console.groq.com/keys', extra: { reasoning_effort: 'low' } },
  { id: 'gemini', name: 'Gemini 2.5 Flash', host: 'Google', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', key: true, keyUrl: 'aistudio.google.com/app/apikey' },
  { id: 'openrouter', name: 'Nemotron 3.5 (ücretsiz)', host: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'nvidia/nemotron-3.5-lightning:free', key: true, keyUrl: 'openrouter.ai/keys' },
];
export const DEFAULT_ON = ['ovh-gpt', 'ovh-qwen', 'kilo'];
const LETTERS = 'ABCDEF';

const pctTxt = (x) => `%${Math.round(x * 100)}`;
const formTxt = (rows) => (rows && rows.length ? rows.map(([d, opp, ha, gf, ga]) => `${d.replace('-', '.')} ${opp} (${ha === 'E' ? 'evde' : 'deplasmanda'}) ${gf}-${ga} ${gf > ga ? 'G' : gf === ga ? 'B' : 'M'}`).join('; ') : 'veri yok');

/** Maci anlatan veri metni (yapay zekalara verilen tek bilgi kaynagi). */
export function matchBrief(m, leagueName, whenTxt) {
  const p = m.pr, lines = [`Maç: ${m.h} (ev sahibi) – ${m.a} (deplasman) · ${leagueName} · ${whenTxt} (Türkiye saati)${m.n ? ' · tarafsız saha' : ''}`];
  if (p) {
    const ft = p.scb?.[p.p.indexOf(Math.max(...p.p))] || p.sc[0], ht = p.hscb?.[p.ht.indexOf(Math.max(...p.ht))] || p.hsc[0];
    lines.push(`İstatistik modeli (bu sezonun bütün maç skorlarından): 1 ${pctTxt(p.p[0])}, X ${pctTxt(p.p[1])}, 2 ${pctTxt(p.p[2])}; beklenen gol ${p.xg[0].toFixed(2)}–${p.xg[1].toFixed(2)}; ilk yarı 1 ${pctTxt(p.ht[0])}, X ${pctTxt(p.ht[1])}, 2 ${pctTxt(p.ht[2])}; skor tahmini ${ft[0]}-${ft[1]}, ilk yarı ${ht[0]}-${ht[1]}; 2,5 üst ${pctTxt(p.o25)}, karşılıklı gol ${pctTxt(p.btts)}.`);
  } else lines.push('İstatistik modeli: bu maç için yeterli veri yok.');
  lines.push(`${m.h} son maçları (yeniden eskiye; skor kendi golü-yediği): ${formTxt(m.fh)}`);
  lines.push(`${m.a} son maçları: ${formTxt(m.fa)}`);
  lines.push(`Aralarındaki son maçlar: ${m.hh && m.hh.length ? m.hh.map(([d, h, hg, ag, a]) => `${d} ${h} ${hg}-${ag} ${a}`).join('; ') : 'veri yok'}`);
  return lines.join('\n');
}
const SYSTEM = 'Sen deneyimli ve temkinli bir futbol analistisin. Sana bir maçın verileri verilecek. İnternete erişimin yok: sakatlık, kadro, teknik direktör ya da haber UYDURMA; yalnızca verilen veriye dayan. Yanıtını yalnızca tek bir JSON nesnesi olarak ver, başka hiçbir metin yazma.';
const FORMAT = '{"p1": ev kazanır olasılığı (0-100), "px": beraberlik (0-100), "p2": deplasman kazanır (0-100), "iy_skor": "x-y", "ms_skor": "x-y", "ust25": 2,5 üst olasılığı (0-100), "kg": karşılıklı gol olasılığı (0-100), "guven": "düşük" | "orta" | "yüksek", "gerekce": "en fazla 3 kısa cümle, Türkçe"}';
export function messages1(brief) {
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${brief}\n\nBu maçı analiz et. p1+px+p2 = 100 olsun; ms_skor en yüksek olasılık verdiğin sonuçla uyumlu olsun. İstenen JSON:\n${FORMAT}` }];
}
const short = (a) => JSON.stringify({ p1: a.p1, px: a.px, p2: a.p2, iy_skor: a.iy_skor, ms_skor: a.ms_skor, ust25: a.ust25, kg: a.kg, gerekce: a.gerekce });
export function messages2(brief, mine, others) {
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${brief}\n\nSenin ilk görüşün: ${short(mine)}\nDiğer analistlerin ilk görüşleri:\n${others.map((o) => `Analist ${o.letter}: ${short(o.a)}`).join('\n')}\n\nBu görüşleri tart. İkna olduysan görüşünü değiştir, olmadıysan koru. Son kararını aynı JSON biçiminde ver; gerekce'de kime neden katıldığını ya da katılmadığını kısaca yaz.\n${FORMAT}` }];
}
/** Yapay zeka cevabindaki JSON'u ayiklar ve dogrular. */
export function parseAnswer(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) throw new Error('JSON yok');
  const j = JSON.parse(s.slice(a, b + 1)), num = (v) => { const x = Number(String(v ?? '').replace('%', '').replace(',', '.')); return Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : NaN; };
  const sc = (v) => { const m = /^\s*(\d{1,2})\s*[-:–]\s*(\d{1,2})\s*$/.exec(String(v || '')); return m ? `${Number(m[1])}-${Number(m[2])}` : null; };
  let p1 = num(j.p1), px = num(j.px), p2 = num(j.p2); if (![p1, px, p2].every(Number.isFinite) || p1 + px + p2 <= 0) throw new Error('olasılık yok');
  const t = p1 + px + p2; p1 = (p1 / t) * 100; px = (px / t) * 100; p2 = (p2 / t) * 100;
  return { p1, px, p2, iy_skor: sc(j.iy_skor), ms_skor: sc(j.ms_skor), ust25: num(j.ust25), kg: num(j.kg), guven: String(j.guven || '').slice(0, 12), gerekce: String(j.gerekce || '').slice(0, 500) };
}
const outcome = (s) => { const [x, y] = s.split('-').map(Number); return x > y ? 0 : x === y ? 1 : 2; };
/** Ortak karar: olasiliklarin ortalamasi; skorlarda oylama (esitlikte ortak sonuca uyan skor). */
export function consensus(list) {
  const n = list.length; if (!n) return null;
  const avg = (k) => { const v = list.map((a) => a[k]).filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const p = [avg('p1'), avg('px'), avg('p2')], pk = p.indexOf(Math.max(...p));
  const vote = (k, prefer) => { const c = new Map(); for (const a of list) if (a[k]) c.set(a[k], (c.get(a[k]) || 0) + 1); if (!c.size) return null;
    const top = Math.max(...c.values()), tied = [...c.entries()].filter(([, v]) => v === top).map(([s]) => s); return { score: tied.find(prefer) || tied[0], votes: top, of: n }; };
  const picks = list.map((a) => [a.p1, a.px, a.p2].indexOf(Math.max(a.p1, a.px, a.p2))), agree = picks.filter((x) => x === pk).length;
  return { p: p.map((x) => x / 100), pick: pk, agree, n, ms: vote('ms_skor', (s) => outcome(s) === pk), iy: vote('iy_skor', () => true), ust25: avg('ust25'), kg: avg('kg') };
}
function content(json) {
  const c = json?.choices?.[0]?.message?.content; if (typeof c === 'string' && c.trim()) return c;
  if (Array.isArray(c)) return c.map((x) => x.text || '').join('');
  throw new Error(json?.choices?.[0]?.finish_reason === 'length' ? 'yanıt yarıda kesildi' : json?.error?.message || 'boş yanıt');
}
async function ask(post, prov, key, msgs) {
  const headers = { 'Content-Type': 'application/json' }; if (prov.key) headers.Authorization = 'Bearer ' + key;
  if (prov.id === 'openrouter') { headers['HTTP-Referer'] = 'https://github.com/blackwolf0133/advanced-analytics-app'; headers['X-Title'] = 'Advanced Analytics'; }
  const body = { model: prov.model, messages: msgs, temperature: 0.4, max_tokens: 3000, ...(prov.extra || {}) };
  return parseAnswer(content(JSON.parse(await post(prov.url, headers, JSON.stringify(body)))));
}
/**
 * Tartisma: 1. tur bagimsiz, 2. tur (en az iki cevap geldiyse) digerlerini gorup son karar. onStep(metin) ilerleme bildirir.
 * Donus: { agents: [{ letter, prov, first, final, error }], cons, rounds }
 */
export async function debate(post, providers, keys, brief, onStep = () => {}) {
  const agents = providers.map((prov, i) => ({ letter: LETTERS[i], prov, first: null, final: null, error: null }));
  onStep(`1. tur: ${agents.length} yapay zekâ maçı ayrı ayrı inceliyor…`);
  await Promise.all(agents.map(async (g) => { try { g.first = await ask(post, g.prov, keys[g.prov.id], messages1(brief)); } catch (e) { g.error = e.message; } }));
  const ok = agents.filter((g) => g.first); let rounds = 1;
  if (ok.length >= 2) {
    rounds = 2; onStep(`2. tur: ${ok.length} yapay zekâ birbirinin görüşünü tartışıyor…`);
    await Promise.all(ok.map(async (g) => { try { g.final = await ask(post, g.prov, keys[g.prov.id], messages2(brief, g.first, ok.filter((o) => o !== g).map((o) => ({ letter: o.letter, a: o.first })))); } catch (e) { g.final = null; g.error2 = e.message; } }));
  }
  for (const g of ok) if (!g.final) g.final = g.first;
  return { agents, cons: consensus(ok.map((g) => g.final)), rounds, at: Date.now() };
}
