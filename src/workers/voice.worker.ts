import type { KokoroTTS } from 'kokoro-js';
import type { VoiceRequest, VoiceResponse } from '../lib/voice-types';
import { stripUrls } from '../lib/urls';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let model: Promise<KokoroTTS> | undefined;
// ONNX sessions are intentionally serialized; a second inference must not enter
// the same model while its current run is still reading its tensors.
let queue = Promise.resolve();
let generation = 0;
function reply(value: VoiceResponse, transfer?: Transferable[]) {
  self.postMessage(value, { transfer: transfer ?? [] });
}
async function load(request: VoiceRequest): Promise<KokoroTTS> {
  if (!model) {
    model = (async () => {
      // Serve Kokoro's official browser bundle unchanged alongside its runtime
      // assets, keeping the inference library out of the main application bundle.
      const { KokoroTTS, env } = await import(/* @vite-ignore */ `${request.assetBase}kokoro.web.js`) as typeof import('kokoro-js');
      env.wasmPaths = request.assetBase;
      const progress = (event: { status: string; file?: string; progress?: number }) => {
        if (event.status === 'progress' && event.file?.endsWith('.onnx')) {
          reply({ id: request.id, type: 'progress', message: `Downloading voice · ${Math.round(event.progress ?? 0)}%` });
        }
      };
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      const adapter = await gpu?.requestAdapter().catch(() => null);
      if (adapter) {
        try {
          return await KokoroTTS.from_pretrained(MODEL, { device: 'webgpu', dtype: 'fp32', progress_callback: progress });
        } catch {
          reply({ id: request.id, type: 'progress', message: 'Preparing CPU voice' });
        }
      }
      return KokoroTTS.from_pretrained(MODEL, { device: 'wasm', dtype: 'q8', progress_callback: progress });
    })().catch(error => { model = undefined; throw error; });
  }
  return model;
}

self.onmessage = (event: MessageEvent<VoiceRequest | { type: 'cancel' }>) => {
  const request = event.data;
  if (request.type === 'cancel') { generation++; return; }
  const token = generation;
  queue = queue.then(async () => {
    if (token !== generation) return;
    try {
      reply({ id: request.id, type: 'progress', message: model ? 'Preparing audio' : 'Loading local voice · first use downloads the model' });
      const tts = await load(request);
      if (token !== generation) return;
      reply({ id: request.id, type: 'progress', message: 'Preparing audio' });
      const audio = await tts.generate(stripUrls(request.text), { voice: request.voice, speed: 1 });
      if (token !== generation) return;
      // Transfer ownership rather than copying a large PCM array across threads.
      const samples = new Float32Array(audio.audio);
      reply({ id: request.id, type: 'audio', samples, sampleRate: audio.sampling_rate }, [samples.buffer]);
    } catch (error) {
      reply({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
};
