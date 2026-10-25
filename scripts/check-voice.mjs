// Real inference smoke test. Downloads the public model into the library's cache.
import { KokoroTTS } from 'kokoro-js';
import { mkdir } from 'node:fs/promises';

let last = -1;
const model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  device: 'cpu', dtype: 'q8',
  progress_callback(event) {
    if (event.status === 'progress' && event.file?.endsWith('.onnx')) {
      const percent = Math.floor(event.progress / 20) * 20;
      if (percent !== last) { last = percent; console.log(`Voice model ${percent}%`); }
    }
  },
});
const text = 'This reader now uses a natural AI voice. It keeps related sentences together, so the narration flows more like a person reading a passage.';
const start = performance.now();
const audio = await model.generate(text, { voice: 'af_heart', speed: 1 });
if (audio.audio.length < audio.sampling_rate || audio.audio.some(value => !Number.isFinite(value))) throw new Error('Invalid speech output');
let energy = 0;
for (const sample of audio.audio) energy += sample * sample;
if (Math.sqrt(energy / audio.audio.length) < .001) throw new Error('Silent speech output');
await mkdir('tmp', { recursive: true });
await audio.save('tmp/kokoro-sample.wav');
console.log(JSON.stringify({ seconds: audio.audio.length / audio.sampling_rate, generationSeconds: (performance.now() - start) / 1000, sampleRate: audio.sampling_rate, output: 'tmp/kokoro-sample.wav' }));
await model.model.dispose();
