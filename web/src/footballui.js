// Futbol ekrani.
import * as F from './football.js';
import * as S from './fbsources.js';
import { read, write } from './store.js';
import { $, esc, pct, num } from './ui.js';
import { httpGet } from './net.js';
import { viewToday, stop as stopToday } from './todayui.js';
import { viewOdds } from './oranui.js';

const sel0 = read('fb_sel', 'T1');
const st = { div: sel0 === 'ALL' ? 'ALL' : S.byKey(sel0).key, mc: {}, all: { w: 'today', prog: null, calc: null }, tab: 'week', db: null, ms: [], M: null, ev: null, evFor: null, busy: false, report: null, home: null, away: null, toast: null };
const trTime = (ms) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const NAMES = ['Ev sahibi', 'Beraberlik', 'Deplasman'];

const cat = () => S.byKey(st.div);
const allOpt = () => `<option value="ALL" ${st.div === 'ALL' ? 'selected' : ''}>★ Hepsi (bütün ligler, ${S.CATALOG.length})</option>`;
const divSelect = () => `<select id="f-div" style="width:100%;margin-bottom:10px">${allOpt()}${S.groups().map(([g, cs]) => `<optgroup label="${esc(g)}">${cs.map((c) => `<option value="${c.key}" ${c.key === st.div ? 'selected' : ''}>${esc(c.name)}${F.loadLeague(c.key).fetched ? ' ✓' : ''}</option>`).join('')}</optgroup>`).join('')}</select>`;
function bindDiv() { $('#f-div').onchange = (e) => { st.div = e.target.value === 'ALL' ? 'ALL' : S.byKey(e.target.value).key; write('fb_sel', st.div); st.report = null; st.home = st.away = null; viewFootball(); }; }
const MIN = 60;
const yl = (y) => (cat().src === 'milli' || st.db?.calendar ? String(y) : F.seasonLabel(y));   // takvim yili ligleri: 2026                                      // modelin kurulmasi icin en az mac
function reload() {
  st.db = F.loadLeague(st.div); st.ms = F.matches(st.db);
  st.M = st.ms.length >= MIN ? F.model(st.ms) : null;
  if (st.evFor !== st.div + st.ms.length) { st.ev = null; st.evFor = null; }
}
const seg = (mode) => `<div class="row seg" id="f-mode">${[['today', 'Günün maçları'], ['odds', 'Oran hareketi'], ['league', 'Lig analizi']].map(([k, v]) => `<button data-mode="${k}" class="grow ${mode === k ? 'primary' : ''}">${v}</button>`).join('')}</div>`;
function bindMode() { $('#f-mode').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) { write('fb_mode', b.dataset.mode); viewFootball(); } }; }
export function viewFootball(toast) {
  st.toast = toast || st.toast;
  if (read('fb_mode', 'today') === 'today') { $('#main').innerHTML = seg('today') + '<div id="f-today"></div>'; bindMode(); viewToday(st.toast, $('#f-today')); return; }
  if (read('fb_mode', 'today') === 'odds') { stopToday(); $('#main').innerHTML = seg('odds') + '<div id="f-odds"></div>'; bindMode(); viewOdds(st.toast, $('#f-odds')); return; }
  stopToday(); if (st.div === 'ALL') { viewAll(); return; } reload();
  const n = st.ms.length, ys = Object.keys(st.db.seasons).map(Number).sort();
  $('#main').innerHTML = seg('league') + `
  <div class="card"><h2>Lig <span class="tag">${n ? `${n} maç · ${cat().src === 'milli' ? ys[0] + '–' + ys[ys.length - 1] : ys.length + ' sezon'}` : 'veri yok'}</span></h2>
    ${divSelect()}
    <button id="f-dl" class="primary" style="width:100%" ${st.busy ? 'disabled' : ''}>${st.busy ? 'İndiriliyor…' : n ? 'Verileri güncelle' : 'Verileri indir'}</button>
    <p class="muted" style="margin:10px 0 0">${st.db.fetched ? 'Son güncelleme: ' + trTime(st.db.fetched) + '. ' : ''}${{ fd: 'Maç sonuçları ve oranlar football-data.co.uk adresinden (son 4 sezon)', fdn: 'Maç sonuçları ve oranlar football-data.co.uk adresinden (son 4 sezon)', om: 'Bu sezonun sonuçları ve fikstürü open-matchday’den (her gün güncellenen açık veri; oran yok)', milli: 'Son 8 yılın bütün milli maçları (açık veri seti) ve yaklaşan maçlar' }[cat().src]} ücretsiz indirilir; hesaplar telefonda yapılır.</p>
    ${st.report ? `<p class="muted" style="margin:8px 0 0">${st.report.length > 5 ? `${st.report.length} yıl, ${st.report.reduce((a, r) => a + (r.n || 0), 0)} maç indirildi.` : st.report.map((r) => `${yl(r.season)}: ${r.ok ? r.n + ' maç' + (r.cached ? ' (kayıtlı)' : '') : 'alınamadı (' + esc(r.error) + ')'}`).join('<br>')}${st.report.fixtures === false || st.report.fixError ? '<br>Fikstür alınamadı (' + esc(st.report.fixError) + ')' : ''}</p>` : ''}
  </div>
  ${n && !st.M ? `<div class="warn">Bu ligde model için yeterli maç yok (${n} maç var, en az ${MIN} gerekir). Kupalarda ve sezon başında bu normaldir.</div>` : ''}
  ${st.M && n < 200 ? `<div class="warn">Bu ligde yalnızca ${n} maç var${cat().src === 'om' ? ' (bu sezon)' : ''}: takımlar az maçla tanınıyor, tahminler zayıftır.${/kupa|Kupa|Cup|Pokal|Beker/.test(cat().name) ? ' Kupada farklı liglerin takımları karşılaştığı için güç farkı iyi ölçülemez.' : ''}</div>` : ''}
  ${st.M ? `<div class="row" id="f-tabs" style="margin-bottom:12px">${[['week', 'Yaklaşan maçlar'], ['match', 'Maç analizi'], ['eval', 'Karne'], ['table', cat().src === 'milli' ? 'Güç sırası' : 'Puan durumu']].map(([k, v]) => `<button data-t="${k}" class="grow ${st.tab === k ? 'primary' : ''}" style="padding:8px 4px;min-height:40px;font-size:13px">${v}</button>`).join('')}</div><div id="f-body"></div>`
    : n ? '' : `<div class="card"><h2>Nasıl çalışır</h2><ol class="steps"><li>Ligi seçip “Verileri indir”e dokunun: son 4 sezonun sonuçları ve haftanın fikstürü iner.</li><li>İki model çalışır: gol modeli (Poisson / Dixon-Coles) ve Elo. Olasılık ikisinin ortalamasıdır.</li><li>“Karne” modelin geçmişte ne kadar tuttuğunu ve bahis oranlarına karşı ne yaptığını gösterir.</li></ol></div>`}
  <div class="warn">Olasılıklar geçmiş maç sonuçlarından hesaplanır. Sakatlık, ceza, kadro ve motivasyon bilgisi yoktur. Bahis oranları bu bilgileri de içerdiği için genellikle modelden daha isabetlidir. Kazanç garantisi yoktur.</div>`;
  bindMode();
  bindDiv();
  $('#f-dl').onclick = async () => {
    st.busy = true; viewFootball(); const div = st.div;
    try { const c = S.byKey(div), r = c.src === 'fd' ? await F.download(httpGet, div) : await S.downloadExtra(httpGet, c); if (div === st.div) st.report = r; st.toast(r.some((x) => !x.ok) ? 'İndirildi; bazı sezonlar alınamadı.' : 'Veriler güncellendi.'); }
    catch (e) { st.toast('İndirilemedi: ' + e.message + '. Site bu ağdan engelli olabilir; VPN ile deneyin.', 8000); }
    st.busy = false; if ($('#f-dl')) viewFootball();
  };
  const tabs = $('#f-tabs'); if (!tabs) return;
  tabs.onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { st.tab = b.dataset.t; viewFootball(); } };
  ({ week: tabWeek, match: tabMatch, eval: tabEval, table: tabTable })[st.tab]();
}
function card(home, away, when, odds, neutral = 0, note = '') {
  const p = F.forecast(st.M, home, away, neutral), top = p.p.indexOf(Math.max(...p.p)), im = F.implied(odds);
  const bar = `<div class="bar3"><i style="width:${p.p[0] * 100}%"></i><u style="width:${p.p[1] * 100}%"></u><b style="width:${p.p[2] * 100}%"></b></div>`;
  return `<div class="card"><h2>${esc(home)} <span class="muted">–</span> ${esc(away)}</h2>
    ${when || note || neutral ? `<p class="muted" style="margin:-4px 0 8px">${when ? when + ' (Türkiye saati)' : ''}${note ? ' · ' + esc(note) : ''}${neutral ? ' · tarafsız saha' : ''}</p>` : ''}
    <div class="tiles"><div class="tile ${top === 0 ? 'gold' : ''}"><span>Ev sahibi (1)</span><b>${pct(p.p[0], 0)}</b></div><div class="tile ${top === 1 ? 'gold' : ''}"><span>Beraberlik (X)</span><b>${pct(p.p[1], 0)}</b></div><div class="tile ${top === 2 ? 'gold' : ''}"><span>Deplasman (2)</span><b>${pct(p.p[2], 0)}</b></div>
      <div class="tile"><span>Beklenen gol</span><b>${num(p.lambda)} – ${num(p.mu)}</b></div><div class="tile"><span>2,5 üst</span><b>${pct(p.over25, 0)}</b></div><div class="tile"><span>Karşılıklı gol</span><b>${pct(p.btts, 0)}</b></div></div>
    ${bar}
    <p class="muted" style="margin:6px 0 0">En olası skorlar: ${p.scores.map((s) => `${s.score} (${pct(s.p, 0)})`).join(', ')}
      <br>Gol modeli ${p.dc.map((x) => pct(x, 0)).join(' / ')} · Elo ${p.elo.map((x) => pct(x, 0)).join(' / ')}
      ${im ? `<br>Bahis oranları (${odds.map((o) => num(o, 2)).join(' / ')}) şunu söylüyor: ${im.map((x) => pct(x, 0)).join(' / ')}` : ''}${p.known ? '' : '<br>Takımlardan biri için geçmiş veri yok; lig ortalaması kullanıldı.'}</p></div>`;
}
function tabWeek() {
  const now = Date.now(), src = cat().src === 'fd' ? F.loadFixtures().list.filter((f) => f.div === st.div).map((f) => ({ ...f, t: F.ukToUtc(f.date, f.time) })) : (st.db.upcoming || []);
  const horizon = cat().src === 'milli' ? 30 : 9, list = src.filter((f) => f.t > now - 3 * 3600e3 && f.t < now + horizon * 864e5).sort((a, b) => a.t - b.t);
  $('#f-body').innerHTML = list.length ? list.map((f) => card(f.home, f.away, trTime(f.t), f.odds, f.neutral || 0, f.tour || '')).join('')
    : `<div class="card"><p class="muted">Bu lig için önümüzdeki 9 günde listelenen maç yok. Kaynağın fikstür dosyası haftada birkaç kez güncellenir ve yalnızca yaklaşan haftayı içerir; “Verileri güncelle” ile yenileyin ya da “Maç analizi” sekmesinden takımları kendiniz seçin.</p></div>`;
}
function tabMatch() {
  const last = Math.max(...st.ms.map((m) => m[8])), from = cat().src === 'milli' ? last - 2 : last, teams = [...new Set(st.ms.filter((m) => m[8] >= from).flatMap((m) => [m[1], m[2]]))].sort((a, b) => a.localeCompare(b, 'tr'));
  st.home = teams.includes(st.home) ? st.home : teams[0]; st.away = teams.includes(st.away) ? st.away : teams[1];
  const opt = (sel) => teams.map((t) => `<option ${t === sel ? 'selected' : ''}>${esc(t)}</option>`).join('');
  $('#f-body').innerHTML = `<div class="card"><h2>Takımları seçin</h2><p class="muted" style="margin:0 0 4px">Ev sahibi</p><select id="f-h" style="width:100%">${opt(st.home)}</select>
    <p class="muted" style="margin:10px 0 4px">Deplasman</p><select id="f-a" style="width:100%">${opt(st.away)}</select>
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="f-n" ${st.neutral ? 'checked' : ''}> Tarafsız saha (final, turnuva)</label></div>${st.home === st.away ? '<div class="warn">İki farklı takım seçin.</div>' : card(st.home, st.away, '', null, st.neutral ? 1 : 0)}`;
  $('#f-h').onchange = (e) => { st.home = e.target.value; tabMatch(); }; $('#f-a').onchange = (e) => { st.away = e.target.value; tabMatch(); };
  $('#f-n').onchange = (e) => { st.neutral = e.target.checked; tabMatch(); };
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
  $('#f-body').innerHTML = `<div class="card"><h2>Model karnesi <span class="tag">${e.n} maç · ${yl(e.from)} sonrası</span></h2>
    <table class="t"><thead><tr><th></th><th>İsabet</th><th>Log kayıp</th><th>RPS</th></tr></thead><tbody>
      ${row('Model (ortalama)', e.model, true)}${row('Gol modeli', e.dc)}${row('Elo', e.elo)}${row('Lig ortalaması', e.base)}${e.market ? row(`Bahis oranları (${e.nOdds} maç)`, e.market) : ''}</tbody></table>
    <p class="muted" style="margin:10px 0 0">İsabet: en olası sonucu bilme oranı. Log kayıp ve RPS’te küçük olan iyidir. Model “lig ortalaması”ndan iyi olmalıdır; ${e.market ? (e.modelOnOdds.logloss <= e.market.logloss ? 'bu testte bahis oranlarıyla aynı düzeyde çıktı; bu çoğunlukla az maçtan kaynaklanan şanstır.' : 'bahis oranları modelden daha isabetli çıktı (beklenen durum).') : 'bu ligde oran verisi yok.'}
      <br>2,5 alt/üst tahmini ${pct(e.overAcc)} tuttu (maçların ${pct(e.overRate, 0)}’i üst bitti).</p></div>
  <div class="card"><h2>Güvene göre isabet ve getiri</h2><table class="t"><thead><tr><th>Güven</th><th>Maç</th><th>Tutan</th><th>Getiri</th></tr></thead><tbody>
    ${e.buckets.map((b) => `<tr><td>${pct(b.lo, 0)}–${pct(Math.min(1, b.hi), 0)}</td><td>${b.n}</td><td><b>${b.rate == null ? '—' : pct(b.rate, 0)}</b> <span class="muted">${b.n ? pct(b.ci[0], 0) + '–' + pct(b.ci[1], 0) : ''}</span></td><td>${b.roi == null ? '—' : (b.roi > 0 ? '+' : '') + pct(b.roi)}</td></tr>`).join('')}</tbody></table>
    <p class="muted" style="margin:10px 0 0">Getiri: bu aralıktaki her tahmine ortalama oranla 1 birim oynansaydı birim başına kâr/zarar. Az maçlı satırlarda rakamlar çok oynaktır; artı çıkması ileride de artı olacağını göstermez. Uzun vadede bahis sitesinin payı yüzünden getiri genellikle eksidir.</p></div>`;
}
function tabTable() {
  if (cat().src === 'milli') {                       // milli takimlarda puan durumu yok: guc sirasi (Elo)
    const last = Math.max(...st.ms.map((m) => m[8])), active = new Set(st.ms.filter((m) => m[8] >= last - 2).flatMap((m) => [m[1], m[2]]));
    const top = [...st.M.elo].filter(([t]) => active.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 80);
    $('#f-body').innerHTML = `<div class="card"><h2>Güç sıralaması <span class="tag">Elo · ilk 80</span></h2><table class="t"><thead><tr><th>#</th><th>Takım</th><th>Elo</th></tr></thead><tbody>
      ${top.map(([t, e], i) => `<tr><td>${i + 1}</td><td>${esc(t)}</td><td>${Math.round(e)}</td></tr>`).join('')}</tbody></table><p class="muted" style="margin:10px 0 0">Son 8 yılın bütün milli maçlarından; hazırlık maçları daha az ağırlıkla sayılır.</p></div>`;
    return;
  }
  const rows = F.table(st.db);
  $('#f-body').innerHTML = `<div class="card"><h2>Puan durumu <span class="tag">${yl(Math.max(...Object.keys(st.db.seasons).map(Number)))}</span></h2><table class="t"><thead><tr><th>#</th><th>Takım</th><th>O</th><th>G-B-M</th><th>Av</th><th>P</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.team)}</td><td>${r.p}</td><td>${r.w}-${r.d}-${r.l}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></div>`;
}

/* ---------------- Hepsi: butun ligler ---------------- */
const fixturesOf = (c, db) => (c.src === 'fd' ? F.loadFixtures().list.filter((f) => f.div === c.key).map((f) => ({ ...f, t: F.ukToUtc(f.date, f.time) })) : (db.upcoming || []));
function modelFor(c) {
  const db = F.loadLeague(c.key); if (!db.fetched) return null;
  const k = db.fetched, m = st.mc[c.key]; if (m && m.k === k) return m;
  const ms = F.matches(db), M = ms.length >= MIN ? F.model(ms) : null;
  return (st.mc[c.key] = { k, M, db });
}
async function downloadAll() {
  const list = S.CATALOG, P = (st.all.prog = { i: 0, n: list.length, ok: 0, fail: [] }); let next = 0;
  const one = async (c) => {
    try { if (c.src === 'fd') await F.download(httpGet, c.key, 4, new Date(), false); else await S.downloadExtra(httpGet, c); P.ok++; }
    catch (e) { P.fail.push(c.name); }
    P.i++; P.cur = c.name; if ($('#fa-prog')) $('#fa-prog').innerHTML = progTxt();
  };
  const worker = async () => { while (next < list.length) await one(list[next++]); };
  try { await F.downloadFixtures(httpGet); } catch (e) { P.fixErr = true; }
  await Promise.all([worker(), worker(), worker(), worker()]);
  write('fb_all_at', Date.now()); st.mc = {};
  return P;
}
const progTxt = () => { const P = st.all.prog; if (!P) return ''; return `<div class="pbar" style="height:10px;margin:10px 0 6px"><i class="pm" style="width:${Math.round((P.i / P.n) * 100)}%;top:0;bottom:0"></i></div>${P.i < P.n ? `İndiriliyor ${P.i} / ${P.n}${P.cur ? ` · ${esc(P.cur)}` : ''}` : `${P.ok} / ${P.n} lig indirildi${P.fail.length ? ` · alınamayan: ${P.fail.slice(0, 6).map(esc).join(', ')}${P.fail.length > 6 ? '…' : ''}` : ''}`}`; };
function viewAll() {
  const have = S.CATALOG.filter((c) => F.loadLeague(c.key).fetched), at = read('fb_all_at', 0), A = st.all;
  $('#main').innerHTML = seg('league') + `
  <div class="card"><h2>Lig <span class="tag">${have.length} / ${S.CATALOG.length} lig indirili</span></h2>${divSelect()}
    <button id="fa-dl" class="primary" style="width:100%" ${st.busy ? 'disabled' : ''}>${st.busy ? 'İndiriliyor…' : have.length ? 'Hepsini güncelle' : 'Hepsini indir'}</button>
    <div class="muted" id="fa-prog">${progTxt()}</div>
    <p class="muted" style="margin:10px 0 0">${at ? 'Son toplu güncelleme: ' + trTime(at) + '. ' : ''}Bütün liglerin sonuçları ve fikstürleri tek dokunuşla iner (birkaç dakika sürebilir, Wi-Fi önerilir). Aşağıda bütün liglerin yaklaşan maçları tek listede gösterilir; tek bir lige girmek için listeden seçin.</p></div>
  ${have.length ? `<div class="row seg" id="fa-w">${[['today', 'Bugün'], ['tomorrow', 'Yarın'], ['3', '3 gün']].map(([k, v]) => `<button data-w="${k}" class="grow ${A.w === k ? 'primary' : ''}" style="min-height:38px">${v}</button>`).join('')}</div><div id="fa-list"><div class="card muted">Modeller hesaplanıyor…</div></div>` : ''}
  <div class="warn">Olasılıklar geçmiş maç sonuçlarından hesaplanır. Sakatlık, ceza, kadro ve motivasyon bilgisi yoktur. Kazanç garantisi yoktur.</div>`;
  bindMode(); bindDiv();
  $('#fa-dl').onclick = async () => {
    st.busy = true; viewAll();
    try { const P = await downloadAll(); st.toast(P.fail.length ? `${P.ok} lig indirildi, ${P.fail.length} lig alınamadı.` : 'Bütün ligler indirildi.'); } catch (e) { st.toast('İndirilemedi: ' + e.message, 7000); }
    st.busy = false; if (st.div === 'ALL' && $('#fa-dl')) viewAll();
  };
  if (!have.length) return;
  $('#fa-w').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) { A.w = b.dataset.w; viewAll(); } };
  fillAll(have);
}
async function fillAll(have) {
  const now = Date.now(), dayOf = (t) => new Date(t + 3 * 36e5).toISOString().slice(0, 10), today = dayOf(now), tom = dayOf(now + 864e5);
  const inW = (t) => t > now - 2 * 36e5 && (st.all.w === 'today' ? dayOf(t) === today : st.all.w === 'tomorrow' ? dayOf(t) === tom : t < now + 3 * 864e5);
  const rows = [], token = (st.all.calc = {});
  for (let i = 0; i < have.length; i++) {
    const c = have[i], db = F.loadLeague(c.key), fx = fixturesOf(c, db).filter((f) => inW(f.t)); if (!fx.length) continue;
    const m = modelFor(c); if (!m?.M) continue;
    for (const f of fx) rows.push({ c, f, p: F.forecast(m.M, f.home, f.away, f.neutral || 0) });
    if (i % 4 === 3) { await new Promise((r) => setTimeout(r, 0)); if (st.all.calc !== token || !$('#fa-list')) return; }
  }
  rows.sort((a, b) => a.f.t - b.f.t);
  const el = $('#fa-list'); if (!el || st.all.calc !== token) return;
  el.innerHTML = rows.length ? `<p class="muted" style="margin:0 4px 8px">${rows.length} maç · ${new Set(rows.map((r) => r.c.key)).size} lig</p>` + rows.map(({ c, f, p }) => {
    const top = p.p.indexOf(Math.max(...p.p)), im = F.implied(f.odds);
    return `<div class="card fm"><p class="lgtag" data-lg="${c.key}" style="cursor:pointer">${esc(S.label(c))} ›</p>
      <div class="fmrow"><div class="grow fmt"><b>${esc(f.home)}</b><b>${esc(f.away)}</b></div><div class="lb"><b>${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(f.t))}</b>${st.all.w === '3' ? `<span class="lmin">${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric' }).format(new Date(f.t))}</span>` : ''}</div></div>
      <div class="tiles" style="margin-top:8px">${p.p.map((x, j) => `<div class="tile ${j === top ? 'gold' : ''}"><span>${['1 (ev)', 'X (berabere)', '2 (deplasman)'][j]}</span><b>${pct(x, 0)}</b></div>`).join('')}</div>
      <p class="fpred muted">2,5 üst ${pct(p.over25, 0)} · karşılıklı gol ${pct(p.btts, 0)} · beklenen gol ${num(p.lambda)}–${num(p.mu)}${im ? `<br>Bahis oranlarına göre: ${im.map((x) => pct(x, 0)).join(' / ')}` : ''}${p.known ? '' : '<br>Takımlardan biri için geçmiş veri az; lig ortalaması kullanıldı.'}</p></div>`;
  }).join('') : '<div class="card"><p class="muted">Bu aralıkta indirilen liglerde maç yok. “3 gün”ü deneyin ya da “Hepsini güncelle”ye dokunun (fikstürler haftada birkaç kez yenilenir).</p></div>';
  el.onclick = (e) => { const b = e.target.closest('[data-lg]'); if (b) { st.div = b.dataset.lg; write('fb_sel', st.div); st.report = null; st.tab = 'week'; viewFootball(); } };
}
