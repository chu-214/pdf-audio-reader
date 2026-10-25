import { expect, it } from 'vitest';
import { audioBlob } from './voice';
import { validVoice } from './voice-types';

it('encodes neural PCM as a valid mono WAV and clips out-of-range samples', async () => {
  const blob = audioBlob({ samples: new Float32Array([-2, 0, 2]), sampleRate: 24000 });
  const bytes = await blob.arrayBuffer(); const view = new DataView(bytes);
  expect(blob.type).toBe('audio/wav');
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
  expect(view.getUint32(24, true)).toBe(24000);
  expect(view.getUint32(40, true)).toBe(6);
  expect([44, 46, 48].map(i => view.getInt16(i, true))).toEqual([-32768, 0, 32767]);
});
it('replaces an old browser voice preference with the neural default', () => {
  expect(validVoice('com.apple.speech.synthesis.voice.samantha')).toBe('af_heart');
  expect(validVoice('bf_emma')).toBe('bf_emma');
});
