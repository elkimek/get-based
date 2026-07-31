// @ts-check
// voice-service.js — provider-neutral STT/TTS operation configuration.

import { getVoiceProviderDefinition } from './voice-provider-catalog.js';
import { loadVoiceProvider } from './voice-provider-registry.js';
import { resolveLocalSttLanguage } from './voice-model-catalog.js';
import { getVoiceProviderKey, getVoiceSettings } from './voice-settings-storage.js';

export function getVoiceProviderId(kind, settings = getVoiceSettings()) {
  return kind === 'tts' ? settings.outputProvider : settings.inputProvider;
}

function assertCapability(providerId, provider, kind) {
  const definition = getVoiceProviderDefinition(providerId);
  const capability = kind === 'tts' ? 'tts' : 'stt';
  const operation = kind === 'tts' ? provider?.synthesize : provider?.transcribe;
  if (!definition.capabilities[capability] || typeof operation !== 'function') {
    throw new Error(`${definition.label} does not support ${kind === 'tts' ? 'spoken replies' : 'dictation'}.`);
  }
  return definition;
}

function transcriptionOptions(providerId, settings, audio, signal) {
  const common = {
    audio,
    language: providerId === 'browser-local'
      ? resolveLocalSttLanguage(settings.localSttModel, settings.inputLanguage)
      : settings.inputLanguage,
    signal,
  };
  if (providerId === 'browser-local') {
    return {
      ...common,
      modelId: settings.localSttModel,
      backend: settings.localSttBackend,
    };
  }
  if (providerId === 'local-server') {
    return {
      ...common,
      baseUrl: settings.localServerUrl,
      apiKey: getVoiceProviderKey(providerId),
      modelId: settings.localServerSttModel,
    };
  }
  return {
    ...common,
    apiKey: getVoiceProviderKey(providerId),
    modelId: providerId === 'elevenlabs' ? 'scribe_v2' : undefined,
  };
}

function synthesisOptions(providerId, settings, text, signal) {
  const common = {
    text,
    language: providerId === 'browser-local' ? 'en' : settings.outputLanguage,
    rate: settings.rate,
    signal,
  };
  if (providerId === 'browser-local') {
    return {
      ...common,
      modelId: settings.localTtsModel,
      voiceId: settings.localVoice,
      streaming: true,
      backend: settings.localTtsBackend,
    };
  }
  if (providerId === 'local-server') {
    return {
      ...common,
      baseUrl: settings.localServerUrl,
      apiKey: getVoiceProviderKey(providerId),
      modelId: settings.localServerTtsModel,
      voiceId: settings.localServerVoice,
    };
  }
  return {
    ...common,
    apiKey: getVoiceProviderKey(providerId),
    modelId: providerId === 'elevenlabs' ? settings.elevenlabsTtsModel : undefined,
    voiceId: providerId === 'xai' ? settings.xaiVoice : settings.elevenlabsVoice,
  };
}

/**
 * @param {Blob | Float32Array} audio
 * @param {{ settings?: ReturnType<typeof getVoiceSettings>, signal?: AbortSignal }} [options]
 */
export async function transcribeVoice(audio, {
  settings = getVoiceSettings(),
  signal,
} = {}) {
  const providerId = getVoiceProviderId('stt', settings);
  const provider = await loadVoiceProvider(providerId);
  const definition = assertCapability(providerId, provider, 'stt');
  const result = /** @type {any} */ (await provider.transcribe(
    transcriptionOptions(providerId, settings, audio, signal),
  ));
  return { ...result, providerId, definition };
}

/**
 * @param {{ settings?: ReturnType<typeof getVoiceSettings>, signal?: AbortSignal }} [options]
 */
export async function createVoiceSynthesizer({
  settings = getVoiceSettings(),
  signal,
} = {}) {
  const providerId = getVoiceProviderId('tts', settings);
  const provider = await loadVoiceProvider(providerId);
  const definition = assertCapability(providerId, provider, 'tts');
  return {
    providerId,
    definition,
    synthesize(text) {
      return provider.synthesize(synthesisOptions(providerId, settings, text, signal));
    },
  };
}
