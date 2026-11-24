// Futbol "Bugun" ekrani: istenen ligler isaretlenir, maclar tek listede; 1X2, skor, ilk yari / ikinci yari tahmini; canli skor.
import * as T from './today.js';
import { read, write } from './store.js';
import { $, esc, pct, num } from './ui.js';
import { httpGet } from './net.js';
import * as AI from './aiui.js';

const st = { day: 0, sort: read('fg_sort', 'time'), min: 0, open: false, busy: false, timer: null, toast: null, polling: false, lastErr: 0 };
const DAYS = [[-1, 'Dün'], [0, 'Bugün'], [1, 'Yarın'], [2, 'Sonraki gün']];
const hm = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const when = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const L = ['1', 'X', '2'];
const outcome = (sc) => (sc[0] > sc[1] ? 0 : sc[0] === sc[1] ? 1 : 2);
/** Skor satirinin sonu: tuttu / tutmadi (gercek skorla) ya da bos. */
const mark = (hit, real) => (hit == null || !real ? '' : hit ? '<em class="ok">✓ tuttu 🎯</em>' : `<em class="no">✗ (${real[0]}-${real[1]})</em>`);

function selection(data, dayLeagues) {
  const saved = read('fg_sel', null); if (saved) return new Set(saved);
  const imp = dayLeagues.filter((l) => (data.leagues[l]?.pri ?? 99) < 99); return new Set(imp.length ? imp : dayLeagues);   // ilk acilis: onemli ligler
}
const saveSel = (set) => write('fg_sel', [...set]);

export function viewToday(toast, host) {
  if (toast) st.toast = toast;
  const data = T.load(), day = T.dayOffset(st.day);
  host.innerHTML = `
  <div class="card"><h2>Günün maçları <span class="tag">${data ? `${data.matches.length} maç · ${Object.keys(data.leagues).length} lig/kupa` : 'veri yok'}</span></h2>
    <button id="fg-dl" class="primary" style="width:100%" ${st.busy ? 'disabled' : ''}>${st.busy ? 'İndiriliyor…' : data ? 'Maçları ve tahminleri güncelle' : 'Maçları ve tahminleri indir'}</button>
    <p class="muted" style="margin:10px 0 0">${data ? `Tahminler: ${when(data.updated)}. ` : ''}ESPN’in takip ettiği 220 lig ve kupanın dün, bugün ve sonraki iki günün maçları. Tahminler her gün bütün liglerin sonuçlarıyla kurulan tek bir modelden gelir; skorlar maç sırasında canlı güncellenir.</p></div>
  <div id="fg-body"></div>
  <div class="warn">Tahminler yalnızca geçmiş skorlardan hesaplanır; kadro, sakatlık ve motivasyon bilgisi yoktur. Skor tahmini en olası skordur ve tek başına olasılığı çoğu zaman %10–15’tir. Kazanç garantisi yoktur.</div>`;
  $('#fg-dl').onclick = async () => {
    st.busy = true; viewToday(null, host);
    try { await T.download(httpGet); st.toast('Maçlar ve tahminler güncellendi.'); } catch (e) { st.toast('İndirilemedi: ' + e.message, 7000); }
    st.busy = false; if ($('#fg-dl')) viewToday(null, host);
  };
  if (!data) { $('#fg-body').innerHTML = `<div class="card"><h2>Nasıl çalışır</h2><ol class="steps"><li>“İndir”e dokunun: günün bütün maçları ve tahminleri iner (birkaç yüz KB).</li><li>“Ligler” kutusundan istediğiniz ligleri işaretleyin; maçlar saat, lig ya da güvene göre sıralanır.</li><li>Maç başlayınca skor canlı gelir. Bitince tahmin tuttuysa skor yeşil ✓, tutmadıysa kırmızı ✗ 😞 olur.</li></ol></div>`; stop(); return; }
  const dayMs = data.matches.filter((m) => T.istDay(m.t) === day), counts = new Map(); for (const m of dayMs) counts.set(m.lg, (counts.get(m.lg) || 0) + 1);
  const dayLeagues = [...counts.keys()], sel = selection(data, dayLeagues);
  const shown = dayMs.filter((m) => sel.has(m.lg) && (!st.min || (m.pr && Math.max(...m.pr.p) >= st.min)));
  const order = { time: (a, b) => (a.t < b.t ? -1 : 1), league: (a, b) => (data.leagues[a.lg]?.pri ?? 99) - (data.leagues[b.lg]?.pri ?? 99) || lgName(data, a.lg).localeCompare(lgName(data, b.lg), 'tr') || (a.t < b.t ? -1 : 1),
    conf: (a, b) => (b.pr ? Math.max(...b.pr.p) : 0) - (a.pr ? Math.max(...a.pr.p) : 0) };
  shown.sort(order[st.sort] || order.time);
  const fin = shown.filter((m) => T.verdict(m) === 'win' || T.verdict(m) === 'lose'), wins = fin.filter((m) => T.verdict(m) === 'win').length, scs = fin.filter(T.scoreHit).length;
  const kt = data.karne?.test || {}, kl = data.karne?.live || {}, ka = kt['*'], kv = kl['*'];
  $('#fg-body').innerHTML = `
  <div class="row" id="fg-day" style="margin-bottom:10px">${DAYS.map(([o, l]) => `<button data-d="${o}" class="grow ${st.day === o ? 'primary' : ''}" style="min-height:40px;padding:4px 2px;font-size:12.5px">${l}</button>`).join('')}</div>
  <div class="card"><h2 id="fg-lgh" style="cursor:pointer">Ligler <span class="tag">${[...sel].filter((l) => counts.has(l)).length} / ${dayLeagues.length} seçili ${st.open ? '▲' : '▼'}</span></h2>
    ${st.open ? chooser(data, counts, sel) : `<p class="muted" style="margin:0">${dayLeagues.length ? [...sel].filter((l) => counts.has(l)).map((l) => esc(lgName(data, l))).slice(0, 8).join(', ') + ([...sel].filter((l) => counts.has(l)).length > 8 ? '…' : '') || 'Hiç lig seçili değil.' : 'Bu gün için maç yok.'} <span class="link">Değiştirmek için dokunun.</span></p>`}</div>
  <div class="card"><div class="row" id="fg-sort" style="margin-bottom:8px">${[['time', 'Saate göre'], ['league', 'Lige göre'], ['conf', 'Güvene göre']].map(([k, v]) => `<button data-s="${k}" class="grow ${st.sort === k ? 'primary' : ''}" style="min-height:36px;padding:4px;font-size:12.5px">${v}</button>`).join('')}</div>
    <div class="row" id="fg-min">${[[0, 'Hepsi'], [0.5, '%50+'], [0.6, '%60+'], [0.7, '%70+']].map(([v, l]) => `<button data-m="${v}" class="grow ${st.min === v ? 'primary' : ''}" style="min-height:36px;padding:4px;font-size:12.5px">${l}</button>`).join('')}</div>
    <p class="muted" style="margin:8px 0 0">${shown.length} maç${fin.length ? ` · biten ${fin.length} maçın <b class="ok">${wins}</b> tanesinde sonuç tahmini tuttu${scs ? `, ${scs} tanesinde skor tahmini de tuttu 🎯` : ''}` : ''}</p></div>
  ${ka && ka.n >= 30 ? `<div class="card"><h2>Model karnesi <span class="tag">${ka.n} maç</span></h2><p class="muted" style="margin:0 0 8px">Son 3 hafta: model her hafta yalnızca o haftadan önceki maçlarla kuruldu ve sonraki 7 günü tahmin etti.</p>
    <div class="tiles"><div class="tile gold"><span>Maç sonucu (1X2)</span><b>${pct(ka.hit, 0)}</b></div><div class="tile"><span>Tam skor</span><b>${pct(ka.sc, 0)}</b></div><div class="tile"><span>İlk yarı sonucu</span><b>${ka.ht == null ? '—' : pct(ka.ht, 0)}</b></div></div>
    ${selKarne(data, kt, sel)}${kv && kv.n >= 20 ? `<p class="muted" style="margin:8px 0 0">Uygulamanın maçtan önce kaydettiği ${kv.n} tahminin %${Math.round(kv.hit * 100)}’i tuttu (skor %${Math.round(kv.sc * 100)}).</p>` : ''}
    <p class="muted" style="margin:8px 0 0">Üç sonuçlu maçta rastgele tahmin %33 tutar. Tam skor çok zordur; en iyi modellerde bile %10–13 civarındadır.</p></div>` : ''}
  <div id="fg-list">${list(data, shown)}</div>`;
  $('#fg-day').onclick = (e) => { const b = e.target.closest('[data-d]'); if (b) { st.day = Number(b.dataset.d); viewToday(null, host); } };
  $('#fg-lgh').onclick = () => { st.open = !st.open; viewToday(null, host); };
  $('#fg-sort').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { st.sort = b.dataset.s; write('fg_sort', st.sort); viewToday(null, host); } };
  $('#fg-min').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { st.min = Number(b.dataset.m); viewToday(null, host); } };
  $('#fg-list').onclick = (e) => {
    const b = e.target.closest('[data-ai],[data-ai-re]'); if (!b) return;
    const id = b.dataset.ai || b.dataset.aiRe, m = data.matches.find((x) => x.id === id); if (!m) return;
    if (b.dataset.aiRe) write('ai_' + id, null);
    const fresh = T.load()?.matches.find((x) => x.id === id) || m; aiStart(fresh, data, host);
  };
  const ch = $('#fg-ch');
  if (ch) ch.onclick = (e) => {
    const b = e.target.closest('[data-a]'), c = e.target.closest('input[data-l]');
    if (c) { c.checked ? sel.add(c.dataset.l) : sel.delete(c.dataset.l); saveSel(sel); viewToday(null, host); return; }
    if (!b) return; const a = b.dataset.a;
    if (a === 'all') dayLeagues.forEach((l) => sel.add(l)); else if (a === 'none') dayLeagues.forEach((l) => sel.delete(l));
    else if (a === 'imp') { dayLeagues.forEach((l) => sel.delete(l)); dayLeagues.filter((l) => (data.leagues[l]?.pri ?? 99) < 99).forEach((l) => sel.add(l)); }
    saveSel(sel); viewToday(null, host);
  };
  if (st.day <= 0 && shown.some((m) => m.st !== 'post' || Date.now() - Date.parse(m.t) < 3 * 3600e3)) start(host, sel); else stop();
}
const lgName = (data, l) => data.leagues[l]?.name || l;
function aiCached(m) { const pr = AI.progress(m.id); if (pr) return `<div class="aicard"><p class="muted" style="margin:0">⏳ ${esc(pr)}</p></div>`; const r = AI.cached(m.id); return r && r.cons ? AI.render(m, r) : ''; }
async function aiStart(m, data, host) {
  const box = () => document.getElementById('ai-' + m.id), show = (t) => { const b = box(); if (b) b.innerHTML = `<div class="aicard"><p class="muted" style="margin:0">⏳ ${esc(t)}</p></div>`; };
  if (AI.progress(m.id)) return;
  show('Başlıyor…');
  try { const res = await AI.run(m, lgName(data, m.lg), when(m.t), show); const b = box(); if (b) b.innerHTML = AI.render(m, res); }
  catch (e) { const b = box(); if (b) b.innerHTML = `<div class="aicard"><p class="no" style="margin:0">${esc(e.message)}</p></div>`; }
}
function selKarne(data, kt, sel) {
  const rows = [...sel].map((l) => [l, kt[l]]).filter(([, k]) => k && k.n >= 20).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  return rows.length ? `<table class="t" style="margin-top:8px"><thead><tr><th>Seçili lig</th><th>Maç</th><th>1X2</th><th>Skor</th><th>İY</th></tr></thead><tbody>${rows.map(([l, k]) => `<tr><td>${esc(lgName(data, l))}</td><td>${k.n}</td><td><b>${pct(k.hit, 0)}</b></td><td>${pct(k.sc, 0)}</td><td>${k.ht == null ? '—' : pct(k.ht, 0)}</td></tr>`).join('')}</tbody></table>` : '';
}
function chooser(data, counts, sel) {
  const by = new Map(); for (const l of counts.keys()) { const u = data.leagues[l]?.ulke || 'Diğer'; if (!by.has(u)) by.set(u, []); by.get(u).push(l); }
  const ur = (u) => Math.min(...by.get(u).map((l) => data.leagues[l]?.pri ?? 99));
  const groups = [...by.keys()].sort((a, b) => ur(a) - ur(b) || a.localeCompare(b, 'tr'));
  return `<div id="fg-ch"><div class="row" style="margin-bottom:8px"><button data-a="all" class="grow">Hepsi</button><button data-a="imp" class="grow">Önemli ligler</button><button data-a="none" class="grow">Hiçbiri</button></div>
    ${groups.map((u) => `<p class="muted" style="margin:10px 0 4px;font-weight:600">${esc(u)}</p>${by.get(u).sort((a, b) => (data.leagues[a]?.pri ?? 99) - (data.leagues[b]?.pri ?? 99) || lgName(data, a).localeCompare(lgName(data, b), 'tr')).map((l) =>
      `<label class="chk"><input type="checkbox" data-l="${esc(l)}" ${sel.has(l) ? 'checked' : ''}> <span class="grow">${esc(lgName(data, l))}</span> <span class="muted">${counts.get(l)} maç</span></label>`).join('')}`).join('')}</div>`;
}
function liveBox(m) {
  const v = T.verdict(m);
  if (/POSTP|CANCEL|ABANDON/i.test(m.sn || '')) return `<div class="lb">Ertelendi</div>`;
  if (m.st === 'pre' || !m.r) return `<div class="lb"><b>${hm(m.t)}</b></div>`;
  const ht = /HALFTIME|HALF_TIME/i.test(m.sn || ''), score = `<b class="lsc">${m.r[0]} - ${m.r[1]}</b>`;
  if (m.st === 'in') return `<div class="lb ${v}">${score}<span class="lmin"><i class="dot"></i>${ht ? 'Devre arası' : esc(m.clock || 'canlı')}</span></div>`;
  return `<div class="lb ${v}">${score}<span class="lmin">${v === 'win' ? 'Sonuç ✓' : v === 'lose' ? 'Sonuç ✗ 😞' : 'Bitti'}</span></div>`;
}
function list(data, ms) {
  if (!ms.length) return `<div class="card"><p class="muted">Seçili liglerde bu gün maç yok. “Ligler” kutusundan lig ekleyin ya da başka bir gün seçin.</p></div>`;
  return ms.map((m) => {
    const p = m.pr, pk = p ? T.pick(p.p) : -1, hv = T.htVerdict(m);
    return `<div class="card fm" data-id="${m.id}"><p class="lgtag">${esc(lgName(data, m.lg))}${m.n ? ' · tarafsız saha' : ''}</p>
      <div class="fmrow"><div class="grow fmt"><b>${esc(m.h)}</b><b>${esc(m.a)}</b></div>${liveBox(m)}</div>
      ${p ? `<div class="tiles" style="margin-top:8px">${p.p.map((x, i) => `<div class="tile ${i === pk ? 'gold' : ''}"><span>${['1 (ev)', 'X (berabere)', '2 (deplasman)'][i]}</span><b>${pct(x, 0)}</b></div>`).join('')}</div>
      <div class="sline"><span>İY skor tahmini</span><b>${T.htScore(p)[0]}-${T.htScore(p)[1]}</b>${mark(T.htScoreHit(m), m.r1)}</div>
      <div class="sline"><span>Maç sonucu skor tahmini</span><b>${T.ftScore(p)[0]}-${T.ftScore(p)[1]}</b>${mark(T.scoreHit(m), m.st === 'post' ? m.r : null)}</div>
      ${m.od ? `<p class="fpred" style="margin:6px 0 0">İddaa oranları: ${[m.od.ms && `1 <b>${num(m.od.ms[0], 2)}</b> · X <b>${num(m.od.ms[1], 2)}</b> · 2 <b>${num(m.od.ms[2], 2)}</b>`, m.od.ou?.['2.5'] && `2,5 Alt <b>${num(m.od.ou['2.5'][0], 2)}</b> · Üst <b>${num(m.od.ou['2.5'][1], 2)}</b>`, m.od.kg && `KG Var <b>${num(m.od.kg[0], 2)}</b> · Yok <b>${num(m.od.kg[1], 2)}</b>`].filter(Boolean).join('<br>')}</p>` : ''}
      <p class="fpred muted">İlk yarı sonucu ${p.ht.map((x, i) => `${L[i]} ${pct(x, 0)}`).join(' · ')}${hv == null ? '' : ` <span class="${hv ? 'ok' : 'no'}">${hv ? '✓' : '✗'}</span>`}<br>İkinci yarı sonucu ${p.h2.map((x, i) => `${L[i]} ${pct(x, 0)}`).join(' · ')}<br>2,5 üst ${pct(p.o25, 0)} · karşılıklı gol ${pct(p.btts, 0)} · beklenen gol ${num(p.xg[0])}–${num(p.xg[1])}${p.nh < 6 || p.na < 6 ? ' · az veri' : ''}${m.bt ? '<br>Bu tahmin maçtan sonra, yalnızca o günden önceki verilerle hesaplandı.' : ''}</p>
      <button class="aibtn" data-ai="${m.id}">🤖 YZ ortak analiz</button><div class="aiout" id="ai-${m.id}">${aiCached(m)}</div>`
      : `<p class="muted" style="margin:8px 0 0">Bu maç için tahmin yok: takımlardan biri için yeterli maç verisi yok (genç ve kadın milli takımlar, alt lig takımları).</p>`}</div>`;
  }).join('');
}
function start(host, sel) {
  if (st.timer) return;
  const tick = async () => {
    if (!document.querySelector('#fg-list')) { stop(); return; }
    if (st.polling) return; st.polling = true;
    try { const data = T.load(); if (data) { const r = await T.refreshLive(httpGet, data, sel); if (r.changed && document.querySelector('#fg-list')) viewToday(null, host); if (r.errors && Date.now() - st.lastErr > 300e3) { st.lastErr = Date.now(); st.toast('Canlı skor alınamadı; bağlantıyı kontrol edin.', 4000); } } }
    finally { st.polling = false; }
  };
  st.timer = setInterval(tick, 45000); setTimeout(tick, 500);
}
export function stop() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }
