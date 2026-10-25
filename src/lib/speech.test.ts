import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Narrator } from './speech';
import type { Chunk } from '../types';
import type { VoiceAudio, VoiceRenderer } from './voice-types';

class AudioMock {
  src = ''; preload = ''; preservesPitch = false; playbackRate = 1; volume = 1;
  currentTime = 0; duration = 10;
  onended?: (() => void) | null; ontimeupdate?: (() => void) | null; onerror?: (() => void) | null;
  play = vi.fn(() => Promise.resolve()); pause = vi.fn(); removeAttribute = vi.fn(); load = vi.fn();
  constructor() { audios.push(this); }
}
const data: VoiceAudio = { samples: new Float32Array([.1, -.1, .2]), sampleRate: 24000 };
const chunk = (text: string, blockId = text): Chunk => ({ text, blockId, heading: false });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
let audios: AudioMock[];
let renderer: VoiceRenderer;
beforeEach(() => {
  audios = [];
  vi.stubGlobal('Audio', AudioMock);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  renderer = { render: vi.fn(async () => data), cancelPending: vi.fn(), destroy: vi.fn() };
});

describe('neural narration', () => {
  it('generates related sentences together with Heart as the default voice', async () => {
    const reader = new Narrator(renderer, vi.fn());
    reader.configure([[chunk('One sentence.', 'paragraph'), chunk('Another sentence.', 'paragraph')]], { page: 0, chunk: 0 });
    reader.play(); await flush();
    expect(renderer.render).toHaveBeenCalledWith('One sentence. Another sentence.', 'af_heart', expect.any(Function));
    expect(audios[0].preservesPitch).toBe(true);
    expect(audios[0].play).toHaveBeenCalledOnce();
  });
  it('prefetches the next page, skips empty pages, and finishes without regenerating cached audio', async () => {
    const update = vi.fn(); const reader = new Narrator(renderer, update);
    reader.configure([[chunk('First.')], [], [chunk('Last.')]], { page: 0, chunk: 0 });
    reader.play(); await flush();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    audios[0].onended?.(); await flush();
    expect(audios).toHaveLength(2);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(update.mock.lastCall?.[0]).toMatchObject({ status: 'playing', position: { page: 2, chunk: 0 } });
    audios[1].onended?.(); expect(update.mock.lastCall?.[0].status).toBe('finished');
  });
  it('pauses and resumes the exact audio position without regenerating speech', async () => {
    const reader = new Narrator(renderer, vi.fn());
    reader.configure([[chunk('Keep this exact position.')]], { page: 0, chunk: 0 });
    reader.play(); await flush(); audios[0].currentTime = 3.5;
    reader.pause(); reader.play(); await flush();
    expect(audios).toHaveLength(1);
    expect(audios[0].currentTime).toBe(3.5);
    expect(audios[0].play).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenCalledOnce();
  });
  it('ignores a slow generation result after seeking to another sentence', async () => {
    const resolve: ((audio: VoiceAudio) => void)[] = [];
    renderer.render = vi.fn(() => new Promise<VoiceAudio>(done => resolve.push(done)));
    const reader = new Narrator(renderer, vi.fn());
    reader.configure([[chunk('One.'), chunk('Two.')]], { page: 0, chunk: 0 });
    reader.play(); reader.seek({ page: 0, chunk: 1 }, true);
    resolve[0](data); await flush(); expect(audios).toHaveLength(0);
    resolve[1](data); await flush(); expect(audios).toHaveLength(1);
  });
  it('cancels loading immediately and ignores late completion after the pause', async () => {
    let resolve!: (audio: VoiceAudio) => void;
    renderer.render = vi.fn(() => new Promise<VoiceAudio>(done => { resolve = done; }));
    const update = vi.fn(); const reader = new Narrator(renderer, update);
    reader.configure([[chunk('Hello.')]], { page: 0, chunk: 0 }); reader.play(); reader.pause();
    resolve(data); await flush();
    expect(audios).toHaveLength(0);
    expect(update.mock.lastCall?.[0].status).toBe('paused');
    expect(renderer.cancelPending).toHaveBeenCalled();
  });
  it('changes speed and volume immediately without changing pitch or regenerating audio', async () => {
    const reader = new Narrator(renderer, vi.fn());
    reader.configure([[chunk('A natural sentence.')]], { page: 0, chunk: 0 }); reader.play(); await flush();
    reader.setOptions({ rate: 1.5, volume: .4, voiceURI: 'af_heart' });
    expect(audios[0]).toMatchObject({ playbackRate: 1.5, volume: .4, preservesPitch: true });
    expect(renderer.render).toHaveBeenCalledOnce();
  });
  it('reports inference failures and lets the user retry', async () => {
    renderer.render = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(data);
    const update = vi.fn(); const reader = new Narrator(renderer, update);
    reader.configure([[chunk('Try again.')]], { page: 0, chunk: 0 }); reader.play(); await flush();
    expect(update.mock.lastCall?.[0]).toMatchObject({ status: 'paused', error: expect.stringContaining('Offline') });
    reader.play(); await flush(); expect(audios).toHaveLength(1);
  });
  it('can move backward across an empty page without starting playback', () => {
    const update = vi.fn(); const reader = new Narrator(renderer, update);
    reader.configure([[chunk('One.')], [], [chunk('Three.')]], { page: 2, chunk: 0 }); reader.step(-1);
    expect(update.mock.lastCall?.[0]).toMatchObject({ status: 'paused', position: { page: 0, chunk: 0 } });
    expect(audios).toHaveLength(0);
  });
});
