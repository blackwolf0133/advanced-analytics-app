// Basketbol ekrani: butun ligler.
import * as B from './basket.js';
import { read, write } from './store.js';
import { $, esc, pct, num } from './ui.js';
import { httpGet } from './net.js';
import { fetchLive } from './bblive.js';

const st = { id: read('bb_sel', 'all'), min: 0.5, tab: 'games', db: null, model: null, ev: null, key: null, busy: false, home: null, away: null, neutral: false,
  region: read('bb_region', 'Hepsi'), ncaa: read('bb_ncaa', false), cache: {}, step: '' };
const ALL = 'all', REGIONS = ['Hepsi', 'Türkiye', 'Avrupa', 'ABD', 'Avustralya'];
/** Lig modeli (onbellekli). lite: yalnizca bugunku guc; tam: ileriye donuk testle birlikte (sonuclar, karne). */
function modelOf(id, full) {
  const db = B.loadLeague(id); if (!db) return null;
  const key = db.updated + db.fetched, c = st.cache[id];
  if (c && c.key === key && (c.full || !full)) return c.full || c.lite;
  if (full) { const M = B.build(db); st.cache[id] = { key, full: M, lite: M }; return M; }
  const M = B.buildLite(db); st.cache[id] = { key, lite: M }; return M;
}
const sgn = (v, d = 1) => (v > 0 ? '+' : '') + num(v, d);
const trTime = (utc) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(utc));
const trDay = (ms) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const US = new Set(['nba', 'wnba', 'gleague', 'ncaam', 'ncaaw']);
const cross = (id) => id !== 'wnba';                      // WNBA tek takvim yilinda oynanir

function reload() {
  if (st.id === ALL) { st.db = null; st.model = null; st.ev = null; return; }
  st.db = B.loadLeague(st.id);
  const key = st.db ? st.id + st.db.updated + st.db.fetched : null;
  if (key !== st.key) { st.key = key; st.model = st.db ? B.build(st.db) : null; st.ev = st.model ? B.evaluate(st.model) : null; }
}
function leagueSelect() {
  const groups = new Map(); for (const l of B.leagues()) { if (!groups.has(l.country)) groups.set(l.country, []); groups.get(l.country).push(l); }
  const order = ['Türkiye', 'Avrupa', 'ABD', 'Avustralya'];
  return `<select id="b-lg" style="width:100%;margin-bottom:10px"><option value="${ALL}" ${st.id === ALL ? 'selected' : ''}>★ Bütün ligler (yaklaşan maçlar tek listede)</option>${[...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([c, ls]) =>
    `<optgroup label="${esc(c)}">${ls.map((l) => `<option value="${l.id}" ${l.id === st.id ? 'selected' : ''}>${esc(l.name)}${B.loadLeague(l.id) ? ' ✓' : ''}</option>`).join('')}</optgroup>`).join('')}</select>`;
}
export function viewBasket(toast) {
  if (toast) st.toast = toast; reload();
  if (st.id === ALL) { viewAll(); return; }
  const db = st.db, n = db ? B.allGames(db).length : 0, ys = db ? Object.keys(db.seasons).map(Number).sort() : [], meta = B.leagues().find((l) => l.id === st.id) || { name: st.id };
  const age = db ? (Date.now() - Date.parse(db.updated)) / 864e5 : 0;
  $('#main').innerHTML = `
  <div class="card"><h2>Lig <span class="tag">${n ? `${n} maç · ${ys.map((y) => B.seasonLabel(y, cross(st.id))).join(', ')}` : 'veri yok'}</span></h2>
    ${leagueSelect()}
    <button id="b-dl" class="primary" style="width:100%" ${st.busy ? 'disabled' : ''}>${st.busy ? 'İndiriliyor…' : n ? 'Verileri güncelle' : 'Verileri indir'}</button>
    <p class="muted" style="margin:10px 0 0">${db ? `Veri: ${trDay(Date.parse(db.updated))}. ` : ''}Maç sonuçları her gün otomatik toplanır (ESPN, EuroLeague, Türkiye Basketbol Federasyonu) ve telefona küçük bir dosya olarak iner; hesaplar telefonda yapılır.</p>
  </div>
  ${db && age > 2.5 ? `<div class="warn">Veri ${Math.floor(age)} gündür güncellenmemiş. Önce “Verileri güncelle”ye dokunun; düzelmezse otomatik toplama durmuş olabilir (GitHub’da Actions → “Gunluk veri” → Run workflow).</div>` : ''}
  ${n && n < 150 ? `<div class="warn">Bu ligde henüz ${n} maç var; takımlar az maçla tanınıyor, tahminler zayıftır.</div>` : ''}
  ${n ? `<div class="row" id="b-tabs" style="margin-bottom:12px">${[['games', 'Maçlar'], ['results', 'Sonuçlar'], ['match', 'Analiz'], ['eval', 'Karne'], ['table', 'Sıralama']].map(([k, v]) => `<button data-t="${k}" class="grow ${st.tab === k ? 'primary' : ''}" style="padding:8px 2px;min-height:40px;font-size:12.5px">${v}</button>`).join('')}</div><div id="b-body"></div>`
    : `<div class="card"><h2>Nasıl çalışır</h2><ol class="steps"><li>Ligi seçip “Verileri indir”e dokunun: son sezonların sonuçları ve yaklaşan maçlar iner.</li><li>Her takımın gücü, son maçlar daha ağır sayılarak sayı farklarından hesaplanır. Ev sahibi avantajı her lig için kendi verisinden ölçülür.</li><li>“Karne”, modelin geçmişte gerçekten ne kadar tuttuğunu gösterir.</li></ol></div>`}
  <div class="warn">Olasılıklar yalnızca geçmiş maç skorlarından hesaplanır. Sakatlık, kadro ve dinlenme bilgisi yoktur; tek bir yıldız oyuncunun yokluğu sonucu ciddi biçimde değiştirir. Kazanç garantisi yoktur.</div>`;
  $('#b-lg').onchange = (e) => { st.id = e.target.value; write('bb_sel', st.id); st.home = st.away = null; viewBasket(); };
  $('#b-dl').onclick = async () => {
    st.busy = true; viewBasket(); const id = st.id;
    try { const r = await B.download(httpGet, id); st.toast(`${meta.name}: ${r.n} maç indirildi.`); }
    catch (e) { st.toast('İndirilemedi: ' + e.message, 7000); }
    st.busy = false; if ($('#b-dl')) viewBasket();
  };
  const tabs = $('#b-tabs'); if (!tabs || !st.model) return;
  tabs.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; viewBasket(); } };
  ({ games: tabGames, results: tabResults, match: tabMatch, eval: tabEval, table: tabTable })[st.tab]();
}
function confNote(p, ev = st.ev) {
  const b = ev?.buckets.find((x) => p >= x.lo && p < x.hi);
  return b && b.n >= 20 ? `Geçmiş testte bu güven aralığındaki (${pct(b.lo, 0)}–${pct(Math.min(1, b.hi), 0)}) ${b.n} tahminin ${pct(b.rate)}’i tuttu.` : '';
}
function card(home, away, when, neutral = 0, M = st.model, league = '') {
  const p = B.predict(M, home, away, neutral), ph = p.pHome, pick = ph >= 0.5 ? home : away, conf = Math.max(ph, 1 - ph);
  return `<div class="card">${league ? `<p class="lgtag">${esc(league)}</p>` : ''}<h2>${esc(away)} <span class="muted">@</span> ${esc(home)}</h2>
    ${when ? `<p class="muted" style="margin:-4px 0 8px">${when} (Türkiye saati)${neutral ? ' · tarafsız saha' : ''}</p>` : neutral ? '<p class="muted" style="margin:-4px 0 8px">Tarafsız saha</p>' : ''}
    <div class="tiles"><div class="tile ${conf >= 0.7 ? 'gold' : ''}"><span>Favori</span><b style="font-size:15px">${esc(pick)} ${pct(conf, 0)}</b></div>
      <div class="tile"><span>Beklenen fark</span><b>${num(Math.abs(p.margin))}</b></div><div class="tile"><span>Beklenen toplam</span><b>${num(p.total)}</b></div></div>
    <div class="bar2"><i style="width:${ph * 100}%"></i></div>
    <p class="muted" style="margin:6px 0 0">Ev sahibi ${esc(home)} ${pct(ph)} · deplasman ${esc(away)} ${pct(1 - ph)}${neutral ? '' : ` · ev avantajı ${num(M.s.hfa)} sayı`}${p.known ? '' : ' · takımlardan biri için veri yok'}${M === st.model ? '<br>' + confNote(conf) : ''}</p></div>`;
}
function chips() {
  const al = st.ev?.atLeast.find((x) => x.t === st.min);
  return `<div class="card"><h2>Güven eşiği <span class="tag">modelin favoriye verdiği olasılık</span></h2>
    <div class="row" id="b-min">${[[0.5, 'Hepsi'], [0.6, '%60+'], [0.7, '%70+'], [0.8, '%80+']].map(([v, l]) => `<button data-m="${v}" class="grow ${st.min === v ? 'primary' : ''}" style="min-height:40px;padding:6px 4px">${l}</button>`).join('')}</div>
    <p class="muted" style="margin:10px 0 0">${al && al.n ? `Geçmiş testte güveni ${pct(st.min, 0)} ve üstü olan <b>${al.n}</b> tahminin <b>${pct(al.rate)}</b>’i tuttu (aralık ${pct(al.ci[0], 0)}–${pct(al.ci[1], 0)}).` : 'Bu eşik için geçmiş testte yeterli tahmin yok.'}
      ${st.min >= 0.7 ? ' Eşik yükseldikçe isabet artar, maç sayısı ve bahis oranı düşer.' : ''}</p></div>`;
}
function bindChips(redraw) { $('#b-min').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { st.min = Number(b.dataset.m); redraw(); } }; }
function tabGames() {
  const now = Date.now(), up = (st.db.upcoming || []).map(([utc, home, away, neutral]) => ({ t: Date.parse(utc), utc, home, away, neutral })).filter((g) => g.t > now - 3 * 3600e3).sort((a, b) => a.t - b.t);
  const horizon = up.length ? Math.max(up[0].t + 36 * 3600e3, now + 48 * 3600e3) : 0, all = up.filter((g) => g.t <= horizon);
  const list = all.filter((g) => { const p = B.predict(st.model, g.home, g.away, g.neutral).pHome; return Math.max(p, 1 - p) >= st.min; });
  $('#b-body').innerHTML = chips() + (list.length ? `<p class="muted" style="margin:0 4px 10px">Sıradaki ${all.length} maçın ${list.length} tanesi bu eşiğin üstünde.</p>` + list.map((g) => card(g.home, g.away, trTime(g.utc), g.neutral)).join('')
    : `<div class="card"><p class="muted">${all.length ? `Sıradaki ${all.length} maçın hiçbiri bu eşiğin üstünde değil. Daha düşük bir eşik seçin.` : 'Önümüzdeki 3 hafta içinde listelenen maç yok (lig arası ya da sezon bitmiş olabilir). “Verileri güncelle”ye dokunun ya da “Analiz” sekmesinden takımları kendiniz seçin.'}</p></div>`);
  bindChips(tabGames);
}
function tabResults() {
  const days = B.recent(st.model).map((d) => ({ ...d, games: d.games.filter((g) => g.conf >= st.min) }));
  let n = 0, k = 0; for (const d of days) for (const g of d.games) { n++; k += g.hit ? 1 : 0; }
  const day = (iso) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00Z'));
  $('#b-body').innerHTML = chips() + `<div class="card"><h2>Son ${days.length} maç günü <span class="tag">${n ? `${n} tahminin ${k} tanesi tuttu` : 'tahmin yok'}</span></h2>
    <p class="muted" style="margin:0">Her satır, modelin o maçtan <b>önceki</b> bilgilerle verdiği tahmini ve gerçek sonucu gösterir. <span class="ok">✓</span> favori kazandı, <span class="no">✗</span> kaybetti.${US.has(st.id) ? ' Tarihler UTC’ye göredir; ABD’deki akşam maçları bir sonraki güne yazılır.' : ''} Dünkü maçlar için önce “Verileri güncelle”ye dokunun.</p></div>`
    + days.map((d) => { const kk = d.games.filter((g) => g.hit).length; return `<div class="card"><h2>${day(d.date)} <span class="tag">${d.games.length ? `${kk} / ${d.games.length} tuttu` : 'bu eşikte maç yok'}</span></h2>
      ${d.games.map((g) => `<div class="res"><span class="mark ${g.hit ? 'ok' : 'no'}">${g.hit ? '✓' : '✗'}</span><div class="grow"><b>${esc(g.away)} ${g.ap} – ${g.hp} ${esc(g.home)}</b>
        <div class="muted">Tahmin: ${esc(g.pick)} ${pct(g.conf, 0)} · fark ${num(Math.abs(g.margin))}${g.total ? ` · toplam ${num(g.total, 0)} (gerçek ${g.actualTotal})` : ''}${g.early ? ' · sezon başı (az veri)' : ''}</div></div></div>`).join('')}</div>`; }).join('');
  bindChips(tabResults);
}
function tabMatch() {
  const y = st.model.lastSeason, teams = [...new Set(st.db.seasons[y].flatMap((g) => [g[1], g[2]]))].sort((a, b) => a.localeCompare(b, 'tr'));
  st.home = teams.includes(st.home) ? st.home : teams[0]; st.away = teams.includes(st.away) ? st.away : teams[1];
  const opt = (sel) => teams.map((t) => `<option ${t === sel ? 'selected' : ''}>${esc(t)}</option>`).join('');
  $('#b-body').innerHTML = `<div class="card"><h2>Takımları seçin</h2><p class="muted" style="margin:0 0 4px">Ev sahibi</p><select id="b-h" style="width:100%">${opt(st.home)}</select>
    <p class="muted" style="margin:10px 0 4px">Deplasman</p><select id="b-a" style="width:100%">${opt(st.away)}</select>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="b-n" ${st.neutral ? 'checked' : ''}> Tarafsız saha (Final Four, turnuva)</label></div>
    ${st.home === st.away ? '<div class="warn">İki farklı takım seçin.</div>' : card(st.home, st.away, '', st.neutral ? 1 : 0)}`;
  $('#b-h').onchange = (e) => { st.home = e.target.value; tabMatch(); }; $('#b-a').onchange = (e) => { st.away = e.target.value; tabMatch(); };
  $('#b-n').onchange = (e) => { st.neutral = e.target.checked; tabMatch(); };
}
function tabEval() {
  const e = st.ev;
  if (!e) { $('#b-body').innerHTML = '<div class="card"><p class="muted">Karne için henüz yeterli maç yok (sezon başı ya da küçük lig).</p></div>'; return; }
  $('#b-body').innerHTML = `<div class="card"><h2>Model karnesi <span class="tag">${e.n} maç</span></h2>
    <p class="muted" style="margin:0 0 10px">Her tahmin, o maçtan önceki bilgilerle yapılmıştır (ileriye dönük test). Verinin ilk %45’i modelin ısınması için kullanılır ve sayılmaz.</p>
    <div class="tiles"><div class="tile gold"><span>Kazananı bilme</span><b>${pct(e.acc)}</b></div><div class="tile"><span>Hep ev sahibi deseydik</span><b>${pct(Math.max(e.homeRate, 1 - e.homeRate))}</b></div><div class="tile"><span>Güven aralığı</span><b style="font-size:13px">${pct(e.accCi[0], 0)}–${pct(e.accCi[1], 0)}</b></div>
      <div class="tile"><span>Ev avantajı (veriden)</span><b>${num(e.hfa)} sayı</b></div><div class="tile"><span>Ev sahibini seçme</span><b>${pct(e.homePick, 0)}</b></div><div class="tile"><span>Gerçekte ev kazandı</span><b>${pct(e.homeRate, 0)}</b></div>
      <div class="tile"><span>Sayı farkı hatası</span><b>${num(e.marginMae)}</b></div><div class="tile"><span>Toplam sayı hatası</span><b>${e.totalMae == null ? '—' : num(e.totalMae)}</b></div><div class="tile"><span>Lig ortalaması deseydik</span><b>${e.totalBaseMae == null ? '—' : num(e.totalBaseMae)}</b></div></div>
    <p class="muted" style="margin:10px 0 0">Model ev sahibini, güçler eşitse ve ev avantajı farkı kapatıyorsa seçer; güçlü deplasman takımını da favori gösterebilir. “Hata”, tahminle gerçek sonuç arasındaki ortalama sayı farkıdır. Bahis sitelerinin çizgileri sakatlık bilgisini de kullandığı için genellikle daha isabetlidir.</p></div>
  <div class="card"><h2>Güvene göre isabet</h2><table class="t"><thead><tr><th>Modelin güveni</th><th>Maç</th><th>Tutan</th><th>Aralık</th></tr></thead><tbody>
    ${e.buckets.map((b) => `<tr><td>${pct(b.lo, 0)}–${pct(Math.min(1, b.hi), 0)}</td><td>${b.n}</td><td><b>${b.rate == null ? '—' : pct(b.rate)}</b></td><td class="muted">${b.n ? pct(b.ci[0], 0) + '–' + pct(b.ci[1], 0) : ''}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin:10px 0 0">Yüksek güvenli tahminler daha sık tutar ama sayıları azdır. %80 güven, beş maçtan birinin tutmayacağı anlamına gelir.</p></div>`;
}
function tabTable() {
  const rows = B.standings(st.db), P = st.model.P, s = st.model.s, power = (t) => (P.ix.has(t) ? s.r[P.ix.get(t)] : 0);
  $('#b-body').innerHTML = `<div class="card"><h2>Sıralama <span class="tag">${B.seasonLabel(Math.max(...Object.keys(st.db.seasons).map(Number)), cross(st.id))}</span></h2><table class="t"><thead><tr><th>#</th><th>Takım</th><th>G-M</th><th>Fark</th><th>Güç</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.team)}</td><td>${r.w}-${r.l}</td><td>${sgn((r.pf - r.pa) / (r.w + r.l))}</td><td>${sgn(power(r.team))}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin:10px 0 0">Güç: takımın ortalama bir rakibe karşı tarafsız sahada beklenen sayı farkı (son maçlar daha ağır sayılır, rakiplerin gücü hesaba katılır).</p></div>`;
}

/* ---------------- Butun ligler ---------------- */
function inView(l) { return (st.region === 'Hepsi' || l.country === st.region) && (st.ncaa || !/^ncaa/.test(l.id)); }
function viewAll() {
  const ls = B.leagues(), have = ls.filter((l) => B.loadLeague(l.id)), oldest = have.length ? Math.min(...have.map((l) => Date.parse(B.loadLeague(l.id).updated))) : 0;
  $('#main').innerHTML = `
  <div class="card"><h2>Lig <span class="tag">${have.length ? `${have.length} / ${ls.length} lig indirildi` : 'veri yok'}</span></h2>
    ${leagueSelect()}
    <button id="b-all" class="primary" style="width:100%" ${st.busy ? 'disabled' : ''}>${st.busy ? `İndiriliyor… ${esc(st.step)}` : have.length ? 'Bütün ligleri güncelle' : 'Bütün ligleri indir'}</button>
    <p class="muted" style="margin:10px 0 0">${have.length ? `Veri: ${trDay(oldest)}. ` : ''}Türkiye ligleri, EuroLeague, EuroCup, FIBA Şampiyonlar Ligi, FIBA Europe Cup, NBA ve diğerleri bir dokunuşla iner (toplam ~1,5 MB). Tek bir ligin karnesi ve sıralaması için listeden o ligi seçin.</p>
  </div>
  ${have.length ? `<div class="row" id="b-reg" style="margin-bottom:8px;flex-wrap:wrap">${REGIONS.map((r) => `<button data-r="${r}" class="grow ${st.region === r ? 'primary' : ''}" style="min-height:36px;padding:4px 6px;font-size:12.5px">${r}</button>`).join('')}</div>
    <label style="display:flex;gap:8px;align-items:center;margin:0 4px 10px"><input type="checkbox" id="b-ncaa" ${st.ncaa ? 'checked' : ''}> Üniversite maçlarını da göster (NCAA, günde yüzlerce maç)</label>
    <div class="row" id="b-tabs" style="margin-bottom:12px">${[['live', '● Canlı'], ['games', 'Yaklaşan'], ['results', 'Sonuçlar']].map(([k, v]) => `<button data-t="${k}" class="grow ${st.tab === k ? 'primary' : ''}" style="min-height:40px">${v}</button>`).join('')}</div><div id="b-body"></div>` : ''}
  <div class="warn">Olasılıklar yalnızca geçmiş maç skorlarından hesaplanır. Sakatlık, kadro ve dinlenme bilgisi yoktur. Kazanç garantisi yoktur.</div>`;
  $('#b-lg').onchange = (e) => { st.id = e.target.value; write('bb_sel', st.id); st.home = st.away = null; viewBasket(); };
  $('#b-all').onclick = async () => {
    st.busy = true; viewBasket();
    try { const r = await B.downloadAll(httpGet, (l) => { st.step = l.name; const b = $('#b-all'); if (b) b.textContent = `İndiriliyor… ${l.name}`; }); st.cache = {};
      st.toast(r.bad.length ? `${r.ok.length} lig indirildi; ${r.bad.length} lig alınamadı (${r.bad.map((x) => x.split(':')[0]).slice(0, 4).join(', ')}${r.bad.length > 4 ? '…' : ''}). Tekrar deneyin.` : `${r.ok.length} lig indirildi.`, r.bad.length ? 7000 : 3000); }
    catch (e) { st.toast('İndirilemedi: ' + e.message, 7000); }
    st.busy = false; st.step = ''; if ($('#b-all')) viewBasket();
  };
  if (!have.length) return;
  $('#b-reg').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { st.region = b.dataset.r; write('bb_region', st.region); viewBasket(); } };
  $('#b-ncaa').onchange = (e) => { st.ncaa = e.target.checked; write('bb_ncaa', st.ncaa); viewBasket(); };
  $('#b-tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; viewBasket(); } };
  if (!['results', 'live'].includes(st.tab)) st.tab = 'games';
  (st.tab === 'results' ? allResults : st.tab === 'live' ? allLive : allGames)(have.filter(inView));
  // veri 3 saatten eskiyse arka planda kendiliginden guncellenir (sonuclar ve yaklasan maclar)
  if (!st.busy && !st.autoAt && Date.now() - oldest > 3 * 3600e3) { st.autoAt = Date.now(); st.busy = true; st.step = 'otomatik';
    B.downloadAll(httpGet).then(() => { st.cache = {}; }, () => {}).finally(() => { st.busy = false; st.step = ''; if ($('#b-tabs')) viewBasket(); }); }
}
function allGames(ls) {
  const now = Date.now(), until = now + 72 * 3600e3, items = [];
  for (const l of ls) {
    const db = B.loadLeague(l.id), list = (db.upcoming || []).map(([utc, home, away, neutral]) => ({ t: Date.parse(utc), utc, home, away, neutral, l })).filter((g) => g.t > now - 3 * 3600e3 && g.t <= until);
    if (!list.length) continue; const M = modelOf(l.id, false); if (!M) continue;
    for (const g of list) { const p = B.predict(M, g.home, g.away, g.neutral).pHome; if (Math.max(p, 1 - p) >= st.min) items.push({ ...g, M }); }
  }
  items.sort((a, b) => a.t - b.t);
  const shown = items.slice(0, 120);
  $('#b-body').innerHTML = chipsAll() + (shown.length ? `<p class="muted" style="margin:0 4px 10px">Önümüzdeki 3 günde bu seçime uyan ${items.length} maç${items.length > shown.length ? ` (ilk ${shown.length} tanesi gösteriliyor)` : ''}.</p>` + shown.map((g) => card(g.home, g.away, trTime(g.utc), g.neutral, g.M, g.l.name)).join('')
    : `<div class="card"><p class="muted">Önümüzdeki 3 günde bu seçime uyan maç yok. Bölgeyi “Hepsi” yapın, eşiği düşürün ya da “Bütün ligleri güncelle”ye dokunun.</p></div>`);
  bindChips(() => allGames(ls));
}
/* ---------------- canli skorlar ---------------- */
let liveTimer = null;
function allLive(ls) {
  const ids = new Set(ls.map((l) => l.id)), L = st.live;
  const pred = (g) => { const M = B.loadLeague(g.lg) ? modelOf(g.lg, false) : null; if (!M) return null; const p = B.predict(M, g.h, g.a, 0); return p.known ? p : null; };
  const show = L ? L.list.filter((g) => ids.has(g.lg) || !B.loadLeague(g.lg)).filter((g) => st.ncaa || !/^ncaa/.test(g.lg)) : [];
  const row = (g) => { const p = pred(g), fav = p ? (p.pHome >= 0.5 ? 'h' : 'a') : null, conf = p ? Math.max(p.pHome, 1 - p.pHome) : 0;
    const lead = g.hs === g.as ? null : g.hs > g.as ? 'h' : 'a', ok = fav && lead ? fav === lead : null;
    return `<div class="res"><span class="mark ${g.state === 'pre' ? '' : ok ? 'ok' : ok === false ? 'no' : ''}">${g.state === 'in' ? '●' : g.state === 'post' ? (ok ? '✓' : ok === false ? '✗' : '–') : ''}</span><div class="grow"><span class="lgtag">${esc(g.lgName)}</span>
      <b>${esc(g.a)} ${g.state === 'pre' ? '' : g.as} – ${g.state === 'pre' ? '' : g.hs} ${esc(g.h)}</b>
      <div class="muted">${g.state === 'pre' ? trTime(new Date(g.t).toISOString()) : esc(g.clock)}${p ? ` · tahmin: ${esc(fav === 'h' ? g.h : g.a)} ${pct(conf, 0)}${g.state !== 'pre' && ok != null ? (g.state === 'in' ? (ok ? ' · şu an önde' : ' · şu an geride') : '') : ''}` : ''}</div></div></div>`; };
  const grp = (title, arr) => (arr.length ? `<div class="card"><h2>${title} <span class="tag">${arr.length} maç</span></h2>${arr.map(row).join('')}</div>` : '');
  $('#b-body').innerHTML = !L ? '<div class="card muted">Canlı skorlar alınıyor…</div>'
    : (grp('● Şu an oynanıyor', show.filter((g) => g.state === 'in')) + grp('Bugün başlayacak', show.filter((g) => g.state === 'pre')) + grp('Biten (son saatler)', show.filter((g) => g.state === 'post').reverse())
      || '<div class="card muted">Şu an canlı ya da yakın zamanda maç yok.</div>')
      + `<p class="muted" style="margin:0 4px 12px">Son yenileme ${new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(L.at))} · ekran açıkken 30 saniyede bir yenilenir. Kaynak: ESPN, EuroLeague. BSL, BCL ve FIBA Europe Cup için canlı kaynak yok; sonuçları günlük verilerle gelir.${L.errs.length ? ` Alınamayan: ${esc(L.errs.join(', '))}.` : ''}</p>`;
  const tick = async () => {
    if (st.tab !== 'live' || !$('#b-tabs')) { clearInterval(liveTimer); liveTimer = null; return; }
    if (st.liveBusy) return; st.liveBusy = true;
    try { st.live = await fetchLive(httpGet, { ncaa: st.ncaa }); } catch (e) { /* ag hatasi */ }
    st.liveBusy = false; if (st.tab === 'live' && $('#b-tabs')) allLive(ls);
  };
  if (!liveTimer) { liveTimer = setInterval(tick, 30000); tick(); }
}
function chipsAll() {
  return `<div class="card"><h2>Güven eşiği <span class="tag">favoriye verilen olasılık</span></h2>
    <div class="row" id="b-min">${[[0.5, 'Hepsi'], [0.6, '%60+'], [0.7, '%70+'], [0.8, '%80+']].map(([v, l]) => `<button data-m="${v}" class="grow ${st.min === v ? 'primary' : ''}" style="min-height:40px;padding:6px 4px">${l}</button>`).join('')}</div>
    <p class="muted" style="margin:10px 0 0">Her ligin geçmişte bu eşikte ne kadar tuttuğunu görmek için listeden o ligi seçip “Karne”ye bakın.</p></div>`;
}
function allResults(ls) {
  const day = (iso) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00Z'));
  const byDay = new Map();
  for (const l of ls) {
    const M = modelOf(l.id, true); if (!M) continue;
    for (const d of B.recent(M, 3)) for (const g of d.games) if (g.conf >= st.min) { if (!byDay.has(d.date)) byDay.set(d.date, []); byDay.get(d.date).push({ ...g, l }); }
  }
  const days = [...byDay.keys()].sort().reverse().slice(0, 4); let n = 0, k = 0;
  for (const d of days) for (const g of byDay.get(d)) { n++; k += g.hit ? 1 : 0; }
  $('#b-body').innerHTML = chipsAll() + `<div class="card"><h2>Son maç günleri <span class="tag">${n ? `${n} tahminin ${k} tanesi tuttu` : 'tahmin yok'}</span></h2>
    <p class="muted" style="margin:0">Her satır, modelin o maçtan <b>önceki</b> bilgilerle verdiği tahmini ve gerçek sonucu gösterir. <span class="ok">✓</span> favori kazandı, <span class="no">✗</span> kaybetti. Tarihler UTC’ye göredir.</p></div>`
    + days.map((d) => { const gs = byDay.get(d), kk = gs.filter((g) => g.hit).length; return `<div class="card"><h2>${day(d)} <span class="tag">${kk} / ${gs.length} tuttu</span></h2>
      ${gs.map((g) => `<div class="res"><span class="mark ${g.hit ? 'ok' : 'no'}">${g.hit ? '✓' : '✗'}</span><div class="grow"><span class="lgtag">${esc(g.l.name)}</span><b>${esc(g.away)} ${g.ap} – ${g.hp} ${esc(g.home)}</b>
        <div class="muted">Tahmin: ${esc(g.pick)} ${pct(g.conf, 0)} · fark ${num(Math.abs(g.margin))}${g.early ? ' · sezon başı (az veri)' : ''}</div></div></div>`).join('')}</div>`; }).join('');
  bindChips(() => allResults(ls));
}
