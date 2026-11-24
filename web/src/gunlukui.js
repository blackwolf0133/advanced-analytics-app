// Kombine sekmesinin "Gunluk" bolumu: veri hattinin iddaa oranlariyla her sabah dondurdugu banko kombine,
// 6+ gol ve iki yarida KG listeleri; dunun sonuclari ve 15 gunluk deneme.
import { read, write } from './store.js';
import { esc, num } from './ui.js';
import { VERI } from './today.js';

export const loadDaily = () => read('fg_daily', null);
export async function downloadDaily(get) {
  let err; for (const b of VERI) { try { const j = JSON.parse(await get(b + 'f/gunluk.json')); if (!j.days) throw new Error('biçim'); write('fg_daily', { ...j, fetched: Date.now() }); return j; } catch (e) { err = e; } }
  throw err;
}
const istDay = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
const hm = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const dm = (d) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
const o2 = (x) => (x ? num(x, 2) : '–');
const mark = (r) => (r === 'W' ? '<b class="hit">✓</b>' : r === 'L' ? '<b class="miss">✗</b>' : r === 'V' ? '<span class="muted">iptal</span>' : '<span class="muted">·</span>');
const scs = (l) => (l.sc ? ` <span class="muted">(${l.sc[0]}-${l.sc[1]}${l.sc[2] != null ? `, İY ${l.sc[2]}-${l.sc[3]}` : ''})</span>` : '');
const pct = (p) => `%${num(p * 100, p < 0.1 ? 1 : 0)}`;

function comboCard(c, title) {
  const st = c.res === 'W' ? '<b class="hit">TUTTU ✓ 🎯</b>' : c.res === 'L' ? '<b class="miss">YATTI ✗ 😞</b>' : c.res === 'V' ? 'iptal' : '';
  return `<div class="card kcard banko"><h2>${title} <span class="tag">toplam oran ${o2(c.odds)}</span></h2>
    ${c.legs.map((l) => `<div class="kleg"><div>${mark(l.res)} <b>${esc(l.h)} – ${esc(l.a)}</b>${scs(l)}<div class="muted">${hm(l.t)} · ${esc(l.ln || l.lg)} · MBS ${l.mbs}</div></div>
      <div class="kpick"><b>${esc(l.label)}</b><div class="muted">oran ${o2(l.odd)} · %${Math.round(l.p * 100)}</div></div></div>`).join('')}
    <div class="ktot"><span>Tutma olasılığı (tahmin) <b>${pct(c.p)}</b></span><span>${st || `Oran ${o2(c.odds)}`}</span></div>
    <p class="muted" style="margin:6px 0 0">Oranlar ${hm(c.built)} itibarıyla iddaa bülteninden; maç saatine kadar değişebilir, oynarken sitedeki güncel orana bakın.</p></div>`;
}
function listCard(L, title, info, isKK, past) {
  const top = L.legs.slice(0, 7), more = L.legs.slice(7);
  const row = (l, i) => `<div class="kleg"><div>${past ? mark(l.res) + ' ' : `${i + 1}. `}<b>${esc(l.h)} – ${esc(l.a)}</b>${scs(l)}<div class="muted">${hm(l.t)} · ${esc(l.ln || l.lg)}</div></div>
    <div class="kpick"><b>${pct(l.p)}</b><div class="muted">${l.odd ? `oran ${o2(l.odd)}` : `adil ${o2(1 / l.p)}`}</div></div></div>`;
  const exp = top.reduce((s, l) => s + l.p, 0);
  return `<div class="card kcard ${isKK ? 'kk2' : 'gol6'}"><h2>${title} <span class="tag">${past ? `${L.hits ?? 0} / 7 tuttu` : '7 maç'}</span></h2>
    ${past ? '' : `<p class="muted" style="margin:0 0 6px">${info}</p>`}${top.map(row).join('')}
    ${more.length && !past ? `<details><summary class="muted">Sıradaki ${more.length} maç</summary>${more.map((l, i) => row(l, i + 7)).join('')}</details>` : ''}
    <div class="ktot"><span>Beklenen tutan <b>${num(exp, 1)} / 7</b></span><span>7'si birden: <b>${oneIn(top.reduce((s, l) => s * l.p, 1))}</b></span></div></div>`;
}
const oneIn = (q) => { const x = 1 / q; return x >= 1e6 ? `${num(x / 1e6, 0)} milyonda 1` : x >= 1e3 ? `${Math.round(x / 1e3)} binde 1` : `${Math.round(x)}'de 1`; };

export function dailyHtml(busy) {
  const G = loadDaily();
  if (!G) return `<div class="card"><h2>Günlük <span class="tag">gerçek oranlar</span></h2><p class="muted">Günlük banko kombine, 6+ gol ve iki yarıda KG listeleri her sabah iddaa oranlarıyla hazırlanır.</p>
    <button id="k-dd" class="primary" style="width:100%">${busy ? 'İndiriliyor…' : 'Günlük verisini indir'}</button></div>`;
  const today = istDay(Date.now()), yest = istDay(Date.now() - 864e5), T = G.days[today], Y = G.days[yest], S = G.sum || {};
  const parts = [`<h3 style="margin:4px 4px 8px">Günlük · ${dm(today)}</h3>`];
  parts.push(T?.combo ? comboCard(T.combo, 'Günlük banko kombinen') : `<div class="card"><h2>Günlük banko kombinen</h2><p class="muted">Bugün için henüz kurulmadı (iddaa bülteni ve maç eşleşmesi bekleniyor). Veri hattı her sabah 07:17'de ve gün içinde birkaç kez çalışır.</p></div>`);
  // 15 gunluk deneme
  const ds = Object.keys(G.days).sort(), first = ds.find((d) => G.days[d].combo);
  if (first) {
    const run = ds.filter((d) => d >= first).slice(0, 15), res = run.map((d) => G.days[d].combo?.res || (d < today ? '-' : '·'));
    const won = res.filter((r) => r === 'W').length, lost = res.filter((r) => r === 'L').length, ps = run.map((d) => G.days[d].combo?.p).filter(Boolean), avgP = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0.65;
    parts.push(`<div class="card"><h2>15 günlük deneme <span class="tag">${run.length}. gün</span></h2>
      <div class="streak">${Array.from({ length: 15 }, (_, i) => { const r = res[i]; return `<span class="${r === 'W' ? 'w' : r === 'L' ? 'l' : ''}">${r === 'W' ? '✓' : r === 'L' ? '✗' : i + 1}</span>`; }).join('')}</div>
      <p style="margin:8px 0 0">Tutan <b>${won}</b> · yatan <b>${lost}</b> · şu anki seri <b>${S.combo?.streak ?? 0}</b> gün · en uzun seri <b>${S.combo?.best ?? 0}</b></p>
      <p class="muted" style="margin:6px 0 0">Gerçekçi beklenti: kuponların ortalama tutma olasılığı %${Math.round(avgP * 100)}. 15 günde ortalama ${num(avgP * 15, 0)} tutar; 15'inin art arda tutma olasılığı yaklaşık ${oneIn(avgP ** 15)}. Seri bozulursa sistem değil şans normaldir.</p></div>`);
  }
  if (Y && (Y.combo || Y.g6 || Y.kk2)) {
    parts.push(`<h3 style="margin:14px 4px 8px">Dünün sonuçları · ${dm(yest)}</h3>`);
    if (Y.combo) parts.push(comboCard(Y.combo, 'Dünün kombinesi'));
    if (Y.g6) parts.push(listCard(Y.g6, '6+ gol listesi', '', false, true));
    if (Y.kk2) parts.push(listCard(Y.kk2, 'İki yarıda KG listesi', '', true, true));
  }
  parts.push(`<h3 style="margin:14px 4px 8px">Bugünün gol listeleri</h3>`);
  parts.push(T?.g6 ? listCard(T.g6, '6+ gol listesi', 'Maçta 6 ya da daha fazla gol. Olasılık iddaa\'nın “Toplam Gol 6+” oranından (kâr payı temizlenerek) gelir; sıradan bir maçta %6-8.', false, false) : '<div class="card muted">6+ gol listesi bugün için henüz hazır değil.</div>');
  parts.push(T?.kk2 ? listCard(T.kk2, 'İki yarıda karşılıklı gol', 'İlk yarıda da ikinci yarıda da iki takım gol atar. Olasılık iddaa\'nın 1. yarı KG ve takım gol oranlarından hesaplanır; sıradan bir maçta %5.', true, false) : '<div class="card muted">İki yarıda KG listesi bugün için henüz hazır değil.</div>');
  // gecmis tablo
  const pastDays = ds.filter((d) => d < today).slice(-14).reverse();
  if (pastDays.length) parts.push(`<div class="card"><h2>Son günler</h2><table class="ktab"><tr><th>Gün</th><th>Kombine</th><th>6+ gol</th><th>İki yarı KG</th></tr>
    ${pastDays.map((d) => { const x = G.days[d]; return `<tr><td>${d.slice(8)}.${d.slice(5, 7)}</td><td>${x.combo ? (x.combo.res === 'W' ? '✓ ' : x.combo.res === 'L' ? '✗ ' : '… ') + o2(x.combo.odds) : '–'}</td><td>${x.g6 ? `${x.g6.hits ?? 0}/7` : '–'}</td><td>${x.kk2 ? `${x.kk2.hits ?? 0}/7` : '–'}</td></tr>`; }).join('')}</table>
    <p class="muted" style="margin:8px 0 0">Toplam: kombine ${S.combo?.won ?? 0}/${S.combo?.days ?? 0} (beklenen ${num(S.combo?.exp ?? 0, 1)}) · 6+ gol ${S.g6?.hits ?? 0} maç (beklenen ${num(S.g6?.exp ?? 0, 1)}) · iki yarı KG ${S.kk2?.hits ?? 0} maç (beklenen ${num(S.kk2?.exp ?? 0, 1)})</p></div>`);
  parts.push(`<p class="muted" style="margin:0 4px 14px">Son güncelleme ${hm(G.updated)}. Kombine iddaa'nın gerçek oranlarıyla kurulur: her seçimin olasılığı oranlardan kâr payı temizlenerek bulunur, istatistik modeli açıkça karşı çıkıyorsa seçim alınmaz; toplam oranı 1,35–1,45 olan, MBS kuralına uyan ve tutma olasılığı en yüksek 2–3'lü seçilir. Sonuçlar biriktikçe oran olasılıkları gerçekleşen oranlara göre kendiliğinden düzeltilir.</p>`);
  return parts.join('');
}
