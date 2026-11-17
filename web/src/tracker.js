// Ekran takibi: okunan sayi sirasindaki kaymadan yeni gelen sayilari bulur. Masaustu surumundeki screen.py ile ayni kurallar.
// Okumalar "en yeni basta" dizileridir; okunamayan hucre null'dur ve joker sayilir.
export const TRACK = 5, STABLE = 2, RESYNC = 8;

/** Serit kac sayi kaymis? Hizalanamiyorsa null. */
export function shift(old, cur) {
  const n = cur.length;
  if (n === 1) return cur[0] === null ? null : (cur[0] !== old[0] ? 1 : 0);
  // bir hucre bir an yanlis okunsa da (yeni sayi kayarken, video arkadan parlarken) takip durmasin:
  // once tam uyum aranir; yoksa en az 3 eslesme varken tek bir uyumsuzluga goz yumulur
  const fits = (k, tol) => { let ok = 0, bad = 0; for (let i = k; i < n; i++) { const a = cur[i], b = old[i - k]; if (a === null || b === null) continue; if (a !== b) bad++; else ok++; } return tol ? bad <= 1 && ok >= 3 : bad === 0 && ok > 0; };
  for (const tol of [false, true]) {
    if (fits(0, tol)) return 0;
    for (let k = 1; k < n; k++) if (fits(k, tol) && cur.slice(0, k).every((v) => v !== null)) return k;
  }
  return null;
}
export const merge = (old, cur, k) => cur.map((v, i) => (v !== null ? v : i >= k ? old[i - k] : null));

export class Tracker {
  constructor(base = null) { this.base = base; this.cand = null; this.count = 0; }
  /** vals: en yeni basta okuma. Donus: { fresh: [yeni sayilar, eskiden yeniye], state } */
  feed(vals) {
    const n = vals.length;
    if (vals[0] === null || vals.filter((v) => v !== null).length < Math.min(2, n)) { this.cand = null; this.count = 0; return { fresh: [], state: 'unreadable' }; }
    const same = this.cand && this.cand.length === n && this.cand.every((v, i) => v === vals[i]);
    this.cand = vals; this.count = same ? this.count + 1 : 1;
    if (this.count < STABLE) return { fresh: [], state: 'settling' };
    if (!this.base) { this.base = vals; return { fresh: [], state: 'started' }; }
    const k = shift(this.base, vals);
    if (k) { const fresh = vals.slice(0, k).reverse(); this.base = merge(this.base, vals, k); return { fresh, state: 'new' }; }
    if (k === 0) { this.base = merge(this.base, vals, 0); return { fresh: [], state: 'same' }; }
    if (this.count >= RESYNC) { this.base = vals; return { fresh: [], state: 'resync' }; }
    return { fresh: [], state: 'mismatch' };
  }
}
