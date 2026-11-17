// Ana uygulama (telefon). Rulet tamamen telefonda calisir; futbol ve basketbol sonraki surumlerde eklenecek.
import * as R from './roulette.js';
import { loadRoulette, saveRoulette, activeSession, newSession, withActive, read } from './store.js';
import { $, esc, pct, num, ball, Native } from './ui.js';
import { viewBasket } from './basketui.js';
import { viewFootball } from './footballui.js';
import { onHttp } from './net.js';

const VERSION = '0.5.0';
const st = { view: 'roulette', db: null, lastPred: undefined, armed: null, cap: 'off' };
const TITLES = { roulette: 'Rulet', football: 'Futbol', basket: 'Basketbol', settings: 'Ayarlar' };

function toast(msg, ms = 3500) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); }
/** Iki kez dokununca calisan tehlikeli islem dugmesi. */
function confirmTap(btn, label, fn) {
  if (st.armed === btn.id) { st.armed = null; fn(); return; }
  st.armed = btn.id; const old = btn.textContent; btn.textContent = label;
  setTimeout(() => { if (st.armed === btn.id) { st.armed = null; btn.textContent = old; } }, 3000);
}
function setView(v) {
  st.view = v; $('#title').textContent = TITLES[v];
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  ({ roulette: viewRoulette, football: () => viewFootball(toast), basket: () => viewBasket(toast), settings: viewSettings })[v]();
  $('#main').scrollTop = 0;
}

/* ---------------- rulet ---------------- */
function viewRoulette() {
  st.db = loadRoulette(); st.cap = Native?.captureState ? Native.captureState() : 'none';
  const db = st.db, s = activeSession(db);
  const head = `<div class="row" style="margin-bottom:12px">
      <select id="sess" class="grow">${db.sessions.map((x) => `<option value="${x.id}" ${x.id === db.active ? 'selected' : ''}>${esc(x.name)} · ${x.spins.length} sayı</option>`).join('') || '<option>Oturum yok</option>'}</select>
      <button id="new">Yeni oturum</button></div>`;
  if (!s) {
    $('#main').innerHTML = head + `<div class="card"><h2>Başlamak için</h2><p class="muted">“Yeni oturum”a dokunun. Oturum, bir masadaki sayıların tutulduğu defter sayfasıdır. Sayıları elle girebilir ya da program ekrandan kendisi okuyabilir.</p></div>${honest()}`;
    bindHead(); return;
  }
  const p = R.pending(s), k = R.stats(s), last = s.spins[s.spins.length - 1], hc = R.hotCold(s);
  const why = !p ? 'İlk sayı gelince tahmin burada görünür.' : p.basis === 'follower'
    ? `Bu oturumda <b>${p.basedOn}</b> sayısından sonra en çok <b>${p.predicted}</b> geldi (${p.baseN} seferin ${p.support}’i).`
    : `<b>${p.basedOn}</b> sayısından sonra ne geldiği henüz bilinmiyor; oturumda en sık çıkan sayı gösteriliyor (${p.baseN} turun ${p.support}’i).`;
  const lastTxt = last && last.p !== undefined ? (last.ph ? `<span class="hit">★ Son tahmin tuttu: ${last.p}</span>` : `Son tahmin ${last.p} idi, gelen ${last.v}${last.zh ? ' (komşu bölgesi tuttu)' : ''}.`) : '';
  const fresh = p && st.lastPred !== undefined && st.lastPred !== s.spins.length;
  st.lastPred = s.spins.length;
  $('#main').innerHTML = head + `
  <div class="card"><h2>Programın tahmini <span class="tag">geçmiş dökümü, garanti değil</span></h2>
    <div class="pred"><div class="big ${p ? R.color(p.predicted) : 'unk'} ${fresh ? 'pop' : ''}">${p ? p.predicted : '—'}</div><div><div>${why}</div><div class="muted" style="margin-top:6px">${lastTxt}</div></div></div>
  </div>
  <div class="card"><h2>Sayı gir <button id="undo" ${s.spins.length ? '' : 'disabled'} style="min-height:34px;padding:4px 12px">Geri al</button></h2>
    <div class="pad" id="pad"><button class="zero green" data-n="0">0</button>${Array.from({ length: 36 }, (_, i) => `<button class="${R.color(i + 1)}" data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
  </div>
  ${p ? `<div class="card"><h2>Sıcak komşu bölgeleri <span class="tag">merkez ± 2 komşu</span></h2>
    ${p.zones.map((z, i) => `<div class="zone"><b>${i + 1}.</b>${z.numbers.map((v) => ball(v, v === z.center ? 'center' : '')).join('')}</div>`).join('')}</div>` : ''}
  <div class="card"><h2>Karne</h2>
    <div class="tiles"><div class="tile"><span>Tahmin</span><b>${k.n}</b></div><div class="tile gold"><span>Tutan ★</span><b>${k.hits}</b></div><div class="tile"><span>Şansla beklenen</span><b>${num(k.expected)}</b></div>
      <div class="tile"><span>Bölge tuttu</span><b>${k.zhits}</b></div><div class="tile"><span>Şansla beklenen</span><b>${num(k.zexpected)}</b></div><div class="tile"><span>Toplam sayı</span><b>${k.total}</b></div></div>
    <p class="muted" style="margin:10px 0 0">Çarkın hafızası yoktur: hangi sayı gösterilirse gösterilsin tutma şansı ${pct(R.CHANCE)}’dir; üç bölge 15 sayı kaplar ve şansla ${pct(R.ZONE_CHANCE)} tutar. “Tutan” sayısı “Şansla beklenen”e yakınsa tahmin rastgele seçimden farklı değildir.</p>
  </div>
  ${screenCard()}
  <div class="card"><h2>Geçmiş <span class="tag">en yeni başta</span></h2>
    <div class="hist">${s.spins.slice(-80).reverse().map((x) => ball(x.v, (x.ph ? 'star ' : '') + (x.imp ? 'imp' : ''))).join('') || '<span class="muted">Henüz sayı yok.</span>'}</div>
    ${s.spins.length ? `<p class="muted" style="margin:12px 0 4px">En çok çıkanlar</p><div class="row">${hc.hot.map((x) => ball(x.v) + `<small class="muted">×${x.n}</small>`).join('')}</div>
    <p class="muted" style="margin:10px 0 4px">En az çıkanlar</p><div class="row">${hc.cold.map((x) => ball(x.v) + `<small class="muted">×${x.n}</small>`).join('')}</div>` : ''}
    <p class="muted" style="margin:10px 0 0">Soluk toplar ekrandan içe aktarılan geçmiştir; analize girer, karneye sayılmaz.</p>
  </div>
  <div class="row"><button id="del" class="danger grow">Bu oturumu sil</button></div>`;
  bindHead();
  $('#pad').onclick = (e) => { const b = e.target.closest('[data-n]'); if (!b) return; withActive((x) => R.addSpin(x, Number(b.dataset.n))); viewRoulette(); };
  $('#undo').onclick = () => { withActive((x) => R.undo(x)); viewRoulette(); };
  $('#del').onclick = (e) => confirmTap(e.target, 'Emin misiniz? Tekrar dokunun', () => { const d = loadRoulette(); d.sessions = d.sessions.filter((x) => x.id !== d.active); d.active = d.sessions[0]?.id ?? null; saveRoulette(d); st.lastPred = undefined; viewRoulette(); });
  bindScreen();
}
function bindHead() {
  $('#sess').onchange = (e) => { const d = loadRoulette(); d.active = Number(e.target.value); saveRoulette(d); st.lastPred = undefined; viewRoulette(); };
  $('#new').onclick = () => { const d = loadRoulette(); newSession(d, 'Masa ' + (d.seq + 1) + ' · ' + new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })); saveRoulette(d); st.lastPred = undefined; viewRoulette(); };
}
function screenCard() {
  if (st.cap === 'none') return `<div class="card"><h2>Ekrandan otomatik okuma</h2><p class="muted">Bu özellik yalnızca telefona kurulan uygulamada çalışır.</p></div>`;
  const on = st.cap === 'on', cfg = read('screen', null);
  return `<div class="card"><h2>Ekrandan otomatik okuma ${on ? '<span class="tag live">açık</span>' : '<span class="tag">kapalı</span>'}</h2>
    <button id="cap" class="${on ? '' : 'primary'}" style="width:100%">${on ? 'Okumayı ve yüzen pencereyi kapat' : 'Yüzen pencereyi aç'}</button>
    ${on ? `<p class="muted" style="margin:10px 0 0">Şimdi rulet oyununa geçin. Yüzen pencerede ${cfg ? '“Başlat”a' : '“Bölge”ye'} dokunun.</p>` : `<ol class="steps">
      <li>Düğmeye dokunun. Telefon iki izin ister: “diğer uygulamaların üzerinde göster” ve “ekranı kaydet”. Ekran kaydında <b>tüm ekran</b>ı seçin.</li>
      <li>Rulet oyununa geçin. Sayıların göründüğü yer ekranda olsun: “Sonuçlar” tablosu ya da üstteki tek sıralık şerit.</li>
      <li>Yüzen pencerede “Bölge”ye dokunun, sayıların olduğu alanı parmağınızla çerçeveleyin (şerit için “Tek sıra”ya dokunun), sarı çizgileri sayıların arasına oturtun, “Dene” ile kontrol edin.</li>
      <li>“Başlat”a dokunun. Yeni sayılar kendiliğinden kaydedilir; tahmin yüzen pencerede görünür.</li></ol>`}
  </div>`;
}
function bindScreen() {
  const b = $('#cap'); if (!b) return;
  b.onclick = () => {
    if (st.cap === 'on') { Native.stopCapture(); setTimeout(viewRoulette, 400); return; }
    const r = Native.startCapture();
    if (r === 'overlay') toast('Önce “diğer uygulamaların üzerinde göster” iznini açın, sonra geri dönüp düğmeye tekrar dokunun.', 6000);
  };
}
const honest = () => `<div class="warn"><b>Bilmeniz gereken:</b> Program gelen sayıları sayar ve geçmişte ne olduğunu gösterir. Sıradaki sayıyı bilemez; rulette her tur bir öncekinden bağımsızdır ve kasa avantajı (%2,7) hangi sayıya oynarsanız oynayın değişmez.</div>`;

/* ---------------- diger ekranlar ---------------- */
function viewSettings() {
  const d = loadRoulette(), n = d.sessions.reduce((a, s) => a + s.spins.length, 0);
  $('#main').innerHTML = `${honest()}
  <div class="card"><h2>Uygulama</h2><p class="muted">Advanced Analytics · telefon sürümü ${VERSION}<br>Veriler yalnızca bu telefonda saklanır; hiçbir yere gönderilmez. Uygulama hiçbir siteye bağlanmaz, oyuna müdahale etmez ve bahis yapmaz; yalnızca ekrandaki sayıları okur.</p></div>
  <div class="card"><h2>Ekran okuma hakkında</h2><ol class="steps"><li>Yalnızca Avrupa ruleti (0-36) desteklenir.</li><li>Brave ve Chrome’da ek ayar gerekmez.</li><li><b>Tor Browser</b> ekran kaydını varsayılan olarak engeller; görüntü siyah gelir. Okuma için Tor Browser’da Ayarlar → Gelişmiş → “Ekran görüntülerine izin ver” (Allow screenshots) açılmalıdır. Bu ayar açıkken telefondaki başka uygulamalar da Tor ekranını kaydedebilir ve sayfa “son uygulamalar” önizlemesinde görünür; işiniz bitince kapatın.</li><li>Uygulama bu engeli kendisi aşmaz ve aşmaya çalışmaz.</li><li>Yüzen pencere okunan tablonun üstünü kapatmamalıdır.</li><li>Telefonu döndürürseniz bölgeyi yeniden seçmeniz gerekir.</li><li>Okunamayan sayı kaydedilmez; yanlış kayıt olursa “Geri al” ile silin.</li></ol></div>
  <div class="card"><h2>Veri</h2><p class="muted">${d.sessions.length} oturum, ${n} sayı kayıtlı.</p><button id="wipe" class="danger" style="width:100%">Bütün rulet verisini sil</button></div>`;
  $('#wipe').onclick = (e) => confirmTap(e.target, 'Hepsi silinecek. Tekrar dokunun', () => { saveRoulette({ sessions: [], active: null, seq: 0 }); toast('Rulet verisi silindi.'); viewSettings(); });
}

/* ---------------- baslangic ---------------- */
$('#nav').onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) setView(b.dataset.v); };
$('#ver').textContent = 'v' + VERSION;
// Yuzen pencere arka planda sayi ekleyebilir: uygulama one gelince ve acikken duzenli olarak diskten yeniden okunur.
window.AAD = { onHttp, onResume: () => { if (st.view === 'roulette') viewRoulette(); } };
setInterval(() => {
  if (st.view !== 'roulette' || document.hidden || st.armed) return;
  const cap = Native?.captureState ? Native.captureState() : 'none', s = activeSession(loadRoulette());
  if (cap !== st.cap || (s && s.spins.length !== st.lastPred)) viewRoulette();
}, 1500);
setView('roulette');
