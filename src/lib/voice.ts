import type { VoiceAudio, VoiceId, VoiceRenderer, VoiceRequest, VoiceResponse } from './voice-types';
import { stripUrls } from './urls';

type Pending = { resolve: (audio: VoiceAudio) => void; reject: (error: Error) => void; progress: (message: string) => void };
export class LocalVoice implements VoiceRenderer {
  private worker?: Worker;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private start() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL(`${import.meta.env.BASE_URL}voice-assets/voice.worker.js`, window.location.href), { type: 'module' });
    worker.onmessage = (event: MessageEvent<VoiceResponse>) => {
      const message = event.data;
      const task = this.pending.get(message.id);
      if (!task) return;
      if (message.type === 'progress') task.progress(message.message);
      else {
        this.pending.delete(message.id);
        if (message.type === 'audio') task.resolve({ samples: message.samples, sampleRate: message.sampleRate });
        else task.reject(new Error(message.message));
      }
    };
    worker.onerror = () => {
      this.fail(new Error('The local voice worker could not start. Refresh the page and try again.'));
      worker.terminate(); this.worker = undefined;
    };
    this.worker = worker; return worker;
  }
  render(text: string, voice: VoiceId, progress: Pending['progress']): Promise<VoiceAudio> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject, progress });
      try {
        const request: VoiceRequest = { type: 'generate', id, text: stripUrls(text), voice, assetBase: new URL(`${import.meta.env.BASE_URL}voice-assets/`, window.location.href).href };
        this.start().postMessage(request);
      } catch (error) {
        this.pending.delete(id); reject(error);
      }
    });
  }
  private fail(error: Error) {
    for (const task of this.pending.values()) task.reject(error);
    this.pending.clear();
  }
  cancelPending() {
    // Generation tokens prevent cancelled results from playing. Leave the model
    // alive so a pause or seek never triggers another large download/init.
    this.fail(new DOMException('Voice request cancelled', 'AbortError'));
    this.worker?.postMessage({ type: 'cancel' });
  }
  destroy() { this.cancelPending(); this.worker?.terminate(); this.worker = undefined; }
}

/** 16-bit PCM WAV for native browser playback with pitch-preserving speed control. */
export function audioBlob(audio: VoiceAudio): Blob {
  const buffer = new ArrayBuffer(44 + audio.samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, audio.samples.length * 2, true);
  for (let i = 0; i < audio.samples.length; i++) {
    const value = Math.max(-1, Math.min(1, audio.samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
