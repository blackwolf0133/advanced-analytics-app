// Rulet mantigi (Avrupa ruleti, 0-36): bot tahmini, sicak komsu bolgeleri, karne. Masaustu surumuyle ayni kurallar.
// Onemli: bunlar gecmisin dokumudur. Adil carkta her tur bagimsizdir; hangi sayi gosterilirse gosterilsin tutma sansi 1/37'dir.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const color = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
export const CHANCE = 1 / 37, ZONE_CHANCE = 15 / 37;

function followers(nums) {
  const last = nums[nums.length - 1], count = new Map(), recent = new Map();
  for (let i = 1; i < nums.length; i++) if (nums[i - 1] === last) { count.set(nums[i], (count.get(nums[i]) || 0) + 1); recent.set(nums[i], i); }
  return { count, recent };
}
/** Son sayidan sonra gecmiste en cok gelen sayi (esitlikte en son gorulen); gozlem yoksa en sik cikan sayi. */
export function predictNext(nums) {
  if (!nums.length) return null;
  let { count, recent } = followers(nums), basis = 'follower';
  if (!count.size) { basis = 'frequent'; nums.forEach((v, i) => { count.set(v, (count.get(v) || 0) + 1); recent.set(v, i); }); }
  let best = null;
  for (const [v, c] of count) if (best === null || c > count.get(best) || (c === count.get(best) && recent.get(v) > recent.get(best))) best = v;
  let total = 0; for (const c of count.values()) total += c;
  return { basedOn: nums[nums.length - 1], predicted: best, basis, support: count.get(best), baseN: total };
}
/** Carkta yan yana duran (merkez +-2) en sicak 3 bolge; birbirleriyle cakismaz. */
export function predictZones(nums, k = 3, radius = 2) {
  if (!nums.length) return [];
  let w = followers(nums).count;
  if (!w.size) { w = new Map(); for (const v of nums) w.set(v, (w.get(v) || 0) + 1); }
  const n = WHEEL.length, g = (i) => w.get(WHEEL[((i % n) + n) % n]) || 0;
  const score = WHEEL.map((_, i) => { let s = 0; for (let d = -radius; d <= radius; d++) s += g(i + d); return s; });
  const order = WHEEL.map((_, i) => i).sort((a, b) => score[b] - score[a] || g(b) - g(a) || a - b), taken = new Set(), out = [];
  for (const i of order) {
    const idx = []; for (let d = -radius; d <= radius; d++) idx.push(((i + d) % n + n) % n);
    if (idx.some((c) => taken.has(c))) continue;
    idx.forEach((c) => taken.add(c));
    out.push({ center: WHEEL[i], numbers: idx.map((c) => WHEEL[c]), score: score[i] });
    if (out.length === k) break;
  }
  return out;
}

/* Oturum: { id, name, created, spins: [{ v, imp?, p?, ph?, zh? }] }
   imp: ekrandan toplu ice aktarilan gecmis (tahmin karnesine sayilmaz)
   p: bu sayi gelmeden once botun tahmini; ph: tuttu mu (altin yildiz); zh: komsu bolgesi tuttu mu */
export const values = (s) => s.spins.map((x) => x.v);
export function pending(s) { const nums = values(s), p = predictNext(nums); return p ? { ...p, zones: predictZones(nums) } : null; }
export function addSpin(s, v, imported = false) {
  const spin = { v };
  if (imported) spin.imp = 1;
  else { const p = pending(s); if (p) { spin.p = p.predicted; spin.ph = p.predicted === v ? 1 : 0; spin.zh = p.zones.some((z) => z.numbers.includes(v)) ? 1 : 0; } }
  s.spins.push(spin); return spin;
}
export const undo = (s) => s.spins.pop() || null;
export function stats(s) {
  let n = 0, hits = 0, zhits = 0;
  for (const x of s.spins) if (x.p !== undefined) { n++; hits += x.ph; zhits += x.zh; }
  return { n, hits, zhits, expected: n * CHANCE, zexpected: n * ZONE_CHANCE, total: s.spins.length };
}
export function hotCold(s, k = 5) {
  const c = new Array(37).fill(0); for (const x of s.spins) c[x.v]++;
  const o = c.map((n, v) => ({ v, n })).sort((a, b) => b.n - a.n || a.v - b.v);
  return { hot: o.slice(0, k), cold: o.slice(-k).reverse() };
}
