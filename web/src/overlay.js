// Yuzen pencere: bolge secimi, ekrandan sayi okuma, takip ve tahmin gosterimi. Oyunun ustunde durur.
import * as R from './roulette.js';
import { fromRGBA } from './digits.js';
import { cellRects, newestRects, readRects } from './geom.js';
import { Tracker, TRACK } from './tracker.js';
import { loadRoulette, activeSession, withActive, read, write } from './store.js';
import { $, ball, Native } from './ui.js';

const st = { mode: 'mini', cfg: read('screen', null), running: false, tracker: null, first: null, saved: 0, imported: 0, status: '', shown: -1, busy: false,
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
  return readRects(img, box);
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
  $('#run').textContent = st.running ? 'Durdur' : 'Başlat'; $('#run').className = st.running ? '' : 'primary';
}
function stop(msg) { st.running = false; st.tracker = null; st.first = null; if (msg) say(msg); render(); }
function start() {
  if (!st.cfg) { openPicker(); return; }
  st.running = true; st.tracker = null; st.first = null; st.saved = 0; st.imported = 0;
  say('Başlatılıyor…'); render();
}
function tick() {
  if (st.mode === 'full' || st.busy) return;
  if (!st.running) { render(); return; }
  const c = st.cfg, size = (Native.screenSize() || '').split(',').map(Number);
  if (size[0] !== c.sw || size[1] !== c.sh) { stop('Ekran döndü ya da boyutu değişti. “Bölge” ile tabloyu yeniden seçin.'); return; }
  const s = activeSession(loadRoulette());
  if (!s) { say('Uygulamada bir rulet oturumu açın.'); return; }
  const n = Math.min(TRACK, c.rows * c.cols), grab = (l, t, w, h) => Native.grabRaw(l, t, w, h);
  st.busy = true;
  try {
    if (!st.tracker) {
      if (s.spins.length === 0 && c.rows * c.cols > 1) {          // bos oturum: tablodaki gecmis iki kez okunur, ayni cikanlar aktarilir
        const a = readNewest(c, c.rows * c.cols, grab);
        if (a === 'black') { say(BLACK); return; }
        if (!a) { say('Ekran görüntüsü alınamadı.'); return; }
        if (!st.first) { st.first = a; say('Tablodaki geçmiş okunuyor…'); return; }
        const vals = a.map((v, i) => (v === st.first[i] ? v : null)); st.first = null;
        if (vals[0] === null) { say('En yeni sayı okunamıyor. “Bölge” ile tabloyu yeniden seçin.'); return; }
        const good = vals.filter((v) => v !== null);
        withActive((x) => { for (const v of good.slice().reverse()) R.addSpin(x, v, true); });
        st.imported = good.length; st.tracker = new Tracker(vals.slice(0, n));
        say(`${good.length} sayı geçmiş olarak aktarıldı${vals.length - good.length ? ` (${vals.length - good.length} hücre okunamadı)` : ''}. Yeni sayılar bekleniyor.`);
      } else st.tracker = new Tracker();
      render(); return;
    }
    const vals = readNewest(c, n, grab);
    if (vals === 'black') { say(BLACK); return; }
    if (!vals) { say('Ekran görüntüsü alınamadı.'); return; }
    const r = st.tracker.feed(vals);
    if (r.fresh.length) {
      withActive((x) => { for (const v of r.fresh) R.addSpin(x, v); });
      st.saved += r.fresh.length; say(`Yeni sayı: ${r.fresh.join(', ')} · toplam ${st.saved} yeni sayı`); render();
    } else if (r.state === 'unreadable') say('Sayılar şu an okunamıyor. Pencere tablonun üstünü kapatmasın.');
    else if (r.state === 'resync') say('Sıra eşleşmedi; arada tur kaçmış olabilir. Sıra yeniden başlatıldı.');
    else if (r.state === 'started') say('Okuma başladı. Yeni sayılar bekleniyor.');
    else if (r.state === 'same' && !st.status.startsWith('Yeni') && !st.status.includes('aktarıldı')) say(`Okunuyor: ${vals.map((v) => v ?? '?').join(' ')}`);
  } catch (e) { say('Hata: ' + e.message); } finally { st.busy = false; }
}

/* ---------------- bolge secimi ---------------- */
function openPicker() {
  const was = st.running; st.running = false;
  setMode('full');
  const p = st.pick = { rect: null, rows: st.cfg?.rows ?? 9, cols: st.cfg?.cols ?? 10, first: st.cfg?.first ?? 1, newest: st.cfg?.newest ?? 'first', results: null, was };
  $('#hint').textContent = 'Ekran görüntüsü alınıyor…';
  setTimeout(() => { if (shoot() && st.cfg && st.cfg.sw === p.iw && st.cfg.sh === p.ih) { p.rect = { l: st.cfg.l, t: st.cfg.t, w: st.cfg.w, h: st.cfg.h }; } draw(); }, 60);
}
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
  $('#rows').textContent = p.rows; $('#cols').textContent = p.cols; $('#first').textContent = p.first.toFixed(1).replace('.', ','); $('#firstbox').style.display = p.rows === 1 ? '' : 'none';
  $('#newest').textContent = 'En yeni: ' + (p.rows === 1 ? (p.newest === 'first' ? 'solda' : 'sağda') : (p.newest === 'first' ? 'sol üst' : 'sağ alt'));
  $('#preset').textContent = p.rows === 1 ? 'Tablo' : 'Tek sıra';
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  if (!p.rect) { $('#hint').textContent = 'Parmağınızla sayıların olduğu tabloyu ya da tek sıralık şeridi çerçeveleyin. Şerit için “Tek sıra”ya dokunun.'; return; }
  const X = (x) => p.ox + x * p.scale, Y = (y) => p.oy + y * p.scale, r = p.rect, rects = cellRects({ ...r, rows: p.rows, cols: p.cols, first: p.first, newest: p.newest });
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, 0, cv.width, cv.height); g.clearRect(X(r.l), Y(r.t), r.w * p.scale, r.h * p.scale);
  g.strokeStyle = '#f2c94c'; g.lineWidth = 2; g.strokeRect(X(r.l), Y(r.t), r.w * p.scale, r.h * p.scale);
  g.lineWidth = 1; g.beginPath();
  for (const c of rects) { g.moveTo(X(r.l + c.x1), Y(r.t + c.y0)); g.lineTo(X(r.l + c.x1), Y(r.t + c.y1)); g.moveTo(X(r.l + c.x0), Y(r.t + c.y1)); g.lineTo(X(r.l + c.x1), Y(r.t + c.y1)); }
  g.stroke();
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
function bindPicker() {
  const cv = $('#cv'); let a = null;
  const pos = (e) => { const p = st.pick; return { x: Math.max(0, Math.min(p.iw, (e.clientX - p.ox) / p.scale)), y: Math.max(0, Math.min(p.ih, (e.clientY - p.oy) / p.scale)) }; };
  cv.addEventListener('pointerdown', (e) => { if (!st.pick?.iw) return; a = pos(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!a) return; const b = pos(e), p = st.pick;
    p.rect = { l: Math.round(Math.min(a.x, b.x)), t: Math.round(Math.min(a.y, b.y)), w: Math.round(Math.abs(a.x - b.x)), h: Math.round(Math.abs(a.y - b.y)) }; p.results = null; draw();
  });
  cv.addEventListener('pointerup', () => { a = null; const p = st.pick; if (p.rect && (p.rect.w < 12 || p.rect.h < 8)) { p.rect = null; draw(); } });
  $('#bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const p = st.pick, act = b.dataset.a;
    if (act === 'r-' || act === 'r+') p.rows = Math.max(1, Math.min(14, p.rows + (act === 'r+' ? 1 : -1)));
    else if (act === 'c-' || act === 'c+') p.cols = Math.max(1, Math.min(14, p.cols + (act === 'c+' ? 1 : -1)));
    else if (act === 'f-' || act === 'f+') p.first = Math.round(Math.max(1, Math.min(3, p.first + (act === 'f+' ? 0.1 : -0.1))) * 10) / 10;
    else if (act === 'preset') { if (p.rows === 1) { p.rows = 9; p.cols = 10; p.first = 1; } else { p.rows = 1; p.cols = 14; p.first = 1.6; } }
    else if (act === 'newest') p.newest = p.newest === 'first' ? 'last' : 'first';
    else if (act === 'flip') { $('#bar').classList.toggle('up'); return; }
    else if (act === 'cancel') { setMode('mini'); st.pick = null; render(); return; }
    else if (act === 'test') {
      if (!p.rect) return; $('#hint').textContent = 'Okunuyor…';
      setTimeout(() => {
        if (!shoot()) return;
        const c = { ...p.rect, rows: p.rows, cols: p.cols, first: p.first, newest: p.newest }, n = p.rows * p.cols, v = readNewest(c, n, (l, t, w, h) => Native.grabFrozen(l, t, w, h));
        if (Array.isArray(v)) { const rects = newestRects(c, n).rects; p.results = v.map((x, i) => ({ v: x, c: rects[i] })); draw(); }
        else { p.results = null; draw(); $('#hint').textContent = v === 'black' ? BLACK : 'Bölge okunamadı.'; }
      }, 30);
      return;
    } else if (act === 'save') {
      if (!p.rect) { $('#hint').textContent = 'Önce tabloyu çerçeveleyin.'; return; }
      st.cfg = { ...p.rect, rows: p.rows, cols: p.cols, first: p.rows === 1 ? p.first : 1, newest: p.newest, sw: p.iw, sh: p.ih }; write('screen', st.cfg);
      setMode('mini'); st.pick = null; say('Bölge kaydedildi. “Başlat”a dokunun.'); render(); return;
    }
    if (act !== 'test') p.results = null;
    draw();
  });
}

/* ---------------- baslangic ---------------- */
$('#region').onclick = openPicker;
$('#run').onclick = () => (st.running ? stop('Okuma durduruldu.') : start());
$('#close').onclick = () => Native.stopCapture();
$('#top').onclick = () => setMode(st.mode === 'ball' ? 'mini' : 'ball');
bindPicker();
window.AADO = { onScreen: () => { if (st.mode === 'full') { setMode('mini'); st.pick = null; } } };
say(st.cfg ? '“Başlat”a dokunun. Pencereyi üst çubuğundan sürükleyebilirsiniz.' : 'Oyunu açın, sonra “Bölge”ye dokunup sayıların olduğu tabloyu seçin.');
render(); setInterval(tick, 400);
