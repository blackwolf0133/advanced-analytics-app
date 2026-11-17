// Yuzen pencere: bolge secimi, ekrandan sayi okuma, takip ve tahmin gosterimi. Oyunun ustunde durur.
import * as R from './roulette.js';
import { fromRGBA } from './digits.js';
import { cellRects, newestRects, readRects, alignStrip, fitStrip, fitGrid, frameCells } from './geom.js';
import { sub } from './digits.js';
import { Tracker, TRACK } from './tracker.js';
import { loadRoulette, activeSession, withActive, read, write } from './store.js';
import { $, ball, Native } from './ui.js';

// eski surumde elle satir/sutun verilen tablolar artik cerceve: duzen ve en yeni sayi goruntuden bulunur
const cfg0 = read('screen', null); if (cfg0 && cfg0.rows > 1 && !cfg0.kind) { cfg0.kind = 'frame'; write('screen', cfg0); }
const st = { mode: 'mini', cfg: cfg0, grid: null, gridAt: 0, win: null, searching: false, running: false, tracker: null, first: null, saved: 0, imported: 0, status: '', shown: -1, busy: false, bad: 0, fixAt: 0, peek: null,
  pick: null };   // pick: { iw, ih, scale, ox, oy, rect:{l,t,w,h}|null, rows, cols, newest, results }
const BLACK = 'Görüntü siyah geliyor: tarayıcı ekran kaydını engelliyor. Tor Browser’da Ayarlar → Gelişmiş → “Ekran görüntülerine izin ver”i açın.';
const setMode = (m) => { st.mode = m; document.body.className = m === 'mini' ? '' : m; Native?.setMode(m); };
const say = (t) => { st.status = t; $('#status').textContent = t; };

/** "w,h,base64(RGBA)" -> RGB goruntu */
function decode(s) {
  if (!s) return null;
  const i = s.indexOf(','), j = s.indexOf(',', i + 1), w = Number(s.slice(0, i)), h = Number(s.slice(i + 1, j)), bin = atob(s.slice(j + 1));
  const buf = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
  return buf.length === w * h * 4 ? fromRGBA(buf, w, h) : null;
}
/** En yeni basta olacak sekilde ilk 'limit' hucreyi okur. grab(l,t,w,h) ekran koordinatlariyla ham goruntu dondurur. */
function readNewest(c, limit, grab) {
  const box = newestRects(c, limit), img = decode(grab(c.l + box.x0, c.t + box.y0, box.x1 - box.x0, box.y1 - box.y0));
  if (!img) return null;
  let mx = 0; for (let i = 0; i < img.d.length; i += 97) if (img.d[i] > mx) mx = img.d[i];
  if (mx < 12) return 'black';
  const vals = readRects(img, box); if (limit <= TRACK + 1 || !st.peek) st.peek = { img, vals: vals.slice(0, TRACK) };
  return vals;
}

/**
 * Tek sira: seridi verilen yukseklik cevresinde bulur; hem dikey yeri hem kutu duzeni (kenar boslugu, kac sayi sigdigi,
 * ilk kutunun genisligi) goruntuden olculur. Donus: { l, w, cols, first, t, h } ya da null / 'black'.
 */
function findStrip(c, sw, sh, grab) {
  const k = sw / 1080, pad = Math.round(70 * k), mid = c.t + c.h / 2, y0 = Math.max(0, Math.round(mid - pad)), y1 = Math.min(sh, Math.round(mid + pad));
  const band = decode(grab(0, y0, sw, y1 - y0)); if (!band) return null;
  let mx = 0; for (let i = 0; i < band.d.length; i += 97) if (band.d[i] > mx) mx = band.d[i];
  if (mx < 12) return 'black';
  const okRead = (cc) => { const b = newestRects(cc, cc.cols), v = readRects(sub(band, cc.l + b.x0, cc.t - y0 + b.y0, cc.l + b.x1, cc.t - y0 + b.y1), b); return { v, n: v.filter((x) => x !== null).length }; };
  const tries = [];
  if (c.newest === 'first') {
    // 1) kaba dikey yer (tam genislik, varsayilan duzen)  2) bu satirlarda yatay olcu  3) olcuyle dikeyi yeniden hizala
    const rough = alignStrip(band, y0, { ...c, l: 0, w: sw, cols: 14, first: 1.6 }, k) || { t: Math.round(mid - 25 * k), h: Math.round(50 * k) };
    for (const tt of [rough.t, Math.round(mid - rough.h / 2)]) {
      const fit = fitStrip(sub(band, 0, tt - y0, sw, tt - y0 + rough.h)); if (!fit) continue;
      const cc = { ...c, l: fit.l, w: fit.w, cols: fit.cols, first: fit.first }, a = alignStrip(band, y0, cc, k);
      if (a) tries.push({ ...cc, t: a.t, h: a.h });
    }
  }
  const a = alignStrip(band, y0, c, k); if (a && a.score >= 2.5) tries.push({ ...c, t: a.t, h: a.h });
  let best = null;
  for (const cc of tries) { const r = okRead(cc); if (r.v[0] === null) continue; const sc = r.n / cc.cols + r.n * 0.001; if (!best || sc > best.sc) best = { ...cc, sc }; }
  return best && best.sc >= 0.6 ? { l: best.l, w: best.w, cols: best.cols, first: best.first, t: best.t, h: best.h } : null;
}
/** Kucuk pencerede okunan seridin canli goruntusu: kutu yanlis yerdeyse hemen gorulur. */
function peek() {
  const cv = $('#peek'), p = st.peek; if (!cv) return;
  if (!st.running || !p) { cv.style.display = 'none'; return; }
  const { img } = p, w = Math.min(img.w, Math.round(img.h * 7.5)); cv.style.display = ''; cv.width = w; cv.height = img.h;
  const g = cv.getContext('2d'), id = g.createImageData(w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < w; x++) { const s = (y * img.w + x) * 3, d = (y * w + x) * 4; id.data[d] = img.d[s]; id.data[d + 1] = img.d[s + 1]; id.data[d + 2] = img.d[s + 2]; id.data[d + 3] = 255; }
  g.putImageData(id, 0, 0);
}
/** Okuma bozulduysa (sayfa kaydi, adres cubugu acildi/kapandi) tek siralik seridi kendisi yeniden bulur. */
function refit(c) {
  if (c.rows !== 1 || Date.now() - st.fixAt < 4000) return false;
  st.fixAt = Date.now();
  const a = findStrip(c, c.sw, c.sh, (l, t, w, h) => Native.grabRaw(l, t, w, h));
  if (!a || a === 'black' || ['l', 'w', 'cols', 'first', 't', 'h'].every((x) => a[x] === c[x])) return false;
  st.cfg = { ...c, ...a }; write('screen', st.cfg); st.tracker = null; st.first = null; st.bad = 0;
  say('Şerit kaymış; yeri yeniden bulundu. Okuma sürüyor.'); return true;
}

/**
 * Ekran kaydinda bu pencere de gorunur: okunan hucrelerin ustune gelirse sayilar bozuk okunur ve takip durur.
 * Oyle olursa pencere seridin hemen altina (sigmazsa ustune) cekilir. Donus: 'moved' | 'blocked' | ''.
 */
function clearView(box, sw, sh) {
  st.win = null; if (!Native.winRect) return '';
  const [wx, wy, ww, wh] = String(Native.winRect() || '').split(',').map(Number); if (!(ww > 0 && wh > 0)) return '';
  st.win = [wx, wy, ww, wh];
  const { x0, x1, y0, y1 } = box, m = Math.round(8 * sw / 1080);
  if (wx >= x1 || wx + ww <= x0 || wy >= y1 + m || wy + wh <= y0 - m) return '';
  const gap = Math.round(52 * sw / 1080), opts = [y1 + gap, y0 - gap - wh].filter((y) => y >= 0 && y + wh <= sh).map((y) => y - wy).sort((a, b2) => Math.abs(a) - Math.abs(b2));
  if (!opts.length) return 'blocked';
  Native.moveBy(0, opts[0]); return 'moved';
}

/* ---------------- cerceve: tablonun cevresi; duzen ve en yeni sayi goruntuden ---------------- */
const dark = (img) => { let mx = 0; for (let i = 0; i < img.d.length; i += 97) if (img.d[i] > mx) mx = img.d[i]; return mx < 12; };
/** Yuzen pencerenin cerceveye gore yeri (okumada o hucreler sayilmaz). */
const winMask = (c) => (st.win ? [{ x0: st.win[0] - c.l, y0: st.win[1] - c.t, x1: st.win[0] + st.win[2] - c.l, y1: st.win[1] + st.win[3] - c.t }] : []);
const hiddenCell = (c, r) => winMask(c).some((m) => r.x0 < m.x1 && r.x1 > m.x0 && r.y0 < m.y1 && r.y1 > m.y0);
const bbox = (rs) => ({ x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) });
/** Cercevedeki ilk k hucre, en yeni basta; pencerenin altindakiler null. */
function frameRead(c, g, k, grab) {
  const rects = g.cells.slice(0, k), b = bbox(rects), img = decode(grab(c.l + b.x0, c.t + b.y0, b.x1 - b.x0, b.y1 - b.y0));
  if (!img) return null; if (dark(img)) return 'black';
  const hid = rects.map((r) => hiddenCell(c, r)), vals = readRects(img, { rects, x0: b.x0, y0: b.y0 }).map((v, i) => (hid[i] ? null : v));
  const h0 = hid.indexOf(true); if (h0 >= 0) vals.hiddenAt = h0;     // pencerenin altindan sonrasi gecmise aktarilmaz (sira bozulmasin)
  if (k <= TRACK + 1 || !st.peek) { const r0 = rects[0], row = rects.filter((r) => r.y0 === r0.y0), rb = bbox(row.slice(0, TRACK));
    st.peek = { img: readRegion(img, rb.x0 - b.x0, rb.y0 - b.y0, rb.x1 - b.x0, rb.y1 - b.y0), vals: vals.slice(0, TRACK) }; }
  return vals;
}
const readRegion = (img, x0, y0, x1, y1) => sub(img, Math.max(0, x0), Math.max(0, y0), Math.min(img.w, x1), Math.min(img.h, y1));
/** Tablo kaydiysa (ustte yeni satir gorunuyorsa) en yeni satir artik bu degildir: duzen yeniden aranir. */
function scrolledAway(c, g, grab) {
  if (g.strip || !g.py || !g.xs || c.newest !== 'first') return false;
  const y1 = g.cells[0].y0, y0 = y1 - g.py; if (y0 < 0) return false;
  const rects = g.xs.map(([x0, x1]) => ({ x0, x1, y0, y1 })).filter((r) => !hiddenCell(c, r)); if (rects.length < 2) return false;
  const b = bbox(rects), img = decode(grab(c.l + b.x0, c.t + b.y0, b.x1 - b.x0, b.y1 - b.y0)); if (!img) return false;
  const v = readRects(img, { rects, x0: b.x0, y0: b.y0 }); return v.filter((x) => x !== null).length >= 0.5 * rects.length;
}
/** Okuma duzeni: sabit hucreler (tek sira / elle tablo) ya da cerceve. */
function layout(c, grab) {
  if (c.kind !== 'frame') {
    const all = c.rows * c.cols, box = (k) => { const b = newestRects(c, k); return { x0: c.l + b.x0, y0: c.t + b.y0, x1: c.l + b.x1, y1: c.t + b.y1 }; };
    return { n: Math.min(TRACK, all), all, box, read: (k) => readNewest(c, k, grab), refit: () => refit(c), badMax: 6, single: c.rows === 1 };
  }
  if (!st.grid) {
    if (Date.now() < (st.retryAt || 0)) return null;
    if (!st.searching) { st.searching = true; say('Çerçevede sayı tablosu ve en yeni sayı aranıyor…'); return null; }   // yazi once gorunsun
    st.searching = false;
    if (Native.winRect) { const w = String(Native.winRect() || '').split(',').map(Number); st.win = w[2] > 0 ? w : null; }
    const img = decode(grab(c.l, c.t, c.w, c.h));
    if (!img) { say('Ekran görüntüsü alınamadı.'); return null; }
    if (dark(img)) { say(BLACK); return null; }
    const g = frameCells(img, c.newest, winMask(c), c.sw / 1080);
    if (!g) { st.retryAt = Date.now() + 2500; say('Çerçevede sayı tablosu bulunamadı. Oyunda geçmiş tablosunu açın; olmazsa “Bölge” ile tablonun çevresini çizin.'); return null; }
    st.grid = g; st.gridAt = Date.now(); st.tracker = null; st.first = null; st.bad = 0;
  }
  const g = st.grid, all = g.cells.length;
  if (st.tracker && Date.now() - st.gridAt > 5000) {                   // ara ara: tablo kaydi mi?
    st.gridAt = Date.now();
    if (scrolledAway(c, g, grab)) { st.grid = null; st.tracker = null; say('Tablo kaymış; en yeni sayı yeniden aranıyor…'); return null; }
  }
  const box = (k) => { const b = bbox(g.cells.slice(0, k)); return { x0: c.l + b.x0, y0: c.t + b.y0, x1: c.l + b.x1, y1: c.t + b.y1 }; };
  const refitF = () => { if (Date.now() - st.fixAt < 3000) return false; st.fixAt = Date.now(); st.grid = null; st.tracker = null; st.first = null; st.bad = 0; say('Sayılar okunamıyor; tablo yeniden aranıyor…'); return true; };
  return { n: Math.min(TRACK, all), all, box, read: (k) => frameRead(c, g, k, grab), refit: refitF, badMax: 3, single: g.rows === 1 };
}

/* ---------------- kucuk pencere ---------------- */
function render() {
  const s = activeSession(loadRoulette());
  if (!s) { $('#big').className = 'big unk'; $('#big').textContent = '—'; $('#info').innerHTML = 'Uygulamada bir oturum açın.'; $('#zones').innerHTML = ''; return; }
  const p = R.pending(s), k = R.stats(s), last = s.spins[s.spins.length - 1];
  const el = $('#big'); el.textContent = p ? p.predicted : '—'; el.className = 'big ' + (p ? R.color(p.predicted) : 'unk');
  if (st.shown !== -1 && st.shown !== s.spins.length && p) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  st.shown = s.spins.length;
  $('#info').innerHTML = `<b>★ ${k.hits}</b> / ${k.n}<br><small>${last ? (last.ph ? 'son tahmin tuttu ★' : `son gelen ${last.v}`) : 'sayı bekleniyor'}<br>bölge ${k.zhits} / ${k.n}</small>`;
  $('#zones').innerHTML = p ? p.zones.map((z) => `<div class="zone">${z.numbers.map((v) => ball(v, v === z.center ? 'center' : '')).join('')}</div>`).join('') : '';
  $('#run').textContent = st.running ? 'Durdur' : 'Başlat'; $('#run').className = st.running ? '' : 'primary'; peek();
}
function stop(msg) { st.running = false; st.tracker = null; st.first = null; st.peek = null; st.grid = null; st.searching = false; if (msg) say(msg); render(); }
function start() {
  if (!st.cfg) {                                         // "Geçmiş"te serit secildiyse takip icin de o kullanilir
    const h = read('hist', null);
    if (h && h.kind === 'strip') { st.cfg = { l: h.l, t: h.t, w: h.w, h: h.h, rows: 1, cols: h.cols, first: h.first, newest: h.newest, sw: h.sw, sh: h.sh }; write('screen', st.cfg); }
    else if (h && h.kind === 'grid') { st.cfg = { l: h.l, t: h.t, w: h.w, h: h.h, kind: 'frame', rows: h.rows, cols: h.cols, newest: h.newest, sw: h.sw, sh: h.sh }; write('screen', st.cfg); }
    else { openPicker(); return; }
  }
  st.running = true; st.tracker = null; st.first = null; st.saved = 0; st.imported = 0; st.bad = 0; st.fixAt = 0; st.peek = null; st.grid = null; st.searching = false; st.retryAt = 0;
  say('Başlatılıyor…'); render();
}
function tick() {
  if (st.mode === 'full' || st.busy) return;
  if (!st.running) { render(); return; }
  const c = st.cfg, size = (Native.screenSize() || '').split(',').map(Number);
  if (size[0] !== c.sw || size[1] !== c.sh) { stop('Ekran döndü ya da boyutu değişti. “Bölge” ile tabloyu yeniden seçin.'); return; }
  const s = activeSession(loadRoulette());
  if (!s) { say('Uygulamada bir rulet oturumu açın.'); return; }
  const grab = (l, t, w, h) => Native.grabRaw(l, t, w, h);
  st.busy = true;
  try {
    const L = layout(c, grab); if (!L) return;
    const n = L.n, cv = clearView(L.box(st.tracker ? n : Math.min(L.all, c.kind === 'frame' ? n : L.all)), c.sw, c.sh);
    if (cv === 'moved') { st.tracker = null; st.first = null; st.bad = 0; st.moved = true; say('Pencere okunan sayıların üstündeydi; kenara çekildi. Okuma sürüyor.'); return; }
    if (cv === 'blocked') { say('Pencere okunan sayıları kapatıyor; lütfen sürükleyip şeritten uzaklaştırın.'); return; }
    if (st.moved) { st.moved = false; st.fixAt = 0; if (c.kind !== 'frame' && L.refit()) return; }    // pencere kapatirken olculen serit duzeni yenilenir
    if (!st.tracker) {
      if (s.spins.length === 0 && L.all > 1) {          // bos oturum: tablodaki gecmis iki kez okunur, ayni cikanlar aktarilir
        const a = L.read(L.all);
        if (a === 'black') { say(BLACK); return; }
        if (!a) { say('Ekran görüntüsü alınamadı.'); return; }
        if (!st.first) { st.first = a; say('Tablodaki geçmiş okunuyor…'); return; }
        const vals = a.map((v, i) => (v === st.first[i] ? v : null)).slice(0, a.hiddenAt ?? a.length); st.first = null;
        if (vals[0] === null) { peek(); if (!L.refit()) say(L.single ? 'En yeni sayı okunamıyor. Pencere şeridin üstünü kapatmasın; olmazsa “Bölge” → şeride bir kez dokunun.' : 'En yeni sayı okunamıyor. “Bölge” ile tablonun çevresini yeniden çizin.'); return; }
        const good = vals.filter((v) => v !== null);
        withActive((x) => { for (const v of good.slice().reverse()) R.addSpin(x, v, true); });
        st.imported = good.length; st.tracker = new Tracker(vals.slice(0, n));
        say(`${good.length} sayı geçmiş olarak aktarıldı${vals.length - good.length ? ` (${vals.length - good.length} hücre okunamadı)` : ''}. Yeni sayılar bekleniyor.`);
      } else st.tracker = new Tracker();
      render(); return;
    }
    const vals = L.read(n);
    if (vals === 'black') { say(BLACK); return; }
    if (!vals) { say('Ekran görüntüsü alınamadı.'); return; }
    const r = st.tracker.feed(vals); peek();
    st.bad = r.state === 'unreadable' || r.state === 'mismatch' || vals[0] === null ? st.bad + 1 : 0;
    if (st.bad >= L.badMax && L.refit()) return;
    if (r.fresh.length) {
      withActive((x) => { for (const v of r.fresh) R.addSpin(x, v); });
      st.saved += r.fresh.length; say(`Yeni sayı: ${r.fresh.join(', ')} · toplam ${st.saved} yeni sayı`); render();
    } else if (r.state === 'unreadable') say('Sayılar şu an okunamıyor. Pencere sayıların üstünü kapatmasın.');
    else if (r.state === 'resync') say('Sıra eşleşmedi; arada tur kaçmış olabilir. Sıra yeniden başlatıldı.');
    else if (r.state === 'started') {                    // okuma durmusken gelen sayilar varsa eklenir
      const m = withActive((x) => R.mergeHistory(x, vals)), k = m && !m.error ? m.fresh + m.old : 0; if (k) render();
      say(`Okuma başladı${k ? ` (${k} eksik sayı eklendi)` : ''}. Yeni sayılar bekleniyor.`);
    }
    else if (r.state === 'same' && !st.status.startsWith('Yeni') && !st.status.includes('aktarıldı')) say(`Okunuyor: ${vals.map((v) => v ?? '?').join(' ')}`);
  } catch (e) { say('Hata: ' + e.message); } finally { st.busy = false; }
}

/* ---------------- bolge secimi ---------------- */
function openPicker(hist = false) {
  const was = st.running; st.running = false;
  setMode('full'); document.body.classList.toggle('hist', hist);
  const src = hist ? read('hist', null) : st.cfg;
  const p = st.pick = { rect: null, rows: src?.rows ?? (hist ? 1 : 9), cols: src?.cols ?? (hist ? 14 : 10), first: src?.first ?? (hist ? 1.6 : 1), newest: src?.newest ?? 'first', results: null, was, hist, kind: src?.kind ?? 'grid' };
  $('#testb').textContent = hist ? 'Oku' : 'Dene'; $('#saveb').textContent = hist ? 'Ekle' : 'Kaydet';
  $('#hint').textContent = 'Ekran görüntüsü alınıyor…';
  setTimeout(() => {
    if (shoot() && src && src.sw === p.iw && src.sh === p.ih) p.rect = { l: src.l, t: src.t, w: src.w, h: src.h };
    draw(); if (p.rect && (hist || p.kind === 'frame')) histRead();          // son secilen yer hemen okunur (tablo kaydirildiysa yeni sayfa)
  }, 60);
}
/** Gecmis: secili yerdeki butun sayilari okur. Tablo ise satir/sutun duzeni goruntuden olculur; tek sira ise serit duzeni kullanilir. */
function histRead() {
  const p = st.pick, r = p.rect; if (!r) return;
  $('#hint').textContent = 'Okunuyor…';
  setTimeout(() => {
    const img = decode(Native.grabFrozen(r.l, r.t, r.w, r.h));
    if (!img) { $('#hint').textContent = 'Bölge okunamadı.'; return; }
    let cells = null;
    if (p.kind === 'strip') cells = newestRects({ l: 0, t: 0, w: r.w, h: r.h, rows: 1, cols: p.cols, first: p.first, newest: p.newest }, p.cols).rects;
    else { const g = frameCells(img, p.newest, null, p.iw / 1080); if (g) { cells = g.cells; p.cols = g.cols; } }
    if (!cells || !cells.length) { p.cells = null; p.results = null; p.histVals = null; draw(); $('#hint').textContent = 'Burada düzenli bir sayı tablosu bulunamadı. Sayıların olduğu yeri biraz daha geniş çerçeveleyin.'; return; }
    const vals = readRects(img, { rects: cells, x0: 0, y0: 0 });
    p.cells = cells; p.histVals = vals; p.force = false; p.results = vals.map((v, i) => ({ v, c: cells[i] }));
    p.rows = new Set(cells.map((c) => c.y0)).size; draw();
    const ok = vals.filter((v) => v !== null).length, bad = vals.length - ok;
    if (!p.hist) { $('#hint').textContent = vals[0] === null ? 'En yeni sayı okunamadı. Tablonun çevresini biraz daha geniş çizin.'
      : `Tablo bulundu: ${ok} sayı okundu. Yeşil kutu en yeni sayı (${vals[0]}). Doğruysa “Kaydet”e dokunun. Tablo kayarsa ya da başka masada farklı yerde açılırsa en yeni sayıyı çerçeve içinde kendisi bulur.`; return; }
    $('#hint').textContent = ok ? `${ok} sayı okundu${bad ? ` (${bad} hücre okunamadı, atlanacak)` : ''}. Sayılar doğruysa “Ekle”ye dokunun. Tablonun devamı için: ekleyin, oyunda tabloyu kaydırın, yine “Geçmiş”e dokunun.`
      : 'Burada sayı okunamadı. Sayıların olduğu yeri çerçeveleyin ya da tek sıralık şeride dokunun.';
  }, 30);
}
function histSave() {
  const p = st.pick;
  if (!p.histVals || !p.histVals.some((v) => v !== null)) { $('#hint').textContent = 'Önce sayıların olduğu yeri seçin.'; return; }
  const r = withActive((s) => { const m = R.mergeHistory(s, p.histVals, p.force); return { ...m, total: s.spins.length }; });
  if (!r) { $('#hint').textContent = 'Uygulamada bir rulet oturumu açın.'; return; }
  if (r.error) { p.force = true; $('#hint').textContent = 'Bu sayılar kayıtlı sayılarla eşleşmedi (ortak sıra bulunamadı). Yine de kayıtlıların öncesine eklemek için “Ekle”ye bir daha dokunun; emin değilseniz “İptal”.'; return; }
  write('hist', { ...p.rect, kind: p.kind, rows: p.rows, cols: p.cols, first: p.first, newest: p.newest, sw: p.iw, sh: p.ih });
  closePicker(); st.tracker = null; st.first = null;
  const k = r.old + r.fresh;
  say(k ? `Geçmiş eklendi: ${k} sayı${r.skipped ? `, ${r.skipped} okunamayan atlandı` : ''}. Oturumda ${r.total} sayı var.` : 'Bu sayılar zaten kayıtlı. Tablonun devamı için oyunda tabloyu kaydırıp yine “Geçmiş”e dokunun.');
  render();
}
function closePicker() { const p = st.pick; setMode('mini'); document.body.classList.remove('hist'); st.pick = null; if (p) st.running = p.was; }
function shoot() {
  const p = st.pick, s = Native.screenshot();
  if (!s) { $('#hint').textContent = 'Ekran görüntüsü alınamadı. Yüzen pencereyi kapatıp yeniden açın.'; return false; }
  const i = s.indexOf(','), j = s.indexOf(',', i + 1);
  p.iw = Number(s.slice(0, i)); p.ih = Number(s.slice(i + 1, j));
  const vw = window.innerWidth, vh = window.innerHeight;
  p.scale = Math.min(vw / p.iw, vh / p.ih); p.ox = (vw - p.iw * p.scale) / 2; p.oy = (vh - p.ih * p.scale) / 2;
  const img = $('#shot'); img.src = s.slice(j + 1); img.style.cssText = `left:${p.ox}px;top:${p.oy}px;width:${p.iw * p.scale}px;height:${p.ih * p.scale}px`;
  const cv = $('#cv'), dpr = window.devicePixelRatio || 1; cv.width = vw * dpr; cv.height = vh * dpr; cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  return true;
}
function draw() {
  const p = st.pick, cv = $('#cv'), g = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
  $('#rows').textContent = p.rows; $('#cols').textContent = p.cols; $('#first').textContent = p.first.toFixed(2).replace('.', ','); $('#firstbox').style.display = p.rows === 1 ? '' : 'none';
  $('#newest').textContent = 'En yeni: ' + (p.rows === 1 ? (p.newest === 'first' ? 'solda' : 'sağda') : (p.newest === 'first' ? 'sol üst' : 'sağ alt'));
  $('#preset').textContent = p.rows === 1 ? 'Tablo' : 'Tek sıra';
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  for (const el of document.querySelectorAll('.only1')) el.style.display = p.rows === 1 ? '' : 'none'; $('#rowbox').style.display = p.rows === 1 ? 'none' : '';
  if (!p.rect && p.hist) { $('#hint').textContent = 'Geçmişi okumak için: sayı tablosunu parmakla çerçeveleyin ya da tek sıralık şeride bir kez dokunun. Ne seçerseniz oradaki bütün sayılar okunur.'; return; }
  if (!p.rect) { $('#hint').textContent = p.rows === 1 ? 'Sayıların olduğu şeride parmağınızla BİR KEZ DOKUNUN; yerini program kendisi bulur.' : 'Parmağınızla geçmiş tablosunun çevresine kabaca bir çerçeve çizin; satırları, sütunları ve en yeni sayıyı program kendisi bulur. Tek sıralık şerit için şeride bir kez dokunun.'; return; }
  const X = (x) => p.ox + x * p.scale, Y = (y) => p.oy + y * p.scale, r = p.rect, rects = p.cells || cellRects({ ...r, rows: p.rows, cols: p.cols, first: p.first, newest: p.newest });
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, cv.width, cv.height); g.clearRect(X(r.l), Y(r.t), r.w * p.scale, r.h * p.scale);
  g.strokeStyle = '#f2c94c'; g.lineWidth = 2; g.strokeRect(X(r.l), Y(r.t), r.w * p.scale, r.h * p.scale);
  g.lineWidth = 1; g.beginPath();
  for (const c of rects) { g.moveTo(X(r.l + c.x1), Y(r.t + c.y0)); g.lineTo(X(r.l + c.x1), Y(r.t + c.y1)); g.moveTo(X(r.l + c.x0), Y(r.t + c.y1)); g.lineTo(X(r.l + c.x1), Y(r.t + c.y1)); }
  g.stroke();
  if (p.cells && p.results && p.results[0]?.v != null) { const c0 = p.cells[0]; g.strokeStyle = '#58e08f'; g.lineWidth = 3; g.strokeRect(X(r.l + c0.x0) + 1, Y(r.t + c0.y0) + 1, (c0.x1 - c0.x0) * p.scale - 2, (c0.y1 - c0.y0) * p.scale - 2); }
  if (p.rows === 1 && !p.cells) zoom(g, p, rects);
  if (p.results) {
    const ch = (rects[0].y1 - rects[0].y0) * p.scale, below = p.rows === 1;
    g.font = `700 ${Math.max(10, Math.min(15, below ? 14 : ch * 0.42))}px monospace`; g.textAlign = below ? 'center' : 'right'; g.textBaseline = 'top';
    p.results.forEach(({ v, c }) => { g.fillStyle = v === null ? '#ff5d52' : '#58e08f'; const t = v === null ? '?' : String(v);
      if (below) g.fillText(t, X(r.l + (c.x0 + c.x1) / 2), Y(r.t + c.y1) + 3); else g.fillText(t, X(r.l + c.x1) - 2, Y(r.t + c.y0) + 1); });
    const ok = p.results.filter((x) => x.v !== null).length;
    $('#hint').textContent = `${p.results.length} hücreden ${ok} tanesi okundu (yeşil: okunan sayı). ` + (p.results[0].v === null ? 'En yeni sayı okunamadı: çerçeveyi, sütun sayısını ya da ilk kutu genişliğini düzeltin.' : 'Sayılar doğruysa “Kaydet”e dokunun.');
  } else $('#hint').textContent = p.rows === 1 ? 'Sarı çizgiler sayıların arasından geçmeli. Sütun sayısını ve (en yeni sayı daha geniş kutudaysa) “İlk kutu” genişliğini ayarlayıp “Dene”ye dokunun.'
    : 'Sarı çizgiler sayıların arasından geçmeli. Satır ve sütun sayısını ayarlayıp “Dene”ye dokunun.';
}
/** Tek sira: seridin ilk kutularini buyuterek gosterir; cizgilerin sayilarin arasindan gectigi rahatca gorulur. */
function zoom(g, p, rects) {
  const r = p.rect, vw = window.innerWidth, n = Math.min(7, rects.length), list = rects.slice().sort((a, b) => a.x0 - b.x0), part = p.newest === 'first' ? list.slice(0, n) : list.slice(-n);
  const sx = r.l + part[0].x0, sw = part[n - 1].x1 - part[0].x0, m = Math.round(r.h * 0.4), z = vw / sw, dh = (r.h + 2 * m) * z;
  const ry = p.oy + r.t * p.scale, dy = ry < window.innerHeight / 2 ? ry + r.h * p.scale + 46 : ry - dh - 46;
  try { g.drawImage($('#shot'), sx, r.t - m, sw, r.h + 2 * m, 0, dy, vw, dh); } catch (e) { return; }
  g.strokeStyle = '#f2c94c'; g.lineWidth = 2; g.strokeRect(1, dy + m * z, vw - 2, r.h * z); g.lineWidth = 1; g.beginPath();
  for (const c of part.slice(0, -1)) { const x = (r.l + c.x1 - sx) * z; g.moveTo(x, dy + m * z); g.lineTo(x, dy + (m + r.h) * z); }
  g.stroke(); g.strokeStyle = '#ffffff55'; g.strokeRect(0.5, dy + 0.5, vw - 1, dh - 1);
  if (p.results) { g.font = '700 17px monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
    for (const { v, c } of p.results) { if (!part.includes(c)) continue; g.fillStyle = '#000a'; const x = (r.l + (c.x0 + c.x1) / 2 - sx) * z; g.fillRect(x - 15, dy + dh - 21, 30, 20); g.fillStyle = v === null ? '#ff5d52' : '#58e08f'; g.fillText(v === null ? '?' : String(v), x, dy + dh - 19); } }
}
function test() {
  if (st.pick.hist || st.pick.kind === 'frame') { histRead(); return; }
  const p = st.pick, c = { ...p.rect, rows: p.rows, cols: p.cols, first: p.first, newest: p.newest }, n = p.rows * p.cols, v = readNewest(c, n, (l, t, w, h) => Native.grabFrozen(l, t, w, h));
  if (Array.isArray(v)) { const rects = newestRects(c, n).rects; p.results = v.map((x, i) => ({ v: x, c: rects[i] })); draw(); }
  else { p.results = null; draw(); $('#hint').textContent = v === 'black' ? BLACK : 'Bölge okunamadı.'; }
}
/** Tek sira: y yuksekligine dokunuldu (ya da "Hizala") -> tam genislikte serit, dikey yeri otomatik bulunur, ardindan denenir. */
function autoStrip(y) {
  const p = st.pick, k = p.iw / 1080, h = p.rect && y === null ? p.rect.h : Math.round(50 * k), keep = p.rect && y === null;
  const base = keep ? { ...p.rect } : { l: 0, w: p.iw, t: Math.round(y - h / 2), h };
  $('#hint').textContent = 'Şerit aranıyor…';
  setTimeout(() => {
    const a = findStrip({ ...base, rows: 1, cols: p.cols, first: p.first, newest: p.newest }, p.iw, p.ih, (l, t, w, hh) => Native.grabFrozen(l, t, w, hh));
    if (a === 'black') { p.rect = base; p.results = null; draw(); $('#hint').textContent = BLACK; return; }
    if (a) { p.rect = { l: a.l, w: a.w, t: a.t, h: a.h }; p.cols = a.cols; p.first = a.first; p.kind = 'strip'; p.cells = null; test(); } else p.rect = base;
    if (a) return; else { p.results = null; draw(); $('#hint').textContent = 'Burada sayı şeridi bulunamadı. Tam sayıların üstüne dokunun; olmazsa ▲ ▼ ile sarı kutuyu sayıların üstüne getirip “Dene”ye dokunun.'; }
  }, 30);
}
function bindPicker() {
  const cv = $('#cv'); let a = null;
  const pos = (e) => { const p = st.pick; return { x: Math.max(0, Math.min(p.iw, (e.clientX - p.ox) / p.scale)), y: Math.max(0, Math.min(p.ih, (e.clientY - p.oy) / p.scale)) }; };
  let moved = false, keep = null;
  cv.addEventListener('pointerdown', (e) => { if (!st.pick?.iw) return; a = pos(e); moved = false; keep = st.pick.rect; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!a) return; const b = pos(e), p = st.pick;
    if (!moved && Math.hypot(a.x - b.x, a.y - b.y) * p.scale < 14) return; moved = true;
    p.rect = { l: Math.round(Math.min(a.x, b.x)), t: Math.round(Math.min(a.y, b.y)), w: Math.round(Math.abs(a.x - b.x)), h: Math.round(Math.abs(a.y - b.y)) }; p.results = null; p.cells = null; p.histVals = null; draw();
  });
  cv.addEventListener('pointerup', () => { const p = st.pick, at = a; a = null; if (!at || !p) return;
    if (!moved) { if (p.rows !== 1 || p.cells) { p.rows = 1; p.cols = 14; p.first = 1.6; p.cells = null; } autoStrip(at.y); return; }   // tek dokunus her zaman serit arar
    if (p.rect && (p.rect.w < 12 || p.rect.h < 8)) { p.rect = keep; draw(); return; }
    p.kind = p.hist ? 'grid' : 'frame'; histRead(); });
  $('#bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const p = st.pick, act = b.dataset.a;
    if (/^[rc][-+]$/.test(act) && p.kind === 'frame') { p.kind = 'manual'; p.cells = null; }   // elle satir/sutun: sabit hucreler
    if (act === 'r-' || act === 'r+') p.rows = Math.max(1, Math.min(14, p.rows + (act === 'r+' ? 1 : -1)));
    else if (act === 'c-' || act === 'c+') p.cols = Math.max(1, Math.min(14, p.cols + (act === 'c+' ? 1 : -1)));
    else if (act === 'f-' || act === 'f+') p.first = Math.round(Math.max(1, Math.min(3, p.first + (act === 'f+' ? 0.05 : -0.05))) * 100) / 100;
    else if (act === 'preset') { p.cells = null; p.kind = p.rows === 1 ? 'frame' : 'strip'; if (p.rows === 1) { p.rows = 9; p.cols = 10; p.first = 1; } else { p.rows = 1; p.cols = 14; p.first = 1.6; } }
    else if (act === 'up' || act === 'down' || act === 'thin' || act === 'thick') { if (!p.rect) return; const k = Math.max(1, Math.round(p.iw / 540)), r = p.rect;
      if (act === 'up') r.t = Math.max(0, r.t - k); else if (act === 'down') r.t = Math.min(p.ih - r.h, r.t + k); else if (act === 'thin') { if (r.h > 12) { r.h -= 2 * k; r.t += k; } } else { r.h += 2 * k; r.t = Math.max(0, r.t - k); } }
    else if (act === 'align') { if (p.rect) autoStrip(null); return; }
    else if (act === 'newest') { p.newest = p.newest === 'first' ? 'last' : 'first'; if (p.hist || p.kind === 'frame') { histRead(); return; } }
    else if (act === 'flip') { $('#bar').classList.toggle('up'); return; }
    else if (act === 'cancel') { closePicker(); render(); return; }
    else if (act === 'test') {
      if (!p.rect) return; $('#hint').textContent = 'Okunuyor…';
      setTimeout(() => { if (shoot()) test(); }, 30);
      return;
    } else if (act === 'save') {
      if (p.hist) { histSave(); return; }
      if (!p.rect) { $('#hint').textContent = 'Önce tabloyu çerçeveleyin.'; return; }
      if (p.kind === 'frame' && !p.cells) { $('#hint').textContent = 'Önce tablonun çevresini çizin; tablo bulunduktan sonra “Kaydet”.'; return; }
      st.cfg = p.kind === 'frame' ? { ...p.rect, kind: 'frame', rows: p.rows, cols: p.cols, newest: p.newest, sw: p.iw, sh: p.ih }
        : { ...p.rect, rows: p.rows, cols: p.cols, first: p.rows === 1 ? p.first : 1, newest: p.newest, sw: p.iw, sh: p.ih, ...(p.rows > 1 ? { kind: 'manual' } : {}) };
      write('screen', st.cfg); st.grid = null;
      closePicker(); st.running = false; say('Bölge kaydedildi. “Başlat”a dokunun.'); render(); return;
    }
    if (act !== 'test') p.results = null;
    draw();
  });
}

/* ---------------- baslangic ---------------- */
$('#region').onclick = () => openPicker(false);
$('#hist').onclick = () => openPicker(true);
$('#run').onclick = () => (st.running ? stop('Okuma durduruldu.') : start());
$('#close').onclick = () => Native.stopCapture();
$('#top').onclick = () => setMode(st.mode === 'ball' ? 'mini' : 'ball');
bindPicker();
window.AADO = { onScreen: () => { if (st.mode === 'full') closePicker(); } };
say(st.cfg ? '“Başlat”a dokunun. Pencereyi üst çubuğundan sürükleyebilirsiniz.' : 'Oyunu açın, sonra “Bölge”ye dokunup sayıların olduğu tabloyu seçin.');
render(); setInterval(tick, 400);
