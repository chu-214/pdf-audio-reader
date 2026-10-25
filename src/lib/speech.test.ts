import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Narrator } from './speech';
import type { Chunk } from '../types';

class Utterance {
  rate = 1; volume = 1; voice = null; lang = '';
  onend?: () => void; onerror?: (event: { error: string }) => void;
  constructor(public text: string) {}
}
const chunk = (text: string): Chunk => ({ text, blockId: text, heading: false });
let spoken: Utterance[];
let synth: SpeechSynthesis;
beforeEach(() => {
  spoken = [];
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  synth = { cancel: vi.fn(), speak: vi.fn((u: Utterance) => spoken.push(u)), getVoices: () => [] } as unknown as SpeechSynthesis;
});
describe('narration state machine', () => {
  it('continues across pages and skips empty pages', () => {
    const update = vi.fn(); const reader = new Narrator(synth, update);
    reader.configure([[chunk('First.')], [], [chunk('Last.')]], { page: 0, chunk: 0 });
    reader.play(); expect(spoken[0].text).toBe('First.');
    spoken[0].onend?.(); expect(spoken[1].text).toBe('Last.');
    spoken[1].onend?.(); expect(update.mock.lastCall?.[0].status).toBe('finished');
    reader.play(); expect(spoken.at(-1)?.text).toBe('First.');
  });
  it('ignores late completion events from a paused or replaced utterance', () => {
    const reader = new Narrator(synth, vi.fn());
    reader.configure([[chunk('One.'), chunk('Two.')]], { page: 0, chunk: 0 });
    reader.play(); const stale = spoken[0]; reader.pause(); stale.onend?.();
    expect(spoken).toHaveLength(1);
    reader.play(); expect(spoken.at(-1)?.text).toBe('One.');
    reader.seek({ page: 0, chunk: 1 }, true); stale.onend?.();
    expect(spoken.at(-1)?.text).toBe('Two.');
    expect(spoken).toHaveLength(3);
  });
  it('seeks backward across an empty page without starting playback', () => {
    const update = vi.fn(); const reader = new Narrator(synth, update);
    reader.configure([[chunk('One.')], [], [chunk('Three.')]], { page: 2, chunk: 0 });
    reader.step(-1);
    expect(update.mock.lastCall?.[0]).toMatchObject({ status: 'paused', position: { page: 0, chunk: 0 } });
    expect(spoken).toHaveLength(0);
  });
  it('restarts the current sentence with new voice settings', () => {
    const reader = new Narrator(synth, vi.fn());
    reader.configure([[chunk('One.')]], { page: 0, chunk: 0 }); reader.play();
    reader.setOptions({ rate: 1.5, volume: .4, voiceURI: '' });
    expect(spoken.at(-1)).toMatchObject({ text: 'One.', rate: 1.5, volume: .4 });
  });
  it('reports unavailable speech and engine errors without throwing', () => {
    const update = vi.fn(); const reader = new Narrator(undefined, update); reader.play();
    expect(update.mock.lastCall?.[0].error).toMatch(/does not support/);
    const supported = new Narrator(synth, update);
    supported.configure([[chunk('Hello.')]], { page: 0, chunk: 0 }); supported.play();
    spoken[0].onerror?.({ error: 'not-allowed' });
    expect(update.mock.lastCall?.[0]).toMatchObject({ status: 'paused', error: expect.stringContaining('not-allowed') });
  });
});
