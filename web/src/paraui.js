// Kombine -> Para akisi: ABD'de yasal bahis sirketlerinde halkin bahis ve para yuzdeleri (Action Network konsensusu).
import { read, write } from './store.js';
import { $, esc, num } from './ui.js';
import { httpGet } from './net.js';
import { VERI } from './today.js';

const st = { sp: read('pa_sp', 'all'), sort: read('pa_sort', 'gap'), busy: false };
const hm = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const loadPara = () => read('fg_para', null);
async function download() {
  let err; for (const b of VERI) { try { const j = JSON.parse(await httpGet(b + 'f/para.json')); if (!j.games) throw new Error('biçim'); write('fg_para', { ...j, fetched: Date.now() }); return; } catch (e) { err = e; } }
  throw err;
}
const SIDE = (g, mkt, side) => (side === 'home' ? g.h : side === 'away' ? g.a : side === 'draw' ? 'Beraberlik' : side === 'over' ? 'Üst' : 'Alt');
const LABEL = { ml: 'Maç sonucu', spr: 'Handikap', tot: 'Alt / Üst' };
const lineTxt = (mkt, s) => (mkt === 'spr' ? ` (${s.v > 0 ? '+' : ''}${num(s.v, 1)})` : mkt === 'tot' ? ` ${num(s.v, 1)}` : '');
const maxGap = (g) => Math.max(0, ...['ml', 'spr', 'tot'].flatMap((k) => Object.values(g[k] || {}).map((s) => s.m - s.t)));
function market(g, mkt) {
  const mk = g[mkt]; if (!mk || !Object.keys(mk).length) return '';
  const order = mkt === 'tot' ? ['over', 'under'] : ['home', 'draw', 'away'];
  const sides = order.filter((s) => mk[s]);
  return `<div class="pmk"><div class="muted" style="font-size:12.5px">${LABEL[mkt]}</div>${sides.map((s) => { const x = mk[s], gap = x.m - x.t, big = gap >= 10;
    return `<div class="prow ${big ? 'big' : ''}"><span class="pname">${big ? '💰 ' : ''}${esc(SIDE(g, mkt, s))}${lineTxt(mkt, x)}</span>
      <span class="pbar"><i class="pt" style="width:${x.t}%"></i><i class="pm" style="width:${x.m}%"></i></span><span class="pnum">%${x.t} · <b>%${x.m}</b></span></div>`; }).join('')}</div>`;
}
function notes(g) {
  const out = [];
  for (const mkt of ['ml', 'spr', 'tot']) for (const [s, x] of Object.entries(g[mkt] || {})) {
    const gap = x.m - x.t;
    if (gap >= 10) out.push(`<b>${LABEL[mkt]} · ${esc(SIDE(g, mkt, s))}${lineTxt(mkt, x)}:</b> bahis payı %${x.t}, para payı <b>%${x.m}</b> → az sayıda ama büyük bahis burada (profesyonel para işareti olabilir).`);
    else if (x.t >= 80) out.push(`<b>${LABEL[mkt]} · ${esc(SIDE(g, mkt, s))}${lineTxt(mkt, x)}:</b> bahis payı %${x.t} (tek taraflı kalabalık).`);
  }
  if (g.model && g.sp === 'soccer') out.push(`Modelimiz: 1 %${Math.round(g.model[0] * 100)} · X %${Math.round(g.model[1] * 100)} · 2 %${Math.round(g.model[2] * 100)}${g.iddaa?.ms ? ` · iddaa 1 ${num(g.iddaa.ms[0], 2)} / X ${num(g.iddaa.ms[1], 2)} / 2 ${num(g.iddaa.ms[2], 2)}` : ''}`);
  return out.length ? `<ul class="oan">${out.map((x) => `<li>${x}</li>`).join('')}</ul>` : '';
}
export function viewPara(toast, el) {
  const P = loadPara();
  if (!P) { el.innerHTML = `<div class="card"><p class="muted">Para akışı verisi yok.</p><button id="pa-dl" class="primary" style="width:100%">${st.busy ? 'İndiriliyor…' : 'İndir'}</button></div>`; $('#pa-dl').onclick = () => refresh(toast, el); if (!st.auto) { st.auto = true; refresh(toast, el); } return; }
  const now = Date.now(), S = P.sum || {};
  let gs = P.games.filter((g) => Date.parse(g.t) > now - 3 * 36e5 && (st.sp === 'all' || g.sp === st.sp));
  gs.sort(st.sort === 'gap' ? (a, b) => maxGap(b) - maxGap(a) : (a, b) => (a.t < b.t ? -1 : 1));
  const done = (P.log || []).filter((x) => x.res === 'W' || x.res === 'L').slice(-12).reverse();
  const kk = (o, t) => (o?.n ? `<div>${t}: <b>${o.w}/${o.n}</b> (%${Math.round((o.w / o.n) * 100)}) · birim kâr <b class="${o.pl > 0 ? 'hit' : o.pl < 0 ? 'miss' : ''}">${o.pl > 0 ? '+' : ''}${num(o.pl, 1)}</b></div>` : '');
  const chip = (attr, k, v, cur) => `<button data-${attr}="${k}" class="grow ${cur === k ? 'primary' : ''}" style="min-height:36px;padding:4px 6px">${v}</button>`;
  el.innerHTML = `
    <div class="card"><h2>Para akışı <span class="tag">yasal ABD bahis şirketleri</span></h2>
      <p class="muted" style="margin:0">Her pazarda iki sayı: <b>bahis %</b> (kupon sayısı) ve <b>para %</b> (yatırılan tutar). Para yüzdesi bahis yüzdesinden 10 puan ve fazlası yüksekse o tarafta <b>az ama büyük bahisler</b> var: 💰 ile işaretlenir. Çubukta açık renk bahis, koyu renk para.</p></div>
    <div class="row seg" id="pa-sp">${[['all', 'Hepsi'], ['nba', 'NBA'], ['ncaab', 'NCAA'], ['soccer', 'Futbol']].map(([k, v]) => chip('s', k, v, st.sp)).join('')}</div>
    <div class="row seg" id="pa-sort">${[['gap', 'En büyük para farkı'], ['time', 'Saate göre']].map(([k, v]) => chip('o', k, v, st.sort)).join('')}</div>
    <div class="card"><h2>Büyük para tarafı ne kadar tuttu? <span class="tag">son 60 gün</span></h2>
      ${S.all?.n ? kk(S.all, 'Hepsi') + kk(S.ml, 'Maç sonucu') + kk(S.spr, 'Handikap') + kk(S.tot, 'Alt / Üst') + kk(S.big, 'Fark 20+ puan') : '<p class="muted" style="margin:0">Sonuçlar birikiyor; ilk maçlar bitince burada görünecek.</p>'}
      <p class="muted" style="margin:6px 0 0">Birim kâr: her sinyale 1 birim yatırılmış gibi (o anki oranla). %50 civarı ve eksi kâr, sinyalin işe yaramadığı anlamına gelir; birkaç yüz maç olmadan karar vermeyin.</p>
      ${done.length ? `<details><summary class="muted">Son biten sinyaller</summary>${done.map((x) => `<div class="muted">${x.res === 'W' ? '<b class="hit">✓</b>' : '<b class="miss">✗</b>'} ${esc(x.h)} – ${esc(x.a)} (${x.sc?.[0]}-${x.sc?.[1]}): ${LABEL[x.mkt]} ${esc(SIDE(x, x.mkt, x.side))}${x.mkt !== 'ml' ? ' ' + num(x.v, 1) : ''} · para %${x.mon} / bahis %${x.tix}</div>`).join('')}</details>` : ''}</div>
    <button id="pa-up" style="width:100%;margin-bottom:10px" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Yenileniyor…' : 'Yenile'}</button>
    ${gs.slice(0, 80).map((g) => `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(g.h)} – ${esc(g.a)}</b><span class="muted">${g.nb ? `${g.nb} bahis` : ''}</span></div>
      <div class="muted">${hm(g.t)} · ${esc(g.ln)}${Date.parse(g.t) <= now ? ' · başladı' : ''}</div>${market(g, 'ml')}${market(g, 'spr')}${market(g, 'tot')}${notes(g)}</div>`).join('') || '<div class="card muted">Bu seçimde maç yok.</div>'}
    <p class="muted" style="margin:0 4px 12px">Kaynak: Action Network (ABD'de lisanslı bahis şirketlerinin ortalaması). Son güncelleme ${hm(P.updated)}; veri hattı saatte bir yeniler. Kapsam: NBA, NCAA ve futbolda Premier Lig, La Liga, Serie A, Bundesliga, Ligue 1, MLS. Türk ligleri ve diğer ligler için halka açık güvenilir kaynak yok. Gösterilen oranlar ABD oranlarıdır, iddaa değil.</p>`;
  const re = () => viewPara(toast, el);
  $('#pa-sp').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { st.sp = b.dataset.s; write('pa_sp', st.sp); re(); } };
  $('#pa-sort').onclick = (e) => { const b = e.target.closest('[data-o]'); if (b) { st.sort = b.dataset.o; write('pa_sort', st.sort); re(); } };
  $('#pa-up').onclick = () => refresh(toast, el);
  if (Date.now() - (P.fetched || 0) > 30 * 6e4 && !st.busy && !st.auto2) { st.auto2 = true; refresh(toast, el).finally(() => { st.auto2 = false; }); }
}
async function refresh(toast, el) {
  st.busy = true; viewPara(toast, el);
  try { await download(); } catch (e) { if (toast) toast('Para akışı verisi alınamadı.'); }
  st.busy = false; if (el.isConnected) viewPara(toast, el);
}
