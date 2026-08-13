// @ts-check
// voice-provider-ai-cloud.js — PPQ, OpenRouter, and Venice voice adapters.

import { AI_VOICE_DEFAULTS } from './voice-ai-provider.js';
import {
  fetchOpenRouterVoiceModels,
  normalizeKokoroVoice,
  voicesForOpenRouterModel,
} from './voice-openrouter-catalog.js';
import {
  relaySynthesis,
  relayTranscription,
  relayVoices,
} from './voice-provider-cloud-shared.js';

function createProvider(providerId) {
  const defaults = AI_VOICE_DEFAULTS[providerId];
  return {
    id: providerId,
    transcribe(options) {
      return relayTranscription(providerId, {
        ...options,
        modelId: options.modelId || defaults.sttModel,
      });
    },
    synthesize(options) {
      return relaySynthesis(providerId, {
        ...options,
        modelId: options.modelId || defaults.ttsModel,
        voiceId: options.voiceId ?? defaults.voice,
      });
    },
    listModels(kind) {
      const model = kind === 'stt' ? defaults.sttModel : defaults.ttsModel;
      return Promise.resolve([{ id: model, label: model }]);
    },
    async testConnection(options) {
      if (!options?.apiKey) throw new Error(`Connect ${defaults.label} in Settings → AI.`);
      const voices = providerId === 'ppq' ? await relayVoices(providerId, options) : [];
      return {
        ok: true,
        message: voices.length
          ? `Connected. ${voices.length} voices available.`
          : `Using the ${defaults.label} connection from AI settings.`,
        voices,
      };
    },
    ...(providerId === 'ppq' ? {
      listVoices(options) {
        return relayVoices(providerId, options);
      },
    } : {}),
  };
}

async function listOpenRouterModels(kind, options = {}) {
  return fetchOpenRouterVoiceModels(kind, options);
}

async function listOpenRouterVoices(options = {}) {
  const models = await listOpenRouterModels('tts', options);
  const model = models.find(row => row.id === options.modelId) || models[0];
  return voicesForOpenRouterModel(model);
}

/**
 * Load only the private Kokoro voices used by Get Based's curated Venice
 * speech option. Other Venice speech models may use different voice IDs and
 * privacy modes, so they must not leak into this picker.
 *
 * @param {{ apiKey?: string, signal?: AbortSignal }} [options]
 */
export async function fetchVeniceKokoroVoices(options = {}) {
  const { apiKey = '', signal } = options;
  if (!apiKey) throw new Error('Connect Venice in Settings → AI.');
  const response = await fetch('https://api.venice.ai/api/v1/models?type=tts', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Venice voice catalogue returned ${response.status}.`);
  }
  const payload = await response.json();
  const models = Array.isArray(payload?.data) ? payload.data : [];
  const kokoro = models.find(model => model?.id === AI_VOICE_DEFAULTS.venice.ttsModel);
  const voices = Array.isArray(kokoro?.model_spec?.voices)
    ? kokoro.model_spec.voices
    : [];
  return voices.map(normalizeKokoroVoice).filter(voice => voice.id);
}

export const openRouterVoiceProvider = Object.freeze({
  ...createProvider('openrouter'),
  listModels: listOpenRouterModels,
  listVoices: listOpenRouterVoices,
  async testConnection(options) {
    if (!options?.apiKey) throw new Error('Connect OpenRouter in Settings → AI.');
    const [sttModels, ttsModels] = await Promise.all([
      listOpenRouterModels('stt', options),
      listOpenRouterModels('tts', options),
    ]);
    return {
      ok: true,
      message: `Connected. ${sttModels.length} transcription and ${ttsModels.length} speech models available.`,
      voices: voicesForOpenRouterModel(
        ttsModels.find(model => model.id === options.modelId) || ttsModels[0],
      ),
    };
  },
});
export const ppqVoiceProvider = createProvider('ppq');
export const veniceVoiceProvider = Object.freeze({
  ...createProvider('venice'),
  listVoices: fetchVeniceKokoroVoices,
  async testConnection(options) {
    const voices = await fetchVeniceKokoroVoices(options);
    return {
      ok: true,
      message: `Connected. ${voices.length} private Kokoro voices available.`,
      voices,
    };
  },
});
