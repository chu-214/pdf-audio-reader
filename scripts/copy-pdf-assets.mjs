import { cp, mkdir } from 'node:fs/promises';
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  await mkdir(`public/pdf-assets/${dir}`, { recursive: true });
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/pdf-assets/${dir}`, { recursive: true });
}
