// ESPN futbol skor tablosu ayristirici: veri hatti ve telefon (canli skor) ayni kodu kullanir.
const minute = (dv) => { const m = /^(\d+)'(\+(\d+))?/.exec(String(dv || '')); return m ? { min: Number(m[1]), plus: m[3] ? Number(m[3]) : 0 } : null; };

/** Bir skor tablosu cevabindaki maclar: durum, skor, dakika, devre skoru (gol dakikalarindan), uzatma. */
export function parseEvents(j, slug, k) {
  const out = [];
  for (const e of j?.events || []) {
    const c = e.competitions?.[0]; if (!c || c.competitors?.length !== 2) continue;
    const H = c.competitors.find((x) => x.homeAway === 'home'), A = c.competitors.find((x) => x.homeAway === 'away'); if (!H || !A) continue;
    const t = e.status?.type || c.status?.type || {}, name = t.name || '', state = t.state || 'pre';
    const row = { id: String(e.id), lg: slug, k, t: new Date(e.date).toISOString(), hid: String(H.team?.id), aid: String(A.team?.id), h: H.team?.displayName || H.team?.name, a: A.team?.displayName || A.team?.name,
      n: c.neutralSite ? 1 : 0, st: state, sn: name, clock: c.status?.displayClock || e.status?.displayClock || '', det: t.shortDetail || '' };
    if (!row.h || !row.a || /TBD/i.test(row.h + row.a)) continue;
    const hs = Number(H.score), as = Number(A.score);
    if (state !== 'pre' && Number.isFinite(hs) && Number.isFinite(as)) {
      row.sc = [hs, as];
      // devre skoru ve 90 dakikalik skor: gol dakikalarindan (penalti atislari haric); toplam tutmazsa kullanilmaz
      const goals = (c.details || []).filter((d) => d.scoringPlay && !d.shootout), gm = { [row.hid]: [0, 0, 0], [row.aid]: [0, 0, 0] };
      let ok = true; for (const g of goals) { const tm = String(g.team?.id), mm = minute(g.clock?.displayValue); if (!gm[tm] || !mm) { ok = false; break; } const half = mm.min <= 45 ? 0 : mm.min <= 90 ? 1 : 2; gm[tm][half]++; }
      const aet = /AET|PEN|EXTRA|OVERTIME|SHOOTOUT/i.test(name);
      if (ok && goals.length) { const th = gm[row.hid], ta = gm[row.aid];
        if (th[0] + th[1] + th[2] === hs && ta[0] + ta[1] + ta[2] === as) { row.ht = [th[0], ta[0]]; if (aet) row.ft90 = [th[0] + th[1], ta[0] + ta[1]]; } }
      else if (ok && !goals.length && hs + as === 0) row.ht = [0, 0];
      if (aet && !row.ft90 && hs + as === 0) row.ft90 = [0, 0];
      row.aet = aet ? 1 : 0;
    }
    out.push(row);
  }
  return out;
}

