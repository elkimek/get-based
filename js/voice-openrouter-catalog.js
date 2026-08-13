// @ts-check
// voice-openrouter-catalog.js — curated OpenRouter voice models with live availability.

export const OPENROUTER_STT_MODELS = Object.freeze([
  Object.freeze({
    id: 'openai/whisper-large-v3',
    label: 'Whisper Large V3',
    optionLabel: 'Whisper Large V3',
    description: 'Accurate multilingual transcription with strong value.',
  }),
]);

export const OPENROUTER_TTS_MODELS = Object.freeze([
  Object.freeze({
    id: 'hexgrad/kokoro-82m',
    label: 'Kokoro 82M via OpenRouter',
    optionLabel: 'Recommended cloud · Kokoro 82M',
    description: 'Reliable, efficient cloud speech with no model download.',
    defaultVoice: 'af_heart',
  }),
]);

export const OPENROUTER_DEFAULT_STT_MODEL = OPENROUTER_STT_MODELS[0].id;
export const OPENROUTER_DEFAULT_TTS_MODEL = OPENROUTER_TTS_MODELS[0].id;
export const OPENROUTER_DEFAULT_VOICE = OPENROUTER_TTS_MODELS[0].defaultVoice;

const MODEL_LISTS = Object.freeze({
  stt: OPENROUTER_STT_MODELS,
  tts: OPENROUTER_TTS_MODELS,
});

const KOKORO_PREFIXES = Object.freeze({
  af: ['en-US', 'female'],
  am: ['en-US', 'male'],
  bf: ['en-GB', 'female'],
  bm: ['en-GB', 'male'],
  ef: ['es', 'female'],
  em: ['es', 'male'],
  ff: ['fr', 'female'],
  hf: ['hi', 'female'],
  hm: ['hi', 'male'],
  if: ['it', 'female'],
  im: ['it', 'male'],
  jf: ['ja', 'female'],
  jm: ['ja', 'male'],
  pf: ['pt', 'female'],
  pm: ['pt', 'male'],
  zf: ['zh', 'female'],
  zm: ['zh', 'male'],
});

function titleCaseVoice(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

export function normalizeKokoroVoice(voiceId) {
  const id = String(voiceId || '');
  const prefix = id.slice(0, 2).toLowerCase();
  const kokoro = KOKORO_PREFIXES[prefix];
  return {
    id,
    name: titleCaseVoice(id),
    language: kokoro?.[0] || '',
    descriptor: kokoro?.[1] || '',
  };
}

export function getOpenRouterCuratedModels(kind) {
  return MODEL_LISTS[kind] || [];
}

export function normalizeOpenRouterVoiceModel(kind, value) {
  const models = getOpenRouterCuratedModels(kind);
  return models.some(model => model.id === value) ? value : models[0]?.id || '';
}

export function getOpenRouterDefaultVoice(modelId) {
  return OPENROUTER_TTS_MODELS.find(model => model.id === modelId)?.defaultVoice || '';
}

export function openRouterVoiceCatalogId(modelId) {
  return `openrouter-${encodeURIComponent(String(modelId || OPENROUTER_DEFAULT_TTS_MODEL))}`;
}

export function normalizeOpenRouterVoice(modelId, voiceId) {
  if (modelId === 'hexgrad/kokoro-82m') return normalizeKokoroVoice(voiceId);
  const id = String(voiceId || '');
  return { id, name: titleCaseVoice(id), language: '', descriptor: '' };
}

export function voicesForOpenRouterModel(model) {
  const liveRows = Array.isArray(model?.supportedVoices) ? model.supportedVoices : [];
  return liveRows
    .map(voice => normalizeOpenRouterVoice(model?.id, voice))
    .filter(voice => voice.id);
}

function normalizeLiveModel(kind, liveModel) {
  const curated = getOpenRouterCuratedModels(kind).find(model => model.id === liveModel?.id);
  if (!curated) return null;
  return {
    ...curated,
    supportedVoices: Array.isArray(liveModel?.supported_voices)
      ? liveModel.supported_voices.map(String).filter(Boolean)
      : [],
  };
}

/**
 * @param {string} kind
 * @param {{ apiKey?: string, signal?: AbortSignal }} [options]
 */
export async function fetchOpenRouterVoiceModels(kind, options = {}) {
  const { apiKey = '', signal } = options;
  const modality = kind === 'stt' ? 'transcription' : 'speech';
  const response = await fetch(
    `https://openrouter.ai/api/v1/models?output_modalities=${modality}`,
    {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`OpenRouter voice catalogue returned ${response.status}.`);
  }
  const payload = await response.json();
  const liveModels = Array.isArray(payload?.data) ? payload.data : [];
  const byId = new Map(liveModels.map(model => [model?.id, model]));
  return getOpenRouterCuratedModels(kind)
    .map(model => normalizeLiveModel(kind, byId.get(model.id)))
    .filter(Boolean);
}
