export const AI_VOICES = [
  { id: 'af_heart', label: 'Heart · American English' },
  { id: 'af_bella', label: 'Bella · American English' },
  { id: 'am_michael', label: 'Michael · American English' },
  { id: 'bf_emma', label: 'Emma · British English' },
] as const;
export type VoiceId = typeof AI_VOICES[number]['id'];
export const DEFAULT_VOICE: VoiceId = 'af_heart';
export function validVoice(value: string): VoiceId {
  return AI_VOICES.find(voice => voice.id === value)?.id ?? DEFAULT_VOICE;
}
export type VoiceAudio = { samples: Float32Array; sampleRate: number };
export type VoiceRequest = { type: 'generate'; id: number; text: string; voice: VoiceId; assetBase: string };
export type VoiceResponse =
  | { id: number; type: 'progress'; message: string }
  | { id: number; type: 'audio'; samples: Float32Array; sampleRate: number }
  | { id: number; type: 'error'; message: string };
export interface VoiceRenderer {
  render(text: string, voice: VoiceId, onProgress: (message: string) => void): Promise<VoiceAudio>;
  cancelPending(): void;
  destroy(): void;
}
