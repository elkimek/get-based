// @ts-check
// voice-provider-cloud-shared.js — same-origin hosted voice relay client.

import { expectVoiceResponseOk } from './voice-response-utils.js';

function relayHeaders(provider, apiKey, contentType) {
  const headers = {
    'X-Voice-Provider': provider,
    Authorization: `Bearer ${apiKey}`,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

export async function relayTranscription(provider, {
  audio,
  apiKey,
  modelId,
  language = 'auto',
  signal,
}) {
  if (!apiKey) throw new Error(`Add your ${provider === 'xai' ? 'xAI' : 'ElevenLabs'} API key in Settings → Voice.`);
  const form = new FormData();
  if (provider === 'elevenlabs') form.append('model_id', modelId || 'scribe_v2');
  if (language && language !== 'auto') {
    if (provider === 'xai') form.append('format', 'true');
    form.append(provider === 'elevenlabs' ? 'language_code' : 'language', language);
  }
  form.append('file', audio, `recording.${audio.type?.includes('ogg') ? 'ogg' : audio.type?.includes('mp4') ? 'm4a' : 'webm'}`);
  const response = await fetch('/api/voice?action=stt', {
    method: 'POST',
    headers: relayHeaders(provider, apiKey),
    body: form,
    signal,
  });
  await expectVoiceResponseOk(response, 'Cloud transcription failed');
  const result = await response.json();
  return { text: String(result?.text || '').trim(), language: result?.language_code || result?.language };
}

export async function relaySynthesis(provider, payload) {
  if (!payload.apiKey) throw new Error(`Add your ${provider === 'xai' ? 'xAI' : 'ElevenLabs'} API key in Settings → Voice.`);
  if (provider === 'elevenlabs' && !String(payload.voiceId || '').trim()) {
    throw new Error('Refresh ElevenLabs voices and choose a voice before using Listen.');
  }
  const response = await fetch('/api/voice?action=tts', {
    method: 'POST',
    headers: relayHeaders(provider, payload.apiKey, 'application/json'),
    body: JSON.stringify({
      text: payload.text,
      voiceId: payload.voiceId,
      modelId: payload.modelId,
      language: payload.language,
      rate: payload.rate,
    }),
    signal: payload.signal,
  });
  await expectVoiceResponseOk(response, 'Cloud speech generation failed');
  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  if (response.body) {
    return {
      stream: response.body,
      contentType,
    };
  }
  return {
    audio: await response.blob(),
    contentType,
  };
}

/**
 * @param {string} provider
 * @param {{ apiKey?: string, signal?: AbortSignal }} [options]
 */
export async function relayVoices(provider, { apiKey, signal } = {}) {
  if (!apiKey) return [];
  const response = await fetch('/api/voice?action=voices', {
    method: 'POST',
    headers: relayHeaders(provider, apiKey, 'application/json'),
    body: '{}',
    signal,
  });
  await expectVoiceResponseOk(response, 'Could not list voices');
  const payload = await response.json();
  const rows = provider === 'elevenlabs'
    ? payload?.voices
    : payload?.voices || payload?.data;
  return (Array.isArray(rows) ? rows : []).map(voice => {
    const rawDescriptor = String(voice?.gender || voice?.labels?.gender || '').toLowerCase();
    const descriptor = rawDescriptor === 'female'
      ? 'female'
      : rawDescriptor === 'male'
        ? 'male'
        : '';
    return {
      id: String(voice?.voice_id || voice?.id || ''),
      name: String(voice?.name || voice?.voice_id || voice?.id || ''),
      language: String(voice?.language || voice?.labels?.language || ''),
      descriptor,
      previewUrl: String(voice?.preview_url || ''),
    };
  }).filter(voice => voice.id);
}

export async function testRelayProvider(provider, options = {}) {
  const voices = await relayVoices(provider, options);
  return {
    ok: true,
    message: `Connected. ${voices.length} voice${voices.length === 1 ? '' : 's'} available.`,
    voices,
  };
}
