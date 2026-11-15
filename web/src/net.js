// Telefonda yerel kopru uzerinden indirme (tarayici baska sitelerden veri indiremez; uygulama yalnizca izinli adreslere baglanir).
import { Native } from './ui.js';
const pending = new Map(); let seq = 0;
export function onHttp(id, status, body) { const p = pending.get(id); if (!p) return; pending.delete(id); if (status === 200) p.ok(body); else p.fail(new Error(status > 0 ? `sunucu ${status} yanıtı verdi` : (body || 'bağlantı kurulamadı'))); }
export function httpGet(url, headers) {
  if (!Native?.httpGet) return Promise.reject(new Error('indirme yalnızca telefona kurulan uygulamada çalışır'));
  return new Promise((ok, fail) => { const id = 'h' + (++seq); pending.set(id, { ok, fail }); Native.httpGet(id, url, JSON.stringify(headers || {})); setTimeout(() => { if (pending.delete(id)) fail(new Error('zaman aşımı')); }, 70000); });
}
