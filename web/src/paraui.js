// Kombine -> Para akisi: ABD'de yasal bahis sirketlerinde halkin bahis ve para yuzdeleri (Action Network konsensusu).
import { read, write } from './store.js';
import { $, esc, num } from './ui.js';
import { httpGet } from './net.js';
import { VERI } from './today.js';

const st = { sp: read('pa_sp', 'all'), view: read('pa_view', 'sig'), busy: false };
const hm = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const loadPara = () => read('fg_para', null);
async function download() {
  let err; for (const b of VERI) { try { const j = JSON.parse(await httpGet(b + 'f/para.json')); if (!j.games) throw new Error('biçim'); write('fg_para', { ...j, fetched: Date.now() }); return; } catch (e) { err = e; } }
  throw err;
}
const SIDE = (g, mkt, side) => (side === 'home' ? g.h : side === 'away' ? g.a : side === 'draw' ? 'Beraberlik' : side === 'over' ? 'Üst' : 'Alt');
const LABEL = { ml: 'Maç sonucu', spr: 'Handikap', tot: 'Alt / Üst' };
const lineTxt = (mkt, s) => (mkt === 'spr' ? ` (${s.v > 0 ? '+' : ''}${num(s.v, 1)})` : mkt === 'tot' ? ` ${num(s.v, 1)}` : '');
const GAP = 10, COL = { home: '#4c9dff', away: '#ffb454', draw: '#8c9aab', over: '#58e08f', under: '#ff8a7a' };
const live = (mk) => mk && Object.values(mk).some((x) => x.t > 0 || x.m > 0);      // bos (0/0) pazarlar gosterilmez
/** Bir macin sinyalleri: para payi bahis payindan 10+ puan yuksek taraflar (en buyuk fark once). */
function signals(g) {
  const out = [];
  for (const mkt of ['ml', 'spr', 'tot']) if (live(g[mkt])) for (const [s, x] of Object.entries(g[mkt])) if (x.m - x.t >= GAP) out.push({ mkt, s, x, gap: x.m - x.t });
  return out.sort((a, b) => b.gap - a.gap);
}
const maxGap = (g) => signals(g)[0]?.gap || 0;
const bar = (sides, mk, f) => `<span class="sbar">${sides.map((s) => { const v = mk[s][f]; return `<i style="width:${v}%;background:${COL[s]}">${v >= 14 ? '%' + v : ''}</i>`; }).join('')}</span>`;
function market(g, mkt, sig) {
  const mk = g[mkt]; if (!live(mk)) return '';
  const sides = (mkt === 'tot' ? ['over', 'under'] : ['home', 'draw', 'away']).filter((s) => mk[s]);
  return `<div class="pa-mk"><div class="pa-h">${LABEL[mkt]}</div>
    <div class="pa-leg">${sides.map((s) => `<span class="${sig.has(mkt + s) ? 'on' : ''}"><i style="background:${COL[s]}"></i>${sig.has(mkt + s) ? '💰 ' : ''}${esc(SIDE(g, mkt, s))}${lineTxt(mkt, mk[s])} <em>%${mk[s].t} / %${mk[s].m}</em></span>`).join('')}</div>
    <div class="pa-row"><em>Bahis</em>${bar(sides, mk, 't')}</div><div class="pa-row"><em>Para</em>${bar(sides, mk, 'm')}</div></div>`;
}
function gameCard(g, now) {
  const S = signals(g), sig = new Set(S.map((x) => x.mkt + x.s)), top = S[0];
  const crowd = !top && ['ml', 'spr', 'tot'].flatMap((m) => (live(g[m]) ? Object.entries(g[m]).map(([s, x]) => ({ m, s, x })) : [])).find((o) => o.x.t >= 80);
  const head = top ? `<div class="pa-sig">💰 Büyük para: <b>${esc(SIDE(g, top.mkt, top.s))}${lineTxt(top.mkt, top.x)}</b> <span>(${LABEL[top.mkt].toLowerCase()})</span><br><small>bahislerin %${top.x.t}'i ama paranın <b>%${top.x.m}</b>'i bu tarafta${S.length > 1 ? ` · ${S.length - 1} sinyal daha` : ''}</small></div>`
    : crowd ? `<div class="pa-crowd">Kalabalık tek tarafta: ${esc(SIDE(g, crowd.m, crowd.s))}${lineTxt(crowd.m, crowd.x)} (bahislerin %${crowd.x.t}'i), büyük para işareti yok.</div>` : '';
  const model = g.model && g.sp === 'soccer' ? `<p class="muted" style="margin:8px 0 0">Modelimiz 1 %${Math.round(g.model[0] * 100)} · X %${Math.round(g.model[1] * 100)} · 2 %${Math.round(g.model[2] * 100)}${g.iddaa?.ms ? ` · iddaa ${num(g.iddaa.ms[0], 2)} / ${num(g.iddaa.ms[1], 2)} / ${num(g.iddaa.ms[2], 2)}` : ''}</p>` : '';
  return `<div class="card pa-g"><div class="pa-t"><b>${esc(g.h)} – ${esc(g.a)}</b></div>
    <div class="muted">${hm(g.t)} · ${esc(g.ln)}${g.nb ? ` · ${g.nb} bahis` : ''}${Date.parse(g.t) <= now ? ' · <b>başladı</b>' : ''}</div>
    ${head}${market(g, 'ml', sig)}${market(g, 'spr', sig)}${market(g, 'tot', sig)}${model}</div>`;
}
export function viewPara(toast, el) {
  const P = loadPara();
  if (!P) { el.innerHTML = `<div class="card"><p class="muted">Para akışı verisi yok.</p><button id="pa-dl" class="primary" style="width:100%">${st.busy ? 'İndiriliyor…' : 'İndir'}</button></div>`; $('#pa-dl').onclick = () => refresh(toast, el); if (!st.auto) { st.auto = true; refresh(toast, el); } return; }
  const now = Date.now(), S = P.sum || {};
  const base = P.games.filter((g) => Date.parse(g.t) > now - 3 * 36e5 && (st.sp === 'all' || g.sp === st.sp)), sigN = base.filter((g) => maxGap(g) > 0).length;
  const gs = st.view === 'sig' ? base.filter((g) => maxGap(g) > 0).sort((a, b) => maxGap(b) - maxGap(a)) : [...base].sort((a, b) => (a.t < b.t ? -1 : 1));
  const done = (P.log || []).filter((x) => x.res === 'W' || x.res === 'L').slice(-12).reverse();
  const rate = (o) => (o?.n ? `<span><b>${o.w}/${o.n}</b> <span class="muted">(%${Math.round((o.w / o.n) * 100)}, kâr <b class="${o.pl > 0 ? 'hit' : o.pl < 0 ? 'miss' : ''}">${o.pl > 0 ? '+' : ''}${num(o.pl, 1)}</b> birim)</span></span>` : '<span class="muted">–</span>');
  const chip = (attr, k, v, cur) => `<button data-${attr}="${k}" class="grow ${cur === k ? 'primary' : ''}" style="min-height:36px;padding:4px 6px">${v}</button>`;
  el.innerHTML = `
    <div class="card"><h2>Para akışı <span class="tag">ABD yasal bahis şirketleri</span></h2>
      <p style="margin:0">💰 = <b>az kişi ama büyük para</b>: bir tarafa yatan paranın payı, kupon sayısının payından 10 puan ve fazla yüksek.</p>
      <details><summary class="muted">Nasıl okunur?</summary><p class="muted" style="margin:6px 0 0">Her pazarda iki çubuk var: <b>Bahis</b> = kaç kupon hangi tarafa, <b>Para</b> = ne kadar tutar hangi tarafa. Örnek: bahislerin %20'si ama paranın %60'ı bir taraftaysa, o tarafa az sayıda büyük bahis gelmiş demektir; profesyonel paranın izi olabilir. Kalabalığın %80'i bir tarafa yığılmışsa bu tek başına sinyal değildir. Sinyaller garanti değildir; karne aşağıda tutulur.</p></details></div>
    <div class="row seg" id="pa-sp">${[['all', 'Hepsi'], ['nba', 'NBA'], ['ncaab', 'NCAA'], ['soccer', 'Futbol']].map(([k, v]) => chip('s', k, v, st.sp)).join('')}</div>
    <div class="row seg" id="pa-v">${chip('v', 'sig', `💰 Sinyalliler (${sigN})`, st.view)}${chip('v', 'all', `Tüm maçlar (${base.length})`, st.view)}</div>
    <div class="card"><h2>Sinyal karnesi <span class="tag">son 60 gün</span></h2>
      <div class="pa-k"><span>Büyük para tarafı</span>${rate(S.all)}</div>
      <details><summary class="muted">Ayrıntı ve son biten sinyaller</summary>
        <div class="pa-k"><span>Maç sonucu</span>${rate(S.ml)}</div><div class="pa-k"><span>Handikap</span>${rate(S.spr)}</div><div class="pa-k"><span>Alt / Üst</span>${rate(S.tot)}</div><div class="pa-k"><span>Fark 20+ puan</span>${rate(S.big)}</div>
        ${done.map((x) => `<div class="muted">${x.res === 'W' ? '<b class="hit">✓</b>' : '<b class="miss">✗</b>'} ${esc(x.h)} – ${esc(x.a)} (${x.sc?.[0]}-${x.sc?.[1]}): ${LABEL[x.mkt]} ${esc(SIDE(x, x.mkt, x.side))}${x.mkt !== 'ml' ? ' ' + num(x.v, 1) : ''} · para %${x.mon} / bahis %${x.tix}</div>`).join('')}
        <p class="muted" style="margin:6px 0 0">Birim kâr: her sinyale 1 birim yatırılmış gibi (o anki oranla). %50 civarı ve eksi kâr, sinyalin işe yaramadığını gösterir; birkaç yüz maç olmadan karar vermeyin.</p></details></div>
    ${gs.slice(0, 60).map((g) => gameCard(g, now)).join('') || `<div class="card muted">${st.view === 'sig' ? 'Şu an bu seçimde büyük para sinyali yok. “Tüm maçlar”a bakabilirsiniz.' : 'Bu seçimde maç yok.'}</div>`}
    <button id="pa-up" style="width:100%;margin-bottom:10px" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Yenileniyor…' : 'Yenile'}</button>
    <p class="muted" style="margin:0 4px 12px">Kaynak: Action Network (ABD'de lisanslı bahis şirketlerinin ortalaması). Son güncelleme ${hm(P.updated)}; saatte bir yenilenir. Kapsam: NBA, NCAA, Premier Lig, La Liga, Serie A, Bundesliga, Ligue 1, MLS. Oranlar ABD oranlarıdır, iddaa değil.</p>`;
  const re = () => viewPara(toast, el);
  $('#pa-sp').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { st.sp = b.dataset.s; write('pa_sp', st.sp); re(); } };
  $('#pa-v').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) { st.view = b.dataset.v; write('pa_view', st.view); re(); } };
  $('#pa-up').onclick = () => refresh(toast, el);
  if (Date.now() - (P.fetched || 0) > 30 * 6e4 && !st.busy && !st.auto2) { st.auto2 = true; refresh(toast, el).finally(() => { st.auto2 = false; }); }
}
async function refresh(toast, el) {
  st.busy = true; viewPara(toast, el);
  try { await download(); } catch (e) { if (toast) toast('Para akışı verisi alınamadı.'); }
  st.busy = false; if (el.isConnected) viewPara(toast, el);
}
