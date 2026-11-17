import assert from 'node:assert'; import { test } from 'node:test';
import { parseAnswer, consensus, debate, matchBrief, PROVIDERS, DEFAULT_ON } from '../src/aicore.js';
test('yapay zeka cevabi: JSON ayiklanir, olasiliklar 100e tamamlanir, skor bicimi duzeltilir', () => {
  const a = parseAnswer('Düşündüm.\n```json\n{"p1": "50%", "px": 30, "p2": 30, "iy_skor": "1:0", "ms_skor": " 2 - 1 ", "ust25": 55, "kg": "48", "guven": "orta", "gerekce": "Ev sahibi formda."}\n```');
  assert.ok(Math.abs(a.p1 + a.px + a.p2 - 100) < 1e-9 && Math.abs(a.p1 - 45.45) < 0.01 && a.iy_skor === '1-0' && a.ms_skor === '2-1' && a.kg === 48);
  assert.throws(() => parseAnswer('cevap yok')); assert.throws(() => parseAnswer('{"p1":"a"}'));
});
test('ortak karar: ortalama olasilik, skorda oylama (esitlikte ortak sonuca uyan skor)', () => {
  const c = consensus([{ p1: 60, px: 25, p2: 15, ms_skor: '1-1', iy_skor: '0-0' }, { p1: 50, px: 30, p2: 20, ms_skor: '2-1', iy_skor: '1-0' }, { p1: 20, px: 30, p2: 50, ms_skor: '0-1', iy_skor: '0-0' }]);
  assert.strictEqual(c.pick, 0); assert.strictEqual(c.agree, 2); assert.strictEqual(c.ms.score, '2-1'); assert.deepStrictEqual(c.iy, { score: '0-0', votes: 2, of: 3 });
  assert.ok(Math.abs(c.p[0] - 0.4333) < 0.001);
});
test('tartisma: 1. tur bagimsiz, 2. tur digerlerini gorur; hata veren devam ettirmez; yogunlukta tekrar dener', async () => {
  const seen = [], tries = new Map();
  const post = async (url, h, body) => { const b = JSON.parse(body), m = b.messages[1].content, model = b.model; seen.push({ model, round2: m.includes('Diğer analistlerin') });
    if (model === 'DeepSeek-V4.1-Flash-1017') throw new Error('sunucu 500 yanıtı verdi');
    if (model === 'kilo-auto/free') { tries.set(model, (tries.get(model) || 0) + 1); if (tries.get(model) < 2) throw new Error('sunucu 429 yanıtı verdi'); }
    const p = model.startsWith('gpt') ? [55, 25, 20] : [40, 30, 30]; const r2 = m.includes('Diğer analistlerin');
    return JSON.stringify({ choices: [{ message: { content: JSON.stringify({ p1: r2 ? 50 : p[0], px: p[1], p2: p[2], iy_skor: '0-0', ms_skor: '1-0', ust25: 50, kg: 45, guven: 'orta', gerekce: r2 ? 'Diğerleriyle uzlaştım.' : 'İlk görüş.' }) } }] }); };
  const prov = PROVIDERS.filter((p) => DEFAULT_ON.includes(p.id)), m = { h: 'A', a: 'B', n: 0, pr: { p: [0.5, 0.3, 0.2], ht: [0.3, 0.5, 0.2], xg: [1.5, 1], sc: [[1, 1, 0.1]], scb: [[1, 0, 0.1], [1, 1, 0.1], [0, 1, 0.1]], hsc: [[0, 0, 0.3]], hscb: [[1, 0, 0.2], [0, 0, 0.3], [0, 1, 0.2]], o25: 0.5, btts: 0.5 }, fh: [['11-14', 'C', 'E', 2, 0]], fa: [], hh: [] };
  const brief = matchBrief(m, 'Lig', '17 Kasım 20:00'); assert.ok(brief.includes('11.14 C (evde) 2-0 G') && brief.includes('skor tahmini 1-0'));
  const res = await debate(post, prov, {}, brief);
  const ok = res.agents.filter((a) => a.final); assert.strictEqual(ok.length, 3); assert.ok(res.agents.find((a) => a.prov.id === 'ovh-ds').error.includes('500'));
  assert.strictEqual(res.rounds, 2); assert.ok(seen.filter((x) => x.round2).length === 3 && ok.every((a) => a.final.gerekce === 'Diğerleriyle uzlaştım.'));
  assert.strictEqual(res.cons.ms.score, '1-0'); assert.ok(tries.get('kilo-auto/free') >= 2);
});
test('sure siniri: yavas analist 2. turda beklenmez, ilk gorusu kullanilir', async () => {
  const post = async (url, h, body) => { const b = JSON.parse(body), r2 = b.messages[1].content.includes('Diğer analistlerin');
    if (r2 && b.model === 'Qwen3.5-397B-A17B') await new Promise((ok) => setTimeout(ok, 400));
    return JSON.stringify({ choices: [{ message: { content: JSON.stringify({ p1: 50, px: 30, p2: 20, iy_skor: '0-0', ms_skor: '1-0', gerekce: r2 ? 'son' : 'ilk' }) } }] }); };
  const t0 = Date.now(), res = await debate(post, PROVIDERS.filter((p) => ['ovh-gpt', 'ovh-qwen', 'kilo'].includes(p.id)), {}, 'veri', () => {}, [1000, 150]);
  const q = res.agents.find((a) => a.prov.id === 'ovh-qwen'); assert.ok(Date.now() - t0 < 1000 && q.error2 === 'süre doldu' && q.final.gerekce === 'ilk' && res.agents.find((a) => a.prov.id === 'kilo').final.gerekce === 'son');
});
