import type { Chunk, Position } from '../types';

export type SpeechStatus = 'idle' | 'playing' | 'paused' | 'finished';
export type SpeechOptions = { rate: number; volume: number; voiceURI: string };
type SpeechUpdate = { position: Position; status: SpeechStatus; error?: string };

/** One utterance at a time. A generation token ignores late events from cancelled speech. */
export class Narrator {
  private generation = 0;
  private position: Position = { page: 0, chunk: 0 };
  private pages: Chunk[][] = [];
  private status: SpeechStatus = 'idle';
  currentUtterance?: SpeechSynthesisUtterance;
  private options: SpeechOptions = { rate: 1, volume: 1, voiceURI: '' };
  constructor(private synth: SpeechSynthesis | undefined, private update: (value: SpeechUpdate) => void) {}
  configure(pages: Chunk[][], position: Position) {
    this.stop(); this.pages = pages;
    this.position = { page: Math.min(Math.max(0, position.page), Math.max(0, pages.length - 1)), chunk: Math.max(0, position.chunk) };
    this.emit();
  }
  setOptions(options: SpeechOptions) {
    this.options = options;
    if (this.status === 'playing') this.speak();
  }
  private emit(error?: string) { this.update({ position: { ...this.position }, status: this.status, error }); }
  stop() {
    this.generation++; this.synth?.cancel(); this.currentUtterance = undefined; this.status = 'idle';
  }
  pause() {
    if (this.status !== 'playing') return;
    // Cancel + restart the current sentence works across browsers with broken native pause/resume.
    this.generation++; this.synth?.cancel(); this.currentUtterance = undefined;
    this.status = 'paused'; this.emit();
  }
  toggle() { if (this.status === 'playing') this.pause(); else this.play(); }
  play() {
    if (!this.synth) { this.emit('Your browser does not support text-to-speech. Try Chrome, Edge, or Safari.'); return; }
    if (this.status === 'finished') this.position = { page: 0, chunk: 0 };
    this.speak();
  }
  seek(position: Position, autoplay = this.status === 'playing') {
    this.generation++; this.synth?.cancel(); this.currentUtterance = undefined;
    this.position = { ...position }; this.status = 'paused';
    if (autoplay) this.speak(); else this.emit();
  }
  step(direction: -1 | 1) {
    let { page, chunk } = this.position;
    chunk += direction;
    while (page >= 0 && page < this.pages.length) {
      if (chunk >= 0 && chunk < this.pages[page].length) break;
      if (direction === 1) { page++; chunk = 0; }
      else { page--; chunk = this.pages[page]?.length - 1; }
    }
    if (page < 0) { page = 0; chunk = 0; }
    if (page >= this.pages.length) return;
    this.seek({ page, chunk });
  }
  private speak() {
    if (!this.synth) return;
    this.generation++; this.synth.cancel();
    const token = this.generation;
    while (this.position.page < this.pages.length && this.position.chunk >= this.pages[this.position.page].length) {
      this.position.page++; this.position.chunk = 0;
    }
    if (this.position.page >= this.pages.length) {
      this.position = { page: Math.max(0, this.pages.length - 1), chunk: Math.max(0, (this.pages.at(-1)?.length ?? 1) - 1) };
      this.status = 'finished'; this.emit(); return;
    }
    const chunk = this.pages[this.position.page]?.[this.position.chunk];
    if (!chunk) return;
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    this.currentUtterance = utterance; // Retain it: some engines collect utterances before their end event.
    utterance.rate = this.options.rate; utterance.volume = this.options.volume;
    const voice = this.synth.getVoices().find(v => v.voiceURI === this.options.voiceURI);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.onend = () => {
      if (token !== this.generation || this.status !== 'playing') return;
      this.position.chunk++; this.speak();
    };
    utterance.onerror = event => {
      if (token !== this.generation || event.error === 'canceled' || event.error === 'interrupted') return;
      this.status = 'paused'; this.emit(`Playback could not start (${event.error}). Select a device voice and press play again.`);
    };
    this.status = 'playing'; this.emit(); this.synth.speak(utterance);
  }
  destroy() { this.stop(); }
}
