// @ts-check
// voice-provider-xai.js — xAI standalone STT/TTS adapter.

import {
  relaySynthesis,
  relayTranscription,
  relayVoices,
  testRelayProvider,
} from './voice-provider-cloud-shared.js';

export const xaiVoiceProvider = {
  id: 'xai',
  transcribe(options) {
    return relayTranscription('xai', options);
  },
  synthesize(options) {
    return relaySynthesis('xai', options);
  },
  listVoices(options) {
    return relayVoices('xai', options);
  },
  listModels() {
    return Promise.resolve([]);
  },
  testConnection(options) {
    return testRelayProvider('xai', options);
  },
};

export default xaiVoiceProvider;
