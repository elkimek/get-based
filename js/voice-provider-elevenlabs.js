// @ts-check
// voice-provider-elevenlabs.js — ElevenLabs Scribe/TTS adapter.

import {
  directSynthesis,
  directTranscription,
  directVoices,
  testDirectProvider,
} from './voice-provider-cloud-shared.js';

export const elevenLabsVoiceProvider = {
  id: 'elevenlabs',
  transcribe(options) {
    return directTranscription('elevenlabs', options);
  },
  synthesize(options) {
    return directSynthesis('elevenlabs', options);
  },
  listVoices(options) {
    return directVoices('elevenlabs', options);
  },
  listModels(kind) {
    return Promise.resolve(kind === 'stt'
      ? [{ id: 'scribe_v2', label: 'Scribe v2' }]
      : [{ id: 'eleven_multilingual_v2', label: 'Multilingual v2' }]);
  },
  testConnection(options) {
    return testDirectProvider('elevenlabs', options);
  },
};

export default elevenLabsVoiceProvider;
