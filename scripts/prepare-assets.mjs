import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  mkdirSync(`public/pdf-assets/${folder}`, { recursive: true });
  cpSync(path.join(root, folder), `public/pdf-assets/${folder}`, { recursive: true });
}
console.log('Risorse PDF locali pronte.');
