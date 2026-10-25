import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
// These folders contain generated package assets only. Recreate them to avoid
// retaining obsolete versions or filesystem sync conflict copies between installs.
await rm('public/pdf-assets', { recursive: true, force: true });
await rm('public/voice-assets', { recursive: true, force: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  await mkdir(`public/pdf-assets/${dir}`, { recursive: true });
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/pdf-assets/${dir}`, { recursive: true });
}
await mkdir('public/voice-assets', { recursive: true });
await cp('node_modules/kokoro-js/dist/kokoro.web.js', 'public/voice-assets/kokoro.web.js');
await cp('node_modules/kokoro-js/LICENSE', 'public/voice-assets/KOKORO-LICENSE.txt');
for (const file of ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  await cp(`node_modules/onnxruntime-web/dist/${file}`, `public/voice-assets/${file}`);
}
await build({ entryPoints: ['src/workers/voice.worker.ts'], outfile: 'public/voice-assets/voice.worker.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
