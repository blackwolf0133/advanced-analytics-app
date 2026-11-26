// Kombine sekmesi: futbol ve basketbol icin banko ve surpriz kuponlar, kaydedilen kuponlarin takibi ve karnesi.
import * as K from './kombine.js';
import * as T from './today.js';
import * as B from './basket.js';
import { read, write } from './store.js';
import { $, esc, pct, num } from './ui.js';
import { httpGet } from './net.js';
import { dailyHtml, downloadDaily, loadDaily } from './gunlukui.js';
import { viewPara } from './paraui.js';

const st = { gn: read('kb_gn', 7), sport: read('kb_sport', 'f'), when: read('kb_when', 'today'), n: read('kb_n', 3), mine: read('kb_mine', false), busy: false, cache: {} };
const trTime = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const odds = (q) => num(1 / q, 2);

/* ---------------- secimler ---------------- */
function inWindow(t) {
  const ms = Date.parse(t), now = Date.now(); if (!(ms > now + 5 * 60e3)) return false;     // baslamis maclar alinmaz
  if (st.when === '72') return ms <= now + 72 * 3600e3;
  return T.istDay(t) === T.dayOffset(st.when === 'today' ? 0 : 1);
}
function footLegs() {
  const g = T.load(); if (!g) return { legs: [], ok: false };
  const sel = st.mine ? new Set(read('fg_sel', []) || []) : null, cal = g.kb?.cal || null;
  const ms = g.matches.filter((m) => m.st === 'pre' && m.pr && m.pr.nh >= 8 && m.pr.na >= 8 && !g.leagues[m.lg]?.nat && inWindow(m.t) && (!sel || !sel.size || sel.has(m.lg)));
  return { legs: ms.flatMap((m) => K.footLegs({ ...m, f: g.leagues[m.lg]?.f }, cal).map((l) => ({ ...l, lgName: g.leagues[m.lg]?.name || m.lg }))), ok: true, cal: !!cal, bt: g.kb?.bt, n: ms.length };
}
function modelOf(id) {
  const db = B.loadLeague(id); if (!db) return null;
  const key = db.updated + db.fetched, c = st.cache[id]; if (c && c.key === key) return c.M;
  const M = B.buildLite(db); st.cache[id] = { key, M }; return M;
}
function basketLegs() {
  const idx = B.loadIndex(), cal = idx?.kb?.cal || null, legs = []; let n = 0, any = false;
  for (const l of B.leagues()) {
    if (/ncaa/.test(l.id)) continue;
    const db = B.loadLeague(l.id); if (!db) continue; any = true;
    const up = (db.upcoming || []).filter(([utc]) => inWindow(utc)); if (!up.length) continue;
    const M = modelOf(l.id); if (!M) continue;
    for (const [utc, h, a, neu] of up) {
      const p = B.predict(M, h, a, neu); if (!p.known) continue; n++;
      legs.push(...K.basketLegs({ id: `${l.id}|${utc}|${h}`, t: utc, lg: l.id, h, a, pHome: p.pHome }, cal).map((x) => ({ ...x, lgName: l.name })));
    }
  }
  return { legs, ok: any, cal: !!cal, bt: idx?.kb?.bt, n };
}

/* ---------------- gorunum ---------------- */
const MODE_INFO = {
  banko: 'En yüksek olasılıklı seçimler (çifte şans, alt/üst, KG dahil). Her seçim en az %72.',
  ms: 'Yalnızca maç sonucu: favori kazanır. Her seçim en az %62.',
  surpriz: 'Favori olmayan sonuç (beraberlik ya da zayıf taraf kazanır), ama modelin %30–48 şans verdiği maçlar. Tutması zordur, tutarsa yüksek oran.',
};
function btLine(bt, mode, n, label) {
  const o = bt?.[mode]?.[n]; if (!o || o.k < 15) return '';
  return `<p class="muted" style="margin:8px 0 0">Geçmiş test (${label}): bu kuralla her gün kurulan ${n}'lü kupon <b>${o.k}</b> günün <b>${o.hit}</b>'inde tuttu (%${Math.round(o.rate * 100)}; model beklentisi %${Math.round(o.exp * 100)}). Seçimlerin %${Math.round(o.leg * 100)}'i tuttu.</p>`;
}
function couponCard(c, mode, ctx) {
  const name = K.MODES[mode].name, tag = mode === 'surpriz' ? 'yüksek risk' : mode === 'banko' ? 'en güvenli' : 'maç sonucu';
  if (!c) return `<div class="card"><h2>${name} <span class="tag">${tag}</span></h2><p class="muted">Bu zaman aralığında kurala uyan ${st.n} maç yok. Zamanı “3 gün” yapın ya da maç sayısını azaltın.</p></div>`;
  const legs = c.legs.map((l) => `<div class="kleg"><div><b>${esc(l.h)} – ${esc(l.a)}</b><div class="muted">${trTime(l.t)} · ${esc(l.lgName || l.lg)}</div></div>
    <div class="kpick"><b>${esc(l.label.replace(/ \(.*\)$/, ''))}</b><div class="muted">%${Math.round(l.q * 100)} · ${odds(l.q)}</div></div></div>`).join('');
  return `<div class="card kcard ${mode}"><h2>${name} <span class="tag">${tag}</span></h2>
    <p class="muted" style="margin:0 0 6px">${MODE_INFO[mode]}</p>${legs}
    <div class="ktot"><span>Kupon olasılığı <b>%${num(c.q * 100, c.q < 0.1 ? 1 : 0)}</b></span><span>Adil oran <b>${odds(c.q)}</b></span></div>
    ${ctx.lines.map(([bt, label]) => btLine(bt, mode, st.n, label)).join('')}
    <button class="ksave" data-mode="${mode}" style="width:100%;margin-top:8px">Kuponu kaydet ve takip et</button></div>`;
}
const topSeg = (k) => `<div class="row seg" id="k-top">${[['daily', 'Günlük ve kuponlar'], ['para', '💰 Para akışı']].map(([v, l]) => `<button data-top="${v}" class="grow ${k === v ? 'primary' : ''}">${l}</button>`).join('')}</div>`;
export function viewKombine(toast) {
  const top = read('kb_top', 'daily');
  const bindTop = () => { $('#k-top').onclick = (e) => { const b = e.target.closest('[data-top]'); if (b) { write('kb_top', b.dataset.top); viewKombine(toast); } }; };
  if (top === 'para') { $('#main').innerHTML = topSeg('para') + '<div id="k-para"></div>'; bindTop(); viewPara(toast, $('#k-para')); return; }
  const f = st.sport !== 'b' ? footLegs() : { legs: [], ok: true }, b = st.sport !== 'f' ? basketLegs() : { legs: [], ok: true };
  const legs = [...f.legs, ...b.legs], need = (st.sport !== 'b' && !f.ok) || (st.sport !== 'f' && !b.ok);
  const lines = []; if (st.sport === 'f') lines.push([f.bt, 'futbol, son 26 hafta']); if (st.sport === 'b') lines.push([b.bt, 'basketbol']);
  const modes = st.sport === 'b' ? ['banko', 'surpriz'] : ['banko', 'ms', 'surpriz'];
  const coupons = Object.fromEntries(modes.map((m) => [m, K.coupon(legs, m, st.n)]));
  const goalModes = [];   // gol listeleri artik gercek oranlarla Gunluk bolumunde
  st.coupons = coupons;
  const chip = (k, v, cur, attr) => `<button data-${attr}="${k}" class="grow ${cur === k ? 'primary' : ''}" style="min-height:38px;padding:4px 6px">${v}</button>`;
  $('#main').innerHTML = `${topSeg('daily')}${dailyHtml(st.busy)}
  <h3 style="margin:18px 4px 8px">Model kuponları</h3>
  <div class="row seg" id="k-sport">${[['f', '⚽ Futbol'], ['b', '◍ Basketbol'], ['fb', 'Karışık']].map(([k, v]) => chip(k, v, st.sport, 'sp')).join('')}</div>
  <div class="row seg" id="k-when">${[['today', 'Bugün'], ['tomorrow', 'Yarın'], ['72', '3 gün']].map(([k, v]) => chip(k, v, st.when, 'w')).join('')}</div>
  <div class="row seg" id="k-n"><span class="muted" style="align-self:center;margin-right:4px">Maç sayısı</span>${[2, 3, 4].map((k) => chip(k, k, st.n, 'n')).join('')}</div>
  ${st.sport !== 'b' ? `<label style="display:flex;gap:8px;align-items:center;margin:0 4px 10px"><input type="checkbox" id="k-mine" ${st.mine ? 'checked' : ''}> Futbolda yalnızca Bugün ekranında seçtiğim ligler</label>` : ''}
  ${need ? `<div class="card"><p class="muted">${st.sport === 'f' ? 'Futbol' : 'Basketbol'} verisi yok.</p><button id="k-dl" class="primary" style="width:100%">${st.busy ? 'İndiriliyor…' : 'Verileri indir'}</button></div>` : ''}
  <p class="muted" style="margin:0 4px 10px">${legs.length ? `${(f.n || 0) + (b.n || 0)} maç tarandı (başlamamış, iki takımın da yeterli maçı olan).` : 'Bu aralıkta uygun maç bulunamadı.'}${(st.sport !== 'b' && f.ok && !f.cal) || (st.sport !== 'f' && b.ok && !b.cal) ? ' Kalibrasyon verisi henüz inmedi; “Verileri güncelle”ye dokunun.' : ''}</p>
  ${modes.map((m) => couponCard(coupons[m], m, { lines })).join('')}
  ${goalModes.length ? `<h3 style="margin:18px 4px 8px">Gol avı kombineleri</h3>
  <div class="row seg" id="k-gn"><span class="muted" style="align-self:center;margin-right:4px">Maç sayısı</span>${[7, 8, 10].map((k) => chip(k, k, st.gn, 'gn')).join('')}</div>
  ${goalModes.map((m) => listCard(coupons[m], m, f.bt)).join('')}` : ''}
  ${savedCard()}
  <button id="k-up" style="width:100%;margin-bottom:12px" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Güncelleniyor…' : 'Verileri ve sonuçları güncelle'}</button>
  <div class="warn">Nasıl kurulur: Olasılıklar istatistik modelinden gelir ve geçmiş testte gerçekte ne sıklıkla tuttuğuna göre düzeltilir (kalibrasyon). Kupon olasılığı seçimlerin çarpımıdır; maçların birbirinden bağımsız olduğu varsayılır. “Adil oran” = 1 ÷ olasılık; bahis sitelerinin oranları kâr payı yüzünden genelde bundan düşüktür. Sakatlık, kadro ve motivasyon bilgisi yoktur. Kazanç garantisi yoktur; eğlence içindir.</div>`;
  const re = () => viewKombine(toast); bindTop();
  $('#k-sport').onclick = (e) => { const x = e.target.closest('[data-sp]'); if (x) { st.sport = x.dataset.sp; write('kb_sport', st.sport); re(); } };
  $('#k-when').onclick = (e) => { const x = e.target.closest('[data-w]'); if (x) { st.when = x.dataset.w; write('kb_when', st.when); re(); } };
  if ($('#k-gn')) $('#k-gn').onclick = (e) => { const x = e.target.closest('[data-gn]'); if (x) { st.gn = Number(x.dataset.gn); write('kb_gn', st.gn); re(); } };
  $('#k-n').onclick = (e) => { const x = e.target.closest('[data-n]'); if (x) { st.n = Number(x.dataset.n); write('kb_n', st.n); re(); } };
  if ($('#k-mine')) $('#k-mine').onchange = (e) => { st.mine = e.target.checked; write('kb_mine', st.mine); re(); };
  const update = async () => {
    st.busy = true; re();
    const errs = [];
    try { await downloadDaily(httpGet); } catch (e) { errs.push('günlük'); }
    if (st.sport !== 'b' || savedNeeds('f')) { try { await T.download(httpGet); } catch (e) { errs.push('futbol'); } }
    if (st.sport !== 'f' || savedNeeds('b')) { try { await B.downloadAll(httpGet); st.cache = {}; } catch (e) { errs.push('basketbol'); } }
    st.busy = false; resolveSaved(); toast(errs.length ? `${errs.join(', ')} verisi alınamadı.` : 'Veriler güncellendi.'); re();
  };
  if ($('#k-dl')) $('#k-dl').onclick = update;
  if ($('#k-dd')) $('#k-dd').onclick = update;
  if (!loadDaily() && !st.autoDaily) { st.autoDaily = true; downloadDaily(httpGet).then(re, () => {}); }   // ilk acilista gunluk veri kendiliginden iner
  else if (loadDaily() && Date.now() - (loadDaily().fetched || 0) > 30 * 6e4 && !st.busy && !st.autoDaily) { st.autoDaily = true; downloadDaily(httpGet).then(() => { st.autoDaily = false; re(); }, () => { st.autoDaily = false; }); }
  $('#k-up').onclick = update;
  document.querySelectorAll('.ksave').forEach((x) => { x.onclick = () => { const c = st.coupons[x.dataset.mode]; if (!c) return; saveCoupon(c); toast('Kupon kaydedildi; sonuçlar geldikçe işaretlenir.'); re(); }; });
  document.querySelectorAll('.kdel').forEach((x) => { x.onclick = () => { write('kb_saved', saved().filter((c) => c.id !== x.dataset.id)); re(); }; });
  resolveSaved();
}

const LIST_INFO = {
  gol6: 'Maçta toplam 6 ya da daha fazla gol. Sıradan bir maçta ihtimali yaklaşık %6; burada modelin en yüksek ihtimal verdiği maçlar sıralanır.',
  kk2: 'İlk yarıda da ikinci yarıda da iki takım gol atar. Sıradan bir maçta ihtimali yaklaşık %5; modelin en yüksek ihtimal verdiği maçlar.',
};
const oneIn = (q) => { const x = 1 / q; return x >= 1e6 ? `${num(x / 1e6, x >= 1e7 ? 0 : 1)} milyonda 1` : x >= 1e3 ? `${Math.round(x / 1e3).toLocaleString('tr-TR')} binde 1` : `${Math.round(x)}'de 1`; };
function listCard(c, mode, bt) {
  const name = K.MODES[mode].name;
  if (!c) return `<div class="card"><h2>${name} <span class="tag">en az 7 maç</span></h2><p class="muted">Bu aralıkta ${st.gn} uygun maç yok (iki yarı skoru bilinen ligler gerekir). Zamanı “3 gün” yapın.</p></div>`;
  const expHits = c.legs.reduce((s2, l) => s2 + l.q, 0), o = bt?.[mode]?.[st.gn] || bt?.[mode]?.[7];
  const legs = c.legs.map((l) => `<div class="kleg"><div><b>${esc(l.h)} – ${esc(l.a)}</b><div class="muted">${trTime(l.t)} · ${esc(l.lgName || l.lg)}</div></div>
    <div class="kpick"><b>%${num(l.q * 100, 0)}</b><div class="muted">adil ${odds(l.q)}</div></div></div>`).join('');
  const best = o ? o.dist.reduce((b, v, i) => (v ? i : b), 0) : 0;
  return `<div class="card kcard ${mode}"><h2>${name} <span class="tag">${c.legs.length} maç</span></h2>
    <p class="muted" style="margin:0 0 6px">${LIST_INFO[mode]}</p>${legs}
    <div class="ktot"><span>Beklenen tutan maç <b>${num(expHits, 1)} / ${c.legs.length}</b></span><span>Adil oran <b>${c.odds >= 1e6 ? '1 milyon+' : Math.round(c.odds).toLocaleString('tr-TR')}</b></span></div>
    <p class="muted" style="margin:8px 0 0">Hepsinin birden tutma olasılığı: <b>${oneIn(c.q)}</b>. Kombine olarak neredeyse imkânsızdır; bu liste “bugün gol yağmuruna en yakın maçlar” olarak okunmalı.</p>
    ${o && o.k >= 15 ? `<p class="muted" style="margin:6px 0 0">Geçmiş test (son 26 hafta, ${o.k} gün): her gün kurulan ${o.dist.length - 1}'li listede ortalama <b>${num(o.leg * (o.dist.length - 1), 1)}</b> maç tuttu (model beklentisi ${num(o.legExp * (o.dist.length - 1), 1)}); en iyi gün ${best}/${o.dist.length - 1}; hepsinin tuttuğu gün: ${o.hit}.</p>` : ''}
    <button class="ksave" data-mode="${mode}" style="width:100%;margin-top:8px">Listeyi kaydet ve takip et</button></div>`;
}

/* ---------------- kaydedilen kuponlar ---------------- */
const saved = () => read('kb_saved', []);
const savedNeeds = (sport) => saved().some((c) => c.legs.some((l) => l.sport === sport && l.hit == null));
function saveCoupon(c) {
  const list = saved(), id = String(Date.now());
  list.unshift({ id, made: new Date().toISOString(), mode: c.mode, q: c.q, legs: c.legs.map(({ sport, id: mid, t, lg, lgName, h, a, mk, label, q }) => ({ sport, id: mid, t, lg, lgName, h, a, mk, label, q, hit: null, r: null })) });
  write('kb_saved', list.slice(0, 60));
}
/** Bitmis maclarin sonucunu kayitli kuponlara isler (sonuc bir kez yazilinca veri silinse de kalir). */
function resolveSaved() {
  const list = saved(); let ch = false; const g = T.load(), byId = new Map((g?.matches || []).map((m) => [m.id, m]));
  for (const c of list) for (const l of c.legs) {
    if (l.hit != null) continue;
    let r = null;
    if (l.sport === 'f') { const m = byId.get(l.id); if (m && m.st === 'post' && m.r) { r = [...m.r, ...(m.r1 || [])]; if (K.FMK[l.mk]?.half && !m.r1) { l.hit = 'iptal'; ch = true; continue; } } else if (m && /POSTP|CANC/i.test(m.sn || '')) { l.hit = 'iptal'; ch = true; continue; } }
    else { const db = B.loadLeague(l.lg); if (db) { const d0 = Date.parse(l.t); for (const list2 of Object.values(db.seasons || {})) { const x = list2.find((x) => x[1] === l.h && x[2] === l.a && Math.abs(Date.parse(x[0]) - d0) < 1.6 * 864e5); if (x) { r = [x[3], x[4]]; break; } } } }
    if (r) { l.r = r; l.hit = !!K.legHit(l, r); ch = true; }
  }
  if (ch) write('kb_saved', list);
}
function savedCard() {
  const list = saved(); if (!list.length) return '';
  const state = (c) => (K.MODES[c.mode]?.list ? (c.legs.every((l) => l.hit != null) ? (c.legs.every((l) => l.hit === true || l.hit === 'iptal') ? 'win' : 'lose') : 'wait') : c.legs.some((l) => l.hit === false) ? 'lose' : c.legs.every((l) => l.hit === true || l.hit === 'iptal') ? 'win' : 'wait');
  const done = list.filter((c) => state(c) !== 'wait'), won = done.filter((c) => state(c) === 'win');
  const exp = done.reduce((s, c) => s + c.q, 0);
  const row = (c) => { const s = state(c);
    return `<div class="ksaved ${s}"><div class="row" style="justify-content:space-between;align-items:center"><b>${K.MODES[c.mode]?.name || c.mode} · ${c.legs.length} maç</b>
      <span>${K.MODES[c.mode]?.list ? `${c.legs.filter((l) => l.hit === true).length}/${c.legs.length} tuttu${s === 'wait' ? ' · sürüyor' : ''}` : s === 'win' ? '✓ Tuttu 🎯' : s === 'lose' ? '✗ Yattı 😞' : 'Bekliyor'} <button class="kdel" data-id="${c.id}" style="min-height:28px;padding:2px 8px;margin-left:6px">×</button></span></div>
      ${c.legs.map((l) => `<div class="muted">${l.hit === true ? '✓' : l.hit === false ? '✗' : l.hit === 'iptal' ? '–' : '·'} ${esc(l.h)} – ${esc(l.a)}: <b>${esc(l.label.replace(/ \(.*\)$/, ''))}</b>${l.r ? ` (${l.r[0]}-${l.r[1]}${l.r.length > 2 ? `, İY ${l.r[2]}-${l.r[3]}` : ''})` : ` · ${trTime(l.t)}`}</div>`).join('')}
      <div class="muted">Olasılık %${num(c.q * 100, c.q < 0.1 ? 1 : 0)} · adil oran ${odds(c.q)}</div></div>`; };
  return `<div class="card"><h2>Kuponlarım <span class="tag">${done.length ? `${won.length} / ${done.length} tuttu` : 'takipte'}</span></h2>
    ${done.length >= 3 ? `<p class="muted" style="margin:0 0 6px">Biten ${done.length} kuponda ${won.length} tuttu; olasılıklara göre beklenen ${num(exp, 1)}. ${won.length > exp + 1 ? 'Şimdilik beklentinin üstünde.' : won.length < exp - 1 ? 'Şimdilik beklentinin altında.' : 'Beklentiyle uyumlu.'}</p>` : ''}
    ${list.slice(0, 20).map(row).join('')}</div>`;
}
