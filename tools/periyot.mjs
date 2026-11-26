// Basketbol ceyrek skorlari: ilk yari ve ceyrek alt/ust secimlerinin sonucu ve modeli icin.
// Kaynak: ESPN skor tablolari (NBA, G League, NCAA erkekler, NBL; satir skorlari) ve EuroLeague/EuroCup resmi API (ceyrekler).
// b/periyot.json: { g: { 'lig|YYYY-MM-DD|ev sahibi': [ev Q1..Q4, dep Q1..Q4] }, st: { lig: { s1, sd1, sq, sdq, n } } }
const ESPN = [['nba', 'nba', ''], ['gleague', 'nba-development', ''], ['ncaam', 'mens-college-basketball', '&groups=50&limit=500'], ['nbl', 'nbl', '']];
const EL = [['euroleague', 'E'], ['eurocup', 'U']];
const BACK = 75;   // ilk calismada geriye kac gun

export async function periyotlar({ get, pool, readJson, writeJson, NOW }) {
  const prev = readJson('b/periyot.json', null), P = prev?.v === 2 ? prev : { v: 2, g: {}, done: {} };
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10), now = NOW.getTime(), jobs = [];
  for (const [id, slug, q] of ESPN) {
    const done = new Set(P.done[id] || []);
    for (let k = 1; k <= BACK; k++) { const d = ymd(now - k * 864e5); if (!done.has(d) || k <= 2) jobs.push([id, slug, q, d]); }
  }
  const res = await pool(jobs, 6, async ([id, slug, q, d]) => ({ id, d, j: await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/${slug}/scoreboard?dates=${d.replace(/-/g, '')}${q}`) }));
  for (const { id, d, j } of res) {
    if (!j) continue; let all = true;
    for (const e of j.events || []) {
      const c = e.competitions?.[0], H = c?.competitors?.find((x) => x.homeAway === 'home'), A = c?.competitors?.find((x) => x.homeAway === 'away');
      if (!e.status?.type?.completed) { all = false; continue; }
      const lh = (H?.linescores || []).map((x) => Number(x.value)), la = (A?.linescores || []).map((x) => Number(x.value));
      const nq = id === 'ncaam' ? 2 : 4;   // NCAA erkekler iki devre oynar
      if (lh.length < nq || la.length < nq) continue;
      P.g[`${id}|${String(e.date).slice(0, 10)}|${H.team.displayName}`] = [...lh.slice(0, nq), ...la.slice(0, nq)];
    }
    if (all) P.done[id] = [...new Set([...(P.done[id] || []), d])].filter((x) => x >= ymd(now - 120 * 864e5));
  }
  for (const [id, code] of EL) {
    const y = NOW.getUTCMonth() >= 6 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1;
    const j = await get(`https://api-live.euroleague.net/v2/competitions/${code}/seasons/${code}${y}/games`);
    for (const g of j?.data || []) {
      if (!g.played) continue; const ph = g.local?.partials, pa = g.road?.partials; if (!ph || !pa) continue;
      const q = (p) => [p.partials1, p.partials2, p.partials3, p.partials4].map(Number);
      P.g[`${id}|${String(g.utcDate || g.date).slice(0, 10)}|${g.local.club.name}`] = [...q(ph), ...q(pa)];
    }
  }
  for (const k of Object.keys(P.g)) if (k.split('|')[1] < ymd(now - 150 * 864e5)) delete P.g[k];
  // lig istatistikleri: ilk yari payi (normal sure toplamina gore) ve sapmasi; ceyrek payi ve sapmasi
  const st = {};
  for (const [k, v] of Object.entries(P.g)) {
    const id = k.split('|')[0], n = v.length / 2, h = v.slice(0, n), a = v.slice(n), tot = [...h, ...a].reduce((s, x) => s + x, 0); if (!(tot > 0)) continue;
    const half = n === 2 ? h[0] + a[0] : h[0] + h[1] + a[0] + a[1], o = (st[id] ||= { n: 0, s: 0, ss: 0, r: [], q: [] });
    o.n++; o.s += half / tot; o.r.push([half, tot]); if (n === 4) for (let i = 0; i < 4; i++) o.q.push([h[i] + a[i], tot]);
  }
  for (const [id, o] of Object.entries(st)) {
    const s1 = o.s / o.n, sd1 = Math.sqrt(o.r.reduce((s, [x, t]) => s + (x - s1 * t) ** 2, 0) / o.n);
    const sq = o.q.length ? o.q.reduce((s, [x, t]) => s + x / t, 0) / o.q.length : null, sdq = o.q.length ? Math.sqrt(o.q.reduce((s, [x, t]) => s + (x - sq * t) ** 2, 0) / o.q.length) : null;
    st[id] = { n: o.n, s1: +s1.toFixed(4), sd1: +sd1.toFixed(2), sq: sq && +sq.toFixed(4), sdq: sdq && +sdq.toFixed(2) };
  }
  P.st = st; P.updated = NOW.toISOString();
  writeJson('b/periyot.json', P);
  console.log('periyot:', Object.keys(P.g).length, 'mac', JSON.stringify(st));
  return P;
}
/** Bir macin ceyrek skorlari (tarih +-1 gun). */
export function periodsOf(P, lg, date, home) {
  if (!P) return null; const d = Date.parse(String(date).slice(0, 10));
  for (const k of [0, -1, 1]) { const x = P.g[`${lg}|${new Date(d + k * 864e5).toISOString().slice(0, 10)}|${home}`]; if (x) return x; }
  return null;
}
