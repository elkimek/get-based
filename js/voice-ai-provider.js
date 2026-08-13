// @ts-check
// voice-ai-provider.js — reuse supported AI-provider connections for voice.

import {
  getAIProvider,
  getOpenRouterKey,
  getPpqKey,
  getVeniceKey,
} from './api-provider-storage.js';
import {
  OPENROUTER_DEFAULT_STT_MODEL,
  OPENROUTER_DEFAULT_TTS_MODEL,
  OPENROUTER_DEFAULT_VOICE,
} from './voice-openrouter-catalog.js';

export const AUTO_VOICE_PROVIDER_ID = 'auto';

export const AI_VOICE_DEFAULTS = Object.freeze({
  openrouter: Object.freeze({
    label: 'OpenRouter',
    sttModel: OPENROUTER_DEFAULT_STT_MODEL,
    ttsModel: OPENROUTER_DEFAULT_TTS_MODEL,
    voice: OPENROUTER_DEFAULT_VOICE,
  }),
  ppq: Object.freeze({
    label: 'PPQ',
    sttModel: 'nova-3',
    ttsModel: 'deepgram_aura_2',
    voice: '',
  }),
  venice: Object.freeze({
    label: 'Venice',
    sttModel: 'openai/whisper-large-v3',
    ttsModel: 'tts-kokoro',
    voice: 'af_sky',
  }),
});

const AI_PROVIDER_LABELS = Object.freeze({
  openrouter: 'OpenRouter',
  ppq: 'PPQ',
  venice: 'Venice',
  routstr: 'Routstr',
  ollama: 'Ollama',
  custom: 'Custom API',
});

export function isAiVoiceProvider(providerId) {
  return Object.hasOwn(AI_VOICE_DEFAULTS, providerId);
}

export function getAiVoiceProviderKey(providerId) {
  if (providerId === 'openrouter') return getOpenRouterKey();
  if (providerId === 'ppq') return getPpqKey();
  if (providerId === 'venice') return getVeniceKey();
  return '';
}

export function resolveVoiceProviderId(_kind, configuredProvider) {
  if (configuredProvider !== AUTO_VOICE_PROVIDER_ID) return configuredProvider;
  const aiProvider = getAIProvider();
  return isAiVoiceProvider(aiProvider) && getAiVoiceProviderKey(aiProvider)
    ? aiProvider
    : 'browser-local';
}

export function getAutomaticVoiceStatus() {
  const aiProvider = getAIProvider();
  const label = AI_PROVIDER_LABELS[aiProvider] || aiProvider || 'Your chat provider';
  if (isAiVoiceProvider(aiProvider)) {
    if (getAiVoiceProviderKey(aiProvider)) {
      return {
        providerId: aiProvider,
        state: 'connected',
        text: `Automatic voice actions use ${label} and its connection from AI settings.`,
      };
    }
    return {
      providerId: 'browser-local',
      state: 'fallback',
      text: `${label} is not connected yet, so voice stays on this device. Add its key in AI settings to use it automatically.`,
    };
  }
  if (aiProvider === 'routstr') {
    return {
      providerId: 'browser-local',
      state: 'fallback',
      text: 'Routstr does not offer live voice endpoints yet, so voice stays on this device.',
    };
  }
  return {
    providerId: 'browser-local',
    state: 'fallback',
    text: `${label} does not provide a compatible voice connection, so voice stays on this device.`,
  };
}
