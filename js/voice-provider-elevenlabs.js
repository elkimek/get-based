// @ts-check
// voice-provider-elevenlabs.js — ElevenLabs Scribe/TTS adapter.

import {
  relaySynthesis,
  relayTranscription,
  relayVoices,
  testRelayProvider,
} from './voice-provider-cloud-shared.js';

export const elevenLabsVoiceProvider = {
  id: 'elevenlabs',
  transcribe(options) {
    return relayTranscription('elevenlabs', options);
  },
  synthesize(options) {
    return relaySynthesis('elevenlabs', options);
  },
  listVoices(options) {
    return relayVoices('elevenlabs', options);
  },
  listModels(kind) {
    return Promise.resolve(kind === 'stt'
      ? [{ id: 'scribe_v2', label: 'Scribe v2' }]
      : [{ id: 'eleven_multilingual_v2', label: 'Multilingual v2' }]);
  },
  testConnection(options) {
    return testRelayProvider('elevenlabs', options);
  },
};

export default elevenLabsVoiceProvider;
