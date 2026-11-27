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

/** Kapanis orani: aldigimiz oran son orandan yuksekse (oran sonradan dustu) yesil = iyi fiyat. */
const closeTag = (l) => { if (!(l.close > 1)) return ''; const c = l.odd / l.close - 1; return `<div class="muted" style="font-size:12px">${Date.parse(l.t) > Date.now() ? 'şimdi' : 'kapanış'} ${o2(l.close)} <b class="${c > 0.005 ? 'hit' : c < -0.005 ? 'miss' : ''}">${c >= 0 ? '+' : ''}%${num(c * 100, 1)}</b></div>`; };
function comboCard(c, title, cls = 'banko') {
  const st = c.res === 'W' ? '<b class="hit">TUTTU ✓ 🎯</b>' : c.res === 'L' ? '<b class="miss">YATTI ✗ 😞</b>' : c.res === 'V' ? 'iptal' : '';
  return `<div class="card kcard ${cls}"><h2>${title} <span class="tag">toplam oran ${o2(c.odds)}</span></h2>
    ${c.legs.map((l) => `<div class="kleg"><div>${mark(l.res)} <b>${esc(l.h)} – ${esc(l.a)}</b>${scs(l)}<div class="muted">${hm(l.t)} · ${esc(l.ln || l.lg)} · MBS ${l.mbs}${l.res ? '' : mvTag(l.mv)}</div></div>
      <div class="kpick"><b>${esc(l.label)}</b><div class="muted">oran ${o2(l.odd)} · %${Math.round(l.p * 100)}</div>${closeTag(l)}</div></div>`).join('')}
    <div class="ktot"><span>Tutma olasılığı (tahmin) <b>${pct(c.p)}</b></span><span>${st || `Oran ${o2(c.odds)}`}</span></div>
    ${c.p && c.odds ? `<p class="muted" style="margin:6px 0 0">Uzun vadede 100 TL'nin beklenen dönüşü ≈ <b>${Math.round(c.p * c.odds * 100)} TL</b> (iddaa'nın kâr payı yüzünden 100'ün altında; maç sayısı arttıkça düşer).</p>` : ''}
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
const TL = (v) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(Math.round(v)).toLocaleString('tr-TR')} TL`;
function chart(series) {
  const all = series.flatMap((s) => s.pts.map((p) => p[1])); if (!all.length) return '';
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), n = Math.max(...series.map((s) => s.pts.length)), W = 320, H = 120, P = 6;
  const x = (i, len) => P + (len <= 1 ? 0 : (i / (len - 1)) * (W - 2 * P)), y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  return `<svg viewBox="0 0 ${W} ${H}"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(255,255,255,.25)" stroke-dasharray="4 4"/>
    ${series.map((s) => `<polyline fill="none" stroke="${s.col}" stroke-width="2.5" points="${s.pts.map((p, i) => `${x(i, s.pts.length).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/>`).join('')}</svg>
    <div class="muted" style="font-size:12px">${series.map((s) => `<span style="color:${s.col}">━</span> ${s.name}: <b>${TL(s.pts[s.pts.length - 1]?.[1] || 0)}</b>`).join(' · ')}</div>`;
}
const COLS = ['#7aa2ff', '#ffb454', '#58e08f', '#ff6b6b', '#c58cff', '#4dd0e1', '#f48fb1', '#d4e157'];
function kasaCard(O, title, listNames = {}) {
  if (!O?.kasa) return ''; const S = [];
  if (O.kasa.combo.length) S.push({ name: 'Günlük kombine', pts: O.kasa.combo, col: COLS[0] });
  Object.entries(O.kasa.lists || {}).forEach(([k, pts], i) => { if (pts.length) S.push({ name: listNames[k] || k, pts, col: COLS[i + 1] }); });
  if (!S.length) return '';
  return `<div class="card kasa"><h2>${title} <span class="tag">sanal</span></h2>${chart(S)}
    <p class="muted" style="margin:6px 0 0">Gerçek para değil: her günlük kombineye ${O.kasa.stake.combo} TL${Object.keys(O.kasa.lists || {}).length ? `, listelerdeki her maça tek tek ${O.kasa.stake.list} TL` : ''} yatırılmış gibi hesaplanır (o günkü iddaa oranıyla; iptal maç 1,00). Kasanın uzun vadede sıfırın üstünde kalıp kalmadığı, "tuttu" hissinden çok daha doğru ölçüdür; 100–200 kupondan önce karar vermeyin.</p></div>`;
}
function clvCard(O, title) {
  const c = O?.clv?.combo; if (!c || !c.n) return '';
  const l = Object.entries(O.clv.lists || {}).filter(([, v]) => v.n);
  const v = c.avg > 0.005 ? '<b class="hit">Olumlu</b>: seçimlerimiz sonradan düşen oranlara denk geliyor, yani piyasa bizim yönümüze hareket ediyor. Kalıcı olursa gerçek bir avantaj işaretidir.' : c.avg < -0.005 ? '<b class="miss">Olumsuz</b>: seçtiğimiz oranlar sonradan yükseliyor, piyasa bize katılmıyor. Kalıcı olursa avantaj yok demektir.' : 'Nötr: piyasa ne bize doğru ne karşı hareket ediyor.';
  return `<div class="card"><h2>${title} <span class="tag">${c.n} seçim</span></h2>
    <p style="margin:0">Ortalama: <b class="${c.avg > 0 ? 'hit' : c.avg < 0 ? 'miss' : ''}">${c.avg >= 0 ? '+' : ''}%${num(c.avg * 100, 1)}</b> · lehimize olan: %${Math.round(c.pos * 100)}</p>
    ${l.length ? `<p class="muted" style="margin:4px 0 0">${l.map(([k, x]) => `${k}: ${x.avg >= 0 ? '+' : ''}%${num(x.avg * 100, 1)} (${x.n})`).join(' · ')}</p>` : ''}
    <p class="muted" style="margin:6px 0 0">${v} Profesyonellerin ölçütü budur: aldığınız oran maç başlamadan önceki son orandan iyiyse (+), sonuçlar ne olursa olsun uzun vadede kazanma şansı vardır. 15 günlük sonuç şansa çok bağlıdır, kapanış oranı 2–3 haftada daha net konuşur.</p></div>`;
}
function weeklyCard(O, title, lists = []) {
  const W = (O?.weeks || []).filter((w) => w.combo.n || Object.keys(w.lists).length).slice(-6).reverse(); if (!W.length) return '';
  const dd = (d) => `${d.slice(8)}.${d.slice(5, 7)}`;
  return `<div class="card"><h2>${title}</h2><table class="ktab"><tr><th>Hafta</th><th>Kombine</th><th>Kasa</th><th>CLV</th>${lists.map(([, n]) => `<th>${n}</th>`).join('')}</tr>
    ${W.map((w) => `<tr><td>${dd(w.w)}</td><td>${w.combo.n ? `${w.combo.won}/${w.combo.n} <span class="muted">(${num(w.combo.exp, 1)})</span>` : '–'}</td><td class="${w.combo.pl > 0 ? 'hit' : w.combo.pl < 0 ? 'miss' : ''}">${w.combo.n ? TL(w.combo.pl) : '–'}</td><td>${w.clv == null ? '–' : `${w.clv >= 0 ? '+' : ''}%${num(w.clv * 100, 1)}`}</td>
      ${lists.map(([k]) => { const x = w.lists[k]; return `<td>${x ? `${x.hits}/${x.days * 7} <span class="muted">(${num(x.exp, 1)})</span>` : '–'}</td>`; }).join('')}</tr>`).join('')}</table>
    <p class="muted" style="margin:6px 0 0">Parantez içi: olasılıklara göre beklenen. Gerçekleşen beklenene yakınsa sistem dürüst çalışıyor; sürekli üstündeyse avantaj, altındaysa kalibrasyon sorunu vardır.</p></div>`;
}
function basketPart(today, yest) {
  const B = loadDailyB(); if (!B) return '';
  const T = B.days[today] || {}, Y = B.days[yest] || {}, S = B.sum || {}, out = [`<h3 style="margin:4px 4px 8px">Basketbol kuponları · ${dm(today)}</h3>`];
  const TI = [['combo', 'Basketbol banko', 'en az 1,35 · 15 günlük seri', 'bbanko'], ['orta', 'Basketbol orta', 'oran 2,00–3,50', 'bbanko'], ['surpriz', 'Basketbol sürpriz', 'oran 3,50–9,00', 'surpriz']];
  for (const [k, title, rule, cls] of TI) out.push(T[k] ? comboCard(T[k], title, cls) : `<div class="card"><h2>${title} <span class="tag">${rule}</span></h2><p class="muted" style="margin:0">Bugün için kurala uyan kupon yok ya da henüz kurulmadı. Seçimler yalnızca tutma olasılığı yeterince yüksek ve modelin karşı çıkmadığı maçlardan alınır; uygun seçenek yoksa zorla kupon kurulmaz.</p></div>`);
  const yy = TI.filter(([k]) => Y[k]); if (yy.length) { out.push(`<h3 style="margin:14px 4px 8px">Dünün basketbol kuponları</h3>`); for (const [k, title, , cls] of yy) out.push(comboCard(Y[k], 'Dün · ' + title.replace('Basketbol ', ''), cls)); }
  out.push(trial(B, today, '15 günlük deneme · basketbol banko'));
  const st = TI.map(([k, title]) => [title, S[k]]).filter(([, x]) => x?.days);
  if (st.length) out.push(`<div class="card"><h2>Basketbol kupon karnesi</h2>${st.map(([t, x]) => `<div>${t.replace('Basketbol ', '')}: <b>${x.won}/${x.days}</b> tuttu <span class="muted">(beklenen ${num(x.exp, 1)})</span></div>`).join('')}</div>`);
  out.push(kasaCard(B.ozet, 'Sanal kasa · basketbol banko')); out.push(clvCard(B.ozet, 'Kapanış oranı · basketbol'));
  out.push(`<details class="card"><summary><b>Basketbol kuponları nasıl kuruluyor?</b></summary><p class="muted" style="margin:8px 0 0">Pazarlar: maç sonucu, handikap, toplam sayı (uzatmalar dahil), ilk yarı toplam ve handikap, çeyrek toplamları. Her seçimin olasılığı iddaa oranından kâr payı temizlenerek bulunur ve güç modelimizle birleştirilir (piyasa esas; model piyasadan en fazla 8 puan ayrılsa bile etkisi 2 puanla sınırlı, piyasanın da en az %55–60 vermesi şart). İlk yarı ve çeyrekler için model, maçın tahmini toplamını ligin ölçülen ilk yarı/çeyrek payıyla böler (NBA, NCAA, G League, NBL, EuroLeague, EuroCup çeyrek skorlarından). Banko: toplam oran 1,35–2,00, en yüksek tutma olasılığı. Orta ve sürpriz: her seçim en az %60 / %57 olasılıklı ve model onaylı; yüksek oran zayıf takımla değil, daha çok sayıda sağlam seçimle kurulur. Aynı maçtan tek seçim alınır, MBS kuralına uyulur.</p></details>`);
  return out.join('');
}
const LISTS = { g6: ['6+ gol listesi', 'gol6', 'Maçta 6 ya da daha fazla gol. İki yol birleştirilir: iddaa\'nın “Toplam Gol 6+” oranı ve alt/üst + 1X2 çizgilerinden hesaplanan gol beklentisi. Sıradan bir maçta %6.'],
  kk2: ['İki yarıda karşılıklı gol', 'kk2', 'İlk yarıda da ikinci yarıda da iki takım gol atar. İddaa\'nın “1. ve 2. Yarıda KG” oranı ile çizgilerden hesaplanan değer birleştirilir. Sıradan bir maçta %5.'],
  u35: ['3,5 Üst listesi (4+ gol)', 'u35', 'Daha gerçekçi gol listesi: maçta en az 4 gol. Listedeki maçlarda ihtimal genelde %45–60.'],
  kgv: ['KG Var listesi', 'kgv', 'Daha gerçekçi gol listesi: iki takım da gol atar. Listedeki maçlarda ihtimal genelde %60–67.'],
  iykg: ['İlk yarı KG Var', 'kk2', 'İlk yarıda iki takım da gol atar. İddaa\'nın “1. Yarı KG” oranı ile gol beklentisinin ilk yarı payından hesaplanan değer birleştirilir. Sıradan bir maçta yaklaşık %20; listedeki maçlarda genelde %25–35.'],
  iu05: ['İlk yarı 0,5 Üst', 'iu', 'İlk yarıda en az 1 gol. En sık tutan gol listesi: listedeki maçlarda ihtimal genelde %75–85. Oranı düşüktür.'],
  iu15: ['İlk yarı 1,5 Üst', 'iu', 'İlk yarıda en az 2 gol. Listedeki maçlarda ihtimal genelde %40–50.'] };
const LN = { g6: '6+ gol', kk2: '2 yarı KG', u35: '3,5 Üst', kgv: 'KG Var', iykg: 'İY KG', iu05: 'İY 0,5Ü', iu15: 'İY 1,5Ü' };
const RESEARCH = `<details class="card"><summary><b>Neden 7 maçta 1-2 tutuyor?</b> <span class="muted">(araştırma)</span></summary>
    <p class="muted" style="margin:8px 0 0">22 Avrupa liginin 2021-2026 arasındaki 41.373 maçında (football-data.co.uk, Pinnacle kapanış oranları) test ettim. Oranlardan hesaplanan olasılık gerçekle çok iyi uyuştu: bahisçinin en yüksek gördüğü %1'lik maçlarda bile 6+ gol %28,5, iki yarıda KG %13,5 oranında çıktı. Lig, güç farkı ve gol ortalaması gibi ek bilgiler eklemek tahmini iyileştirmedi; yani bu pazarlarda piyasayı geçmek çok zor. Bu yüzden 7 maçlık listede ortalama 1–2 maç tutması normal; liste “en olası maçlar”dır, kombine değildir. Daha sık tutan seçenek isterseniz 3,5 Üst ve KG Var listelerine bakın.</p>
    <p class="muted" style="margin:6px 0 0">📉 işareti: 2,5 Üst oranı ilk görüldüğü andan bu yana belirgin düştü, yani piyasaya gol yönünde para geliyor (profesyonellerin takip ettiği “düşen oran” sinyali).</p></details>`;
const needDaily = (busy) => `<div class="card"><h2>Günlük <span class="tag">gerçek oranlar</span></h2><p class="muted">Günlük banko kombine, basketbol kuponları ve gol listeleri her sabah iddaa oranlarıyla hazırlanır.</p>
    <button id="k-dd" class="primary" style="width:100%">${busy ? 'İndiriliyor…' : 'Günlük verisini indir'}</button></div>`;
const days = () => ({ today: istDay(Date.now()), yest: istDay(Date.now() - 864e5) });
/** Bolum dugmelerindeki kisa durum yazisi. */
export function dailyBadges() {
  const G = loadDaily(), Bk = loadDailyB(), { today, yest } = days(), out = {};
  const T = G?.days[today], Y = G?.days[yest];
  if (G) {
    out.banko = T?.combo ? `bugün oran ${o2(T.combo.odds)}${T.combo.res === 'W' ? ' ✓' : T.combo.res === 'L' ? ' ✗' : ''}` : 'bugün hazırlanıyor';
    for (const k of Object.keys(LISTS)) out[k] = Y?.[k] ? `dün ${Y[k].hits ?? 0}/7 tuttu` : T?.[k] ? 'bugün hazır' : 'hazırlanıyor';
    out.iyu = T?.iu05 || T?.iu15 ? 'bugün hazır' : Y?.iu05 ? `dün 0,5Ü ${Y.iu05.hits ?? 0}/7` : 'hazırlanıyor';
    out.karne = G.sum?.combo?.days ? `kombine ${G.sum.combo.won}/${G.sum.combo.days}` : 'sonuçlar birikiyor';
  }
  if (Bk) { const t = Bk.days[today] || {}, n = ['combo', 'orta', 'surpriz'].filter((k) => t[k]).length; out.basket = n ? `bugün ${n} kupon` : 'bugün kupon yok'; }
  return out;
}
function listPart(G, k, today, yest) {
  const [title, cls, info] = LISTS[k], T = G.days[today], Y = G.days[yest], S = G.sum?.[k];
  const parts = [`<h3 style="margin:4px 4px 8px">${title} · ${dm(today)}</h3>`];
  parts.push(T?.[k] ? listCard(T[k], title, info, cls, false) : `<div class="card"><h2>${title}</h2><p class="muted" style="margin:0">Bugün için henüz hazır değil (iddaa bülteni bekleniyor; veri hattı sabah 07:17'den itibaren çalışır).</p></div>`);
  if (Y?.[k]) parts.push(listCard(Y[k], `Dün · ${title}`, '', cls, true));
  const ds = Object.keys(G.days).sort().filter((d) => d < today && G.days[d][k]).slice(-10).reverse();
  if (ds.length) parts.push(`<div class="card"><h2>Son günler <span class="tag">${S ? `${S.hits ?? 0} maç tuttu · beklenen ${num(S.exp ?? 0, 1)}` : ''}</span></h2><table class="ktab"><tr><th>Gün</th><th>Tutan</th><th>Beklenen</th></tr>
    ${ds.map((d) => { const L = G.days[d][k], e = L.legs.slice(0, 7).reduce((a, l) => a + l.p, 0); return `<tr><td>${d.slice(8)}.${d.slice(5, 7)}</td><td><b>${L.hits ?? 0}</b>/7</td><td class="muted">${num(e, 1)}</td></tr>`; }).join('')}</table></div>`);
  if (k === 'g6' || k === 'kk2') parts.push(RESEARCH);
  return parts.join('');
}
function bankoPart(G, today, yest) {
  const T = G.days[today], Y = G.days[yest];
  return [`<h3 style="margin:4px 4px 8px">Günlük · ${dm(today)}</h3>`,
    T?.combo ? comboCard(T.combo, 'Günlük banko kombinen') : `<div class="card"><h2>Günlük banko kombinen</h2><p class="muted">Bugün için henüz kurulmadı (iddaa bülteni ve maç eşleşmesi bekleniyor). Veri hattı her sabah 07:17'de ve gün içinde birkaç kez çalışır.</p></div>`,
    trial(G, today, '15 günlük deneme · futbol'),
    Y?.combo ? comboCard(Y.combo, `Dünün kombinesi · ${dm(yest)}`) : '',
    `<details class="card"><summary><b>Kombine nasıl kuruluyor?</b></summary><p class="muted" style="margin:8px 0 0">Kombine iddaa'nın gerçek oranlarıyla kurulur: her seçimin olasılığı oranlardan kâr payı temizlenerek bulunur, istatistik modeli açıkça karşı çıkıyorsa seçim alınmaz; toplam oranı 1,35–1,45 olan, MBS kuralına uyan ve tutma olasılığı en yüksek 2–3'lü seçilir. Sonuçlar biriktikçe oran olasılıkları gerçekleşen oranlara göre kendiliğinden düzeltilir. Son güncelleme ${hm(G.updated)}.</p></details>`].join('');
}
function karnePart(G, today) {
  const S = G.sum || {}, parts = [`<h3 style="margin:4px 4px 8px">Karne ve sanal kasa · futbol</h3>`];
  parts.push(kasaCard(G.ozet, 'Sanal kasa · futbol', LN)); parts.push(clvCard(G.ozet, 'Kapanış oranı (CLV) · futbol'));
  const rows = Object.entries(LN).filter(([k]) => S[k]?.days);
  if (S.combo?.days || rows.length) parts.push(`<div class="card"><h2>Toplam karne</h2><table class="ktab"><tr><th></th><th>Gün</th><th>Tutan</th><th>Beklenen</th></tr>
    ${S.combo?.days ? `<tr><td><b>Günlük kombine</b></td><td>${S.combo.days}</td><td><b>${S.combo.won}</b></td><td class="muted">${num(S.combo.exp ?? 0, 1)}</td></tr>` : ''}
    ${rows.map(([k, n]) => `<tr><td>${n}</td><td>${S[k].days}</td><td><b>${S[k].hits}</b> / ${S[k].days * 7}</td><td class="muted">${num(S[k].exp ?? 0, 1)}</td></tr>`).join('')}</table>
    <p class="muted" style="margin:8px 0 0">Listelerde her gün ilk 7 maç sayılır. Tutan sayısı beklenene yakınsa olasılıklar dürüst demektir; sürekli üstündeyse avantaj, altındaysa kalibrasyon sorunu vardır.</p></div>`);
  parts.push(weeklyCard(G.ozet, 'Haftalık rapor · futbol', []));
  const ds = Object.keys(G.days).sort(), pastDays = ds.filter((d) => d < today).slice(-14).reverse(), keys = Object.keys(LN);
  if (pastDays.length) parts.push(`<div class="card"><h2>Son günler</h2><table class="ktab"><tr><th>Gün</th><th>Kombine</th><th>Listeler (tutan/7)</th></tr>
    ${pastDays.map((d) => { const x = G.days[d]; return `<tr><td>${d.slice(8)}.${d.slice(5, 7)}</td><td>${x.combo ? (x.combo.res === 'W' ? '✓ ' : x.combo.res === 'L' ? '✗ ' : '… ') + o2(x.combo.odds) : '–'}</td><td class="muted" style="font-size:12.5px">${keys.filter((k) => x[k]).map((k) => `${LN[k]} <b>${x[k].hits ?? 0}</b>`).join(' · ') || '–'}</td></tr>`; }).join('')}</table></div>`);
  if (parts.length === 1) parts.push('<div class="card muted">Sonuçlar birikiyor; ilk günler bitince burada görünecek.</div>');
  return parts.join('');
}
/** Kombine sekmesinin gunluk bolumleri: banko, basket, g6, kk2, u35, kgv, karne. */
export function dailySection(key, busy) {
  const { today, yest } = days();
  if (key === 'basket') return basketPart(today, yest) || needDaily(busy);
  const G = loadDaily(); if (!G) return needDaily(busy);
  if (key === 'banko') return bankoPart(G, today, yest);
  if (key === 'karne') return karnePart(G, today);
  if (key === 'iyu') { const k = read('kb_iyu', 'iu05'); return `<div class="row seg" id="k-iyu">${[['iu05', 'İY 0,5 Üst'], ['iu15', 'İY 1,5 Üst']].map(([v, l]) => `<button data-iyu="${v}" class="grow ${k === v ? 'primary' : ''}" style="min-height:38px">${l}</button>`).join('')}</div>` + listPart(G, k, today, yest); }
  if (LISTS[key]) return listPart(G, key, today, yest);
  return '';
}
