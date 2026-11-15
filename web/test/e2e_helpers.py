"""Yuzen pencere denemeleri icin Native koprusu taklidi."""
MOCK = """
window.__modes = [];
window.Native = {
  setMode: (m) => window.__modes.push(m), stopCapture: () => { window.__stopped = true; }, screenSize: () => window.__f ? window.__f.width + ',' + window.__f.height : '0,0',
  _raw: (l, t, w, h) => { if (!window.__f) return ''; const d = window.__f.getContext('2d').getImageData(l, t, w, h).data; let s = ''; for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode.apply(null, d.subarray(i, i + 8192)); return w + ',' + h + ',' + btoa(s); },
  grabRaw: (l, t, w, h) => window.Native._raw(l, t, w, h), grabFrozen: (l, t, w, h) => window.Native._raw(l, t, w, h),
  screenshot: () => window.__f ? window.__f.width + ',' + window.__f.height + ',' + window.__f.toDataURL('image/png') : '',
};
"""
LOAD = """async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0); window.__f = c; }"""
