import type { Chunk, Position } from '../types';
import { passageAt, type Passage } from './passages';
import { audioBlob } from './voice';
import { DEFAULT_VOICE, validVoice, type VoiceAudio, type VoiceRenderer } from './voice-types';

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'finished';
export type SpeechOptions = { rate: number; volume: number; voiceURI: string };
type SpeechUpdate = { position: Position; status: SpeechStatus; message?: string; error?: string };

/** Local neural speech, generated ahead in passages instead of isolated sentences. */
export class Narrator {
  private generation = 0;
  private position: Position = { page: 0, chunk: 0 };
  private pages: Chunk[][] = [];
  private status: SpeechStatus = 'idle';
  private options: SpeechOptions = { rate: 1, volume: 1, voiceURI: DEFAULT_VOICE };
  private audio?: HTMLAudioElement;
  private url?: string;
  private cache = new Map<string, Promise<VoiceAudio>>();
  private activeKey = '';
  constructor(private renderer: VoiceRenderer, private update: (value: SpeechUpdate) => void) {}
  configure(pages: Chunk[][], position: Position) {
    this.stop(); this.pages = pages;
    this.position = { page: Math.min(Math.max(0, position.page), Math.max(0, pages.length - 1)), chunk: Math.max(0, position.chunk) };
    this.emit();
  }
  setOptions(options: SpeechOptions) {
    const voiceChanged = validVoice(options.voiceURI) !== validVoice(this.options.voiceURI);
    this.options = options;
    if (this.audio) { this.audio.playbackRate = options.rate; this.audio.volume = options.volume; }
    if (voiceChanged) {
      const resume = this.status === 'playing' || this.status === 'loading';
      this.invalidate();
      if (resume) void this.speak();
    }
  }
  private emit(error?: string, message?: string) {
    this.update({ position: { ...this.position }, status: this.status, error, message });
  }
  private releaseAudio() {
    if (this.audio) {
      this.audio.onended = null; this.audio.ontimeupdate = null; this.audio.onerror = null;
      this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = undefined;
    }
    if (this.url) { URL.revokeObjectURL(this.url); this.url = undefined; }
  }
  private invalidate() {
    this.generation++; this.activeKey = ''; this.releaseAudio();
    this.renderer.cancelPending(); this.cache.clear();
  }
  stop() { this.invalidate(); this.status = 'idle'; }
  pause() {
    if (this.status !== 'playing' && this.status !== 'loading') return;
    if (this.status === 'loading') this.invalidate();
    else this.audio?.pause();
    this.status = 'paused'; this.emit();
  }
  toggle() { if (this.status === 'playing' || this.status === 'loading') this.pause(); else this.play(); }
  play() {
    if (this.status === 'playing' || this.status === 'loading') return;
    if (this.status === 'finished') this.position = { page: 0, chunk: 0 };
    if (this.audio && this.status === 'paused') {
      const token = this.generation;
      this.status = 'playing'; this.emit();
      void this.audio.play().catch(error => { if (token === this.generation) this.failed(error); });
    } else void this.speak();
  }
  seek(position: Position, autoplay = this.status === 'playing' || this.status === 'loading') {
    this.invalidate(); this.position = { ...position }; this.status = 'paused';
    if (autoplay) void this.speak(); else this.emit();
  }
  step(direction: -1 | 1) {
    let { page, chunk } = this.position; chunk += direction;
    while (page >= 0 && page < this.pages.length) {
      if (chunk >= 0 && chunk < this.pages[page].length) break;
      if (direction === 1) { page++; chunk = 0; }
      else { page--; chunk = (this.pages[page]?.length ?? 0) - 1; }
    }
    if (page < 0) { page = 0; chunk = 0; }
    if (page < this.pages.length) this.seek({ page, chunk });
  }
  private key(passage: Passage) { return `${validVoice(this.options.voiceURI)}:${passage.start.page}:${passage.start.chunk}:${passage.text}`; }
  private render(passage: Passage): Promise<VoiceAudio> {
    const key = this.key(passage);
    const existing = this.cache.get(key);
    if (existing) return existing;
    const audio = this.renderer.render(passage.text, validVoice(this.options.voiceURI), message => {
      if (this.activeKey === key && this.status === 'loading') this.emit(undefined, message);
    });
    this.cache.set(key, audio);
    // Prefetch errors are handled here and retried when playback reaches them.
    void audio.catch(() => { if (this.cache.get(key) === audio) this.cache.delete(key); });
    if (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value!);
    return audio;
  }
  private prefetch(position: Position) {
    let next = passageAt(this.pages, position);
    for (let i = 0; next && i < 2; i++) {
      void this.render(next).catch(() => {});
      next = passageAt(this.pages, next.next);
    }
  }
  private failed(error: unknown) {
    this.status = 'paused';
    this.emit(`Could not prepare the AI voice: ${error instanceof Error ? error.message : String(error)}. Check your connection for the first model download, then press Play to retry.`);
  }
  private async speak() {
    const token = ++this.generation;
    this.releaseAudio();
    const passage = passageAt(this.pages, this.position);
    if (!passage) {
      this.position = { page: Math.max(0, this.pages.length - 1), chunk: Math.max(0, (this.pages.at(-1)?.length ?? 1) - 1) };
      this.status = 'finished'; this.emit(); return;
    }
    this.position = { ...passage.start }; this.activeKey = this.key(passage);
    this.status = 'loading'; this.emit(undefined, 'Preparing audio');
    try {
      const data = await this.render(passage);
      if (token !== this.generation) return;
      if (!data.samples.length || data.samples.some(value => !Number.isFinite(value))) throw new Error('The model returned invalid audio');
      const audio = new Audio(); this.audio = audio;
      this.url = URL.createObjectURL(audioBlob(data)); audio.src = this.url;
      audio.preload = 'auto'; audio.preservesPitch = true;
      audio.playbackRate = this.options.rate; audio.volume = this.options.volume;
      audio.onended = () => {
        if (token !== this.generation || this.status !== 'playing') return;
        this.position = { ...passage.next }; void this.speak();
      };
      audio.ontimeupdate = () => {
        if (token !== this.generation || this.status !== 'playing') return;
        // Kokoro has no word timestamps; sentence highlighting is estimated
        // within each passage. Seeking always uses the exact selected text.
        const total = passage.chunks.reduce((n, c) => n + c.weight, 0);
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : data.samples.length / data.sampleRate;
        const target = audio.currentTime / duration * total;
        let cumulative = 0; let index = passage.chunks.at(-1)!.index;
        for (const chunk of passage.chunks) { cumulative += chunk.weight; if (cumulative > target) { index = chunk.index; break; } }
        if (this.position.chunk !== index) { this.position = { page: passage.start.page, chunk: index }; this.emit(); }
      };
      audio.onerror = () => { if (token === this.generation) { this.releaseAudio(); this.failed(new Error('Audio playback failed')); } };
      this.status = 'playing'; this.emit();
      await audio.play();
      if (token === this.generation && this.status === 'playing') this.prefetch(passage.next);
    } catch (error) {
      if (token === this.generation) this.failed(error);
    }
  }
  destroy() { this.stop(); this.renderer.destroy(); }
}
