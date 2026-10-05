import type { VoiceConnectionOptions, VoiceSynthesisResult, VoiceTranscriptionResult } from '../types/voice-provider.js';

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

export function getVoiceProviderId(kind: string, settings = getVoiceSettings()) {
  const configured = kind === 'tts' ? settings.outputProvider : settings.inputProvider;
  return resolveVoiceProviderId(kind, configured);
}

function assertCapability(providerId: string, provider: Awaited<ReturnType<typeof loadVoiceProvider>>, kind: string) {
  const definition = getVoiceProviderDefinition(providerId);
  const capability = kind === 'tts' ? 'tts' : 'stt';
  const operation = kind === 'tts' ? provider?.synthesize : provider?.transcribe;
  if (!definition.capabilities[capability] || typeof operation !== 'function') {
    throw new Error(`${definition.label} does not support ${kind === 'tts' ? 'spoken replies' : 'dictation'}.`);
  }
  return definition;
}

function transcriptionOptions(providerId: string, settings: ReturnType<typeof getVoiceSettings>, audio: Blob | Float32Array | null, signal: AbortSignal | undefined) {
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

function synthesisOptions(providerId: string, settings: ReturnType<typeof getVoiceSettings>, text: string, signal: AbortSignal | undefined) {
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
 */
export async function ensureVoiceRequestPrivacy(kind: 'stt' | 'tts', providerId: string, settings = getVoiceSettings()) {
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

export async function transcribeVoice(audio: Blob | Float32Array, {
  settings = getVoiceSettings(),
  signal,
}: VoiceConnectionOptions & { settings?: ReturnType<typeof getVoiceSettings> } = {}): Promise<VoiceTranscriptionResult & { providerId: string; definition: ReturnType<typeof getVoiceProviderDefinition> }> {
  const providerId = getVoiceProviderId('stt', settings);
  const requestOptions = transcriptionOptions(providerId, settings, audio, signal);
  await ensureVoiceRequestPrivacy('stt', providerId, settings);
  const provider = await loadVoiceProvider(providerId);
  const definition = assertCapability(providerId, provider, 'stt');
  // Browser-local also accepts PCM and receives it unchanged through this shared dispatch.
  const result = await provider.transcribe(requestOptions as Parameters<typeof provider.transcribe>[0] & { audio: Blob });
  return { ...result, providerId, definition };
}

export async function createVoiceSynthesizer({
  settings = getVoiceSettings(),
  signal,
}: VoiceConnectionOptions & { settings?: ReturnType<typeof getVoiceSettings> } = {}) {
  const providerId = getVoiceProviderId('tts', settings);
  const provider = await loadVoiceProvider(providerId);
  const definition = assertCapability(providerId, provider, 'tts');
  return {
    providerId,
    definition,
    async synthesize(text: string): Promise<VoiceSynthesisResult> {
      const requestOptions = synthesisOptions(providerId, settings, text, signal);
      await ensureVoiceRequestPrivacy('tts', providerId, settings);
      return provider.synthesize(requestOptions);
    },
  };
}
