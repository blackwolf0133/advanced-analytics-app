// Arayuzu tek dosyalik paketlere cevirir ve Android projesinin assets klasorune koyar.
import { build } from 'esbuild'; import fs from 'node:fs';
const out = new URL('../app/src/main/assets/www/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'overlay.html', 'app.css']) fs.copyFileSync(new URL('./static/' + f, import.meta.url), out + f);
for (const n of ['app', 'overlay']) await build({ entryPoints: [new URL(`./src/${n}.js`, import.meta.url).pathname], bundle: true, format: 'iife', target: 'chrome90', minify: true, outfile: `${out}${n}.bundle.js` });
console.log('ok', fs.readdirSync(out).map((f) => `${f} ${(fs.statSync(out + f).size / 1024).toFixed(0)}KB`).join(', '));
