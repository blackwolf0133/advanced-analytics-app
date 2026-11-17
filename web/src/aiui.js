// YZ ortak analiz: ayarlar, calistirma, sonuc karti.
import { PROVIDERS, DEFAULT_ON, matchBrief, debate } from './aicore.js';
import { read, write } from './store.js';
import { httpPost } from './net.js';
import { $, esc, pct } from './ui.js';

export const cfg = () => { const c = read('ai_cfg', null); return { on: c?.on || DEFAULT_ON, keys: c?.keys || {} }; };
export const active = () => { const c = cfg(); return PROVIDERS.filter((p) => c.on.includes(p.id) && (!p.key || c.keys[p.id])); };
export const cached = (id) => read('ai_' + id, null);
const busy = new Map();                                   // mac kimligi -> ilerleme metni
export const progress = (id) => busy.get(id);

/** Maci yapay zekalara tartistirir; sonuc telefona kaydedilir (ayni mac icin tekrar sorulmaz). */
export async function run(m, leagueName, whenTxt, onStep = () => {}) {
  const c = cfg(), ps = active();
  if (ps.length < 2) throw new Error('En az iki yapay zekâ açık olmalı (Ayarlar → Yapay zekâ).');
  busy.set(m.id, 'Başlıyor…');
  try {
    const res = await debate((u, h, b) => httpPost(u, h, b), ps, c.keys, matchBrief(m, leagueName, whenTxt), (s) => { busy.set(m.id, s); onStep(s); });
    if (!res.cons) throw new Error('Yapay zekâlardan yanıt alınamadı: ' + res.agents.map((a) => `${a.prov.host} ${a.error || ''}`).join('; '));
    write('ai_' + m.id, res);
    const idx = read('ai_idx', []).filter((x) => x !== m.id); idx.push(m.id); while (idx.length > 150) write('ai_' + idx.shift(), null); write('ai_idx', idx);
    return res;
  } finally { busy.delete(m.id); }
}
const L = ['1', 'X', '2'], oc = (s) => { const [x, y] = s.split('-').map(Number); return x > y ? 0 : x === y ? 1 : 2; };
const mark = (score, real) => { if (!score || !real) return ''; const hit = score === `${real[0]}-${real[1]}`; return hit ? '<em class="ok">✓ tuttu 🎯</em>' : `<em class="no">✗ (${real[0]}-${real[1]})</em>`; };
const pv = (a) => `1 ${Math.round(a.p1)}% · X ${Math.round(a.px)}% · 2 ${Math.round(a.p2)}%`;
export function render(m, res) {
  const c = res.cons, ok = res.agents.filter((a) => a.final), model = m.pr ? m.pr.p.indexOf(Math.max(...m.pr.p)) : null;
  const done = m.st === 'post' && m.r, y = done ? (m.r[0] > m.r[1] ? 0 : m.r[0] === m.r[1] ? 1 : 2) : null;
  return `<div class="aicard"><h3>🤖 YZ ortak analiz · ${ok.length} yapay zekâ, ${res.rounds} tur</h3>
    <div class="tiles">${c.p.map((x, i) => `<div class="tile ${i === c.pick ? 'gold' : ''}"><span>${L[i]}</span><b>${pct(x, 0)}</b></div>`).join('')}</div>
    ${c.iy ? `<div class="sline"><span>İY skor tahmini <small>(${c.iy.votes}/${c.iy.of} oy)</small></span><b>${c.iy.score}</b>${mark(c.iy.score, m.r1)}</div>` : ''}
    ${c.ms ? `<div class="sline"><span>Maç sonucu skor tahmini <small>(${c.ms.votes}/${c.ms.of} oy)</small></span><b>${c.ms.score}</b>${mark(c.ms.score, done ? m.r : null)}</div>` : ''}
    <p class="fpred muted">${c.n} yapay zekânın ${c.agree} tanesi aynı sonucu (${L[c.pick]}) seçti${c.ust25 != null ? ` · 2,5 üst %${Math.round(c.ust25)}` : ''}${c.kg != null ? ` · karşılıklı gol %${Math.round(c.kg)}` : ''}${model == null ? '' : model === c.pick ? ' · istatistik modeliyle aynı sonuç' : ` · istatistik modeli farklı düşünüyor (${L[model]})`}
      ${done ? `<br><b class="${c.pick === y ? 'ok' : 'no'}">Ortak karar ${c.pick === y ? 'tuttu ✓' : 'tutmadı ✗ 😞'}</b>` : ''}</p>
    ${res.agents.map((a) => `<div class="aiag"><b>Analist ${a.letter} · ${esc(a.prov.name)}</b> <span class="muted">(${esc(a.prov.host)})</span><br>
      ${a.final ? `${a.first && a.final !== a.first && pv(a.first) !== pv(a.final) ? `<span class="muted">İlk görüş: ${pv(a.first)} → </span>` : ''}${a.error2 ? '<span class="muted">(2. turda süre doldu; ilk görüşü kullanıldı) </span>' : ''}Son karar: ${pv(a.final)} · İY ${esc(a.final.iy_skor || '?')} · MS ${esc(a.final.ms_skor || '?')}${a.final.guven ? ` · güven ${esc(a.final.guven)}` : ''}
        ${a.final.gerekce ? `<br><span class="muted">${esc(a.final.gerekce)}</span>` : ''}` : `<span class="no">Yanıt alınamadı (${esc(a.error || 'bilinmeyen hata')})</span>`}</div>`).join('')}
    <p class="muted" style="margin:8px 0 0;font-size:12px">Yapay zekâların internet erişimi yok; yalnızca bu ekrandaki verilerle (model olasılıkları, son maçlar, aralarındaki maçlar) akıl yürütürler, haber ve sakatlık bilmezler; bu yüzden çoğu zaman istatistik modeline yakın düşünürler. Bir analiz 1–3 dakika sürebilir. Ortak karar: olasılıkların ortalaması ve skorlarda oylama. Eğlence amaçlıdır.</p>
    <button class="aibtn" data-ai-re="${m.id}" style="margin-top:8px">Yeniden sor</button></div>`;
}

/* ---------------- Ayarlar ---------------- */
export function settingsCard() {
  const c = cfg();
  return `<div class="card" id="ai-set"><h2>Yapay zekâ (YZ ortak analiz)</h2>
    <p class="muted" style="margin:0 0 8px">Futbolda her maçın altındaki “YZ ortak analiz” düğmesi, açık olan yapay zekâlara maçı ayrı ayrı inceletir, sonra birbirlerinin görüşlerini tartıştırır. İlk üçü anahtarsız ve ücretsizdir. Diğerleri için ilgili sitede ücretsiz anahtar alıp buraya yapıştırın. Anahtarlar yalnızca bu telefonda saklanır ve yalnızca o servise gönderilir. Servislere yalnızca maç bilgisi gider, kişisel bilgi gitmez.</p>
    ${PROVIDERS.map((p) => `<label class="chk"><input type="checkbox" data-aion="${p.id}" ${c.on.includes(p.id) ? 'checked' : ''}> <span class="grow">${esc(p.name)} <span class="muted">· ${esc(p.host)}${p.key ? '' : ' · anahtarsız'}</span></span></label>
      ${p.key ? `<input type="password" data-aikey="${p.id}" placeholder="${esc(p.host)} anahtarı (${esc(p.keyUrl)})" value="${esc(c.keys[p.id] || '')}" style="width:100%;margin:0 0 6px" autocomplete="off">` : ''}`).join('')}
    <button id="ai-save" class="primary" style="width:100%;margin-top:8px">Kaydet</button>
    <p class="muted" style="margin:8px 0 0;font-size:12px">Ücretsiz servislerin günlük ve dakikalık sınırları vardır (anahtarsız OVHcloud: model başına dakikada 2 istek). Sınıra takılan yapay zekâ o analizde “yanıt alınamadı” görünür; diğerleri devam eder.</p></div>`;
}
export function bindSettings(toast) {
  const box = $('#ai-set'); if (!box) return;
  $('#ai-save').onclick = () => {
    const on = [...box.querySelectorAll('[data-aion]')].filter((x) => x.checked).map((x) => x.dataset.aion), keys = {};
    for (const i of box.querySelectorAll('[data-aikey]')) if (i.value.trim()) keys[i.dataset.aikey] = i.value.trim();
    write('ai_cfg', { on, keys }); const n = PROVIDERS.filter((p) => on.includes(p.id) && (!p.key || keys[p.id])).length;
    toast(n >= 2 ? `Kaydedildi: ${n} yapay zekâ hazır.` : 'Kaydedildi, ama en az iki yapay zekâ açık olmalı.', 4000);
  };
}
