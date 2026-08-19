// @ts-check
// voice-provider-cloud-shared.js — direct browser transport for BYOK cloud voice.

import { requireCloudAIConsent } from './cloud-ai-consent.js';
import { expectVoiceResponseOk } from './voice-response-utils.js';

const PROVIDER_LABELS = Object.freeze({
  elevenlabs: 'ElevenLabs',
  openrouter: 'OpenRouter',
  ppq: 'PPQ',
  venice: 'Venice',
  xai: 'xAI',
});

const SAFE_ID = /^[A-Za-z0-9._:@-]{1,200}$/;
const SAFE_MODEL_ID = /^[A-Za-z0-9._:@/-]{1,200}$/;
const SAFE_LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
const MAX_TEXT_CHARACTERS = 24_000;

function connectionError(provider) {
  const area = ['openrouter', 'ppq', 'venice'].includes(provider) ? 'AI' : 'Voice';
  return `Connect ${PROVIDER_LABELS[provider] || provider} in Settings → ${area}.`;
}

function providerHeaders(provider, apiKey, contentType = '') {
  const headers = provider === 'elevenlabs'
    ? { 'xi-api-key': apiKey }
    : { Authorization: `Bearer ${apiKey}` };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

function cleanId(value, fallback = '') {
  const id = String(value || fallback).trim();
  return SAFE_ID.test(id) ? id : fallback;
}

function cleanModelId(value, fallback = '') {
  const id = String(value || fallback).trim();
  return SAFE_MODEL_ID.test(id) && !id.includes('..') ? id : fallback;
}

function cleanLanguage(value, fallback = '') {
  const language = String(value || fallback).trim();
  return !language || SAFE_LANGUAGE.test(language) ? language : fallback;
}

function improveOpenRouterError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/no endpoints available.*(?:guardrail|data policy)/i.test(message)) {
    return new Error(
      'OpenRouter blocked this voice model under your privacy or guardrail settings. '
      + 'Review https://openrouter.ai/settings/privacy.',
    );
  }
  return error;
}

function transcriptionEndpoint(provider) {
  if (provider === 'xai') return 'https://api.x.ai/v1/stt';
  if (provider === 'elevenlabs') return 'https://api.elevenlabs.io/v1/speech-to-text';
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1/audio/transcriptions';
  if (provider === 'ppq') return 'https://api.ppq.ai/v1/audio/transcriptions';
  if (provider === 'venice') return 'https://api.venice.ai/api/v1/audio/transcriptions';
  throw new Error('Unknown cloud voice provider.');
}

function normalizeSpeechPayload(provider, payload) {
  const text = String(payload.text || '').trim();
  if (!text) throw new Error('Speech text is required.');
  if (text.length > MAX_TEXT_CHARACTERS) throw new Error('Speech text is too long.');
  const rate = Math.min(2, Math.max(0.5, Number(payload.rate) || 1));

  if (provider === 'xai') {
    return {
      url: 'https://api.x.ai/v1/tts',
      body: {
        text,
        voice_id: cleanId(payload.voiceId, 'eve'),
        language: cleanLanguage(payload.language, 'en'),
        speed: Math.min(1.5, Math.max(0.7, rate)),
        output_format: { codec: 'mp3', sample_rate: 44_100, bit_rate: 128_000 },
      },
    };
  }

  if (provider === 'elevenlabs') {
    const voiceId = cleanId(payload.voiceId);
    if (!voiceId) throw new Error('Refresh ElevenLabs voices and choose a voice before using Listen.');
    const modelId = cleanId(payload.modelId, 'eleven_multilingual_v2');
    const language = cleanLanguage(payload.language);
    return {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
      body: {
        text,
        model_id: modelId,
        ...(modelId !== 'eleven_multilingual_v2' && language ? { language_code: language } : {}),
        voice_settings: { speed: Math.min(1.2, Math.max(0.7, rate)) },
      },
    };
  }

  const defaults = {
    openrouter: { model: 'hexgrad/kokoro-82m', voice: 'af_heart' },
    ppq: { model: 'deepgram_aura_2', voice: '' },
    venice: { model: 'tts-kokoro', voice: 'af_sky' },
  }[provider];
  if (!defaults) throw new Error('Unknown cloud voice provider.');
  const model = cleanModelId(payload.modelId, defaults.model);
  const voice = cleanId(payload.voiceId, defaults.voice);
  const language = cleanLanguage(payload.language);
  const baseUrl = provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1'
    : provider === 'ppq'
      ? 'https://api.ppq.ai/v1'
      : 'https://api.venice.ai/api/v1';
  return {
    url: `${baseUrl}/audio/speech`,
    body: {
      input: text,
      model,
      ...(voice ? { voice } : {}),
      ...(provider !== 'openrouter' && language ? { language } : {}),
      ...(provider === 'ppq' ? {} : { speed: rate, response_format: 'mp3' }),
      ...(provider === 'venice' ? { streaming: true } : {}),
    },
  };
}

export async function directTranscription(provider, {
  audio,
  apiKey,
  modelId,
  language = 'auto',
  signal,
}) {
  if (!apiKey) throw new Error(connectionError(provider));
  await requireCloudAIConsent(provider, { kind: 'voice-input' });
  const form = new FormData();
  if (provider === 'elevenlabs') {
    form.append('model_id', modelId || 'scribe_v2');
  } else if (modelId) {
    form.append('model', modelId);
  }
  if (['openrouter', 'ppq', 'venice'].includes(provider)) {
    form.append('response_format', 'json');
  }
  if (provider === 'ppq' && (!language || language === 'auto')) {
    form.append('language', 'multi');
  } else if (language && language !== 'auto') {
    if (provider === 'xai') form.append('format', 'true');
    form.append(provider === 'elevenlabs' ? 'language_code' : 'language', language);
  }
  form.append('file', audio, `recording.${audio.type?.includes('ogg') ? 'ogg' : audio.type?.includes('mp4') ? 'm4a' : 'webm'}`);
  const response = await fetch(transcriptionEndpoint(provider), {
    method: 'POST',
    headers: providerHeaders(provider, apiKey),
    body: form,
    signal,
    credentials: 'omit',
  });
  await expectVoiceResponseOk(response, 'Cloud transcription failed');
  const result = await response.json();
  return { text: String(result?.text || '').trim(), language: result?.language_code || result?.language };
}

export async function directSynthesis(provider, payload) {
  if (!payload.apiKey) throw new Error(connectionError(provider));
  const upstream = normalizeSpeechPayload(provider, payload);
  await requireCloudAIConsent(provider, { kind: 'voice-output' });
  const response = await fetch(upstream.url, {
    method: 'POST',
    headers: {
      ...providerHeaders(provider, payload.apiKey, 'application/json'),
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(upstream.body),
    signal: payload.signal,
    credentials: 'omit',
  });
  try {
    await expectVoiceResponseOk(response, 'Cloud speech generation failed');
  } catch (error) {
    throw provider === 'openrouter' ? improveOpenRouterError(error) : error;
  }
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  if (response.body) return { stream: response.body, contentType };
  return { audio: await response.blob(), contentType };
}

function voicesEndpoint(provider) {
  if (provider === 'xai') return 'https://api.x.ai/v1/tts/voices';
  if (provider === 'elevenlabs') return 'https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=true';
  if (provider === 'ppq') return 'https://api.ppq.ai/v1/audio/voices';
  throw new Error('This provider does not expose a compatible voice catalogue endpoint.');
}

/**
 * @param {string} provider
 * @param {{ apiKey?: string, language?: string, signal?: AbortSignal }} [options]
 */
export async function directVoices(provider, { apiKey, language = 'auto', signal } = {}) {
  if (!apiKey) return [];
  const response = await fetch(voicesEndpoint(provider), {
    method: 'GET',
    headers: providerHeaders(provider, apiKey),
    signal,
    credentials: 'omit',
  });
  await expectVoiceResponseOk(response, 'Could not list voices');
  const payload = await response.json();
  const rows = provider === 'elevenlabs' ? payload?.voices : payload?.voices || payload?.data;
  const compatibleRows = provider === 'ppq'
    ? (Array.isArray(rows) ? rows : []).filter(voice => (
      voice?.model_id === 'deepgram_aura_2'
      && (!language || language === 'auto' || voice?.language === 'multi' || voice?.language === language)
    ))
    : rows;
  return (Array.isArray(compatibleRows) ? compatibleRows : []).map(voice => {
    const rawDescriptor = String(voice?.gender || voice?.labels?.gender || '').toLowerCase();
    const descriptor = rawDescriptor === 'female' ? 'female' : rawDescriptor === 'male' ? 'male' : '';
    return {
      id: String(voice?.voice_id || voice?.id || ''),
      name: String(voice?.name || voice?.voice_id || voice?.id || ''),
      language: String(voice?.language || voice?.labels?.language || ''),
      descriptor,
      previewUrl: String(voice?.preview_url || ''),
    };
  }).filter(voice => voice.id);
}

export async function testDirectProvider(provider, options = {}) {
  const voices = await directVoices(provider, options);
  return {
    ok: true,
    message: `Connected. ${voices.length} voice${voices.length === 1 ? '' : 's'} available.`,
    voices,
  };
}
