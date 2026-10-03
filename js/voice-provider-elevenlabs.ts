import type { VoiceConnectionOptions, VoiceSynthesisOptions, VoiceTranscriptionOptions } from '../types/voice-provider.js';

// voice-provider-elevenlabs.js — ElevenLabs Scribe/TTS adapter.

import {
  directSynthesis,
  directTranscription,
  directVoices,
  testDirectProvider,
} from './voice-provider-cloud-shared.js';

export const elevenLabsVoiceProvider = {
  id: 'elevenlabs',
  transcribe(options: VoiceTranscriptionOptions) {
    return directTranscription('elevenlabs', options);
  },
  synthesize(options: VoiceSynthesisOptions) {
    return directSynthesis('elevenlabs', options);
  },
  listVoices(options?: VoiceConnectionOptions) {
    return directVoices('elevenlabs', options);
  },
  listModels(kind: string) {
    return Promise.resolve(kind === 'stt'
      ? [{ id: 'scribe_v2', label: 'Scribe v2' }]
      : [{ id: 'eleven_multilingual_v2', label: 'Multilingual v2' }]);
  },
  testConnection(options?: VoiceConnectionOptions) {
    return testDirectProvider('elevenlabs', options);
  },
};

export default elevenLabsVoiceProvider;
