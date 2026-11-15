// Basketbol (NBA) ekrani.
import * as B from './basket.js';
import { $, esc, pct, num } from './ui.js';
import { httpGet } from './net.js';

const st = { tab: 'games', db: null, model: null, ev: null, busy: false, report: null, home: null, away: null };
const sgn = (v, d = 1) => (v > 0 ? '+' : '') + num(v, d);
const tn = (c) => st.db.teams[c] || c;
const trTime = (utc) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(utc));

function reload() {
  st.db = B.loadDb(); const games = B.allGames(st.db);
  st.model = games.length ? B.build(games) : null; st.ev = st.model ? B.evaluate(st.model) : null;
}
export function viewBasket(toast) {
  reload(); st.toast = toast;
  const db = st.db, ys = Object.keys(db.seasons).map(Number).sort(), n = B.allGames(db).length;
  $('#main').innerHTML = `
  <div class="card"><h2>NBA <span class="tag">${n ? `${n} maç · ${ys.map(B.seasonLabel).join(', ')}` : 'veri yok'}</span></h2>
    <button id="b-dl" class="primary" style="width:100%" ${st.busy ? 'disabled' : ''}>${st.busy ? 'İndiriliyor… (1 dakika sürebilir)' : n ? 'Verileri güncelle' : 'Verileri indir'}</button>
    <p class="muted" style="margin:10px 0 0">${db.fetched ? 'Son güncelleme: ' + trTime(db.fetched) + '. ' : ''}Veri NBA’in kendi sitesinden ücretsiz indirilir; hesaplar telefonda yapılır.</p>
    ${st.report ? `<p class="muted" style="margin:8px 0 0">${st.report.map((r) => `${B.seasonLabel(r.season)}: ${r.ok ? r.n + ' maç' + (r.cached ? ' (kayıtlı)' : '') : 'alınamadı (' + esc(r.error) + ')'}`).join('<br>')}</p>` : ''}
  </div>
  ${n && ys.length < 2 ? `<div class="warn">Yalnızca bu sezonun verisi var. Önceki sezonlar indirilemediği için model takımları az maçla tanıyor; tahminler daha zayıftır. “Verileri güncelle” ile yeniden deneyin.</div>` : ''}
  ${n ? `<div class="row" id="b-tabs" style="margin-bottom:12px">${[['games', 'Yaklaşan maçlar'], ['match', 'Maç analizi'], ['eval', 'Karne'], ['table', 'Sıralama']].map(([k, v]) => `<button data-t="${k}" class="grow ${st.tab === k ? 'primary' : ''}" style="padding:8px 4px;min-height:40px;font-size:13px">${v}</button>`).join('')}</div><div id="b-body"></div>`
    : `<div class="card"><h2>Nasıl çalışır</h2><ol class="steps"><li>“Verileri indir”e dokunun: bu sezonun ve önceki iki sezonun maç sonuçları iner.</li><li>Elo modeli her takımın gücünü maç maç günceller; kazanma olasılığı, beklenen sayı farkı ve toplam sayı buradan hesaplanır.</li><li>“Karne” sekmesi modelin geçmişte gerçekten ne kadar tuttuğunu gösterir.</li></ol></div>`}
  <div class="warn">Olasılıklar yalnızca geçmiş maç skorlarından hesaplanır. Sakatlık, kadro ve dinlenme bilgisi yoktur; tek bir yıldız oyuncunun yokluğu sonucu ciddi biçimde değiştirir. Kazanç garantisi yoktur.</div>`;
  $('#b-dl').onclick = async () => {
    st.busy = true; viewBasket(toast);
    try { st.report = await B.download(httpGet); const bad = st.report.filter((r) => !r.ok); toast(bad.length ? `Bu sezon indirildi; ${bad.length} önceki sezon alınamadı.` : 'Veriler güncellendi.'); }
    catch (e) { toast('İndirilemedi: ' + e.message, 7000); }
    st.busy = false; if ($('#b-dl')) viewBasket(toast);
  };
  const tabs = $('#b-tabs'); if (!tabs) return;
  tabs.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; viewBasket(toast); } };
  ({ games: tabGames, match: tabMatch, eval: tabEval, table: tabTable })[st.tab]();
}
function confNote(p) {
  const ev = st.ev; if (!ev) return '';
  const b = ev.buckets.find((x) => p >= x.lo && p < x.hi);
  return b && b.n >= 20 ? `Geçmiş testte bu güven aralığındaki (${pct(b.lo, 0)}–${pct(Math.min(1, b.hi), 0)}) ${b.n} tahminin ${pct(b.rate)}’i tuttu.` : '';
}
function card(home, away, when) {
  const p = B.predict(st.model, home, away), ph = p.pHome, pick = ph >= 0.5 ? home : away, conf = Math.max(ph, 1 - ph);
  return `<div class="card"><h2>${esc(tn(away))} <span class="muted">@</span> ${esc(tn(home))}</h2>
    ${when ? `<p class="muted" style="margin:-4px 0 8px">${when} (Türkiye saati)</p>` : ''}
    <div class="tiles"><div class="tile ${conf >= 0.7 ? 'gold' : ''}"><span>Favori</span><b style="font-size:15px">${esc(pick)} ${pct(conf, 0)}</b></div>
      <div class="tile"><span>Beklenen fark</span><b>${esc(pick)} ${num(Math.abs(p.margin))}</b></div><div class="tile"><span>Beklenen toplam</span><b>${num(p.total)}</b></div></div>
    <div class="bar2"><i style="width:${ph * 100}%"></i></div>
    <p class="muted" style="margin:6px 0 0">Ev sahibi ${esc(home)} ${pct(ph)} · deplasman ${esc(away)} ${pct(1 - ph)}${p.known ? '' : ' · takımlardan biri için veri yok'}<br>${confNote(conf)}</p></div>`;
}
function tabGames() {
  const now = Date.now(), list = st.db.upcoming.filter((g) => { const t = Date.parse(g.utc); return t > now - 3 * 3600e3 && t < now + 48 * 3600e3; }).sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
  $('#b-body').innerHTML = list.length ? list.map((g) => card(g.home, g.away, trTime(g.utc))).join('')
    : `<div class="card"><p class="muted">Önümüzdeki 48 saat içinde listelenen maç yok. Fikstür eski olabilir; “Verileri güncelle”ye dokunun.</p></div>`;
}
function tabMatch() {
  const teams = Object.keys(st.db.teams).filter((t) => st.model.elo.has(t)).sort((a, b) => tn(a).localeCompare(tn(b), 'tr'));
  st.home = teams.includes(st.home) ? st.home : teams[0]; st.away = teams.includes(st.away) ? st.away : teams[1];
  const opt = (sel) => teams.map((t) => `<option value="${t}" ${t === sel ? 'selected' : ''}>${esc(tn(t))}</option>`).join('');
  $('#b-body').innerHTML = `<div class="card"><h2>Takımları seçin</h2><p class="muted" style="margin:0 0 4px">Ev sahibi</p><select id="b-h" style="width:100%">${opt(st.home)}</select>
    <p class="muted" style="margin:10px 0 4px">Deplasman</p><select id="b-a" style="width:100%">${opt(st.away)}</select></div>
    ${st.home === st.away ? '<div class="warn">İki farklı takım seçin.</div>' : card(st.home, st.away, '')}`;
  $('#b-h').onchange = (e) => { st.home = e.target.value; tabMatch(); }; $('#b-a').onchange = (e) => { st.away = e.target.value; tabMatch(); };
}
function tabEval() {
  const e = st.ev;
  if (!e) { $('#b-body').innerHTML = '<div class="card"><p class="muted">Karne için yeterli maç yok.</p></div>'; return; }
  $('#b-body').innerHTML = `<div class="card"><h2>Model karnesi <span class="tag">${e.n} maç</span></h2>
    <p class="muted" style="margin:0 0 10px">Her tahmin, o maçtan önceki bilgilerle yapılmıştır (ileriye dönük test). ${e.multi ? 'İlk sezon modelin ısınması için kullanılır ve sayılmaz.' : 'Tek sezon olduğu için her takımın ilk 10 maçı sayılmaz.'}</p>
    <div class="tiles"><div class="tile gold"><span>Kazananı bilme</span><b>${pct(e.acc)}</b></div><div class="tile"><span>Hep ev sahibi deseydik</span><b>${pct(Math.max(e.homeRate, 1 - e.homeRate))}</b></div><div class="tile"><span>Güven aralığı</span><b style="font-size:13px">${pct(e.accCi[0], 0)}–${pct(e.accCi[1], 0)}</b></div>
      <div class="tile"><span>Sayı farkı hatası</span><b>${num(e.marginMae)}</b></div><div class="tile"><span>Toplam sayı hatası</span><b>${num(e.totalMae)}</b></div><div class="tile"><span>Lig ortalaması deseydik</span><b>${num(e.totalBaseMae)}</b></div></div>
    <p class="muted" style="margin:10px 0 0">“Hata”, tahminle gerçek sonuç arasındaki ortalama sayı farkıdır. Toplam sayı tahmini, “her maç lig ortalaması kadar biter” demekten ${e.totalMae < e.totalBaseMae - 0.2 ? `ortalama ${num(e.totalBaseMae - e.totalMae)} sayı daha iyi` : 'belirgin biçimde iyi değil'}. Bahis sitelerinin çizgileri sakatlık bilgisini de kullandığı için genellikle daha isabetlidir.</p></div>
  <div class="card"><h2>Güvene göre isabet</h2><table class="t"><thead><tr><th>Modelin güveni</th><th>Maç</th><th>Tutan</th><th>Aralık</th></tr></thead><tbody>
    ${e.buckets.map((b) => `<tr><td>${pct(b.lo, 0)}–${pct(Math.min(1, b.hi), 0)}</td><td>${b.n}</td><td><b>${b.rate == null ? '—' : pct(b.rate)}</b></td><td class="muted">${b.n ? pct(b.ci[0], 0) + '–' + pct(b.ci[1], 0) : ''}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin:10px 0 0">Yüksek güvenli tahminler daha sık tutar ama sayıları azdır ve bahis oranları da o ölçüde düşüktür. %80 güven, beş maçtan birinin tutmayacağı anlamına gelir.</p></div>`;
}
function tabTable() {
  const rows = B.standings(st.db);
  $('#b-body').innerHTML = `<div class="card"><h2>Sıralama <span class="tag">${B.seasonLabel(Math.max(...Object.keys(st.db.seasons).map(Number)))}</span></h2><table class="t"><thead><tr><th>#</th><th>Takım</th><th>G-M</th><th>Sayı farkı</th><th>Elo</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(tn(r.team))}</td><td>${r.w}-${r.l}</td><td>${sgn((r.pf - r.pa) / (r.w + r.l))}</td><td>${Math.round(st.model.elo.get(r.team) ?? 1500)}</td></tr>`).join('')}</tbody></table></div>`;
}
