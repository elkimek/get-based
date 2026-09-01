// @ts-check
// voice-service.js — provider-neutral STT/TTS operation configuration.

import { getVoiceProviderDefinition } from './voice-provider-catalog.js';
import { loadVoiceProvider } from './voice-provider-registry.js';
import {
  AI_VOICE_DEFAULTS,
  resolveVoiceProviderId,
} from './voice-ai-provider.js';
import { resolveLocalSttLanguage } from './voice-model-catalog.js';
import { getVoiceProviderKey, getVoiceSettings } from './voice-settings-storage.js';
import { authorizeAppExtensionVoiceRequest } from './app-extension-runtime.js';
import { requireAIProcessingApproval } from './cloud-ai-consent.js';

export function getVoiceProviderId(kind, settings = getVoiceSettings()) {
  const configured = kind === 'tts' ? settings.outputProvider : settings.inputProvider;
  return resolveVoiceProviderId(kind, configured);
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
  if (AI_VOICE_DEFAULTS[providerId]) {
    return {
      ...common,
      apiKey: getVoiceProviderKey(providerId),
      modelId: providerId === 'openrouter'
        ? settings.openRouterSttModel
        : AI_VOICE_DEFAULTS[providerId].sttModel,
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
  if (AI_VOICE_DEFAULTS[providerId]) {
    return {
      ...common,
      apiKey: getVoiceProviderKey(providerId),
      modelId: providerId === 'openrouter'
        ? settings.openRouterTtsModel
        : AI_VOICE_DEFAULTS[providerId].ttsModel,
      voiceId: providerId === 'ppq'
        ? settings.ppqVoice || AI_VOICE_DEFAULTS.ppq.voice
        : providerId === 'openrouter'
          ? settings.openRouterVoice || AI_VOICE_DEFAULTS.openrouter.voice
          : providerId === 'venice'
            ? settings.veniceVoice || AI_VOICE_DEFAULTS.venice.voice
            : AI_VOICE_DEFAULTS[providerId].voice,
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
 * Authorize a hosted voice operation before microphone capture or playback
 * setup begins. The request itself rechecks authorization immediately before
 * any audio or text is sent.
 *
 * @param {'stt' | 'tts'} kind
 * @param {string} providerId
 * @param {ReturnType<typeof getVoiceSettings>} [settings]
 */
export async function ensureVoiceRequestPrivacy(kind, providerId, settings = getVoiceSettings()) {
  const requestOptions = kind === 'tts'
    ? synthesisOptions(providerId, settings, '', undefined)
    : transcriptionOptions(providerId, settings, null, undefined);
  await requireAIProcessingApproval(providerId, {
    kind: kind === 'tts' ? 'voice-output' : 'voice-input',
    endpoint: providerId === 'local-server' ? settings.localServerUrl : '',
    modelId: requestOptions.modelId,
  });
  const authorized = await authorizeAppExtensionVoiceRequest({
    kind,
    providerId,
    modelId: requestOptions.modelId,
    settings,
  });
  if (!authorized) {
    throw new Error(`This hosted voice request is not authorized. No ${kind === 'stt' ? 'audio' : 'text'} was sent.`);
  }
  return true;
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
  const requestOptions = transcriptionOptions(providerId, settings, audio, signal);
  await ensureVoiceRequestPrivacy('stt', providerId, settings);
  const provider = await loadVoiceProvider(providerId);
  const definition = assertCapability(providerId, provider, 'stt');
  const result = /** @type {any} */ (await provider.transcribe(requestOptions));
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
    async synthesize(text) {
      const requestOptions = synthesisOptions(providerId, settings, text, signal);
      await ensureVoiceRequestPrivacy('tts', providerId, settings);
      return provider.synthesize(requestOptions);
    },
  };
}
