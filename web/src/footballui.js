// Futbol ekrani.
import * as F from './football.js';
import { read, write } from './store.js';
import { $, esc, pct, num } from './ui.js';
import { httpGet } from './net.js';

const st = { div: read('fb_sel', 'T1'), tab: 'week', db: null, ms: [], M: null, ev: null, evFor: null, busy: false, report: null, home: null, away: null, toast: null };
const trTime = (ms) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const NAMES = ['Ev sahibi', 'Beraberlik', 'Deplasman'];

function reload() {
  st.db = F.loadLeague(st.div); st.ms = F.matches(st.db);
  st.M = st.ms.length >= 150 ? F.model(st.ms) : null;
  if (st.evFor !== st.div + st.ms.length) { st.ev = null; st.evFor = null; }
}
export function viewFootball(toast) {
  st.toast = toast || st.toast; reload();
  const n = st.ms.length, ys = Object.keys(st.db.seasons).map(Number).sort();
  $('#main').innerHTML = `
  <div class="card"><h2>Lig <span class="tag">${n ? `${n} maç · ${ys.length} sezon` : 'veri yok'}</span></h2>
    <select id="f-div" style="width:100%;margin-bottom:10px">${Object.entries(F.LEAGUES).map(([k, v]) => `<option value="${k}" ${k === st.div ? 'selected' : ''}>${esc(v)}${F.loadLeague(k).fetched ? ' ✓' : ''}</option>`).join('')}</select>
    <button id="f-dl" class="primary" style="width:100%" ${st.busy ? 'disabled' : ''}>${st.busy ? 'İndiriliyor…' : n ? 'Verileri güncelle' : 'Verileri indir'}</button>
    <p class="muted" style="margin:10px 0 0">${st.db.fetched ? 'Son güncelleme: ' + trTime(st.db.fetched) + '. ' : ''}Maç sonuçları ve oranlar football-data.co.uk adresinden ücretsiz indirilir; hesaplar telefonda yapılır.</p>
    ${st.report ? `<p class="muted" style="margin:8px 0 0">${st.report.map((r) => `${F.seasonLabel(r.season)}: ${r.ok ? r.n + ' maç' + (r.cached ? ' (kayıtlı)' : '') : 'alınamadı (' + esc(r.error) + ')'}`).join('<br>')}${st.report.fixtures === false ? '<br>Fikstür alınamadı (' + esc(st.report.fixError) + ')' : ''}</p>` : ''}
  </div>
  ${n && !st.M ? '<div class="warn">Bu ligde model için yeterli maç yok (en az 150 gerekir).</div>' : ''}
  ${st.M ? `<div class="row" id="f-tabs" style="margin-bottom:12px">${[['week', 'Haftanın maçları'], ['match', 'Maç analizi'], ['eval', 'Karne'], ['table', 'Puan durumu']].map(([k, v]) => `<button data-t="${k}" class="grow ${st.tab === k ? 'primary' : ''}" style="padding:8px 4px;min-height:40px;font-size:13px">${v}</button>`).join('')}</div><div id="f-body"></div>`
    : n ? '' : `<div class="card"><h2>Nasıl çalışır</h2><ol class="steps"><li>Ligi seçip “Verileri indir”e dokunun: son 4 sezonun sonuçları ve haftanın fikstürü iner.</li><li>İki model çalışır: gol modeli (Poisson / Dixon-Coles) ve Elo. Olasılık ikisinin ortalamasıdır.</li><li>“Karne” modelin geçmişte ne kadar tuttuğunu ve bahis oranlarına karşı ne yaptığını gösterir.</li></ol></div>`}
  <div class="warn">Olasılıklar geçmiş maç sonuçlarından hesaplanır. Sakatlık, ceza, kadro ve motivasyon bilgisi yoktur. Bahis oranları bu bilgileri de içerdiği için genellikle modelden daha isabetlidir. Kazanç garantisi yoktur.</div>`;
  $('#f-div').onchange = (e) => { st.div = e.target.value; write('fb_sel', st.div); st.report = null; st.home = st.away = null; viewFootball(); };
  $('#f-dl').onclick = async () => {
    st.busy = true; viewFootball(); const div = st.div;
    try { const r = await F.download(httpGet, div); if (div === st.div) st.report = r; st.toast(r.some((x) => !x.ok) ? 'İndirildi; bazı sezonlar alınamadı.' : 'Veriler güncellendi.'); }
    catch (e) { st.toast('İndirilemedi: ' + e.message + '. Site bu ağdan engelli olabilir; VPN ile deneyin.', 8000); }
    st.busy = false; if ($('#f-dl')) viewFootball();
  };
  const tabs = $('#f-tabs'); if (!tabs) return;
  tabs.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; viewFootball(); } };
  ({ week: tabWeek, match: tabMatch, eval: tabEval, table: tabTable })[st.tab]();
}
function card(home, away, when, odds) {
  const p = F.forecast(st.M, home, away), top = p.p.indexOf(Math.max(...p.p)), im = F.implied(odds);
  const bar = `<div class="bar3"><i style="width:${p.p[0] * 100}%"></i><u style="width:${p.p[1] * 100}%"></u><b style="width:${p.p[2] * 100}%"></b></div>`;
  return `<div class="card"><h2>${esc(home)} <span class="muted">–</span> ${esc(away)}</h2>
    ${when ? `<p class="muted" style="margin:-4px 0 8px">${when} (Türkiye saati)</p>` : ''}
    <div class="tiles"><div class="tile ${top === 0 ? 'gold' : ''}"><span>Ev sahibi (1)</span><b>${pct(p.p[0], 0)}</b></div><div class="tile ${top === 1 ? 'gold' : ''}"><span>Beraberlik (X)</span><b>${pct(p.p[1], 0)}</b></div><div class="tile ${top === 2 ? 'gold' : ''}"><span>Deplasman (2)</span><b>${pct(p.p[2], 0)}</b></div>
      <div class="tile"><span>Beklenen gol</span><b>${num(p.lambda)} – ${num(p.mu)}</b></div><div class="tile"><span>2,5 üst</span><b>${pct(p.over25, 0)}</b></div><div class="tile"><span>Karşılıklı gol</span><b>${pct(p.btts, 0)}</b></div></div>
    ${bar}
    <p class="muted" style="margin:6px 0 0">En olası skorlar: ${p.scores.map((s) => `${s.score} (${pct(s.p, 0)})`).join(', ')}
      <br>Gol modeli ${p.dc.map((x) => pct(x, 0)).join(' / ')} · Elo ${p.elo.map((x) => pct(x, 0)).join(' / ')}
      ${im ? `<br>Bahis oranları (${odds.map((o) => num(o, 2)).join(' / ')}) şunu söylüyor: ${im.map((x) => pct(x, 0)).join(' / ')}` : ''}${p.known ? '' : '<br>Takımlardan biri için geçmiş veri yok; lig ortalaması kullanıldı.'}</p></div>`;
}
function tabWeek() {
  const now = Date.now(), fx = F.loadFixtures(), list = fx.list.filter((f) => f.div === st.div).map((f) => ({ ...f, t: F.ukToUtc(f.date, f.time) })).filter((f) => f.t > now - 3 * 3600e3 && f.t < now + 9 * 864e5).sort((a, b) => a.t - b.t);
  $('#f-body').innerHTML = list.length ? list.map((f) => card(f.home, f.away, trTime(f.t), f.odds)).join('')
    : `<div class="card"><p class="muted">Bu lig için önümüzdeki 9 günde listelenen maç yok. Kaynağın fikstür dosyası haftada birkaç kez güncellenir ve yalnızca yaklaşan haftayı içerir; “Verileri güncelle” ile yenileyin ya da “Maç analizi” sekmesinden takımları kendiniz seçin.</p></div>`;
}
function tabMatch() {
  const last = Math.max(...st.ms.map((m) => m[8])), teams = [...new Set(st.ms.filter((m) => m[8] === last).flatMap((m) => [m[1], m[2]]))].sort((a, b) => a.localeCompare(b, 'tr'));
  st.home = teams.includes(st.home) ? st.home : teams[0]; st.away = teams.includes(st.away) ? st.away : teams[1];
  const opt = (sel) => teams.map((t) => `<option ${t === sel ? 'selected' : ''}>${esc(t)}</option>`).join('');
  $('#f-body').innerHTML = `<div class="card"><h2>Takımları seçin</h2><p class="muted" style="margin:0 0 4px">Ev sahibi</p><select id="f-h" style="width:100%">${opt(st.home)}</select>
    <p class="muted" style="margin:10px 0 4px">Deplasman</p><select id="f-a" style="width:100%">${opt(st.away)}</select></div>${st.home === st.away ? '<div class="warn">İki farklı takım seçin.</div>' : card(st.home, st.away, '', null)}`;
  $('#f-h').onchange = (e) => { st.home = e.target.value; tabMatch(); }; $('#f-a').onchange = (e) => { st.away = e.target.value; tabMatch(); };
}
function tabEval() {
  if (st.evFor !== st.div + st.ms.length) {
    $('#f-body').innerHTML = `<div class="card"><h2>Karne</h2><p class="muted">Model, son sezonun her maçını yalnızca o maçtan önceki bilgilerle yeniden tahmin eder. Birkaç saniye sürebilir.</p><button id="f-ev" class="primary" style="width:100%">Testi çalıştır</button></div>`;
    $('#f-ev').onclick = (e) => { e.target.disabled = true; e.target.textContent = 'Hesaplanıyor…'; setTimeout(() => { st.ev = F.evaluate(st.ms); st.evFor = st.div + st.ms.length; if ($('#f-body')) tabEval(); }, 50); };
    return;
  }
  const e = st.ev;
  if (!e) { $('#f-body').innerHTML = '<div class="card"><p class="muted">Test için yeterli veri yok: en az iki sezon ve test döneminden önce 300 maç gerekir.</p></div>'; return; }
  const row = (name, s, strong) => `<tr><td>${strong ? '<b>' + name + '</b>' : name}</td><td>${pct(s.acc)}</td><td>${num(s.logloss, 3)}</td><td>${num(s.rps, 3)}</td></tr>`;
  $('#f-body').innerHTML = `<div class="card"><h2>Model karnesi <span class="tag">${e.n} maç · ${F.seasonLabel(e.from)} sonrası</span></h2>
    <table class="t"><thead><tr><th></th><th>İsabet</th><th>Log kayıp</th><th>RPS</th></tr></thead><tbody>
      ${row('Model (ortalama)', e.model, true)}${row('Gol modeli', e.dc)}${row('Elo', e.elo)}${row('Lig ortalaması', e.base)}${e.market ? row(`Bahis oranları (${e.nOdds} maç)`, e.market) : ''}</tbody></table>
    <p class="muted" style="margin:10px 0 0">İsabet: en olası sonucu bilme oranı. Log kayıp ve RPS’te küçük olan iyidir. Model “lig ortalaması”ndan iyi olmalıdır; ${e.market ? (e.modelOnOdds.logloss <= e.market.logloss ? 'bu testte bahis oranlarıyla aynı düzeyde çıktı; bu çoğunlukla az maçtan kaynaklanan şanstır.' : 'bahis oranları modelden daha isabetli çıktı (beklenen durum).') : 'bu ligde oran verisi yok.'}
      <br>2,5 alt/üst tahmini ${pct(e.overAcc)} tuttu (maçların ${pct(e.overRate, 0)}’i üst bitti).</p></div>
  <div class="card"><h2>Güvene göre isabet ve getiri</h2><table class="t"><thead><tr><th>Güven</th><th>Maç</th><th>Tutan</th><th>Getiri</th></tr></thead><tbody>
    ${e.buckets.map((b) => `<tr><td>${pct(b.lo, 0)}–${pct(Math.min(1, b.hi), 0)}</td><td>${b.n}</td><td><b>${b.rate == null ? '—' : pct(b.rate, 0)}</b> <span class="muted">${b.n ? pct(b.ci[0], 0) + '–' + pct(b.ci[1], 0) : ''}</span></td><td>${b.roi == null ? '—' : (b.roi > 0 ? '+' : '') + pct(b.roi)}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin:10px 0 0">Getiri: bu aralıktaki her tahmine ortalama oranla 1 birim oynansaydı birim başına kâr/zarar. Az maçlı satırlarda rakamlar çok oynaktır; artı çıkması ileride de artı olacağını göstermez. Uzun vadede bahis sitesinin payı yüzünden getiri genellikle eksidir.</p></div>`;
}
function tabTable() {
  const rows = F.table(st.db);
  $('#f-body').innerHTML = `<div class="card"><h2>Puan durumu <span class="tag">${F.seasonLabel(Math.max(...Object.keys(st.db.seasons).map(Number)))}</span></h2><table class="t"><thead><tr><th>#</th><th>Takım</th><th>O</th><th>G-B-M</th><th>Av</th><th>P</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.team)}</td><td>${r.p}</td><td>${r.w}-${r.d}-${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></div>`;
}
