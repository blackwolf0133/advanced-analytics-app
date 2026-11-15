// Goruntu yeniden ornekleme. PIL'in (masaustu surumu) yontemiyle aynidir; boylece ayni model ayni girdiyi gorur.
const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
export const LANCZOS = { support: 3, f: (x) => (x > -3 && x < 3 ? sinc(x) * sinc(x / 3) : 0) };
export const BILINEAR = { support: 1, f: (x) => { x = Math.abs(x); return x < 1 ? 1 - x : 0; } };

function coeffs(inSize, outSize, filter) {
  const scale = inSize / outSize, fs = Math.max(scale, 1), support = filter.support * fs, out = [];
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const xmin = Math.max(0, Math.floor(center - support + 0.5)), xmax = Math.min(inSize, Math.floor(center + support + 0.5));
    const w = new Float64Array(xmax - xmin); let sum = 0;
    for (let x = 0; x < w.length; x++) { w[x] = filter.f((x + xmin - center + 0.5) / fs); sum += w[x]; }
    if (sum !== 0) for (let x = 0; x < w.length; x++) w[x] /= sum;
    out.push({ xmin, w });
  }
  return out;
}
const clip8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** src: Uint8Array (h*w*ch) -> Uint8Array (oh*ow*ch) */
export function resize(src, w, h, ch, ow, oh, filter) {
  const kx = coeffs(w, ow, filter), mid = new Uint8Array(h * ow * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < ow; x++) {
    const { xmin, w: k } = kx[x];
    for (let c = 0; c < ch; c++) { let s = 0; for (let i = 0; i < k.length; i++) s += src[(y * w + xmin + i) * ch + c] * k[i]; mid[(y * ow + x) * ch + c] = clip8(s); }
  }
  const ky = coeffs(h, oh, filter), out = new Uint8Array(oh * ow * ch);
  for (let y = 0; y < oh; y++) {
    const { xmin, w: k } = ky[y];
    for (let x = 0; x < ow; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let i = 0; i < k.length; i++) s += mid[((xmin + i) * ow + x) * ch + c] * k[i]; out[(y * ow + x) * ch + c] = clip8(s); }
  }
  return out;
}
