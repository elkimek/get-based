// @ts-check
// voice-provider-catalog.js — provider metadata and capability discovery.

export const VOICE_PROVIDERS = Object.freeze([
  {
    id: 'auto',
    label: 'Same as chat',
    privacy: 'automatic',
    execution: 'automatic',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Uses the current AI provider when it supports voice, with an on-device fallback.',
  },
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
    id: 'openrouter',
    label: 'OpenRouter',
    privacy: 'cloud',
    execution: 'cloud',
    credentialSource: 'ai',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Connects directly from your browser using the OpenRouter account already configured for AI.',
  },
  {
    id: 'ppq',
    label: 'PPQ',
    privacy: 'cloud',
    execution: 'cloud',
    credentialSource: 'ai',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Connects directly from your browser using the PPQ account already configured for AI.',
  },
  {
    id: 'venice',
    label: 'Venice',
    privacy: 'cloud',
    execution: 'cloud',
    credentialSource: 'ai',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Connects directly from your browser using the Venice account already configured for AI.',
  },
  {
    id: 'xai',
    label: 'xAI',
    privacy: 'cloud',
    execution: 'cloud',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Sends audio or message text directly from your browser to xAI using your API key.',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    privacy: 'cloud',
    execution: 'cloud',
    capabilities: Object.freeze({ stt: true, tts: true, streamingTts: true }),
    description: 'Sends audio or message text directly from your browser to ElevenLabs using your API key.',
  },
]);

export function getVoiceProviderDefinition(providerId) {
  const definition = VOICE_PROVIDERS.find(provider => provider.id === providerId)
    || VOICE_PROVIDERS.find(provider => provider.id === 'browser-local');
  if (!definition) throw new Error('The built-in voice provider is unavailable.');
  return definition;
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
