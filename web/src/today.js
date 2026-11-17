// Futbol "Bugun": butun liglerin maclari ve tahminleri (gunluk veri hattindan), canli skorlar (dogrudan ESPN'den).
import { read, write } from './store.js';
import { parseEvents } from './espn.js';

export const VERI = ['https://raw.githubusercontent.com/blackwolf0133/advanced-analytics-app/veri/', 'https://cdn.jsdelivr.net/gh/blackwolf0133/advanced-analytics-app@veri/'];
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
export const load = () => read('fg_gun', null);
export async function download(get) {
  let err; for (const b of VERI) { try { const j = JSON.parse(await get(b + 'f/gun.json')); if (!j.matches) throw new Error('biçim'); write('fg_gun', { ...j, fetched: Date.now() }); return j; } catch (e) { err = e; } }
  throw err;
}
/** Istanbul tarihi (YYYY-MM-DD). */
export const istDay = (t) => new Date(Date.parse(t) + 3 * 3600e3).toISOString().slice(0, 10);
export const dayOffset = (n, now = Date.now()) => new Date(now + 3 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

/** Tahminin sonucu: 'win' | 'lose' | null (bitmemis). Canli macta anlik durum 'live-ok' | 'live-no'. */
export const pick = (p) => p.indexOf(Math.max(...p));
export function verdict(m) {
  if (!m.pr || !m.r) return null;
  const y = m.r[0] > m.r[1] ? 0 : m.r[0] === m.r[1] ? 1 : 2, ok = pick(m.pr.p) === y;
  if (m.st === 'post') return ok ? 'win' : 'lose';
  if (m.st === 'in') return ok ? 'live-ok' : 'live-no';
  return null;
}
export function htVerdict(m) {
  if (!m.pr || !m.r1) return null; const y = m.r1[0] > m.r1[1] ? 0 : m.r1[0] === m.r1[1] ? 1 : 2; return pick(m.pr.ht) === y;
}
/** Ekranda gosterilen skor tahmini: tahmin edilen sonuca uygun en olasi skor (ornek: ev sahibi favoriyse 1-0 gibi). */
const oc = (s) => (s[0] > s[1] ? 0 : s[0] === s[1] ? 1 : 2);
export const ftScore = (p) => { const k = pick(p.p); return (p.scb && p.scb[k]) || p.sc.find((s) => oc(s) === k) || p.sc[0]; };
export const htScore = (p) => { const k = pick(p.ht); return (p.hscb && p.hscb[k]) || p.hsc.find((s) => oc(s) === k) || p.hsc[0]; };
export const scoreHit = (m) => { if (!m.pr || !m.r || m.st !== 'post') return null; const s = ftScore(m.pr); return s[0] === m.r[0] && s[1] === m.r[1]; };
export const htScoreHit = (m) => { if (!m.pr || !m.r1) return null; const s = htScore(m.pr); return s[0] === m.r1[0] && s[1] === m.r1[1]; };

/** Canli skor: secili liglerin bugunku maclari icin ESPN skor tablolari; maclar kimlikle guncellenir. */
export async function refreshLive(get, data, slugs) {
  const now = Date.now(), wanted = new Map();
  for (const m of data.matches) {
    if (!slugs.has(m.lg)) continue; const t = Date.parse(m.t);
    if (t > now + 15 * 60e3 || (m.st === 'post' && now - t > 4 * 3600e3)) continue;       // baslamamis (15 dk kala) ya da cok once bitmis
    wanted.set(m.lg + '|' + m.k, [m.lg, m.k]);
  }
  let changed = 0, errors = 0;
  for (const [lg, k] of wanted.values()) {
    let j = null;
    try { j = JSON.parse(await get(`${ESPN}${lg}/scoreboard?dates=${k}`)); }
    catch { try { const c = JSON.parse(await get(`https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=${lg}&date=${k}`)); j = c?.content?.sbData || null; } catch { errors++; } }
    if (!j) continue;
    for (const e of parseEvents(j, lg, k)) {
      const m = data.matches.find((x) => x.id === e.id); if (!m) continue;
      const before = JSON.stringify([m.st, m.r, m.r1, m.clock]);
      m.st = e.st; m.sn = e.sn; m.clock = e.clock; m.det = e.det; if (e.sc) m.r = e.sc; if (e.ht) m.r1 = e.ht;
      if (JSON.stringify([m.st, m.r, m.r1, m.clock]) !== before) changed++;
    }
  }
  data.live = now; write('fg_gun', data);
  return { changed, errors, leagues: wanted.size };
}
