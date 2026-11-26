// Kombine sekmesinin "Gunluk" bolumu: veri hattinin iddaa oranlariyla her sabah dondurdugu banko kombine,
// 6+ gol ve iki yarida KG listeleri; dunun sonuclari ve 15 gunluk deneme.
import { read, write } from './store.js';
import { esc, num } from './ui.js';
import { VERI } from './today.js';

export const loadDaily = () => read('fg_daily', null);
export const loadDailyB = () => read('bb_daily', null);
async function grab(get, path, key) {
  let err; for (const b of VERI) { try { const j = JSON.parse(await get(b + path)); if (!j.days) throw new Error('biçim'); write(key, { ...j, fetched: Date.now() }); return j; } catch (e) { err = e; } }
  throw err;
}
export async function downloadDaily(get) { const j = await grab(get, 'f/gunluk.json', 'fg_daily'); try { await grab(get, 'b/gunluk.json', 'bb_daily'); } catch (e) { /* basketbol dosyasi henuz yok */ } return j; }
const istDay = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
const hm = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const dm = (d) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
const o2 = (x) => (x ? num(x, 2) : '–');
const mark = (r) => (r === 'W' ? '<b class="hit">✓</b>' : r === 'L' ? '<b class="miss">✗</b>' : r === 'V' ? '<span class="muted">iptal</span>' : '<span class="muted">·</span>');
const scs = (l) => (l.sc ? ` <span class="muted">(${l.sc[0]}-${l.sc[1]}${l.sc[2] != null ? `, İY ${l.sc[2]}-${l.sc[3]}` : ''})</span>` : '');
const pct = (p) => `%${num(p * 100, p < 0.1 ? 1 : 0)}`;

function comboCard(c, title, cls = 'banko') {
  const st = c.res === 'W' ? '<b class="hit">TUTTU ✓ 🎯</b>' : c.res === 'L' ? '<b class="miss">YATTI ✗ 😞</b>' : c.res === 'V' ? 'iptal' : '';
  return `<div class="card kcard ${cls}"><h2>${title} <span class="tag">toplam oran ${o2(c.odds)}</span></h2>
    ${c.legs.map((l) => `<div class="kleg"><div>${mark(l.res)} <b>${esc(l.h)} – ${esc(l.a)}</b>${scs(l)}<div class="muted">${hm(l.t)} · ${esc(l.ln || l.lg)} · MBS ${l.mbs}${l.res ? '' : mvTag(l.mv)}</div></div>
      <div class="kpick"><b>${esc(l.label)}</b><div class="muted">oran ${o2(l.odd)} · %${Math.round(l.p * 100)}</div></div></div>`).join('')}
    <div class="ktot"><span>Tutma olasılığı (tahmin) <b>${pct(c.p)}</b></span><span>${st || `Oran ${o2(c.odds)}`}</span></div>
    <p class="muted" style="margin:6px 0 0">Oranlar ${hm(c.built)} itibarıyla iddaa bülteninden; maç saatine kadar değişebilir, oynarken sitedeki güncel orana bakın.</p></div>`;
}
const mvTag = (mv) => (mv != null && mv <= -0.06 ? ` · <span class="hit">📉 oran %${Math.round(-mv * 100)} düştü</span>` : mv != null && mv >= 0.08 ? ` · 📈 oran %${Math.round(mv * 100)} yükseldi` : '');
function listCard(L, title, info, cls, past) {
  const top = L.legs.slice(0, 7), more = L.legs.slice(7);
  const row = (l, i) => `<div class="kleg"><div>${past ? mark(l.res) + ' ' : `${i + 1}. `}<b>${esc(l.h)} – ${esc(l.a)}</b>${scs(l)}<div class="muted">${hm(l.t)} · ${esc(l.ln || l.lg)}${!past && l.pm != null && l.pd != null ? ` · oran ${pct(l.pm)}, çizgiler ${pct(l.pd)}` : ''}${past ? '' : mvTag(l.mv)}</div></div>
    <div class="kpick"><b>${pct(l.p)}</b><div class="muted">${l.odd ? `oran ${o2(l.odd)}` : `adil ${o2(1 / l.p)}`}</div></div></div>`;
  const exp = top.reduce((s, l) => s + l.p, 0);
  return `<div class="card kcard ${cls}"><h2>${title} <span class="tag">${past ? `${L.hits ?? 0} / 7 tuttu` : '7 maç'}</span></h2>
    ${past ? '' : `<p class="muted" style="margin:0 0 6px">${info}</p>`}${top.map(row).join('')}
    ${more.length && !past ? `<details><summary class="muted">Sıradaki ${more.length} maç</summary>${more.map((l, i) => row(l, i + 7)).join('')}</details>` : ''}
    <div class="ktot"><span>Beklenen tutan <b>${num(exp, 1)} / 7</b></span><span>7'si birden: <b>${oneIn(top.reduce((s, l) => s * l.p, 1))}</b></span></div></div>`;
}
const oneIn = (q) => { const x = 1 / q; return x >= 1e6 ? `${num(x / 1e6, 0)} milyonda 1` : x >= 1e3 ? `${Math.round(x / 1e3)} binde 1` : `${Math.round(x)}'de 1`; };

function trial(G, today, title) {
  const ds = Object.keys(G.days).sort(), first = ds.find((d) => G.days[d].combo), S = G.sum || {};
  if (!first) return '';
  const run = ds.filter((d) => d >= first).slice(0, 15), res = run.map((d) => G.days[d].combo?.res || (d < today ? '-' : '·'));
  const won = res.filter((r) => r === 'W').length, lost = res.filter((r) => r === 'L').length, ps = run.map((d) => G.days[d].combo?.p).filter(Boolean), avgP = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0.65;
  return `<div class="card"><h2>${title} <span class="tag">${run.length}. gün</span></h2>
    <div class="streak">${Array.from({ length: 15 }, (_, i) => { const r = res[i]; return `<span class="${r === 'W' ? 'w' : r === 'L' ? 'l' : ''}">${r === 'W' ? '✓' : r === 'L' ? '✗' : i + 1}</span>`; }).join('')}</div>
    <p style="margin:8px 0 0">Tutan <b>${won}</b> · yatan <b>${lost}</b> · şu anki seri <b>${S.combo?.streak ?? 0}</b> gün · en uzun seri <b>${S.combo?.best ?? 0}</b></p>
    <p class="muted" style="margin:6px 0 0">Gerçekçi beklenti: kuponların ortalama tutma olasılığı %${Math.round(avgP * 100)}. 15 günde ortalama ${num(avgP * 15, 0)} tutar; 15'inin art arda tutma olasılığı yaklaşık ${oneIn(avgP ** 15)}.</p></div>`;
}
function basketPart(today, yest) {
  const B = loadDailyB(); if (!B) return '';
  const T = B.days[today], Y = B.days[yest], out = [`<h3 style="margin:14px 4px 8px">Basketbol günlük banko</h3>`];
  out.push(T?.combo ? comboCard(T.combo, 'Basketbol banko (en az 1,35)', 'bbanko') : `<div class="card"><h2>Basketbol banko</h2><p class="muted">Bugün için uygun banko yok ya da henüz kurulmadı. Kural: toplam oran en az 1,35 (tercihen 1,35–1,50), MBS'ye uyan, tutma olasılığı en yüksek tek maç ya da 2–3'lü. Örneğin üniversite maçları MBS 3 olduğu için tek başına oynanamaz; uygun seçenek yoksa zorla kupon kurulmaz.</p></div>`);
  if (Y?.combo) out.push(comboCard(Y.combo, 'Dünün basketbol bankosu', 'bbanko'));
  out.push(trial(B, today, '15 günlük deneme · basketbol'));
  return out.join('');
}
export function dailyHtml(busy) {
  const G = loadDaily();
  if (!G) return `<div class="card"><h2>Günlük <span class="tag">gerçek oranlar</span></h2><p class="muted">Günlük banko kombine, 6+ gol ve iki yarıda KG listeleri her sabah iddaa oranlarıyla hazırlanır.</p>
    <button id="k-dd" class="primary" style="width:100%">${busy ? 'İndiriliyor…' : 'Günlük verisini indir'}</button></div>`;
  const today = istDay(Date.now()), yest = istDay(Date.now() - 864e5), T = G.days[today], Y = G.days[yest], S = G.sum || {};
  const parts = [`<h3 style="margin:4px 4px 8px">Günlük · ${dm(today)}</h3>`];
  parts.push(T?.combo ? comboCard(T.combo, 'Günlük banko kombinen') : `<div class="card"><h2>Günlük banko kombinen</h2><p class="muted">Bugün için henüz kurulmadı (iddaa bülteni ve maç eşleşmesi bekleniyor). Veri hattı her sabah 07:17'de ve gün içinde birkaç kez çalışır.</p></div>`);
  parts.push(trial(G, today, '15 günlük deneme · futbol'));
  parts.push(basketPart(today, yest));
  const LISTS = [['g6', '6+ gol listesi', 'gol6', 'Maçta 6 ya da daha fazla gol. İki yol birleştirilir: iddaa\'nın “Toplam Gol 6+” oranı ve alt/üst + 1X2 çizgilerinden hesaplanan gol beklentisi. Sıradan bir maçta %6.'],
    ['kk2', 'İki yarıda karşılıklı gol', 'kk2', 'İlk yarıda da ikinci yarıda da iki takım gol atar. İddaa\'nın “1. ve 2. Yarıda KG” oranı ile çizgilerden hesaplanan değer birleştirilir. Sıradan bir maçta %5.'],
    ['u35', '3,5 Üst listesi (4+ gol)', 'u35', 'Daha gerçekçi gol listesi: maçta en az 4 gol. Listedeki maçlarda ihtimal genelde %55–70.'],
    ['kgv', 'KG Var listesi', 'kgv', 'Daha gerçekçi gol listesi: iki takım da gol atar. Listedeki maçlarda ihtimal genelde %60–70.']];
  if (Y && (Y.combo || Y.g6 || Y.kk2)) {
    parts.push(`<h3 style="margin:14px 4px 8px">Dünün sonuçları · ${dm(yest)}</h3>`);
    if (Y.combo) parts.push(comboCard(Y.combo, 'Dünün kombinesi'));
    for (const [k, t, c] of LISTS) if (Y[k]) parts.push(listCard(Y[k], t, '', c, true));
  }
  parts.push(`<h3 style="margin:14px 4px 8px">Bugünün gol listeleri</h3>`);
  for (const [k, t, c, info] of LISTS) parts.push(T?.[k] ? listCard(T[k], t, info, c, false) : `<div class="card muted">${t} bugün için henüz hazır değil.</div>`);
  parts.push(`<details class="card"><summary><b>Neden 7 maçta 1-2 tutuyor?</b> <span class="muted">(araştırma)</span></summary>
    <p class="muted" style="margin:8px 0 0">22 Avrupa liginin 2021-2026 arasındaki 41.373 maçında (football-data.co.uk, Pinnacle kapanış oranları) test ettim. Oranlardan hesaplanan olasılık gerçekle çok iyi uyuştu: bahisçinin en yüksek gördüğü %1'lik maçlarda bile 6+ gol %28,5, iki yarıda KG %13,5 oranında çıktı. Lig, güç farkı ve gol ortalaması gibi ek bilgiler eklemek tahmini iyileştirmedi; yani bu pazarlarda piyasayı geçmek çok zor. Bu yüzden 7 maçlık listede ortalama 1–2 maç tutması normal; liste “en olası maçlar”dır, kombine değildir. Daha sık tutan seçenek isterseniz 3,5 Üst ve KG Var listelerine bakın.</p>
    <p class="muted" style="margin:6px 0 0">📉 işareti: 2,5 Üst oranı ilk görüldüğü andan bu yana belirgin düştü, yani piyasaya gol yönünde para geliyor (profesyonellerin takip ettiği “düşen oran” sinyali).</p></details>`);
  // gecmis tablo
  const ds = Object.keys(G.days).sort(), pastDays = ds.filter((d) => d < today).slice(-14).reverse();
  if (pastDays.length) parts.push(`<div class="card"><h2>Son günler</h2><table class="ktab"><tr><th>Gün</th><th>Kombine</th><th>6+</th><th>2 yarı KG</th><th>3,5Ü</th><th>KG</th></tr>
    ${pastDays.map((d) => { const x = G.days[d]; return `<tr><td>${d.slice(8)}.${d.slice(5, 7)}</td><td>${x.combo ? (x.combo.res === 'W' ? '✓ ' : x.combo.res === 'L' ? '✗ ' : '… ') + o2(x.combo.odds) : '–'}</td><td>${x.g6 ? `${x.g6.hits ?? 0}/7` : '–'}</td><td>${x.kk2 ? `${x.kk2.hits ?? 0}/7` : '–'}</td><td>${x.u35 ? `${x.u35.hits ?? 0}/7` : '–'}</td><td>${x.kgv ? `${x.kgv.hits ?? 0}/7` : '–'}</td></tr>`; }).join('')}</table>
    <p class="muted" style="margin:8px 0 0">Toplam: kombine ${S.combo?.won ?? 0}/${S.combo?.days ?? 0} (beklenen ${num(S.combo?.exp ?? 0, 1)}) · 6+ gol ${S.g6?.hits ?? 0} maç (beklenen ${num(S.g6?.exp ?? 0, 1)}) · iki yarı KG ${S.kk2?.hits ?? 0} maç (beklenen ${num(S.kk2?.exp ?? 0, 1)})</p></div>`);
  parts.push(`<p class="muted" style="margin:0 4px 14px">Son güncelleme ${hm(G.updated)}. Kombine iddaa'nın gerçek oranlarıyla kurulur: her seçimin olasılığı oranlardan kâr payı temizlenerek bulunur, istatistik modeli açıkça karşı çıkıyorsa seçim alınmaz; toplam oranı 1,35–1,45 olan, MBS kuralına uyan ve tutma olasılığı en yüksek 2–3'lü seçilir. Sonuçlar biriktikçe oran olasılıkları gerçekleşen oranlara göre kendiliğinden düzeltilir.</p>`);
  return parts.join('');
}
