// Iki pencerenin (ana uygulama ve yuzen pencere) ortak kucuk yardimcilari.
import { color } from './roulette.js';
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (x, d = 1) => (x * 100).toFixed(d).replace('.', ',') + '%';
export const num = (x, d = 1) => Number(x).toFixed(d).replace('.', ',');
export const ball = (v, cls = '') => `<span class="ball ${v === null || v === undefined ? 'unk' : color(v)} ${cls}">${v ?? '?'}</span>`;
export const Native = typeof window !== 'undefined' ? window.Native || null : null;
