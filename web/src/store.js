// Kalici veri. Telefonda yerel dosyaya yazilir (Native kopru); tarayicida denemek icin localStorage kullanilir.
// Ana pencere ve yuzen pencere ayni veriyi kullanir; her islemde diskten okunup geri yazilir.
const N = typeof window !== 'undefined' ? window.Native : null;
const mem = new Map();
const raw = {
  get: (k) => (N && N.dbRead ? N.dbRead(k) : typeof localStorage !== 'undefined' ? localStorage.getItem('aad.' + k) : mem.get(k)) || '',
  set: (k, v) => (N && N.dbWrite ? N.dbWrite(k, v) : typeof localStorage !== 'undefined' ? localStorage.setItem('aad.' + k, v) : mem.set(k, v)),
};
export function read(key, fallback) { try { const t = raw.get(key); return t ? JSON.parse(t) : fallback; } catch { return fallback; } }
export function write(key, value) { raw.set(key, JSON.stringify(value)); }

const blank = () => ({ sessions: [], active: null, seq: 0 });
export const loadRoulette = () => read('roulette', blank());
export const saveRoulette = (db) => write('roulette', db);
export function activeSession(db) { return db.sessions.find((s) => s.id === db.active) || null; }
export function newSession(db, name) { const s = { id: ++db.seq, name, created: Date.now(), spins: [] }; db.sessions.unshift(s); db.active = s.id; return s; }
/** Diskteki guncel veriyi okur, etkin oturuma fn uygular, geri yazar. */
export function withActive(fn) { const db = loadRoulette(), s = activeSession(db); if (!s) return null; const r = fn(s, db); saveRoulette(db); return r; }
