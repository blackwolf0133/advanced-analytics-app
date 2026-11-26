// Futbol -> Oran hareketi: iddaa oranlarinin acilistan bu yana degisimi (dusen kirmizi, yukselen yesil), piyasa ve model
// karsilastirmasi, degerli oran isareti ve mac bazinda analiz. Veri hatti saatte bir kaydeder; telefon "Simdi yenile" ile
// iddaa'dan guncel oranlari dogrudan da ceker.
import { read, write } from './store.js';
import { $, esc, num } from './ui.js';
import { httpGet } from './net.js';
import { VERI } from './today.js';
import { IDDAA, parseIddaa, fair } from './oran.js';

const st = { when: read('om_when', 'today'), mk: read('om_mk', 'ou'), sort: read('om_sort', 'move'), val: read('om_val', false), open: null, busy: false };
const OUT = [['1', 'MS 1'], ['X', 'MS X'], ['2', 'MS 2'], ['U', '2,5 Üst'], ['A', '2,5 Alt'], ['KGV', 'KG Var'], ['KGY', 'KG Yok']];
const GROUPS = { ms: [0, 1, 2], ou: [3, 4], kg: [5, 6] }, PCK = { U: 'U2.5', A: 'A2.5' };
const istDay = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 10);
const hm = (t) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const o2 = (x) => (x ? num(x, 2) : '–'), pc = (p) => (p == null ? '–' : `%${Math.round(p * 100)}`);
const snapOf = (od) => [od.ms?.[0], od.ms?.[1], od.ms?.[2], od.ou?.['2.5']?.[1], od.ou?.['2.5']?.[0], od.kg?.[0], od.kg?.[1]].map((x) => x ?? null);

export const loadMove = () => read('fg_move', null);
async function download() {
  let err; for (const b of VERI) { try { const j = JSON.parse(await httpGet(b + 'f/hareket.json')); if (!j.list) throw new Error('biçim'); write('fg_move', { ...j, fetched: Date.now() }); return; } catch (e) { err = e; } }
  throw err;
}
/** iddaa'dan guncel oranlar (telefon Turkiye'de oldugu icin dogrudan). */
async function liveNow() {
  const j = JSON.parse(await httpGet(IDDAA)), by = {};
  for (const e of j?.data?.events || []) { const p = parseIddaa(e); by[p.io] = snapOf(p.od); }
  write('fg_move_live', { at: Date.now(), by });
}
/** Bir macin satir verisi: acilis, simdi (telefon canli cekmisse o), degisim, marji temizlenmis olasiliklar. */
function rowOf(m, live) {
  const first = m.s[0], lastS = m.s[m.s.length - 1], cur = (live && m.io && live.by[m.io]) || lastS.slice(1), open = first.slice(1);
  const fp = (v) => { const out = Array(7).fill(null); for (const g of Object.values(GROUPS)) { const o = g.map((i) => v[i]); if (o.every((x) => x > 1)) fair(o).forEach((p, k) => { out[g[k]] = p; }); } return out; };
  const P0 = fp(open), P1 = fp(cur);
  const out = OUT.map(([k, label], i) => {
    const q = m.q?.[k] ?? null, c = m.pc?.[PCK[k] || k] ?? null, best = c ?? P1[i];
    return { k, label, o0: open[i], o1: cur[i], ch: open[i] && cur[i] ? cur[i] / open[i] - 1 : null, p0: P0[i], p1: P1[i], q, c, ev: best != null && cur[i] ? best * cur[i] - 1 : null };
  });
  return { m, out, maxMove: Math.max(0, ...out.map((x) => Math.abs(x.ch || 0))), val: Math.max(-1, ...out.filter((x) => x.c != null).map((x) => x.ev ?? -1)) };
}
const chg = (x) => (x == null || Math.abs(x) < 0.005 ? '<span class="muted">0</span>' : `<b class="${x < 0 ? 'odrop' : 'orise'}">${x < 0 ? '▼' : '▲'} %${Math.round(Math.abs(x) * 100)}</b>`);
function spark(m, idx) {
  const pts = m.s.map((r) => r[idx + 1]).filter((v) => v > 1); if (pts.length < 2) return '';
  const lo = Math.min(...pts), hi = Math.max(...pts), W = 120, H = 28, x = (i) => (i / (pts.length - 1)) * W, y = (v) => (hi === lo ? H / 2 : H - 3 - ((v - lo) / (hi - lo)) * (H - 6));
  const col = pts[pts.length - 1] < pts[0] ? '#ff6b6b' : '#58e08f';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="vertical-align:middle"><polyline fill="none" stroke="${col}" stroke-width="2" points="${pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/></svg>`;
}
/** Maç analizi: oran hareketi, piyasa olasiligi, model ve keskin piyasa (Pinnacle/ortalama) birlikte yorumlanir. */
function analysis(R) {
  const { m, out } = R, lines = [];
  for (const x of out) {
    if (x.o0 == null || x.o1 == null) continue;
    const moved = Math.abs(x.ch) >= 0.05, toward = x.p1 > x.p0;
    let t = '';
    if (moved) t += `<b>${x.label}</b> oranı ${o2(x.o0)} → ${o2(x.o1)} ${x.ch < 0 ? 'düştü' : 'yükseldi'} (%${Math.round(Math.abs(x.ch) * 100)}); piyasa olasılığı ${pc(x.p0)} → ${pc(x.p1)}.`;
    if (moved && x.q != null) {
      const agree = x.q > x.p1 + 0.03, against = x.q < x.p1 - 0.03;
      t += ` Modelimiz ${pc(x.q)} ${agree ? (toward ? '— <b class="hit">piyasa modelimizin yönüne geliyor</b> (fiyat azaldı, yön doğru).' : '— <b class="miss">piyasa modelimizden uzaklaşıyor</b>, dikkat.') : against ? (toward ? '— piyasa bu sonuca giderek inanıyor, model katılmıyor.' : '— model de piyasa da bu sonuca soğuk.') : '— model ile piyasa aynı yerde.'}`;
    }
    if (x.c != null && x.ev != null && x.ev >= 0.03) t += `${t ? ' ' : ''}<b class="hit">Değerli oran:</b> ${m.src || 'piyasa'} olasılığı ${pc(x.c)}, iddaa oranı ${o2(x.o1)} → beklenen getiri %${Math.round(x.ev * 100)}.`;
    if (t) lines.push(`<li>${t}</li>`);
  }
  if (m.sc) {
    const [h, a] = m.sc, res = { '1': h > a, X: h === a, '2': h < a, U: h + a > 2, A: h + a < 3, KGV: h > 0 && a > 0, KGY: !(h > 0 && a > 0) };
    const big = out.filter((x) => x.ch != null && x.ch <= -0.05);
    lines.push(`<li><b>Sonuç ${h}-${a}${m.sc[2] != null ? ` (İY ${m.sc[2]}-${m.sc[3]})` : ''}.</b> ${big.length ? `Oranı düşen seçimler: ${big.map((x) => `${x.label} ${res[x.k] ? '<b class="hit">tuttu ✓</b>' : '<b class="miss">tutmadı ✗</b>'}`).join(', ')}.` : 'Belirgin oran düşüşü yoktu.'}</li>`);
  }
  return lines.length ? `<ul class="oan">${lines.join('')}</ul>` : '<p class="muted">Bu maçta belirgin oran hareketi yok; açılış oranları korunuyor.</p>';
}
export function viewOdds(toast, el) {
  const M = loadMove(), live = read('fg_move_live', null), now = Date.now();
  if (!M) { el.innerHTML = `<div class="card"><p class="muted">Oran hareketi verisi yok.</p><button id="om-dl" class="primary" style="width:100%">${st.busy ? 'İndiriliyor…' : 'İndir'}</button></div>`; $('#om-dl').onclick = () => refresh(toast, el, false); if (!st.auto) { st.auto = true; refresh(toast, el, false); } return; }
  const useLive = live && now - live.at < 2 * 36e5 ? live : null;
  let rows = M.list.filter((m) => { const d = istDay(Date.parse(m.t)); return st.when === 'all' || (st.when === 'today' ? d === istDay(now) : d === istDay(now + 864e5)); }).map((m) => rowOf(m, useLive));
  if (st.val) rows = rows.filter((r) => r.val >= 0.03);
  rows.sort(st.sort === 'move' ? (a, b) => b.maxMove - a.maxMove : (a, b) => (a.m.t < b.m.t ? -1 : 1));
  const idx = GROUPS[st.mk], chip = (attr, k, v, cur) => `<button data-${attr}="${k}" class="grow ${cur === k ? 'primary' : ''}" style="min-height:36px;padding:4px 6px">${v}</button>`;
  el.innerHTML = `
    <div class="row seg" id="om-when">${[['today', 'Bugün'], ['tomorrow', 'Yarın'], ['all', 'Hepsi']].map(([k, v]) => chip('w', k, v, st.when)).join('')}</div>
    <div class="row seg" id="om-mk">${[['ms', 'Maç sonucu'], ['ou', '2,5 Alt/Üst'], ['kg', 'KG']].map(([k, v]) => chip('k', k, v, st.mk)).join('')}</div>
    <div class="row seg" id="om-sort">${[['move', 'En çok değişen'], ['time', 'Saate göre']].map(([k, v]) => chip('s', k, v, st.sort)).join('')}</div>
    <label style="display:flex;gap:8px;align-items:center;margin:0 4px 10px"><input type="checkbox" id="om-val" ${st.val ? 'checked' : ''}> Yalnızca değerli oranı olan maçlar (iddaa, keskin piyasadan cömert)</label>
    <button id="om-up" style="width:100%;margin-bottom:10px" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Yenileniyor…' : 'Şimdi yenile (iddaa\'dan güncel oranlar)'}</button>
    <p class="muted" style="margin:0 4px 10px">${rows.length} maç · açılış: oranın ilk görüldüğü an · şimdi: ${useLive ? `telefon ${new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(useLive.at))}` : `veri hattı ${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(M.updated))}`}. <b class="odrop">▼ kırmızı</b> oran düştü (o sonuca para geliyor), <b class="orise">▲ yeşil</b> oran yükseldi.</p>
    ${rows.slice(0, 150).map((R) => { const { m, out } = R, open = st.open === m.id;
      return `<div class="card om ${open ? 'on' : ''}" data-id="${esc(m.id)}"><div class="row" style="justify-content:space-between;gap:8px"><div><b>${esc(m.h)} – ${esc(m.a)}</b>${m.sc ? ` <span class="muted">(${m.sc[0]}-${m.sc[1]})</span>` : ''}<div class="muted">${hm(m.t)} · ${esc(m.ln)}${R.val >= 0.03 ? ' · <b class="hit">değerli oran</b>' : ''}</div></div><span class="muted">${open ? '▲' : '▼'}</span></div>
        <div class="omrow">${idx.map((i) => { const x = out[i]; return `<div><span class="muted">${x.label}</span><br>${o2(x.o0)} → <b>${o2(x.o1)}</b><br>${chg(x.ch)}</div>`; }).join('')}</div>
        ${open ? `<div class="omdet">${idx.map((i) => `<div class="muted">${out[i].label} ${spark(m, i)}</div>`).join('')}
          <table class="ktab"><tr><th></th><th>Açılış</th><th>Şimdi</th><th>Piyasa</th><th>Model</th><th>${esc(m.src || 'Keskin')}</th></tr>
          ${out.filter((x) => x.o1 != null).map((x) => `<tr><td>${x.label}</td><td>${o2(x.o0)}</td><td>${o2(x.o1)} ${chg(x.ch)}</td><td>${pc(x.p0)}→${pc(x.p1)}</td><td>${pc(x.q)}</td><td>${pc(x.c)}${x.c != null && x.ev >= 0.03 ? ' <b class="hit">+' + Math.round(x.ev * 100) + '%</b>' : ''}</td></tr>`).join('')}</table>
          <h3 style="margin:10px 0 4px">Analiz</h3>${analysis(R)}</div>` : ''}</div>`; }).join('') || '<div class="card muted">Bu seçimde maç yok.</div>'}
    <div class="warn">Düşen oran, o sonuca para geldiğini gösterir; çoğu zaman haber (kadro, sakatlık) ya da profesyonel bahisçilerin görüşü fiyata yansır. Garanti değildir. “Değerli oran”: iddaa'nın oranı, keskin piyasanın (Pinnacle ya da bahisçi ortalaması, football-data.co.uk) marjı temizlenmiş olasılığına göre %3+ getiri veriyor; yalnızca büyük Avrupa liglerinde vardır.</div>`;
  const re = () => viewOdds(toast, el);
  $('#om-when').onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) { st.when = b.dataset.w; write('om_when', st.when); re(); } };
  $('#om-mk').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { st.mk = b.dataset.k; write('om_mk', st.mk); re(); } };
  $('#om-sort').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { st.sort = b.dataset.s; write('om_sort', st.sort); re(); } };
  $('#om-val').onchange = (e) => { st.val = e.target.checked; write('om_val', st.val); re(); };
  $('#om-up').onclick = () => refresh(toast, el, true);
  el.querySelectorAll('.om').forEach((c) => { c.onclick = (e) => { if (e.target.closest('table')) return; st.open = st.open === c.dataset.id ? null : c.dataset.id; re(); }; });
  if (now - (M.fetched || 0) > 30 * 6e4 && !st.busy && !st.auto2) { st.auto2 = true; refresh(toast, el, false).finally(() => { st.auto2 = false; }); }
}
async function refresh(toast, el, liveToo) {
  st.busy = true; viewOdds(toast, el); const errs = [];
  try { await download(); } catch (e) { errs.push('veri hattı'); }
  if (liveToo) { try { await liveNow(); } catch (e) { errs.push("iddaa'ya ulaşılamadı"); } }
  st.busy = false; if (errs.length && toast) toast(errs.join(', ')); if (el.isConnected) viewOdds(toast, el);
}
