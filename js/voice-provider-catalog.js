// @ts-check
// voice-provider-catalog.js — provider metadata and capability discovery.

export const VOICE_PROVIDERS = Object.freeze([
  {
    id: 'browser-local',
    label: 'On this device',
    privacy: 'local',
    execution: 'browser',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Runs in this browser after a one-time model download.',
  },
  {
    id: 'local-server',
    label: 'Local voice server',
    privacy: 'local-network',
    execution: 'local-server',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Connects directly to an OpenAI-compatible server you control.',
  },
  {
    id: 'xai',
    label: 'xAI',
    privacy: 'cloud',
    execution: 'cloud',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Sends audio or message text to xAI using your API key.',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    privacy: 'cloud',
    execution: 'cloud',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Sends audio or message text to ElevenLabs using your API key.',
  },
]);

export function getVoiceProviderDefinition(providerId) {
  return VOICE_PROVIDERS.find(provider => provider.id === providerId) || VOICE_PROVIDERS[0];
}

export function getVoiceProvidersFor(kind) {
  const capability = kind === 'tts' ? 'tts' : 'stt';
  return VOICE_PROVIDERS.filter(provider => provider.capabilities[capability]);
}

export function getSharedVoiceProviders() {
  return VOICE_PROVIDERS.filter(provider => (
    provider.capabilities.stt && provider.capabilities.tts
  ));
}
