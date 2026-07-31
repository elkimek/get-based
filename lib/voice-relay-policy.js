// @ts-check
// voice-relay-policy.js — strict provider/action mapping and request bounds for /api/voice.

import { createErrorWithCode } from './error-utils.js';

export const VOICE_MAX_REQUEST_BYTES = 16 * 1024 * 1024;
export const VOICE_MAX_AUDIO_RESPONSE_BYTES = 24 * 1024 * 1024;
export const VOICE_MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
export const VOICE_MAX_TEXT_CHARACTERS = 24_000;

const PROVIDERS = new Set(['xai', 'elevenlabs']);
const ACTIONS = new Set(['stt', 'tts', 'voices']);
const SAFE_ID = /^[A-Za-z0-9._:@-]{1,200}$/;
const SAFE_LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

export function normalizeVoiceProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return PROVIDERS.has(provider) ? provider : null;
}

export function normalizeVoiceAction(value) {
  const action = String(value || '').trim().toLowerCase();
  return ACTIONS.has(action) ? action : null;
}

export function readVoiceBearer(request) {
  const value = request?.headers?.get?.('authorization') || '';
  const match = /^Bearer ([^\r\n]{1,4096})$/.exec(value);
  return match ? match[1].trim() : '';
}

function cleanId(value, fallback = '') {
  const id = String(value || fallback).trim();
  return SAFE_ID.test(id) ? id : fallback;
}

function cleanLanguage(value, fallback = '') {
  const language = String(value || fallback).trim();
  return !language || SAFE_LANGUAGE.test(language) ? language : fallback;
}

export function normalizeVoiceTtsPayload(provider, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createErrorWithCode('VOICE_INVALID_REQUEST', 'Voice request body must be an object.');
  }
  const text = String(payload.text || '').trim();
  if (!text) throw createErrorWithCode('VOICE_INVALID_REQUEST', 'Speech text is required.');
  if (text.length > VOICE_MAX_TEXT_CHARACTERS) {
    throw createErrorWithCode('VOICE_INVALID_REQUEST', 'Speech text is too long.');
  }
  const rate = Math.min(2, Math.max(0.5, Number(payload.rate) || 1));
  if (provider === 'xai') {
    return {
      text,
      voice_id: cleanId(payload.voiceId, 'eve'),
      language: cleanLanguage(payload.language, 'en'),
      speed: Math.min(1.5, Math.max(0.7, rate)),
      output_format: { codec: 'mp3', sample_rate: 44_100, bit_rate: 128_000 },
    };
  }
  const modelId = cleanId(payload.modelId, 'eleven_multilingual_v2');
  const voiceId = cleanId(payload.voiceId);
  if (!voiceId) {
    throw createErrorWithCode('VOICE_INVALID_REQUEST', 'An ElevenLabs voice is required.');
  }
  return {
    voiceId,
    body: {
      text,
      model_id: modelId,
      ...(modelId !== 'eleven_multilingual_v2' && cleanLanguage(payload.language)
        ? { language_code: cleanLanguage(payload.language) }
        : {}),
      voice_settings: { speed: Math.min(1.2, Math.max(0.7, rate)) },
    },
  };
}

export function voiceUpstream(provider, action, key, ttsPayload) {
  if (provider === 'xai') {
    const headers = { Authorization: `Bearer ${key}` };
    if (action === 'stt') return { url: 'https://api.x.ai/v1/stt', method: 'POST', headers };
    if (action === 'voices') return { url: 'https://api.x.ai/v1/tts/voices', method: 'GET', headers };
    return {
      url: 'https://api.x.ai/v1/tts',
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(ttsPayload),
    };
  }

  const headers = { 'xi-api-key': key };
  if (action === 'stt') {
    return { url: 'https://api.elevenlabs.io/v1/speech-to-text', method: 'POST', headers };
  }
  if (action === 'voices') {
    return {
      url: 'https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=true',
      method: 'GET',
      headers,
    };
  }
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ttsPayload.voiceId)}/stream?output_format=mp3_44100_128`,
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(ttsPayload.body),
  };
}

export async function readVoiceRequestBytes(request, maxBytes = VOICE_MAX_REQUEST_BYTES) {
  const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    try { await request.body?.cancel?.(); } catch {}
    throw createErrorWithCode('VOICE_REQUEST_TOO_LARGE', 'Voice request body is too large.');
  }
  const reader = request.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw createErrorWithCode('VOICE_REQUEST_TOO_LARGE', 'Voice request body is too large.');
    }
    return bytes;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value?.byteLength || 0;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw createErrorWithCode('VOICE_REQUEST_TOO_LARGE', 'Voice request body is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
