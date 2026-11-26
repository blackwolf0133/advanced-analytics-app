// Basketbol canli skorlar: ESPN (NBA, WNBA, G League, NBL, NCAA) ve EuroLeague/EuroCup resmi API'si.
// Telefon dogrudan ceker; sonuc ekranda gosterilir, veri dosyalarina yazilmaz.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/';
const EL = (c, y) => `https://api-live.euroleague.net/v2/competitions/${c}/seasons/${c}${y}/games`;
export const LIVE_ESPN = [['nba', 'NBA'], ['wnba', 'WNBA'], ['nba-development', 'G League', 'gleague'], ['nbl', 'NBL'], ['mens-college-basketball', 'NCAA Erkekler', 'ncaam'], ['womens-college-basketball', 'NCAA Kadınlar', 'ncaaw']];
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/** Donus: [{ lg, lgName, t (ms), h, a, hs, as, state: 'pre'|'in'|'post', clock }] */
export async function fetchLive(get, { ncaa = false } = {}) {
  const now = Date.now(), out = [], errs = [];
  const days = [...new Set([ymd(now - 10 * 3600e3), ymd(now), ymd(now + 10 * 3600e3)])];
  for (const [slug, name, id = slug] of LIVE_ESPN) {
    if (!ncaa && /college/.test(slug)) continue;
    for (const d of days) {
      try {
        const j = JSON.parse(await get(`${ESPN}${slug}/scoreboard?dates=${d}${/college/.test(slug) ? '&groups=50&limit=400' : ''}`));
        for (const e of j.events || []) {
          const c = e.competitions?.[0], H = c?.competitors?.find((x) => x.homeAway === 'home'), A = c?.competitors?.find((x) => x.homeAway === 'away'); if (!H || !A) continue;
          const t = Date.parse(e.date); if (Math.abs(t - now) > 20 * 3600e3) continue;
          out.push({ key: 'e' + e.id, lg: id, lgName: name, t, h: H.team.displayName, a: A.team.displayName, hs: Number(H.score) || 0, as: Number(A.score) || 0, state: e.status?.type?.state || 'pre', clock: e.status?.type?.shortDetail || '' });
        }
      } catch (er) { errs.push(name); }
    }
  }
  const y = new Date(now).getUTCMonth() >= 7 ? new Date(now).getUTCFullYear() : new Date(now).getUTCFullYear() - 1;
  for (const [c, name, id] of [['E', 'EuroLeague', 'euroleague'], ['U', 'EuroCup', 'eurocup']]) {
    try {
      const j = JSON.parse(await get(EL(c, y)));
      for (const g of j.data || []) {
        const t = Date.parse(g.utcDate); if (Math.abs(t - now) > 20 * 3600e3) continue;
        const hs = g.local?.score || 0, as = g.road?.score || 0, q = g.local?.partials || {}, qn = ['partials4', 'partials3', 'partials2', 'partials1'].find((k) => q[k] > 0 || (g.road?.partials || {})[k] > 0);
        out.push({ key: 'el' + g.identifier, lg: id, lgName: name, t, h: g.local?.club?.name || '?', a: g.road?.club?.name || '?', hs, as, state: g.played ? 'post' : hs + as > 0 ? 'in' : 'pre', clock: g.played ? 'Bitti' : hs + as > 0 ? `${qn ? qn.slice(-1) + '. çeyrek' : 'canlı'}` : '' });
      }
    } catch (er) { errs.push(name); }
  }
  const seen = new Set(), list = out.filter((g) => !seen.has(g.key) && seen.add(g.key)).sort((a, b) => a.t - b.t);
  return { list, errs: [...new Set(errs)], at: now };
}
